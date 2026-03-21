# AstraPlanner Core Invariants

> **Status:** MUST be resolved before any code is written.
> **Authority:** This document overrides all other design documents where conflicts exist.
> **Last updated:** 2026-03-20

This document defines the properties of AstraPlanner that must be correct and stable before implementation begins. An invariant is not a feature request or an aspiration. It is a structural guarantee that, if violated, invalidates everything built on top of it.

Each invariant specifies:
- **What** the invariant is (precise definition)
- **Why** it is invariant (consequence of getting it wrong)
- **Known Issues** from the SYSTEMS-REVIEW that affect it
- **Resolution Required** before build

---

## Invariant 1: The Planning Flow

The system's core computation is a fixed pipeline. Every workforce plan produced by AstraPlanner passes through these stages in this order:

```
Demand Signal --> Workload Computation --> FTE Requirement --> Assignment Optimization --> Published Plan
```

### 1.1 Demand Signal

A demand signal is a quantity of work expected at a specific site, for a specific process (or demand type mapped to processes), during a specific time period.

Structure:
- `site_id` -- where the work happens
- `demand_type_id` -- what kind of work (e.g., outbound orders, inbound pallets)
- `period_start` (timestamptz) -- when the period begins
- `period_end` (timestamptz) -- when the period ends
- `volume` (decimal) -- how much work, in the demand type's unit of measure
- `source` -- where the signal came from (WMS import, CSV upload, manual entry, AI forecast)

A demand signal without a site, time period, or volume is invalid. A plan without a demand signal as its root input is invalid.

### 1.2 Workload Computation

Translates demand into required labor hours using productivity standards and conversion ratios.

**Stage 1 -- Process Volume:**
```
process_volume = demand_volume * conversion_ratio
```
Where `conversion_ratio` comes from `demand_type_process_mapping`. One demand signal may fan out to multiple processes (e.g., 1 outbound order = 1.0 picks + 1.0 packs + 0.5 ship/load).

**Stage 2 -- Required Hours:**
```
required_hours = process_volume / productivity_rate * (1 + allowance_factor)
```
Where:
- `productivity_rate` = units per hour at the applicable proficiency level, from `process_productivity_standard`
- `allowance_factor` = non-productive time allowance (breaks, walk time, startup/shutdown), configurable per site

This two-stage formula is INVARIANT. The parameters (`conversion_ratio`, `productivity_rate`, `allowance_factor`) are configurable. The formula structure cannot change.

### 1.3 FTE Requirement

Translates labor hours into headcount.

```
required_fte = required_hours / available_hours_per_fte
gross_fte = required_fte / (1 - absenteeism_rate)
```

Where:
- `available_hours_per_fte` = shift duration minus paid breaks, unpaid meal break, startup/shutdown time, and non-productive time. For a standard 8-hour shift, this is typically 7.0 hours. Configurable per site and shift pattern.
- `absenteeism_rate` = expected absence rate for the workforce segment (permanent, temporary, seasonal). Configurable per site and contract type.

The gross-up for absenteeism is INVARIANT. Without it, plans systematically understaff.

### 1.4 Assignment Optimization

Matches available employees to required slots.

**Input contract (invariant):**
- FTE requirements per process per time slot
- Employee pool with skills, availability, constraints
- Hard constraints (must satisfy)
- Soft constraints (should satisfy, penalized if violated)
- Locked assignments (must not change)
- Objective configuration (what to optimize for)
- Time budget (how long the solver may run)

**Output contract (invariant):**
- Assignments: employee-to-process-to-time-slot mappings
- Unmet demand: slots where FTE requirements could not be filled
- Soft constraint violations: which soft constraints were relaxed and by how much
- Metrics: total cost, coverage percentage, overtime hours, solve time, optimality gap

The ALGORITHM used to produce the output is implementation (greedy, MIP, CP, future AI -- can change). The INPUT/OUTPUT CONTRACT is invariant.

### 1.5 Published Plan

An approved, immutable snapshot of assignments. Once published:
- Assignments are locked (no edits without creating a new version)
- Employees can be notified
- The plan becomes the operational schedule

**Why invariant:** This pipeline is the core value proposition. If the flow is wrong, every feature built on top is wrong. If demand does not drive workload, workload does not drive FTE, or FTE does not drive assignments, the system produces plans disconnected from operational reality.

**Consequence if wrong:** The entire system produces incorrect plans. Retrofitting the pipeline after features are built on top requires rewriting the core.

### Known Issues (from SYSTEMS-REVIEW)

1. **SR-1.2: DemandForecast uses `forecast_date` (DATE), not timestamptz.** This breaks sub-daily planning. The demand table cannot represent "500 orders expected between 06:00 and 14:00" -- only "500 orders expected on Tuesday." Sites with intra-day demand variation (all of them) get systematically wrong workload computations.

2. **SR-1.2: WorkloadPlan is per-day, not per-shift.** A single `weighted_uph` per day averages across morning (experienced workers) and evening (trainees), understaffing evenings by up to 40% and overstaffing mornings.

