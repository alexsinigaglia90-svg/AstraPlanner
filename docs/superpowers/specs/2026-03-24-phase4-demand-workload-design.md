# Phase 4 — Demand & Workload Design Spec

> **Status:** Approved
> **Date:** 2026-03-24
> **Approach:** Layered delivery (3 lagen)
> **Builds on:** Phase 3 (Process & Workforce Setup)
> **Feeds into:** Phase 5 (Solver & Planning)

---

## 1. Overview

Phase 4 delivers the demand-to-FTE pipeline: planners enter demand volumes, the system computes workload requirements, and a dashboard visualizes gaps. No solver or shift assignment — that's Phase 5.

**Three layers, each independently valuable:**

| Layer | What | User value |
|-------|------|-----------|
| 1 — Demand Ingestion | Enriched grid + Excel import | Planners can enter and manage demand |
| 2 — Workload Engine | Backend computation | Demand → hours → FTE requirements |
| 3 — FTE Dashboard | Heatmap + gap drilldown | Visual answer to "where do I have a problem?" |

---

## 2. Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Demand entry model | Via `demand_type` with auto-cascade to processes + per-process override | One entry cascades to multiple processes; override for exceptions |
| Time granularity | Per week per demand_type, multiple weeks ahead | Weekly columns match workload computation granularity |
| Grid style | Enriched: sparklines, inline hours, cascade preview | Richer than plain spreadsheet, immediate feedback |
| FTE Dashboard layout | Heatmap navigation → gap-analyse drilldown | Instant overview, click for detail |
| Support process methods | All three: fixed headcount, linked ratio, frequency-based — per process | Each support process has its own character |
| Bulk import | Excel drag & drop + copy-paste from Excel | CSV is not premium UX; Excel clipboard is instant |
| Dashboard location | Same page as demand (`/dashboard/demand`) with tab toggle | Planner stays in context, sees effect of changes immediately |

---

## 3. Layer 1 — Demand Ingestion

### 3.1 Page: `/dashboard/demand`

**Toolbar:**
- Site selector (reuse `SiteSelector` component)
- Week-range picker: start week + end week (default: current ISO week starting Monday + 6 weeks ahead = 7 weeks total)
- Toggle: 📝 Invoer | 📊 Dashboard
- Save indicator (auto-save status)

**Enriched Grid:**
- Rows: `demand_type` records for the selected site's organization
- Columns: weeks in the selected range
- Each cell: editable numeric input
  - Font: JetBrains Mono, tabular-nums
  - Below each value: computed hours in muted text (`volume × conversion_ratio / weighted_uph`)
  - Empty cells: orange dashed border with "—" placeholder

**Demand Type Row:**
- Icon (smart icon based on demand_type name)
- Demand type name
- Subtitle: "→ Picking, Packing, Shipping" (linked processes from `demand_type_process_mapping`)

**Trend Column (leftmost data column):**
- Inline sparkline SVG per demand_type (last 4-6 weeks of actual data)
- Percentage change indicator: green ▲ up, red ▼ down

**Cascade Preview:**
- On cell hover/focus: inline expandable row below the demand_type row (spring-animated height)
- Shows ALL processes from `demand_type_process_mapping` for this demand_type, ordered by `process.display_order`
- Each process chip: `volume × conversion_ratio = process_volume`
- Example: "Outbound Orders Wk 16 (6,100): Picking 6,100 × 1.0 = 6,100 | Packing 6,100 × 0.95 = 5,795 | Shipping 6,100 × 0.85 = 5,185"
- Cascade row collapses on blur (gentle spring exit)

**Per-Process Override:**
- Click a process chip in the cascade → inline number input replaces the calculated value
- Override cells get an orange accent border to indicate deviation from cascade
- Override data model: `demand_process_override` table:
  ```sql
  CREATE TABLE demand_process_override (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organization(id),
    demand_forecast_id UUID NOT NULL REFERENCES demand_forecast(id),
    process_id UUID NOT NULL REFERENCES process(id),
    override_volume DECIMAL NOT NULL CHECK (override_volume >= 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (demand_forecast_id, process_id)
  );
  ```
