import { describe, it, expect } from 'vitest'
import { solveGreedy } from '@/lib/solver/greedy'
import type {
  SolverInput,
  TimeSlot,
  ProcessDemand,
  EmployeeRecord,
  Assignment,
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

describe('solveGreedy', () => {
  it('assigns employees to meet demand (2 FTE needed, 2 employees)', () => {
    const input = makeInput()
    const result = solveGreedy(input)

    expect(result.assignments).toHaveLength(2)
    expect(result.unmet_demand).toHaveLength(0)
    expect(result.metrics.coverage_percentage).toBe(100)
    expect(result.metrics.solver_strategy_used).toBe('greedy')

    const empIds = result.assignments.map((a) => a.employee_id).sort()
    expect(empIds).toEqual(['emp1', 'emp2'])
  })

  it('reports unmet demand when not enough employees (5 FTE needed, 2 available)', () => {
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
    const result = solveGreedy(input)

    expect(result.assignments).toHaveLength(2)
    expect(result.unmet_demand).toHaveLength(1)
    expect(result.unmet_demand[0]!.gap_fte).toBe(3)
    expect(result.metrics.coverage_percentage).toBe(40)
  })

  it('respects skill eligibility (min_skill=4, only one emp qualifies)', () => {
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
    const result = solveGreedy(input)

    // emp1 has proficiency 4, emp2 has proficiency 3 => only emp1 assigned
    expect(result.assignments).toHaveLength(1)
    expect(result.assignments[0]!.employee_id).toBe('emp1')
    expect(result.unmet_demand).toHaveLength(1)
    expect(result.unmet_demand[0]!.gap_fte).toBe(1)
  })

  it('preserves locked assignments and counts them toward coverage', () => {
    const locked: Assignment = {
      employee_id: 'emp1',
      process_id: 'proc1',
      time_slot_id: '2026-04-06_s1',
      shift_pattern_id: 'manual',
      scheduled_hours: 8,
      cost_estimate: 180,
      assignment_source: 'manual',
      proficiency_level: 4,
    }
    const input = makeInput({ locked_assignments: [locked] })
    const result = solveGreedy(input)

    // manual + emp2 optimiser assignment = 2 total
    expect(result.assignments).toHaveLength(2)
    expect(result.unmet_demand).toHaveLength(0)
    expect(result.metrics.coverage_percentage).toBe(100)

    const manualAssignment = result.assignments.find(
      (a) => a.assignment_source === 'manual',
    )
    expect(manualAssignment).toBeDefined()
    expect(manualAssignment!.employee_id).toBe('emp1')
  })

  it('records solve time and reports null optimality gap', () => {
    const input = makeInput()
    const result = solveGreedy(input)

    expect(result.metrics.solve_time_ms).toBeGreaterThanOrEqual(0)
    expect(result.metrics.optimality_gap).toBeNull()
  })
})
