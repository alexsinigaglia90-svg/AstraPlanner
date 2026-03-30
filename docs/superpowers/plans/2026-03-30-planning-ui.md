# Planning UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the planning UI — plan list, plan detail with assignment heatmap grid, solver trigger, and state machine.

**Architecture:** 2 pages + 6 components. Plan list at `/dashboard/planning`, detail at `/dashboard/planning/[planId]`. Reuses existing `KpiHeroCard` component. All data via `planning` tRPC router (already implemented).

**Tech Stack:** Next.js, tRPC, Framer Motion, existing AAA design system

**Spec:** docs/superpowers/specs/2026-03-30-planning-ui-design.md

---

## File Structure

```
src/app/dashboard/planning/
  page.tsx                      # MODIFY: Plan list (replace placeholder)
  [planId]/
    page.tsx                    # CREATE: Plan detail

src/components/domain/
  create-plan-wizard.tsx        # CREATE: New plan modal
  plan-grid.tsx                 # CREATE: Assignment heatmap grid
  plan-coverage-bar.tsx         # CREATE: Per-process coverage summary
  assignment-editor.tsx         # CREATE: Cell click modal
```

---

### Task 1: Create Plan Wizard + Sidebar Nav

**Files:**
- Create: `src/components/domain/create-plan-wizard.tsx`
- Modify: `src/app/dashboard/layout.tsx` (add Planning to sidebar nav)

- [ ] **Step 1: Add Planning to sidebar navigation**

Read `src/app/dashboard/layout.tsx`, find the nav items array, add Planning with Calendar icon between "Skills" and "Demand" (or at end). Route: `/dashboard/planning`.

- [ ] **Step 2: Create the wizard component**

`src/components/domain/create-plan-wizard.tsx` — centered modal wizard (same pattern as add-employee-wizard):

```typescript
interface CreatePlanWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onCreated: (planId: string) => void
}
```

UI:
- Header: "Nieuw plan"
- Week start picker: date input (type="date", default = next Monday)
- Number of weeks: select 1-8 (default 4)
- Preview text: "Week 14 t/m 17 (31 mrt - 27 apr 2026)"
- "Aanmaken" button → call `planning.createDraft({ site_id, plan_period_start, plan_period_end })`
- On success: call `onCreated(planId)` → parent navigates to detail

