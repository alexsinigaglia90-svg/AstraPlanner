# Verzuim & Verlof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two separate absence management pages (verzuim + verlof) with wizard flows, impact alerts, AI-driven replacement suggestions, and solver integration.

**Architecture:** New `absence` tRPC router with role-filtered endpoints. Pure scoring functions for suggestions. Workload compute pipeline extended to subtract overrides. Two new pages under `/dashboard/` with shared components for cards, impact alerts, and suggestions.

**Tech Stack:** Next.js pages, tRPC router, Supabase `employee_availability_override` table, Framer Motion animations, Vitest for unit tests.

**Spec:** `docs/superpowers/specs/2026-03-28-absence-leave-design.md`

---

## File Structure

### New Files
```
src/server/routers/absence.ts          — tRPC router (CRUD + impact + suggestions)
src/lib/absence/scoring.ts             — Pure replacement scoring algorithm
src/lib/absence/impact.ts              — Pure impact calculation
src/lib/absence/types.ts               — Shared types
src/components/domain/absence-wizard.tsx — Ziekmelding wizard (3 steps)
src/components/domain/leave-wizard.tsx   — Verlof wizard (4 steps)
src/components/domain/absence-card.tsx   — Animated timeline card
src/components/domain/impact-alert.tsx   — Coverage impact preview
src/components/domain/replacement-suggestions.tsx — Scored candidate cards
src/components/domain/mini-calendar.tsx  — Compact month calendar
src/app/dashboard/verzuim/page.tsx       — Verzuim page
src/app/dashboard/verlof/page.tsx        — Verlof page
tests/lib/absence/scoring.test.ts        — Scoring algorithm tests
tests/lib/absence/impact.test.ts         — Impact calculation tests
```

### Modified Files
```
src/server/trpc.ts                      — Add supervisorProcedure
src/server/routers/_app.ts              — Register absence router
src/server/routers/workload.ts          — Add override subtraction in compute
src/components/layout/sidebar.tsx        — Add Verzuim + Verlof nav items
```

---

## Task 1: Add `supervisorProcedure` to tRPC

**Files:**
- Modify: `src/server/trpc.ts`

- [ ] **Step 1: Read current trpc.ts to understand procedure pattern**

Read `src/server/trpc.ts` and note the `plannerProcedure` definition pattern. Currently there is no supervisor-level procedure — the gap goes from `viewerProcedure` (viewer) to `plannerProcedure` (planner=50, above supervisor=40).

- [ ] **Step 2: Add supervisorProcedure**

In `src/server/trpc.ts`, after the `viewerProcedure` definition and before `plannerProcedure`, add:

```typescript
/** Require at least supervisor role (supervisor=40) */
export const supervisorProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!hasMinRole(ctx.role, 'supervisor')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Minimum role: supervisor' })
  }
  return next({ ctx })
})
```

Import `hasMinRole` from `./middleware/auth` if not already imported.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success, no type errors

- [ ] **Step 4: Commit**

```bash
git add src/server/trpc.ts
git commit -m "feat: add supervisorProcedure for absence management"
```

---

## Task 2: Types and Pure Scoring Algorithm

**Files:**
- Create: `src/lib/absence/types.ts`
- Create: `src/lib/absence/scoring.ts`
- Create: `tests/lib/absence/scoring.test.ts`

- [ ] **Step 1: Create types file**

Create `src/lib/absence/types.ts`:

```typescript
/** Override record from employee_availability_override table */
export interface AbsenceOverride {
  id: string
  employee_id: string
  start_date: string       // ISO date
  end_date: string         // ISO date
  start_time: string | null
  end_time: string | null
  override_type: 'leave' | 'absence' | 'training' | 'unavailable' | 'extra_availability'
  status: 'planned' | 'confirmed' | 'cancelled'
  reason: string | null
  created_by: string | null
  created_at: string
}

/** Employee with skills and availability for scoring */
export interface ScoringCandidate {
  employee_id: string
  employee_name: string
  crew_id: string | null
  department_id: string
  skills: Array<{
    process_id: string
    proficiency_level: number
  }>
  weekly_hours_contracted: number
  is_available: boolean          // no overlapping override in the period
  recent_process_ids: string[]   // processes worked in last 7 days
}

/** The absent employee's context */
export interface AbsenceContext {
  employee_id: string
  employee_name: string
  crew_id: string | null
  department_id: string
  affected_process_ids: string[]  // processes this employee has skills for
  period_start: string
  period_end: string
}

/** Scored replacement candidate */
export interface ScoredCandidate {
  employee_id: string
  employee_name: string
  score: number                 // 0-100
  confidence: 'high' | 'medium' | 'low'
  breakdown: {
    skill_score: number
    availability_score: number
    proximity_score: number
    recency_score: number
  }
  matching_processes: string[]   // process IDs this candidate can cover
}

/** Impact of an absence on workload */
export interface AbsenceImpact {
  affected_processes: Array<{
    process_id: string
    process_name: string
    coverage_before: number      // percentage
    coverage_after: number       // percentage
    fte_lost: number
  }>
  total_shifts_uncovered: number
  overall_coverage_drop: number  // percentage points
}
```

