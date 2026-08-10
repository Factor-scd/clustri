//! Integration tests for the real Proxmox data-read API calls and the
//! VM/container lifecycle operations.
//!
//! Every request goes through `Connection::request`, so these tests cover URL
//! construction, query parameters, auth header injection, response envelope
//! unwrapping, and mapping into the public serde structs. Token-mode
//! connections resolve the token from the config, so the read methods can be
//! called directly on an added connection without `connect()`.

use httpmock::prelude::*;
use clustri::{ConnectionConfig, ConnectionManager, EndpointConfig, Error};

/// Builds a `ConnectionManager` with a single token-mode connection whose
/// primary endpoint points at the mock server. `node` pins the storage node.
async fn setup_manager(
    url: &str,
    token: &str,
    node: Option<&str>,
) -> (ConnectionManager, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    let config = ConnectionConfig {
        id: "conn".to_string(),
        name: "conn".to_string(),
        primary: EndpointConfig {
            url: url.to_string(),
            node: node.map(str::to_string),
            token: Some(token.to_string()),
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

#[tokio::test]
async fn get_nodes_maps_cluster_resources() {
    let server = MockServer::start();
    let token = "root@pam!nodes-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {"node": "pve1", "status": "online", "cpu": 0.12, "maxcpu": 16,
                         "mem": 8589934592u64, "maxmem": 68719476736u64, "disk": 214748364800u64,
                         "maxdisk": 858993459200u64, "uptime": 123456, "level": "",
                         "id": "node/pve1", "type": "node"},
                        {"node": "pve2", "status": "offline", "cpu": 0.0, "maxcpu": 8,
                         "mem": 0, "maxmem": 34359738368u64, "disk": 0,
                         "maxdisk": 536870912000u64, "uptime": 0, "level": "",
                         "id": "node/pve2", "type": "node"}
                    ]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let nodes = manager
        .get_nodes("conn")
        .await
        .expect("nodes should be fetched");

    assert_eq!(nodes.len(), 2);
    assert_eq!(nodes[0].node, "pve1");
    assert_eq!(nodes[0].status, "online");
    assert!((nodes[0].cpu - 0.12).abs() < 1e-9);
    assert_eq!(nodes[0].maxcpu, 16);
    assert_eq!(nodes[0].mem, 8589934592u64);
    assert_eq!(nodes[0].maxmem, 68719476736u64);
    assert_eq!(nodes[0].disk, 214748364800u64);
    assert_eq!(nodes[0].maxdisk, 858993459200u64);
    assert_eq!(nodes[0].uptime, 123456);
    assert_eq!(nodes[0].id, "node/pve1");
    assert_eq!(nodes[0].r#type, "node");
    assert_eq!(nodes[1].node, "pve2");
    assert_eq!(nodes[1].status, "offline");
    mock.assert();
}

#[tokio::test]
async fn get_vms_uses_cluster_resources() {
    let server = MockServer::start();
    let token = "root@pam!vms-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/cluster/resources")
            .query_param("type", "vm")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {"vmid": 100, "name": "web01", "type": "qemu", "status": "running",
                         "node": "pve1", "cpu": 0.03, "cpus": 2, "maxcpu": 2,
                         "mem": 2147483648u64, "maxmem": 4294967296u64, "disk": 107374182400u64,
                         "maxdisk": 34359738368u64, "uptime": 99999, "netin": 123, "netout": 456,
                         "diskread": 789, "diskwrite": 101112, "template": 0, "tags": "prod",
                         "pid": 1234},
                        // A stopped container: the API omits runtime stats.
                        {"vmid": 201, "name": "ct01", "type": "lxc", "status": "stopped",
                         "node": "pve2", "template": 1, "tags": ""}
                    ]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let vms = manager
        .get_vms("conn")
        .await
        .expect("VMs should be fetched");

    assert_eq!(vms.len(), 2);
    assert_eq!(vms[0].vmid, 100);
    assert_eq!(vms[0].name.as_deref(), Some("web01"));
    assert_eq!(vms[0].r#type, "qemu");
    assert_eq!(vms[0].status, "running");
    assert_eq!(vms[0].node, "pve1");
    assert_eq!(vms[0].uptime, 99999);
    assert_eq!(vms[0].netin, 123);
    assert_eq!(vms[0].netout, 456);
    assert_eq!(vms[0].diskread, 789);
    assert_eq!(vms[0].diskwrite, 101112);
    assert_eq!(vms[0].tags.as_deref(), Some("prod"));
    assert_eq!(vms[0].pid, Some(1234));
    // Tolerance: fields omitted for the stopped LXC default instead of failing.
    assert_eq!(vms[1].r#type, "lxc");
    assert_eq!(vms[1].status, "stopped");
    assert_eq!(vms[1].uptime, 0);
    assert_eq!(vms[1].cpu, 0.0);
    assert_eq!(vms[1].netin, 0);
    assert_eq!(vms[1].pid, None);
    mock.assert();
}

#[tokio::test]
async fn get_storage_maps_cluster_resources() {
    let server = MockServer::start();
    let token = "root@pam!storage-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/cluster/resources")
            .query_param("type", "storage");
        then.status(200)
            .header("content-type", "application/json")
            .body(
            serde_json::json!({
                "data": [
                    {"storage": "local", "node": "pve1", "type": "dir",
                     "content": "iso,vztmpl", "enabled": 1, "shared": 0, "active": 1,
                     "total": 858993459200u64, "used": 429496729600u64, "avail": 429496729600u64,
                     "status": "available"},
                    {"storage": "backup", "node": "pve1", "type": "nfs",
                     "content": "backup", "enabled": 1, "shared": 1, "active": 1,
                     "total": 1717986918400u64, "used": 644245094400u64,
                     "avail": 1073741824000u64, "status": "available"}
                ]
            })
            .to_string(),
        );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let storages = manager
        .get_storage("conn")
        .await
        .expect("storage should be fetched");

    assert_eq!(storages.len(), 2);
    assert_eq!(storages[0].storage, "local");
    assert_eq!(storages[0].r#type, "dir");
    assert_eq!(storages[0].content, "iso,vztmpl");
    assert_eq!(storages[0].active, 1);
    assert_eq!(storages[0].enabled, 1);
    assert_eq!(storages[0].shared, 0);
    assert_eq!(storages[0].used, 429496729600u64);
    assert_eq!(storages[0].total, 858993459200u64);
    assert_eq!(storages[0].avail, 429496729600u64);
    assert_eq!(storages[0].node, "pve1");
    assert_eq!(storages[1].shared, 1);
    mock.assert();
}

#[tokio::test]
async fn get_storage_content_uses_configured_node() {
    let server = MockServer::start();
    let token = "root@pam!content-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/storage/local/content");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {"volid": "local:iso/debian-12.iso", "content": "iso",
                         "ctime": 1700000000, "format": "iso", "size": 68719476736u64},
                        {"volid": "local:vztmpl/ubuntu-22.tar.xz", "content": "vztmpl",
                         "ctime": 1700000001}
                    ]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, Some("pve1")).await;
    let contents = manager
        .get_storage_content("conn", "local")
        .await
        .expect("content should be fetched");

    assert_eq!(contents.len(), 2);
    assert_eq!(contents[0].volid, "local:iso/debian-12.iso");
    assert_eq!(contents[0].content, "iso");
    assert_eq!(contents[0].format.as_deref(), Some("iso"));
    assert_eq!(contents[0].size, Some(68719476736u64));
    // Tolerance: optional metadata is omitted for the second entry.
    assert_eq!(contents[1].format, None);
    assert_eq!(contents[1].subtype, None);
    mock.assert();
}

