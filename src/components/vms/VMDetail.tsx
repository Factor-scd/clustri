import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { StatusBadge } from '@/components/ui/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Play,
  Square,
  Power,
  RotateCw,
  Pause,
  PlayCircle,
  ArrowRightLeft,
} from 'lucide-react'
import { useStartVM, useStopVM, useShutdownVM, useRebootVM, useSuspendVM, useResumeVM, useClusterStatus } from '@/hooks/useProxmox'
import { OverviewTab } from '@/components/vms/tabs/OverviewTab'
import { HardwareTab } from '@/components/vms/tabs/HardwareTab'
import { DisksTab } from '@/components/vms/tabs/DisksTab'
import { NetworkTab } from '@/components/vms/tabs/NetworkTab'
import { SnapshotsTab } from '@/components/vms/tabs/SnapshotsTab'
import { ConsoleTab } from '@/components/vms/tabs/ConsoleTab'
import { MigrateDialog } from '@/components/vms/dialogs/MigrateDialog'
import type { ProxmoxVM } from '@/types/proxmox'

interface VMDetailProps {
  vm: ProxmoxVM
  connectionId: string
  onBack: () => void
}

type ConfirmAction = {
  type: 'stop' | 'shutdown' | 'reboot'
  title: string
  description: string
}

export function VMDetail({ vm, connectionId, onBack }: VMDetailProps) {
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)
  const [migrateDialogOpen, setMigrateDialogOpen] = useState(false)

  const startVM = useStartVM()
  const stopVM = useStopVM()
  const shutdownVM = useShutdownVM()
  const rebootVM = useRebootVM()
  const suspendVM = useSuspendVM()
  const resumeVM = useResumeVM()
  const clusterStatus = useClusterStatus(connectionId)

  const isRunning = vm.status === 'running'
  const isStopped = vm.status === 'stopped'
  const isBusy = startVM.isPending || stopVM.isPending || shutdownVM.isPending || rebootVM.isPending || suspendVM.isPending || resumeVM.isPending

  const isCluster = clusterStatus.data?.type === 'cluster' && (clusterStatus.data?.nodes?.length ?? 0) > 1

  const handleStart = () => {
    startVM.mutate({ node: vm.node, vmid: vm.vmid })
  }

  const handleStop = () => {
    setConfirmAction({
      type: 'stop',
      title: 'Force Stop VM',
      description: `Are you sure you want to force stop "${vm.name}"? This is equivalent to pulling the power plug and may cause data loss.`,
    })
  }

  const handleShutdown = () => {
    setConfirmAction({
      type: 'shutdown',
      title: 'Shutdown VM',
      description: `Are you sure you want to gracefully shutdown "${vm.name}"? The VM will have a chance to save its state.`,
    })
  }

  const handleReboot = () => {
    setConfirmAction({
      type: 'reboot',
      title: 'Reboot VM',
      description: `Are you sure you want to reboot "${vm.name}"? The VM will be restarted gracefully.`,
    })
  }

  const handleSuspend = () => {
    suspendVM.mutate({ node: vm.node, vmid: vm.vmid })
  }

  const handleResume = () => {
    resumeVM.mutate({ node: vm.node, vmid: vm.vmid })
  }

  const executeConfirmAction = () => {
    if (!confirmAction) return

    switch (confirmAction.type) {
      case 'stop':
        stopVM.mutate({ node: vm.node, vmid: vm.vmid })
        break
      case 'shutdown':
        shutdownVM.mutate({ node: vm.node, vmid: vm.vmid })
        break
      case 'reboot':
        rebootVM.mutate({ node: vm.node, vmid: vm.vmid })
        break
    }

    setConfirmAction(null)
  }

  return (
    <div className="h-full overflow-auto">
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-semibold">{vm.name}</h2>
                <StatusBadge status={vm.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                VMID {vm.vmid} &middot; {vm.type.toUpperCase()} &middot; {vm.node}
              </p>
            </div>
          </div>

          {/* Lifecycle Actions */}
          <div className="flex flex-wrap gap-2">
            {isStopped || !isRunning ? (
              <Button
                size="sm"
                onClick={handleStart}
                disabled={isBusy}
              >
                <Play className="h-4 w-4 mr-1" />
                Start
              </Button>
            ) : null}

            {isRunning && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShutdown}
                  disabled={isBusy}
                >
                  <Power className="h-4 w-4 mr-1" />
                  Shutdown
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStop}
                  disabled={isBusy}
                >
                  <Square className="h-4 w-4 mr-1" />
                  Stop
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReboot}
                  disabled={isBusy}
                >
                  <RotateCw className="h-4 w-4 mr-1" />
                  Reboot
                </Button>
              </>
            )}

            {isRunning && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleSuspend}
                disabled={isBusy}
              >
                <Pause className="h-4 w-4 mr-1" />
                Suspend
              </Button>
            )}

            {vm.status === 'paused' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResume}
                disabled={isBusy}
              >
                <PlayCircle className="h-4 w-4 mr-1" />
                Resume
              </Button>
            )}

            {isCluster && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setMigrateDialogOpen(true)}
                disabled={isBusy}
              >
                <ArrowRightLeft className="h-4 w-4 mr-1" />
                Migrate
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="console">Console</TabsTrigger>
            <TabsTrigger value="hardware">Hardware</TabsTrigger>
            <TabsTrigger value="disks">Disks</TabsTrigger>
            <TabsTrigger value="network">Network</TabsTrigger>
            <TabsTrigger value="snapshots">Snapshots</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab vm={vm} connectionId={connectionId} />
          </TabsContent>

          <TabsContent value="console">
            <ConsoleTab vm={vm} connectionId={connectionId} />
          </TabsContent>

          <TabsContent value="hardware">
            <HardwareTab vm={vm} connectionId={connectionId} />
          </TabsContent>

          <TabsContent value="disks">
            <DisksTab vm={vm} connectionId={connectionId} />
          </TabsContent>

          <TabsContent value="network">
            <NetworkTab vm={vm} connectionId={connectionId} />
          </TabsContent>

          <TabsContent value="snapshots">
            <SnapshotsTab vm={vm} connectionId={connectionId} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={!!confirmAction} onOpenChange={() => setConfirmAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
            <DialogDescription>{confirmAction?.description}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={executeConfirmAction}
              disabled={isBusy}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Migrate Dialog */}
      <MigrateDialog
        vm={vm}
        connectionId={connectionId}
        open={migrateDialogOpen}
        onOpenChange={setMigrateDialogOpen}
      />
    </div>
  )
}
