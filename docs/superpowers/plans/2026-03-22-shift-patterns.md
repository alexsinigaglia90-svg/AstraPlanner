# Shift Patterns, Crews & Rotation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build shift management with 3-layer model (shifts, crews, rotation) on a Settings sub-page, plus crew assignment on employees.

**Architecture:** Migration adds `crew`, `rotation_schedule`, `rotation_entry` tables and `site_id` on `shift_pattern`, `crew_id` on `employee`. The org tRPC router gets 8 new endpoints. A new Settings tab page renders three sections: shifts, crews, rotation matrix. Employee edit form gets a crew dropdown.

**Tech Stack:** Next.js 16, tRPC, Supabase (admin client), Framer Motion, Zustand (site store)

**Spec:** `docs/superpowers/specs/2026-03-22-shift-patterns-design.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/00005_shifts_crews_rotation.sql` | New tables + schema changes |
| Modify | `src/server/routers/org.ts` | Add 8 endpoints: shifts, crews, rotation CRUD |
| Modify | `src/server/routers/workforce.ts` | Extend employee endpoints with `crew_id` |
| Create | `src/app/dashboard/settings/shifts/page.tsx` | Settings shifts page with 3 sections |
| Modify | `src/app/dashboard/settings/layout.tsx` | Add "Shifts" tab |
| Modify | `src/components/domain/edit-employee-form.tsx` | Add crew dropdown |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00005_shifts_crews_rotation.sql`

- [ ] **Step 1: Write migration file**

```sql
-- 00005_shifts_crews_rotation.sql

-- 1. Add site_id to shift_pattern
ALTER TABLE shift_pattern ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES site(id) ON DELETE CASCADE;

-- 2. Crew table
CREATE TABLE IF NOT EXISTS crew (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id         UUID         NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  code            VARCHAR(20)  NOT NULL,
  color           VARCHAR(20)  DEFAULT 'indigo',
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_crew_org_site_code UNIQUE (organization_id, site_id, code)
);

-- 3. Rotation schedule (one per site)
CREATE TABLE IF NOT EXISTS rotation_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID     NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id         UUID     NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  cycle_weeks     SMALLINT NOT NULL DEFAULT 2,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rotation_site UNIQUE (organization_id, site_id)
);

-- 4. Rotation entries (crew × week → shift)
CREATE TABLE IF NOT EXISTS rotation_entry (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_schedule_id UUID     NOT NULL REFERENCES rotation_schedule(id) ON DELETE CASCADE,
  crew_id              UUID     NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  shift_pattern_id     UUID     NOT NULL REFERENCES shift_pattern(id) ON DELETE CASCADE,
  week_number          SMALLINT NOT NULL,
  CONSTRAINT uq_rotation_crew_week UNIQUE (rotation_schedule_id, crew_id, week_number)
);

-- 5. Add crew_id to employee
ALTER TABLE employee ADD COLUMN IF NOT EXISTS crew_id UUID REFERENCES crew(id) ON DELETE SET NULL;

-- 6. Enable RLS on new tables
ALTER TABLE crew ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_entry ENABLE ROW LEVEL SECURITY;

-- 7. RLS policies (select by org, modify bypassed via admin client)
CREATE POLICY crew_select ON crew FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY rotation_schedule_select ON rotation_schedule FOR SELECT USING (organization_id = public.get_organization_id());
CREATE POLICY rotation_entry_select ON rotation_entry FOR SELECT USING (
  rotation_schedule_id IN (SELECT id FROM rotation_schedule WHERE organization_id = public.get_organization_id())
);
```

- [ ] **Step 2: Apply migration via Supabase Dashboard SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00005_shifts_crews_rotation.sql
git commit -m "migration: add crew, rotation_schedule, rotation_entry tables + shift_pattern.site_id + employee.crew_id"
```

---

### Task 2: tRPC Endpoints — Shifts + Crews + Rotation

**Files:**
- Modify: `src/server/routers/org.ts`

