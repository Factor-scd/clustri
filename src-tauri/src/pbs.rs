//! Proxmox Backup Server (PBS) backend.
//!
//! PBS shares the JSON `{data}` envelope and the token/ticket authentication
//! model with Proxmox VE, but it is single-host and exposes its own endpoint
//! set. All datastore operations live here; the HTTP plumbing (auth headers,
//! endpoint rotation, envelope unwrapping, binary downloads) is shared from
//! `crate::connection`.
//!
//! The PBS API reports kebab-case JSON keys. The public structs serialize as
//! camelCase for the frontend, so the ones deserialized straight from a
//! response use `rename_all(serialize = "camelCase", deserialize =
//! "kebab-case")`; the datastore and gc-status structs are assembled from raw
//! kebab-case intermediate structs and only ever serialize to the frontend.

use crate::connection::{parse_api, ConnectionManager};
use crate::proxmox::Task;
use reqwest::Method;
use serde::{Deserialize, Serialize};
use std::path::Path;

// ---------------------------------------------------------------------------
// Public types (frontend-facing camelCase shapes)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PbsDatastore {
    pub store: String,
    #[serde(default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub backend_type: Option<String>,
    #[serde(default)]
    pub mount_status: Option<String>,
    #[serde(default)]
    pub maintenance: Option<String>,
    #[serde(default)]
    pub total: Option<u64>,
    #[serde(default)]
    pub used: Option<u64>,
    #[serde(default)]
    pub avail: Option<u64>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub estimated_full_date: Option<i64>,
    #[serde(default)]
    pub history: Option<Vec<f64>>,
    #[serde(default)]
    pub gc_status: Option<PbsGcStatus>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PbsGcStatus {
    #[serde(default)]
    pub disk_bytes: Option<u64>,
    #[serde(default)]
    pub disk_chunks: Option<u64>,
    #[serde(default)]
    pub index_data_bytes: Option<u64>,
    #[serde(default)]
    pub index_file_count: Option<u64>,
    #[serde(default)]
    pub pending_bytes: Option<u64>,
    #[serde(default)]
    pub pending_chunks: Option<u64>,
    #[serde(default)]
    pub removed_bad: Option<u64>,
    #[serde(default)]
    pub removed_bytes: Option<u64>,
    #[serde(default)]
    pub removed_chunks: Option<u64>,
    #[serde(default)]
    pub still_bad: Option<u64>,
    #[serde(default)]
    pub cache_hits: Option<u64>,
    #[serde(default)]
    pub cache_misses: Option<u64>,
    #[serde(default)]
    pub upid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PbsVersion {
    pub version: String,
    pub release: String,
    pub repoid: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "kebab-case"))]
pub struct PbsNodeStatus {
    #[serde(default)]
    pub cpu: Option<f64>,
    #[serde(default)]
    pub loadavg: Option<Vec<f64>>,
    #[serde(default)]
    pub uptime: Option<u64>,
    #[serde(default)]
    pub memory: Option<PbsMem>,
    #[serde(default)]
    pub root: Option<PbsMem>,
    #[serde(default)]
    pub swap: Option<PbsMem>,
    #[serde(default)]
    pub cpuinfo: Option<PbsCpuInfo>,
    #[serde(default)]
    pub current_kernel: Option<PbsKernel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PbsMem {
    #[serde(default)]
    pub free: Option<u64>,
    #[serde(default)]
    pub total: Option<u64>,
    #[serde(default)]
    pub used: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PbsCpuInfo {
    #[serde(default)]
    pub cpus: Option<u32>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub sockets: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PbsKernel {
    #[serde(default)]
    pub machine: Option<String>,
    #[serde(default)]
    pub release: Option<String>,
    #[serde(default)]
    pub sysname: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "kebab-case"))]
pub struct PbsBackupGroup {
    pub backup_id: String,
    pub backup_type: String,
    #[serde(default)]
    pub backup_count: Option<u32>,
    #[serde(default)]
    pub last_backup: Option<i64>,
    #[serde(default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub files: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "kebab-case"))]
pub struct PbsSnapshot {
    pub backup_id: String,
    pub backup_type: String,
    pub backup_time: i64,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub protected: Option<bool>,
    #[serde(default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub files: Option<Vec<String>>,
    #[serde(default)]
    pub fingerprint: Option<String>,
    #[serde(default)]
    pub owner: Option<String>,
    #[serde(default)]
    pub verification: Option<PbsVerification>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PbsVerification {
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub upid: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "kebab-case"))]
pub struct PbsSnapshotFile {
    pub filename: String,
    #[serde(default)]
    pub size: Option<u64>,
    #[serde(default)]
    pub crypt_mode: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all(serialize = "camelCase", deserialize = "kebab-case"))]