- When override exists: workload engine uses `override_volume` instead of `demand_volume × conversion_ratio`
- Clearing an override (set to empty) removes the row and reverts to cascade calculation

### 3.2 Data Entry Methods

**Manual:** Click cell → type number → Tab to next cell. Auto-save with 500ms debounce after last keystroke.

**Copy-Paste from Excel:**
1. User selects cells in Excel, copies (Ctrl+C)
2. User clicks target cell in demand grid, pastes (Ctrl+V)
3. System parses clipboard as TSV
4. Preview overlay: green cells = new data, orange cells = changed data
5. User confirms → bulk upsert

**Excel Drag & Drop:**
1. User drags .xlsx file onto the grid area
2. System parses file (reuse SheetJS/xlsx library from existing dataloader)
3. Column mapping wizard (reuse pattern from `csv-import-wizard.tsx`):
   - Auto-match columns to demand_types (fuzzy matching)
   - Auto-detect week columns (Week 14, Wk14, 2026-W14 formats)
4. Preview with validation
5. Confirm → bulk upsert

### 3.3 tRPC Endpoints

| Endpoint | Status | Description |
|----------|--------|-------------|
| `demand.listDemandTypes()` | Existing | List demand types with process mappings |
| `demand.upsertDemandType()` | Existing | Create/update demand types |
| `demand.listForecasts()` | Existing | Query forecasts with filters |
| `demand.upsertForecast()` | Existing | Single forecast upsert |
| `demand.bulkUpsert()` | **New** | Batch upsert for copy-paste/import (array of forecasts, transactional — all or nothing) |
| `demand.upsertOverride()` | **New** | Create/update/delete per-process volume override |
| `demand.deleteForecasts()` | Existing | Batch delete |

### 3.4 Data Model

Uses existing `demand_forecast` table. `source` field values:
- `manual_entry` — typed in grid
- `csv_upload` — from Excel drag & drop import AND copy-paste from Excel (reusing enum value for all bulk import sources)

Note: database enum also includes `wms_import`, `oms_import`, `ai_forecast` — reserved for future integration phases.

---

## 4. Layer 2 — Workload Engine

### 4.1 Core Computation: `workload.compute()`

**Input:** `site_id`, `plan_version_id` (or "draft"), period range (week_start, week_end)

**Productive Process Formula:**

```
For each demand_forecast in period:
  1. Fetch demand_type_process_mapping → per process: conversion_ratio
  2. process_volume = demand_volume × conversion_ratio
  3. If override exists for this process/period → use override volume
  4. Fetch process_productivity_standard for process/site
  5. weighted_uph = weighted average UPH based on available skill mix:
     - Fetch active employees with skill for this process
     - Per employee: uph = base_uph × proficiency_multiplier
       (1=0.6x, 2=0.8x, 3=1.0x, 4=1.15x, 5=1.3x)
     - weighted_uph = Σ(employee_uph) / count(employees)
  6. hours_needed = process_volume / weighted_uph
  7. fte_needed = hours_needed / effective_hours_per_week
     - effective_hours = shift_duration × days_in_week × productive_pct (from job_role)
```

### 4.2 Support Process Methods

Configurable per support process via `support_method` + `support_config_json` on the `process` table.

**Fixed Headcount:**
```
fte_needed = support_config_json.fixed_count
hours_needed = fte_needed × effective_hours_per_week
```

**Linked Ratio:**
```
linked_productive_fte = Σ(fte_needed) for processes in support_config_json.linked_process_ids
fte_needed = linked_productive_fte / support_config_json.ratio
```
Example: 1 teamleader per 15 productive FTE → ratio = 15

**Frequency-Based:**
```
hours_needed = support_config_json.duration_hours × support_config_json.frequency_per_week
fte_needed = hours_needed / effective_hours_per_week
```
Example: QC inspection 3h/day × 5 days = 15h/week

### 4.3 Availability Computation

```
Per employee per week:
  1. employee.crew_id → rotation_schedule → rotation_entry for that week → shift_pattern
  2. available_hours = shift_pattern.duration_hours × applicable_days - break_time
  3. Subtract: employee_availability_override (leave, training, sick)
     - Full-day overrides: subtract entire shift
     - Partial overrides: subtract overlap hours
  4. net_available = available_hours × productive_pct (from job_role)
```

