import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Activity, Clock } from 'lucide-react'
import type { ProxmoxTask } from '@/types/proxmox'

interface ActivityFeedProps {
  tasks: ProxmoxTask[] | undefined
  isLoading: boolean
}

function getStatusBadgeClass(status?: string): string {
  switch (status) {
    case 'OK':
      return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
    case 'unknown':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
    default:
      if (!status || status === 'Running') {
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      }
      return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
  }
}

function getStatusLabel(status?: string): string {
  if (!status || status === 'Running') return 'Running'
  return status
}

function formatDuration(starttime: number, endtime?: number): string {
  const end = endtime ?? Math.floor(Date.now() / 1000)
  const durationSeconds = Math.max(0, end - starttime)
  if (durationSeconds < 60) return `${durationSeconds}s`
  const minutes = Math.floor(durationSeconds / 60)
  const seconds = durationSeconds % 60
  if (minutes < 60) return `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function getTaskTypeLabel(type: string): string {
  // Capitalize and format Proxmox task types
  return type
    .replace(/qm/gi, 'VM')
    .replace(/vz/gi, 'CT')
    .replace(/storage/gi, 'Storage')
    .replace(/backup/gi, 'Backup')
    .replace(/restore/gi, 'Restore')
    .replace(/snapshot/gi, 'Snapshot')
    .split(/[\s/]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
}

export function ActivityFeed({ tasks, isLoading }: ActivityFeedProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Recent Activity</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">Loading tasks...</p>
        </CardContent>
      </Card>
    )
  }

  const recentTasks = tasks?.slice(0, 15) ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Recent Activity</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {recentTasks.length > 0 ? (
          <ScrollArea className="h-[300px]">
            <div className="space-y-2">
              {recentTasks.map((task) => (
                <div
                  key={task.upid}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">
                          {getTaskTypeLabel(task.type)}
                        </p>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getStatusBadgeClass(task.status)}`}
                        >
                          {getStatusLabel(task.status)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {task.node} &middot; {task.user}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 ml-3">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{formatDuration(task.starttime, task.endtime)}</span>
                    </div>
                    <span>{formatTime(task.starttime)}</span>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
        )}
      </CardContent>
    </Card>
  )
}
