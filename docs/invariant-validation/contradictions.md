# Definitive Contradiction Register

> **Status:** Canonical list. Deduplicated from REVIEW-FULL.md, SYSTEMS-REVIEW.md, and contradictions-and-gaps.md.
> **Authority:** Where this document forces a decision, that decision is final.
> **Date:** 2026-03-20

---

## Critical Contradictions (Block Build)

### C-01: Three Different RLS Mechanisms

**Documents that contradict:**
- `system-overview.md`: `auth.jwt() ->> 'tenant_id'`
- `backend-architecture.md`: `current_setting('app.tenant_id')` set by tRPC middleware
- `schema.sql`: `auth.organization_id()` reading from `request.jwt.claims`

**Correct document:** `schema.sql`

**Resolution:** The canonical RLS mechanism is `auth.organization_id()` which reads `request.jwt.claims ->> 'organization_id'`. This is Supabase-native and works directly with Supabase Auth JWTs without middleware intervention. The `current_setting('app.tenant_id')` approach is used ONLY for service-role connections (optimizer background jobs, sync workers) where no JWT exists. Document both paths explicitly and prohibit any other mechanism.

---

### C-02: DemandForecast Granularity Incompatible With Sub-Daily Planning

**Documents that contradict:**
- `schema.sql`: `demand_granularity ENUM ('daily', 'weekly', 'monthly')` with `forecast_date DATE`
- `wizard-flow.md`: Offers `15-minute`, `hourly`, `4-hour` granularity options in the setup wizard
- `invariants.md`: States sub-daily planning is the common case for logistics operations

**Correct document:** `invariants.md`

**Resolution:** Remove the `demand_granularity` ENUM. Replace `forecast_date DATE` with `period_start timestamptz` + `period_end timestamptz`. Granularity is implicit in the duration between `period_start` and `period_end`. The wizard configures the default slot duration for each site, which determines how `period_start`/`period_end` pairs are generated. The schema stores arbitrary time ranges; the application enforces consistent slot durations per site.

---

### C-03: Proficiency Scale -- 4 Levels vs 5 Levels

**Documents that contradict:**
- `wizard-flow.md` Phase 5: Defaults to 4-level scale (Trainee 50%, Developing 75%, Proficient 100%, Expert 110%)
- `optimization-strategy.md` Section 4.3: Uses 5-level scale (Trainee 0.60, Basic 0.75, Competent 0.90, Proficient 1.00, Expert 1.10)
- `schema.sql`: `CHECK (proficiency_level BETWEEN 1 AND 5)` -- enforces 5 levels
- `constraint-handling.md` Section 2.5: References minimum skill levels using 5-level scale

**Correct document:** `schema.sql` and `optimization-strategy.md`

**Resolution:** The proficiency scale is fixed at 5 levels for MVP. Labels: Trainee (1), Basic (2), Competent (3), Proficient (4), Expert (5). Multipliers: 0.60, 0.75, 0.90, 1.00, 1.10. The wizard must present 5 levels, not 4. Level 4 (Proficient) is the baseline (1.0x). Post-MVP, make the scale configurable per organization.

---

### C-04: Naming -- tenant_id vs organization_id

**Documents that contradict:**
- `system-overview.md`: Uses `tenant_id`
- `schema.sql`: Uses `organization_id`
- `backend-architecture.md`: Uses both interchangeably
- `build-sequence.md`: References `DemandSignal` (table does not exist; actual name is `demand_forecast`)

**Correct document:** `schema.sql`

**Resolution:** The canonical column name is `organization_id`. The canonical table name is `demand_forecast`. All documents must be updated to use these names. Create a terminology glossary as a reference.

---

### C-05: Flat Schema vs Modular Schemas

**Documents that contradict:**
- `backend-architecture.md`: Describes per-module PostgreSQL schemas (`demand.*`, `workforce.*`, `planning.*`)
- `schema.sql`: Places all tables in `public` schema

**Correct document:** `schema.sql`