**Week resolution from rotation:**
```
rotation_week = ((target_date - rotation_start_date) / 7) % cycle_weeks
→ Look up rotation_entry WHERE week_number = rotation_week AND crew_id = employee.crew_id
→ Returns shift_pattern_id for that employee on that date
```

### 4.4 Output

Writes to `workload_plan` table (one row per process × period × plan_version):

| Field | Source |
|-------|--------|
| `demand_volume` | From demand_forecast |
| `conversion_ratio` | From demand_type_process_mapping |
| `process_volume` | demand_volume × conversion_ratio (or override) |
| `weighted_uph` | Computed from skill mix |
| `hours_needed` | process_volume / weighted_uph |
| `fte_needed` | hours_needed / effective_hours_per_week |
| `hours_assigned` | 0 (populated in Phase 5 by solver) |
| `fte_assigned` | 0 |
| `coverage_pct` | 0 (populated when assignments exist) |
| `status` | `computed` |

### 4.5 tRPC Endpoints

| Endpoint | Status | Description |
|----------|--------|-------------|
| `workload.compute()` | **Implement** (currently stub) | Trigger computation, return workload_plan records |
| `workload.getForPlan()` | **Implement** (currently stub) | Fetch computed workload for site/period |

### 4.6 Database Migration

New fields on `process` table:

```sql
ALTER TABLE process ADD COLUMN support_method TEXT
  CHECK (support_method IN ('fixed_headcount', 'linked_ratio', 'frequency_based'));
ALTER TABLE process ADD COLUMN support_config_json JSONB DEFAULT '{}';
```

Support config in Process Wizard: extra step for supportive processes to configure method + parameters.

---

## 5. Layer 3 — FTE Dashboard

### 5.1 Location

Same page: `/dashboard/demand` with tab toggle (📝 Invoer | 📊 Dashboard).

### 5.2 KPI Hero Row

Four cards with animated counters, gradient top borders, bounce-hover, staggered entrance (70ms delay):

| Card | Value | Source |
|------|-------|--------|
| Totale Demand | Σ demand_volume over period | `demand_forecast` |
| Beschikbare FTE | Σ net available FTE | Availability computation |
| FTE Tekort | Max shortage in any week | `workload_plan` where fte_needed > fte_available |
| Uren Nodig | Σ hours_needed / Σ hours_available | `workload_plan` |

### 5.3 Heatmap Grid

- Rows: all processes (productive + support) for the site
- Columns: weeks in selected range
- Cell: coverage percentage with semantic color:
  - `--coverage-over` blue (>110%): overstaffed
  - `--coverage-met` green (90-110%): covered
  - `--coverage-under` amber (70-89%): tight
  - `--coverage-gap` red (<70%): shortage — subtle pulse animation
  - `--coverage-empty` gray dashed: no data
- Subtext per cell: `available / needed` in FTE (JetBrains Mono)
- Hover: scale 1.08 + indigo-tinted shadow + tooltip with breakdown
- Click: opens drilldown panel below

**Animation:**
- Cells pop in with staggered cascade (30ms per cell, row by row)
- Row labels fade in with bouncy spring
- Color transitions animate on workload recompute

### 5.4 Drilldown Panel

Opens below heatmap when a cell is clicked. Spring-animated height + fade.

**Header:** Process icon + name + week number + shortage badge (red, JetBrains Mono)

**FTE Bars:**
- "Nodig" bar: full width, indigo→secondary gradient
- "Beschikbaar" bar: proportional width, success gradient
- Gap zone: diagonal stripe pattern, dashed border, red text with shortage amount
- Bars animate from 0% to target width (1.2s ease-out, 0.7s delay)

**Detail Cards (3x grid):**

| Card | Value | Subtitle |
|------|-------|----------|
| Demand Volume | process_volume | demand_type name |
| Uren Nodig | hours_needed | "@ X uph gewogen norm" |
| Tekort | hours_shortage | "≈ X FTE × Y h/week" |

Cards stagger in (100ms delay, scale 0.97→1.0 spring).

