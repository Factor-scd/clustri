use serde::{Deserialize, Serialize};

/// Deserializes an integer that Proxmox reports either as a JSON number
/// (integer or integral float) or as a numeric string, inconsistently across
/// versions and endpoints.
pub(crate) fn de_u32_lenient<'de, D>(deserializer: D) -> std::result::Result<u32, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct U32Visitor;

    impl<'de> serde::de::Visitor<'de> for U32Visitor {
        type Value = u32;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("an integer, an integral number, or a numeric string")
        }

        fn visit_u64<E: serde::de::Error>(self, value: u64) -> std::result::Result<u32, E> {
            u32::try_from(value).map_err(|_| E::custom(format!("value {} out of range", value)))
        }

        fn visit_i64<E: serde::de::Error>(self, value: i64) -> std::result::Result<u32, E> {
            u32::try_from(value).map_err(|_| E::custom(format!("value {} out of range", value)))
        }

        fn visit_f64<E: serde::de::Error>(self, value: f64) -> std::result::Result<u32, E> {
            if value.fract() == 0.0 && value >= 0.0 && value <= u32::MAX as f64 {
                Ok(value as u32)
            } else {
                Err(E::custom(format!("value {} is not a valid integer", value)))
            }
        }

        fn visit_str<E: serde::de::Error>(self, value: &str) -> std::result::Result<u32, E> {
            value
                .parse::<u32>()
                .map_err(|_| E::custom(format!("invalid integer string '{}'", value)))
        }
    }

    deserializer.deserialize_any(U32Visitor)
}

/// Deserializes a `u64` that Proxmox reports either as a JSON number (integer
/// or integral float) or as a numeric string.
pub(crate) fn de_u64_lenient<'de, D>(deserializer: D) -> std::result::Result<u64, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct U64Visitor;

    impl<'de> serde::de::Visitor<'de> for U64Visitor {
        type Value = u64;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("an integer, an integral number, or a numeric string")
        }

        fn visit_u64<E: serde::de::Error>(self, value: u64) -> std::result::Result<u64, E> {
            Ok(value)
        }

        fn visit_i64<E: serde::de::Error>(self, value: i64) -> std::result::Result<u64, E> {
            u64::try_from(value).map_err(|_| E::custom(format!("value {} out of range", value)))
        }

        fn visit_f64<E: serde::de::Error>(self, value: f64) -> std::result::Result<u64, E> {
            if value.fract() == 0.0 && value >= 0.0 && value <= u64::MAX as f64 {
                Ok(value as u64)
            } else {
                Err(E::custom(format!("value {} is not a valid integer", value)))
            }
        }

        fn visit_str<E: serde::de::Error>(self, value: &str) -> std::result::Result<u64, E> {
            value
                .parse::<u64>()
                .map_err(|_| E::custom(format!("invalid integer string '{}'", value)))
        }
    }

    deserializer.deserialize_any(U64Visitor)
}

/// Deserializes an optional `u64` that may be absent, null, a JSON number
/// (integer or integral float), or a numeric string.
pub(crate) fn de_u64_opt_lenient<'de, D>(deserializer: D) -> std::result::Result<Option<u64>, D::Error>
where
    D: serde::Deserializer<'de>,
{
    struct OptU64Visitor;

    impl<'de> serde::de::Visitor<'de> for OptU64Visitor {
        type Value = Option<u64>;

        fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
            formatter.write_str("an integer, an integral number, a numeric string, or null")
        }

        fn visit_none<E: serde::de::Error>(self) -> std::result::Result<Option<u64>, E> {
            Ok(None)
        }

        fn visit_unit<E: serde::de::Error>(self) -> std::result::Result<Option<u64>, E> {
            Ok(None)
        }

        fn visit_some<D>(self, inner: D) -> std::result::Result<Option<u64>, D::Error>
        where
            D: serde::Deserializer<'de>,
        {
            de_u64_lenient(inner).map(Some)
        }
    }

    deserializer.deserialize_option(OptU64Visitor)
}

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
    #[serde(default)]
    pub cpu: f64,
    #[serde(default, deserialize_with = "de_u32_lenient")]
    pub maxcpu: u32,
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
    pub level: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
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
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub node: String,
    #[serde(default)]
    pub cpu: f64,
    #[serde(default, deserialize_with = "de_u32_lenient")]
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
    #[serde(default)]
    pub storage: String,
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
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
    #[serde(default)]
    pub upid: String,
    #[serde(default)]
    pub node: String,
    #[serde(default)]
    pub pid: u32,
    #[serde(default)]
    pub pstart: u64,
    #[serde(default)]
    pub starttime: u64,
    #[serde(default)]
    pub endtime: Option<u64>,
    #[serde(default)]
    pub r#type: String,
    #[serde(default)]
    pub id: String,
    #[serde(default)]
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
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub nodeid: u32,
    #[serde(default)]
    pub online: u32,
    #[serde(default)]
    pub local: Option<u32>,
    #[serde(default)]
    pub ip: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub snaptime: u64,
    #[serde(default)]
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
pub struct NetworkInterface {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
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
pub struct UpdateVMConfig {
    pub name: Option<String>,
    pub cores: Option<u32>,
    /// Memory size in MiB.
    pub memory: Option<u64>,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Backup {
    #[serde(default)]
    pub volid: String,
    #[serde(default)]
    pub backupid: String,
    #[serde(rename = "backup-type")]
    pub backup_type: String,
    #[serde(rename = "backup-id")]
    pub backup_id: String,
    #[serde(rename = "backup-time")]
    pub backup_time: u64,
    #[serde(default)]
    pub storage: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default)]
    pub ctime: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupJob {
    pub id: String,
    /// The server sends `storage` (not `store`).
    #[serde(rename = "storage")]
    pub store: String,
    pub schedule: String,
    /// `all` is only present on jobs that back up every guest; jobs with an
    /// explicit `vmid` selection omit it.
    #[serde(default)]
    pub all: u32,
    #[serde(default)]
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
    #[serde(default)]
    pub content: String,
    #[serde(default, deserialize_with = "de_u64_lenient")]
    pub ctime: u64,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default, deserialize_with = "de_u64_opt_lenient")]
    pub size: Option<u64>,
    #[serde(default)]
    pub subtype: Option<String>,
    #[serde(default)]
    pub volid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageDetail {
    #[serde(default)]
    pub storage: String,
    pub r#type: String,
    pub content: String,
    #[serde(default, deserialize_with = "de_u32_lenient")]
    pub active: u32,
    #[serde(default, deserialize_with = "de_u32_lenient")]
    pub enabled: u32,
    #[serde(default, deserialize_with = "de_u32_lenient")]
    pub shared: u32,
    #[serde(default, deserialize_with = "de_u64_lenient")]
    pub used: u64,
    #[serde(default, deserialize_with = "de_u64_lenient")]
    pub total: u64,
    #[serde(default, deserialize_with = "de_u64_lenient")]
    pub avail: u64,
    #[serde(default)]
    pub node: String,
}
