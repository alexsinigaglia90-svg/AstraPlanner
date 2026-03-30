# Planning UI Design Spec

**Date:** 2026-03-30
**Status:** Approved

---

## 1. Overview

Three pages for workforce plan management:

1. `/dashboard/planning` — Plan list (all plans for active site)
2. `/dashboard/planning/[planId]` — Plan detail (heatmap grid + KPI bar + actions)
3. Plan creation via wizard-toaster modal (no separate page)

## 2. Plan List Page (`/dashboard/planning`)

### Layout
- Header: "Planning" + "Nieuw plan" button (primary CTA)
- Filter chips: All | Draft | Optimized | Proposed | Approved | Published
- Cards per plan:
  - Plan period (e.g. "Week 14-17, Apr 2026")
  - Version number
  - Status badge (color-coded)
  - Coverage % (from summary_metrics_json)
  - Created date
  - Click → navigate to detail

### Status Colors
| Status | Color | Badge |
|--------|-------|-------|
| draft | muted/gray | Concept |
| optimized | indigo | Geoptimaliseerd |
| proposed | amber | Voorgesteld |
| approved | emerald | Goedgekeurd |
| published | green | Gepubliceerd |

### "Nieuw plan" Wizard Toaster
Centered modal (like add-employee-wizard):
- Step 1: Select week range (start week picker + number of weeks 1-8)
- Auto-preview: "Week 14 t/m 17 (31 mrt - 27 apr)"
- "Aanmaken" button → creates draft via `planning.createDraft` → navigates to detail

## 3. Plan Detail Page (`/dashboard/planning/[planId]`)

### 3.1 Top Bar
- Back button (← Planningen)
- Plan title: "Plan v3 — Week 14-17"
- Status badge (color-coded, large)
- **Context-dependent action buttons:**

| Current Status | Primary Action | Secondary Action |
|----------------|---------------|-----------------|
| draft | "Run solver" (indigo) | — |
| optimized | "Voorstel indienen" (amber) | "Opnieuw optimaliseren" |
| proposed | "Goedkeuren" (green) | "Afwijzen" (red outline) |
| approved | "Publiceren" (green) | — |
| published | — (read-only) | "Nieuw concept op basis hiervan" |

### 3.2 KPI Hero Cards (row, same style as FTE dashboard)

4 compact stat cards:

| Card | Value | Source |
|------|-------|--------|
| Coverage | 94% | metrics.coverage_percentage |
| Total Cost | EUR 12,450 | metrics.total_cost |
| Overtime | 24u | metrics.overtime_hours |
| Solve Time | 1.2s | metrics.solve_time_ms |

### 3.3 Assignment Heatmap Grid

**Structure:** Employee-centric grid.

- **Rows:** Employees (sticky left column with avatar + name)
- **Columns:** Days × Shifts (Ma-O, Ma-M, Di-O, Di-M, ... Vr-O, Vr-M)
  - Column header row 1: Day names (Ma, Di, Wo, Do, Vr)
  - Column header row 2: Shift names (Ochtend, Middag) — merged per day
- **Cells:** Process name (abbreviated) with department color background
  - Empty = niet ingepland (light gray)
  - Color = department color (same palette as rest of app)
  - Hover: tooltip with full process name + scheduled hours
  - Click (draft/optimized only): open assignment editor

### 3.4 Coverage Summary Bar

Below the grid, per-process coverage row:
- Process name | required FTE | assigned FTE | coverage % bar
- Red = under 70%, amber = 70-90%, green = 90%+
- Quick visual: "where are the gaps?"

### 3.5 Assignment Editor (modal)

When clicking a cell in draft/optimized mode:
- "Assign [Employee] to [Shift] on [Day]"
- Process dropdown (filtered by employee skills)
- "Toewijzen" button → `planning.manualAssign`
- "Verwijderen" link → `planning.removeAssignment`
- "Vergrendelen" toggle → locked assignments survive re-optimization

### 3.6 Solver Progress

When "Run solver" is clicked:
- Button shows spinner + "Optimaliseren..."
- Greedy returns in <5s → instant update
- Grid refreshes with new assignments
- KPI cards animate to new values
- Toast: "Plan geoptimaliseerd — 94% dekking"

## 4. Design Language

Follow existing AAA patterns:
- Light/white backgrounds
- Nunito headings, DM Sans body, JetBrains Mono numbers
- Framer Motion spring animations
- Glassmorphism stat cards
- Brand-tinted shadows (indigo)
- Numbers always animate (counter roll)
- Stagger entrance animations

## 5. Data Flow

```
planning.listPlanVersions → Plan List
planning.createDraft → Navigate to Detail
planning.getPlanVersion → Populate grid + KPIs
planning.runOptimizer → Refresh grid + KPIs
planning.transitionState → Update status + actions
planning.manualAssign → Update single cell
planning.removeAssignment → Clear single cell
```

## 6. File Structure

```
src/app/dashboard/planning/
  page.tsx                    # Plan list
  [planId]/
    page.tsx                  # Plan detail

src/components/domain/
  plan-card.tsx               # Plan list card
  plan-grid.tsx               # Assignment heatmap grid
  plan-kpi-bar.tsx            # KPI hero cards row
  plan-coverage-bar.tsx       # Per-process coverage summary
  create-plan-wizard.tsx      # New plan modal
  assignment-editor.tsx       # Cell click modal
```

## 7. Implementation Sequence

1. Plan list page + create wizard
2. Plan detail page skeleton (top bar + KPI placeholders)
3. KPI hero cards (reuse pattern from FTE dashboard)
4. Assignment heatmap grid
5. Coverage summary bar
6. Solver trigger + progress
7. State machine buttons
8. Assignment editor modal
9. Manual assign + lock