**Insight Banner:**
- Amber gradient background, rounded, hover-lift
- Text: "X medewerkers met [process] skill beschikbaar in andere processen — Y op proficiency 4+"
- Source: `employee_skill` WHERE process_id = current AND employee is assigned elsewhere
- "Bekijk suggesties →" link (disabled in Phase 4, active in Phase 5 with solver)

### 5.5 Realtime Updates

When demand changes (user switches to Invoer tab, edits, switches back):
1. Workload recomputes automatically — 1s global debounce (all cells share one timer). If user switches to Dashboard tab before debounce completes, force immediate compute.
2. During computation: "Herberekenen..." toast with spinner (dismiss on complete)
3. KPI counters animate to new values (roll-up/down)
4. Changed heatmap cells flash briefly (scale 1.05 → 1.0, wobbly spring) before settling to new color
5. Drilldown panel updates if still open

**Performance:** For large sites (200+ employees, 8+ processes, 6-week horizon), workload computation may take 200-500ms. The debounce + toast pattern keeps the UI responsive. Future optimization: cache previous results and only recompute affected processes when a single demand_type changes.

---

## 6. UI Components

### New Components

| Component | Location | Description |
|-----------|----------|-------------|
| `DemandGrid` | `src/components/domain/demand-grid.tsx` | Enriched editable grid with sparklines, cascade, paste support |
| `DemandGridCell` | `src/components/domain/demand-grid-cell.tsx` | Single editable cell with auto-save |
| `CascadePreview` | `src/components/domain/cascade-preview.tsx` | Expandable process breakdown with override |
| `FteDashboard` | `src/components/domain/fte-dashboard.tsx` | Heatmap + KPI row + drilldown container |
| `CoverageHeatmap` | `src/components/domain/coverage-heatmap.tsx` | Process × week grid with semantic colors |
| `GapDrilldown` | `src/components/domain/gap-drilldown.tsx` | FTE bars + detail cards + insight banner |
| `KpiHeroCard` | `src/components/domain/kpi-hero-card.tsx` | Animated counter card with gradient accent |
| `WeekRangePicker` | `src/components/domain/week-range-picker.tsx` | Start/end week selector |
| `ExcelDropZone` | `src/components/domain/excel-drop-zone.tsx` | Drag & drop .xlsx with parse + preview |
| `PasteHandler` | `src/components/domain/paste-handler.tsx` | Clipboard TSV parse + preview overlay |

### Reused Components

- `SiteSelector` — existing site picker
- `GlassSelect` / `GlassDropdown` — existing glass UI
- `SmartIcon` — existing icon mapper
- `AnimatedCounter` — existing number animation
- `SlideOver` — for column mapping wizard
- Toast notifications — existing

### Design System Compliance

All components follow the AstraPlanner design system:
- Spring physics via Framer Motion (`bouncy`, `snappy`, `gentle`, `wobbly`)
- Inline styles with CSS variables (no Tailwind classes)
- JetBrains Mono for all numbers
- Nunito for headings, DM Sans for body
- Minimum 8px border-radius
- Indigo-tinted shadows
- Staggered entrance animations

---

## 7. Process Wizard Extension

The existing Process Wizard gets an additional step for **supportive** processes:

**Step: Support Configuration** (only shown when process type = "supportive")
- Radio group: Fixed Headcount | Linked Ratio | Frequency-Based
- Per selection:
  - Fixed: number input for `fixed_count`
  - Linked: multi-select for linked productive processes + number input for ratio
  - Frequency: number inputs for `duration_hours` + `frequency_per_week`

This writes to `process.support_method` and `process.support_config_json`.

---

## 8. What's NOT in Phase 4

- Solver / HiGHS optimization (Phase 5)
- Shift assignments (Phase 5)
- Plan versioning & state machine (Phase 5)
- Scenario / what-if modeling (Phase 5+)
- AI forecast generation (future)
- WMS/OMS real-time integration (future)
- The "Bekijk suggesties" link in insight banner (Phase 5)

---

## 9. Dependencies

