import { describe, it, expect } from 'vitest'
import { NL_DEFAULTS, getLaborRules } from '@/lib/solver/nl-defaults'
import type { LaborRules, LaborRuleRow } from '@/lib/solver/nl-defaults'

describe('NL_DEFAULTS', () => {
  it('has correct Dutch law default values', () => {
    expect(NL_DEFAULTS.max_consecutive_days).toBe(6)
    expect(NL_DEFAULTS.min_rest_hours).toBe(11)
    expect(NL_DEFAULTS.mandatory_break_minutes).toBe(30)
    expect(NL_DEFAULTS.mandatory_break_after_hours).toBe(5.5)
    expect(NL_DEFAULTS.overtime_premium_pct).toBe(130)
    expect(NL_DEFAULTS.night_premium_pct).toBe(120)
    expect(NL_DEFAULTS.weekend_premium_pct).toBe(150)
  })

  it('is frozen (readonly)', () => {
    expect(Object.isFrozen(NL_DEFAULTS)).toBe(true)
  })

  it('throws when attempting to mutate (strict mode)', () => {
    expect(() => {
      // TypeScript will flag this at compile time; this verifies runtime enforcement.
      (NL_DEFAULTS as LaborRules).max_consecutive_days = 99
    }).toThrow()
  })
})

describe('getLaborRules', () => {
  it('returns NL defaults when no overrides are provided', () => {
    const rules = getLaborRules([])
    expect(rules).toEqual(NL_DEFAULTS)
  })

  it('does not return the same object reference as NL_DEFAULTS', () => {
    const rules = getLaborRules([])
    expect(rules).not.toBe(NL_DEFAULTS)
  })

  it('overrides max_consecutive_days via rule_type "max_consecutive_days"', () => {
    const dbRules: LaborRuleRow[] = [
      { rule_type: 'max_consecutive_days', parameters_json: { value: 5 }, severity: 'hard' },
    ]
    const rules = getLaborRules(dbRules)
    expect(rules.max_consecutive_days).toBe(5)
    // Other fields stay at defaults
    expect(rules.min_rest_hours).toBe(NL_DEFAULTS.min_rest_hours)
    expect(rules.mandatory_break_minutes).toBe(NL_DEFAULTS.mandatory_break_minutes)
  })

  it('overrides min_rest_hours via rule_type "min_rest_between_shifts"', () => {
    const dbRules: LaborRuleRow[] = [
      { rule_type: 'min_rest_between_shifts', parameters_json: { value: 12 }, severity: 'hard' },
    ]
    const rules = getLaborRules(dbRules)
    expect(rules.min_rest_hours).toBe(12)
    expect(rules.max_consecutive_days).toBe(NL_DEFAULTS.max_consecutive_days)
  })

  it('overrides mandatory_break_minutes via rule_type "mandatory_break"', () => {
    const dbRules: LaborRuleRow[] = [
      { rule_type: 'mandatory_break', parameters_json: { value: 45 }, severity: 'soft' },
    ]
    const rules = getLaborRules(dbRules)
    expect(rules.mandatory_break_minutes).toBe(45)
  })

  it('applies multiple overrides in one call', () => {
    const dbRules: LaborRuleRow[] = [
      { rule_type: 'max_consecutive_days', parameters_json: { value: 4 }, severity: 'hard' },
      { rule_type: 'min_rest_between_shifts', parameters_json: { value: 13 }, severity: 'hard' },
      { rule_type: 'mandatory_break', parameters_json: { value: 60 }, severity: 'soft' },
    ]
    const rules = getLaborRules(dbRules)
    expect(rules.max_consecutive_days).toBe(4)
    expect(rules.min_rest_hours).toBe(13)
    expect(rules.mandatory_break_minutes).toBe(60)
    // Unmapped fields remain at defaults
    expect(rules.overtime_premium_pct).toBe(NL_DEFAULTS.overtime_premium_pct)
    expect(rules.night_premium_pct).toBe(NL_DEFAULTS.night_premium_pct)
    expect(rules.weekend_premium_pct).toBe(NL_DEFAULTS.weekend_premium_pct)
  })

  it('ignores unknown rule_type values', () => {
    const dbRules: LaborRuleRow[] = [
      { rule_type: 'unknown_rule', parameters_json: { value: 999 }, severity: 'hard' },
    ]
    const rules = getLaborRules(dbRules)
    expect(rules).toEqual(NL_DEFAULTS)
  })

  it('last duplicate rule_type wins', () => {
    const dbRules: LaborRuleRow[] = [
      { rule_type: 'max_consecutive_days', parameters_json: { value: 3 }, severity: 'soft' },
      { rule_type: 'max_consecutive_days', parameters_json: { value: 5 }, severity: 'hard' },
    ]
    const rules = getLaborRules(dbRules)
    expect(rules.max_consecutive_days).toBe(5)
  })

  it('does not mutate NL_DEFAULTS when overrides are applied', () => {
    const dbRules: LaborRuleRow[] = [
      { rule_type: 'max_consecutive_days', parameters_json: { value: 1 }, severity: 'hard' },
    ]
    getLaborRules(dbRules)
    expect(NL_DEFAULTS.max_consecutive_days).toBe(6)
  })
})
