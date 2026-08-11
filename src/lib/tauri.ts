// Tauri IPC commands interface
// These functions call into the Rust backend via Tauri's invoke mechanism

import type {
  ConnectionConfig,
  CertificateInfo,
  LoginResult,
  LoadConnectionsResult,
  ConnectResult,
  ConnectionStatusInfo,
} from '@/types/connection'
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
): Promise<LoginResult> => {
  if (!isTauri()) {
    return mockResponse({
      connectionId: crypto.randomUUID(),
      ticket: token,
      csrfToken: '',
    })
  }
  return invokeCommand<LoginResult>('login_with_token', { url, token })
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
  if (!isTauri()) return mockResponse([])
  return invokeCommand<ProxmoxVM[]>('get_vms', { connectionId })
}

export const getStorage = async (connectionId: string): Promise<ProxmoxStorage[]> => {
  if (!isTauri()) return mockResponse([])
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
  if (!isTauri()) return mockResponse([])
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
  if (!isTauri()) return mockResponse([])
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
  if (!isTauri()) return mockResponse([])
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
