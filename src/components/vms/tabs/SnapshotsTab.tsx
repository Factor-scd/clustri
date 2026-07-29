import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Camera, Plus, Trash, RotateCcw } from 'lucide-react'
import { useSnapshots, useDeleteSnapshot, useRollbackSnapshot } from '@/hooks/useProxmox'
import { CreateSnapshotDialog } from '@/components/vms/dialogs/CreateSnapshotDialog'
import type { ProxmoxVM, ProxmoxSnapshot } from '@/types/proxmox'

interface SnapshotsTabProps {
  vm: ProxmoxVM
  connectionId: string
}

function formatDate(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString()
}

export function SnapshotsTab({ vm, connectionId }: SnapshotsTabProps) {
  const { data: snapshots, isLoading, error } = useSnapshots(connectionId, vm.node, vm.vmid)
  const deleteSnapshot = useDeleteSnapshot()
  const rollbackSnapshot = useRollbackSnapshot()

  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ProxmoxSnapshot | null>(null)
  const [rollbackTarget, setRollbackTarget] = useState<ProxmoxSnapshot | null>(null)

  const handleDelete = () => {
    if (!deleteTarget) return
    deleteSnapshot.mutate(
      { node: vm.node, vmid: vm.vmid, name: deleteTarget.name },
      {
        onSuccess: () => {
          setDeleteTarget(null)
        },
      },
    )
  }

  const handleRollback = () => {
    if (!rollbackTarget) return
    rollbackSnapshot.mutate(
      { node: vm.node, vmid: vm.vmid, name: rollbackTarget.name },
      {
        onSuccess: () => {
          setRollbackTarget(null)
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading snapshots...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-destructive">Failed to load snapshots</p>
      </div>
    )
  }

  const snapshotList = snapshots ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Snapshots</h3>
          <p className="text-sm text-muted-foreground">
            {snapshotList.length} snapshot{snapshotList.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Create Snapshot
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {snapshotList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Camera className="h-8 w-8 mb-2 opacity-50" />
              <p>No snapshots</p>
              <p className="text-xs mt-1">Create a snapshot to save the current VM state</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Name</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Description</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Created</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">VM State</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Parent</th>
                    <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshotList.map((snapshot) => (
                    <tr
                      key={snapshot.name}
                      className="border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-medium">{snapshot.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {snapshot.description || '-'}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatDate(snapshot.snaptime)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${
                            snapshot.vmstate === 1
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {snapshot.vmstate === 1 ? 'Included' : 'Not included'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {snapshot.parent ?? '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Rollback to this snapshot"
                            onClick={() => setRollbackTarget(snapshot)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Delete snapshot"
                            onClick={() => setDeleteTarget(snapshot)}
                          >
                            <Trash className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create Snapshot Dialog */}
      <CreateSnapshotDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        vm={vm}
      />

      {/* Delete confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Snapshot</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete snapshot &quot;{deleteTarget?.name}&quot;? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteSnapshot.isPending}
            >
              {deleteSnapshot.isPending ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rollback confirmation */}
      <Dialog open={!!rollbackTarget} onOpenChange={(open) => { if (!open) setRollbackTarget(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rollback Snapshot</DialogTitle>
            <DialogDescription>
              Are you sure you want to rollback {vm.name} to snapshot &quot;{rollbackTarget?.name}&quot;?
              {vm.status === 'running' && (
                <span className="block mt-1 text-yellow-600 font-medium">
                  The VM will be stopped during the rollback process.
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRollbackTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={handleRollback}
              disabled={rollbackSnapshot.isPending}
            >
              {rollbackSnapshot.isPending ? 'Rolling back...' : 'Rollback'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
