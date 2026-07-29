import { useState } from 'react'
import { useConnectionStore } from '@/stores/connectionStore'
import { useToast } from '@/components/ui/toast'
import { Button } from '@/components/ui/button'
import { ConnectionDialog } from '@/components/connections/ConnectionDialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ConnectionManager() {
  const connections = useConnectionStore((s) => s.connections)
  const removeConnection = useConnectionStore((s) => s.removeConnection)
  const { addToast } = useToast()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
      case 'failover':
        return 'bg-yellow-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  const handleDelete = (id: string, name: string) => {
    removeConnection(id)
    setDeleteConfirmId(null)
    addToast(`Connection "${name}" removed`, 'success')
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {connections.length} connection{connections.length !== 1 ? 's' : ''}
        </p>
        <Button size="sm" onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
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
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-2.5 h-2.5 rounded-full',
                    getStatusColor(connection.status)
                  )}
                />
                <div>
                  <p className="text-sm font-medium">{connection.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {connection.primary.url}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {deleteConfirmId === connection.id ? (
                  <>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() =>
                        handleDelete(connection.id, connection.name)
                      }
                    >
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      Cancel
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
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
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
