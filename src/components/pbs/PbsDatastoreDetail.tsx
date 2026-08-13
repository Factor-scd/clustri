import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import {
  ArrowLeft,
  CheckCircle,
  Clock,
  Download,
  Eraser,
  HardDrive,
  Recycle,
  RefreshCw,
  ShieldCheck,
  Trash,
  XCircle,
} from 'lucide-react'
import {
  usePbsDatastores,
  usePbsGroups,
  usePbsSnapshots,
  usePbsVerifyJobs,
  usePbsPruneJobs,
  usePbsGcJobs,
  usePbsDeleteSnapshot,
  usePbsDeleteGroup,
  queryKeys,
} from '@/hooks/usePbs'
import { VerifyDialog } from '@/components/pbs/dialogs/VerifyDialog'
import { PruneDialog } from '@/components/pbs/dialogs/PruneDialog'
import { GcDialog } from '@/components/pbs/dialogs/GcDialog'
import { DownloadFilesDialog } from '@/components/pbs/dialogs/DownloadFilesDialog'
import { formatBytes } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'
import type { PbsBackupGroup, PbsJob, PbsSnapshot } from '@/types/pbs'

interface PbsDatastoreDetailProps {
  connectionId: string
  store: string
  onBack: () => void
}

function formatTimestamp(seconds?: number): string {
  if (!seconds) return 'N/A'
  return new Date(seconds * 1000).toLocaleString()
}

function getUsageColor(percent: number): string {
  if (percent >= 90) return 'bg-destructive'
  if (percent >= 70) return 'bg-warning'
  return 'bg-success'
}

function LastRunStateBadge({ state }: { state?: string }) {
  if (!state) {
    return <span className="text-xs text-muted-foreground">—</span>
  }
  const ok = state.toUpperCase() === 'OK'
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium',
        ok
          ? 'border-success/25 bg-success/10 text-success'
          : 'border-destructive/25 bg-destructive/10 text-destructive',
      )}
    >
      {ok ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
      {state}
    </span>
  )
}

