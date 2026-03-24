# Phase 4 — Demand & Workload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build demand ingestion, workload computation engine, and FTE dashboard so planners can enter demand and see where they have staffing gaps.

**Architecture:** Three layers built sequentially. Layer 1 (demand grid + import) is a self-contained UI page. Layer 2 (workload engine) is pure backend computation writing to `workload_plan`. Layer 3 (FTE dashboard) reads computed workload and renders an AAA-grade heatmap + drilldown on the same demand page.

**Tech Stack:** Next.js 14 (App Router), tRPC, Supabase (Postgres), Framer Motion, SheetJS (xlsx), Zod, inline styles with CSS variables.

**Spec:** `docs/superpowers/specs/2026-03-24-phase4-demand-workload-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `supabase/migrations/00011_phase4_demand_workload.sql` | Migration: `demand_process_override` table + `process.support_method` + `process.support_config_json` |
| `src/lib/workload/compute.ts` | Workload computation engine — pure function, no DB calls |
| `src/lib/workload/availability.ts` | Employee availability resolver — crew→rotation→shift chain |
| `src/lib/workload/types.ts` | TypeScript interfaces for workload engine I/O |
| `src/lib/workload/constants.ts` | Proficiency multipliers, coverage thresholds |
| `src/lib/workload/support.ts` | Support process FTE calculation (3 methods) |
| `src/components/domain/demand-grid.tsx` | Enriched editable demand grid |
| `src/components/domain/demand-grid-cell.tsx` | Single editable cell with auto-save + debounce |
| `src/components/domain/cascade-preview.tsx` | Expandable process breakdown row with override |
| `src/components/domain/week-range-picker.tsx` | ISO week start/end picker |
| `src/components/domain/excel-drop-zone.tsx` | Drag & drop .xlsx parse + column mapping |
| `src/components/domain/paste-handler.tsx` | Clipboard TSV parse + preview overlay |
| `src/components/domain/fte-dashboard.tsx` | Dashboard container: KPI row + heatmap + drilldown |
| `src/components/domain/coverage-heatmap.tsx` | Process × week coverage grid |
| `src/components/domain/gap-drilldown.tsx` | FTE bars + detail cards + insight banner |
| `src/components/domain/kpi-hero-card.tsx` | Animated KPI card with gradient accent |
| `tests/lib/workload/compute.test.ts` | Unit tests for workload computation |
| `tests/lib/workload/availability.test.ts` | Unit tests for availability resolver |
| `tests/lib/workload/support.test.ts` | Unit tests for support process calculations |

### Modified Files

| File | Changes |
|------|---------|
| `src/server/routers/demand.ts` | Add `bulkUpsert()` + `upsertOverride()` endpoints |
| `src/server/routers/workload.ts` | Replace stubs with real `compute()` + `getForPlan()` |
| `src/app/dashboard/demand/page.tsx` | Replace stub with full demand page (grid + dashboard tabs) |
| `src/components/domain/process-wizard.tsx` | Add support configuration step for supportive processes |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00011_phase4_demand_workload.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Phase 4: Demand overrides + support process config

-- Per-process volume override (when planner overrides cascade calculation)
CREATE TABLE demand_process_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id),
  demand_forecast_id UUID NOT NULL REFERENCES demand_forecast(id) ON DELETE CASCADE,
  process_id UUID NOT NULL REFERENCES process(id),
  override_volume DECIMAL NOT NULL CHECK (override_volume >= 0 AND override_volume <= 999999),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (demand_forecast_id, process_id)
);

CREATE INDEX idx_dpo_forecast ON demand_process_override(demand_forecast_id);

-- Support process configuration
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_method TEXT
  CHECK (support_method IN ('fixed_headcount', 'linked_ratio', 'frequency_based'));
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_config_json JSONB DEFAULT '{}';

-- RLS policies (using admin client bypass pattern)
ALTER TABLE demand_process_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY "demand_process_override_org_isolation"
  ON demand_process_override FOR ALL
  USING (organization_id = current_setting('app.organization_id', true)::uuid);
```

- [ ] **Step 2: Apply migration locally**

Run: `npx supabase db push` or apply via Supabase dashboard.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00011_phase4_demand_workload.sql
git commit -m "feat(db): Phase 4 migration — demand overrides + support config"
```

---

## Task 2: Workload Engine — Types & Constants

**Files:**
- Create: `src/lib/workload/types.ts`
- Create: `src/lib/workload/constants.ts`

- [ ] **Step 1: Write types**

`src/lib/workload/types.ts`:
```typescript
export interface WorkloadInput {
  site_id: string
  period_start: string  // ISO week start (Monday)
  period_end: string    // ISO week end (Sunday)
}

export interface DemandRow {
  demand_forecast_id: string
  demand_type_id: string
  demand_type_name: string
  process_mappings: ProcessMapping[]
  volume: number
  period_start: string
  period_end: string
}

export interface ProcessMapping {
  process_id: string
  process_name: string
  conversion_ratio: number
}

