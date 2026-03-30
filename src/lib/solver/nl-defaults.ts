export interface LaborRules {
  max_consecutive_days: number
  min_rest_hours: number
  mandatory_break_minutes: number
  mandatory_break_after_hours: number
  overtime_premium_pct: number   // e.g. 130 = 130%
  night_premium_pct: number      // e.g. 120 = 120%
  weekend_premium_pct: number    // e.g. 150 = 150%
}

/** A single labor rule row as stored in the database. */
export interface LaborRuleRow {
  rule_type: string
  parameters_json: Record<string, unknown>
  severity: 'hard' | 'soft'
}

export const NL_DEFAULTS: Readonly<LaborRules> = Object.freeze({
  max_consecutive_days: 6,
  min_rest_hours: 11,
  mandatory_break_minutes: 30,
  mandatory_break_after_hours: 5.5,
  overtime_premium_pct: 130,
  night_premium_pct: 120,
  weekend_premium_pct: 150,
})

/**
 * Merges a list of database rule rows on top of NL_DEFAULTS.
 * Unrecognised rule_types are silently ignored.
 * Returns a new object — NL_DEFAULTS is never mutated.
 */
export function getLaborRules(dbRules: LaborRuleRow[]): LaborRules {
  const result: LaborRules = { ...NL_DEFAULTS }

  for (const row of dbRules) {
    const value = (row.parameters_json as { value?: number }).value
    if (value === undefined) continue

    switch (row.rule_type) {
      case 'max_consecutive_days':
        result.max_consecutive_days = value
        break
      case 'min_rest_between_shifts':
        result.min_rest_hours = value
        break
      case 'mandatory_break':
        result.mandatory_break_minutes = value
        break
      case 'mandatory_break_after_hours':
        result.mandatory_break_after_hours = value
        break
      case 'overtime_premium_pct':
        result.overtime_premium_pct = value
        break
      case 'night_premium_pct':
        result.night_premium_pct = value
        break
      case 'weekend_premium_pct':
        result.weekend_premium_pct = value
        break
      // Unknown rule_types are intentionally ignored
    }
  }

  return result
}
