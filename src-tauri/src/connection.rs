use crate::error::Error;
use crate::proxmox::{
    AddDiskConfig, AddNICConfig, Backup, BackupJob, BackupJobConfig, ClusterNode, ClusterStatus,
    CreateSnapshotConfig, Disk, EditNICConfig, NetworkInterface, Node, RestoreConfig, Snapshot,
    Storage, StorageContent, StorageDetail, Task, UpdateVMConfig, VM,
};
use crate::{
    CertificateInfo, ConnectResult, ConnectionConfig, ConnectionStatusInfo, DiscoveredNode,
    EndpointConfig, LoginResult, TermProxyResponse, VNCProxyResponse,
};
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::Mutex;
use std::time::Duration;
use url::Url;

/// Characters left unencoded when percent-encoding a volume id into a URL
/// path. This mirrors Proxmox's own `uri_encode` behavior: everything except
/// the RFC 3986 unreserved characters (`A-Za-z0-9-._~`) is encoded, so the
/// `:` and `/` in a volid like `local:backup/vzdump-qemu-100-...` become
/// `%3A` and `%2F`.
const VOLID_ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

/// Characters left unencoded when percent-encoding a single URL path segment
/// (node names, snapshot names). Same set as [`VOLID_ENCODE_SET`] but without
/// the `:` that separates a storage prefix from a volid.
const SEGMENT_ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

/// Builds the HTTP client used for every connection. TLS verification is
/// intentionally off at the transport layer (self-signed Proxmox servers are
/// the norm); trust is enforced by the application-level TOFU pinning in
/// `tls.rs`. Connect and total timeouts keep a dead server from hanging the
/// UI forever.
fn build_client() -> crate::Result<Client> {
    Client::builder()
        .danger_accept_invalid_certs(true)
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(Error::HttpError)
}

/// The result of loading persisted connections from disk.
#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadResult {
    pub active_connection_id: Option<String>,
    pub connections: Vec<ConnectionConfig>,
}

/// The on-disk shape of [`crate::ConnectionConfig`]s. Tokens are stripped
/// before writing, so the file never contains secrets.
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PersistedState {
    active_connection_id: Option<String>,
    connections: Vec<ConnectionConfig>,
}

/// The authentication mode used by a [`Connection`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthMode {
    Token,
    Password,
}

/// Authentication material for a Proxmox API request.
///
/// Token mode uses `token` as a `PVEAPIToken` header; password mode uses
/// `ticket` as a `PVEAuthCookie` (plus `csrf_token` for non-GET requests).
#[derive(Debug, Clone)]
pub struct AuthContext {
    pub mode: AuthMode,
    pub token: Option<String>,
    pub ticket: Option<String>,
    pub csrf_token: Option<String>,
}

/// Builds the full Proxmox API URL for a request.
///
/// `path` must start with `/` (e.g. `/nodes`); the request targets
/// `{base_url}/api2/json{path}`. A trailing slash on `base_url` is stripped.
fn build_api_url(base_url: &str, path: &str) -> crate::Result<Url> {
    let base = base_url.trim_end_matches('/');
    let full = format!("{}/api2/json{}", base, path);
    Url::parse(&full)
        .map_err(|e| Error::InvalidUrl(format!("Invalid Proxmox API URL '{}': {}", full, e)))
}

/// Deserializes an API response payload into `T`, mapping a parse failure to a
/// [`crate::Error::SerializationError`] that names the endpoint so the
/// mismatch is easy to diagnose.
fn parse_api<T>(endpoint: &str, data: serde_json::Value) -> crate::Result<T>
where
    T: serde::de::DeserializeOwned,
{
    serde_json::from_value(data).map_err(|e| {
        Error::SerializationError(format!(
            "Failed to parse {} response from Proxmox: {}",
            endpoint, e
        ))
    })
}

/// Derives a cluster node's endpoint URL from the connection's primary URL.
///
/// The scheme and port of the primary URL are preserved (an explicit port is
/// kept verbatim; a missing one defaults to `8006`, pveproxy's port for both
/// `http` and `https`). The host is replaced with the node's cluster IP when
/// one is known, falling back to the node name. An unparseable primary URL
/// falls back to a best-effort `https://{host}:8006`.
pub fn derive_node_url(primary_url: &str, node_ip: Option<&str>, node_name: &str) -> String {
    let host = node_ip.filter(|ip| !ip.is_empty()).unwrap_or(node_name);
    match Url::parse(primary_url) {
        Ok(url) => {
            // pveproxy listens on 8006 for both http and https, but a scheme
            // default applies when no explicit port is given (`http` → 80).
            let default_port = if url.scheme() == "http" { 80 } else { 8006 };
            format!("{}://{}:{}", url.scheme(), host, url.port().unwrap_or(default_port))
        }
        Err(_) => format!("https://{}:8006", host),
    }
}

/// Sends an authenticated request to the Proxmox VE JSON API.
///
/// On success the `data` field of the standard `{ "data": ... }` response
/// envelope is returned. If the response body is not JSON or has no `data`
/// key, the raw value is returned instead of failing. On a non-success status
/// the error message reported by the server is surfaced as
/// [`Error::ApiError`].
pub async fn api_request(
    client: &Client,
    base_url: &str,
    method: Method,
    path: &str,
    auth: &AuthContext,
    query: &[(&str, String)],
    form: Option<&[(&str, String)]>,
) -> crate::Result<serde_json::Value> {
    let needs_csrf = method != Method::GET;

    let mut url = build_api_url(base_url, path)?;
    {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in query {
            pairs.append_pair(key, value);
        }
    }

    let mut request = client.request(method, url);
    match auth.mode {
        AuthMode::Token => {
            let token = auth
                .token
                .as_deref()
                .ok_or_else(|| Error::InvalidCredentials("No API token configured".to_string()))?;
            request = request.header("Authorization", format!("PVEAPIToken={}", token));
        }
        AuthMode::Password => {
            let ticket = auth
                .ticket
                .as_deref()
                .ok_or_else(|| Error::AuthError("Not logged in: no session ticket".to_string()))?;
            request = request.header("Cookie", format!("PVEAuthCookie={}", ticket));
            if needs_csrf {
                let csrf = auth
                    .csrf_token
                    .as_deref()
                    .ok_or_else(|| Error::AuthError("Not logged in: no CSRF token".to_string()))?;
                request = request.header("CSRFPreventionToken", csrf);
            }
        }
    }

    if let Some(fields) = form {
        request = request.form(fields);
    }

    let response = request.send().await.map_err(|e| {
        if e.is_connect() || e.is_timeout() || e.is_request() {
            // Transport-level failures (connection refused, timeouts, DNS
            // resolution and other pre-response send errors) are surfaced as
            // `ConnectionFailed` so the caller can distinguish them from real
            // authentication failures and fail over to another endpoint.
            Error::ConnectionFailed(format!("Cannot connect to server: {}", e))
        } else {
            Error::HttpError(e)
        }
    })?;

    let status = response.status();
    let text = response.text().await.map_err(Error::HttpError)?;
    let body: serde_json::Value = serde_json::from_str(&text).unwrap_or_else(|_| {
        if text.is_empty() {
            serde_json::Value::Null
        } else {
            serde_json::Value::String(text)
        }
    });

    if !status.is_success() {
        let message = error_message_from_body(&body, status.as_u16());
        return Err(Error::ApiError(message));
    }

    Ok(body.get("data").cloned().unwrap_or(body))
}

/// Builds the error message surfaced for a non-success API response.
///
/// The `errors` field is preferred over the generic `message` (Proxmox
/// parameter-verification failures send a body like
/// `{"errors":{"limit":"property is not defined in schema"},
/// "message":"Parameter verification failed."}`, and the specific `errors`
/// entry is what tells the user what went wrong). The precedence is:
/// 1. `errors` as a string
/// 2. `errors` as an object — the first `key: value` pair, formatted as
///    `key: value` (string values verbatim, other values as JSON)
/// 3. `message` as a string
/// 4. `data` as a string
/// 5. the raw body when it is itself a string
/// 6. a generic `Proxmox API error (HTTP {status})` fallback
fn error_message_from_body(body: &serde_json::Value, status: u16) -> String {
    if let Some(errors) = body.get("errors") {
        if let Some(text) = errors.as_str() {
            if !text.is_empty() {
                return text.to_string();
            }
        }
        if let Some(obj) = errors.as_object() {
            if let Some((key, value)) = obj.iter().next() {
                let value_text = value
                    .as_str()
                    .map(str::to_string)
                    .unwrap_or_else(|| value.to_string());
                return format!("{}: {}", key, value_text);
            }
        }
    }
    if let Some(message) = body.get("message").and_then(|m| m.as_str()) {
        if !message.is_empty() {
            return message.to_string();
        }
    }
    if let Some(data) = body.get("data").and_then(|d| d.as_str()) {
        if !data.is_empty() {
            return data.to_string();
        }
    }
    if let Some(text) = body.as_str() {
        if !text.is_empty() {
            return text.to_string();
        }
    }
    format!("Proxmox API error (HTTP {})", status)
}

struct Connection {
    config: ConnectionConfig,
    client: Client,
    ticket: Mutex<Option<String>>,
    csrf_token: Mutex<Option<String>>,
    current_endpoint_index: Mutex<usize>,
    runtime_status: Mutex<String>,
}

impl Connection {
    /// Stores the session (ticket + CSRF token) in memory for password-mode
    /// authentication.
    fn set_session(&self, ticket: String, csrf_token: String) {
        if let Ok(mut guard) = self.ticket.lock() {
            *guard = Some(ticket);
        }
        if let Ok(mut guard) = self.csrf_token.lock() {
            *guard = Some(csrf_token);
        }
    }

