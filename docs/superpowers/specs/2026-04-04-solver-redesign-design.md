# Solver Redesign — FTE Engine + Wizard + Modes

**Date:** 2026-04-04
**Status:** Approved
**Goal:** Replace the broken FTE calculation with a correct demand-to-FTE engine, add a solver wizard for mode/scope selection, and implement department-scoped solving with training support.

---

## 1. Solver Wizard UI

A multi-step modal that opens when the user clicks "Solver starten" on a plan in draft status. Replaces the current direct `runOptimizer` mutation call.

### Step 1 — Department Selection

- Multi-select checkboxes showing all departments on the active site
- Each row: department name + color dot + employee count + process count
- Default: all departments checked
- At least one department must be selected to proceed
- "Selecteer alles" / "Deselecteer alles" toggle

### Step 2 — Process Selection

- Grouped by selected department
- Per process row: checkbox + process name + today's demand volume + max capacity (stations) + available FTE count
- Default: all processes checked
- Greyed-out processes that have no demand (but still selectable for training)
- At least one process must be selected per department

### Step 3 — Solver Mode

Three radio options:

**Performance**
- Description: "Maximaliseer output — de beste medewerkers op de juiste plekken. Minste FTE nodig, hogere kosten."
- Solver behavior: sort candidates by proficiency descending (level 5 first), maximize output per station
- FTE calculation uses top-N candidate pool average proficiency

**Balanced** (default)
- Description: "Goede output tegen redelijke kosten. Weegt proficiency, kosten en eerlijke uurverdeling."
- Solver behavior: multi-factor scoring (proficiency × cost efficiency × workload balance)
- FTE calculation uses full pool average proficiency

**Training**
- Description: "Plan trainees in waar ruimte is. Stel per proces in hoeveel trainees je wilt opleiden."
- Extends Balanced mode
- Shows per-process training slot configurator (only for processes where demand < max_capacity):
  - Process name + slider or number input (0 to available_capacity)
  - Shows warning per process where no training room: "Demand te hoog — geen trainingsruimte"
- Trainees = employees with proficiency level 1-2 for that process
- Trainees count as extra FTE on top of baseline demand (at 0.6-0.75x effective output)

### Step 4 — Summary + Start

- Read-only summary of all selections:
  - Departments (N selected)
  - Processes per department (N selected)
  - Mode + training slots if applicable
  - Planning period (from plan_version)
- "Start solver" button (primary, gradient)
- "Annuleren" button (secondary)

### Wizard Styling

- Glass-morphism modal (matches existing wizard pattern in the app)
- Step indicator at top (1-2-3-4 dots)
- Smooth transitions between steps (framer-motion)
- Back/Next navigation buttons

---

## 2. FTE Calculation Engine

### 2.1 Core Formula

```
Input:
  day_volume     = demand_forecast.volume for process on date
  uph            = process_productivity_standard.units_per_hour
  operating_hours = site.operating_hours[dayOfWeek].close - open (in hours)
  paid_hours     = shift_pattern.paid_hours (net paid hours after breaks)
  absenteeism    = site.settings_json.absenteeism_rate (e.g. 0.05)
  max_capacity   = process.max_capacity (max concurrent stations/FTE, nullable)

Step 1 — Station-hours needed:
  station_hours = day_volume / uph

Step 2 — Baseline FTE (continuous across operating window):
  baseline_fte = station_hours / operating_hours

Step 3 — Absenteeism buffer:
  gross_fte = baseline_fte / (1 - absenteeism)

Step 4 — Capacity cap:
  capped_fte = min(gross_fte, max_capacity ?? Infinity)
  if gross_fte > max_capacity:
    warning: "Capaciteit onvoldoende: {gross_fte} FTE nodig, max {max_capacity} stations"

Step 5 — Training slots (Training mode only):
  available_capacity = max_capacity - capped_fte
  actual_trainees = min(requested_trainees, max(0, floor(available_capacity)))
  if actual_trainees < requested_trainees:
    warning: "Trainingsruimte beperkt: {actual_trainees} van {requested_trainees} trainees"
  total_fte = capped_fte + actual_trainees
```

