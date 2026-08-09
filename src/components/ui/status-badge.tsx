import { cn } from '@/lib/utils'
import { CheckCircle, Square, Pause, Clock, XCircle } from 'lucide-react'

type BadgeStatus = 'running' | 'stopped' | 'paused' | 'suspended' | 'online' | 'offline'

interface StatusBadgeProps {
  status: BadgeStatus
  className?: string
}

const statusConfig: Record<BadgeStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  running: {
    label: 'Running',
    color: 'border-success/25 bg-success/10 text-success',
    icon: CheckCircle,
  },
  stopped: {
    label: 'Stopped',
    color: 'border-border bg-muted/60 text-muted-foreground',
    icon: Square,
  },
  paused: {
    label: 'Paused',
    color: 'border-warning/25 bg-warning/10 text-warning',
    icon: Pause,
  },
  suspended: {
    label: 'Suspended',
    color: 'border-warning/25 bg-warning/10 text-warning',
    icon: Clock,
  },
  online: {
    label: 'Online',
    color: 'border-success/25 bg-success/10 text-success',
    icon: CheckCircle,
  },
  offline: {
    label: 'Offline',
    color: 'border-destructive/25 bg-destructive/10 text-destructive',
    icon: XCircle,
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium',
        config.color,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}
