import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-secondary', className)} />
}

interface PageSkeletonProps {
  /** Render a search/filter bar between the header and the content blocks */
  filter?: boolean
  /** Custom content blocks; defaults to a generic card layout */
  children?: ReactNode
}

/**
 * Page-level loading placeholder. Mirrors the standard layout of the
 * main views (header line + optional filter bar + content blocks).
 */
export function PageSkeleton({ filter = false, children }: PageSkeletonProps) {
  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-72" />
        </div>
        {filter && (
          <div className="flex flex-wrap gap-3">
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-9 w-36" />
            <Skeleton className="h-9 w-36" />
          </div>
        )}
        {children ?? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }, (_, i) => (
                <Skeleton key={i} className="h-24" />
              ))}
            </div>
            <Skeleton className="h-56 w-full" />
            <Skeleton className="h-32 w-full" />
          </>
        )}
      </div>
    </div>
  )
}
