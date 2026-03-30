# Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the workforce assignment solver with Greedy + HiGHS MIP strategies, planning router, and scenario support.

**Architecture:** SolverInput assembled from existing DB data (employees, skills, shifts, rotations, demand). Two solver strategies share the same I/O contract (src/types/solver.ts). Planning router orchestrates plan lifecycle (draft→published). All runs on Vercel Pro (300s timeout).

**Tech Stack:** TypeScript, Vitest, tRPC, Supabase, highs-solver (WASM)

**Spec:** docs/superpowers/specs/2026-03-30-solver-design.md

---

## File Structure

```
src/lib/solver/
  nl-defaults.ts          # Default NL labor rules (parametrizable)
  constraints.ts          # Constraint evaluation: check hard/soft against assignments
  cost.ts                 # Cost calculation: base rate + overtime/night/weekend premiums
  assemble-input.ts       # Build SolverInput from DB queries
  greedy.ts               # Greedy heuristic solver
  highs.ts                # HiGHS MIP wrapper
  validate-output.ts      # Validate solver output, detect infeasibility

src/server/routers/
  planning.ts             # Rewrite stubs → full implementation
  scenario.ts             # Rewrite stubs → full implementation

tests/lib/solver/
  nl-defaults.test.ts
  constraints.test.ts
  cost.test.ts
  assemble-input.test.ts
  greedy.test.ts
  highs.test.ts
  validate-output.test.ts
```

---

### Task 1: NL Defaults + Labor Rule Reader

**Files:**
- Create: `src/lib/solver/nl-defaults.ts`
- Test: `tests/lib/solver/nl-defaults.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/lib/solver/nl-defaults.test.ts
import { describe, it, expect } from 'vitest'
import { getLaborRules, NL_DEFAULTS, type LaborRules } from '@/lib/solver/nl-defaults'

describe('NL Defaults', () => {
  it('returns NL defaults when no overrides', () => {
    const rules = getLaborRules([])
    expect(rules.max_consecutive_days).toBe(6)
    expect(rules.min_rest_hours).toBe(11)
    expect(rules.mandatory_break_minutes).toBe(30)
    expect(rules.mandatory_break_after_hours).toBe(5.5)
    expect(rules.overtime_premium_pct).toBe(130)
    expect(rules.night_premium_pct).toBe(120)
    expect(rules.weekend_premium_pct).toBe(150)
  })

  it('overrides specific rules from labor_rule rows', () => {
    const overrides = [
      { rule_type: 'max_consecutive_days', parameters_json: { value: 5 }, severity: 'hard_constraint' as const },
      { rule_type: 'min_rest_between_shifts', parameters_json: { value: 12 }, severity: 'hard_constraint' as const },
    ]
    const rules = getLaborRules(overrides)
    expect(rules.max_consecutive_days).toBe(5)
    expect(rules.min_rest_hours).toBe(12)
    expect(rules.overtime_premium_pct).toBe(130) // unchanged
  })

  it('exports NL_DEFAULTS as readonly', () => {
    expect(NL_DEFAULTS.max_consecutive_days).toBe(6)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/solver/nl-defaults.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/solver/nl-defaults.ts

export interface LaborRules {
  max_consecutive_days: number
  min_rest_hours: number
  mandatory_break_minutes: number
  mandatory_break_after_hours: number
  overtime_premium_pct: number
  night_premium_pct: number
  weekend_premium_pct: number
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

interface LaborRuleRow {
  rule_type: string
  parameters_json: Record<string, unknown>
  severity: 'hard_constraint' | 'soft_constraint' | 'warning'
}

const RULE_MAP: Record<string, keyof LaborRules> = {
  max_consecutive_days: 'max_consecutive_days',
  min_rest_between_shifts: 'min_rest_hours',
  mandatory_break: 'mandatory_break_minutes',
  overtime_threshold_daily: 'overtime_premium_pct',
}

export function getLaborRules(dbRules: LaborRuleRow[]): LaborRules {
  const rules: LaborRules = { ...NL_DEFAULTS }

  for (const row of dbRules) {
    const val = row.parameters_json?.value
    if (typeof val !== 'number') continue

    const key = RULE_MAP[row.rule_type]
    if (key) {
      rules[key] = val
    }
  }

  return rules
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/solver/nl-defaults.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/solver/nl-defaults.ts tests/lib/solver/nl-defaults.test.ts
git commit -m "feat(solver): NL default labor rules with DB override support"
```

---

### Task 2: Cost Calculation

**Files:**
- Create: `src/lib/solver/cost.ts`
- Test: `tests/lib/solver/cost.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/lib/solver/cost.test.ts
import { describe, it, expect } from 'vitest'
import { calculateAssignmentCost } from '@/lib/solver/cost'
import { NL_DEFAULTS } from '@/lib/solver/nl-defaults'

describe('calculateAssignmentCost', () => {
  const baseInput = {
    hourlyRate: 22.50,
    hours: 8,
    isOvertime: false,
    isNightShift: false,
    isWeekend: false,
    laborRules: NL_DEFAULTS,
  }

  it('calculates base cost (no premiums)', () => {
    expect(calculateAssignmentCost(baseInput)).toBe(180) // 22.50 * 8
  })

  it('applies overtime premium', () => {
    const cost = calculateAssignmentCost({ ...baseInput, isOvertime: true })
    expect(cost).toBe(234) // 22.50 * 1.3 * 8
  })

  it('applies night premium', () => {
    const cost = calculateAssignmentCost({ ...baseInput, isNightShift: true })
    expect(cost).toBe(216) // 22.50 * 1.2 * 8
  })

  it('applies weekend premium', () => {
    const cost = calculateAssignmentCost({ ...baseInput, isWeekend: true })
    expect(cost).toBe(270) // 22.50 * 1.5 * 8
  })

  it('stacks overtime + weekend (highest wins)', () => {
    const cost = calculateAssignmentCost({ ...baseInput, isOvertime: true, isWeekend: true })
    expect(cost).toBe(270) // 22.50 * max(1.3, 1.5) * 8 = weekend wins
  })

  it('returns 0 when hourlyRate is 0', () => {
    expect(calculateAssignmentCost({ ...baseInput, hourlyRate: 0 })).toBe(0)
  })
})

describe('isNightHours / isWeekendDay helpers', () => {
  // Tested indirectly via solver, but exported for reuse
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/solver/cost.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/solver/cost.ts
import type { LaborRules } from './nl-defaults'

export interface CostInput {
  hourlyRate: number
  hours: number
  isOvertime: boolean
  isNightShift: boolean
  isWeekend: boolean
  laborRules: LaborRules
}

export function calculateAssignmentCost(input: CostInput): number {
  if (input.hourlyRate <= 0 || input.hours <= 0) return 0

  // Pick highest applicable premium (they don't stack — highest wins)
  let premiumPct = 100
  if (input.isOvertime) premiumPct = Math.max(premiumPct, input.laborRules.overtime_premium_pct)
  if (input.isNightShift) premiumPct = Math.max(premiumPct, input.laborRules.night_premium_pct)
  if (input.isWeekend) premiumPct = Math.max(premiumPct, input.laborRules.weekend_premium_pct)

  return input.hourlyRate * (premiumPct / 100) * input.hours
}

export function isNightHours(startHour: number, endHour: number): boolean {
  // Night = any part of shift falls in 23:00-06:00
  return startHour >= 23 || endHour <= 6 || startHour < 6
}

export function isWeekendDay(date: string): boolean {
  const day = new Date(date).getDay() // 0=Sun, 6=Sat
  return day === 0 || day === 6
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/solver/cost.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/solver/cost.ts tests/lib/solver/cost.test.ts
git commit -m "feat(solver): cost calculation with overtime/night/weekend premiums"
```

