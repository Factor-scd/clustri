import { useEffect, useRef, useCallback } from 'react'
import { isTauri, startConsoleProxy, stopConsoleProxy } from '@/lib/tauri'

interface VNCConsoleProps {
  connectionId: string
  node: string
  vmid: number
  onError?: (message: string) => void
  onConnected?: () => void
}

type ConnectionState = 'connecting' | 'connected' | 'disconnected' | 'error'

export function VNCConsole({ connectionId, node, vmid, onError, onConnected }: VNCConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const rfbRef = useRef<unknown>(null)
  const stateRef = useRef<ConnectionState>('connecting')
  const sessionRef = useRef<string | null>(null)

  const cleanup = useCallback(() => {
    if (sessionRef.current) {
      const sid = sessionRef.current
      sessionRef.current = null
      stopConsoleProxy(sid).catch(() => {})
    }
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

        // In Tauri mode the console stream goes through a Rust-side loopback
        // proxy so self-signed Proxmox certificates are accepted; the returned
        // local ws:// URL is handed to noVNC.
        let wsUrl: string
        if (isTauri()) {
          const info = await startConsoleProxy(connectionId, 'vnc', node, vmid)
          if (cancelled) return
          sessionRef.current = info.sessionId
          wsUrl = info.url
        } else {
          // Dev mode: construct a mock URL
          wsUrl = `wss://localhost:8006/api2/json/nodes/${node}/qemu/${vmid}/vncwebsocket?port=6000&vncticket=mock-ticket`
        }

        if (cancelled) return

        // Dynamically import noVNC RFB class
        const { default: RFB } = await import('@novnc/novnc')

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
            onConnected?.()
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

        // Listen for Ctrl+Alt+Del command from parent
        const onCtrlAltDel = () => {
          const current = rfbRef.current as { sendCtrlAltDel?: () => void } | null
          if (current?.sendCtrlAltDel) {
            current.sendCtrlAltDel()
          }
        }
        containerRef.current.addEventListener('vnc-ctrl-alt-del', onCtrlAltDel)
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
      if (containerRef.current) {
        containerRef.current.removeAttribute('data-vnc')
      }
      cleanup()
    }
  }, [connectionId, node, vmid, onError, onConnected, cleanup])

  return (
    <div
      ref={containerRef}
      data-vnc
      className="h-full w-full bg-[#404040] overflow-hidden"
    />
  )
}

export type { VNCConsoleProps }