3. **SR-2.2: No optimizer I/O contract exists.** The five solver strategies described in the optimization documents have no typed interface definition. Frontend, backend, and test teams cannot build against an undefined contract.

### Resolution Required

- [ ] Change `demand_forecast` to use `period_start timestamptz` + `period_end timestamptz` instead of `forecast_date date`. Remove the `demand_granularity` enum (granularity is implicit in the period duration).
- [ ] Change `workload_plan` to one record per time slot (not per day). The time slot granularity must match the demand signal granularity.
- [ ] Define and publish the typed solver I/O contract (see Invariant 6).
- [ ] Decide: is the `allowance_factor` a single scalar or a structured breakdown (breaks, walk time, startup)? The formula uses a single factor; the FTE calculation section of optimization-strategy.md uses an itemized breakdown. Pick one representation.

---

## Invariant 2: Organization Hierarchy

Every entity in the system is scoped to this hierarchy:

```
Organization (tenant)
  +-- Site (physical location)
       +-- Department (optional grouping)
            +-- Process (operational activity)
```

### 2.1 Organization

The top-level tenant. The isolation boundary.
- Every row in every table carries `organization_id`.
- No cross-tenant data access is ever permitted.
- All RLS policies filter on `organization_id`.
- One organization = one customer deployment.

### 2.2 Site

A physical location with its own timezone, operating hours, and workforce.
- Has: timezone (IANA format), operating hours (weekly schedule), capacity limits (max headcount, dock doors, equipment).
- Belongs to exactly one Organization.
- Is the primary scoping unit for planning -- plans are generated per site.
- Multi-site planning (V2+) coordinates across sites but each site's plan is still produced independently.

### 2.3 Department

An optional organizational grouping within a site (e.g., "Inbound", "Outbound", "Returns").
- May be nested (parent-child) up to 3 levels.
- A site without departments operates with a default implicit grouping.
- Departments do not affect the planning pipeline directly -- they are for organizational structure, reporting, and access control.

### 2.4 Process

A specific operational activity with measurable productivity (e.g., "Picking", "Packing", "Receiving").
- Belongs to an Organization. Optionally scoped to a Department.
- Has: unit of measure, minimum skill level, hazard level, certification requirements.
- Is the atomic unit of work in the demand-to-workforce chain. Demand converts to process volume. Process volume converts to hours. Hours convert to FTE. FTE maps to employees.
- Process is the join point between demand (what work needs doing) and skills (who can do it).

### 2.5 ProcessProductivityStandard

The expected throughput rate for a process, segmented by skill level and optionally by site.
- `units_per_hour` at a given `skill_level` (1-5).
- Site-specific standards override org-wide defaults.
- This is the critical conversion factor: `hours = volume / units_per_hour`.

**Why invariant:** Every entity in the system is scoped to this hierarchy. Every query filters through `organization_id` first, then narrows by `site_id`, optionally by `department_id`, and by `process_id`. Getting the hierarchy wrong means restructuring every table, every query, every RLS policy.

**Consequence if wrong:** Data model requires fundamental redesign. Every foreign key, every index, every RLS policy is built on this hierarchy.

### Known Issues (from SYSTEMS-REVIEW)

1. **SR-1.5: Proficiency scale assumed to be 5 levels.** The schema enforces `CHECK (proficiency_level BETWEEN 1 AND 5)` and `CHECK (skill_level BETWEEN 1 AND 5)`. The setup wizard defaults to 4 levels. If an organization uses 4 levels, their Level 4 "Expert" maps to the system's Level 4 "Proficient" (1.0x productivity instead of 1.1x). Every expert employee is silently undercounted.

2. **SR-8.2: Flat vs modular schema not decided.** `backend-architecture.md` describes per-module schemas (`demand.*`, `workforce.*`, `planning.*`). `schema.sql` places everything in `public`. This affects every query and migration.

### Resolution Required

- [ ] Decide: is the proficiency scale fixed at 5 levels system-wide, or configurable per organization? If fixed (recommended for MVP), document it as invariant and ensure the wizard enforces 5 levels. If configurable, add `proficiency_scale_config` to Organization and ensure the optimizer reads it.
- [ ] Decide: flat `public` schema or modular schemas. Recommendation: flat `public` for MVP (simpler RLS, simpler queries). Document as implementation decision, not invariant.
- [ ] Process belongs to Organization but is optionally scoped to Department. Confirm: can a Process exist without a Department? Current schema says yes (`department_id` is nullable). This is correct -- org-wide processes like "Quality Audit" should not require a department.

---

## Invariant 3: Time Model

Every demand signal, workload computation, and assignment is time-bound. The time model must be consistent across all entities.

### 3.1 Time Period

The fundamental unit of planning -- a contiguous block of time at a site.

- Represented as: `period_start` (timestamptz), `period_end` (timestamptz)
- Duration is implicit: `period_end - period_start`
- Granularity is configurable per site: 15 minutes, 30 minutes, 1 hour, 4 hours, daily
- Regardless of granularity, the representation is ALWAYS `period_start` / `period_end` timestamps with timezone