Add all 8 endpoints at the end of the router (before the closing `})`). All use `createAdminClient()` and `ctx.organizationId`. Follow the exact same patterns as existing endpoints (`listDepartments`, `upsertDepartment`, etc.).

- [ ] **Step 1: Add shift endpoints**

`listShifts`: viewerProcedure, input `{ site_id }`, selects from `shift_pattern` where `site_id` matches (or `site_id IS NULL` for legacy), returns `{ id, name, code, start_time, end_time, duration_hours, days_of_week, break_rules_json, is_overnight, shift_type, color_hex }[]`.

`upsertShift`: managerProcedure, input `{ id?, name, site_id, start_time, end_time, days_of_week, break_rules_json, is_overnight? }`. Auto-generate `code` from name. Calculate `duration_hours` from start/end (handle overnight). Set `paid_hours = duration_hours`, `shift_type = 'regular'`, `applicable_site_types = ['warehouse']`. Upsert to `shift_pattern`.

`deleteShift`: managerProcedure, input `{ id }`. Check `rotation_entry` references — block if used. Otherwise hard delete.

- [ ] **Step 2: Add crew endpoints**

`listCrews`: viewerProcedure, input `{ site_id }`. Select crews, plus count employees per crew via separate query on `employee.crew_id`. Return `{ id, name, code, color, member_count }[]`.

`upsertCrew`: managerProcedure, input `{ id?, name, site_id, color }`. Auto-generate `code` with timestamp suffix (same pattern as `upsertDepartment`). Set `organization_id` from context.

`deleteCrew`: managerProcedure, input `{ id }`. Check `employee.crew_id` references AND `rotation_entry.crew_id` references. Block with descriptive message if either > 0. Otherwise hard delete.

- [ ] **Step 3: Add rotation endpoints**

`getRotation`: viewerProcedure, input `{ site_id }`. Fetch `rotation_schedule` for site. If none exists, return `{ cycle_weeks: 2, entries: [] }`. Otherwise fetch all `rotation_entry` rows for that schedule. Return `{ id?, cycle_weeks, entries: { crew_id, shift_pattern_id, week_number }[] }`.

`saveRotation`: managerProcedure, input `{ site_id, cycle_weeks, entries: { crew_id, shift_pattern_id, week_number }[] }`. Upsert `rotation_schedule` (one per site). Delete all existing `rotation_entry` rows for that schedule. Insert new entries. All via admin client.

- [ ] **Step 4: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 5: Commit**

```bash
git add src/server/routers/org.ts
git commit -m "feat: tRPC endpoints for shifts, crews, and rotation CRUD"
```

---

### Task 3: Extend Employee Endpoints with crew_id

**Files:**
- Modify: `src/server/routers/workforce.ts`

- [ ] **Step 1: Extend `upsertEmployee`**

Add `crew_id: z.string().uuid().nullable().optional()` to the input schema. Include it in the upsert row.

- [ ] **Step 2: Extend `getEmployee`**

Add `crew_id` to the select in the employee query. Include it in the return object.

- [ ] **Step 3: Extend `listEmployees`**

Add `crew_id` to the select fields. Include it in the mapped rows.

- [ ] **Step 4: Extend `bulkImportEmployees`**

The bulk import doesn't need crew_id — employees are assigned to crews after import. No changes needed.

- [ ] **Step 5: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 6: Commit**

```bash
git add src/server/routers/workforce.ts
git commit -m "feat: extend employee endpoints with crew_id"
```

---

### Task 4: Settings Shifts Page

**Files:**
- Create: `src/app/dashboard/settings/shifts/page.tsx`
- Modify: `src/app/dashboard/settings/layout.tsx`

This is the main UI task. The page has three vertically stacked sections.

- [ ] **Step 1: Add "Shifts" tab to settings layout**

In `src/app/dashboard/settings/layout.tsx`, add to the `tabs` array:
```typescript
{ label: 'Shifts', href: '/dashboard/settings/shifts' },
```

