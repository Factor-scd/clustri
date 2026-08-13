//! Integration tests for VM/container disk and network interface management.
//!
//! Every request goes through `Connection::request`, so these tests cover URL
//! construction (including the `qemu`/`lxc` path segment), form encoding,
//! config parsing, and slot allocation. Token-mode connections resolve the
//! token from the config, so the methods can be called directly on an added
//! connection without `connect()`.
//!
//! The form bodies are `application/x-www-form-urlencoded`, so values with
//! special characters (`:`, `=`, `,`) appear percent-encoded in the raw body;
//! `body_includes` assertions use the encoded form (e.g. `:` becomes `%3A`).

use httpmock::prelude::*;
use clustri::{
    AddDiskConfig, AddNICConfig, ConnectionConfig, ConnectionManager, EditNICConfig,
    EndpointConfig, Error,
};

/// Builds a `ConnectionManager` with a single token-mode connection whose
/// primary endpoint points at the mock server.
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
        server_type: "pve".to_string(),
    };
    manager
        .add_connection(config, &path)
        .await
        .expect("connection should be added");
    (manager, dir)
}

#[tokio::test]
async fn get_disks_parses_config_strings() {
    let server = MockServer::start();
    let token = "root@pam!disks-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/qemu/100/config")
            .header("Authorization", format!("PVEAPIToken={}", token));
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {
                        "scsi0": "local-lvm:vm-100-disk-0,size=32G,format=qcow2",
                        "scsi1": "local-lvm:vm-100-disk-1,size=50G",
                        "net0": "virtio=BC:24:11:AA:BB:CC,bridge=vmbr0",
                        "memory": 2048
                    }
                })
                .to_string(),
            );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let disks = manager
        .get_disks("conn", "pve1", 100, "qemu")
        .await
        .expect("disks should be fetched");

    assert_eq!(disks.len(), 2);
    assert_eq!(disks[0].device, "scsi0");
    assert_eq!(disks[0].storage, "local-lvm");
    assert_eq!(disks[0].size, 34359738368);
    assert_eq!(disks[0].format, "qcow2");
    assert_eq!(disks[0].usage, None);
    // The second disk has no size/format attributes: size is 0, format empty.
    assert_eq!(disks[1].device, "scsi1");
    assert_eq!(disks[1].storage, "local-lvm");
    assert_eq!(disks[1].size, 53687091200);
    assert_eq!(disks[1].format, "");
    mock.assert();
}

#[tokio::test]
async fn add_disk_picks_free_slot_and_posts() {
    let server = MockServer::start();
    let token = "root@pam!add-disk-token";
    let get_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/qemu/100/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {"scsi0": "local-lvm:vm-100-disk-0,size=32G"}
                })
                .to_string(),
            );
    });
    let post_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/config")
            // urlencoded: the `:` in `local-lvm:64G` becomes `%3A`.
            .body_includes("scsi1=local-lvm%3A64G");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let config = AddDiskConfig {
        storage: "local-lvm".to_string(),
        size: 68719476736,
        bus_type: "scsi".to_string(),
    };
    manager
        .add_disk("conn", "pve1", 100, "qemu", config)
        .await
        .expect("disk should be added");

    get_mock.assert();
    post_mock.assert();
}

