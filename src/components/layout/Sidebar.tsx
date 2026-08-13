import { useConnectionStore } from '@/stores/connectionStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Plus, Server, LayoutDashboard, HardDrive, Box, ListTodo, Shield, Settings, Hexagon } from 'lucide-react'
import { cn } from '@/lib/utils'

type ViewType = 'dashboard' | 'vms' | 'vm-detail' | 'nodes' | 'node-detail' | 'containers' | 'tasks' | 'backups' | 'storage' | 'storage-detail' | 'settings' | 'pbs-overview' | 'pbs-datastores' | 'pbs-datastore-detail'

type NavigationTarget =
  | { type: ViewType }
  | { type: 'node-detail'; nodeName: string }

interface SidebarProps {
  onAddConnection: () => void
  activeView?: ViewType
  onNavigate?: (view: NavigationTarget) => void
}

export function Sidebar({ onAddConnection, activeView, onNavigate }: SidebarProps) {
  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-success shadow-[0_0_6px] shadow-success/60'
      case 'connecting':
      case 'failover':
        return 'bg-warning'
      case 'failed':
        return 'bg-destructive'
      default:
        return 'bg-muted-foreground/60'
    }
  }

  return (
    <div className="flex w-64 flex-col border-r border-border bg-card">
      <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary/15 text-primary">
          <Hexagon className="h-4 w-4" />
        </div>
        <div className="min-w-0 leading-tight">
          <h1 className="truncate text-sm font-semibold tracking-tight text-foreground">
            Clustri
          </h1>
          <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
            Ops Console
          </p>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {connections.map((connection) => (
            <div key={connection.id}>
              <button
                onClick={() => setActiveConnection(connection.id)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition duration-150',
                  activeConnectionId === connection.id
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
                )}
              >
                <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', getStatusColor(connection.status))} />
                <span className="truncate font-medium">{connection.name}</span>
              </button>
              {activeConnectionId === connection.id && (
                <>
                  {connection.status === 'failover' && connection.currentEndpointUrl && (
                    <p className="ml-7 mt-1 truncate font-mono text-[10px] tabular-nums text-warning">
                      Failover: {connection.currentEndpointUrl}
                    </p>
                  )}
                  {(connection.status === 'failed' || connection.status === 'disconnected') && (
                    <p className="ml-7 mt-1 text-[10px] text-muted-foreground">Offline</p>
                  )}
                  <div className="ml-4 mt-1 space-y-0.5">
                    {connection.serverType === 'pbs' ? (
                      <>
                        <SidebarItem
                          icon={LayoutDashboard}
                          label="Overview"
                          active={activeView === 'pbs-overview'}
                          onClick={() => onNavigate?.({ type: 'pbs-overview' })}
                        />
                        <SidebarItem
                          icon={HardDrive}
                          label="Datastores"
                          active={activeView === 'pbs-datastores' || activeView === 'pbs-datastore-detail'}
                          onClick={() => onNavigate?.({ type: 'pbs-datastores' })}
                        />
                        <SidebarItem icon={ListTodo} label="Tasks" active={activeView === 'tasks'} onClick={() => onNavigate?.({ type: 'tasks' })} />
                      </>
                    ) : (
                      <>
                        <SidebarItem
                          icon={LayoutDashboard}
                          label="Dashboard"
                          active={activeView === 'dashboard'}
                          onClick={() => onNavigate?.({ type: 'dashboard' })}
                        />
                        <SidebarItem
                          icon={Server}
                          label="Nodes"
                          active={activeView === 'nodes'}
                          onClick={() => onNavigate?.({ type: 'nodes' })}
                        />
                        <SidebarItem
                          icon={Box}
                          label="VMs"
                          active={activeView === 'vms' || activeView === 'vm-detail'}
                          onClick={() => onNavigate?.({ type: 'vms' })}
                        />
                        <SidebarItem
                          icon={Box}
                          label="Containers"
                          active={activeView === 'containers'}
                          onClick={() => onNavigate?.({ type: 'containers' })}
                        />
                        <SidebarItem icon={HardDrive} label="Storage" active={activeView === 'storage' || activeView === 'storage-detail'} onClick={() => onNavigate?.({ type: 'storage' })} />
                        <SidebarItem icon={ListTodo} label="Tasks" active={activeView === 'tasks'} onClick={() => onNavigate?.({ type: 'tasks' })} />
                        <SidebarItem icon={Shield} label="Backups" active={activeView === 'backups'} onClick={() => onNavigate?.({ type: 'backups' })} />
                      </>
                    )}
                    {connection.serverType !== 'pbs' && connection.nodes && connection.nodes.length > 0 && (
                      <>
                        <p className="px-3 pb-1 pt-3 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                          Cluster nodes
                        </p>
                        {connection.nodes.map((node) => (
                          <button
                            key={node.url}
                            onClick={() => onNavigate?.({ type: 'node-detail', nodeName: node.name })}
                            className="flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium text-muted-foreground transition duration-150 hover:bg-accent/60 hover:text-foreground"
                          >
                            <span
                              className={cn(
                                'h-1.5 w-1.5 shrink-0 rounded-full',
                                node.status === 'online' ? 'bg-success' : 'bg-muted-foreground/40',
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate font-mono">{node.name}</span>
                            {node.isPrimary && (
                              <span className="shrink-0 rounded border border-primary/30 bg-primary/10 px-1 py-px text-[10px] uppercase text-primary">
                                primary
                              </span>
                            )}
                            {node.status === 'offline' && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">
                                offline
                              </span>
                            )}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="space-y-1 border-t border-border p-2">
        <SidebarItem
          icon={Settings}
          label="Settings"
          active={activeView === 'settings'}
          onClick={() => onNavigate?.({ type: 'settings' })}
        />
        <Button
          variant="outline"
          className="w-full justify-start gap-2"
          onClick={onAddConnection}
        >
          <Plus className="h-4 w-4" />
          Add Connection
        </Button>
      </div>
    </div>
  )
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  disabled,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  active?: boolean
  disabled?: boolean
  onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition duration-150',
        disabled
          ? 'pointer-events-none cursor-not-allowed opacity-50'
          : active
            ? 'bg-primary/10 text-primary hover:bg-primary/15'
            : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'
      )}
    >
      {active && (
        <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      <span>{label}</span>
    </button>
  )
}
