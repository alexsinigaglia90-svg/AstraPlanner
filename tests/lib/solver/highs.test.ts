import { describe, it, expect } from 'vitest'
import { solveHiGHS } from '@/lib/solver/highs'
import type {
  SolverInput,
  TimeSlot,
  ProcessDemand,
  EmployeeRecord,
} from '@/types/solver'

// ---------------------------------------------------------------------------
// Test helper
// ---------------------------------------------------------------------------

function makeInput(overrides?: Partial<SolverInput>): SolverInput {
  const slot: TimeSlot = {
    id: '2026-04-06_s1',
    period_start: '2026-04-06T06:00:00',
    period_end: '2026-04-06T14:00:00',
    duration_minutes: 480,
  }
  const demand: ProcessDemand = {
    process_id: 'proc1',
    time_slot_id: slot.id,
    required_fte: 2,
    min_skill_level: 3,
    required_certifications: [],
    max_capacity: null,
  }
  const emp1: EmployeeRecord = {
    id: 'emp1',
    employee_number: 'E001',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    hourly_rate: 22.5,
    home_site_id: 'site1',
    is_multi_site_eligible: false,
    skills: [
      {
        process_id: 'proc1',
        proficiency_level: 4,
        productivity_multiplier: 1.15,
        has_active_certification: false,
        certification_expiry: null,
      },
    ],
    availability: [{ start: '2026-04-06T06:00:00', end: '2026-04-06T14:00:00' }],
    current_week_hours: 0,
    consecutive_days_worked: 0,
  }
  const emp2: EmployeeRecord = {
    id: 'emp2',
    employee_number: 'E002',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    hourly_rate: 20,
    home_site_id: 'site1',
    is_multi_site_eligible: false,
    skills: [
      {
        process_id: 'proc1',
        proficiency_level: 3,
        productivity_multiplier: 1.0,
        has_active_certification: false,
        certification_expiry: null,
      },
    ],
    availability: [{ start: '2026-04-06T06:00:00', end: '2026-04-06T14:00:00' }],
    current_week_hours: 0,
    consecutive_days_worked: 0,
  }
  return {
    site_id: 'site1',
    planning_horizon: { start: '2026-04-06', end: '2026-04-12' },
    time_slots: [slot],
    demand: [demand],
    employees: [emp1, emp2],
    hard_constraints: [],
    soft_constraints: [],
    locked_assignments: [],
    objective: {
      minimize_cost_weight: 0.4,
      maximize_coverage_weight: 0.3,
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
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('solveHiGHS', () => {
  it('produces a valid solution with assignments', async () => {
    const input = makeInput()
    const result = await solveHiGHS(input)

    expect(result.assignments.length).toBeGreaterThan(0)
    expect(result.metrics.solver_strategy_used).toBe('highs_mip')
    expect(result.unmet_demand).toHaveLength(0)
    expect(result.metrics.coverage_percentage).toBe(100)

    const empIds = result.assignments.map((a) => a.employee_id).sort()
    expect(empIds).toEqual(['emp1', 'emp2'])
  })

  it('respects skill eligibility (min_skill=4, only qualified employee assigned)', async () => {
    const input = makeInput({
      demand: [
        {
          process_id: 'proc1',
          time_slot_id: '2026-04-06_s1',
          required_fte: 2,
          min_skill_level: 4,
          required_certifications: [],
          max_capacity: null,
        },
      ],
    })
    const result = await solveHiGHS(input)

    // emp1 has proficiency 4, emp2 has proficiency 3 => only emp1 assigned
    expect(result.assignments).toHaveLength(1)
    expect(result.assignments[0]!.employee_id).toBe('emp1')
    expect(result.unmet_demand).toHaveLength(1)
    expect(result.unmet_demand[0]!.gap_fte).toBe(1)
    expect(result.metrics.solver_strategy_used).toBe('highs_mip')
  })

  it('reports coverage metrics correctly', async () => {
    const input = makeInput({
      demand: [
        {
          process_id: 'proc1',
          time_slot_id: '2026-04-06_s1',
          required_fte: 5,
          min_skill_level: 3,
          required_certifications: [],
          max_capacity: null,
        },
      ],
    })
    const result = await solveHiGHS(input)

    // Only 2 employees available for 5 FTE demand
    expect(result.assignments).toHaveLength(2)
    expect(result.unmet_demand).toHaveLength(1)
    expect(result.unmet_demand[0]!.gap_fte).toBe(3)
    expect(result.metrics.coverage_percentage).toBe(40)
    expect(result.metrics.solve_time_ms).toBeGreaterThanOrEqual(0)
    expect(result.metrics.total_cost).toBeGreaterThan(0)
  })
})