    /// Resolves the authentication context for this connection.
    ///
    /// Token mode reads the token from the connection config, falling back to
    /// the keyring. Password mode uses the in-memory session, loading the
    /// ticket/CSRF token from the keyring and caching them if absent.
    fn auth_context(&self) -> crate::Result<AuthContext> {
        if self.config.auth_mode == "token" {
            let token = match self.config.primary.token.as_deref() {
                Some(token) if !token.is_empty() => Some(token.to_string()),
                _ => self.keyring_secret("token")?,
            };
            Ok(AuthContext {
                mode: AuthMode::Token,
                token,
                ticket: None,
                csrf_token: None,
            })
        } else {
            let ticket = self
                .session_secret("ticket", &self.ticket)?
                .ok_or_else(|| Error::AuthError("Not logged in: no session ticket".to_string()))?;
            let csrf_token = self.session_secret("csrf_token", &self.csrf_token)?;
            Ok(AuthContext {
                mode: AuthMode::Password,
                token: None,
                ticket: Some(ticket),
                csrf_token,
            })
        }
    }

    /// Reads a stored secret for this connection from the keyring, treating
    /// missing entries as `None`.
    fn keyring_secret(&self, field: &str) -> crate::Result<Option<String>> {
        match keyring_entry(&self.config.id, field) {
            Ok(entry) => match entry.get_password() {
                Ok(value) => Ok(Some(value)),
                Err(keyring::Error::NoEntry) => Ok(None),
                Err(e) => Err(Error::KeyringError(e.to_string())),
            },
            Err(_) => Ok(None),
        }
    }

    /// Returns a session value from memory, loading it from the keyring and
    /// caching it on the connection when missing.
    fn session_secret(
        &self,
        field: &str,
        cache: &Mutex<Option<String>>,
    ) -> crate::Result<Option<String>> {
        {
            let guard = cache.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(value) = guard.as_ref() {
                return Ok(Some(value.clone()));
            }
        }
        let value = self.keyring_secret(field)?;
        if let Some(value) = value.as_ref() {
            if let Ok(mut guard) = cache.lock() {
                *guard = Some(value.clone());
            }
        }
        Ok(value)
    }

    /// Returns the ordered, deduplicated candidate endpoint URLs for failover:
    /// the primary first, followed by each configured fallback. Empty URLs are
    /// dropped and duplicates are collapsed, preserving order.
    fn endpoint_urls(&self) -> Vec<String> {
        let mut urls: Vec<String> = Vec::new();
        let primary = self.config.primary.url.clone();
        let fallbacks = self
            .config
            .fallbacks
            .iter()
            .map(|endpoint| endpoint.url.clone());
        for url in std::iter::once(primary).chain(fallbacks) {
            if url.is_empty() || urls.contains(&url) {
                continue;
            }
            urls.push(url);
        }
        urls
    }

    /// Remembers the endpoint that last served a request, so the next request
    /// resumes rotation there instead of re-testing a down primary.
    fn set_endpoint_index(&self, idx: usize) {
        if let Ok(mut guard) = self.current_endpoint_index.lock() {
            *guard = idx;
        }
    }

    /// Records the runtime status of the last request: `"connected"`,
    /// `"failover"`, or `"failed"`.
    fn set_runtime_status(&self, status: &str) {
        if let Ok(mut guard) = self.runtime_status.lock() {
            *guard = status.to_string();
        }
    }

    /// Returns the runtime status of this connection.
    fn runtime_status(&self) -> String {
        self.runtime_status
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .clone()
    }

    /// Sends an authenticated request to this connection, rotating across the
    /// configured endpoints on transport-level failures.
    ///
    /// The rotation resumes at the endpoint that last served a request, so a
    /// down primary is not re-tested on every call. Transport failures
    /// (connection refused, timeouts, DNS resolution) trigger failover to the
    /// next candidate; authentication and API errors are returned immediately
    /// without rotating.
    async fn request(
        &self,
        method: Method,
        path: &str,
        query: &[(&str, String)],
        form: Option<&[(&str, String)]>,
    ) -> crate::Result<serde_json::Value> {
        let auth = self.auth_context()?;
        let candidates = self.endpoint_urls();
        let start = *self
            .current_endpoint_index
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        let mut last_transport_err = None;
        for offset in 0..candidates.len() {
            let idx = (start + offset) % candidates.len();
            let url = &candidates[idx];
            match api_request(&self.client, url, method.clone(), path, &auth, query, form).await {
                Ok(value) => {
                    self.set_endpoint_index(idx);
                    self.set_runtime_status(if idx == 0 { "connected" } else { "failover" });
                    return Ok(value);
                }
                Err(Error::ConnectionFailed(message)) => {
                    last_transport_err = Some(Error::ConnectionFailed(message));
                }
                Err(error) => return Err(error),
            }
        }
        self.set_runtime_status("failed");
        Err(last_transport_err
            .unwrap_or_else(|| Error::ConnectionFailed("no endpoints available".to_string())))
    }
}

fn keyring_service() -> &'static str {
    "clustri"
}

fn keyring_entry(connection_id: &str, field: &str) -> crate::Result<keyring::Entry> {
    let key = format!("{}:{}", connection_id, field);
    keyring::Entry::new(keyring_service(), &key).map_err(|e| Error::KeyringError(e.to_string()))
}

