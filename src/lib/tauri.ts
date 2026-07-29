// Tauri IPC commands interface
// These functions call into the Rust backend via Tauri's invoke mechanism

import type { ConnectionConfig, CertificateInfo, LoginResult } from '@/types/connection'
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
  CreateSnapshotConfig,
  BackupJobConfig,
  RestoreConfig,
  VNCProxyResponse,
  TermProxyResponse,
} from '@/types/proxmox'

// Check if we're running in Tauri
export const isTauri = () => {
  return '__TAURI__' in window
}

// Mock responses for development without Tauri
const mockResponse = <T>(data: T): Promise<T> => {
  return new Promise((resolve) => setTimeout(() => resolve(data), 300))
}

// Connection management
export const addConnection = async (config: ConnectionConfig): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('add_connection', { config })
}

export const removeConnection = async (id: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('remove_connection', { id })
}

export const connectToServer = async (id: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('connect_to_server', { id })
}

export const disconnectFromServer = async (id: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('disconnect_from_server', { id })
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
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('login_with_password', { url, username, password })
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
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('login_with_token', { url, token })
}

export const logout = async (connectionId: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('logout', { connectionId })
}

export const getStoredCredentials = async (
  connectionId: string,
): Promise<string | null> => {
  if (!isTauri()) return mockResponse(null)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_stored_credentials', { connectionId })
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
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_certificate_info', { url })
}

export const trustCertificate = async (id: string, fingerprint: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('trust_certificate', { id, fingerprint })
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
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_nodes', { connectionId })
}

export const getVMs = async (connectionId: string): Promise<ProxmoxVM[]> => {
  if (!isTauri()) return mockResponse([])
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_vms', { connectionId })
}

export const getStorage = async (connectionId: string): Promise<ProxmoxStorage[]> => {
  if (!isTauri()) return mockResponse([])
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_storage', { connectionId })
}

export const getStorageContent = async (
  connectionId: string,
  storage: string,
): Promise<ProxmoxStorageContent[]> => {
  if (!isTauri()) {
    return mockResponse([
      { content: 'images', ctime: Date.now() / 1000, format: 'qcow2', size: 32 * 1024 * 1024 * 1024, volid: 'local-lvm:vm-100-disk-0' },
      { content: 'images', ctime: Date.now() / 1000, format: 'raw', size: 64 * 1024 * 1024 * 1024, volid: 'local-lvm:vm-101-disk-0' },
      { content: 'backup', ctime: Date.now() / 1000 - 86400, size: 5 * 1024 * 1024 * 1024, volid: 'local:backup/vzdump-qemu-100-2024_01_01-120000.vma.zst' },
      { content: 'iso', ctime: Date.now() / 1000 - 172800, size: 4 * 1024 * 1024 * 1024, volid: 'local:iso/ubuntu-22.04-desktop-amd64.iso' },
    ])
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_storage_content', { connectionId, storage })
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
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_storage_detail', { connectionId, node, storage })
}

export const getTasks = async (connectionId: string): Promise<ProxmoxTask[]> => {
  if (!isTauri()) return mockResponse([])
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_tasks', { connectionId })
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
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_cluster_status', { connectionId })
}

// VM lifecycle
export const startVM = async (connectionId: string, node: string, vmid: number): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('start_vm', { connectionId, node, vmid })
}

export const stopVM = async (connectionId: string, node: string, vmid: number): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('stop_vm', { connectionId, node, vmid })
}

export const shutdownVM = async (connectionId: string, node: string, vmid: number): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('shutdown_vm', { connectionId, node, vmid })
}

export const rebootVM = async (connectionId: string, node: string, vmid: number): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('reboot_vm', { connectionId, node, vmid })
}

export const suspendVM = async (connectionId: string, node: string, vmid: number): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('suspend_vm', { connectionId, node, vmid })
}

export const resumeVM = async (connectionId: string, node: string, vmid: number): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('resume_vm', { connectionId, node, vmid })
}

