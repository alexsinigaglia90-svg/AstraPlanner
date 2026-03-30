# AstraPlanner Solver — Phase 5 Design Spec

**Date:** 2026-03-30
**Status:** Approved
**Scope:** SolverInput assembly, Greedy + HiGHS MIP algorithms, Planning router, Scenario router

---

## 1. Overview

The solver takes demand (FTE needed per process per time slot) and available workforce (employees with skills, shifts, constraints) and produces an optimal assignment plan. Two strategies run on Vercel Pro (300s timeout):

- **Greedy** — fast (<5s), ~80-90% optimal, used for drafts and quick feedback
- **HiGHS MIP** — mathematically optimal, async with status polling, for final plans

## 2. Architecture

```
User creates plan (week 14-17)
  → planning.createDraft()
  → planning.runOptimizer({ strategy: 'greedy' | 'highs_mip' })
    → assembleSolverInput(site_id, week)
    → solvGreedy(input) OR solveHiGHS(input)
    → validateOutput(output)
    → write shift_assignment_staging
    → update plan_version.status = 'optimized'
  → User reviews → approve → publish
```

### 2.1 Execution Model

- **Greedy:** Synchronous, returns in <5s. Direct response.
- **HiGHS MIP:** Async. Writes progress to plan_version.optimizer_status_json. Client polls via getOptimizerStatus().

Both run on Vercel API Routes (server-side Node.js). HiGHS via `highs-solver` WASM npm package.

### 2.2 File Structure

```
src/lib/solver/
  ├── assemble-input.ts      # SolverInput assembly from DB
  ├── greedy.ts               # Greedy algorithm
  ├── highs.ts                # HiGHS MIP wrapper
  ├── validate-output.ts      # Output validation + infeasibility detection
  ├── constraints.ts          # Constraint evaluation helpers
  ├── cost.ts                 # Cost calculation (hourly_rate × hours + overtime premium)
  └── nl-defaults.ts          # Default labor rules (NL law)

src/server/routers/
  ├── planning.ts             # Plan CRUD + solver trigger + state machine
  └── scenario.ts             # What-if scenarios
```

## 3. Planning Horizon

- **Granularity:** Week (configurable start day — default Monday, parametrizable per site)
- **Work days:** Configurable per site (e.g., Mon-Fri, Mon-Sat, or all 7 days)
- **Horizon:** User chooses 1-8 weeks
- **Solver runs per-week** but with cross-week context:
  - current_week_hours carried forward from previous week's assignments
  - consecutive_days_worked tracked across week boundaries
- **Plan version** spans the full horizon; assignments are per-day within each week
- **Site-level config** stored in `site.planning_config_json`:
  ```json
  { "week_start_day": 1, "work_days": [1,2,3,4,5,6], "planning_horizon_weeks": 4 }
  ```
  (1=Monday, 7=Sunday. Default: Mon-Sat, 4 weeks ahead)

## 4. SolverInput Assembly (assemble-input.ts)

Reads from existing DB tables. No new tables needed.

### 4.1 Time Slots

From the planning week, generate day-level slots:

```typescript
// For each day in the week:
// For each shift_pattern active at the site:
TimeSlot {
  id: `${date}_${shift_pattern_id}`,
  date: '2026-04-01',
  shift_pattern_id: uuid,
  start_time: '06:00',
  end_time: '14:30',
  duration_minutes: 480,
}
```

### 4.2 Demand (ProcessDemand)

From `workload_plan` (already computed by workload.compute):

```typescript
ProcessDemand {
  process_id: uuid,
  time_slot_id: string,           // links to TimeSlot
  required_fte: number,           // from workload_plan.fte_needed / 5 (daily)
  min_skill_level: 3,             // default, can be overridden per process
  required_certifications: [],     // from process settings
}
```

### 4.3 Employees (EmployeeRecord)

Assembled from:
- `employee` — contract_type, weekly_hours_contracted, hourly_rate (with job_role fallback)
- `employee_skill` — proficiency per process
- `crew` → `rotation_entry` → `shift_pattern` — which shift they work each day of the week
- `employee_availability_override` — subtract absence/leave periods
- `shift_assignment` (previous weeks) — current_week_hours, consecutive_days_worked

**Availability Resolution:**

```
1. Get employee's crew_id
2. Get rotation_schedule for site
3. Resolve target_week to week_number: ((target_week - rotation_start_week) % cycle_weeks) + 1
4. Get rotation_entry for (crew_id, week_number) → shift_pattern_id
5. Get shift_pattern → start_time, end_time, duration
6. For each day in week: employee is available during their shift hours
7. Subtract employee_availability_override periods (absence, leave, training)
8. Result: AvailabilityWindow[] per employee per day
```

### 4.4 Constraints

**Hard constraints (from employee data + labor rules):**

