import { useUIStore } from '@/stores/uiStore'
import { cn } from '@/lib/utils'
import { Sun, Moon, Monitor } from 'lucide-react'

type Theme = 'light' | 'dark' | 'system'

const themeOptions: { value: Theme; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
]

export function ThemeSwitcher() {
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  return (
    <div className="flex gap-2">
      {themeOptions.map((option) => {
        const Icon = option.icon
        return (
          <button
            key={option.value}
            onClick={() => setTheme(option.value)}
            className={cn(
              'flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium transition-colors',
              theme === option.value
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