This representation is INVARIANT. Using `DATE` columns for time periods is a bug -- it cannot represent sub-daily planning, which is the common case for logistics operations.

### 3.2 Shift

A named template for a work period.

- Has: `start_time` (TIME), `end_time` (TIME), `break_rules` (JSONB), `days_of_week` (array), `duration_hours`, `paid_hours`
- Belongs to an Organization (shared across sites in current schema; should be site-scoped or org-scoped-with-site-override)
- Supports overnight shifts (`is_overnight` flag when end_time < start_time)
- Shift patterns are templates. Actual shift assignments have concrete `start_time` (timestamptz) and `end_time` (timestamptz) that may deviate from the template (e.g., staggered starts).

### 3.3 Planning Horizon

The time range being planned.

- Defined on `PlanVersion` as `plan_period_start` and `plan_period_end`
- Current schema uses DATE for these fields. For MVP (daily or shift-level planning), DATE is acceptable here -- the planning horizon defines "which days" are in scope, not the intra-day granularity.
- The intra-day granularity is defined by the time slots within the horizon.

### 3.4 Timezone Handling

- All timestamps stored as `timestamptz` (UTC internally, timezone-aware)
- Sites have a `timezone` field (IANA format, e.g., "America/Chicago")
- Display conversion happens at the presentation layer
- The optimizer operates in UTC internally and converts to site-local time for shift boundary calculations

**Why invariant:** Every demand signal, workload computation, and assignment is time-bound. Wrong time model means wrong computations everywhere. The most common failure mode is using DATE when timestamptz is required, making sub-daily planning impossible.

**Consequence if wrong:** Cannot plan at sub-daily granularity. Since logistics operations require intra-shift staffing adjustments, this makes the system unusable for its primary use case.

### Known Issues (from SYSTEMS-REVIEW)

1. **SR-1.2: `forecast_date DATE` in DemandForecast.** This is the primary time model violation. Must be replaced with `period_start` / `period_end` timestamptz.

2. **SR-1.2: `plan_date DATE` in WorkloadPlan.** Same issue. WorkloadPlan must support per-shift or per-slot records.

3. **SR-1.2: `demand_granularity` ENUM ('daily', 'weekly', 'monthly').** This enum is incompatible with sub-daily planning. Granularity should be implicit in the time period duration, not an explicit enum restricted to daily or coarser.

### Resolution Required

- [ ] Replace `demand_forecast.forecast_date` (DATE) with `period_start` (timestamptz) + `period_end` (timestamptz).
- [ ] Replace `workload_plan.plan_date` (DATE) with `period_start` (timestamptz) + `period_end` (timestamptz).
- [ ] Remove `demand_granularity` enum. Granularity is the duration between `period_start` and `period_end`.
- [ ] Verify that `shift_assignment.start_time` and `end_time` are already timestamptz. (They are -- confirmed in schema.sql.)
- [ ] Decide: are `plan_version.plan_period_start` and `plan_period_end` DATE or timestamptz? Recommendation: keep as DATE -- they define the calendar range of the plan, not intra-day boundaries.

---

## Invariant 4: Workforce Model

The optimizer needs to know who can do what, where, when, and at what proficiency. Missing any dimension produces invalid plans.

### 4.1 Employee

A person who can be assigned to work.

- `employee_number` -- unique within organization
- `contract_type` -- one of: full_time, part_time, temporary, seasonal, contractor
- `weekly_hours_contracted` -- maximum scheduled hours per week under contract
- `home_site_id` -- primary work location (FK to Site, RESTRICT on delete)
- `hourly_rate` -- base pay rate (sensitive PII, access-controlled)
- `is_multi_site_eligible` -- whether this employee can be assigned to sites other than home
- `status` -- active, on_leave, suspended, terminated

An employee belongs to one home site. Multi-site assignment is opt-in, not default.

### 4.2 Skill (Employee x Process x Proficiency)

An employee's ability to perform a specific process at a specific proficiency level.

Modeled as the `employee_skill` table: one row per (employee, process) pair.

**Proficiency levels are INVARIANT at 5 levels:**

| Level | Label | Description | Productivity Multiplier |
|-------|-------|-------------|------------------------|
| 1 | Trainee | Requires direct supervision. Cannot work alone. | 0.60 |
| 2 | Basic | Independent on simple tasks. Needs help with exceptions. | 0.75 |
| 3 | Competent | Handles standard work reliably. Meets targets. | 0.90 |
| 4 | Proficient | Handles exceptions. Exceeds targets. Can train others. | 1.00 (baseline) |
| 5 | Expert | Optimizes processes. Subject matter expert. | 1.10 |

The 5-level structure is invariant. The productivity multipliers are configurable per organization (stored in `process_productivity_standard.units_per_hour` per skill level), but the structure (5 discrete levels with monotonically increasing capability) is fixed.

Level 4 is the baseline (1.0x). All productivity standards are expressed at Level 4. Other levels scale from this baseline.

### 4.3 Certification

A binary qualification with an expiry date. Separate from proficiency.

