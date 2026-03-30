import { describe, it, expect } from 'vitest'
import {
  calculateAssignmentCost,
  isNightHours,
  isWeekendDay,
  type CostInput,
} from '@/lib/solver/cost'
import { NL_DEFAULTS } from '@/lib/solver/nl-defaults'

const baseInput: CostInput = {
  hourlyRate: 22.50,
  hours: 8,
  isOvertime: false,
  isNightShift: false,
  isWeekend: false,
  laborRules: NL_DEFAULTS,
}

describe('calculateAssignmentCost', () => {
  it('returns base cost when no premiums apply: 22.50 × 8 = 180', () => {
    expect(calculateAssignmentCost(baseInput)).toBe(180)
  })

  it('applies overtime premium: 22.50 × 1.3 × 8 = 234', () => {
    const result = calculateAssignmentCost({ ...baseInput, isOvertime: true })
    expect(result).toBeCloseTo(234, 5)
  })

  it('applies night premium: 22.50 × 1.2 × 8 = 216', () => {
    const result = calculateAssignmentCost({ ...baseInput, isNightShift: true })
    expect(result).toBeCloseTo(216, 5)
  })

  it('applies weekend premium: 22.50 × 1.5 × 8 = 270', () => {
    const result = calculateAssignmentCost({ ...baseInput, isWeekend: true })
    expect(result).toBeCloseTo(270, 5)
  })

  it('uses highest premium when overtime + weekend stack: weekend wins (270)', () => {
    const result = calculateAssignmentCost({
      ...baseInput,
      isOvertime: true,
      isWeekend: true,
    })
    // weekend_premium_pct (150) > overtime_premium_pct (130)
    expect(result).toBeCloseTo(270, 5)
  })

  it('uses highest premium when overtime + night stack: overtime wins (234)', () => {
    const result = calculateAssignmentCost({
      ...baseInput,
      isOvertime: true,
      isNightShift: true,
    })
    // overtime_premium_pct (130) > night_premium_pct (120)
    expect(result).toBeCloseTo(234, 5)
  })

  it('uses highest premium when all three flags set: weekend wins (270)', () => {
    const result = calculateAssignmentCost({
      ...baseInput,
      isOvertime: true,
      isNightShift: true,
      isWeekend: true,
    })
    expect(result).toBeCloseTo(270, 5)
  })

  it('returns 0 when hourlyRate is 0', () => {
    expect(calculateAssignmentCost({ ...baseInput, hourlyRate: 0 })).toBe(0)
  })

  it('returns 0 when hourlyRate is negative', () => {
    expect(calculateAssignmentCost({ ...baseInput, hourlyRate: -5 })).toBe(0)
  })

  it('returns 0 when hours is 0', () => {
    expect(calculateAssignmentCost({ ...baseInput, hours: 0 })).toBe(0)
  })

  it('returns 0 when hours is negative', () => {
    expect(calculateAssignmentCost({ ...baseInput, hours: -1 })).toBe(0)
  })

  it('works with custom labor rules', () => {
    const customRules = { ...NL_DEFAULTS, weekend_premium_pct: 200 }
    const result = calculateAssignmentCost({
      ...baseInput,
      isWeekend: true,
      laborRules: customRules,
    })
    // 22.50 × 2.0 × 8 = 360
    expect(result).toBeCloseTo(360, 5)
  })
})

describe('isNightHours', () => {
  it('returns true for a shift that starts in the night window (23:00–06:00)', () => {
    expect(isNightHours(23, 3)).toBe(true)
  })

  it('returns true for a shift that ends in the night window', () => {
    expect(isNightHours(4, 8)).toBe(true)
  })

  it('returns true for a shift that spans the entire night window', () => {
    expect(isNightHours(22, 7)).toBe(true)
  })

  it('returns false for a daytime shift (08:00–16:00)', () => {
    expect(isNightHours(8, 16)).toBe(false)
  })

  it('returns false for an evening shift that ends exactly at 23:00', () => {
    expect(isNightHours(18, 23)).toBe(false)
  })

  it('returns true for a shift starting at midnight (00:00–06:00)', () => {
    expect(isNightHours(0, 6)).toBe(true)
  })

  it('returns false for a shift from 06:00 to 22:00', () => {
    expect(isNightHours(6, 22)).toBe(false)
  })

  it('returns false for a zero-length shift', () => {
    expect(isNightHours(12, 12)).toBe(false)
  })
})

describe('isWeekendDay', () => {
  it('returns true for a Saturday', () => {
    expect(isWeekendDay('2024-12-28')).toBe(true) // Saturday
  })

  it('returns true for a Sunday', () => {
    expect(isWeekendDay('2024-12-29')).toBe(true) // Sunday
  })

  it('returns false for a Monday', () => {
    expect(isWeekendDay('2024-12-30')).toBe(false) // Monday
  })

  it('returns false for a Friday', () => {
    expect(isWeekendDay('2024-12-27')).toBe(false) // Friday
  })

  it('returns false for a Wednesday', () => {
    expect(isWeekendDay('2025-01-01')).toBe(false) // Wednesday
  })
})
