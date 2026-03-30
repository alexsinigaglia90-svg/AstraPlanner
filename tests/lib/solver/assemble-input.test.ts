import { describe, it, expect } from 'vitest'
import {
  generateTimeSlots,
  buildProcessDemand,
  buildEmployeeRecords,
  buildConstraints,
  type ShiftDef,
  type WorkloadRow,
  type RawEmployee,
  type RawSkill,
  type RotationSlot,
  type OverrideRow,
} from '@/lib/solver/assemble-input'
import type { LaborRules } from '@/lib/solver/nl-defaults'
import { NL_DEFAULTS } from '@/lib/solver/nl-defaults'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MORNING: ShiftDef = {
  id: 'shift-morning',
  name: 'Morning',
  start_time: '06:00',
  end_time: '14:00',
  duration_hours: 8,
}

const AFTERNOON: ShiftDef = {
  id: 'shift-afternoon',
  name: 'Afternoon',
  start_time: '14:00',
  end_time: '22:00',
  duration_hours: 8,
}

// 2026-04-06 is a Monday
const WEEK_START = '2026-04-06'
const WORK_DAYS_5 = [1, 2, 3, 4, 5] // Mon-Fri
const WORK_DAYS_6 = [1, 2, 3, 4, 5, 6] // Mon-Sat

// ---------------------------------------------------------------------------
// generateTimeSlots
// ---------------------------------------------------------------------------

describe('generateTimeSlots', () => {
  it('produces 10 slots for 5 work days x 2 shifts', () => {
    const slots = generateTimeSlots(WEEK_START, WORK_DAYS_5, [MORNING, AFTERNOON])
    expect(slots).toHaveLength(10)
  })

  it('generates correct slot IDs', () => {
    const slots = generateTimeSlots(WEEK_START, WORK_DAYS_5, [MORNING, AFTERNOON])
    expect(slots[0]!.id).toBe('2026-04-06_shift-morning')
    expect(slots[1]!.id).toBe('2026-04-06_shift-afternoon')
    expect(slots[2]!.id).toBe('2026-04-07_shift-morning')
  })

  it('sets correct ISO timestamps', () => {
    const slots = generateTimeSlots(WEEK_START, WORK_DAYS_5, [MORNING])
    const first = slots[0]!
    expect(first.period_start).toBe('2026-04-06T06:00:00Z')
    expect(first.period_end).toBe('2026-04-06T14:00:00Z')
    expect(first.duration_minutes).toBe(480)
  })

  it('produces 12 slots for 6-day work week x 2 shifts', () => {
    const slots = generateTimeSlots(WEEK_START, WORK_DAYS_6, [MORNING, AFTERNOON])
    expect(slots).toHaveLength(12)

    // The last slot should be Saturday
    const lastSlot = slots[slots.length - 1]!
    expect(lastSlot.id).toBe('2026-04-11_shift-afternoon')
  })

  it('returns empty array when no work days match', () => {
    const slots = generateTimeSlots(WEEK_START, [7], [MORNING]) // Sunday only
    // 2026-04-06 is Monday, so Sunday is 2026-04-12 (offset=6)
    expect(slots).toHaveLength(1)
    expect(slots[0]!.id).toBe('2026-04-12_shift-morning')
  })

  it('handles single shift', () => {
    const slots = generateTimeSlots(WEEK_START, WORK_DAYS_5, [MORNING])
    expect(slots).toHaveLength(5)
  })
})

// ---------------------------------------------------------------------------
// buildProcessDemand
// ---------------------------------------------------------------------------

