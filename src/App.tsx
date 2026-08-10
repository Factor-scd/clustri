import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/Sidebar'
import { Dashboard } from '@/components/layout/Dashboard'
import { ConnectionDialog } from '@/components/connections/ConnectionDialog'
import { VMList } from '@/components/vms/VMList'
import { VMDetail } from '@/components/vms/VMDetail'
import { ContainerList } from '@/components/vms/ContainerList'
import { NodesPage } from '@/components/nodes/NodesPage'
import { TaskList } from '@/components/tasks/TaskList'
import { TaskStatusBar } from '@/components/tasks/TaskStatusBar'
import { BackupList } from '@/components/backups/BackupList'
import { CommandPalette } from '@/components/command/CommandPalette'
import { StorageOverview } from '@/components/storage/StorageOverview'
import { StorageDetail } from '@/components/storage/StorageDetail'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider, useToast } from '@/components/ui/toast'
import { Server, AlertTriangle } from 'lucide-react'
import { useConnectionStore } from '@/stores/connectionStore'
import { useUIStore } from '@/stores/uiStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { isTauri, loadConnections, connectToServer, getConnectionStatus, getWebSocketURL, updateTrayMenu } from '@/lib/tauri'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ProxmoxVM } from '@/types/proxmox'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

type View =
  | { type: 'dashboard' }
  | { type: 'vms' }
  | { type: 'vm-detail'; vm: ProxmoxVM }
  | { type: 'nodes' }
  | { type: 'node-detail'; nodeName: string }
  | { type: 'containers' }
  | { type: 'tasks' }
  | { type: 'backups' }
  | { type: 'storage' }
  | { type: 'storage-detail'; storage: string; node: string }
  | { type: 'settings' }