- [ ] **Step 2: Write scoring tests**

Create `tests/lib/absence/scoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scoreCandidate, rankCandidates } from '@/lib/absence/scoring'
import type { ScoringCandidate, AbsenceContext } from '@/lib/absence/types'

const baseContext: AbsenceContext = {
  employee_id: 'absent-1',
  employee_name: 'Jan',
  crew_id: 'crew-1',
  department_id: 'dept-1',
  affected_process_ids: ['proc-outbound'],
  period_start: '2026-04-01',
  period_end: '2026-04-05',
}

const makeCandidate = (overrides: Partial<ScoringCandidate> = {}): ScoringCandidate => ({
  employee_id: 'cand-1',
  employee_name: 'Pieter',
  crew_id: 'crew-1',
  department_id: 'dept-1',
  skills: [{ process_id: 'proc-outbound', proficiency_level: 4 }],
  weekly_hours_contracted: 40,
  is_available: true,
  recent_process_ids: [],
  ...overrides,
})

describe('scoreCandidate', () => {
  it('scores a perfect match highly (same crew, high skill, available, not recent)', () => {
    const result = scoreCandidate(makeCandidate(), baseContext)
    expect(result.score).toBeGreaterThan(80)
    expect(result.confidence).toBe('high')
  })

  it('scores 0 for unavailable candidate', () => {
    const result = scoreCandidate(makeCandidate({ is_available: false }), baseContext)
    expect(result.score).toBe(0)
  })

  it('scores lower for candidate without matching skill', () => {
    const result = scoreCandidate(
      makeCandidate({ skills: [{ process_id: 'proc-inbound', proficiency_level: 5 }] }),
      baseContext,
    )
    expect(result.score).toBe(0)
    expect(result.matching_processes).toEqual([])
  })

  it('scores lower for different department', () => {
    const sameDept = scoreCandidate(makeCandidate(), baseContext)
    const diffDept = scoreCandidate(
      makeCandidate({ department_id: 'dept-2', crew_id: 'crew-2' }),
      baseContext,
    )
    expect(sameDept.score).toBeGreaterThan(diffDept.score)
  })

  it('penalizes recently active on same process', () => {
    const fresh = scoreCandidate(makeCandidate(), baseContext)
    const recent = scoreCandidate(
      makeCandidate({ recent_process_ids: ['proc-outbound'] }),
      baseContext,
    )
    expect(fresh.score).toBeGreaterThan(recent.score)
  })
})

describe('rankCandidates', () => {
  it('returns sorted by score descending, max 5', () => {
    const candidates = Array.from({ length: 8 }, (_, i) =>
      makeCandidate({
        employee_id: `cand-${i}`,
        skills: [{ process_id: 'proc-outbound', proficiency_level: i % 5 + 1 }],
      }),
    )
    const ranked = rankCandidates(candidates, baseContext)
    expect(ranked.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score)
    }
  })

  it('filters out unavailable and zero-score candidates', () => {
    const candidates = [
      makeCandidate({ employee_id: 'good', is_available: true }),
      makeCandidate({ employee_id: 'unavail', is_available: false }),
      makeCandidate({ employee_id: 'no-skill', skills: [] }),
    ]
    const ranked = rankCandidates(candidates, baseContext)
    expect(ranked.every((c) => c.score > 0)).toBe(true)
    expect(ranked.find((c) => c.employee_id === 'unavail')).toBeUndefined()
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/lib/absence/scoring.test.ts`
Expected: FAIL — module not found

- [ ] **Step 4: Implement scoring algorithm**

Create `src/lib/absence/scoring.ts`:

