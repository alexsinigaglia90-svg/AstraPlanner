/**
 * Demo demand & workload seed data for the "Showcase the Solver" demo mode.
 *
 * 4-week horizon (Wk10–Wk13) with a Black Friday peak in Wk12.
 * Shapes match tRPC responses: demand.listProcessDemand + workload.getForPlan.
 */

import {
  DEMO_SITE_AMS,
  PROC_ORDER_PICKING,
  PROC_INBOUND,
  PROC_PACKING,
  PROC_VAS,
  PROC_SHIPPING,
  PROC_RETURNS,
} from './demo-seed-processes'

// ── Week mondays ─────────────────────────────────────────────────────────────

export const DEMO_WEEK_10 = '2026-03-02'
export const DEMO_WEEK_11 = '2026-03-09'
export const DEMO_WEEK_12 = '2026-03-16' // PEAK
export const DEMO_WEEK_13 = '2026-03-23' // Absence scenario

export const DEMO_WEEKS = [DEMO_WEEK_10, DEMO_WEEK_11, DEMO_WEEK_12, DEMO_WEEK_13]

// ── Helpers ──────────────────────────────────────────────────────────────────

function days(monday: string): string[] {
  const result: string[] = []
  const d = new Date(monday + 'T00:00:00Z')
  for (let i = 0; i < 7; i++) {
    result.push(d.toISOString().split('T')[0]!)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return result
}

let _forecastId = 1
function fid(): string {
  return `demo-fc-${String(_forecastId++).padStart(4, '0')}`
}

let _wlId = 1
function wid(): string {
  return `demo-wl-${String(_wlId++).padStart(4, '0')}`
}

// ── Process metadata ─────────────────────────────────────────────────────────

interface ProcessMeta {
  id: string
  name: string
  uom: string
  norm_uph: number
  category: string | null
  process_type: string
}

const PROCESSES: ProcessMeta[] = [
  { id: PROC_ORDER_PICKING, name: 'Order Picking',      uom: 'lines',     norm_uph: 120, category: null, process_type: 'productive' },
  { id: PROC_PACKING,       name: 'Packing',            uom: 'packs',     norm_uph: 80,  category: null, process_type: 'productive' },
  { id: PROC_INBOUND,       name: 'Inbound Receiving',  uom: 'pallets',   norm_uph: 25,  category: null, process_type: 'productive' },
  { id: PROC_VAS,           name: 'VAS',                uom: 'items',     norm_uph: 40,  category: null, process_type: 'productive' },
  { id: PROC_SHIPPING,      name: 'Shipping',           uom: 'shipments', norm_uph: 60,  category: null, process_type: 'productive' },
  { id: PROC_RETURNS,       name: 'Returns Processing', uom: 'returns',   norm_uph: 30,  category: null, process_type: 'productive' },
]

// ── Weekly demand volumes ────────────────────────────────────────────────────
// Key: processId → [wk10, wk11, wk12_PEAK, wk13_absence]

const WEEKLY_VOLUMES: Record<string, [number, number, number, number]> = {
  [PROC_ORDER_PICKING]: [14400, 15000, 32000, 16000],
  [PROC_PACKING]:       [10000, 10500, 24000, 11000],
  [PROC_INBOUND]:       [500,   520,   600,   480],
  [PROC_VAS]:           [2000,  2100,  4500,  2200],
  [PROC_SHIPPING]:      [8000,  8400,  20000, 9000],
  [PROC_RETURNS]:       [1500,  1600,  2000,  4500],
}

// Daily distribution pattern (Mon–Sun weights, sum≈1.0)
// Heavier Mon–Fri, lighter Sat, zero Sun
const DAY_WEIGHTS = [0.18, 0.18, 0.17, 0.17, 0.17, 0.13, 0.00]

// ── Generate demand forecasts ────────────────────────────────────────────────
// Shape: { id, process_id, period_start, period_end, volume, unit_of_measure, source }

interface DemoForecast {
  id: string
  process_id: string
  period_start: string
  period_end: string
  volume: number
  unit_of_measure: string
  source: string
}

function generateForecasts(): DemoForecast[] {
  const result: DemoForecast[] = []

  for (const proc of PROCESSES) {
    const vols = WEEKLY_VOLUMES[proc.id]!
    for (let wi = 0; wi < 4; wi++) {
      const weekDays = days(DEMO_WEEKS[wi]!)
      const weekVol = vols[wi]!

      for (let di = 0; di < 7; di++) {
        const dayVol = Math.round(weekVol * DAY_WEIGHTS[di]!)
        if (dayVol === 0) continue
        result.push({
          id: fid(),
          process_id: proc.id,
          period_start: weekDays[di]!,
          period_end: weekDays[di]!,
          volume: dayVol,
          unit_of_measure: proc.uom,
          source: 'forecast',
        })
      }
    }
  }

  return result
}

export const demoDemandForecasts = generateForecasts()

// ── Generate workload plan rows ──────────────────────────────────────────────
// Shape: same as workload_plan table / trpc.workload.getForPlan response
// Each row = one process × one day
//
// Fields: id, process_id, period_start, period_end,
//   demand_volume, conversion_ratio, process_volume,
//   weighted_uph, hours_needed, fte_needed,
//   hours_assigned, fte_assigned, coverage_pct, status,
//   process (joined: { name, category, process_type })

interface DemoWorkloadRow {
  id: string
  process_id: string
  period_start: string
  period_end: string
  demand_volume: number
  conversion_ratio: number
  process_volume: number
  weighted_uph: number
  hours_needed: number
  fte_needed: number
  hours_assigned: number
  fte_assigned: number
  coverage_pct: number
  status: 'computed' | 'no_norm'
  process: { name: string; category: string | null; process_type: string | null }
}

// Available FTE per day (based on 20 AMS employees, 3 shifts × 8h each)
// Normal: ~14 FTE/day available (some part-time/flex)
// Reduced in wk13 due to 3 absences: ~11.5 FTE/day
const BASE_FTE_AVAILABLE = 14
const ABSENCE_FTE_AVAILABLE = 11.5

// FTE distribution per process (proportional to staffing needs)
// These ratios determine how available FTE is spread across processes
const FTE_SHARE: Record<string, number> = {
  [PROC_ORDER_PICKING]: 0.30,
  [PROC_PACKING]:       0.22,
  [PROC_INBOUND]:       0.15,
  [PROC_VAS]:           0.10,
  [PROC_SHIPPING]:      0.15,
  [PROC_RETURNS]:       0.08,
}

function generateWorkload(): DemoWorkloadRow[] {
  const result: DemoWorkloadRow[] = []

  for (const proc of PROCESSES) {
    const vols = WEEKLY_VOLUMES[proc.id]!
    const share = FTE_SHARE[proc.id] ?? 0.1

    for (let wi = 0; wi < 4; wi++) {
      const weekDays = days(DEMO_WEEKS[wi]!)
      const weekVol = vols[wi]!
      const isAbsenceWeek = wi === 3
      const dailyFtePool = isAbsenceWeek ? ABSENCE_FTE_AVAILABLE : BASE_FTE_AVAILABLE

      for (let di = 0; di < 7; di++) {
        const dayVol = Math.round(weekVol * DAY_WEIGHTS[di]!)
        if (dayVol === 0) continue

        const hoursNeeded = dayVol / proc.norm_uph
        const fteNeeded = hoursNeeded / 8 // 8-hour shift
        const fteAvailable = Math.round(dailyFtePool * share * 10) / 10
        const hoursAvailable = fteAvailable * 8
        const coveragePct = fteNeeded > 0
          ? Math.min(Math.round((fteAvailable / fteNeeded) * 100), 200)
          : 100

        result.push({
          id: wid(),
          process_id: proc.id,
          period_start: weekDays[di]!,
          period_end: weekDays[di]!,
          demand_volume: dayVol,
          conversion_ratio: 1,
          process_volume: dayVol,
          weighted_uph: proc.norm_uph,
          hours_needed: Math.round(hoursNeeded * 10) / 10,
          fte_needed: Math.round(fteNeeded * 10) / 10,
          hours_assigned: Math.round(hoursAvailable * 10) / 10,
          fte_assigned: fteAvailable,
          coverage_pct: coveragePct,
          status: 'computed',
          process: {
            name: proc.name,
            category: proc.category,
            process_type: proc.process_type,
          },
        })
      }
    }
  }

  return result
}

export const demoWorkloadRows = generateWorkload()

// ── Pre-aggregated heatmap cells (process × week) ────────────────────────────
// Shape: { process_id, process_name, period_start (monday), coverage_pct, fte_needed, fte_available, status }

export interface DemoHeatmapCell {
  process_id: string
  process_name: string
  period_start: string
  coverage_pct: number
  fte_needed: number | null
  fte_available: number
  status: 'computed' | 'no_norm'
}

function generateHeatmap(): DemoHeatmapCell[] {
  const cells: DemoHeatmapCell[] = []

  for (const proc of PROCESSES) {
    for (const monday of DEMO_WEEKS) {
      // Aggregate daily rows for this process+week
      const weekRows = demoWorkloadRows.filter(
        (r) => r.process_id === proc.id && r.period_start >= monday &&
          r.period_start < nextMonday(monday),
      )

      const totalNeeded = weekRows.reduce((s, r) => s + r.fte_needed, 0)
      const totalAvailable = weekRows.reduce((s, r) => s + r.fte_assigned, 0)
      const count = weekRows.length || 1
      const avgNeeded = totalNeeded / count
      const avgAvailable = totalAvailable / count
      const coveragePct = avgNeeded > 0
        ? Math.round((avgAvailable / avgNeeded) * 100)
        : 100

      cells.push({
        process_id: proc.id,
        process_name: proc.name,
        period_start: monday,
        coverage_pct: coveragePct,
        fte_needed: Math.round(avgNeeded * 10) / 10,
        fte_available: Math.round(avgAvailable * 10) / 10,
        status: 'computed',
      })
    }
  }

  return cells
}

function nextMonday(monday: string): string {
  const d = new Date(monday + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 7)
  return d.toISOString().split('T')[0]!
}

export const demoHeatmapCells = generateHeatmap()
