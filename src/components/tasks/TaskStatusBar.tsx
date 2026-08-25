import { useMemo } from 'react'
import { ListTodo, Loader2 } from 'lucide-react'
import { DotMatrixText } from '@/components/ui/dot-matrix'
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
      className="group flex w-full items-center gap-2 rounded-md border border-transparent px-3 py-2 text-sm transition-colors duration-150 hover:border-dotted hover:border-border/60 hover:bg-accent/50 text-muted-foreground hover:text-accent-foreground"
    >
      <ListTodo className="h-4 w-4 transition-colors group-hover:text-foreground" />
      <span className="flex-1 text-left">
        {runningCount > 0 ? (
          <span className="flex items-center gap-1.5">
            <DotMatrixText text={`${runningCount} TASK${runningCount !== 1 ? 'S' : ''} RUNNING`} size="xs" className="text-info group-hover:text-foreground transition-colors" />
          </span>
        ) : (
          <DotMatrixText text="NO TASKS RUNNING" size="xs" className="text-muted-foreground group-hover:text-foreground transition-colors" />
        )}
      </span>
      {runningCount > 0 && <Loader2 className="h-3 w-3 text-info group-hover:text-foreground transition-colors animate-spin" />}
    </button>
  )
}
