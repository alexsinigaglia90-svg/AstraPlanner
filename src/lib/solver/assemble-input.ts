// =============================================================================
// File: src/lib/solver/assemble-input.ts
// Description: Transforms raw DB data into the SolverInput contract.
//              Generates time slots, demand, employee records, and constraints.
// =============================================================================

import type {
  TimeSlot,
  ProcessDemand,
  EmployeeRecord,
  EmployeeSkillRecord,
  AvailabilityWindow,
  HardConstraint,
  SoftConstraint,
} from '@/types/solver'
import type { LaborRules } from '@/lib/solver/nl-defaults'
import { PROFICIENCY_MULTIPLIERS } from '@/lib/workload/constants'

// ---------------------------------------------------------------------------
// Local input types (raw DB shapes)
// ---------------------------------------------------------------------------

export interface ShiftDef {
  id: string
  name: string
  start_time: string // 'HH:MM'
  end_time: string   // 'HH:MM'
  duration_hours: number
}

export interface WorkloadRow {
  process_id: string
  fte_needed: number | null
  period_start: string // ISO date or timestamp
  period_end: string   // ISO date or timestamp
}

export interface RawEmployee {
  id: string
  employee_number: string
  contract_type: 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor'
  weekly_hours_contracted: number
  hourly_rate: number | null
  home_site_id: string
  is_multi_site_eligible: boolean
  crew_id: string | null
  job_role_hourly_rate: number | null
}

export interface RawSkill {
  employee_id: string
  process_id: string
  proficiency_level: number
  has_active_certification: boolean
  certification_expiry: string | null
}

export interface RotationSlot {
  employee_id: string
  date: string        // ISO date
  start_time: string  // 'HH:MM'
  end_time: string    // 'HH:MM'
}

export interface OverrideRow {
  employee_id: string
  start_date: string  // ISO date
  end_date: string    // ISO date
  override_type: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Add N days to an ISO date string and return a new ISO date string. */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Get ISO day-of-week (1=Mon, 7=Sun) for an ISO date string. */
function isoDayOfWeek(isoDate: string): number {
  const d = new Date(isoDate + 'T00:00:00Z')
  const jsDay = d.getUTCDay() // 0=Sun
  return jsDay === 0 ? 7 : jsDay
}

/** Build an ISO timestamp from a date string and HH:MM time. */
function toTimestamp(date: string, time: string): string {
  return `${date}T${time}:00Z`
}

/** Extract the date portion (YYYY-MM-DD) from an ISO string. */
function toDateOnly(iso: string): string {
  return iso.slice(0, 10)
}

// ---------------------------------------------------------------------------
// 1. generateTimeSlots
// ---------------------------------------------------------------------------

/**
 * Generates TimeSlot entries for every combination of work day and shift
 * within the week starting at `weekStart`.
 */
export function generateTimeSlots(
  weekStart: string,
  workDays: number[],
  shifts: ShiftDef[],
): TimeSlot[] {
  const slots: TimeSlot[] = []

  // Iterate through 7 days starting from weekStart
  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(weekStart, offset)
    const dayNum = isoDayOfWeek(date)

    if (!workDays.includes(dayNum)) continue

    for (const shift of shifts) {
      slots.push({
        id: `${date}_${shift.id}`,
        period_start: toTimestamp(date, shift.start_time),
        period_end: toTimestamp(date, shift.end_time),
        duration_minutes: shift.duration_hours * 60,
      })
    }
  }

  return slots
}

// ---------------------------------------------------------------------------
// 2. buildProcessDemand
// ---------------------------------------------------------------------------

/**
 * Converts workload rows into ProcessDemand entries aligned to time slots.
 *
 * - Day-level rows (period_start date == period_end date, or span of 1 day):
 *   matched to all time slots on that date, FTE divided equally across shifts.
 * - Weekly / multi-day rows: FTE distributed evenly across ALL matching slots.
 */
export function buildProcessDemand(
  workloadRows: WorkloadRow[],
  timeSlots: TimeSlot[],
  minSkillLevel: number = 3,
): ProcessDemand[] {
  const demands: ProcessDemand[] = []

  for (const row of workloadRows) {
    const fte = row.fte_needed ?? 0
    if (fte <= 0) continue

    const rowStartDate = toDateOnly(row.period_start)
    const rowEndDate = toDateOnly(row.period_end)
    const isDayLevel = rowStartDate === rowEndDate

    if (isDayLevel) {
      // Find all time slots for this date
      const matchingSlots = timeSlots.filter(
        (ts) => toDateOnly(ts.period_start) === rowStartDate,
      )
      if (matchingSlots.length === 0) continue

      const ftePerSlot = fte / matchingSlots.length
      for (const slot of matchingSlots) {
        demands.push({
          process_id: row.process_id,
          time_slot_id: slot.id,
          required_fte: ftePerSlot,
          min_skill_level: minSkillLevel,
          required_certifications: [],
        })
      }
    } else {
      // Weekly / multi-day: distribute across all slots within range
      const matchingSlots = timeSlots.filter((ts) => {
        const slotDate = toDateOnly(ts.period_start)
        return slotDate >= rowStartDate && slotDate <= rowEndDate
      })
      if (matchingSlots.length === 0) continue

      const ftePerSlot = fte / matchingSlots.length
      for (const slot of matchingSlots) {
        demands.push({
          process_id: row.process_id,
          time_slot_id: slot.id,
          required_fte: ftePerSlot,
          min_skill_level: minSkillLevel,
          required_certifications: [],
        })
      }
    }
  }

  return demands
}

