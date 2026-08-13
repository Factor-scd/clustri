//! Integration tests for the Proxmox Backup Server (PBS) backend.
//!
//! These tests exercise the `pbs_*` `ConnectionManager` methods against a
//! local HTTP mock server: the `PBSAPIToken`/`PBSAuthCookie` auth headers,
//! datastore usage+config merging, the datastore/group/snapshot read
//! endpoints, the snapshot/group deletions, the verify/prune/gc task
//! launches, the binary file download, the kebab-case `worker-*` task
//! mapping, and the PBS-specific connect/login flows (which skip cluster
//! discovery).

use httpmock::prelude::*;
use clustri::{ConnectionConfig, ConnectionManager, EndpointConfig};

const TOKEN: &str = "root@pam!pbs-token";

/// Builds a `ConnectionManager` with a single token-mode PBS connection whose
/// primary endpoint points at the mock server.
async fn setup_manager(url: &str, token: &str) -> (ConnectionManager, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    let config = ConnectionConfig {
        id: "conn".to_string(),
        name: "conn".to_string(),
        primary: EndpointConfig {
            url: url.to_string(),
            node: None,
            token: Some(token.to_string()),
        },
        fallbacks: vec![],
        cert_fingerprint: None,
        trusted: false,
        accept_untrusted: true,
        status: "disconnected".to_string(),
        cluster_name: None,
        is_cluster: false,
        auth_mode: "token".to_string(),
        username: None,
        nodes: vec![],
        cluster_id: None,
        server_type: "pbs".to_string(),
    };
    manager
        .add_connection(config, &path)
        .await
        .expect("connection should be added");
    (manager, dir)
}

#[tokio::test]
async fn token_auth_sends_pbs_api_token_header() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/version")
            .header("Authorization", format!("PBSAPIToken={}", TOKEN));
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"version":"3.2.3","release":"bookworm","repoid":"dd6b00e2"}}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), TOKEN).await;
    let version = manager
        .pbs_get_version("conn")
        .await
        .expect("version should be fetched");
    assert_eq!(version.version, "3.2.3");
    assert_eq!(version.release, "bookworm");
    assert_eq!(version.repoid, "dd6b00e2");
    mock.assert();
}

#[tokio::test]
async fn password_mode_sends_pbs_auth_cookie() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/status/datastore-usage")
            .header("Cookie", "PBSAuthCookie=ticket-123");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });

    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    let config = ConnectionConfig {
        id: "conn".to_string(),
        name: "conn".to_string(),
        primary: EndpointConfig {
            url: server.base_url(),
            node: None,
            token: None,
        },
        fallbacks: vec![],
        cert_fingerprint: None,
        trusted: false,
        accept_untrusted: true,
        status: "disconnected".to_string(),
        cluster_name: None,
        is_cluster: false,
        auth_mode: "password".to_string(),
        username: Some("root@pam".to_string()),
        nodes: vec![],
        cluster_id: None,
        server_type: "pbs".to_string(),
    };
    manager
        .add_connection(config, &path)
        .await
        .expect("connection should be added");
    manager
        .set_session_ticket("conn", "ticket-123", "csrf")
        .await
        .expect("session should be injected");

    // The `/admin/datastore` merge call is best-effort; with no mock for it,
    // httpmock answers 404 and the call degrades to the usage-only list.
    let datastores = manager
        .pbs_get_datastores("conn")
        .await
        .expect("datastores should be fetched");
    assert!(datastores.is_empty());
    mock.assert();
}