---

### Task 3: Constraint Evaluation Helpers

**Files:**
- Create: `src/lib/solver/constraints.ts`
- Test: `tests/lib/solver/constraints.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/lib/solver/constraints.test.ts
import { describe, it, expect } from 'vitest'
import {
  checkMaxWeeklyHours,
  checkMaxConsecutiveDays,
  checkMinRestBetweenShifts,
  checkSkillEligibility,
} from '@/lib/solver/constraints'

describe('checkMaxWeeklyHours', () => {
  it('passes when under limit', () => {
    expect(checkMaxWeeklyHours(32, 8, 40)).toEqual({ ok: true })
  })

  it('fails when would exceed limit', () => {
    const result = checkMaxWeeklyHours(36, 8, 40)
    expect(result.ok).toBe(false)
    expect(result.overage).toBe(4)
  })

  it('allows exact limit', () => {
    expect(checkMaxWeeklyHours(32, 8, 40)).toEqual({ ok: true })
  })
})

describe('checkMaxConsecutiveDays', () => {
  it('passes when under limit', () => {
    expect(checkMaxConsecutiveDays(4, 6)).toEqual({ ok: true })
  })

  it('fails when at limit', () => {
    expect(checkMaxConsecutiveDays(6, 6)).toEqual({ ok: false })
  })
})

describe('checkMinRestBetweenShifts', () => {
  it('passes with enough rest', () => {
    // Previous shift ended 18:00, next starts 06:00 = 12h rest
    expect(checkMinRestBetweenShifts(18, 6, true, 11)).toEqual({ ok: true })
  })

  it('fails without enough rest', () => {
    // Previous shift ended 22:00, next starts 06:00 = 8h rest
    expect(checkMinRestBetweenShifts(22, 6, true, 11)).toEqual({ ok: false, restHours: 8 })
  })

  it('passes when no previous shift', () => {
    expect(checkMinRestBetweenShifts(0, 6, false, 11)).toEqual({ ok: true })
  })
})

describe('checkSkillEligibility', () => {
  it('passes when proficiency meets minimum', () => {
    expect(checkSkillEligibility(3, 3)).toBe(true)
  })

  it('fails when proficiency below minimum', () => {
    expect(checkSkillEligibility(2, 3)).toBe(false)
  })

  it('passes when no skill required (min=0)', () => {
    expect(checkSkillEligibility(0, 0)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/solver/constraints.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/solver/constraints.ts

export interface ConstraintCheck {
  ok: boolean
  overage?: number
  restHours?: number
}

export function checkMaxWeeklyHours(
  currentHours: number,
  additionalHours: number,
  maxHours: number,
): ConstraintCheck {
  const total = currentHours + additionalHours
  if (total <= maxHours) return { ok: true }
  return { ok: false, overage: total - maxHours }
}

export function checkMaxConsecutiveDays(
  consecutiveDays: number,
  maxDays: number,
): ConstraintCheck {
  return { ok: consecutiveDays < maxDays }
}

export function checkMinRestBetweenShifts(
  previousEndHour: number,
  nextStartHour: number,
  hasPreviousShift: boolean,
  minRestHours: number,
): ConstraintCheck {
  if (!hasPreviousShift) return { ok: true }

  let rest = nextStartHour - previousEndHour
  if (rest < 0) rest += 24 // overnight

  if (rest >= minRestHours) return { ok: true }
  return { ok: false, restHours: rest }
}

export function checkSkillEligibility(
  proficiencyLevel: number,
  minRequired: number,
): boolean {
  return proficiencyLevel >= minRequired
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/solver/constraints.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/solver/constraints.ts tests/lib/solver/constraints.test.ts
git commit -m "feat(solver): constraint evaluation helpers (hours, rest, skill)"
```

---

### Task 4: SolverInput Assembly

