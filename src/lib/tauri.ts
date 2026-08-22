// Tauri IPC commands interface
// These functions call into the Rust backend via Tauri's invoke mechanism

import type {
  ConnectionConfig,
  CertificateInfo,
  LoginResult,
  LoadConnectionsResult,
  ConnectResult,
  ConnectionStatusInfo,
  ServerType,
} from '@/types/connection'
import type {
  PbsDatastore,
  PbsVersion,
  PbsNodeStatus,
  PbsBackupGroup,
  PbsSnapshot,
  PbsSnapshotFile,
  PbsJob,
} from '@/types/pbs'
import type {
  ProxmoxNode,
  ProxmoxVM,
  ProxmoxStorage,
  ProxmoxStorageContent,
  ProxmoxStorageDetail,
  ProxmoxTask,
  ProxmoxClusterStatus,
  ProxmoxDisk,
  ProxmoxNetwork,
  ProxmoxSnapshot,
  ProxmoxBackup,
  ProxmoxBackupJob,
  AddDiskConfig,
  AddNICConfig,
  EditNICConfig,
  UpdateVMConfig,
  CreateSnapshotConfig,
  BackupJobConfig,
  RestoreConfig,
  ConsoleProxyInfo,
} from '@/types/proxmox'

// Check if we're running inside a Tauri webview.
//
// Tauri v2 injects the IPC bridge as `window.__TAURI_INTERNALS__` on every
// page it hosts (dev and prod). The old `window.__TAURI__` global was the
// Tauri v1 convention and no longer exists by default in v2 — checking for it
// made `isTauri()` return false inside the real app, silently falling back to
// the browser mock data. This mirrors `isTauri()` from `@tauri-apps/api/core`.
export const isTauri = () => {
  return '__TAURI_INTERNALS__' in window
}

// Mock responses for development without Tauri
const mockResponse = <T>(data: T): Promise<T> => {
  return new Promise((resolve) => setTimeout(() => resolve(data), 300))
}

// Invoke a backend command, normalizing the rejection into a real Error so
// callers see the backend's message instead of a bare string (Tauri rejects
// with a string for command errors).
async function invokeCommand<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) {
    throw new Error('Tauri backend not available in browser mode')
  }
  const { invoke } = await import('@tauri-apps/api/core')
  try {
    return await invoke<T>(cmd, args)
  } catch (e) {
    throw new Error(typeof e === 'string' ? e : e instanceof Error ? e.message : String(e))
  }
}

// Connection management
export const loadConnections = async (): Promise<LoadConnectionsResult> => {
  if (!isTauri()) {
    return mockResponse({ activeConnectionId: null, connections: [] })
  }
  return invokeCommand<LoadConnectionsResult>('load_connections')
}

export const addConnection = async (config: ConnectionConfig): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('add_connection', { config })
}

export const removeConnection = async (id: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('remove_connection', { id })
}

export const updateConnection = async (config: ConnectionConfig): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('update_connection', { config })
}

export const connectToServer = async (id: string): Promise<ConnectResult> => {
  if (!isTauri()) {
    return mockResponse({ connectionId: id, mergedInto: null, status: 'connected' })
  }
  return invokeCommand<ConnectResult>('connect_to_server', { id })
}

export const getConnectionStatus = async (
  connectionId: string,
): Promise<ConnectionStatusInfo> => {
  if (!isTauri()) {
    return mockResponse({
      connectionId,
      status: 'connected',
      primaryUrl: '',
      currentEndpointUrl: '',
      nodes: [],
    })
  }
  return invokeCommand<ConnectionStatusInfo>('get_connection_status', { connectionId })
}

export const disconnectFromServer = async (id: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('disconnect_from_server', { id })
}

export const setActiveConnection = async (id: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('set_active_connection', { id })
}

// Authentication
export const loginWithPassword = async (
  url: string,
  username: string,
  password: string,
): Promise<LoginResult> => {
  if (!isTauri()) {
    return mockResponse({
      connectionId: crypto.randomUUID(),
      ticket: 'mock-ticket-' + Date.now(),
      csrfToken: 'mock-csrf-' + Date.now(),
    })
  }
  return invokeCommand<LoginResult>('login_with_password', { url, username, password })
}

