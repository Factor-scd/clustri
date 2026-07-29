// Connection configuration types

export type AuthMode = 'password' | 'token'

export interface ConnectionConfig {
  id: string
  name: string
  primary: EndpointConfig
  fallbacks: EndpointConfig[]
  certFingerprint?: string
  trusted: boolean
  status: ConnectionStatus
  clusterName?: string
  isCluster: boolean
  authMode: AuthMode
  username?: string
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
