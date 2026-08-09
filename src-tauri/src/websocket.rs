use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::Emitter;
use tokio::sync::mpsc;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::error::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TaskUpdate {
    pub connection_id: String,
    pub upid: String,
    pub node: String,
    pub task_type: String,
    pub status: Option<String>,
    pub exitstatus: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeStatusChange {
    pub connection_id: String,
    pub node: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VMStatusChange {
    pub connection_id: String,
    pub node: String,
    pub vmid: u32,
    pub status: String,
}

/// Manages WebSocket connections per connection ID.
///
/// Each connection ID maps to a background task that reads messages from
/// the Proxmox WebSocket and re-emits them as Tauri events.
pub struct WebSocketManager {
    connections: HashMap<String, mpsc::Sender<()>>,
}

impl WebSocketManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }

    /// Connect to a Proxmox WebSocket URL for the given connection ID.
    ///
    /// Messages are forwarded as Tauri events via `app_handle`. If a connection
    /// already exists for this ID, it is disconnected first.
    pub async fn connect(
        &mut self,
        connection_id: String,
        url: String,
        app_handle: tauri::AppHandle,
    ) -> crate::Result<()> {
        // Disconnect any existing connection for this ID
        self.disconnect(&connection_id).await;

        let (shutdown_tx, mut shutdown_rx) = mpsc::channel::<()>(1);

        let cid = connection_id.clone();
        let ws_url = url.clone();

        tokio::spawn(async move {
            let mut reconnect_delay = Duration::from_secs(1);
            const MAX_DELAY: Duration = Duration::from_secs(30);
            const MAX_RETRIES: u32 = 10;
            let mut retry_count: u32 = 0;

            loop {
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        break;
                    }
                    result = connect_and_run(&cid, &ws_url, &app_handle) => {
                        match result {
                            Ok(()) => {
                                reconnect_delay = Duration::from_secs(1);
                                retry_count = 0;
                            }
                            Err(e) => {
                                retry_count += 1;
                                if retry_count >= MAX_RETRIES {
                                    let _ = app_handle.emit("ws-raw", serde_json::json!({
                                        "connection_id": cid,
                                        "data": { "type": "error", "message": format!("WebSocket reconnect failed after {} attempts: {}", MAX_RETRIES, e) },
                                    }));
                                    break;
                                }
                                eprintln!("[ws] connection error for {} (attempt {}/{}): {e}", cid, retry_count, MAX_RETRIES);
                            }
                        }
                    }
                }

                // Reconnect back-off
                tokio::select! {
                    _ = shutdown_rx.recv() => {
                        break;
                    }
                    _ = sleep(reconnect_delay) => {}
                }
                reconnect_delay = (reconnect_delay * 2).min(MAX_DELAY);
            }
        });

        self.connections.insert(connection_id, shutdown_tx);
        Ok(())
    }

    /// Disconnect the WebSocket for the given connection ID.
    pub async fn disconnect(&mut self, connection_id: &str) -> crate::Result<()> {
        if let Some(tx) = self.connections.remove(connection_id) {
            let _ = tx.send(()).await;
        }
        Ok(())
    }

    /// Check whether a WebSocket connection is active.
    pub fn is_connected(&self, connection_id: &str) -> bool {
        self.connections.contains_key(connection_id)
    }
}

/// Connect to the Proxmox WebSocket and relay messages as Tauri events.
async fn connect_and_run(
    connection_id: &str,
    url: &str,
    app_handle: &tauri::AppHandle,
) -> crate::Result<()> {
    let (ws_stream, _) = connect_async(url)
        .await
        .map_err(|e| Error::WebSocketError(e.to_string()))?;

    let cid = connection_id.to_string();
    let (mut write, mut read) = ws_stream.split();

    while let Some(msg_result) = read.next().await {
        match msg_result {
            Ok(Message::Text(text)) => {
                handle_ws_message(&cid, &text, app_handle);
            }
            Ok(Message::Close(_)) => {
                break;
            }
            Ok(_) => {}
            Err(e) => {
                eprintln!("[ws] read error: {e}");
                break;
            }
        }
    }

    // Attempt clean close
    let _ = write.close().await;
    Ok(())
}

/// Parse a Proxmox WebSocket message and emit the appropriate Tauri event.
///
/// Proxmox sends JSON messages in the format:
/// ```json
/// { "type": "task", "data": { ... } }
/// ```
/// or various status update formats. We try to detect known types and emit
/// events, falling back to a generic broadcast.
fn handle_ws_message(connection_id: &str, text: &str, app_handle: &tauri::AppHandle) {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(text) else {
        return;
    };

    // Try to detect task-related messages
    if let Some(msg_type) = value.get("type").and_then(|v| v.as_str()) {
        match msg_type {
            "task" => {
                if let Some(data) = value.get("data") {
                    let update = TaskUpdate {
                        connection_id: connection_id.to_string(),
                        upid: data
                            .get("upid")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        node: data
                            .get("node")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        task_type: data
                            .get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        status: data
                            .get("status")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                        exitstatus: data
                            .get("exitstatus")
                            .and_then(|v| v.as_str())
                            .map(String::from),
                    };
                    let _ = app_handle.emit("task-update", update);
                }
            }
            "node" => {
                if let Some(data) = value.get("data") {
                    let change = NodeStatusChange {
                        connection_id: connection_id.to_string(),
                        node: data
                            .get("node")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        status: data
                            .get("status")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                    };
                    let _ = app_handle.emit("node-status-change", change);
                }
            }
            "vm" => {
                if let Some(data) = value.get("data") {
                    let change = VMStatusChange {
                        connection_id: connection_id.to_string(),
                        node: data
                            .get("node")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                        vmid: data.get("vmid").and_then(|v| v.as_u64()).unwrap_or(0) as u32,
                        status: data
                            .get("status")
                            .and_then(|v| v.as_str())
                            .unwrap_or_default()
                            .to_string(),
                    };
                    let _ = app_handle.emit("vm-status-change", change);
                }
            }
            _ => {
                // Unknown message type – emit generic event with raw data
                let _ = app_handle.emit(
                    "ws-raw",
                    serde_json::json!({
                        "connection_id": connection_id,
                        "data": value,
                    }),
                );
            }
        }
    }
}
