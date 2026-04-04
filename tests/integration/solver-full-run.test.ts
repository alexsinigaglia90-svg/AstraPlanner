import { describe, it, expect } from 'vitest'
import { solveGreedy } from '@/lib/solver/greedy'
import { solveHiGHS } from '@/lib/solver/highs'
import { validateSolverOutput } from '@/lib/solver/validate-output'
import { generateTimeSlots, buildProcessDemand, buildConstraints } from '@/lib/solver/assemble-input'
import { getLaborRules } from '@/lib/solver/nl-defaults'
import { PROFICIENCY_MULTIPLIERS } from '@/lib/workload/constants'
import type { SolverInput, EmployeeRecord } from '@/types/solver'

// ---------------------------------------------------------------------------
// Realistic scenario fixture
// ---------------------------------------------------------------------------

const PROCESSES = ['picking', 'packing', 'receiving', 'shipping', 'returns']

const SHIFTS = [
  { id: 'morning', name: 'Morning', start_time: '06:00', end_time: '14:00', duration_hours: 8 },
  { id: 'afternoon', name: 'Afternoon', start_time: '14:00', end_time: '22:00', duration_hours: 8 },
]

const WORK_DAYS = [1, 2, 3, 4, 5] // Mon–Fri

// Week starting on a Monday (2026-03-30)
const WEEK_START = '2026-03-30'

function buildRealisticInput(): SolverInput {
  const laborRules = getLaborRules([])
  const timeSlots = generateTimeSlots(WEEK_START, WORK_DAYS, SHIFTS)
  // 5 days × 2 shifts = 10 slots

  // Demand: 2 FTE per process per slot — build as day-level rows per slot date
  // Use explicit ProcessDemand entries directly so we control required_fte precisely
  const demand = timeSlots.flatMap((slot) =>
    PROCESSES.map((processId) => ({
      process_id: processId,
      time_slot_id: slot.id,
      required_fte: 2,
      min_skill_level: 1,        // low threshold so all skill levels qualify
      required_certifications: [] as string[],
      max_capacity: null,
    }))
  )

  // Availability window covering the entire week
  const weekAvailStart = `${WEEK_START}T00:00:00Z`
  const weekAvailEnd = '2026-04-05T23:59:59Z' // end of the week (Sunday)

  // 10 employees, varying skills and rates
  const employees: EmployeeRecord[] = Array.from({ length: 10 }, (_, i) => {
    // Each employee has skills for processes 0 to 2+(i%3), i.e. 3–5 processes
    const numSkills = 3 + (i % 3) // 3, 4, or 5
    const proficiency = 2 + (i % 4) // 2–5

    const skills = PROCESSES.slice(0, numSkills).map((processId) => ({
      process_id: processId,
      proficiency_level: proficiency,
      productivity_multiplier: PROFICIENCY_MULTIPLIERS[proficiency] ?? 1.0,
      has_active_certification: false,
      certification_expiry: null,
    }))

    return {
      id: `emp-${i}`,
      employee_number: `E${String(i).padStart(3, '0')}`,
      contract_type: 'full_time' as const,
      weekly_hours_contracted: 40,
      hourly_rate: 20 + i,
      home_site_id: 'site-1',
      is_multi_site_eligible: false,
      skills,
      availability: [{ start: weekAvailStart, end: weekAvailEnd }],
      current_week_hours: 0,
      consecutive_days_worked: 0,
    }
  })

  const { hard, soft } = buildConstraints(laborRules)

  return {
    site_id: 'site-1',
    planning_horizon: { start: WEEK_START, end: '2026-04-04' },
    time_slots: timeSlots,
    demand,
    employees,
    hard_constraints: hard,
    soft_constraints: soft,
    locked_assignments: [],
    objective: {
      minimize_cost_weight: 0.4,
      maximize_coverage_weight: 0.3,
      maximize_skill_match_weight: 0.2,
      minimize_overtime_weight: 0.1,
    },
    time_budget_seconds: 30,
    solver_config: {
      mode: 'balanced',
      departments: [],
      processes: [],
      training_slots: {},
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('solver integration — 10 employees, 5 processes, 1 week', () => {
  it('greedy produces valid output', () => {
    const input = buildRealisticInput()
    const output = solveGreedy(input)
    const validation = validateSolverOutput(output)

    const assignments = output.assignments.length
    const coverage = output.metrics.coverage_percentage
    const time = output.metrics.solve_time_ms

    console.log(
      `Greedy: ${assignments} assignments, ${coverage.toFixed(1)}% coverage, ${time.toFixed(1)}ms`
    )

    expect(validation.valid, `Validation errors: ${JSON.stringify(validation.errors)}`).toBe(true)
    expect(assignments).toBeGreaterThan(0)
    expect(coverage).toBeGreaterThan(0)
    expect(time).toBeLessThan(5000)
  })

  it('HiGHS produces valid output', async () => {
    const input = buildRealisticInput()
    const output = await solveHiGHS(input)
    const validation = validateSolverOutput(output)

    const assignments = output.assignments.length
    const coverage = output.metrics.coverage_percentage
    const time = output.metrics.solve_time_ms

    console.log(
      `HiGHS: ${assignments} assignments, ${coverage.toFixed(1)}% coverage, ${time.toFixed(1)}ms (strategy: ${output.metrics.solver_strategy_used})`
    )

    expect(validation.valid, `Validation errors: ${JSON.stringify(validation.errors)}`).toBe(true)
    expect(assignments).toBeGreaterThan(0)
    expect(coverage).toBeGreaterThan(0)
  })

  it('HiGHS coverage >= greedy coverage (within 5% tolerance)', async () => {
    // Use a well-staffed variant so both solvers can approach high coverage while
    // respecting hard weekly-hour constraints. With required_fte=1, there are 50
    // demand entries (5 processes × 10 slots × 1 FTE) and 10 employees × 5 slots
    // max = 50 assignment slots available — fully feasible under hard constraints.
    const input = buildRealisticInput()
    const wellStaffedInput: typeof input = {
      ...input,
      demand: input.demand.map((d) => ({ ...d, required_fte: 1 })),
    }

    const [greedyOutput, highsOutput] = await Promise.all([
      Promise.resolve(solveGreedy(wellStaffedInput)),
      solveHiGHS(wellStaffedInput),
    ])

    const greedyCoverage = greedyOutput.metrics.coverage_percentage
    const highsCoverage = highsOutput.metrics.coverage_percentage

    console.log(
      `Coverage comparison (1 FTE/slot) — Greedy: ${greedyCoverage.toFixed(1)}%, HiGHS: ${highsCoverage.toFixed(1)}% (tolerance: -5%)`
    )

    // HiGHS should match or exceed greedy coverage, allowing 5 percentage points tolerance
    expect(highsCoverage).toBeGreaterThanOrEqual(greedyCoverage - 5)
  })
})