export const loginWithToken = async (
  url: string,
  token: string,
  serverType: ServerType = 'pve',
): Promise<LoginResult> => {
  if (!isTauri()) {
    return mockResponse({
      connectionId: crypto.randomUUID(),
      ticket: token,
      csrfToken: '',
    })
  }
  return invokeCommand<LoginResult>('login_with_token', { url, token, serverType })
}

export const logout = async (connectionId: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('logout', { connectionId })
}

export const getCertificateInfo = async (url: string): Promise<CertificateInfo> => {
  if (!isTauri()) {
    return mockResponse({
      fingerprint: 'AB:CD:EF:12:34:56:78:90:AB:CD:EF:12:34:56:78:90',
      issuer: 'Proxmox Virtual Environment',
      subject: 'pve.local',
      validFrom: '2024-01-01',
      validTo: '2034-01-01',
      selfSigned: true,
    })
  }
  return invokeCommand<CertificateInfo>('get_certificate_info', { url })
}

export const trustCertificate = async (id: string, fingerprint: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('trust_certificate', { id, fingerprint })
}

// API calls
export const getNodes = async (connectionId: string): Promise<ProxmoxNode[]> => {
  if (!isTauri()) {
    return mockResponse([
      {
        node: 'pve1',
        status: 'online',
        cpu: 0.42,
        maxcpu: 8,
        mem: 16_000_000_000,
        maxmem: 32_000_000_000,
        disk: 200_000_000_000,
        maxdisk: 500_000_000_000,
        uptime: 86400,
        level: '',
        id: 'node/pve1',
        type: 'node',
      },
    ])
  }
  return invokeCommand<ProxmoxNode[]>('get_nodes', { connectionId })
}

export const getVMs = async (connectionId: string): Promise<ProxmoxVM[]> => {
  if (!isTauri()) {
    return mockResponse([
      {
        vmid: 100, name: 'web-01', status: 'running', type: 'qemu', node: 'pve1',
        cpu: 0.12, cpus: 4, mem: 4.2 * 1024 ** 3, maxmem: 8 * 1024 ** 3,
        disk: 22 * 1024 ** 3, maxdisk: 64 * 1024 ** 3, uptime: 86400 * 9 + 4210,
        netin: 1.2 * 1024 ** 3, netout: 3.4 * 1024 ** 3,
        diskread: 12 * 1024 ** 3, diskwrite: 8.7 * 1024 ** 3, pid: 1024,
        tags: 'web;production',
      },
      {
        vmid: 101, name: 'db-01', status: 'running', type: 'qemu', node: 'pve2',
        cpu: 0.38, cpus: 8, mem: 21.5 * 1024 ** 3, maxmem: 32 * 1024 ** 3,
        disk: 148 * 1024 ** 3, maxdisk: 512 * 1024 ** 3, uptime: 86400 * 23 + 1102,
        netin: 18.2 * 1024 ** 3, netout: 9.1 * 1024 ** 3,
        diskread: 220 * 1024 ** 3, diskwrite: 190 * 1024 ** 3, pid: 2048,
        tags: 'database;production',
      },
      {
        vmid: 102, name: 'worker-01', status: 'stopped', type: 'qemu', node: 'pve1',
        cpu: 0, cpus: 4, mem: 0, maxmem: 16 * 1024 ** 3,
        disk: 30 * 1024 ** 3, maxdisk: 128 * 1024 ** 3, uptime: 0,
        netin: 0, netout: 0, diskread: 40 * 1024 ** 3, diskwrite: 22 * 1024 ** 3,
      },
      {
        vmid: 103, name: 'monitoring', status: 'running', type: 'lxc', node: 'pve3',
        cpu: 0.06, cpus: 2, mem: 1.1 * 1024 ** 3, maxmem: 4 * 1024 ** 3,
        disk: 9 * 1024 ** 3, maxdisk: 32 * 1024 ** 3, uptime: 86400 * 41 + 300,
        netin: 6.2 * 1024 ** 3, netout: 4.8 * 1024 ** 3,
        diskread: 15 * 1024 ** 3, diskwrite: 11 * 1024 ** 3, pid: 3072,
      },
      {
        vmid: 104, name: 'ci-runner', status: 'running', type: 'qemu', node: 'pve3',
        cpu: 0.71, cpus: 8, mem: 12.4 * 1024 ** 3, maxmem: 16 * 1024 ** 3,
        disk: 61 * 1024 ** 3, maxdisk: 128 * 1024 ** 3, uptime: 86400 * 2 + 18700,
        netin: 44 * 1024 ** 3, netout: 31 * 1024 ** 3,
        diskread: 90 * 1024 ** 3, diskwrite: 120 * 1024 ** 3, pid: 4096,
        tags: 'ci',
      },
      {
        vmid: 105, name: 'home-assistant', status: 'running', type: 'lxc', node: 'pve1',
        cpu: 0.03, cpus: 2, mem: 0.8 * 1024 ** 3, maxmem: 2 * 1024 ** 3,
        disk: 6 * 1024 ** 3, maxdisk: 16 * 1024 ** 3, uptime: 86400 * 66 + 500,
        netin: 2.1 * 1024 ** 3, netout: 1.7 * 1024 ** 3,
        diskread: 4 * 1024 ** 3, diskwrite: 9 * 1024 ** 3, pid: 5120,
      },
    ])
  }
  return invokeCommand<ProxmoxVM[]>('get_vms', { connectionId })
}