#[tokio::test]
async fn resize_disk_posts_resize() {
    let server = MockServer::start();
    let token = "root@pam!resize-token";
    let mock = server.mock(|when, then| {
        when.method(PUT)
            .path("/api2/json/nodes/pve1/qemu/100/resize")
            .body_includes("disk=scsi0")
            .body_includes("size=50G");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .resize_disk("conn", "pve1", 100, "qemu", "scsi0", 53687091200)
        .await
        .expect("resize should succeed");

    mock.assert();
}

#[tokio::test]
async fn remove_disk_posts_delete() {
    let server = MockServer::start();
    let token = "root@pam!remove-disk-token";
    let mock = server.mock(|when, then| {
        when.method(DELETE)
            .path("/api2/json/nodes/pve1/qemu/100/config")
            .body_includes("delete=scsi0");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .remove_disk("conn", "pve1", 100, "qemu", "scsi0")
        .await
        .expect("disk should be removed");

    mock.assert();
}

#[tokio::test]
async fn move_disk_posts_move_disk() {
    let server = MockServer::start();
    let token = "root@pam!move-disk-token";
    let mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/move_disk")
            .body_includes("disk=scsi0")
            .body_includes("storage=local-zfs");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .move_disk("conn", "pve1", 100, "qemu", "scsi0", "local-zfs")
        .await
        .expect("disk should be moved");

    mock.assert();
}

#[tokio::test]
async fn get_network_interfaces_parses_nets() {
    let server = MockServer::start();
    let token = "root@pam!nets-token";
    let mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/qemu/100/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(
            serde_json::json!({
                "data": {
                    "net0": "virtio=BC:24:11:AA:BB:CC,bridge=vmbr0,tag=10,firewall=1,link_down=1",
                    "net1": "e1000=11:22:33:44:55:66,bridge=vmbr1"
                }
            })
            .to_string(),
        );
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let nics = manager
        .get_network_interfaces("conn", "pve1", 100, "qemu")
        .await
        .expect("nics should be fetched");

    assert_eq!(nics.len(), 2);
    assert_eq!(nics[0].name, "net0");
    assert_eq!(nics[0].model, "virtio");
    assert_eq!(nics[0].macaddr, "BC:24:11:AA:BB:CC");
    assert_eq!(nics[0].bridge.as_deref(), Some("vmbr0"));
    assert_eq!(nics[0].tag, Some(10));
    assert_eq!(nics[0].firewall, Some(1));
    assert_eq!(nics[0].link_down, Some(1));
    // The second NIC has no optional attributes.
    assert_eq!(nics[1].name, "net1");
    assert_eq!(nics[1].model, "e1000");
    assert_eq!(nics[1].macaddr, "11:22:33:44:55:66");
    assert_eq!(nics[1].bridge.as_deref(), Some("vmbr1"));
    assert_eq!(nics[1].tag, None);
    assert_eq!(nics[1].firewall, None);
    assert_eq!(nics[1].link_down, None);
    mock.assert();
}

#[tokio::test]
async fn add_nic_posts_form() {
    let server = MockServer::start();
    let token = "root@pam!add-nic-token";
    let get_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/qemu/100/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {"memory": 2048}
                })
                .to_string(),
            );
    });
    let post_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/config")
            // urlencoded: `=` and `,` become `%3D` and `%2C`.
            .body_includes("net0=virtio%3Drandom%2Cbridge%3Dvmbr0");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let config = AddNICConfig {
        bridge: "vmbr0".to_string(),
        model: "virtio".to_string(),
        macaddr: None,
        tag: None,
        firewall: None,
    };
    manager
        .add_nic("conn", "pve1", 100, "qemu", config)
        .await
        .expect("nic should be added");

    get_mock.assert();
    post_mock.assert();
}

#[tokio::test]
async fn edit_nic_preserves_model_and_mac() {
    let server = MockServer::start();
    let token = "root@pam!edit-nic-token";
    let get_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/qemu/100/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {"net0": "virtio=MAC,bridge=vmbr0"}
                })
                .to_string(),
            );
    });
    let post_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/config")
            .body_includes("net0=virtio%3DMAC%2Cbridge%3Dvmbr1");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let config = EditNICConfig {
        bridge: Some("vmbr1".to_string()),
        model: None,
        tag: None,
        firewall: None,
    };
    manager
        .edit_nic("conn", "pve1", 100, "qemu", "net0", config)
        .await
        .expect("nic should be edited");

    get_mock.assert();
    post_mock.assert();
}

