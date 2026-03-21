# Critical Blockers: Pre-Build Resolution List

> **Status:** Must be resolved before Day 1 of coding.
> **Authority:** Compiled from SYSTEMS-REVIEW.md, contradictions-and-gaps.md, invariants.md, and build-readiness-check.md.
> **Date:** 2026-03-20

Ranked by "If you could only fix 5 things before Day 1, which 5?" The first 5 are non-negotiable. Items 6-10 are required within Week 1 but do not block the literal first line of code.

---

## Blocker 1: DemandForecast Uses DATE, Not timestamptz

**What is blocked:** The entire demand-to-workload pipeline (Invariant 1, Stage 1-2). Every downstream computation inherits this error.

**Why it's a blocker:** The `demand_forecast` table uses `forecast_date DATE`. Sub-daily demand cannot be stored. A warehouse that needs to distinguish "500 orders between 06:00-14:00" from "500 orders between 14:00-22:00" cannot express this in the schema. The core formula `required_hours = process_volume / productivity_rate` is computed once per day instead of per shift, systematically understaffing evening shifts by up to 40% and overstaffing mornings. This is not a feature gap -- it is a computation error baked into the data model.

**Resolution:** Replace `demand_forecast.forecast_date` (DATE) with `period_start` (timestamptz) + `period_end` (timestamptz). Remove the `demand_granularity` ENUM (`daily`, `weekly`, `monthly`) entirely -- granularity is implicit in the period duration. Update the UNIQUE constraint to key on `(organization_id, site_id, demand_type_id, period_start, period_end, plan_version_id)`.

**Affected invariants:** INV-1 (Planning Flow), INV-3 (Time Model)

**Effort:** 4 hours (schema change + ENUM removal + constraint update + migration script)

---

## Blocker 2: No Absence/Leave Entity Exists

**What is blocked:** Optimizer constraint evaluation (Invariant 5), availability checking (Invariant 4), control room absence monitoring, the entire plan-reality feedback loop.

**Why it's a blocker:** The optimizer checks "employee is not on leave" as a hard constraint. The Control Room shows an "Absenteeism Monitor" widget. There is no table to store any of this data. The `employee` table has `preferences_json` for recurring availability patterns but nothing for date-specific exceptions. The system cannot distinguish "employee works Mondays" (template) from "employee is on vacation next Monday" (instance). Every plan the system produces ignores planned absences. This is a Day-1 user failure -- the first planner who imports their team will immediately ask "where do I enter next week's vacation?"

