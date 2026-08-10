//! Integration tests for connection persistence and the connect/disconnect
//! flow.
//!
//! Connection configs are persisted to a JSON file with secrets (API tokens)
//! stripped, so they never round-trip through the file; after a restart the
//! request layer falls back to the OS keyring.

use httpmock::prelude::*;
use clustri::{ConnectionConfig, ConnectionManager, EndpointConfig, Error};

/// Builds a token-mode connection config with a real token set.
fn token_config(id: &str, url: &str, token: &str, accept_untrusted: bool) -> ConnectionConfig {
    ConnectionConfig {
        id: id.to_string(),
        name: id.to_string(),
        primary: EndpointConfig {
            url: url.to_string(),
            node: None,
            token: Some(token.to_string()),
        },
        fallbacks: vec![],
        cert_fingerprint: None,
        trusted: false,
        accept_untrusted,
        status: "disconnected".to_string(),
        cluster_name: None,
        is_cluster: false,
        auth_mode: "token".to_string(),
        username: None,
        nodes: vec![],
        cluster_id: None,
    }
}

#[tokio::test]
async fn persisted_configs_round_trip_without_secrets() {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");

    let mut manager = ConnectionManager::new();
    let config = ConnectionConfig {
        id: "conn-1".to_string(),
        name: "Proxmox".to_string(),
        primary: EndpointConfig {
            url: "https://pve.local:8006".to_string(),
            node: None,
            token: Some("root@pam!primary-secret".to_string()),
        },
        fallbacks: vec![EndpointConfig {
            url: "https://backup.local:8006".to_string(),
            node: None,
            token: Some("root@pam!backup-secret".to_string()),
        }],
        cert_fingerprint: None,
        trusted: false,
        accept_untrusted: false,
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

    // The persisted file must contain the connection but never its secrets.
    let raw = std::fs::read_to_string(&path).expect("file should be written");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("file should be valid JSON");
    assert_eq!(json["activeConnectionId"], serde_json::Value::Null);
    let conn = &json["connections"][0];
    assert_eq!(conn["id"], "conn-1");
    assert_eq!(conn["name"], "Proxmox");
    assert!(
        conn["primary"].get("token").is_none(),
        "primary token must not be serialized"
    );
    assert!(
        conn["fallbacks"][0].get("token").is_none(),
        "fallback token must not be serialized"
    );
    assert!(
        conn.get("certFingerprint").is_none(),
        "absent certFingerprint must not be serialized"
    );

    // Reloading from disk rebuilds the connection; the token does not
    // round-trip and every connection starts disconnected.
    let mut reloaded = ConnectionManager::new();
    let result = reloaded
        .load_connections(&path)
        .await
        .expect("connections should load");
    assert_eq!(result.connections.len(), 1);
    let loaded = &result.connections[0];
    assert_eq!(loaded.id, "conn-1");
    assert_eq!(loaded.name, "Proxmox");
    assert!(
        loaded.primary.token.is_none(),
        "token must not round-trip through the file"
    );
    assert_eq!(loaded.status, "disconnected");
}

#[tokio::test]
async fn load_connections_with_missing_file_returns_empty() {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("missing").join("connections.json");

    let mut manager = ConnectionManager::new();
    let result = manager
        .load_connections(&path)
        .await
        .expect("missing file is not an error");
    assert!(result.active_connection_id.is_none());
    assert!(result.connections.is_empty());
}

#[tokio::test]
async fn remove_connection_persists_and_keeps_active() {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");

    let mut manager = ConnectionManager::new();
    manager
        .add_connection(
            token_config("conn-1", "https://one.local:8006", "tok-1", false),
            &path,
        )
        .await
        .expect("connection 1 should be added");
    manager
        .add_connection(
            token_config("conn-2", "https://two.local:8006", "tok-2", false),
            &path,
        )
        .await
        .expect("connection 2 should be added");
    manager
        .set_active_connection("conn-2".to_string(), &path)
        .await
        .expect("active connection should be set");

    manager
        .remove_connection("conn-1", &path)
        .await
        .expect("connection 1 should be removed");

    let raw = std::fs::read_to_string(&path).expect("file should be written");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("file should be valid JSON");
    let ids: Vec<&str> = json["connections"]
        .as_array()
        .expect("connections should be an array")
        .iter()
        .filter_map(|c| c["id"].as_str())
        .collect();
    assert_eq!(
        ids,
        vec!["conn-2"],
        "removed connection must not be persisted"
    );
    assert_eq!(
        json["activeConnectionId"], "conn-2",
        "removing a non-active connection must keep the active id"
    );

    let mut reloaded = ConnectionManager::new();
    let result = reloaded
        .load_connections(&path)
        .await
        .expect("connections should load");
    assert_eq!(result.connections.len(), 1);
    assert_eq!(result.connections[0].id, "conn-2");
    assert_eq!(result.active_connection_id.as_deref(), Some("conn-2"));
}

#[tokio::test]
async fn update_connection_preserves_cert_settings_and_replaces_config() {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");

    let mut manager = ConnectionManager::new();
    manager
        .add_connection(
            token_config("conn-1", "https://one.local:8006", "tok-1", true),
            &path,
        )
        .await
        .expect("connection should be added");
    manager
        .trust_certificate("conn-1", "AB:CD:EF", &path)
        .await
        .expect("certificate should be pinned");

    // Update the name while omitting the certificate fields; the pinned
    // fingerprint and trust settings must survive the update.
    let updated = ConnectionConfig {
        id: "conn-1".to_string(),
        name: "Renamed".to_string(),
        primary: EndpointConfig {
            url: "https://one.local:8006".to_string(),
            node: None,
            token: None,
        },
        fallbacks: vec![],
        cert_fingerprint: None,
        trusted: false,
        accept_untrusted: false,
        status: "disconnected".to_string(),
        cluster_name: None,
        is_cluster: false,
        auth_mode: "token".to_string(),
        username: None,
        nodes: vec![],
        cluster_id: None,
    };
    manager
        .update_connection(updated, &path)
        .await
        .expect("connection should be updated");

    let raw = std::fs::read_to_string(&path).expect("file should be written");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("file should be valid JSON");
    let conn = &json["connections"][0];
    assert_eq!(conn["id"], "conn-1");
    assert_eq!(conn["name"], "Renamed");
    assert_eq!(
        conn["certFingerprint"], "AB:CD:EF",
        "cert_fingerprint must be preserved when omitted"
    );
    assert_eq!(
        conn["trusted"], true,
        "trusted must be preserved when omitted"
    );
    assert_eq!(
        conn["acceptUntrusted"], true,
        "accept_untrusted must be preserved when omitted"
    );

    // The updated config is what the reloaded manager serves.
    let mut reloaded = ConnectionManager::new();
    let result = reloaded
        .load_connections(&path)
        .await
        .expect("connections should load");
    assert_eq!(result.connections.len(), 1);
    assert_eq!(result.connections[0].name, "Renamed");
}

#[tokio::test]
async fn update_connection_unknown_id_fails() {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");

    let mut manager = ConnectionManager::new();
    let error = manager
        .update_connection(
            token_config("missing", "https://nope.local:8006", "tok", false),
            &path,
        )
        .await
        .expect_err("updating an unknown connection must fail");
    assert!(
        matches!(error, Error::ConnectionNotFound(ref id) if id == "missing"),
        "expected ConnectionNotFound for the missing id, got: {}",
        error
    );
}

#[tokio::test]
async fn remove_active_connection_clears_active_id() {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");

    let mut manager = ConnectionManager::new();
    manager
        .add_connection(
            token_config("conn-1", "https://one.local:8006", "tok-1", false),
            &path,
        )
        .await
        .expect("connection should be added");
    manager
        .set_active_connection("conn-1".to_string(), &path)
        .await
        .expect("active connection should be set");

    manager
        .remove_connection("conn-1", &path)
        .await
        .expect("connection should be removed");

    let raw = std::fs::read_to_string(&path).expect("file should be written");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("file should be valid JSON");
    assert!(
        json["activeConnectionId"].is_null(),
        "removing the active connection must clear the active id"
    );
}

#[tokio::test]
async fn connect_token_mode_validates_version_endpoint() {
    let server = MockServer::start();
    let token = "root@pam!test-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/version")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"version":"8.2","release":"8.2.4","repoid":"abc"}}"#);
    });
    // Connect also discovers the cluster's nodes, so the discovery endpoints
    // are stubbed (empty cluster: no node entries, no cluster identity).
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/nodes");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/cluster/status");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });

    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");

    let mut manager = ConnectionManager::new();
    // `accept_untrusted` skips the TLS capture, which is required here because
    // the mock server speaks plain HTTP.
    manager
        .add_connection(
            token_config("conn-token", &server.base_url(), token, true),
            &path,
        )
        .await
        .expect("connection should be added");

    let result = manager
        .connect("conn-token", &path)
        .await
        .expect("connect should succeed against the mock server");
    assert_eq!(result.status, "connected");
    assert_eq!(result.merged_into, None);
    mock.assert();

    // The status update is persisted alongside the connection.
    let raw = std::fs::read_to_string(&path).expect("file should be written");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("file should be valid JSON");
    assert_eq!(
        json["connections"][0]["status"], "connected",
        "connect must persist the connected status"
    );
}