function JobTable({
  title,
  icon: Icon,
  jobs,
  showKeep,
}: {
  title: string
  icon: LucideIcon
  jobs?: PbsJob[]
  showKeep?: boolean
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
      <Card>
        <CardContent className="p-0">
          {!jobs || jobs.length === 0 ? (
            <EmptyState icon={Icon} title={`No ${title.toLowerCase()} configured`} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">ID</th>
                    <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Store</th>
                    <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Schedule</th>
                    <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Last Run</th>
                    <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Next Run</th>
                    {showKeep && (
                      <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Retention</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className="border-b last:border-b-0 hover:bg-accent/50 transition-colors duration-150">
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{job.id}</td>
                      <td className="px-4 py-3 font-mono text-xs">{job.store ?? '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 font-mono text-xs">
                          <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                          {job.schedule ?? '—'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <LastRunStateBadge state={job.lastRunState} />
                      </td>
                      <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                        {formatTimestamp(job.nextRun)}
                      </td>
                      {showKeep && (
                        <td className="px-4 py-3 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {[
                            job.keepLast != null && `last ${job.keepLast}`,
                            job.keepDaily != null && `daily ${job.keepDaily}`,
                            job.keepWeekly != null && `weekly ${job.keepWeekly}`,
                            job.keepMonthly != null && `monthly ${job.keepMonthly}`,
                            job.keepYearly != null && `yearly ${job.keepYearly}`,
                          ]
                            .filter((part): part is string => !!part)
                            .join(' · ') || '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export function PbsDatastoreDetail({ connectionId, store, onBack }: PbsDatastoreDetailProps) {
  const queryClient = useQueryClient()
  const [selectedGroup, setSelectedGroup] = useState<PbsBackupGroup | null>(null)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [pruneOpen, setPruneOpen] = useState(false)
  const [gcOpen, setGcOpen] = useState(false)
  const [downloadSnapshot, setDownloadSnapshot] = useState<PbsSnapshot | null>(null)
  const [confirmDeleteSnapshot, setConfirmDeleteSnapshot] = useState<PbsSnapshot | null>(null)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false)

  const { data: datastores } = usePbsDatastores(connectionId)
  const datastore = datastores?.find((d) => d.store === store)

  const { data: groups, isLoading: groupsLoading, error: groupsError } = usePbsGroups(connectionId, store)
  const {
    data: snapshots,
    isLoading: snapshotsLoading,
  } = usePbsSnapshots(
    connectionId,
    store,
    selectedGroup?.backupId ?? null,
    selectedGroup?.backupType ?? null,
  )
  const { data: verifyJobs } = usePbsVerifyJobs(connectionId)
  const { data: pruneJobs } = usePbsPruneJobs(connectionId)
  const { data: gcJobs } = usePbsGcJobs(connectionId)

  const deleteSnapshot = usePbsDeleteSnapshot()
  const deleteGroup = usePbsDeleteGroup()

  const handleRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.pbsDatastores(connectionId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.pbsGroups(connectionId, store) })
    if (selectedGroup) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.pbsSnapshots(
          connectionId,
          store,
          selectedGroup.backupId,
          selectedGroup.backupType,
        ),
      })
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.pbsVerifyJobs(connectionId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.pbsPruneJobs(connectionId) })
    queryClient.invalidateQueries({ queryKey: queryKeys.pbsGcJobs(connectionId) })
  }, [queryClient, connectionId, store, selectedGroup])

  if (groupsLoading) {
    return (
      <div className="h-full overflow-auto p-6">
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-9" />
            <div className="space-y-2">
              <Skeleton className="h-7 w-48" />
              <Skeleton className="h-4 w-64" />
            </div>
          </div>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-56 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  if (groupsError) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load backup groups</p>
      </div>
    )
  }

  const percent = datastore?.total && datastore.total > 0
    ? ((datastore.used ?? 0) / datastore.total) * 100
    : 0
  const usageColor = getUsageColor(percent)
  const hasError = !!datastore?.error

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <HardDrive className="h-6 w-6 shrink-0 text-muted-foreground" />
              <h2 className="font-mono text-2xl font-semibold tracking-tight">{store}</h2>
              {hasError && (
                <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                  <XCircle className="h-3 w-3" />
                  Error
                </span>
              )}
              {datastore?.maintenance && (
                <span className="inline-flex items-center gap-1 rounded-sm border border-warning/25 bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  Maintenance
                </span>
              )}
            </div>
            <p className="text-sm text-muted-foreground">Datastore overview</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Datastore usage + actions */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Usage</CardTitle>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={hasError} onClick={() => setVerifyOpen(true)}>
                <ShieldCheck className="h-3.5 w-3.5" />
                Verify
              </Button>
              <Button size="sm" variant="outline" disabled={hasError} onClick={() => setPruneOpen(true)}>
                <Eraser className="h-3.5 w-3.5" />
                Prune
              </Button>
              <Button size="sm" variant="outline" disabled={hasError} onClick={() => setGcOpen(true)}>
                <Recycle className="h-3.5 w-3.5" />
                Garbage Collection
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {hasError && (
              <p className="text-sm text-destructive">{datastore.error}</p>
            )}
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Disk Usage</span>
                <span className="font-mono font-medium tabular-nums">{percent.toFixed(1)}%</span>
              </div>
              <div className="h-3 bg-muted rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${usageColor}`}
                  style={{ width: `${Math.min(percent, 100)}%` }}
                />
              </div>
              <div className="flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
                <span>{formatBytes(datastore?.used ?? 0)} used</span>
                <span>{formatBytes(datastore?.total ?? 0)} total</span>
              </div>
            </div>
            <div className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatBytes(datastore?.avail ?? 0)} available
            </div>
          </CardContent>
        </Card>

        {/* Groups / Snapshots drill-down */}
        {selectedGroup ? (
          <>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setSelectedGroup(null)}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold tracking-tight">
                  <span className="text-xs uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {selectedGroup.backupType}
                  </span>{' '}
                  <span className="font-mono">{selectedGroup.backupId}</span>
                </h3>
                {selectedGroup.comment && (
                  <p className="text-sm text-muted-foreground">{selectedGroup.comment}</p>
                )}
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDeleteGroup(true)}
                disabled={deleteGroup.isPending}
              >
                <Trash className="h-3.5 w-3.5" />
                Delete Group
              </Button>
            </div>

            <Card>
              <CardContent className="p-0">
                {snapshotsLoading ? (
                  <div className="space-y-3 p-5">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : !snapshots || snapshots.length === 0 ? (
                  <EmptyState icon={HardDrive} title="No snapshots in this group" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Backup Time</th>
                          <th className="h-10 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Size</th>
                          <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Protected</th>
                          <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Verification</th>
                          <th className="h-10 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {snapshots.map((snapshot) => (
                          <tr
                            key={snapshot.backupTime}
                            className="border-b last:border-b-0 hover:bg-accent/50 transition-colors duration-150"
                          >
                            <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                              {formatTimestamp(snapshot.backupTime)}
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-xs tabular-nums">
                              {formatBytes(snapshot.size ?? 0)}
                            </td>
                            <td className="px-4 py-3">
                              {snapshot.protected ? (
                                <span className="inline-flex items-center gap-1 rounded-sm border border-primary/30 bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                                  Protected
                                </span>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {snapshot.verification?.state ? (
                                snapshot.verification.state === 'ok' ? (
                                  <span className="inline-flex items-center gap-1 rounded-sm border border-success/25 bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                                    <CheckCircle className="h-3 w-3" />
                                    Verified
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 rounded-sm border border-destructive/25 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                                    <XCircle className="h-3 w-3" />
                                    Failed
                                  </span>
                                )
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  title="Download files"
                                  onClick={() => setDownloadSnapshot(snapshot)}
                                >
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive"
                                  title="Delete snapshot"
                                  disabled={snapshot.protected}
                                  onClick={() => setConfirmDeleteSnapshot(snapshot)}
                                >
                                  <Trash className="h-3.5 w-3.5" />
                                </Button>
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
          </>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold tracking-tight">Backup Groups</h3>
              <span className="text-sm text-muted-foreground">{groups?.length ?? 0} groups</span>
            </div>
            <Card>
              <CardContent className="p-0">
                {!groups || groups.length === 0 ? (
                  <EmptyState icon={HardDrive} title="No backup groups found" />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Type</th>
                          <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Backup ID</th>
                          <th className="h-10 px-4 text-right text-xs font-medium uppercase tracking-wide text-muted-foreground">Backups</th>
                          <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Last Backup</th>
                          <th className="h-10 px-4 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">Comment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {groups.map((group) => (
                          <tr
                            key={`${group.backupType}-${group.backupId}`}
                            className="border-b last:border-b-0 hover:bg-accent/50 transition-colors duration-150 cursor-pointer"
                            onClick={() => setSelectedGroup(group)}
                          >
                            <td className="px-4 py-3">
                              <span className="text-xs uppercase text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                                {group.backupType}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-mono">{group.backupId}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs tabular-nums text-muted-foreground">
                              {group.backupCount ?? '—'}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs tabular-nums text-muted-foreground">
                              {formatTimestamp(group.lastBackup)}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground">{group.comment ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Job lists */}
        <JobTable title="Verify Jobs" icon={ShieldCheck} jobs={verifyJobs} />
        <JobTable title="Prune Jobs" icon={Eraser} jobs={pruneJobs} showKeep />
        <JobTable title="GC Jobs" icon={Recycle} jobs={gcJobs} />
      </div>

      {/* Dialogs */}
      <VerifyDialog open={verifyOpen} onOpenChange={setVerifyOpen} store={store} />
      <PruneDialog open={pruneOpen} onOpenChange={setPruneOpen} store={store} />
      <GcDialog open={gcOpen} onOpenChange={setGcOpen} store={store} />

      {downloadSnapshot && (
        <DownloadFilesDialog
          open={!!downloadSnapshot}
          onOpenChange={(open) => {
            if (!open) setDownloadSnapshot(null)
          }}
          store={store}
          backupId={downloadSnapshot.backupId}
          backupType={downloadSnapshot.backupType}
          backupTime={downloadSnapshot.backupTime}
        />
      )}

      <ConfirmDialog
        open={confirmDeleteSnapshot !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteSnapshot(null)
        }}
        title="Delete Snapshot"
        description={
          confirmDeleteSnapshot
            ? `Are you sure you want to delete snapshot ${confirmDeleteSnapshot.backupType}/${confirmDeleteSnapshot.backupId}@${confirmDeleteSnapshot.backupTime}? This action cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        isLoading={deleteSnapshot.isPending}
        onConfirm={() => {
          if (confirmDeleteSnapshot) {
            deleteSnapshot.mutate(
              {
                store,
                backupId: confirmDeleteSnapshot.backupId,
                backupType: confirmDeleteSnapshot.backupType,
                backupTime: confirmDeleteSnapshot.backupTime,
              },
              { onSettled: () => setConfirmDeleteSnapshot(null) },
            )
          }
        }}
      />

      <ConfirmDialog
        open={confirmDeleteGroup}
        onOpenChange={setConfirmDeleteGroup}
        title="Delete Backup Group"
        description={
          selectedGroup
            ? `Are you sure you want to delete the whole group ${selectedGroup.backupType}/${selectedGroup.backupId} including all snapshots? This action cannot be undone.`
            : undefined
        }
        confirmLabel="Delete"
        isLoading={deleteGroup.isPending}
        onConfirm={() => {
          if (selectedGroup) {
            deleteGroup.mutate(
              {
                store,
                backupId: selectedGroup.backupId,
                backupType: selectedGroup.backupType,
              },
              {
                onSettled: () => {
                  setConfirmDeleteGroup(false)
                  setSelectedGroup(null)
                },
              },
            )
          }
        }}
      />
    </div>
  )
}
