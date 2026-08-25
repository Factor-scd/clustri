import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DotMatrixText } from '@/components/ui/dot-matrix'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Activity, Clock, Loader2 } from 'lucide-react'
import type { ProxmoxTask } from '@/types/proxmox'

interface ActivityFeedProps {
  tasks: ProxmoxTask[] | undefined
  isLoading: boolean
}

function isRunningTask(status?: string): boolean {
  return !status || status === 'Running'
}

function getStatusBadgeClass(status?: string): string {
  switch (status) {
    case 'OK':
      return 'border-dotted border-success/30 bg-success/10 text-success'
    case 'unknown':
      return 'border-dotted border-warning/30 bg-warning/10 text-warning'
    default:
      if (!status || status === 'Running') {
        return 'border-dotted border-info/30 bg-info/10 text-info'
      }
      return 'border-dotted border-destructive/30 bg-destructive/10 text-destructive'
  }
}

function getStatusLabel(status?: string): string {
  if (!status || status === 'Running') return 'RUNNING'
  return status.toUpperCase()
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
      <Card className="dot-grid">
        <CardHeader className="border-b border-dotted border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
              <Activity className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <DotMatrixText text="RECENT ACTIVITY" size="xs" className="text-foreground" />
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="space-y-2">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const recentTasks = tasks?.slice(0, 15) ?? []

  return (
    <Card className="dot-grid">
      <CardHeader className="border-b border-dotted border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
            <Activity className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <DotMatrixText text="RECENT ACTIVITY" size="xs" className="text-foreground" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {recentTasks.length > 0 ? (
          <ScrollArea className="h-[300px]">
            <div className="space-y-0">
              {recentTasks.map((task) => (
                <div
                  key={task.upid}
                  className="flex items-center justify-between px-3 py-2.5 transition-colors duration-150 hover:bg-accent/30 feed-rule"
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-[13px] font-medium">{getTaskTypeLabel(task.type)}</p>
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-sm border border-dotted px-1.5 py-0.5 text-[10px] font-medium tracking-widest ${getStatusBadgeClass(task.status)}`}
                        >
                          {isRunningTask(task.status) && (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          )}
                          {getStatusLabel(task.status)}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="font-mono tabular-nums">{task.node}</span>
                        <span> · </span>
                        {task.user}
                      </p>
                    </div>
                  </div>
                  <div className="ml-3 flex shrink-0 items-center gap-3 font-mono text-xs tabular-nums text-muted-foreground">
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
          <p className="py-4 text-center text-sm text-muted-foreground">No recent activity</p>
        )}
      </CardContent>
    </Card>
  )
}
