import { describe, it, expect } from 'vitest'
import { resolveWeekFromRotation, computeEmployeeAvailability } from '@/lib/workload/availability'

describe('resolveWeekFromRotation', () => {
  it('resolves correct rotation week for 2-week cycle', () => {
    const week = resolveWeekFromRotation('2026-03-02', '2026-03-16', 2)
    expect(week).toBe(0)
  })

  it('resolves week 1 of 2-week cycle', () => {
    const week = resolveWeekFromRotation('2026-03-02', '2026-03-09', 2)
    expect(week).toBe(1)
  })

  it('handles 3-week cycle', () => {
    const week = resolveWeekFromRotation('2026-03-02', '2026-03-23', 3)
    expect(week).toBe(0)
  })
})

describe('computeEmployeeAvailability', () => {
  it('computes available hours from shift pattern minus breaks', () => {
    const result = computeEmployeeAvailability({
      shift_duration_hours: 8,
      break_minutes: 30,
      days_in_week: 5,
      productive_pct: 0.95,
      override_hours_lost: 0,
    })
    expect(result.gross_hours).toBeCloseTo(37.5)
    expect(result.net_hours).toBeCloseTo(35.625)
  })

  it('subtracts full-day override', () => {
    const result = computeEmployeeAvailability({
      shift_duration_hours: 8,
      break_minutes: 30,
      days_in_week: 5,
      productive_pct: 1.0,
      override_hours_lost: 7.5,
    })
    expect(result.gross_hours).toBeCloseTo(30)
  })

  it('clamps to zero when overrides exceed available hours', () => {
    const result = computeEmployeeAvailability({
      shift_duration_hours: 8,
      break_minutes: 30,
      days_in_week: 5,
      productive_pct: 1.0,
      override_hours_lost: 100,
    })
    expect(result.gross_hours).toBe(0)
    expect(result.net_hours).toBe(0)
  })
})
