import { describe, it, expect } from 'vitest'
import { validateSolverOutput } from '@/lib/solver/validate-output'
import type { SolverOutput, Assignment } from '@/types/solver'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeAssignment = (
  empId: string,
  procId: string,
  slotId: string,
  hours = 8,
): Assignment => ({
  employee_id: empId,
  process_id: procId,
  time_slot_id: slotId,
  shift_pattern_id: 'sp1',
  scheduled_hours: hours,
  cost_estimate: hours * 22.5,
  assignment_source: 'optimizer',
})

const baseMetrics: SolverOutput['metrics'] = {
  total_cost: 0,
  coverage_percentage: 100,
  overtime_hours: 0,
  solve_time_ms: 42,
  optimality_gap: null,
  solver_strategy_used: 'greedy',
}

function makeOutput(
  assignments: Assignment[],
  totalCostOverride?: number,
): SolverOutput {
  const total_cost =
    totalCostOverride ??
    assignments.reduce((s, a) => s + a.cost_estimate, 0)
  return {
    assignments,
    unmet_demand: [],
    soft_constraint_violations: [],
    metrics: { ...baseMetrics, total_cost },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('validateSolverOutput', () => {
  it('returns valid=true and no errors for a clean output', () => {
    const assignments = [
      makeAssignment('emp1', 'proc1', 'slot1'),
      makeAssignment('emp2', 'proc1', 'slot1'),
      makeAssignment('emp1', 'proc1', 'slot2'),
    ]
    const result = validateSolverOutput(makeOutput(assignments))

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })

  it('detects overlapping assignments for the same employee and time slot', () => {
    // emp1 appears twice for slot1 — different processes, still an overlap
    const assignments = [
      makeAssignment('emp1', 'proc1', 'slot1'),
      makeAssignment('emp2', 'proc2', 'slot1'),
      makeAssignment('emp1', 'proc2', 'slot1'), // duplicate emp1+slot1
    ]
    const result = validateSolverOutput(makeOutput(assignments))

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.rule).toBe('no_overlap')
    expect(result.errors[0]!.affected_assignments).toEqual(['0', '2'])
  })

  it('detects multiple distinct overlaps and reports each one', () => {
    const assignments = [
      makeAssignment('emp1', 'proc1', 'slot1'),
      makeAssignment('emp1', 'proc2', 'slot1'), // overlap with index 0
      makeAssignment('emp2', 'proc1', 'slot2'),
      makeAssignment('emp2', 'proc2', 'slot2'), // overlap with index 2
    ]
    const result = validateSolverOutput(makeOutput(assignments))

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(2)
    expect(result.errors.every((e) => e.rule === 'no_overlap')).toBe(true)
  })

  it('flags zero scheduled_hours with rule=positive_hours', () => {
    const assignments = [makeAssignment('emp1', 'proc1', 'slot1', 0)]
    const result = validateSolverOutput(makeOutput(assignments))

    expect(result.valid).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]!.rule).toBe('positive_hours')
    expect(result.errors[0]!.affected_assignments).toEqual(['0'])
  })

  it('flags negative scheduled_hours with rule=positive_hours', () => {
    const assignments = [makeAssignment('emp1', 'proc1', 'slot1', -4)]
    const result = validateSolverOutput(makeOutput(assignments))

    expect(result.valid).toBe(false)
    expect(result.errors[0]!.rule).toBe('positive_hours')
  })

  it('is valid=true but has a warning when total_cost differs by >0.01', () => {
    const assignments = [makeAssignment('emp1', 'proc1', 'slot1', 8)] // cost = 180
    // Override total_cost to create a mismatch of 1.00 (>> 0.01)
    const result = validateSolverOutput(makeOutput(assignments, 181.0))

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0]!).toMatch(/cost mismatch/i)
  })

  it('does not warn when total_cost difference is within tolerance', () => {
    const assignments = [makeAssignment('emp1', 'proc1', 'slot1', 8)] // cost = 180
    // Difference = 0.005, within 0.01 tolerance
    const result = validateSolverOutput(makeOutput(assignments, 180.005))

    expect(result.valid).toBe(true)
    expect(result.warnings).toHaveLength(0)
  })

  it('can accumulate both overlap errors and positive_hours errors', () => {
    const assignments = [
      makeAssignment('emp1', 'proc1', 'slot1', 0), // positive_hours violation
      makeAssignment('emp1', 'proc2', 'slot1'),     // overlap with index 0
    ]
    const result = validateSolverOutput(makeOutput(assignments))

    expect(result.valid).toBe(false)
    const rules = result.errors.map((e) => e.rule)
    expect(rules).toContain('positive_hours')
    expect(rules).toContain('no_overlap')
  })

  it('handles an empty assignments array without errors', () => {
    const result = validateSolverOutput(makeOutput([], 0))

    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.warnings).toHaveLength(0)
  })
})