#[tokio::test]
async fn edit_nic_tag_clear_preserves_other_attributes() {
    let server = MockServer::start();
    let token = "root@pam!edit-nic-tag-token";
    let get_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/qemu/100/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {"net0": "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0,tag=10,link_down=1"}
                })
                .to_string(),
            );
    });
    let post_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/qemu/100/config")
            // urlencoded: `=` and `,` become `%3D` and `%2C`; the tag is gone
            // while the unmodeled `link_down` attribute is carried over.
            .body_includes("net0=virtio%3DAA%3ABB%3ACC%3ADD%3AEE%3AFF%2Cbridge%3Dvmbr0%2Clink_down%3D1")
            .body_excludes("tag");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let config = EditNICConfig {
        bridge: None,
        model: None,
        tag: Some(0),
        firewall: None,
    };
    manager
        .edit_nic("conn", "pve1", 100, "qemu", "net0", config)
        .await
        .expect("nic should be edited");

    get_mock.assert();
    post_mock.assert();
}

#[tokio::test]
async fn remove_nic_posts_delete() {
    let server = MockServer::start();
    let token = "root@pam!remove-nic-token";
    let mock = server.mock(|when, then| {
        when.method(DELETE)
            .path("/api2/json/nodes/pve1/qemu/100/config")
            .body_includes("delete=net0");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    manager
        .remove_nic("conn", "pve1", 100, "qemu", "net0")
        .await
        .expect("nic should be removed");

    mock.assert();
}

#[tokio::test]
async fn lxc_vm_types_use_lxc_path() {
    let server = MockServer::start();
    let token = "root@pam!lxc-token";
    let config_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/lxc/201/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {
                        "rootfs": "local:vm-201-disk-0,size=8G",
                        "mp0": "local:vm-201-mp-0,size=4G",
                        "net0": "name=eth0,bridge=vmbr0,ip=dhcp"
                    }
                })
                .to_string(),
            );
    });
    let resize_mock = server.mock(|when, then| {
        when.method(PUT)
            .path("/api2/json/nodes/pve1/lxc/201/resize")
            .body_includes("disk=rootfs")
            .body_includes("size=16G");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;

    // Containers use `rootfs`/`mpN` keys; they map onto Disk entries with the
    // container-specific device names, and LXC network keys without an
    // explicit model are still parsed.
    let disks = manager
        .get_disks("conn", "pve1", 201, "lxc")
        .await
        .expect("disks should be fetched");
    assert_eq!(disks.len(), 2);
    let rootfs = disks
        .iter()
        .find(|d| d.device == "rootfs")
        .expect("rootfs disk should be parsed");
    assert_eq!(rootfs.storage, "local");
    assert_eq!(rootfs.size, 8589934592); // 8G
    let mp0 = disks
        .iter()
        .find(|d| d.device == "mp0")
        .expect("mp0 disk should be parsed");
    assert_eq!(mp0.storage, "local");
    assert_eq!(mp0.size, 4294967296); // 4G

    let nics = manager
        .get_network_interfaces("conn", "pve1", 201, "lxc")
        .await
        .expect("nics should be fetched");
    assert_eq!(nics.len(), 1);
    assert_eq!(nics[0].name, "net0");
    assert_eq!(nics[0].bridge.as_deref(), Some("vmbr0"));
    // LXC format: `name=eth0` lead means no QEMU model=mac first segment.
    assert_eq!(nics[0].model, "");
    assert_eq!(nics[0].macaddr, "");

    manager
        .resize_disk("conn", "pve1", 201, "lxc", "rootfs", 17179869184)
        .await
        .expect("resize should succeed");

    config_mock.assert_calls(2);
    resize_mock.assert();
}

#[tokio::test]
async fn add_nic_lxc_writes_lxc_net_format() {
    let server = MockServer::start();
    let token = "root@pam!add-nic-lxc-token";
    let get_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/lxc/201/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {"memory": 2048}
                })
                .to_string(),
            );
    });
    let post_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/lxc/201/config")
            // urlencoded: `name=eth0,type=veth,bridge=vmbr0,hwaddr=BC:24:11:8D:DF:95,firewall=1`
            .body_includes(
                "net0=name%3Deth0%2Ctype%3Dveth%2Cbridge%3Dvmbr0%2Chwaddr%3DBC%3A24%3A11%3A8D%3ADF%3A95%2Cfirewall%3D1",
            );
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let config = AddNICConfig {
        bridge: "vmbr0".to_string(),
        // The model is ignored for LXC (containers always use veth), so an
        // otherwise-invalid model still succeeds.
        model: "veth".to_string(),
        macaddr: Some("BC:24:11:8D:DF:95".to_string()),
        tag: None,
        firewall: Some(true),
    };
    manager
        .add_nic("conn", "pve1", 201, "lxc", config)
        .await
        .expect("nic should be added");

    get_mock.assert();
    post_mock.assert();
}