pub struct PbsJob {
    pub id: String,
    #[serde(default)]
    pub store: Option<String>,
    #[serde(default)]
    pub schedule: Option<String>,
    #[serde(default)]
    pub comment: Option<String>,
    #[serde(default)]
    pub disable: Option<bool>,
    #[serde(default)]
    pub last_run_state: Option<String>,
    #[serde(default)]
    pub last_run_endtime: Option<i64>,
    #[serde(default)]
    pub next_run: Option<i64>,
    #[serde(default)]
    pub keep_last: Option<u32>,
    #[serde(default)]
    pub keep_daily: Option<u32>,
    #[serde(default)]
    pub keep_weekly: Option<u32>,
    #[serde(default)]
    pub keep_monthly: Option<u32>,
    #[serde(default)]
    pub keep_yearly: Option<u32>,
    #[serde(default)]
    pub ignore_verified: Option<bool>,
    #[serde(default)]
    pub max_depth: Option<u32>,
}

// ---------------------------------------------------------------------------
// Raw kebab-case response shapes (not serialized to the frontend)
// ---------------------------------------------------------------------------

/// Raw `/status/datastore-usage` entry. The usage endpoint reports kebab-case
/// keys and nests the cache stats inside `gc-status.cache-stats`, so the
/// public [`PbsDatastore`]/[`PbsGcStatus`] structs are built from this by
/// hand rather than deserialized directly.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct PbsDatastoreUsageRaw {
    store: String,
    #[serde(default)]
    backend_type: Option<String>,
    #[serde(default)]
    mount_status: Option<String>,
    #[serde(default)]
    avail: Option<u64>,
    #[serde(default)]
    total: Option<u64>,
    #[serde(default)]
    used: Option<u64>,
    #[serde(default)]
    error: Option<String>,
    #[serde(default)]
    estimated_full_date: Option<i64>,
    #[serde(default)]
    history: Option<Vec<f64>>,
    #[serde(default)]
    gc_status: Option<PbsGcStatusRaw>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct PbsGcStatusRaw {
    #[serde(default)]
    disk_bytes: Option<u64>,
    #[serde(default)]
    disk_chunks: Option<u64>,
    #[serde(default)]
    index_data_bytes: Option<u64>,
    #[serde(default)]
    index_file_count: Option<u64>,
    #[serde(default)]
    pending_bytes: Option<u64>,
    #[serde(default)]
    pending_chunks: Option<u64>,
    #[serde(default)]
    removed_bad: Option<u64>,
    #[serde(default)]
    removed_bytes: Option<u64>,
    #[serde(default)]
    removed_chunks: Option<u64>,
    #[serde(default)]
    still_bad: Option<u64>,
    #[serde(default)]
    cache_stats: Option<PbsCacheStatsRaw>,
    #[serde(default)]
    upid: Option<String>,
}

#[derive(Debug, Deserialize)]
struct PbsCacheStatsRaw {
    #[serde(default)]
    hits: Option<u64>,
    #[serde(default)]
    misses: Option<u64>,
}

/// Raw `/admin/datastore` entry carrying the static datastore config that the
/// usage endpoint does not report (comment, maintenance).
#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct PbsDatastoreConfigRaw {
    store: String,
    #[serde(default)]
    comment: Option<String>,
    #[serde(default)]
    backend_type: Option<String>,
    #[serde(default)]
    mount_status: Option<String>,
    #[serde(default)]
    maintenance: Option<String>,
}

