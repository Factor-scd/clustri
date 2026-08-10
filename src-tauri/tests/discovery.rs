//! Integration tests for cluster node auto-discovery.
//!
//! `discover_nodes` combines `/nodes` (the node list and statuses) with
//! `/cluster/status` (cluster IPs, local flags, and cluster identity) and
//! derives an endpoint URL per node from the connection's primary URL. These
//! tests cover the URL derivation rules, primary-node marking, the config
//! mutation, and the persist -> load round-trip.

use httpmock::prelude::*;
use httpmock::Mock;
use clustri::{derive_node_url, ConnectionConfig, ConnectionManager, EndpointConfig};

const TOKEN: &str = "root@pam!discovery-token";

/// A minimal `/nodes` entry. The `Node` struct requires every field, so all
/// are included.
fn node_json(name: &str, status: &str) -> serde_json::Value {
    serde_json::json!({
        "node": name,
        "status": status,
        "cpu": 0.0,
        "maxcpu": 8,
        "mem": 0,
        "maxmem": 34359738368u64,
        "disk": 0,
        "maxdisk": 536870912000u64,
        "uptime": 0,
        "level": "",
        "id": format!("node/{}", name),
        "type": "node"
    })
}

/// Builds a `ConnectionManager` with a single token-mode connection whose
/// primary endpoint is the mock server. `node` pins `primary.node`.
async fn setup_manager(
    server: &MockServer,
    node: Option<&str>,
) -> (ConnectionManager, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    let config = ConnectionConfig {
        id: "conn".to_string(),
        name: "conn".to_string(),
        primary: EndpointConfig {
            url: server.base_url(),
            node: node.map(str::to_string),
            token: Some(TOKEN.to_string()),
        },
        fallbacks: vec![],
        cert_fingerprint: None,
        trusted: false,
        accept_untrusted: true,
        status: "disconnected".to_string(),
        cluster_name: None,
        is_cluster: false,
        auth_mode: "token".to_string(),
        username: None,
        nodes: vec![],
        cluster_id: None,
    };
    manager
        .add_connection(config, &path)
        .await
        .expect("connection should be added");
    (manager, dir)
}

/// Stubs `GET /api2/json/nodes` returning `nodes` (entries from `node_json`).
fn stub_nodes<'a>(server: &'a MockServer, nodes: &[serde_json::Value]) -> Mock<'a> {
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/nodes");
        then.status(200)
            .header("content-type", "application/json")
            .body(serde_json::json!({ "data": nodes }).to_string());
    })
}

/// Builds the `/cluster/status` response body: one `cluster` entry followed by
/// the given node entries.
fn cluster_status_body(
    cluster_id: &str,
    cluster_name: &str,
    nodes: &[serde_json::Value],
) -> String {
    let mut entries = Vec::with_capacity(nodes.len() + 1);
    entries.push(serde_json::json!({
        "type": "cluster",
        "id": cluster_id,
        "name": cluster_name,
        "nodes": nodes.len()
    }));
    entries.extend_from_slice(nodes);
    serde_json::json!({ "data": entries }).to_string()
}

/// Stubs `GET /api2/json/cluster/status` returning the cluster entry plus the
/// given node entries.
fn stub_cluster_status<'a>(
    server: &'a MockServer,
    cluster_id: &str,
    cluster_name: &str,
    nodes: &[serde_json::Value],
) -> Mock<'a> {
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/cluster/status");
        then.status(200)
            .header("content-type", "application/json")
            .body(cluster_status_body(cluster_id, cluster_name, nodes));
    })
}

#[test]
fn derive_node_url_keeps_scheme_and_port() {
    assert_eq!(
        derive_node_url("https://10.0.0.5:8006", Some("10.0.0.6"), "pve1"),
        "https://10.0.0.6:8006"
    );
    // An empty IP falls back to the node name.
    assert_eq!(
        derive_node_url("http://pve.lan:8006", Some(""), "pve.lan"),
        "http://pve.lan:8006"
    );
    // A missing port defaults to pveproxy's 8006 for both schemes.
    assert_eq!(
        derive_node_url("https://pve.lan", Some("10.0.0.7"), "pve1"),
        "https://10.0.0.7:8006"
    );
    // An unparseable primary URL falls back to a best-effort https URL.
    assert_eq!(
        derive_node_url("not a url", Some("10.0.0.8"), "pve1"),
        "https://10.0.0.8:8006"
    );
}