**Resolution:** Use flat `public` schema for MVP. Use naming conventions for logical grouping: `demand_forecast`, `demand_type`, `demand_type_process_mapping` for demand tables; `employee`, `employee_skill`, `shift_pattern` for workforce tables; `plan_version`, `shift_assignment`, `workload_plan` for planning tables. Modular schemas add complexity to RLS policies, cross-module queries, and migrations without MVP benefit. Revisit for V2 if the schema exceeds 50 tables.

---

### C-06: Tech Stack vs MVP Scope

**Documents that contradict:**
- `tech-stack.md`: Lists 7 locales at launch, Monte Carlo engine, Service Worker offline caching, dual embedding providers (Voyage AI + OpenAI), PostGIS, pgaudit
- `mvp-definition.md`: English only, Monte Carlo deferred to V2, offline deferred to V3+, no embeddings mentioned

**Correct document:** `mvp-definition.md`

**Resolution:** `tech-stack.md` must add a "Phase" column to every technology listing. MVP stack: English only, no Monte Carlo, no Service Worker, no embeddings, no PostGIS. pgaudit is Phase 2 (not a launch blocker but should be enabled before first enterprise customer). The HiGHS WASM solver, Next.js, Supabase, tRPC, and Claude are the MVP stack.

---

## Important Contradictions (Must Fix Within Phase 1)

### C-07: Hard Constraints "Never Relaxed" vs Manager Override Path

**Documents that contradict:**
- `constraint-handling.md` Section 3: "Hard constraints must never be violated. A solution that violates any hard constraint is rejected outright."
- `planning-adjustments.md` Section 5.2: Allows regulatory constraint overrides "only by authorized role (Site Manager+) with documented reason."

**Correct document:** Both, with scoping.

**Resolution:** Hard constraints are inviolable by the solver. The solver never produces a solution that violates a hard constraint. However, a human "controlled exception" path exists: an authorized user (Site Manager or above) can manually create an assignment that the solver would reject. This override produces a compliance warning, requires a documented reason, and generates an audit record with `override_type = 'hard_constraint_exception'`. The constraint is not "relaxed" -- it is manually bypassed with full audit trail. Update `constraint-handling.md` to add a "Human Exception Path" section.

---

### C-08: Event Architecture -- Kafka vs Supabase Realtime

**Documents that contradict:**
- `event-architecture.md` Section 1: Specifies Kafka cluster (3+ brokers, multi-AZ), 8 topics, 24 partitions each, Confluent Schema Registry
- `tech-stack.md` Section 3.7: Uses Supabase Realtime + Database Webhooks for events

**Correct document:** `tech-stack.md`

**Resolution:** MVP uses Supabase Realtime for frontend events and Database Webhooks + Edge Functions for backend event processing. A PostgreSQL `events` table serves as the durable event store. The domain event catalog, event envelope, saga patterns, and producer-consumer relationships from `event-architecture.md` are preserved -- only the transport layer changes. Rewrite `event-architecture.md` Section 1 to be transport-agnostic. Kafka is a Phase 3 option for enterprise-scale deployments.

---

### C-09: Polling Rate vs Rate Limit

**Documents that contradict:**
- `frontend-architecture.md`: Polls assignments every 10 seconds (6 req/min) plus TanStack Query background refetches (20-30 req/min)
- `backend-architecture.md`: Rate limit of 100 reads/min per user

**Correct document:** Neither. Both need adjustment.

**Resolution:** Replace assignment polling with Supabase Realtime subscriptions. Reserve HTTP polling for data that does not support real-time subscriptions. Increase the read rate limit to 300 reads/min per user to accommodate dashboard + workbench concurrent usage. Batch background TanStack Query refetches into aggregated queries where possible.

---

### C-10: Sub-Second Reactive Latency vs Edge Function Cold Starts

**Documents that contradict:**
- `decision-hierarchy.md`: Claims sub-second latency for Level 3 reactive decisions
- `tech-stack.md`: Supabase Edge Functions have 50-150ms cold starts, plus database query time, plus solver execution

**Correct document:** `tech-stack.md`

