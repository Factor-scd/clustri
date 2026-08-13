// Proxmox Backup Server (PBS) API types
//
// PBS exposes kebab-case JSON fields; the Rust backend maps them to camelCase
// structs (serde `rename_all = "camelCase"`), so these types mirror the
// backend's shapes. All fields are optional unless marked required.

export interface PbsDatastore {
  store: string // required
  comment?: string
  backendType?: string // 'filesystem' | 's3'
  mountStatus?: string // 'mounted' | 'notmounted' | 'nonremovable'
  maintenance?: string
  total?: number
  used?: number
  avail?: number
  error?: string
  estimatedFullDate?: number
  history?: number[]
  gcStatus?: {
    diskBytes?: number
    diskChunks?: number
    indexDataBytes?: number
    indexFileCount?: number
    pendingBytes?: number
    pendingChunks?: number
    removedBad?: number
    removedBytes?: number
    removedChunks?: number
    stillBad?: number
    cacheHits?: number
    cacheMisses?: number
    upid?: string
  }
}

export interface PbsVersion {
  version: string
  release: string
  repoid: string
}

export interface PbsNodeStatus {
  cpu?: number
  loadavg?: number[]
  uptime?: number
  memory?: { free?: number; total?: number; used?: number }
  root?: { avail?: number; total?: number; used?: number }
  swap?: { free?: number; total?: number; used?: number }
  cpuinfo?: { cpus?: number; model?: string; sockets?: number }
  currentKernel?: { machine?: string; release?: string; sysname?: string; version?: string }
}

export interface PbsBackupGroup {
  backupId: string // required, e.g. "100"
  backupType: 'vm' | 'ct' | 'host'
  backupCount?: number
  lastBackup?: number // unix epoch
  comment?: string
  files?: string[]
}

export interface PbsSnapshot {
  backupId: string // required
  backupType: 'vm' | 'ct' | 'host'
  backupTime: number // required, unix epoch
  size?: number
  protected?: boolean
  comment?: string
  files?: string[]
  fingerprint?: string
  owner?: string
  verification?: { state?: 'ok' | 'failed'; upid?: string }
}

export interface PbsSnapshotFile {
  filename: string
  size?: number
  cryptMode?: string
}

export interface PbsJob {
  id: string // required
  store?: string
  schedule?: string
  comment?: string
  disable?: boolean
  lastRunState?: string
  lastRunEndtime?: number
  nextRun?: number
  keepLast?: number
  keepDaily?: number
  keepWeekly?: number
  keepMonthly?: number
  keepYearly?: number
  ignoreVerified?: boolean
  maxDepth?: number
}