export interface ProcessOverride {
  demand_forecast_id: string
  process_id: string
  override_volume: number
}

export interface EmployeeAvailability {
  employee_id: string
  process_id: string
  proficiency_level: number
  available_hours: number  // net hours after leave, breaks, etc.
  productive_pct: number   // from job_role
}

export interface ProcessProductivityStandard {
  process_id: string
  site_id: string
  skill_level: number
  units_per_hour: number
}

export interface SupportConfig {
  method: 'fixed_headcount' | 'linked_ratio' | 'frequency_based'
  fixed_count?: number
  linked_process_ids?: string[]
  ratio?: number
  duration_hours?: number
  frequency_per_week?: number
}

export interface WorkloadResult {
  process_id: string
  process_name: string
  period_start: string
  period_end: string
  demand_volume: number
  conversion_ratio: number
  process_volume: number
  weighted_uph: number | null  // null if no employees with skill
  hours_needed: number | null
  fte_needed: number | null
  hours_available: number
  fte_available: number
  coverage_pct: number  // 0-100+
  status: 'computed' | 'no_norm'
}
```

- [ ] **Step 2: Write constants**

`src/lib/workload/constants.ts`:
```typescript
/** Proficiency multipliers from src/types/solver.ts */
export const PROFICIENCY_MULTIPLIERS: Record<number, number> = {
  1: 0.6,   // Novice
  2: 0.8,   // Basic
  3: 1.0,   // Competent
  4: 1.15,  // Proficient
  5: 1.3,   // Expert
}

/** Coverage thresholds for heatmap colors */
export const COVERAGE_THRESHOLDS = {
  over: 110,    // blue: overstaffed
  met: 90,      // green: covered
  under: 70,    // amber: tight
  // below 70 = gap (red)
} as const

/** Default effective hours per FTE per week */
export const DEFAULT_WEEKLY_HOURS = 40
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/workload/types.ts src/lib/workload/constants.ts
git commit -m "feat(workload): types and constants for workload engine"
```

---

## Task 3: Workload Engine — Support Process Calculator

**Files:**
- Create: `src/lib/workload/support.ts`
- Create: `tests/lib/workload/support.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/lib/workload/support.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { computeSupportFTE } from '@/lib/workload/support'