Calculate period_end from start + (weeks × 7 days - 1 day).

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/create-plan-wizard.tsx src/app/dashboard/layout.tsx
git commit -m "feat(planning-ui): create plan wizard + sidebar nav"
```

---

### Task 2: Plan List Page

**Files:**
- Modify: `src/app/dashboard/planning/page.tsx` (replace placeholder)

- [ ] **Step 1: Rewrite planning page**

Replace the current placeholder content. Read the existing file first.

Structure:
- Header row: "Planning" title + "Nieuw plan" button (opens CreatePlanWizard)
- Filter chips: All | Concept | Geoptimaliseerd | Voorgesteld | Goedgekeurd | Gepubliceerd
- Cards grid (staggered entrance animation):
  - Each card shows: period range, version number, status badge, coverage %, created_at
  - Click → `router.push(\`/dashboard/planning/${plan.id}\`)`
  - Empty state: "Nog geen plannen. Maak je eerste plan aan."

Data: `planning.listPlanVersions({ site_id: activeSiteId })`

Status badge colors (use inline styles, same pattern as rest of app):
- draft: gray bg, dark text
- optimized: indigo bg, white text
- proposed: amber bg, dark text
- approved: emerald bg, white text
- published: green bg, white text

Use existing patterns: `containerStagger`, `fadeInUp`, `motion.div`, `useSiteStore`, `useDemoStore`.

- [ ] **Step 2: Wire up wizard**

Import `CreatePlanWizard`, manage `wizardOpen` state, on `onCreated` navigate to detail page.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/planning/page.tsx
git commit -m "feat(planning-ui): plan list with status filters and cards"
```

---

### Task 3: Plan Detail Page Skeleton

**Files:**
- Create: `src/app/dashboard/planning/[planId]/page.tsx`

- [ ] **Step 1: Create the detail page**

Structure:
- Top bar: back link "← Planningen", plan title "Plan v{n} — Week {start}-{end}", status badge
- Action buttons (right side of top bar, context-dependent):

```typescript
const ACTIONS: Record<string, { label: string; action: string; color: string }[]> = {
  draft: [{ label: 'Run solver', action: 'optimize', color: 'primary' }],
  optimized: [
    { label: 'Voorstel indienen', action: 'propose', color: 'amber' },
    { label: 'Opnieuw optimaliseren', action: 'reoptimize', color: 'muted' },
  ],
  proposed: [
    { label: 'Goedkeuren', action: 'approve', color: 'green' },
    { label: 'Afwijzen', action: 'reject', color: 'destructive' },
  ],
  approved: [{ label: 'Publiceren', action: 'publish', color: 'green' }],
  published: [],
}
```

- KPI hero cards row (4 cards using existing `KpiHeroCard` component):
  - Coverage %, Total Cost (EUR), Overtime (uren), Solve Time (s)
  - Data from plan.summary_metrics_json
  - Show shimmer placeholders while loading

- Below KPIs: placeholder div "Grid komt hier" (Task 4 fills this in)

Data: `planning.getPlanVersion({ id: planId })`

Action handlers:
- 'optimize' → `planning.runOptimizer({ plan_version_id, solver_strategy: 'greedy' })` → refetch
- 'propose' → `planning.transitionState({ plan_version_id, target_state: 'proposed' })` → refetch
- 'approve' → `planning.transitionState({ ..., target_state: 'approved' })` → refetch
- 'reject' → `planning.transitionState({ ..., target_state: 'rejected' })` → navigate back
- 'publish' → `planning.transitionState({ ..., target_state: 'published' })` → refetch
- 'reoptimize' → first transition back to draft, then run optimizer

Show loading spinner on action button while mutation runs. Toast on success/error.

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 3: Commit**

```bash
git add src/app/dashboard/planning/[planId]/page.tsx
git commit -m "feat(planning-ui): plan detail page with KPIs and state machine"
```

---

### Task 4: Assignment Heatmap Grid

**Files:**
- Create: `src/components/domain/plan-grid.tsx`
- Modify: `src/app/dashboard/planning/[planId]/page.tsx` (integrate grid)

- [ ] **Step 1: Create the grid component**

```typescript
interface PlanGridProps {
  assignments: Array<{
    employee_id: string
    process_id: string
    time_slot_id: string  // format: "2026-04-06_shiftId"
    scheduled_hours: number
    assignment_source: 'optimizer' | 'locked'
    cost_estimate: number
  }>
  employees: Array<{ id: string; first_name: string; last_name: string; department_id: string | null }>
  processes: Array<{ id: string; name: string; department_id: string }>
  shifts: Array<{ id: string; name: string }>
  weekStart: string  // ISO date
  workDays: number[] // [1,2,3,4,5]
  isEditable: boolean // false for proposed/approved/published
  onCellClick?: (employeeId: string, date: string, shiftId: string) => void
}
```

Grid layout (same pattern as skill matrix — `<table>` with sticky headers):
- **Sticky left column:** Employee avatar + first name (140px wide)
- **Column headers row 1:** Day names — "Ma", "Di", "Wo", "Do", "Vr" (colSpan = number of shifts)
- **Column headers row 2:** Shift names per day — "Ochtend", "Middag"
- **Cells:**
  - If assignment exists: show abbreviated process name (first 4 chars), department color background
  - If locked: add small lock icon
  - If empty: light gray, show faint "+" on hover (if editable)
  - Hover tooltip: full process name + hours + cost

Build column structure from `weekStart` + `workDays` + `shifts`:
```typescript
const columns = workDays.flatMap(dow => {
  const date = addDays(weekStart, dow - 1) // 1=Mon → offset 0
  return shifts.map(shift => ({ date, shift, id: `${date}_${shift.id}` }))
})
```

Build assignment lookup: `Map<"empId:slotId", assignment>`

Department colors: reuse `getDeptColor()` from process-card.

- [ ] **Step 2: Integrate into detail page**

Replace "Grid komt hier" placeholder. Pass data from `getPlanVersion` response.
Parse employees from a separate `workforce.listEmployees` query.
Parse processes from `org.listProcesses`.
Parse shifts from `org.listShifts`.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/plan-grid.tsx src/app/dashboard/planning/[planId]/page.tsx
git commit -m "feat(planning-ui): assignment heatmap grid with department colors"
```

---

### Task 5: Coverage Summary Bar

**Files:**
- Create: `src/components/domain/plan-coverage-bar.tsx`
- Modify: `src/app/dashboard/planning/[planId]/page.tsx` (add below grid)

- [ ] **Step 1: Create coverage bar component**

```typescript
interface PlanCoverageBarProps {
  processes: Array<{ id: string; name: string; department_id: string }>
  assignments: Array<{ process_id: string; time_slot_id: string }>
  demand: Array<{ process_id: string; required_fte: number }> | null
  departments: Array<{ id: string; name: string; color: string }>
}
```

Layout: horizontal bar per process showing coverage:
- Process name (left)
- Required FTE | Assigned FTE (numbers)
- Coverage bar (colored fill):
  - Red (<70%): `#EF4444`
  - Amber (70-90%): `#F59E0B`
  - Green (90%+): `#10B981`
- Sorted by coverage ascending (worst gaps first)

If no demand data available, show "Voer eerst workload compute uit" message.

- [ ] **Step 2: Integrate into detail page**

Add below the grid. Compute demand from workload_plan data (fetch via `workload.getForPlan` if available, otherwise skip).

- [ ] **Step 3: Type check + commit**

```bash
git add src/components/domain/plan-coverage-bar.tsx src/app/dashboard/planning/[planId]/page.tsx
git commit -m "feat(planning-ui): per-process coverage summary bar"
```

---

### Task 6: Assignment Editor Modal

**Files:**
- Create: `src/components/domain/assignment-editor.tsx`
- Modify: `src/app/dashboard/planning/[planId]/page.tsx` (wire up cell clicks)

- [ ] **Step 1: Create the editor component**

```typescript
interface AssignmentEditorProps {
  open: boolean
  onClose: () => void
  planVersionId: string
  employeeId: string
  employeeName: string
  date: string
  shiftId: string
  shiftName: string
  currentAssignment: { process_id: string; assignment_source: string } | null
  processes: Array<{ id: string; name: string }>
  onSaved: () => void
}
```

Modal (small, centered):
- Header: "{employeeName} — {date} {shiftName}"
- If current assignment exists:
  - Show current process name
  - "Verwijderen" button → `planning.removeAssignment`
  - "Vergrendelen" toggle → `planning.lockAssignment`
- Process dropdown: select from available processes
- "Toewijzen" button → `planning.manualAssign`
- On success: call `onSaved()` → parent refetches

- [ ] **Step 2: Wire up in detail page**

When grid cell is clicked (in editable mode):
- Set `selectedCell` state with employee, date, shift info
- Open AssignmentEditor
- On saved: refetch plan data

- [ ] **Step 3: Type check + commit**

```bash
git add src/components/domain/assignment-editor.tsx src/app/dashboard/planning/[planId]/page.tsx
git commit -m "feat(planning-ui): assignment editor modal with manual assign + lock"
```
