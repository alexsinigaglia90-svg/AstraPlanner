# Plan Grid Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the plan grid to show department grouping, day-columns with process + skill badge + shift + times per cell, subtotal rows per department/process, and a detail popover on click.

**Architecture:** Replace the current shift-sub-column grid with a day-column layout. Add `proficiency_level` to the solver Assignment type so cells can show skill badges. Create a new popover component for cell details. Wire demand data to coverage bar and subtotal rows.

**Tech Stack:** React, TypeScript, Framer Motion, tRPC, Supabase

**Spec:** `docs/superpowers/specs/2026-04-04-plan-grid-redesign.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `src/types/solver.ts` | Add `proficiency_level` to Assignment |
| Modify | `src/lib/solver/greedy.ts` | Populate proficiency_level during solve |
| Modify | `src/hooks/use-demo-solver.ts` | Populate proficiency_level in demo solver |
| Rewrite | `src/components/domain/plan-grid.tsx` | New day-column grid with dept grouping, skill badges, subtotals |
| Create | `src/components/domain/assignment-popover.tsx` | Detail popover on cell click |
| Modify | `src/app/dashboard/planning/[planId]/page.tsx` | Wire new data (shifts with times, crew, demand) to grid |
| Modify | `src/server/routers/planning.ts` | Return proficiency_level + demand data in getPlanVersion |

---

### Task 1: Add proficiency_level to Assignment type

**Files:**
- Modify: `src/types/solver.ts:78-86`

- [ ] **Step 1: Add proficiency_level to Assignment interface**

In `src/types/solver.ts`, add `proficiency_level` to the Assignment interface:

```typescript
export interface Assignment {
  employee_id: string;
  process_id: string;
  time_slot_id: string;
  shift_pattern_id: string;
  scheduled_hours: number;
  cost_estimate: number;
  assignment_source: "optimizer" | "manual" | "swap" | "ai_suggested";
  proficiency_level: number; // 1-5, employee's skill for assigned process
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Build errors in greedy.ts and use-demo-solver.ts where Assignment objects are created without proficiency_level. This confirms we need to update those files.

- [ ] **Step 3: Commit**

```bash
git add src/types/solver.ts
git commit -m "feat(solver): add proficiency_level to Assignment type"
```

---

### Task 2: Populate proficiency_level in greedy solver

**Files:**
- Modify: `src/lib/solver/greedy.ts:138-146`

- [ ] **Step 1: Update assignment creation in solveGreedy**

In `src/lib/solver/greedy.ts`, the assignment object is created around line 138. Update to include proficiency_level from the candidate's skill:

```typescript
      const assignment: Assignment = {
        employee_id: candidate.employee.id,
        process_id: demand.process_id,
        time_slot_id: demand.time_slot_id,
        shift_pattern_id: 'auto',
        scheduled_hours: shiftHours,
        cost_estimate: costEstimate,
        assignment_source: 'optimizer',
        proficiency_level: skill.proficiency_level,
      }
```

The `skill` variable is already available in the `scoreCandidates` return. We need to access it from the `scored` array. Find the skill lookup from the candidate:

In the loop at line 118 (`for (const candidate of scored)`), add the skill lookup before creating the assignment:

```typescript
    for (const candidate of scored) {
      if (assignedCount >= needed) break

      const skill = candidate.employee.skills.find((s) => s.process_id === demand.process_id)!
      const state = empState.get(candidate.employee.id)!
```

Then use `skill.proficiency_level` in the assignment object.

- [ ] **Step 2: Update locked assignments proficiency_level**

Locked assignments copied at line 59 (`const assignments: Assignment[] = [...input.locked_assignments]`) already have proficiency_level from the type, but manual assignments may not have it set. The type now requires it, so ensure the mapper in `planning.ts` sets it. We'll handle that in Task 6.

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Fewer errors — only use-demo-solver.ts and planning.ts remain.

- [ ] **Step 4: Commit**

```bash
git add src/lib/solver/greedy.ts
git commit -m "feat(solver): populate proficiency_level in greedy solver output"
```

---

### Task 3: Populate proficiency_level in demo solver

**Files:**
- Modify: `src/hooks/use-demo-solver.ts`

- [ ] **Step 1: Update demo solver**

The demo solver in `use-demo-solver.ts` doesn't call `solveGreedy` directly with Assignment creation — it calls `solveGreedy(input)` which returns the solver output. Since we already updated `solveGreedy` in Task 2, the demo solver output will now include `proficiency_level` automatically.

However, we need to verify the demo solver's SolverInput provides employee skills correctly (it does — line 101-107 maps skills).

No code change needed here — `solveGreedy` handles it.

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: Only planning.ts errors remain (locked assignment mapping).

- [ ] **Step 3: Commit (skip if no changes)**

---

### Task 4: Rewrite plan-grid.tsx — day-column layout with department grouping

**Files:**
- Rewrite: `src/components/domain/plan-grid.tsx`

- [ ] **Step 1: Read the current plan-grid.tsx**

Read `src/components/domain/plan-grid.tsx` to understand the current interface.

- [ ] **Step 2: Rewrite the component**

Replace `src/components/domain/plan-grid.tsx` with the new implementation. Key changes:

**New Props interface:**

```typescript
interface Assignment {
  id: string
  employee_id: string
  process_id: string
  shift_pattern_id: string
  assignment_date: string
  scheduled_hours: number
  assignment_source: string
  cost_estimate: number
  proficiency_level?: number
}

interface ShiftDef {
  id: string
  name: string
  start_time: string  // "HH:MM"
  end_time: string    // "HH:MM"
}

interface DemandEntry {
  process_id: string
  date: string
  required_fte: number
}

interface PlanGridProps {
  assignments: Assignment[]
  employees: Array<{
    id: string
    first_name: string
    last_name: string
    department_id: string | null
    crew_name: string | null
  }>
  processes: Array<{ id: string; name: string; department_id: string }>
  departments: Array<{ id: string; name: string; color: string }>
  shifts: ShiftDef[]
  weekStart: string
  workDays: number[]
  isEditable: boolean
  demand: DemandEntry[]
  onCellClick?: (employeeId: string, date: string, shiftId: string, assignment: Assignment | null) => void
}
```

**Grid structure:**
- `table-layout: fixed` with `colgroup`: 185px employee column, 155px per day column
- **Day columns**: generate from `weekStart` + `workDays`, header shows `Ma 7 apr` format
- **Department grouping**: sort employees by department, render a header row before each department group with name + left border in department color
- **Employee row**: avatar (32px initials circle) + name (`#1e293b`, 13px, 700) + crew badge pill

**Cell rendering:**
- Lookup assignment by `employee_id + assignment_date` (not shift sub-column anymore — one cell per day)
- If assignment exists:
  - Process name (11px, department color, ellipsis overflow)
  - Skill badge (16px circle): green (#059669) for 3-5, amber (#b45309) for 2, red (#dc2626) for 1
  - Shift badge pill (8px, right-aligned): lookup shift name from `shifts` array by `shift_pattern_id`
  - Second line: `start_time – end_time · Xu` from shift definition
  - Background: subtle dept color tint
  - Red border if `proficiency_level === 1`
- If empty: "—" centered, hover shows "+" if editable

**Subtotal rows:**
After each department group:
1. **Department subtotal row**: per day column show `assigned/required FTE` with coverage color
2. **Process subtotal rows** (indented): per process with demand, show `assigned/required` per day

Compute from `assignments` + `demand` prop.

- [ ] **Step 3: Verify the component renders**

Run: `npm run build 2>&1 | tail -20`
Expected: Build succeeds (page.tsx may have type mismatches — we'll fix in Task 6)

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/plan-grid.tsx
git commit -m "feat(grid): rewrite plan grid with day-columns, dept grouping, skill badges, subtotals"
```

---

### Task 5: Create assignment-popover.tsx

**Files:**
- Create: `src/components/domain/assignment-popover.tsx`

- [ ] **Step 1: Create the popover component**

Create `src/components/domain/assignment-popover.tsx`:

```typescript
'use client'

import { useRef, useEffect } from 'react'
import { X } from 'lucide-react'

interface AssignmentPopoverProps {
  assignment: {
    process_name: string
    proficiency_level: number
    productivity_multiplier: number
    shift_name: string
    start_time: string
    end_time: string
    scheduled_hours: number
    cost_estimate: number
    assignment_source: string
  }
  anchorRect: DOMRect
  isEditable: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}
```

**Rendering:**
- Position absolutely relative to viewport, anchored to `anchorRect`
- Prefer placing right of anchor; if within 300px of right edge, place left
- White background, border, shadow, border-radius 12px, max-width 280px
- Content:
  - Process name (14px bold)
  - Skill level badge + text (e.g. "Level 4 — Gevorderd")
  - Productivity: "1.15x"
  - Shift: name + times
  - Hours + cost
  - Source badge
  - If editable: "Wijzig" and "Verwijder" buttons
- Close on Escape key or click outside (useEffect with event listeners)

**Proficiency labels:**
```typescript
const SKILL_LABELS: Record<number, string> = {
  1: 'Beginner',
  2: 'Basis',
  3: 'Competent',
  4: 'Gevorderd',
  5: 'Expert',
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: PASS (component not yet imported)

- [ ] **Step 3: Commit**

```bash
git add src/components/domain/assignment-popover.tsx
git commit -m "feat(grid): add assignment detail popover component"
```

---

### Task 6: Wire data in plan detail page + backend

**Files:**
- Modify: `src/app/dashboard/planning/[planId]/page.tsx`
- Modify: `src/server/routers/planning.ts`

- [ ] **Step 1: Update getPlanVersion to return shift times + proficiency**

In `src/server/routers/planning.ts`, the `getPlanVersion` procedure already fetches assignments. Update the assignment mapping to include proficiency_level:

```typescript
const assignments = ((assignmentsResult.data ?? []) as Array<Record<string, unknown>>).map((a) => ({
  id: a.id as string,
  employee_id: a.employee_id as string,
  process_id: a.process_id as string,
  shift_pattern_id: a.shift_pattern_id as string,
  site_id: a.site_id as string,
  assignment_date: a.assignment_date as string,
  start_time: a.start_time as string,
  end_time: a.end_time as string,
  scheduled_hours: a.scheduled_hours as number,
  assignment_source: a.assignment_source as string,
  cost_estimate: (a.cost_estimate as number) ?? 0,
  proficiency_level: (a.proficiency_level as number) ?? 3,
}))
```

Also ensure `shift_assignment_staging` table insert in `runOptimizer` stores proficiency_level (add to staging row mapping).

- [ ] **Step 2: Add demand data to getPlanVersion response**

Add a query for demand data to the getPlanVersion parallel fetch:

```typescript
admin
  .from('workload_plan')
  .select('process_id, period_start, fte_needed')
  .eq('site_id', plan.site_id)
  .eq('organization_id', ctx.organizationId)
  .gte('period_start', plan.plan_period_start)
  .lte('period_start', plan.plan_period_end)
```

Map to demand array and return alongside assignments.

- [ ] **Step 3: Update plan detail page to pass new props to PlanGrid**

In `[planId]/page.tsx`:
- Pass `shifts` with `start_time` and `end_time` (already available from shiftsQ, just need to include the time fields)
- Pass `demand` from the new getPlanVersion response
- Pass `crew_name` in employee data (from employee query or hardcode null for now)
- Import and render `AssignmentPopover` when a cell is clicked
- Update `onCellClick` handler to capture anchor rect + assignment data for popover
- Wire `demandByProcess` to `PlanCoverageBar` instead of `null`

- [ ] **Step 4: Update demo mode data path**

For demo mode, the `solverAssignments` mapping in page.tsx already transforms solver output. Update it to pass `proficiency_level`:

```typescript
const solverAssignments = useMemo(() => {
  if (!demoSolver.result) return null
  return demoSolver.result.assignments.map((a, i) => {
    const parts = a.time_slot_id.split('_')
    const date = parts[0] ?? ''
    const shiftId = parts.slice(1).join('_')
    return {
      id: `solver-asg-${i}`,
      employee_id: a.employee_id,
      process_id: a.process_id,
      shift_pattern_id: shiftId || a.shift_pattern_id,
      assignment_date: date,
      scheduled_hours: a.scheduled_hours,
      assignment_source: a.assignment_source,
      cost_estimate: a.cost_estimate,
      proficiency_level: a.proficiency_level,
    }
  })
}, [demoSolver.result])
```

- [ ] **Step 5: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: PASS — full build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/planning.ts src/app/dashboard/planning/[planId]/page.tsx
git commit -m "feat(grid): wire shift times, demand data, and proficiency to plan grid"
```

---

### Task 7: Store proficiency_level in staging table

**Files:**
- Modify: `src/server/routers/planning.ts` (runOptimizer staging insert)

- [ ] **Step 1: Check if shift_assignment_staging has proficiency_level column**

Run a Supabase query or check the migration to see if `proficiency_level` column exists on `shift_assignment_staging`. If not, we need to either:
- Add the column via migration
- Or compute it at read time by joining employee_skill

The safer approach is to compute at read time — no migration needed. Update `getPlanVersion` to join employee_skill:

```typescript
// In getPlanVersion, after fetching assignments, enrich with proficiency:
const skillsResult = await admin
  .from('employee_skill')
  .select('employee_id, process_id, proficiency_level')
  .eq('organization_id', ctx.organizationId)

const skillMap = new Map<string, number>()
for (const s of (skillsResult.data ?? []) as Array<Record<string, unknown>>) {
  skillMap.set(`${s.employee_id}::${s.process_id}`, s.proficiency_level as number)
}

// Then in the assignment mapping:
proficiency_level: skillMap.get(`${a.employee_id}::${a.process_id}`) ?? 3,
```

- [ ] **Step 2: Verify build**

Run: `npm run build 2>&1 | tail -20`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/server/routers/planning.ts
git commit -m "feat(grid): enrich assignments with proficiency_level from employee_skill"
```

---

### Task 8: Final verification and cleanup

- [ ] **Step 1: Run full build**

Run: `npm run build 2>&1 | tail -30`
Expected: Full build passes, all pages compile

- [ ] **Step 2: Visual verification**

Start dev server and verify:
1. Navigate to a plan in draft status
2. Run the solver
3. Grid shows day-columns with department grouping
4. Cells show process name + skill badge + shift name + times
5. Subtotal rows show FTE coverage per department and process
6. Click a cell → popover shows detail
7. Coverage bar shows actual data (not "voer eerst workload compute uit")

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "feat(grid): plan grid redesign complete — solver feedback & validation"
```

---

## Task Dependency Graph

```
Task 1 (type) → Task 2 (greedy) → Task 3 (demo) ─┐
                                                    ├→ Task 6 (wiring) → Task 7 (skill join) → Task 8 (verify)
Task 4 (grid rewrite) ────────────────────────────┤
Task 5 (popover) ─────────────────────────────────┘
```

Tasks 4 and 5 can be done in parallel with Tasks 1-3.
