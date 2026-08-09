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
import { useCreateSnapshot } from '@/hooks/useProxmox'
import type { ProxmoxVM } from '@/types/proxmox'

interface CreateSnapshotDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vm: ProxmoxVM
}

export function CreateSnapshotDialog({ open, onOpenChange, vm }: CreateSnapshotDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [vmstate, setVmstate] = useState(false)
  const createSnapshot = useCreateSnapshot()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createSnapshot.mutate(
      {
        node: vm.node,
        vmid: vm.vmid,
        vmType: vm.type,
        config: {
          name,
          description: description || undefined,
          vmstate,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setName('')
          setDescription('')
          setVmstate(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Snapshot</DialogTitle>
          <DialogDescription>
            Create a new snapshot for {vm.name} (VMID {vm.vmid})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Snapshot Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="before-update"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description (optional)</Label>
            <Input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Before applying system updates"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="vmstate"
              checked={vmstate}
              onChange={(e) => setVmstate(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <Label htmlFor="vmstate" className="text-sm font-normal cursor-pointer">
              Include VM state (memory)
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Including VM state captures the running memory, allowing rollback to the exact running
            state. This requires more disk space.
          </p>
          {createSnapshot.isError && (
            <p className="text-sm text-destructive">
              Failed to create snapshot. Please try again.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createSnapshot.isPending || !name.trim()}>
              {createSnapshot.isPending ? 'Creating...' : 'Create Snapshot'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
