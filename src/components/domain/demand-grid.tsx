'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Plus, ChevronDown, ChevronRight } from 'lucide-react'
import { containerStagger, fadeInUp, bouncy, snappy } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { WeekRangePicker } from './week-range-picker'
import { SiteSelector } from './site-selector'
import { DemandGridCell } from './demand-grid-cell'
import { SmartIcon } from './smart-icon'
import { useDemoStore } from '@/hooks/use-demo'

// ── Types ────────────────────────────────────────────────────────────────────

interface DemandGridProps {
  siteId: string
  weekRange: { start: string; end: string }
  onWeekRangeChange: (range: { start: string; end: string }) => void
}

// ── Dutch day names ──────────────────────────────────────────────────────────

const DAY_NAMES = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'] as const

// ── Helpers ──────────────────────────────────────────────────────────────────

function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Build array of Monday ISO strings between start and end (inclusive, by week). */
function buildWeekMondays(start: string, end: string): string[] {
  const weeks: string[] = []
  const cur = new Date(start + 'T00:00:00Z')
  const last = new Date(end + 'T00:00:00Z')
  while (cur <= last) {
    weeks.push(cur.toISOString().split('T')[0] as string)
    cur.setUTCDate(cur.getUTCDate() + 7)
  }
  return weeks
}

/** Format a Monday ISO date to "Wk14" style label. */
function weekLabel(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  return `Wk${getISOWeekNumber(d)}`
}

