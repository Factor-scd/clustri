import { cn } from '@/lib/utils'
import { CheckCircle, XCircle, Pause, Clock } from 'lucide-react'

type BadgeStatus = 'running' | 'stopped' | 'paused' | 'suspended' | 'online' | 'offline'

interface StatusBadgeProps {
  status: BadgeStatus
  className?: string
}

const statusConfig: Record<BadgeStatus, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  running: {
    label: 'Running',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    icon: CheckCircle,
  },
  stopped: {
    label: 'Stopped',
    color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300',
    icon: XCircle,
  },
  paused: {
    label: 'Paused',
    color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300',
    icon: Pause,
  },
  suspended: {
    label: 'Suspended',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300',
    icon: Clock,
  },
  online: {
    label: 'Online',
    color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    icon: CheckCircle,
  },
  offline: {
    label: 'Offline',
    color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
    icon: XCircle,
  },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status]
  const Icon = config.icon

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        config.color,
        className
      )}
    >
      <Icon className="h-3 w-3" />
      {config.label}
    </span>
  )
}
