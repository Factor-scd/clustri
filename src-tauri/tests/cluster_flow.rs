//! Integration tests for the connect-time node discovery, same-cluster
//! merging, and the connection status reporting flow.
//!
//! `connect` now authenticates, resets failover state, and discovers the
//! cluster's nodes before either folding the connection into an existing
//! same-cluster connection or marking it connected. These tests cover the
//! discovered-node persistence, the merge of a second node's connection into
//! the first, the status reporting (including failover and disconnected), and
//! the all-endpoints-down case where the connect reports `"failed"` instead of
//! erroring.

use httpmock::prelude::*;
use httpmock::Mock;
use clustri::{ConnectionConfig, ConnectionManager, EndpointConfig, Error};

const TOKEN: &str = "root@pam!cluster-token";

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

fn stub_version<'a>(server: &'a MockServer) -> Mock<'a> {
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/version");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"version":"8.2"}}"#);
    })
}

fn stub_nodes<'a>(server: &'a MockServer, nodes: &[serde_json::Value]) -> Mock<'a> {
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/nodes");
        then.status(200)
            .header("content-type", "application/json")
            .body(serde_json::json!({ "data": nodes }).to_string());
    })
}

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

/// Returns a URL pointing at a closed TCP port: a listener is bound to an
/// ephemeral port, its address is captured, and the listener is dropped so any
/// subsequent connection attempt is refused.
fn closed_port_url() -> String {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    let addr = listener.local_addr().expect("address should be available");
    drop(listener);
    format!("http://{}", addr)
}

fn fallback_config(url: &str) -> EndpointConfig {
    EndpointConfig {
        url: url.to_string(),
        node: None,
        token: Some(TOKEN.to_string()),
    }
}

/// Builds a token-mode connection config that skips certificate verification
/// (the mock servers speak plain HTTP).
fn token_config(id: &str, url: &str, fallbacks: Vec<EndpointConfig>) -> ConnectionConfig {
    ConnectionConfig {
        id: id.to_string(),
        name: id.to_string(),
        primary: EndpointConfig {
            url: url.to_string(),
            node: None,
            token: Some(TOKEN.to_string()),
        },
        fallbacks,
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
    }
}

async fn add_connection(
    manager: &mut ConnectionManager,
    path: &std::path::Path,
    config: ConnectionConfig,
) {
    manager
        .add_connection(config, path)
        .await
        .expect("connection should be added");
}

#[tokio::test]
async fn connect_discovers_and_persists_nodes() {
    let server = MockServer::start();
    let port = server.port();

    stub_version(&server);
    stub_nodes(
        &server,
        &[node_json("pve1", "online"), node_json("pve2", "online")],
    );
    stub_cluster_status(
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

    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    add_connection(
        &mut manager,
        &path,
        token_config("conn", &server.base_url(), vec![]),
    )
    .await;

    let result = manager
        .connect("conn", &path)
        .await
        .expect("connect should succeed");
    assert_eq!(result.status, "connected");
    assert_eq!(result.merged_into, None);
    assert_eq!(result.connection_id, "conn");

    let config = manager
        .connection_config("conn")
        .expect("config should be readable");
    assert_eq!(config.nodes.len(), 2);
    assert_eq!(config.cluster_id.as_deref(), Some("cluster/lab"));
    assert_eq!(config.primary.node.as_deref(), Some("pve1"));

    // The discovered nodes and cluster identity are persisted.
    let raw = std::fs::read_to_string(&path).expect("file should be written");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("file should be valid JSON");
    let conn_json = &json["connections"][0];
    assert_eq!(conn_json["clusterId"], "cluster/lab");
    assert_eq!(
        conn_json["nodes"]
            .as_array()
            .expect("nodes should be present")
            .len(),
        2
    );
    assert_eq!(
        conn_json["nodes"][0]["url"],
        format!("http://10.0.0.5:{}", port),
        "the primary node's URL must be persisted"
    );
    assert_eq!(conn_json["status"], "connected");
}

#[tokio::test]
async fn connect_second_node_merges_into_existing() {
    let server_a = MockServer::start();
    let server_b = MockServer::start();

    // Both servers report the same cluster identity, as two nodes of one
    // cluster would.
    for (server, ip1, ip2) in [
        (&server_a, "10.0.0.5", "10.0.0.6"),
        (&server_b, "10.0.0.7", "10.0.0.8"),
    ] {
        stub_version(server);
        stub_nodes(
            server,
            &[node_json("pve1", "online"), node_json("pve2", "online")],
        );
        stub_cluster_status(
            server,
            "cluster/lab",
            "lab",
            &[
                serde_json::json!({"type": "node", "id": "node/pve1", "nodeid": 1,
                                   "online": 1, "local": 1, "ip": ip1}),
                serde_json::json!({"type": "node", "id": "node/pve2", "nodeid": 2,
                                   "online": 1, "local": 0, "ip": ip2}),
            ],
        );
    }
    let vms_mock = server_a.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/cluster/resources")
            .query_param("type", "vm");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [{"vmid": 100, "name": "web01", "type": "qemu",
                              "status": "running", "node": "pve1"}]
                })
                .to_string(),
            );
    });

    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    add_connection(
        &mut manager,
        &path,
        token_config("conn-a", &server_a.base_url(), vec![]),
    )
    .await;
    add_connection(
        &mut manager,
        &path,
        token_config("conn-b", &server_b.base_url(), vec![]),
    )
    .await;

    let first = manager
        .connect("conn-a", &path)
        .await
        .expect("first connect should succeed");
    assert_eq!(first.status, "connected");
    assert_eq!(first.merged_into, None);

    let second = manager
        .connect("conn-b", &path)
        .await
        .expect("second connect should succeed");
    assert_eq!(second.status, "connected");
    assert_eq!(second.connection_id, "conn-a");
    assert_eq!(second.merged_into.as_deref(), Some("conn-a"));

    // The merged connection is gone and conn-a carries B's endpoint.
    assert!(
        matches!(
            manager.connection_config("conn-b"),
            Err(Error::ConnectionNotFound(ref id)) if id == "conn-b"
        ),
        "conn-b must be removed after merging"
    );
    let config_a = manager
        .connection_config("conn-a")
        .expect("config should be readable");
    assert!(
        config_a
            .fallbacks
            .iter()
            .any(|endpoint| endpoint.url == server_b.base_url()),
        "conn-a must have B's URL as a fallback"
    );
    assert_eq!(
        config_a.nodes.len(),
        4,
        "the node lists of both servers must be merged"
    );

    // Only the surviving connection is persisted.
    let raw = std::fs::read_to_string(&path).expect("file should be written");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("file should be valid JSON");
    let ids: Vec<&str> = json["connections"]
        .as_array()
        .expect("connections should be an array")
        .iter()
        .filter_map(|c| c["id"].as_str())
        .collect();
    assert_eq!(ids, vec!["conn-a"]);

    assert_eq!(
        manager
            .runtime_status("conn-a")
            .expect("status should be readable"),
        "connected"
    );

    // A subsequent data request on the merged connection is served by A.
    let vms = manager
        .get_vms("conn-a")
        .await
        .expect("get_vms should succeed via A");
    assert_eq!(vms.len(), 1);
    vms_mock.assert();
}

