# Process Kanban Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat process card list with a kanban board where departments are columns and processes are cards with inline creation/editing.

**Architecture:** Supabase migration adds `department.color` and `process.norm_uph`. The org tRPC router gets new/modified endpoints using admin client. The processes page is a full rewrite with 4 new components: `DepartmentColumn`, `ProcessCard`, `ProcessCardForm`, `DepartmentCreateForm`.

**Tech Stack:** Next.js 16, tRPC, Supabase (admin client), Framer Motion, Zustand (site store)

**Spec:** `docs/superpowers/specs/2026-03-21-process-management-redesign.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/00003_process_kanban.sql` | Add `department.color`, `process.norm_uph` |
| Modify | `src/server/routers/org.ts` | Modify `listDepartments`, `listProcesses`, `upsertProcess`. Add `upsertDepartment`, `deleteDepartment`, `deleteProcess` |
| Create | `src/components/domain/process-card.tsx` | Single process card with norm display + ⋮ menu |
| Create | `src/components/domain/process-card-form.tsx` | Inline create/edit form for a process |
| Create | `src/components/domain/department-column.tsx` | Kanban column: header + cards + add button |
| Create | `src/components/domain/department-create-form.tsx` | Inline column for creating a new department |
| Rewrite | `src/app/dashboard/processes/page.tsx` | Kanban board page with department columns |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00003_process_kanban.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 00003_process_kanban.sql
-- Adds department.color for kanban column coloring
-- Adds process.norm_uph for single-value norm display

-- 1. Add color to department
ALTER TABLE department ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT 'indigo';

-- 2. Add norm_uph to process
ALTER TABLE process ADD COLUMN IF NOT EXISTS norm_uph DECIMAL(8,2);

-- 3. Backfill norm_uph from process_productivity_standard
UPDATE process p
SET norm_uph = pps.units_per_hour
FROM (
  SELECT DISTINCT ON (process_id) process_id, units_per_hour
  FROM process_productivity_standard
  WHERE skill_level = 3
  ORDER BY process_id, effective_date DESC NULLS LAST
) pps
WHERE p.id = pps.process_id AND p.norm_uph IS NULL;

-- 4. Default norm_uph for any remaining processes
UPDATE process SET norm_uph = 0 WHERE norm_uph IS NULL;
```

- [ ] **Step 2: Apply migration**

Run: `npx supabase db push` (or apply via Supabase dashboard SQL editor if using hosted)

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00003_process_kanban.sql
git commit -m "migration: add department.color and process.norm_uph for kanban view"
```

---

### Task 2: tRPC Endpoints — Department CRUD

**Files:**
- Modify: `src/server/routers/org.ts`

**Reference:** The existing `listDepartments` endpoint (find by name, not line number) uses `ctx.supabase`. It needs to switch to admin client, add `color` to the select, and aggregate process count. **Note:** No other callers exist for `listDepartments` or `listProcesses` — the only consumer is the processes page (being fully rewritten).

- [ ] **Step 1: Modify `listDepartments`**

Replace the existing `listDepartments` endpoint (lines 257-278 of `org.ts`) with:

```typescript
listDepartments: viewerProcedure
  .input(
    z.object({
      site_id: z.string().uuid(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('department')
      .select('id, name, code, color, site_id')
      .eq('site_id', input.site_id)
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'active')
      .order('name')

    assertNoError(error, 'listDepartments')

    // Count processes per department
    const deptIds = (data ?? []).map((d) => (d as Record<string, unknown>).id as string)
    let processCounts: Record<string, number> = {}

    if (deptIds.length > 0) {
      const { data: counts, error: countErr } = await admin
        .from('process')
        .select('department_id')
        .eq('organization_id', ctx.organizationId)
        .eq('is_active', true)
        .in('department_id', deptIds)

      assertNoError(countErr, 'listDepartments:counts')

      processCounts = (counts ?? []).reduce((acc, row) => {
        const deptId = (row as Record<string, unknown>).department_id as string
        acc[deptId] = (acc[deptId] ?? 0) + 1
        return acc
      }, {} as Record<string, number>)
    }

    return (data ?? []).map((d) => {
      const dept = d as Record<string, unknown>
      return {
        id: dept.id as string,
        name: dept.name as string,
        code: dept.code as string,
        color: (dept.color as string) ?? 'indigo',
        site_id: dept.site_id as string,
        process_count: processCounts[dept.id as string] ?? 0,
      }
    })
  }),
```

- [ ] **Step 2: Add `upsertDepartment`**

