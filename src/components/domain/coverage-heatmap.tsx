'use client'

import { Fragment, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { bouncy } from '@/lib/motion'
import { SmartIcon } from './smart-icon'

// ── Types ────────────────────────────────────────────────────────────────────

interface HeatmapCell {
  process_id: string
  process_name: string
  period_start: string
  coverage_pct: number
  fte_needed: number | null
  fte_available: number
  status: 'computed' | 'no_norm'
}

interface CoverageHeatmapProps {
  data: HeatmapCell[]
  weeks: string[]
  onCellClick: (process_id: string, period_start: string) => void
  selectedCell: { process_id: string; period_start: string } | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWeekNumber(iso: string): number {
  const d = new Date(iso)
  const dayOfYear =
    Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000,
    ) + 1
  return Math.ceil(dayOfYear / 7)
}

type CoverageLevel = 'over' | 'good' | 'warn' | 'critical' | 'none'

function getCoverageLevel(cell: HeatmapCell): CoverageLevel {
  if (cell.status === 'no_norm' || cell.fte_needed === null) return 'none'
  const pct = cell.coverage_pct
  if (pct > 110) return 'over'
  if (pct >= 90) return 'good'
  if (pct >= 70) return 'warn'
  return 'critical'
}

const levelColors: Record<
  CoverageLevel,
  { bg: string; text: string; border: string }
> = {
  over: {
    bg: 'rgba(59,130,246,0.1)',
    text: '#3B82F6',
    border: '1px solid rgba(59,130,246,0.25)',
  },
  good: {
    bg: 'rgba(16,185,129,0.1)',
    text: '#10B981',
    border: '1px solid rgba(16,185,129,0.2)',
  },
  warn: {
    bg: 'rgba(245,158,11,0.1)',
    text: '#F59E0B',
    border: '1px solid rgba(245,158,11,0.2)',
  },
  critical: {
    bg: 'rgba(239,68,68,0.08)',
    text: '#EF4444',
    border: '1px solid rgba(239,68,68,0.2)',
  },
  none: {
    bg: 'transparent',
    text: 'var(--muted-foreground, #94A3B8)',
    border: '1.5px dashed rgba(203,213,225,0.4)',
  },
}

const legendItems: { level: CoverageLevel; label: string }[] = [
  { level: 'over', label: '>110%' },
  { level: 'good', label: '90-110%' },
  { level: 'warn', label: '70-89%' },
  { level: 'critical', label: '<70%' },
  { level: 'none', label: 'Geen data' },
]

// ── Pulse keyframes (injected once) ─────────────────────────────────────────

const PULSE_STYLE_ID = 'coverage-heatmap-pulse'

function ensurePulseKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(PULSE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PULSE_STYLE_ID
  style.textContent = `
@keyframes coveragePulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.85; }
}
`
  document.head.appendChild(style)
}

// ── Component ────────────────────────────────────────────────────────────────

export function CoverageHeatmap({
  data,
  weeks,
  onCellClick,
  selectedCell,
}: CoverageHeatmapProps) {
  const [hoveredCell, setHoveredCell] = useState<{
    process_id: string
    period_start: string
  } | null>(null)

  // Inject CSS keyframes on mount
  useMemo(() => ensurePulseKeyframes(), [])

  // Group data by process
  const { processes, cellMap } = useMemo(() => {
    const seen = new Map<string, string>()
    const map = new Map<string, HeatmapCell>()

    for (const cell of data) {
      if (!seen.has(cell.process_id)) {
        seen.set(cell.process_id, cell.process_name)
      }
      map.set(`${cell.process_id}::${cell.period_start}`, cell)
    }

    return {
      processes: Array.from(seen.entries()).map(([id, name]) => ({
        id,
        name,
      })),
      cellMap: map,
    }
  }, [data])

  // ── Styles ───────────────────────────────────────────────────────────────

  const gridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: `160px repeat(${weeks.length}, 1fr)`,
    gap: 4,
    width: '100%',
  }

  const headerStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--muted-foreground, #64748B)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    padding: '8px 4px',
    textAlign: 'center' as const,
    userSelect: 'none' as const,
  }

  const rowLabelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--foreground, #1E1B4B)',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 8px',
    borderRadius: 8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
    minWidth: 0,
  }

  const legendContainerStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 14,
    padding: '4px 0',
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ position: 'relative' }}>
      {/* Legend */}
      <div style={legendContainerStyle}>
        {legendItems.map((item) => {
          const colors = levelColors[item.level]
          return (
            <div
              key={item.level}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 11,
                fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                color: 'var(--muted-foreground, #64748B)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background:
                    item.level === 'none' ? 'transparent' : colors.bg,
                  border:
                    item.level === 'none'
                      ? '1.5px dashed rgba(203,213,225,0.6)'
                      : `2px solid ${colors.text}`,
                }}
              />
              {item.label}
            </div>
          )
        })}
      </div>

      {/* Grid */}
      <div style={gridStyle}>
        {/* Header row: empty corner + week labels */}
        <div style={{ ...headerStyle, textAlign: 'left' }} />
        {weeks.map((week) => (
          <div key={week} style={headerStyle}>
            Wk {getWeekNumber(week)}
          </div>
        ))}

        {/* Data rows */}
        {processes.map((process, rowIdx) => (
          <Fragment key={process.id}>
            {/* Row label */}
            <motion.div
              key={`label-${process.id}`}
              style={rowLabelStyle}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                ...bouncy,
                delay: rowIdx * 0.04,
              }}
            >
              <SmartIcon
                name={process.name}
                type="process"
                color="var(--primary, #6366F1)"
                size={14}
              />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {process.name}
              </span>
            </motion.div>

            {/* Week cells */}
            {weeks.map((week, colIdx) => {
              const cell = cellMap.get(`${process.id}::${week}`)
              const level = cell ? getCoverageLevel(cell) : 'none'
              const colors = levelColors[level]
              const isSelected =
                selectedCell?.process_id === process.id &&
                selectedCell?.period_start === week
              const isHovered =
                hoveredCell?.process_id === process.id &&
                hoveredCell?.period_start === week
              const delayMs = rowIdx * weeks.length + colIdx
              const weekNum = getWeekNumber(week)

              const tooltipText = cell
                ? `${process.name} \u00B7 Wk ${weekNum}\n${cell.fte_available} FTE beschikbaar van ${cell.fte_needed ?? '?'} nodig`
                : `${process.name} \u00B7 Wk ${weekNum}\nGeen data`

              const cellStyle: React.CSSProperties = {
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 4px',
                borderRadius: 8,
                background: colors.bg,
                border: isSelected
                  ? '3px solid var(--primary, #6366F1)'
                  : colors.border,
                boxShadow: isSelected
                  ? '0 0 0 2px rgba(99,102,241,0.2)'
                  : 'none',
                cursor: 'pointer',
                userSelect: 'none' as const,
                minHeight: 44,
                animation:
                  level === 'critical'
                    ? 'coveragePulse 3s ease-in-out infinite'
                    : undefined,
              }

              return (
                <motion.div
                  key={`${process.id}-${week}`}
                  style={cellStyle}
                  initial={{ opacity: 0, scale: 0.85 }}
                  animate={{
                    opacity: 1,
                    scale: isSelected ? 1.08 : 1,
                  }}
                  transition={{
                    ...bouncy,
                    delay: delayMs * 0.03,
                  }}
                  whileHover={{
                    scale: 1.08,
                    boxShadow: '0 4px 16px rgba(99,102,241,0.18)',
                    transition: {
                      duration: 0.2,
                      ease: [0.34, 1.56, 0.64, 1],
                    },
                  }}
                  onClick={() => onCellClick(process.id, week)}
                  onMouseEnter={() =>
                    setHoveredCell({
                      process_id: process.id,
                      period_start: week,
                    })
                  }
                  onMouseLeave={() => setHoveredCell(null)}
                  title={tooltipText}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onCellClick(process.id, week)
                    }
                  }}
                  aria-label={tooltipText.replace('\n', ', ')}
                >
                  {/* Coverage percentage */}
                  <span
                    style={{
                      fontFamily:
                        'var(--font-mono, "JetBrains Mono", monospace)',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 13,
                      fontWeight: 600,
                      color: colors.text,
                      lineHeight: 1.3,
                    }}
                  >
                    {level === 'none'
                      ? cell?.status === 'no_norm'
                        ? '\u26A0'
                        : '\u2014'
                      : `${Math.round(cell!.coverage_pct)}%`}
                  </span>

                  {/* FTE subtext */}
                  {cell && level !== 'none' && (
                    <span
                      style={{
                        fontFamily:
                          'var(--font-mono, "JetBrains Mono", monospace)',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 9,
                        color: 'var(--muted-foreground, #64748B)',
                        lineHeight: 1.2,
                        marginTop: 1,
                      }}
                    >
                      {cell.fte_available} / {cell.fte_needed ?? '?'}
                    </span>
                  )}

                  {/* Tooltip overlay on hover */}
                  {isHovered && (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 'calc(100% + 6px)',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        background: 'var(--popover, #1E1B4B)',
                        color: 'var(--popover-foreground, #F8FAFC)',
                        fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                        fontSize: 11,
                        lineHeight: 1.5,
                        padding: '6px 10px',
                        borderRadius: 8,
                        whiteSpace: 'pre-line',
                        pointerEvents: 'none',
                        zIndex: 50,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
                        minWidth: 160,
                        textAlign: 'center',
                      }}
                    >
                      {tooltipText}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
