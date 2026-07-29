import { create } from 'zustand'
import type { ConnectionConfig, ConnectionStatus } from '@/types/connection'

interface ConnectionState {
  connections: ConnectionConfig[]
  activeConnectionId: string | null
  isLoading: boolean
  error: string | null
  
  // Actions
  addConnection: (config: ConnectionConfig) => void
  removeConnection: (id: string) => void
  updateConnection: (id: string, updates: Partial<ConnectionConfig>) => void
  setActiveConnection: (id: string | null) => void
  setConnectionStatus: (id: string, status: ConnectionStatus) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  connections: [],
  activeConnectionId: null,
  isLoading: false,
  error: null,
  
  addConnection: (config) =>
    set((state) => ({
      connections: [...state.connections, config],
    })),
  
  removeConnection: (id) =>
    set((state) => ({
      connections: state.connections.filter((c) => c.id !== id),
      activeConnectionId: state.activeConnectionId === id ? null : state.activeConnectionId,
    })),
  
  updateConnection: (id, updates) =>
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),
  
  setActiveConnection: (id) =>
    set({ activeConnectionId: id }),
  
  setConnectionStatus: (id, status) =>
    set((state) => ({
      connections: state.connections.map((c) =>
        c.id === id ? { ...c, status } : c
      ),
    })),
  
  setLoading: (loading) => set({ isLoading: loading }),
  
  setError: (error) => set({ error }),
}))
