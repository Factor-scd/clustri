import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/ui/status-badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Server, Cpu, MemoryStick, HardDrive } from 'lucide-react'
import { useVMs } from '@/hooks/useProxmox'
import type { ProxmoxNode } from '@/types/proxmox'
import { formatBytes, formatUptime } from '@/lib/format'

interface NodeDetailProps {
  node: ProxmoxNode
  connectionId: string
}

function ResourceBar({ label, used, total, icon: Icon }: {
  label: string
  used: number
  total: number
  icon: React.ComponentType<{ className?: string }>
}) {
  const percent = total > 0 ? (used / total) * 100 : 0
  const color =
    percent > 90 ? 'bg-destructive' :
    percent > 70 ? 'bg-warning' :
    'bg-success'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {percent.toFixed(1)}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-secondary overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <div className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatBytes(used)} / {formatBytes(total)}
      </div>
    </div>
  )
}

export function NodeDetail({ node, connectionId }: NodeDetailProps) {
  const { data: vms, isLoading: vmsLoading } = useVMs(connectionId)

  const nodeVMs = vms?.filter((vm) => vm.node === node.node) ?? []
  const runningVMs = nodeVMs.filter((vm) => vm.status === 'running')

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <Server className="h-6 w-6 text-muted-foreground" />
              <h2 className="font-mono text-2xl font-semibold tracking-tight">{node.node}</h2>
              <StatusBadge status={node.status} />
            </div>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">
              Uptime: {formatUptime(node.uptime)}
            </p>
          </div>
        </div>

        {/* Resource Usage */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <ResourceBar
                label="CPU"
                used={node.cpu * node.maxcpu}
                total={node.maxcpu}
                icon={Cpu}
              />
              <div className="mt-2 font-mono text-sm tabular-nums text-muted-foreground">
                {node.cpu.toFixed(1)} / {node.maxcpu} cores
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <ResourceBar
                label="Memory"
                used={node.mem}
                total={node.maxmem}
                icon={MemoryStick}
              />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <ResourceBar
                label="Disk"
                used={node.disk}
                total={node.maxdisk}
                icon={HardDrive}
              />
            </CardContent>
          </Card>
        </div>

        {/* VMs/Containers on this node */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Virtual Machines & Containers</CardTitle>
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
                {runningVMs.length} running / {nodeVMs.length} total
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {vmsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }, (_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : nodeVMs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No VMs or containers found on this node
              </div>
            ) : (
              <div className="space-y-2">
                {nodeVMs.map((vm) => (
                  <div
                    key={`${vm.type}-${vm.vmid}`}
                    className="flex items-center justify-between rounded-md border border-border/70 px-3 py-2.5 transition-colors duration-150 hover:bg-accent/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm tabular-nums text-muted-foreground">
                          {vm.vmid}
                        </span>
                        <span className="font-medium">{vm.name}</span>
                      </div>
                      <span className="text-xs uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        {vm.type}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <StatusBadge status={vm.status} />
                      <div className="font-mono text-sm tabular-nums text-muted-foreground">
                        {vm.maxmem > 0 ? formatBytes(vm.mem) : 'N/A'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Node Info */}
        <Card>
          <CardHeader>
            <CardTitle>System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 text-sm">
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Node Name</span>
                <p className="mt-1 font-mono font-medium">{node.node}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</span>
                <p className="mt-1 font-medium capitalize">{node.status}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Uptime</span>
                <p className="mt-1 font-mono font-medium tabular-nums">{formatUptime(node.uptime)}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Support Level</span>
                <p className="mt-1 font-medium">{node.level || 'None'}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total CPUs</span>
                <p className="mt-1 font-mono font-medium tabular-nums">{node.maxcpu}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Memory</span>
                <p className="mt-1 font-mono font-medium tabular-nums">{formatBytes(node.maxmem)}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Disk</span>
                <p className="mt-1 font-mono font-medium tabular-nums">{formatBytes(node.maxdisk)}</p>
              </div>
              <div>
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">ID</span>
                <p className="mt-1 font-mono text-xs tabular-nums">{node.id}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