#[tokio::test]
async fn get_storage_content_falls_back_to_online_node() {
    let server = MockServer::start();
    let token = "root@pam!fallback-token";
    let nodes_mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/nodes");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {"node": "pve1", "status": "online", "cpu": 0.0, "maxcpu": 8,
                         "mem": 0, "maxmem": 34359738368u64, "disk": 0,
                         "maxdisk": 536870912000u64, "uptime": 0, "level": "",
                         "id": "node/pve1", "type": "node"},
                        {"node": "pve2", "status": "offline", "cpu": 0.0, "maxcpu": 8,
                         "mem": 0, "maxmem": 34359738368u64, "disk": 0,
                         "maxdisk": 536870912000u64, "uptime": 0, "level": "",
                         "id": "node/pve2", "type": "node"}
                    ]
                })
                .to_string(),
            );
    });
    let content_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/storage/local/content");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [{"volid": "local:iso/debian.iso", "content": "iso",
                              "ctime": 1700000000}]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let contents = manager
        .get_storage_content("conn", "local")
        .await
        .expect("content should be fetched");

    assert_eq!(contents.len(), 1);
    assert_eq!(contents[0].volid, "local:iso/debian.iso");
    nodes_mock.assert();
    content_mock.assert();
}

#[tokio::test]
async fn get_storage_detail_maps_status() {
    let server = MockServer::start();
    let token = "root@pam!detail-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/storage/local/status");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {"storage": "local", "type": "dir", "content": "iso,vztmpl",
                             "active": 1, "enabled": 1, "shared": 0, "used": 429496729600u64,
                             "total": 858993459200u64, "avail": 429496729600u64, "node": "pve1"}
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let detail = manager
        .get_storage_detail("conn", "pve1", "local")
        .await
        .expect("detail should be fetched");

    assert_eq!(detail.storage, "local");
    assert_eq!(detail.r#type, "dir");
    assert_eq!(detail.content, "iso,vztmpl");
    assert_eq!(detail.active, 1);
    assert_eq!(detail.enabled, 1);
    assert_eq!(detail.used, 429496729600u64);
    assert_eq!(detail.total, 858993459200u64);
    assert_eq!(detail.avail, 429496729600u64);
    assert_eq!(detail.node, "pve1");
    mock.assert();
}