| Constraint | Source | Default |
|------------|--------|---------|
| Shift assignment | rotation_entry → shift_pattern | Employee MUST work their rotation shift |
| Max weekly hours | employee.weekly_hours_contracted | Per employee |
| Max consecutive days | labor_rule OR 6 | NL: 6 dagen |
| Min rest between shifts | labor_rule OR 11h | NL: 11 uur |
| Skill eligibility | employee_skill.proficiency_level >= min_skill_level | Per process |
| Certification | employee_skill.has_active_certification | If process requires it |

**Soft constraints (parametrizable):**

| Constraint | Weight (default) | Description |
|------------|-----------------|-------------|
| Home department preference | 0.3 | Prefer assigning to home dept processes |
| Skill match quality | 0.4 | Higher proficiency = lower cost, higher output |
| Workload balance | 0.2 | Distribute hours evenly across employees |
| Overtime avoidance | 0.1 | Penalize hours beyond contracted |

### 4.5 Labor Rules (nl-defaults.ts)

Parametrizable defaults, read from `labor_rule` table if rows exist, otherwise:

```typescript
const NL_DEFAULTS: LaborRuleDefaults = {
  max_consecutive_days: 6,
  min_rest_hours: 11,
  mandatory_break_minutes: 30,
  mandatory_break_after_hours: 5.5,
  overtime_premium_pct: 130,  // 130% of hourly rate
  night_premium_pct: 120,     // 120% for shifts between 23:00-06:00
  weekend_premium_pct: 150,   // 150% for Saturday/Sunday
}
```

Organizations can override any of these via the `labor_rule` table. The solver reads the table first, then fills gaps with defaults.

## 5. Greedy Algorithm (greedy.ts)

Fast heuristic that assigns employees to process demands in priority order.

### 5.1 Algorithm

```
1. Sort demands by priority: critical > important > flexible
2. For each demand slot (process × day × shift):
   a. Find eligible employees (skill >= min_level, available, not at max hours)
   b. Score each: proficiency_multiplier × availability_fit × home_dept_bonus
   c. Sort by score DESC
   d. Assign top candidate, update their remaining hours
   e. If no eligible employee → add to unmet_demand
3. Post-process:
   a. Check all hard constraints satisfied
   b. Calculate metrics (cost, coverage, overtime)
   c. Report soft constraint violations
```

### 5.2 Scoring Function

```typescript
function scoreCandidate(employee, demand, state): number {
  const skillScore = PROFICIENCY_MULTIPLIERS[employee.skillLevel] ?? 1.0  // 0.6-1.3
  const deptBonus = employee.home_dept === demand.dept_id ? 1.1 : 1.0
  const overtimePenalty = state.weekHours[employee.id] > employee.contracted ? 0.7 : 1.0
  const balanceFactor = 1 - (state.weekHours[employee.id] / employee.contracted) * 0.3
  return skillScore * deptBonus * overtimePenalty * balanceFactor
}
```

### 5.3 Output

Returns SolverOutput with:
- assignments[] (assignment_source: 'optimizer')
- unmet_demand[] (gaps)
- metrics (coverage_pct, total_cost, overtime_hours, solve_time_ms)

## 6. HiGHS MIP Algorithm (highs.ts)

Mixed Integer Programming for mathematically optimal solutions.

### 6.1 Decision Variables

```
x[e][p][t] ∈ {0, 1}  — employee e assigned to process p in time slot t
```

### 6.2 Objective Function

```
Minimize:
  w_cost × Σ(x[e][p][t] × hourly_cost[e][t])
  - w_coverage × Σ(coverage_pct[p][t])
  - w_skill × Σ(x[e][p][t] × proficiency_multiplier[e][p])
  + w_overtime × Σ(overtime_hours[e])
```

Where weights come from plan_version.objective config (defaults: cost=0.4, coverage=0.3, skill=0.2, overtime=0.1).

### 6.3 Hard Constraints (MIP)

```
// Each employee works at most 1 process per time slot
∀e,t: Σ_p x[e][p][t] ≤ 1

// Skill eligibility
x[e][p][t] = 0  if skill[e][p] < min_skill[p]

// Max weekly hours
∀e: Σ_{p,t} x[e][p][t] × slot_hours[t] ≤ max_weekly_hours[e]

// Max consecutive days
∀e: enforce via auxiliary variables (6-day rolling window)

// Min rest between shifts
∀e: if assigned to evening shift day D, not morning shift day D+1

// Locked assignments
x[e][p][t] = 1  for all locked assignments

// Availability
x[e][p][t] = 0  if employee not available in slot t
```

### 6.4 Soft Constraints (as penalties in objective)

```
// Home department preference
penalty += w_dept × Σ(x[e][p][t]) where dept(p) ≠ home_dept(e)

// Workload balance
penalty += w_balance × variance(weekly_hours per employee)
```

### 6.5 Async Execution

```typescript
async function solveHiGHS(input: SolverInput, planVersionId: string) {
  // Update status
  await updatePlanStatus(planVersionId, { phase: 'building_model', progress: 0 })

  // Build model
  const model = buildMIPModel(input)
  await updatePlanStatus(planVersionId, { phase: 'solving', progress: 10 })

  // Solve with time budget
  const result = await model.solve({ timeLimit: input.time_budget_seconds })
  await updatePlanStatus(planVersionId, { phase: 'writing_results', progress: 90 })

  // Write results
  await writeAssignments(planVersionId, result)
  await updatePlanStatus(planVersionId, { phase: 'done', progress: 100 })
}
```

