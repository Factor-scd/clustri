import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Network, Plus, Pencil, Trash } from 'lucide-react'
import { useNetworkInterfaces, useRemoveNIC } from '@/hooks/useProxmox'
import { AddNICDialog } from '@/components/vms/dialogs/AddNICDialog'
import { EditNICDialog } from '@/components/vms/dialogs/EditNICDialog'
import type { ProxmoxVM, ProxmoxNetwork } from '@/types/proxmox'
import { formatNetworkRate } from '@/lib/format'

interface NetworkTabProps {
  vm: ProxmoxVM
  connectionId: string
}

export function NetworkTab({ vm, connectionId }: NetworkTabProps) {
  const { data: interfaces, isLoading, error } = useNetworkInterfaces(connectionId, vm.node, vm.vmid)
  const removeNIC = useRemoveNIC()

  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const [editNic, setEditNic] = useState<ProxmoxNetwork | null>(null)
  const [deleteNic, setDeleteNic] = useState<ProxmoxNetwork | null>(null)

  const handleDelete = () => {
    if (!deleteNic) return
    removeNIC.mutate(
      { node: vm.node, vmid: vm.vmid, nic: deleteNic.name },
      {
        onSuccess: () => {
          setDeleteNic(null)
        },
      },
    )
  }

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading network interfaces...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-destructive">Failed to load network interfaces</p>
      </div>
    )
  }

  const nicList = interfaces ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Network Interfaces</h3>
          <p className="text-sm text-muted-foreground">
            {nicList.length} NIC{nicList.length !== 1 ? 's' : ''} attached
            <span className="ml-2 text-xs">
              I/O: {formatNetworkRate(vm.netin)} in / {formatNetworkRate(vm.netout)} out
            </span>
          </p>
        </div>
        <Button size="sm" onClick={() => setAddDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          Add NIC
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {nicList.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Network className="h-8 w-8 mb-2 opacity-50" />
              <p>No network interfaces attached</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Device</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Model</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">MAC Address</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Bridge</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">VLAN</th>
                    <th className="h-10 px-4 text-left font-medium text-muted-foreground">Firewall</th>
                    <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {nicList.map((nic) => (
                    <tr
                      key={nic.name}
                      className="border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono">{nic.name}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                          {nic.model}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{nic.macaddr}</td>
                      <td className="px-4 py-3">{nic.bridge ?? '-'}</td>
                      <td className="px-4 py-3">
                        {nic.tag != null ? (
                          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{nic.tag}</span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {nic.firewall === 1 ? (
                          <span className="inline-block h-2 w-2 rounded-full bg-green-500" title="Enabled" />
                        ) : (
                          <span className="inline-block h-2 w-2 rounded-full bg-muted-foreground/30" title="Disabled" />
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Edit NIC"
                            onClick={() => setEditNic(nic)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Remove NIC"
                            onClick={() => setDeleteNic(nic)}
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
      <AddNICDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        vm={vm}
      />

      {editNic && (
        <EditNICDialog
          open={!!editNic}
          onOpenChange={(open) => {
            if (!open) setEditNic(null)
          }}
          vm={vm}
          nic={editNic}
        />
      )}

      {/* Delete confirmation */}
      <Dialog open={!!deleteNic} onOpenChange={(open) => { if (!open) setDeleteNic(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove Network Interface</DialogTitle>
            <DialogDescription>
              Are you sure you want to remove {deleteNic?.name} from {vm.name}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteNic(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={removeNIC.isPending}
            >
              {removeNIC.isPending ? 'Removing...' : 'Remove'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