#[tokio::test]
async fn connect_without_cert_pin_and_no_escape_hatch_fails() {
    let server = MockServer::start();
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");

    let mut manager = ConnectionManager::new();
    manager
        .add_connection(
            token_config("conn-untrusted", &server.base_url(), "tok", false),
            &path,
        )
        .await
        .expect("connection should be added");

    // The guard rejects the connect before any TLS is attempted (the guard is
    // hit regardless of the scheme, so the http:// mock URL is fine here).
    let error = manager
        .connect("conn-untrusted", &path)
        .await
        .expect_err("connect must fail without a pin or escape hatch");
    assert!(
        matches!(error, Error::CertificateError(ref message) if message.contains("not been trusted")),
        "expected CertificateError about the untrusted certificate, got: {}",
        error
    );
}

#[tokio::test]
async fn connect_accept_untrusted_escape_hatch_reaches_version() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/version");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"version":"8.2"}}"#);
    });
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/nodes");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/cluster/status");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });

    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");

    let mut manager = ConnectionManager::new();
    manager
        .add_connection(
            token_config("conn-escape", &server.base_url(), "tok", true),
            &path,
        )
        .await
        .expect("connection should be added");

    let result = manager
        .connect("conn-escape", &path)
        .await
        .expect("the escape hatch must skip certificate verification");
    assert_eq!(result.status, "connected");
    mock.assert();

    let raw = std::fs::read_to_string(&path).expect("file should be written");
    let json: serde_json::Value = serde_json::from_str(&raw).expect("file should be valid JSON");
    assert_eq!(json["connections"][0]["status"], "connected");
}

#[tokio::test]
async fn disconnect_clears_session_and_status() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/version");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"version":"8.2"}}"#);
    });
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/nodes");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/cluster/status");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });

    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");

    let mut manager = ConnectionManager::new();
    manager
        .add_connection(
            token_config("conn-disc", &server.base_url(), "tok", true),
            &path,
        )
        .await
        .expect("connection should be added");
    let result = manager
        .connect("conn-disc", &path)
        .await
        .expect("connect should succeed");
    assert_eq!(result.status, "connected");

    manager
        .disconnect("conn-disc")
        .await
        .expect("disconnect should succeed");

    // Reconnecting after a disconnect works, so the credentials used to
    // authenticate (the in-config token) must still be available. This
    // triggers a second request to the version endpoint.
    let result = manager
        .connect("conn-disc", &path)
        .await
        .expect("reconnect after disconnect should succeed");
    assert_eq!(result.status, "connected");
    mock.assert_calls(2);
}
