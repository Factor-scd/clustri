import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useUpdateBackupJob } from '@/hooks/useProxmox'
import type { BackupJobConfig, ProxmoxBackupJob } from '@/types/proxmox'

interface EditBackupJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  job: ProxmoxBackupJob
  storageOptions: string[]
}

export function EditBackupJobDialog({
  open,
  onOpenChange,
  job,
  storageOptions,
}: EditBackupJobDialogProps) {
  const [storage, setStorage] = useState(job.store)
  const [schedule, setSchedule] = useState(job.schedule)
  const [mode, setMode] = useState<BackupJobConfig['mode']>(
    (job.mode as BackupJobConfig['mode']) || 'snapshot',
  )
  const [compression, setCompression] = useState<BackupJobConfig['compression']>(
    (job.compress as BackupJobConfig['compression']) || 'zstd',
  )
  const [all, setAll] = useState(job.all === 1)
  const [vmid, setVmid] = useState(job.vmid ?? '')
  const [enabled, setEnabled] = useState(job.enabled === 1)

  const updateBackupJob = useUpdateBackupJob()

  useEffect(() => {
    if (open) {
      setStorage(job.store)
      setSchedule(job.schedule)
      setMode((job.mode as BackupJobConfig['mode']) || 'snapshot')
      setCompression((job.compress as BackupJobConfig['compression']) || 'zstd')
      setAll(job.all === 1)
      setVmid(job.vmid ?? '')
      setEnabled(job.enabled === 1)
    }
  }, [open, job])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const config: BackupJobConfig = {
      storage,
      schedule,
      mode,
      compression,
      all,
      vmid: all ? undefined : vmid,
      enabled,
    }
    updateBackupJob.mutate(
      { id: job.id, config },
      {
        onSuccess: () => {
          onOpenChange(false)
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Backup Job</DialogTitle>
          <DialogDescription>
            Modify the backup job configuration.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="storage">Storage</Label>
            <select
              id="storage"
              value={storage}
              onChange={(e) => setStorage(e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              required
            >
              {storageOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="schedule">Schedule (cron)</Label>
            <Input
              id="schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="0 2 * * *"
              required
            />
            <p className="text-xs text-muted-foreground">
              Example: "0 2 * * *" = daily at 2:00 AM
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mode">Backup Mode</Label>
            <select
              id="mode"
              value={mode}
              onChange={(e) => setMode(e.target.value as BackupJobConfig['mode'])}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="snapshot">Snapshot (online, no downtime)</option>
              <option value="stop">Stop (shut down, backup, restart)</option>
              <option value="suspend">Suspend (pause, backup, resume)</option>
            </select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="compression">Compression</Label>
            <select
              id="compression"
              value={compression}
              onChange={(e) => setCompression(e.target.value as BackupJobConfig['compression'])}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="zstd">ZSTD (recommended)</option>
              <option value="lz4">LZ4</option>
              <option value="gzip">GZIP</option>
              <option value="none">None</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="all"
              checked={all}
              onChange={(e) => setAll(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <Label htmlFor="all" className="text-sm font-normal cursor-pointer">
              Backup all VMs and containers
            </Label>
          </div>

          {!all && (
            <div className="space-y-2">
              <Label htmlFor="vmid">VMIDs (comma-separated)</Label>
              <Input
                id="vmid"
                value={vmid}
                onChange={(e) => setVmid(e.target.value)}
                placeholder="100, 101, 102"
              />
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <Label htmlFor="enabled" className="text-sm font-normal cursor-pointer">
              Enabled
            </Label>
          </div>

          {updateBackupJob.isError && (
            <p className="text-sm text-destructive">
              Failed to update backup job. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateBackupJob.isPending || !storage || !schedule.trim()}
            >
              {updateBackupJob.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
