//! Integration tests for the console proxy API calls (VNC + terminal) and
//! the WebSocket base URL derivation.
//!
//! The proxy calls go through `Connection::request`, so these tests cover URL
//! construction, auth header injection, response envelope unwrapping, and
//! mapping into the public serde structs. `get_websocket_url` only rewrites
//! the stored endpoint URL, so it never hits the network. Token-mode
//! connections resolve the token from the config, so the methods can be called
//! directly on an added connection without `connect()`.

use httpmock::prelude::*;
use clustri::{ConnectionConfig, ConnectionManager, EndpointConfig, Error};

/// Builds a `ConnectionManager` with a single token-mode connection whose
/// primary endpoint points at `url`.
async fn setup_manager(url: &str, token: &str) -> (ConnectionManager, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    let config = ConnectionConfig {
        id: "conn".to_string(),
        name: "conn".to_string(),
        primary: EndpointConfig {
            url: url.to_string(),
            node: None,
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
        server_type: "pve".to_string(),
    };
    manager
        .add_connection(config, &path)
        .await
        .expect("connection should be added");
    (manager, dir)
}

#[tokio::test]
async fn create_vnc_proxy_maps_response() {
    let server = MockServer::start();
    let token = "root@pam!vnc-token";
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/vncproxy")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {
                        "ticket": "PVE:vnc:abc",
                        "port": 6000,
                        "cert": "MIIB..."
                    }
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token).await;
    let proxy = manager
        .create_vnc_proxy("conn", "pve1", 100)
        .await
        .expect("vnc proxy should be created");

    assert_eq!(proxy.ticket, "PVE:vnc:abc");
    assert_eq!(proxy.port, 6000);
    assert_eq!(proxy.cert, "MIIB...");
    mock.assert();
}

#[tokio::test]
async fn create_term_proxy_maps_response() {
    let server = MockServer::start();
    let token = "root@pam!term-token";
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/lxc/201/termproxy")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {
                        "ticket": "PVE:term:xyz",
                        "port": 6100
                    }
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token).await;
    let proxy = manager
        .create_term_proxy("conn", "pve1", 201)
        .await
        .expect("term proxy should be created");

    assert_eq!(proxy.ticket, "PVE:term:xyz");
    assert_eq!(proxy.port, 6100);
    mock.assert();
}

#[tokio::test]
async fn create_vnc_proxy_accepts_string_port() {
    // Some Proxmox versions report the proxy port as a JSON string.
    let server = MockServer::start();
    let token = "root@pam!vnc-token";
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/tatooine/qemu/106/vncproxy")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {
                        "ticket": "PVE:vnc:abc",
                        "port": "5901",
                        "cert": "MIIB..."
                    }
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token).await;
    let proxy = manager
        .create_vnc_proxy("conn", "tatooine", 106)
        .await
        .expect("vnc proxy should be created");

    assert_eq!(proxy.ticket, "PVE:vnc:abc");
    assert_eq!(proxy.port, 5901);
    assert_eq!(proxy.cert, "MIIB...");
    mock.assert();
}

#[tokio::test]
async fn create_term_proxy_accepts_string_port() {
    let server = MockServer::start();
    let token = "root@pam!term-token";
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/lxc/201/termproxy")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {
                        "ticket": "PVE:term:xyz",
                        "port": "6100"
                    }
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token).await;
    let proxy = manager
        .create_term_proxy("conn", "pve1", 201)
        .await
        .expect("term proxy should be created");

    assert_eq!(proxy.ticket, "PVE:term:xyz");
    assert_eq!(proxy.port, 6100);
    mock.assert();
}

#[tokio::test]
async fn create_vnc_proxy_rejects_invalid_port_string() {
    let server = MockServer::start();
    let token = "root@pam!vnc-token";
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/vncproxy")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {
                        "ticket": "PVE:vnc:abc",
                        "port": "not-a-port",
                        "cert": "MIIB..."
                    }
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token).await;
    let error = manager
        .create_vnc_proxy("conn", "pve1", 100)
        .await
        .expect_err("non-numeric port string must be rejected");
    assert!(
        matches!(error, Error::SerializationError(ref message) if message.contains("not-a-port")),
        "expected Serialization mentioning the port string, got: {}",
        error
    );
    mock.assert();
}

#[tokio::test]
async fn get_websocket_url_converts_https_to_wss() {
    // Explicit port on https.
    let (manager, _dir) = setup_manager("https://192.168.1.10:8006", "root@pam!ws-token").await;
    let url = manager
        .get_websocket_url("conn", "pve1")
        .await
        .expect("websocket url should be derived");
    assert_eq!(url, "wss://192.168.1.10:8006");

    // No explicit port: the default wss port applies, so none is emitted.
    let (manager, _dir) = setup_manager("https://pve.lan", "root@pam!ws-token").await;
    let url = manager
        .get_websocket_url("conn", "pve1")
        .await
        .expect("websocket url should be derived");
    assert_eq!(url, "wss://pve.lan");

    // Plain http maps to ws.
    let (manager, _dir) = setup_manager("http://10.0.0.5:8006", "root@pam!ws-token").await;
    let url = manager
        .get_websocket_url("conn", "pve1")
        .await
        .expect("websocket url should be derived");
    assert_eq!(url, "ws://10.0.0.5:8006");
}

#[tokio::test]
async fn get_websocket_url_errors_on_invalid_scheme() {
    let (manager, _dir) = setup_manager("ftp://host", "root@pam!ws-token").await;
    let error = manager
        .get_websocket_url("conn", "pve1")
        .await
        .expect_err("non-http(s) scheme must be rejected");
    assert!(
        matches!(error, Error::InvalidUrl(ref message) if message.contains("ftp")),
        "expected InvalidUrl mentioning 'ftp', got: {}",
        error
    );
}

#[tokio::test]
async fn missing_connection_errors() {
    let server = MockServer::start();
    let (manager, _dir) = setup_manager(&server.base_url(), "root@pam!missing-token").await;

    let error = manager
        .create_vnc_proxy("does-not-exist", "pve1", 100)
        .await
        .expect_err("unknown connection must error");
    assert!(
        matches!(error, Error::ConnectionNotFound(ref id) if id == "does-not-exist"),
        "expected ConnectionNotFound, got: {}",
        error
    );
}