describe('buildProcessDemand', () => {
  const timeSlots = generateTimeSlots(WEEK_START, WORK_DAYS_5, [MORNING, AFTERNOON])

  it('converts a day-level workload row into demands split across shifts', () => {
    const rows: WorkloadRow[] = [
      {
        process_id: 'proc-1',
        fte_needed: 4,
        period_start: '2026-04-06',
        period_end: '2026-04-06',
      },
    ]
    const demands = buildProcessDemand(rows, timeSlots)

    // 2 shifts on that day => 4 FTE / 2 = 2 per slot
    expect(demands).toHaveLength(2)
    expect(demands[0]!.required_fte).toBe(2)
    expect(demands[0]!.min_skill_level).toBe(3) // default
    expect(demands[0]!.process_id).toBe('proc-1')
  })

  it('distributes weekly rows evenly across all slots', () => {
    const rows: WorkloadRow[] = [
      {
        process_id: 'proc-2',
        fte_needed: 10,
        period_start: '2026-04-06',
        period_end: '2026-04-10',
      },
    ]
    const demands = buildProcessDemand(rows, timeSlots)

    // 10 slots total, 10 FTE => 1 per slot
    expect(demands).toHaveLength(10)
    expect(demands[0]!.required_fte).toBe(1)
  })

  it('skips rows with null or zero FTE', () => {
    const rows: WorkloadRow[] = [
      { process_id: 'p1', fte_needed: null, period_start: '2026-04-06', period_end: '2026-04-06' },
      { process_id: 'p2', fte_needed: 0, period_start: '2026-04-06', period_end: '2026-04-06' },
    ]
    const demands = buildProcessDemand(rows, timeSlots)
    expect(demands).toHaveLength(0)
  })

  it('uses custom minSkillLevel when provided', () => {
    const rows: WorkloadRow[] = [
      { process_id: 'proc-1', fte_needed: 2, period_start: '2026-04-06', period_end: '2026-04-06' },
    ]
    const demands = buildProcessDemand(rows, timeSlots, 4)
    expect(demands[0]!.min_skill_level).toBe(4)
  })
})

// ---------------------------------------------------------------------------
// buildEmployeeRecords
// ---------------------------------------------------------------------------

describe('buildEmployeeRecords', () => {
  const baseEmployee: RawEmployee = {
    id: 'emp-1',
    employee_number: 'E001',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    hourly_rate: 25,
    home_site_id: 'site-1',
    is_multi_site_eligible: false,
    crew_id: 'crew-1',
    job_role_hourly_rate: 20,
  }

  it('maps basic employee fields correctly', () => {
    const records = buildEmployeeRecords(
      [baseEmployee], [], [], [], new Map(), new Map(),
    )
    expect(records).toHaveLength(1)
    expect(records[0]!.id).toBe('emp-1')
    expect(records[0]!.hourly_rate).toBe(25)
    expect(records[0]!.current_week_hours).toBe(0)
    expect(records[0]!.consecutive_days_worked).toBe(0)
  })

  it('falls back to job_role_hourly_rate when hourly_rate is null', () => {
    const emp = { ...baseEmployee, hourly_rate: null }
    const records = buildEmployeeRecords([emp], [], [], [], new Map(), new Map())
    expect(records[0]!.hourly_rate).toBe(20)
  })

  it('falls back to 0 when both rates are null', () => {
    const emp = { ...baseEmployee, hourly_rate: null, job_role_hourly_rate: null }
    const records = buildEmployeeRecords([emp], [], [], [], new Map(), new Map())
    expect(records[0]!.hourly_rate).toBe(0)
  })

  it('maps skills with proficiency multipliers', () => {
    const skills: RawSkill[] = [
      {
        employee_id: 'emp-1',
        process_id: 'proc-1',
        proficiency_level: 4,
        has_active_certification: true,
        certification_expiry: '2027-01-01',
      },
    ]
    const records = buildEmployeeRecords(
      [baseEmployee], skills, [], [], new Map(), new Map(),
    )
    expect(records[0]!.skills).toHaveLength(1)
    expect(records[0]!.skills[0]!.productivity_multiplier).toBe(1.15)
    expect(records[0]!.skills[0]!.has_active_certification).toBe(true)
  })

  it('uses existingHours and consecutiveDays maps', () => {
    const hours = new Map([['emp-1', 32]])
    const days = new Map([['emp-1', 4]])
    const records = buildEmployeeRecords(
      [baseEmployee], [], [], [], hours, days,
    )
    expect(records[0]!.current_week_hours).toBe(32)
    expect(records[0]!.consecutive_days_worked).toBe(4)
  })

  it('filters out availability windows covered by overrides', () => {
    const rotation: RotationSlot[] = [
      { employee_id: 'emp-1', date: '2026-04-06', start_time: '06:00', end_time: '14:00' },
      { employee_id: 'emp-1', date: '2026-04-07', start_time: '06:00', end_time: '14:00' },
    ]
    const overrides: OverrideRow[] = [
      { employee_id: 'emp-1', start_date: '2026-04-06', end_date: '2026-04-06', override_type: 'sick_leave' },
    ]
    const records = buildEmployeeRecords(
      [baseEmployee], [], rotation, overrides, new Map(), new Map(),
    )
    // The 2026-04-06 window should be removed
    expect(records[0]!.availability).toHaveLength(1)
    expect(records[0]!.availability[0]!.start).toContain('2026-04-07')
  })

  it('adds extra_availability overrides as additional windows', () => {
    const overrides: OverrideRow[] = [
      { employee_id: 'emp-1', start_date: '2026-04-12', end_date: '2026-04-12', override_type: 'extra_availability' },
    ]
    const records = buildEmployeeRecords(
      [baseEmployee], [], [], overrides, new Map(), new Map(),
    )
    expect(records[0]!.availability).toHaveLength(1)
    expect(records[0]!.availability[0]!.start).toContain('2026-04-12')
  })
})

