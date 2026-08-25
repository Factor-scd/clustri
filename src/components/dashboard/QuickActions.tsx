import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DotMatrixText } from '@/components/ui/dot-matrix'
import { Button } from '@/components/ui/button'
import { RefreshCw, Server, Box, HardDrive, ListTodo, Shield, Zap } from 'lucide-react'

interface QuickActionsProps {
  onRefresh: () => void
  isRefreshing: boolean
  onNavigate?: (view: string) => void
}

export function QuickActions({ onRefresh, isRefreshing, onNavigate }: QuickActionsProps) {
  return (
    <Card className="dot-grid">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-dotted border-border/60">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
            <Zap className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <DotMatrixText text="QUICK ACTIONS" size="xs" className="text-foreground" />
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 border-dotted px-2 py-3"
            onClick={onRefresh}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            <DotMatrixText text="REFRESH" size="xs" className="text-muted-foreground" />
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 border-dotted px-2 py-3"
            onClick={() => onNavigate?.('nodes')}
          >
            <Server className="h-4 w-4" />
            <DotMatrixText text="NODES" size="xs" className="text-muted-foreground" />
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 border-dotted px-2 py-3"
            onClick={() => onNavigate?.('vms')}
          >
            <Box className="h-4 w-4" />
            <DotMatrixText text="VMS" size="xs" className="text-muted-foreground" />
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 border-dotted px-2 py-3"
            onClick={() => onNavigate?.('storage')}
          >
            <HardDrive className="h-4 w-4" />
            <DotMatrixText text="STORAGE" size="xs" className="text-muted-foreground" />
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 border-dotted px-2 py-3"
            onClick={() => onNavigate?.('tasks')}
          >
            <ListTodo className="h-4 w-4" />
            <DotMatrixText text="TASKS" size="xs" className="text-muted-foreground" />
          </Button>
          <Button
            variant="outline"
            className="flex h-auto flex-col items-center gap-1.5 border-dotted px-2 py-3"
            onClick={() => onNavigate?.('backups')}
          >
            <Shield className="h-4 w-4" />
            <DotMatrixText text="BACKUPS" size="xs" className="text-muted-foreground" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
