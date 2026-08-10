//! Integration tests for the Proxmox API client core.
//!
//! These tests exercise the generic `api_request` helper against a local HTTP
//! mock server, covering auth header injection, response envelope unwrapping,
//! error mapping, query parameters, and URL construction.

use httpmock::prelude::*;
use clustri::{api_request, AuthContext, AuthMode, Error};
use reqwest::Client;
use reqwest::Method as RMethod;

const TICKET: &str = "PVE:root@pam:abc123";
const CSRF_TOKEN: &str = "csrf-token-123";

fn token_auth() -> AuthContext {
    AuthContext {
        mode: AuthMode::Token,
        token: Some("root@pam!test-token".to_string()),
        ticket: None,
        csrf_token: None,
    }
}

fn password_auth() -> AuthContext {
    AuthContext {
        mode: AuthMode::Password,
        token: None,
        ticket: Some(TICKET.to_string()),
        csrf_token: Some(CSRF_TOKEN.to_string()),
    }
}

#[tokio::test]
async fn token_auth_sends_authorization_header_and_unwraps_envelope() {
    let server = MockServer::start();
    let expected = serde_json::json!({
        "version": "8.1.0",
        "release": "8.1",
        "repoid": "abc123",
    });
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/version")
            .header("Authorization", "PVEAPIToken=root@pam!test-token");
        then.status(200)
            .header("content-type", "application/json")
            .body(serde_json::json!({ "data": expected }).to_string());
    });

    let result = api_request(
        &Client::new(),
        &server.base_url(),
        RMethod::GET,
        "/version",
        &token_auth(),
        &[],
        None,
    )
    .await
    .expect("request should succeed");

    assert_eq!(result, expected);
    mock.assert();
}

#[tokio::test]
async fn password_auth_sends_cookie_header_on_get() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/version")
            .header("Cookie", format!("PVEAuthCookie={}", TICKET));
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"version":"8.1.0"}}"#);
    });

    let result = api_request(
        &Client::new(),
        &server.base_url(),
        RMethod::GET,
        "/version",
        &password_auth(),
        &[],
        None,
    )
    .await
    .expect("request should succeed");

    assert_eq!(result["version"], "8.1.0");
    mock.assert();
}

#[tokio::test]
async fn password_auth_sends_cookie_and_csrf_headers_on_post() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve/qemu/100/status/start")
            .header("Cookie", format!("PVEAuthCookie={}", TICKET))
            .header("CSRFPreventionToken", CSRF_TOKEN);
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let result = api_request(
        &Client::new(),
        &server.base_url(),
        RMethod::POST,
        "/nodes/pve/qemu/100/status/start",
        &password_auth(),
        &[],
        None,
    )
    .await
    .expect("request should succeed");

    assert_eq!(result, serde_json::Value::Null);
    mock.assert();
}

#[tokio::test]
async fn server_error_message_is_mapped_to_api_error() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/version");
        then.status(500)
            .header("content-type", "application/json")
            .body(r#"{"errors":"specific failure","message":"boom"}"#);
    });

    let error = api_request(
        &Client::new(),
        &server.base_url(),
        RMethod::GET,
        "/version",
        &token_auth(),
        &[],
        None,
    )
    .await
    .expect_err("request should fail");

    // A string `errors` field takes precedence over the generic `message`.
    assert!(
        matches!(error, Error::ApiError(ref message) if message == "specific failure"),
        "expected ApiError with message 'specific failure', got: {}",
        error
    );
    mock.assert();
}

#[tokio::test]
async fn server_error_errors_object_first_pair_is_surfaced() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/version");
        then.status(400)
            .header("content-type", "application/json")
            .body(
                r#"{"errors":{"limit":"property is not defined in schema"},"message":"Parameter verification failed."}"#,
            );
    });

    let error = api_request(
        &Client::new(),
        &server.base_url(),
        RMethod::GET,
        "/version",
        &token_auth(),
        &[],
        None,
    )
    .await
    .expect_err("request should fail");

    // An `errors` object surfaces its first `key: value` pair, not the generic
    // `message` fallback.
    assert!(
        matches!(
            error,
            Error::ApiError(ref message)
                if message == "limit: property is not defined in schema"
        ),
        "expected ApiError with 'limit: property is not defined in schema', got: {}",
        error
    );
    mock.assert();
}

#[tokio::test]
async fn query_params_are_included_in_request() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve/qemu")
            .query_param("node", "pve")
            .query_param("vmid", "100")
            .query_param("include-config", "true");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });

    let query = [
        ("node", "pve".to_string()),
        ("vmid", "100".to_string()),
        ("include-config", "true".to_string()),
    ];
    let result = api_request(
        &Client::new(),
        &server.base_url(),
        RMethod::GET,
        "/nodes/pve/qemu",
        &token_auth(),
        &query,
        None,
    )
    .await
    .expect("request should succeed");

    assert_eq!(result, serde_json::json!([]));
    mock.assert();
}

#[tokio::test]
async fn base_url_trailing_slash_is_stripped() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/version");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"version":"8.1.0"}}"#);
    });

    let base_url = format!("{}/", server.base_url());
    let result = api_request(
        &Client::new(),
        &base_url,
        RMethod::GET,
        "/version",
        &token_auth(),
        &[],
        None,
    )
    .await
    .expect("request should succeed");

    assert_eq!(result["version"], "8.1.0");
    mock.assert();
}
