//! Local WebSocket proxy for VM and container consoles.
//!
//! The webview cannot open a `wss://` connection to a self-signed Proxmox
//! server (the browser validates the certificate against the system trust
//! store, which rejects it). The consoles therefore go through a loopback
//! proxy: the backend opens the `wss://` connection to Proxmox (using the same
//! accept-self-signed transport as the HTTP API) and forwards frames to a
//! plain `ws://127.0.0.1:<port>` endpoint that the webview can reach. A random
//! per-session token in the query string keeps other local processes from
//! hijacking an open console.

use crate::connection::ConnectionManager;
use crate::websocket::connect_ws;
use crate::{Error, Result};
use futures_util::{SinkExt, StreamExt};
use percent_encoding::{utf8_percent_encode, AsciiSet, NON_ALPHANUMERIC};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::SocketAddr;
use tokio::net::TcpListener;
use tokio::sync::watch;
use tokio::time::{timeout, Duration};
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::http::StatusCode;
use tokio_tungstenite::tungstenite::Message;
use uuid::Uuid;

/// Characters left unencoded when embedding a proxy ticket into a query
/// string (everything but RFC 3986 unreserved characters is encoded).
const QUERY_ENCODE_SET: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');

/// The local endpoint handed to the frontend for one console session.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsoleProxyInfo {
    pub session_id: String,
    pub url: String,
}

struct ConsoleSession {
    shutdown: watch::Sender<()>,
}

pub struct ConsoleProxyManager {
    sessions: HashMap<String, ConsoleSession>,
}

impl ConsoleProxyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
        }
    }

    /// Opens a console proxy for a guest and returns a local `ws://` URL.
    ///
    /// `kind` is `"vnc"` (QEMU) or `"term"` (LXC). A session handles a single
    /// local client; when the client disconnects the Proxmox stream is torn
    /// down. Call [`ConsoleProxyManager::stop`] to cancel a session that is
    /// still waiting for its client.
    pub async fn start(
        &mut self,
        connection_id: &str,
        kind: &str,
        node: &str,
        vmid: u32,
        manager: &ConnectionManager,
    ) -> Result<ConsoleProxyInfo> {
        let (proxy_port, ticket) = match kind {
            "vnc" => {
                let proxy = manager.create_vnc_proxy(connection_id, node, vmid).await?;
                (proxy.port, proxy.ticket)
            }
            "term" => {
                let proxy = manager.create_term_proxy(connection_id, node, vmid).await?;
                (proxy.port, proxy.ticket)
            }
            other => {
                return Err(Error::InvalidUrl(format!(
                    "Invalid console type '{}': expected 'vnc' or 'term'",
                    other
                )));
            }
        };

        let origin = manager.get_websocket_url(connection_id, node).await?;
        let encoded_ticket = utf8_percent_encode(&ticket, QUERY_ENCODE_SET).to_string();
        let path = if kind == "vnc" {
            format!(
                "/api2/json/nodes/{}/qemu/{}/vncwebsocket?port={}&vncticket={}",
                node, vmid, proxy_port, encoded_ticket
            )
        } else {
            format!(
                "/api2/json/nodes/{}/lxc/{}/proxy?port={}&ticket={}",
                node, vmid, proxy_port, encoded_ticket
            )
        };
        let ws_url = format!("{}{}", origin, path);

        // Connect to Proxmox first so an unreachable server fails the command
        // instead of leaving a dangling local listener.
        let server = timeout(Duration::from_secs(20), connect_ws(&ws_url))
            .await
            .map_err(|_| Error::WebSocketError("Timed out opening console proxy".to_string()))?
            .map_err(|e| Error::WebSocketError(format!("Cannot open console proxy: {}", e)))?;

        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .map_err(|e| Error::WebSocketError(format!("Cannot bind console proxy: {}", e)))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| Error::WebSocketError(format!("Cannot read console proxy port: {}", e)))?
            .port();

        let session_id = Uuid::new_v4().to_string();
        let token = Uuid::new_v4().to_string();
        let (shutdown_tx, shutdown_rx) = watch::channel(());

        let task_token = token.clone();
        tokio::spawn(async move {
            let mut shutdown = shutdown_rx;
            // Wait for the single local client (or a stop request).
            let client = tokio::select! {
                _ = shutdown.changed() => None,
                accepted = listener.accept() => match accepted {
                    Ok((tcp, _)) => {
                        let token = task_token.clone();
                        match tokio_tungstenite::accept_hdr_async(tcp, move |request: &Request, response: Response| -> std::result::Result<Response, ErrorResponse> {
                            let query = request.uri().query().unwrap_or("");
                            if query == format!("token={}", token) {
                                Ok(response)
                            } else {
                                Err(Response::builder()
                                    .status(StatusCode::FORBIDDEN)
                                    .body(None)
                                    .expect("valid HTTP response"))
                            }
                        })
                        .await
                        {
                            Ok(client) => Some(client),
                            Err(_) => None,
                        }
                    }
                    Err(_) => None,
                },
            };

            if let Some(client) = client {
                relay(client, server, &mut shutdown).await;
            }
        });

        self.sessions.insert(
            session_id.clone(),
            ConsoleSession {
                shutdown: shutdown_tx,
            },
        );

        Ok(ConsoleProxyInfo {
            session_id,
            url: format!("ws://127.0.0.1:{}/?token={}", local_port, token),
        })
    }

    /// Cancels a console session. Sessions whose client already connected and
    /// disconnected are gone from the map, so a stop for a stale id is a
    /// no-op.
    pub async fn stop(&mut self, session_id: &str) -> Result<()> {
        if let Some(session) = self.sessions.remove(session_id) {
            let _ = session.shutdown.send(());
        }
        Ok(())
    }
}

/// Bidirectionally copies WebSocket messages between the local client and the
/// Proxmox console stream until either side closes or the session is stopped.
async fn relay(
    client: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    server: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    shutdown: &mut watch::Receiver<()>,
) {
    let (mut client_tx, mut client_rx) = client.split();
    let (mut server_tx, mut server_rx) = server.split();

    loop {
        tokio::select! {
            _ = shutdown.changed() => break,
            next = client_rx.next() => match next {
                Some(Ok(msg)) => {
                    let closing = matches!(msg, Message::Close(_));
                    if server_tx.send(msg).await.is_err() {
                        break;
                    }
                    if closing {
                        break;
                    }
                }
                _ => break,
            },
            next = server_rx.next() => match next {
                Some(Ok(msg)) => {
                    let closing = matches!(msg, Message::Close(_));
                    if client_tx.send(msg).await.is_err() {
                        break;
                    }
                    if closing {
                        break;
                    }
                }
                _ => break,
            },
        }
    }
}
