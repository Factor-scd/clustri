use crate::error::Error;
use crate::proxmox::{
    AddDiskConfig, AddNICConfig, ApiResponse, Backup, BackupJob, BackupJobConfig, ClusterStatus,
    CreateSnapshotConfig, Disk, EditNICConfig, NetworkInterface, Node, RestoreConfig, Snapshot,
    Storage, StorageContent, StorageDetail, Task, VM,
};
use crate::{CertificateInfo, ConnectionConfig, EndpointConfig, LoginResult, TermProxyResponse, VNCProxyResponse};
use reqwest::Client;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

struct Connection {
    config: ConnectionConfig,
    client: Client,
    ticket: Option<String>,
    csrf_token: Option<String>,
    current_endpoint_index: usize,
}

fn keyring_service() -> &'static str {
    "proxmox-desktop"
}

fn keyring_entry(connection_id: &str, field: &str) -> keyring::Entry {
    let key = format!("{}:{}", connection_id, field);
    keyring::Entry::new(keyring_service(), &key)
        .expect("failed to create keyring entry")
}

pub struct ConnectionManager {
    connections: HashMap<String, Connection>,
}

impl ConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: HashMap::new(),
        }
    }

    pub async fn add_connection(&self, config: ConnectionConfig) -> crate::Result<()> {
        if config.primary.url.is_empty() {
            return Err(Error::InvalidUrl("URL cannot be empty".to_string()));
        }
        Ok(())
    }

    pub async fn remove_connection(&self, id: &str) -> crate::Result<()> {
        // Clear stored credentials from keyring
        let _ = keyring_entry(id, "ticket").delete_credential();
        let _ = keyring_entry(id, "csrf_token").delete_credential();
        let _ = keyring_entry(id, "password").delete_credential();
        let _ = keyring_entry(id, "token").delete_credential();
        Ok(())
    }

    pub async fn connect(&self, id: &str) -> crate::Result<()> {
        Ok(())
    }

    pub async fn disconnect(&self, id: &str) -> crate::Result<()> {
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

        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| Error::HttpError(e))?;

        let login_url = format!("{}/access/ticket", url);

        let params = [
            ("username", username),
            ("password", password),
        ];

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

        Ok(LoginResult {
            connection_id: String::new(),
            ticket,
            csrf_token,
        })
    }

    pub async fn login_with_token(
        &self,
        url: &str,
        token: &str,
    ) -> crate::Result<LoginResult> {
        if url.is_empty() {
            return Err(Error::InvalidUrl("URL cannot be empty".to_string()));
        }
        if token.is_empty() {
            return Err(Error::InvalidCredentials("API token cannot be empty".to_string()));
        }

        let client = Client::builder()
            .danger_accept_invalid_certs(true)
            .build()
            .map_err(|e| Error::HttpError(e))?;

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

        Ok(LoginResult {
            connection_id: String::new(),
            ticket: token.to_string(),
            csrf_token: String::new(),
        })
    }

    pub async fn logout(&self, connection_id: &str) -> crate::Result<()> {
        let _ = keyring_entry(connection_id, "ticket").delete_credential();
        let _ = keyring_entry(connection_id, "csrf_token").delete_credential();
        let _ = keyring_entry(connection_id, "password").delete_credential();
        let _ = keyring_entry(connection_id, "token").delete_credential();
        Ok(())
    }

    pub async fn get_stored_credentials(&self, connection_id: &str) -> crate::Result<Option<String>> {
        match keyring_entry(connection_id, "ticket").get_password() {
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
        keyring_entry(connection_id, "ticket")
            .set_password(ticket)
            .map_err(|e| Error::KeyringError(e.to_string()))?;
        keyring_entry(connection_id, "csrf_token")
            .set_password(csrf_token)
            .map_err(|e| Error::KeyringError(e.to_string()))?;
        if let Some(pw) = password {
            keyring_entry(connection_id, "password")
                .set_password(pw)
                .map_err(|e| Error::KeyringError(e.to_string()))?;
        }
        if let Some(tok) = api_token {
            keyring_entry(connection_id, "token")
                .set_password(tok)
                .map_err(|e| Error::KeyringError(e.to_string()))?;
        }
        Ok(())
    }

    pub async fn refresh_ticket(
        &self,
        connection_id: &str,
        url: &str,
    ) -> crate::Result<LoginResult> {
        // Try to get stored password for re-authentication
        let password = keyring_entry(connection_id, "password")
            .get_password()
            .map_err(|e| Error::KeyringError(e.to_string()))?;

        // Extract username from stored ticket or use default
        let username = keyring_entry(connection_id, "csrf_token")
            .get_password()
            .unwrap_or_default();

        self.login_with_password(url, &username, &password).await
    }

    pub async fn get_certificate_info(&self, url: &str) -> crate::Result<CertificateInfo> {
        Ok(CertificateInfo {
            fingerprint: "AB:CD:EF:12:34:56:78:90".to_string(),
            issuer: "Proxmox".to_string(),
            subject: "pve".to_string(),
            valid_from: "2024-01-01".to_string(),
            valid_to: "2034-01-01".to_string(),
            self_signed: true,
        })
    }

    pub async fn trust_certificate(&self, id: &str, fingerprint: &str) -> crate::Result<()> {
        Ok(())
    }

    pub async fn get_nodes(&self, connection_id: &str) -> crate::Result<Vec<Node>> {
        Ok(vec![])
    }

    pub async fn get_vms(&self, connection_id: &str) -> crate::Result<Vec<VM>> {
        Ok(vec![])
    }

    pub async fn get_storage(&self, connection_id: &str) -> crate::Result<Vec<Storage>> {
        Ok(vec![])
    }

    pub async fn get_storage_content(
        &self,
        _connection_id: &str,
        _storage: &str,
    ) -> crate::Result<Vec<StorageContent>> {
        Ok(vec![])
    }

    pub async fn get_storage_detail(
        &self,
        _connection_id: &str,
        _node: &str,
        _storage: &str,
    ) -> crate::Result<StorageDetail> {
        Ok(StorageDetail {
            storage: String::new(),
            r#type: String::new(),
            content: String::new(),
            active: 0,
            enabled: 0,
            shared: 0,
            used: 0,
            total: 0,
            avail: 0,
            node: String::new(),
        })
    }

    pub async fn get_tasks(&self, connection_id: &str) -> crate::Result<Vec<Task>> {
        Ok(vec![])
    }

    pub async fn get_cluster_status(&self, connection_id: &str) -> crate::Result<ClusterStatus> {
        Ok(ClusterStatus {
            r#type: "cluster".to_string(),
            name: "default".to_string(),
            id: "cluster/default".to_string(),
            nodes: None,
        })
    }

    pub async fn start_vm(&self, connection_id: &str, node: &str, vmid: u32) -> crate::Result<()> {
        Ok(())
    }

    pub async fn stop_vm(&self, connection_id: &str, node: &str, vmid: u32) -> crate::Result<()> {
        Ok(())
    }

    pub async fn shutdown_vm(&self, connection_id: &str, node: &str, vmid: u32) -> crate::Result<()> {
        Ok(())
    }

    pub async fn reboot_vm(&self, connection_id: &str, node: &str, vmid: u32) -> crate::Result<()> {
        Ok(())
    }

    pub async fn suspend_vm(&self, connection_id: &str, node: &str, vmid: u32) -> crate::Result<()> {
        Ok(())
    }

    pub async fn resume_vm(&self, connection_id: &str, node: &str, vmid: u32) -> crate::Result<()> {
        Ok(())
    }

    pub async fn get_disks(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
    ) -> crate::Result<Vec<Disk>> {
        Ok(vec![])
    }

    pub async fn add_disk(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        _config: AddDiskConfig,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn resize_disk(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        _disk: &str,
        _size: u64,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn remove_disk(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        _disk: &str,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn move_disk(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        _disk: &str,
        _storage: &str,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn get_network_interfaces(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
    ) -> crate::Result<Vec<NetworkInterface>> {
        Ok(vec![])
    }

    pub async fn add_nic(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        _config: AddNICConfig,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn edit_nic(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        _nic: &str,
        _config: EditNICConfig,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn remove_nic(
        &self,
        connection_id: &str,
        node: &str,
        vmid: u32,
        _nic: &str,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn get_snapshots(
        &self,
        _connection_id: &str,
        _node: &str,
        _vmid: u32,
    ) -> crate::Result<Vec<Snapshot>> {
        Ok(vec![])
    }

    pub async fn create_snapshot(
        &self,
        _connection_id: &str,
        _node: &str,
        _vmid: u32,
        _config: CreateSnapshotConfig,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn delete_snapshot(
        &self,
        _connection_id: &str,
        _node: &str,
        _vmid: u32,
        _name: &str,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn rollback_snapshot(
        &self,
        _connection_id: &str,
        _node: &str,
        _vmid: u32,
        _name: &str,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn migrate_vm(
        &self,
        _connection_id: &str,
        _node: &str,
        _vmid: u32,
        _target_node: &str,
        _online: bool,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn create_vnc_proxy(
        &self,
        _connection_id: &str,
        _node: &str,
        _vmid: u32,
    ) -> crate::Result<VNCProxyResponse> {
        Ok(VNCProxyResponse {
            ticket: String::new(),
            port: 0,
            cert: String::new(),
        })
    }

    pub async fn create_term_proxy(
        &self,
        _connection_id: &str,
        _node: &str,
        _vmid: u32,
    ) -> crate::Result<TermProxyResponse> {
        Ok(TermProxyResponse {
            ticket: String::new(),
            port: 0,
        })
    }

    pub async fn get_websocket_url(
        &self,
        _connection_id: &str,
        _node: &str,
    ) -> crate::Result<String> {
        Ok(String::new())
    }

    pub async fn get_backup_jobs(
        &self,
        _connection_id: &str,
    ) -> crate::Result<Vec<BackupJob>> {
        Ok(vec![])
    }

    pub async fn get_backups(
        &self,
        _connection_id: &str,
        _storage: Option<&str>,
    ) -> crate::Result<Vec<Backup>> {
        Ok(vec![])
    }

    pub async fn create_backup_job(
        &self,
        _connection_id: &str,
        _config: BackupJobConfig,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn update_backup_job(
        &self,
        _connection_id: &str,
        _id: &str,
        _config: BackupJobConfig,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn delete_backup_job(
        &self,
        _connection_id: &str,
        _id: &str,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn run_backup(
        &self,
        _connection_id: &str,
        _config: BackupJobConfig,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn restore_backup(
        &self,
        _connection_id: &str,
        _volid: &str,
        _config: RestoreConfig,
    ) -> crate::Result<()> {
        Ok(())
    }

    pub async fn delete_backup(
        &self,
        _connection_id: &str,
        _volid: &str,
    ) -> crate::Result<()> {
        Ok(())
    }
}
