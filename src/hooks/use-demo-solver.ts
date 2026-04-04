/**
 * Hook that runs the actual greedy solver against demo seed data.
 * Returns a function to trigger solving and the resulting output.
 */

import { useState, useCallback } from 'react'
import { solveGreedy } from '@/lib/solver/greedy'
import type { SolverInput, SolverOutput, TimeSlot, ProcessDemand, EmployeeRecord } from '@/types/solver'
import { demoEmployees } from '@/components/onboarding/demo-seed-employees'
import {
  DEMO_SITE_AMS,
  PROC_ORDER_PICKING, PROC_PACKING, PROC_INBOUND,
  PROC_VAS, PROC_SHIPPING, PROC_RETURNS,
  demoProcesses,
} from '@/components/onboarding/demo-seed-processes'
import { DEMO_WEEK_10, DEMO_WEEK_12, DEMO_WEEK_13, WEEKLY_VOLUMES } from '@/components/onboarding/demo-seed-demand'

// ── Proficiency → productivity multiplier ────────────────────────────────────

const PRODUCTIVITY: Record<number, number> = {
  1: 0.6,
  2: 0.8,
  3: 1.0,
  4: 1.15,
  5: 1.3,
}

// ── Shift IDs ────────────────────────────────────────────────────────────────

const SHIFTS = [
  { id: 'demo-shft-0000-0000-0000-000000000001', name: 'Ochtend', start: '06:00', end: '14:00' },
  { id: 'demo-shft-0000-0000-0000-000000000002', name: 'Middag',  start: '14:00', end: '22:00' },
  { id: 'demo-shft-0000-0000-0000-000000000003', name: 'Nacht',   start: '22:00', end: '06:00' },
]

// ── Build solver input from demo data ────────────────────────────────────────

function weekDates(monday: string): string[] {
  const result: string[] = []
  const d = new Date(monday + 'T00:00:00Z')
  for (let i = 0; i < 5; i++) { // Mon-Fri
    result.push(d.toISOString().split('T')[0]!)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return result
}

function buildSolverInput(weekMonday: string): SolverInput {
  const dates = weekDates(weekMonday)

  // Time slots: every day × every shift
  const timeSlots: TimeSlot[] = []
  for (const date of dates) {
    for (const shift of SHIFTS) {
      timeSlots.push({
        id: `${date}_${shift.id}`,
        period_start: `${date}T${shift.start}:00.000Z`,
        period_end: `${date}T${shift.end}:00.000Z`,
        duration_minutes: 480,
      })
    }
  }

  // Process demand per slot
  const demand: ProcessDemand[] = []
  const weekIndex = weekMonday === DEMO_WEEK_10 ? 0
    : weekMonday === DEMO_WEEK_12 ? 2
    : weekMonday === DEMO_WEEK_13 ? 3
    : 1

  for (const proc of demoProcesses) {
    const vols = WEEKLY_VOLUMES[proc.id]
    if (!vols) continue
    const weekVol = vols[weekIndex]!
    const dailyVol = Math.round(weekVol / 5) // Spread evenly across 5 days
    const dailyHours = dailyVol / proc.norm_uph
    // FTE per shift = dailyHours / (shifts per day × hours per shift)
    const ftePerSlot = dailyHours / (SHIFTS.length * 8)

    for (const ts of timeSlots) {
      demand.push({
        process_id: proc.id,
        time_slot_id: ts.id,
        required_fte: Math.round(ftePerSlot * 10) / 10,
        min_skill_level: proc.min_skill_level ?? 1,
        required_certifications: [],
        max_capacity: null,
      })
    }
  }

  // Employees
  const amsEmployees = demoEmployees.filter((e) => e.home_site_id === DEMO_SITE_AMS)
  const employees: EmployeeRecord[] = amsEmployees.map((e) => ({
    id: e.id,
    employee_number: e.employee_number,
    contract_type: e.contract_type as EmployeeRecord['contract_type'],
    weekly_hours_contracted: e.weekly_hours_contracted,
    hourly_rate: e.hourly_rate,
    home_site_id: e.home_site_id,
    is_multi_site_eligible: e.is_multi_site_eligible,
    skills: e.skills.map((s) => ({
      process_id: s.process_id,
      proficiency_level: s.proficiency_level,
      productivity_multiplier: PRODUCTIVITY[s.proficiency_level] ?? 1.0,
      has_active_certification: true,
      certification_expiry: null,
    })),
    availability: timeSlots.map((ts) => ({
      start: ts.period_start,
      end: ts.period_end,
    })),
    current_week_hours: 0,
    consecutive_days_worked: 0,
  }))

  return {
    site_id: DEMO_SITE_AMS,
    planning_horizon: {
      start: dates[0]!,
      end: dates[dates.length - 1]!,
    },
    time_slots: timeSlots,
    demand,
    employees,
    hard_constraints: [
      { type: 'max_consecutive_days', scope: 'employee', parameters: { max: 6 } },
      { type: 'min_rest_hours', scope: 'employee', parameters: { hours: 11 } },
      { type: 'max_weekly_hours', scope: 'employee', parameters: { hours: 48 } },
    ],
    soft_constraints: [
      { type: 'home_department_preference', weight: 0.3, parameters: {} },
      { type: 'workload_balance', weight: 0.2, parameters: {} },
      { type: 'overtime_avoidance', weight: 0.1, parameters: {} },
    ],
    locked_assignments: [],
    objective: {
      minimize_cost_weight: 0.3,
      maximize_coverage_weight: 0.4,
      maximize_skill_match_weight: 0.2,
      minimize_overtime_weight: 0.1,
    },
    time_budget_seconds: 10,
    solver_config: {
      mode: 'balanced',
      departments: [],
      processes: [],
      training_slots: {},
    },
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useDemoSolver() {
  const [solving, setSolving] = useState(false)
  const [result, setResult] = useState<SolverOutput | null>(null)

  const solve = useCallback((weekMonday: string) => {
    setSolving(true)
    setResult(null)

    // Small delay so the UI shows the "solving" state
    setTimeout(() => {
      try {
        const input = buildSolverInput(weekMonday)
        const output = solveGreedy(input)
        setResult(output)
      } catch (err) {
        console.error('[DemoSolver] Error:', err)
      } finally {
        setSolving(false)
      }
    }, 100)
  }, [])

  const reset = useCallback(() => {
    setResult(null)
    setSolving(false)
  }, [])

  return { solving, result, solve, reset }
}
