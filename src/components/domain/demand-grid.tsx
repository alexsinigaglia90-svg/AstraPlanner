'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion } from 'framer-motion'
import { TrendingUp, Plus } from 'lucide-react'
import { containerStagger, fadeInUp, bouncy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { WeekRangePicker } from './week-range-picker'
import { SiteSelector } from './site-selector'
import { DemandGridCell } from './demand-grid-cell'
import { CascadePreview } from './cascade-preview'
import { PasteHandler } from './paste-handler'
import { ExcelDropZone } from './excel-drop-zone'
import { SmartIcon } from './smart-icon'
import { DemandTypeWizard } from './demand-type-wizard'
import type { ImportRow } from './excel-drop-zone'
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
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const isDemo = useDemoStore((s) => s.isDemo)

  const utils = trpc.useUtils()

  // ── Data fetching ──────────────────────────────────────────────────────

  const { data: liveDemandTypes = [] } = trpc.demand.listDemandTypes.useQuery({}, { enabled: !isDemo })
  const demandTypes = isDemo ? [] : liveDemandTypes

  const { data: liveForecasts = [] } = trpc.demand.listForecasts.useQuery({
    site_id: siteId,
    period_start: weekRange.start,
    period_end: weekRange.end,
  }, { enabled: !isDemo })
  const forecasts = isDemo ? [] : liveForecasts

  const upsertForecast = trpc.demand.upsertForecast.useMutation({
    onSuccess: () => {
      setLastSaved(true)
      void utils.demand.listForecasts.invalidate()
    },
  })

  const bulkUpsert = trpc.demand.bulkUpsert.useMutation({
    onSuccess: () => {
      setLastSaved(true)
      void utils.demand.listForecasts.invalidate()
    },
  })

  const upsertOverride = trpc.demand.upsertOverride.useMutation({
    onSuccess: () => {
      void utils.demand.listForecasts.invalidate()
    },
  })

  const isSaving = upsertForecast.isPending || bulkUpsert.isPending

  // ── Derived data ───────────────────────────────────────────────────────

  const weeks = useMemo(() => buildWeekMondays(weekRange.start, weekRange.end), [weekRange])

  /** Map: "demandTypeId:monday" -> forecast */
  const forecastMap = useMemo(() => {
    const m = new Map<string, (typeof forecasts)[number]>()
    for (const f of forecasts) {
      m.set(`${f.demand_type_id}:${f.period_start}`, f)
    }
    return m
  }, [forecasts])

  /** Map for existing data (for PasteHandler): "demandTypeId:monday" -> volume */
  const existingDataMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const f of forecasts) {
      m.set(`${f.demand_type_id}:${f.period_start}`, f.volume)
    }
    return m
  }, [forecasts])

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleCellChange = useCallback(
    (demandTypeId: string, monday: string, volume: number) => {
      if (isDemo) return
      upsertForecast.mutate({
        site_id: siteId,
        demand_type_id: demandTypeId,
        period_start: monday,
        period_end: periodEnd(monday),
        volume,
        source: 'manual_entry',
      })
    },
    [siteId, upsertForecast],
  )

  const handlePasteConfirm = useCallback(
    (cells: Array<{ demand_type_id: string; period_start: string; volume: number }>) => {
      if (isDemo || cells.length === 0) return
      bulkUpsert.mutate({
        forecasts: cells.map((c) => ({
          site_id: siteId,
          demand_type_id: c.demand_type_id,
          period_start: c.period_start,
          period_end: periodEnd(c.period_start),
          volume: c.volume,
          source: 'manual_entry' as const,
        })),
      })
    },
    [siteId, bulkUpsert],
  )

  const handleExcelImport = useCallback(
    (rows: ImportRow[]) => {
      if (isDemo || rows.length === 0) return
      bulkUpsert.mutate({
        forecasts: rows.map((r) => ({
          site_id: siteId,
          demand_type_id: r.demand_type_id,
          period_start: r.period_start,
          period_end: periodEnd(r.period_start),
          volume: r.volume,
          source: 'csv_upload' as const,
        })),
      })
    },
    [siteId, bulkUpsert],
  )

  const handleOverrideChange = useCallback(
    (forecastId: string, processId: string, volume: number | null) => {
      if (isDemo) return
      upsertOverride.mutate({
        demand_forecast_id: forecastId,
        process_id: processId,
        override_volume: volume,
      })
    },
    [upsertOverride],
  )

  const toggleExpanded = useCallback((typeId: string) => {
    setExpandedTypeId((prev) => (prev === typeId ? null : typeId))
  }, [])

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
    cursor: 'pointer',
    borderRadius: 8,
    userSelect: 'none',
    transition: 'background-color 150ms',
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
        {demandTypes.length > 0 && (
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => setWizardOpen(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '6px 12px', borderRadius: 8,
              border: 'none',
              background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
              color: '#fff', fontFamily: 'var(--font-body)',
              fontSize: 12, fontWeight: 600,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <Plus size={14} /> Demand Type
          </motion.button>
        )}
        <SaveIndicator isSaving={isSaving} lastSaved={lastSaved} />
      </div>

      {/* Excel drop zone wrapping paste handler wrapping grid */}
      <ExcelDropZone demandTypes={demandTypes} onImport={handleExcelImport}>
        <PasteHandler
          demandTypes={demandTypes}
          weeks={weeks}
          existingData={existingDataMap}
          onConfirm={handlePasteConfirm}
          onCancel={() => {}}
        >
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
                  <th style={{ ...thStyle, textAlign: 'left', minWidth: 180 }}>{/* label col */}</th>
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
                {demandTypes.map((dt) => {
                  const subtitle = dt.process_mappings
                    .map((pm) => pm.process_name)
                    .filter(Boolean)
                    .join(', ')

                  // Sparkline: last 6 weeks of data for this type
                  const sparklineValues = weeks
                    .slice(0, 6)
                    .map((w) => forecastMap.get(`${dt.id}:${w}`)?.volume ?? 0)

                  const isExpanded = expandedTypeId === dt.id

                  // Build cascade processes for the expanded row (first week with data)
                  const cascadeWeek = weeks.find((w) => forecastMap.has(`${dt.id}:${w}`))
                  const cascadeForecast = cascadeWeek
                    ? forecastMap.get(`${dt.id}:${cascadeWeek}`)
                    : undefined
                  const cascadeVolume = cascadeForecast?.volume ?? 0

                  const cascadeProcesses = dt.process_mappings.map((pm) => ({
                    process_id: pm.process_id,
                    process_name: pm.process_name,
                    conversion_ratio: pm.conversion_ratio,
                    calculated_volume: cascadeVolume * pm.conversion_ratio,
                    override_volume: null as number | null,
                  }))

                  return (
                    <motion.tr key={dt.id} variants={fadeInUp}>
                      {/* Row label cell — spans full row visually via inner layout */}
                      <td style={{ verticalAlign: 'top', padding: 0 }}>
                        <div
                          style={rowLabelStyle}
                          onClick={() => toggleExpanded(dt.id)}
                          onMouseEnter={(e) => {
                            ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                              'rgba(99,102,241,0.04)'
                          }}
                          onMouseLeave={(e) => {
                            ;(e.currentTarget as HTMLDivElement).style.backgroundColor =
                              'transparent'
                          }}
                        >
                          <SmartIcon
                            name={dt.name}
                            type="process"
                            color="var(--primary)"
                            size={18}
                          />
                          <div>
                            <div style={nameStyle}>{dt.name}</div>
                            {subtitle && (
                              <div style={subtitleStyle}>
                                &rarr; {subtitle}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Cascade preview — underneath the label */}
                        {isExpanded && cascadeForecast && (
                          <CascadePreview
                            demandTypeName={dt.name}
                            volume={cascadeVolume}
                            processes={cascadeProcesses}
                            onOverrideChange={(processId, volume) => {
                              if (cascadeForecast) {
                                handleOverrideChange(cascadeForecast.id, processId, volume)
                              }
                            }}
                            isExpanded={isExpanded}
                          />
                        )}
                      </td>

                      {/* Sparkline cell */}
                      <td style={{ verticalAlign: 'top', padding: '10px 4px' }}>
                        <Sparkline values={sparklineValues} />
                      </td>

                      {/* Week cells */}
                      {weeks.map((w) => {
                        const forecast = forecastMap.get(`${dt.id}:${w}`)
                        return (
                          <td key={w} style={{ verticalAlign: 'top', padding: 2 }}>
                            <DemandGridCell
                              value={forecast?.volume ?? null}
                              computedHours={null}
                              onChange={(vol) => handleCellChange(dt.id, w, vol)}
                              isLoading={upsertForecast.isPending}
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
            {demandTypes.length === 0 && (
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
                  Geen demand types geconfigureerd
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 13,
                  color: 'var(--muted-foreground)', maxWidth: 300,
                }}>
                  Maak een demand type aan om volumes in te voeren
                </div>
                <motion.button
                  variants={scalePress}
                  whileTap="press"
                  onClick={() => setWizardOpen(true)}
                  style={{
                    marginTop: 8,
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '10px 20px', borderRadius: 8,
                    border: 'none',
                    background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                    color: '#fff', fontFamily: 'var(--font-body)',
                    fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                  }}
                >
                  <Plus size={16} /> Demand Type
                </motion.button>
              </motion.div>
            )}
          </div>
        </PasteHandler>
      </ExcelDropZone>

      <DemandTypeWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        siteId={siteId}
        onSaved={() => setWizardOpen(false)}
      />
    </div>
  )
}
