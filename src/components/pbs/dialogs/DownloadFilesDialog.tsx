import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { Download, File, Lock, Loader2, AlertCircle } from 'lucide-react'
import { useConnectionStore } from '@/stores/connectionStore'
import { usePbsSnapshotFiles, usePbsDownloadFile } from '@/hooks/usePbs'
import { formatBytes } from '@/lib/format'
import type { PbsSnapshot } from '@/types/pbs'

interface DownloadFilesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: string
  backupId: string
  backupType: PbsSnapshot['backupType']
  backupTime: number
}

export function DownloadFilesDialog({
  open,
  onOpenChange,
  store,
  backupId,
  backupType,
  backupTime,
}: DownloadFilesDialogProps) {
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const {
    data: files,
    isLoading,
    error,
  } = usePbsSnapshotFiles(
    open ? activeConnectionId : null,
    open ? store : null,
    open ? backupId : null,
    open ? backupType : null,
    open ? backupTime : null,
  )
  const downloadFile = usePbsDownloadFile()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Download Files</DialogTitle>
          <DialogDescription>
            Files in snapshot {backupType}/{backupId}@{backupTime} on datastore "{store}".
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-72">
          {isLoading ? (
            <div className="space-y-2 p-1">
              {Array.from({ length: 3 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Failed to load snapshot files
            </div>
          ) : !files || files.length === 0 ? (
            <EmptyState icon={File} title="No files in this snapshot" />
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.filename}
                  className="flex flex-col gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <File className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{file.filename}</span>
                    {file.cryptMode && file.cryptMode !== 'none' && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-sm border border-warning/25 bg-warning/10 px-1.5 py-0.5 text-[10px] font-medium uppercase text-warning">
                        <Lock className="h-3 w-3" />
                        {file.cryptMode}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {formatBytes(file.size ?? 0)}
                    </span>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={downloadFile.isPending}
                        onClick={() =>
                          downloadFile.mutate({
                            store,
                            backupId,
                            backupType,
                            backupTime,
                            fileName: file.filename,
                            decoded: false,
                          })
                        }
                      >
                        <Download className="h-3.5 w-3.5" />
                        Raw
                      </Button>
                      <Button
                        size="sm"
                        disabled={downloadFile.isPending}
                        onClick={() =>
                          downloadFile.mutate({
                            store,
                            backupId,
                            backupType,
                            backupTime,
                            fileName: file.filename,
                            decoded: true,
                          })
                        }
                      >
                        {downloadFile.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Decoded
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={downloadFile.isPending}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
