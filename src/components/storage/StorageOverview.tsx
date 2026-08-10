import { useState, useMemo } from 'react'
import { useStorage } from '@/hooks/useProxmox'
import { StorageCard } from './StorageCard'
import { EmptyState } from '@/components/ui/empty-state'
import { PageSkeleton, Skeleton } from '@/components/ui/skeleton'
import { Search, HardDrive } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface StorageOverviewProps {
  connectionId: string
  onStorageClick?: (storage: string, node: string) => void
}

export function StorageOverview({ connectionId, onStorageClick }: StorageOverviewProps) {
  const { data: storageList, isLoading, error } = useStorage(connectionId)
  const [search, setSearch] = useState('')

  // The backend returns one entry per (storage, node) pair, so shared storages
  // appear once per node (e.g. local-lvm on each node). Dedupe by name for
  // display, keeping the first entry's node for the click-through.
  const dedupedStorage = useMemo(() => {
    const seen = new Set<string>()
    return (storageList ?? []).filter((s) => {
      if (seen.has(s.storage)) return false
      seen.add(s.storage)
      return true
    })
  }, [storageList])

  const filteredStorage = useMemo(() => {
    if (!search) return dedupedStorage
    const query = search.toLowerCase()
    return dedupedStorage.filter(
      (s) =>
        s.storage.toLowerCase().includes(query) ||
        s.type.toLowerCase().includes(query) ||
        s.node.toLowerCase().includes(query)
    )
  }, [dedupedStorage, search])

  if (isLoading) {
    return (
      <PageSkeleton filter>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      </PageSkeleton>
    )
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-destructive">Failed to load storage pools</p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto p-6">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Storage Pools</h2>
          <p className="text-muted-foreground">
            {dedupedStorage.length} storage pools across the cluster
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, type, or node..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Storage Grid */}
        {filteredStorage.length === 0 ? (
          dedupedStorage.length === 0 ? (
            <EmptyState icon={HardDrive} title="No storage pools found" />
          ) : (
            <EmptyState icon={Search} title="No storage pools match your search" />
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStorage.map((storage) => (
              <StorageCard
                key={`${storage.node}-${storage.storage}`}
                storage={storage}
                onClick={() => onStorageClick?.(storage.storage, storage.node)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
