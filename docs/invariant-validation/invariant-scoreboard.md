# AstraPlanner Invariant Validation Scoreboard

> **Validated against:** invariants.md, schema.sql, data-entities.md, data-relationships.md, optimization-strategy.md, skill-matching.md, constraint-handling.md, wizard-flow.md, SYSTEMS-REVIEW.md
> **Date:** 2026-03-20
> **Methodology:** Each invariant mapped to defining documents, cross-checked for contradictions, gaps assessed against "can a developer implement this without asking questions?"

---

## Summary

| Status | Count | Invariants |
|--------|-------|------------|
| LOCKED | 4 | INV-2, INV-3, INV-11, INV-15 |
| WEAK | 9 | INV-1, INV-5, INV-7, INV-8, INV-10, INV-14, INV-16, INV-18, INV-19 |
| CONTRADICTORY | 5 | INV-4, INV-6, INV-9, INV-12, INV-20 |
| MISSING | 2 | INV-13, INV-17 |

---

### INV-1: Planning Causality (demand -> workload -> FTE -> allocation)

**Status:** WEAK

**Defining documents:**
- [invariants.md] -- Defines the full 5-stage pipeline (Demand Signal -> Workload Computation -> FTE Requirement -> Assignment Optimization -> Published Plan) with formulas at each stage
- [optimization-strategy.md] -- Defines a 4-stage pipeline (Demand Normalization -> Workload Computation -> FTE Calculation -> Assignment Optimization) with detailed formulas and a numeric example
- [data-relationships.md] -- Defines the entity chain: DemandForecast -> WorkloadPlan -> ShiftAssignment with computation steps
- [schema.sql] -- Defines `demand_forecast`, `workload_plan`, and `shift_assignment` tables

**Quality assessment:** The pipeline stages are well-defined and the formulas are consistent across invariants.md and optimization-strategy.md. However, the schema cannot currently execute the pipeline because `demand_forecast.forecast_date` is DATE (not timestamptz) and `workload_plan.plan_date` is DATE (not timestamptz), making sub-daily computation impossible.

**Contradictions found:**
1. invariants.md defines the workload formula as a two-stage process: `process_volume = demand_volume * conversion_ratio`, then `required_hours = process_volume / productivity_rate * (1 + allowance_factor)`. optimization-strategy.md defines it as `required_hours = normalized_demand / productivity_rate` with NO allowance_factor -- the allowance is instead handled via deductions in the FTE calculation step (available_hours_per_FTE). These are different formulas producing different intermediate values. The allowance is applied in different places.
2. invariants.md says the allowance_factor representation is unresolved: "is it a single scalar or a structured breakdown?" optimization-strategy.md uses an itemized breakdown (paid breaks, unpaid meal, startup/shutdown, non-productive time = 60 min deducted from 8h shift). invariants.md formula uses a single scalar multiplier `(1 + allowance_factor)`. These produce different numbers.

**Missing pieces:**
1. No `allowance_factor` column exists anywhere in schema.sql. Neither the workload_plan table nor a site configuration table stores this value.
2. The `demand_normalization` stage in optimization-strategy.md (CWU conversion) is not present in invariants.md or the schema. The `demand_conversion_factors` configuration table referenced in optimization-strategy.md does not exist in schema.sql.

**Resolution:** The allowance is handled via the FTE calculation (deductions from available hours per FTE), NOT as a multiplier on required_hours. The formula is: `required_hours = process_volume / productivity_rate` (no allowance multiplier). `available_hours_per_fte = shift_duration - breaks - startup - non_productive_time`. The `(1 + allowance_factor)` formulation in invariants.md Section 1.2 must be removed and replaced with a reference to the FTE calculation deductions. Add a `net_productive_hours` column to `shift_pattern` (or compute it from `paid_hours` minus `break_rules_json` deductions).

---

### INV-2: Organization Structure (org -> site -> department -> process)

**Status:** LOCKED

**Defining documents:**
- [invariants.md] -- Defines the hierarchy: Organization -> Site -> Department (optional) -> Process. Department is explicitly optional, with nullable `department_id` on Process.
- [schema.sql] -- `process.department_id` is nullable FK to `department(id) ON DELETE SET NULL`. `department.site_id` is NOT NULL FK to `site(id)`. `site.organization_id` is NOT NULL FK to `organization(id)`. Foreign keys are correct.
- [data-entities.md] -- Confirms the same hierarchy with identical constraints
- [data-relationships.md] -- Confirms the hierarchy with cardinality table
- [wizard-flow.md] -- Phase 1 creates Organization, Phase 2 creates Sites, Phase 3 creates Processes. Departments are not an explicit wizard phase but are implicitly created via process categories.

**Quality assessment:** The hierarchy is precisely defined and consistently implemented across all documents. Foreign keys, delete behaviors, and nullable relationships are all aligned. A developer can implement this without ambiguity.

**Contradictions found:** None. All four documents agree on the structure, optionality of departments, and foreign key behavior.

**Missing pieces:** None. The hierarchy is complete for MVP.

---

### INV-3: Process as Planning Atom

**Status:** LOCKED

**Defining documents:**
- [invariants.md] -- "Process is the atomic unit of work in the demand-to-workforce chain. Demand converts to process volume. Process volume converts to hours. Hours convert to FTE. FTE maps to employees."
- [schema.sql] -- Process table has `unit_of_measure`, `min_skill_level`, `requires_certification`, `hazard_level`. `demand_type_process_mapping` links demand types to processes with `conversion_ratio`. `workload_plan` has `process_id` FK. `shift_assignment` has `process_id` FK. `employee_skill` has `process_id` FK.
- [data-entities.md] -- Process defined as "the join point between demand (what work needs doing) and skills (who can do it)"
- [optimization-strategy.md] -- All formulas operate per-process per-timeslot
- [skill-matching.md] -- Skills are defined as `(Process, Proficiency Level)` tuples
- [wizard-flow.md] -- Phase 3 defines processes per site with productivity standards

