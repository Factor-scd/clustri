import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { DotMatrixText } from '@/components/ui/dot-matrix'
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
  const displayPercent = `${(clampedPercent * 100).toFixed(1)}%`

  const Icon = iconMap[icon]
  const radius = 40
  const strokeWidth = 8
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference * (1 - clampedPercent)

  const defaultFormat = icon === 'cpu' ? formatCores : formatBytes
  const formatter = formatValue ?? defaultFormat
  const gaugeStyle = getGaugeStyle(clampedPercent)

  return (
    <Card className="dot-grid">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <DotMatrixText text={label} size="xs" className="text-muted-foreground" />
        <div className="flex h-7 w-7 items-center justify-center rounded-sm border border-dotted border-border bg-muted/40">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="relative">
          <svg width="108" height="108" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth={strokeWidth - 1}
              strokeDasharray="1 3"
              strokeLinecap="round"
              className={getTrackColor()}
              opacity="0.35"
            />
            <circle
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={`${circumference * 0.018} ${circumference * 0.012}`}
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
            <DotMatrixText text={displayPercent} size="xs" className="text-foreground" />
          </div>
        </div>
        <div className="text-center font-mono text-xs tabular-nums text-muted-foreground">
          {formatter(used)} / {formatter(total)}
        </div>
      </CardContent>
    </Card>
  )
}
