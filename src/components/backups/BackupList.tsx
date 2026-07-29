import { useState, useMemo } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Shield,
  Plus,
  Play,
  Edit,
  Trash,
  RotateCcw,
  Clock,
  HardDrive,
  CheckCircle,
  XCircle,
} from 'lucide-react'
import {
  useBackupJobs,
  useBackups,
  useDeleteBackupJob,
  useRunBackup,
  useDeleteBackup,
  useStorage,
} from '@/hooks/useProxmox'
import { CreateBackupJobDialog } from './dialogs/CreateBackupJobDialog'
import { EditBackupJobDialog } from './dialogs/EditBackupJobDialog'
import { RestoreBackupDialog } from './dialogs/RestoreBackupDialog'
import type { ProxmoxBackupJob, ProxmoxBackup } from '@/types/proxmox'
import { formatBytes } from '@/lib/format'

interface BackupListProps {
  connectionId: string
}

function formatTimestamp(seconds: number): string {
  if (seconds === 0) return 'N/A'
  const date = new Date(seconds * 1000)
  return date.toLocaleString()
}

export function BackupList({ connectionId }: BackupListProps) {
  const { data: backupJobs, isLoading: jobsLoading, error: jobsError } = useBackupJobs(connectionId)
  const { data: backups, isLoading: backupsLoading, error: backupsError } = useBackups(connectionId)
  const { data: storage } = useStorage(connectionId)

  const deleteBackupJob = useDeleteBackupJob()
  const runBackup = useRunBackup()
  const deleteBackup = useDeleteBackup()

  const [storageFilter, setStorageFilter] = useState<string>('all')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [editDialog, setEditDialog] = useState<ProxmoxBackupJob | null>(null)
  const [restoreDialog, setRestoreDialog] = useState<ProxmoxBackup | null>(null)
  const [confirmDeleteJob, setConfirmDeleteJob] = useState<string | null>(null)
  const [confirmDeleteBackup, setConfirmDeleteBackup] = useState<string | null>(null)

  const storageOptions = useMemo(() => {
    if (!storage) return []
    return [...new Set(storage.map((s) => s.storage))].sort()
  }, [storage])

  const nodeOptions = useMemo(() => {
    if (!storage) return []
    return [...new Set(storage.map((s) => s.node))].sort()
  }, [storage])

  const filteredBackups = useMemo(() => {
    if (!backups) return []
    if (storageFilter === 'all') return backups
    return backups.filter((b) => b.storage === storageFilter)
  }, [backups, storageFilter])

  if (jobsLoading || backupsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading backups...</p>
      </div>
    )
  }

  if (jobsError || backupsError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load backup data</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6" />
            <h2 className="text-2xl font-semibold">Backups</h2>
          </div>
          <p className="text-muted-foreground">
            Manage backup jobs and existing backups
          </p>
        </div>

        {/* Storage Filter */}
        <div className="flex flex-wrap gap-3">
          <select
            value={storageFilter}
            onChange={(e) => setStorageFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">All Storage</option>
            {storageOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Backup Jobs Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Backup Jobs</h3>
            <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              Create Job
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              {!backupJobs || backupJobs.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Shield className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p>No backup jobs configured</p>
                  <p className="text-sm mt-1">Create a backup job to get started</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">ID</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Schedule</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Storage</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Mode</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Status</th>
                        <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {backupJobs.map((job) => (
                        <tr
                          key={job.id}
                          className="border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono text-muted-foreground">{job.id}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                              {job.schedule}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                              {job.store}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {job.mode ?? 'snapshot'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {job.enabled === 1 ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">
                                <CheckCircle className="h-3 w-3" />
                                Enabled
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">
                                <XCircle className="h-3 w-3" />
                                Disabled
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Run now"
                                onClick={() =>
                                  runBackup.mutate({
                                    config: {
                                      id: job.id,
                                      storage: job.store,
                                      schedule: job.schedule,
                                      mode: (job.mode as 'snapshot' | 'stop' | 'suspend') || 'snapshot',
                                      compression: (job.compress as 'zstd' | 'lz4' | 'gzip' | 'none') || 'zstd',
                                      all: job.all === 1,
                                      vmid: job.vmid,
                                      enabled: job.enabled === 1,
                                      node: job.node,
                                    },
                                  })
                                }
                              >
                                <Play className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Edit"
                                onClick={() => setEditDialog(job)}
                              >
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                              {confirmDeleteJob === job.id ? (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      deleteBackupJob.mutate({ id: job.id })
                                      setConfirmDeleteJob(null)
                                    }}
                                  >
                                    Confirm
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setConfirmDeleteJob(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  title="Delete"
                                  onClick={() => setConfirmDeleteJob(job.id)}
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Existing Backups Section */}
        <div className="space-y-4">
          <h3 className="text-lg font-medium">Existing Backups</h3>

          <Card>
            <CardContent className="p-0">
              {!filteredBackups || filteredBackups.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <HardDrive className="h-8 w-8 mx-auto text-muted-foreground/50" />
                  <p>No backups found</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">VMID</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Type</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Date</th>
                        <th className="h-10 px-4 text-right font-medium text-muted-foreground">Size</th>
                        <th className="h-10 px-4 text-left font-medium text-muted-foreground">Storage</th>
                        <th className="h-10 px-4 text-right font-medium text-muted-foreground">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBackups.map((backup) => (
                        <tr
                          key={backup.volid}
                          className="border-b last:border-b-0 hover:bg-muted/50 transition-colors"
                        >
                          <td className="px-4 py-3 font-mono text-muted-foreground">
                            {backup['backup-id']}
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              {backup['backup-type']}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatTimestamp(backup['backup-time'])}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {formatBytes(backup.size)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <HardDrive className="h-3.5 w-3.5 text-muted-foreground" />
                              {backup.storage}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Restore"
                                onClick={() => setRestoreDialog(backup)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </Button>
                              {confirmDeleteBackup === backup.volid ? (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => {
                                      deleteBackup.mutate({ volid: backup.volid })
                                      setConfirmDeleteBackup(null)
                                    }}
                                  >
                                    Confirm
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs"
                                    onClick={() => setConfirmDeleteBackup(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  title="Delete"
                                  onClick={() => setConfirmDeleteBackup(backup.volid)}
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Dialogs */}
      <CreateBackupJobDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        storageOptions={storageOptions}
      />

      {editDialog && (
        <EditBackupJobDialog
          open={!!editDialog}
          onOpenChange={(open) => {
            if (!open) setEditDialog(null)
          }}
          job={editDialog}
          storageOptions={storageOptions}
        />
      )}

      {restoreDialog && (
        <RestoreBackupDialog
          open={!!restoreDialog}
          onOpenChange={(open) => {
            if (!open) setRestoreDialog(null)
          }}
          backup={restoreDialog}
          nodeOptions={nodeOptions}
          storageOptions={storageOptions}
        />
      )}
    </div>
  )
}