**Quality assessment:** Process is consistently modeled as the atomic planning unit across every document. The schema correctly implements it as the join point between demand, workload, skills, and assignments. This is the most consistently defined concept in the system.

**Contradictions found:** None.

**Missing pieces:** None.

---

### INV-4: Time Model (buckets / shifts)

**Status:** CONTRADICTORY

**Defining documents:**
- [invariants.md] -- Declares that all time periods use `period_start timestamptz` + `period_end timestamptz`. Explicitly states: "Using DATE columns for time periods is a bug."
- [schema.sql] -- `demand_forecast.forecast_date` is `DATE`. `workload_plan.plan_date` is `DATE`. `demand_granularity` enum is `('daily', 'weekly', 'monthly')`. `shift_assignment.start_time` and `end_time` are `TIMESTAMPTZ` (correct). `plan_version.plan_period_start` and `plan_period_end` are `DATE`.
- [wizard-flow.md] -- Phase 4 offers forecast granularity options: "15-minute intervals, Hourly, 4-hour blocks, Daily, Weekly" -- sub-daily options that cannot be stored in the current schema.
- [optimization-strategy.md] -- States default time slot granularity is 1 hour, supports 15-min to shift-level granularity.
- [SYSTEMS-REVIEW.md] -- SR-1.2 identifies this as a broken handoff: sub-daily demand cannot be stored.

**Quality assessment:** The invariants.md time model definition is precise and correct. The schema.sql implementation directly contradicts it. This is the most clearly documented contradiction in the system.

**Contradictions found:**
1. `demand_forecast.forecast_date` is DATE in schema.sql but invariants.md requires `period_start`/`period_end` timestamptz.
2. `workload_plan.plan_date` is DATE in schema.sql but invariants.md requires `period_start`/`period_end` timestamptz.
3. `demand_granularity` enum `('daily','weekly','monthly')` exists in schema.sql but invariants.md says "Remove the `demand_granularity` enum."
4. wizard-flow.md offers sub-daily granularity (15-min, hourly, 4-hour) but the schema cannot store it.

**Missing pieces:** None -- the target state is clearly defined in invariants.md. The problem is the schema has not been updated to match.

**Resolution:** Execute the schema changes already specified in invariants.md Section 3: replace `forecast_date` with `period_start`/`period_end` timestamptz on `demand_forecast`, replace `plan_date` with `period_start`/`period_end` timestamptz on `workload_plan`, drop the `demand_granularity` enum. Keep `plan_version.plan_period_start/end` as DATE (acceptable for planning horizon boundaries).

---

### INV-5: Demand Definition

**Status:** WEAK

**Defining documents:**
- [invariants.md] -- Defines the demand signal structure: `site_id`, `demand_type_id`, `period_start` (timestamptz), `period_end` (timestamptz), `volume` (decimal), `source`
- [schema.sql] -- `demand_forecast` table has: `site_id`, `demand_type_id`, `forecast_date` (DATE, not timestamptz), `volume`, `source`, `granularity`
- [data-entities.md] -- DemandForecast entity uses `forecast_date` (date) and `granularity` enum
- [wizard-flow.md] -- Phase 4 Tab 2 defines demand types with forecast granularity options including sub-daily (15-min, hourly, 4-hour)

**Quality assessment:** The demand entity is well-defined in terms of what it represents (a volume of work at a site for a demand type in a time period). The demand_type -> process mapping via `demand_type_process_mapping` with `conversion_ratio` is correctly modeled. However, the time representation is broken (DATE instead of timestamptz pair), which is covered by INV-4.

**Contradictions found:**
1. The granularity contradiction is a repeat of INV-4: schema stores DATE + enum, invariants.md requires timestamptz pair.
2. `demand_type.conversion_factors_json` in data-entities.md stores conversion ratios on the demand_type itself, while the `demand_type_process_mapping` table also stores `conversion_ratio`. These are two places for the same data. The join table is authoritative; the JSONB field on `demand_type` is informational/display-only. This is not documented.

**Missing pieces:**
1. No explicit definition of valid demand units. `unit_of_measure` on `demand_type` is a free-text varchar, not an enum. Two demand types with "orders" and "Orders" are treated as different units. There is no normalization.
2. The `source` field on demand_forecast uses the enum `demand_source`, but invariants.md also lists "AI forecast" as a source. The enum has `ai_forecast` which matches, so this is consistent.

**Resolution:** The `conversion_factors_json` on `demand_type` is for display/reference only. The authoritative conversion ratio is in `demand_type_process_mapping.conversion_ratio`. Document this explicitly. The `unit_of_measure` free-text approach is acceptable for MVP -- do not add a UOM enum.

---

### INV-6: Workload Conversion

**Status:** CONTRADICTORY

**Defining documents:**
- [invariants.md] -- Formula: `required_hours = process_volume / productivity_rate * (1 + allowance_factor)`. Two-stage: first `process_volume = demand_volume * conversion_ratio`, then apply productivity rate and allowance.
- [optimization-strategy.md] -- Formula: `required_hours = normalized_demand / productivity_rate`. NO allowance_factor multiplier. Allowance is handled in FTE calc step via available_hours_per_FTE deductions. Also adds skill proficiency adjustment, shift timing adjustment, and learning curve adjustment -- none of which appear in the invariants.md formula.
- [data-relationships.md] -- Workload computation: `hours_needed = process_volume / weighted_uph`. No allowance factor mentioned.
- [schema.sql] -- `workload_plan` stores `demand_volume`, `conversion_ratio`, `process_volume`, `weighted_uph`, `hours_needed`. No `allowance_factor` column. The formula is implicitly `hours_needed = process_volume / weighted_uph`.

