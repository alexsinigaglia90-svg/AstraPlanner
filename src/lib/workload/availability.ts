/**
 * Resolve which week of the rotation cycle a target date falls on.
 * rotation_start_date and target_date are ISO date strings (YYYY-MM-DD).
 */
export function resolveWeekFromRotation(
  rotationStartDate: string,
  targetDate: string,
  cycleWeeks: number,
): number {
  const start = new Date(rotationStartDate)
  const target = new Date(targetDate)
  const diffMs = target.getTime() - start.getTime()
  const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000))
  return ((diffWeeks % cycleWeeks) + cycleWeeks) % cycleWeeks
}

interface AvailabilityInput {
  shift_duration_hours: number
  break_minutes: number
  days_in_week: number
  productive_pct: number
  override_hours_lost: number
}

interface AvailabilityResult {
  gross_hours: number
  net_hours: number
}

/**
 * Compute an employee's available hours for a week.
 * gross_hours = (shift - breaks) x days - overrides
 * net_hours = gross_hours x productive_pct
 */
export function computeEmployeeAvailability(input: AvailabilityInput): AvailabilityResult {
  const hoursPerDay = input.shift_duration_hours - (input.break_minutes / 60)
  const grossBeforeOverride = hoursPerDay * input.days_in_week
  const gross = Math.max(0, grossBeforeOverride - input.override_hours_lost)
  return {
    gross_hours: gross,
    net_hours: gross * input.productive_pct,
  }
}