```typescript
import type { ScoringCandidate, AbsenceContext, ScoredCandidate } from './types'

const WEIGHTS = {
  skill: 0.40,
  availability: 0.30,
  proximity: 0.15,
  recency: 0.15,
} as const

function confidenceFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export function scoreCandidate(
  candidate: ScoringCandidate,
  context: AbsenceContext,
): ScoredCandidate {
  // Unavailable = instant 0
  if (!candidate.is_available) {
    return {
      employee_id: candidate.employee_id,
      employee_name: candidate.employee_name,
      score: 0,
      confidence: 'low',
      breakdown: { skill_score: 0, availability_score: 0, proximity_score: 0, recency_score: 0 },
      matching_processes: [],
    }
  }

  // Skill match: best proficiency across affected processes
  const matchingSkills = candidate.skills.filter((s) =>
    context.affected_process_ids.includes(s.process_id),
  )
  const matching_processes = matchingSkills.map((s) => s.process_id)

  if (matchingSkills.length === 0) {
    return {
      employee_id: candidate.employee_id,
      employee_name: candidate.employee_name,
      score: 0,
      confidence: 'low',
      breakdown: { skill_score: 0, availability_score: 100, proximity_score: 0, recency_score: 0 },
      matching_processes: [],
    }
  }

  const bestProficiency = Math.max(...matchingSkills.map((s) => s.proficiency_level))
  // Proficiency 1=20, 2=40, 3=60, 4=80, 5=100
  const skill_score = bestProficiency * 20

  // Availability: available = 100 (already filtered above)
  const availability_score = 100

  // Proximity: same crew > same dept > other dept
  let proximity_score = 20 // other department
  if (candidate.crew_id && candidate.crew_id === context.crew_id) {
    proximity_score = 100
  } else if (candidate.department_id === context.department_id) {
    proximity_score = 60
  }

  // Recency: not recently on this process = bonus
  const wasRecent = candidate.recent_process_ids.some((pid) =>
    context.affected_process_ids.includes(pid),
  )
  const recency_score = wasRecent ? 30 : 100

  const score = Math.round(
    skill_score * WEIGHTS.skill +
    availability_score * WEIGHTS.availability +
    proximity_score * WEIGHTS.proximity +
    recency_score * WEIGHTS.recency,
  )

  return {
    employee_id: candidate.employee_id,
    employee_name: candidate.employee_name,
    score,
    confidence: confidenceFromScore(score),
    breakdown: { skill_score, availability_score, proximity_score, recency_score },
    matching_processes,
  }
}

export function rankCandidates(
  candidates: ScoringCandidate[],
  context: AbsenceContext,
  maxResults = 5,
): ScoredCandidate[] {
  return candidates
    .map((c) => scoreCandidate(c, context))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/lib/absence/scoring.test.ts`
Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add src/lib/absence/types.ts src/lib/absence/scoring.ts tests/lib/absence/scoring.test.ts
git commit -m "feat: absence types + replacement scoring algorithm with tests"
```

---

## Task 3: Impact Calculation

**Files:**
- Create: `src/lib/absence/impact.ts`
- Create: `tests/lib/absence/impact.test.ts`

- [ ] **Step 1: Write impact calculation tests**

Create `tests/lib/absence/impact.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateImpact } from '@/lib/absence/impact'

