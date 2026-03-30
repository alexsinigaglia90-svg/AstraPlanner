import type { LaborRules } from '@/lib/solver/nl-defaults'

export interface CostInput {
  hourlyRate: number
  hours: number
  isOvertime: boolean
  isNightShift: boolean
  isWeekend: boolean
  laborRules: LaborRules
}

/**
 * Calculates the labor cost for an assignment.
 * Premiums do not stack — the highest applicable premium wins.
 * Base = 100%, overtime = overtime_premium_pct, night = night_premium_pct, weekend = weekend_premium_pct.
 *
 * @returns Total cost in currency units, or 0 if rate or hours are non-positive.
 */
export function calculateAssignmentCost(input: CostInput): number {
  const { hourlyRate, hours, isOvertime, isNightShift, isWeekend, laborRules } = input

  if (hourlyRate <= 0 || hours <= 0) {
    return 0
  }

  // Collect all applicable premiums, starting with base 100%
  const applicablePremiums: number[] = [100]

  if (isOvertime) {
    applicablePremiums.push(laborRules.overtime_premium_pct)
  }
  if (isNightShift) {
    applicablePremiums.push(laborRules.night_premium_pct)
  }
  if (isWeekend) {
    applicablePremiums.push(laborRules.weekend_premium_pct)
  }

  const premiumPct = Math.max(...applicablePremiums)

  return hourlyRate * (premiumPct / 100) * hours
}

/**
 * Returns true if any part of the shift falls within the night window (23:00–06:00).
 * Hours are in 24-hour format (0–23). Handles overnight shifts where endHour < startHour.
 *
 * @param startHour - Start hour of the shift (0–23)
 * @param endHour   - End hour of the shift (0–23), exclusive
 */
export function isNightHours(startHour: number, endHour: number): boolean {
  // Night window: [23, 24) union [0, 6)
  // We iterate each hour of the shift and check if it falls in the night window.
  // Normalise to handle overnight wrapping.
  const normalise = (h: number) => ((h % 24) + 24) % 24

  const start = normalise(startHour)
  const end = normalise(endHour)

  // Build set of hours covered by the shift
  // If start === end, treat as a zero-length shift — no night hours
  if (start === end) return false

  const isNight = (h: number) => h >= 23 || h < 6

  if (start < end) {
    // Same-day shift e.g. 08:00–16:00
    for (let h = start; h < end; h++) {
      if (isNight(h)) return true
    }
  } else {
    // Overnight shift e.g. 22:00–04:00
    for (let h = start; h < 24; h++) {
      if (isNight(h)) return true
    }
    for (let h = 0; h < end; h++) {
      if (isNight(h)) return true
    }
  }

  return false
}

/**
 * Returns true if the given ISO date string (YYYY-MM-DD) falls on a Saturday or Sunday.
 *
 * @param date - ISO date string e.g. "2024-12-28"
 */
export function isWeekendDay(date: string): boolean {
  const d = new Date(date)
  const day = d.getUTCDay() // 0 = Sunday, 6 = Saturday
  return day === 0 || day === 6
}
