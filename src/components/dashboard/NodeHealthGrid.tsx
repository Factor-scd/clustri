import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Cpu, MemoryStick, HardDrive, Clock, Server, Box } from 'lucide-react'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import type { ProxmoxNode, ProxmoxVM } from '@/types/proxmox'
import { formatBytes, formatUptime } from '@/lib/format'

interface NodeHealthGridProps {
  nodes: ProxmoxNode[] | undefined
  vms: ProxmoxVM[] | undefined
}

function getStatusColor(status: 'online' | 'offline'): string {
  return status === 'online' ? 'bg-green-500' : 'bg-red-500'
}

function getStatusLabel(status: 'online' | 'offline'): string {
  return status === 'online' ? 'Online' : 'Offline'
}

/** Generate deterministic mock sparkline data from node stats */
function generateSparklineData(baseValue: number, points: number = 12): { value: number }[] {
  const data: { value: number }[] = []
  for (let i = 0; i < points; i++) {
    // Deterministic pseudo-random variation around the base value
    const seed = Math.sin(i * 2.1 + baseValue * 0.01) * 0.3
    const variation = baseValue * seed
    data.push({ value: Math.max(0, Math.min(1, baseValue + variation)) })
  }
  return data
}

function NodeCard({ node, vmCount }: { node: ProxmoxNode; vmCount: number }) {
  const cpuPercent = node.maxcpu > 0 ? node.cpu : 0
  const memPercent = node.maxmem > 0 ? node.mem / node.maxmem : 0
  const diskPercent = node.maxdisk > 0 ? node.disk / node.maxdisk : 0

  const cpuData = useMemo(() => generateSparklineData(cpuPercent), [cpuPercent])
  const memData = useMemo(() => generateSparklineData(memPercent), [memPercent])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${getStatusColor(node.status)}`} />
          <CardTitle className="text-sm font-medium">{node.node}</CardTitle>
        </div>
        <span className="text-xs text-muted-foreground">{getStatusLabel(node.status)}</span>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Sparklines */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="flex items-center gap-1 mb-1">
              <Cpu className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">CPU</span>
            </div>
            <div className="h-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={cpuData}>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--color-primary))"
                    fill="hsl(var(--color-primary))"
                    fillOpacity={0.2}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1 mb-1">
              <MemoryStick className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">RAM</span>
            </div>
            <div className="h-8">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={memData}>
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(var(--color-primary))"
                    fill="hsl(var(--color-primary))"
                    fillOpacity={0.2}
                    strokeWidth={1.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Cpu className="h-3 w-3" />
            <span>{(cpuPercent * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <MemoryStick className="h-3 w-3" />
            <span>{(memPercent * 100).toFixed(0)}%</span>
          </div>
          <div className="flex items-center gap-1">
            <HardDrive className="h-3 w-3" />
            <span>{(diskPercent * 100).toFixed(0)}%</span>
          </div>
        </div>

        {/* Bottom info */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>{formatUptime(node.uptime)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Box className="h-3 w-3" />
            <span>{vmCount} VMs</span>
          </div>
          <div className="flex items-center gap-1">
            <HardDrive className="h-3 w-3" />
            <span>{formatBytes(node.disk)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function NodeHealthGrid({ nodes, vms }: NodeHealthGridProps) {
  // Count VMs per node
  const vmCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    vms?.forEach((vm) => {
      counts[vm.node] = (counts[vm.node] ?? 0) + 1
    })
    return counts
  }, [vms])

  if (!nodes || nodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Node Health</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-4">No nodes available</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Server className="h-4 w-4 text-muted-foreground" />
          <CardTitle>Node Health</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {nodes.map((node) => (
            <NodeCard key={node.node} node={node} vmCount={vmCounts[node.node] ?? 0} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
