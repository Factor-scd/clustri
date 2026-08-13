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
import { Loader2 } from 'lucide-react'
import { usePbsRunPrune } from '@/hooks/usePbs'

interface PruneDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  store: string
}

function parseOptionalInt(value: string): number | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const n = Number(trimmed)
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : undefined
}

const keepFields: { key: string; label: string; placeholder: string }[] = [
  { key: 'keepLast', label: 'Keep last', placeholder: 'e.g. 7' },
  { key: 'keepDaily', label: 'Keep daily', placeholder: 'e.g. 14' },
  { key: 'keepWeekly', label: 'Keep weekly', placeholder: 'e.g. 8' },
  { key: 'keepMonthly', label: 'Keep monthly', placeholder: 'e.g. 6' },
  { key: 'keepYearly', label: 'Keep yearly', placeholder: 'e.g. 2' },
]

export function PruneDialog({ open, onOpenChange, store }: PruneDialogProps) {
  const [keepValues, setKeepValues] = useState<Record<string, string>>({})
  const [dryRun, setDryRun] = useState(true)
  const runPrune = usePbsRunPrune()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    runPrune.mutate(
      {
        store,
        keepLast: parseOptionalInt(keepValues.keepLast ?? ''),
        keepDaily: parseOptionalInt(keepValues.keepDaily ?? ''),
        keepWeekly: parseOptionalInt(keepValues.keepWeekly ?? ''),
        keepMonthly: parseOptionalInt(keepValues.keepMonthly ?? ''),
        keepYearly: parseOptionalInt(keepValues.keepYearly ?? ''),
        dryRun,
      },
      { onSuccess: () => onOpenChange(false) },
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Prune Datastore</DialogTitle>
          <DialogDescription>
            Prune backup groups on datastore "{store}" according to the retention rules below.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {keepFields.map((field) => (
              <div key={field.key} className="space-y-2">
                <Label htmlFor={`prune-${field.key}`}>{field.label}</Label>
                <Input
                  id={`prune-${field.key}`}
                  type="number"
                  min={0}
                  step={1}
                  value={keepValues[field.key] ?? ''}
                  onChange={(e) =>
                    setKeepValues((prev) => ({ ...prev, [field.key]: e.target.value }))
                  }
                  placeholder={field.placeholder}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="prune-dry-run"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="h-4 w-4 rounded border-input accent-primary"
            />
            <Label htmlFor="prune-dry-run" className="text-sm font-normal cursor-pointer">
              Dry run (do not actually remove anything)
            </Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={runPrune.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={runPrune.isPending}>
              {runPrune.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Run Prune
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
