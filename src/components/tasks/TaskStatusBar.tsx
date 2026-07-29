import { useMemo } from 'react'
import { ListTodo, Play } from 'lucide-react'
import { useTasks } from '@/hooks/useProxmox'
import type { ProxmoxTask } from '@/types/proxmox'

interface TaskStatusBarProps {
  connectionId: string
  onClick?: () => void
}

function getTaskStatus(task: ProxmoxTask): 'running' | 'completed' | 'failed' {
  if (task.status === 'running') return 'running'
  if (task.exitstatus === 'OK') return 'completed'
  if (task.exitstatus && task.exitstatus !== 'OK') return 'failed'
  if (!task.endtime) return 'running'
  return 'completed'
}

export function TaskStatusBar({ connectionId, onClick }: TaskStatusBarProps) {
  const { data: tasks } = useTasks(connectionId)

  const runningCount = useMemo(() => {
    if (!tasks) return 0
    return tasks.filter((t) => getTaskStatus(t) === 'running').length
  }, [tasks])

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors hover:bg-accent/50 text-muted-foreground hover:text-accent-foreground"
    >
      <ListTodo className="h-4 w-4" />
      <span className="flex-1 text-left">
        {runningCount > 0 ? (
          <span className="flex items-center gap-1.5">
            <span className="text-blue-500 font-medium">{runningCount} task{runningCount !== 1 ? 's' : ''} running</span>
          </span>
        ) : (
          <span>No tasks running</span>
        )}
      </span>
      {runningCount > 0 && (
        <Play className="h-3 w-3 text-blue-500 animate-pulse" />
      )}
    </button>
  )
}
