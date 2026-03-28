'use client'

import { Fragment, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

// Gradient-based color system — richer than flat fills
const levelTheme: Record<
  CoverageLevel,
  {
    bg: string
    bgHover: string
    gradient: string
    text: string
    glow: string
    border: string
  }
> = {
  over: {
    bg: 'rgba(59,130,246,0.07)',
    bgHover: 'rgba(59,130,246,0.14)',
    gradient: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(99,102,241,0.06))',
    text: '#3B82F6',
    glow: 'rgba(59,130,246,0.25)',
    border: 'rgba(59,130,246,0.18)',
  },
  good: {
    bg: 'rgba(16,185,129,0.07)',
    bgHover: 'rgba(16,185,129,0.14)',
    gradient: 'linear-gradient(135deg, rgba(16,185,129,0.10), rgba(52,211,153,0.05))',
    text: '#10B981',
    glow: 'rgba(16,185,129,0.25)',
    border: 'rgba(16,185,129,0.18)',
  },
  warn: {
    bg: 'rgba(245,158,11,0.07)',
    bgHover: 'rgba(245,158,11,0.14)',
    gradient: 'linear-gradient(135deg, rgba(245,158,11,0.10), rgba(251,191,36,0.05))',
    text: '#F59E0B',
    glow: 'rgba(245,158,11,0.25)',
    border: 'rgba(245,158,11,0.18)',
  },
  critical: {
    bg: 'rgba(239,68,68,0.06)',
    bgHover: 'rgba(239,68,68,0.14)',
    gradient: 'linear-gradient(135deg, rgba(239,68,68,0.10), rgba(248,113,113,0.04))',
    text: '#EF4444',
    glow: 'rgba(239,68,68,0.30)',
    border: 'rgba(239,68,68,0.18)',
  },
  none: {
    bg: 'transparent',
    bgHover: 'rgba(100,116,139,0.04)',
    gradient: 'none',
    text: 'var(--muted-foreground, #94A3B8)',
    glow: 'transparent',
    border: 'rgba(203,213,225,0.3)',
  },
}

const legendItems: { level: CoverageLevel; label: string }[] = [
  { level: 'over', label: '>110%' },
  { level: 'good', label: '90-110%' },
  { level: 'warn', label: '70-89%' },
  { level: 'critical', label: '<70%' },
  { level: 'none', label: 'Geen data' },
]

// ── Mini Coverage Bar (per process row) ──────────────────────────────────────

function ProcessCoverageBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(pct, 150))
  const ratio = clamped / 150
  const color =
    pct > 110 ? '#3B82F6' : pct >= 90 ? '#10B981' : pct >= 70 ? '#F59E0B' : '#EF4444'

  return (
    <div
      style={{
        width: 40,
        height: 4,
        borderRadius: 2,
        background: 'rgba(100,116,139,0.08)',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${ratio * 100}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        style={{
          height: '100%',
          borderRadius: 2,
          background: color,
        }}
      />
    </div>
  )
}

// ── Tooltip Card ─────────────────────────────────────────────────────────────

function CellTooltip({
  cell,
  processName,
  weekNum,
  level,
}: {
  cell: HeatmapCell | undefined
  processName: string
  weekNum: number
  level: CoverageLevel
}) {
  const theme = levelTheme[level]

  return (
    <motion.div
      initial={{ opacity: 0, y: 4, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.96 }}
      transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
      style={{
        position: 'absolute',
        bottom: 'calc(100% + 8px)',
        left: '50%',
        transform: 'translateX(-50%)',
        // Glassmorphism tooltip
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(12px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(12px) saturate(1.6)',
        border: '1px solid rgba(255,255,255,0.7)',
        fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
        fontSize: 11,
        lineHeight: 1.5,
        padding: '8px 12px',
        borderRadius: 10,
        pointerEvents: 'none',
        zIndex: 50,
        boxShadow: '0 8px 24px rgba(30,27,75,0.12), 0 2px 6px rgba(30,27,75,0.06)',
        minWidth: 160,
        textAlign: 'left',
      }}
    >
      {/* Header */}
      <div
        style={{
          fontWeight: 600,
          color: 'var(--foreground, #1E1B4B)',
          marginBottom: 3,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {processName}
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            color: theme.text,
            background: level === 'none' ? 'transparent' : `${theme.text}11`,
            borderRadius: 4,
            padding: '0 5px',
          }}
        >
          Wk {weekNum}
        </span>
      </div>
      {/* Data */}
      {cell && level !== 'none' ? (
        <div style={{ color: 'var(--muted-foreground, #64748B)' }}>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: theme.text }}>
            {cell.fte_available}
          </span>
          {' FTE beschikbaar van '}
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600 }}>
            {cell.fte_needed ?? '?'}
          </span>
          {' nodig'}
        </div>
      ) : (
        <div style={{ color: 'var(--muted-foreground, #94A3B8)' }}>Geen data</div>
      )}
    </motion.div>
  )
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

  // Group data by process + compute per-process avg coverage
  const { processes, cellMap } = useMemo(() => {
    const seen = new Map<string, { name: string; totalPct: number; count: number }>()
    const map = new Map<string, HeatmapCell>()

    for (const cell of data) {
      const existing = seen.get(cell.process_id)
      if (existing) {
        if (cell.status === 'computed') {
          existing.totalPct += cell.coverage_pct
          existing.count++
        }
      } else {
        seen.set(cell.process_id, {
          name: cell.process_name,
          totalPct: cell.status === 'computed' ? cell.coverage_pct : 0,
          count: cell.status === 'computed' ? 1 : 0,
        })
      }
      map.set(`${cell.process_id}::${cell.period_start}`, cell)
    }

    return {
      processes: Array.from(seen.entries()).map(([id, info]) => ({
        id,
        name: info.name,
        avgCoverage: info.count > 0 ? Math.round(info.totalPct / info.count) : 0,
      })),
      cellMap: map,
    }
  }, [data])

  return (
    <div style={{ position: 'relative' }}>
      {/* ── Legend ───────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 16,
          padding: '2px 0 10px',
        }}
      >
        {legendItems.map((item) => {
          const theme = levelTheme[item.level]
          return (
            <div
              key={item.level}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                fontSize: 10.5,
                fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                fontWeight: 500,
                color: 'var(--muted-foreground, #64748B)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: 8,
                  height: 8,
                  borderRadius: 3,
                  background:
                    item.level === 'none'
                      ? 'transparent'
                      : theme.gradient,
                  border:
                    item.level === 'none'
                      ? '1.5px dashed rgba(203,213,225,0.6)'
                      : `1.5px solid ${theme.text}44`,
                }}
              />
              {item.label}
            </div>
          )
        })}
      </div>

      {/* ── Grid ────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `180px repeat(${weeks.length}, 1fr)`,
          gap: 3,
          width: '100%',
        }}
      >
        {/* Header row */}
        <div style={{ padding: '6px 8px' }} />
        {weeks.map((week, i) => (
          <motion.div
            key={week}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...bouncy, delay: i * 0.03 }}
            style={{
              fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
              fontSize: 10.5,
              fontWeight: 600,
              color: 'var(--muted-foreground, #64748B)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              padding: '6px 4px 8px',
              textAlign: 'center',
              userSelect: 'none',
              position: 'relative',
            }}
          >
            Wk {getWeekNumber(week)}
            {/* Animated underline accent */}
            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 0.5, delay: 0.2 + i * 0.04, ease: [0.22, 1, 0.36, 1] }}
              style={{
                position: 'absolute',
                bottom: 0,
                left: '20%',
                right: '20%',
                height: 2,
                borderRadius: 1,
                background: 'linear-gradient(90deg, var(--primary, #6366F1), #818CF8)',
                opacity: 0.3,
                transformOrigin: 'center',
              }}
            />
          </motion.div>
        ))}

        {/* Data rows */}
        {processes.map((process, rowIdx) => (
          <Fragment key={process.id}>
            {/* Row label with mini coverage bar */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...bouncy, delay: rowIdx * 0.04 }}
              style={{
                fontFamily: 'var(--font-sans, "DM Sans", sans-serif)',
                fontSize: 12.5,
                fontWeight: 500,
                color: 'var(--foreground, #1E1B4B)',
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '5px 8px',
                borderRadius: 8,
                minWidth: 0,
              }}
            >
              <SmartIcon
                name={process.name}
                type="process"
                color="var(--primary, #6366F1)"
                size={13}
              />
              <span
                style={{
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                }}
              >
                {process.name}
              </span>
              {/* Mini coverage bar */}
              <ProcessCoverageBar pct={process.avgCoverage} />
            </motion.div>

            {/* Week cells */}
            {weeks.map((week, colIdx) => {
              const cell = cellMap.get(`${process.id}::${week}`)
              const level = cell ? getCoverageLevel(cell) : 'none'
              const theme = levelTheme[level]
              const isSelected =
                selectedCell?.process_id === process.id &&
                selectedCell?.period_start === week
              const isHovered =
                hoveredCell?.process_id === process.id &&
                hoveredCell?.period_start === week
              const enterDelay = (rowIdx * weeks.length + colIdx) * 0.02
              const weekNum = getWeekNumber(week)

              return (
                <motion.div
                  key={`${process.id}-${week}`}
                  initial={{ opacity: 0, scale: 0.88 }}
                  animate={{
                    opacity: 1,
                    scale: isSelected ? 1.06 : 1,
                  }}
                  transition={{ ...bouncy, delay: enterDelay }}
                  whileHover={{
                    scale: 1.08,
                    transition: { duration: 0.18, ease: [0.34, 1.56, 0.64, 1] },
                  }}
                  onClick={() => onCellClick(process.id, week)}
                  onMouseEnter={() =>
                    setHoveredCell({ process_id: process.id, period_start: week })
                  }
                  onMouseLeave={() => setHoveredCell(null)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onCellClick(process.id, week)
                    }
                  }}
                  aria-label={
                    cell
                      ? `${process.name} Wk ${weekNum}: ${cell.fte_available} FTE van ${cell.fte_needed ?? '?'} nodig`
                      : `${process.name} Wk ${weekNum}: Geen data`
                  }
                  style={{
                    position: 'relative',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '5px 4px',
                    borderRadius: 10,
                    // Gradient fill instead of flat
                    background: isHovered ? theme.bgHover : (level === 'none' ? theme.bg : theme.gradient),
                    border: isSelected
                      ? `2px solid var(--primary, #6366F1)`
                      : `1px solid ${theme.border}`,
                    boxShadow: isSelected
                      ? '0 0 0 3px rgba(99,102,241,0.15)'
                      : isHovered
                        ? `0 4px 16px ${theme.glow}`
                        : 'none',
                    cursor: 'pointer',
                    userSelect: 'none',
                    minHeight: 46,
                    transition: 'background 0.2s ease, box-shadow 0.25s ease, border 0.2s ease',
                    overflow: 'visible',
                  }}
                >
                  {/* Radial glow on hover */}
                  {isHovered && level !== 'none' && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: -2,
                        borderRadius: 12,
                        background: `radial-gradient(circle at center, ${theme.glow}, transparent 70%)`,
                        opacity: 0.4,
                        pointerEvents: 'none',
                      }}
                    />
                  )}

                  {/* Coverage percentage */}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                      fontVariantNumeric: 'tabular-nums',
                      fontSize: 13,
                      fontWeight: 700,
                      color: theme.text,
                      lineHeight: 1.3,
                      position: 'relative',
                      zIndex: 1,
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
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 9,
                        color: 'var(--muted-foreground, #64748B)',
                        lineHeight: 1.2,
                        marginTop: 1,
                        position: 'relative',
                        zIndex: 1,
                        opacity: 0.8,
                      }}
                    >
                      {cell.fte_available}/{cell.fte_needed ?? '?'}
                    </span>
                  )}

                  {/* Glassmorphism tooltip */}
                  <AnimatePresence>
                    {isHovered && (
                      <CellTooltip
                        cell={cell}
                        processName={process.name}
                        weekNum={weekNum}
                        level={level}
                      />
                    )}
                  </AnimatePresence>
                </motion.div>
              )
            })}
          </Fragment>
        ))}
      </div>
    </div>
  )
}