- An employee either has a valid certification or does not.
- Certifications have `issued_date`, `expiry_date`, and `status` (active, expiring_soon, expired, suspended).
- A Level 5 forklift operator with an expired forklift license cannot operate a forklift. Certification gates process assignment independently of proficiency.

In the current schema, certifications are stored as fields on `employee_skill` (`certification_date`, `expiry_date`). This conflates proficiency and certification into one entity. For MVP, this is acceptable if we treat `expiry_date` on `employee_skill` as the certification expiry. Post-MVP, a separate `employee_certification` table may be warranted for processes requiring multiple certifications.

### 4.4 Availability

When an employee can work. Modeled as two components:

**Template (recurring pattern):**
- Weekly recurring schedule (e.g., "available Mon-Fri, 06:00-22:00")
- Stored in `employee.preferences_json` or a dedicated availability template entity
- Defines the default availability pattern

**Override (date-specific exception):**
- Specific dates where availability differs from template (e.g., "on leave Dec 23-27", "available for overtime Saturday Nov 22")
- Override types: leave, absence, training, unavailable, extra_availability
- Status: planned, confirmed, cancelled

The template + override model is INVARIANT. Both must exist. The template provides the baseline; overrides modify it for specific dates. Without overrides, the system cannot represent planned absences, and every plan ignores leave.

**Why invariant:** The optimizer must determine, for each candidate assignment, whether the employee can do the work (skill), is allowed to do the work (certification), is available to do the work (availability), and how productive they will be (proficiency). Missing any dimension produces plans that assign unavailable employees, uncertified operators, or unskilled workers.

**Consequence if wrong:** Invalid plans that violate labor law, safety regulations, or simple reality (assigning someone who is on leave).

### Known Issues (from SYSTEMS-REVIEW)

1. **SR-1.3: No absence/availability override entity exists.** The schema has no `employee_availability_override` or equivalent. The `employee` table has `preferences_json` for recurring patterns but nothing for date-specific exceptions. The optimizer checks "employee is not on leave" but has nowhere to read leave data from.

2. **SR-1.1: No `last_practiced_date` on EmployeeSkill.** The skill decay model requires knowing when an employee last performed a process. This field does not exist. Without it, a Level 4 employee who hasn't picked in 6 months is treated at full Level 4 productivity.

3. **SR-1.5: Proficiency scale mismatch between wizard (4 levels) and optimizer (5 levels).** If an organization configures 4 levels, their experts are silently undercounted.

### Resolution Required

- [ ] Create `employee_availability_override` table with: `employee_id`, `organization_id`, `override_date` (or `start_date`/`end_date` for ranges), `override_type` (leave, absence, training, unavailable, extra_availability), `status` (planned, confirmed, cancelled), `reason` (text), `created_by`, timestamps. This is a hard blocker -- the optimizer cannot produce valid plans without it.
- [ ] Add `last_practiced_date` (DATE, nullable) to `employee_skill`. Populate from `shift_assignment` history via a nightly rollup job or trigger. For MVP, if skill decay is deferred, this field can be nullable and unused -- but it must exist in the schema so it does not require a migration later.
- [ ] Enforce 5-level proficiency in the setup wizard. Do not allow 4-level configuration in MVP. Document this as a fixed invariant.

---

## Invariant 5: Constraint Model

Constraints define what a "valid plan" means. There are exactly two categories.

### 5.1 Hard Constraints

MUST be satisfied. Any plan violating a hard constraint is invalid and must be rejected, regardless of how good it scores on other objectives.

| Constraint | Description | Source |
|------------|-------------|--------|
| Maximum working hours | Per jurisdiction: e.g., 48h/week (EU), overtime after 40h (US federal), daily limits (California) | Labor law |
| Minimum rest between shifts | Per jurisdiction: e.g., 11h (EU), 10h (Australia), none (US federal) | Labor law |
| Maximum consecutive working days | Per jurisdiction: e.g., 6 days (EU, California), none (US federal) | Labor law |
| Required certifications | Process requires active, unexpired certification. No certification = no assignment. | Safety regulation |
| Minimum skill level | `employee.effective_level[process] >= process.min_skill_level`. Below minimum is unsafe or unproductive. | Operational policy |
| Site capacity limits | Max headcount per building (fire code), per zone (equipment count), per equipment type (fleet size) | Physical infrastructure |
| Employee availability | Cannot assign an employee who is on leave, terminated, or otherwise unavailable | Basic validity |
| Contract restrictions | Part-time max hours, temporary worker process restrictions, fixed-term end dates, apprentice supervision ratios | Employment contract |
| Mandatory breaks | Per jurisdiction: e.g., 20 min after 6h (EU), 30 min before 5th hour (California) | Labor law |
| No overlapping assignments | An employee cannot be assigned to two shifts that overlap in time within the same plan version | Physical impossibility |

### 5.2 Soft Constraints

SHOULD be satisfied. Violation is allowed but penalized in the objective function. The optimizer balances soft constraint satisfaction against other objectives.

