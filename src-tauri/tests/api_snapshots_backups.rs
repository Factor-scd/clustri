//! Integration tests for the real snapshot, migration, and backup API calls.
//!
//! Every request goes through `Connection::request`, so these tests cover URL
//! construction, form encoding, auth header injection, response envelope
//! unwrapping, and mapping into the public serde structs. Token-mode
//! connections resolve the token from the config, so the methods can be called
//! directly on an added connection without `connect()`.

use httpmock::prelude::*;
use proxmox_desktop::{
    BackupJobConfig, ConnectionConfig, ConnectionManager, CreateSnapshotConfig, EndpointConfig,
    Error,
};

/// Builds a `ConnectionManager` with a single token-mode connection whose
/// primary endpoint points at the mock server. `node` pins the storage node.
async fn setup_manager(
    url: &str,
    token: &str,
    node: Option<&str>,
) -> (ConnectionManager, tempfile::TempDir) {
    let dir = tempfile::tempdir().expect("temp dir should be created");
    let path = dir.path().join("connections.json");
    let mut manager = ConnectionManager::new();
    let config = ConnectionConfig {
        id: "conn".to_string(),
        name: "conn".to_string(),
        primary: EndpointConfig {
            url: url.to_string(),
            node: node.map(str::to_string),
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
    };
    manager
        .add_connection(config, &path)
        .await
        .expect("connection should be added");
    (manager, dir)
}

#[tokio::test]
async fn get_snapshots_maps_list() {
    let server = MockServer::start();
    let token = "root@pam!snap-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/qemu/100/snapshot")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {"name": "snap1", "description": "before upgrade",
                         "snaptime": 1700000000, "vmstate": 1, "parent": "current"},
                        {"name": "snap2", "snaptime": 1700000100, "vmstate": 0}
                    ]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let snapshots = manager
        .get_snapshots("conn", "pve1", 100, "qemu")
        .await
        .expect("snapshots should be fetched");

    assert_eq!(snapshots.len(), 2);
    assert_eq!(snapshots[0].name, "snap1");
    assert_eq!(snapshots[0].description, "before upgrade");
    assert_eq!(snapshots[0].snaptime, 1700000000);
    assert_eq!(snapshots[0].vmstate, 1);
    assert_eq!(snapshots[0].parent.as_deref(), Some("current"));
    // Tolerance: the second snapshot omits optional fields.
    assert_eq!(snapshots[1].name, "snap2");
    assert_eq!(snapshots[1].description, "");
    assert_eq!(snapshots[1].parent, None);
    mock.assert();
}

#[tokio::test]
async fn create_snapshot_posts_form() {
    let server = MockServer::start();
    let token = "root@pam!snap-create-token";
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/snapshot")
            .body_includes("snapname=snap1")
            .body_includes("vmstate=1");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .create_snapshot(
            "conn",
            "pve1",
            100,
            "qemu",
            CreateSnapshotConfig {
                name: "snap1".to_string(),
                description: Some("before upgrade".to_string()),
                vmstate: Some(true),
            },
        )
        .await
        .expect("snapshot should be created");
    mock.assert();
}

#[tokio::test]
async fn delete_snapshot_deletes_path() {
    let server = MockServer::start();
    let token = "root@pam!snap-delete-token";
    let mock = server.mock(|when, then| {
        when.method(DELETE)
            .path("/api2/json/nodes/pve1/qemu/100/snapshot/snap1");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .delete_snapshot("conn", "pve1", 100, "qemu", "snap1")
        .await
        .expect("snapshot should be deleted");
    mock.assert();
}

#[tokio::test]
async fn rollback_snapshot_posts_rollback() {
    let server = MockServer::start();
    let token = "root@pam!snap-rollback-token";
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/snapshot/snap1/rollback");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .rollback_snapshot("conn", "pve1", 100, "qemu", "snap1")
        .await
        .expect("rollback should succeed");
    mock.assert();
}

#[tokio::test]
async fn migrate_vm_posts_migrate() {
    let server = MockServer::start();
    let token = "root@pam!migrate-token";
    let online_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/migrate")
            .body_includes("target=pve2")
            .body_includes("online=1");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });
    let offline_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/migrate")
            .body_includes("target=pve2")
            .body_includes("online=0");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .migrate_vm("conn", "pve1", 100, "qemu", "pve2", true)
        .await
        .expect("online migration should succeed");
    manager
        .migrate_vm("conn", "pve1", 100, "qemu", "pve2", false)
        .await
        .expect("offline migration should succeed");
    online_mock.assert();
    offline_mock.assert();
}

#[tokio::test]
async fn get_backup_jobs_maps_list() {
    let server = MockServer::start();
    let token = "root@pam!jobs-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/cluster/backup")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {"id": "backup-1", "store": "backup", "schedule": "0 2 * * *",
                         "all": 1, "enabled": 1, "node": "pve1", "compress": "zstd",
                         "mode": "snapshot", "quiet": 0},
                        {"id": "backup-2", "store": "local", "schedule": "30 3 * * 1",
                         "all": 0, "enabled": 0, "vmid": "100,101"}
                    ]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let jobs = manager
        .get_backup_jobs("conn")
        .await
        .expect("backup jobs should be fetched");

    assert_eq!(jobs.len(), 2);
    assert_eq!(jobs[0].id, "backup-1");
    assert_eq!(jobs[0].store, "backup");
    assert_eq!(jobs[0].schedule, "0 2 * * *");
    assert_eq!(jobs[0].all, 1);
    assert_eq!(jobs[0].enabled, 1);
    assert_eq!(jobs[0].node.as_deref(), Some("pve1"));
    assert_eq!(jobs[0].compress.as_deref(), Some("zstd"));
    assert_eq!(jobs[0].mode.as_deref(), Some("snapshot"));
    assert_eq!(jobs[0].quiet, Some(0));
    // Tolerance: the second job omits the optional node/mode fields.
    assert_eq!(jobs[1].node, None);
    assert_eq!(jobs[1].compress, None);
    assert_eq!(jobs[1].mode, None);
    assert_eq!(jobs[1].quiet, None);
    assert_eq!(jobs[1].vmid.as_deref(), Some("100,101"));
    assert_eq!(jobs[1].all, 0);
    mock.assert();
}