#[tokio::test]
async fn get_tasks_maps_cluster_tasks() {
    let server = MockServer::start();
    let token = "root@pam!tasks-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/cluster/tasks")
            .query_param("limit", "50");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {"upid": "UPID:pve1:00000001:00000001:5F000000:qmpstart:100:root@pam:",
                         "node": "pve1", "pid": 1000, "pstart": 100, "starttime": 1700000000,
                         "type": "qmpstart", "id": "100", "user": "root@pam",
                         "status": "stopped", "endtime": 1700000100, "exitstatus": "OK"},
                        {"upid": "UPID:pve2:00000002:00000002:5F000001:vzstart:201:root@pam:",
                         "node": "pve2", "pid": 2000, "pstart": 200, "starttime": 1700000001,
                         "type": "vzstart", "id": "201", "user": "root@pam"}
                    ]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let tasks = manager
        .get_tasks("conn")
        .await
        .expect("tasks should be fetched");

    assert_eq!(tasks.len(), 2);
    assert_eq!(
        tasks[0].upid,
        "UPID:pve1:00000001:00000001:5F000000:qmpstart:100:root@pam:"
    );
    assert_eq!(tasks[0].node, "pve1");
    assert_eq!(tasks[0].pid, 1000);
    assert_eq!(tasks[0].pstart, 100);
    assert_eq!(tasks[0].starttime, 1700000000);
    assert_eq!(tasks[0].r#type, "qmpstart");
    assert_eq!(tasks[0].id, "100");
    assert_eq!(tasks[0].user, "root@pam");
    assert_eq!(tasks[0].endtime, Some(1700000100));
    assert_eq!(tasks[0].status.as_deref(), Some("stopped"));
    assert_eq!(tasks[0].exitstatus.as_deref(), Some("OK"));
    // Tolerance: the second task has not finished yet.
    assert_eq!(tasks[1].endtime, None);
    assert_eq!(tasks[1].status, None);
    assert_eq!(tasks[1].exitstatus, None);
    mock.assert();
}