export const getStorage = async (connectionId: string): Promise<ProxmoxStorage[]> => {
  if (!isTauri()) {
    return mockResponse([
      { storage: 'local', type: 'dir', content: 'iso,vztmpl,backup', active: 1, enabled: 1, shared: 0, used: 18 * 1024 ** 3, total: 94 * 1024 ** 3, avail: 76 * 1024 ** 3, node: 'pve1' },
      { storage: 'local-lvm', type: 'lvmthin', content: 'images,rootdir', active: 1, enabled: 1, shared: 0, used: 96 * 1024 ** 3, total: 200 * 1024 ** 3, avail: 104 * 1024 ** 3, node: 'pve1' },
      { storage: 'nas-backup', type: 'nfs', content: 'backup', active: 1, enabled: 1, shared: 1, used: 410 * 1024 ** 3, total: 1024 * 1024 ** 3, avail: 614 * 1024 ** 3, node: 'pve2' },
    ])
  }
  return invokeCommand<ProxmoxStorage[]>('get_storage', { connectionId })
}

export const getStorageContent = async (
  connectionId: string,
  storage: string,
  node?: string,
): Promise<ProxmoxStorageContent[]> => {
  if (!isTauri()) {
    return mockResponse([
      { content: 'images', ctime: Date.now() / 1000, format: 'qcow2', size: 32 * 1024 * 1024 * 1024, volid: 'local-lvm:vm-100-disk-0' },
      { content: 'images', ctime: Date.now() / 1000, format: 'raw', size: 64 * 1024 * 1024 * 1024, volid: 'local-lvm:vm-101-disk-0' },
      { content: 'backup', ctime: Date.now() / 1000 - 86400, size: 5 * 1024 * 1024 * 1024, volid: 'local:backup/vzdump-qemu-100-2024_01_01-120000.vma.zst' },
      { content: 'iso', ctime: Date.now() / 1000 - 172800, size: 4 * 1024 * 1024 * 1024, volid: 'local:iso/ubuntu-22.04-desktop-amd64.iso' },
    ])
  }
  return invokeCommand<ProxmoxStorageContent[]>('get_storage_content', { connectionId, storage, node })
}

export const getStorageDetail = async (
  connectionId: string,
  node: string,
  storage: string,
): Promise<ProxmoxStorageDetail> => {
  if (!isTauri()) {
    return mockResponse({
      storage,
      type: 'lvmthin',
      content: 'images,rootdir',
      active: 1,
      enabled: 1,
      shared: 0,
      used: 96 * 1024 * 1024 * 1024,
      total: 200 * 1024 * 1024 * 1024,
      avail: 104 * 1024 * 1024 * 1024,
      node,
    })
  }
  return invokeCommand<ProxmoxStorageDetail>('get_storage_detail', { connectionId, node, storage })
}

