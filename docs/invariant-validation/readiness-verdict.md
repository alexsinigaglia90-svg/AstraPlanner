# Invariant Validation: Final Readiness Verdict

> **Date:** 2026-03-20
> **Scope:** All 9 core invariants (20 sub-invariants assessed)
> **Authority:** This document is the gate decision. Build does not start until conditions are met.

---

## Section 1: Invariant Status Summary

| # | Invariant | Sub-Invariant | Status | Blocking Issue |
|---|-----------|--------------|--------|----------------|
| 1a | Planning Flow | Demand Signal | WEAK | `forecast_date DATE` must become `period_start/period_end timestamptz` |
| 1b | Planning Flow | Workload Computation | WEAK | `workload_plan` is per-day, must be per-slot |
| 1c | Planning Flow | FTE Requirement | WEAK | Allowance factor representation undefined |
| 1d | Planning Flow | Assignment Optimization | CONTRADICTORY | No solver I/O contract exists; 3 solver architectures documented |
| 1e | Planning Flow | Published Plan | WEAK | Plan state enum incomplete |
| 2a | Org Hierarchy | Org/Site/Dept/Process | LOCKED | Well-defined in schema |
| 2b | Org Hierarchy | Proficiency Scale | CONTRADICTORY | 4-level vs 5-level mismatch |
| 2c | Org Hierarchy | Schema Structure | CONTRADICTORY | Flat vs modular undecided |
| 3a | Time Model | Time Period Representation | WEAK | DATE columns instead of timestamptz |
| 3b | Time Model | Shift Definition | LOCKED | ShiftPattern entity is sound |
| 3c | Time Model | Timezone Handling | LOCKED | Sites have timezone; timestamptz used for assignments |
| 4a | Workforce Model | Employee Entity | LOCKED | Well-defined in schema |
| 4b | Workforce Model | Skill/Proficiency | LOCKED | 5-level model with multipliers defined (pending wizard fix) |
| 4c | Workforce Model | Certification | LOCKED | Separate from proficiency, with expiry |
| 4d | Workforce Model | Availability Override | MISSING | No entity exists |
| 5a | Constraint Model | Hard/Soft Categories | LOCKED | Well-defined with comprehensive catalog |
| 5b | Constraint Model | Overlap Prevention | WEAK | UNIQUE constraint insufficient; needs exclusion constraint |
| 6 | Solver Contract | I/O Interface | MISSING | No typed interface exists |
| 7 | Plan Lifecycle | State Machine | WEAK | States exist but transitions not formalized |
| 8a | Multi-Tenancy | RLS Policies | CONTRADICTORY | Three different mechanisms across documents |
| 8b | Multi-Tenancy | Materialized View Safety | WEAK | Known cross-tenant leakage |
| 8c | Multi-Tenancy | Naming Consistency | CONTRADICTORY | tenant_id vs organization_id |
| 9 | Audit | Audit Log | LOCKED | Schema correct; immutability trigger exists |

**Status Counts:**

| Status | Count | Percentage |
|--------|-------|-----------|
| LOCKED | 8 | 40% |
| WEAK | 6 | 30% |
| CONTRADICTORY | 4 | 20% |
| MISSING | 2 | 10% |
| **Total** | **20** | 100% |

---

## Section 2: Build Readiness Assessment

**Can an engineer start coding on Day 1?** Conditional -- No, not today. Yes, after 5 days of resolution work.

**What SPECIFICALLY must be done first:**

| Action | Effort | Owner |
|--------|--------|-------|
| 1. Fix `demand_forecast` schema (DATE -> timestamptz) | 4 hours | Data engineer |
| 2. Fix `workload_plan` schema (per-day -> per-slot) | 4 hours | Data engineer |
| 3. Create `employee_availability_override` table | 4 hours | Data engineer |
| 4. Add shift overlap exclusion constraint | 2 hours | Data engineer |
| 5. Publish solver I/O contract as TypeScript interfaces | 8 hours | Lead engineer |
| 6. Standardize RLS on `auth.organization_id()` | 4 hours | Security lead |
| 7. Replace materialized views with security-definer functions | 6 hours | Data engineer |
| 8. Extend plan state ENUM + add transition validation trigger | 4 hours | Backend engineer |
| 9. Standardize naming (organization_id everywhere) | 3 hours | Any engineer |
| 10. Fix wizard proficiency scale to 5 levels | 2 hours | Frontend engineer |
| **Total** | **41 hours** | |