function AppContent() {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const connections = useConnectionStore((s) => s.connections)
  const hydrate = useConnectionStore((s) => s.hydrate)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus)
  const updateConnection = useConnectionStore((s) => s.updateConnection)
  const removeConnection = useConnectionStore((s) => s.removeConnection)
  const setAuthStatus = useConnectionStore((s) => s.setAuthStatus)
  const { addToast } = useToast()
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [view, setView] = useState<View>({ type: 'dashboard' })
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)
  // In browser mock mode there is nothing to load, so the app is ready
  // immediately. In Tauri mode the persisted connections load on mount.
  const [connectionsLoaded, setConnectionsLoaded] = useState(!isTauri())
  const bootRan = useRef(false)

  // Startup: load persisted connections and auto-reconnect the active one
  useEffect(() => {
    if (bootRan.current) return
    bootRan.current = true

    if (!isTauri()) return

    let cancelled = false
    const boot = async () => {
      try {
        const { connections: loaded, activeConnectionId } = await loadConnections()
        if (cancelled) return
        hydrate(loaded, activeConnectionId)

        if (activeConnectionId && loaded.some((c) => c.id === activeConnectionId)) {
          setActiveConnection(activeConnectionId)
          setConnectionStatus(activeConnectionId, 'connecting')
          try {
            const result = await connectToServer(activeConnectionId)
            if (cancelled) return
            if (result.mergedInto && result.mergedInto !== activeConnectionId) {
              // This connection belongs to a cluster we already have; the
              // backend folded it into the surviving connection.
              removeConnection(activeConnectionId)
              setActiveConnection(result.mergedInto)
              setConnectionStatus(result.mergedInto, result.status)
              setAuthStatus('authenticated')
              addToast('Already connected to this cluster — added as a failover endpoint.', 'success')
            } else {
              setConnectionStatus(result.connectionId, result.status)
            }
          } catch (err) {
            if (!cancelled) {
              setConnectionStatus(activeConnectionId, 'failed')
              console.error('[App] Auto-reconnect failed:', err)
            }
          }
        }
      } catch (err) {
        console.error('[App] Failed to load connections:', err)
      } finally {
        if (!cancelled) setConnectionsLoaded(true)
      }
    }

    boot()
    return () => {
      cancelled = true
    }
  }, [hydrate, setActiveConnection, setConnectionStatus, setAuthStatus, removeConnection, addToast])

  // Keep the system tray menu in sync with the connection list (no-op in browser mode)
  useEffect(() => {
    updateTrayMenu(
      connections.map((c) => ({ id: c.id, name: c.name, status: c.status })),
    )
  }, [connections])

  // Tray connection clicks switch the active connection (mirrored to the
  // backend by the store so it persists across launches).
  useEffect(() => {
    if (!isTauri()) return
    let unlisten: (() => void) | undefined
    import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        unlisten = await listen<string>('tray-connection-click', (event) => {
          setActiveConnection(event.payload)
        })
      })
      .catch(() => {})
    return () => {
      unlisten?.()
    }
  }, [setActiveConnection])

  // Poll the backend connection status while a connection is active so the
  // sidebar node list and failover state stay in sync with the cluster.
  useEffect(() => {
    if (!isTauri() || !activeConnectionId) return
    let cancelled = false

    const poll = async () => {
      try {
        const info = await getConnectionStatus(activeConnectionId)
        if (cancelled) return
        setConnectionStatus(activeConnectionId, info.status)
        updateConnection(activeConnectionId, {
          nodes: info.nodes,
          currentEndpointUrl: info.currentEndpointUrl,
        })
      } catch {
        // Transient failures are ignored; the next tick keeps polling.
      }
    }

    poll()
    const interval = setInterval(poll, 10_000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [activeConnectionId, setConnectionStatus, updateConnection])

  // Auto-open login dialog only when there are genuinely zero connections
  useEffect(() => {
    if (connectionsLoaded && connections.length === 0 && !connectionDialogOpen) {
      setConnectionDialogOpen(true)
    }
  }, [connectionsLoaded, connections.length, connectionDialogOpen])

  // WebSocket integration – connects when a connection is active
  const { connect: connectRelay, disconnect: disconnectRelay } = useWebSocket(activeConnectionId)

  // Start the backend event relay once a connection is connected, so task and
  // node events invalidate queries in near real-time. Polling remains the
  // fallback when the relay is not connected.
  const activeStatus = useMemo(
    () => connections.find((c) => c.id === activeConnectionId)?.status,
    [connections, activeConnectionId],
  )
  useEffect(() => {
    if (!isTauri() || !activeConnectionId) return
    if (activeStatus !== 'connected' && activeStatus !== 'failover') {
      disconnectRelay().catch(() => {})
      return
    }
    let cancelled = false
    const startRelay = async () => {
      try {
        const origin = await getWebSocketURL(activeConnectionId, '')
        if (cancelled) return
        await connectRelay(`${origin}/api2/json/events`)
      } catch (err) {
        console.error('[App] Failed to start event relay:', err)
      }
    }
    startRelay()
    return () => {
      cancelled = true
    }
  }, [activeConnectionId, activeStatus, connectRelay, disconnectRelay])

  // Global keyboard shortcut: Cmd/Ctrl+K to open command palette
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setCommandPaletteOpen(!commandPaletteOpen)
      }
    }
    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [commandPaletteOpen, setCommandPaletteOpen])

  const handleNavigate = (newView: View) => {
    setView(newView)
  }

  const renderMainContent = () => {
    if (view.type === 'settings') {
      return <SettingsPage />
    }

    if (!activeConnectionId) {
      return (
        <div className="flex h-full items-center justify-center p-6">
          <div className="flex flex-col items-center text-center">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-card shadow-card">
              <Server className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-lg font-semibold tracking-tight">
              No connection selected
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Connect to a Proxmox server to get started
            </p>
          </div>
        </div>
      )
    }

    switch (view.type) {
      case 'dashboard':
        return <Dashboard connectionId={activeConnectionId} onNavigate={(viewName) => {
          switch (viewName) {
            case 'dashboard': handleNavigate({ type: 'dashboard' }); break
            case 'vms': handleNavigate({ type: 'vms' }); break
            case 'nodes': handleNavigate({ type: 'nodes' }); break
            case 'tasks': handleNavigate({ type: 'tasks' }); break
            case 'backups': handleNavigate({ type: 'backups' }); break
            case 'storage': handleNavigate({ type: 'storage' }); break
            default: break
          }
        }} />
      case 'vms':
        return (
          <VMList
            connectionId={activeConnectionId}
            onVMClick={(vm) => handleNavigate({ type: 'vm-detail', vm })}
          />
        )
      case 'vm-detail':
        return (
          <VMDetail
            vm={view.vm}
            connectionId={activeConnectionId}
            onBack={() => handleNavigate({ type: 'vms' })}
          />
        )
      case 'nodes':
        return (
          <NodesPage
            connectionId={activeConnectionId}
            onVMClick={(vm) => handleNavigate({ type: 'vm-detail', vm })}
          />
        )
      case 'node-detail':
        return (
          <NodesPage
            connectionId={activeConnectionId}
            initialNodeName={view.nodeName}
            onVMClick={(vm) => handleNavigate({ type: 'vm-detail', vm })}
          />
        )
      case 'containers':
        return (
          <ContainerList
            connectionId={activeConnectionId}
            onContainerClick={(vm) => handleNavigate({ type: 'vm-detail', vm })}
          />
        )
      case 'tasks':
        return <TaskList connectionId={activeConnectionId} />
      case 'backups':
        return <BackupList connectionId={activeConnectionId} />
      case 'storage':
        return (
          <StorageOverview
            connectionId={activeConnectionId}
            onStorageClick={(storage, node) =>
              handleNavigate({ type: 'storage-detail', storage, node })
            }
          />
        )
      case 'storage-detail':
        return (
          <StorageDetail
            connectionId={activeConnectionId}
            storage={view.storage}
            node={view.node}
            onBack={() => handleNavigate({ type: 'storage' })}
          />
        )
      default:
        return (
          <div className="flex h-full items-center justify-center">
            <p className="text-muted-foreground">Unknown view: {(view as { type: string }).type}</p>
          </div>
        )
    }
  }

  const activeConnection = connections.find((c) => c.id === activeConnectionId)

  return (
    <div className="flex h-screen flex-col bg-background">
      {activeConnection?.status === 'failover' && activeConnection.currentEndpointUrl && (
        <div className="flex items-center gap-2 border-b border-warning/25 bg-warning/10 px-4 py-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
          <p className="text-xs font-medium text-warning">Operating on a fallback node</p>
          <p className="truncate font-mono text-[11px] tabular-nums text-warning/80">
            {activeConnection.currentEndpointUrl}
          </p>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <Sidebar
          onAddConnection={() => setConnectionDialogOpen(true)}
          activeView={view.type}
          onNavigate={(v) => handleNavigate(v as View)}
        />
        <main className="flex min-h-0 flex-1 flex-col">
          {activeConnectionId && (
            <div className="shrink-0 border-b px-3 py-1.5">
              <TaskStatusBar
                connectionId={activeConnectionId}
                onClick={() => handleNavigate({ type: 'tasks' })}
              />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden">
            {renderMainContent()}
          </div>
        </main>
      </div>
      <ConnectionDialog
        open={connectionDialogOpen}
        onOpenChange={setConnectionDialogOpen}
      />
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        onNavigate={handleNavigate}
        onAddConnection={() => setConnectionDialogOpen(true)}
      />
    </div>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ErrorBoundary>
          <AppContent />
        </ErrorBoundary>
      </ToastProvider>
    </QueryClientProvider>
  )
}

export default App
