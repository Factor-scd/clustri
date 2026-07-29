import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useConnectionStore } from '@/stores/connectionStore'
import { useVMs } from '@/hooks/useProxmox'
import {
  useStartVM,
  useStopVM,
  useShutdownVM,
  useRebootVM,
} from '@/hooks/useProxmox'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Server,
  Play,
  Square,
  Power,
  RotateCw,
  LayoutDashboard,
  Box,
  ListTodo,
  Shield,
  HardDrive,
  Settings,
  Plus,
  X,
  Search,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProxmoxVM } from '@/types/proxmox'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type View =
  | { type: 'dashboard' }
  | { type: 'vms' }
  | { type: 'vm-detail'; vm: ProxmoxVM }
  | { type: 'tasks' }
  | { type: 'backups' }
  | { type: 'storage' }
  | { type: 'storage-detail'; storage: string; node: string }
  | { type: 'settings' }

type CommandCategory = 'recent' | 'vms' | 'actions' | 'navigation' | 'connections'

interface CommandItem {
  id: string
  label: string
  description?: string
  icon: React.ComponentType<{ className?: string }>
  category: CommandCategory
  shortcut?: string
  keywords: string[]
  onExecute: () => void
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigate: (view: View) => void
  onAddConnection: () => void
}

// ---------------------------------------------------------------------------
// Recent commands – localStorage persistence
// ---------------------------------------------------------------------------

const RECENT_STORAGE_KEY = 'proxmox-command-palette-recent'
const MAX_RECENT = 10

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as string[]) : []
  } catch {
    return []
  }
}

function saveRecent(ids: string[]) {
  localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(ids))
}

function pushRecent(id: string) {
  const current = loadRecent().filter((r) => r !== id)
  current.unshift(id)
  saveRecent(current.slice(0, MAX_RECENT))
}

function clearRecent() {
  localStorage.removeItem(RECENT_STORAGE_KEY)
}

// ---------------------------------------------------------------------------
// Fuzzy match
// ---------------------------------------------------------------------------

function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()

  // Substring match
  if (lowerText.includes(lowerQuery)) return true

  // Character-by-character fuzzy
  let qi = 0
  for (let ti = 0; ti < lowerText.length && qi < lowerQuery.length; ti++) {
    if (lowerText[ti] === lowerQuery[qi]) qi++
  }
  return qi === lowerQuery.length
}