#[tokio::test]
async fn get_datastores_merges_usage_and_config() {
    let server = MockServer::start();
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/status/datastore-usage");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [{
                        "store": "backup",
                        "backend-type": "filesystem",
                        "mount-status": "mounted",
                        "avail": 1_200_000_000_000u64,
                        "total": 2_000_000_000_000u64,
                        "used": 800_000_000_000u64,
                        "gc-status": {
                            "disk-bytes": 100,
                            "disk-chunks": 2,
                            "cache-stats": {"hits": 7, "misses": 3},
                            "upid": "UPID:store:00000000:00000000:00000000:gc:backup::"
                        }
                    }]
                })
                .to_string(),
            );
    });
    server.mock(|when, then| {
        when.method(GET).path("/api2/json/admin/datastore");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [{
                        "store": "backup",
                        "comment": "Main store",
                        "maintenance": "offline"
                    }]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), TOKEN).await;
    let datastores = manager
        .pbs_get_datastores("conn")
        .await
        .expect("datastores should be fetched");
    assert_eq!(datastores.len(), 1);
    let datastore = &datastores[0];
    assert_eq!(datastore.store, "backup");
    assert_eq!(datastore.total, Some(2_000_000_000_000));
    assert_eq!(datastore.used, Some(800_000_000_000));
    assert_eq!(datastore.avail, Some(1_200_000_000_000));
    // Merged from /admin/datastore.
    assert_eq!(datastore.comment.as_deref(), Some("Main store"));
    assert_eq!(datastore.maintenance.as_deref(), Some("offline"));
    // Usage-derived values survive where the config entry omits the key.
    assert_eq!(datastore.backend_type.as_deref(), Some("filesystem"));
    assert_eq!(datastore.mount_status.as_deref(), Some("mounted"));
    // gc-status.cache-stats is hoisted onto gc_status.cache_hits/misses.
    let gc = datastore.gc_status.as_ref().expect("gc status should be present");
    assert_eq!(gc.disk_bytes, Some(100));
    assert_eq!(gc.disk_chunks, Some(2));
    assert_eq!(gc.cache_hits, Some(7));
    assert_eq!(gc.cache_misses, Some(3));
    assert!(gc.upid.as_deref().unwrap_or("").starts_with("UPID:"));
}

#[tokio::test]
async fn get_groups_hits_url_and_parses() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/admin/datastore/backup/groups");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [{
                        "backup-id": "100",
                        "backup-type": "vm",
                        "backup-count": 3,
                        "last-backup": 1_700_000_000,
                        "comment": "Web server"
                    }]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), TOKEN).await;
    let groups = manager
        .pbs_get_groups("conn", "backup")
        .await
        .expect("groups should be fetched");
    assert_eq!(groups.len(), 1);
    assert_eq!(groups[0].backup_id, "100");
    assert_eq!(groups[0].backup_type, "vm");
    assert_eq!(groups[0].backup_count, Some(3));
    assert_eq!(groups[0].last_backup, Some(1_700_000_000));
    assert_eq!(groups[0].comment.as_deref(), Some("Web server"));
    mock.assert();
}

#[tokio::test]
async fn get_snapshots_sends_backup_query_params() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/admin/datastore/backup/snapshots")
            .query_param("backup-id", "100")
            .query_param("backup-type", "vm");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [{
                        "backup-id": "100",
                        "backup-type": "vm",
                        "backup-time": 1_700_000_000,
                        "size": 1_500_000_000,
                        "protected": true,
                        "comment": "Full backup",
                        "verification": {"state": "ok", "upid": "UPID:verify::"}
                    }]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), TOKEN).await;
    let snapshots = manager
        .pbs_get_snapshots("conn", "backup", "100", "vm")
        .await
        .expect("snapshots should be fetched");
    assert_eq!(snapshots.len(), 1);
    assert_eq!(snapshots[0].backup_id, "100");
    assert_eq!(snapshots[0].backup_time, 1_700_000_000);
    assert_eq!(snapshots[0].size, Some(1_500_000_000));
    assert_eq!(snapshots[0].protected, Some(true));
    assert_eq!(
        snapshots[0]
            .verification
            .as_ref()
            .and_then(|verification| verification.state.as_deref()),
        Some("ok")
    );
    mock.assert();
}

#[tokio::test]
async fn delete_snapshot_uses_delete_verb_with_query_params() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(DELETE)
            .path("/api2/json/admin/datastore/backup/snapshots")
            .query_param("backup-id", "100")
            .query_param("backup-type", "vm")
            .query_param("backup-time", "1700000000");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), TOKEN).await;
    manager
        .pbs_delete_snapshot("conn", "backup", "100", "vm", 1_700_000_000)
        .await
        .expect("snapshot should be deleted");
    mock.assert();
}

