import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, Server, Box, HardDrive, ListTodo, Shield, Zap } from 'lucide-react'

interface QuickActionsProps {
  onRefresh: () => void
  isRefreshing: boolean
  onNavigate?: (view: string) => void
}

export function QuickActions({ onRefresh, isRefreshing, onNavigate }: QuickActionsProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 px-2 py-3"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="text-xs font-medium">Refresh</span>
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 px-2 py-3"
            onClick={() => onNavigate?.('dashboard')}
          >
            <Server className="h-4 w-4" />
            <span className="text-xs font-medium">Nodes</span>
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 px-2 py-3"
            onClick={() => onNavigate?.('vms')}
          >
            <Box className="h-4 w-4" />
            <span className="text-xs font-medium">VMs</span>
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 px-2 py-3"
            onClick={() => onNavigate?.('storage')}
          >
            <HardDrive className="h-4 w-4" />
            <span className="text-xs font-medium">Storage</span>
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 px-2 py-3"
            onClick={() => onNavigate?.('tasks')}
          >
            <ListTodo className="h-4 w-4" />
            <span className="text-xs font-medium">Tasks</span>
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 px-2 py-3"
            onClick={() => onNavigate?.('backups')}
          >
            <Shield className="h-4 w-4" />
            <span className="text-xs font-medium">Backups</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
