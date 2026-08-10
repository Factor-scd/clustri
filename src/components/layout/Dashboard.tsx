import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNodes, useVMs, useTasks, queryKeys } from '@/hooks/useProxmox'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Server, Cpu, HardDrive, MemoryStick, AlertCircle } from 'lucide-react'
import { ResourceGauge } from '@/components/dashboard/ResourceGauge'
import { NodeHealthGrid } from '@/components/dashboard/NodeHealthGrid'
import { ActivityFeed } from '@/components/dashboard/ActivityFeed'
import { QuickActions } from '@/components/dashboard/QuickActions'
import { formatBytes } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/ui/skeleton'

interface DashboardProps {
  connectionId: string
  onNavigate?: (view: string) => void
}

export function Dashboard({ connectionId, onNavigate }: DashboardProps) {
  const queryClient = useQueryClient()
  const { data: nodes, isLoading: nodesLoading, error: nodesError } = useNodes(connectionId)
  const { data: vms, isLoading: vmsLoading, error: vmsError } = useVMs(connectionId)
  const { data: tasks, isLoading: tasksLoading, error: tasksError } = useTasks(connectionId)

  const totalCPU = nodes?.reduce((acc, n) => acc + n.maxcpu, 0) ?? 0
  const usedCPU = nodes?.reduce((acc, n) => acc + n.cpu * n.maxcpu, 0) ?? 0
  const totalMem = nodes?.reduce((acc, n) => acc + n.maxmem, 0) ?? 0
  const usedMem = nodes?.reduce((acc, n) => acc + n.mem, 0) ?? 0
  const totalDisk = nodes?.reduce((acc, n) => acc + n.maxdisk, 0) ?? 0
  const usedDisk = nodes?.reduce((acc, n) => acc + n.disk, 0) ?? 0

  const formatPercent = (value: number) => `${(value * 100).toFixed(1)}%`

  // Track actual refresh activity rather than piggybacking on tasksLoading,
  // which is true whenever the tasks query is fetching (e.g. background
  // polling) and would keep the Refresh button spinning continuously.
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.nodes(connectionId) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.vms(connectionId) })
      await queryClient.invalidateQueries({ queryKey: queryKeys.tasks(connectionId) })
    } finally {
      setRefreshing(false)
    }
  }, [queryClient, connectionId])

  const handleRetry = useCallback(() => {
    queryClient.refetchQueries({ queryKey: queryKeys.nodes(connectionId) })
    queryClient.refetchQueries({ queryKey: queryKeys.vms(connectionId) })
    queryClient.refetchQueries({ queryKey: queryKeys.tasks(connectionId) })
  }, [queryClient, connectionId])

  if (nodesLoading || vmsLoading) {
    return <PageSkeleton />
  }

  const hasError = nodesError || vmsError || tasksError
  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-destructive/25 bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight">Unable to load dashboard</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {nodesError?.message || vmsError?.message || tasksError?.message || 'An error occurred while loading data'}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Check the connection to your Proxmox server and try again.
          </p>
          <Button variant="outline" className="mt-4" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.02em]">
            Dashboard
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Cluster overview and resource usage
          </p>
        </div>

        {/* Summary Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Nodes</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
                {nodes?.filter((n) => n.status === 'online').length ?? 0}
                <span className="text-muted-foreground"> / {nodes?.length ?? 0}</span>
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">Online</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">CPU Usage</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
                {totalCPU > 0 ? formatPercent(usedCPU / totalCPU) : '0%'}
              </div>
              <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                {usedCPU.toFixed(1)} / {totalCPU} cores
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Memory</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
                <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
                {totalMem > 0 ? formatPercent(usedMem / totalMem) : '0%'}
              </div>
              <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                {formatBytes(usedMem)} / {formatBytes(totalMem)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Storage</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
                <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
                {totalDisk > 0 ? formatPercent(usedDisk / totalDisk) : '0%'}
              </div>
              <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                {formatBytes(usedDisk)} / {formatBytes(totalDisk)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Resource Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ResourceGauge
            label="CPU"
            used={usedCPU}
            total={totalCPU}
            icon="cpu"
            formatValue={(v) => `${v.toFixed(1)} cores`}
          />
          <ResourceGauge
            label="Memory"
            used={usedMem}
            total={totalMem}
            icon="memory"
            formatValue={formatBytes}
          />
          <ResourceGauge
            label="Storage"
            used={usedDisk}
            total={totalDisk}
            icon="disk"
            formatValue={formatBytes}
          />
        </div>

        {/* Node Health Grid */}
        <NodeHealthGrid nodes={nodes} vms={vms} />

        {/* Activity Feed + Quick Actions */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ActivityFeed tasks={tasks} isLoading={tasksLoading} />
          </div>
          <div>
            <QuickActions onRefresh={handleRefresh} isRefreshing={refreshing} onNavigate={onNavigate} />
          </div>
        </div>
      </div>
    </div>
  )
}
