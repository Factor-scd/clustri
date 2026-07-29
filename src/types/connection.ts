// Connection configuration types

export interface ConnectionConfig {
  id: string
  name: string
  // Primary endpoint
  primary: EndpointConfig
  // Fallback endpoints for cluster failover
  fallbacks: EndpointConfig[]
  // Certificate trust
  certFingerprint?: string
  trusted: boolean
  // Connection state
  status: ConnectionStatus
  // Cluster info (populated after connection)
  clusterName?: string
  isCluster: boolean
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