#[tokio::test]
async fn create_backup_job_posts_form() {
    let server = MockServer::start();
    let token = "root@pam!job-create-token";
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/cluster/backup")
            .body_includes("schedule=0+2+*+*+*")
            .body_includes("storage=backup")
            .body_includes("mode=snapshot")
            .body_includes("compress=zstd")
            .body_includes("all=1")
            .body_includes("enabled=1")
            .body_includes("vmid=100%2C101")
            .body_includes("node=pve1");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .create_backup_job(
            "conn",
            BackupJobConfig {
                id: None,
                storage: "backup".to_string(),
                schedule: "0 2 * * *".to_string(),
                mode: "snapshot".to_string(),
                compression: "zstd".to_string(),
                all: true,
                vmid: Some("100,101".to_string()),
                enabled: true,
                node: Some("pve1".to_string()),
            },
        )
        .await
        .expect("backup job should be created");
    mock.assert();
}

#[tokio::test]
async fn delete_backup_job_deletes_path() {
    let server = MockServer::start();
    let token = "root@pam!job-delete-token";
    let mock = server.mock(|when, then| {
        when.method(DELETE).path("/api2/json/cluster/backup/job-id");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .delete_backup_job("conn", "job-id")
        .await
        .expect("backup job should be deleted");
    mock.assert();
}

#[tokio::test]
async fn get_backups_filters_and_maps() {
    let server = MockServer::start();
    let token = "root@pam!backups-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/storage/local/content")
            .query_param("content", "backup");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": [
                        {"volid": "local:backup/vzdump-qemu-100-2024_01_01-00_00_00.vma.zst",
                         "backupid": "vzdump-qemu-100-2024_01_01-00_00_00.vma.zst",
                         "backup-type": "qemu", "backup-id": "100",
                         "backup-time": 1700000000, "storage": "local",
                         "size": 1073741824u64, "ctime": 1700000001, "content": "backup"},
                        {"volid": "local:iso/debian-12.iso", "content": "iso",
                         "ctime": 1700000002},
                        {"volid": "local:vztmpl/ubuntu-22.tar.xz", "content": "vztmpl",
                         "ctime": 1700000003}
                    ]
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, Some("pve1")).await;
    let backups = manager
        .get_backups("conn", Some("local"))
        .await
        .expect("backups should be fetched");

    assert_eq!(backups.len(), 1);
    assert_eq!(
        backups[0].volid,
        "local:backup/vzdump-qemu-100-2024_01_01-00_00_00.vma.zst"
    );
    assert_eq!(
        backups[0].backupid,
        "vzdump-qemu-100-2024_01_01-00_00_00.vma.zst"
    );
    assert_eq!(backups[0].backup_type, "qemu");
    assert_eq!(backups[0].backup_id, "100");
    assert_eq!(backups[0].backup_time, 1700000000);
    assert_eq!(backups[0].storage, "local");
    assert_eq!(backups[0].size, 1073741824u64);
    assert_eq!(backups[0].ctime, 1700000001);
    mock.assert();
}

#[tokio::test]
async fn get_backups_defaults_to_local_storage() {
    let server = MockServer::start();
    let token = "root@pam!backups-default-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/storage/local/content")
            .query_param("content", "backup");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, Some("pve1")).await;
    let backups = manager
        .get_backups("conn", None)
        .await
        .expect("backups should be fetched");

    assert!(backups.is_empty());
    mock.assert();
}

#[tokio::test]
async fn delete_backup_url_encodes_volid() {
    let server = MockServer::start();
    let token = "root@pam!backup-delete-token";
    let mock = server.mock(|when, then| {
        when.method(DELETE).path(
            "/api2/json/nodes/pve1/storage/local/content/local%3Abackup%2Fvzdump-qemu-100-2024_01_01-00_00_00.vma.zst",
        );
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, Some("pve1")).await;
    manager
        .delete_backup(
            "conn",
            "local:backup/vzdump-qemu-100-2024_01_01-00_00_00.vma.zst",
        )
        .await
        .expect("backup should be deleted");
    mock.assert();
}

#[tokio::test]
async fn invalid_vm_type_errors() {
    let server = MockServer::start();
    let probe = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/kvm/100/snapshot");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":[]}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), "root@pam!bad-type-token", None).await;

    let error = manager
        .get_snapshots("conn", "pve1", 100, "kvm")
        .await
        .expect_err("invalid vm type must be rejected");
    assert!(
        matches!(error, Error::InvalidUrl(ref message) if message.contains("kvm")),
        "expected InvalidUrl mentioning 'kvm', got: {}",
        error
    );

    let error = manager
        .migrate_vm("conn", "pve1", 100, "kvm", "pve2", true)
        .await
        .expect_err("invalid vm type must be rejected");
    assert!(
        matches!(error, Error::InvalidUrl(ref message) if message.contains("kvm")),
        "expected InvalidUrl mentioning 'kvm', got: {}",
        error
    );

    assert_eq!(
        probe.calls(),
        0,
        "no HTTP request should be made for an invalid vm type"
    );
}