// ---------------------------------------------------------------------------
// 3. buildEmployeeRecords
// ---------------------------------------------------------------------------

/**
 * Assembles EmployeeRecord[] from raw DB data.
 */
export function buildEmployeeRecords(
  employees: RawEmployee[],
  skills: RawSkill[],
  rotationAvailability: RotationSlot[],
  overrides: OverrideRow[],
  existingHours: Map<string, number>,
  consecutiveDays: Map<string, number>,
): EmployeeRecord[] {
  // Index skills by employee
  const skillsByEmployee = new Map<string, RawSkill[]>()
  for (const s of skills) {
    const arr = skillsByEmployee.get(s.employee_id)
    if (arr) arr.push(s)
    else skillsByEmployee.set(s.employee_id, [s])
  }

  // Index rotation availability by employee
  const rotByEmployee = new Map<string, RotationSlot[]>()
  for (const r of rotationAvailability) {
    const arr = rotByEmployee.get(r.employee_id)
    if (arr) arr.push(r)
    else rotByEmployee.set(r.employee_id, [r])
  }

  // Index overrides by employee
  const overridesByEmployee = new Map<string, OverrideRow[]>()
  for (const o of overrides) {
    const arr = overridesByEmployee.get(o.employee_id)
    if (arr) arr.push(o)
    else overridesByEmployee.set(o.employee_id, [o])
  }

  return employees.map((emp) => {
    // Skills
    const empSkills: EmployeeSkillRecord[] = (
      skillsByEmployee.get(emp.id) ?? []
    ).map((s) => ({
      process_id: s.process_id,
      proficiency_level: s.proficiency_level,
      productivity_multiplier: PROFICIENCY_MULTIPLIERS[s.proficiency_level] ?? 1.0,
      has_active_certification: s.has_active_certification,
      certification_expiry: s.certification_expiry,
    }))

    // Availability from rotation
    const rotSlots = rotByEmployee.get(emp.id) ?? []
    const availability: AvailabilityWindow[] = rotSlots.map((r) => ({
      start: toTimestamp(r.date, r.start_time),
      end: toTimestamp(r.date, r.end_time),
    }))

    // Subtract overrides (except extra_availability) from availability
    const empOverrides = overridesByEmployee.get(emp.id) ?? []
    const subtractOverrides = empOverrides.filter(
      (o) => o.override_type !== 'extra_availability',
    )

    // For each subtracted override, remove overlapping availability windows
    let filteredAvailability = availability
    for (const override of subtractOverrides) {
      const oStart = toTimestamp(override.start_date, '00:00')
      const oEnd = toTimestamp(override.end_date, '23:59')
      filteredAvailability = filteredAvailability.filter((a) => {
        // Remove if the availability window is fully within the override
        return !(a.start >= oStart && a.end <= oEnd)
      })
    }

    // Add extra_availability overrides as additional windows
    const extraOverrides = empOverrides.filter(
      (o) => o.override_type === 'extra_availability',
    )
    for (const extra of extraOverrides) {
      filteredAvailability.push({
        start: toTimestamp(extra.start_date, '00:00'),
        end: toTimestamp(extra.end_date, '23:59'),
      })
    }

    const hourlyRate = emp.hourly_rate ?? emp.job_role_hourly_rate ?? 0

    return {
      id: emp.id,
      employee_number: emp.employee_number,
      contract_type: emp.contract_type,
      weekly_hours_contracted: emp.weekly_hours_contracted,
      hourly_rate: hourlyRate,
      home_site_id: emp.home_site_id,
      is_multi_site_eligible: emp.is_multi_site_eligible,
      skills: empSkills,
      availability: filteredAvailability,
      current_week_hours: existingHours.get(emp.id) ?? 0,
      consecutive_days_worked: consecutiveDays.get(emp.id) ?? 0,
    }
  })
}

// ---------------------------------------------------------------------------
// 4. buildConstraints
// ---------------------------------------------------------------------------

/**
 * Produces the standard set of hard and soft constraints from labor rules.
 */
export function buildConstraints(laborRules: LaborRules): {
  hard: HardConstraint[]
  soft: SoftConstraint[]
} {
  const hard: HardConstraint[] = [
    {
      type: 'max_consecutive_days',
      scope: 'employee',
      parameters: { max_days: laborRules.max_consecutive_days },
    },
    {
      type: 'min_rest_between_shifts',
      scope: 'employee',
      parameters: { min_hours: laborRules.min_rest_hours },
    },
    {
      type: 'shift_assignment',
      scope: 'employee',
      parameters: { one_shift_per_day: true },
    },
    {
      type: 'skill_eligibility',
      scope: 'process',
      parameters: { require_minimum_level: true },
    },
    {
      type: 'max_weekly_hours',
      scope: 'employee',
      parameters: { use_contracted_hours: true },
    },
  ]

  const soft: SoftConstraint[] = [
    {
      type: 'home_department_preference',
      weight: 0.3,
      parameters: { prefer_home_site: true },
    },
    {
      type: 'workload_balance',
      weight: 0.2,
      parameters: { balance_across_employees: true },
    },
    {
      type: 'overtime_avoidance',
      weight: 0.1,
      parameters: { premium_pct: laborRules.overtime_premium_pct },
    },
  ]

  return { hard, soft }
}
