import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { useToast } from '@/components/ui/toast'
import { Cpu, MemoryStick, Pencil, Save, X } from 'lucide-react'
import type { ProxmoxVM } from '@/types/proxmox'
import { formatBytes } from '@/lib/format'

interface HardwareTabProps {
  vm: ProxmoxVM
  connectionId: string
}

export function HardwareTab({ vm }: HardwareTabProps) {
  const [editOpen, setEditOpen] = useState(false)
  const { addToast } = useToast()
  const [formData, setFormData] = useState({
    name: vm.name,
    description: vm.tags ?? '',
    cores: vm.cpus.toString(),
    memory: (vm.maxmem / (1024 * 1024 * 1024)).toFixed(1),
  })

  const handleSave = () => {
    addToast('VM configuration editing is not yet implemented', 'warning')
    setEditOpen(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Basic Configuration</CardTitle>
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" />
            Edit
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Name</p>
              <p className="text-sm">{vm.name}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">VMID</p>
              <p className="text-sm font-mono">{vm.vmid}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Type</p>
              <p className="text-sm uppercase">{vm.type}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Tags</p>
              <p className="text-sm">{vm.tags || 'None'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compute</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <Cpu className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">CPU Cores</p>
                <p className="text-sm text-muted-foreground">{vm.cpus} cores</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              <MemoryStick className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Memory</p>
                <p className="text-sm text-muted-foreground">
                  {formatBytes(vm.maxmem)}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Boot</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Boot Order</p>
              <p className="text-sm">scsi0, net0</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">BIOS</p>
              <p className="text-sm">SeaBIOS (default)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Configuration</DialogTitle>
            <DialogDescription>
              Modify the basic hardware configuration for this VM.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="vm-name">Name</Label>
              <Input
                id="vm-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="vm-description">Description / Tags</Label>
              <Input
                id="vm-description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g. production, web-server"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vm-cores">CPU Cores</Label>
                <Input
                  id="vm-cores"
                  type="number"
                  min="1"
                  max="128"
                  value={formData.cores}
                  onChange={(e) => setFormData({ ...formData, cores: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vm-memory">Memory (GB)</Label>
                <Input
                  id="vm-memory"
                  type="number"
                  min="0.25"
                  step="0.25"
                  value={formData.memory}
                  onChange={(e) => setFormData({ ...formData, memory: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button onClick={handleSave}>
              <Save className="h-4 w-4 mr-1" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
