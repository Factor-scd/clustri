import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Cpu, MemoryStick, HardDrive } from 'lucide-react'
import { formatBytes } from '@/lib/format'

interface ResourceGaugeProps {
  label: string
  used: number
  total: number
  icon: 'cpu' | 'memory' | 'disk'
  formatValue?: (value: number) => string
}

const iconMap = {
  cpu: Cpu,
  memory: MemoryStick,
  disk: HardDrive,
} as const

function formatCores(cores: number): string {
  return `${cores.toFixed(1)} cores`
}

function getGaugeStyle(percent: number): { className: string; glow: string } {
  if (percent >= 0.9) {
    return {
      className: 'stroke-destructive',
      glow: 'drop-shadow(0 0 3px color-mix(in oklab, var(--color-destructive) 50%, transparent))',
    }
  }
  if (percent >= 0.7) {
    return {
      className: 'stroke-warning',
      glow: 'drop-shadow(0 0 3px color-mix(in oklab, var(--color-warning) 50%, transparent))',
    }
  }
  return {
    className: 'stroke-primary',
    glow: 'drop-shadow(0 0 3px color-mix(in oklab, var(--color-primary) 45%, transparent))',
  }
}

function getTrackColor(): string {
  return 'stroke-muted'
}

export function ResourceGauge({ label, used, total, icon, formatValue }: ResourceGaugeProps) {
  const percent = total > 0 ? used / total : 0
  const clampedPercent = Math.min(Math.max(percent, 0), 1)
  const displayPercent = (clampedPercent * 100).toFixed(1)

  const Icon = iconMap[icon]

  // SVG circle parameters
  const radius = 40
  const strokeWidth = 8
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - clampedPercent)

  const defaultFormat =
    icon === 'cpu'
      ? formatCores
      : formatBytes

  const formatter = formatValue ?? defaultFormat
  const gaugeStyle = getGaugeStyle(clampedPercent)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-muted/40">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="relative">
          <svg width="108" height="108" viewBox="0 0 100 100">
            {/* Background track */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              className={getTrackColor()}
            />
            {/* Progress arc */}
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              className={gaugeStyle.className}
              style={{
                transform: 'rotate(-90deg)',
                transformOrigin: '50% 50%',
                transition: 'stroke-dashoffset 0.6s ease-in-out',
                filter: gaugeStyle.glow,
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-mono text-xl font-semibold leading-none tracking-tight tabular-nums">
              {displayPercent}%
            </span>
          </div>
        </div>
        <div className="text-center font-mono text-xs tabular-nums text-muted-foreground">
          {formatter(used)} / {formatter(total)}
        </div>
      </CardContent>
    </Card>
  )
}
