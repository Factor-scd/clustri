import { useState, useMemo, Fragment } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Search, ListTodo, ChevronDown, ChevronRight, Play, CheckCircle, XCircle, Clock } from 'lucide-react'
import { useTasks } from '@/hooks/useProxmox'
import type { ProxmoxTask } from '@/types/proxmox'

interface TaskListProps {
  connectionId: string
}

type TaskStatusFilter = 'all' | 'running' | 'completed' | 'failed'

function formatTimestamp(seconds: number): string {
  if (seconds === 0) return 'N/A'
  const date = new Date(seconds * 1000)
  return date.toLocaleString()
}

function formatDuration(start: number, end?: number): string {
  if (start === 0) return 'N/A'
  const endTime = end ?? Math.floor(Date.now() / 1000)
  const duration = endTime - start
  if (duration < 0) return 'N/A'
  const hours = Math.floor(duration / 3600)
  const minutes = Math.floor((duration % 3600) / 60)
  const seconds = duration % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}h`)
  if (minutes > 0) parts.push(`${minutes}m`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`)
  return parts.join(' ')
}

function getTaskStatus(task: ProxmoxTask): 'running' | 'completed' | 'failed' {
  if (task.status === 'running') return 'running'
  if (task.exitstatus === 'OK') return 'completed'
  if (task.exitstatus && task.exitstatus !== 'OK') return 'failed'
  // If no endtime, consider it running
  if (!task.endtime) return 'running'
  return 'completed'
}

function TaskStatusIcon({ status }: { status: 'running' | 'completed' | 'failed' }) {
  switch (status) {
    case 'running':
      return <Play className="h-3.5 w-3.5 text-blue-500" />
    case 'completed':
      return <CheckCircle className="h-3.5 w-3.5 text-green-500" />
    case 'failed':
      return <XCircle className="h-3.5 w-3.5 text-red-500" />
  }
}

function TaskStatusBadge({ status }: { status: 'running' | 'completed' | 'failed' }) {
  const config = {
    running: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300',
  }

  const label = {
    running: 'Running',
    completed: 'Completed',
    failed: 'Failed',
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config[status]}`}
    >
      <TaskStatusIcon status={status} />
      {label[status]}
    </span>
  )
}

export function TaskList({ connectionId }: TaskListProps) {
  const { data: tasks, isLoading, error } = useTasks(connectionId)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<TaskStatusFilter>('all')
  const [nodeFilter, setNodeFilter] = useState<string>('all')
  const [userFilter, setUserFilter] = useState<string>('all')
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set())

  const filteredTasks = useMemo(() => {
    if (!tasks) return []
    return tasks
      .filter((task) => {
        const taskStatus = getTaskStatus(task)
        // Status filter
        if (statusFilter !== 'all' && taskStatus !== statusFilter) return false
        // Node filter
        if (nodeFilter !== 'all' && task.node !== nodeFilter) return false
        // User filter
        if (userFilter !== 'all' && task.user !== userFilter) return false
        // Search filter
        if (search) {
          const query = search.toLowerCase()
          const matchesUPID = task.upid.toLowerCase().includes(query)
          const matchesType = task.type.toLowerCase().includes(query)
          const matchesId = task.id.toLowerCase().includes(query)
          if (!matchesUPID && !matchesType && !matchesId) return false
        }
        return true
      })
      .sort((a, b) => {
        // Sort by start time descending (newest first)
        return b.starttime - a.starttime
      })
  }, [tasks, statusFilter, nodeFilter, userFilter, search])

  const uniqueNodes = useMemo(() => {
    if (!tasks) return []
    return [...new Set(tasks.map((t) => t.node))].sort()
  }, [tasks])

  const uniqueUsers = useMemo(() => {
    if (!tasks) return []
    return [...new Set(tasks.map((t) => t.user))].sort()
  }, [tasks])

  const runningCount = useMemo(() => {
    if (!tasks) return 0
    return tasks.filter((t) => getTaskStatus(t) === 'running').length
  }, [tasks])

  const toggleExpanded = (upid: string) => {
    setExpandedTasks((prev) => {
      const next = new Set(prev)
      if (next.has(upid)) {
        next.delete(upid)
      } else {
        next.add(upid)
      }
      return next
    })
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading tasks...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load tasks</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <ListTodo className="h-6 w-6" />
            <h2 className="text-2xl font-semibold">Tasks</h2>
          </div>
          <p className="text-muted-foreground">
            {tasks?.length ?? 0} total tasks
            {runningCount > 0 && (
              <span className="ml-2 text-blue-500 font-medium">
                ({runningCount} running)
              </span>
            )}
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by UPID, type, or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatusFilter)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Statuses</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={nodeFilter}
            onChange={(e) => setNodeFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Nodes</option>
            {uniqueNodes.map((node) => (
              <option key={node} value={node}>
                {node}
              </option>
            ))}
          </select>

          <select
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Users</option>
            {uniqueUsers.map((user) => (
              <option key={user} value={user}>
                {user}
              </option>
            ))}
          </select>
        </div>

        {/* Task Table */}
        <Card>
          <CardContent className="p-0">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                {tasks?.length === 0 ? (
                  <div className="space-y-2">
                    <ListTodo className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p>No tasks found</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Search className="h-8 w-8 mx-auto text-muted-foreground/50" />
                    <p>No tasks match your filters</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground w-8" />
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">UPID</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Type</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Node</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">User</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Status</th>
                      <th className="h-10 px-4 text-left font-medium text-muted-foreground">Start Time</th>
                      <th className="h-10 px-4 text-right font-medium text-muted-foreground">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTasks.map((task) => {
                      const taskStatus = getTaskStatus(task)
                      const isExpanded = expandedTasks.has(task.upid)
                      return (
                        <Fragment key={task.upid}>
                          <tr
                            className="border-b last:border-b-0 hover:bg-muted/50 transition-colors cursor-pointer"
                            onClick={() => toggleExpanded(task.upid)}
                          >
                            <td className="px-4 py-3">
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-muted-foreground">{task.upid}</td>
                            <td className="px-4 py-3">
                              <span className="text-xs uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {task.type}
                              </span>
                            </td>
                            <td className="px-4 py-3">{task.node}</td>
                            <td className="px-4 py-3 text-muted-foreground">{task.user}</td>
                            <td className="px-4 py-3">
                              <TaskStatusBadge status={taskStatus} />
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">
                              <div className="flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5" />
                                {formatTimestamp(task.starttime)}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right text-muted-foreground">
                              {formatDuration(task.starttime, task.endtime)}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr key={`${task.upid}-details`} className="border-b bg-muted/20">
                              <td colSpan={8} className="px-4 py-3">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="text-muted-foreground">UPID:</span>
                                    <p className="font-mono">{task.upid}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">Task ID:</span>
                                    <p className="font-mono">{task.id}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">PID:</span>
                                    <p className="font-mono">{task.pid}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground">PStart:</span>
                                    <p className="font-mono">{task.pstart}</p>
                                  </div>
                                  {task.endtime && (
                                    <div>
                                      <span className="text-muted-foreground">End Time:</span>
                                      <p>{formatTimestamp(task.endtime)}</p>
                                    </div>
                                  )}
                                  {task.exitstatus && (
                                    <div>
                                      <span className="text-muted-foreground">Exit Status:</span>
                                      <p className={task.exitstatus === 'OK' ? 'text-green-500' : 'text-red-500'}>
                                        {task.exitstatus}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