**Resolution:** Create `employee_availability_override` table:
```sql
CREATE TABLE employee_availability_override (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id),
  employee_id UUID NOT NULL REFERENCES employee(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  override_type VARCHAR(20) NOT NULL CHECK (override_type IN ('leave','absence','training','unavailable','extra_availability')),
  status VARCHAR(20) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed','cancelled')),
  reason TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Enable RLS with `organization_id = auth.organization_id()`.

**Affected invariants:** INV-4 (Workforce Model), INV-5 (Constraint Model)

**Effort:** 4 hours (schema + RLS policy + basic CRUD endpoint)

---

## Blocker 3: RLS Mechanism Not Standardized

**What is blocked:** Every table creation, every query, every Edge Function (Invariant 8). Three different RLS mechanisms exist across three documents. Building on any of them risks choosing the wrong one and rewriting all policies later.

**Why it's a blocker:** `system-overview.md` uses `auth.jwt() ->> 'tenant_id'`. `backend-architecture.md` uses `current_setting('app.tenant_id')`. `schema.sql` uses `auth.organization_id()`. If the first engineer uses one mechanism and the second uses another, some tables will silently lack tenant isolation. This is a security vulnerability that compounds with every table created.

**Resolution:** Canonicalize on the `schema.sql` approach: `auth.organization_id()` which reads from `request.jwt.claims ->> 'organization_id'`. This is Supabase-native and works with Supabase Auth JWTs. Use `current_setting('app.tenant_id')` only for service-role connections in background jobs (optimizer, sync) where no JWT exists, and document this exception explicitly. Update all documents to reference this single mechanism.

**Affected invariants:** INV-8 (Multi-Tenancy Boundary)

**Effort:** 4 hours (document update + verify schema.sql policies + write canonical RLS template)

---

## Blocker 4: Materialized Views Bypass RLS (Cross-Tenant Data Leakage)

**What is blocked:** Safe deployment of any dashboard or reporting feature (Invariant 8). `mv_site_dashboard`, `mv_coverage_gaps`, and `mv_skill_matrix` aggregate across all organizations.

**Why it's a blocker:** PostgreSQL materialized views use definer privileges, not invoker privileges. RLS policies do not apply. Any application query against these views without a manually injected `WHERE organization_id = ...` returns data from every tenant. This is a data breach waiting to happen. It cannot be "fixed later" because every dashboard built against these views inherits the vulnerability.

**Resolution:** Replace all materialized views with security-definer functions that wrap the query and inject `WHERE organization_id = auth.organization_id()`. The function signature returns the same columns as the materialized view. Callers use `SELECT * FROM fn_site_dashboard()` instead of `SELECT * FROM mv_site_dashboard`. Accept the performance cost for MVP; add per-tenant materialized views in V2 if performance requires it.

**Affected invariants:** INV-8 (Multi-Tenancy Boundary)

**Effort:** 6 hours (rewrite 3 materialized views as security-definer functions + update all references)

---

## Blocker 5: Solver I/O Contract Does Not Exist

**What is blocked:** Parallel development between frontend team (optimization progress UI), backend team (result-writing pipeline), solver team (algorithm implementation), and test team (solver fixtures) (Invariant 6).

**Why it's a blocker:** Five solver strategies are described across the optimization documents. None define the data structure the solver consumes or produces. Without typed interfaces, no team can build against the optimizer boundary. The frontend cannot build the "Optimizing..." progress UI. The backend cannot build the result-writing pipeline. Tests cannot validate solver correctness. This blocks all parallel development on the optimization layer.

**Resolution:** Publish the `SolverInput` and `SolverOutput` TypeScript interfaces defined in invariants.md Section 6 to `src/types/solver.ts`. Include full type definitions for `TimeSlot`, `ProcessDemand`, `EmployeeRecord`, `Assignment`, `HardConstraint`, `SoftConstraint`, `Violation`, `ObjectiveConfig`, and `UnmetDemandSlot`. Write a contract validation function that verifies any `SolverOutput` satisfies all hard constraints from the corresponding `SolverInput`.

**Affected invariants:** INV-6 (Solver Contract)

**Effort:** 1 day (type definitions + validation function)

---

## Blocker 6: WorkloadPlan Is Per-Day, Not Per-Shift

**What is blocked:** Accurate FTE calculation for any site with heterogeneous skill distribution across shifts (Invariant 1, Stage 2-3).

**Why it's a blocker:** `workload_plan` uses a single `weighted_uph` per day. Morning shifts (experienced workers, 100% UPH) and evening shifts (trainees, 65% UPH) get the same rate. The system understaffs evenings and overstaffs mornings. This is a systematic computation error, not a missing feature.

**Resolution:** Change `workload_plan` to one record per time slot (matching demand granularity). Replace `plan_date DATE` with `period_start timestamptz` + `period_end timestamptz`. Compute `weighted_uph` per slot using the available workforce for that specific slot.

**Affected invariants:** INV-1 (Planning Flow), INV-3 (Time Model)

**Effort:** 4 hours (schema change + formula update)

---

## Blocker 7: Overlapping Shift Assignments Not Prevented

**What is blocked:** Hard constraint integrity -- the guarantee that no employee is double-booked (Invariant 5).

**Why it's a blocker:** The UNIQUE constraint on `shift_assignment` is on `(employee_id, assignment_date, plan_version_id, start_time)`. It prevents identical start times but not overlapping time ranges. Shifts 06:00-14:30 and 08:00-16:30 for the same employee both insert successfully. The solver may produce valid output, but manual edits or concurrent plan merges can create overlaps that the database does not reject.

**Resolution:** Add a PostgreSQL exclusion constraint:
```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE shift_assignment
  ADD CONSTRAINT no_overlapping_shifts
  EXCLUDE USING gist (
    employee_id WITH =,
    plan_version_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  );
