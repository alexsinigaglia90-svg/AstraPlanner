// =============================================================================
// File: src/lib/solver/validate-output.ts
// Description: Post-solve validation of SolverOutput before DB write.
// =============================================================================

import type { SolverOutput, ValidationResult, ValidationError } from '@/types/solver'

const COST_TOLERANCE = 0.01

/**
 * Validates a SolverOutput for correctness before it is written to the database.
 *
 * Rules checked:
 *   no_overlap      — an employee_id + time_slot_id pair must appear at most once
 *   positive_hours  — every assignment must have scheduled_hours > 0
 *
 * Warnings are emitted (but do not fail validation) when the sum of
 * assignment cost_estimates diverges from metrics.total_cost by more than
 * COST_TOLERANCE (0.01).
 */
export function validateSolverOutput(output: SolverOutput): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: string[] = []

  // ------------------------------------------------------------------
  // Rule: no_overlap
  // ------------------------------------------------------------------
  const seen = new Map<string, number>() // key → first index

  output.assignments.forEach((a, i) => {
    const key = `${a.employee_id}::${a.time_slot_id}`

    if (seen.has(key)) {
      const firstIdx = seen.get(key) as number
      errors.push({
        rule: 'no_overlap',
        message:
          `Employee '${a.employee_id}' has overlapping assignments for ` +
          `time slot '${a.time_slot_id}' (indices ${firstIdx} and ${i}).`,
        affected_assignments: [String(firstIdx), String(i)],
      })
    } else {
      seen.set(key, i)
    }
  })

  // ------------------------------------------------------------------
  // Rule: positive_hours
  // ------------------------------------------------------------------
  output.assignments.forEach((a, i) => {
    if (a.scheduled_hours <= 0) {
      errors.push({
        rule: 'positive_hours',
        message:
          `Assignment at index ${i} for employee '${a.employee_id}' has ` +
          `non-positive scheduled_hours (${a.scheduled_hours}).`,
        affected_assignments: [String(i)],
      })
    }
  })

  // ------------------------------------------------------------------
  // Warning: metrics consistency
  // ------------------------------------------------------------------
  const assignmentCostSum = output.assignments.reduce(
    (sum, a) => sum + a.cost_estimate,
    0,
  )
  const diff = Math.abs(assignmentCostSum - output.metrics.total_cost)
  if (diff > COST_TOLERANCE) {
    warnings.push(
      `Cost mismatch: sum of assignment cost_estimates (${assignmentCostSum.toFixed(4)}) ` +
      `differs from metrics.total_cost (${output.metrics.total_cost.toFixed(4)}) ` +
      `by ${diff.toFixed(4)}, which exceeds tolerance of ${COST_TOLERANCE}.`,
    )
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
