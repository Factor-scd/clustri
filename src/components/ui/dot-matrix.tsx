import { GLYPH_COLS, GLYPH_ROWS, getGlyph } from '@/lib/dotMatrixGlyphs'
import { cn } from '@/lib/utils'

type DotMatrixSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const sizeMap: Record<DotMatrixSize, { dot: number; gap: number; charGap: number }> = {
  xs: { dot: 1.8, gap: 1.3, charGap: 5 },
  sm: { dot: 2.2, gap: 1.5, charGap: 6 },
  md: { dot: 2.6, gap: 1.8, charGap: 7 },
  lg: { dot: 3.0, gap: 2.0, charGap: 9 },
  xl: { dot: 3.8, gap: 2.4, charGap: 12 },
}

interface DotMatrixTextProps {
  text: string
  size?: DotMatrixSize
  className?: string
  dotClassName?: string
  'aria-label'?: string
}

function CharSvg({
  glyph,
  dot,
  gap,
}: {
  glyph: readonly string[]
  dot: number
  gap: number
}) {
  const w = GLYPH_COLS * dot + (GLYPH_COLS - 1) * gap
  const h = GLYPH_ROWS * dot + (GLYPH_ROWS - 1) * gap
  const r = dot / 2
  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
      className="shrink-0"
      shapeRendering="geometricPrecision"
    >
      {glyph.map((row, y) =>
        Array.from(row).map((cell, x) => {
          if (cell === ' ') return null
          const cx = x * (dot + gap) + r
          const cy = y * (dot + gap) + r
          return <circle key={`${x}-${y}`} cx={cx} cy={cy} r={r} fill="currentColor" />
        }),
      )}
    </svg>
  )
}

export function DotMatrixText({
  text,
  size = 'sm',
  className,
  dotClassName,
  'aria-label': ariaLabel,
}: DotMatrixTextProps) {
  const { dot, gap, charGap } = sizeMap[size]
  const chars = Array.from(text.toUpperCase())
  const label = ariaLabel ?? text
  return (
    <span
      aria-label={label}
      role="text"
      className={cn('inline-flex items-center leading-none', dotClassName, className)}
      style={{ gap: charGap }}
    >
      {chars.map((ch, i) => {
        if (ch === ' ') {
          return <span key={i} style={{ width: charGap * 1.8 }} aria-hidden="true" />
        }
        const glyph = getGlyph(ch)
        if (!glyph) {
          return (
            <span
              key={i}
              className="font-mono text-[0.7em] leading-none"
              aria-hidden="true"
            >
              {ch}
            </span>
          )
        }
        return <CharSvg key={i} glyph={glyph} dot={dot} gap={gap} />
      })}
    </span>
  )
}

export function DotMatrixHeading({
  text,
  size = 'md',
  className,
  dotClassName,
  as: Tag = 'span',
  ...rest
}: DotMatrixTextProps & { as?: 'h1' | 'h2' | 'h3' | 'span' | 'p' | 'div' }) {
  return (
    <Tag className={cn('block', className)} {...rest}>
      <DotMatrixText text={text} size={size} dotClassName={dotClassName} />
    </Tag>
  )
}
