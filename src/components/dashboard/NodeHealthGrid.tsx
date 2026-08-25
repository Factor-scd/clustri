import { useMemo } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DotMatrixText } from '@/components/ui/dot-matrix'
import { Cpu, MemoryStick, HardDrive, Clock, Server, Box } from 'lucide-react'
import type { ProxmoxNode, ProxmoxVM } from '@/types/proxmox'
import { formatBytes, formatUptime } from '@/lib/format'
import { cn } from '@/lib/utils'

interface NodeHealthGridProps {
  nodes: ProxmoxNode[] | undefined
  vms: ProxmoxVM[] | undefined
}

function getStatusColor(status: 'online' | 'offline'): string {
  return status === 'online'
    ? 'bg-success shadow-[0_0_6px] shadow-success/60'
    : 'bg-destructive'
}

function getStatusTextColor(status: 'online' | 'offline'): string {
  return status === 'online' ? 'text-success' : 'text-destructive'
}

function NodeCard({ node, vmCount }: { node: ProxmoxNode; vmCount: number }) {
  const cpuPercent = node.maxcpu > 0 ? node.cpu : 0
  const memPercent = node.maxmem > 0 ? node.mem / node.maxmem : 0
  const diskPercent = node.maxdisk > 0 ? node.disk / node.maxdisk : 0

  return (
    <Card className="dot-grid">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b border-dotted border-border/60">
        <div className="flex items-center gap-2.5">
          <span className={cn('h-2 w-2 rounded-full', getStatusColor(node.status))} />
          <span className="font-mono text-sm font-semibold tracking-tight text-foreground">
            {node.node}
          </span>
        </div>
        <DotMatrixText text={node.status === 'online' ? 'ONLINE' : 'OFFLINE'} size="xs" className={getStatusTextColor(node.status)} />
      </CardHeader>
      <CardContent className="space-y-3 pt-3">
        <div className="grid grid-cols-3 gap-2 font-mono text-xs tabular-nums text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Cpu className="h-3 w-3 shrink-0" />
            <span>{(cpuPercent * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MemoryStick className="h-3 w-3 shrink-0" />
            <span>{(memPercent * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-3 w-3 shrink-0" />
            <span>{(diskPercent * 100).toFixed(0)}%</span>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-dotted border-border/60 pt-2.5 font-mono text-xs tabular-nums text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            <span>{formatUptime(node.uptime)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Box className="h-3 w-3 shrink-0" />
            <span>{vmCount} VMs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <HardDrive className="h-3 w-3 shrink-0" />
            <span>{formatBytes(node.disk)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function NodeHealthGrid({ nodes, vms }: NodeHealthGridProps) {
  const vmCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    vms?.forEach((vm) => {
      counts[vm.node] = (counts[vm.node] ?? 0) + 1
    })
    return counts
  }, [vms])

  if (!nodes || nodes.length === 0) {
    return (
      <Card className="dot-grid">
        <CardHeader className="border-b border-dotted border-border/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
              <Server className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <DotMatrixText text="NODE HEALTH" size="xs" className="text-foreground" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="py-4 text-center text-sm text-muted-foreground">No nodes available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="dot-grid">
      <CardHeader className="border-b border-dotted border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
            <Server className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <DotMatrixText text="NODE HEALTH" size="xs" className="text-foreground" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {nodes.map((node) => (
            <NodeCard key={node.node} node={node} vmCount={vmCounts[node.node] ?? 0} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
