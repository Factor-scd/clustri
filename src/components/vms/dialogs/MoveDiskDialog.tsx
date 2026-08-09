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
import { useMoveDisk } from '@/hooks/useProxmox'
import type { ProxmoxVM, ProxmoxDisk } from '@/types/proxmox'

interface MoveDiskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vm: ProxmoxVM
  disk: ProxmoxDisk
}

export function MoveDiskDialog({ open, onOpenChange, vm, disk }: MoveDiskDialogProps) {
  const [targetStorage, setTargetStorage] = useState(disk.storage)
  const moveDisk = useMoveDisk()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    moveDisk.mutate(
      {
        node: vm.node,
        vmid: vm.vmid,
        vmType: vm.type,
        disk: disk.device,
        storage: targetStorage,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Move Disk</DialogTitle>
          <DialogDescription>
            Move {disk.device} from {disk.storage} to a different storage
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="targetStorage">Target Storage</Label>
            <Input
              id="targetStorage"
              value={targetStorage}
              onChange={(e) => setTargetStorage(e.target.value)}
              placeholder="local-lvm"
              required
            />
          </div>
          {moveDisk.isError && (
            <p className="text-sm text-destructive">
              Failed to move disk. Please try again.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={moveDisk.isPending}>
              {moveDisk.isPending ? 'Moving...' : 'Move Disk'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
