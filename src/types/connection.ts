// Connection configuration types

export type AuthMode = 'password' | 'token'

/** The kind of server a connection targets. Absent on persisted old
 * connections, where it is treated as 'pve'. */
export type ServerType = 'pve' | 'pbs'

export interface ConnectionConfig {
  id: string
  name: string
  primary: EndpointConfig
  fallbacks: EndpointConfig[]
  certFingerprint?: string
  trusted: boolean
  acceptUntrusted?: boolean
  status: ConnectionStatus
  clusterName?: string
  clusterId?: string
  isCluster: boolean
  authMode: AuthMode
  username?: string
  /** The kind of server this connection targets ('pve' when absent). */
  serverType?: ServerType
  /** Nodes discovered in the cluster this connection is anchored on. */
  nodes?: DiscoveredNode[]
  /** The endpoint currently serving this connection (after failover). */
  currentEndpointUrl?: string
}

/** A node discovered in the cluster connected through a connection. */
export interface DiscoveredNode {
  name: string
  url: string
  status: 'online' | 'offline'
  isPrimary: boolean
  local: boolean
}

/** The outcome of a connect attempt, returned by `connect_to_server`. */
export interface ConnectResult {
  connectionId: string
  mergedInto: string | null
  status: 'connected' | 'failover' | 'failed'
}

/** A snapshot of a connection's runtime state, returned by `get_connection_status`. */
export interface ConnectionStatusInfo {
  connectionId: string
  status: 'connected' | 'failover' | 'failed' | 'disconnected'
  primaryUrl: string
  currentEndpointUrl: string
  nodes: DiscoveredNode[]
}

export interface LoadConnectionsResult {
  activeConnectionId: string | null
  connections: ConnectionConfig[]
}

export interface EndpointConfig {
  url: string // e.g., "https://192.168.1.10:8006"
  node?: string // Node name (for display)
  token?: string // API token (stored in keyring, not in config)
}

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'failed'
  | 'failover'

export interface CertificateInfo {
  fingerprint: string
  issuer: string
  subject: string
  validFrom: string
  validTo: string
  selfSigned: boolean
}

export interface ConnectionCredentials {
  connectionId: string
  apiToken: string
}

export interface LoginResult {
  connectionId: string
  ticket: string
  csrfToken: string
}