pub struct ConnectionManager {
    connections: HashMap<String, Connection>,
    active_connection_id: Option<String>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
            active_connection_id: None,
        }
    }

    /// Builds the HTTP client and session state for a connection.
    fn build_connection(config: ConnectionConfig) -> crate::Result<Connection> {
        Ok(Connection {
            config,
            client: build_client()?,
            ticket: Mutex::new(None),
            csrf_token: Mutex::new(None),
            current_endpoint_index: Mutex::new(0),
            runtime_status: Mutex::new("connected".to_string()),
        })
    }

    pub async fn add_connection(
        &mut self,
        config: ConnectionConfig,
        path: &Path,
    ) -> crate::Result<()> {
        if config.primary.url.is_empty() {
            return Err(Error::InvalidUrl("URL cannot be empty".to_string()));
        }
        let id = config.id.clone();
        self.connections.insert(id, Self::build_connection(config)?);
        self.persist(path)
    }

    /// Updates an existing connection and persists it. The id must reference
    /// an existing connection; the URL is immutable (changing servers is a
    /// remove + re-add) so the client is rebuilt from the incoming config
    /// verbatim.
    ///
    /// Certificate pinning and trust settings are preserved from the existing
    /// connection when the incoming config omits them (`cert_fingerprint` is
    /// optional; `trusted` and `accept_untrusted` default to `false` when
    /// absent, so a missing value keeps the previous one).
    pub async fn update_connection(
        &mut self,
        config: ConnectionConfig,
        path: &Path,
    ) -> crate::Result<()> {
        if config.primary.url.is_empty() {
            return Err(Error::InvalidUrl("URL cannot be empty".to_string()));
        }
        let id = config.id.clone();
        if !self.connections.contains_key(&id) {
            return Err(Error::ConnectionNotFound(id));
        }

        let mut updated = config;
        let existing = &self
            .connections
            .get(&id)
            .expect("existence was checked above")
            .config;
        if updated.cert_fingerprint.is_none() {
            updated.cert_fingerprint = existing.cert_fingerprint.clone();
        }
        if !updated.trusted {
            updated.trusted = existing.trusted;
        }
        if !updated.accept_untrusted {
            updated.accept_untrusted = existing.accept_untrusted;
        }

        self.connections
            .insert(id, Self::build_connection(updated)?);
        self.persist(path)
    }

    pub async fn remove_connection(&mut self, id: &str, path: &Path) -> crate::Result<()> {
        self.connections.remove(id);
        // Clear stored credentials from keyring
        let _ = keyring_entry(id, "ticket").and_then(|e| {
            e.delete_credential()
                .map_err(|e| Error::KeyringError(e.to_string()))
        });
        let _ = keyring_entry(id, "csrf_token").and_then(|e| {
            e.delete_credential()
                .map_err(|e| Error::KeyringError(e.to_string()))
        });
        let _ = keyring_entry(id, "password").and_then(|e| {
            e.delete_credential()
                .map_err(|e| Error::KeyringError(e.to_string()))
        });
        let _ = keyring_entry(id, "token").and_then(|e| {
            e.delete_credential()
                .map_err(|e| Error::KeyringError(e.to_string()))
        });
        if self.active_connection_id.as_deref() == Some(id) {
            self.active_connection_id = None;
        }
        self.persist(path)
    }

    /// Sets the active connection and persists it. The id must reference an
    /// existing connection.
    pub async fn set_active_connection(&mut self, id: String, path: &Path) -> crate::Result<()> {
        if !self.connections.contains_key(&id) {
            return Err(Error::ConnectionNotFound(id));
        }
        self.active_connection_id = Some(id);
        self.persist(path)
    }

    /// Loads persisted connection configs from `path` and rebuilds in-memory
    /// connections from them. Every loaded connection starts as disconnected.
    ///
    /// A missing file (first launch) yields an empty result without an error.
    pub async fn load_connections(&mut self, path: &Path) -> crate::Result<LoadResult> {
        if !path.exists() {
            return Ok(LoadResult {
                active_connection_id: None,
                connections: Vec::new(),
            });
        }

        let content = std::fs::read_to_string(path).map_err(|e| {
            Error::SerializationError(format!(
                "Failed to read connections file '{}': {}",
                path.display(),
                e
            ))
        })?;
        let state: PersistedState = serde_json::from_str(&content).map_err(|e| {
            Error::SerializationError(format!(
                "Failed to parse connections file '{}': {}",
                path.display(),
                e
            ))
        })?;

        self.active_connection_id = state.active_connection_id;
        self.connections.clear();
        for mut config in state.connections {
            // A persisted "connected" status would be a lie after a restart.
            config.status = "disconnected".to_string();
            let id = config.id.clone();
            self.connections.insert(id, Self::build_connection(config)?);
        }

        Ok(LoadResult {
            active_connection_id: self.active_connection_id.clone(),
            connections: self
                .connections
                .values()
                .map(|conn| conn.config.clone())
                .collect(),
        })
    }

    pub async fn connect(&mut self, id: &str, path: &Path) -> crate::Result<ConnectResult> {
        let (url, pinned, accept_untrusted, auth_mode) = {
            let conn = self
                .connections
                .get(id)
                .ok_or_else(|| Error::ConnectionNotFound(id.to_string()))?;
            (
                conn.config.primary.url.clone(),
                conn.config.cert_fingerprint.clone(),
                conn.config.accept_untrusted,
                conn.config.auth_mode.clone(),
            )
        };

        // Certificate verification (TOFU): compare the served certificate
        // against the pinned fingerprint. With no pin and no escape hatch the
        // connect fails and the frontend offers the trust flow. When the
        // escape hatch is set there is nothing to verify, so connect proceeds.
        // A certificate failure short-circuits before any discovery or merge.
        match pinned.as_deref() {
            Some(pin) => {
                crate::tls::verify_server_certificate(&url, Some(pin), accept_untrusted).await?;
            }
            None if !accept_untrusted => {
                return Err(Error::CertificateError(
                    "Certificate has not been trusted yet. Trust it from the connection dialog."
                        .to_string(),
                ));
            }
            None => {}
        }

        // Authenticate, reset the failover state, and discover the cluster
        // nodes. When no endpoint is reachable this surfaces a transport error
        // that is reported as a `"failed"` `ConnectResult` instead of an
        // error, so the frontend can still track the connection. Other
        // failures (bad credentials, API errors) propagate unchanged.
        if let Err(error) = self.authenticate_and_discover(id, &url, &auth_mode).await {
            return self.failed_or_propagate(id, path, error);
        }

        // Same-cluster merge: when this connection belongs to the same cluster
        // as an existing one, fold its endpoint and node list into the
        // existing connection and drop it.
        let cluster_id = {
            let conn = self
                .connections
                .get(id)
                .expect("connection existence was checked above");
            conn.config.cluster_id.clone()
        };

        if let Some(cid) = cluster_id.filter(|cid| !cid.is_empty()) {
            let other_id = self
                .connections
                .iter()
                .find(|(other_id, conn)| {
                    other_id.as_str() != id
                        && conn.config.cluster_id.as_deref() == Some(cid.as_str())
                })
                .map(|(other_id, _)| other_id.clone());

            if let Some(other_id) = other_id {
                let (this_primary_url, this_primary_node, this_nodes) = {
                    let conn = self
                        .connections
                        .get(id)
                        .expect("connection existence was checked above");
                    (
                        conn.config.primary.url.clone(),
                        conn.config.primary.node.clone(),
                        conn.config.nodes.clone(),
                    )
                };

                {
                    let other = self
                        .connections
                        .get_mut(&other_id)
                        .expect("merge target was located above");
                    // This connection's primary endpoint becomes a fallback on
                    // the surviving connection, deduplicated case-insensitively.
                    let url_known = other
                        .config
                        .fallbacks
                        .iter()
                        .any(|endpoint| endpoint.url.eq_ignore_ascii_case(&this_primary_url));
                    if !url_known {
                        other.config.fallbacks.push(EndpointConfig {
                            url: this_primary_url.clone(),
                            node: this_primary_node.clone(),
                            token: None,
                        });
                    }
                    // Adopt the merging connection's primary node only when the
                    // surviving connection has none yet.
                    if other
                        .config
                        .primary
                        .node
                        .as_deref()
                        .map_or(true, str::is_empty)
                    {
                        other.config.primary.node = this_primary_node;
                    }
                    // Merge the node lists (dedup by URL), then re-derive each
                    // node's primary marker against the surviving connection's
                    // primary URL.
                    let other_primary_url = other.config.primary.url.clone();
                    for node in this_nodes {
                        if !other
                            .config
                            .nodes
                            .iter()
                            .any(|existing| existing.url.eq_ignore_ascii_case(&node.url))
                        {
                            other.config.nodes.push(node);
                        }
                    }
                    for node in &mut other.config.nodes {
                        node.is_primary = node.url.eq_ignore_ascii_case(&other_primary_url);
                    }
                    if other
                        .config
                        .primary
                        .node
                        .as_deref()
                        .map_or(true, str::is_empty)
                    {
                        if let Some(primary) =
                            other.config.nodes.iter().find(|node| node.is_primary)
                        {
                            other.config.primary.node = Some(primary.name.clone());
                        }
                    }
                }

                self.connections.remove(id);
                if self.active_connection_id.as_deref() == Some(id) {
                    self.active_connection_id = Some(other_id.clone());
                }
                self.persist(path)?;
                return Ok(ConnectResult {
                    connection_id: other_id.clone(),
                    merged_into: Some(other_id),
                    status: "connected".to_string(),
                });
            }
        }

        let conn = self
            .connections
            .get_mut(id)
            .expect("connection existence was checked above");
        conn.config.status = "connected".to_string();
        self.persist(path)?;
        Ok(ConnectResult {
            connection_id: id.to_string(),
            merged_into: None,
            status: "connected".to_string(),
        })
    }

    /// Authenticates a connection against the server (token mode validates the
    /// token against `/version`; password mode refreshes a fresh session from
    /// the stored credentials), resets the failover state so a reconnect starts
    /// on the primary endpoint, and discovers the cluster's nodes. A
    /// transport-level failure here means no endpoint was reachable.
    async fn authenticate_and_discover(
        &mut self,
        id: &str,
        url: &str,
        auth_mode: &str,
    ) -> crate::Result<()> {
        match auth_mode {
            "token" => {
                let conn = self.connection(id)?;
                conn.request(Method::GET, "/version", &[], None).await?;
            }
            _ => {
                let login = self.refresh_ticket(id, url).await?;
                let conn = self.connection(id)?;
                conn.set_session(login.ticket, login.csrf_token);
            }
        }
        let conn = self.connection(id)?;
        conn.set_endpoint_index(0);
        conn.set_runtime_status("connected");
        self.discover_nodes(id).await?;
        Ok(())
    }

    /// Maps a post-certificate connect failure into the connect outcome.
    /// Transport-level failures (no endpoint reachable) report the connection
    /// as `"failed"` so it stays tracked; every other error propagates
    /// unchanged.
    fn failed_or_propagate(
        &mut self,
        id: &str,
        path: &Path,
        error: Error,
    ) -> crate::Result<ConnectResult> {
        match error {
            Error::ConnectionFailed(_) => {
                if let Some(conn) = self.connections.get_mut(id) {
                    conn.config.status = "failed".to_string();
                    conn.set_endpoint_index(0);
                    conn.set_runtime_status("failed");
                }
                self.persist(path)?;
                Ok(ConnectResult {
                    connection_id: id.to_string(),
                    merged_into: None,
                    status: "failed".to_string(),
                })
            }
            other => Err(other),
        }
    }

    pub async fn disconnect(&mut self, id: &str) -> crate::Result<()> {
        if let Some(conn) = self.connections.get_mut(id) {
            if let Ok(mut guard) = conn.ticket.lock() {
                *guard = None;
            }
            if let Ok(mut guard) = conn.csrf_token.lock() {
                *guard = None;
            }
            conn.config.status = "disconnected".to_string();
            conn.set_endpoint_index(0);
            conn.set_runtime_status("disconnected");
        }
        Ok(())
    }

    /// Returns a snapshot of a connection's runtime state for the status bar:
    /// the effective status, the primary and currently-serving endpoints, and
    /// the last discovered node list.
    ///
    /// A disconnected connection reports `"disconnected"` without touching the
    /// network. Otherwise the node list is refreshed best-effort: a transport
    /// failure (all endpoints unreachable) keeps the stored nodes and reports
    /// `"failed"`; any other failure keeps the stored nodes and the current
    /// runtime status. This never persists, so polling it does not write the
    /// config file.
    pub async fn status_info(
        &mut self,
        connection_id: &str,
    ) -> crate::Result<ConnectionStatusInfo> {
        if self.connection(connection_id)?.config.status == "disconnected" {
            let (primary_url, current_endpoint_url, nodes) = self.status_snapshot(connection_id)?;
            return Ok(ConnectionStatusInfo {
                connection_id: connection_id.to_string(),
                status: "disconnected".to_string(),
                primary_url,
                current_endpoint_url,
                nodes,
            });
        }

        let transport_failed = match self.discover_nodes(connection_id).await {
            Ok(_) => false,
            Err(Error::ConnectionFailed(_)) => true,
            Err(_) => false,
        };

        let (primary_url, current_endpoint_url, nodes) = self.status_snapshot(connection_id)?;
        let runtime_status = self.runtime_status(connection_id)?;
        Ok(ConnectionStatusInfo {
            connection_id: connection_id.to_string(),
            status: if transport_failed {
                "failed".to_string()
            } else {
                runtime_status
            },
            primary_url,
            current_endpoint_url,
            nodes,
        })
    }

    /// Reads the currently-serving endpoint URLs and the stored node list
    /// without performing any network I/O. Falls back to the primary URL when
    /// the endpoint list is empty.
    fn status_snapshot(
        &self,
        connection_id: &str,
    ) -> crate::Result<(String, String, Vec<DiscoveredNode>)> {
        let conn = self.connection(connection_id)?;
        let urls = conn.endpoint_urls();
        let index = *conn
            .current_endpoint_index
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        Ok((
            conn.config.primary.url.clone(),
            urls.get(index)
                .cloned()
                .unwrap_or_else(|| conn.config.primary.url.clone()),
            conn.config.nodes.clone(),
        ))
    }

    /// Serializes the current connections and active id to `path`.
    ///
    /// Secrets (API tokens, on both the primary and fallback endpoints) are
    /// stripped before writing so they never touch disk; after a restart the
    /// request layer falls back to the OS keyring.
    fn persist(&self, path: &Path) -> crate::Result<()> {
        let connections: Vec<ConnectionConfig> = self
            .connections
            .values()
            .map(|conn| {
                let mut config = conn.config.clone();
                config.primary.token = None;
                for endpoint in &mut config.fallbacks {
                    endpoint.token = None;
                }
                config
            })
            .collect();

        let state = PersistedState {
            active_connection_id: self.active_connection_id.clone(),
            connections,
        };
        let json = serde_json::to_string_pretty(&state).map_err(|e| {
            Error::SerializationError(format!("Failed to serialize connections: {}", e))
        })?;

        if let Some(parent) = path.parent() {
            if !parent.as_os_str().is_empty() {
                std::fs::create_dir_all(parent).map_err(|e| {
                    Error::SerializationError(format!(
                        "Failed to create directory '{}': {}",
                        parent.display(),
                        e
                    ))
                })?;
            }
        }

        std::fs::write(path, json).map_err(|e| {
            Error::SerializationError(format!(
                "Failed to write connections file '{}': {}",
                path.display(),
                e
            ))
        })?;
        Ok(())
    }

    pub async fn login_with_password(
        &self,
        url: &str,
        username: &str,
        password: &str,
    ) -> crate::Result<LoginResult> {
        if url.is_empty() {
            return Err(Error::InvalidUrl("URL cannot be empty".to_string()));
        }

        let client = build_client()?;

        let login_url = format!("{}/access/ticket", url);

        let params = [("username", username), ("password", password)];

        let response = client
            .post(&login_url)
            .form(&params)
            .send()
            .await
            .map_err(|e| {
                if e.is_connect() {
                    Error::AuthError(format!("Cannot connect to server: {}", e))
                } else {
                    Error::HttpError(e)
                }
            })?;

        let status = response.status();
        let body: serde_json::Value = response.json().await.map_err(Error::HttpError)?;

        if !status.is_success() {
            let error_msg = body["data"]
                .as_str()
                .or_else(|| body["errors"].as_str())
                .unwrap_or("Authentication failed");
            return Err(Error::InvalidCredentials(error_msg.to_string()));
        }

        let data = &body["data"];
        let ticket = data["ticket"]
            .as_str()
            .ok_or_else(|| Error::AuthError("No ticket in response".to_string()))?
            .to_string();
        let csrf_token = data["CSRFPreventionToken"]
            .as_str()
            .unwrap_or("")
            .to_string();

        // Generate a stable connection ID from the URL
        let connection_id = {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(url.as_bytes());
            let hash = hasher.finalize();
            format!("{:x}", hash)[..16].to_string()
        };

        // Store credentials in keyring for later use
        keyring_entry(&connection_id, "ticket").and_then(|e| {
            e.set_password(&ticket)
                .map_err(|e| Error::KeyringError(e.to_string()))
        })?;
        keyring_entry(&connection_id, "csrf_token").and_then(|e| {
            e.set_password(&csrf_token)
                .map_err(|e| Error::KeyringError(e.to_string()))
        })?;
        keyring_entry(&connection_id, "username").and_then(|e| {
            e.set_password(username)
                .map_err(|e| Error::KeyringError(e.to_string()))
        })?;
        keyring_entry(&connection_id, "password").and_then(|e| {
            e.set_password(password)
                .map_err(|e| Error::KeyringError(e.to_string()))
        })?;

        // Keep the in-memory session of an already-added connection in sync so
        // requests made right after login have auth available.
        if let Some(conn) = self.connections.get(&connection_id) {
            conn.set_session(ticket.clone(), csrf_token.clone());
        }

        Ok(LoginResult {
            connection_id,
            ticket,
            csrf_token,
        })
    }

    pub async fn login_with_token(&self, url: &str, token: &str) -> crate::Result<LoginResult> {
        if url.is_empty() {
            return Err(Error::InvalidUrl("URL cannot be empty".to_string()));
        }
        if token.is_empty() {
            return Err(Error::InvalidCredentials(
                "API token cannot be empty".to_string(),
            ));
        }

        let client = build_client()?;

        // Validate the token by making an authenticated request
        let test_url = format!("{}/cluster/status", url);
        let auth_header = format!("PVEAPIToken={}", token);

        let response = client
            .get(&test_url)
            .header("Authorization", &auth_header)
            .send()
            .await
            .map_err(|e| {
                if e.is_connect() {
                    Error::AuthError(format!("Cannot connect to server: {}", e))
                } else {
                    Error::HttpError(e)
                }
            })?;

        if !response.status().is_success() {
            return Err(Error::InvalidCredentials("Invalid API token".to_string()));
        }

        // Generate a stable connection ID from the URL
        let connection_id = {
            use sha2::{Digest, Sha256};
            let mut hasher = Sha256::new();
            hasher.update(url.as_bytes());
            let hash = hasher.finalize();
            format!("{:x}", hash)[..16].to_string()
        };

        // Store token in keyring for later use
        keyring_entry(&connection_id, "token").and_then(|e| {
            e.set_password(token)
                .map_err(|e| Error::KeyringError(e.to_string()))
        })?;

        Ok(LoginResult {
            connection_id,
            ticket: token.to_string(),
            csrf_token: String::new(),
        })
    }

    pub async fn logout(&self, connection_id: &str) -> crate::Result<()> {
        let _ = keyring_entry(connection_id, "ticket").and_then(|e| {
            e.delete_credential()
                .map_err(|e| Error::KeyringError(e.to_string()))
        });
        let _ = keyring_entry(connection_id, "csrf_token").and_then(|e| {
            e.delete_credential()
                .map_err(|e| Error::KeyringError(e.to_string()))
        });
        let _ = keyring_entry(connection_id, "password").and_then(|e| {
            e.delete_credential()
                .map_err(|e| Error::KeyringError(e.to_string()))
        });
        let _ = keyring_entry(connection_id, "token").and_then(|e| {
            e.delete_credential()
                .map_err(|e| Error::KeyringError(e.to_string()))
        });
        let _ = keyring_entry(connection_id, "username").and_then(|e| {
            e.delete_credential()
                .map_err(|e| Error::KeyringError(e.to_string()))
        });
        Ok(())
    }

    pub async fn get_stored_credentials(
        &self,
        connection_id: &str,
    ) -> crate::Result<Option<String>> {
        let entry = match keyring_entry(connection_id, "ticket") {
            Ok(e) => e,
            Err(_) => return Ok(None),
        };
        match entry.get_password() {
            Ok(ticket) => Ok(Some(ticket)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(e) => Err(Error::KeyringError(e.to_string())),
        }
    }

    pub async fn store_credentials(
        &self,
        connection_id: &str,
        ticket: &str,
        csrf_token: &str,
        password: Option<&str>,
        api_token: Option<&str>,
    ) -> crate::Result<()> {
        keyring_entry(connection_id, "ticket").and_then(|e| {
            e.set_password(ticket)
                .map_err(|e| Error::KeyringError(e.to_string()))
        })?;
        keyring_entry(connection_id, "csrf_token").and_then(|e| {
            e.set_password(csrf_token)
                .map_err(|e| Error::KeyringError(e.to_string()))
        })?;
        if let Some(pw) = password {
            keyring_entry(connection_id, "password").and_then(|e| {
                e.set_password(pw)
                    .map_err(|e| Error::KeyringError(e.to_string()))
            })?;
        }
        if let Some(tok) = api_token {
            keyring_entry(connection_id, "token").and_then(|e| {
                e.set_password(tok)
                    .map_err(|e| Error::KeyringError(e.to_string()))
            })?;
        }
        Ok(())
    }

    /// Injects a password-mode session (ticket + CSRF token) into an existing
    /// connection's in-memory state without touching the OS keyring. Used by
    /// integration tests that authenticate against a live server where no
    /// keyring secret-service is available; any later login or ticket refresh
    /// overwrites the values.
    pub async fn set_session_ticket(
        &self,
        connection_id: &str,
        ticket: &str,
        csrf_token: &str,
    ) -> crate::Result<()> {
        let conn = self.connection(connection_id)?;
        conn.set_session(ticket.to_string(), csrf_token.to_string());
        Ok(())
    }

    pub async fn refresh_ticket(
        &self,
        connection_id: &str,
        url: &str,
    ) -> crate::Result<LoginResult> {
        let password = Self::stored_credential(connection_id, "password")?;
        let username = Self::stored_credential(connection_id, "username")?;

        self.login_with_password(url, &username, &password).await
    }

    /// Reads a stored credential from the keyring, mapping missing entries to a
    /// clean [`Error::AuthError`] instead of leaking a keyring error.
    fn stored_credential(connection_id: &str, field: &str) -> crate::Result<String> {
        match keyring_entry(connection_id, field) {
            Ok(entry) => match entry.get_password() {
                Ok(value) => Ok(value),
                Err(keyring::Error::NoEntry) => Err(Error::AuthError(
                    "No stored credentials for re-authentication".to_string(),
                )),
                Err(e) => Err(Error::KeyringError(e.to_string())),
            },
            Err(_) => Err(Error::AuthError(
                "No stored credentials for re-authentication".to_string(),
            )),
        }
    }

    pub async fn get_certificate_info(&self, url: &str) -> crate::Result<CertificateInfo> {
        crate::tls::fetch_certificate_info(url).await
    }

    pub async fn trust_certificate(
        &mut self,
        id: &str,
        fingerprint: &str,
        path: &Path,
    ) -> crate::Result<()> {
        let connection = self
            .connections
            .get_mut(id)
            .ok_or_else(|| Error::ConnectionNotFound(id.to_string()))?;
        connection.config.cert_fingerprint = Some(fingerprint.to_string());
        connection.config.trusted = true;
        self.persist(path)
    }

    /// Looks up a connection by id, mapping a missing id to
    /// [`Error::ConnectionNotFound`].
    fn connection(&self, id: &str) -> crate::Result<&Connection> {
        self.connections
            .get(id)
            .ok_or_else(|| Error::ConnectionNotFound(id.to_string()))
    }

    /// Returns the runtime status of a connection: `"connected"` when the most
    /// recent request was served by the primary endpoint, `"failover"` when a
    /// fallback served it, or `"failed"` when no endpoint was reachable. This
    /// is independent of the persisted `config.status`.
    pub fn runtime_status(&self, connection_id: &str) -> crate::Result<String> {
        let conn = self.connection(connection_id)?;
        Ok(conn.runtime_status())
    }

    /// Returns a clone of a connection's config, including the last discovered
    /// node list and cluster identity.
    pub fn connection_config(&self, connection_id: &str) -> crate::Result<ConnectionConfig> {
        let conn = self.connection(connection_id)?;
        Ok(conn.config.clone())
    }

    /// Validates that `vm_type` is one of the Proxmox VM type path segments
    /// (`qemu` for VMs, `lxc` for containers).
    fn validate_vm_type(vm_type: &str) -> crate::Result<()> {
        match vm_type {
            "qemu" | "lxc" => Ok(()),
            other => Err(Error::InvalidUrl(format!(
                "Invalid VM type '{}': expected 'qemu' or 'lxc'",
                other
            ))),
        }
    }

    /// Returns the name of the first online node reported by `/nodes`. `purpose`
    /// names the operation in the error when the cluster has no online node.
    async fn first_online_node(&self, connection_id: &str, purpose: &str) -> crate::Result<String> {
        let nodes = self.get_nodes(connection_id).await?;
        nodes
            .iter()
            .find(|node| node.status == "online")
            .map(|node| node.node.clone())
            .ok_or_else(|| {
                Error::ApiError(format!(
                    "Cannot determine a node for {}: no online node available",
                    purpose
                ))
            })
    }

    /// Resolves the node for a node-scoped storage/backup endpoint: the node
    /// pinned on the connection's primary endpoint, falling back to the first
    /// online node in the cluster.
    async fn storage_node(&self, connection_id: &str) -> crate::Result<String> {
        let conn = self.connection(connection_id)?;
        match conn
            .config
            .primary
            .node
            .as_deref()
            .filter(|n| !n.is_empty())
        {
            Some(node) => Ok(node.to_string()),
            None => {
                self.first_online_node(connection_id, "storage operations")
                    .await
            }
        }
    }

    /// Sends a VM/container lifecycle action (`start`, `stop`, `shutdown`,
    /// `reboot`, `suspend`, `resume`) to the given guest.
    async fn vm_status_action(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        action: &str,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/status/{}", node, vm_type, vmid, action);
        conn.request(Method::POST, &path, &[], None).await?;
        Ok(())
    }

    pub async fn get_nodes(&self, connection_id: &str) -> crate::Result<Vec<Node>> {
        let conn = self.connection(connection_id)?;
        let data = conn.request(Method::GET, "/nodes", &[], None).await?;
        parse_api("/nodes", data)
    }

    pub async fn get_vms(&self, connection_id: &str) -> crate::Result<Vec<VM>> {
        let conn = self.connection(connection_id)?;
        let query = [("type", "vm".to_string())];
        let data = conn
            .request(Method::GET, "/cluster/resources", &query, None)
            .await?;
        parse_api("/cluster/resources?type=vm", data)
    }

    pub async fn get_storage(&self, connection_id: &str) -> crate::Result<Vec<Storage>> {
        let conn = self.connection(connection_id)?;
        let query = [("type", "storage".to_string())];
        let data = conn
            .request(Method::GET, "/cluster/resources", &query, None)
            .await?;
        // `/cluster/resources?type=storage` entries carry usage as `disk` /
        // `maxdisk` and an `available`/`unavailable` status string — not the
        // `used`/`total`/`avail`/`enabled`/`active` fields the struct models.
        // Each entry is mapped manually so the overview shows real numbers.
        let entries: Vec<serde_json::Value> =
            parse_api("/cluster/resources?type=storage", data)?;
        let mut storages = Vec::with_capacity(entries.len());
        for entry in entries {
            let disk = entry["disk"].as_u64().unwrap_or(0);
            let maxdisk = entry["maxdisk"].as_u64().unwrap_or(0);
            let status = entry["status"].as_str().unwrap_or("");
            let available = status == "available";
            storages.push(Storage {
                storage: entry["storage"].as_str().unwrap_or("").to_string(),
                r#type: entry["type"].as_str().unwrap_or("").to_string(),
                content: entry["content"].as_str().unwrap_or("").to_string(),
                active: u32::from(available),
                enabled: u32::from(available),
                shared: entry["shared"]
                    .as_u64()
                    .map(|v| v as u32)
                    .or_else(|| entry["shared"].as_bool().map(u32::from))
                    .unwrap_or(0),
                used: disk,
                total: maxdisk,
                avail: maxdisk.saturating_sub(disk),
                node: entry["node"].as_str().unwrap_or("").to_string(),
            });
        }
        Ok(storages)
    }

    pub async fn get_storage_content(
        &self,
        connection_id: &str,
        storage: &str,
        node: Option<&str>,
    ) -> crate::Result<Vec<StorageContent>> {
        let conn = self.connection(connection_id)?;
        // The content endpoint is node-scoped. Prefer an explicitly requested
        // node; otherwise use the node configured on the connection's primary
        // endpoint, falling back to the first online node from the cluster.
        let node = match node.filter(|n| !n.is_empty()) {
            Some(node) => node.to_string(),
            None => self.storage_node(connection_id).await?,
        };
        let path = format!("/nodes/{}/storage/{}/content", node, storage);
        let data = conn.request(Method::GET, &path, &[], None).await?;
        parse_api(&path, data)
    }

    pub async fn get_storage_detail(
        &self,
        connection_id: &str,
        node: &str,
        storage: &str,
    ) -> crate::Result<StorageDetail> {
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/storage/{}/status", node, storage);
        let data = conn.request(Method::GET, &path, &[], None).await?;
        parse_api(&path, data)
    }

    pub async fn get_tasks(&self, connection_id: &str) -> crate::Result<Vec<Task>> {
        let conn = self.connection(connection_id)?;
        // The server rejects `/cluster/tasks?limit=...` with HTTP 400 (`limit`
        // is not in the endpoint schema); the default server-side limit of 50
        // applies when no query is sent.
        let data = conn
            .request(Method::GET, "/cluster/tasks", &[], None)
            .await?;
        parse_api("/cluster/tasks", data)
    }

    pub async fn get_cluster_status(&self, connection_id: &str) -> crate::Result<ClusterStatus> {
        let conn = self.connection(connection_id)?;
        let data = conn
            .request(Method::GET, "/cluster/status", &[], None)
            .await?;
        let entries = match data {
            serde_json::Value::Array(entries) => entries,
            _ => {
                return Err(Error::SerializationError(
                    "Failed to parse /cluster/status response: expected an array".to_string(),
                ))
            }
        };

        // The response mixes one `cluster` entry with several `node` entries.
        let mut nodes = Vec::new();
        let mut found_cluster = false;
        let mut cluster_name = None;
        let mut cluster_id = None;
        for entry in &entries {
            match entry["type"].as_str() {
                Some("cluster") => {
                    found_cluster = true;
                    cluster_name = entry["name"].as_str().map(str::to_string);
                    cluster_id = entry["id"].as_str().map(str::to_string);
                }
                Some("node") => {
                    let name = entry["node"]
                        .as_str()
                        .map(str::to_string)
                        .or_else(|| {
                            entry["id"]
                                .as_str()
                                .and_then(|id| id.strip_prefix("node/"))
                                .map(str::to_string)
                        })
                        .unwrap_or_default();
                    nodes.push(ClusterNode {
                        name,
                        nodeid: entry["nodeid"].as_u64().unwrap_or(0) as u32,
                        online: entry["online"]
                            .as_u64()
                            .map(|v| v as u32)
                            .or_else(|| entry["online"].as_bool().map(u32::from))
                            .unwrap_or(0),
                        local: entry["local"]
                            .as_u64()
                            .map(|v| v as u32)
                            .or_else(|| entry["local"].as_bool().map(u32::from)),
                        ip: entry["ip"].as_str().map(str::to_string),
                    });
                }
                _ => {}
            }
        }

        if !found_cluster {
            cluster_name = Some("default".to_string());
            cluster_id = Some(String::new());
        }

        Ok(ClusterStatus {
            r#type: "cluster".to_string(),
            name: cluster_name.unwrap_or_default(),
            id: cluster_id.unwrap_or_default(),
            nodes: Some(nodes),
        })
    }

    /// Discovers the cluster nodes reachable through this connection and
    /// stores them on the connection config.
    ///
    /// The node list and their online/offline status come from `/nodes`; the
    /// cluster membership map (IP addresses and the local flag) comes from
    /// `/cluster/status`. Each discovered node's URL is derived from the
    /// primary endpoint URL with the node's cluster IP (or name) substituted
    /// into the host position. The node matching the primary endpoint — by
    /// derived URL or by the configured `primary.node` name — is marked as
    /// primary and sorted first.
    ///
    /// The discovered list, cluster name and cluster id are stored on the
    /// config (persisted on the next `persist`). When `primary.node` is unset
    /// it is filled in from the primary (or first online) node so node-scoped
    /// endpoints have a node to target.
    pub async fn discover_nodes(
        &mut self,
        connection_id: &str,
    ) -> crate::Result<Vec<DiscoveredNode>> {
        let (primary_url, configured_node) = {
            let conn = self
                .connections
                .get(connection_id)
                .ok_or_else(|| Error::ConnectionNotFound(connection_id.to_string()))?;
            (
                conn.config.primary.url.clone(),
                conn.config.primary.node.clone(),
            )
        };

        let nodes = self.get_nodes(connection_id).await?;
        let cluster = self.get_cluster_status(connection_id).await?;

        // name -> (ip, local) from the cluster status node entries.
        let mut cluster_nodes: HashMap<String, (Option<String>, bool)> = HashMap::new();
        if let Some(entries) = &cluster.nodes {
            for entry in entries {
                cluster_nodes.insert(
                    entry.name.clone(),
                    (entry.ip.clone(), entry.local.unwrap_or(0) != 0),
                );
            }
        }

        let mut discovered: Vec<DiscoveredNode> = nodes
            .iter()
            .map(|node| {
                let (ip, local) = cluster_nodes
                    .get(&node.node)
                    .cloned()
                    .unwrap_or_else(|| (None, false));
                let url = derive_node_url(&primary_url, ip.as_deref(), &node.node);
                let is_primary = url.eq_ignore_ascii_case(&primary_url)
                    || configured_node.as_deref() == Some(node.node.as_str());
                DiscoveredNode {
                    name: node.node.clone(),
                    url,
                    status: node.status.clone(),
                    is_primary,
                    local,
                }
            })
            .collect();

        // The primary node first, then the rest alphabetically.
        discovered.sort_by(|a, b| {
            b.is_primary
                .cmp(&a.is_primary)
                .then_with(|| a.name.cmp(&b.name))
        });

        let conn = self
            .connections
            .get_mut(connection_id)
            .expect("connection existence was checked above");
        conn.config.nodes = discovered.clone();

        // Only a real cluster entry (non-empty id) sets the cluster identity;
        // a standalone server leaves the config's cluster fields untouched.
        if !cluster.id.is_empty() {
            if conn.config.cluster_name.is_none() && !cluster.name.is_empty() {
                conn.config.cluster_name = Some(cluster.name.clone());
            }
            conn.config.cluster_id = Some(cluster.id.clone());
        }

        if conn
            .config
            .primary
            .node
            .as_deref()
            .map_or(true, str::is_empty)
        {
            if let Some(primary) = discovered
                .iter()
                .find(|node| node.is_primary)
                .or_else(|| discovered.iter().find(|node| node.status == "online"))
            {
                conn.config.primary.node = Some(primary.name.clone());
            }
        }

        Ok(discovered)
    }

    pub async fn start_vm(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
    ) -> crate::Result<()> {
        self.vm_status_action(connection_id, node, vmid, vm_type, "start")
            .await
    }

    pub async fn stop_vm(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
    ) -> crate::Result<()> {
        self.vm_status_action(connection_id, node, vmid, vm_type, "stop")
            .await
    }

    pub async fn shutdown_vm(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
    ) -> crate::Result<()> {
        self.vm_status_action(connection_id, node, vmid, vm_type, "shutdown")
            .await
    }

    pub async fn reboot_vm(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
    ) -> crate::Result<()> {
        self.vm_status_action(connection_id, node, vmid, vm_type, "reboot")
            .await
    }

    pub async fn suspend_vm(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
    ) -> crate::Result<()> {
        self.vm_status_action(connection_id, node, vmid, vm_type, "suspend")
            .await
    }

    pub async fn resume_vm(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
    ) -> crate::Result<()> {
        self.vm_status_action(connection_id, node, vmid, vm_type, "resume")
            .await
    }

    pub async fn get_disks(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
    ) -> crate::Result<Vec<Disk>> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/config", node, vm_type, vmid);
        let data = conn.request(Method::GET, &path, &[], None).await?;
        let obj = data.as_object().ok_or_else(|| {
            Error::SerializationError(format!(
                "Failed to parse {} response from Proxmox: expected an object",
                path
            ))
        })?;
        let mut disks = Vec::new();
        for (key, value) in obj {
            if !is_disk_key(key) {
                continue;
            }
            let (storage, size, format) = parse_disk_attrs(value.as_str().unwrap_or_default());
            disks.push(Disk {
                device: key.clone(),
                size,
                storage,
                format,
                // There is no reliable API source for per-disk usage, so it
                // stays None.
                usage: None,
            });
        }
        Ok(disks)
    }

    pub async fn add_disk(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        config: AddDiskConfig,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        const VALID_BUSES: [&str; 4] = ["scsi", "virtio", "ide", "sata"];
        if !VALID_BUSES.contains(&config.bus_type.as_str()) {
            return Err(Error::InvalidUrl(format!(
                "Invalid bus type '{}': expected one of scsi, virtio, ide, sata",
                config.bus_type
            )));
        }
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/config", node, vm_type, vmid);
        // The current config determines the first free slot on the target bus.
        let data = conn.request(Method::GET, &path, &[], None).await?;
        let index = first_free_bus_index(&data, &config.bus_type);
        let key = format!("{}{}", config.bus_type, index);
        let value = format!("{}:{}", config.storage, human_size(config.size));
        let form = vec![(key.as_str(), value)];
        conn.request(Method::POST, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn resize_disk(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        disk: &str,
        size: u64,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/resize", node, vm_type, vmid);
        let form = [("disk", disk.to_string()), ("size", human_size(size))];
        conn.request(Method::PUT, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn remove_disk(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        disk: &str,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/config", node, vm_type, vmid);
        let form = [("delete", disk.to_string())];
        conn.request(Method::DELETE, &path, &[], Some(&form))
            .await?;
        Ok(())
    }

    pub async fn move_disk(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        disk: &str,
        storage: &str,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/move_disk", node, vm_type, vmid);
        let form = [("disk", disk.to_string()), ("storage", storage.to_string())];
        conn.request(Method::POST, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn get_network_interfaces(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
    ) -> crate::Result<Vec<NetworkInterface>> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/config", node, vm_type, vmid);
        let data = conn.request(Method::GET, &path, &[], None).await?;
        let obj = data.as_object().ok_or_else(|| {
            Error::SerializationError(format!(
                "Failed to parse {} response from Proxmox: expected an object",
                path
            ))
        })?;
        let mut nics = Vec::new();
        for (key, value) in obj {
            if !is_net_key(key) {
                continue;
            }
            let parsed = parse_net_value(value.as_str().unwrap_or_default());
            nics.push(NetworkInterface {
                name: key.clone(),
                model: parsed.model,
                macaddr: parsed.macaddr,
                bridge: parsed.bridge,
                tag: parsed.tag,
                firewall: parsed.firewall,
                link_down: parsed.link_down,
            });
        }
        Ok(nics)
    }

    pub async fn add_nic(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        config: AddNICConfig,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        // NIC model validation applies to QEMU guests only; LXC containers
        // always use the veth device type and the model is ignored by the
        // server (the frontend sends `veth` for containers).
        const VALID_MODELS: [&str; 4] = ["virtio", "e1000", "rtl8139", "vmxnet3"];
        if vm_type != "lxc" && !VALID_MODELS.contains(&config.model.as_str()) {
            return Err(Error::InvalidUrl(format!(
                "Invalid NIC model '{}': expected one of virtio, e1000, rtl8139, vmxnet3",
                config.model
            )));
        }
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/config", node, vm_type, vmid);
        // The current config determines the first free net index.
        let data = conn.request(Method::GET, &path, &[], None).await?;
        let index = first_free_bus_index(&data, "net");
        let mac = config.macaddr.unwrap_or_else(|| "random".to_string());
        let value = if vm_type == "lxc" {
            // LXC net values use the `name=ethN,type=veth,bridge=...` form;
            // a user-supplied MAC (anything but `random`) is sent as
            // `hwaddr`, and `firewall=1` is added when firewall is enabled.
            let mut value = format!("name=eth{},type=veth,bridge={}", index, config.bridge);
            if !mac.is_empty() && mac != "random" {
                value.push_str(&format!(",hwaddr={}", mac));
            }
            if config.firewall.unwrap_or(false) {
                value.push_str(",firewall=1");
            }
            value
        } else {
            let mut value = format!("{}={}", config.model, mac);
            value.push_str(&format!(",bridge={}", config.bridge));
            if let Some(tag) = config.tag {
                value.push_str(&format!(",tag={}", tag));
            }
            if let Some(firewall) = config.firewall {
                value.push_str(&format!(",firewall={}", u32::from(firewall)));
            }
            value
        };
        let key = format!("net{}", index);
        let form = vec![(key.as_str(), value)];
        conn.request(Method::POST, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn edit_nic(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        nic: &str,
        config: EditNICConfig,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/config", node, vm_type, vmid);
        // Re-encoding needs the current value of the NIC being edited.
        let data = conn.request(Method::GET, &path, &[], None).await?;
        let current = data
            .get(nic)
            .and_then(|v| v.as_str())
            .ok_or_else(|| Error::ApiError(format!("NIC '{}' not found in VM config", nic)))?;
        let value = reencode_nic_value(current, &config);
        let form = vec![(nic, value)];
        conn.request(Method::POST, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn remove_nic(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        nic: &str,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/config", node, vm_type, vmid);
        let form = [("delete", nic.to_string())];
        conn.request(Method::DELETE, &path, &[], Some(&form))
            .await?;
        Ok(())
    }

    /// Updates a VM/container's basic configuration (`name`, `cores`, `memory`,
    /// `description`) by POSTing a form containing only the present fields.
    /// A config with every field `None` errors out instead of sending an empty
    /// POST.
    pub async fn update_vm_config(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        config: UpdateVMConfig,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/config", node, vm_type, vmid);
        let mut form: Vec<(&str, String)> = Vec::new();
        if let Some(name) = config.name {
            form.push(("name", name));
        }
        if let Some(cores) = config.cores {
            form.push(("cores", cores.to_string()));
        }
        if let Some(memory) = config.memory {
            form.push(("memory", memory.to_string()));
        }
        if let Some(description) = config.description {
            form.push(("description", description));
        }
        if form.is_empty() {
            return Err(Error::ApiError("Nothing to update".to_string()));
        }
        conn.request(Method::POST, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn get_snapshots(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
    ) -> crate::Result<Vec<Snapshot>> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/snapshot", node, vm_type, vmid);
        let data = conn.request(Method::GET, &path, &[], None).await?;
        parse_api(&path, data)
    }

    pub async fn create_snapshot(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        config: CreateSnapshotConfig,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/snapshot", node, vm_type, vmid);
        let mut form: Vec<(&str, String)> = vec![("snapname", config.name)];
        if let Some(description) = config.description {
            form.push(("description", description));
        }
        if config.vmstate.unwrap_or(false) {
            form.push(("vmstate", "1".to_string()));
        }
        conn.request(Method::POST, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn delete_snapshot(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        name: &str,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        // Snapshot names can contain URL-hostile characters, so the name is
        // percent-encoded into the path (everything but `A-Za-z0-9-._~`).
        let encoded_name = utf8_percent_encode(name, SEGMENT_ENCODE_SET).to_string();
        let path = format!("/nodes/{}/{}/{}/snapshot/{}", node, vm_type, vmid, encoded_name);
        conn.request(Method::DELETE, &path, &[], None).await?;
        Ok(())
    }

    pub async fn rollback_snapshot(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        name: &str,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let encoded_name = utf8_percent_encode(name, SEGMENT_ENCODE_SET).to_string();
        let path = format!(
            "/nodes/{}/{}/{}/snapshot/{}/rollback",
            node, vm_type, vmid, encoded_name
        );
        conn.request(Method::POST, &path, &[], None).await?;
        Ok(())
    }

    pub async fn migrate_vm(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        vm_type: &str,
        target_node: &str,
        online: bool,
    ) -> crate::Result<()> {
        Self::validate_vm_type(vm_type)?;
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/{}/{}/migrate", node, vm_type, vmid);
        let form = [
            ("target", target_node.to_string()),
            ("online", if online { "1" } else { "0" }.to_string()),
        ];
        conn.request(Method::POST, &path, &[], Some(&form)).await?;
        Ok(())
    }

    /// Creates a VNC console proxy for a QEMU guest, returning the ticket,
    /// websocket port, and server certificate (base64-encoded DER) reported by
    /// Proxmox.
    pub async fn create_vnc_proxy(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
    ) -> crate::Result<VNCProxyResponse> {
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/qemu/{}/vncproxy", node, vmid);
        let data = conn.request(Method::POST, &path, &[], None).await?;
        parse_api(&path, data)
    }

    /// Creates a terminal proxy for an LXC container, returning the ticket and
    /// websocket port reported by Proxmox.
    pub async fn create_term_proxy(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
    ) -> crate::Result<TermProxyResponse> {
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/lxc/{}/termproxy", node, vmid);
        let data = conn.request(Method::POST, &path, &[], None).await?;
        parse_api(&path, data)
    }

    /// Returns the base WebSocket origin for the connection's primary
    /// endpoint. The frontend builds console websocket URLs as
    /// `{origin}/api2/json/nodes/{node}/...`, so this converts the stored
    /// `https://host[:port]` (or `http://host[:port]`) into `wss://host[:port]`
    /// (or `ws://host[:port]`), preserving the host and any explicit port. A
    /// URL without an explicit port keeps none — the default port for the
    /// websocket scheme applies.
    ///
    /// `node` is retained in the signature because callers target a specific
    /// node's console path, but the base origin does not depend on it.
    pub async fn get_websocket_url(
        &self,
        connection_id: &str,
        _node: &str,
    ) -> crate::Result<String> {
        let conn = self.connection(connection_id)?;
        let url = Url::parse(&conn.config.primary.url).map_err(|e| {
            Error::InvalidUrl(format!(
                "Invalid primary URL '{}': {}",
                conn.config.primary.url, e
            ))
        })?;
        let scheme = match url.scheme() {
            "https" => "wss",
            "http" => "ws",
            other => {
                return Err(Error::InvalidUrl(format!(
                    "Unsupported URL scheme '{}': expected http or https",
                    other
                )))
            }
        };
        let host = url
            .host_str()
            .filter(|host| !host.is_empty())
            .ok_or_else(|| {
                Error::InvalidUrl(format!(
                    "Primary URL '{}' has no host",
                    conn.config.primary.url
                ))
            })?;
        let origin = match url.port() {
            Some(port) => format!("{}://{}:{}", scheme, host, port),
            None => format!("{}://{}", scheme, host),
        };
        Ok(origin)
    }

    pub async fn get_backup_jobs(&self, connection_id: &str) -> crate::Result<Vec<BackupJob>> {
        let conn = self.connection(connection_id)?;
        let data = conn
            .request(Method::GET, "/cluster/backup", &[], None)
            .await?;
        parse_api("/cluster/backup", data)
    }

    pub async fn get_backups(
        &self,
        connection_id: &str,
        storage: Option<&str>,
    ) -> crate::Result<Vec<Backup>> {
        let node = self.storage_node(connection_id).await?;
        // A specific storage is queried verbatim and its errors propagate.
        // Without one, every enabled storage whose content list includes
        // `backup` is queried and the results are aggregated; a storage whose
        // content query fails during aggregation is skipped rather than
        // failing the whole call.
        match storage.map(str::trim).filter(|s| !s.is_empty()) {
            Some(storage) => self.backup_entries(connection_id, &node, storage).await,
            None => {
                let storages = self.get_storage(connection_id).await?;
                let mut seen = HashSet::new();
                let mut names = Vec::new();
                for storage in storages {
                    if storage.enabled == 0 {
                        continue;
                    }
                    let content_tokens: Vec<&str> =
                        storage.content.split(',').map(str::trim).collect();
                    if !content_tokens.contains(&"backup") {
                        continue;
                    }
                    if seen.insert(storage.storage.clone()) {
                        names.push(storage.storage);
                    }
                }
                let mut backups = Vec::new();
                for name in names {
                    if let Ok(entries) = self.backup_entries(connection_id, &node, &name).await {
                        backups.extend(entries);
                    }
                }
                Ok(backups)
            }
        }
    }

    /// Fetches the backup entries of a single storage on `node` from the
    /// node-scoped content endpoint. The content endpoint can mix backup
    /// entries with iso/vztmpl entries, so the requested `content=backup`
    /// filter is mirrored here and only entries tagged `backup` are mapped.
    async fn backup_entries(
        &self,
        connection_id: &str,
        node: &str,
        storage: &str,
    ) -> crate::Result<Vec<Backup>> {
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/storage/{}/content", node, storage);
        let query = [("content", "backup".to_string())];
        let data = conn.request(Method::GET, &path, &query, None).await?;
        let entries: Vec<serde_json::Value> = parse_api(&path, data)?;
        let mut backups = Vec::new();
        for entry in entries {
            if entry["content"].as_str() != Some("backup") {
                continue;
            }
            let backup: Backup = serde_json::from_value(entry).map_err(|e| {
                Error::SerializationError(format!(
                    "Failed to parse {} response from Proxmox: {}",
                    path, e
                ))
            })?;
            backups.push(backup);
        }
        Ok(backups)
    }

    pub async fn create_backup_job(
        &self,
        connection_id: &str,
        config: BackupJobConfig,
    ) -> crate::Result<()> {
        let conn = self.connection(connection_id)?;
        let form = backup_job_form(&config);
        conn.request(Method::POST, "/cluster/backup", &[], Some(&form))
            .await?;
        Ok(())
    }

    pub async fn update_backup_job(
        &self,
        connection_id: &str,
        id: &str,
        config: BackupJobConfig,
    ) -> crate::Result<()> {
        let conn = self.connection(connection_id)?;
        let path = format!("/cluster/backup/{}", id);
        let form = backup_job_form(&config);
        conn.request(Method::PUT, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn delete_backup_job(&self, connection_id: &str, id: &str) -> crate::Result<()> {
        let conn = self.connection(connection_id)?;
        let path = format!("/cluster/backup/{}", id);
        conn.request(Method::DELETE, &path, &[], None).await?;
        Ok(())
    }

    pub async fn run_backup(
        &self,
        connection_id: &str,
        config: BackupJobConfig,
    ) -> crate::Result<()> {
        // Vzdump is node-scoped: prefer the node on the job config, otherwise
        // fall back to the first online node in the cluster.
        let node = match config.node.as_deref().filter(|n| !n.is_empty()) {
            Some(node) => node.to_string(),
            None => self.first_online_node(connection_id, "backup").await?,
        };
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/vzdump", node);
        let mut form: Vec<(&str, String)> = vec![
            ("mode", config.mode),
            ("compress", config.compression),
            ("storage", config.storage),
            ("all", if config.all { "1" } else { "0" }.to_string()),
        ];
        if let Some(vmid) = config.vmid {
            form.push(("vmid", vmid));
        }
        conn.request(Method::POST, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn restore_backup(
        &self,
        connection_id: &str,
        volid: &str,
        config: RestoreConfig,
    ) -> crate::Result<()> {
        let conn = self.connection(connection_id)?;
        let path = format!("/nodes/{}/vzdump", config.node);
        let mut form: Vec<(&str, String)> = vec![
            ("restore", "1".to_string()),
            ("volid", volid.to_string()),
            ("storage", config.storage),
            ("node", config.node),
        ];
        if let Some(vmid) = config.vmid {
            form.push(("vmid", vmid.to_string()));
        }
        conn.request(Method::POST, &path, &[], Some(&form)).await?;
        Ok(())
    }

    pub async fn delete_backup(&self, connection_id: &str, volid: &str) -> crate::Result<()> {
        let conn = self.connection(connection_id)?;
        let node = self.storage_node(connection_id).await?;
        // The storage is the volid prefix before the first `:`.
        let storage = volid.split(':').next().unwrap_or("").to_string();
        // Volume ids contain `:` and `/` that must be percent-encoded in the
        // path; Proxmox only accepts the encoded form.
        let encoded_volid = utf8_percent_encode(volid, VOLID_ENCODE_SET).to_string();
        let path = format!(
            "/nodes/{}/storage/{}/content/{}",
            node, storage, encoded_volid
        );
        conn.request(Method::DELETE, &path, &[], None).await?;
        Ok(())
    }
}

/// Maps a [`BackupJobConfig`] to the form fields accepted by the
/// `/cluster/backup` create and update endpoints. The optional `node` and
/// `vmid` fields are included only when set; `vmid` is a comma-joined list of
/// VM ids (e.g. `"100,101"`).
fn backup_job_form(config: &BackupJobConfig) -> Vec<(&'static str, String)> {
    let mut form: Vec<(&'static str, String)> = vec![
        ("schedule", config.schedule.clone()),
        ("storage", config.storage.clone()),
        ("mode", config.mode.clone()),
        ("compress", config.compression.clone()),
        ("all", if config.all { "1" } else { "0" }.to_string()),
        (
            "enabled",
            if config.enabled { "1" } else { "0" }.to_string(),
        ),
    ];
    if let Some(node) = &config.node {
        form.push(("node", node.clone()));
    }
    if let Some(vmid) = &config.vmid {
        form.push(("vmid", vmid.clone()));
    }
    form
}

/// Formats a byte count as a human-readable size using binary units
/// (`B`/`K`/`M`/`G`/`T`). The largest unit that divides `bytes` evenly is
/// chosen (so whole-gigabyte sizes produce `32G` rather than `32768M`); sizes
/// that are not a whole multiple of any binary unit fall back to gigabytes.
fn human_size(bytes: u64) -> String {
    const KIB: u64 = 1024;
    const MIB: u64 = KIB * 1024;
    const GIB: u64 = MIB * 1024;
    const TIB: u64 = GIB * 1024;

    if bytes == 0 {
        return "0G".to_string();
    }
    if bytes % TIB == 0 {
        format!("{}T", bytes / TIB)
    } else if bytes % GIB == 0 {
        format!("{}G", bytes / GIB)
    } else if bytes % MIB == 0 {
        format!("{}M", bytes / MIB)
    } else if bytes % KIB == 0 {
        format!("{}K", bytes / KIB)
    } else {
        format!("{}G", bytes as f64 / GIB as f64)
    }
}

/// Parses a human-readable size (`32G`, `500M`, `2T`, case-insensitive) into
/// bytes. Returns `0` when the string cannot be parsed.
fn parse_human_size(s: &str) -> u64 {
    const KIB: f64 = 1024.0;
    const MIB: f64 = KIB * 1024.0;
    const GIB: f64 = MIB * 1024.0;

    let s = s.trim();
    if s.is_empty() {
        return 0;
    }
    let unit_start = s.find(|c: char| c.is_ascii_alphabetic()).unwrap_or(s.len());
    let (number, unit) = s.split_at(unit_start);
    let number: f64 = match number.trim().parse::<f64>() {
        Ok(n) if n.is_finite() && n >= 0.0 => n,
        _ => return 0,
    };
    let multiplier = match unit.trim().to_ascii_uppercase().as_str() {
        "T" => GIB * 1024.0,
        "G" => GIB,
        "M" => MIB,
        "K" => KIB,
        "B" | "" => 1.0,
        _ => return 0,
    };
    (number * multiplier) as u64
}

/// Extracts `(storage, size_bytes, format)` from a disk config value such as
/// `local-lvm:vm-100-disk-0,size=32G,format=qcow2`. The size attribute is
/// optional (existing volumes have no size); a missing `size` yields `0`.
fn parse_disk_attrs(value: &str) -> (String, u64, String) {
    let first_segment = value.split(',').next().unwrap_or("");
    let storage = first_segment.split(':').next().unwrap_or("").to_string();
    let mut size = 0u64;
    let mut format = String::new();
    for attr in value.split(',') {
        if let Some((key, val)) = attr.split_once('=') {
            match key.trim() {
                "size" => size = parse_human_size(val),
                "format" => format = val.trim().to_string(),
                _ => {}
            }
        }
    }
    (storage, size, format)
}

/// True when `key` is a VM/container disk config key. QEMU guests use the
/// `scsi0`/`virtio1`/`ide2`/`sata0`/`nvme0` bus keys; LXC containers use
/// `rootfs` and mount-point keys `mp0`, `mp1`, ...
fn is_disk_key(key: &str) -> bool {
    const BUSES: [&str; 5] = ["scsi", "virtio", "ide", "sata", "nvme"];
    let bus_key = |bus: &str| {
        key.strip_prefix(bus).map_or(false, |suffix| {
            !suffix.is_empty() && suffix.bytes().all(|b| b.is_ascii_digit())
        })
    };
    BUSES.iter().any(|bus| bus_key(bus))
        || key == "rootfs"
        || bus_key("mp")
}

/// True when `key` is a NIC config key (`net0`, `net1`, ...).
fn is_net_key(key: &str) -> bool {
    key.strip_prefix("net").map_or(false, |suffix| {
        !suffix.is_empty() && suffix.bytes().all(|b| b.is_ascii_digit())
    })
}

/// Returns the lowest unused slot index for `bus` (e.g. `scsi`, `net`) based
/// on the config keys already present in the API response.
fn first_free_bus_index(config: &serde_json::Value, bus: &str) -> u32 {
    let mut index = 0u32;
    loop {
        let key = format!("{}{}", bus, index);
        if config.get(&key).is_none() {
            return index;
        }
        index += 1;
    }
}

/// The parsed pieces of a NIC config value such as
/// `virtio=BC:24:11:AA:BB:CC,bridge=vmbr0,tag=10,firewall=1` (QEMU) or
/// `name=eth0,type=veth,hwaddr=BC:24:11:8D:DF:95,bridge=vmbr0,ip=dhcp` (LXC).
struct ParsedNetValue {
    /// True when the value uses the LXC `name=eth0,...` format.
    lxc: bool,
    /// The interface name segment of an LXC value (`eth0`); empty for QEMU.
    name: String,
    model: String,
    macaddr: String,
    bridge: Option<String>,
    tag: Option<u32>,
    firewall: Option<u32>,
    link_down: Option<u32>,
}

/// Parses a NIC config value into its components.
///
/// QEMU values start with `model=macaddr` and continue with `key=value`
/// attributes (`bridge`, `tag`, `firewall`, ...). LXC values start with
/// `name=ethN` and express the device type and MAC as `type=veth` /
/// `hwaddr=...` attributes, which are mapped onto `model` and `macaddr` so
/// callers see a uniform shape.
fn parse_net_value(value: &str) -> ParsedNetValue {
    let mut lxc = false;
    let mut name = String::new();
    let mut model = String::new();
    let mut macaddr = String::new();
    let mut bridge = None;
    let mut tag = None;
    let mut firewall = None;
    let mut link_down = None;

    let mut segments = value.split(',');
    if let Some(first) = segments.next() {
        if let Some((key, val)) = first.split_once('=') {
            if key.trim() == "name" {
                lxc = true;
                name = val.trim().to_string();
            } else {
                model = key.trim().to_string();
                macaddr = val.trim().to_string();
            }
        }
    }
    for segment in segments {
        if let Some((attr, val)) = segment.split_once('=') {
            let val = val.trim();
            match attr.trim() {
                "bridge" => bridge = Some(val.to_string()),
                "tag" => tag = val.parse().ok(),
                "firewall" => firewall = val.parse().ok(),
                "link_down" => link_down = val.parse().ok(),
                _ if lxc => match attr.trim() {
                    "type" => model = val.to_string(),
                    "hwaddr" => macaddr = val.to_string(),
                    _ => {}
                },
                _ => {}
            }
        }
    }

    ParsedNetValue {
        lxc,
        name,
        model,
        macaddr,
        bridge,
        tag,
        firewall,
        link_down,
    }
}

/// Re-encodes a NIC config value after applying the edited fields. The model
/// and MAC address are always preserved; `config.bridge`, `config.tag` (a tag
/// of `0` removes the tag) and `config.firewall` replace the existing values
/// when present. Any other comma-separated `key=value` attribute in the
/// current value (e.g. `link_down`, `rate`, `queues`, `disconnect`) is
/// carried over verbatim, so editing a NIC does not drop attributes the
/// client does not model.
///
/// LXC values are re-encoded in their native form — `name=ethN,type=...,
/// hwaddr=...,bridge=...[,firewall=...]` — with the same unknown-attribute
/// pass-through. LXC has no VLAN tag, so a tag is never emitted.
fn reencode_nic_value(current: &str, config: &EditNICConfig) -> String {
    let parsed = parse_net_value(current);
    let bridge = config.bridge.clone().or(parsed.bridge);
    let firewall = match config.firewall {
        Some(on) => Some(u32::from(on)),
        None => parsed.firewall,
    };

    if parsed.lxc {
        let mut value = format!(
            "name={},type={},hwaddr={}",
            parsed.name, parsed.model, parsed.macaddr
        );
        if let Some(bridge) = bridge {
            value.push_str(&format!(",bridge={}", bridge));
        }
        if let Some(firewall) = firewall {
            value.push_str(&format!(",firewall={}", firewall));
        }
        // Carry over every other `key=value` attribute from the current value
        // verbatim, skipping the leading `name=` segment and the attributes
        // already re-emitted above (`tag` is never valid for LXC).
        let mut segments = current.split(',');
        segments.next();
        for segment in segments {
            if let Some((attr, _)) = segment.split_once('=') {
                if matches!(
                    attr.trim(),
                    "bridge" | "firewall" | "name" | "type" | "hwaddr" | "tag"
                ) {
                    continue;
                }
                value.push(',');
                value.push_str(segment.trim());
            }
        }
        return value;
    }

    let tag = match config.tag {
        Some(0) => None,
        Some(t) => Some(t),
        None => parsed.tag.filter(|&t| t != 0),
    };

    let mut value = format!("{}={}", parsed.model, parsed.macaddr);
    if let Some(bridge) = bridge {
        value.push_str(&format!(",bridge={}", bridge));
    }
    if let Some(tag) = tag {
        value.push_str(&format!(",tag={}", tag));
    }
    if let Some(firewall) = firewall {
        value.push_str(&format!(",firewall={}", firewall));
    }
    // Carry over every other `key=value` attribute from the current value
    // verbatim, skipping the leading model=macaddr segment and the attributes
    // already re-emitted above.
    let mut segments = current.split(',');
    segments.next();
    for segment in segments {
        if let Some((attr, _)) = segment.split_once('=') {
            if matches!(attr.trim(), "bridge" | "tag" | "firewall") {
                continue;
            }
            value.push(',');
            value.push_str(segment.trim());
        }
    }
    value
}
