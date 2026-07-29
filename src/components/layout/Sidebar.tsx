import { useConnectionStore } from '@/stores/connectionStore'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { Plus, Server, LayoutDashboard, HardDrive, Box, ListTodo, Shield, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'

type ViewType = 'dashboard' | 'vms' | 'vm-detail' | 'tasks' | 'backups' | 'storage' | 'storage-detail' | 'settings'

interface SidebarProps {
  onAddConnection: () => void
  activeView?: ViewType
  onNavigate?: (view: { type: ViewType }) => void
}

export function Sidebar({ onAddConnection, activeView, onNavigate }: SidebarProps) {
  const connections = useConnectionStore((s) => s.connections)
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'connected':
        return 'bg-green-500'
      case 'connecting':
      case 'failover':
        return 'bg-yellow-500'
      case 'failed':
        return 'bg-red-500'
      default:
        return 'bg-gray-500'
    }
  }

  return (
    <div className="w-64 border-r bg-card flex flex-col">
      <div className="p-4 border-b">
        <h1 className="text-lg font-semibold">ProxmoxDesktop</h1>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {connections.map((connection) => (
            <div key={connection.id}>
              <button
                onClick={() => setActiveConnection(connection.id)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors',
                  activeConnectionId === connection.id
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                )}
              >
                <div className={cn('w-2 h-2 rounded-full', getStatusColor(connection.status))} />
                <span className="font-medium truncate">{connection.name}</span>
              </button>
              {activeConnectionId === connection.id && (
                <div className="ml-4 mt-1 space-y-0.5">
                  <SidebarItem
                    icon={LayoutDashboard}
                    label="Dashboard"
                    active={activeView === 'dashboard'}
                    onClick={() => onNavigate?.({ type: 'dashboard' })}
                  />
                  <SidebarItem icon={Server} label="Nodes" disabled />
                  <SidebarItem
                    icon={Box}
                    label="VMs"
                    active={activeView === 'vms' || activeView === 'vm-detail'}
                    onClick={() => onNavigate?.({ type: 'vms' })}
                  />
                  <SidebarItem icon={Box} label="Containers" disabled />
                  <SidebarItem icon={HardDrive} label="Storage" active={activeView === 'storage' || activeView === 'storage-detail'} onClick={() => onNavigate?.({ type: 'storage' })} />
                  <SidebarItem icon={ListTodo} label="Tasks" active={activeView === 'tasks'} onClick={() => onNavigate?.({ type: 'tasks' })} />
                  <SidebarItem icon={Shield} label="Backups" active={activeView === 'backups'} onClick={() => onNavigate?.({ type: 'backups' })} />
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
      <div className="p-2 border-t space-y-1">
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
        'w-full flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors',
        disabled
          ? 'opacity-50 cursor-not-allowed pointer-events-none'
          : active
            ? 'bg-accent text-accent-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-accent-foreground'
      )}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  )
}