## 7. Output Validation (validate-output.ts)

After solver completes:

1. **No overlapping assignments** — same employee, same time slot
2. **All hard constraints satisfied** — check each assignment against constraints
3. **Metrics consistent** — coverage_pct matches assignments / demand
4. **Cost correct** — sum of hourly_rate × hours + premiums

If hard constraints violated → return InfeasibilityReport with:
- Which constraints conflict
- Suggestions (e.g., "Reduce demand for Process X by 2 FTE" or "Add 1 employee with Skill Y")

## 8. Plan Version State Machine

```
draft → optimized → proposed → approved → published
                  ↘ rejected (back to draft)
```

- **draft:** Editable. Can trigger solver.
- **optimized:** Solver completed. Review assignments.
- **proposed:** Submitted for approval.
- **approved:** Management signed off.
- **published:** Locked. Assignments visible to employees. shift_assignment_staging → shift_assignment.

Transitions enforced server-side. Only managers+ can propose, only admins+ can approve/publish.

## 9. Planning Router (planning.ts)

| Endpoint | Method | Description |
|----------|--------|-------------|
| listPlanVersions | query | List plans by site, status, period |
| getPlanVersion | query | Get plan + assignments + metrics |
| createDraft | mutation | Create new plan_version |
| runOptimizer | mutation | Trigger solver (greedy=sync, mip=async) |
| getOptimizerStatus | query | Poll async solver progress |
| transitionState | mutation | Move plan through state machine |
| manualAssign | mutation | Add manual assignment (locked) |
| removeAssignment | mutation | Remove assignment (draft only) |
| lockAssignment | mutation | Mark assignment as locked |
| overrideHardConstraint | mutation | Manager override for infeasibility |

## 10. Scenario Router (scenario.ts)

| Endpoint | Method | Description |
|----------|--------|-------------|
| create | mutation | Clone plan with modifications |
| run | mutation | Solve scenario |
| list | query | List scenarios for a plan |
| compare | query | Side-by-side metrics comparison |
| promote | mutation | Promote scenario to baseline plan |

## 11. Cost Calculation (cost.ts)

```typescript
function calculateCost(employee, hours, timeSlot, laborRules): number {
  const baseRate = employee.hourly_rate ?? employee.job_role_hourly_rate ?? 0
  const isOvertime = employee.current_week_hours + hours > employee.weekly_hours_contracted
  const isNight = isNightShift(timeSlot)  // 23:00-06:00
  const isWeekend = isWeekendDay(timeSlot)

  let rate = baseRate
  if (isOvertime) rate *= (laborRules.overtime_premium_pct / 100)
  if (isNight) rate *= (laborRules.night_premium_pct / 100)
  if (isWeekend) rate *= (laborRules.weekend_premium_pct / 100)

  return rate * hours
}
```

## 12. Implementation Sequence

| Step | What | Files | Dependencies |
|------|------|-------|-------------|
| 1 | NL defaults + constraint helpers | nl-defaults.ts, constraints.ts | None |
| 2 | Cost calculation | cost.ts | nl-defaults.ts |
| 3 | SolverInput assembly | assemble-input.ts | constraints.ts, cost.ts |
| 4 | Output validation | validate-output.ts | constraints.ts |
| 5 | Greedy solver | greedy.ts | assemble-input.ts, validate-output.ts |
| 6 | HiGHS MIP solver | highs.ts | assemble-input.ts, validate-output.ts |
| 7 | Planning router | planning.ts | greedy.ts, highs.ts |
| 8 | Scenario router | scenario.ts | planning.ts |
| 9 | Plan UI (list, detail, Gantt) | dashboard/planning/ | planning.ts |
| 10 | Scenario UI (compare, promote) | dashboard/planning/ | scenario.ts |

## 13. Testing Strategy

- **Unit tests:** Greedy scorer, constraint checkers, cost calculation, availability resolution
- **Integration tests:** assembleSolverInput with real DB data, full solver run
- **Scenario tests:** Known-optimal small cases (5 employees, 3 processes, 1 week)
- **Stress tests:** 200 employees × 30 processes × 4 weeks

## 14. Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Execution | Vercel Pro (300s) | No extra infra |
| Greedy = sync, MIP = async | Simplicity | Greedy <5s, MIP up to 300s |
| Week = planning unit | NL warehouse standard | Most constraints are weekly |
| NL defaults, parametrizable | Flexibility | labor_rule table overrides |
| Shift = hard constraint | User decision D-02 | Employee MUST work their rotation |
| Cross-dept = allowed | User decision D-03 | Soft preference for home dept |
| All processes optimizable | User decision D-01 | Including support processes |
| Plan state machine | draft→published | User decision D-04 |
