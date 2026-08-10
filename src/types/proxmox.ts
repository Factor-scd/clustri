// Proxmox API types

export interface ProxmoxNode {
  node: string
  status: 'online' | 'offline'
  cpu: number
  maxcpu: number
  mem: number
  maxmem: number
  disk: number
  maxdisk: number
  uptime: number
  level: string
  id: string
  type: 'node'
}

export interface ProxmoxVM {
  vmid: number
  name: string
  status: 'running' | 'stopped' | 'paused' | 'suspended'
  type: 'qemu' | 'lxc'
  node: string
  cpu: number
  cpus: number
  mem: number
  maxmem: number
  disk: number
  maxdisk: number
  uptime: number
  netin: number
  netout: number
  diskread: number
  diskwrite: number
  pid?: number
  template?: number
  lock?: string
  tags?: string
}

export interface ProxmoxStorage {
  storage: string
  type: string
  content: string
  active: number
  enabled: number
  shared: number
  used: number
  total: number
  avail: number
  node: string
}

export interface ProxmoxStorageContent {
  content: string
  ctime: number
  format?: string
  size?: number
  subtype?: string
  volid: string
}

export interface ProxmoxStorageDetail {
  storage: string
  type: string
  content: string
  active: number
  enabled: number
  shared: number
  used: number
  total: number
  avail: number
  node: string
}

export interface ProxmoxTask {
  upid: string
  node: string
  pid: number
  pstart: number
  starttime: number
  endtime?: number
  type: string
  id: string
  user: string
  status?: string
  exitstatus?: string
}

export interface ProxmoxClusterStatus {
  type: 'node' | 'cluster'
  name: string
  id: string
  nodeid?: number
  version?: number
  local?: number
  online?: number
  nodes?: ClusterNode[]
}

export interface ClusterNode {
  name: string
  nodeid: number
  online: number
  local?: number
  ip?: string
}

export interface ProxmoxSnapshot {
  name: string
  description: string
  snaptime: number
  vmstate: number
  parent?: string
}

export interface ProxmoxBackup {
  volid: string
  backupid: string
  'backup-type': string
  'backup-id': string
  'backup-time': number
  storage: string
  size: number
  ctime: number
}

export interface ProxmoxBackupJob {
  id: string
  store: string
  schedule: string
  all: number
  enabled: number
  node?: string
  vmid?: string
  compress?: string
  mode?: string
  quiet?: number
}

export interface BackupJobConfig {
  id?: string
  storage: string
  schedule: string
  mode: 'snapshot' | 'stop' | 'suspend'
  compression: 'zstd' | 'lz4' | 'gzip' | 'none'
  all: boolean
  vmid?: string
  enabled: boolean
  node?: string
}

export interface RestoreConfig {
  volid: string
  node: string
  storage: string
  vmid?: number
}

export interface ProxmoxDisk {
  device: string
  size: number
  storage: string
  format: string
  usage?: string
}

export interface AddDiskConfig {
  storage: string
  size: number
  busType: 'scsi' | 'virtio' | 'ide' | 'sata'
}

export interface ResizeDiskConfig {
  disk: string
  size: number
}

export interface MoveDiskConfig {
  disk: string
  storage: string
}

export interface ProxmoxNetwork {
  name: string
  model: string
  macaddr: string
  bridge?: string
  tag?: number
  firewall?: number
  link_down?: number
}

export interface AddNICConfig {
  bridge: string
  model: string
  macaddr?: string
  tag?: number
  firewall?: boolean
}

export interface EditNICConfig {
  bridge?: string
  model?: string
  tag?: number
  firewall?: boolean
}

export interface UpdateVMConfig {
  name?: string
  cores?: number
  /** Memory size in MiB. */
  memory?: number
  description?: string
}

export interface CreateSnapshotConfig {
  name: string
  description?: string
  vmstate?: boolean
}

// Console proxy types
export interface VNCProxyResponse {
  ticket: string
  port: number
  cert: string
}

export interface TermProxyResponse {
  ticket: string
  port: number
}

export interface ConsoleProxyInfo {
  sessionId: string
  url: string
}

export interface WebSocketInfo {
  url: string
}