#[tokio::test]
async fn run_verify_posts_store_and_returns_upid() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/admin/datastore/backup/verify")
            .body_includes("store=backup");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":"UPID:store:00000000:00000000:00000000:verify:backup::"}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), TOKEN).await;
    let upid = manager
        .pbs_run_verify("conn", "backup")
        .await
        .expect("verify should start");
    assert!(upid.starts_with("UPID:"));
    assert!(upid.contains("verify"));
    mock.assert();
}

#[tokio::test]
async fn run_prune_sends_only_provided_keep_fields_and_dry_run() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/admin/datastore/backup/prune-datastore")
            .body_includes("store=backup")
            .body_includes("keep-last=7")
            .body_includes("keep-daily=14")
            .body_includes("dry-run=1")
            .body_excludes("keep-weekly")
            .body_excludes("keep-monthly")
            .body_excludes("keep-yearly");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":"UPID:store:00000000:00000000:00000000:prune:backup::"}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), TOKEN).await;
    let upid = manager
        .pbs_run_prune("conn", "backup", Some(7), Some(14), None, None, None, true)
        .await
        .expect("prune should start");
    assert!(upid.starts_with("UPID:"));
    mock.assert_calls(1);
}

#[tokio::test]
async fn download_snapshot_file_streams_binary_to_disk() {
    let server = MockServer::start();
    let bytes: Vec<u8> = vec![0, 1, 2, 3, 250, 251, 252, 253, 254, 255];
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/admin/datastore/backup/download")
            .query_param("backup-id", "100")
            .query_param("backup-type", "vm")
            .query_param("backup-time", "1700000000")
            .query_param("file-name", "index.json.blob");
        then.status(200).body(&bytes[..]);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), TOKEN).await;
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let save_path = dir.path().join("index.json.blob");
    let save_path_str = save_path.to_str().expect("path should be UTF-8");

    let returned = manager
        .pbs_download_snapshot_file(
            "conn",
            "backup",
            "100",
            "vm",
            1_700_000_000,
            "index.json.blob",
            false,
            save_path_str,
        )
        .await
        .expect("download should succeed");
    assert_eq!(returned, save_path_str);

    let written = std::fs::read(&save_path).expect("downloaded file should exist");
    assert_eq!(written, bytes);
    mock.assert();
}

#[tokio::test]
async fn get_tasks_maps_pbs_worker_fields_into_task() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET).path("/api2/json/nodes/localhost/tasks");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {
                            "upid": "UPID:localhost:00000000:00000000:00000000:verify:backup::root@pam:",
                            "node": "localhost",
                            "pid": 1234,
                            "pstart": 100,
                            "starttime": 1_700_000_000,
                            "endtime": 1_700_000_100,
                            "status": "ok",
                            "user": "root@pam",
                            "worker-id": "backup",
                            "worker-type": "verify"
                        },
                        {
                            "upid": "UPID:localhost:00000000:00000000:00000000:gc:backup::root@pam:",
                            "node": "localhost",
                            "pid": 5678,
                            "pstart": 200,
                            "starttime": 1_700_000_000,
                            "status": "running",
                            "user": "root@pam",
                            "worker-type": "gc"
                        }
                    ]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), TOKEN).await;
    let tasks = manager
        .pbs_get_tasks("conn")
        .await
        .expect("tasks should be fetched");
    assert_eq!(tasks.len(), 2);

    // A finished task maps `status: ok` onto the PVE-style exit status.
    let finished = &tasks[0];
    assert_eq!(finished.r#type, "verify");
    assert_eq!(finished.id, "backup");
    assert_eq!(finished.node, "localhost");
    assert_eq!(finished.user, "root@pam");
    assert_eq!(finished.pid, 1234);
    assert_eq!(finished.endtime, Some(1_700_000_100));
    assert_eq!(finished.status, None);
    assert_eq!(finished.exitstatus.as_deref(), Some("OK"));

    // A running task keeps `status: running` and has no exit status.
    let running = &tasks[1];
    assert_eq!(running.r#type, "gc");
    assert_eq!(running.status.as_deref(), Some("running"));
    assert_eq!(running.exitstatus, None);
    mock.assert();
}

#[tokio::test]
async fn connect_for_pbs_skips_node_discovery() {
    let server = MockServer::start();
    let version_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/version")
            .header("Authorization", format!("PBSAPIToken={}", TOKEN));
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"version":"3.2.3","release":"bookworm","repoid":"dd6b00e2"}}"#);
    });
    // No `/nodes` or `/cluster/status` mocks are registered: a PVE-style
    // discovery pass would hit httpmock's 404 and fail the connect.

    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    let config = ConnectionConfig {
        id: "conn".to_string(),
        name: "conn".to_string(),
        primary: EndpointConfig {
            url: server.base_url(),
            node: None,
            token: Some(TOKEN.to_string()),
        },
        fallbacks: vec![],
        cert_fingerprint: None,
        trusted: false,
        accept_untrusted: true,
        status: "disconnected".to_string(),
        cluster_name: None,
        is_cluster: false,
        auth_mode: "token".to_string(),
        username: None,
        nodes: vec![],
        cluster_id: None,
        server_type: "pbs".to_string(),
    };
    manager
        .add_connection(config, &path)
        .await
        .expect("connection should be added");

    let result = manager
        .connect("conn", &path)
        .await
        .expect("PBS connect should succeed with only /version mocked");
    assert_eq!(result.status, "connected");
    assert_eq!(result.merged_into, None);
    assert_eq!(result.connection_id, "conn");
    version_mock.assert_calls(1);
}