// ---------------------------------------------------------------------------
// buildConstraints
// ---------------------------------------------------------------------------

describe('buildConstraints', () => {
  it('generates 5 hard constraints from NL_DEFAULTS', () => {
    const { hard } = buildConstraints(NL_DEFAULTS)
    expect(hard).toHaveLength(5)

    const types = hard.map((c) => c.type)
    expect(types).toContain('max_consecutive_days')
    expect(types).toContain('min_rest_between_shifts')
    expect(types).toContain('shift_assignment')
    expect(types).toContain('skill_eligibility')
    expect(types).toContain('max_weekly_hours')
  })

  it('generates 3 soft constraints with correct weights', () => {
    const { soft } = buildConstraints(NL_DEFAULTS)
    expect(soft).toHaveLength(3)

    const homePref = soft.find((c) => c.type === 'home_department_preference')
    expect(homePref?.weight).toBe(0.3)

    const balance = soft.find((c) => c.type === 'workload_balance')
    expect(balance?.weight).toBe(0.2)

    const overtime = soft.find((c) => c.type === 'overtime_avoidance')
    expect(overtime?.weight).toBe(0.1)
  })

  it('uses labor rule values in constraint parameters', () => {
    const rules: LaborRules = {
      ...NL_DEFAULTS,
      max_consecutive_days: 5,
      min_rest_hours: 12,
      overtime_premium_pct: 150,
    }
    const { hard, soft } = buildConstraints(rules)

    const maxDays = hard.find((c) => c.type === 'max_consecutive_days')
    expect(maxDays?.parameters.max_days).toBe(5)

    const minRest = hard.find((c) => c.type === 'min_rest_between_shifts')
    expect(minRest?.parameters.min_hours).toBe(12)

    const overtime = soft.find((c) => c.type === 'overtime_avoidance')
    expect(overtime?.parameters.premium_pct).toBe(150)
  })

  it('hard constraints have correct scopes', () => {
    const { hard } = buildConstraints(NL_DEFAULTS)

    const employeeScoped = hard.filter((c) => c.scope === 'employee')
    expect(employeeScoped).toHaveLength(4)

    const processScoped = hard.filter((c) => c.scope === 'process')
    expect(processScoped).toHaveLength(1)
    expect(processScoped[0]!.type).toBe('skill_eligibility')
  })
})
