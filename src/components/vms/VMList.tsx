import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/ui/status-badge'
import { Search, Server, Box } from 'lucide-react'
import { useVMs } from '@/hooks/useProxmox'
import type { ProxmoxVM } from '@/types/proxmox'

interface VMListProps {
  connectionId: string
  onVMClick?: (vm: ProxmoxVM) => void
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
}

function formatUptime(seconds: number): string {
  if (seconds === 0) return 'N/A'
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts: string[] = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  return parts.join(' ') || '< 1m'
}

type VMTypeFilter = 'all' | 'qemu' | 'lxc'
type VMStatusFilter = 'all' | ProxmoxVM['status']

export function VMList({ connectionId, onVMClick }: VMListProps) {
  const { data: vms, isLoading: vmsLoading, error: vmsError } = useVMs(connectionId)

  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<VMTypeFilter>('all')
  const [statusFilter, setStatusFilter] = useState<VMStatusFilter>('all')
  const [nodeFilter, setNodeFilter] = useState<string>('all')

  const filteredVMs = useMemo(() => {
    if (!vms) return []
    return vms.filter((vm) => {
      // Type filter
      if (typeFilter !== 'all' && vm.type !== typeFilter) return false
      // Status filter
      if (statusFilter !== 'all' && vm.status !== statusFilter) return false
      // Node filter
      if (nodeFilter !== 'all' && vm.node !== nodeFilter) return false
      // Search filter
      if (search) {
        const query = search.toLowerCase()
        const matchesName = vm.name.toLowerCase().includes(query)
        const matchesVMID = vm.vmid.toString().includes(query)
        if (!matchesName && !matchesVMID) return false
      }
      return true
    })
  }, [vms, typeFilter, statusFilter, nodeFilter, search])

  const uniqueNodes = useMemo(() => {
    if (!vms) return []
    return [...new Set(vms.map((vm) => vm.node))].sort()
  }, [vms])

  if (vmsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading VMs...</p>
      </div>
    )
  }

  if (vmsError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load VMs</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold">Virtual Machines</h2>
          <p className="text-muted-foreground">
            {vms?.length ?? 0} total VMs across the cluster
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
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as VMTypeFilter)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Types</option>
            <option value="qemu">VM (QEMU)</option>
            <option value="lxc">Container (LXC)</option>
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as VMStatusFilter)}
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

        {/* VM Table */}
        <Card>
          <CardContent className="p-0">
            {filteredVMs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {vms?.length === 0 ? (
                  <div className="space-y-2">
                    <Box className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p>No VMs found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Search className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p>No VMs match your filters</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">VMID</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Name</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Status</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Node</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Type</th>
                      <th className="h-10 px-4 text-right font-medium text-muted-foreground">CPU</th>
                      <th className="h-10 px-4 text-right font-medium text-muted-foreground">Memory</th>
                      <th className="h-10 px-4 text-right font-medium text-muted-foreground">Disk</th>
                      <th className="h-10 px-4 text-right font-medium text-muted-foreground">Uptime</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredVMs.map((vm) => (
                      <tr
                        key={`${vm.type}-${vm.vmid}`}
                        className={`border-b last:border-b-0 hover:bg-muted/50 transition-colors ${
                          onVMClick ? 'cursor-pointer' : ''
                        }`}
                        onClick={() => onVMClick?.(vm)}
                      >
                        <td className="px-4 py-3 font-mono text-muted-foreground">{vm.vmid}</td>
                        <td className="px-4 py-3 font-medium">{vm.name}</td>
                        <td className="px-4 py-3">
                          <StatusBadge status={vm.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <Server className="h-3.5 w-3.5 text-muted-foreground" />
                            {vm.node}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                            {vm.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">
                          {vm.cpus} cores
                        </td>
                        <td className="px-4 py-3 text-right">
                          {vm.maxmem > 0 ? formatBytes(vm.mem) : 'N/A'}
                          <span className="text-muted-foreground"> / {formatBytes(vm.maxmem)}</span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {vm.maxdisk > 0 ? formatBytes(vm.disk) : 'N/A'}
                          <span className="text-muted-foreground"> / {formatBytes(vm.maxdisk)}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          {formatUptime(vm.uptime)}
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