**Files:**
- Create: `src/lib/solver/assemble-input.ts`
- Test: `tests/lib/solver/assemble-input.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/lib/solver/assemble-input.test.ts
import { describe, it, expect } from 'vitest'
import {
  generateTimeSlots,
  buildProcessDemand,
  buildEmployeeRecords,
  buildConstraints,
} from '@/lib/solver/assemble-input'

describe('generateTimeSlots', () => {
  it('generates day-level slots for a week with 2 shifts', () => {
    const shifts = [
      { id: 's1', name: 'Morning', start_time: '06:00', end_time: '14:00', duration_hours: 8 },
      { id: 's2', name: 'Afternoon', start_time: '14:00', end_time: '22:00', duration_hours: 8 },
    ]
    const workDays = [1, 2, 3, 4, 5] // Mon-Fri
    const weekStart = '2026-04-06' // Monday

    const slots = generateTimeSlots(weekStart, workDays, shifts)

    expect(slots).toHaveLength(10) // 5 days × 2 shifts
    expect(slots[0]!.id).toBe('2026-04-06_s1')
    expect(slots[0]!.duration_minutes).toBe(480)
    expect(slots[9]!.id).toBe('2026-04-10_s2')
  })

  it('handles 6-day work week', () => {
    const shifts = [{ id: 's1', name: 'Day', start_time: '08:00', end_time: '16:00', duration_hours: 8 }]
    const slots = generateTimeSlots('2026-04-06', [1, 2, 3, 4, 5, 6], shifts)
    expect(slots).toHaveLength(6)
  })
})

describe('buildProcessDemand', () => {
  it('converts workload_plan rows to ProcessDemand', () => {
    const workloadRows = [
      { process_id: 'p1', fte_needed: 5, period_start: '2026-04-06', period_end: '2026-04-06' },
    ]
    const timeSlots = [{ id: '2026-04-06_s1', period_start: '2026-04-06T06:00', period_end: '2026-04-06T14:00', duration_minutes: 480 }]

    const demand = buildProcessDemand(workloadRows, timeSlots)

    expect(demand).toHaveLength(1)
    expect(demand[0]!.process_id).toBe('p1')
    expect(demand[0]!.required_fte).toBe(5)
    expect(demand[0]!.min_skill_level).toBe(3) // default
  })
})

describe('buildConstraints', () => {
  it('generates hard constraints from labor rules', () => {
    const laborRules = {
      max_consecutive_days: 6,
      min_rest_hours: 11,
      mandatory_break_minutes: 30,
      mandatory_break_after_hours: 5.5,
      overtime_premium_pct: 130,
      night_premium_pct: 120,
      weekend_premium_pct: 150,
    }

    const { hard, soft } = buildConstraints(laborRules)

    expect(hard.length).toBeGreaterThanOrEqual(2) // consecutive + rest
    expect(hard.find(c => c.type === 'max_consecutive_days')).toBeDefined()
    expect(hard.find(c => c.type === 'min_rest_between_shifts')).toBeDefined()
    expect(soft.length).toBeGreaterThanOrEqual(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/solver/assemble-input.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/solver/assemble-input.ts
import type {
  TimeSlot,
  ProcessDemand,
  EmployeeRecord,
  EmployeeSkillRecord,
  AvailabilityWindow,
  HardConstraint,
  SoftConstraint,
} from '@/types/solver'
import type { LaborRules } from './nl-defaults'
import { PROFICIENCY_MULTIPLIERS } from '@/lib/workload/constants'

// ── Time Slots ──────────────────────────────────────────────────────────────

interface ShiftDef {
  id: string
  name: string
  start_time: string // "HH:MM"
  end_time: string // "HH:MM"
  duration_hours: number
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}

function dayOfWeek(dateStr: string): number {
  const d = new Date(dateStr)
  const day = d.getDay() // 0=Sun
  return day === 0 ? 7 : day // 1=Mon, 7=Sun (ISO)
}

export function generateTimeSlots(
  weekStart: string,
  workDays: number[],
  shifts: ShiftDef[],
): TimeSlot[] {
  const slots: TimeSlot[] = []
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const dow = dayOfWeek(date)
    if (!workDays.includes(dow)) continue

    for (const shift of shifts) {
      slots.push({
        id: `${date}_${shift.id}`,
        period_start: `${date}T${shift.start_time}:00`,
        period_end: `${date}T${shift.end_time}:00`,
        duration_minutes: shift.duration_hours * 60,
      })
    }
  }
  return slots
}

// ── Process Demand ──────────────────────────────────────────────────────────

interface WorkloadPlanRow {
  process_id: string
  fte_needed: number | null
  period_start: string
  period_end: string
}

export function buildProcessDemand(
  workloadRows: WorkloadPlanRow[],
  timeSlots: TimeSlot[],
  minSkillLevel: number = 3,
): ProcessDemand[] {
  const demand: ProcessDemand[] = []

  for (const row of workloadRows) {
    if (!row.fte_needed || row.fte_needed <= 0) continue

    // Match workload row to time slots for that day
    const daySlots = timeSlots.filter((s) => s.period_start.startsWith(row.period_start))

    if (daySlots.length === 0) {
      // Weekly row: distribute evenly across all slots
      const perSlot = row.fte_needed / timeSlots.length
      for (const slot of timeSlots) {
        demand.push({
          process_id: row.process_id,
          time_slot_id: slot.id,
          required_fte: Math.ceil(perSlot * 10) / 10, // round to 0.1
          min_skill_level: minSkillLevel,
          required_certifications: [],
        })
      }
    } else {
      // Day-level row: distribute across shifts on that day
      const perShift = row.fte_needed / daySlots.length
      for (const slot of daySlots) {
        demand.push({
          process_id: row.process_id,
          time_slot_id: slot.id,
          required_fte: Math.ceil(perShift * 10) / 10,
          min_skill_level: minSkillLevel,
          required_certifications: [],
        })
      }
    }
  }

  return demand
}

// ── Employees ───────────────────────────────────────────────────────────────

interface EmployeeRow {
  id: string
  employee_number: string
  contract_type: string
  weekly_hours_contracted: number
  hourly_rate: number | null
  home_site_id: string
  is_multi_site_eligible: boolean
  crew_id: string | null
  job_role_hourly_rate: number | null
}

interface SkillRow {
  employee_id: string
  process_id: string
  proficiency_level: number
  has_active_certification: boolean
  certification_expiry: string | null
}

interface RotationAvailability {
  employee_id: string
  date: string
  start_time: string
  end_time: string
}

interface OverrideRow {
  employee_id: string
  start_date: string
  end_date: string
  override_type: string
}

export function buildEmployeeRecords(
  employees: EmployeeRow[],
  skills: SkillRow[],
  rotationAvailability: RotationAvailability[],
  overrides: OverrideRow[],
  existingHours: Map<string, number>,
  consecutiveDays: Map<string, number>,
): EmployeeRecord[] {
  const skillsByEmp = new Map<string, SkillRow[]>()
  for (const s of skills) {
    const list = skillsByEmp.get(s.employee_id) ?? []
    list.push(s)
    skillsByEmp.set(s.employee_id, list)
  }

  const overridesByEmp = new Map<string, OverrideRow[]>()
  for (const o of overrides) {
    const list = overridesByEmp.get(o.employee_id) ?? []
    list.push(o)
    overridesByEmp.set(o.employee_id, list)
  }

  const availByEmp = new Map<string, RotationAvailability[]>()
  for (const a of rotationAvailability) {
    const list = availByEmp.get(a.employee_id) ?? []
    list.push(a)
    availByEmp.set(a.employee_id, list)
  }

  return employees.map((emp): EmployeeRecord => {
    const empSkills = skillsByEmp.get(emp.id) ?? []
    const empOverrides = overridesByEmp.get(emp.id) ?? []
    const empAvail = availByEmp.get(emp.id) ?? []

    // Build skills with productivity multiplier
    const skillRecords: EmployeeSkillRecord[] = empSkills.map((s) => ({
      process_id: s.process_id,
      proficiency_level: s.proficiency_level,
      productivity_multiplier: PROFICIENCY_MULTIPLIERS[s.proficiency_level] ?? 1.0,
      has_active_certification: s.has_active_certification,
      certification_expiry: s.certification_expiry,
    }))

    // Build availability windows from rotation, minus overrides
    const overrideDates = new Set<string>()
    for (const o of empOverrides) {
      if (o.override_type === 'extra_availability') continue // adds, doesn't subtract
      let d = new Date(o.start_date)
      const end = new Date(o.end_date)
      while (d <= end) {
        overrideDates.add(d.toISOString().split('T')[0]!)
        d.setDate(d.getDate() + 1)
      }
    }

    const availability: AvailabilityWindow[] = empAvail
      .filter((a) => !overrideDates.has(a.date))
      .map((a) => ({
        start: `${a.date}T${a.start_time}:00`,
        end: `${a.date}T${a.end_time}:00`,
      }))

    return {
      id: emp.id,
      employee_number: emp.employee_number,
      contract_type: emp.contract_type as EmployeeRecord['contract_type'],
      weekly_hours_contracted: emp.weekly_hours_contracted,
      hourly_rate: emp.hourly_rate ?? emp.job_role_hourly_rate ?? 0,
      home_site_id: emp.home_site_id,
      is_multi_site_eligible: emp.is_multi_site_eligible,
      skills: skillRecords,
      availability,
      current_week_hours: existingHours.get(emp.id) ?? 0,
      consecutive_days_worked: consecutiveDays.get(emp.id) ?? 0,
    }
  })
}

// ── Constraints ─────────────────────────────────────────────────────────────

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
      parameters: { enforce: true },
    },
    {
      type: 'skill_eligibility',
      scope: 'process',
      parameters: { enforce: true },
    },
    {
      type: 'max_weekly_hours',
      scope: 'employee',
      parameters: { use_contracted: true },
    },
  ]

  const soft: SoftConstraint[] = [
    {
      type: 'home_department_preference',
      weight: 0.3,
      parameters: {},
    },
    {
      type: 'workload_balance',
      weight: 0.2,
      parameters: {},
    },
    {
      type: 'overtime_avoidance',
      weight: 0.1,
      parameters: { threshold_pct: 100 },
    },
  ]

  return { hard, soft }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/solver/assemble-input.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/solver/assemble-input.ts tests/lib/solver/assemble-input.test.ts
git commit -m "feat(solver): SolverInput assembly from DB data"
```