| Constraint | Description | Default Weight |
|------------|-------------|---------------|
| Shift preference | Assign employees to preferred shifts when possible | 0.15 |
| Home site preference | Assign employees to their home site when possible | 0.20 |
| Workload balance | Distribute hours evenly across eligible employees | 0.08 |
| Overtime minimization | Minimize total overtime hours | 0.15 |
| Team continuity | Keep regularly co-assigned employees together | 0.05 |
| Shift pattern consistency | Avoid erratic rotation (day-night-day) | 0.06 |
| Split shift avoidance | Minimize process switches within a single shift | 0.07 |
| Skill development | Assign stretch tasks when staffing allows | 0.05 |
| Commute minimization | Minimize distance from home site (multi-site only) | 0.08 |

### 5.3 Invariant Properties

The CATEGORIES (hard/soft) are invariant:
- Hard constraints are never relaxed. A plan violating any hard constraint is rejected.
- Soft constraints have penalty weights. The weights are configurable. The constraint types are invariant.

The CONSTRAINT TYPES listed above are invariant for the planning domain. New constraint types may be added, but existing ones cannot be removed or reclassified (a hard constraint cannot become soft, and vice versa) without explicit architectural decision.

The PENALTY WEIGHTS for soft constraints are implementation (configurable per organization and site).

Post-solve verification is INVARIANT: after the solver produces a solution, every hard constraint is independently verified. If any check fails, the solution is rejected. This double-check prevents solver bugs from producing illegal plans.

**Why invariant:** Constraints define what a "valid plan" means. If the constraint model is wrong, the system produces plans that are either illegal (violating labor law), unsafe (assigning uncertified workers), or impractical (assigning unavailable employees).

**Consequence if wrong:** Legal liability, safety incidents, employee grievances, loss of customer trust.

### Known Issues (from SYSTEMS-REVIEW)

1. **SR-1.4: Overlapping shift assignments not prevented.** The UNIQUE constraint on `shift_assignment` prevents identical `start_time` but not overlapping time ranges (06:00-14:30 and 08:00-16:30 for the same employee both insert successfully). This is a hard constraint violation that the schema does not enforce.

2. **SR section 9 (legal issues): EU consecutive days is a hard constraint, not soft.** The EU Working Time Directive requires a rest day per 7-day period. This cannot be a soft constraint with a penalty -- it is a legal requirement.

### Resolution Required

- [ ] Add a PostgreSQL exclusion constraint on `shift_assignment` to prevent overlapping time ranges for the same employee within the same plan version:
  ```sql
  ALTER TABLE shift_assignment
    ADD CONSTRAINT no_overlapping_shifts
    EXCLUDE USING gist (
      employee_id WITH =,
      plan_version_id WITH =,
      tstzrange(start_time, end_time) WITH &&
    );
  ```
  This requires the `btree_gist` extension.
- [ ] Ensure EU consecutive days rule is classified as a hard constraint in the labor_rule seed data, not a soft constraint.
- [ ] Review all jurisdiction-specific constraint profiles against actual labor law. The SYSTEMS-REVIEW identified 6 legally incorrect specifications that must be fixed.

---

## Invariant 6: Solver Contract (Input/Output)

The solver is the most complex component in the system. Its internal algorithm is implementation (can be swapped). Its external contract is invariant.

### 6.1 Solver Input

```typescript
interface SolverInput {
  // Scoping
  site_id: string;
  planning_horizon: {
    start: Date;  // inclusive
    end: Date;    // inclusive
  };

  // Time structure
  time_slots: TimeSlot[];  // ordered list of planning time periods

  // Demand (output of workload computation)
  demand: ProcessDemand[];  // required FTEs per process per time slot

  // Workforce supply
  employees: EmployeeRecord[];  // available employees with:
    // - id, contract_type, weekly_hours_contracted, hourly_rate
    // - skills: array of { process_id, proficiency_level, has_certification }
    // - availability: array of available time ranges
    // - current_week_hours: hours already worked this week (for overtime calc)
    // - consecutive_days_worked: for consecutive-day constraint

  // Constraints
  hard_constraints: HardConstraint[];
  soft_constraints: SoftConstraint[];  // each with a weight (penalty)

  // Pre-existing assignments
  locked_assignments: Assignment[];  // assignments that must not change

  // Objective
  objective: ObjectiveConfig;  // weights for cost, coverage, skill match, etc.

  // Solver control
  time_budget_seconds: number;  // how long the solver may run
}
```

### 6.2 Solver Output

```typescript
interface SolverOutput {
  // Primary result
  assignments: Assignment[];  // employee-to-process-to-slot mappings
    // Each assignment has: employee_id, process_id, time_slot,
    //   shift_pattern_id, scheduled_hours, cost_estimate

  // Gaps
  unmet_demand: UnmetDemandSlot[];  // slots where demand could not be filled
    // Each has: process_id, time_slot, required_fte, assigned_fte, gap_fte

  // Soft constraint health
  soft_constraint_violations: Violation[];
    // Each has: constraint_type, description, penalty_incurred

  // Metrics
  metrics: {
    total_cost: number;            // estimated labor cost
    coverage_percentage: number;   // assigned_fte / required_fte across all slots
    overtime_hours: number;        // total overtime across all employees
    solve_time_ms: number;         // wall-clock solver execution time
    optimality_gap: number | null; // for MIP solvers: gap to proven optimal (null for heuristics)
    solver_strategy_used: string;  // which algorithm was selected
  };
}
```

