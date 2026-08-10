//! Integration tests for automatic failover across cluster endpoints.
//!
//! Transport-level failures (connection refused, timeouts, DNS resolution)
//! must be distinguishable from real authentication failures so the request
//! core can rotate to the next configured endpoint. These tests cover the
//! error mapping in `api_request` and the rotation logic in
//! `Connection::request`.

use httpmock::prelude::*;
use httpmock::Mock;
use clustri::{
    api_request, AuthContext, AuthMode, ConnectionConfig, ConnectionManager, EndpointConfig, Error,
};
use reqwest::Client;
use reqwest::Method as RMethod;

const TOKEN: &str = "root@pam!failover-token";

/// Returns a URL pointing at a closed TCP port: a listener is bound to an
/// ephemeral port, its address is captured, and the listener is dropped so
/// any subsequent connection attempt is refused.
fn closed_port_url() -> String {
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("listener should bind");
    let addr = listener.local_addr().expect("address should be available");
    drop(listener);
    format!("http://{}", addr)
}

fn token_auth() -> AuthContext {
    AuthContext {
        mode: AuthMode::Token,
        token: Some(TOKEN.to_string()),
        ticket: None,
        csrf_token: None,
    }
}

/// Builds a `ConnectionManager` with a single token-mode connection whose
/// primary endpoint is `primary_url` and whose fallbacks are `fallback_urls`.
async fn setup_manager_with_fallbacks(
    primary_url: &str,
    fallback_urls: &[String],
) -> (ConnectionManager, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    let config = ConnectionConfig {
        id: "conn".to_string(),
        name: "conn".to_string(),
        primary: EndpointConfig {
            url: primary_url.to_string(),
            node: None,
            token: Some(TOKEN.to_string()),
        },
        fallbacks: fallback_urls
            .iter()
            .map(|url| EndpointConfig {
                url: url.clone(),
                node: None,
                token: Some(TOKEN.to_string()),
            })
            .collect(),
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

/// Stubs `GET /api2/json/cluster/resources?type=vm` on `server`.
fn stub_vm_resources<'a>(server: &'a MockServer, status: u16, body: &str) -> Mock<'a> {
    server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/cluster/resources")
            .query_param("type", "vm");
        then.status(status)
            .header("content-type", "application/json")
            .body(body);
    })
}

#[tokio::test]
async fn transport_error_maps_to_connection_failed() {
    let url = closed_port_url();
    let error = api_request(
        &Client::new(),
        &url,
        RMethod::GET,
        "/version",
        &token_auth(),
        &[],
        None,
    )
    .await
    .expect_err("connection refused must fail");

    assert!(
        matches!(error, Error::ConnectionFailed(_)),
        "expected ConnectionFailed, got: {}",
        error
    );
}

#[tokio::test]
async fn request_rotates_to_fallback_when_primary_down() {
    let fallback = MockServer::start();
    let fallback_mock = stub_vm_resources(
        &fallback,
        200,
        &serde_json::json!({
            "data": [
                {"vmid": 100, "name": "web01", "type": "qemu", "status": "running",
                 "node": "pve1"}
            ]
        })
        .to_string(),
    );

    let primary_url = closed_port_url();
    let (manager, _dir) = setup_manager_with_fallbacks(&primary_url, &[fallback.base_url()]).await;

    let vms = manager
        .get_vms("conn")
        .await
        .expect("request should succeed via the fallback endpoint");

    assert_eq!(vms.len(), 1);
    assert_eq!(vms[0].vmid, 100);
    assert_eq!(vms[0].name.as_deref(), Some("web01"));
    assert_eq!(
        manager
            .runtime_status("conn")
            .expect("status should be readable"),
        "failover"
    );
    fallback_mock.assert();
}

#[tokio::test]
async fn non_transport_error_does_not_rotate() {
    let primary = MockServer::start();
    let fallback = MockServer::start();
    let primary_mock = stub_vm_resources(&primary, 500, r#"{"message":"boom"}"#);
    let fallback_mock = stub_vm_resources(&fallback, 200, r#"{"data":[]}"#);

    let (manager, _dir) =
        setup_manager_with_fallbacks(&primary.base_url(), &[fallback.base_url()]).await;

    let error = manager
        .get_vms("conn")
        .await
        .expect_err("a 500 response must surface as an ApiError");

    assert!(
        matches!(error, Error::ApiError(ref message) if message == "boom"),
        "expected ApiError with message 'boom', got: {}",
        error
    );
    primary_mock.assert();
    assert_eq!(
        fallback_mock.calls(),
        0,
        "a non-transport error must not trigger failover"
    );
}

#[tokio::test]
async fn request_succeeds_on_primary_again_when_it_returns() {
    let primary = MockServer::start();
    let fallback = MockServer::start();
    let primary_mock = stub_vm_resources(&primary, 200, r#"{"data":[]}"#);
    let fallback_mock = stub_vm_resources(&fallback, 200, r#"{"data":[]}"#);

    let (manager, _dir) =
        setup_manager_with_fallbacks(&primary.base_url(), &[fallback.base_url()]).await;

    let vms = manager
        .get_vms("conn")
        .await
        .expect("request should succeed on the primary endpoint");

    assert!(vms.is_empty());
    primary_mock.assert();
    assert_eq!(fallback_mock.calls(), 0);
    assert_eq!(
        manager
            .runtime_status("conn")
            .expect("status should be readable"),
        "connected"
    );
}