#[tokio::test]
async fn status_info_reports_failover() {
    let fallback = MockServer::start();
    stub_version(&fallback);
    stub_nodes(&fallback, &[node_json("pve1", "online")]);
    stub_cluster_status(
        &fallback,
        "cluster/lab",
        "lab",
        &[
            serde_json::json!({"type": "node", "id": "node/pve1", "nodeid": 1,
                             "online": 1, "local": 1, "ip": "10.0.0.5"}),
        ],
    );
    let vms_mock = fallback.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/cluster/resources")
            .query_param("type", "vm");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [{"vmid": 100, "name": "web01", "type": "qemu",
                              "status": "running", "node": "pve1"}]
                })
                .to_string(),
            );
    });

    let primary_url = closed_port_url();
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    add_connection(
        &mut manager,
        &path,
        token_config(
            "conn",
            &primary_url,
            vec![fallback_config(&fallback.base_url())],
        ),
    )
    .await;

    let result = manager
        .connect("conn", &path)
        .await
        .expect("connect should succeed via the fallback");
    assert_eq!(result.status, "connected");

    let vms = manager
        .get_vms("conn")
        .await
        .expect("get_vms should succeed via the fallback");
    assert_eq!(vms.len(), 1);
    assert_eq!(
        manager
            .runtime_status("conn")
            .expect("status should be readable"),
        "failover"
    );

    let info = manager
        .status_info("conn")
        .await
        .expect("status info should be readable");
    assert_eq!(info.status, "failover");
    assert_eq!(info.current_endpoint_url, fallback.base_url());
    assert_eq!(info.primary_url, primary_url);
    vms_mock.assert();
}

#[tokio::test]
async fn status_info_when_disconnected() {
    let server = MockServer::start();
    let version_mock = stub_version(&server);

    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    add_connection(
        &mut manager,
        &path,
        token_config("conn", &server.base_url(), vec![]),
    )
    .await;

    let info = manager
        .status_info("conn")
        .await
        .expect("status info should be readable");
    assert_eq!(info.status, "disconnected");
    assert_eq!(info.primary_url, server.base_url());
    assert_eq!(info.current_endpoint_url, server.base_url());
    assert!(info.nodes.is_empty());
    assert_eq!(
        version_mock.calls(),
        0,
        "a disconnected connection must not hit the network"
    );
}

#[tokio::test]
async fn connect_all_endpoints_down_returns_failed_result() {
    let primary_url = closed_port_url();
    let fallback_url = closed_port_url();

    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    add_connection(
        &mut manager,
        &path,
        token_config("conn", &primary_url, vec![fallback_config(&fallback_url)]),
    )
    .await;

    let result = manager
        .connect("conn", &path)
        .await
        .expect("an unreachable cluster must be reported, not errored");
    assert_eq!(result.status, "failed");
    assert_eq!(result.merged_into, None);
    assert_eq!(result.connection_id, "conn");

    let config = manager
        .connection_config("conn")
        .expect("config should be readable");
    assert_eq!(config.status, "failed");

    // The failed status is persisted so the connection stays tracked.
    let raw = std::fs::read_to_string(&path).expect("file should be written");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("file should be valid JSON");
    assert_eq!(json["connections"][0]["status"], "failed");
}
