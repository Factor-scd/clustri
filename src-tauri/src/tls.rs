//! Application-layer TLS certificate capture and TOFU (Trust On First Use)
//! fingerprint pinning.
//!
//! The reqwest transport used by the rest of the app is configured to accept
//! self-signed and otherwise invalid certificates, which is typical for
//! home-lab Proxmox servers. To keep connections safe without a full CA trust
//! chain, this module performs its own certificate capture at the connect
//! layer: it opens a raw TLS connection, extracts the presented leaf
//! certificate, and computes its SHA-256 fingerprint. [`verify_server_certificate`]
//! then compares that fingerprint against the value pinned when the server was
//! first trusted.

use crate::{CertificateInfo, Error};
use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::pki_types::{CertificateDer, ServerName};
use rustls::{ClientConfig, DigitallySignedStruct, SignatureScheme};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use tokio::net::TcpStream;
use tokio_rustls::TlsConnector;
use url::Url;
use x509_cert::der::Decode;

/// Verifier that accepts every presented certificate chain.
///
/// The actual security decision is deferred to the application layer: the leaf
/// certificate's SHA-256 fingerprint is captured on each connection and
/// compared against the pinned value recorded on first use (TOFU).
#[derive(Debug)]
struct AcceptAllVerifier;

impl ServerCertVerifier for AcceptAllVerifier {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: rustls::pki_types::UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        rustls::crypto::ring::default_provider()
            .signature_verification_algorithms
            .supported_schemes()
    }
}

/// Installs the ring crypto provider once per process.
///
/// `install_default` is idempotent and thread-safe; subsequent calls return
/// `Err` with the already-installed provider, which is ignored here.
fn ensure_crypto_provider() {
    let _ = rustls::crypto::ring::default_provider().install_default();
}

/// Opens a raw TLS connection to `url` and returns the DER-encoded leaf
/// certificate presented by the server.
async fn capture_leaf_certificate_der(url: &str) -> crate::Result<Vec<u8>> {
    ensure_crypto_provider();

    let parsed =
        Url::parse(url).map_err(|e| Error::InvalidUrl(format!("Invalid URL '{}': {}", url, e)))?;
    if parsed.scheme() != "https" {
        return Err(Error::InvalidUrl(format!(
            "Only https URLs are supported, got '{}://'",
            parsed.scheme()
        )));
    }
    let host = parsed
        .host_str()
        .ok_or_else(|| Error::InvalidUrl(format!("URL '{}' has no host", url)))?
        .to_string();
    let port = parsed.port().unwrap_or(443);

    let server_name = ServerName::try_from(host.clone()).map_err(|e| {
        Error::InvalidUrl(format!(
            "Invalid hostname '{}' in URL '{}': {}",
            host, url, e
        ))
    })?;

    let addr = format!("{}:{}", host, port);
    let addresses = tokio::net::lookup_host(&addr)
        .await
        .map_err(|e| Error::InvalidUrl(format!("Cannot resolve '{}': {}", addr, e)))?
        .collect::<Vec<_>>();
    let address = addresses
        .first()
        .ok_or_else(|| Error::InvalidUrl(format!("Cannot resolve host '{}'", addr)))?;

    let tcp = TcpStream::connect(address)
        .await
        .map_err(|e| Error::CertificateError(format!("Cannot connect to '{}': {}", addr, e)))?;

    let config = ClientConfig::builder()
        .dangerous()
        .with_custom_certificate_verifier(Arc::new(AcceptAllVerifier))
        .with_no_client_auth();

    let connector = TlsConnector::from(Arc::new(config));
    let tls = connector.connect(server_name, tcp).await.map_err(|e| {
        Error::CertificateError(format!("TLS handshake with '{}' failed: {}", addr, e))
    })?;

    let (_, session) = tls.get_ref();
    let leaf = session
        .peer_certificates()
        .and_then(|certs| certs.first())
        .ok_or_else(|| {
            Error::CertificateError(format!("Server '{}' presented no TLS certificate", addr))
        })?;

    Ok(leaf.as_ref().to_vec())
}

/// Computes the SHA-256 fingerprint of a DER-encoded certificate in the
/// `AA:BB:CC:...` uppercase colon-separated format used across the app.
fn fingerprint_of(der: &[u8]) -> String {
    let digest = Sha256::digest(der);
    let hex = hex::encode_upper(digest);
    hex.as_bytes()
        .chunks(2)
        .map(|pair| std::str::from_utf8(pair).expect("hex digits are ASCII"))
        .collect::<Vec<_>>()
        .join(":")
}

/// Captures just the SHA-256 fingerprint of the certificate presented by `url`.
pub async fn capture_fingerprint(url: &str) -> crate::Result<String> {
    let der = capture_leaf_certificate_der(url).await?;
    Ok(fingerprint_of(&der))
}

/// Compares a captured fingerprint against a pinned value.
///
/// The comparison is case-insensitive and ignores the `:` (and other
/// non-hex) separators, so `ab:cd` and `AB:CD` (or even `abcd`) all match.
pub fn verify_pin(fingerprint: &str, pinned: &str) -> bool {
    fn normalize(s: &str) -> String {
        s.chars()
            .filter(|c| c.is_ascii_hexdigit())
            .flat_map(char::to_uppercase)
            .collect()
    }
    normalize(fingerprint) == normalize(pinned)
}

/// Connects to `url`, captures the presented leaf certificate, and returns a
/// [`CertificateInfo`] with its fingerprint and parsed metadata.
pub async fn fetch_certificate_info(url: &str) -> crate::Result<CertificateInfo> {
    let der = capture_leaf_certificate_der(url).await?;
    let cert = x509_cert::Certificate::from_der(&der)
        .map_err(|e| Error::CertificateError(format!("Failed to parse certificate: {}", e)))?;

    let tbs = &cert.tbs_certificate;
    let issuer = tbs.issuer.to_string();
    let subject = tbs.subject.to_string();
    let self_signed = issuer == subject;

    Ok(CertificateInfo {
        fingerprint: fingerprint_of(&der),
        issuer,
        subject,
        valid_from: tbs.validity.not_before.to_string(),
        valid_to: tbs.validity.not_after.to_string(),
        self_signed,
    })
}

/// Captures the certificate fingerprint of `url` and verifies it against the
/// pinned fingerprint recorded on first use.
///
/// * `pinned == None`: first use — returns the fingerprint so the caller can
///   record it (the TOFU trust step).
/// * `pinned == Some(...)` and it matches the captured fingerprint: `Ok`.
/// * `pinned == Some(...)` and it does not match: returns
///   [`Error::CertificateError`] unless `accept_untrusted` is set, in which
///   case the mismatch is ignored (escape hatch).
///
/// The returned value is the captured fingerprint.
pub async fn verify_server_certificate(
    url: &str,
    pinned: Option<&str>,
    accept_untrusted: bool,
) -> crate::Result<String> {
    let fingerprint = capture_fingerprint(url).await?;
    if let Some(pinned) = pinned {
        if !verify_pin(&fingerprint, pinned) && !accept_untrusted {
            return Err(Error::CertificateError(format!(
                "Certificate fingerprint changed. Expected '{}' but got '{}'. \
                 This could be a man-in-the-middle attack.",
                pinned, fingerprint
            )));
        }
    }
    Ok(fingerprint)
}
