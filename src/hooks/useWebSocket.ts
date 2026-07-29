import { useEffect, useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/hooks/useProxmox'
import * as api from '@/lib/tauri'

interface UseWebSocketReturn {
  isConnected: boolean
  connect: (url: string) => Promise<void>
  disconnect: () => Promise<void>
}

export const useWebSocket = (connectionId: string | null): UseWebSocketReturn => {
  const queryClient = useQueryClient()
  const [isConnected, setIsConnected] = useState(false)

  const connect = useCallback(
    async (url: string) => {
      if (!connectionId) return
      try {
        await api.connectWebSocket(connectionId, url)
        setIsConnected(true)
      } catch (err) {
        console.error('[useWebSocket] connect failed:', err)
        setIsConnected(false)
      }
    },
    [connectionId],
  )

  const disconnect = useCallback(async () => {
    if (!connectionId) return
    try {
      await api.disconnectWebSocket(connectionId)
    } finally {
      setIsConnected(false)
    }
  }, [connectionId])

  // Listen for Tauri WebSocket events and invalidate relevant queries
  useEffect(() => {
    if (!connectionId) return

    let unlistenFns: Array<() => void> = []

    const setupListeners = async () => {
      const { listen } = await import('@tauri-apps/api/event')

      const unlistenTask = await listen('task-update', (event: { payload: { connection_id: string } }) => {
        if (event.payload.connection_id === connectionId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.tasks(connectionId) })
          queryClient.invalidateQueries({ queryKey: queryKeys.vms(connectionId) })
        }
      })
      unlistenFns.push(unlistenTask)

      const unlistenNode = await listen('node-status-change', (event: { payload: { connection_id: string } }) => {
        if (event.payload.connection_id === connectionId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.nodes(connectionId) })
          queryClient.invalidateQueries({ queryKey: queryKeys.cluster(connectionId) })
        }
      })
      unlistenFns.push(unlistenNode)

      const unlistenVM = await listen('vm-status-change', (event: { payload: { connection_id: string } }) => {
        if (event.payload.connection_id === connectionId) {
          queryClient.invalidateQueries({ queryKey: queryKeys.vms(connectionId) })
        }
      })
      unlistenFns.push(unlistenVM)
    }

    setupListeners()

    return () => {
      unlistenFns.forEach((fn) => fn())
      unlistenFns = []
    }
  }, [connectionId, queryClient])

  // Check WebSocket connection status periodically
  useEffect(() => {
    if (!connectionId) {
      setIsConnected(false)
      return
    }

    let interval: ReturnType<typeof setInterval> | null = null

    const checkStatus = async () => {
      try {
        const connected = await api.isWebSocketConnected(connectionId)
        setIsConnected(connected)
      } catch {
        setIsConnected(false)
      }
    }

    checkStatus()
    interval = setInterval(checkStatus, 5000)

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [connectionId])

  // Auto-disconnect on unmount
  useEffect(() => {
    return () => {
      if (connectionId) {
        api.disconnectWebSocket(connectionId).catch(() => {})
      }
    }
  }, [connectionId])

  return { isConnected, connect, disconnect }
}
