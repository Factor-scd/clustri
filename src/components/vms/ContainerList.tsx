import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'
import { Search, Server, Box } from 'lucide-react'
import { useVMs } from '@/hooks/useProxmox'
import type { ProxmoxVM } from '@/types/proxmox'
import { formatBytes, formatUptime } from '@/lib/format'

interface ContainerListProps {
  connectionId: string
  onContainerClick?: (container: ProxmoxVM) => void
}

type ContainerStatusFilter = 'all' | ProxmoxVM['status']

export function ContainerList({ connectionId, onContainerClick }: ContainerListProps) {
  const { data: vms, isLoading, error } = useVMs(connectionId)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<ContainerStatusFilter>('all')
  const [nodeFilter, setNodeFilter] = useState<string>('all')

  // Filter to only LXC containers
  const containers = useMemo(() => {
    return vms?.filter((vm) => vm.type === 'lxc') ?? []
  }, [vms])

  const filteredContainers = useMemo(() => {
    return containers.filter((container) => {
      // Status filter
      if (statusFilter !== 'all' && container.status !== statusFilter) return false
      // Node filter
      if (nodeFilter !== 'all' && container.node !== nodeFilter) return false
      // Search filter
      if (search) {
        const query = search.toLowerCase()
        const matchesName = container.name.toLowerCase().includes(query)
        const matchesVMID = container.vmid.toString().includes(query)
        if (!matchesName && !matchesVMID) return false
      }
      return true
    })
  }, [containers, statusFilter, nodeFilter, search])

  const uniqueNodes = useMemo(() => {
    return [...new Set(containers.map((c) => c.node))].sort()
  }, [containers])

  if (isLoading) {
    return (
      <PageSkeleton filter>
        <Skeleton className="h-96 w-full" />
      </PageSkeleton>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load containers</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Containers</h2>
          <p className="text-muted-foreground">
            {containers.length} total containers across the cluster
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or VMID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ContainerStatusFilter)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Statuses</option>
            <option value="running">Running</option>
            <option value="stopped">Stopped</option>
            <option value="paused">Paused</option>
            <option value="suspended">Suspended</option>
          </select>

          <select
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Nodes</option>
            {uniqueNodes.map((node) => (
              <option key={node} value={node}>
                {node}
              </option>
            ))}
          </select>
        </div>

        {/* Container Table */}
        <Card>
          <CardContent className="p-0">
            {filteredContainers.length === 0 ? (
              containers.length === 0 ? (
                <EmptyState icon={Box} title="No containers found" />
              ) : (
                <EmptyState icon={Search} title="No containers match your filters" />
              )
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">VMID</th>
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</th>
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</th>
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Node</th>
                      <th className="h-10 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">CPU</th>
                      <th className="h-10 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Memory</th>
                      <th className="h-10 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Disk</th>
                      <th className="h-10 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Uptime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredContainers.map((container) => (
                      <tr
                        key={`lxc-${container.vmid}`}
                        className={`border-b last:border-b-0 hover:bg-accent/50 transition-colors duration-150 ${
                          onContainerClick ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => onContainerClick?.(container)}
                      >
                        <td className="px-4 py-3 font-mono tabular-nums text-muted-foreground">{container.vmid}</td>
                        <td className="px-4 py-3 font-medium">{container.name}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={container.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Server className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="font-mono">{container.node}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {container.cpus} cores
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {container.maxmem > 0 ? formatBytes(container.mem) : 'N/A'}
                          <span className="text-muted-foreground"> / {formatBytes(container.maxmem)}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums">
                          {container.maxdisk > 0 ? formatBytes(container.disk) : 'N/A'}
                          <span className="text-muted-foreground"> / {formatBytes(container.maxdisk)}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono tabular-nums text-muted-foreground">
                          {formatUptime(container.uptime)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
