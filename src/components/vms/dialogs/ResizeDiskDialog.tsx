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
import { useResizeDisk } from '@/hooks/useProxmox'
import type { ProxmoxVM, ProxmoxDisk } from '@/types/proxmox'
import { formatBytes } from '@/lib/format'

interface ResizeDiskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vm: ProxmoxVM
  disk: ProxmoxDisk
}

export function ResizeDiskDialog({ open, onOpenChange, vm, disk }: ResizeDiskDialogProps) {
  const currentSizeGB = Math.round(disk.size / (1024 * 1024 * 1024))
  const [newSize, setNewSize] = useState(String(currentSizeGB))
  const resizeDisk = useResizeDisk()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const sizeBytes = parseFloat(newSize) * 1024 * 1024 * 1024
    resizeDisk.mutate(
      {
        node: vm.node,
        vmid: vm.vmid,
        disk: disk.device,
        size: sizeBytes,
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
          <DialogTitle>Resize Disk</DialogTitle>
          <DialogDescription>
            Resize {disk.device} on {vm.name} (currently {formatBytes(disk.size)})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="newSize">New Size (GB)</Label>
            <Input
              id="newSize"
              type="number"
              min={currentSizeGB}
              value={newSize}
              onChange={(e) => setNewSize(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Must be larger than current size ({currentSizeGB} GB)
            </p>
          </div>
          {resizeDisk.isError && (
            <p className="text-sm text-destructive">
              Failed to resize disk. Please try again.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={resizeDisk.isPending}>
              {resizeDisk.isPending ? 'Resizing...' : 'Resize'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