/// Raw `/admin/gc` job entry. GC jobs carry no `id` — the store identifies the
/// job — so `id` falls back to `store` when mapping to [`PbsJob`].
#[derive(Debug, Deserialize)]
#[serde(rename_all = "kebab-case")]
struct PbsGcJobRaw {
    store: String,
    #[serde(default)]
    schedule: Option<String>,
    #[serde(default)]
    comment: Option<String>,
    #[serde(default)]
    disable: Option<bool>,
    #[serde(default)]
    last_run_state: Option<String>,
    #[serde(default)]
    last_run_endtime: Option<i64>,
    #[serde(default)]
    next_run: Option<i64>,
    #[serde(default)]
    keep_last: Option<u32>,
    #[serde(default)]
    keep_daily: Option<u32>,
    #[serde(default)]
    keep_weekly: Option<u32>,
    #[serde(default)]
    keep_monthly: Option<u32>,
    #[serde(default)]
    keep_yearly: Option<u32>,
    #[serde(default)]
    ignore_verified: Option<bool>,
    #[serde(default)]
    max_depth: Option<u32>,
}

impl From<PbsDatastoreUsageRaw> for PbsDatastore {
    fn from(raw: PbsDatastoreUsageRaw) -> Self {
        PbsDatastore {
            store: raw.store,
            comment: None,
            backend_type: raw.backend_type,
            mount_status: raw.mount_status,
            maintenance: None,
            total: raw.total,
            used: raw.used,
            avail: raw.avail,
            error: raw.error,
            estimated_full_date: raw.estimated_full_date,
            history: raw.history,
            gc_status: raw.gc_status.map(Into::into),
        }
    }
}

impl From<PbsGcStatusRaw> for PbsGcStatus {
    fn from(raw: PbsGcStatusRaw) -> Self {
        PbsGcStatus {
            disk_bytes: raw.disk_bytes,
            disk_chunks: raw.disk_chunks,
            index_data_bytes: raw.index_data_bytes,
            index_file_count: raw.index_file_count,
            pending_bytes: raw.pending_bytes,
            pending_chunks: raw.pending_chunks,
            removed_bad: raw.removed_bad,
            removed_bytes: raw.removed_bytes,
            removed_chunks: raw.removed_chunks,
            still_bad: raw.still_bad,
            cache_hits: raw.cache_stats.as_ref().and_then(|stats| stats.hits),
            cache_misses: raw.cache_stats.as_ref().and_then(|stats| stats.misses),
            upid: raw.upid,
        }
    }
}

impl From<PbsGcJobRaw> for PbsJob {
    fn from(raw: PbsGcJobRaw) -> Self {
        PbsJob {
            id: raw.store.clone(),
            store: Some(raw.store),
            schedule: raw.schedule,
            comment: raw.comment,
            disable: raw.disable,
            last_run_state: raw.last_run_state,
            last_run_endtime: raw.last_run_endtime,
            next_run: raw.next_run,
            keep_last: raw.keep_last,
            keep_daily: raw.keep_daily,
            keep_weekly: raw.keep_weekly,
            keep_monthly: raw.keep_monthly,
            keep_yearly: raw.keep_yearly,
            ignore_verified: raw.ignore_verified,
            max_depth: raw.max_depth,
        }
    }
}

// ---------------------------------------------------------------------------
// PBS API methods
// ---------------------------------------------------------------------------

impl ConnectionManager {
    /// True when the connection targets a PBS server rather than a PVE
    /// cluster.
    pub fn is_pbs(&self, connection_id: &str) -> crate::Result<bool> {
        Ok(self.connection(connection_id)?.config.server_type == "pbs")
    }

