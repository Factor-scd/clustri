import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { RefreshCw, Server, Box, HardDrive, ListTodo, Shield } from 'lucide-react'

interface QuickActionsProps {
  onRefresh: () => void
  isRefreshing: boolean
  onNavigate?: (view: string) => void
}

export function QuickActions({ onRefresh, isRefreshing, onNavigate }: QuickActionsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="flex flex-col items-center gap-1.5 h-auto py-3"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="text-xs">Refresh</span>
          </Button>
          <Button
            variant="outline"
            className="flex flex-col items-center gap-1.5 h-auto py-3"
            onClick={() => onNavigate?.('dashboard')}
          >
            <Server className="h-4 w-4" />
            <span className="text-xs">Nodes</span>
          </Button>
          <Button
            variant="outline"
            className="flex flex-col items-center gap-1.5 h-auto py-3"
            onClick={() => onNavigate?.('vms')}
          >
            <Box className="h-4 w-4" />
            <span className="text-xs">VMs</span>
          </Button>
          <Button
            variant="outline"
            className="flex flex-col items-center gap-1.5 h-auto py-3"
            onClick={() => onNavigate?.('storage')}
          >
            <HardDrive className="h-4 w-4" />
            <span className="text-xs">Storage</span>
          </Button>
          <Button
            variant="outline"
            className="flex flex-col items-center gap-1.5 h-auto py-3"
            onClick={() => onNavigate?.('tasks')}
          >
            <ListTodo className="h-4 w-4" />
            <span className="text-xs">Tasks</span>
          </Button>
          <Button
            variant="outline"
            className="flex flex-col items-center gap-1.5 h-auto py-3"
            onClick={() => onNavigate?.('backups')}
          >
            <Shield className="h-4 w-4" />
            <span className="text-xs">Backups</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
