import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useNodes, useVMs, useTasks, queryKeys } from '@/hooks/useProxmox'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DotMatrixText } from '@/components/ui/dot-matrix'
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
      <div className="flex h-full items-center justify-center p-6 dot-grid">
        <div className="flex flex-col items-center text-center rounded-lg border border-dotted border-destructive/30 bg-card p-8 shadow-card">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-sm border border-dotted border-destructive/30 bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <DotMatrixText text="LOAD FAILED" size="sm" className="text-destructive" />
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            {nodesError?.message || vmsError?.message || tasksError?.message || 'An error occurred while loading data'}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Check the connection to your Proxmox server and try again.
          </p>
          <Button variant="outline" className="mt-4 border-dotted" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6 dot-grid">
      <div className="space-y-6">
        <div>
          <DotMatrixText text="DASHBOARD" size="md" className="text-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            Cluster overview and resource usage
          </p>
          <hr className="dot-rule mt-3" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="dot-grid">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <DotMatrixText text="NODES" size="xs" className="text-muted-foreground" />
              <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <DotMatrixText text={`${nodes?.filter((n) => n.status === 'online').length ?? 0} / ${nodes?.length ?? 0}`} size="sm" className="text-foreground" />
              <p className="mt-1.5 text-xs tracking-widest text-muted-foreground">ONLINE</p>
            </CardContent>
          </Card>

          <Card className="dot-grid">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <DotMatrixText text="CPU USAGE" size="xs" className="text-muted-foreground" />
              <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <DotMatrixText text={totalCPU > 0 ? formatPercent(usedCPU / totalCPU) : '0%'} size="sm" className="text-foreground" />
              <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                {usedCPU.toFixed(1)} / {totalCPU} cores
              </p>
            </CardContent>
          </Card>

          <Card className="dot-grid">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <DotMatrixText text="MEMORY" size="xs" className="text-muted-foreground" />
              <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
                <MemoryStick className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <DotMatrixText text={totalMem > 0 ? formatPercent(usedMem / totalMem) : '0%'} size="sm" className="text-foreground" />
              <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                {formatBytes(usedMem)} / {formatBytes(totalMem)}
              </p>
            </CardContent>
          </Card>

          <Card className="dot-grid">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <DotMatrixText text="STORAGE" size="xs" className="text-muted-foreground" />
              <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
                <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <DotMatrixText text={totalDisk > 0 ? formatPercent(usedDisk / totalDisk) : '0%'} size="sm" className="text-foreground" />
              <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                {formatBytes(usedDisk)} / {formatBytes(totalDisk)}
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ResourceGauge
            label="CPU"
            used={usedCPU}
            total={totalCPU}
            icon="cpu"
            formatValue={(v) => `${v.toFixed(1)} cores`}
          />
          <ResourceGauge
            label="MEMORY"
            used={usedMem}
            total={totalMem}
            icon="memory"
            formatValue={formatBytes}
          />
          <ResourceGauge
            label="STORAGE"
            used={usedDisk}
            total={totalDisk}
            icon="disk"
            formatValue={formatBytes}
          />
        </div>

        <NodeHealthGrid nodes={nodes} vms={vms} />

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