    /// Lists the datastores with their live usage from `/status/datastore-usage`,
    /// then merges the static datastore config (`/admin/datastore`: comment,
    /// maintenance, mount status) onto each entry by `store`. A failure of the
    /// usage call propagates; a failure of the config call degrades to the
    /// usage-only list.
    pub async fn pbs_get_datastores(&self, connection_id: &str) -> crate::Result<Vec<PbsDatastore>> {
        let conn = self.connection(connection_id)?;
        let data = conn
            .request(Method::GET, "/status/datastore-usage", &[], None)
            .await?;
        let usage: Vec<PbsDatastoreUsageRaw> = parse_api("/status/datastore-usage", data)?;
        let mut datastores: Vec<PbsDatastore> = usage.into_iter().map(Into::into).collect();

        if let Ok(config_data) = conn.request(Method::GET, "/admin/datastore", &[], None).await {
            if let Ok(configs) =
                parse_api::<Vec<PbsDatastoreConfigRaw>>("/admin/datastore", config_data)
            {
                for config in configs {
                    if let Some(datastore) = datastores
                        .iter_mut()
                        .find(|datastore| datastore.store == config.store)
                    {
                        // Only overwrite with fields the config actually
                        // reports, so usage-derived values survive an omitted
                        // key.
                        if config.comment.is_some() {
                            datastore.comment = config.comment;
                        }
                        if config.backend_type.is_some() {
                            datastore.backend_type = config.backend_type;
                        }
                        if config.mount_status.is_some() {
                            datastore.mount_status = config.mount_status;
                        }
                        if config.maintenance.is_some() {
                            datastore.maintenance = config.maintenance;
                        }
                    }
                }
            }
        }
        Ok(datastores)
    }

    /// Fetches the server version information.
    pub async fn pbs_get_version(&self, connection_id: &str) -> crate::Result<PbsVersion> {
        let conn = self.connection(connection_id)?;
        let data = conn.request(Method::GET, "/version", &[], None).await?;
        parse_api("/version", data)
    }

    /// Fetches the resource usage of the local node. PBS is single-host, so the
    /// `localhost` node is always the one being managed.
    pub async fn pbs_get_node_status(&self, connection_id: &str) -> crate::Result<PbsNodeStatus> {
        let conn = self.connection(connection_id)?;
        let data = conn
            .request(Method::GET, "/nodes/localhost/status", &[], None)
            .await?;
        parse_api("/nodes/localhost/status", data)
    }

    /// Lists the backup groups (per `backup-id`/`backup-type`) of a datastore.
    pub async fn pbs_get_groups(
        &self,
        connection_id: &str,
        store: &str,
    ) -> crate::Result<Vec<PbsBackupGroup>> {
        let conn = self.connection(connection_id)?;
        let path = format!("/admin/datastore/{}/groups", store);
        let data = conn.request(Method::GET, &path, &[], None).await?;
        parse_api(&path, data)
    }

    /// Lists the snapshots of one backup group.
    pub async fn pbs_get_snapshots(
        &self,
        connection_id: &str,
        store: &str,
        backup_id: &str,
        backup_type: &str,
    ) -> crate::Result<Vec<PbsSnapshot>> {
        let conn = self.connection(connection_id)?;
        let path = format!("/admin/datastore/{}/snapshots", store);
        let query = [
            ("backup-id", backup_id.to_string()),
            ("backup-type", backup_type.to_string()),
        ];
        let data = conn.request(Method::GET, &path, &query, None).await?;
        parse_api(&path, data)
    }

    /// Lists the files of one snapshot.
    pub async fn pbs_get_snapshot_files(
        &self,
        connection_id: &str,
        store: &str,
        backup_id: &str,
        backup_type: &str,
        backup_time: i64,
    ) -> crate::Result<Vec<PbsSnapshotFile>> {
        let conn = self.connection(connection_id)?;
        let path = format!("/admin/datastore/{}/files", store);
        let query = [
            ("backup-id", backup_id.to_string()),
            ("backup-type", backup_type.to_string()),
            ("backup-time", backup_time.to_string()),
        ];
        let data = conn.request(Method::GET, &path, &query, None).await?;
        parse_api(&path, data)
    }