export const getTasks = async (connectionId: string): Promise<ProxmoxTask[]> => {
  if (!isTauri()) {
    const now = Date.now() / 1000
    const task = (
      type: string,
      id: string,
      node: string,
      minutesAgo: number,
      status: string | undefined,
      user = 'root@pam',
    ): ProxmoxTask => ({
      upid: `UPID:${node}:0000${minutesAgo}:${type}:${id}:${user}:`,
      node,
      pid: 1000 + minutesAgo,
      pstart: minutesAgo * 10,
      starttime: now - minutesAgo * 60,
      endtime: status ? now - minutesAgo * 60 + 45 : undefined,
      type,
      id,
      user,
      status,
      exitstatus: status === 'OK' ? 'OK' : undefined,
    })
    return mockResponse([
      { ...task('qmstart', '100', 'pve1', 0.2, undefined), status: undefined },
      task('vzdump', '101', 'pve2', 3, 'OK'),
      task('qmmigrate', '102', 'pve1', 18, 'OK'),
      task('aptupdate', '', 'pve3', 61, 'OK'),
      task('vzdump', '104', 'pve3', 240, 'OK'),
      task('cefsync', '', 'pve1', 610, 'OK'),
    ])
  }
  return invokeCommand<ProxmoxTask[]>('get_tasks', { connectionId })
}

export const getClusterStatus = async (connectionId: string): Promise<ProxmoxClusterStatus> => {
  if (!isTauri()) {
    return mockResponse({
      type: 'cluster',
      name: 'home-lab',
      id: 'cluster/home-lab',
      nodes: [],
    })
  }
  return invokeCommand<ProxmoxClusterStatus>('get_cluster_status', { connectionId })
}

// VM lifecycle
export const startVM = async (connectionId: string, node: string, vmid: number, vmType: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('start_vm', { connectionId, node, vmid, vmType })
}

export const stopVM = async (connectionId: string, node: string, vmid: number, vmType: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('stop_vm', { connectionId, node, vmid, vmType })
}

export const shutdownVM = async (connectionId: string, node: string, vmid: number, vmType: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('shutdown_vm', { connectionId, node, vmid, vmType })
}

export const rebootVM = async (connectionId: string, node: string, vmid: number, vmType: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('reboot_vm', { connectionId, node, vmid, vmType })
}

export const suspendVM = async (connectionId: string, node: string, vmid: number, vmType: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('suspend_vm', { connectionId, node, vmid, vmType })
}

export const resumeVM = async (connectionId: string, node: string, vmid: number, vmType: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('resume_vm', { connectionId, node, vmid, vmType })
}

// Disk management
export const getDisks = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
): Promise<ProxmoxDisk[]> => {
  if (!isTauri()) {
    return mockResponse([
      { device: 'scsi0', size: 32 * 1024 * 1024 * 1024, storage: 'local-lvm', format: 'qcow2', usage: 'Root' },
      { device: 'scsi1', size: 64 * 1024 * 1024 * 1024, storage: 'local-lvm', format: 'qcow2' },
    ])
  }
  return invokeCommand<ProxmoxDisk[]>('get_disks', { connectionId, node, vmid, vmType })
}

export const addDisk = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  config: AddDiskConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('add_disk', { connectionId, node, vmid, vmType, config })
}

export const resizeDisk = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  disk: string,
  size: number,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('resize_disk', { connectionId, node, vmid, vmType, disk, size })
}

export const removeDisk = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  disk: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('remove_disk', { connectionId, node, vmid, vmType, disk })
}

export const moveDisk = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  disk: string,
  storage: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('move_disk', { connectionId, node, vmid, vmType, disk, storage })
}

// Network management
export const getNetworkInterfaces = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
): Promise<ProxmoxNetwork[]> => {
  if (!isTauri()) {
    return mockResponse([
      { name: 'net0', model: 'virtio', macaddr: 'BC:24:11:AA:BB:CC', bridge: 'vmbr0', firewall: 1 },
    ])
  }
  return invokeCommand<ProxmoxNetwork[]>('get_network_interfaces', { connectionId, node, vmid, vmType })
}

export const addNIC = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  config: AddNICConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('add_nic', { connectionId, node, vmid, vmType, config })
}

export const editNIC = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  nic: string,
  config: EditNICConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('edit_nic', { connectionId, node, vmid, vmType, nic, config })
}

export const removeNIC = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  nic: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('remove_nic', { connectionId, node, vmid, vmType, nic })
}

// Snapshot management
export const getSnapshots = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
): Promise<ProxmoxSnapshot[]> => {
  if (!isTauri()) {
    const now = Date.now() / 1000
    return mockResponse([
      {
        name: 'pre-upgrade',
        description: 'Before PostgreSQL 16 upgrade',
        snaptime: Math.floor(now - 3 * 86400),
        vmstate: 1,
      },
      {
        name: 'weekly-auto',
        description: '',
        snaptime: Math.floor(now - 86400),
        vmstate: 0,
      },
    ])
  }
  return invokeCommand<ProxmoxSnapshot[]>('get_snapshots', { connectionId, node, vmid, vmType })
}

