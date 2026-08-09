import { create } from 'zustand'
import type { ConnectionConfig, ConnectionStatus, DiscoveredNode } from '@/types/connection'

export type AuthStatus = 'authenticated' | 'expired' | 'unauthenticated'

interface ConnectionState {
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  isLoading: boolean
  error: string | null
  authStatus: AuthStatus

  // Actions
  addConnection: (config: ConnectionConfig) => void
  removeConnection: (id: string) => void
  updateConnection: (id: string, updates: Partial<ConnectionConfig>) => void
  hydrate: (connections: ConnectionConfig[], activeConnectionId: string | null) => void
  setActiveConnection: (id: string | null) => void
  setConnectionStatus: (id: string, status: ConnectionStatus) => void
  setConnectionNodes: (id: string, nodes: DiscoveredNode[]) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  setAuthStatus: (status: AuthStatus) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  activeConnectionId: null,
  isLoading: false,
  error: null,
  authStatus: 'unauthenticated',

  addConnection: (config) =>
    set((state) => ({
      connections: [...state.connections, config],
    })),

  removeConnection: (id) =>
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
      authStatus: state.activeConnectionId === id ? 'unauthenticated' : state.authStatus,
    })),

  updateConnection: (id, updates) =>
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  hydrate: (connections, activeConnectionId) =>
    set({ connections, activeConnectionId }),

  setActiveConnection: (id) =>
    set({ activeConnectionId: id }),

  setConnectionStatus: (id, status) =>
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, status } : c
      ),
    })),

  setConnectionNodes: (id, nodes) =>
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, nodes } : c
      ),
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  setError: (error) => set({ error }),

  setAuthStatus: (status) => set({ authStatus: status }),
}))