    /// Streams a snapshot file to `save_path` and returns the path. `decoded`
    /// selects the `download-decoded` endpoint (raw plaintext archive bytes,
    /// only available for unencrypted datastores) over the plain `download`
    /// endpoint (raw archive bytes, possibly encrypted).
    //
    // The argument list mirrors the `download_pbs_snapshot_file` Tauri command
    // (the invoke IPC contract), so it cannot be grouped without breaking the
    // frontend call sites.
    #[allow(clippy::too_many_arguments)]
    pub async fn pbs_download_snapshot_file(
        &self,
        connection_id: &str,
        store: &str,
        backup_id: &str,
        backup_type: &str,
        backup_time: i64,
        file_name: &str,
        decoded: bool,
        save_path: &str,
    ) -> crate::Result<String> {
        let conn = self.connection(connection_id)?;
        let endpoint = if decoded { "download-decoded" } else { "download" };
        let path = format!("/admin/datastore/{}/{}", store, endpoint);
        let query = [
            ("backup-id", backup_id.to_string()),
            ("backup-type", backup_type.to_string()),
            ("backup-time", backup_time.to_string()),
            ("file-name", file_name.to_string()),
        ];
        conn.download_to_file(&path, &query, Path::new(save_path))
            .await?;
        Ok(save_path.to_string())
    }

    /// Deletes a single snapshot.
    pub async fn pbs_delete_snapshot(
        &self,
        connection_id: &str,
        store: &str,
        backup_id: &str,
        backup_type: &str,
        backup_time: i64,
    ) -> crate::Result<()> {
        let conn = self.connection(connection_id)?;
        let path = format!("/admin/datastore/{}/snapshots", store);
        let query = [
            ("backup-id", backup_id.to_string()),
            ("backup-type", backup_type.to_string()),
            ("backup-time", backup_time.to_string()),
        ];
        conn.request(Method::DELETE, &path, &query, None).await?;
        Ok(())
    }

    /// Deletes a whole backup group (all of its snapshots).
    pub async fn pbs_delete_group(
        &self,
        connection_id: &str,
        store: &str,
        backup_id: &str,
        backup_type: &str,
    ) -> crate::Result<()> {
        let conn = self.connection(connection_id)?;
        let path = format!("/admin/datastore/{}/groups", store);
        let query = [
            ("backup-id", backup_id.to_string()),
            ("backup-type", backup_type.to_string()),
        ];
        conn.request(Method::DELETE, &path, &query, None).await?;
        Ok(())
    }

    /// Starts a verification task for a datastore and returns the UPID.
    pub async fn pbs_run_verify(&self, connection_id: &str, store: &str) -> crate::Result<String> {
        let conn = self.connection(connection_id)?;
        let path = format!("/admin/datastore/{}/verify", store);
        let form = [("store", store.to_string())];
        let data = conn.request(Method::POST, &path, &[], Some(&form)).await?;
        parse_api(&path, data)
    }

    /// Starts a prune task for a datastore and returns the UPID. Only the
    /// provided keep-* retention fields are sent; `dry_run` marks the run as
    /// a simulation.
    //
    // The argument list mirrors the `run_pbs_prune` Tauri command (the invoke
    // IPC contract), so it cannot be grouped without breaking the frontend
    // call sites.
    #[allow(clippy::too_many_arguments)]
    pub async fn pbs_run_prune(
        &self,
        connection_id: &str,
        store: &str,
        keep_last: Option<u32>,
        keep_daily: Option<u32>,
        keep_weekly: Option<u32>,
        keep_monthly: Option<u32>,
        keep_yearly: Option<u32>,
        dry_run: bool,
    ) -> crate::Result<String> {
        let conn = self.connection(connection_id)?;
        let path = format!("/admin/datastore/{}/prune-datastore", store);
        let mut form: Vec<(&str, String)> = vec![("store", store.to_string())];
        if let Some(keep) = keep_last {
            form.push(("keep-last", keep.to_string()));
        }
        if let Some(keep) = keep_daily {
            form.push(("keep-daily", keep.to_string()));
        }
        if let Some(keep) = keep_weekly {
            form.push(("keep-weekly", keep.to_string()));
        }
        if let Some(keep) = keep_monthly {
            form.push(("keep-monthly", keep.to_string()));
        }
        if let Some(keep) = keep_yearly {
            form.push(("keep-yearly", keep.to_string()));
        }
        if dry_run {
            form.push(("dry-run", "1".to_string()));
        }
        let data = conn.request(Method::POST, &path, &[], Some(&form)).await?;
        parse_api(&path, data)
    }

