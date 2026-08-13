import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { usePbsRunGc } from '@/hooks/usePbs'

interface GcDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: string
}

export function GcDialog({ open, onOpenChange, store }: GcDialogProps) {
  const runGc = usePbsRunGc()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Garbage Collection</DialogTitle>
          <DialogDescription>
            Run garbage collection on datastore "{store}"? This removes chunks that are no
            longer referenced by any backup.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={runGc.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() => runGc.mutate({ store }, { onSuccess: () => onOpenChange(false) })}
            disabled={runGc.isPending}
          >
            {runGc.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Run Garbage Collection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