Add after `listDepartments`:

```typescript
upsertDepartment: managerProcedure
  .input(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      site_id: z.string().uuid(),
      color: z.string().default('indigo'),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const admin = createAdminClient()
    // Auto-generate code from name, append timestamp suffix to avoid unique constraint violations
    const baseCode = input.name
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 16)
    const code = input.id
      ? baseCode  // For updates, keep base code
      : `${baseCode}_${Date.now().toString(36).slice(-4)}`.substring(0, 20)

    const row = {
      ...(input.id ? { id: input.id } : {}),
      name: input.name,
      code,
      site_id: input.site_id,
      color: input.color,
      organization_id: ctx.organizationId,
    }

    const { data, error } = await admin
      .from('department')
      .upsert(row, { onConflict: 'id' })
      .select('id, name, code, color, site_id')
      .single()

    assertNoError(error, 'upsertDepartment')

    if (!data) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Department upsert returned no data' })
    }

    return data as { id: string; name: string; code: string; color: string; site_id: string }
  }),
```

- [ ] **Step 3: Add `deleteDepartment`**

```typescript
deleteDepartment: managerProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const admin = createAdminClient()

    // Check for child processes
    const { count, error: countErr } = await admin
      .from('process')
      .select('id', { count: 'exact', head: true })
      .eq('department_id', input.id)
      .eq('is_active', true)

    assertNoError(countErr, 'deleteDepartment:checkProcesses')

    if (count && count > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Cannot delete: department has ${count} active process(es). Remove or reassign them first.`,
      })
    }

    // Soft delete — set status to inactive (preserves FK references from shift_assignment)
    const { error } = await admin
      .from('department')
      .update({ status: 'inactive', updated_at: new Date().toISOString() })
      .eq('id', input.id)
      .eq('organization_id', ctx.organizationId)

    assertNoError(error, 'deleteDepartment')

    return { deleted: true }
  }),
```

- [ ] **Step 4: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/org.ts
git commit -m "feat: department CRUD endpoints with admin client + process counts"
```

---

### Task 3: tRPC Endpoints — Process CRUD

**Files:**
- Modify: `src/server/routers/org.ts`

- [ ] **Step 1: Modify `listProcesses`**

Replace the existing `listProcesses` endpoint (lines 283-332) with:

```typescript
listProcesses: viewerProcedure
  .input(
    z.object({
      site_id: z.string().uuid(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const admin = createAdminClient()

    // Join through department to filter by site
    const { data: depts, error: deptErr } = await admin
      .from('department')
      .select('id')
      .eq('site_id', input.site_id)
      .eq('organization_id', ctx.organizationId)

    assertNoError(deptErr, 'listProcesses:depts')

    const deptIds = (depts ?? []).map((d) => (d as Record<string, unknown>).id as string)

    if (deptIds.length === 0) return []

    const { data, error } = await admin
      .from('process')
      .select('id, name, code, unit_of_measure, norm_uph, department_id')
      .eq('organization_id', ctx.organizationId)
      .eq('is_active', true)
      .in('department_id', deptIds)
      .order('name')

    assertNoError(error, 'listProcesses')

    return (data ?? []).map((p: Record<string, unknown>) => ({
      id: p.id as string,
      name: p.name as string,
      code: p.code as string,
      unit_of_measure: p.unit_of_measure as string,
      norm_uph: (p.norm_uph as number) ?? 0,
      department_id: p.department_id as string,
    }))
  }),
```

- [ ] **Step 2: Replace `upsertProcess`**

Replace the existing `upsertProcess` endpoint (lines 337-401) with:

```typescript
upsertProcess: managerProcedure
  .input(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      unit_of_measure: z.string().min(1),
      norm_uph: z.number().nonnegative(),
      department_id: z.string().uuid(),
    }),
  )
  .mutation(async ({ ctx, input }) => {
    const admin = createAdminClient()
    const code = input.name
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 30)

    const row = {
      ...(input.id ? { id: input.id } : {}),
      name: input.name,
      code,
      unit_of_measure: input.unit_of_measure,
      norm_uph: input.norm_uph,
      department_id: input.department_id,
      organization_id: ctx.organizationId,
      category: 'support',
      applicable_site_types: ['warehouse'],
    }

    const { data, error } = await admin
      .from('process')
      .upsert(row, { onConflict: 'id' })
      .select('id, name, code, unit_of_measure, norm_uph, department_id')
      .single()

    assertNoError(error, 'upsertProcess')

    if (!data) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Process upsert returned no data' })
    }

    return data as { id: string; name: string; code: string; unit_of_measure: string; norm_uph: number; department_id: string }
  }),
```