### 2.2 Proficiency-Weighted Demand

The FTE number above assumes baseline productivity (level 4 = 1.0x multiplier). Adjust based on solver mode:

**Performance mode:**
- Pool = employees with proficiency >= 3 for this process
- avg_multiplier = average of top-N candidates' productivity_multiplier
- adjusted_fte = baseline_fte / avg_multiplier
- (If pool has mostly level 5 (1.1x), you need fewer people)

**Balanced mode:**
- Pool = all eligible employees for this process (proficiency >= min_level)
- avg_multiplier = average of pool's productivity_multiplier
- adjusted_fte = baseline_fte / avg_multiplier

**Training mode:**
- Same as Balanced for baseline
- Trainees have their own multiplier (0.6-0.75x) — their effective contribution is reduced
- total_effective_fte = adjusted_baseline_fte + (trainees × trainee_avg_multiplier)

### 2.3 Per-Shift Distribution

Once total FTE for the day is known, distribute across shifts that cover the operating window:

```
For each shift covering this day:
  shift_coverage_hours = overlap(shift.start_time..end_time, site.open..close)
  shift_fraction = shift_coverage_hours / operating_hours
  shift_fte = total_fte × shift_fraction

  // Convert to headcount (people on this shift):
  shift_headcount = ceil(shift_fte)
```

Example: site open 06:00-20:00 (14h), two shifts:
- Shift A: 06:00-15:00 (9h overlap) → 9/14 = 64% → 9 × 0.64 = 5.8 → 6 people
- Shift B: 11:00-20:00 (9h overlap) → 9/14 = 64% → 9 × 0.64 = 5.8 → 6 people
- Note: overlap between shifts (11:00-15:00) means some hours are double-covered, which is fine — the solver assigns individuals to specific shifts.

---

## 3. Solver Scoping & Execution

### 3.1 Department-First Planning

The solver runs **per department, sequentially**:

```
For each selected department (sorted by total demand descending):
  1. Collect employees whose home_department == this department
  2. Collect selected processes for this department
  3. For each process (sorted by demand descending):
     a. Calculate required FTE (Section 2)
     b. Find eligible employees (skill >= min_level, available, not yet assigned)
     c. Score and rank candidates (Section 3.2)
     d. Assign top-N until demand filled or max_capacity reached
     e. If Training mode: assign trainees to remaining capacity
     f. Track unmet demand
  4. Record department results

Cross-department fill pass:
  For each department with unmet demand:
    Find cross-department employees (home_dept != this dept, but have skills)
    Score and assign to fill gaps
    Only if employee not already assigned on that timeslot
```

### 3.2 Candidate Scoring (per mode)

**Performance mode:**
```
score = proficiency_multiplier × 1.0
```
Pure skill. Best person for the job.

**Balanced mode:**
```
score = proficiency_multiplier × 0.4
      + cost_efficiency × 0.3        // (1 - normalized_hourly_rate)
      + workload_balance × 0.3       // (1 - current_hours / contracted_hours)
```

**Training mode:**
Same as Balanced for non-trainees. Trainees are assigned separately after regular FTE is filled:
```
trainee_score = inverse_proficiency × 0.5   // Level 1 preferred over level 2 (needs training most)
             + availability × 0.3            // Most available hours
             + skill_adjacency × 0.2         // Has related skills (learns faster)
```

### 3.3 Constraint Enforcement

Hard constraints checked during candidate filtering (same as current, plus new):

| Constraint | Source | Check |
|------------|--------|-------|
| Skill eligibility | employee_skill | proficiency >= process.min_skill_level |
| Availability | rotation + overrides | Employee available for shift window |
| Max weekly hours | employee.weekly_hours_contracted | cumulative hours <= contracted |
| Not already assigned | solver state | no overlapping timeslot |
| Max consecutive days | labor_rule | <= 6 days (NL default) |
| Min rest between shifts | labor_rule | >= 11 hours (NL default) |
| **Max process capacity** | **process.max_capacity** | **assigned <= max_capacity per timeslot** |
| **Certification valid** | employee_skill.expiry_date | **not expired** |