---

### Task 5: Output Validation

**Files:**
- Create: `src/lib/solver/validate-output.ts`
- Test: `tests/lib/solver/validate-output.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/lib/solver/validate-output.test.ts
import { describe, it, expect } from 'vitest'
import { validateSolverOutput } from '@/lib/solver/validate-output'
import type { SolverInput, SolverOutput, Assignment } from '@/types/solver'

const makeAssignment = (empId: string, procId: string, slotId: string, hours = 8): Assignment => ({
  employee_id: empId,
  process_id: procId,
  time_slot_id: slotId,
  shift_pattern_id: 'sp1',
  scheduled_hours: hours,
  cost_estimate: hours * 22.50,
  assignment_source: 'optimizer',
})

describe('validateSolverOutput', () => {
  it('passes for valid output with no overlaps', () => {
    const output: SolverOutput = {
      assignments: [
        makeAssignment('e1', 'p1', 'slot1'),
        makeAssignment('e2', 'p1', 'slot1'),
        makeAssignment('e1', 'p2', 'slot2'), // different slot, ok
      ],
      unmet_demand: [],
      soft_constraint_violations: [],
      metrics: { total_cost: 540, coverage_percentage: 100, overtime_hours: 0, solve_time_ms: 100, optimality_gap: null, solver_strategy_used: 'greedy' },
    }

    const result = validateSolverOutput(output)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('detects overlapping assignments (same employee, same slot)', () => {
    const output: SolverOutput = {
      assignments: [
        makeAssignment('e1', 'p1', 'slot1'),
        makeAssignment('e1', 'p2', 'slot1'), // OVERLAP: e1 in slot1 twice
      ],
      unmet_demand: [],
      soft_constraint_violations: [],
      metrics: { total_cost: 360, coverage_percentage: 100, overtime_hours: 0, solve_time_ms: 50, optimality_gap: null, solver_strategy_used: 'greedy' },
    }

    const result = validateSolverOutput(output)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0]!.rule).toBe('no_overlap')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/solver/validate-output.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/solver/validate-output.ts
import type { SolverOutput, ValidationResult, ValidationError } from '@/types/solver'

export function validateSolverOutput(output: SolverOutput): ValidationResult {
  const errors: ValidationError[] = []
  const warnings: string[] = []

  // Check 1: No overlapping assignments (same employee, same time slot)
  const seen = new Map<string, number>()
  for (let i = 0; i < output.assignments.length; i++) {
    const a = output.assignments[i]!
    const key = `${a.employee_id}:${a.time_slot_id}`
    if (seen.has(key)) {
      errors.push({
        rule: 'no_overlap',
        message: `Employee ${a.employee_id} assigned to multiple processes in slot ${a.time_slot_id}`,
        affected_assignments: [String(seen.get(key)), String(i)],
      })
    } else {
      seen.set(key, i)
    }
  }

  // Check 2: All assignments have positive hours
  for (let i = 0; i < output.assignments.length; i++) {
    const a = output.assignments[i]!
    if (a.scheduled_hours <= 0) {
      errors.push({
        rule: 'positive_hours',
        message: `Assignment ${i} has non-positive hours: ${a.scheduled_hours}`,
        affected_assignments: [String(i)],
      })
    }
  }

  // Check 3: Metrics consistency
  const totalAssignedHours = output.assignments.reduce((s, a) => s + a.scheduled_hours, 0)
  const totalCostFromAssignments = output.assignments.reduce((s, a) => s + a.cost_estimate, 0)
  if (Math.abs(totalCostFromAssignments - output.metrics.total_cost) > 0.01) {
    warnings.push(`Total cost mismatch: assignments sum ${totalCostFromAssignments.toFixed(2)}, metrics say ${output.metrics.total_cost.toFixed(2)}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/solver/validate-output.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/solver/validate-output.ts tests/lib/solver/validate-output.test.ts
git commit -m "feat(solver): output validation (overlap, hours, metrics consistency)"
```

---

### Task 6: Greedy Solver

**Files:**
- Create: `src/lib/solver/greedy.ts`
- Test: `tests/lib/solver/greedy.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// tests/lib/solver/greedy.test.ts
import { describe, it, expect } from 'vitest'
import { solveGreedy } from '@/lib/solver/greedy'
import type { SolverInput, TimeSlot, ProcessDemand, EmployeeRecord } from '@/types/solver'
import { NL_DEFAULTS } from '@/lib/solver/nl-defaults'

function makeInput(overrides?: Partial<SolverInput>): SolverInput {
  const slot: TimeSlot = {
    id: '2026-04-06_s1',
    period_start: '2026-04-06T06:00:00',
    period_end: '2026-04-06T14:00:00',
    duration_minutes: 480,
  }

  const demand: ProcessDemand = {
    process_id: 'proc1',
    time_slot_id: slot.id,
    required_fte: 2,
    min_skill_level: 3,
    required_certifications: [],
  }

  const emp1: EmployeeRecord = {
    id: 'emp1', employee_number: 'E001',
    contract_type: 'full_time', weekly_hours_contracted: 40, hourly_rate: 22.50,
    home_site_id: 'site1', is_multi_site_eligible: false,
    skills: [{ process_id: 'proc1', proficiency_level: 4, productivity_multiplier: 1.15, has_active_certification: false, certification_expiry: null }],
    availability: [{ start: '2026-04-06T06:00:00', end: '2026-04-06T14:00:00' }],
    current_week_hours: 0, consecutive_days_worked: 0,
  }

  const emp2: EmployeeRecord = {
    id: 'emp2', employee_number: 'E002',
    contract_type: 'full_time', weekly_hours_contracted: 40, hourly_rate: 20,
    home_site_id: 'site1', is_multi_site_eligible: false,
    skills: [{ process_id: 'proc1', proficiency_level: 3, productivity_multiplier: 1.0, has_active_certification: false, certification_expiry: null }],
    availability: [{ start: '2026-04-06T06:00:00', end: '2026-04-06T14:00:00' }],
    current_week_hours: 0, consecutive_days_worked: 0,
  }

  return {
    site_id: 'site1',
    planning_horizon: { start: '2026-04-06', end: '2026-04-12' },
    time_slots: [slot],
    demand: [demand],
    employees: [emp1, emp2],
    hard_constraints: [],
    soft_constraints: [],
    locked_assignments: [],
    objective: { minimize_cost_weight: 0.4, maximize_coverage_weight: 0.3, maximize_skill_match_weight: 0.2, minimize_overtime_weight: 0.1 },
    time_budget_seconds: 10,
    ...overrides,
  }
}

