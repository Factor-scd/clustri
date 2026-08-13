import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PageSkeleton } from '@/components/ui/skeleton'
import { ResourceGauge } from '@/components/dashboard/ResourceGauge'
import { AlertCircle, Cpu, Server, Clock, HardDrive, Database } from 'lucide-react'
import {
  usePbsVersion,
  usePbsNodeStatus,
  usePbsDatastores,
  queryKeys,
} from '@/hooks/usePbs'
import { formatBytes, formatUptime } from '@/lib/format'
import type { PbsDatastore } from '@/types/pbs'

interface PbsOverviewProps {
  connectionId: string
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'bg-destructive'
  if (percent >= 70) return 'bg-warning'
  return 'bg-success'
}

function DatastoreSummaryRow({ datastore }: { datastore: PbsDatastore }) {
  const percent = datastore.total && datastore.total > 0
    ? ((datastore.used ?? 0) / datastore.total) * 100
    : 0
  const usageColor = getUsageColor(percent)

  return (
    <div className="flex items-center gap-3 rounded-md border border-border/70 bg-muted/30 px-3 py-2">
      <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-mono text-sm font-medium">{datastore.store}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {percent.toFixed(1)}%
          </span>
        </div>
        <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${usageColor}`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-muted-foreground">
          <span>{formatBytes(datastore.used ?? 0)} used</span>
          <span>{formatBytes(datastore.total ?? 0)} total</span>
        </div>
      </div>
    </div>
  )
}

export function PbsOverview({ connectionId }: PbsOverviewProps) {
  const queryClient = useQueryClient()
  const { data: version, isLoading: versionLoading, error: versionError } = usePbsVersion(connectionId)
  const { data: nodeStatus, isLoading: nodeStatusLoading, error: nodeStatusError } = usePbsNodeStatus(connectionId)
  const { data: datastores, isLoading: datastoresLoading, error: datastoresError } = usePbsDatastores(connectionId)

  const handleRetry = useCallback(() => {
    queryClient.refetchQueries({ queryKey: queryKeys.pbsVersion(connectionId) })
    queryClient.refetchQueries({ queryKey: queryKeys.pbsNodeStatus(connectionId) })
    queryClient.refetchQueries({ queryKey: queryKeys.pbsDatastores(connectionId) })
  }, [queryClient, connectionId])

  if (versionLoading || nodeStatusLoading || datastoresLoading) {
    return <PageSkeleton />
  }

  const hasError = versionError || nodeStatusError || datastoresError
  if (hasError) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="flex flex-col items-center text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg border border-destructive/25 bg-destructive/10">
            <AlertCircle className="h-5 w-5 text-destructive" />
          </div>
          <h3 className="text-lg font-semibold tracking-tight">Unable to load server overview</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {versionError?.message || nodeStatusError?.message || datastoresError?.message || 'An error occurred while loading data'}
          </p>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Check the connection to your Proxmox Backup Server and try again.
          </p>
          <Button variant="outline" className="mt-4" onClick={handleRetry}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  const cpus = nodeStatus?.cpuinfo?.cpus ?? 1
  const usedCpu = (nodeStatus?.cpu ?? 0) * cpus

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.02em]">
            Overview
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Proxmox Backup Server status and resource usage
          </p>
        </div>

        {/* Summary Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Version</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
                {version?.version ?? '—'}
              </div>
              <p className="mt-1.5 font-mono text-xs tabular-nums text-muted-foreground">
                release {version?.release ?? '—'} · repoid {version?.repoid ?? '—'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Uptime</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
                <Clock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
                {formatUptime(nodeStatus?.uptime ?? 0)}
              </div>
              <p className="mt-1.5 truncate font-mono text-xs tabular-nums text-muted-foreground">
                {nodeStatus?.currentKernel?.release ?? '—'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">CPU Load</CardTitle>
              <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
                <Cpu className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
                {nodeStatus?.loadavg?.[0]?.toFixed(2) ?? '—'}
              </div>
              <p className="mt-1.5 truncate font-mono text-xs tabular-nums text-muted-foreground">
                {nodeStatus?.cpuinfo?.model ?? '—'}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Resource Gauges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ResourceGauge
            label="CPU"
            used={usedCpu}
            total={cpus}
            icon="cpu"
            formatValue={(v) => `${v.toFixed(1)} cores`}
          />
          <ResourceGauge
            label="Memory"
            used={nodeStatus?.memory?.used ?? 0}
            total={nodeStatus?.memory?.total ?? 0}
            icon="memory"
            formatValue={formatBytes}
          />
          <ResourceGauge
            label="Root Storage"
            used={nodeStatus?.root?.used ?? 0}
            total={nodeStatus?.root?.total ?? 0}
            icon="disk"
            formatValue={formatBytes}
          />
        </div>

        {/* Datastore Usage Summary */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Datastores</CardTitle>
            <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {!datastores || datastores.length === 0 ? (
              <p className="col-span-full text-sm text-muted-foreground">No datastores configured.</p>
            ) : (
              datastores.map((datastore) => (
                <DatastoreSummaryRow key={datastore.store} datastore={datastore} />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