describe('computeSupportFTE', () => {
  it('fixed_headcount returns fixed count regardless of input', () => {
    const result = computeSupportFTE(
      { method: 'fixed_headcount', fixed_count: 2 },
      40,   // effective_hours_per_week
      {}    // linked FTE map (unused)
    )
    expect(result.fte_needed).toBe(2)
    expect(result.hours_needed).toBe(80)
  })

  it('linked_ratio scales with productive FTE', () => {
    const result = computeSupportFTE(
      { method: 'linked_ratio', linked_process_ids: ['p1', 'p2'], ratio: 15 },
      40,
      { p1: 10, p2: 5 }  // 15 total productive FTE
    )
    expect(result.fte_needed).toBe(1)  // 15 / 15 = 1
    expect(result.hours_needed).toBe(40)
  })

  it('linked_ratio rounds up partial FTE', () => {
    const result = computeSupportFTE(
      { method: 'linked_ratio', linked_process_ids: ['p1'], ratio: 10 },
      40,
      { p1: 15 }
    )
    expect(result.fte_needed).toBeCloseTo(1.5)  // 15 / 10 = 1.5
  })

  it('frequency_based computes from duration × frequency', () => {
    const result = computeSupportFTE(
      { method: 'frequency_based', duration_hours: 3, frequency_per_week: 5 },
      40,
      {}
    )
    expect(result.hours_needed).toBe(15)  // 3h × 5 days
    expect(result.fte_needed).toBeCloseTo(0.375)  // 15 / 40
  })

  it('returns zero for missing linked process IDs', () => {
    const result = computeSupportFTE(
      { method: 'linked_ratio', linked_process_ids: ['missing'], ratio: 10 },
      40,
      { p1: 20 }
    )
    expect(result.fte_needed).toBe(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/workload/support.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

`src/lib/workload/support.ts`:
```typescript
import type { SupportConfig } from './types'

interface SupportResult {
  fte_needed: number
  hours_needed: number
}

export function computeSupportFTE(
  config: SupportConfig,
  effectiveHoursPerWeek: number,
  linkedFteMap: Record<string, number>,
): SupportResult {
  switch (config.method) {
    case 'fixed_headcount': {
      const fte = config.fixed_count ?? 0
      return { fte_needed: fte, hours_needed: fte * effectiveHoursPerWeek }
    }
    case 'linked_ratio': {
      const totalLinkedFte = (config.linked_process_ids ?? [])
        .reduce((sum, pid) => sum + (linkedFteMap[pid] ?? 0), 0)
      const ratio = config.ratio ?? 1
      const fte = totalLinkedFte / ratio
      return { fte_needed: fte, hours_needed: fte * effectiveHoursPerWeek }
    }
    case 'frequency_based': {
      const hours = (config.duration_hours ?? 0) * (config.frequency_per_week ?? 0)
      return { fte_needed: hours / effectiveHoursPerWeek, hours_needed: hours }
    }
    default:
      return { fte_needed: 0, hours_needed: 0 }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/workload/support.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/workload/support.ts tests/lib/workload/support.test.ts
git commit -m "feat(workload): support process FTE calculator with tests"
```

---

## Task 4: Workload Engine — Availability Resolver

**Files:**
- Create: `src/lib/workload/availability.ts`
- Create: `tests/lib/workload/availability.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/lib/workload/availability.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { resolveWeekFromRotation, computeEmployeeAvailability } from '@/lib/workload/availability'

describe('resolveWeekFromRotation', () => {
  it('resolves correct rotation week for 2-week cycle', () => {
    // rotation_start_date = 2026-03-02 (Monday), cycle_weeks = 2
    // Target: 2026-03-16 (Monday) = 2 weeks later → week 0 (mod 2)
    const week = resolveWeekFromRotation('2026-03-02', '2026-03-16', 2)
    expect(week).toBe(0)
  })

  it('resolves week 1 of 2-week cycle', () => {
    const week = resolveWeekFromRotation('2026-03-02', '2026-03-09', 2)
    expect(week).toBe(1)
  })

  it('handles 3-week cycle', () => {
    const week = resolveWeekFromRotation('2026-03-02', '2026-03-23', 3)
    expect(week).toBe(0)  // 3 weeks later mod 3 = 0
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
    expect(result.gross_hours).toBeCloseTo(37.5)  // (8 - 0.5) × 5
    expect(result.net_hours).toBeCloseTo(35.625)   // 37.5 × 0.95
  })

  it('subtracts full-day override', () => {
    const result = computeEmployeeAvailability({
      shift_duration_hours: 8,
      break_minutes: 30,
      days_in_week: 5,
      productive_pct: 1.0,
      override_hours_lost: 7.5,  // 1 full day
    })
    expect(result.gross_hours).toBeCloseTo(30)  // 37.5 - 7.5
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/workload/availability.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

`src/lib/workload/availability.ts`:
```typescript
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
 * gross_hours = (shift - breaks) × days - overrides
 * net_hours = gross_hours × productive_pct
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/workload/availability.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/workload/availability.ts tests/lib/workload/availability.test.ts
git commit -m "feat(workload): availability resolver — rotation week + hours computation"
```

---

## Task 5: Workload Engine — Core Computation

**Files:**
- Create: `src/lib/workload/compute.ts`
- Create: `tests/lib/workload/compute.test.ts`

- [ ] **Step 1: Write failing tests**

`tests/lib/workload/compute.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import { computeWorkload } from '@/lib/workload/compute'
import type { DemandRow, ProcessOverride, EmployeeAvailability, ProcessProductivityStandard } from '@/lib/workload/types'

describe('computeWorkload', () => {
  const baseDemand: DemandRow = {
    demand_forecast_id: 'df-1',
    demand_type_id: 'dt-1',
    demand_type_name: 'Outbound Orders',
    volume: 5000,
    period_start: '2026-04-06',
    period_end: '2026-04-12',
    process_mappings: [
      { process_id: 'p-pick', process_name: 'Picking', conversion_ratio: 1.0 },
      { process_id: 'p-pack', process_name: 'Packing', conversion_ratio: 0.95 },
    ],
  }

  const standards: ProcessProductivityStandard[] = [
    { process_id: 'p-pick', site_id: 's-1', skill_level: 3, units_per_hour: 10 },
    { process_id: 'p-pack', site_id: 's-1', skill_level: 3, units_per_hour: 15 },
  ]

  const employees: EmployeeAvailability[] = [
    { employee_id: 'e-1', process_id: 'p-pick', proficiency_level: 3, available_hours: 40, productive_pct: 0.95 },
    { employee_id: 'e-2', process_id: 'p-pick', proficiency_level: 4, available_hours: 40, productive_pct: 0.95 },
    { employee_id: 'e-3', process_id: 'p-pack', proficiency_level: 3, available_hours: 40, productive_pct: 0.95 },
  ]

  it('computes hours_needed from volume / weighted_uph', () => {
    const results = computeWorkload([baseDemand], [], standards, employees, 40)
    const picking = results.find(r => r.process_id === 'p-pick')!
    // weighted_uph for picking: e-1 = 10 × 1.0 = 10, e-2 = 10 × 1.15 = 11.5 → avg = 10.75
    expect(picking.weighted_uph).toBeCloseTo(10.75)
    // hours_needed = 5000 / 10.75 ≈ 465.12
    expect(picking.hours_needed).toBeCloseTo(465.12, 0)
    // fte_needed = 465.12 / 40 ≈ 11.63
    expect(picking.fte_needed).toBeCloseTo(11.63, 0)
  })

  it('applies conversion_ratio to process volume', () => {
    const results = computeWorkload([baseDemand], [], standards, employees, 40)
    const packing = results.find(r => r.process_id === 'p-pack')!
    expect(packing.process_volume).toBe(4750)  // 5000 × 0.95
  })

  it('uses override volume when present', () => {
    const overrides: ProcessOverride[] = [
      { demand_forecast_id: 'df-1', process_id: 'p-pick', override_volume: 6000 },
    ]
    const results = computeWorkload([baseDemand], overrides, standards, employees, 40)
    const picking = results.find(r => r.process_id === 'p-pick')!
    expect(picking.process_volume).toBe(6000)
  })

  it('returns null hours when no employees have skill', () => {
    const results = computeWorkload([baseDemand], [], standards, [], 40)
    const picking = results.find(r => r.process_id === 'p-pick')!
    expect(picking.weighted_uph).toBeNull()
    expect(picking.hours_needed).toBeNull()
    expect(picking.status).toBe('no_norm')
  })

  it('computes coverage_pct from available vs needed', () => {
    const results = computeWorkload([baseDemand], [], standards, employees, 40)
    const picking = results.find(r => r.process_id === 'p-pick')!
    // 2 employees × 40h = 80h available, 465h needed → ~17.2%
    expect(picking.coverage_pct).toBeGreaterThan(0)
    expect(picking.coverage_pct).toBeLessThan(100)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/workload/compute.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

`src/lib/workload/compute.ts`:
```typescript
import type {
  DemandRow,
  ProcessOverride,
  EmployeeAvailability,
  ProcessProductivityStandard,
  WorkloadResult,
} from './types'
import { PROFICIENCY_MULTIPLIERS } from './constants'

/**
 * Pure workload computation — no DB calls.
 * Takes demand, overrides, norms, and employee availability.
 * Returns WorkloadResult per process × period.
 */
export function computeWorkload(
  demands: DemandRow[],
  overrides: ProcessOverride[],
  standards: ProcessProductivityStandard[],
  employees: EmployeeAvailability[],
  effectiveHoursPerWeek: number,
): WorkloadResult[] {
  const results: WorkloadResult[] = []
  const overrideMap = new Map<string, number>()

  // Index overrides by "forecastId:processId"
  for (const o of overrides) {
    overrideMap.set(`${o.demand_forecast_id}:${o.process_id}`, o.override_volume)
  }

  // Index employees by process_id
  const employeesByProcess = new Map<string, EmployeeAvailability[]>()
  for (const emp of employees) {
    const list = employeesByProcess.get(emp.process_id) ?? []
    list.push(emp)
    employeesByProcess.set(emp.process_id, list)
  }

  // Index standards by process_id (use skill_level 3 as base)
  const standardMap = new Map<string, number>()
  for (const s of standards) {
    if (s.skill_level === 3) {
      standardMap.set(s.process_id, s.units_per_hour)
    }
  }

  for (const demand of demands) {
    for (const mapping of demand.process_mappings) {
      const overrideKey = `${demand.demand_forecast_id}:${mapping.process_id}`
      const hasOverride = overrideMap.has(overrideKey)
      const processVolume = hasOverride
        ? overrideMap.get(overrideKey)!
        : demand.volume * mapping.conversion_ratio

      const baseUph = standardMap.get(mapping.process_id)
      const processEmployees = employeesByProcess.get(mapping.process_id) ?? []

      let weightedUph: number | null = null
      let hoursNeeded: number | null = null
      let fteNeeded: number | null = null
      let status: 'computed' | 'no_norm' = 'computed'

      if (baseUph && processEmployees.length > 0) {
        // Compute weighted UPH from employee skill mix
        const totalUph = processEmployees.reduce((sum, emp) => {
          const multiplier = PROFICIENCY_MULTIPLIERS[emp.proficiency_level] ?? 1.0
          return sum + baseUph * multiplier
        }, 0)
        weightedUph = totalUph / processEmployees.length
        hoursNeeded = processVolume / weightedUph
        fteNeeded = hoursNeeded / effectiveHoursPerWeek
      } else {
        status = 'no_norm'
      }

      // Compute available hours for this process
      const hoursAvailable = processEmployees.reduce(
        (sum, emp) => sum + emp.available_hours * emp.productive_pct,
        0
      )
      const fteAvailable = hoursAvailable / effectiveHoursPerWeek

      // Coverage
      const coveragePct = hoursNeeded && hoursNeeded > 0
        ? Math.round((hoursAvailable / hoursNeeded) * 100)
        : (processEmployees.length > 0 ? 100 : 0)

      results.push({
        process_id: mapping.process_id,
        process_name: mapping.process_name,
        period_start: demand.period_start,
        period_end: demand.period_end,
        demand_volume: demand.volume,
        conversion_ratio: mapping.conversion_ratio,
        process_volume: processVolume,
        weighted_uph: weightedUph,
        hours_needed: hoursNeeded,
        fte_needed: fteNeeded,
        hours_available: hoursAvailable,
        fte_available: fteAvailable,
        coverage_pct: coveragePct,
        status,
      })
    }
  }

  return results
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/workload/compute.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/workload/compute.ts tests/lib/workload/compute.test.ts
git commit -m "feat(workload): core computation engine with tests"
```

---

## Task 6: tRPC — Demand Bulk Upsert + Override Endpoints

**Files:**
- Modify: `src/server/routers/demand.ts`

- [ ] **Step 1: Add `bulkUpsert` endpoint**

First, update the sourceEnum at the top of demand.ts to include `oms_import`:

```typescript
const sourceEnum = z.enum(['wms_import', 'oms_import', 'csv_upload', 'manual_entry', 'ai_forecast'])
```

Then add after the existing `upsertForecast` endpoint:

```typescript
bulkUpsert: plannerProcedure
  .input(
    z.object({
      forecasts: z.array(
        z.object({
          id: z.string().uuid().optional(),
          site_id: z.string().uuid(),
          demand_type_id: z.string().uuid(),
          period_start: z.string(),
          period_end: z.string(),
          volume: z.number().min(0).max(999999),
          source: sourceEnum,
        })
      ).min(1).max(500),
    })
  )
  .mutation(async ({ ctx, input }) => {
    const { data, error } = await ctx.supabase
      .from('demand_forecast')
      .upsert(
        input.forecasts.map((f) => ({
          ...(f.id ? { id: f.id } : {}),
          site_id: f.site_id,
          demand_type_id: f.demand_type_id,
          period_start: f.period_start,
          period_end: f.period_end,
          volume: f.volume,
          source: f.source,
          organization_id: ctx.organizationId,
        })),
        { onConflict: 'organization_id,site_id,demand_type_id,period_start,period_end,plan_version_id' }
      )
      .select('id, demand_type_id, period_start, volume')

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }

    return { upserted: data?.length ?? 0 }
  }),
```

- [ ] **Step 2: Add `upsertOverride` endpoint**

```typescript
upsertOverride: plannerProcedure
  .input(
    z.object({
      demand_forecast_id: z.string().uuid(),
      process_id: z.string().uuid(),
      override_volume: z.number().min(0).max(999999).nullable(),
    })
  )
  .mutation(async ({ ctx, input }) => {
    // null = delete override (revert to cascade)
    if (input.override_volume === null) {
      const { error } = await ctx.supabase
        .from('demand_process_override')
        .delete()
        .eq('demand_forecast_id', input.demand_forecast_id)
        .eq('process_id', input.process_id)

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return { deleted: true }
    }

    const { data, error } = await ctx.supabase
      .from('demand_process_override')
      .upsert({
        demand_forecast_id: input.demand_forecast_id,
        process_id: input.process_id,
        override_volume: input.override_volume,
        organization_id: ctx.organizationId,
      }, { onConflict: 'demand_forecast_id,process_id' })
      .select('id')
      .single()

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return data
  }),
```

- [ ] **Step 3: Commit**

```bash
git add src/server/routers/demand.ts
git commit -m "feat(api): demand bulkUpsert + override endpoints"
```

---

## Task 7: tRPC — Workload Compute & Query Endpoints

**Files:**
- Modify: `src/server/routers/workload.ts`

- [ ] **Step 1: Replace stubs with real implementation**

Replace entire `src/server/routers/workload.ts`:

```typescript
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, plannerProcedure, viewerProcedure } from '../trpc'
import { computeWorkload } from '@/lib/workload/compute'
import { computeSupportFTE } from '@/lib/workload/support'
import { resolveWeekFromRotation, computeEmployeeAvailability } from '@/lib/workload/availability'
import { DEFAULT_WEEKLY_HOURS } from '@/lib/workload/constants'
import type { DemandRow, ProcessOverride, EmployeeAvailability, ProcessProductivityStandard, SupportConfig } from '@/lib/workload/types'

export const workloadRouter = router({
  compute: plannerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        plan_version_id: z.string().uuid().nullable().default(null), // null = "draft"
        period_start: z.string(),
        period_end: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Fetch demand forecasts for period
      const { data: forecasts, error: fErr } = await ctx.supabase
        .from('demand_forecast')
        .select(`
          id, demand_type_id, volume, period_start, period_end,
          demand_type:demand_type_id(
            name,
            process_mappings:demand_type_process_mapping(process_id, conversion_ratio, process:process_id(name))
          )
        `)
        .eq('site_id', input.site_id)
        .gte('period_start', input.period_start)
        .lte('period_end', input.period_end)

      if (fErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fErr.message })

      // 2. Fetch overrides
      const forecastIds = (forecasts ?? []).map(f => f.id)
      const { data: overridesRaw } = forecastIds.length > 0
        ? await ctx.supabase
            .from('demand_process_override')
            .select('demand_forecast_id, process_id, override_volume')
            .in('demand_forecast_id', forecastIds)
        : { data: [] }

      // 3. Fetch productivity standards for site
      const { data: standards } = await ctx.supabase
        .from('process_productivity_standard')
        .select('process_id, site_id, skill_level, units_per_hour')
        .eq('site_id', input.site_id)

      // 4. Fetch employee skills + availability
      const { data: empSkills } = await ctx.supabase
        .from('employee_skill')
        .select(`
          employee_id, process_id, proficiency_level,
          employee:employee_id(
            id, crew_id, weekly_hours_contracted,
            job_role:job_role_id(productive_pct)
          )
        `)
        .eq('status', 'active')

      // 5. Build typed inputs and call pure compute function
      const demands: DemandRow[] = (forecasts ?? []).map(f => {
        const dt = f.demand_type as unknown as { name: string; process_mappings: unknown[] }
        return {
          demand_forecast_id: f.id,
          demand_type_id: f.demand_type_id,
          demand_type_name: dt?.name ?? '',
          volume: f.volume,
          period_start: f.period_start,
          period_end: f.period_end,
          process_mappings: ((dt?.process_mappings ?? []) as unknown[]).map((pm: unknown) => {
            const m = pm as { process_id: string; conversion_ratio: number; process: { name: string } | null }
            return {
              process_id: m.process_id,
              process_name: m.process?.name ?? '',
              conversion_ratio: m.conversion_ratio,
            }
          }),
        }
      })

      const overrides: ProcessOverride[] = (overridesRaw ?? []).map(o => ({
        demand_forecast_id: o.demand_forecast_id,
        process_id: o.process_id,
        override_volume: Number(o.override_volume),
      }))

      const employeeAvail: EmployeeAvailability[] = (empSkills ?? []).map(es => {
        const emp = es.employee as unknown as { id: string; weekly_hours_contracted: number; job_role: { productive_pct: number } | null }
        return {
          employee_id: es.employee_id,
          process_id: es.process_id,
          proficiency_level: es.proficiency_level,
          available_hours: emp?.weekly_hours_contracted ?? DEFAULT_WEEKLY_HOURS,
          productive_pct: emp?.job_role?.productive_pct ?? 0.95,
        }
      })

      const pps: ProcessProductivityStandard[] = (standards ?? []).map(s => ({
        process_id: s.process_id,
        site_id: s.site_id,
        skill_level: s.skill_level,
        units_per_hour: s.units_per_hour,
      }))

      const results = computeWorkload(demands, overrides, pps, employeeAvail, DEFAULT_WEEKLY_HOURS)

      // 6. Upsert results into workload_plan
      if (results.length > 0) {
        const rows = results
          .filter(r => r.hours_needed !== null)
          .map(r => ({
            organization_id: ctx.organizationId,
            site_id: input.site_id,
            process_id: r.process_id,
            period_start: r.period_start,
            period_end: r.period_end,
            demand_volume: r.demand_volume,
            conversion_ratio: r.conversion_ratio,
            process_volume: r.process_volume,
            weighted_uph: r.weighted_uph,
            hours_needed: r.hours_needed,
            fte_needed: r.fte_needed,
            hours_assigned: 0,
            fte_assigned: 0,
            coverage_pct: r.coverage_pct,
            plan_version_id: input.plan_version_id,
            status: 'computed',
            computed_at: new Date().toISOString(),
          }))

        if (rows.length > 0) {
          const { error: upsertErr } = await ctx.supabase
            .from('workload_plan')
            .upsert(rows, { onConflict: 'organization_id,site_id,process_id,period_start,period_end,plan_version_id' })

          if (upsertErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: upsertErr.message })
        }
      }

      return results
    }),

  getForPlan: viewerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        period_start: z.string(),
        period_end: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('workload_plan')
        .select(`
          id, process_id, period_start, period_end,
          demand_volume, conversion_ratio, process_volume,
          weighted_uph, hours_needed, fte_needed,
          hours_assigned, fte_assigned, coverage_pct, status,
          process:process_id(name, category, type)
        `)
        .eq('site_id', input.site_id)
        .gte('period_start', input.period_start)
        .lte('period_end', input.period_end)
        .order('process_id')
        .order('period_start')

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),
})
```

- [ ] **Step 2: Commit**

```bash
git add src/server/routers/workload.ts
git commit -m "feat(api): workload compute + getForPlan endpoints — replaces stubs"
```

---

## Task 8: Demand Page — Week Range Picker + KPI Hero Card

**Files:**
- Create: `src/components/domain/week-range-picker.tsx`
- Create: `src/components/domain/kpi-hero-card.tsx`

- [ ] **Step 1: Build WeekRangePicker**

See spec Section 3.1 for behavior. ISO week based, defaults to current week + 6 weeks.
Component accepts `value: { start: string; end: string }` and `onChange` callback.
Style: glass UI pattern (GlassSelect-inspired dropdown for week selection).

- [ ] **Step 2: Build KpiHeroCard**

See spec Section 5.2 and the AAA mockup. Reuse `AnimatedCounter` for value.
Props: `label`, `value`, `detail`, `icon`, `gradientColors`, `delay` (for stagger).
Style: card background, gradient top border (3px), bounce-hover (translateY -4px + elevation-2 shadow).

- [ ] **Step 3: Commit**

```bash
git add src/components/domain/week-range-picker.tsx src/components/domain/kpi-hero-card.tsx
git commit -m "feat(ui): WeekRangePicker + KpiHeroCard components"
```

---

## Task 9: Demand Page — Grid Cell + Paste Handler

**Files:**
- Create: `src/components/domain/demand-grid-cell.tsx`
- Create: `src/components/domain/paste-handler.tsx`

- [ ] **Step 1: Build DemandGridCell**

Editable number input with:
- JetBrains Mono font, tabular-nums, right-aligned
- 500ms debounce auto-save via `demand.upsertForecast`
- Below value: muted computed hours text
- Empty state: orange dashed border, "—" placeholder
- Focus: indigo ring (var(--ring))

- [ ] **Step 2: Build PasteHandler**

Clipboard TSV parser:
- Listens for `paste` event on grid container
- Parses clipboard text as tab-separated values
- Matches rows to demand_types by fuzzy name match
- Shows preview overlay: green cells (new), orange cells (changed)
- Confirm button → calls `demand.bulkUpsert`
- Cancel → dismiss overlay

- [ ] **Step 3: Commit**

```bash
git add src/components/domain/demand-grid-cell.tsx src/components/domain/paste-handler.tsx
git commit -m "feat(ui): DemandGridCell with auto-save + PasteHandler for Excel copy-paste"
```

---

## Task 10: Demand Page — Cascade Preview + Excel Drop Zone

**Files:**
- Create: `src/components/domain/cascade-preview.tsx`
- Create: `src/components/domain/excel-drop-zone.tsx`

- [ ] **Step 1: Build CascadePreview**

Expandable row below demand_type row:
- Shows all processes from `demand_type_process_mapping`
- Each chip: `volume × ratio = result` (JetBrains Mono)
- Click chip → inline number edit for override
- Override chips get orange border
- Spring-animated height expansion (bouncy)
- Calls `demand.upsertOverride` on change

- [ ] **Step 2: Build ExcelDropZone**

Drag & drop .xlsx handler:
- Drop zone overlay (indigo dashed border, "Sleep je Excel bestand hier")
- Parse with SheetJS (`xlsx` package)
- Column mapping wizard in SlideOver (reuse pattern from csv-import-wizard)
- Auto-detect week columns (Week 14, Wk14, 2026-W14)
- Fuzzy match rows to demand_types
- Preview grid → Confirm → `demand.bulkUpsert`

- [ ] **Step 3: Commit**

```bash
git add src/components/domain/cascade-preview.tsx src/components/domain/excel-drop-zone.tsx
git commit -m "feat(ui): CascadePreview with override + ExcelDropZone for drag-and-drop import"
```

---

## Task 11: Demand Page — Main Grid Component

**Files:**
- Create: `src/components/domain/demand-grid.tsx`

- [ ] **Step 1: Build DemandGrid**

Orchestrator component combining all grid parts:
- Fetches data: `demand.listDemandTypes()` + `demand.listForecasts()`
- Renders enriched grid: rows = demand_types, columns = weeks
- Each row: SmartIcon + name + subtitle (linked processes) + sparkline + cells
- Sparkline: inline SVG from last 4-6 weeks of data (if available)
- Integrates PasteHandler (wraps grid in paste listener)
- Integrates ExcelDropZone (overlay on drag enter)
- Toolbar: SiteSelector + WeekRangePicker + save indicator
- Staggered entrance animation (containerStagger + fadeInUp per row)

- [ ] **Step 2: Commit**

```bash
git add src/components/domain/demand-grid.tsx
git commit -m "feat(ui): DemandGrid — enriched editable grid with sparklines and cascade"
```

---

## Task 12: FTE Dashboard — Coverage Heatmap

**Files:**
- Create: `src/components/domain/coverage-heatmap.tsx`

- [ ] **Step 1: Build CoverageHeatmap**

Grid component (CSS Grid):
- Rows: processes, Columns: weeks
- Each cell: coverage % with semantic color from COVERAGE_THRESHOLDS
- Subtext: `available / needed` FTE
- Hover: scale 1.08 + indigo shadow + tooltip
- Click: emits `onCellClick(processId, weekStart)`
- Red cells (<70%): subtle pulse animation
- Staggered pop-in (30ms per cell, cascade by row)
- Row labels: SmartIcon + process name, fadeInUp

- [ ] **Step 2: Commit**

```bash
git add src/components/domain/coverage-heatmap.tsx
git commit -m "feat(ui): CoverageHeatmap — process × week grid with semantic colors"
```

---

## Task 13: FTE Dashboard — Gap Drilldown

**Files:**
- Create: `src/components/domain/gap-drilldown.tsx`

- [ ] **Step 1: Build GapDrilldown**

Panel that opens below heatmap on cell click:
- Header: process icon + name + week + shortage badge
- FTE bars: "Nodig" (indigo gradient) vs "Beschikbaar" (green) with animated fill
- Gap zone: diagonal stripes, dashed border
- Detail cards (3x grid): Demand Volume, Uren Nodig, Tekort
- Insight banner: employee count with skill available elsewhere
- Spring-animated height + fade on open/close
- Detail cards stagger in (100ms delay)

- [ ] **Step 2: Commit**

```bash
git add src/components/domain/gap-drilldown.tsx
git commit -m "feat(ui): GapDrilldown — FTE bars + detail cards + insight banner"
```

---

## Task 14: FTE Dashboard — Container

**Files:**
- Create: `src/components/domain/fte-dashboard.tsx`

- [ ] **Step 1: Build FteDashboard**

Container component:
- KPI Hero Row (4x KpiHeroCard with staggered entrance)
- CoverageHeatmap with legend
- GapDrilldown (conditionally rendered on cell selection)
- Fetches data: `workload.getForPlan()` for computed workload
- Computes KPI values from workload data
- Auto-recompute via `workload.compute()` on demand changes (1s global debounce)
- Toast: "Herberekenen..." during computation

- [ ] **Step 2: Commit**

```bash
git add src/components/domain/fte-dashboard.tsx
git commit -m "feat(ui): FteDashboard container — KPI row + heatmap + drilldown"
```

---

## Task 15: Demand Page — Assemble Full Page

**Files:**
- Modify: `src/app/dashboard/demand/page.tsx`

- [ ] **Step 1: Replace stub with full page**

Replace the entire stub content with:
- Tab toggle: 📝 Invoer | 📊 Dashboard (animated tab indicator, bouncy spring)
- Invoer tab: renders `<DemandGrid />`
- Dashboard tab: renders `<FteDashboard />`
- Shared state: site_id + week range (lifted to page level)
- Page entrance: staggered fadeInUp per section

- [ ] **Step 2: Verify page loads without errors**

Run: `npm run dev` and navigate to `/dashboard/demand`
Expected: Grid renders with demand types, cells editable, tab switch works.

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/demand/page.tsx
git commit -m "feat(page): demand page — grid + dashboard tabs, replaces stub"
```

---

## Task 16: Process Wizard — Support Configuration Step

**Files:**
- Modify: `src/components/domain/process-wizard.tsx`

- [ ] **Step 1: Add support config step**

Add a new step (shown only when process type = "supportive"):
- Radio group: Fixed Headcount | Linked Ratio | Frequency-Based
- Conditional inputs per method:
  - Fixed: number input for count
  - Linked: GlassSelect (multi) for processes + number input for ratio
  - Frequency: number inputs for duration + frequency
- Writes to `support_method` + `support_config_json` via existing `org.upsertProcess`

- [ ] **Step 2: Verify wizard flow**

Run: `npm run dev`, navigate to Processes, create a supportive process.
Expected: Support config step appears, saves correctly.

- [ ] **Step 3: Commit**

```bash
git add src/components/domain/process-wizard.tsx
git commit -m "feat(ui): support process config step in Process Wizard"
```

---

## Task 17: Integration Test — End-to-End Flow

- [ ] **Step 1: Manual E2E test**

1. Navigate to `/dashboard/demand`
2. Select a site with demand_types configured
3. Enter demand volumes for 2-3 weeks
4. Verify cascade preview shows process breakdown
5. Switch to Dashboard tab
6. Verify workload computes and heatmap renders
7. Click a cell → verify drilldown opens with correct data
8. Go back to Invoer, change a volume → switch to Dashboard
9. Verify KPI cards update, heatmap cell changes color

- [ ] **Step 2: Run full test suite**

Run: `npm test`
Expected: All workload engine tests pass. No regressions.

- [ ] **Step 3: Run build**

Run: `npm run build`
Expected: Clean build, no type errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: Phase 4 complete — demand ingestion, workload engine, FTE dashboard"
```

---

## Summary

| Task | Layer | What | Est. |
|------|-------|------|------|
| 1 | DB | Migration: override table + support config | 5 min |
| 2 | Engine | Types + constants | 5 min |
| 3 | Engine | Support process calculator + tests | 10 min |
| 4 | Engine | Availability resolver + tests | 10 min |
| 5 | Engine | Core workload computation + tests | 15 min |
| 6 | API | Demand bulk upsert + override endpoints | 10 min |
| 7 | API | Workload compute + query endpoints | 15 min |
| 8 | UI | WeekRangePicker + KpiHeroCard | 15 min |
| 9 | UI | DemandGridCell + PasteHandler | 20 min |
| 10 | UI | CascadePreview + ExcelDropZone | 25 min |
| 11 | UI | DemandGrid (orchestrator) | 20 min |
| 12 | UI | CoverageHeatmap | 20 min |
| 13 | UI | GapDrilldown | 20 min |
| 14 | UI | FteDashboard (container) | 15 min |
| 15 | Page | Assemble demand page | 15 min |
| 16 | UI | Process Wizard support step | 15 min |
| 17 | Test | E2E integration test + build | 10 min |
