export interface LaborRules {
  max_consecutive_days: number
  min_rest_hours: number
  mandatory_break_minutes: number
  mandatory_break_after_hours: number
  overtime_premium_pct: number   // e.g. 130 = 130%
  night_premium_pct: number      // e.g. 120 = 120%
  weekend_premium_pct: number    // e.g. 150 = 150%
}

export const NL_DEFAULTS: Readonly<LaborRules> = {
  max_consecutive_days: 6,
  min_rest_hours: 11,
  mandatory_break_minutes: 30,
  mandatory_break_after_hours: 5.5,
  overtime_premium_pct: 130,
  night_premium_pct: 120,
  weekend_premium_pct: 150,
}
