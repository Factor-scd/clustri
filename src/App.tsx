import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Sidebar } from '@/components/layout/Sidebar'
import { Dashboard } from '@/components/layout/Dashboard'
import { ConnectionDialog } from '@/components/connections/ConnectionDialog'
import { VMList } from '@/components/vms/VMList'
import { VMDetail } from '@/components/vms/VMDetail'
import { TaskList } from '@/components/tasks/TaskList'
import { BackupList } from '@/components/backups/BackupList'
import { CommandPalette } from '@/components/command/CommandPalette'
import { StorageOverview } from '@/components/storage/StorageOverview'
import { StorageDetail } from '@/components/storage/StorageDetail'
import { SettingsPage } from '@/components/settings/SettingsPage'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import { ToastProvider } from '@/components/ui/toast'
import { useConnectionStore } from '@/stores/connectionStore'
import { useUIStore } from '@/stores/uiStore'
import { useWebSocket } from '@/hooks/useWebSocket'
import { useEffect, useState } from 'react'
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
  | { type: 'tasks' }
  | { type: 'backups' }
  | { type: 'storage' }
  | { type: 'storage-detail'; storage: string; node: string }
  | { type: 'settings' }

function AppContent() {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false)
  const [view, setView] = useState<View>({ type: 'dashboard' })
  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen)
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen)

  // Auto-open login dialog when no active connection
  useEffect(() => {
    if (!activeConnectionId && !connectionDialogOpen) {
      setConnectionDialogOpen(true)
    }
  }, [activeConnectionId, connectionDialogOpen])

  // WebSocket integration – connects when a connection is active
  useWebSocket(activeConnectionId)

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
        <div className="flex h-full items-center justify-center">
          <div className="text-center space-y-4">
            <h2 className="text-2xl font-semibold">ProxmoxDesktop</h2>
            <p className="text-muted-foreground">
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

  return (
    <div className="flex h-screen bg-background">
      <Sidebar
        onAddConnection={() => setConnectionDialogOpen(true)}
        activeView={view.type}
        onNavigate={handleNavigate}
      />
      <main className="flex-1 overflow-hidden">
        {renderMainContent()}
      </main>
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