**Quality assessment:** The core conversion (`process_volume / productivity_rate = hours`) is consistent across all documents. The contradiction is specifically about where and how the allowance for non-productive time is applied. This matters because it changes the intermediate `hours_needed` value and therefore the FTE calculation.

**Contradictions found:**
1. invariants.md applies allowance as a multiplier on required_hours: `hours * (1 + allowance_factor)`. optimization-strategy.md applies it as a deduction from available hours per FTE: `available_hours = 8h - 1h deductions = 7h`. These are mathematically different: 100 raw hours with 14% allowance = 114 hours needed / 8 hours per FTE = 14.25 FTE, vs. 100 raw hours / 7 available hours per FTE = 14.29 FTE. Not identical.
2. optimization-strategy.md adds shift timing factors (night shift 1.12x, overtime fatigue 1.08x) and learning curve factors (1.40x for first 3 shifts) to the workload calculation. invariants.md does not mention these. They significantly affect the output.
3. `weighted_uph` in the schema is described as "Weighted average UPH based on available skill mix" -- this implies the proficiency adjustment is baked into the UPH, not applied separately. optimization-strategy.md applies it separately. These are two different computational approaches.

**Missing pieces:**
1. No `allowance_factor` is stored anywhere in the schema.
2. No shift timing factors or learning curve factors are stored in the schema.
3. The `weighted_uph` computation logic is not defined anywhere -- how is the average weighted by the skill mix of available workers?

**Resolution:** The schema approach is correct: `weighted_uph` bakes in the proficiency adjustment for the available workforce. The formula is `hours_needed = process_volume / weighted_uph`. Allowance is handled in FTE calculation via `available_hours_per_fte = shift_pattern.paid_hours - computed_break_time`. Shift timing factors and learning curve adjustments are V2 -- do not implement for MVP. Remove `(1 + allowance_factor)` from invariants.md Section 1.2 and replace with a note that allowance is handled in FTE calculation.

---

### INV-7: Capacity Requirement (FTE Calculation)

**Status:** WEAK

**Defining documents:**
- [invariants.md] -- Formulas: `required_fte = required_hours / available_hours_per_fte`, `gross_fte = required_fte / (1 - absenteeism_rate)`. Declares the absenteeism gross-up as INVARIANT.
- [optimization-strategy.md] -- Same formulas with a detailed breakdown of available_hours deductions (paid breaks 30min, unpaid meal 30min, startup 15min, non-productive 15min = 60min total, yielding 7.0h from 8h shift). Includes absenteeism rates by workforce segment (permanent 5-7%, temp 10-15%, seasonal 12-18%).
- [schema.sql] -- `workload_plan` has `fte_needed` and `fte_assigned` columns. No `available_hours_per_fte` or `absenteeism_rate` columns.

**Quality assessment:** The FTE formula is clearly defined and consistent between invariants.md and optimization-strategy.md. The distinction between net FTE (before absenteeism) and gross FTE (after absenteeism) is clear. However, neither the `available_hours_per_fte` nor the `absenteeism_rate` values are stored anywhere in the schema.

**Contradictions found:** None between the defining documents. The formula is consistent.

