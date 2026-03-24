import { describe, it, expect } from 'vitest'
import { computeSupportFTE } from '@/lib/workload/support'

describe('computeSupportFTE', () => {
  it('fixed_headcount returns fixed count regardless of input', () => {
    const result = computeSupportFTE(
      { method: 'fixed_headcount', fixed_count: 2 },
      40,
      {}
    )
    expect(result.fte_needed).toBe(2)
    expect(result.hours_needed).toBe(80)
  })

  it('linked_ratio scales with productive FTE', () => {
    const result = computeSupportFTE(
      { method: 'linked_ratio', linked_process_ids: ['p1', 'p2'], ratio: 15 },
      40,
      { p1: 10, p2: 5 }
    )
    expect(result.fte_needed).toBe(1)
    expect(result.hours_needed).toBe(40)
  })

  it('linked_ratio handles partial FTE', () => {
    const result = computeSupportFTE(
      { method: 'linked_ratio', linked_process_ids: ['p1'], ratio: 10 },
      40,
      { p1: 15 }
    )
    expect(result.fte_needed).toBeCloseTo(1.5)
  })

  it('frequency_based computes from duration x frequency', () => {
    const result = computeSupportFTE(
      { method: 'frequency_based', duration_hours: 3, frequency_per_week: 5 },
      40,
      {}
    )
    expect(result.hours_needed).toBe(15)
    expect(result.fte_needed).toBeCloseTo(0.375)
  })

  it('returns zero for missing linked process IDs', () => {
    const result = computeSupportFTE(
      { method: 'linked_ratio', linked_process_ids: ['missing'], ratio: 10 },
      40,
      { p1: 20 }
    )
    expect(result.fte_needed).toBe(0)
  })
})
