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
import { useEditNIC } from '@/hooks/useProxmox'
import type { ProxmoxVM, ProxmoxNetwork } from '@/types/proxmox'

interface EditNICDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vm: ProxmoxVM
  nic: ProxmoxNetwork
}

export function EditNICDialog({ open, onOpenChange, vm, nic }: EditNICDialogProps) {
  const [bridge, setBridge] = useState(nic.bridge ?? '')
  const [model, setModel] = useState(nic.model)
  const [tag, setTag] = useState(nic.tag != null ? String(nic.tag) : '')
  const [firewall, setFirewall] = useState(nic.firewall === 1)
  const editNIC = useEditNIC()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    editNIC.mutate(
      {
        node: vm.node,
        vmid: vm.vmid,
        vmType: vm.type,
        nic: nic.name,
        config: {
          bridge: bridge || undefined,
          model,
          tag: tag ? parseInt(tag, 10) : undefined,
          firewall,
        },
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
          <DialogTitle>Edit Network Interface</DialogTitle>
          <DialogDescription>
            Edit {nic.name} ({nic.model}) on {vm.name} (VMID {vm.vmid})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-bridge">Bridge</Label>
            <Input
              id="edit-bridge"
              value={bridge}
              onChange={(e) => setBridge(e.target.value)}
              placeholder="vmbr0"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-model">Model</Label>
            <select
              id="edit-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="virtio">VirtIO (paravirtualized)</option>
              <option value="e1000">Intel E1000</option>
              <option value="rtl8139">Realtek RTL8139</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tag">VLAN Tag (optional)</Label>
            <Input
              id="edit-tag"
              type="number"
              min={0}
              max={4094}
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="none"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              id="edit-firewall"
              type="checkbox"
              checked={firewall}
              onChange={(e) => setFirewall(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <Label htmlFor="edit-firewall" className="cursor-pointer">
              Enable firewall
            </Label>
          </div>
          {editNIC.isError && (
            <p className="text-sm text-destructive">
              Failed to edit network interface. Please try again.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={editNIC.isPending}>
              {editNIC.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
