import { useState, useMemo } from 'react'
import { useStorage } from '@/hooks/useProxmox'
import { StorageCard } from './StorageCard'
import { Search, HardDrive } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface StorageOverviewProps {
  connectionId: string
  onStorageClick?: (storage: string, node: string) => void
}

export function StorageOverview({ connectionId, onStorageClick }: StorageOverviewProps) {
  const { data: storageList, isLoading, error } = useStorage(connectionId)
  const [search, setSearch] = useState('')

  const filteredStorage = useMemo(() => {
    if (!storageList) return []
    if (!search) return storageList
    const query = search.toLowerCase()
    return storageList.filter(
      (s) =>
        s.storage.toLowerCase().includes(query) ||
        s.type.toLowerCase().includes(query) ||
        s.node.toLowerCase().includes(query)
    )
  }, [storageList, search])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Loading storage pools...</p>
      </div>
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
          <h2 className="text-2xl font-semibold">Storage Pools</h2>
          <p className="text-muted-foreground">
            {storageList?.length ?? 0} storage pools across the cluster
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
          <div className="text-center py-12 text-muted-foreground">
            <HardDrive className="h-8 w-8 mx-auto text-muted-foreground/50 mb-2" />
            <p>
              {storageList?.length === 0
                ? 'No storage pools found'
                : 'No storage pools match your search'}
            </p>
          </div>
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