**Realistic "Day 1" date:** If resolution work starts March 21, 2026, build can begin **March 28, 2026** (5 working days later).

---

## Section 3: Locked Invariants (Safe to Build Against)

These invariants need NO further specification work. Engineers can build against them immediately.

**INV-2a: Organization Hierarchy (Org/Site/Department/Process)**
The four-level hierarchy is well-defined in `schema.sql` with correct foreign keys, constraints, and RLS policies. Every table carries `organization_id`. Sites have timezone and operating hours. Departments are optional. Processes have unit of measure and skill requirements. This is bedrock.

**INV-3b: Shift Definition**
The `shift_pattern` entity correctly models named shift templates with start/end times, break rules (JSONB), days of week, overnight flag, and duration. Shift assignments use concrete timestamptz for actual start/end, allowing deviation from templates.

**INV-3c: Timezone Handling**
All timestamps are stored as `timestamptz`. Sites have a `timezone` field in IANA format. The convention is established: store in UTC, display in site-local time at the presentation layer.

**INV-4a: Employee Entity**
Well-defined with employee_number, contract_type, weekly_hours_contracted, home_site_id, hourly_rate, status, and multi-site eligibility. Foreign keys and constraints are correct.

**INV-4b: Skill/Proficiency Model**
The 5-level model with defined multipliers (0.60, 0.75, 0.90, 1.00, 1.10) is sound. Level 4 (Proficient) is baseline. The `employee_skill` table correctly models (employee, process, proficiency_level). Pending wizard fix is a UI change, not a model change.

**INV-4c: Certification Model**
Separate from proficiency. Has issued_date, expiry_date, and status. A Level 5 employee with an expired certification cannot be assigned. The model is correct.

**INV-5a: Hard/Soft Constraint Categories**
The constraint catalog is comprehensive: 10 hard constraint types, 9 soft constraint types with default weights. The hard/soft distinction is clear and invariant. Post-solve verification is defined.

**INV-9: Audit Requirement**
The `audit_log` table has correct structure: actor_id, actor_type, action, entity_type, entity_id, before_state (JSONB), after_state (JSONB), created_at. Immutability trigger prevents UPDATE/DELETE. Polymorphic references survive entity deletion.

---

## Section 4: Conditional Pass (< 1 Day Each)

These invariants are ALMOST locked. Each needs less than 1 day of work.

**INV-1c: FTE Requirement (Allowance Factor)**
Status: WEAK. Issue: Ambiguity between scalar and itemized allowance factor.
Work needed: Document the decision (scalar for computation, itemized for configuration) in invariants.md Section 1.2. Already resolved in pre-build-decisions.md D-07.
Effort: 1 hour.

**INV-1e: Published Plan (State Enum)**
Status: WEAK. Issue: `approval_status` ENUM missing `optimized`, `published`, `stale` states.
Work needed: Replace ENUM. Add transition validation trigger. Map roles to transitions.
Effort: 4 hours.

**INV-2b: Proficiency Scale**
Status: CONTRADICTORY. Issue: Wizard defaults to 4 levels; schema/optimizer use 5.
Work needed: Fix wizard to present 5 levels. Already decided (D-03): 5 levels fixed for MVP.
Effort: 2 hours.

**INV-5b: Overlap Prevention**
Status: WEAK. Issue: UNIQUE constraint does not prevent overlapping time ranges.
Work needed: Add `btree_gist` extension and exclusion constraint.
Effort: 2 hours.

**INV-7: Plan Lifecycle (State Machine)**
Status: WEAK. Issue: Valid transitions not formalized; role permissions not mapped.
Work needed: Define transition table (done in missing-definitions.md MD-03). Implement as trigger.
Effort: 4 hours.

**INV-8c: Naming Consistency**
Status: CONTRADICTORY. Issue: `tenant_id` vs `organization_id` across documents.
Work needed: Find-and-replace across all documentation. Create glossary.
Effort: 3 hours.

