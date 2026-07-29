import { useEffect, useRef, useCallback } from 'react'

interface VNCConsoleProps {
  connectionId: string
  node: string
  vmid: number
  onError?: (message: string) => void
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export function VNCConsole({ connectionId, node, vmid, onError }: VNCConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<unknown>(null)
  const stateRef = useRef<ConnectionState>('connecting')

  const cleanup = useCallback(() => {
    if (rfbRef.current) {
      const rfb = rfbRef.current as { disconnect: () => void }
      rfb.disconnect()
      rfbRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    const connect = async () => {
      try {
        stateRef.current = 'connecting'

        // Get WebSocket URL for VNC
        let wsUrl: string

        try {
          // Try real IPC first
          const { isTauri, createVNCProxy, getWebSocketURL } = await import('@/lib/tauri')

          if (isTauri()) {
            const [proxyInfo, baseUrl] = await Promise.all([
              createVNCProxy(connectionId, node, vmid),
              getWebSocketURL(connectionId, node),
            ])

            wsUrl = `${baseUrl}/api2/json/nodes/${node}/qemu/${vmid}/vncwebsocket?port=${proxyInfo.port}&vncticket=${encodeURIComponent(proxyInfo.ticket)}`
          } else {
            // Dev mode: construct a mock URL
            wsUrl = `wss://localhost:8006/api2/json/nodes/${node}/qemu/${vmid}/vncwebsocket?port=6000&vncticket=mock-ticket`
          }
        } catch {
          // Fallback for dev mode
          wsUrl = `wss://localhost:8006/api2/json/nodes/${node}/qemu/${vmid}/vncwebsocket?port=6000&vncticket=mock-ticket`
        }

        if (cancelled) return

        // Dynamically import noVNC RFB class
        const { default: RFB } = await import('@novnc/novnc/core/rfb.js')

        if (cancelled || !containerRef.current) return

        // Create RFB connection
        const rfb = new RFB(containerRef.current, wsUrl, {
          shared: true,
          wsProtocols: ['binary'],
        })

        rfbRef.current = rfb

        rfb.addEventListener('connect', () => {
          if (!cancelled) {
            stateRef.current = 'connected'
          }
        })

        rfb.addEventListener('disconnect', (ev: unknown) => {
          if (!cancelled) {
            const detail = (ev as CustomEvent<{ reason?: string }>).detail
            stateRef.current = 'disconnected'
            if (detail?.reason) {
              onError?.(`VNC disconnected: ${detail.reason}`)
            }
          }
        })

        rfb.addEventListener('credentialsrequired', () => {
          if (!cancelled) {
            onError?.('VNC credentials required')
          }
        })
      } catch (err) {
        if (!cancelled) {
          stateRef.current = 'error'
          onError?.(err instanceof Error ? err.message : 'Failed to connect VNC')
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [connectionId, node, vmid, onError, cleanup])

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-[#404040] overflow-hidden"
    />
  )
}

export type { VNCConsoleProps }