// Disk management
export const getDisks = async (
  connectionId: string,
  node: string,
  vmid: number,
): Promise<ProxmoxDisk[]> => {
  if (!isTauri()) {
    return mockResponse([
      { device: 'scsi0', size: 32 * 1024 * 1024 * 1024, storage: 'local-lvm', format: 'qcow2', usage: 'Root' },
      { device: 'scsi1', size: 64 * 1024 * 1024 * 1024, storage: 'local-lvm', format: 'qcow2' },
    ])
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_disks', { connectionId, node, vmid })
}

export const addDisk = async (
  connectionId: string,
  node: string,
  vmid: number,
  config: AddDiskConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('add_disk', { connectionId, node, vmid, config })
}

export const resizeDisk = async (
  connectionId: string,
  node: string,
  vmid: number,
  disk: string,
  size: number,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('resize_disk', { connectionId, node, vmid, disk, size })
}

export const removeDisk = async (
  connectionId: string,
  node: string,
  vmid: number,
  disk: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('remove_disk', { connectionId, node, vmid, disk })
}

export const moveDisk = async (
  connectionId: string,
  node: string,
  vmid: number,
  disk: string,
  storage: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('move_disk', { connectionId, node, vmid, disk, storage })
}

// Network management
export const getNetworkInterfaces = async (
  connectionId: string,
  node: string,
  vmid: number,
): Promise<ProxmoxNetwork[]> => {
  if (!isTauri()) {
    return mockResponse([
      { name: 'net0', model: 'virtio', macaddr: 'BC:24:11:AA:BB:CC', bridge: 'vmbr0', firewall: 1 },
    ])
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_network_interfaces', { connectionId, node, vmid })
}

export const addNIC = async (
  connectionId: string,
  node: string,
  vmid: number,
  config: AddNICConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('add_nic', { connectionId, node, vmid, config })
}

export const editNIC = async (
  connectionId: string,
  node: string,
  vmid: number,
  nic: string,
  config: EditNICConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('edit_nic', { connectionId, node, vmid, nic, config })
}

export const removeNIC = async (
  connectionId: string,
  node: string,
  vmid: number,
  nic: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('remove_nic', { connectionId, node, vmid, nic })
}

// Snapshot management
export const getSnapshots = async (
  connectionId: string,
  node: string,
  vmid: number,
): Promise<ProxmoxSnapshot[]> => {
  if (!isTauri()) return mockResponse([])
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_snapshots', { connectionId, node, vmid })
}

export const createSnapshot = async (
  connectionId: string,
  node: string,
  vmid: number,
  config: CreateSnapshotConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('create_snapshot', { connectionId, node, vmid, config })
}

export const deleteSnapshot = async (
  connectionId: string,
  node: string,
  vmid: number,
  name: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('delete_snapshot', { connectionId, node, vmid, name })
}

export const rollbackSnapshot = async (
  connectionId: string,
  node: string,
  vmid: number,
  name: string,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('rollback_snapshot', { connectionId, node, vmid, name })
}

// VM migration
export const migrateVM = async (
  connectionId: string,
  node: string,
  vmid: number,
  targetNode: string,
  online: boolean,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('migrate_vm', { connectionId, node, vmid, targetNode, online })
}

// Console proxy
export const createVNCProxy = async (
  connectionId: string,
  node: string,
  vmid: number,
): Promise<VNCProxyResponse> => {
  if (!isTauri()) {
    return mockResponse({
      ticket: 'mock-vnc-ticket-' + Date.now(),
      port: 6000 + (vmid % 1000),
      cert: '',
    })
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('create_vnc_proxy', { connectionId, node, vmid })
}

export const createTermProxy = async (
  connectionId: string,
  node: string,
  vmid: number,
): Promise<TermProxyResponse> => {
  if (!isTauri()) {
    return mockResponse({
      ticket: 'mock-term-ticket-' + Date.now(),
      port: 6100 + (vmid % 1000),
    })
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('create_term_proxy', { connectionId, node, vmid })
}

export const getWebSocketURL = async (
  connectionId: string,
  node: string,
): Promise<string> => {
  if (!isTauri()) {
    return mockResponse(`wss://localhost:8006`)
  }
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_websocket_url', { connectionId, node })
}

// WebSocket management
export const connectWebSocket = async (connectionId: string, url: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('connect_websocket', { connectionId, url })
}

export const disconnectWebSocket = async (connectionId: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('disconnect_websocket', { connectionId })
}

export const isWebSocketConnected = async (connectionId: string): Promise<boolean> => {
  if (!isTauri()) return mockResponse(false)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('is_websocket_connected', { connectionId })
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
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_backup_jobs', { connectionId })
}

export const getBackups = async (
  connectionId: string,
  storage?: string,
): Promise<ProxmoxBackup[]> => {
  if (!isTauri()) return mockResponse([])
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('get_backups', { connectionId, storage })
}

export const createBackupJob = async (
  connectionId: string,
  config: BackupJobConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('create_backup_job', { connectionId, config })
}

export const updateBackupJob = async (
  connectionId: string,
  id: string,
  config: BackupJobConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('update_backup_job', { connectionId, id, config })
}

export const deleteBackupJob = async (connectionId: string, id: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('delete_backup_job', { connectionId, id })
}

export const runBackup = async (
  connectionId: string,
  config: BackupJobConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('run_backup', { connectionId, config })
}

export const restoreBackup = async (
  connectionId: string,
  volid: string,
  config: RestoreConfig,
): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('restore_backup', { connectionId, volid, config })
}

export const deleteBackup = async (connectionId: string, volid: string): Promise<void> => {
  if (!isTauri()) return mockResponse(undefined)
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke('delete_backup', { connectionId, volid })
}
