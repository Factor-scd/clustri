import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { HardDrive, Plus, Pencil, Trash, ArrowRightLeft } from 'lucide-react'
import { useDisks, useRemoveDisk } from '@/hooks/useProxmox'
import { AddDiskDialog } from '@/components/vms/dialogs/AddDiskDialog'
import { ResizeDiskDialog } from '@/components/vms/dialogs/ResizeDiskDialog'
import { MoveDiskDialog } from '@/components/vms/dialogs/MoveDiskDialog'
import type { ProxmoxVM, ProxmoxDisk } from '@/types/proxmox'
import { formatBytes } from '@/lib/format'

interface DisksTabProps {
  vm: ProxmoxVM
  connectionId: string
}

export function DisksTab({ vm, connectionId }: DisksTabProps) {
  const { data: disks, isLoading, error } = useDisks(connectionId, vm.node, vm.vmid, vm.type)
  const removeDisk = useRemoveDisk()

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [resizeDisk, setResizeDisk] = useState<ProxmoxDisk | null>(null)
  const [moveDisk, setMoveDisk] = useState<ProxmoxDisk | null>(null)
  const [deleteDisk, setDeleteDisk] = useState<ProxmoxDisk | null>(null)

  const handleDelete = () => {
    if (!deleteDisk) return
    removeDisk.mutate({ node: vm.node, vmid: vm.vmid, vmType: vm.type, disk: deleteDisk.device })
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-8 w-28" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-destructive">Failed to load disks</p>
      </div>
    )
  }

  const diskList = disks ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">Disks</h3>
          <p className="text-sm text-muted-foreground">
            {diskList.length} disk{diskList.length !== 1 ? 's' : ''} attached
          </p>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Disk
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {diskList.length === 0 ? (
            <EmptyState icon={HardDrive} title="No disks attached" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Device</th>
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Size</th>
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Storage</th>
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Format</th>
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Usage</th>
                      <th className="h-10 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diskList.map((disk) => (
                      <tr
                        key={disk.device}
                        className="border-b last:border-b-0 hover:bg-accent/50 transition-colors duration-150"
                      >
                        <td className="px-4 py-3 font-mono">{disk.device}</td>
                        <td className="px-4 py-3 font-mono tabular-nums">{formatBytes(disk.size)}</td>
                        <td className="px-4 py-3 font-mono">{disk.storage}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {disk.format}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">
                          {disk.usage ?? '-'}
                        </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Resize disk"
                            onClick={() => setResizeDisk(disk)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Move disk"
                            onClick={() => setMoveDisk(disk)}
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Remove disk"
                            onClick={() => setDeleteDisk(disk)}
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

      {/* Dialogs */}
      <AddDiskDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        vm={vm}
      />

      {resizeDisk && (
        <ResizeDiskDialog
          open={!!resizeDisk}
          onOpenChange={(open) => {
            if (!open) setResizeDisk(null)
          }}
          vm={vm}
          disk={resizeDisk}
        />
      )}

      {moveDisk && (
        <MoveDiskDialog
          open={!!moveDisk}
          onOpenChange={(open) => {
            if (!open) setMoveDisk(null)
          }}
          vm={vm}
          disk={moveDisk}
        />
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteDisk}
        onOpenChange={(open) => {
          if (!open) setDeleteDisk(null)
        }}
        title="Remove Disk"
        description={`Are you sure you want to remove ${deleteDisk?.device} from ${vm.name}? This action cannot be undone.`}
        confirmLabel="Remove"
        isLoading={removeDisk.isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
