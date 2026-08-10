import { useState } from 'react'
import { useConnectionStore } from '@/stores/connectionStore'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ConnectionDialog } from '@/components/connections/ConnectionDialog'
import { removeConnection as removeConnectionIPC, disconnectFromServer, logout } from '@/lib/tauri'
import { Plus, Pencil, Trash2, Unplug, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ConnectionConfig } from '@/types/connection'

export function ConnectionManager() {
  const connections = useConnectionStore((s) => s.connections)
  const removeConnection = useConnectionStore((s) => s.removeConnection)
  const setConnectionStatus = useConnectionStore((s) => s.setConnectionStatus)
  const setAuthStatus = useConnectionStore((s) => s.setAuthStatus)
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ConnectionConfig | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-success shadow-[0_0_6px] shadow-success/60'
      case 'connecting':
      case 'failover':
        return 'bg-warning'
      case 'failed':
        return 'bg-destructive'
      default:
        return 'bg-muted-foreground/60'
    }
  }

  const handleDelete = async (id: string, name: string) => {
    try {
      // Remove from the backend first so the deletion persists and the keyring
      // credentials are cleaned up, then mirror it in the store.
      await removeConnectionIPC(id)
      removeConnection(id)
      addToast(`Connection "${name}" removed`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to remove connection', 'error')
    }
  }

  const handleDisconnect = async (connection: ConnectionConfig) => {
    try {
      await disconnectFromServer(connection.id)
      setConnectionStatus(connection.id, 'disconnected')
      addToast(`Connection "${connection.name}" disconnected`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to disconnect', 'error')
    }
  }

  const handleLogout = async (connection: ConnectionConfig) => {
    try {
      await logout(connection.id)
      setAuthStatus('unauthenticated')
      setConnectionStatus(connection.id, 'disconnected')
      addToast(`Logged out of "${connection.name}"`, 'success')
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to log out', 'error')
    }
  }

  const isActive = (connection: ConnectionConfig) =>
    connection.status === 'connected' || connection.status === 'failover'

  const deleteTarget = connections.find((c) => c.id === deleteConfirmId) ?? null

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm tabular-nums text-muted-foreground">
          {connections.length} connection{connections.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus />
          Add
        </Button>
      </div>

      {connections.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No connections configured. Add a server to get started.
        </p>
      ) : (
        <div className="space-y-2">
          {connections.map((connection) => (
            <div
              key={connection.id}
              className="flex items-center justify-between rounded-md border border-border/70 bg-card px-3 py-2.5 transition-colors duration-150 hover:bg-accent/40"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'h-2 w-2 rounded-full',
                    getStatusColor(connection.status)
                  )}
                />
                <div>
                  <p className="text-sm font-medium">{connection.name}</p>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    {connection.primary.url}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {isActive(connection) && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Log out"
                      onClick={() => handleLogout(connection)}
                    >
                      <LogOut className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title="Disconnect"
                      onClick={() => handleDisconnect(connection)}
                    >
                      <Unplug className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setEditing(connection)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={() => setDeleteConfirmId(connection.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConnectionDialog
        open={!!editing || dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open)
          if (!open) setEditing(null)
        }}
        editing={editing ?? undefined}
      />

      <ConfirmDialog
        open={deleteConfirmId !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null)
        }}
        title="Remove Connection"
        description={`Are you sure you want to remove "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (deleteTarget) handleDelete(deleteTarget.id, deleteTarget.name)
        }}
      />
    </div>
  )
}
