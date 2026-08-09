import { useState } from 'react'
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
import { useCreateBackupJob } from '@/hooks/useProxmox'
import type { BackupJobConfig } from '@/types/proxmox'

interface CreateBackupJobDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  storageOptions: string[]
}

export function CreateBackupJobDialog({
  open,
  onOpenChange,
  storageOptions,
}: CreateBackupJobDialogProps) {
  const [storage, setStorage] = useState(storageOptions[0] ?? '')
  const [schedule, setSchedule] = useState('0 2 * * *')
  const [mode, setMode] = useState<BackupJobConfig['mode']>('snapshot')
  const [compression, setCompression] = useState<BackupJobConfig['compression']>('zstd')
  const [all, setAll] = useState(true)
  const [vmid, setVmid] = useState('')
  const [enabled, setEnabled] = useState(true)

  const createBackupJob = useCreateBackupJob()

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
    createBackupJob.mutate(
      { config },
      {
        onSuccess: () => {
          onOpenChange(false)
          resetForm()
        },
      },
    )
  }

  const resetForm = () => {
    setStorage(storageOptions[0] ?? '')
    setSchedule('0 2 * * *')
    setMode('snapshot')
    setCompression('zstd')
    setAll(true)
    setVmid('')
    setEnabled(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Backup Job</DialogTitle>
          <DialogDescription>
            Schedule a recurring backup job for your VMs and containers.
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

          {createBackupJob.isError && (
            <p className="text-sm text-destructive">
              Failed to create backup job. Please try again.
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createBackupJob.isPending || !storage || !schedule.trim()}
            >
              {createBackupJob.isPending ? 'Creating...' : 'Create Job'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