### 6.3 Contract Rules

1. ANY solver algorithm must accept `SolverInput` and produce `SolverOutput`. No solver may require additional inputs or produce differently structured outputs.
2. All hard constraints in the input must be satisfied in the output. If the solver cannot satisfy all hard constraints, it must report the infeasible slots in `unmet_demand` rather than violating constraints.
3. `locked_assignments` in the input must appear unchanged in the output `assignments`.
4. `solve_time_ms` must not exceed `time_budget_seconds * 1000`. The solver must return its best solution within the time budget, even if not optimal.

**Why invariant:** This contract is the boundary between the planning logic (invariant) and the solver algorithm (implementation). Without it, the frontend cannot build the optimization progress UI, the backend cannot build the result-writing pipeline, and tests cannot validate solver correctness.

**Consequence if wrong:** Every solver swap requires rewriting the surrounding code. Teams cannot develop in parallel because the interface is undefined.

### Known Issues (from SYSTEMS-REVIEW)

1. **SR-2.2: This contract did not exist.** The SYSTEMS-REVIEW identified this as a missing component. Five solver strategies are described in the optimization documents with no typed interface.

### Resolution Required

- [ ] Publish this contract as TypeScript interfaces in the codebase (e.g., `src/types/solver.ts`) before any solver implementation begins.
- [ ] Define the `TimeSlot`, `ProcessDemand`, `EmployeeRecord`, `Assignment`, `HardConstraint`, `SoftConstraint`, `Violation`, `ObjectiveConfig`, and `UnmetDemandSlot` types with full field definitions.
- [ ] Write a contract validation function that verifies any `SolverOutput` satisfies all hard constraints from the corresponding `SolverInput`. This validator runs post-solve as the double-check described in Invariant 5.

---

## Invariant 7: Plan Lifecycle

A plan goes through defined states with defined transitions. Invalid transitions are rejected.

### 7.1 State Machine

```
Draft --> Optimized --> Proposed --> Approved --> Published
                                       |
                                    Rejected --> Draft
Published --> Stale (when inputs change) --> re-enter at Optimized
Published --> Superseded (when new version published for same site/period)
```

### 7.2 State Definitions

| State | Description | Editable? | Who transitions out? |
|-------|-------------|-----------|---------------------|
| Draft | Initial state. Assignments may be empty or manually created. | Yes | Planner (run optimizer) |
| Optimized | Solver has produced assignments. Planner may review and manually adjust. | Yes (adjustments) | Planner (submit for approval) |
| Proposed | Submitted for approval. No edits allowed during review. | No | Manager (approve or reject) |
| Approved | Manager has approved. Ready to publish. | No | Planner or Admin (publish) |
| Published | Active schedule. Employees notified. Assignments are the operational plan. | No | System (detect stale) or Planner (supersede) |
| Stale | Published plan whose inputs have materially changed (demand updated, employee on leave). Indicates the plan should be re-optimized. | No (must re-enter draft or re-optimize) | Planner (re-optimize) |
| Superseded | A newer plan version has been published for the same site and period. This version is now historical. | No (archived) | N/A (terminal state) |
| Rejected | Approver sent back with comments. Returns to Draft for revision. | Yes (as Draft) | Planner (revise and re-submit) |

### 7.3 Transition Rules

- Draft -> Optimized: triggered by successful optimizer completion.
- Optimized -> Proposed: triggered by planner submitting for approval.
- Proposed -> Approved: triggered by authorized manager approval.
- Proposed -> Rejected: triggered by authorized manager rejection (must include reason).
- Rejected -> Draft: automatic on rejection.
- Approved -> Published: triggered by planner or admin publish action.
- Published -> Stale: triggered by system detecting material input changes.
- Published -> Superseded: triggered when a new version for the same site/period reaches Published.
- Stale -> Optimized: triggered by re-running the optimizer.

No other transitions are valid. In particular:
- Published cannot go directly to Draft (must go through Stale or Superseded).
- Proposed cannot be edited (must be rejected back to Draft first).
- Superseded is terminal.

### 7.4 Staleness Detection

A published plan becomes Stale when any of these occur:
- Demand forecast is updated for any time period within the plan's horizon.
- An employee in the plan reports an absence (availability override created).
- An employee's skill or certification status changes.
- A labor rule applicable to the plan's site/jurisdiction changes.

Staleness is detected asynchronously (not real-time). A background job or database trigger checks published plans against their input timestamps.

**Why invariant:** The plan lifecycle governs workflows, permissions, notifications, and audit trails. If transitions are undefined, plans can be in inconsistent states (published but editable, approved but never published, stale but treated as current).

**Consequence if wrong:** Breaks the approval process. Employees may be notified of plans that are subsequently edited. Audit trail cannot reconstruct plan history.

