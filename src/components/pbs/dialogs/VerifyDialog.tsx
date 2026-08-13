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
import { usePbsRunVerify } from '@/hooks/usePbs'

interface VerifyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: string
}

export function VerifyDialog({ open, onOpenChange, store }: VerifyDialogProps) {
  const runVerify = usePbsRunVerify()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Verify Datastore</DialogTitle>
          <DialogDescription>
            Run verification on datastore "{store}"? Already-verified snapshots will be skipped.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={runVerify.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              runVerify.mutate({ store }, { onSuccess: () => onOpenChange(false) })
            }
            disabled={runVerify.isPending}
          >
            {runVerify.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Run Verify
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
