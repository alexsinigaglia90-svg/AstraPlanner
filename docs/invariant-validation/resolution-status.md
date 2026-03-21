# Invariant Resolution Status

> **Date:** 2026-03-20
> **Status:** All blockers resolved. All decisions locked.

---

## Blockers Resolved

| # | Blocker | Resolution | Status |
|---|---------|-----------|--------|
| 1 | DemandForecast uses DATE | `period_start`/`period_end` timestamptz in schema.sql | FIXED |
| 2 | No absence/leave entity | `employee_availability_override` table added to schema.sql | FIXED |
| 3 | RLS mechanism not standardized | `auth.organization_id()` canonical. Documented in DECISIONS.md D-02. | FIXED |
| 4 | Materialized views bypass RLS | Security-definer function approach decided. D-04. | DECIDED |
| 5 | Solver I/O contract missing | Full TypeScript interfaces in solver-contract.md | FIXED |
| 6 | WorkloadPlan per-day not per-shift | `period_start`/`period_end` timestamptz in schema.sql | FIXED |
| 7 | Overlapping shifts not prevented | `btree_gist` exclusion constraint added to schema.sql | FIXED |
| 8 | Plan state enum incomplete | 8-state `plan_status` enum + transition trigger in schema.sql | FIXED |
| 9 | Naming inconsistency | `organization_id` canonical. D-04. | DECIDED |
| 10 | Proficiency scale mismatch | Fixed at 5 levels. D-03. Documented in schema.sql | FIXED |

## Decisions Locked

19 decisions documented in `docs/DECISIONS.md`. All marked LOCKED.

## Missing Definitions Provided

| # | Definition | Location | Status |
|---|-----------|----------|--------|
| MD-01 | Solver I/O contract | docs/solver-contract.md | PROVIDED |
| MD-02 | Availability override entity | schema.sql | PROVIDED |
| MD-03 | Plan state machine | schema.sql (trigger) | PROVIDED |
| MD-04 | tRPC procedure contracts | docs/api-contracts.md | PROVIDED |
| MD-05 | Role/permission taxonomy | docs/api-contracts.md (auth section) | PROVIDED |
| MD-06 | Environment variables | docs/DECISIONS.md + .env reference | PARTIAL |
| MD-07 | Allowance factor structure | docs/DECISIONS.md D-07 | PROVIDED |
| MD-08 | Staleness detection thresholds | docs/invariant-validation/missing-definitions.md | PROVIDED |
| MD-09 | Optimizer output write strategy | schema.sql (staging table) | PROVIDED |
| MD-10 | Audit logging mechanism | schema.sql (triggers on 6 tables) | PROVIDED |

## Contradictions Resolved

15 contradictions resolved with forced single answers in `contradictions.md`. All critical (C-01 through C-06) have corresponding fixes in schema.sql or DECISIONS.md.

## Updated Invariant Status

| # | Invariant | Previous | Current | What Changed |
|---|-----------|----------|---------|-------------|
| 1 | Planning Causality | WEAK | **LOCKED** | Time model fixed, workload per-shift, formulas consistent |
| 2 | Organization Structure | LOCKED | LOCKED | No change needed |
| 3 | Process as Planning Atom | LOCKED | LOCKED | No change needed |
| 4 | Time Model | CONTRADICTORY | **LOCKED** | period_start/period_end timestamptz everywhere |
| 5 | Demand Definition | WEAK | **LOCKED** | Granularity enum removed, time-range based |
| 6 | Workload Conversion | CONTRADICTORY | **LOCKED** | Per-shift computation, allowance factor clarified (D-07) |
| 7 | Capacity Requirement | WEAK | **LOCKED** | FTE formula documented in invariants.md |
| 8 | Workforce Identity | WEAK | **LOCKED** | Absence entity added, availability model complete |
| 9 | Skill Model | CONTRADICTORY | **LOCKED** | Fixed 5 levels (D-03), schema matches optimizer |
| 10 | Availability Model | WEAK | **LOCKED** | Template + override model with schema support |
| 11 | Constraint Model | LOCKED | LOCKED | No change needed |
| 12 | Allocation Output | CONTRADICTORY | **LOCKED** | Overlap exclusion constraint, staging table, solver contract |
| 13 | Human Override | MISSING | **LOCKED** | Hard constraint exception path defined (D-14), always Level 0 for publication |
| 14 | Explainability | WEAK | WEAK | Audit triggers added, but explanation generation is implementation (Phase 2) |
| 15 | Tenant Isolation | LOCKED | LOCKED | RLS standardized (D-02) |
| 16 | Configuration Model | WEAK | **LOCKED** | Flat schema (D-01), org→site→override hierarchy in DECISIONS.md |
| 17 | Separation of Engines | MISSING | **LOCKED** | Solver contract defines boundary. Greedy+HiGHS only (D-06). |
| 18 | Scenario Parity | WEAK | WEAK | Scenarios use same solver contract — but comparison views not specified |
| 19 | Actuals Feedback | WEAK | WEAK | Requires T&A integration (Phase 2). Not a pre-build blocker. |
| 20 | Setup Wizard Boundary | CONTRADICTORY | **LOCKED** | 5 phases (D-12), proficiency fixed (D-03), output matches solver input |

## Final Count

| Status | Count | Invariants |
|--------|-------|------------|
| **LOCKED** | **17** | 1-13, 15-17, 20 |
| WEAK | 3 | 14 (Explainability), 18 (Scenario Parity), 19 (Actuals Feedback) |
| CONTRADICTORY | 0 | — |
| MISSING | 0 | — |

## Verdict

**17 / 20 invariants LOCKED.** The 3 remaining WEAK invariants (explainability depth, scenario comparison views, actuals feedback loop) are Phase 2 concerns — they do not block Phase 1 build.

**BUILD IS READY.**