export const createSnapshot = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  config: CreateSnapshotConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('create_snapshot', { connectionId, node, vmid, vmType, config })
}

export const deleteSnapshot = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  name: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('delete_snapshot', { connectionId, node, vmid, vmType, name })
}

export const rollbackSnapshot = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  name: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('rollback_snapshot', { connectionId, node, vmid, vmType, name })
}

// VM migration
export const migrateVM = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  targetNode: string,
  online: boolean,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('migrate_vm', { connectionId, node, vmid, vmType, targetNode, online })
}

// VM configuration
export const updateVMConfig = async (
  connectionId: string,
  node: string,
  vmid: number,
  vmType: string,
  config: UpdateVMConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('update_vm_config', { connectionId, node, vmid, vmType, config })
}

// Console proxy
export const startConsoleProxy = async (
  connectionId: string,
  kind: 'vnc' | 'term',
  node: string,
  vmid: number,
): Promise<ConsoleProxyInfo> => {
  if (!isTauri()) {
    return mockResponse({ sessionId: crypto.randomUUID(), url: '' })
  }
  return invokeCommand<ConsoleProxyInfo>('start_console_proxy', { connectionId, kind, node, vmid })
}

export const stopConsoleProxy = async (sessionId: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('stop_console_proxy', { sessionId })
}

export const getWebSocketURL = async (
  connectionId: string,
  node: string,
): Promise<string> => {
  if (!isTauri()) {
    return mockResponse(`wss://localhost:8006`)
  }
  return invokeCommand<string>('get_websocket_url', { connectionId, node })
}

// WebSocket management
export const connectWebSocket = async (connectionId: string, url: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('connect_websocket', { connectionId, url })
}

export const disconnectWebSocket = async (connectionId: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('disconnect_websocket', { connectionId })
}

export const isWebSocketConnected = async (connectionId: string): Promise<boolean> => {
  if (!isTauri()) return mockResponse(false)
  return invokeCommand<boolean>('is_websocket_connected', { connectionId })
}

// Backup management
export const getBackupJobs = async (connectionId: string): Promise<ProxmoxBackupJob[]> => {
  if (!isTauri()) {
    return mockResponse([
      {
        id: 'job-1',
        store: 'local',
        schedule: '0 2 * * *',
        all: 1,
        enabled: 1,
        mode: 'snapshot',
        compress: 'zstd',
      },
    ])
  }
  return invokeCommand<ProxmoxBackupJob[]>('get_backup_jobs', { connectionId })
}

export const getBackups = async (
  connectionId: string,
  storage?: string,
): Promise<ProxmoxBackup[]> => {
  if (!isTauri()) {
    const now = Date.now() / 1000
    const day = 86400
    const backup = (
      vmid: number,
      daysAgo: number,
      sizeGb: number,
      store = 'nas-backup',
    ): ProxmoxBackup => ({
      volid: `${store}:backup/vzdump-qemu-${vmid}-${new Date(now - daysAgo * day * 1000).toISOString().slice(0, 10)}_${String(Math.floor((now % 86400) / 3600)).padStart(2, '0')}0000.vma.zst`,
      backupid: String(vmid),
      'backup-type': 'qemu',
      'backup-id': String(vmid),
      'backup-time': Math.floor(now - daysAgo * day),
      storage: store,
      size: sizeGb * 1024 ** 3,
      ctime: now - daysAgo * day,
    })
    void name
    return mockResponse([
      backup(101, 1, 148),
      backup(101, 2, 147),
      backup(100, 1, 22),
      backup(104, 3, 61),
      backup(105, 1, 6),
      backup(102, 5, 30),
    ])
  }
  return invokeCommand<ProxmoxBackup[]>('get_backups', { connectionId, storage })
}

export const createBackupJob = async (
  connectionId: string,
  config: BackupJobConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('create_backup_job', { connectionId, config })
}

export const updateBackupJob = async (
  connectionId: string,
  id: string,
  config: BackupJobConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('update_backup_job', { connectionId, id, config })
}

export const deleteBackupJob = async (connectionId: string, id: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('delete_backup_job', { connectionId, id })
}