    /// Starts a garbage-collection task for a datastore and returns the UPID.
    pub async fn pbs_run_gc(&self, connection_id: &str, store: &str) -> crate::Result<String> {
        let conn = self.connection(connection_id)?;
        let path = format!("/admin/datastore/{}/gc", store);
        let form = [("store", store.to_string())];
        let data = conn.request(Method::POST, &path, &[], Some(&form)).await?;
        parse_api(&path, data)
    }

    /// Lists the verification jobs, optionally filtered by datastore.
    pub async fn pbs_get_verify_jobs(
        &self,
        connection_id: &str,
        store: Option<&str>,
    ) -> crate::Result<Vec<PbsJob>> {
        let conn = self.connection(connection_id)?;
        let query = store
            .map(|store| vec![("store", store.to_string())])
            .unwrap_or_default();
        let data = conn.request(Method::GET, "/admin/verify", &query, None).await?;
        parse_api("/admin/verify", data)
    }

    /// Lists the prune jobs, optionally filtered by datastore.
    pub async fn pbs_get_prune_jobs(
        &self,
        connection_id: &str,
        store: Option<&str>,
    ) -> crate::Result<Vec<PbsJob>> {
        let conn = self.connection(connection_id)?;
        let query = store
            .map(|store| vec![("store", store.to_string())])
            .unwrap_or_default();
        let data = conn.request(Method::GET, "/admin/prune", &query, None).await?;
        parse_api("/admin/prune", data)
    }

    /// Lists the garbage-collection jobs, optionally filtered by datastore.
    /// GC jobs carry no `id` of their own, so the datastore name is used.
    pub async fn pbs_get_gc_jobs(
        &self,
        connection_id: &str,
        store: Option<&str>,
    ) -> crate::Result<Vec<PbsJob>> {
        let conn = self.connection(connection_id)?;
        let query = store
            .map(|store| vec![("store", store.to_string())])
            .unwrap_or_default();
        let data = conn.request(Method::GET, "/admin/gc", &query, None).await?;
        let raw: Vec<PbsGcJobRaw> = parse_api("/admin/gc", data)?;
        Ok(raw.into_iter().map(PbsJob::from).collect())
    }

    /// Lists the tasks running on the local PBS node, mapping the kebab-case
    /// `worker-type`/`worker-id` keys and the PBS task status codes onto the
    /// shared [`Task`] shape (the same struct the PVE task list uses).
    pub async fn pbs_get_tasks(&self, connection_id: &str) -> crate::Result<Vec<Task>> {
        let conn = self.connection(connection_id)?;
        let data = conn
            .request(Method::GET, "/nodes/localhost/tasks", &[], None)
            .await?;
        let entries: Vec<serde_json::Value> = parse_api("/nodes/localhost/tasks", data)?;
        let mut tasks = Vec::with_capacity(entries.len());
        for entry in entries {
            // PBS reports `running` while a task is active and `ok` /
            // `warning` / `error` once it finished. `ok` is mapped onto the
            // PVE-style `exitstatus` so the shared task row renders the same
            // way for both platforms.
            let (status, exitstatus) = match entry["status"].as_str() {
                Some("running") => (Some("running".to_string()), None),
                Some("ok") => (None, Some("OK".to_string())),
                Some("warning") => (None, Some("WARNING".to_string())),
                Some("error") => (None, Some("ERROR".to_string())),
                _ => (None, None),
            };
            tasks.push(Task {
                upid: entry["upid"].as_str().unwrap_or("").to_string(),
                node: entry["node"].as_str().unwrap_or("").to_string(),
                pid: entry["pid"].as_u64().unwrap_or(0) as u32,
                pstart: entry["pstart"].as_u64().unwrap_or(0),
                starttime: entry["starttime"].as_u64().unwrap_or(0),
                endtime: entry["endtime"].as_u64(),
                r#type: entry["worker-type"].as_str().unwrap_or("").to_string(),
                id: entry["worker-id"].as_str().unwrap_or("").to_string(),
                user: entry["user"].as_str().unwrap_or("").to_string(),
                status,
                exitstatus,
            });
        }
        Ok(tasks)
    }
}