```

**Affected invariants:** INV-5 (Constraint Model)

**Effort:** 2 hours (extension + constraint + test)

---

## Blocker 8: Plan State Enum Missing Required States

**What is blocked:** The plan lifecycle workflow -- specifically the distinction between "solver has run" (Optimized) and "manager can see it" (Proposed), and the critical Published and Stale states (Invariant 7).

**Why it's a blocker:** The current `approval_status` ENUM is `(draft, pending_review, approved, rejected, superseded)`. Missing: `optimized`, `proposed` (renamed from pending_review for clarity), `published`, and `stale`. Without `published`, there is no distinction between "approved" and "active schedule that employees see." Without `stale`, there is no mechanism to flag plans whose inputs have changed.

**Resolution:** Replace `approval_status` with:
```sql
CREATE TYPE plan_status AS ENUM (
  'draft', 'optimized', 'proposed', 'approved',
  'published', 'stale', 'superseded', 'rejected'
);
```
Add transition validation as a BEFORE UPDATE trigger that rejects invalid state changes.

**Affected invariants:** INV-7 (Plan Lifecycle)

**Effort:** 4 hours (ENUM change + transition trigger + role permission mapping)

---

## Blocker 9: Naming Inconsistency (tenant_id vs organization_id)

**What is blocked:** Module integration -- engineers working on different modules will use different column names, causing join failures and query errors at integration time (Invariant 8).

**Why it's a blocker:** `system-overview.md` uses `tenant_id`. `schema.sql` uses `organization_id`. `backend-architecture.md` uses both. `build-sequence.md` references `DemandSignal` as a table name that does not exist in `schema.sql` (which calls it `demand_forecast`). If two engineers independently build modules from different documents, their code will not integrate without column name mapping.

**Resolution:** The canonical column name is `organization_id` (matching schema.sql). The canonical table name for demand data is `demand_forecast`. Find-and-replace `tenant_id` with `organization_id` across all documents. Create a glossary mapping document-level names to schema-level names.

**Affected invariants:** INV-8 (Multi-Tenancy Boundary), INV-2 (Organization Hierarchy)

**Effort:** 3 hours (document search-and-replace + glossary creation)

---

## Blocker 10: Proficiency Scale Mismatch (4-Level vs 5-Level)

**What is blocked:** Accurate productivity computation in the optimizer (Invariant 4), correct constraint enforcement for minimum skill levels (Invariant 5).

**Why it's a blocker:** The wizard defaults to 4 levels. The optimizer assumes 5 levels. If an organization uses 4 levels, their "Expert" (level 4 in a 4-level system) maps to "Proficient" (level 4 in a 5-level system), receiving a 1.0x multiplier instead of 1.1x. Every expert employee is silently undercounted. This is not a UI issue -- it is a computation error that affects every plan for any organization that completes the wizard with defaults.

**Resolution:** Fix the proficiency scale at 5 levels system-wide for MVP. Change the wizard to enforce 5 levels with the labels and multipliers defined in invariants.md Section 4.2 (Trainee 0.60, Basic 0.75, Competent 0.90, Proficient 1.00, Expert 1.10). The CHECK constraint `BETWEEN 1 AND 5` in the schema is correct. The wizard default must match. Post-MVP, make the scale configurable by adding `proficiency_scale_config` to Organization.

**Affected invariants:** INV-2 (Organization Hierarchy), INV-4 (Workforce Model)

**Effort:** 2 hours (wizard default change + documentation alignment)

---

## Priority Summary

| Priority | Blocker | Effort | Must Complete Before |
|----------|---------|--------|---------------------|
| 1 | Time model fix (demand_forecast + workload_plan) | 8 hours | Day 1 |
| 2 | Absence entity creation | 4 hours | Day 1 |
| 3 | RLS mechanism standardization | 4 hours | Day 1 |
| 4 | Materialized view RLS fix | 6 hours | Day 1 |
| 5 | Solver I/O contract publication | 8 hours | Day 1 |
| 6 | Shift overlap exclusion constraint | 2 hours | Week 1 |
| 7 | Plan state enum extension | 4 hours | Week 1 |
| 8 | Naming standardization | 3 hours | Week 1 |
| 9 | Proficiency scale alignment | 2 hours | Week 1 |
| 10 | Schema structure decision (flat public) | 1 hour | Week 1 |

**Total effort for all 10 blockers: approximately 42 hours (5-6 working days).**

If you can only fix 5 before Day 1: fix items 1-5. The rest can be completed in parallel during Week 1 sprint planning.
