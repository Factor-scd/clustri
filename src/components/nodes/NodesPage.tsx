import { useEffect, useMemo, useState } from 'react'
import { StatusBadge } from '@/components/ui/status-badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Server, Cpu, MemoryStick, HardDrive } from 'lucide-react'
import { useNodes } from '@/hooks/useProxmox'
import { NodeDetail } from '@/components/nodes/NodeDetail'
import { formatBytes, formatUptime } from '@/lib/format'
import { cn } from '@/lib/utils'

interface NodesPageProps {
  connectionId: string
  initialNodeName?: string
  onNavigate?: (view: string) => void
}

function nodePercent(used: number, total: number): number {
  return total > 0 ? Math.round((used / total) * 100) : 0
}

function MiniStat({
  label,
  icon: Icon,
  value,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  value: string
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1 text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </span>
      <span className="font-mono font-medium tabular-nums">{value}</span>
    </div>
  )
}

export function NodesPage({ connectionId, initialNodeName }: NodesPageProps) {
  const { data: nodes, isLoading, error } = useNodes(connectionId)
  const [selectedNodeName, setSelectedNodeName] = useState<string | null>(null)

  // Auto-select the node requested via the sidebar (node-detail view) when it
  // is present; otherwise default-select the first node. Keep the selection
  // valid as the node list refreshes by falling back to the first node when
  // the selection disappears.
  useEffect(() => {
    if (nodes && nodes.length > 0) {
      setSelectedNodeName((current) => {
        if (initialNodeName && nodes.some((n) => n.node === initialNodeName)) {
          return initialNodeName
        }
        return nodes.some((n) => n.node === current) ? current : nodes[0].node
      })
    }
  }, [nodes, initialNodeName])

  const selectedNode = useMemo(() => {
    if (!nodes || nodes.length === 0) return undefined
    return nodes.find((n) => n.node === selectedNodeName) ?? nodes[0]
  }, [nodes, selectedNodeName])

  if (isLoading) {
    return (
      <div className="flex h-full overflow-hidden">
        <div className="w-72 shrink-0 border-r p-3 space-y-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-24" />
            <Skeleton className="h-4 w-32" />
          </div>
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
        <div className="flex-1 p-6 space-y-6">
          <Skeleton className="h-8 w-48" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load nodes</p>
      </div>
    )
  }

  if (!nodes || nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState icon={Server} title="No nodes found" />
      </div>
    )
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Node list */}
      <div className="w-72 shrink-0 border-r overflow-y-auto p-3 space-y-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">Nodes</h2>
          <p className="text-sm text-muted-foreground">
            {nodes.length} node{nodes.length !== 1 ? 's' : ''} in the cluster
          </p>
        </div>

        <div className="space-y-2">
          {nodes.map((node) => (
            <button
              key={node.node}
              onClick={() => setSelectedNodeName(node.node)}
              className={cn(
                'w-full text-left rounded-md border bg-card p-3 transition-colors duration-150',
                selectedNode?.node === node.node
                  ? 'border-primary/40 bg-primary/10'
                  : 'border-border/70 hover:bg-accent/50',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Server className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="truncate font-mono font-medium">{node.node}</span>
                </div>
                <StatusBadge status={node.status} />
              </div>
              <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                Uptime: {formatUptime(node.uptime)}
              </p>
              <div className="mt-2 space-y-1">
                <MiniStat
                  label="CPU"
                  icon={Cpu}
                  value={`${nodePercent(node.cpu * node.maxcpu, node.maxcpu)}%`}
                />
                <MiniStat label="Memory" icon={MemoryStick} value={formatBytes(node.mem)} />
                <MiniStat label="Disk" icon={HardDrive} value={formatBytes(node.disk)} />
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Selected node detail */}
      <div className="flex-1 overflow-hidden">
        {selectedNode && (
          <NodeDetail node={selectedNode} connectionId={connectionId} />
        )}
      </div>
    </div>
  )
}
