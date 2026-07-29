use serde::{Deserialize, Serialize};

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Disk {
    pub device: String,
    pub size: u64,
    pub storage: String,
    pub format: String,
    pub usage: Option<String>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddDiskConfig {
    pub storage: String,
    pub size: u64,
    pub bus_type: String,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Node {
    pub node: String,
    pub status: String,
    pub cpu: f64,
    pub maxcpu: u32,
    pub mem: u64,
    pub maxmem: u64,
    pub disk: u64,
    pub maxdisk: u64,
    pub uptime: u64,
    pub level: String,
    pub id: String,
    pub r#type: String,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VM {
    pub vmid: u32,
    pub name: Option<String>,
    pub status: String,
    pub r#type: String,
    pub node: String,
    pub cpu: f64,
    pub cpus: u32,
    pub mem: u64,
    pub maxmem: u64,
    pub disk: u64,
    pub maxdisk: u64,
    pub uptime: u64,
    pub netin: u64,
    pub netout: u64,
    pub diskread: u64,
    pub diskwrite: u64,
    pub pid: Option<u32>,
    pub template: Option<u32>,
    pub lock: Option<String>,
    pub tags: Option<String>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Storage {
    pub storage: String,
    pub r#type: String,
    pub content: String,
    pub active: u32,
    pub enabled: u32,
    pub shared: u32,
    pub used: u64,
    pub total: u64,
    pub avail: u64,
    pub node: String,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub upid: String,
    pub node: String,
    pub pid: u32,
    pub pstart: u64,
    pub starttime: u64,
    pub endtime: Option<u64>,
    pub r#type: String,
    pub id: String,
    pub user: String,
    pub status: Option<String>,
    pub exitstatus: Option<String>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterStatus {
    pub r#type: String,
    pub name: String,
    pub id: String,
    pub nodes: Option<Vec<ClusterNode>>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterNode {
    pub name: String,
    pub nodeid: u32,
    pub online: u32,
    pub local: Option<u32>,
    pub ip: Option<String>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Snapshot {
    pub name: String,
    pub description: String,
    pub snaptime: u64,
    pub vmstate: u32,
    pub parent: Option<String>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSnapshotConfig {
    pub name: String,
    pub description: Option<String>,
    pub vmstate: Option<bool>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub data: T,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkInterface {
    pub name: String,
    pub model: String,
    pub macaddr: String,
    pub bridge: Option<String>,
    pub tag: Option<u32>,
    pub firewall: Option<u32>,
    pub link_down: Option<u32>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AddNICConfig {
    pub bridge: String,
    pub model: String,
    pub macaddr: Option<String>,
    pub tag: Option<u32>,
    pub firewall: Option<bool>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EditNICConfig {
    pub bridge: Option<String>,
    pub model: Option<String>,
    pub tag: Option<u32>,
    pub firewall: Option<bool>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Backup {
    pub volid: String,
    pub backupid: String,
    #[serde(rename = "backup-type")]
    pub backup_type: String,
    #[serde(rename = "backup-id")]
    pub backup_id: String,
    #[serde(rename = "backup-time")]
    pub backup_time: u64,
    pub storage: String,
    pub size: u64,
    pub ctime: u64,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupJob {
    pub id: String,
    pub store: String,
    pub schedule: String,
    pub all: u32,
    pub enabled: u32,
    pub node: Option<String>,
    pub vmid: Option<String>,
    pub compress: Option<String>,
    pub mode: Option<String>,
    pub quiet: Option<u32>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackupJobConfig {
    pub id: Option<String>,
    pub storage: String,
    pub schedule: String,
    pub mode: String,
    pub compression: String,
    pub all: bool,
    pub vmid: Option<String>,
    pub enabled: bool,
    pub node: Option<String>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RestoreConfig {
    pub volid: String,
    pub node: String,
    pub storage: String,
    pub vmid: Option<u32>,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageContent {
    pub content: String,
    pub ctime: u64,
    pub format: Option<String>,
    pub size: Option<u64>,
    pub subtype: Option<String>,
    pub volid: String,
}

#[serde(rename_all = "camelCase")]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StorageDetail {
    pub storage: String,
    pub r#type: String,
    pub content: String,
    pub active: u32,
    pub enabled: u32,
    pub shared: u32,
    pub used: u64,
    pub total: u64,
    pub avail: u64,
    pub node: String,
}
