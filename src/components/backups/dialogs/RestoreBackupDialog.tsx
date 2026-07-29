import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useRestoreBackup } from '@/hooks/useProxmox'
import type { ProxmoxBackup } from '@/types/proxmox'

interface RestoreBackupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  backup: ProxmoxBackup | null
  nodeOptions: string[]
  storageOptions: string[]
}

export function RestoreBackupDialog({
  open,
  onOpenChange,
  backup,
  nodeOptions,
  storageOptions,
}: RestoreBackupDialogProps) {
  const [node, setNode] = useState(nodeOptions[0] ?? '')
  const [targetStorage, setTargetStorage] = useState(storageOptions[0] ?? '')
  const [vmid, setVmid] = useState('')

  const restoreBackup = useRestoreBackup()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!backup) return
    restoreBackup.mutate(
      {
        volid: backup.volid,
        config: {
          volid: backup.volid,
          node,
          storage: targetStorage,
          vmid: vmid ? parseInt(vmid, 10) : undefined,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setVmid('')
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore Backup</DialogTitle>
          <DialogDescription>
            Restore backup {backup?.volid ?? ''}. This will create a new VM from the backup.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="node">Target Node</Label>
            <select
              id="node"
              value={node}
              onChange={(e) => setNode(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              required
            >
              {nodeOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="targetStorage">Target Storage</Label>
            <select
              id="targetStorage"
              value={targetStorage}
              onChange={(e) => setTargetStorage(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              required
            >
              {storageOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="vmid">New VMID (optional)</Label>
            <Input
              id="vmid"
              type="number"
              value={vmid}
              onChange={(e) => setVmid(e.target.value)}
              placeholder="Auto-assign if empty"
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to auto-assign the next available VMID.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            Warning: Restoring will overwrite any existing VM with the same VMID.
          </p>

          {restoreBackup.isError && (
            <p className="text-sm text-destructive">
              Failed to restore backup. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={restoreBackup.isPending || !node || !targetStorage}>
              {restoreBackup.isPending ? 'Restoring...' : 'Restore Backup'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
