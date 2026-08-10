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
import { useAddNIC } from '@/hooks/useProxmox'
import type { ProxmoxVM } from '@/types/proxmox'

interface AddNICDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  vm: ProxmoxVM
}

export function AddNICDialog({ open, onOpenChange, vm }: AddNICDialogProps) {
  const isLxc = vm.type === 'lxc'
  const [bridge, setBridge] = useState('vmbr0')
  const [model, setModel] = useState('virtio')
  const [macaddr, setMacaddr] = useState('')
  const [tag, setTag] = useState('')
  const [firewall, setFirewall] = useState(false)
  const addNIC = useAddNIC()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    addNIC.mutate(
      {
        node: vm.node,
        vmid: vm.vmid,
        vmType: vm.type,
        config: {
          bridge,
          // Container interfaces always use the veth type; the model and VLAN
          // tag concepts only apply to QEMU VMs.
          model: isLxc ? 'veth' : model,
          macaddr: macaddr || undefined,
          tag: isLxc ? undefined : tag ? parseInt(tag, 10) : undefined,
          firewall,
        },
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setBridge('vmbr0')
          setModel('virtio')
          setMacaddr('')
          setTag('')
          setFirewall(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Network Interface</DialogTitle>
          <DialogDescription>
            Add a new NIC to {vm.name} (VMID {vm.vmid})
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="bridge">Bridge</Label>
            <Input
              id="bridge"
              value={bridge}
              onChange={(e) => setBridge(e.target.value)}
              placeholder="vmbr0"
              required
            />
          </div>
          {isLxc ? (
            <p className="text-sm text-muted-foreground">
              Container interfaces use the veth type.
            </p>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="virtio">VirtIO (paravirtualized)</option>
                <option value="e1000">Intel E1000</option>
                <option value="rtl8139">Realtek RTL8139</option>
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="macaddr">MAC Address (optional)</Label>
            <Input
              id="macaddr"
              value={macaddr}
              onChange={(e) => setMacaddr(e.target.value)}
              placeholder="auto-generated if empty"
            />
          </div>
          {!isLxc && (
            <div className="space-y-2">
              <Label htmlFor="tag">VLAN Tag (optional)</Label>
              <Input
                id="tag"
                type="number"
                min={0}
                max={4094}
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                placeholder="none"
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              id="firewall"
              type="checkbox"
              checked={firewall}
              onChange={(e) => setFirewall(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <Label htmlFor="firewall" className="cursor-pointer">
              Enable firewall
            </Label>
          </div>
          {addNIC.isError && (
            <p className="text-sm text-destructive">
              Failed to add network interface. Please try again.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addNIC.isPending}>
              {addNIC.isPending ? 'Adding...' : 'Add NIC'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