### Known Issues (from SYSTEMS-REVIEW)

1. **SR-2.4: Plan state machine not defined.** Valid transitions, triggering conditions, and role permissions were never specified. The `approval_status` enum exists but the transition rules do not.

2. **Current `approval_status` enum is: `draft, pending_review, approved, rejected, superseded`.** This is missing `optimized`, `published`, and `stale`. The enum must be extended or supplemented.

### Resolution Required

- [ ] Extend or replace `approval_status` enum to include all states: `draft`, `optimized`, `proposed`, `approved`, `published`, `stale`, `superseded`, `rejected`.
- [ ] Implement state transition validation as a database trigger or application-layer guard. Invalid transitions must be rejected with an error.
- [ ] Define which roles can trigger which transitions (e.g., only managers can approve/reject, only planners can propose/publish).
- [ ] Define what constitutes a "material input change" for staleness detection. Not every minor edit should trigger stale -- define thresholds (e.g., demand change > 5%, or any new absence).

---

## Invariant 8: Multi-Tenancy Boundary

### 8.1 Rules

1. Every row in every table has `organization_id` as a non-nullable foreign key to `organization`.
2. Row Level Security (RLS) is enabled on every table that contains tenant data.
3. RLS policies filter on `organization_id = auth.organization_id()` where `auth.organization_id()` extracts the tenant from the JWT.
4. No cross-tenant data access is ever permitted, except for:
   - Anonymized, aggregated platform metrics (admin-only, service role)
   - Billing and subscription management (platform-level, not tenant-level)
5. The tenant boundary is the ORGANIZATION, not the site. A user within an organization can access data across all sites in that organization (subject to role-based access control within the tenant).
6. Service role bypasses RLS for system operations (optimizer, sync jobs, migrations). This is a Supabase default and is acceptable, but service role usage must be audited.

### 8.2 RLS Implementation

The canonical RLS predicate is:
```sql
organization_id = auth.organization_id()
```
Where `auth.organization_id()` reads from `request.jwt.claims ->> 'organization_id'`.

This is the ONLY correct RLS mechanism. Other mechanisms mentioned in other documents (`auth.jwt() ->> 'tenant_id'`, `current_setting('app.tenant_id')`) are incorrect and must not be used.

**Why invariant:** Security and data isolation. A multi-tenant system where one tenant can see another tenant's employee data, demand forecasts, or workforce plans is a data breach.

**Consequence if wrong:** Data breach. Loss of customer trust. Regulatory penalties (GDPR, SOC 2). Existential risk to the product.

### Known Issues (from SYSTEMS-REVIEW)

1. **SR-1.6: Materialized views bypass RLS.** `mv_site_dashboard`, `mv_coverage_gaps`, and `mv_skill_matrix` aggregate across all organizations. PostgreSQL materialized views use definer privileges, not invoker privileges. Querying them without an explicit `WHERE organization_id = ...` returns cross-tenant data.

2. **SR-8.1: Three different RLS mechanisms across three documents.** `system-overview.md` uses `auth.jwt() ->> 'tenant_id'`. `backend-architecture.md` uses `current_setting('app.tenant_id')`. `schema.sql` uses `auth.organization_id()`. Only `schema.sql` is correct.

3. **SR-8.4: Naming inconsistency: `tenant_id` vs `organization_id`.** Some documents use `tenant_id`, others use `organization_id`. The schema uses `organization_id`. This must be the canonical name everywhere.

### Resolution Required

- [ ] Wrap all materialized view queries in security-definer functions that inject `WHERE organization_id = auth.organization_id()`. Alternatively, replace materialized views with regular views (which inherit RLS) and accept the performance cost. Decision must be made before build.
- [ ] Audit all documents and code for `tenant_id` usage. Replace with `organization_id` everywhere. The canonical column name is `organization_id`.
- [ ] Audit all documents for alternative RLS mechanisms. The canonical mechanism is `auth.organization_id()` reading from JWT claims. No other mechanism is valid.
- [ ] Add an RLS integration test to CI that attempts cross-tenant access for every table and verifies it is blocked.

---

## Invariant 9: Audit Requirement

### 9.1 Rules

1. Every state-changing operation produces an audit record in `audit_log`.
2. Audit records are immutable. The `audit_log` table has a trigger that prevents UPDATE and DELETE operations.
3. Every audit record captures:
   - `actor_id` -- who performed the action (user ID or system identifier)
   - `actor_type` -- user, system, api_integration, or ai_optimizer
   - `action` -- what was done (create, update, delete, approve, reject, publish, optimize)
   - `entity_type` -- which table was affected
   - `entity_id` -- which row was affected
   - `before_state` -- JSONB snapshot of the row before the change (null for creates)
   - `after_state` -- JSONB snapshot of the row after the change (null for deletes)
   - `created_at` -- when the action occurred (timestamptz)
4. Audit records use polymorphic references (`entity_type` + `entity_id`) without foreign key constraints. This ensures audit records survive even if the referenced entity is deleted.
5. Audit records are scoped to `organization_id` and subject to RLS.

