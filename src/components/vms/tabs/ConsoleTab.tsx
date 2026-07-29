import { useState, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import {
  Maximize2,
  Minimize2,
  Monitor,
  TerminalSquare,
  RotateCw,
  Loader2,
  AlertCircle,
} from 'lucide-react'
import { VNCConsole } from '@/components/console/VNCConsole'
import { TerminalConsole } from '@/components/console/TerminalConsole'
import type { ProxmoxVM } from '@/types/proxmox'

interface ConsoleTabProps {
  vm: ProxmoxVM
  connectionId: string
}

type ConsoleStatus = 'idle' | 'connecting' | 'connected' | 'error'

export function ConsoleTab({ vm, connectionId }: ConsoleTabProps) {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [status, setStatus] = useState<ConsoleStatus>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const isVM = vm.type === 'qemu'
  const canConnect = vm.status === 'running'

  const handleConnect = useCallback(() => {
    setStatus('connecting')
    setErrorMessage(null)
  }, [])

  const handleError = useCallback((message: string) => {
    setStatus('error')
    setErrorMessage(message)
  }, [])

  const handleConnected = useCallback(() => {
    setStatus('connected')
  }, [])

  const handleDisconnect = useCallback(() => {
    setStatus('idle')
    setErrorMessage(null)
  }, [])

  const handleRetry = useCallback(() => {
    setStatus('idle')
    setErrorMessage(null)
    // Short delay then reconnect
    setTimeout(() => {
      setStatus('connecting')
    }, 100)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return

    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (err) {
      console.error('Fullscreen toggle failed:', err)
    }
  }, [])

  const sendCtrlAltDel = useCallback(() => {
    // Access the VNC RFB instance through the container
    const container = containerRef.current?.querySelector('[data-vnc]')
    if (container) {
      // Dispatch a custom event that VNCConsole can listen for
      container.dispatchEvent(new CustomEvent('vnc-ctrl-alt-del'))
    }
  }, [])

  return (
    <div className="flex flex-col h-[600px]">
      {/* Toolbar */}
      <div className="flex items-center justify-between border rounded-t-lg bg-muted/30 px-3 py-2">
        <div className="flex items-center gap-2">
          {isVM ? (
            <Monitor className="h-4 w-4 text-muted-foreground" />
          ) : (
            <TerminalSquare className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium">
            {isVM ? 'VNC Console' : 'Terminal Console'}
          </span>
          <span className="text-xs text-muted-foreground">
            ({vm.name} - {vm.type.toUpperCase()})
          </span>
        </div>

        <div className="flex items-center gap-1">
          {status === 'connecting' && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-2">
              <Loader2 className="h-3 w-3 animate-spin" />
              Connecting...
            </div>
          )}

          {status === 'connected' && isVM && (
            <Button
              variant="outline"
              size="sm"
              onClick={sendCtrlAltDel}
              className="h-7 text-xs"
            >
              Ctrl+Alt+Del
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={toggleFullscreen}
            className="h-7 w-7 p-0"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>

          {status === 'connected' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              className="h-7 text-xs"
            >
              Disconnect
            </Button>
          ) : status === 'error' ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleRetry}
              className="h-7 text-xs"
            >
              <RotateCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={!canConnect}
              className="h-7 text-xs"
            >
              Connect
            </Button>
          )}
        </div>
      </div>

      {/* Console Area */}
      <div
        ref={containerRef}
        className="flex-1 border border-t-0 rounded-b-lg overflow-hidden bg-black relative"
      >
        {/* Idle state - show placeholder */}
        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-4 z-10">
            {isVM ? (
              <Monitor className="h-12 w-12 opacity-50" />
            ) : (
              <TerminalSquare className="h-12 w-12 opacity-50" />
            )}
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">
                {isVM ? 'VNC Console' : 'Terminal Console'}
              </p>
              {!canConnect ? (
                <p className="text-xs text-amber-500">
                  VM must be running to access console
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Click Connect to start a console session
                </p>
              )}
            </div>
          </div>
        )}

        {/* Error state - show error overlay */}
        {status === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-4 z-10 bg-black/80">
            <AlertCircle className="h-12 w-12 text-destructive opacity-50" />
            <div className="text-center space-y-2">
              <p className="text-sm font-medium text-destructive">
                Connection Failed
              </p>
              {errorMessage && (
                <p className="text-xs text-muted-foreground max-w-md">
                  {errorMessage}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="mt-2"
              >
                <RotateCw className="h-3 w-3 mr-1" />
                Retry Connection
              </Button>
            </div>
          </div>
        )}

        {/* Connecting state - show loading overlay */}
        {(status === 'connecting' || status === 'connected') && (
          <>
            {isVM ? (
              <VNCConsole
                connectionId={connectionId}
                node={vm.node}
                vmid={vm.vmid}
                onError={handleError}
                onConnected={handleConnected}
              />
            ) : (
              <TerminalConsole
                connectionId={connectionId}
                node={vm.node}
                vmid={vm.vmid}
                onError={handleError}
                onConnected={handleConnected}
              />
            )}
          </>
        )}

        {status === 'connecting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground gap-4 z-10 bg-black/60">
            <Loader2 className="h-12 w-12 animate-spin opacity-50" />
            <div className="text-center space-y-1">
              <p className="text-sm font-medium">Connecting...</p>
              <p className="text-xs text-muted-foreground">
                Establishing console connection to {vm.node}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export type { ConsoleTabProps }
