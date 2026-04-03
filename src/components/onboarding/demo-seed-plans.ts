/**
 * Demo plan seed data — 3 pre-computed solver scenarios.
 *
 * Scenario A: "Normal" (Wk10)  — 96% coverage, EUR 28.400, 4u overwerk
 * Scenario B: "Peak"   (Wk12)  — 88% coverage, EUR 42.100, 32u overwerk
 * Scenario C: "Absence" (Wk13) — 84% coverage, EUR 31.200, 28u overwerk
 *
 * Shapes match the plan detail page expectations:
 * - Plan metadata: PlanVersion shape from planning.listPlanVersions
 * - Assignments: PlanGrid Assignment shape (employee_id, process_id, assignment_date, etc.)
 * - Metrics: SummaryMetrics from planning.getPlanVersion
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
import { DEMO_WEEK_10, DEMO_WEEK_12, DEMO_WEEK_13 } from './demo-seed-demand'

// ── Plan IDs ─────────────────────────────────────────────────────────────────

export const DEMO_PLAN_NORMAL  = 'demo-plan-normal'
export const DEMO_PLAN_PEAK    = 'demo-plan-peak'
export const DEMO_PLAN_ABSENCE = 'demo-plan-absence'

// ── Shift IDs (from demo-seed) ───────────────────────────────────────────────

const SHIFT_OCHTEND = 'demo-shft-0000-0000-0000-000000000001'
const SHIFT_MIDDAG  = 'demo-shft-0000-0000-0000-000000000002'
const SHIFT_NACHT   = 'demo-shft-0000-0000-0000-000000000003'

// ── Employee IDs (AMS only, first 20) ────────────────────────────────────────

function empId(n: number): string {
  return `demo-emp-0000-0000-0000-${String(n).padStart(12, '0')}`
}

// AMS employees: 1-20
const AMS_EMP_IDS = Array.from({ length: 20 }, (_, i) => empId(i + 1))

// Absence employees (removed from wk13 scenario)
const ABSENT_IDS = new Set([empId(5), empId(13), empId(18)]) // Lars, Nadia, Carmen

// ── Process shorthand ────────────────────────────────────────────────────────

const PROCS = [
  PROC_ORDER_PICKING,
  PROC_PACKING,
  PROC_INBOUND,
  PROC_VAS,
  PROC_SHIPPING,
  PROC_RETURNS,
]

// ── Assignment shape ─────────────────────────────────────────────────────────

interface DemoAssignment {
  id: string
  employee_id: string
  process_id: string
  shift_pattern_id: string
  assignment_date: string
  scheduled_hours: number
  assignment_source: string
  cost_estimate: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function weekDays(monday: string): string[] {
  const result: string[] = []
  const d = new Date(monday + 'T00:00:00Z')
  for (let i = 0; i < 5; i++) { // Mon–Fri only
    result.push(d.toISOString().split('T')[0]!)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return result
}

let _asgId = 1
function aid(): string {
  return `demo-asg-${String(_asgId++).padStart(5, '0')}`
}

// ── Employee→process assignment pattern ──────────────────────────────────────
// Maps employee ID to their primary process assignment
// This simulates what the solver would produce

interface EmpPattern {
  empId: string
  shift: string
  process: string
  rate: number
}

// Normal week pattern: 20 employees across 3 shifts and 6 processes
const NORMAL_PATTERNS: EmpPattern[] = [
  // Ochtend shift (7 employees)
  { empId: empId(1),  shift: SHIFT_OCHTEND, process: PROC_ORDER_PICKING, rate: 18.00 }, // Sanne TL
  { empId: empId(5),  shift: SHIFT_OCHTEND, process: PROC_ORDER_PICKING, rate: 14.00 }, // Lars
  { empId: empId(6),  shift: SHIFT_OCHTEND, process: PROC_ORDER_PICKING, rate: 14.00 }, // Femke
  { empId: empId(11), shift: SHIFT_OCHTEND, process: PROC_INBOUND,       rate: 13.50 }, // Joost
  { empId: empId(15), shift: SHIFT_OCHTEND, process: PROC_PACKING,       rate: 14.00 }, // Anouk
  { empId: empId(18), shift: SHIFT_OCHTEND, process: PROC_SHIPPING,      rate: 14.00 }, // Carmen
  { empId: empId(14), shift: SHIFT_OCHTEND, process: PROC_VAS,           rate: 13.50 }, // Roy

  // Middag shift (7 employees)
  { empId: empId(4),  shift: SHIFT_MIDDAG,  process: PROC_PACKING,       rate: 17.50 }, // Lisa TL
  { empId: empId(7),  shift: SHIFT_MIDDAG,  process: PROC_ORDER_PICKING, rate: 14.50 }, // Daan
  { empId: empId(8),  shift: SHIFT_MIDDAG,  process: PROC_ORDER_PICKING, rate: 14.50 }, // Eva
  { empId: empId(12), shift: SHIFT_MIDDAG,  process: PROC_INBOUND,       rate: 13.50 }, // Bram
  { empId: empId(16), shift: SHIFT_MIDDAG,  process: PROC_PACKING,       rate: 13.50 }, // Tim
  { empId: empId(19), shift: SHIFT_MIDDAG,  process: PROC_SHIPPING,      rate: 13.50 }, // Wouter
  { empId: empId(17), shift: SHIFT_MIDDAG,  process: PROC_RETURNS,       rate: 14.00 }, // Roos

  // Nacht shift (6 employees)
  { empId: empId(2),  shift: SHIFT_NACHT,   process: PROC_INBOUND,       rate: 18.00 }, // Pieter TL
  { empId: empId(3),  shift: SHIFT_NACHT,   process: PROC_VAS,           rate: 17.50 }, // Youssef TL
  { empId: empId(9),  shift: SHIFT_NACHT,   process: PROC_ORDER_PICKING, rate: 14.50 }, // Mark
  { empId: empId(10), shift: SHIFT_NACHT,   process: PROC_ORDER_PICKING, rate: 14.00 }, // Sophie
  { empId: empId(13), shift: SHIFT_NACHT,   process: PROC_INBOUND,       rate: 14.00 }, // Nadia
  { empId: empId(20), shift: SHIFT_NACHT,   process: PROC_SHIPPING,      rate: 13.50 }, // Fatima
]

// ── Generate assignments for a week ──────────────────────────────────────────

function generateAssignments(
  monday: string,
  patterns: EmpPattern[],
  excludeIds?: Set<string>,
): DemoAssignment[] {
  const dates = weekDays(monday)
  const result: DemoAssignment[] = []

  for (const p of patterns) {
    if (excludeIds?.has(p.empId)) continue

    for (const date of dates) {
      result.push({
        id: aid(),
        employee_id: p.empId,
        process_id: p.process,
        shift_pattern_id: p.shift,
        assignment_date: date,
        scheduled_hours: 8,
        assignment_source: 'optimizer',
        cost_estimate: p.rate * 8,
      })
    }
  }

  return result
}

// ── Peak week: extra assignments + overtime ──────────────────────────────────
// During peak, some employees work double process or get reassigned

function generatePeakAssignments(monday: string): DemoAssignment[] {
  // Start with normal patterns
  const base = generateAssignments(monday, NORMAL_PATTERNS)

  // Add Saturday shifts for 8 employees (overtime)
  const satDate = (() => {
    const d = new Date(monday + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 5) // Saturday
    return d.toISOString().split('T')[0]!
  })()

  const saturdayWorkers: EmpPattern[] = [
    { empId: empId(1),  shift: SHIFT_OCHTEND, process: PROC_ORDER_PICKING, rate: 18.00 * 1.5 },
    { empId: empId(5),  shift: SHIFT_OCHTEND, process: PROC_ORDER_PICKING, rate: 14.00 * 1.5 },
    { empId: empId(7),  shift: SHIFT_OCHTEND, process: PROC_ORDER_PICKING, rate: 14.50 * 1.5 },
    { empId: empId(8),  shift: SHIFT_MIDDAG,  process: PROC_PACKING,       rate: 14.50 * 1.5 },
    { empId: empId(15), shift: SHIFT_MIDDAG,  process: PROC_PACKING,       rate: 14.00 * 1.5 },
    { empId: empId(18), shift: SHIFT_OCHTEND, process: PROC_SHIPPING,      rate: 14.00 * 1.5 },
    { empId: empId(4),  shift: SHIFT_MIDDAG,  process: PROC_PACKING,       rate: 17.50 * 1.5 },
    { empId: empId(3),  shift: SHIFT_OCHTEND, process: PROC_VAS,           rate: 17.50 * 1.5 },
  ]

  for (const sw of saturdayWorkers) {
    base.push({
      id: aid(),
      employee_id: sw.empId,
      process_id: sw.process,
      shift_pattern_id: sw.shift,
      assignment_date: satDate,
      scheduled_hours: 8,
      assignment_source: 'optimizer',
      cost_estimate: sw.rate * 8,
    })
  }

  return base
}

// ── Absence week: remove 3 employees, reassign some ─────────────────────────

function generateAbsenceAssignments(monday: string): DemoAssignment[] {
  // Generate with 3 employees excluded
  const base = generateAssignments(monday, NORMAL_PATTERNS, ABSENT_IDS)

  // Reassign TLs to cover gaps (overtime assignments)
  const dates = weekDays(monday)
  const coverPatterns: Array<{ empId: string; process: string; rate: number }> = [
    // Sanne covers some shipping (was Carmen's job)
    { empId: empId(1), process: PROC_SHIPPING, rate: 18.00 * 1.3 },
    // Pieter covers some inbound (was Nadia's job)
    { empId: empId(2), process: PROC_INBOUND, rate: 18.00 * 1.3 },
  ]

  // Add 2 extra evening shifts for TLs to cover
  for (const cp of coverPatterns) {
    for (let i = 0; i < 3; i++) { // Mon-Wed only
      base.push({
        id: aid(),
        employee_id: cp.empId,
        process_id: cp.process,
        shift_pattern_id: SHIFT_MIDDAG,
        assignment_date: dates[i]!,
        scheduled_hours: 4, // Half shift overtime
        assignment_source: 'optimizer',
        cost_estimate: cp.rate * 4,
      })
    }
  }

  return base
}

// ── Build scenarios ──────────────────────────────────────────────────────────

const normalAssignments  = generateAssignments(DEMO_WEEK_10, NORMAL_PATTERNS)
const peakAssignments    = generatePeakAssignments(DEMO_WEEK_12)
const absenceAssignments = generateAbsenceAssignments(DEMO_WEEK_13)

// ── Calculate metrics ────────────────────────────────────────────────────────

function calcMetrics(assignments: DemoAssignment[], coverage: number, overtime: number) {
  const totalCost = assignments.reduce((s, a) => s + a.cost_estimate, 0)
  return {
    total_cost: Math.round(totalCost),
    coverage_percentage: coverage,
    overtime_hours: overtime,
    solve_time_ms: 1247,
    optimality_gap: null,
    solver_strategy_used: 'greedy',
  }
}

// ── Plan version shape ──────────────────────────────────────��────────────────

export interface DemoPlanVersion {
  id: string
  version_number: number
  plan_period_start: string
  plan_period_end: string
  status: string
  name: string
  created_at: string
  summary_metrics_json: Record<string, unknown>
  assignments: DemoAssignment[]
}

// ── Exported scenarios ───────────────────────────────────────────────────────

export const demoPlanNormal: DemoPlanVersion = {
  id: DEMO_PLAN_NORMAL,
  version_number: 1,
  plan_period_start: DEMO_WEEK_10,
  plan_period_end: '2026-03-08',
  status: 'draft',
  name: 'Wk10 — Normaal',
  created_at: '2026-03-01T09:00:00.000Z',
  summary_metrics_json: calcMetrics(normalAssignments, 96, 4),
  assignments: normalAssignments,
}

export const demoPlanPeak: DemoPlanVersion = {
  id: DEMO_PLAN_PEAK,
  version_number: 1,
  plan_period_start: DEMO_WEEK_12,
  plan_period_end: '2026-03-22',
  status: 'draft',
  name: 'Wk12 — Piek (Black Friday)',
  created_at: '2026-03-14T09:00:00.000Z',
  summary_metrics_json: calcMetrics(peakAssignments, 88, 32),
  assignments: peakAssignments,
}

export const demoPlanAbsence: DemoPlanVersion = {
  id: DEMO_PLAN_ABSENCE,
  version_number: 1,
  plan_period_start: DEMO_WEEK_13,
  plan_period_end: '2026-03-29',
  status: 'draft',
  name: 'Wk13 — Verzuimscenario',
  created_at: '2026-03-21T09:00:00.000Z',
  summary_metrics_json: calcMetrics(absenceAssignments, 84, 28),
  assignments: absenceAssignments,
}

// ── Plan list for the planning overview page ─────────────────────────────────

export const demoPlanVersions: DemoPlanVersion[] = [
  demoPlanNormal,
  demoPlanPeak,
  demoPlanAbsence,
]

// ── Lookup by ID ─────────────────────────────────────────────────────────────

export function getDemoPlan(planId: string): DemoPlanVersion | null {
  return demoPlanVersions.find((p) => p.id === planId) ?? null
}