#[tokio::test]
async fn add_nic_lxc_random_mac_and_no_firewall_omits_hwaddr_and_firewall() {
    let server = MockServer::start();
    let token = "root@pam!add-nic-lxc-plain-token";
    let get_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/lxc/201/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{"memory":2048}}"#);
    });
    let post_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/lxc/201/config")
            .body_includes("net0=name%3Deth0%2Ctype%3Dveth%2Cbridge%3Dvmbr0")
            .body_excludes("hwaddr")
            .body_excludes("firewall");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let config = AddNICConfig {
        bridge: "vmbr0".to_string(),
        model: "veth".to_string(),
        // `random` (or a missing MAC) means "let Proxmox assign one".
        macaddr: Some("random".to_string()),
        tag: None,
        firewall: None,
    };
    manager
        .add_nic("conn", "pve1", 201, "lxc", config)
        .await
        .expect("nic should be added");

    get_mock.assert();
    post_mock.assert();
}

#[tokio::test]
async fn edit_nic_lxc_reencodes_lxc_format() {
    let server = MockServer::start();
    let token = "root@pam!edit-nic-lxc-token";
    let get_mock = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/lxc/201/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(
                serde_json::json!({
                    "data": {"net0": "name=eth0,type=veth,hwaddr=BC:24:11:8D:DF:95,bridge=vmbr0,ip=dhcp,firewall=0"}
                })
                .to_string(),
            );
    });
    let post_mock = server.mock(|when, then| {
        when.method(POST)
            .path("/api2/json/nodes/pve1/lxc/201/config")
            // urlencoded; the LXC form is rebuilt (`name=eth0,type=veth,
            // hwaddr=...`) with the new bridge/firewall and the unknown
            // `ip=dhcp` attribute carried over, but no tag.
            .body_includes(
                "net0=name%3Deth0%2Ctype%3Dveth%2Chwaddr%3DBC%3A24%3A11%3A8D%3ADF%3A95%2Cbridge%3Dvmbr1%2Cfirewall%3D1%2Cip%3Ddhcp",
            )
            .body_excludes("tag");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":null}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), token, None).await;
    let config = EditNICConfig {
        bridge: Some("vmbr1".to_string()),
        model: None,
        tag: None,
        firewall: Some(true),
    };
    manager
        .edit_nic("conn", "pve1", 201, "lxc", "net0", config)
        .await
        .expect("nic should be edited");

    get_mock.assert();
    post_mock.assert();
}

#[tokio::test]
async fn invalid_vm_type_errors() {
    let server = MockServer::start();
    let probe = server.mock(|when, then| {
        when.method(GET)
            .path("/api2/json/nodes/pve1/kvm/100/config");
        then.status(200)
            .header("content-type", "application/json")
            .body(r#"{"data":{}}"#);
    });

    let (manager, _dir) = setup_manager(&server.base_url(), "root@pam!bad-type-token", None).await;

    let error = manager
        .get_disks("conn", "pve1", 100, "kvm")
        .await
        .expect_err("invalid vm type must be rejected");
    assert!(
        matches!(error, Error::InvalidUrl(ref message) if message.contains("kvm")),
        "expected InvalidUrl mentioning 'kvm', got: {}",
        error
    );

    let config = AddNICConfig {
        bridge: "vmbr0".to_string(),
        model: "virtio".to_string(),
        macaddr: None,
        tag: None,
        firewall: None,
    };
    let error = manager
        .add_nic("conn", "pve1", 100, "kvm", config)
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
