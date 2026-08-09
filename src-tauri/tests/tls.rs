//! Integration tests for the application-layer TLS certificate capture and
//! TOFU (Trust On First Use) pinning helpers.
//!
//! Each test spawns a local TLS server with a freshly generated self-signed
//! certificate and exercises the capture/verify helpers against it.

use proxmox_desktop::tls::{
    capture_fingerprint, fetch_certificate_info, verify_pin, verify_server_certificate,
};
use proxmox_desktop::Error;
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::ServerConfig;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tokio_rustls::TlsAcceptor;

/// A plausible but wrong fingerprint (SHA-256 size, hex-uppercase, colon-separated).
const WRONG_PIN: &str = "AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99";

/// Computes the expected `AA:BB:CC:...` uppercase fingerprint from raw DER.
fn fingerprint_of(der: &[u8]) -> String {
    let digest = Sha256::digest(der);
    let hex = hex::encode_upper(digest);
    hex.as_bytes()
        .chunks(2)
        .map(|pair| std::str::from_utf8(pair).expect("hex digits are ASCII"))
        .collect::<Vec<_>>()
        .join(":")
}

/// Generates a self-signed certificate and key for `127.0.0.1`.
fn generate_self_signed() -> (CertificateDer<'static>, PrivateKeyDer<'static>) {
    let certified = rcgen::generate_simple_self_signed(vec!["127.0.0.1".to_string()])
        .expect("self-signed cert generation should succeed");
    let cert_der = certified.cert.der().clone();
    let key_der =
        PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(certified.key_pair.serialize_der()));
    (cert_der, key_der)
}

/// Spawns a TLS server on an ephemeral port serving `cert_der`/`key_der` and
/// returns the `https://` URL and the expected certificate fingerprint.
async fn spawn_tls_server(
    cert_der: CertificateDer<'static>,
    key_der: PrivateKeyDer<'static>,
) -> (String, String) {
    // rustls cannot auto-select a process-level CryptoProvider when the
    // dependency graph enables both `ring` (reqwest/tokio-rustls) and the
    // rustls default `aws-lc-rs`. The production capture helpers install ring
    // explicitly; the spawned server below must do the same or it races with
    // (and loses to) the client's install before building its config.
    let _ = rustls::crypto::ring::default_provider().install_default();

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind should succeed");
    let address = listener.local_addr().expect("local addr should exist");

    let config = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(vec![cert_der.clone()], key_der)
        .expect("server config should build");
    let acceptor = Arc::new(TlsAcceptor::from(Arc::new(config)));

    tokio::spawn(async move {
        loop {
            let (stream, _) = match listener.accept().await {
                Ok(accepted) => accepted,
                Err(_) => continue,
            };
            let acceptor = Arc::clone(&acceptor);
            tokio::spawn(async move {
                // Complete the handshake, then drop the connection. The client
                // captures the certificate as soon as the handshake finishes.
                let _ = acceptor.accept(stream).await;
            });
        }
    });

    let expected = fingerprint_of(cert_der.as_ref());
    (format!("https://{}", address), expected)
}

#[tokio::test(flavor = "multi_thread")]
async fn fetch_certificate_info_returns_real_certificate_data() {
    let (cert_der, key_der) = generate_self_signed();
    let (url, expected) = spawn_tls_server(cert_der, key_der).await;

    let info = fetch_certificate_info(&url)
        .await
        .expect("certificate info should be fetched");

    assert_eq!(
        info.fingerprint, expected,
        "fingerprint must match the SHA-256 of the served certificate"
    );
    assert!(info.self_signed, "generated certificate is self-signed");
}

#[tokio::test(flavor = "multi_thread")]
async fn capture_fingerprint_matches_served_certificate() {
    let (cert_der, key_der) = generate_self_signed();
    let (url, expected) = spawn_tls_server(cert_der, key_der).await;

    let fingerprint = capture_fingerprint(&url)
        .await
        .expect("fingerprint should be captured");

    assert_eq!(fingerprint, expected);
}

#[tokio::test(flavor = "multi_thread")]
async fn verify_server_certificate_with_correct_pin_succeeds() {
    let (cert_der, key_der) = generate_self_signed();
    let (url, expected) = spawn_tls_server(cert_der, key_der).await;

    let fingerprint = verify_server_certificate(&url, Some(&expected), false)
        .await
        .expect("matching pin should verify");

    assert_eq!(fingerprint, expected);
}

#[tokio::test(flavor = "multi_thread")]
async fn verify_server_certificate_with_wrong_pin_fails() {
    let (cert_der, key_der) = generate_self_signed();
    let (url, _expected) = spawn_tls_server(cert_der, key_der).await;

    let error = verify_server_certificate(&url, Some(WRONG_PIN), false)
        .await
        .expect_err("mismatched pin should fail");

    assert!(
        matches!(error, Error::CertificateError(ref message) if message.contains("fingerprint")),
        "expected CertificateError, got: {}",
        error
    );
}

#[tokio::test(flavor = "multi_thread")]
async fn verify_server_certificate_accepts_untrusted_on_mismatch() {
    let (cert_der, key_der) = generate_self_signed();
    let (url, expected) = spawn_tls_server(cert_der, key_der).await;

    let fingerprint = verify_server_certificate(&url, Some(WRONG_PIN), true)
        .await
        .expect("accept_untrusted should bypass the pin mismatch");

    assert_eq!(fingerprint, expected);
}

#[tokio::test(flavor = "multi_thread")]
async fn verify_server_certificate_without_pin_returns_fingerprint() {
    let (cert_der, key_der) = generate_self_signed();
    let (url, expected) = spawn_tls_server(cert_der, key_der).await;

    let fingerprint = verify_server_certificate(&url, None, false)
        .await
        .expect("first use should return the fingerprint");

    assert_eq!(fingerprint, expected);
}

#[tokio::test(flavor = "multi_thread")]
async fn fetch_certificate_info_rejects_non_https_urls() {
    let error = fetch_certificate_info("http://127.0.0.1:8006")
        .await
        .expect_err("http URL must be rejected");

    assert!(
        matches!(error, Error::InvalidUrl(_)),
        "expected InvalidUrl, got: {}",
        error
    );
}

#[test]
fn verify_pin_is_case_insensitive_and_separator_agnostic() {
    let canonical = "AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90";

    assert!(verify_pin(canonical, canonical));
    assert!(verify_pin(canonical, &canonical.to_lowercase()));
    assert!(verify_pin(&canonical.replace(':', ""), canonical));
    assert!(verify_pin(canonical, &canonical.replace(':', " ")));
    assert!(!verify_pin(canonical, WRONG_PIN));
}