// ---------------------------------------------------------------------------
// Highlighted text component
// ---------------------------------------------------------------------------

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>

  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const idx = lowerText.indexOf(lowerQuery)

  if (idx !== -1) {
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-accent-foreground/20 text-foreground rounded-sm">
          {text.slice(idx, idx + query.length)}
        </mark>
        {text.slice(idx + query.length)}
      </>
    )
  }

  // Fuzzy: highlight individual matched characters
  const chars = text.split('')
  let qi = 0
  return (
    <>
      {chars.map((char, i) => {
        if (qi < lowerQuery.length && char.toLowerCase() === lowerQuery[qi]) {
          qi++
          return (
            <mark key={i} className="bg-accent-foreground/20 text-foreground rounded-sm">
              {char}
            </mark>
          )
        }
        return char
      })}
    </>
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function categoryHeading(category: CommandCategory): string {
  switch (category) {
    case 'recent':
      return 'Recent'
    case 'vms':
      return 'VMs & Containers'
    case 'actions':
      return 'Actions'
    case 'navigation':
      return 'Navigation'
    case 'connections':
      return 'Connections'
  }
}

// ---------------------------------------------------------------------------
// CommandPalette
// ---------------------------------------------------------------------------

export function CommandPalette({
  open,
  onOpenChange,
  onNavigate,
  onAddConnection,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [recentIds, setRecentIds] = useState<string[]>(loadRecent)

  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Data from stores
  const activeConnectionId = useConnectionStore((s) => s.activeConnectionId)
  const connections = useConnectionStore((s) => s.connections)
  const setActiveConnection = useConnectionStore((s) => s.setActiveConnection)

  const { data: vms = [] } = useVMs(activeConnectionId)

  // VM mutation hooks
  const startVM = useStartVM()
  const stopVM = useStopVM()
  const shutdownVM = useShutdownVM()
  const rebootVM = useRebootVM()

  // -----------------------------------------------------------------------
  // Build all command items
  // -----------------------------------------------------------------------
  const buildItems = useCallback((): CommandItem[] => {
    const items: CommandItem[] = []

    // -- Navigation --
    items.push(
      {
        id: 'nav-dashboard',
        label: 'Go to Dashboard',
        icon: LayoutDashboard,
        category: 'navigation',
        shortcut: '⌘1',
        keywords: ['dashboard', 'home', 'overview'],
        onExecute: () => onNavigate({ type: 'dashboard' }),
      },
      {
        id: 'nav-vms',
        label: 'Go to VMs',
        icon: Box,
        category: 'navigation',
        shortcut: '⌘2',
        keywords: ['vm', 'vms', 'virtual machines', 'containers'],
        onExecute: () => onNavigate({ type: 'vms' }),
      },
      {
        id: 'nav-tasks',
        label: 'Go to Tasks',
        icon: ListTodo,
        category: 'navigation',
        shortcut: '⌘3',
        keywords: ['tasks', 'jobs', 'queue'],
        onExecute: () => onNavigate({ type: 'tasks' }),
      },
      {
        id: 'nav-backups',
        label: 'Go to Backups',
        icon: Shield,
        category: 'navigation',
        shortcut: '⌘4',
        keywords: ['backups', 'restore', 'backup'],
        onExecute: () => onNavigate({ type: 'backups' }),
      },
      {
        id: 'nav-storage',
        label: 'Go to Storage',
        icon: HardDrive,
        category: 'navigation',
        shortcut: '⌘5',
        keywords: ['storage', 'disks', 'volumes'],
        onExecute: () => onNavigate({ type: 'storage' }),
      },
      {
        id: 'nav-settings',
        label: 'Go to Settings',
        icon: Settings,
        category: 'navigation',
        shortcut: '⌘6',
        keywords: ['settings', 'preferences', 'configuration'],
        onExecute: () => onNavigate({ type: 'settings' }),
      },
      {
        id: 'nav-add-connection',
        label: 'Add Connection',
        icon: Plus,
        category: 'navigation',
        keywords: ['add', 'connection', 'server', 'proxmox', 'new'],
        onExecute: () => onAddConnection(),
      },
    )

    // -- VMs --
    for (const vm of vms) {
      items.push({
        id: `vm-detail-${vm.vmid}`,
        label: vm.name,
        description: `${vm.type.toUpperCase()} · VMID ${vm.vmid} · ${vm.node} · ${vm.status}`,
        icon: Server,
        category: 'vms',
        keywords: [vm.name, String(vm.vmid), vm.node, vm.type, vm.status],
        onExecute: () => onNavigate({ type: 'vm-detail', vm }),
      })
    }

    // -- VM Actions --
    for (const vm of vms) {
      if (vm.status === 'running') {
        items.push(
          {
            id: `action-stop-${vm.vmid}`,
            label: `Stop ${vm.name}`,
            description: `Force stop ${vm.type.toUpperCase()} VMID ${vm.vmid}`,
            icon: Square,
            category: 'actions',
            keywords: ['stop', 'halt', 'power off', vm.name, String(vm.vmid)],
            onExecute: () => stopVM.mutate({ node: vm.node, vmid: vm.vmid }),
          },
          {
            id: `action-shutdown-${vm.vmid}`,
            label: `Shutdown ${vm.name}`,
            description: `Gracefully shutdown ${vm.type.toUpperCase()} VMID ${vm.vmid}`,
            icon: Power,
            category: 'actions',
            keywords: ['shutdown', 'graceful', 'power', vm.name, String(vm.vmid)],
            onExecute: () => shutdownVM.mutate({ node: vm.node, vmid: vm.vmid }),
          },
          {
            id: `action-reboot-${vm.vmid}`,
            label: `Reboot ${vm.name}`,
            description: `Reboot ${vm.type.toUpperCase()} VMID ${vm.vmid}`,
            icon: RotateCw,
            category: 'actions',
            keywords: ['reboot', 'restart', vm.name, String(vm.vmid)],
            onExecute: () => rebootVM.mutate({ node: vm.node, vmid: vm.vmid }),
          },
        )
      }
      if (vm.status === 'stopped' || vm.status === 'paused') {
        items.push({
          id: `action-start-${vm.vmid}`,
          label: `Start ${vm.name}`,
          description: `Start ${vm.type.toUpperCase()} VMID ${vm.vmid}`,
          icon: Play,
          category: 'actions',
          keywords: ['start', 'boot', 'power on', vm.name, String(vm.vmid)],
          onExecute: () => startVM.mutate({ node: vm.node, vmid: vm.vmid }),
        })
      }
    }

    // -- Connections --
    for (const conn of connections) {
      items.push({
        id: `conn-${conn.id}`,
        label: conn.name,
        description: `Switch to ${conn.name} (${conn.status})`,
        icon: Server,
        category: 'connections',
        keywords: [conn.name, conn.status, 'switch', 'connection'],
        onExecute: () => setActiveConnection(conn.id),
      })
    }

    return items
  }, [
    vms,
    connections,
    onNavigate,
    onAddConnection,
    startVM,
    stopVM,
    shutdownVM,
    rebootVM,
    setActiveConnection,
  ])

  const allItems = useMemo(() => buildItems(), [buildItems])

  // -----------------------------------------------------------------------
  // Filter & group
  // -----------------------------------------------------------------------
  const filteredItems = useMemo(() => {
    const q = query.trim()

    if (!q) {
      // Empty query: recent → navigation → everything else
      const recentItems = recentIds
        .map((id) => allItems.find((item) => item.id === id))
        .filter((item): item is CommandItem => item !== undefined)
        .map((item) => ({ ...item, category: 'recent' as const }))

      const navItems = allItems.filter((item) => item.category === 'navigation')
      const otherItems = allItems.filter(
        (item) => item.category !== 'navigation' && item.category !== 'recent',
      )

      return [...recentItems, ...navItems, ...otherItems]
    }

    return allItems.filter((item) => {
      const haystack = [item.label, item.description ?? '', ...item.keywords].join(' ')
      return fuzzyMatch(q, haystack)
    })
  }, [query, allItems, recentIds])

  const groupedItems = useMemo(() => {
    const groups: { heading: string; items: CommandItem[] }[] = []

    if (query.trim()) {
      const buckets: Record<string, CommandItem[]> = {}
      for (const item of filteredItems) {
        const heading = item.category === 'recent' ? 'Recent' : categoryHeading(item.category)
        if (!buckets[heading]) buckets[heading] = []
        buckets[heading].push(item)
      }
      for (const [heading, items] of Object.entries(buckets)) {
        groups.push({ heading, items })
      }
    } else {
      let currentHeading = ''
      let currentItems: CommandItem[] = []
      for (const item of filteredItems) {
        const heading = item.category === 'recent' ? 'Recent' : categoryHeading(item.category)
        if (heading !== currentHeading) {
          if (currentItems.length > 0) groups.push({ heading: currentHeading, items: currentItems })
          currentHeading = heading
          currentItems = [item]
        } else {
          currentItems.push(item)
        }
      }
      if (currentItems.length > 0) groups.push({ heading: currentHeading, items: currentItems })
    }

    return groups
  }, [filteredItems, query])

  const flatItems = useMemo(() => groupedItems.flatMap((g) => g.items), [groupedItems])

  // -----------------------------------------------------------------------
  // Reset on open
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (open) {
      setQuery('')
      setSelectedIndex(0)
      setRecentIds(loadRecent())
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  // -----------------------------------------------------------------------
  // Reset selection on query change
  // -----------------------------------------------------------------------
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // -----------------------------------------------------------------------
  // Keep selected item in view
  // -----------------------------------------------------------------------
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-cmd-idx="${selectedIndex}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  // -----------------------------------------------------------------------
  // Execute item
  // -----------------------------------------------------------------------
  const executeItem = useCallback(
    (item: CommandItem) => {
      pushRecent(item.id)
      setRecentIds(loadRecent())
      item.onExecute()
      onOpenChange(false)
    },
    [onOpenChange],
  )

  // -----------------------------------------------------------------------
  // Keyboard handling
  // -----------------------------------------------------------------------
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((i) => Math.min(i + 1, flatItems.length - 1))
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((i) => Math.max(i - 1, 0))
          break
        case 'Enter':
          e.preventDefault()
          if (flatItems[selectedIndex]) executeItem(flatItems[selectedIndex])
          break
        case 'Escape':
          e.preventDefault()
          onOpenChange(false)
          break
      }
    },
    [flatItems, selectedIndex, executeItem, onOpenChange],
  )

  // -----------------------------------------------------------------------
  // Flat index helper
  // -----------------------------------------------------------------------
  function flatIndex(groupIdx: number, itemIdx: number): number {
    let offset = 0
    for (let g = 0; g < groupIdx; g++) offset += groupedItems[g].items.length
    return offset + itemIdx
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 shadow-lg gap-0 max-w-xl"
        onKeyDown={handleKeyDown}
      >
        {/* Search bar */}
        <div className="flex items-center border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search..."
            className="flex h-11 w-full rounded-md bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 rounded-sm hover:bg-accent text-muted-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Results list */}
        <ScrollArea className="max-h-80">
          <div ref={listRef} className="p-1">
            {flatItems.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </div>
            ) : (
              groupedItems.map((group, gIdx) => (
                <div key={group.heading}>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground select-none">
                    {group.heading}
                  </div>
                  {group.items.map((item, iIdx) => {
                    const idx = flatIndex(gIdx, iIdx)
                    const isActive = idx === selectedIndex
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        data-cmd-idx={idx}
                        onClick={() => executeItem(item)}
                        onMouseEnter={() => setSelectedIndex(idx)}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm outline-none transition-colors text-left',
                          isActive
                            ? 'bg-accent text-accent-foreground'
                            : 'text-foreground hover:bg-accent/50',
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="truncate">
                            <HighlightedText text={item.label} query={query} />
                          </div>
                          {item.description && (
                            <div className="truncate text-xs text-muted-foreground">
                              {item.description}
                            </div>
                          )}
                        </div>
                        {item.shortcut && (
                          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                            {item.shortcut}
                          </kbd>
                        )}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        {/* Footer with keyboard hints */}
        <div className="flex items-center justify-between border-t px-3 py-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 font-mono">↑</kbd>
              <kbd className="rounded border bg-muted px-1 font-mono">↓</kbd>
              navigate
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 font-mono">↵</kbd>
              select
            </span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border bg-muted px-1 font-mono">esc</kbd>
              close
            </span>
          </div>
          {recentIds.length > 0 && (
            <button
              onClick={() => {
                clearRecent()
                setRecentIds([])
              }}
              className="hover:text-foreground transition-colors"
            >
              Clear recent
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
