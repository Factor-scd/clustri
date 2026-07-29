import { useCallback } from 'react'
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

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.nodes(connectionId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.vms(connectionId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks(connectionId) })
  }, [queryClient, connectionId])

  if (nodesLoading || vmsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  const hasError = nodesError || vmsError || tasksError
  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
          <div>
            <h3 className="text-lg font-semibold">Failed to Load Dashboard</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {nodesError?.message || vmsError?.message || tasksError?.message || 'An error occurred while loading data'}
            </p>
          </div>
          <Button variant="outline" onClick={() => window.location.reload()}>
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
          <h2 className="text-2xl font-semibold">Dashboard</h2>
          <p className="text-muted-foreground">Cluster overview and resource usage</p>
        </div>

        {/* Summary Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Nodes</CardTitle>
              <Server className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {nodes?.filter((n) => n.status === 'online').length ?? 0} / {nodes?.length ?? 0}
              </div>
              <p className="text-xs text-muted-foreground">Online</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">CPU Usage</CardTitle>
              <Cpu className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalCPU > 0 ? formatPercent(usedCPU / totalCPU) : '0%'}
              </div>
              <p className="text-xs text-muted-foreground">
                {usedCPU.toFixed(1)} / {totalCPU} cores
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Memory</CardTitle>
              <MemoryStick className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalMem > 0 ? formatPercent(usedMem / totalMem) : '0%'}
              </div>
              <p className="text-xs text-muted-foreground">
                {formatBytes(usedMem)} / {formatBytes(totalMem)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Storage</CardTitle>
              <HardDrive className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {totalDisk > 0 ? formatPercent(usedDisk / totalDisk) : '0%'}
              </div>
              <p className="text-xs text-muted-foreground">
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
            <QuickActions onRefresh={handleRefresh} isRefreshing={tasksLoading} onNavigate={onNavigate} />
          </div>
        </div>
      </div>
    </div>
  )
}
