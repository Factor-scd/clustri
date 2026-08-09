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
import { useAddDisk } from '@/hooks/useProxmox'
import type { ProxmoxVM, AddDiskConfig } from '@/types/proxmox'

interface AddDiskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vm: ProxmoxVM
}

export function AddDiskDialog({ open, onOpenChange, vm }: AddDiskDialogProps) {
  const [storage, setStorage] = useState('local-lvm')
  const [size, setSize] = useState('32')
  const [busType, setBusType] = useState<AddDiskConfig['busType']>('scsi')
  const addDisk = useAddDisk()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const sizeBytes = parseFloat(size) * 1024 * 1024 * 1024
    addDisk.mutate(
      {
        node: vm.node,
        vmid: vm.vmid,
        vmType: vm.type,
        config: { storage, size: sizeBytes, busType },
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setStorage('local-lvm')
          setSize('32')
          setBusType('scsi')
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Disk</DialogTitle>
          <DialogDescription>
            Add a new disk to {vm.name} (VMID {vm.vmid})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storage">Storage</Label>
            <Input
              id="storage"
              value={storage}
              onChange={(e) => setStorage(e.target.value)}
              placeholder="local-lvm"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="size">Size (GB)</Label>
            <Input
              id="size"
              type="number"
              min={1}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              placeholder="32"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="busType">Bus Type</Label>
            <select
              id="busType"
              value={busType}
              onChange={(e) => setBusType(e.target.value as AddDiskConfig['busType'])}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="scsi">SCSI</option>
              <option value="virtio">VirtIO</option>
              <option value="ide">IDE</option>
              <option value="sata">SATA</option>
            </select>
          </div>
          {addDisk.isError && (
            <p className="text-sm text-destructive">
              Failed to add disk. Please try again.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addDisk.isPending}>
              {addDisk.isPending ? 'Adding...' : 'Add Disk'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