---

## 4. Data Changes

### 4.1 New Field: process.max_capacity

Add `max_capacity` (integer, nullable) to the `process` table:
- Represents maximum concurrent stations/workstations/FTE for this process
- Nullable = no limit
- Shown in process setup and solver wizard step 2
- Enforced as hard constraint in solver

### 4.2 Existing Data Now Used by Solver

| Field | Table | Currently Used | Now Used For |
|-------|-------|----------------|--------------|
| `operating_hours` | site.settings_json | Not by solver | Operating window per day |
| `absenteeism_rate` | site.settings_json | Not by solver | Gross FTE buffer |
| `paid_hours` | shift_pattern | Not by solver | Net productive hours per shift |
| `break_rules_json` | shift_pattern | Not by solver | Available for display/validation |
| `units_per_hour` | process_productivity_standard | Fallback only | Core UPH in FTE formula |

### 4.3 Solver Input Extension

Add to `runOptimizer` input schema:

```typescript
{
  plan_version_id: string,
  departments: string[],           // selected department IDs
  processes: string[],             // selected process IDs
  solver_mode: 'performance' | 'balanced' | 'training',
  training_slots?: Record<string, number>,  // process_id → trainee count
}
```

### 4.4 Solver Output Extension

Add to solver response:

```typescript
{
  // ...existing metrics...
  per_process: Array<{
    process_id: string,
    process_name: string,
    day_volume: number,
    uph: number,
    operating_hours: number,
    baseline_fte: number,
    gross_fte: number,
    capped_fte: number,
    assigned_fte: number,
    training_fte: number,
    coverage_pct: number,
  }>,
  warnings: string[],
  solver_config: {
    mode: string,
    departments: string[],
    processes: string[],
    training_slots: Record<string, number>,
  },
}
```

---

## 5. tRPC Changes

### 5.1 runOptimizer Mutation

Update input schema to accept wizard parameters. The mutation now:

1. Fetches site settings (operating_hours, absenteeism_rate)
2. Fetches shift patterns with paid_hours
3. Fetches process max_capacity and UPH
4. Runs the new FTE engine per process per day
5. Runs the solver per department with mode-specific scoring
6. Cross-department fill pass
7. Returns extended output with per-process metrics and warnings

### 5.2 New Query: getSolverContext

A new query that the wizard calls to populate steps 1-3:

```typescript
getSolverContext: {
  input: { plan_version_id: string }
  output: {
    departments: Array<{ id, name, color, employee_count, process_count }>
    processes: Array<{ id, name, department_id, day_volumes: number[], max_capacity, uph, available_fte }>
    site_settings: { operating_hours, absenteeism_rate }
    shifts: Array<{ id, name, start_time, end_time, paid_hours }>
  }
}
```

---

## 6. Component Changes

### New Components

| Component | Path | Purpose |
|-----------|------|---------|
| SolverWizard | `src/components/domain/solver-wizard.tsx` | 4-step modal wizard |
| SolverWizardStep1 | inline in wizard | Department multi-select |
| SolverWizardStep2 | inline in wizard | Process selection per dept |
| SolverWizardStep3 | inline in wizard | Mode selection + training config |
| SolverWizardStep4 | inline in wizard | Summary + start button |

### Modified Components

| Component | Change |
|-----------|--------|
| `[planId]/page.tsx` | Replace direct `runOptimizer.mutate()` with wizard open |
| `plan-grid.tsx` subtotals | Use new per-process metrics from solver output |

### New Module

| Module | Path | Purpose |
|--------|------|---------|
| FTE Engine | `src/lib/solver/fte-engine.ts` | Core FTE calculation (pure function) |

---

## 7. Not in Scope

- Skill decay model
- Skill adjacency matrix for training recommendations
- Split shift assignments
- Hybrid solver pipeline (CP-SAT, local search)
- Learning curve adjustment
- Shift-timing factors (night 1.12x, overtime 1.08x)
- GA/simulated annealing meta-heuristics
- Solver strategy auto-selection based on problem size