**Existing (ready):**
- `demand_type`, `demand_forecast`, `demand_type_process_mapping` tables
- `workload_plan` table schema
- `process_productivity_standard` table
- `crew`, `rotation_schedule`, `rotation_entry` tables
- `employee_skill`, `employee_availability_override` tables
- `demand.ts` router (40% complete)
- Solver types contract (`src/types/solver.ts`)
- Design system + glass UI components

**New (to build):**
- `demand_process_override` table migration
- `process.support_method` + `process.support_config_json` migration
- `demand.bulkUpsert()` endpoint
- `demand.upsertOverride()` endpoint
- `workload.compute()` implementation
- `workload.getForPlan()` implementation
- All UI components listed in Section 6

---

## 10. Validation Rules

| Field | Constraint | Error message |
|-------|-----------|---------------|
| `demand_volume` | Integer, 0 ≤ x ≤ 999,999 | "Volume moet tussen 0 en 999.999 liggen" |
| `override_volume` | Integer, 0 ≤ x ≤ 999,999 | "Override volume moet tussen 0 en 999.999 liggen" |
| `conversion_ratio` | Decimal, 0 < x ≤ 100 | "Conversieratio moet groter dan 0 zijn" |
| `weighted_uph` | Must be > 0 after computation | Show warning: "Geen medewerkers met skill voor [process] — kan uren niet berekenen" |
| `fixed_count` | Integer, 1 ≤ x ≤ 100 | "Vul een geldig aantal in (1-100)" |
| `ratio` (linked) | Decimal, 1 ≤ x ≤ 100 | "Vul een geldige ratio in (bv. 15 = 1 per 15 FTE)" |
| `duration_hours` | Decimal, 0.5 ≤ x ≤ 24 | "Duur moet tussen 0.5 en 24 uur liggen" |
| `frequency_per_week` | Decimal, 1 ≤ x ≤ 35 | "Frequentie moet tussen 1 en 35 per week liggen" |

Division by zero guard: if `weighted_uph` = 0 (no employees with skill), set `hours_needed = null` and flag the process in the heatmap as "⚠ Geen norm" (gray with warning icon).

---

## 11. Error Handling

| Scenario | Behavior |
|----------|----------|
| `bulkUpsert` partial failure | Transactional — all or nothing. Show error toast with row count that failed. |
| `workload.compute()` timeout (>5s) | Cancel, show toast: "Berekening duurt te lang — probeer een kortere periode". Log to audit. |
| Missing `process_productivity_standard` for a process | Skip process in workload computation. Show in heatmap as "⚠ Geen norm" with tooltip explaining missing standard. |
| Missing `rotation_schedule` for site | Fall back to `employee.weekly_hours_contracted` as available hours. Show warning badge on dashboard. |
| Excel parse failure | Toast with specific error: "Kolom X niet herkend" or "Rij Y bevat geen getal". No data imported. |
| Copy-paste format mismatch | Toast: "Plakformaat niet herkend — verwacht getallen gescheiden door tabs". No data pasted. |
| Network error during save | Retry 1x after 2s. If still fails: toast with "Opslaan mislukt — wijzigingen lokaal bewaard" + local state preservation. |

---

## 12. Constants & Multipliers

**Proficiency multipliers** (from `src/types/solver.ts`, authoritative):

| Level | Name | Multiplier |
|-------|------|-----------|
| 1 | Novice | 0.6× |
| 2 | Basic | 0.8× |
| 3 | Competent | 1.0× |
| 4 | Proficient | 1.15× |
| 5 | Expert | 1.3× |

These are defined in `src/types/solver.ts` as `PROFICIENCY_MULTIPLIERS` and reused by the workload engine. Not stored in database — they are universal constants.

**Weighted UPH computation** uses only employees who are:
- Status = 'active'
- Have `employee_skill` for the process with `status = 'active'`
- Have availability > 0 for the period (not on full-week leave)

This ensures the weighted average reflects actual capacity, not theoretical headcount.

**Workload plan status lifecycle:**
- `computed` — Phase 4: after workload.compute() runs
- `optimized` — Phase 5: after solver assigns employees
- `approved` — Phase 5: manager approves plan
- `locked` — Phase 5: plan is finalized and immutable
