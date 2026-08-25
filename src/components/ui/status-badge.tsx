import { cn } from '@/lib/utils'
import { CheckCircle, Square, Pause, Clock, XCircle } from 'lucide-react'

type BadgeStatus = 'running' | 'stopped' | 'paused' | 'suspended' | 'online' | 'offline'

interface StatusBadgeProps {
  status: BadgeStatus
  className?: string
}

const statusConfig: Record<BadgeStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  running: {
    label: 'RUNNING',
    color: 'border-dotted border-success/30 bg-success/10 text-success',
    icon: CheckCircle,
  },
  stopped: {
    label: 'STOPPED',
    color: 'border-dotted border-border bg-muted/60 text-muted-foreground',
    icon: Square,
  },
  paused: {
    label: 'PAUSED',
    color: 'border-dotted border-warning/30 bg-warning/10 text-warning',
    icon: Pause,
  },
  suspended: {
    label: 'SUSPENDED',
    color: 'border-dotted border-warning/30 bg-warning/10 text-warning',
    icon: Clock,
  },
  online: {
    label: 'ONLINE',
    color: 'border-dotted border-success/30 bg-success/10 text-success',
    icon: CheckCircle,
  },
  offline: {
    label: 'OFFLINE',
    color: 'border-dotted border-destructive/30 bg-destructive/10 text-destructive',
    icon: XCircle,
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-dotted px-2 py-0.5 text-[11px] font-medium tracking-widest',
        config.color,
        className,
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}
