'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TrendingUp, Plus, ChevronDown } from 'lucide-react'
import { containerStagger, fadeInUp, bouncy } from '@/lib/motion'
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

/** Compute period_end (Sunday) for a given Monday. */
function periodEnd(monday: string): string {
  const d = new Date(monday + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().split('T')[0] as string
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

  const upsertProcessForecast = trpc.demand.upsertProcessForecast.useMutation({
    onSuccess: () => {
      setLastSaved(true)
      void utils.demand.listProcessDemand.invalidate()
    },
  })

  const isSaving = upsertProcessForecast.isPending

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

  /** Map: "processId:monday" -> forecast */
  const forecastMap = useMemo(() => {
    const m = new Map<string, (typeof forecasts)[number]>()
    for (const f of forecasts) {
      if (f.process_id) {
        const periodKey = typeof f.period_start === 'string'
          ? f.period_start.split('T')[0]
          : f.period_start
        m.set(`${f.process_id}:${periodKey}`, f)
      }
    }
    return m
  }, [forecasts])

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleCellChange = useCallback(
    (processId: string, monday: string, volume: number, uom: string) => {
      if (isDemo) return
      upsertProcessForecast.mutate({
        site_id: siteId,
        process_id: processId,
        period_start: monday,
        period_end: periodEnd(monday),
        volume,
        unit_of_measure: uom,
      })
    },
    [siteId, upsertProcessForecast, isDemo],
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
              {weeks.map((w) => (
                <th key={w} style={thStyle}>
                  {weekLabel(w)}
                </th>
              ))}
            </tr>
          </thead>

          {/* Body */}
          <tbody>
            {processes.map((proc) => {
              const normUph = proc.norm_uph ?? 0
              const uom = proc.unit_of_measure ?? ''

              // Sparkline values
              const sparklineValues = weeks
                .slice(0, 6)
                .map((w) => {
                  const f = forecastMap.get(`${proc.id}:${w}`)
                  return f?.volume ? Number(f.volume) : 0
                })

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

                  {/* Week cells */}
                  {weeks.map((w) => {
                    const forecast = forecastMap.get(`${proc.id}:${w}`)
                    const volume = forecast?.volume ? Number(forecast.volume) : null
                    const computedHours = volume !== null && normUph > 0
                      ? Math.round((volume / normUph) * 10) / 10
                      : null

                    return (
                      <td key={w} style={{ verticalAlign: 'top', padding: 2 }}>
                        <DemandGridCell
                          value={volume}
                          computedHours={computedHours}
                          onChange={(vol) => handleCellChange(proc.id, w, vol, uom)}
                          isLoading={upsertProcessForecast.isPending}
                        />
                      </td>
                    )
                  })}
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
