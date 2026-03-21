# Build Readiness Check: Invariants Assessment

This document evaluates whether all invariants are defined well enough to start building.

**Assessment date:** 2026-03-20
**Verdict:** CONDITIONALLY READY — 7 decisions must be resolved first.

---

## Invariant-by-Invariant Readiness

### INV-1: Planning Flow (Demand → Workload → FTE → Assignment)

| Aspect | Status | Detail |
|--------|--------|--------|
| Pipeline stages defined | READY | 4 stages clearly documented in optimization-strategy.md |
| Formulas specified | READY | Workload and FTE formulas are concrete and correct |
| Edge cases identified | PARTIAL | Intra-day granularity bug identified but not fixed in schema |
| Solver I/O contract | NOT READY | TypeScript interfaces not yet written |

**Blocker:** Solver contract must be defined as typed interfaces before Phase 1 Week 9.
**Non-blocker for Weeks 1-8:** CRUD and workload computation can proceed without solver contract.

---

### INV-2: Organization Hierarchy

| Aspect | Status | Detail |
|--------|--------|--------|
| Organization entity | READY | Defined in schema.sql |
| Site entity | READY | Defined with timezone, operating hours |
| Department entity | READY | Optional grouping, defined in schema |
| Process entity | READY | Linked to site with productivity standards |

**Blocker:** None. Hierarchy is well-defined and consistent across documents.

---

### INV-3: Time Model

| Aspect | Status | Detail |
|--------|--------|--------|
| Time representation | NOT READY | DemandForecast uses `forecast_date` (date only) — must change to `period_start/period_end` (timestamptz) |
| Shift definition | READY | ShiftPattern entity is well-modeled |
| Planning horizon | READY | Configurable date ranges |
| Timezone handling | PARTIAL | Sites have timezones but cross-timezone logic is unspecified |

**Blocker:** Schema must be updated before demand ingestion code (Week 6).

---

### INV-4: Workforce Model

| Aspect | Status | Detail |
|--------|--------|--------|
| Employee entity | READY | Well-defined in schema |
| Skill model (5 levels) | READY | Proficiency model is sound |
| Certification tracking | READY | Separate from proficiency, with expiry |
| Availability template | PARTIAL | `availability_pattern` is JSONB, not typed |
| Availability override | NOT READY | No AbsenceRequest/LeaveRecord entity exists |
| Proficiency scale config | NOT READY | Hardcoded 5 levels vs wizard's 4-level default — unresolved |

**Blocker:** Absence/leave entity must be added to schema before employee CRUD (Week 3).

---

### INV-5: Constraint Model

| Aspect | Status | Detail |
|--------|--------|--------|
| Hard/soft categorization | READY | Well-defined in constraint-handling.md |
| Constraint types catalog | READY | Comprehensive catalog with jurisdiction variants |
| Jurisdiction-specific values | READY (with known bugs) | 6 legal errors identified (L1-L6) but structure is sound |
| Mathematical formulation | NOT READY | Constraints described in prose, not as solver-compatible math |
| Constraint relaxation strategy | READY | Priority ordering defined |

**Blocker:** Legal errors (L1-L6) must be corrected before constraint engine (Week 9). Math formulation needed for solver integration.

---

### INV-6: Solver Contract

| Aspect | Status | Detail |
|--------|--------|--------|
| Input interface | NOT READY | No typed interface exists |
| Output interface | NOT READY | No typed interface exists |
| Error handling | NOT READY | Infeasibility signaling not specified |

**Blocker:** Must be defined before solver integration (Week 9). Can be deferred from Week 1.

---

### INV-7: Plan Lifecycle

| Aspect | Status | Detail |
|--------|--------|--------|
| States defined | PARTIAL | States exist as an enum but valid transitions aren't formalized |
| Transition rules | NOT READY | No state machine with guards |
| Role permissions per transition | NOT READY | Not mapped |

**Blocker:** Must be defined before approval workflow (Week 19), but basic Draft→Published is sufficient for Phase 1.

---

### INV-8: Multi-Tenancy Boundary

| Aspect | Status | Detail |
|--------|--------|--------|
| Organization_id on all tables | READY | Consistent in schema.sql |
| RLS policies | READY (with bugs) | Policies exist but use 3 different mechanisms across docs |
| RLS mechanism decision | NOT READY | Must choose ONE approach |
| Materialized view RLS | NOT READY | Known cross-tenant leakage risk (D10) |

**Blocker:** RLS mechanism must be standardized before any table creation (Week 1).

---

### INV-9: Audit Requirement

| Aspect | Status | Detail |
|--------|--------|--------|
| Audit log entity | READY | Defined in schema with immutability trigger |
| Event capture | READY | Schema captures who, what, when, before/after |
| Immutability | READY | Trigger prevents UPDATE/DELETE |

**Blocker:** None. Audit model is ready.

---

## Summary

| Invariant | Ready? | Blocker Deadline |
|-----------|--------|-----------------|
| INV-1: Planning Flow | PARTIAL | Solver contract by Week 9 |
| INV-2: Org Hierarchy | READY | — |
| INV-3: Time Model | NOT READY | Schema fix by Week 1 |
| INV-4: Workforce Model | PARTIAL | Absence entity by Week 3 |
| INV-5: Constraint Model | PARTIAL | Legal fixes by Week 9 |
| INV-6: Solver Contract | NOT READY | TypeScript interfaces by Week 9 |
| INV-7: Plan Lifecycle | PARTIAL | State machine by Week 19 |
| INV-8: Multi-Tenancy | PARTIAL | RLS decision by Week 1 |
| INV-9: Audit | READY | — |

### Week 1 Blockers (Must resolve before build starts)
1. Fix time model in schema (period_start/period_end)
2. Add absence/leave entity to schema
3. Standardize RLS mechanism (choose ONE approach)
4. Standardize naming (organization_id everywhere)
5. Decide schema structure (flat vs modular)
6. Fix materialized view RLS leakage
7. Resolve proficiency scale configuration

### Can Proceed In Parallel
- Solver contract (needed by Week 9, not Week 1)
- Plan state machine (needed by Week 19)
- Constraint math formulation (needed by Week 9)
- Legal error corrections (needed by Week 9)

### Overall Readiness Score

**Invariant Readiness: 6.5 / 10**

The invariants are *mostly* defined but have 7 unresolved decisions and 3 known schema bugs that must be fixed before coding starts. With 3-5 days of focused resolution work, this score rises to 9/10.

**The foundation is real. The gaps are specific and fixable. The path to build-ready is measured in days, not months.**
