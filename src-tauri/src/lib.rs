use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};
use tokio::sync::RwLock;

mod connection;
mod console_proxy;
mod error;
mod proxmox;
pub mod tls;
mod websocket;

pub use connection::{
    api_request, derive_node_url, AuthContext, AuthMode, ConnectionManager, LoadResult,
};
pub use console_proxy::ConsoleProxyInfo;
pub use error::Error;
pub use proxmox::{
    AddDiskConfig, AddNICConfig, BackupJobConfig, CreateSnapshotConfig, EditNICConfig,
    RestoreConfig, UpdateVMConfig,
};
use websocket::WebSocketManager;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub id: String,
    pub name: String,
    pub primary: EndpointConfig,
    pub fallbacks: Vec<EndpointConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cert_fingerprint: Option<String>,
    pub trusted: bool,
    #[serde(default)]
    pub accept_untrusted: bool,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cluster_name: Option<String>,
    pub is_cluster: bool,
    pub auth_mode: String,
    pub username: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub nodes: Vec<DiscoveredNode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cluster_id: Option<String>,
}

/// A node discovered in the cluster connected through a
/// [`ConnectionConfig`]. `url` is the endpoint URL derived from the
/// connection's primary endpoint (same scheme and port, host replaced with
/// the node's cluster IP or name); `is_primary` marks the node that the
/// connection is anchored on.
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredNode {
    pub name: String,
    pub url: String,
    pub status: String,
    pub is_primary: bool,
    pub local: bool,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EndpointConfig {
    pub url: String,
    pub node: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub token: Option<String>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResult {
    pub connection_id: String,
    pub ticket: String,
    pub csrf_token: String,
}

/// The outcome of a `connect` attempt. A standalone success reports
/// `merged_into: None`; connecting to a cluster already represented by another
/// connection folds the new endpoint into it and reports
/// `merged_into: Some(target)`. When no endpoint is reachable the connection
/// is still tracked and reported with `status: "failed"` instead of an error.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectResult {
    /// The effective connection id to use after the connect (the merge target
    /// when this connect merged into an existing same-cluster connection).
    pub connection_id: String,
    /// `Some(target)` when this connect merged into an existing connection.
    pub merged_into: Option<String>,
    /// `"connected"` | `"failover"` | `"failed"`.
    pub status: String,
}

/// A snapshot of a connection's runtime state for the status bar: the
/// effective status, the primary and currently-serving endpoints, and the last
/// discovered node list.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatusInfo {
    pub connection_id: String,
    /// `"connected"` | `"failover"` | `"failed"` | `"disconnected"`.
    pub status: String,
    pub primary_url: String,
    pub current_endpoint_url: String,
    pub nodes: Vec<DiscoveredNode>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateInfo {
    pub fingerprint: String,
    pub issuer: String,
    pub subject: String,
    pub valid_from: String,
    pub valid_to: String,
    pub self_signed: bool,
}

struct AppState {
    connection_manager: Arc<RwLock<ConnectionManager>>,
    ws_manager: Arc<RwLock<WebSocketManager>>,
    console_proxy: Arc<RwLock<console_proxy::ConsoleProxyManager>>,
}

/// Returns the path of the persisted connections file.
///
/// Lives at `{app_config_dir}/clustri/connections.json`; the parent
/// directory is created lazily when the file is first written.
fn connections_file(app: &tauri::AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_config_dir()?;
    Ok(dir.join("clustri").join("connections.json"))
}

#[tauri::command]
async fn load_connections(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<LoadResult> {
    let mut manager = state.connection_manager.write().await;
    let path = connections_file(&app)?;
    manager.load_connections(&path).await
}

#[tauri::command]
async fn add_connection(
    state: tauri::State<'_, AppState>,
    config: ConnectionConfig,
    app: tauri::AppHandle,
) -> Result<()> {
    let mut manager = state.connection_manager.write().await;
    let path = connections_file(&app)?;
    manager.add_connection(config, &path).await
}

#[tauri::command]
async fn remove_connection(
    state: tauri::State<'_, AppState>,
    id: String,
    app: tauri::AppHandle,
) -> Result<()> {
    let mut manager = state.connection_manager.write().await;
    let path = connections_file(&app)?;
    manager.remove_connection(&id, &path).await
}

#[tauri::command]
async fn update_connection(
    state: tauri::State<'_, AppState>,
    config: ConnectionConfig,
    app: tauri::AppHandle,
) -> Result<()> {
    let mut manager = state.connection_manager.write().await;
    let path = connections_file(&app)?;
    manager.update_connection(config, &path).await
}

#[tauri::command]
async fn connect_to_server(
    state: tauri::State<'_, AppState>,
    id: String,
    app: tauri::AppHandle,
) -> Result<ConnectResult> {
    let mut manager = state.connection_manager.write().await;
    let path = connections_file(&app)?;
    manager.connect(&id, &path).await
}

#[tauri::command]
async fn get_connection_status(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<ConnectionStatusInfo> {
    let mut manager = state.connection_manager.write().await;
    manager.status_info(&connection_id).await
}

#[tauri::command]
async fn set_active_connection(
    state: tauri::State<'_, AppState>,
    id: String,
    app: tauri::AppHandle,
) -> Result<()> {
    let mut manager = state.connection_manager.write().await;
    let path = connections_file(&app)?;
    manager.set_active_connection(id, &path).await
}

#[tauri::command]
async fn disconnect_from_server(state: tauri::State<'_, AppState>, id: String) -> Result<()> {
    let mut manager = state.connection_manager.write().await;
    manager.disconnect(&id).await
}

#[tauri::command]
async fn get_certificate_info(
    state: tauri::State<'_, AppState>,
    url: String,
) -> Result<CertificateInfo> {
    let manager = state.connection_manager.read().await;
    manager.get_certificate_info(&url).await
}

#[tauri::command]
async fn trust_certificate(
    state: tauri::State<'_, AppState>,
    id: String,
    fingerprint: String,
    app: tauri::AppHandle,
) -> Result<()> {
    let mut manager = state.connection_manager.write().await;
    let path = connections_file(&app)?;
    manager.trust_certificate(&id, &fingerprint, &path).await
}

#[tauri::command]
async fn get_nodes(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<proxmox::Node>> {
    let manager = state.connection_manager.read().await;
    manager.get_nodes(&connection_id).await
}

#[tauri::command]
async fn get_vms(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<proxmox::VM>> {
    let manager = state.connection_manager.read().await;
    manager.get_vms(&connection_id).await
}

#[tauri::command]
async fn get_storage(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<proxmox::Storage>> {
    let manager = state.connection_manager.read().await;
    manager.get_storage(&connection_id).await
}

#[tauri::command]
async fn get_storage_content(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    storage: String,
    node: Option<String>,
) -> Result<Vec<proxmox::StorageContent>> {
    let manager = state.connection_manager.read().await;
    manager
        .get_storage_content(&connection_id, &storage, node.as_deref())
        .await
}

#[tauri::command]
async fn get_storage_detail(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    storage: String,
) -> Result<proxmox::StorageDetail> {
    let manager = state.connection_manager.read().await;
    manager
        .get_storage_detail(&connection_id, &node, &storage)
        .await
}

#[tauri::command]
async fn get_tasks(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<proxmox::Task>> {
    let manager = state.connection_manager.read().await;
    manager.get_tasks(&connection_id).await
}

#[tauri::command]
async fn get_cluster_status(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<proxmox::ClusterStatus> {
    let manager = state.connection_manager.read().await;
    manager.get_cluster_status(&connection_id).await
}

#[tauri::command]
async fn start_vm(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .start_vm(&connection_id, &node, vmid, &vm_type)
        .await
}

#[tauri::command]
async fn stop_vm(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager.stop_vm(&connection_id, &node, vmid, &vm_type).await
}

#[tauri::command]
async fn shutdown_vm(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .shutdown_vm(&connection_id, &node, vmid, &vm_type)
        .await
}

#[tauri::command]
async fn reboot_vm(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .reboot_vm(&connection_id, &node, vmid, &vm_type)
        .await
}

#[tauri::command]
async fn suspend_vm(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .suspend_vm(&connection_id, &node, vmid, &vm_type)
        .await
}

#[tauri::command]
async fn resume_vm(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .resume_vm(&connection_id, &node, vmid, &vm_type)
        .await
}

#[tauri::command]
async fn get_disks(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
) -> Result<Vec<proxmox::Disk>> {
    let manager = state.connection_manager.read().await;
    manager
        .get_disks(&connection_id, &node, vmid, &vm_type)
        .await
}

#[tauri::command]
async fn add_disk(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    config: proxmox::AddDiskConfig,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .add_disk(&connection_id, &node, vmid, &vm_type, config)
        .await
}

#[tauri::command]
async fn resize_disk(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    disk: String,
    size: u64,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .resize_disk(&connection_id, &node, vmid, &vm_type, &disk, size)
        .await
}

#[tauri::command]
async fn remove_disk(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    disk: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .remove_disk(&connection_id, &node, vmid, &vm_type, &disk)
        .await
}

#[tauri::command]
async fn move_disk(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    disk: String,
    storage: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .move_disk(&connection_id, &node, vmid, &vm_type, &disk, &storage)
        .await
}

#[tauri::command]
async fn get_network_interfaces(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
) -> Result<Vec<proxmox::NetworkInterface>> {
    let manager = state.connection_manager.read().await;
    manager
        .get_network_interfaces(&connection_id, &node, vmid, &vm_type)
        .await
}

#[tauri::command]
async fn add_nic(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    config: proxmox::AddNICConfig,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .add_nic(&connection_id, &node, vmid, &vm_type, config)
        .await
}

#[tauri::command]
async fn edit_nic(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    nic: String,
    config: proxmox::EditNICConfig,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .edit_nic(&connection_id, &node, vmid, &vm_type, &nic, config)
        .await
}

#[tauri::command]
async fn remove_nic(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    nic: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .remove_nic(&connection_id, &node, vmid, &vm_type, &nic)
        .await
}

#[tauri::command]
async fn get_snapshots(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
) -> Result<Vec<proxmox::Snapshot>> {
    let manager = state.connection_manager.read().await;
    manager
        .get_snapshots(&connection_id, &node, vmid, &vm_type)
        .await
}

#[tauri::command]
async fn create_snapshot(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    config: proxmox::CreateSnapshotConfig,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .create_snapshot(&connection_id, &node, vmid, &vm_type, config)
        .await
}

#[tauri::command]
async fn delete_snapshot(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    name: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .delete_snapshot(&connection_id, &node, vmid, &vm_type, &name)
        .await
}

#[tauri::command]
async fn rollback_snapshot(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    name: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .rollback_snapshot(&connection_id, &node, vmid, &vm_type, &name)
        .await
}

#[tauri::command]
async fn migrate_vm(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    target_node: String,
    online: bool,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .migrate_vm(&connection_id, &node, vmid, &vm_type, &target_node, online)
        .await
}

#[tauri::command]
async fn update_vm_config(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
    vm_type: String,
    config: proxmox::UpdateVMConfig,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager
        .update_vm_config(&connection_id, &node, vmid, &vm_type, config)
        .await
}

// Authentication commands
#[tauri::command]
async fn login_with_password(
    state: tauri::State<'_, AppState>,
    url: String,
    username: String,
    password: String,
) -> Result<LoginResult> {
    let manager = state.connection_manager.read().await;
    manager
        .login_with_password(&url, &username, &password)
        .await
}

#[tauri::command]
async fn login_with_token(
    state: tauri::State<'_, AppState>,
    url: String,
    token: String,
) -> Result<LoginResult> {
    let manager = state.connection_manager.read().await;
    manager.login_with_token(&url, &token).await
}

#[tauri::command]
async fn logout(state: tauri::State<'_, AppState>, connection_id: String) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager.logout(&connection_id).await
}

#[tauri::command]
async fn get_stored_credentials(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<Option<String>> {
    let manager = state.connection_manager.read().await;
    manager.get_stored_credentials(&connection_id).await
}

// Console proxy types

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VNCProxyResponse {
    pub ticket: String,
    #[serde(deserialize_with = "proxmox::de_u32_lenient")]
    pub port: u32,
    pub cert: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TermProxyResponse {
    pub ticket: String,
    #[serde(deserialize_with = "proxmox::de_u32_lenient")]
    pub port: u32,
}

#[tauri::command]
async fn create_vnc_proxy(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
) -> Result<VNCProxyResponse> {
    let manager = state.connection_manager.read().await;
    manager.create_vnc_proxy(&connection_id, &node, vmid).await
}

#[tauri::command]
async fn create_term_proxy(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
    vmid: u32,
) -> Result<TermProxyResponse> {
    let manager = state.connection_manager.read().await;
    manager.create_term_proxy(&connection_id, &node, vmid).await
}

#[tauri::command]
async fn get_websocket_url(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    node: String,
) -> Result<String> {
    let manager = state.connection_manager.read().await;
    manager.get_websocket_url(&connection_id, &node).await
}

#[tauri::command]
async fn connect_websocket(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    url: String,
    app_handle: tauri::AppHandle,
) -> Result<()> {
    let mut ws_manager = state.ws_manager.write().await;
    ws_manager.connect(connection_id, url, app_handle).await
}

#[tauri::command]
async fn disconnect_websocket(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<()> {
    let mut ws_manager = state.ws_manager.write().await;
    ws_manager.disconnect(&connection_id).await
}

#[tauri::command]
async fn is_websocket_connected(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<bool> {
    let ws_manager = state.ws_manager.read().await;
    Ok(ws_manager.is_connected(&connection_id))
}

// Console proxy commands
#[tauri::command]
async fn start_console_proxy(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    kind: String,
    node: String,
    vmid: u32,
) -> Result<ConsoleProxyInfo> {
    let manager = state.connection_manager.read().await;
    let mut proxy = state.console_proxy.write().await;
    proxy
        .start(&connection_id, &kind, &node, vmid, &manager)
        .await
}

#[tauri::command]
async fn stop_console_proxy(
    state: tauri::State<'_, AppState>,
    session_id: String,
) -> Result<()> {
    let mut proxy = state.console_proxy.write().await;
    proxy.stop(&session_id).await
}

// Backup management commands
#[tauri::command]
async fn get_backup_jobs(
    state: tauri::State<'_, AppState>,
    connection_id: String,
) -> Result<Vec<proxmox::BackupJob>> {
    let manager = state.connection_manager.read().await;
    manager.get_backup_jobs(&connection_id).await
}

#[tauri::command]
async fn get_backups(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    storage: Option<String>,
) -> Result<Vec<proxmox::Backup>> {
    let manager = state.connection_manager.read().await;
    manager
        .get_backups(&connection_id, storage.as_deref())
        .await
}

#[tauri::command]
async fn create_backup_job(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    config: proxmox::BackupJobConfig,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager.create_backup_job(&connection_id, config).await
}

#[tauri::command]
async fn update_backup_job(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    id: String,
    config: proxmox::BackupJobConfig,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager.update_backup_job(&connection_id, &id, config).await
}

#[tauri::command]
async fn delete_backup_job(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    id: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager.delete_backup_job(&connection_id, &id).await
}

#[tauri::command]
async fn run_backup(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    config: proxmox::BackupJobConfig,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager.run_backup(&connection_id, config).await
}

#[tauri::command]
async fn restore_backup(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    volid: String,
    config: proxmox::RestoreConfig,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager.restore_backup(&connection_id, &volid, config).await
}

#[tauri::command]
async fn delete_backup(
    state: tauri::State<'_, AppState>,
    connection_id: String,
    volid: String,
) -> Result<()> {
    let manager = state.connection_manager.read().await;
    manager.delete_backup(&connection_id, &volid).await
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayConnectionInfo {
    pub id: String,
    pub name: String,
    pub status: String,
}

#[tauri::command]
async fn update_tray_menu(
    app: tauri::AppHandle,
    connections: Vec<TrayConnectionInfo>,
) -> Result<()> {
    let mut menu_builder = MenuBuilder::new(&app);

    // Show/Hide window item
    let show_hide = MenuItemBuilder::new("Show / Hide")
        .id("show_hide")
        .build(&app)?;
    menu_builder = menu_builder.item(&show_hide);
    menu_builder = menu_builder.separator();

    // Connection items with status
    for conn in &connections {
        let status_icon = match conn.status.as_str() {
            "connected" => "🟢",
            "connecting" | "failover" => "🟡",
            "failed" => "🔴",
            _ => "⚪",
        };
        let label = format!("{} {}", status_icon, conn.name);
        let item = MenuItemBuilder::new(&label)
            .id(format!("connection_{}", conn.id))
            .build(&app)?;
        menu_builder = menu_builder.item(&item);
    }

    if connections.is_empty() {
        let no_conn = MenuItemBuilder::new("No connections")
            .id("no_connections")
            .enabled(false)
            .build(&app)?;
        menu_builder = menu_builder.item(&no_conn);
    }

    menu_builder = menu_builder.separator();

    // Quit item
    let quit = MenuItemBuilder::new("Quit").id("quit").build(&app)?;
    menu_builder = menu_builder.item(&quit);

    let menu = menu_builder.build()?;

    // Update the tray menu
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu))?;
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState {
            connection_manager: Arc::new(RwLock::new(ConnectionManager::new())),
            ws_manager: Arc::new(RwLock::new(WebSocketManager::new())),
            console_proxy: Arc::new(RwLock::new(console_proxy::ConsoleProxyManager::new())),
        })
        .invoke_handler(tauri::generate_handler![
            load_connections,
            add_connection,
            remove_connection,
            update_connection,
            set_active_connection,
            connect_to_server,
            disconnect_from_server,
            get_connection_status,
            login_with_password,
            login_with_token,
            logout,
            get_stored_credentials,
            get_certificate_info,
            trust_certificate,
            get_nodes,
            get_vms,
            get_storage,
            get_storage_content,
            get_storage_detail,
            get_tasks,
            get_cluster_status,
            start_vm,
            stop_vm,
            shutdown_vm,
            reboot_vm,
            suspend_vm,
            resume_vm,
            get_disks,
            add_disk,
            resize_disk,
            remove_disk,
            move_disk,
            get_network_interfaces,
            add_nic,
            edit_nic,
            remove_nic,
            get_snapshots,
            create_snapshot,
            delete_snapshot,
            rollback_snapshot,
            migrate_vm,
            update_vm_config,
            create_vnc_proxy,
            create_term_proxy,
            get_websocket_url,
            connect_websocket,
            disconnect_websocket,
            is_websocket_connected,
            start_console_proxy,
            stop_console_proxy,
            get_backup_jobs,
            get_backups,
            create_backup_job,
            update_backup_job,
            delete_backup_job,
            run_backup,
            restore_backup,
            delete_backup,
            update_tray_menu,
        ])
        .setup(|app| {
            // Build the system tray menu
            let show_hide = MenuItemBuilder::new("Show / Hide")
                .id("show_hide")
                .build(app)?;
            let quit = MenuItemBuilder::new("Quit").id("quit").build(app)?;

            let menu = MenuBuilder::new(app)
                .item(&show_hide)
                .separator()
                .item(&quit)
                .build()?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .tooltip("Clustri")
                .icon(app.default_window_icon().cloned().expect("no default icon"))
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show_hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            if window.is_visible().unwrap_or(false) {
                                let _ = window.hide();
                            } else {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    // Connection entries are dynamic menu items added by the
                    // frontend via `update_tray_menu`. Clicking one switches
                    // the active connection there, so forward the id as an
                    // event instead of reaching into the backend state here.
                    id if id.starts_with("connection_") => {
                        if let Some(connection_id) = id.strip_prefix("connection_") {
                            let _ = app.emit("tray-connection-click", connection_id.to_string());
                        }
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
