import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'
import { HardDrive, AlertTriangle, XCircle } from 'lucide-react'
import { usePbsDatastores } from '@/hooks/usePbs'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { PbsDatastore } from '@/types/pbs'

interface PbsDatastoresProps {
  connectionId: string
  onDatastoreClick?: (store: string) => void
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'bg-destructive'
  if (percent >= 70) return 'bg-warning'
  return 'bg-success'
}

function PbsDatastoreCard({
  datastore,
  onClick,
}: {
  datastore: PbsDatastore
  onClick: () => void
}) {
  const percent = datastore.total && datastore.total > 0
    ? ((datastore.used ?? 0) / datastore.total) * 100
    : 0
  const usageColor = getUsageColor(percent)
  const hasError = !!datastore.error

  return (
    <Card
      className={cn(
        'cursor-pointer transition-all duration-150 hover:-translate-y-0.5 hover:shadow-card',
        hasError && 'border-destructive/40',
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <HardDrive className="h-5 w-5 text-muted-foreground" />
          <span className="truncate font-mono">{datastore.store}</span>
        </CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {datastore.backendType && (
            <span className="uppercase bg-muted px-1.5 py-0.5 rounded">
              {datastore.backendType}
            </span>
          )}
          {datastore.mountStatus && (
            <span className="font-mono">{datastore.mountStatus}</span>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {datastore.comment && (
          <p className="truncate text-xs text-muted-foreground">{datastore.comment}</p>
        )}

        {/* Usage Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Usage</span>
            <span className="font-mono font-medium tabular-nums">{percent.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${usageColor}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        </div>

        {/* Size Info */}
        <div className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
          <span>{formatBytes(datastore.used ?? 0)} used</span>
          <span>{formatBytes(datastore.total ?? 0)} total</span>
        </div>
        <div className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatBytes(datastore.avail ?? 0)} available
        </div>

        {/* Status badges */}
        {(hasError || datastore.maintenance) && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {hasError && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                <XCircle className="h-3 w-3" />
                Error
              </span>
            )}
            {datastore.maintenance && (
              <span className="inline-flex items-center gap-1 rounded-sm border border-warning/25 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                <AlertTriangle className="h-3 w-3" />
                Maintenance
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function PbsDatastores({ connectionId, onDatastoreClick }: PbsDatastoresProps) {
  const { data: datastores, isLoading, error } = usePbsDatastores(connectionId)

  if (isLoading) {
    return (
      <PageSkeleton filter>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </PageSkeleton>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load datastores</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-6 w-6 text-muted-foreground" />
            <h2 className="text-2xl font-semibold tracking-tight">Datastores</h2>
          </div>
          <p className="text-muted-foreground">
            {datastores?.length ?? 0} datastores on this backup server
          </p>
        </div>

        {/* Datastore Grid */}
        {!datastores || datastores.length === 0 ? (
          <EmptyState
            icon={HardDrive}
            title="No datastores found"
            description="Create a datastore on the backup server to get started"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {datastores.map((datastore) => (
              <PbsDatastoreCard
                key={datastore.store}
                datastore={datastore}
                onClick={() => onDatastoreClick?.(datastore.store)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