export const runBackup = async (
  connectionId: string,
  config: BackupJobConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('run_backup', { connectionId, config })
}

export const restoreBackup = async (
  connectionId: string,
  volid: string,
  config: RestoreConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('restore_backup', { connectionId, volid, config })
}

export const deleteBackup = async (connectionId: string, volid: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('delete_backup', { connectionId, volid })
}

// Tray menu
export const updateTrayMenu = async (
  connections: { id: string; name: string; status: string }[],
): Promise<void> => {
  if (!isTauri()) return
  return invokeCommand<void>('update_tray_menu', { connections })
}

// Proxmox Backup Server (PBS)
export const getPbsDatastores = async (connectionId: string): Promise<PbsDatastore[]> => {
  if (!isTauri()) {
    return mockResponse([
      {
        store: 'backup-store',
        comment: 'Main backup store',
        backendType: 'filesystem',
        mountStatus: 'mounted',
        total: 2_000_000_000_000,
        used: 800_000_000_000,
        avail: 1_200_000_000_000,
      },
    ])
  }
  return invokeCommand<PbsDatastore[]>('get_pbs_datastores', { connectionId })
}

export const getPbsVersion = async (connectionId: string): Promise<PbsVersion> => {
  if (!isTauri()) {
    return mockResponse({ version: '3.2.3', release: 'bookworm', repoid: 'dd6b00e2' })
  }
  return invokeCommand<PbsVersion>('get_pbs_version', { connectionId })
}

export const getPbsNodeStatus = async (connectionId: string): Promise<PbsNodeStatus> => {
  if (!isTauri()) {
    return mockResponse({
      cpu: 0.15,
      loadavg: [0.42, 0.38, 0.31],
      uptime: 5 * 86400,
      memory: { free: 12_000_000_000, total: 32_000_000_000, used: 20_000_000_000 },
      root: { avail: 1_200_000_000_000, total: 2_000_000_000_000, used: 800_000_000_000 },
      swap: { free: 4_000_000_000, total: 4_000_000_000, used: 0 },
      cpuinfo: { cpus: 8, model: 'AMD Ryzen 7 5700G', sockets: 1 },
      currentKernel: {
        machine: 'x86_64',
        release: '6.8.12-4-pve',
        sysname: 'Linux',
        version: '#1 SMP PREEMPT_DYNAMIC',
      },
    })
  }
  return invokeCommand<PbsNodeStatus>('get_pbs_node_status', { connectionId })
}

export const getPbsGroups = async (
  connectionId: string,
  store: string,
): Promise<PbsBackupGroup[]> => {
  if (!isTauri()) {
    return mockResponse([
      {
        backupId: '100',
        backupType: 'vm',
        backupCount: 3,
        lastBackup: 1_700_000_000,
        comment: 'Web server',
      },
      {
        backupId: '200',
        backupType: 'ct',
        backupCount: 2,
        lastBackup: 1_690_000_000,
        comment: 'Container host',
      },
    ])
  }
  return invokeCommand<PbsBackupGroup[]>('get_pbs_groups', { connectionId, store })
}

export const getPbsSnapshots = async (
  connectionId: string,
  store: string,
  backupId: string,
  backupType: PbsSnapshot['backupType'],
): Promise<PbsSnapshot[]> => {
  if (!isTauri()) {
    return mockResponse([
      {
        backupId,
        backupType,
        backupTime: 1_700_000_000,
        size: 1_500_000_000,
        protected: true,
        comment: 'Full backup',
        verification: { state: 'ok' },
      },
      {
        backupId,
        backupType,
        backupTime: 1_700_086_400,
        size: 900_000_000,
        comment: 'Incremental backup',
      },
    ])
  }
  return invokeCommand<PbsSnapshot[]>('get_pbs_snapshots', { connectionId, store, backupId, backupType })
}

export const getPbsSnapshotFiles = async (
  connectionId: string,
  store: string,
  backupId: string,
  backupType: PbsSnapshot['backupType'],
  backupTime: number,
): Promise<PbsSnapshotFile[]> => {
  if (!isTauri()) {
    return mockResponse([
      { filename: 'client.conf', size: 1024 },
      { filename: 'drive-scsi0.img.fidx', size: 64 * 1024 * 1024 * 1024, cryptMode: 'none' },
      { filename: 'index.json.blob', size: 2048 },
    ])
  }
  return invokeCommand<PbsSnapshotFile[]>('get_pbs_snapshot_files', {
    connectionId,
    store,
    backupId,
    backupType,
    backupTime,
  })
}

