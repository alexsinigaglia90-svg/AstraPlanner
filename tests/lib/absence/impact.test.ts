import { describe, it, expect } from 'vitest'
import { calculateImpact } from '@/lib/absence/impact'

describe('calculateImpact', () => {
  it('calculates coverage drop when employee is removed', () => {
    const result = calculateImpact({
      absentEmployeeId: 'emp-1',
      processes: [{ process_id: 'proc-1', process_name: 'Outbound', fte_needed: 5, fte_available: 5, employee_fte_contribution: 1.0 }],
    })
    expect(result.affected_processes).toHaveLength(1)
    expect(result.affected_processes[0]!.coverage_before).toBe(100)
    expect(result.affected_processes[0]!.coverage_after).toBe(80)
    expect(result.affected_processes[0]!.fte_lost).toBe(1.0)
    expect(result.overall_coverage_drop).toBe(20)
  })

  it('handles zero fte_needed gracefully', () => {
    const result = calculateImpact({
      absentEmployeeId: 'emp-1',
      processes: [{ process_id: 'proc-1', process_name: 'Idle', fte_needed: 0, fte_available: 2, employee_fte_contribution: 1.0 }],
    })
    expect(result.affected_processes[0]!.coverage_before).toBe(100)
    expect(result.affected_processes[0]!.coverage_after).toBe(100)
  })

  it('aggregates across multiple processes', () => {
    const result = calculateImpact({
      absentEmployeeId: 'emp-1',
      processes: [
        { process_id: 'p1', process_name: 'A', fte_needed: 4, fte_available: 4, employee_fte_contribution: 0.5 },
        { process_id: 'p2', process_name: 'B', fte_needed: 2, fte_available: 2, employee_fte_contribution: 0.5 },
      ],
    })
    expect(result.affected_processes).toHaveLength(2)
    expect(result.overall_coverage_drop).toBeGreaterThan(0)
  })
})