### 9.2 What Must Be Audited

At minimum, these operations produce audit records:
- Employee creation, modification, deactivation
- Skill level changes
- Plan version state transitions (draft -> optimized -> proposed -> approved -> published)
- Manual assignment overrides (who overrode what, with reason)
- Optimizer runs (input hash, solver strategy, solve time, result hash)
- Demand forecast uploads and modifications
- Labor rule changes
- Approval and rejection actions (who, when, comments)
- Configuration changes (site settings, process settings, constraint weights)

### 9.3 Retention

Audit records must be retained for the duration required by the customer's regulatory environment. Minimum: 7 years for most jurisdictions. The system must not automatically delete audit records within the retention period.

**Why invariant:** Enterprise customers require audit trails for regulatory compliance (labor law, equal treatment, data protection). Retrofitting audit logging after the fact is extremely expensive because it requires instrumenting every write path, and historical data is lost.

**Consequence if wrong:** Cannot demonstrate compliance during audits. Cannot perform root cause analysis on planning failures. Cannot reconstruct decision history. Discrimination claims become indefensible because the system cannot prove decisions were based on objective criteria.

### Known Issues (from SYSTEMS-REVIEW)

No specific audit-related bugs were identified in the SYSTEMS-REVIEW. The `audit_log` table exists with the correct structure (immutable trigger, polymorphic references, before/after state). The main risk is that audit logging is defined in the schema but may not be implemented in application code -- every write path must actually create audit records.

### Resolution Required

- [ ] Define the application-level mechanism for audit logging. Options: database triggers on each table (automatic but verbose), application middleware (more control but risk of gaps), or Supabase Edge Function hooks. Recommendation: database triggers for critical tables (employee, plan_version, shift_assignment, labor_rule), application middleware for others.
- [ ] Ensure optimizer runs produce audit records with `input_hash` and `result_hash` for reproducibility.
- [ ] Define retention policy and document it. Ensure no automated cleanup job can delete audit records within retention period.

---

## Cross-Invariant Dependencies

These invariants are not independent. They form a dependency graph:

```
Invariant 2 (Hierarchy) <-- foundation for all entity scoping
    |
    v
Invariant 8 (Multi-Tenancy) <-- RLS depends on hierarchy (organization_id on every row)
    |
    v
Invariant 3 (Time Model) <-- time representation used by demand, workload, assignments
    |
    v
Invariant 4 (Workforce Model) <-- employees scoped to hierarchy, availability uses time model
    |
    v
Invariant 1 (Planning Flow) <-- pipeline uses all of the above
    |
    v
Invariant 5 (Constraints) <-- constraints validate pipeline output
    |
    v
Invariant 6 (Solver Contract) <-- typed interface for the pipeline's optimization stage
    |
    v
Invariant 7 (Plan Lifecycle) <-- state machine governs pipeline output
    |
    v
Invariant 9 (Audit) <-- records all state changes across all invariants
```

If Invariant 2 (Hierarchy) is wrong, Invariant 8 (Multi-Tenancy) breaks because RLS depends on `organization_id`.
If Invariant 3 (Time Model) is wrong, Invariant 1 (Planning Flow) produces wrong computations.
If Invariant 4 (Workforce Model) is incomplete (missing availability overrides), Invariant 5 (Constraints) cannot check "employee is available."

Fix from bottom to top: Hierarchy -> Multi-Tenancy -> Time Model -> Workforce Model -> Planning Flow -> Constraints -> Solver Contract -> Plan Lifecycle -> Audit.

---

## Summary of All Resolutions Required Before Build

### Critical (blocks all development)

| # | Resolution | Affects Invariant | Effort |
|---|-----------|-------------------|--------|
| 1 | Change `demand_forecast` to use `period_start`/`period_end` timestamptz | 1, 3 | Schema change |
| 2 | Change `workload_plan` to per-slot granularity | 1, 3 | Schema change |
| 3 | Create `employee_availability_override` table | 4, 5 | Schema + API |
| 4 | Add exclusion constraint for overlapping shifts | 5 | Schema change |
| 5 | Publish solver I/O contract as TypeScript types | 6 | Type definitions |
| 6 | Fix materialized view RLS bypass | 8 | Schema/query change |
| 7 | Standardize on `organization_id` everywhere | 8 | Documentation cleanup |

### Important (blocks specific features)

| # | Resolution | Affects Invariant | Effort |
|---|-----------|-------------------|--------|
| 8 | Extend plan state enum to include all lifecycle states | 7 | Schema change |
| 9 | Define plan state transition rules and role permissions | 7 | Application logic |
| 10 | Add `last_practiced_date` to `employee_skill` | 4 | Schema change |
| 11 | Enforce 5-level proficiency in wizard | 2, 4 | UI constraint |
| 12 | Define audit logging mechanism (triggers vs middleware) | 9 | Architecture decision |
| 13 | Remove `demand_granularity` enum | 3 | Schema change |
| 14 | Review jurisdiction constraint profiles against actual law | 5 | Legal review |
