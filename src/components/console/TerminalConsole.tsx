import { useEffect, useRef, useCallback } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'

interface TerminalConsoleProps {
  connectionId: string
  node: string
  vmid: number
  onError?: (message: string) => void
  onConnected?: () => void
}

export function TerminalConsole({ connectionId, node, vmid, onError, onConnected }: TerminalConsoleProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
    if (termRef.current) {
      termRef.current.dispose()
      termRef.current = null
    }
    fitAddonRef.current = null
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    const connect = async () => {
      try {
        // Create terminal
        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: 14,
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          theme: {
            background: '#000000',
            foreground: '#ffffff',
            cursor: '#ffffff',
            selectionBackground: '#264f78',
          },
          allowProposedApi: true,
        })

        const fitAddon = new FitAddon()
        terminal.loadAddon(fitAddon)

        terminal.open(containerRef.current!)
        fitAddon.fit()

        termRef.current = terminal
        fitAddonRef.current = fitAddon

        if (cancelled) {
          terminal.dispose()
          return
        }

        // Get WebSocket URL for terminal proxy
        let wsUrl: string

        try {
          const { isTauri, createTermProxy, getWebSocketURL } = await import('@/lib/tauri')

          if (isTauri()) {
            const [proxyInfo, baseUrl] = await Promise.all([
              createTermProxy(connectionId, node, vmid),
              getWebSocketURL(connectionId, node),
            ])

            wsUrl = `${baseUrl}/api2/json/nodes/${node}/lxc/${vmid}/proxy?port=${proxyInfo.port}&ticket=${encodeURIComponent(proxyInfo.ticket)}`
          } else {
            // Dev mode: construct a mock URL
            wsUrl = `wss://localhost:8006/api2/json/nodes/${node}/lxc/${vmid}/proxy?port=6100&ticket=mock-ticket`
          }
        } catch {
          // Fallback for dev mode
          wsUrl = `wss://localhost:8006/api2/json/nodes/${node}/lxc/${vmid}/proxy?port=6100&ticket=mock-ticket`
        }

        if (cancelled) return

        // In dev mode, show a mock terminal since we can't connect to real WebSocket
        let isTauriMode = false
        try {
          const { isTauri } = await import('@/lib/tauri')
          isTauriMode = isTauri()
        } catch {
          // not in tauri
        }

        if (!isTauriMode && !cancelled) {
          // Dev mode mock terminal
          terminal.writeln('\x1b[1;32m╔══════════════════════════════════════════╗\x1b[0m')
          terminal.writeln('\x1b[1;32m║        Clustri - Terminal Console      ║\x1b[0m')
          terminal.writeln('\x1b[1;32m╚══════════════════════════════════════════╝\x1b[0m')
          terminal.writeln('')
          terminal.writeln(`\x1b[33mNode: ${node} | VMID: ${vmid} | Type: LXC\x1b[0m`)
          terminal.writeln('')
          terminal.writeln('\x1b[90m[Dev mode - WebSocket connection mocked]\x1b[0m')
          terminal.writeln('')

          // Mock shell interaction
          const prompt = () => {
            terminal.write(`\x1b[1;34mroot@${node}\x1b[0m:\x1b[1;35m~\x1b[0m# `)
          }
          prompt()

          let inputBuffer = ''
          terminal.onData((data: string) => {
            if (data === '\r') {
              terminal.writeln('')
              if (inputBuffer.trim()) {
                if (inputBuffer.trim() === 'clear') {
                  terminal.clear()
                } else if (inputBuffer.trim() === 'help') {
                  terminal.writeln('Available mock commands: clear, help, ls, whoami')
                } else if (inputBuffer.trim() === 'ls') {
                  terminal.writeln('bin  boot  dev  etc  home  lib  lib64  media  mnt  opt')
                  terminal.writeln('proc  root  run  sbin  srv  sys  tmp  usr  var')
                } else if (inputBuffer.trim() === 'whoami') {
                  terminal.writeln('root')
                } else {
                  terminal.writeln(`\x1b[31m${inputBuffer.trim()}: command not found\x1b[0m`)
                }
              }
              inputBuffer = ''
              prompt()
            } else if (data === '\x7f') {
              // Backspace
              if (inputBuffer.length > 0) {
                inputBuffer = inputBuffer.slice(0, -1)
                terminal.write('\b \b')
              }
            } else if (data >= ' ') {
              inputBuffer += data
              terminal.write(data)
            }
          })

          // Handle resize
          const resizeObserver = new ResizeObserver(() => {
            if (!cancelled && fitAddonRef.current) {
              try {
                fitAddonRef.current.fit()
              } catch {
                // ignore resize errors
              }
            }
          })
          resizeObserver.observe(containerRef.current!)

          onConnected?.()

          return () => {
            resizeObserver.disconnect()
          }
        }

        if (cancelled) return

        // Production: connect via WebSocket
        const ws = new WebSocket(wsUrl)
        ws.binaryType = 'arraybuffer'
        wsRef.current = ws

        ws.onopen = () => {
          if (!cancelled) {
            terminal.writeln(`\x1b[32mConnected to LXC container ${vmid} on ${node}\x1b[0m`)
            onConnected?.()
          }
        }

        ws.onmessage = (ev: MessageEvent) => {
          if (!cancelled && typeof ev.data === 'string') {
            terminal.write(ev.data)
          }
        }

        ws.onerror = () => {
          if (!cancelled) {
            onError?.('WebSocket connection error')
          }
        }

        ws.onclose = () => {
          if (!cancelled) {
            terminal.writeln('\r\n\x1b[33mConnection closed\x1b[0m')
          }
        }

        // Forward terminal input to WebSocket
        terminal.onData((data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data)
          }
        })

        // Handle terminal resize
        terminal.onResize(({ cols, rows }: { cols: number; rows: number }) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'resize', cols, rows }))
          }
        })

        // Handle container resize
        const resizeObserver = new ResizeObserver(() => {
          if (!cancelled && fitAddonRef.current) {
            try {
              fitAddonRef.current.fit()
            } catch {
              // ignore resize errors
            }
          }
        })
        resizeObserver.observe(containerRef.current!)

        return () => {
          resizeObserver.disconnect()
        }
      } catch (err) {
        if (!cancelled) {
          onError?.(err instanceof Error ? err.message : 'Failed to create terminal')
        }
      }
    }

    let cleanupResize: (() => void) | undefined

    const run = async () => {
      cleanupResize = await connect() ?? undefined
    }

    run()

    return () => {
      cancelled = true
      cleanupResize?.()
      cleanup()
    }
  }, [connectionId, node, vmid, onError, onConnected, cleanup])

  return (
    <div
      ref={containerRef}
      className="h-full w-full bg-black overflow-hidden"
    />
  )
}

export type { TerminalConsoleProps }