- [ ] **Step 2: Create the shifts page**

Create `src/app/dashboard/settings/shifts/page.tsx` — a `'use client'` page with three sections.

**Data fetching:**
- `trpc.org.listShifts.useQuery({ site_id })`
- `trpc.org.listCrews.useQuery({ site_id })`
- `trpc.org.getRotation.useQuery({ site_id })`

**Section 1 — Shifts:**
- Header: "Shifts" + "+ Add Shift" button
- Cards in a responsive grid (2-3 columns). Each card:
  - Name (display font, 15px, 700 weight)
  - Time bar: a colored div on a 24-hour axis. Width = duration proportional to 24h. Left offset = start_time proportional. Use shift's `color_hex` or department color fallback.
  - Time text: "06:00 — 14:00" in mono font
  - Duration: "8.0 hrs" in mono
  - Days: 7 small circles labeled Ma Di Wo Do Vr Za Zo. Filled with primary color for active days, muted for inactive.
  - Breaks: "15min na 2.5u" in small text
  - ⋮ menu: Edit (opens same modal as create, pre-filled), Delete (hold-to-delete)
- "+ Add Shift" modal: Name input, start_time input (type="time"), end_time input (type="time"), duration auto-calculated and shown read-only, 7 day toggles, break rules list (add/remove rows: after_hours input + duration_minutes input), overnight auto-detected. Save + Cancel buttons.

**Section 2 — Crews:**
- Header: "Crews" + "+ Add Crew" button
- Cards in a row. Each card:
  - Color dot + Name
  - Member count badge
  - ⋮ menu: Edit, Delete (blocked if has members or rotation entries)
- "+ Add Crew" modal: Name input, color picker (6 presets, filtered to unused). Save + Cancel.

**Section 3 — Rotation Schedule:**
- Only visible when both shifts AND crews exist
- Header: "Rotation Schedule" + cycle length selector (number input or button group: 2, 3, 4, custom)
- Matrix/grid:
  - Top row: "Crew" header | Week 1 | Week 2 | ... | Week N
  - Each row: crew name (with color dot) | select dropdown per week cell
  - Dropdown options: all shifts for this site, by name
  - Selected cell shows shift name in a colored pill
- "Save Rotation" button below the matrix
- Loading and empty states

**Style:** Follow existing patterns — inline styles with CSS variables, Framer Motion animations (`containerStagger`, `fadeInUp`, `bouncy`, `scalePress`), Lucide icons.

- [ ] **Step 3: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/settings/shifts/page.tsx src/app/dashboard/settings/layout.tsx
git commit -m "feat: shift management page — shifts, crews, rotation matrix"
```

---

### Task 5: Employee Edit — Crew Dropdown

**Files:**
- Modify: `src/components/domain/edit-employee-form.tsx`

- [ ] **Step 1: Add crew dropdown**

Import `trpc` and fetch crews: `trpc.org.listCrews.useQuery({ site_id: employee.home_site_id })`.

Add a "Crew" field between the existing fields (after "Status" or after "Multi-Site Eligible"). Render as a `<select>` with:
- Default option: "— No crew —" (value: empty string)
- Options: each crew by name
- Selected value: `form.crew_id ?? ''`
- On change: update form state

On save: include `crew_id: form.crew_id || null` in the upsert call.

- [ ] **Step 2: Build and verify**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 3: Commit**

```bash
git add src/components/domain/edit-employee-form.tsx
git commit -m "feat: crew dropdown on employee edit form"
```

---

### Task 6: Final Verification

- [ ] **Step 1: Full build**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 2: Smoke test**

Navigate to:
- `/dashboard/settings/shifts` — page loads with 3 sections
- Add a shift → card appears with time bar
- Add a crew → card appears with color dot
- Set rotation → matrix shows, save works
- `/dashboard/employees/[id]` → edit → crew dropdown shows crews
- All other pages still work (no regressions)

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: shift patterns, crews, rotation — complete implementation"
```