**Missing pieces:**
1. `available_hours_per_fte` is not stored on `shift_pattern` or any other table. It must be computed from `shift_pattern.paid_hours` minus break deductions from `break_rules_json`. The computation logic is not defined.
2. `absenteeism_rate` is not stored anywhere. No table holds this value per site, per contract type, or per workforce segment. The optimizer cannot apply the gross-up formula.
3. The rounding strategy (ceiling, nearest, floor-with-flex, banker's) described in optimization-strategy.md is not configurable in the schema. No configuration field exists.

**Resolution:** Add `absenteeism_rate DECIMAL(4,3)` to `site` table (site-level default) with the possibility of override by contract_type in `settings_json`. Compute `available_hours_per_fte` from `shift_pattern.paid_hours` minus the sum of break durations in `break_rules_json`. Do not add a separate column -- derive it at computation time. Default rounding strategy is ceiling; store as a site-level setting in `settings_json`.

---

### INV-8: Workforce Identity

**Status:** WEAK

**Defining documents:**
- [invariants.md] -- Defines Employee with: `employee_number`, `contract_type` (full_time, part_time, temporary, seasonal, contractor), `weekly_hours_contracted`, `home_site_id`, `hourly_rate`, `is_multi_site_eligible`, `status` (active, on_leave, suspended, terminated)
- [schema.sql] -- `employee` table matches exactly: all fields present, correct types, correct enums. `contract_type` enum matches. `employee_status` enum matches. `is_multi_site_eligible` boolean present. `hourly_rate` decimal present.
- [data-entities.md] -- Employee entity definition matches schema.sql
- [wizard-flow.md] -- Phase 5 imports employees with: Employee ID, Name, Primary Site, Role, Contract Type, Skills, Weekly Contracted Hours, Availability Pattern

**Quality assessment:** The employee entity is well-defined and consistent across all documents. The schema implementation is complete for the core identity fields.

**Contradictions found:** None for the core employee entity.

**Missing pieces:**
1. No `role` or `position` field on the `employee` table. wizard-flow.md Phase 5 has "Role" as a required field (Warehouse Associate, Team Lead, Supervisor, etc.), but the schema has no role column. Roles appear to be implicit from skills/department, but the wizard collects them explicitly.
2. The cost model beyond `hourly_rate` is undefined in the schema. optimization-strategy.md references shift differentials (+15% night), weekend differentials (+25%), overtime premiums (1.5x/2x), and agency markup (40-60%). None of these are stored in the schema. They would need to be in `settings_json` or `labor_rule.parameters_json`.
3. Multi-site eligibility is modeled as a boolean but the wizard offers "Secondary Sites" as a multi-select. There is no `employee_site_eligibility` join table to store which specific secondary sites an employee can work at.

**Resolution:** Roles are not a schema entity for MVP. The wizard collects role names for display and reporting only; they are stored in `employee.metadata_json`. Pay differentials (night, weekend, overtime) are stored in `labor_rule.parameters_json` for the applicable jurisdiction/site. Multi-site eligibility is boolean for MVP; the specific secondary sites are stored in `employee.preferences_json` as an array of site_ids. A dedicated join table is V2.

---

### INV-9: Skill Model

**Status:** CONTRADICTORY

**Defining documents:**
- [invariants.md] -- Declares 5-level proficiency as INVARIANT: Trainee (0.60), Basic (0.75), Competent (0.90), Proficient (1.00 baseline), Expert (1.10). "The 5-level structure is invariant."
- [schema.sql] -- `employee_skill.proficiency_level` has `CHECK (proficiency_level BETWEEN 1 AND 5)`. `process_productivity_standard.skill_level` has `CHECK (skill_level BETWEEN 1 AND 5)`. Both enforce 5 levels.
- [skill-matching.md] -- Defines the same 5-level scale with identical labels and multipliers
- [optimization-strategy.md] -- Uses the same 5-level scale with identical multipliers
- [wizard-flow.md] -- Phase 5 defines proficiency levels as: "Default: 4-level scale -- Trainee (50% productivity), Developing (75%), Proficient (100%), Expert (110%). Customizable."
- [SYSTEMS-REVIEW.md] -- SR-1.5: "The wizard defaults to a 4-level proficiency scale. The optimizer assumes a 5-level scale."

**Quality assessment:** The 5-level model is precisely defined in invariants.md, schema.sql, skill-matching.md, and optimization-strategy.md. The contradiction is isolated to wizard-flow.md which defines a 4-level default with different labels and different multipliers (50% vs 60% for trainee, missing "Basic" level entirely).

**Contradictions found:**
1. wizard-flow.md uses 4 levels: Trainee (50%), Developing (75%), Proficient (100%), Expert (110%). invariants.md uses 5 levels: Trainee (60%), Basic (75%), Competent (90%), Proficient (100%), Expert (110%). The labels do not match (Developing vs Basic+Competent), the multipliers do not match (50% vs 60% for Trainee), and there are 4 levels vs 5.
2. wizard-flow.md says proficiency levels are "Customizable." invariants.md says "The 5-level structure is invariant." These directly contradict.
3. Certifications are stored on `employee_skill` (`certification_date`, `expiry_date`) in the schema, conflating proficiency and certification. invariants.md Section 4.3 notes this is acceptable for MVP but identifies it as a design debt. skill-matching.md defines a separate certification model with statuses (active, expiring_soon, expired, suspended) that maps onto the `expiry_date` field on `employee_skill`.

**Missing pieces:**
1. `last_practiced_date` is not on `employee_skill`. Required for skill decay (skill-matching.md Section 5). SYSTEMS-REVIEW confirms this is missing.
2. No skill adjacency matrix entity exists in the schema. skill-matching.md Section 3 defines adjacency values but they are not stored anywhere.

**Resolution:** The proficiency scale is fixed at 5 levels. wizard-flow.md Phase 5 must be updated to present 5 levels with the labels and multipliers from invariants.md: Trainee (0.60), Basic (0.75), Competent (0.90), Proficient (1.00), Expert (1.10). The "Customizable" option is removed for MVP. Add `last_practiced_date DATE` to `employee_skill` (nullable, populated later). Skill adjacency matrix is V2.

---

### INV-10: Availability Model

**Status:** WEAK

**Defining documents:**
- [invariants.md] -- Declares a template + override model as INVARIANT. Template = weekly recurring pattern in `employee.preferences_json`. Override = date-specific exceptions (leave, absence, training, extra_availability) with status (planned, confirmed, cancelled). States: "Without overrides, the system cannot represent planned absences."
- [schema.sql] -- `employee.preferences_json` exists (JSONB). No `employee_availability_override` table exists.
- [SYSTEMS-REVIEW.md] -- SR-1.3: "No absence/availability override entity exists. The schema has no `employee_availability_override` or equivalent."
- [wizard-flow.md] -- Phase 5 collects "Availability Pattern" as a weekly grid (day x shift). No mechanism for overrides.
- [constraint-handling.md] -- References "Employee availability" as a hard constraint ("Cannot assign an employee who is on leave") but has no entity to read leave data from.

**Quality assessment:** The template half of the model is defined (preferences_json). The override half is completely missing from the schema. This is identified by the SYSTEMS-REVIEW as a hard blocker. The invariants.md defines the required table structure precisely enough to implement.

**Contradictions found:** None between documents -- they all agree the override entity is needed. The contradiction is between what invariants.md requires and what schema.sql implements (nothing).

**Missing pieces:**
1. The `employee_availability_override` table does not exist. invariants.md specifies: `employee_id`, `organization_id`, `override_date` (or `start_date`/`end_date` for ranges), `override_type`, `status`, `reason`, `created_by`, timestamps.
2. No API or wizard mechanism to create overrides. The wizard does not address planned absences.
3. The template format in `preferences_json` is not defined -- no schema for the JSONB structure. A developer cannot implement the template parser without knowing the shape.

**Resolution:** Create `employee_availability_override` table with the columns specified in invariants.md Section 4.4 Resolution. Define the `preferences_json` template schema as: `{ "availability": { "monday": [{"start": "06:00", "end": "22:00"}], ... }, "preferred_shifts": ["day"], "max_overtime_hours": 8 }`. This is a build blocker -- must be implemented before the optimizer.

---

### INV-11: Constraint Model (hard/soft categorization)

**Status:** LOCKED

**Defining documents:**
- [invariants.md] -- Defines exactly two categories: hard (must satisfy, plan rejected if violated) and soft (penalized, configurable weights). Lists 10 hard constraints and 9 soft constraints with default weights.
- [constraint-handling.md] -- Expands the same two categories with jurisdiction-specific details, exact legal citations, enforcement mechanisms, and a complete relaxation priority order (9 steps).
- [schema.sql] -- `labor_rule.severity` is `enum('hard_constraint', 'soft_constraint', 'warning')`. `labor_rule.penalty_score` stores the weight for soft constraints. `labor_rule.rule_type` enum covers: max_daily_hours, max_weekly_hours, min_rest_between_shifts, max_consecutive_days, overtime_threshold_daily, overtime_threshold_weekly, mandatory_break, min_age, certification_required, union_seniority.
- [skill-matching.md] -- Layer 1 (hard constraint filtering) and Layer 2 (soft preference scoring) align with the two-category model.

**Quality assessment:** The hard/soft categorization is precisely defined and consistently implemented. The `labor_rule` table correctly models jurisdiction-scoped constraints with severity classification. The constraint-handling.md document is the most thorough document in the system, with complete jurisdiction profiles. Post-solve verification is defined in both invariants.md and constraint-handling.md.

**Contradictions found:** None. The `warning` severity in the enum (beyond hard/soft) is acceptable as an informational tier that does not affect the solver.

**Missing pieces:** None for the model itself. The jurisdiction data (seed rules) must be created as data, not code.

---

### INV-12: Allocation Output (ShiftAssignment entity)

**Status:** CONTRADICTORY

**Defining documents:**
- [invariants.md] -- Solver output contract defines assignments as: `employee_id`, `process_id`, `time_slot`, `shift_pattern_id`, `scheduled_hours`, `cost_estimate`. Also outputs: unmet_demand, soft_constraint_violations, metrics (total_cost, coverage_percentage, overtime_hours, solve_time_ms, optimality_gap, solver_strategy_used).
- [schema.sql] -- `shift_assignment` table has: `employee_id`, `shift_pattern_id`, `site_id`, `process_id`, `department_id`, `assignment_date` (DATE), `plan_version_id`, `start_time` (TIMESTAMPTZ), `end_time` (TIMESTAMPTZ), `scheduled_hours`, `actual_hours`, `overtime_hours`, `assignment_type`, `assignment_source`, `status`, `employee_acknowledged`, `override_reason`, `cost_estimate`.
- [optimization-strategy.md] -- Example output record includes `date`, `shift`, `start_time`, `end_time`, `process`, `zone`, `skill_level`, `cost`, `is_overtime`, `preference_matched`.

**Quality assessment:** The ShiftAssignment entity is well-defined in the schema and covers the solver output requirements. However, the solver output metadata (unmet_demand, soft_constraint_violations, metrics) has no storage location.

**Contradictions found:**
1. The solver output contract in invariants.md includes `unmet_demand` (slots where FTE requirements could not be filled). No table stores this. It would need to be stored on `workload_plan` (gap between `fte_needed` and `fte_assigned`) or in a separate entity.
2. The solver output includes `soft_constraint_violations` with `constraint_type`, `description`, `penalty_incurred`. No table stores this. `plan_version.summary_metrics_json` could hold it, but this is not defined.
3. The UNIQUE constraint on `shift_assignment` is `(organization_id, employee_id, assignment_date, plan_version_id, start_time)` which does not prevent overlapping time ranges. SYSTEMS-REVIEW SR-1.4 confirms this. invariants.md Section 5 specifies an exclusion constraint as the fix.
4. optimization-strategy.md example output includes `zone` which does not exist on `shift_assignment`. This is a minor inconsistency -- zone assignment is V2.

**Missing pieces:**
1. No storage for solver run metadata (unmet_demand detail, constraint violations, optimality_gap). These should be stored as JSONB on `plan_version.summary_metrics_json` or `plan_version.optimizer_config_json`.
2. The exclusion constraint for overlapping shifts is not implemented.

**Resolution:** Store solver run results in `plan_version.summary_metrics_json` with a defined schema: `{ "unmet_demand": [...], "soft_constraint_violations": [...], "metrics": { "total_cost": N, "coverage_percentage": N, "overtime_hours": N, "solve_time_ms": N, "optimality_gap": N, "solver_strategy_used": "..." } }`. Add the exclusion constraint from invariants.md Section 5 to prevent overlapping shifts.

---

### INV-13: Human Override (can a human always override AI?)

**Status:** MISSING

**Defining documents:**
- [invariants.md] -- Plan lifecycle (Section 7) defines the "Optimized" state where "Planner may review and manually adjust." Also defines "Locked assignments" in solver input that "must not change."
- [schema.sql] -- `shift_assignment.assignment_source` enum includes `'manual'` and `'swap'` alongside `'optimizer'` and `'ai_suggested'`. `shift_assignment.override_reason` is a text field. `plan_version.is_locked` boolean exists.
- [optimization-strategy.md] -- Mentions `override_count` in the audit trail (number of manual changes made by planner).

**Quality assessment:** The ability to manually create/modify assignments is implied by the `assignment_source` and `override_reason` fields. However, no document explicitly defines the override model: what happens when a human overrides an optimizer assignment? Is the plan re-validated? Are hard constraints still enforced? Can a human override a hard constraint?

**Contradictions found:** None -- but only because the topic is barely addressed. There is no explicit statement about whether human overrides can violate hard constraints.

**Missing pieces:**
1. No explicit policy on whether human overrides bypass hard constraint validation. The post-solve verification in invariants.md Section 5 says "after the solver produces a solution, every hard constraint is independently verified." Does this apply to manual edits too?
2. No workflow for manual edits on published plans. invariants.md says published plans are immutable ("no edits without creating a new version"). But the plan lifecycle does not define how a human creates a manual adjustment to a published plan.
3. No definition of what "locked assignments" means from the human side -- can a planner lock an assignment to prevent the optimizer from moving it on the next run?

**Resolution:** Human overrides are subject to hard constraint validation. A manual assignment that violates a hard constraint is rejected with an explanation, unless the user has an "override_hard_constraint" permission (admin only), in which case it is saved with `override_reason` mandatory and an audit record with `actor_type = 'user'`. Manual adjustments to published plans create a new plan version in Draft state. Locked assignments are set by the planner via a boolean `is_locked` flag on `shift_assignment` (field does not exist yet -- add it).

---

### INV-14: Explainability (can every decision be explained?)

**Status:** WEAK

**Defining documents:**
- [invariants.md] -- Section 9 (Audit Requirement) defines the audit_log structure: `actor_id`, `actor_type`, `action`, `entity_type`, `entity_id`, `before_state`, `after_state`. Optimizer runs must produce audit records with `input_hash` and `result_hash`.
- [schema.sql] -- `audit_log` table exists with correct structure. Immutable trigger prevents UPDATE/DELETE.
- [optimization-strategy.md] -- Section 8.3 defines optimizer audit trail: `run_id`, `trigger`, `input_hash`, `parameters_snapshot`, `solver_strategy`, `solve_time_ms`, `objective_values`, `constraint_violations`, `result_hash`, `accepted`, `override_count`.
- [constraint-handling.md] -- Section 7 defines infeasibility reports with bottleneck analysis, binding constraint identification, and resolution suggestions.

**Quality assessment:** The audit infrastructure is well-defined. The optimizer audit trail in optimization-strategy.md is comprehensive. The infeasibility diagnosis in constraint-handling.md provides per-decision explanations. However, per-assignment explanations ("why was Employee X assigned to Process Y at Time Z?") are not defined anywhere.

**Contradictions found:** None between documents.

**Missing pieces:**
1. No per-assignment explanation model. The solver produces assignments but does not explain why a specific employee was chosen for a specific slot. For explainability, each assignment should have a reason (e.g., "best skill match", "lowest cost", "only available qualified employee").
2. The optimizer audit trail fields from optimization-strategy.md (input_hash, parameters_snapshot, etc.) do not have a defined storage location. They could go in `plan_version.optimizer_config_json` or `audit_log.metadata_json`, but this is not specified.
3. No link between `audit_log` and `plan_version` for optimizer runs. The polymorphic reference (`entity_type = 'plan_version'`, `entity_id = plan_version.id`) works but the specific optimizer fields are not part of the audit_log schema.

**Resolution:** Per-assignment explanations are V2. For MVP, store optimizer run metadata in `plan_version.optimizer_config_json` (input parameters) and `plan_version.summary_metrics_json` (output metrics including constraint violations). Create one `audit_log` record per optimizer run with `action = 'optimize'`, `entity_type = 'plan_version'`, and `metadata_json` containing `input_hash`, `result_hash`, `solve_time_ms`, `solver_strategy_used`.

---

### INV-15: Tenant Isolation

**Status:** LOCKED

**Defining documents:**
- [invariants.md] -- Section 8 defines: every row has `organization_id`, RLS on every table, canonical RLS predicate is `organization_id = auth.organization_id()`. No cross-tenant access. Service role bypasses RLS (Supabase default, acceptable with audit).
- [schema.sql] -- RLS enabled on all 18 tables. `auth.organization_id()` function defined. Every table has `organization_id` NOT NULL FK. RLS policies use `organization_id = auth.organization_id()` consistently. Role-based write restrictions implemented.
- [SYSTEMS-REVIEW.md] -- Identifies three issues: (1) materialized views bypass RLS, (2) three different RLS mechanisms across documents, (3) tenant_id vs organization_id naming.

**Quality assessment:** The tenant isolation model is precisely defined and consistently implemented in schema.sql. RLS policies are correct. The materialized view bypass is a known issue with a defined fix. The RLS mechanism inconsistency across other documents is a documentation problem, not a schema problem -- schema.sql is authoritative.

**Contradictions found:**
1. Materialized views `mv_site_dashboard`, `mv_coverage_gaps`, `mv_skill_matrix` bypass RLS. This is a data leak, not a design contradiction. The fix is defined in invariants.md.
2. system-overview.md uses `auth.jwt() ->> 'tenant_id'`, backend-architecture.md uses `current_setting('app.tenant_id')`, schema.sql uses `auth.organization_id()`. schema.sql is correct and authoritative.

**Missing pieces:** None in the schema. The materialized view fix and naming standardization are remediation tasks, not missing design.

---

### INV-16: Configuration Model (how are settings scoped?)

**Status:** WEAK

**Defining documents:**
- [data-relationships.md] -- Section 10 Pattern 2: "Configuration flows downward with override capability: Organization.settings_json -> Site.settings_json -> Department settings (future) -> Process settings (embedded in process attributes)"
- [schema.sql] -- `organization.settings_json` (JSONB), `site.settings_json` (JSONB). No `department.settings_json`. Process has individual attribute columns, not a settings blob.
- [optimization-strategy.md] -- Section 8.1 defines a 7-level hierarchy: "Global Defaults -> Region -> Country -> Site Group -> Site -> Process -> Override"
- [invariants.md] -- Does not define a configuration model as a standalone invariant
- [SYSTEMS-REVIEW.md] -- Section 5: "7-level config hierarchy...Config inheritance bugs are notoriously hard. [Recommendation:] 3 levels: org -> site -> override"

**Quality assessment:** The configuration scoping model is inconsistently defined. data-relationships.md says 4 levels (org -> site -> dept -> process). optimization-strategy.md says 7 levels. SYSTEMS-REVIEW recommends 3 levels. The schema supports 2 levels (org -> site) via `settings_json`. No merge/override logic is defined anywhere.

**Contradictions found:**
1. optimization-strategy.md defines 7 levels of configuration cascade. SYSTEMS-REVIEW says use 3 levels. data-relationships.md implies 4 levels. These are three different designs.
2. No document defines what happens when `site.settings_json` contains a key that also exists in `organization.settings_json`. Is it a deep merge? Shallow override? No merge semantics are defined.

**Missing pieces:**
1. No definition of the `settings_json` schema -- which keys are valid, what types, what defaults.
2. No merge/override logic defined for resolving org-level vs site-level settings.
3. No mechanism for "override" level settings (per-plan or per-user session).

**Resolution:** Use 3 levels for MVP: Organization -> Site -> Runtime Override. Merge semantics: shallow key-level override (site key replaces org key; no deep merge). Define a `SettingsSchema` TypeScript type that enumerates all valid keys, types, and defaults. Document it in a settings reference. Do not implement Region, Country, or Site Group levels.

---

### INV-17: Separation of Engines (deterministic solver vs AI/ML)

**Status:** MISSING

**Defining documents:**
- [optimization-strategy.md] -- Describes solver strategies: Greedy heuristic, Constraint Programming, MIP, Hybrid. These are all deterministic. Also mentions "AI-suggested" in `assignment_source` enum but does not define an AI/ML engine.
- [schema.sql] -- `assignment_source` enum includes `'ai_suggested'`. `plan_generated_by` enum includes `'ai_optimizer'`. `pps_source` enum includes `'ai_estimated'`. `demand_source` enum includes `'ai_forecast'`. These reference AI capabilities but no separation boundary is defined.
- [invariants.md] -- Section 1.4: "The ALGORITHM used to produce the output is implementation (greedy, MIP, CP, future AI -- can change). The INPUT/OUTPUT CONTRACT is invariant." This implies AI is a future solver variant, not a separate engine.
- [wizard-flow.md] -- References "AI-assisted" setup throughout (company lookup, template suggestions, CBA parsing). These are distinct from the planning solver.

**Quality assessment:** No document defines the boundary between the deterministic optimization engine and AI/ML components. The system references AI in at least 4 enums and throughout the wizard, but there is no architectural document that separates: (a) the deterministic solver (greedy/MIP/CP), (b) AI-assisted forecasting (demand_source = 'ai_forecast'), (c) AI-assisted configuration (wizard AI), and (d) AI-suggested assignments (assignment_source = 'ai_suggested').

**Contradictions found:** None -- there is nothing to contradict because no separation is defined.

**Missing pieces:**
1. No definition of what "ai_optimizer" means vs the deterministic solver. Is it a separate code path? A wrapper? A different algorithm?
2. No definition of when `assignment_source = 'ai_suggested'` is used vs `'optimizer'`.
3. No isolation boundary preventing AI/ML from modifying plans without human approval.

**Resolution:** For MVP, there is no AI/ML engine. The solver is deterministic (Greedy + MIP via HiGHS). `plan_generated_by = 'ai_optimizer'` is unused for MVP. `assignment_source = 'ai_suggested'` is unused for MVP. `demand_source = 'ai_forecast'` is unused for MVP. `pps_source = 'ai_estimated'` is unused for MVP. Wizard AI assistance is a UX feature (Claude API calls for suggestions) that does not affect the planning engine. Document this boundary: "For MVP, all plan generation is deterministic. AI enums exist in the schema for V2+ but are not used by the solver."

---

### INV-18: Scenario Parity (can scenarios be compared on equal terms?)

**Status:** WEAK

**Defining documents:**
- [schema.sql] -- `scenario` table with `assumptions_json`, `comparison_metrics_json`, `status`. `plan_version.scenario_id` FK links plan versions to scenarios. `plan_version.summary_metrics_json` stores aggregate KPIs.
- [data-relationships.md] -- Section 5: Scenario forks from a parent PlanVersion. "The fork creates a new PlanVersion that copies the parent's demand forecasts and workload plans, then applies scenario-specific assumption adjustments."
- [optimization-strategy.md] -- Multi-objective optimization supports Pareto frontier mode "used in scenario simulation mode."
- [SYSTEMS-REVIEW.md] -- Section 4.2: "Comparing 3 scenarios requires cross-version joins on WorkloadPlan and ShiftAssignment... No materialized view covers cross-version comparison."

**Quality assessment:** The scenario model (fork from baseline, independent plan versions, assumption overrides) is structurally sound. However, the comparison mechanism is weak -- `comparison_metrics_json` on `scenario` and `summary_metrics_json` on `plan_version` are undefined JSONB blobs with no schema.

**Contradictions found:** None between documents.

**Missing pieces:**
1. No defined schema for `comparison_metrics_json` or `summary_metrics_json`. A developer cannot implement scenario comparison without knowing which metrics to compute and store.
2. No pre-computation of comparison metrics when a scenario solve completes (SYSTEMS-REVIEW Section 4.2 identifies this).
3. No definition of what "equal terms" means -- do all scenarios use the same demand baseline? Same employee pool? Same constraints? The fork model implies yes (copies parent data), but assumption adjustments can change any of these, making comparison potentially apples-to-oranges.
4. No mechanism to ensure scenarios derived from the same baseline use the same snapshot of employee/skill data if that data changes between scenario solves.

**Resolution:** When a scenario solve completes, compute and store standardized KPIs in `plan_version.summary_metrics_json`: `{ "total_cost": N, "coverage_pct": N, "overtime_hours": N, "fte_assigned": N, "fte_required": N, "avg_skill_match": N, "soft_constraint_score": N, "solve_time_ms": N }`. Scenario comparison queries `plan_version` directly on these fields. All scenarios forked from the same parent share the baseline demand and employee snapshot at fork time. Post-fork data changes do not retroactively affect the scenario.

---

### INV-19: Actuals Feedback (plan vs actual divergence)

**Status:** WEAK

**Defining documents:**
- [schema.sql] -- `shift_assignment.actual_hours` (DECIMAL, nullable) exists alongside `scheduled_hours`. `demand_forecast.is_actual` boolean distinguishes forecasts from actuals.
- [optimization-strategy.md] -- Section 8.2 "Continuous Calibration": productivity rate calibration (planned vs actual throughput weekly), absenteeism rate update (rolling 13-week average), shift factor validation (planned vs actual hours per unit by shift), objective weight tuning (track plan acceptance rate).
- [data-entities.md] -- DemandForecast: `is_actual` field "True when replaced with actual demand data"

**Quality assessment:** The feedback mechanism has storage hooks (`actual_hours`, `is_actual`) but no computation pipeline. optimization-strategy.md describes what should be calibrated but not how the data flows from actuals to updated parameters.

**Contradictions found:** None between documents.

**Missing pieces:**
1. No pipeline to populate `shift_assignment.actual_hours`. No integration point defined for time & attendance systems.
2. No pipeline to convert actual demand into updated productivity rates. optimization-strategy.md says "Compare planned vs. actual throughput weekly" but no job, trigger, or API is defined to do this.
3. No storage for historical plan-vs-actual comparisons. A planner cannot see "last week we planned 100 FTE for picking and used 95" without an ad-hoc query.
4. No mechanism to update `process_productivity_standard.units_per_hour` based on actuals. The `source` enum includes `'historical'` but no automated update path exists.

**Resolution:** For MVP, `actual_hours` is manually entered or imported via CSV. `is_actual` on demand_forecast is set manually when actual demand data is uploaded. Automated calibration pipelines (productivity rate updates, absenteeism rate updates) are V2. A simple "Plan vs Actual" report is MVP scope: query `shift_assignment` comparing `scheduled_hours` vs `actual_hours` and `workload_plan.fte_needed` vs `workload_plan.fte_assigned` for published plan versions.

---

### INV-20: Setup Wizard Boundary (does the wizard produce exactly the data the optimizer needs?)

**Status:** CONTRADICTORY

**Defining documents:**
- [wizard-flow.md] -- 8 phases producing: Organization, Sites, Processes (with productivity standards), Demand Types (with process mappings and sources), Employees (with skills and availability patterns), Labor Rules, Planning Preferences (objective weights, thresholds, approval workflows)
- [invariants.md] -- Solver input contract (Section 6.1) requires: site_id, planning_horizon, time_slots, demand (ProcessDemand per slot), employees (with skills, availability ranges, current_week_hours, consecutive_days_worked), hard_constraints, soft_constraints, locked_assignments, objective config, time_budget_seconds
- [optimization-strategy.md] -- Solver requires: normalized demand per process per time slot, productivity standards per skill level, absenteeism rates, shift timing factors, learning curve factors
- [SYSTEMS-REVIEW.md] -- Section 4.3: "The wizard tries to do too much in one flow. 8 phases, 75-295 minutes, requiring knowledge from 4-6 different people."

**Quality assessment:** The wizard produces most of what the optimizer needs but has specific gaps and overreach.

**Contradictions found:**
1. The wizard collects a 4-level proficiency scale (Phase 5) but the optimizer requires a 5-level scale. Data entered through the wizard is incompatible with the optimizer's proficiency model. (Repeat of INV-9.)
2. The wizard collects "Forecast Granularity" options including sub-daily (15-min, hourly), but the schema can only store daily/weekly/monthly. The wizard promises capabilities the data model cannot deliver. (Repeat of INV-4.)
3. The wizard does not collect absenteeism rates, shift timing factors, or available_hours_per_FTE -- all required by the optimizer. The optimizer has no source for these values after wizard completion.

**Missing pieces:**
1. No wizard step for `employee_availability_override` (planned absences/leave). The optimizer needs this but the wizard does not collect it.
2. No wizard step for absenteeism rate configuration. The FTE gross-up formula requires it.
3. No wizard step for demand-to-process time lag (defined in wizard-flow.md Tab 3 but not stored in any schema entity).
4. The wizard collects demand distribution curves (uniform, front-loaded, etc.) but no schema entity stores intra-day distribution profiles.

**Resolution:** The wizard must be updated to: (a) enforce 5-level proficiency scale, (b) remove sub-daily forecast granularity options until the schema supports them (or fix the schema first per INV-4), (c) add a default absenteeism rate configuration step (site-level, with per-contract-type overrides), (d) defer demand distribution curves and time lag to V2 -- remove from wizard Phase 4. Availability overrides (leave/absence) are not part of the wizard; they are entered through the main application after go-live.