/** Get the 7 day ISO date strings for a given Monday. */
function getWeekDays(monday: string): string[] {
  const days: string[] = []
  const d = new Date(monday + 'T00:00:00Z')
  for (let i = 0; i < 7; i++) {
    days.push(d.toISOString().split('T')[0] as string)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return days
}

/** Format a date string as "30/3" */
function shortDate(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  return `${d.getUTCDate()}/${d.getUTCMonth() + 1}`
}

/** Build a simple sparkline SVG polyline from numeric values. */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const w = 72
  const h = 24
  const pad = 2
  const points = values
    .map((v, i) => {
      const x = pad + (i / (values.length - 1)) * (w - pad * 2)
      const y = h - pad - ((v - min) / range) * (h - pad * 2)
      return `${x},${y}`
    })
    .join(' ')

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      <polyline
        points={points}
        fill="none"
        stroke="rgba(99,102,241,0.5)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// ── MiniHeatmap ──────────────────────────────────────────────────────────────

function MiniHeatmap({ values }: { values: number[] }) {
  if (values.length !== 7) return null
  const max = Math.max(...values)
  if (max <= 0) return null

  const barWidth = 5
  const gap = 3
  const svgWidth = 7 * barWidth + 6 * gap // 56
  const svgHeight = 14

  return (
    <svg
      width={svgWidth}
      height={svgHeight}
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      style={{ display: 'block', margin: '2px auto 0' }}
    >
      {values.map((v, i) => {
        const ratio = max > 0 ? v / max : 0
        const barHeight = Math.max(ratio * svgHeight, ratio > 0 ? 1 : 0)
        const alpha = 0.3 + ratio * 0.5
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={svgHeight - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            fill={`rgba(99,102,241,${alpha.toFixed(2)})`}
          />
        )
      })}
    </svg>
  )
}

// ── Save indicator ───────────────────────────────────────────────────────────

function SaveIndicator({ isSaving, lastSaved }: { isSaving: boolean; lastSaved: boolean }) {
  if (!isSaving && !lastSaved) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
      <div
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: isSaving ? 'rgb(245,158,11)' : 'rgb(34,197,94)',
          transition: 'background-color 300ms',
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 500,
          color: isSaving ? 'rgb(245,158,11)' : 'var(--muted-foreground)',
        }}
      >
        {isSaving ? 'Opslaan...' : 'Opgeslagen'}
      </span>
    </div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DemandGrid({ siteId, weekRange, onWeekRangeChange }: DemandGridProps) {
  const [lastSaved, setLastSaved] = useState(false)
  const [addedProcessIds, setAddedProcessIds] = useState<Set<string>>(new Set())
  const [showProcessPicker, setShowProcessPicker] = useState(false)
  const [expandedWeeks, setExpandedWeeks] = useState<Set<string>>(new Set())
  const pickerRef = useRef<HTMLDivElement>(null)
  const isDemo = useDemoStore((s) => s.isDemo)

  const utils = trpc.useUtils()

  // Close picker on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowProcessPicker(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // ── Toggle week expand ────────────────────────────────────────────────

  const toggleWeek = useCallback((monday: string) => {
    setExpandedWeeks((prev) => {
      const next = new Set(prev)
      if (next.has(monday)) {
        next.delete(monday)
      } else {
        next.add(monday)
      }
      return next
    })
  }, [])

  // ── Data fetching ──────────────────────────────────────────────────────

  const { data: liveAllProcesses = [] } = trpc.org.listProcesses.useQuery(
    { site_id: siteId },
    { enabled: !isDemo && !!siteId },
  )
  const allProcesses = isDemo ? [] : liveAllProcesses

  const { data: liveForecasts = [] } = trpc.demand.listProcessDemand.useQuery(
    {
      site_id: siteId,
      period_start: weekRange.start,
      period_end: weekRange.end,
    },
    { enabled: !isDemo && !!siteId },
  )
  const forecasts = isDemo ? [] : liveForecasts

  const upsertDayMutation = trpc.demand.upsertProcessForecast.useMutation({
    onSuccess: () => {
      setLastSaved(true)
      void utils.demand.listProcessDemand.invalidate()
    },
    onError: (err) => {
      console.error('[DemandGrid] Day save failed:', err.message)
      window.alert(`Opslaan mislukt: ${err.message}`)
    },
  })

  const upsertWeekMutation = trpc.demand.upsertWeekForecast.useMutation({
    onSuccess: () => {
      setLastSaved(true)
      void utils.demand.listProcessDemand.invalidate()
    },
    onError: (err) => {
      console.error('[DemandGrid] Week save failed:', err.message)
      window.alert(`Opslaan mislukt: ${err.message}`)
    },
  })

  const isSaving = upsertDayMutation.isPending || upsertWeekMutation.isPending

  // ── Derived data ───────────────────────────────────────────────────────

  // Processes with existing forecasts are always shown
  const processIdsWithForecasts = useMemo(() => {
    const ids = new Set<string>()
    for (const f of forecasts) {
      if (f.process_id) ids.add(f.process_id)
    }
    return ids
  }, [forecasts])

  // Active processes = those with forecasts + manually added
  const activeProcessIds = useMemo(() => {
    return new Set([...processIdsWithForecasts, ...addedProcessIds])
  }, [processIdsWithForecasts, addedProcessIds])

  // Only show active processes in the grid
  const processes = useMemo(() => {
    return allProcesses.filter((p) => activeProcessIds.has(p.id))
  }, [allProcesses, activeProcessIds])

  // Available processes to add (not yet in grid)
  const availableProcesses = useMemo(() => {
    return allProcesses.filter((p) => !activeProcessIds.has(p.id))
  }, [allProcesses, activeProcessIds])

  const weeks = useMemo(() => buildWeekMondays(weekRange.start, weekRange.end), [weekRange])

  /** Map: "processId:date" -> forecast (day-level keying) */
  const forecastMap = useMemo(() => {
    const m = new Map<string, (typeof forecasts)[number]>()
    for (const f of forecasts) {
      if (f.process_id) {
        const dateKey = typeof f.period_start === 'string'
          ? f.period_start.split('T')[0]
          : f.period_start
        m.set(`${f.process_id}:${dateKey}`, f)
      }
    }
    return m
  }, [forecasts])

  /** Get day volumes for a process+week (7 values, Mon-Sun). */
  const getWeekDayVolumes = useCallback(
    (processId: string, monday: string): number[] => {
      const days = getWeekDays(monday)
      return days.map((d) => {
        const f = forecastMap.get(`${processId}:${d}`)
        return f?.volume ? Number(f.volume) : 0
      })
    },
    [forecastMap],
  )

  /** Get week total for a process+week. */
  const getWeekTotal = useCallback(
    (processId: string, monday: string): number => {
      return getWeekDayVolumes(processId, monday).reduce((a, b) => a + b, 0)
    },
    [getWeekDayVolumes],
  )

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleWeekCellChange = useCallback(
    (processId: string, monday: string, volume: number, uom: string) => {
      if (isDemo) return
      upsertWeekMutation.mutate({
        site_id: siteId,
        process_id: processId,
        week_start: monday,
        volume,
        unit_of_measure: uom,
      })
    },
    [siteId, upsertWeekMutation, isDemo],
  )

  const handleDayCellChange = useCallback(
    (processId: string, date: string, volume: number, uom: string) => {
      if (isDemo) return
      upsertDayMutation.mutate({
        site_id: siteId,
        process_id: processId,
        date,
        volume,
        unit_of_measure: uom,
      })
    },
    [siteId, upsertDayMutation, isDemo],
  )

  // ── Compute total hours per process ────────────────────────────────────

  const getProcessTotalHours = useCallback(
    (processId: string, normUph: number): number | null => {
      if (normUph <= 0) return null
      let totalVolume = 0
      for (const w of weeks) {
        totalVolume += getWeekTotal(processId, w)
      }
      return Math.round((totalVolume / normUph) * 10) / 10
    },
    [weeks, getWeekTotal],
  )

  const getHoursColor = useCallback(
    (hours: number | null): string => {
      if (hours === null) return 'var(--muted-foreground)'
      const weekCount = weeks.length || 1
      const avgPerWeek = hours / weekCount
      if (avgPerWeek > 60) return '#EF4444'
      if (avgPerWeek > 40) return '#F59E0B'
      return '#10B981'
    },
    [weeks],
  )

  // ── Styles ─────────────────────────────────────────────────────────────

  const toolbarStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '12px 16px',
    borderBottom: '1px solid var(--border)',
    backgroundColor: 'rgba(99,102,241,0.02)',
    borderRadius: '12px 12px 0 0',
  }

  const gridWrapperStyle: React.CSSProperties = {
    overflowX: 'auto',
    padding: 16,
  }

  const tableStyle: React.CSSProperties = {
    width: '100%',
    borderCollapse: 'separate',
    borderSpacing: '4px 4px',
  }

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--muted-foreground)',
    textAlign: 'center',
    padding: '6px 8px',
    whiteSpace: 'nowrap',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  }

  const rowLabelStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 10px',
    borderRadius: 8,
    userSelect: 'none',
    minWidth: 180,
  }

  const nameStyle: React.CSSProperties = {
    fontFamily: 'var(--font-display)',
    fontSize: 13,
    fontWeight: 600,
    color: 'var(--foreground)',
    lineHeight: 1.3,
  }

  const subtitleStyle: React.CSSProperties = {
    fontFamily: 'var(--font-body)',
    fontSize: 10,
    color: 'var(--muted-foreground)',
    lineHeight: 1.3,
    marginTop: 1,
  }

  const uomBadgeStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 9,
    fontWeight: 500,
    color: 'var(--muted-foreground)',
    background: 'rgba(99,102,241,0.06)',
    borderRadius: 4,
    padding: '1px 5px',
    marginLeft: 4,
    whiteSpace: 'nowrap',
  }

  const weekPillStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '4px 10px',
    borderRadius: 20,
    border: 'none',
    background: 'rgba(99,102,241,0.08)',
    cursor: 'pointer',
    fontFamily: 'var(--font-mono)',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--primary)',
    whiteSpace: 'nowrap',
    transition: 'background 150ms',
  }

  const dayThStyle: React.CSSProperties = {
    ...thStyle,
    fontSize: 10,
    padding: '4px 6px',
    minWidth: 70,
  }

  const sumThStyle: React.CSSProperties = {
    ...dayThStyle,
    color: 'var(--muted-foreground)',
    opacity: 0.7,
  }

  const weekendCellBg = 'rgba(99,102,241,0.03)'

  const expandedBorderStyle: React.CSSProperties = {
    borderLeft: '2px solid rgba(99,102,241,0.25)',
  }

  // ── Build header columns ───────────────────────────────────────────────

  const renderHeaderCells = () => {
    const cells: React.ReactNode[] = []

    for (const w of weeks) {
      const isExpanded = expandedWeeks.has(w)

      if (isExpanded) {
        const days = getWeekDays(w)
        days.forEach((d, idx) => {
          const isWeekend = idx >= 5
          cells.push(
            <th
              key={`day-${d}`}
              style={{
                ...dayThStyle,
                ...(idx === 0 ? expandedBorderStyle : {}),
                background: isWeekend ? weekendCellBg : undefined,
              }}
            >
              <div>{DAY_NAMES[idx]}</div>
              <div style={{ fontSize: 9, fontWeight: 400, opacity: 0.7 }}>
                {shortDate(d)}
              </div>
            </th>,
          )
        })
        // Sum column
        cells.push(
          <th key={`sum-${w}`} style={sumThStyle}>
            <div
              style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3 }}
              onClick={() => toggleWeek(w)}
            >
              <motion.span
                animate={{ rotate: 90 }}
                transition={snappy}
                style={{ display: 'inline-flex' }}
              >
                <ChevronRight size={11} />
              </motion.span>
              {'\u03A3'}
            </div>
          </th>,
        )
      } else {
        cells.push(
          <th key={`week-${w}`} style={thStyle}>
            <motion.button
              onClick={() => toggleWeek(w)}
              style={weekPillStyle}
              whileHover={{ background: 'rgba(99,102,241,0.14)' }}
              whileTap={{ scale: 0.96 }}
              transition={snappy}
            >
              <motion.span
                animate={{ rotate: 0 }}
                transition={snappy}
                style={{ display: 'inline-flex' }}
              >
                <ChevronRight size={11} />
              </motion.span>
              {weekLabel(w)}
            </motion.button>
          </th>,
        )
      }
    }

    return cells
  }

  // ── Render row cells for a given process ───────────────────────────────

  const renderRowCells = (proc: typeof processes[number]) => {
    const normUph = proc.norm_uph ?? 0
    const uom = proc.unit_of_measure ?? ''
    const cells: React.ReactNode[] = []

    for (const w of weeks) {
      const isExpanded = expandedWeeks.has(w)
      const dayVolumes = getWeekDayVolumes(proc.id, w)

      if (isExpanded) {
        const days = getWeekDays(w)
        days.forEach((d, idx) => {
          const isWeekend = idx >= 5
          const f = forecastMap.get(`${proc.id}:${d}`)
          const volume = f?.volume ? Number(f.volume) : null
          const computedHours =
            volume !== null && normUph > 0
              ? Math.round((volume / normUph) * 10) / 10
              : null

          cells.push(
            <td
              key={`day-${proc.id}-${d}`}
              style={{
                verticalAlign: 'top',
                padding: 2,
                ...(idx === 0 ? expandedBorderStyle : {}),
                background: isWeekend ? weekendCellBg : undefined,
              }}
            >
              <DemandGridCell
                value={volume}
                computedHours={computedHours}
                onChange={(vol) => handleDayCellChange(proc.id, d, vol, uom)}
                isLoading={false}
              />
            </td>,
          )
        })

        // Sum column (non-editable)
        const weekTotal = dayVolumes.reduce((a, b) => a + b, 0)
        const sumHours =
          weekTotal > 0 && normUph > 0
            ? Math.round((weekTotal / normUph) * 10) / 10
            : null

        cells.push(
          <td
            key={`sum-${proc.id}-${w}`}
            style={{ verticalAlign: 'top', padding: 2 }}
          >
            <div
              style={{
                padding: '4px 8px',
                borderRadius: 8,
                background: 'rgba(99,102,241,0.03)',
                border: '1px solid rgba(99,102,241,0.08)',
                minWidth: 70,
                opacity: 0.7,
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 13,
                  fontWeight: 500,
                  textAlign: 'right',
                  color: 'var(--muted-foreground)',
                  lineHeight: 1.4,
                }}
              >
                {weekTotal > 0 ? weekTotal.toLocaleString('nl-NL') : '\u2014'}
              </div>
              {sumHours !== null && (
                <div
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: 'var(--muted-foreground)',
                    textAlign: 'right',
                    lineHeight: 1.2,
                    marginTop: 1,
                  }}
                >
                  {'\u2192'} {sumHours.toLocaleString('nl-NL')}h
                </div>
              )}
            </div>
          </td>,
        )
      } else {
        // Collapsed week cell
        const weekTotal = dayVolumes.reduce((a, b) => a + b, 0)
        const computedHours =
          weekTotal > 0 && normUph > 0
            ? Math.round((weekTotal / normUph) * 10) / 10
            : null

        cells.push(
          <td
            key={`week-${proc.id}-${w}`}
            style={{ verticalAlign: 'top', padding: 2 }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
              <DemandGridCell
                value={weekTotal > 0 ? weekTotal : null}
                computedHours={computedHours}
                onChange={(vol) => handleWeekCellChange(proc.id, w, vol, uom)}
                isLoading={false}
              />
              <MiniHeatmap values={dayVolumes} />
            </div>
          </td>,
        )
      }
    }

    return cells
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        borderRadius: 12,
        border: '1px solid var(--border)',
        backgroundColor: 'var(--card)',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div style={toolbarStyle}>
        <SiteSelector />
        <WeekRangePicker value={weekRange} onChange={onWeekRangeChange} />
        {/* Add process button */}
        {availableProcesses.length > 0 && (
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowProcessPicker((v) => !v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                border: 'none', background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                color: '#FFFFFF', fontFamily: 'var(--font-body)', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <Plus size={14} />
              Proces
              <ChevronDown size={12} style={{ opacity: 0.7 }} />
            </motion.button>

            <AnimatePresence>
              {showProcessPicker && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                    width: 260, maxHeight: 300, overflowY: 'auto',
                    backgroundColor: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--elevation-3)',
                    zIndex: 20, padding: '4px 0',
                  }}
                >
                  {availableProcesses.map((proc) => (
                    <button
                      key={proc.id}
                      onClick={() => {
                        setAddedProcessIds((prev) => new Set([...prev, proc.id]))
                        setShowProcessPicker(false)
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        width: '100%', padding: '8px 12px', border: 'none',
                        background: 'transparent', cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'var(--muted)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                    >
                      <SmartIcon name={proc.name} type="process" color="var(--primary)" size={16} />
                      <div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
                          {proc.name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--muted-foreground)' }}>
                          {proc.unit_of_measure} · {proc.norm_uph}/hr
                        </div>
                      </div>
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <SaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
      </div>

      {/* Grid */}
      <div style={gridWrapperStyle}>
        <motion.table
          style={tableStyle}
          variants={containerStagger}
          initial="hidden"
          animate="show"
        >
          {/* Header row */}
          <thead>
            <tr>
              <th style={{ ...thStyle, textAlign: 'left', minWidth: 180 }}>Proces</th>
              <th style={{ ...thStyle, width: 80 }}>Trend</th>
              {renderHeaderCells()}
              <th style={{ ...thStyle, width: 70 }}>Uren</th>
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {processes.map((proc) => {
              const normUph = proc.norm_uph ?? 0
              const uom = proc.unit_of_measure ?? ''

              // Sparkline values (week totals for first 6 weeks)
              const sparklineValues = weeks
                .slice(0, 6)
                .map((w) => getWeekTotal(proc.id, w))

              // Total hours
              const totalHours = getProcessTotalHours(proc.id, normUph)
              const hoursColor = getHoursColor(totalHours)

              return (
                <motion.tr key={proc.id} variants={fadeInUp}>
                  {/* Row label */}
                  <td style={{ verticalAlign: 'top', padding: 0 }}>
                    <div style={rowLabelStyle}>
                      <SmartIcon
                        name={proc.name}
                        type="process"
                        color="var(--primary)"
                        size={18}
                      />
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center' }}>
                          <span style={nameStyle}>{proc.name}</span>
                          {uom && <span style={uomBadgeStyle}>{uom}</span>}
                        </div>
                        {normUph > 0 && (
                          <div style={subtitleStyle}>
                            {normUph.toLocaleString('nl-NL')}/hr
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Sparkline cell */}
                  <td style={{ verticalAlign: 'top', padding: '10px 4px' }}>
                    <Sparkline values={sparklineValues} />
                  </td>

                  {/* Week / day cells */}
                  {renderRowCells(proc)}

                  {/* Total hours cell */}
                  <td style={{ verticalAlign: 'top', padding: 2 }}>
                    <div
                      style={{
                        padding: '6px 8px',
                        borderRadius: 8,
                        textAlign: 'right',
                      }}
                    >
                      <span
                        style={{
                          fontFamily: 'var(--font-mono)',
                          fontVariantNumeric: 'tabular-nums',
                          fontSize: 13,
                          fontWeight: 600,
                          color: hoursColor,
                        }}
                      >
                        {totalHours !== null
                          ? `${totalHours.toLocaleString('nl-NL')}h`
                          : '\u2014'}
                      </span>
                    </div>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </motion.table>

        {/* Empty state */}
        {processes.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={bouncy}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              textAlign: 'center',
              padding: '56px 24px',
              gap: 12,
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <TrendingUp size={22} style={{ color: 'var(--primary)' }} />
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700,
              color: 'var(--foreground)',
            }}>
              {allProcesses.length === 0 ? 'Geen processen gevonden' : 'Voeg processen toe aan het grid'}
            </div>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 13,
              color: 'var(--muted-foreground)', maxWidth: 300,
            }}>
              {allProcesses.length === 0
                ? 'Maak eerst processen aan via het Processen scherm.'
                : 'Klik op "+ Proces" hierboven om demand-driven processen toe te voegen.'}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  )
}
