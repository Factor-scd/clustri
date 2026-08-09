import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Cpu, MemoryStick, HardDrive, Clock, Server, Globe, Tag } from 'lucide-react'
import type { ProxmoxVM } from '@/types/proxmox'
import { formatBytes, formatUptime, formatNetworkRate } from '@/lib/format'

interface OverviewTabProps {
  vm: ProxmoxVM
  connectionId: string
}

function ResourceBar({ label, used, total, icon: Icon }: {
  label: string
  used: number
  total: number
  icon: React.ComponentType<{ className?: string }>
}) {
  const percent = total > 0 ? (used / total) * 100 : 0
  const displayUsed = label === 'CPU' ? used.toFixed(1) : formatBytes(used)
  const displayTotal = label === 'CPU' ? `${total} cores` : formatBytes(total)

  const barColor =
    percent > 90 ? 'bg-destructive' :
    percent > 70 ? 'bg-warning' :
    'bg-success'

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Icon className="h-4 w-4 text-muted-foreground" />
          {label}
        </div>
        <span className="font-mono text-sm tabular-nums text-muted-foreground">
          {displayUsed} / {displayTotal}
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>
      <p className="text-right font-mono text-xs tabular-nums text-muted-foreground">
        {percent.toFixed(1)}%
      </p>
    </div>
  )
}

export function OverviewTab({ vm }: OverviewTabProps) {
  return (
    <div className="space-y-6">
      {/* Resource Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resource Usage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <ResourceBar
            label="CPU"
            used={vm.cpu * vm.cpus}
            total={vm.cpus}
            icon={Cpu}
          />
          <ResourceBar
            label="Memory"
            used={vm.mem}
            total={vm.maxmem}
            icon={MemoryStick}
          />
          <ResourceBar
            label="Disk"
            used={vm.disk}
            total={vm.maxdisk}
            icon={HardDrive}
          />
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">VMID</CardTitle>
            <Tag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
              {vm.vmid}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Type</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-semibold leading-none tracking-tight uppercase">
              {vm.type}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
              {formatUptime(vm.uptime)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Node</CardTitle>
            <Server className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-semibold leading-none tracking-tight">
              {vm.node}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">IP Address</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="font-mono text-2xl font-semibold leading-none tracking-tight tabular-nums">
              192.168.1.{100 + (vm.vmid % 100)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">Mock data</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Network I/O</CardTitle>
            <Globe className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">In:</span>
                <span className="font-mono tabular-nums">{formatNetworkRate(vm.netin)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Out:</span>
                <span className="font-mono tabular-nums">{formatNetworkRate(vm.netout)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
