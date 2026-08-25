import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { DotMatrixText } from '@/components/ui/dot-matrix'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center dot-grid">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-sm border border-dotted border-border bg-muted/50">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <DotMatrixText text={title.toUpperCase()} size="xs" className="text-foreground" />
      {description && (
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