#[tokio::test]
async fn get_cluster_status_builds_cluster() {
    let server = MockServer::start();
    let token = "root@pam!cluster-token";
    let mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/cluster/status");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {"type": "cluster", "id": "cluster", "name": "proxmox-cluster",
                         "nodes": 2},
                        {"type": "node", "id": "node/pve1", "nodeid": 1, "online": 1,
                         "local": 1, "ip": "10.0.0.1"},
                        {"type": "node", "id": "node/pve2", "nodeid": 2, "online": 0,
                         "ip": "10.0.0.2"}
                    ]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let status = manager
        .get_cluster_status("conn")
        .await
        .expect("cluster status should be fetched");

    assert_eq!(status.r#type, "cluster");
    assert_eq!(status.name, "proxmox-cluster");
    assert_eq!(status.id, "cluster");
    let nodes = status.nodes.expect("nodes should be present");
    assert_eq!(nodes.len(), 2);
    assert_eq!(nodes[0].name, "pve1");
    assert_eq!(nodes[0].nodeid, 1);
    assert_eq!(nodes[0].online, 1);
    assert_eq!(nodes[0].local, Some(1));
    assert_eq!(nodes[0].ip.as_deref(), Some("10.0.0.1"));
    assert_eq!(nodes[1].name, "pve2");
    assert_eq!(nodes[1].online, 0);
    assert_eq!(nodes[1].local, None);
    mock.assert();
}

#[tokio::test]
async fn get_cluster_status_falls_back_to_default_name() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/cluster/status");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [{"type": "node", "id": "node/pve1", "nodeid": 1, "online": 1}]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), "root@pam!default-token", None).await;
    let status = manager
        .get_cluster_status("conn")
        .await
        .expect("status should be fetched");

    assert_eq!(status.name, "default");
    assert_eq!(status.id, "");
    let nodes = status.nodes.expect("nodes should be present");
    assert_eq!(nodes.len(), 1);
    assert_eq!(nodes[0].name, "pve1");
    mock.assert();
}

#[tokio::test]
async fn lifecycle_uses_qemu_or_lxc_path() {
    let server = MockServer::start();
    let token = "root@pam!lifecycle-token";
    let start_qemu = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/status/start")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });
    let start_lxc = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/lxc/201/status/start");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });
    let stop_qemu = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/status/stop");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;

    manager
        .start_vm("conn", "pve1", 100, "qemu")
        .await
        .expect("qemu start should succeed");
    manager
        .start_vm("conn", "pve1", 201, "lxc")
        .await
        .expect("lxc start should succeed");
    manager
        .stop_vm("conn", "pve1", 100, "qemu")
        .await
        .expect("qemu stop should succeed");

    start_qemu.assert();
    start_lxc.assert();
    stop_qemu.assert();
}

#[tokio::test]
async fn lifecycle_with_invalid_type_errors() {
    let server = MockServer::start();
    let probe = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/kvm/100/status/start");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), "root@pam!bad-type-token", None).await;
    let error = manager
        .start_vm("conn", "pve1", 100, "kvm")
        .await
        .expect_err("invalid vm type must be rejected");

    assert!(
        matches!(error, Error::InvalidUrl(ref message) if message.contains("kvm")),
        "expected InvalidUrl mentioning 'kvm', got: {}",
        error
    );
    assert_eq!(
        probe.hits(),
        0,
        "no HTTP request should be made for an invalid vm type"
    );
}

#[tokio::test]
async fn read_methods_error_with_connection_not_found() {
    let server = MockServer::start();
    let (manager, _dir) = setup_manager(&server.base_url(), "root@pam!missing-token", None).await;

    let error = manager
        .get_nodes("does-not-exist")
        .await
        .expect_err("unknown connection must error");
    assert!(
        matches!(error, Error::ConnectionNotFound(ref id) if id == "does-not-exist"),
        "expected ConnectionNotFound, got: {}",
        error
    );

    let error = manager
        .get_vms("does-not-exist")
        .await
        .expect_err("unknown connection must error");
    assert!(
        matches!(error, Error::ConnectionNotFound(ref id) if id == "does-not-exist"),
        "expected ConnectionNotFound, got: {}",
        error
    );

    let error = manager
        .start_vm("does-not-exist", "pve1", 100, "qemu")
        .await
        .expect_err("unknown connection must error");
    assert!(
        matches!(error, Error::ConnectionNotFound(ref id) if id == "does-not-exist"),
        "expected ConnectionNotFound, got: {}",
        error
    );
}