#[tokio::test]
async fn login_with_token_validates_against_pbs_version_endpoint() {
    let server = MockServer::start();
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/version")
            .header("Authorization", format!("PBSAPIToken={}", TOKEN));
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"version":"3.2.3","release":"bookworm","repoid":"dd6b00e2"}}"#);
    });

    let manager = ConnectionManager::new();
    let result = manager
        .login_with_token(&server.base_url(), TOKEN, "pbs")
        .await
        .expect("login should validate the token against /version");
    assert!(!result.connection_id.is_empty());
    assert_eq!(result.ticket, TOKEN);
    mock.assert();
}

#[test]
fn public_structs_serialize_to_camel_case_shapes() {
    // The frontend types (`src/types/pbs.ts`) mirror the backend structs'
    // camelCase serialization; these assertions guard that contract for every
    // struct that deserializes from kebab-case raw JSON.
    let snapshot = clustri::PbsSnapshot {
        backup_id: "100".to_string(),
        backup_type: "vm".to_string(),
        backup_time: 1_700_000_000,
        size: Some(1_500_000_000),
        protected: Some(true),
        comment: None,
        files: Some(vec!["index.json.blob".to_string()]),
        fingerprint: None,
        owner: None,
        verification: None,
    };
    let json = serde_json::to_value(&snapshot).expect("snapshot should serialize");
    assert_eq!(json["backupId"], "100");
    assert_eq!(json["backupType"], "vm");
    assert_eq!(json["backupTime"], 1_700_000_000);
    assert_eq!(json["size"], 1_500_000_000);
    assert_eq!(json["protected"], true);
    assert_eq!(json["files"][0], "index.json.blob");

    let job = clustri::PbsJob {
        id: "verify-1".to_string(),
        store: Some("backup".to_string()),
        schedule: None,
        comment: None,
        disable: None,
        last_run_state: Some("OK".to_string()),
        last_run_endtime: Some(1_700_000_000),
        next_run: None,
        keep_last: Some(7),
        keep_daily: None,
        keep_weekly: None,
        keep_monthly: None,
        keep_yearly: None,
        ignore_verified: None,
        max_depth: Some(5),
    };
    let json = serde_json::to_value(&job).expect("job should serialize");
    assert_eq!(json["lastRunState"], "OK");
    assert_eq!(json["lastRunEndtime"], 1_700_000_000);
    assert_eq!(json["keepLast"], 7);
    assert_eq!(json["maxDepth"], 5);

    // Deserialize from the raw kebab-case wire shape, then verify the
    // serialized shape is camelCase (the same round-trip the API requests go
    // through).
    let node_status: clustri::PbsNodeStatus = serde_json::from_value(serde_json::json!({
        "cpu": 0.15,
        "current-kernel": {"machine": "x86_64", "release": "6.8.12-4-pve", "sysname": "Linux"}
    }))
    .expect("node status should deserialize from kebab-case keys");
    let json = serde_json::to_value(&node_status).expect("node status should serialize");
    assert_eq!(json["cpu"], 0.15);
    assert_eq!(json["currentKernel"]["release"], "6.8.12-4-pve");
}