export const downloadPbsSnapshotFile = async (
  connectionId: string,
  store: string,
  backupId: string,
  backupType: PbsSnapshot['backupType'],
  backupTime: number,
  fileName: string,
  decoded: boolean,
  savePath: string,
): Promise<string> => {
  if (!isTauri()) return mockResponse(savePath)
  return invokeCommand<string>('download_pbs_snapshot_file', {
    connectionId,
    store,
    backupId,
    backupType,
    backupTime,
    fileName,
    decoded,
    savePath,
  })
}

export const deletePbsSnapshot = async (
  connectionId: string,
  store: string,
  backupId: string,
  backupType: PbsSnapshot['backupType'],
  backupTime: number,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('delete_pbs_snapshot', {
    connectionId,
    store,
    backupId,
    backupType,
    backupTime,
  })
}

export const deletePbsGroup = async (
  connectionId: string,
  store: string,
  backupId: string,
  backupType: PbsSnapshot['backupType'],
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  return invokeCommand<void>('delete_pbs_group', { connectionId, store, backupId, backupType })
}

export const runPbsVerify = async (connectionId: string, store: string): Promise<string> => {
  if (!isTauri()) {
    return mockResponse(`UPID:mock:00000000:00000000:00000000:verify:${store}::`)
  }
  return invokeCommand<string>('run_pbs_verify', { connectionId, store })
}

export const runPbsPrune = async (
  connectionId: string,
  store: string,
  keepLast?: number,
  keepDaily?: number,
  keepWeekly?: number,
  keepMonthly?: number,
  keepYearly?: number,
  dryRun?: boolean,
): Promise<string> => {
  if (!isTauri()) {
    return mockResponse(`UPID:mock:00000000:00000000:00000000:prune:${store}::`)
  }
  return invokeCommand<string>('run_pbs_prune', {
    connectionId,
    store,
    keepLast,
    keepDaily,
    keepWeekly,
    keepMonthly,
    keepYearly,
    dryRun,
  })
}

export const runPbsGc = async (connectionId: string, store: string): Promise<string> => {
  if (!isTauri()) {
    return mockResponse(`UPID:mock:00000000:00000000:00000000:gc:${store}::`)
  }
  return invokeCommand<string>('run_pbs_gc', { connectionId, store })
}

export const getPbsVerifyJobs = async (
  connectionId: string,
  store?: string,
): Promise<PbsJob[]> => {
  if (!isTauri()) {
    return mockResponse([
      {
        id: 'verify-1',
        store: 'backup-store',
        schedule: 'sun 01:00',
        comment: 'Weekly verification',
        lastRunState: 'OK',
        lastRunEndtime: 1_700_000_000,
        nextRun: 1_700_600_000,
        maxDepth: 5,
      },
    ])
  }
  return invokeCommand<PbsJob[]>('get_pbs_verify_jobs', { connectionId, store })
}

export const getPbsPruneJobs = async (
  connectionId: string,
  store?: string,
): Promise<PbsJob[]> => {
  if (!isTauri()) {
    return mockResponse([
      {
        id: 'prune-1',
        store: 'backup-store',
        schedule: 'sat 02:00',
        comment: 'Weekly pruning',
        lastRunState: 'OK',
        lastRunEndtime: 1_690_000_000,
        nextRun: 1_700_000_000,
        keepLast: 7,
        keepDaily: 14,
        keepWeekly: 8,
        keepMonthly: 6,
        keepYearly: 2,
      },
    ])
  }
  return invokeCommand<PbsJob[]>('get_pbs_prune_jobs', { connectionId, store })
}

export const getPbsGcJobs = async (
  connectionId: string,
  store?: string,
): Promise<PbsJob[]> => {
  if (!isTauri()) {
    return mockResponse([
      {
        id: 'gc-1',
        store: 'backup-store',
        schedule: 'mon 03:00',
        comment: 'Weekly garbage collection',
        lastRunState: 'OK',
        lastRunEndtime: 1_690_000_000,
        nextRun: 1_700_000_000,
      },
    ])
  }
  return invokeCommand<PbsJob[]>('get_pbs_gc_jobs', { connectionId, store })
}