**Resolution:** Realistic latency targets: 1-3 seconds for single-employee reactive re-assignment, 5-30 seconds for shift-level re-optimization, minutes for cross-site transfers. Update `decision-hierarchy.md` to reflect these targets. Sub-second latency is aspirational for V3 with pre-warmed Edge Functions.

---

### C-11: Multi-Site Transfer Batch Cycle vs Real-Time Reactive

**Documents that contradict:**
- `module-breakdown.md`: Multi-Site Coordinator processes transfers on a 15-minute batch cycle
- `decision-hierarchy.md`: Level 3 reactive decisions require sub-second cross-site response

**Correct document:** `module-breakdown.md`

**Resolution:** Cross-site transfers involve employee notification, travel time, and manager coordination. They are tactical decisions (minutes to hours), not reactive decisions (seconds). Update `decision-hierarchy.md` to classify cross-site transfers as Level 4 (tactical), not Level 3 (reactive).

---

### C-12: Missing Extensions in schema.sql

**Documents that contradict:**
- `schema.sql`: Only enables `pgcrypto` and `pg_trgm`
- `tech-stack.md` and `backend-architecture.md`: List `pgvector`, `pgsodium`, `pgaudit`, `pg_cron` as core dependencies

**Correct document:** `tech-stack.md` for extension list; `schema.sql` for what is currently implemented.

**Resolution:** Add to schema.sql for MVP: `btree_gist` (required for shift overlap exclusion constraint). Defer `pgvector` to Phase 2 (when AI semantic search is implemented). Defer `pgsodium` to Phase 2 (PII encryption -- use Supabase Vault for MVP API key storage). Defer `pgaudit` to Phase 2 (before first enterprise customer). `pg_cron` add when staleness detection background job is built (Phase 1 Week 9+).

---

## Minor Contradictions (Fix Later)

### C-13: Override "Without Justification" vs Manager Approval for Skill Changes

**Documents that contradict:**
- `planning-principles.md` Principle 6: "Any AI-generated recommendation can be overridden by an authorized human at any time, without justification."
- `failure-modes.md` Failure 4.3: Skill profiles "cannot be self-modified by workers without manager approval."

**Correct document:** Both. Different domains.

**Resolution:** Principle 6 applies to planning recommendations (assignment overrides). Failure 4.3 applies to data integrity (skill profile changes). Clarify the scope of "override" in Principle 6: "Override applies to planning recommendations, not to data integrity controls."

---

### C-14: Solver Architecture -- Three Descriptions

**Documents that contradict:**
- `tech-stack.md`: HiGHS WASM primary, Python OR-Tools on Fly.io fallback
- `system-overview.md` (original): OR-Tools / Gurobi primary, column generation
- `optimization-strategy.md`: HiGHS WASM primary, CP-SAT refinement

**Correct document:** `tech-stack.md` (post-rewrite)

**Resolution:** HiGHS WASM for problems that fit in 256MB (estimated up to 200 employees). Node.js-native HiGHS on Fly.io for larger problems. No OR-Tools, no Gurobi, no CP-SAT in MVP. Greedy heuristic as fast fallback for interactive "what-if" solves. GA/SA deferred to Phase 3.

---

### C-15: Notification Retention vs Predictive Scheduling Laws

**Documents that contradict:**
- `scalability-design.md`: 30-day notification retention with automated cleanup
- Predictive scheduling laws (SF, NYC, Oregon): Require schedule notification proof for 60-90 days

**Correct document:** Neither.

**Resolution:** Set notification retention to 90 days minimum. Make retention period configurable per jurisdiction. Predictive scheduling jurisdictions get 90+ day retention. Other jurisdictions can use 30-day default. Document this in the compliance section.

---

## Summary

| Severity | Count | IDs |
|----------|-------|-----|
| Critical (blocks build) | 6 | C-01 through C-06 |
| Important (fix in Phase 1) | 6 | C-07 through C-12 |
| Minor (fix later) | 3 | C-13 through C-15 |
| **Total** | **15** | |

All Critical contradictions have forced decisions above. No options -- one answer each.
