# Plan Grid Redesign — Solver Feedback & Validation

**Date:** 2026-04-04
**Status:** Approved
**Goal:** Redesign the plan grid so planners and employees can clearly see who works where, when, in which shift, with what skill level — and validate solver output at a glance.

---

## 1. Grid Structure

### Column Layout
- **1 column per day** (no shift sub-columns). Header shows: `Ma 7 apr`, `Di 8 apr`, etc.
- Fixed column width: **155px** via `table-layout: fixed`
- Medewerker-kolom: **185px** fixed

### Row Grouping
- Rows grouped by **department** (afdeling)
- Department header row: name + left color-border (3px, department color)
- Within each department, employees listed alphabetically

### Employee Row (left column)
- Avatar (32px, gradient based on initials)
- Name: **#1e293b**, 13px, font-weight 700 — clearly readable on white
- Crew/ploeg badge: small pill below name (e.g. "Ploeg A" in amber, "Ploeg B" in purple)

---

## 2. Cell Design

### Assignment Cell (48px fixed height)
```
┌────────────────────────────────────────┐
│ Order Picking ④    Ochtend             │
│ 06:00 – 14:00 · 8u                    │
└────────────────────────────────────────┘
```

**Line 1:**
- Process name: 11px, department color, font-weight 700, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`
- Skill badge: 16px circle, 9px font. Colors:
  - Level 3-5: green (`#059669` on `rgba(16,185,129,0.1)`)
  - Level 2: amber (`#b45309` on `rgba(245,158,11,0.1)`)
  - Level 1: red (`#dc2626` on `rgba(239,68,68,0.08)`) + red cell border
- Shift badge: 8px, pill, right-aligned. Colors per shift type:
  - Ochtend: amber background
  - Middag: indigo background
  - Nacht: dark/slate background

**Line 2:**
- Times + hours: 10px, `#94a3b8` (muted)
- Format: `HH:MM – HH:MM · Xu`

### Cell Background
- Subtle department-color tint (`rgba(color, 0.04-0.05)`)
- Border-radius: 8px

### Warning State (skill < min_skill_level)
- Cell gets `border: 1px solid rgba(239,68,68,0.2)`
- Process name color changes to `#dc2626`

### Empty Cell
- Shows "—" in `#cbd5e1`
- On hover (if editable): show `+` icon

---

## 3. Subtotal Rows

### Per Department
After the last employee in each department, render a subtotal row:

```
┌──────────────────────────────────────────────────────────┐
│ Warehouse totaal    5/6 FTE  83%   4/5 FTE  80%   ...   │
└──────────────────────────────────────────────────────────┘
```

- Per day column: `assigned FTE / required FTE` + coverage percentage
- Color coding: green (≥90%), amber (70-89%), red (<70%)
- Background: slightly darker department tint
- Font: 10px, font-weight 700

### Per Process (within department)
Below the department subtotal, one row per process that has demand:

```
┌──────────────────────────────────────────────────────────┐
│   Order Picking     3/4       2/3       3/3       ...    │
│   Packing           2/2       1/2       2/2       ...    │
└──────────────────────────────────────────────────────────┘
```

- Indented (16px left padding)
- Per day: `assigned / required` count
- Same color coding as department totals
- Font: 10px, color muted, process name in department color

---

## 4. Detail Popover (on cell click)

Small floating popup anchored to the clicked cell:

**Contents:**
- Process name (full, no truncation)
- Skill level: badge + text (e.g. "Level 4 — Gevorderd")
- Productivity multiplier (e.g. "1.15x")
- Shift: full name + times
- Scheduled hours
- Cost estimate (€)
- Assignment source: "Solver" or "Handmatig"

**Actions (if editable):**
- "Wijzig" button → opens AssignmentEditor modal (existing)
- "Verwijder" button → removes assignment with confirmation

**Behavior:**
- Click outside or press Escape to close
- Only one popover open at a time
- Position: prefer right of cell, fall back to left if near edge

---

## 5. Data Requirements

### Solver Output Changes
The solver output must include the employee's proficiency level for the assigned process. Currently `Assignment` has:
```typescript
employee_id, process_id, time_slot_id, shift_pattern_id,
scheduled_hours, cost_estimate, assignment_source
```

**Add:** `proficiency_level: number` to the Assignment type, populated during solve by looking up the employee's skill for the assigned process.

### Grid Data Needs
The plan detail page must provide:
1. **Shift definitions** with `start_time` and `end_time` (already fetched via `shiftsQ`)
2. **Employee crew/ploeg** info (needs to be added to employee query or joined)
3. **Department** info per employee (already available via `department_id`)
4. **Demand per process per day** for subtotal rows (from `workload_plan` or `demand_forecast`)

### Coverage Bar Fix
Currently `PlanCoverageBar` receives `demandByProcess={null}`. Must be wired to actual demand data from the solver or workload computation.

---

## 6. Component Changes

### `plan-grid.tsx` — Full Rewrite
- Remove shift sub-columns, switch to day-columns
- Add department grouping with header rows
- New cell design with process name, skill badge, shift badge, times
- Add subtotal rows per department and per process
- Fixed table layout

### New: `assignment-popover.tsx`
- Floating popover component
- Shows assignment detail + actions
- Uses Radix `Popover` or custom positioned div

### `[planId]/page.tsx` — Data Wiring
- Pass shift definitions (with times) to grid
- Pass employee crew info
- Compute and pass demand-per-process-per-day for subtotals
- Wire `demandByProcess` to coverage bar

### `types/solver.ts` — Add proficiency_level
- Add `proficiency_level` to `Assignment` interface
- Populate in both `solveGreedy` and `solveHiGHS`

---

## 7. Out of Scope
- Employee self-service view (Phase 2)
- Drag-and-drop reassignment
- Multi-week view
- Print/export functionality
