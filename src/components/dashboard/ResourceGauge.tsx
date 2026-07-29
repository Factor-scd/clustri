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

function getGaugeColor(percent: number): string {
  if (percent >= 0.9) return 'stroke-destructive'
  if (percent >= 0.7) return 'stroke-yellow-500'
  return 'stroke-primary'
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <div className="relative">
          <svg width="100" height="100" viewBox="0 0 100 100">
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
              className={getGaugeColor(clampedPercent)}
              style={{
                transform: 'rotate(-90deg)',
                transformOrigin: '50% 50%',
                transition: 'stroke-dashoffset 0.6s ease-in-out',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-bold">{displayPercent}%</span>
          </div>
        </div>
        <div className="text-center text-xs text-muted-foreground">
          {formatter(used)} / {formatter(total)}
        </div>
      </CardContent>
    </Card>
  )
}