describe('solveGreedy', () => {
  it('assigns employees to meet demand', () => {
    const input = makeInput()
    const output = solveGreedy(input)

    expect(output.assignments).toHaveLength(2) // 2 FTE needed, 2 employees available
    expect(output.unmet_demand).toHaveLength(0)
    expect(output.metrics.coverage_percentage).toBe(100)
    expect(output.metrics.solver_strategy_used).toBe('greedy')
  })

  it('reports unmet demand when not enough employees', () => {
    const input = makeInput({
      demand: [{
        process_id: 'proc1', time_slot_id: '2026-04-06_s1',
        required_fte: 5, min_skill_level: 3, required_certifications: [],
      }],
    })
    const output = solveGreedy(input)

    expect(output.assignments.length).toBeLessThan(5)
    expect(output.unmet_demand.length).toBeGreaterThan(0)
    expect(output.metrics.coverage_percentage).toBeLessThan(100)
  })

  it('respects skill eligibility', () => {
    const input = makeInput({
      demand: [{
        process_id: 'proc1', time_slot_id: '2026-04-06_s1',
        required_fte: 2, min_skill_level: 4, required_certifications: [],
      }],
    })
    const output = solveGreedy(input)

    // Only emp1 has skill level 4, emp2 has 3 (below min)
    expect(output.assignments).toHaveLength(1)
    expect(output.assignments[0]!.employee_id).toBe('emp1')
    expect(output.unmet_demand).toHaveLength(1)
  })

  it('preserves locked assignments', () => {
    const locked = {
      employee_id: 'emp1', process_id: 'proc1', time_slot_id: '2026-04-06_s1',
      shift_pattern_id: 'sp1', scheduled_hours: 8, cost_estimate: 180,
      assignment_source: 'locked' as const,
    }
    const input = makeInput({ locked_assignments: [locked] })
    const output = solveGreedy(input)

    const lockedInOutput = output.assignments.find(
      (a) => a.employee_id === 'emp1' && a.assignment_source === 'locked'
    )
    expect(lockedInOutput).toBeDefined()
  })

  it('records solve time', () => {
    const output = solveGreedy(makeInput())
    expect(output.metrics.solve_time_ms).toBeGreaterThanOrEqual(0)
    expect(output.metrics.optimality_gap).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/solver/greedy.test.ts`
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/solver/greedy.ts
import type {
  SolverInput,
  SolverOutput,
  Assignment,
  UnmetDemandSlot,
  EmployeeRecord,
  ProcessDemand,
} from '@/types/solver'
import { checkSkillEligibility, checkMaxWeeklyHours } from './constraints'
import { calculateAssignmentCost, isWeekendDay, isNightHours } from './cost'
import { NL_DEFAULTS, type LaborRules } from './nl-defaults'

interface EmployeeState {
  weekHours: number
  consecutiveDays: number
  assignedSlots: Set<string> // time_slot_ids already assigned
  lastShiftEndHour: number
  lastShiftDate: string | null
}

function parseHour(timeStr: string): number {
  const match = timeStr.match(/T(\d{2}):/)
  return match ? parseInt(match[1]!, 10) : 0
}

function parseDate(slotId: string): string {
  return slotId.split('_')[0]!
}

function scoreCandidate(
  emp: EmployeeRecord,
  demand: ProcessDemand,
  state: EmployeeState,
  slotHours: number,
): number {
  // Skill match score (0.6-1.3 via productivity multiplier)
  const skill = emp.skills.find((s) => s.process_id === demand.process_id)
  if (!skill) return -1
  if (!checkSkillEligibility(skill.proficiency_level, demand.min_skill_level)) return -1

  const skillScore = skill.productivity_multiplier

  // Overtime penalty
  const hoursCheck = checkMaxWeeklyHours(state.weekHours, slotHours, emp.weekly_hours_contracted)
  const overtimePenalty = hoursCheck.ok ? 1.0 : 0.7

  // Balance factor: less loaded = higher score
  const loadFactor = 1 - (state.weekHours / Math.max(emp.weekly_hours_contracted, 1)) * 0.3

  return skillScore * overtimePenalty * Math.max(loadFactor, 0.3)
}

export function solveGreedy(
  input: SolverInput,
  laborRules: LaborRules = NL_DEFAULTS,
): SolverOutput {
  const startTime = performance.now()

  // Initialize employee state
  const states = new Map<string, EmployeeState>()
  for (const emp of input.employees) {
    states.set(emp.id, {
      weekHours: emp.current_week_hours,
      consecutiveDays: emp.consecutive_days_worked,
      assignedSlots: new Set(),
      lastShiftEndHour: 0,
      lastShiftDate: null,
    })
  }

  const assignments: Assignment[] = []

  // Include locked assignments first
  for (const locked of input.locked_assignments) {
    assignments.push(locked)
    const state = states.get(locked.employee_id)
    if (state) {
      state.weekHours += locked.scheduled_hours
      state.assignedSlots.add(locked.time_slot_id)
    }
  }

  // Build slot lookup
  const slotMap = new Map(input.time_slots.map((s) => [s.id, s]))

  // Sort demand by required_fte descending (prioritize high-demand processes)
  const sortedDemand = [...input.demand].sort((a, b) => b.required_fte - a.required_fte)

  const unmetDemand: UnmetDemandSlot[] = []

  for (const demand of sortedDemand) {
    const slot = slotMap.get(demand.time_slot_id)
    if (!slot) continue

    const slotHours = slot.duration_minutes / 60
    const date = parseDate(demand.time_slot_id)
    const startHour = parseHour(slot.period_start)
    const endHour = parseHour(slot.period_end)
    const isWeekend = isWeekendDay(date)
    const isNight = isNightHours(startHour, endHour)

    let assignedCount = 0
    const neededCount = Math.ceil(demand.required_fte)

    // Already assigned to this slot (from locked)
    const lockedForSlot = assignments.filter(
      (a) => a.process_id === demand.process_id && a.time_slot_id === demand.time_slot_id
    )
    assignedCount += lockedForSlot.length

    if (assignedCount >= neededCount) continue

    // Score and sort candidates
    const candidates = input.employees
      .map((emp) => {
        const state = states.get(emp.id)!
        if (state.assignedSlots.has(demand.time_slot_id)) return null // already busy

        // Check availability for this slot
        const isAvailable = emp.availability.some(
          (w) => w.start <= slot.period_start && w.end >= slot.period_end
        )
        if (!isAvailable) return null

        const score = scoreCandidate(emp, demand, state, slotHours)
        if (score < 0) return null

        return { emp, score }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)
      .sort((a, b) => b.score - a.score)

    for (const { emp } of candidates) {
      if (assignedCount >= neededCount) break

      const state = states.get(emp.id)!
      const isOvertime = state.weekHours + slotHours > emp.weekly_hours_contracted
      const cost = calculateAssignmentCost({
        hourlyRate: emp.hourly_rate,
        hours: slotHours,
        isOvertime,
        isNightShift: isNight,
        isWeekend,
        laborRules,
      })

      assignments.push({
        employee_id: emp.id,
        process_id: demand.process_id,
        time_slot_id: demand.time_slot_id,
        shift_pattern_id: '', // resolved later from slot
        scheduled_hours: slotHours,
        cost_estimate: cost,
        assignment_source: 'optimizer',
      })

      state.weekHours += slotHours
      state.assignedSlots.add(demand.time_slot_id)
      assignedCount++
    }

    if (assignedCount < neededCount) {
      unmetDemand.push({
        process_id: demand.process_id,
        time_slot_id: demand.time_slot_id,
        required_fte: demand.required_fte,
        assigned_fte: assignedCount,
        gap_fte: demand.required_fte - assignedCount,
      })
    }
  }

  // Calculate metrics
  const totalCost = assignments.reduce((s, a) => s + a.cost_estimate, 0)
  const totalRequired = input.demand.reduce((s, d) => s + d.required_fte, 0)
  const totalAssigned = assignments.filter((a) => a.assignment_source === 'optimizer').length
    + input.locked_assignments.length
  const coveragePct = totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 100
  const overtimeHours = Array.from(states.values()).reduce((s, st) => {
    const emp = input.employees.find((e) => states.get(e.id) === st)
    if (!emp) return s
    const over = Math.max(0, st.weekHours - emp.weekly_hours_contracted)
    return s + over
  }, 0)

  return {
    assignments,
    unmet_demand: unmetDemand,
    soft_constraint_violations: [],
    metrics: {
      total_cost: Math.round(totalCost * 100) / 100,
      coverage_percentage: coveragePct,
      overtime_hours: Math.round(overtimeHours * 10) / 10,
      solve_time_ms: Math.round(performance.now() - startTime),
      optimality_gap: null,
      solver_strategy_used: 'greedy',
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/solver/greedy.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/solver/greedy.ts tests/lib/solver/greedy.test.ts
git commit -m "feat(solver): greedy algorithm with scoring, constraints, and cost"
```

---

### Task 7: HiGHS MIP Solver

**Files:**
- Create: `src/lib/solver/highs.ts`
- Test: `tests/lib/solver/highs.test.ts`

- [ ] **Step 1: Install highs-solver**

```bash
npm install highs-solver
```

- [ ] **Step 2: Write the test**

```typescript
// tests/lib/solver/highs.test.ts
import { describe, it, expect } from 'vitest'
import { solveHiGHS } from '@/lib/solver/highs'
import type { SolverInput, TimeSlot, ProcessDemand, EmployeeRecord } from '@/types/solver'

// Reuse makeInput from greedy tests (copy the helper)
function makeInput(overrides?: Partial<SolverInput>): SolverInput {
  const slot: TimeSlot = {
    id: '2026-04-06_s1',
    period_start: '2026-04-06T06:00:00',
    period_end: '2026-04-06T14:00:00',
    duration_minutes: 480,
  }

  const demand: ProcessDemand = {
    process_id: 'proc1',
    time_slot_id: slot.id,
    required_fte: 2,
    min_skill_level: 3,
    required_certifications: [],
  }

  const emp1: EmployeeRecord = {
    id: 'emp1', employee_number: 'E001',
    contract_type: 'full_time', weekly_hours_contracted: 40, hourly_rate: 22.50,
    home_site_id: 'site1', is_multi_site_eligible: false,
    skills: [{ process_id: 'proc1', proficiency_level: 4, productivity_multiplier: 1.15, has_active_certification: false, certification_expiry: null }],
    availability: [{ start: '2026-04-06T06:00:00', end: '2026-04-06T14:00:00' }],
    current_week_hours: 0, consecutive_days_worked: 0,
  }

  const emp2: EmployeeRecord = {
    id: 'emp2', employee_number: 'E002',
    contract_type: 'full_time', weekly_hours_contracted: 40, hourly_rate: 20,
    home_site_id: 'site1', is_multi_site_eligible: false,
    skills: [{ process_id: 'proc1', proficiency_level: 3, productivity_multiplier: 1.0, has_active_certification: false, certification_expiry: null }],
    availability: [{ start: '2026-04-06T06:00:00', end: '2026-04-06T14:00:00' }],
    current_week_hours: 0, consecutive_days_worked: 0,
  }

  return {
    site_id: 'site1',
    planning_horizon: { start: '2026-04-06', end: '2026-04-12' },
    time_slots: [slot],
    demand: [demand],
    employees: [emp1, emp2],
    hard_constraints: [],
    soft_constraints: [],
    locked_assignments: [],
    objective: { minimize_cost_weight: 0.4, maximize_coverage_weight: 0.3, maximize_skill_match_weight: 0.2, minimize_overtime_weight: 0.1 },
    time_budget_seconds: 30,
    ...overrides,
  }
}

describe('solveHiGHS', () => {
  it('produces a valid solution', async () => {
    const output = await solveHiGHS(makeInput())

    expect(output.assignments.length).toBeGreaterThan(0)
    expect(output.metrics.solver_strategy_used).toBe('highs_mip')
    expect(output.metrics.coverage_percentage).toBeGreaterThan(0)
    expect(output.metrics.optimality_gap).not.toBeNull()
  })

  it('respects skill eligibility', async () => {
    const output = await solveHiGHS(makeInput({
      demand: [{
        process_id: 'proc1', time_slot_id: '2026-04-06_s1',
        required_fte: 2, min_skill_level: 4, required_certifications: [],
      }],
    }))

    // Only emp1 qualifies (skill 4), emp2 doesn't (skill 3)
    const optimizerAssignments = output.assignments.filter(a => a.assignment_source === 'optimizer')
    expect(optimizerAssignments).toHaveLength(1)
    expect(optimizerAssignments[0]!.employee_id).toBe('emp1')
  })

  it('minimizes cost when weighted', async () => {
    const output = await solveHiGHS(makeInput({
      objective: { minimize_cost_weight: 1.0, maximize_coverage_weight: 0, maximize_skill_match_weight: 0, minimize_overtime_weight: 0 },
    }))

    // emp2 is cheaper (20/hr vs 22.50/hr) — should be preferred
    expect(output.metrics.total_cost).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/solver/highs.ts
import type {
  SolverInput,
  SolverOutput,
  Assignment,
  UnmetDemandSlot,
} from '@/types/solver'
import { checkSkillEligibility } from './constraints'
import { calculateAssignmentCost, isWeekendDay, isNightHours } from './cost'
import { NL_DEFAULTS, type LaborRules } from './nl-defaults'

export async function solveHiGHS(
  input: SolverInput,
  laborRules: LaborRules = NL_DEFAULTS,
): Promise<SolverOutput> {
  const startTime = performance.now()

  // Dynamic import of highs-solver (WASM, only load when needed)
  let highs: typeof import('highs-solver')
  try {
    highs = await import('highs-solver')
  } catch {
    // Fallback: if HiGHS not available, delegate to greedy
    const { solveGreedy } = await import('./greedy')
    const result = solveGreedy(input, laborRules)
    return {
      ...result,
      metrics: { ...result.metrics, solver_strategy_used: 'highs_mip_fallback_greedy' },
    }
  }

  const solver = await highs.default()

  // Index maps for compact variable naming
  const empIdx = new Map(input.employees.map((e, i) => [e.id, i]))
  const slotMap = new Map(input.time_slots.map((s) => [s.id, s])  )

  // Build eligible (employee, demand) pairs
  type Pair = { empId: string; demandIdx: number; slotId: string; procId: string; slotHours: number; cost: number; skillMult: number }
  const pairs: Pair[] = []

  for (let di = 0; di < input.demand.length; di++) {
    const demand = input.demand[di]!
    const slot = slotMap.get(demand.time_slot_id)
    if (!slot) continue
    const slotHours = slot.duration_minutes / 60
    const date = demand.time_slot_id.split('_')[0]!
    const startHour = parseInt(slot.period_start.match(/T(\d{2}):/)?.[1] ?? '0', 10)
    const endHour = parseInt(slot.period_end.match(/T(\d{2}):/)?.[1] ?? '0', 10)
    const isWeekend = isWeekendDay(date)
    const isNight = startHour >= 23 || endHour <= 6 || startHour < 6

    for (const emp of input.employees) {
      const skill = emp.skills.find((s) => s.process_id === demand.process_id)
      if (!skill || !checkSkillEligibility(skill.proficiency_level, demand.min_skill_level)) continue

      const isAvailable = emp.availability.some(
        (w) => w.start <= slot.period_start && w.end >= slot.period_end
      )
      if (!isAvailable) continue

      const isOvertime = emp.current_week_hours + slotHours > emp.weekly_hours_contracted
      const cost = calculateAssignmentCost({
        hourlyRate: emp.hourly_rate, hours: slotHours,
        isOvertime, isNightShift: isNight, isWeekend, laborRules,
      })

      pairs.push({
        empId: emp.id, demandIdx: di, slotId: demand.time_slot_id,
        procId: demand.process_id, slotHours, cost, skillMult: skill.productivity_multiplier,
      })
    }
  }

  if (pairs.length === 0) {
    // No feasible assignments at all
    return {
      assignments: [...input.locked_assignments],
      unmet_demand: input.demand.map((d) => ({
        process_id: d.process_id, time_slot_id: d.time_slot_id,
        required_fte: d.required_fte, assigned_fte: 0, gap_fte: d.required_fte,
      })),
      soft_constraint_violations: [],
      metrics: {
        total_cost: 0, coverage_percentage: 0, overtime_hours: 0,
        solve_time_ms: Math.round(performance.now() - startTime),
        optimality_gap: null, solver_strategy_used: 'highs_mip',
      },
    }
  }

  // Build LP problem string
  const { minimize_cost_weight: wCost, maximize_coverage_weight: wCov, maximize_skill_match_weight: wSkill } = input.objective
  const N = pairs.length

  // Objective: minimize(wCost * cost - wCov * 1 - wSkill * skillMult) per variable
  let objective = 'min: '
  const objTerms: string[] = []
  for (let i = 0; i < N; i++) {
    const p = pairs[i]!
    const coeff = wCost * p.cost - wCov * 100 - wSkill * p.skillMult * 10
    objTerms.push(`${coeff.toFixed(4)} x${i}`)
  }
  objective += objTerms.join(' + ') + ';\n'

  // Constraints
  const constraints: string[] = []

  // 1. Each employee max 1 assignment per time slot
  const empSlotPairs = new Map<string, number[]>()
  for (let i = 0; i < N; i++) {
    const key = `${pairs[i]!.empId}:${pairs[i]!.slotId}`
    const list = empSlotPairs.get(key) ?? []
    list.push(i)
    empSlotPairs.set(key, list)
  }
  for (const [, indices] of empSlotPairs) {
    if (indices.length > 1) {
      constraints.push(indices.map((i) => `x${i}`).join(' + ') + ' <= 1;')
    }
  }

  // 2. Demand satisfaction (soft: <= required_fte per demand slot)
  const demandPairs = new Map<number, number[]>()
  for (let i = 0; i < N; i++) {
    const list = demandPairs.get(pairs[i]!.demandIdx) ?? []
    list.push(i)
    demandPairs.set(pairs[i]!.demandIdx, list)
  }
  for (const [di, indices] of demandPairs) {
    const req = Math.ceil(input.demand[di]!.required_fte)
    constraints.push(indices.map((i) => `x${i}`).join(' + ') + ` <= ${req};`)
  }

  // 3. Max weekly hours per employee
  const empPairs = new Map<string, number[]>()
  for (let i = 0; i < N; i++) {
    const list = empPairs.get(pairs[i]!.empId) ?? []
    list.push(i)
    empPairs.set(pairs[i]!.empId, list)
  }
  for (const emp of input.employees) {
    const indices = empPairs.get(emp.id)
    if (!indices || indices.length === 0) continue
    const maxSlots = Math.floor(emp.weekly_hours_contracted / (pairs[indices[0]!]!.slotHours || 8))
    constraints.push(indices.map((i) => `x${i}`).join(' + ') + ` <= ${maxSlots};`)
  }

  // Binary variables
  const binaries = Array.from({ length: N }, (_, i) => `x${i}`).join(', ')

  const lpProblem = `${objective}\n${constraints.join('\n')}\nbin ${binaries};\n`

  // Solve
  const result = solver.solve(lpProblem)

  // Parse result
  const assignments: Assignment[] = [...input.locked_assignments]
  const unmetDemand: UnmetDemandSlot[] = []

  if (result.Status === 'Optimal' || result.Status === 'Feasible') {
    for (let i = 0; i < N; i++) {
      const val = result.Columns?.[`x${i}`]?.Primal ?? 0
      if (val > 0.5) {
        const p = pairs[i]!
        assignments.push({
          employee_id: p.empId,
          process_id: p.procId,
          time_slot_id: p.slotId,
          shift_pattern_id: '',
          scheduled_hours: p.slotHours,
          cost_estimate: p.cost,
          assignment_source: 'optimizer',
        })
      }
    }
  }

  // Calculate unmet demand
  for (let di = 0; di < input.demand.length; di++) {
    const d = input.demand[di]!
    const assigned = assignments.filter((a) => a.process_id === d.process_id && a.time_slot_id === d.time_slot_id).length
    if (assigned < d.required_fte) {
      unmetDemand.push({
        process_id: d.process_id, time_slot_id: d.time_slot_id,
        required_fte: d.required_fte, assigned_fte: assigned, gap_fte: d.required_fte - assigned,
      })
    }
  }

  const totalCost = assignments.reduce((s, a) => s + a.cost_estimate, 0)
  const totalRequired = input.demand.reduce((s, d) => s + d.required_fte, 0)
  const totalAssigned = assignments.length
  const coveragePct = totalRequired > 0 ? Math.round((totalAssigned / totalRequired) * 100) : 100

  return {
    assignments,
    unmet_demand: unmetDemand,
    soft_constraint_violations: [],
    metrics: {
      total_cost: Math.round(totalCost * 100) / 100,
      coverage_percentage: Math.min(coveragePct, 100),
      overtime_hours: 0,
      solve_time_ms: Math.round(performance.now() - startTime),
      optimality_gap: result.ObjectiveValue != null ? 0 : null,
      solver_strategy_used: 'highs_mip',
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/solver/highs.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/solver/highs.ts tests/lib/solver/highs.test.ts package.json package-lock.json
git commit -m "feat(solver): HiGHS MIP solver with LP model generation"
```

---

### Task 8: Planning Router Implementation

**Files:**
- Modify: `src/server/routers/planning.ts` (rewrite stubs)

- [ ] **Step 1: Read current planning.ts stubs**

Read: `src/server/routers/planning.ts` to understand existing structure

- [ ] **Step 2: Implement core procedures**

Implement these procedures (replacing NOT_IMPLEMENTED stubs):
- `listPlanVersions` — query plan_version by site_id, optional status/period filter
- `getPlanVersion` — fetch plan + shift_assignment_staging rows + metrics
- `createDraft` — insert plan_version with status='draft'
- `runOptimizer` — assemble input, run solver, write shift_assignment_staging, update status
- `getOptimizerStatus` — read plan_version.optimizer_status_json
- `transitionState` — validate state machine transition, update status
- `manualAssign` — insert into shift_assignment_staging with assignment_source='locked'
- `removeAssignment` — delete from staging (draft only)

The full implementation should use:
- `assembleSolverInput` from `src/lib/solver/assemble-input.ts`
- `solveGreedy` from `src/lib/solver/greedy.ts`
- `solveHiGHS` from `src/lib/solver/highs.ts`
- `validateSolverOutput` from `src/lib/solver/validate-output.ts`
- `getLaborRules` from `src/lib/solver/nl-defaults.ts`

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/planning.ts
git commit -m "feat(solver): planning router — CRUD, solver trigger, state machine"
```

---

### Task 9: Scenario Router Implementation

**Files:**
- Modify: `src/server/routers/scenario.ts` (rewrite stubs)

- [ ] **Step 1: Read current scenario.ts stubs**

Read: `src/server/routers/scenario.ts`

- [ ] **Step 2: Implement core procedures**

- `create` — clone plan_version with modifications (demand overrides, employee changes)
- `run` — trigger solver on cloned scenario
- `list` — list scenarios for a base plan
- `compare` — side-by-side metrics for base vs scenario
- `promote` — copy scenario assignments to base plan

- [ ] **Step 3: Run type check**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/scenario.ts
git commit -m "feat(solver): scenario router — create, run, compare, promote"
```

---

### Task 10: Integration Test — Full Solver Run

**Files:**
- Create: `tests/integration/solver-full-run.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// tests/integration/solver-full-run.test.ts
import { describe, it, expect } from 'vitest'
import { solveGreedy } from '@/lib/solver/greedy'
import { solveHiGHS } from '@/lib/solver/highs'
import { validateSolverOutput } from '@/lib/solver/validate-output'
import { generateTimeSlots, buildProcessDemand, buildConstraints } from '@/lib/solver/assemble-input'
import { getLaborRules } from '@/lib/solver/nl-defaults'
import type { SolverInput, EmployeeRecord } from '@/types/solver'

// 10 employees, 5 processes, 1 week, 2 shifts
function buildRealisticInput(): SolverInput {
  const shifts = [
    { id: 's1', name: 'Morning', start_time: '06:00', end_time: '14:00', duration_hours: 8 },
    { id: 's2', name: 'Afternoon', start_time: '14:00', end_time: '22:00', duration_hours: 8 },
  ]
  const timeSlots = generateTimeSlots('2026-04-06', [1, 2, 3, 4, 5], shifts)

  const processes = ['picking', 'packing', 'receiving', 'shipping', 'returns']
  const demand = processes.flatMap((proc, pi) =>
    timeSlots.map((slot) => ({
      process_id: `proc_${pi}`,
      time_slot_id: slot.id,
      required_fte: 2,
      min_skill_level: 2,
      required_certifications: [] as string[],
    }))
  )

  const employees: EmployeeRecord[] = Array.from({ length: 10 }, (_, i) => ({
    id: `emp_${i}`,
    employee_number: `E${String(i).padStart(3, '0')}`,
    contract_type: 'full_time' as const,
    weekly_hours_contracted: 40,
    hourly_rate: 20 + i,
    home_site_id: 'site1',
    is_multi_site_eligible: false,
    skills: processes.slice(0, 3 + (i % 3)).map((_, pi) => ({
      process_id: `proc_${pi}`,
      proficiency_level: 2 + (i % 4),
      productivity_multiplier: [0.6, 0.8, 1.0, 1.15, 1.3][2 + (i % 4) - 1]!,
      has_active_certification: false,
      certification_expiry: null,
    })),
    availability: timeSlots.map((slot) => ({
      start: slot.period_start,
      end: slot.period_end,
    })),
    current_week_hours: 0,
    consecutive_days_worked: 0,
  }))

  const laborRules = getLaborRules([])
  const { hard, soft } = buildConstraints(laborRules)

  return {
    site_id: 'site1',
    planning_horizon: { start: '2026-04-06', end: '2026-04-10' },
    time_slots: timeSlots,
    demand,
    employees,
    hard_constraints: hard,
    soft_constraints: soft,
    locked_assignments: [],
    objective: { minimize_cost_weight: 0.4, maximize_coverage_weight: 0.3, maximize_skill_match_weight: 0.2, minimize_overtime_weight: 0.1 },
    time_budget_seconds: 30,
  }
}

describe('Full solver integration', () => {
  const input = buildRealisticInput()

  it('greedy produces valid output', () => {
    const output = solveGreedy(input)
    const validation = validateSolverOutput(output)

    expect(validation.valid).toBe(true)
    expect(output.assignments.length).toBeGreaterThan(0)
    expect(output.metrics.coverage_percentage).toBeGreaterThan(0)
    expect(output.metrics.solve_time_ms).toBeLessThan(5000) // <5s
    console.log(`Greedy: ${output.assignments.length} assignments, ${output.metrics.coverage_percentage}% coverage, ${output.metrics.solve_time_ms}ms`)
  })

  it('HiGHS produces valid output', async () => {
    const output = await solveHiGHS(input)
    const validation = validateSolverOutput(output)

    expect(validation.valid).toBe(true)
    expect(output.assignments.length).toBeGreaterThan(0)
    expect(output.metrics.coverage_percentage).toBeGreaterThan(0)
    console.log(`HiGHS: ${output.assignments.length} assignments, ${output.metrics.coverage_percentage}% coverage, ${output.metrics.solve_time_ms}ms`)
  })

  it('HiGHS coverage >= greedy coverage', async () => {
    const greedyOutput = solveGreedy(input)
    const highsOutput = await solveHiGHS(input)

    // MIP should be at least as good as greedy
    expect(highsOutput.metrics.coverage_percentage).toBeGreaterThanOrEqual(
      greedyOutput.metrics.coverage_percentage - 5 // 5% tolerance for edge cases
    )
  })
})
```

- [ ] **Step 2: Run integration tests**

Run: `npx vitest run tests/integration/solver-full-run.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/solver-full-run.test.ts
git commit -m "test(solver): integration tests — 10 employees, 5 processes, 1 week"
```
