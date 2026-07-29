import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { HardDrive, Database, Archive, Disc, Box } from 'lucide-react'
import type { ProxmoxStorage } from '@/types/proxmox'
import { formatBytes } from '@/lib/format'

interface StorageCardProps {
  storage: ProxmoxStorage
  onClick: () => void
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'bg-red-500'
  if (percent >= 70) return 'bg-yellow-500'
  return 'bg-green-500'
}

function getStorageIcon(type: string) {
  switch (type.toLowerCase()) {
    case 'lvm':
    case 'lvmthin':
      return Database
    case 'zfs':
    case 'zfspool':
      return Database
    case 'nfs':
    case 'cifs':
    case 'glusterfs':
      return HardDrive
    case 'local':
      return HardDrive
    default:
      return HardDrive
  }
}

function getContentBadges(content: string): string[] {
  if (!content) return []
  return content.split(',').map((c) => c.trim())
}

const contentTypeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  images: Box,
  rootdir: Box,
  backup: Archive,
  iso: Disc,
  snippets: HardDrive,
  'vztmpl': HardDrive,
}

function getContentTypeLabel(type: string): string {
  switch (type) {
    case 'images': return 'VM Images'
    case 'rootdir': return 'Containers'
    case 'backup': return 'Backups'
    case 'iso': return 'ISOs'
    case 'snippets': return 'Snippets'
    case 'vztmpl': return 'Templates'
    default: return type
  }
}

export function StorageCard({ storage, onClick }: StorageCardProps) {
  const percent = storage.total > 0 ? (storage.used / storage.total) * 100 : 0
  const usageColor = getUsageColor(percent)
  const Icon = getStorageIcon(storage.type)
  const contentTypes = getContentBadges(storage.content)

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={onClick}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-5 w-5 text-muted-foreground" />
          {storage.storage}
        </CardTitle>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="uppercase bg-muted px-1.5 py-0.5 rounded">{storage.type}</span>
          {storage.node && <span>{storage.node}</span>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Usage Bar */}
        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Usage</span>
            <span className="font-medium">{percent.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${usageColor}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>
        </div>

        {/* Size Info */}
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{formatBytes(storage.used)} used</span>
          <span>{formatBytes(storage.total)} total</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatBytes(storage.avail)} available
        </div>

        {/* Content Types */}
        {contentTypes.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {contentTypes.map((type) => {
              const TypeIcon = contentTypeIcons[type] || HardDrive
              return (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
                >
                  <TypeIcon className="h-3 w-3" />
                  {getContentTypeLabel(type)}
                </span>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