describe('calculateImpact', () => {
  it('calculates coverage drop when employee is removed', () => {
    const result = calculateImpact({
      absentEmployeeId: 'emp-1',
      processes: [
        {
          process_id: 'proc-1',
          process_name: 'Outbound',
          fte_needed: 5,
          fte_available: 5,
          employee_fte_contribution: 1.0,
        },
      ],
    })
    expect(result.affected_processes).toHaveLength(1)
    expect(result.affected_processes[0]!.coverage_before).toBe(100)
    expect(result.affected_processes[0]!.coverage_after).toBe(80)
    expect(result.affected_processes[0]!.fte_lost).toBe(1.0)
    expect(result.overall_coverage_drop).toBe(20)
  })

  it('handles zero fte_needed gracefully', () => {
    const result = calculateImpact({
      absentEmployeeId: 'emp-1',
      processes: [
        {
          process_id: 'proc-1',
          process_name: 'Idle',
          fte_needed: 0,
          fte_available: 2,
          employee_fte_contribution: 1.0,
        },
      ],
    })
    expect(result.affected_processes[0]!.coverage_before).toBe(100)
    expect(result.affected_processes[0]!.coverage_after).toBe(100)
  })

  it('aggregates across multiple processes', () => {
    const result = calculateImpact({
      absentEmployeeId: 'emp-1',
      processes: [
        { process_id: 'p1', process_name: 'A', fte_needed: 4, fte_available: 4, employee_fte_contribution: 0.5 },
        { process_id: 'p2', process_name: 'B', fte_needed: 2, fte_available: 2, employee_fte_contribution: 0.5 },
      ],
    })
    expect(result.affected_processes).toHaveLength(2)
    expect(result.overall_coverage_drop).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/absence/impact.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement impact calculation**

Create `src/lib/absence/impact.ts`:

```typescript
import type { AbsenceImpact } from './types'

interface ProcessImpactInput {
  process_id: string
  process_name: string
  fte_needed: number
  fte_available: number
  employee_fte_contribution: number
}

interface ImpactInput {
  absentEmployeeId: string
  processes: ProcessImpactInput[]
}

export function calculateImpact(input: ImpactInput): AbsenceImpact {
  const affected_processes = input.processes.map((p) => {
    const coverageBefore =
      p.fte_needed > 0 ? Math.round((p.fte_available / p.fte_needed) * 100) : 100
    const newAvailable = Math.max(0, p.fte_available - p.employee_fte_contribution)
    const coverageAfter =
      p.fte_needed > 0 ? Math.round((newAvailable / p.fte_needed) * 100) : 100

    return {
      process_id: p.process_id,
      process_name: p.process_name,
      coverage_before: coverageBefore,
      coverage_after: coverageAfter,
      fte_lost: p.employee_fte_contribution,
    }
  })

  const totalFteNeeded = input.processes.reduce((s, p) => s + p.fte_needed, 0)
  const totalFteLost = input.processes.reduce((s, p) => s + p.employee_fte_contribution, 0)
  const overall_coverage_drop =
    totalFteNeeded > 0 ? Math.round((totalFteLost / totalFteNeeded) * 100) : 0

  const total_shifts_uncovered = affected_processes.filter(
    (p) => p.coverage_after < 100,
  ).length

  return { affected_processes, total_shifts_uncovered, overall_coverage_drop }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/absence/impact.test.ts`
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/absence/impact.ts tests/lib/absence/impact.test.ts
git commit -m "feat: absence impact calculation with tests"
```

---

## Task 4: Absence tRPC Router

**Files:**
- Create: `src/server/routers/absence.ts`
- Modify: `src/server/routers/_app.ts`

- [ ] **Step 1: Create the absence router**

Create `src/server/routers/absence.ts` with all endpoints from the spec. Key endpoints:

- `reportSick` — supervisorProcedure, validates `employee_id !== ctx.user.id`, inserts override with type `'absence'`, status `'confirmed'`
- `reportRecovered` — supervisorProcedure, updates existing absence record's `end_date` to today
- `requestLeave` — protectedProcedure (employee+), inserts override with type `'leave'`, status `'planned'`
- `requestLeaveFor` — supervisorProcedure, same but for another employee
- `approveLeave` — supervisorProcedure, updates status to `'confirmed'` or `'cancelled'`
- `listActive` — supervisorProcedure, returns active overrides filtered by role (supervisor sees own team via crew_id)
- `listHistory` — managerProcedure, returns past overrides (verzuim history is manager+ only)
- `getImpact` — supervisorProcedure, calls `calculateImpact` with workload data for the affected employee
- `getSuggestions` — supervisorProcedure, fetches candidates, calls `rankCandidates`

Each mutation that creates/updates an override also includes a self-meld blocker for sick/recovery: `if (input.employee_id === ctx.user.id) throw new TRPCError({ code: 'FORBIDDEN', message: 'Je kunt jezelf niet ziek- of betermelden' })`.

The router uses Zod for input validation and returns typed results.

- [ ] **Step 2: Register router in _app.ts**

In `src/server/routers/_app.ts`, add:

```typescript
import { absenceRouter } from './absence'
```

And add to the router object:

```typescript
absence: absenceRouter,
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/absence.ts src/server/routers/_app.ts
git commit -m "feat: absence tRPC router with CRUD, impact, and suggestions"
```

---

## Task 5: Workload Compute — Override Integration

**Files:**
- Modify: `src/server/routers/workload.ts`

- [ ] **Step 1: Add override query to compute mutation**

In the `compute` mutation, after fetching employee skills (step 5) and before building `employeeAvail`, add a query:

```typescript
// ── 5b. Fetch active absence/leave overrides for the period ────────
const { data: overrides } = await admin
  .from('employee_availability_override')
  .select('employee_id, start_date, end_date, override_type, status')
  .eq('organization_id', ctx.organizationId)
  .in('override_type', ['absence', 'leave'])
  .in('status', ['planned', 'confirmed'])
  .lte('start_date', input.period_end)
  .gte('end_date', input.period_start)

const absentEmployeeIds = new Set(
  (overrides ?? []).map((o) => o.employee_id),
)
```

- [ ] **Step 2: Filter absent employees from availability**

In the `employeeAvail` mapping, set `available_hours: 0` for absent employees:

```typescript
available_hours: absentEmployeeIds.has(es.employee_id)
  ? 0
  : (Number(emp?.weekly_hours_contracted) || DEFAULT_WEEKLY_HOURS),
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 4: Commit**

```bash
git add src/server/routers/workload.ts
git commit -m "feat: workload compute subtracts absence/leave overrides"
```

---

## Task 6: Sidebar Navigation

**Files:**
- Modify: `src/components/layout/sidebar.tsx`

- [ ] **Step 1: Add nav items**

In `sidebar.tsx`, add two items to the `navItems` array after "Employees":

```typescript
{ label: 'Verzuim', href: '/dashboard/verzuim', icon: HeartPulse },
{ label: 'Verlof', href: '/dashboard/verlof', icon: CalendarOff },
```

Import `HeartPulse, CalendarOff` from `lucide-react`.

- [ ] **Step 2: Add role-based visibility for Verzuim**

The Verzuim nav item should only show for supervisor+. Add a `minRole` field to `NavItem`:

```typescript
interface NavItem {
  label: string
  href: string
  icon: React.ElementType
  minRole?: AppRole
}
```

Filter `navItems` in the render using `hasMinRole` and the current user's role from context. Verzuim gets `minRole: 'supervisor'`.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/sidebar.tsx
git commit -m "feat: add Verzuim and Verlof to sidebar navigation"
```

---

## Task 7: Shared UI Components

**Files:**
- Create: `src/components/domain/absence-card.tsx`
- Create: `src/components/domain/impact-alert.tsx`
- Create: `src/components/domain/replacement-suggestions.tsx`
- Create: `src/components/domain/mini-calendar.tsx`

- [ ] **Step 1: Build AbsenceCard**

Animated timeline card showing: avatar (initials), name, department, duration badge, status indicator. Uses glassmorphism style consistent with KPI cards. Spring physics on entrance. Hold-to-action for recovery (on verzuim cards).

Props: `employee_name, department_name, start_date, end_date, status, override_type, onRecover?, onApprove?, onReject?`

- [ ] **Step 2: Build ImpactAlert**

Shows coverage impact bars per affected process. Bars animate from `coverage_before` to `coverage_after`. Red accent for drops >20%. Uses the `AbsenceImpact` type.

Props: `impact: AbsenceImpact, loading?: boolean`

- [ ] **Step 3: Build ReplacementSuggestions**

Stagger-animated cards for top candidates. Each card shows: avatar, name, confidence badge (radial mini-gauge), matching process badges, proximity indicator.

Props: `suggestions: ScoredCandidate[], loading?: boolean`

- [ ] **Step 4: Build MiniCalendar**

Compact month grid (Mo-Su). Highlighted days for existing absences/leaves. Color-coded: red=verzuim, indigo=verlof. Clicking a day opens details. Date-range selection mode for leave wizard.

Props: `month: Date, highlights?: Array<{ start: string, end: string, type: 'absence' | 'leave' }>, onDateClick?, onRangeSelect?`

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 6: Commit**

```bash
git add src/components/domain/absence-card.tsx src/components/domain/impact-alert.tsx src/components/domain/replacement-suggestions.tsx src/components/domain/mini-calendar.tsx
git commit -m "feat: shared UI components for absence management"
```

---

## Task 8: Absence Wizard (Ziekmelding)

**Files:**
- Create: `src/components/domain/absence-wizard.tsx`

- [ ] **Step 1: Build 3-step wizard**

Follow existing wizard pattern (see `demand-type-wizard.tsx`). Centered modal with backdrop blur.

**Step 1 — Zoek medewerker:** Live search input, filtered employee cards with avatar. For supervisors: filtered to own crew. Animated card selection.

**Step 2 — Datum:** Date picker for first sick day (default: today). Optional expected duration selector (1 day, few days, 1 week, unknown).

**Step 3 — Bevestiging:** Selected employee summary card. ImpactAlert component (calls `trpc.absence.getImpact`). ReplacementSuggestions component (calls `trpc.absence.getSuggestions`). Confirm button triggers `trpc.absence.reportSick`. Animated checkmark SVG on success.

- [ ] **Step 2: Wire up tRPC calls**

- `trpc.workforce.listEmployees` for employee search (filtered by crew for supervisor)
- `trpc.absence.getImpact` on entering step 3
- `trpc.absence.getSuggestions` on entering step 3
- `trpc.absence.reportSick` on confirm

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/absence-wizard.tsx
git commit -m "feat: ziekmelding wizard with impact alert and suggestions"
```

---

## Task 9: Leave Wizard (Verlof)

**Files:**
- Create: `src/components/domain/leave-wizard.tsx`

- [ ] **Step 1: Build 4-step wizard**

**Step 1 — Medewerker:** "Voor mezelf" toggle (default on for employees). If supervisor+: employee search for team. Animated toggle with spring physics.

**Step 2 — Datum range:** MiniCalendar in range-selection mode. Visual date range with gradient highlight. Shows total days count.

**Step 3 — Type + notitie:** Leave type selector (vakantie, bijzonder verlof, onbetaald verlof) as glass-style radio cards. Optional notes textarea.

**Step 4 — Review:** Summary card. ImpactAlert + ReplacementSuggestions (same as absence wizard). Submit button triggers `trpc.absence.requestLeave` or `trpc.absence.requestLeaveFor`. Animated success state.

- [ ] **Step 2: Wire up tRPC calls**

- `trpc.absence.getImpact` on entering step 4
- `trpc.absence.getSuggestions` on entering step 4
- `trpc.absence.requestLeave` / `requestLeaveFor` on submit

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/leave-wizard.tsx
git commit -m "feat: verlof wizard with calendar range picker and impact preview"
```

---

## Task 10: Verzuim Page

**Files:**
- Create: `src/app/dashboard/verzuim/page.tsx`

- [ ] **Step 1: Build page**

Layout: KPI strip (3 glassmorphism cards) + timeline section + history accordion.

**KPI cards:** "Ziek vandaag" (red), "Hersteld deze week" (green), "Gem. verzuimduur" (amber). Use KpiHeroCard pattern with sparklines.

**Timeline:** `trpc.absence.listActive` filtered to `override_type === 'absence'`. Render as AbsenceCard components with stagger entrance. FAB button bottom-right for "Nieuwe ziekmelding" → opens AbsenceWizard.

**History accordion:** Only visible for manager+ (check role). Toggle section with past absence records.

**Recovery flow:** Hold-to-action on an AbsenceCard triggers `trpc.absence.reportRecovered`. Card animates green → particle burst → fade out.

- [ ] **Step 2: Add role guard**

Page must redirect or show "geen toegang" for roles below supervisor. Check role from auth context.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/verzuim/page.tsx
git commit -m "feat: verzuim page with timeline cards and recovery flow"
```

---

## Task 11: Verlof Page

**Files:**
- Create: `src/app/dashboard/verlof/page.tsx`

- [ ] **Step 1: Build page**

Layout: KPI strip + timeline cards + mini calendar sidebar.

**KPI cards:** "Verlof komende week", "In behandeling" (pending count), "Goedgekeurd deze maand".

**Timeline:** `trpc.absence.listActive` filtered to `override_type === 'leave'`. AbsenceCard components with status badges (pending=amber, approved=green, rejected=red).

**Mini calendar sidebar:** MiniCalendar component showing current month with highlighted leave periods.

**FAB:** "Verlof aanvragen" → opens LeaveWizard.

**Approval flow (supervisor+):** AbsenceCards for pending requests show approve/reject buttons. Animated status morph on action.

**Employee view:** If role=employee, only show own leave requests + request button. No team overview.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/verlof/page.tsx
git commit -m "feat: verlof page with calendar sidebar and approval flow"
```

---

## Task 12: Final Build + Integration Verification

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: success, all pages compile

- [ ] **Step 2: Run unit tests**

Run: `npx vitest run`
Expected: all tests pass (scoring + impact)

- [ ] **Step 3: Verify navigation**

Start dev server, navigate to `/dashboard/verzuim` and `/dashboard/verlof`. Verify pages render, wizards open, KPI cards animate.

- [ ] **Step 4: Final commit (if any cleanup needed)**

```bash
git add -A
git commit -m "feat: verzuim & verlof — complete absence management system"
```