- [ ] **Step 3: Add `deleteProcess`**

```typescript
deleteProcess: managerProcedure
  .input(z.object({ id: z.string().uuid() }))
  .mutation(async ({ ctx, input }) => {
    const admin = createAdminClient()

    // Check for employee skills
    const { count: skillCount, error: skillErr } = await admin
      .from('employee_skill')
      .select('id', { count: 'exact', head: true })
      .eq('process_id', input.id)

    assertNoError(skillErr, 'deleteProcess:checkSkills')

    // Check for shift assignments
    const { count: assignCount, error: assignErr } = await admin
      .from('shift_assignment')
      .select('id', { count: 'exact', head: true })
      .eq('process_id', input.id)

    assertNoError(assignErr, 'deleteProcess:checkAssignments')

    const total = (skillCount ?? 0) + (assignCount ?? 0)
    if (total > 0) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: `Cannot delete: ${skillCount ?? 0} employee skill(s) and ${assignCount ?? 0} shift assignment(s) reference this process.`,
      })
    }

    const { error } = await admin
      .from('process')
      .delete()
      .eq('id', input.id)
      .eq('organization_id', ctx.organizationId)

    assertNoError(error, 'deleteProcess')

    return { deleted: true }
  }),
```

- [ ] **Step 4: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/org.ts
git commit -m "feat: process CRUD with norm_uph, site-scoped via department join"
```

---

### Task 4: ProcessCard + ProcessCardForm Components

**Files:**
- Create: `src/components/domain/process-card.tsx`
- Create: `src/components/domain/process-card-form.tsx`

**Reference:** Follow existing component patterns in `src/components/domain/`. Use `motion` from framer-motion, `scalePress`/`fadeInUp`/`bouncy` from `@/lib/motion`. Use inline styles with CSS variables (`var(--card)`, `var(--border)`, `var(--foreground)`, etc).

- [ ] **Step 1: Create color config helper**

This will be used by multiple components. Add to `process-card.tsx`:

```typescript
// Department color presets
export const DEPT_COLORS: Record<string, { main: string; bg: string; border: string }> = {
  indigo:  { main: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.15)' },
  emerald: { main: '#10b981', bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.12)' },
  amber:   { main: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.12)' },
  pink:    { main: '#ec4899', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.12)' },
  cyan:    { main: '#06b6d4', bg: 'rgba(6,182,212,0.06)',  border: 'rgba(6,182,212,0.12)' },
  red:     { main: '#ef4444', bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.12)' },
}

export function getDeptColor(color: string) {
  return DEPT_COLORS[color] ?? DEPT_COLORS.indigo
}
```

- [ ] **Step 2: Create `ProcessCard` component**

Write `src/components/domain/process-card.tsx` — a card showing process name, large norm number, UOM badge, and ⋮ dropdown menu with Edit/Delete.

Key details:
- Norm number: 22px, weight 800, monospace font, colored by department color
- UOM badge: small pill with department color background
- ⋮ menu: positioned absolute dropdown with Edit and Delete options
- Delete: shows inline confirmation before calling `onDelete`
- Hover: `whileHover={{ y: -2, boxShadow: 'var(--elevation-2)' }}`

- [ ] **Step 3: Create `ProcessCardForm` component**

Write `src/components/domain/process-card-form.tsx` — an inline form that looks like a card but with input fields.

Key details:
- Name input: auto-focused, placeholder "Process name..."
- UOM: `<select>` dropdown with options: orders, order lines, pallets, cartons, pieces, units
- Norm: number input, centered, monospace font
- Save button: gradient using department color
- Cancel button: ghost style
- `initialValues` prop for edit mode (pre-fills fields)
- On save: calls `onSave({ name, unit_of_measure, norm_uph })`

- [ ] **Step 4: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 5: Commit**

```bash
git add src/components/domain/process-card.tsx src/components/domain/process-card-form.tsx
git commit -m "feat: ProcessCard + ProcessCardForm components for kanban"
```

---

### Task 5: DepartmentColumn + DepartmentCreateForm

**Files:**
- Create: `src/components/domain/department-column.tsx`
- Create: `src/components/domain/department-create-form.tsx`

- [ ] **Step 1: Create `DepartmentColumn` component**

Write `src/components/domain/department-column.tsx` — a kanban column for one department.

Key details:
- Column container: min-width 260px, flex 1, rounded, department color background/border
- Header: glowing color dot + uppercase department name (12px, 800 weight, tracking wide) + process count badge + ⋮ button
- ⋮ menu: Rename, Change Color (6 color swatches), Delete (with server-side block check)
- Rename: inline editing — click "Rename" → name becomes an input, Enter to save, Escape to cancel
- Cards: `motion.div` with `containerStagger`/`fadeInUp` for staggered entrance
- Bottom: "+ Add Process" dashed button. When clicked, replaces itself with `ProcessCardForm` using `AnimatePresence` + `bouncy` transition
- State: `addingMode` boolean (shows form vs button), `editingId` string | null (which card is in edit mode)

- [ ] **Step 2: Create `DepartmentCreateForm` component**

Write `src/components/domain/department-create-form.tsx` — appears as a new column when the user clicks "+ Department".

Key details:
- Same column dimensions as `DepartmentColumn` (min-width 260px)
- Color picker: 6 circular swatches (14px circles), click to select, selected one gets a border ring
- Name input: auto-focused
- Create + Cancel buttons
- Dashed "+ Add Process" placeholder below (non-functional, just visual hint)
- On create: calls `onSave({ name, color })`

- [ ] **Step 3: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/department-column.tsx src/components/domain/department-create-form.tsx
git commit -m "feat: DepartmentColumn + DepartmentCreateForm for kanban board"
```

