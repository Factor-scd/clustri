import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { ArrowLeft, HardDrive, Database, Archive, Disc, Box, Clock, File } from 'lucide-react'
import { useStorageDetail, useStorageContent } from '@/hooks/useProxmox'
import type { ProxmoxStorageContent } from '@/types/proxmox'
import { formatBytes } from '@/lib/format'

interface StorageDetailProps {
  connectionId: string
  storage: string
  node: string
  onBack: () => void
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'bg-destructive'
  if (percent >= 70) return 'bg-warning'
  return 'bg-success'
}

function getStorageIcon(type: string) {
  switch (type?.toLowerCase()) {
    case 'lvm':
    case 'lvmthin':
      return Database
    case 'zfs':
    case 'zfspool':
      return Database
    default:
      return HardDrive
  }
}

function getContentIcon(contentType: string) {
  switch (contentType) {
    case 'images': return Box
    case 'backup': return Archive
    case 'iso': return Disc
    default: return File
  }
}

function getContentTypeLabel(type: string): string {
  switch (type) {
    case 'images': return 'VM Images'
    case 'rootdir': return 'Container Root Disks'
    case 'backup': return 'Backups'
    case 'iso': return 'ISO Images'
    case 'snippets': return 'Snippets'
    case 'vztmpl': return 'Container Templates'
    default: return type
  }
}

function formatTimestamp(seconds: number): string {
  if (!seconds) return 'N/A'
  return new Date(seconds * 1000).toLocaleString()
}

function formatContentItem(item: ProxmoxStorageContent): string {
  const parts = item.volid.split('/')
  return parts[parts.length - 1] || item.volid
}

export function StorageDetail({ connectionId, storage, node, onBack }: StorageDetailProps) {
  const { data: detail, isLoading: detailLoading } = useStorageDetail(
    connectionId,
    node,
    storage
  )
  const { data: contentList, isLoading: contentLoading, error: contentError } = useStorageContent(
    connectionId,
    node,
    storage
  )

  const percent = detail && detail.total > 0
    ? (detail.used / detail.total) * 100
    : 0
  const usageColor = getUsageColor(percent)
  const Icon = detail ? getStorageIcon(detail.type) : HardDrive

  // Group content by type
  const contentByType = contentList?.reduce((acc, item) => {
    const type = item.content
    if (!acc[type]) acc[type] = []
    acc[type].push(item)
    return acc
  }, {} as Record<string, ProxmoxStorageContent[]>) ?? {}

  if (detailLoading || contentLoading) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-9" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load storage details</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <Icon className="h-6 w-6 text-muted-foreground" />
              <h2 className="font-mono text-2xl font-semibold tracking-tight">{storage}</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              <span className="font-mono">{detail.type.toUpperCase()}</span> storage on{' '}
              <span className="font-mono">{node}</span>
            </p>
          </div>
        </div>

        {/* Resource Usage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resource Usage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Large Usage Bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Disk Usage</span>
                <span className="font-mono font-medium tabular-nums">{percent.toFixed(1)}%</span>
              </div>
              <div className="h-4 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${usageColor}`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
                <span>{formatBytes(detail.used)} used</span>
                <span>{formatBytes(detail.total)} total</span>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total Size</p>
                <p className="font-mono text-sm font-medium tabular-nums">{formatBytes(detail.total)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Used</p>
                <p className="font-mono text-sm font-medium tabular-nums">{formatBytes(detail.used)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Available</p>
                <p className="font-mono text-sm font-medium tabular-nums">{formatBytes(detail.avail)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="text-sm font-medium">
                  {detail.active ? (
                    <span className="text-success">Active</span>
                  ) : (
                    <span className="text-muted-foreground">Inactive</span>
                  )}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Storage Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Storage Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-5">
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
                <p className="font-mono text-sm font-medium">{storage}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</p>
                <p className="font-mono text-sm font-medium uppercase">{detail.type}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Node</p>
                <p className="font-mono text-sm font-medium">{node}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Enabled</p>
                <p className="text-sm font-medium">{detail.enabled ? 'Yes' : 'No'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Shared</p>
                <p className="text-sm font-medium">{detail.shared ? 'Yes' : 'No'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Content Types</p>
                <p className="text-sm font-medium">{detail.content || 'None'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Content List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Content
              {contentList && (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  ({contentList.length} items)
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contentError ? (
              <EmptyState
                icon={File}
                title="Failed to load content"
                description={contentError.message}
              />
            ) : !contentList || contentList.length === 0 ? (
              <EmptyState icon={File} title="No content found" />
            ) : (
              <div className="space-y-4">
                {Object.entries(contentByType).map(([type, items]) => {
                  const TypeIcon = getContentIcon(type)
                  return (
                    <div key={type} className="space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <TypeIcon className="h-4 w-4 text-muted-foreground" />
                        {getContentTypeLabel(type)}
                        <span className="text-muted-foreground">({items.length})</span>
                      </div>
                      <div className="ml-6 space-y-1">
                        {items.map((item, idx) => (
                          <div
                            key={`${item.volid}-${idx}`}
                            className="flex items-center justify-between py-1 text-sm border-b border-border/50 last:border-0"
                          >
                            <div className="flex items-center gap-2">
                              <File className="h-3.5 w-3.5 text-muted-foreground" />
                              <span className="truncate max-w-[300px] font-mono text-xs">
                                {formatContentItem(item)}
                              </span>
                            </div>
                            <div className="flex items-center gap-4 font-mono text-xs tabular-nums text-muted-foreground">
                              {item.format && (
                                <span className="uppercase bg-muted px-1.5 py-0.5 rounded">
                                  {item.format}
                                </span>
                              )}
                              {item.size && <span>{formatBytes(item.size)}</span>}
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {formatTimestamp(item.ctime)}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
