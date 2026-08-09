use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Disk {
    pub device: String,
    pub size: u64,
    pub storage: String,
    pub format: String,
    #[serde(default)]
    pub usage: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddDiskConfig {
    pub storage: String,
    pub size: u64,
    pub bus_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Node {
    #[serde(default)]
    pub node: String,
    #[serde(default)]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VM {
    #[serde(default)]
    pub vmid: u32,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub status: String,
    pub r#type: String,
    #[serde(default)]
    pub node: String,
    #[serde(default)]
    pub cpu: f64,
    #[serde(default)]
    pub cpus: u32,
    #[serde(default)]
    pub mem: u64,
    #[serde(default)]
    pub maxmem: u64,
    #[serde(default)]
    pub disk: u64,
    #[serde(default)]
    pub maxdisk: u64,
    #[serde(default)]
    pub uptime: u64,
    #[serde(default)]
    pub netin: u64,
    #[serde(default)]
    pub netout: u64,
    #[serde(default)]
    pub diskread: u64,
    #[serde(default)]
    pub diskwrite: u64,
    #[serde(default)]
    pub pid: Option<u32>,
    #[serde(default)]
    pub template: Option<u32>,
    #[serde(default)]
    pub lock: Option<String>,
    #[serde(default)]
    pub tags: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Storage {
    pub storage: String,
    pub r#type: String,
    pub content: String,
    #[serde(default)]
    pub active: u32,
    #[serde(default)]
    pub enabled: u32,
    #[serde(default)]
    pub shared: u32,
    #[serde(default)]
    pub used: u64,
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub avail: u64,
    #[serde(default)]
    pub node: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub upid: String,
    #[serde(default)]
    pub node: String,
    pub pid: u32,
    pub pstart: u64,
    pub starttime: u64,
    #[serde(default)]
    pub endtime: Option<u64>,
    pub r#type: String,
    pub id: String,
    pub user: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub exitstatus: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterStatus {
    pub r#type: String,
    pub name: String,
    pub id: String,
    pub nodes: Option<Vec<ClusterNode>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClusterNode {
    pub name: String,
    pub nodeid: u32,
    pub online: u32,
    pub local: Option<u32>,
    pub ip: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub snaptime: u64,
    pub vmstate: u32,
    #[serde(default)]
    pub parent: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSnapshotConfig {
    pub name: String,
    pub description: Option<String>,
    pub vmstate: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T> {
    pub data: T,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NetworkInterface {
    pub name: String,
    pub model: String,
    pub macaddr: String,
    #[serde(default)]
    pub bridge: Option<String>,
    #[serde(default)]
    pub tag: Option<u32>,
    #[serde(default)]
    pub firewall: Option<u32>,
    #[serde(default)]
    pub link_down: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddNICConfig {
    pub bridge: String,
    pub model: String,
    pub macaddr: Option<String>,
    pub tag: Option<u32>,
    pub firewall: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EditNICConfig {
    pub bridge: Option<String>,
    pub model: Option<String>,
    pub tag: Option<u32>,
    pub firewall: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupJob {
    pub id: String,
    pub store: String,
    pub schedule: String,
    pub all: u32,
    pub enabled: u32,
    #[serde(default)]
    pub node: Option<String>,
    #[serde(default)]
    pub vmid: Option<String>,
    #[serde(default)]
    pub compress: Option<String>,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub quiet: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreConfig {
    pub volid: String,
    pub node: String,
    pub storage: String,
    pub vmid: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageContent {
    pub content: String,
    pub ctime: u64,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub subtype: Option<String>,
    pub volid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageDetail {
    pub storage: String,
    pub r#type: String,
    pub content: String,
    #[serde(default)]
    pub active: u32,
    #[serde(default)]
    pub enabled: u32,
    #[serde(default)]
    pub shared: u32,
    #[serde(default)]
    pub used: u64,
    #[serde(default)]
    pub total: u64,
    #[serde(default)]
    pub avail: u64,
    #[serde(default)]
    pub node: String,
}