#[tokio::test]
async fn discover_nodes_builds_and_marks_primary() {
    let server = MockServer::start();
    let port = server.port();

    let nodes_mock = stub_nodes(
        &server,
        &[node_json("pve1", "online"), node_json("pve2", "online")],
    );
    let cluster_mock = stub_cluster_status(
        &server,
        "cluster/lab",
        "lab",
        &[
            serde_json::json!({"type": "node", "id": "node/pve1", "nodeid": 1,
                               "online": 1, "local": 1, "ip": "10.0.0.5"}),
            serde_json::json!({"type": "node", "id": "node/pve2", "nodeid": 2,
                               "online": 1, "local": 0, "ip": "10.0.0.6"}),
        ],
    );

    let (mut manager, _dir) = setup_manager(&server, Some("pve1")).await;
    let discovered = manager
        .discover_nodes("conn")
        .await
        .expect("discovery should succeed");

    assert_eq!(discovered.len(), 2);
    assert_eq!(
        discovered[0].name, "pve1",
        "the primary node must sort first"
    );
    assert!(discovered[0].is_primary);
    assert!(discovered[0].local);
    assert_eq!(discovered[0].status, "online");
    assert_eq!(
        discovered[0].url,
        format!("http://10.0.0.5:{}", port),
        "pve1's URL keeps the scheme and port but uses the cluster IP"
    );
    assert_eq!(discovered[1].name, "pve2");
    assert!(!discovered[1].is_primary);
    assert!(!discovered[1].local);
    assert_eq!(discovered[1].url, format!("http://10.0.0.6:{}", port));

    let config = manager
        .connection_config("conn")
        .expect("config should be readable");
    assert_eq!(config.cluster_name.as_deref(), Some("lab"));
    assert_eq!(config.cluster_id.as_deref(), Some("cluster/lab"));
    assert_eq!(config.primary.node.as_deref(), Some("pve1"));
    assert_eq!(
        config.nodes, discovered,
        "the discovered list must be stored"
    );

    nodes_mock.assert();
    cluster_mock.assert();
}

#[tokio::test]
async fn discover_nodes_persists_and_round_trips() {
    let server = MockServer::start();

    let nodes_mock = stub_nodes(
        &server,
        &[node_json("pve1", "online"), node_json("pve2", "offline")],
    );
    let cluster_mock = stub_cluster_status(
        &server,
        "cluster/lab",
        "lab",
        &[
            serde_json::json!({"type": "node", "id": "node/pve1", "nodeid": 1,
                               "online": 1, "local": 1, "ip": "10.0.0.5"}),
            serde_json::json!({"type": "node", "id": "node/pve2", "nodeid": 2,
                               "online": 0, "local": 0, "ip": "10.0.0.6"}),
        ],
    );

    let (mut manager, dir) = setup_manager(&server, Some("pve1")).await;
    let path = dir.path().join("connections.json");
    let discovered = manager
        .discover_nodes("conn")
        .await
        .expect("discovery should succeed");

    // discover_nodes stores on the config but does not persist by itself; any
    // later persist (here via set_active_connection) writes the new fields.
    manager
        .set_active_connection("conn".to_string(), &path)
        .await
        .expect("active connection should be set");

    let mut reloaded = ConnectionManager::new();
    let result = reloaded
        .load_connections(&path)
        .await
        .expect("connections should load");
    assert_eq!(result.connections.len(), 1);
    let loaded = &result.connections[0];
    assert_eq!(loaded.nodes, discovered, "discovered nodes must round-trip");
    assert_eq!(loaded.cluster_id.as_deref(), Some("cluster/lab"));
    assert_eq!(loaded.cluster_name.as_deref(), Some("lab"));

    nodes_mock.assert();
    cluster_mock.assert();
}

#[tokio::test]
async fn discover_nodes_sets_primary_node_from_url_match() {
    let server = MockServer::start();
    // The mock server's host is used as the node's cluster IP so the derived
    // URL equals the primary URL.
    let host = server.host();

    let nodes_mock = stub_nodes(&server, &[node_json("pve1", "online")]);
    let cluster_mock = stub_cluster_status(
        &server,
        "cluster/lab",
        "lab",
        &[
            serde_json::json!({"type": "node", "id": "node/pve1", "nodeid": 1,
                             "online": 1, "local": 1, "ip": host}),
        ],
    );

    let (mut manager, _dir) = setup_manager(&server, None).await;
    let discovered = manager
        .discover_nodes("conn")
        .await
        .expect("discovery should succeed");

    assert_eq!(discovered.len(), 1);
    assert_eq!(
        discovered[0].url,
        server.base_url(),
        "the derived URL must equal the primary URL"
    );
    assert!(
        discovered[0].is_primary,
        "a node whose URL matches the primary URL must be marked primary"
    );

    // With primary.node unset, discovery pins it to the primary node.
    let config = manager
        .connection_config("conn")
        .expect("config should be readable");
    assert_eq!(config.primary.node.as_deref(), Some("pve1"));

    nodes_mock.assert();
    cluster_mock.assert();
}