---

### Task 6: ProcessKanbanPage — Full Page Rewrite

**Files:**
- Rewrite: `src/app/dashboard/processes/page.tsx`

- [ ] **Step 1: Rewrite the processes page**

Replace the entire file with the kanban board page. The page:

1. Gets `activeSiteId` from `useSiteStore()`
2. Fetches departments via `trpc.org.listDepartments.useQuery({ site_id })`
3. Fetches processes via `trpc.org.listProcesses.useQuery({ site_id })`
4. Groups processes client-side by `department_id` into a `Map<string, Process[]>`
5. Renders header: "Processes" title + site subtitle + "+ Department" button
6. Renders kanban board: horizontal flex container with `overflow-x: auto`
7. Maps departments → `DepartmentColumn` components
8. When `showAddDept` is true, renders `DepartmentCreateForm` as the last column
9. No site selected: shows "Select a site to view processes" message
10. Loading state: 3 skeleton columns (same shape as `DepartmentColumn` but with `animate-pulse`)
11. Error state: red-bordered card with error message, same pattern as employee list page
12. Empty state: "No departments yet" message with prominent "+ Department" button

Mutation handlers (all invalidate both queries on success):
- `handleAddProcess(deptId, data)` → calls `upsertProcess.mutateAsync`
- `handleEditProcess(processId, data)` → calls `upsertProcess.mutateAsync` with id
- `handleDeleteProcess(processId)` → calls `deleteProcess.mutateAsync`
- `handleAddDepartment(data)` → calls `upsertDepartment.mutateAsync`
- `handleEditDepartment(deptId, data)` → calls `upsertDepartment.mutateAsync` with id
- `handleDeleteDepartment(deptId)` → calls `deleteDepartment.mutateAsync`

- [ ] **Step 2: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 3: Manual smoke test**

Open `http://localhost:3000/dashboard/processes` and verify:
1. Departments show as columns (from seed data if any)
2. "+ Department" creates a new column
3. "+ Add Process" in a column shows inline form
4. Saving a process creates a card with the norm number
5. ⋮ menu on a card shows Edit/Delete
6. Edit transforms card into form with pre-filled values
7. Delete shows confirmation and removes card

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/processes/page.tsx
git commit -m "feat: process kanban board — departments as columns, inline CRUD"
```

---

### Task 7: Cleanup + Final Verification

**Files:**
- Possibly modify: `src/components/domain/csv-import-wizard.tsx` (if unused, leave as-is)

- [ ] **Step 1: Full build**

Run: `npx next build`
Expected: Compiled successfully, no TypeScript errors

- [ ] **Step 2: Verify all pages still work**

Navigate to each page and confirm no regressions:
- `/dashboard` — dashboard loads
- `/dashboard/employees` — employee list loads, filters work
- `/dashboard/employees/[id]` — employee detail loads, edit works
- `/dashboard/processes` — kanban board loads
- `/dashboard/settings` — settings load
- `/dashboard/planning` — placeholder page
- `/dashboard/demand` — placeholder page

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: process management kanban redesign — complete implementation"
```