---

## Section 5: Hard Blockers (> 1 Day of Work)

These invariants are NOT lockable without significant work. They must be resolved before the phase that depends on them, but not necessarily before Day 1 of coding.

**INV-1a + INV-3a: Demand Signal + Time Period Representation**
Status: WEAK. Dependency: Blocks demand ingestion (Phase 1 Week 6).
Work needed: Replace `forecast_date DATE` with `period_start/period_end timestamptz` in `demand_forecast`. Remove `demand_granularity` ENUM. Update UNIQUE constraints. Propagate change to `workload_plan` (same fix). Update all references in documentation.
Effort: 1 day (8 hours schema + migration + doc update).
Must be done before: Week 6 (demand ingestion code).
Recommended: Do it in pre-build resolution week.

**INV-1d + INV-6: Assignment Optimization + Solver Contract**
Status: CONTRADICTORY / MISSING. Dependency: Blocks solver development (Phase 3 Week 9).
Work needed: Publish TypeScript interfaces for `SolverInput` and `SolverOutput`. Define all sub-types (`TimeSlot`, `ProcessDemand`, `EmployeeRecord`, `Assignment`, etc.). Write contract validation function. Resolve 3-way solver architecture contradiction (already decided: greedy + HiGHS MIP).
Effort: 1.5 days (type definitions + validation function + documentation).
Must be done before: Week 9 (solver development).
Recommended: Do it in pre-build resolution week so all teams can develop against the contract in parallel.

**INV-4d: Availability Override Entity**
Status: MISSING. Dependency: Blocks employee CRUD (Phase 1 Week 3) and optimizer (Phase 3).
Work needed: Create `employee_availability_override` table with RLS, indexes, and CRUD endpoints. Define override types and status values. Add audit trigger.
Effort: 1 day (schema + API + tests).
Must be done before: Week 3 (employee management).
Recommended: Do it in pre-build resolution week.

**INV-8a + INV-8b: RLS Policies + Materialized View Safety**
Status: CONTRADICTORY / WEAK. Dependency: Blocks every table creation (Phase 0 Week 1).
Work needed: Standardize on `auth.organization_id()` mechanism. Update all documents. Replace 3 materialized views with security-definer functions. Write RLS integration test template.
Effort: 1.5 days (standardization + function rewrites + test template).
Must be done before: Day 1 of coding.
This is non-negotiable. Cannot proceed without it.

---

## Section 6: Final Verdict

The AstraPlanner foundation is architecturally sound. The core abstractions -- the demand-to-workforce pipeline, the organization hierarchy, the constraint model, the audit system -- are well-designed and would survive implementation without structural rework. The invariants document itself is strong: it correctly identifies what must be stable and what can change.

The foundation is NOT build-ready today. It has 2 missing components (availability override entity, solver I/O contract), 4 contradictions that require forced decisions (RLS mechanism, proficiency scale, schema structure, naming), and 6 schema bugs that would produce incorrect plans if coded as-is (DATE columns, per-day workload, no overlap prevention, incomplete state enum, materialized view RLS bypass, missing extensions).

All of these are fixable in 5 working days. None require architectural redesign. None require new domain analysis. They are specification gaps, not design flaws.

**Build can begin on March 28, 2026** if the following conditions are met by March 27:
1. All 10 critical blockers from `blockers.md` are resolved.
2. All 12 pre-build decisions from `pre-build-decisions.md` are ratified by the engineering lead.
3. The solver I/O contract from `missing-definitions.md` MD-01 is published as TypeScript interfaces.
4. The `employee_availability_override` table from `missing-definitions.md` MD-02 is added to `schema.sql`.
5. The RLS mechanism is standardized and materialized views are wrapped in security-definer functions.

**Invariant readiness score: 8 / 20 locked today. 14 / 20 lockable within 5 days. 20 / 20 lockable within Phase 1 (Week 9).**

The foundation is real. The gaps are specific, enumerated, and have forced resolutions. The path from here to Day 1 of coding is 5 days of focused specification work, not weeks or months. Start the resolution work on Monday. Start coding the following Monday.
