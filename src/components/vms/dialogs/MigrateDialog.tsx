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
import { AlertTriangle } from 'lucide-react'
import { useMigrateVM, useNodes } from '@/hooks/useProxmox'
import type { ProxmoxVM } from '@/types/proxmox'

interface MigrateDialogProps {
  vm: ProxmoxVM
  connectionId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MigrateDialog({ vm, connectionId, open, onOpenChange }: MigrateDialogProps) {
  const [targetNode, setTargetNode] = useState('')
  const [online, setOnline] = useState(true)
  const migrateVM = useMigrateVM()
  const { data: nodes } = useNodes(connectionId)

  const otherNodes = (nodes ?? []).filter((n) => n.node !== vm.node && n.status === 'online')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!targetNode.trim()) return

    migrateVM.mutate(
      {
        node: vm.node,
        vmid: vm.vmid,
        vmType: vm.type,
        targetNode,
        online,
      },
      {
        onSuccess: () => {
          onOpenChange(false)
          setTargetNode('')
          setOnline(true)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Migrate VM</DialogTitle>
          <DialogDescription>
            Migrate {vm.name} (VMID {vm.vmid}) to another node
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-2 rounded-md border border-warning/25 bg-warning/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="text-sm">
              <p className="font-medium text-warning">Warning</p>
              <p className="text-muted-foreground">
                Migration may cause temporary downtime. Online migration keeps the VM running but
                requires shared storage. Offline migration requires the VM to be stopped.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetNode">Target Node</Label>
            {otherNodes.length > 0 ? (
              <select
                id="targetNode"
                value={targetNode}
                onChange={(e) => setTargetNode(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                required
              >
                <option value="">Select a node...</option>
                {otherNodes.map((node) => (
                  <option key={node.node} value={node.node}>
                    {node.node}
                  </option>
                ))}
              </select>
            ) : (
              <Input
                id="targetNode"
                value={targetNode}
                onChange={(e) => setTargetNode(e.target.value)}
                placeholder="pve2"
                required
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="online"
              checked={online}
              onChange={(e) => setOnline(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <Label htmlFor="online" className="text-sm font-normal cursor-pointer">
              Online migration (VM stays running)
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            Online migration requires shared storage between nodes. If storage is not shared, the
            migration will transfer disk data over the network.
          </p>
          {migrateVM.isError && (
            <p className="text-sm text-destructive">
              Failed to migrate VM. Please try again.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={migrateVM.isPending || !targetNode.trim()}>
              {migrateVM.isPending ? 'Migrating...' : 'Migrate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
