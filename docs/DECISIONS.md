# AstraPlanner Architectural Decisions

> **Authority:** This is the single canonical reference for all architectural decisions. Engineers MUST check this file before making any implementation choice.
> **Status:** All decisions are LOCKED. Changes require a formal ADR (Architecture Decision Record) process with sign-off from the tech lead.
> **Last updated:** 2026-03-20

---

## D-01: Schema Structure -- Flat or Modular?

**Decision:** Flat `public` schema with naming convention prefixes (`demand_`, `workforce_`, `planning_`).

**Rationale:** Modular schemas add complexity to RLS policies (each schema needs independent RLS configuration), cross-module queries (require schema-qualified names or search_path manipulation), and migrations (each schema needs its own migration chain). For MVP with fewer than 30 tables and a 3-5 engineer team, the organizational benefit does not justify the operational cost. If we outgrow it, we migrate to modular schemas in V2 with a mechanical refactor.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-02: RLS Mechanism -- Which One?

**Decision:** `auth.organization_id()` reading from `request.jwt.claims ->> 'organization_id'`. Service-role connections (optimizer background jobs) use `current_setting('app.organization_id')` set by the job runner.

**Rationale:** This is Supabase-native, works with Supabase Auth JWTs without middleware, and is already implemented in `schema.sql`. The `current_setting('app.tenant_id')` approach requires middleware to set a session variable on every request. The `auth.jwt() ->> 'tenant_id'` approach uses the wrong column name. No other mechanism is valid.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-03: Proficiency Scale -- Fixed or Configurable?

**Decision:** Fixed at 5 levels for MVP: Trainee (0.60x), Basic (0.75x), Competent (0.90x), Proficient (1.00x), Expert (1.10x).

**Rationale:** The schema enforces `CHECK (proficiency_level BETWEEN 1 AND 5)`. The optimizer, constraint engine, and productivity formulas all assume 5 levels. Making it configurable requires dynamic CHECK constraints (not possible in standard PostgreSQL), optimizer changes, and UI changes across all layers -- 2-3 weeks of work for a feature no launch customer requires. The wizard must present exactly 5 levels. Post-MVP, add configurability if customer demand requires it.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-04: Materialized View RLS -- Functions or Regular Views?

**Decision:** Replace materialized views with security-definer functions that inject `WHERE organization_id = auth.organization_id()`.

**Rationale:** Materialized views bypass RLS (definer privileges, not invoker). Regular views inherit RLS but cannot be indexed. Security-definer functions provide tenant isolation with predictable performance. Callers use `SELECT * FROM fn_site_dashboard()` instead of `SELECT * FROM mv_site_dashboard`. A data breach in a multi-tenant SaaS is existential risk.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-05: Event Transport -- Kafka or Supabase Realtime?

**Decision:** Supabase Realtime for frontend events. Database Webhooks + Edge Functions for backend event processing. PostgreSQL `events` table for durable event storage.

**Rationale:** Kafka requires a 3+ broker cluster, ZooKeeper/KRaft, topic management, consumer group monitoring, and Schema Registry maintenance. These operational concerns exceed the capacity of a 3-5 engineer team. Supabase Realtime is included in the Supabase subscription, requires zero infrastructure management, and handles the expected scale (< 50 concurrent users, < 1,000 events/minute). The domain event catalog and saga patterns are transport-agnostic and are preserved.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-06: Solver Architecture -- Which Algorithms Ship in MVP?

**Decision:** Greedy heuristic + HiGHS MIP. No GA, SA, CP-SAT, or Monte Carlo.

**Rationale:** The GA chromosome encoding is mathematically broken (cannot represent multi-employee slots). SA at low temperature degenerates to hill climbing. CP-SAT adds a dependency (OR-Tools) not in the tech stack. Monte Carlo is deferred per `mvp-definition.md`. Greedy heuristic provides sub-second interactive "what-if" solves. HiGHS MIP provides near-optimal solutions for production planning. HiGHS WASM runs in-browser or in Edge Functions for problems up to ~200 employees. Node.js-native HiGHS on Fly.io handles larger problems.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-07: Allowance Factor -- Scalar or Structured?

**Decision:** Single scalar for computation. Itemized breakdown for configuration only.

**Rationale:** The formula `required_hours = process_volume / productivity_rate * (1 + allowance_factor)` uses a single scalar. This is invariant. The wizard collects individual components (break time, walk time, startup/shutdown), sums them, and stores the result as a single `allowance_factor` on the site settings. Individual components are stored in `site.settings_json.allowance_breakdown` for display and recalculation but are never used in the computation formula.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-08: Employee-Facing Interface -- Build or Defer?

**Decision:** Yes. Minimal web portal in MVP, not a native mobile app.

**Rationale:** Employees are the largest user group. Without an interface, the plan-reality feedback loop cannot function. The minimal portal shows: my schedule this week, upcoming changes, acknowledge button, report absence form. This is 2-3 weeks of development. Without it, supervisors must manually enter all absences on behalf of their teams -- operationally infeasible for a 500-employee site.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-09: Audit Logging -- Triggers or Middleware?

**Decision:** Both. Database triggers for critical tables; application middleware for supplementary actions.

**Rationale:** Triggers are automatic and cannot be bypassed by application bugs. Critical tables with triggers: `employee`, `plan_version`, `shift_assignment`, `labor_rule`, `employee_skill`, `employee_availability_override`. Middleware handles actions that are not direct table writes: optimizer runs (input/result hashes), CSV imports (file metadata), AI interactions (token usage), and configuration changes. This hybrid approach ensures critical audit records are never missed while avoiding trigger overhead on high-volume, low-criticality tables.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-10: Planning Horizon Fields -- DATE or timestamptz?

**Decision:** DATE.

**Rationale:** The planning horizon defines "which days are in scope" (e.g., "Week 48: November 25 through December 1"). The intra-day granularity is defined by time slots within the horizon, which are timestamptz. Using DATE avoids timezone-related edge cases -- a horizon of `2026-11-25T00:00:00Z` in a Chicago timezone would technically start on November 24th local time. DATE is unambiguous: "November 25" means November 25 at the site.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-11: Notification Retention Period

**Decision:** 90 days minimum. Configurable per jurisdiction up to 365 days. Archived to cold storage (S3) after retention period, not deleted.

**Rationale:** Predictive scheduling laws in San Francisco, New York City, and Oregon require schedule notification proof for 60-90 days. The original 30-day retention would cause legal non-compliance. Notifications older than the retention period are archived to cold storage to satisfy the 7-year audit retention requirement.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-12: Wizard Scope -- How Many Phases?

**Decision:** 5 phases: (1) Organization setup, (2) Site configuration, (3) Process definition + productivity standards, (4) Employee import + skill assignment, (5) Go-live checklist.

**Rationale:** The original 8-phase, 75-295 minute wizard requires knowledge from 4-6 different people. No single person has all this knowledge. Demand integration becomes a separate setup flow accessible from the main application after the wizard completes. AI-powered document upload is deferred to Phase 2. Advanced configuration is absorbed into site/process settings.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-13: Event Transport -- No Kafka

**Decision:** Supabase Realtime + Database Webhooks. No Kafka, no RabbitMQ, no external message broker.

**Rationale:** This resolves the contradiction between documents specifying Kafka-based event streaming and the MVP infrastructure constraints. The domain event catalog, event envelope schema, and saga patterns from `event-architecture.md` remain transport-agnostic. The `events` table in PostgreSQL provides durable storage with guaranteed delivery via DB Webhooks triggering Edge Functions. If scale demands it (> 1,000 events/minute sustained), migrate to a dedicated event bus in Phase 3.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-14: Hard Constraint Overrides -- Solver vs Human

**Decision:** The solver NEVER violates hard constraints. Humans (site_manager, tenant_admin) can bypass hard constraints with a mandatory audit trail recording the override reason, the constraint bypassed, and the authorizing user.

**Rationale:** The solver must always produce legally compliant plans. However, operational reality sometimes requires exceptions (e.g., an emergency requires scheduling an employee beyond the weekly hour limit with their consent). These exceptions must be human-initiated, audited, and traceable. The system records the override in `audit_log` with `action = 'hard_constraint_override'` and requires a reason. Override frequency is surfaced in compliance dashboards.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-15: Assignment Polling -- Replace with Realtime Subscriptions

**Decision:** Replace HTTP polling for assignment updates with Supabase Realtime subscriptions on the `shift_assignment` and `plan_version` tables.

**Rationale:** The original design had the frontend polling for optimizer progress and assignment updates. Supabase Realtime provides server-push via WebSocket channels, eliminating unnecessary HTTP requests and reducing perceived latency. The frontend subscribes to `plan_version` changes (state transitions, progress updates) and `shift_assignment` changes (new assignments after optimization completes). This aligns with D-13 (Supabase Realtime as the event transport).

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-16: Reactive Latency Target -- 1-3 Seconds

**Decision:** The reactive latency target for UI updates after a state change is 1-3 seconds, not sub-second.

**Rationale:** Sub-second latency requires either WebSocket push with zero processing overhead or aggressive client-side optimistic updates. The Supabase Realtime channel has inherent latency (connection overhead, PostgreSQL NOTIFY propagation, channel fan-out). A 1-3 second target is achievable with Supabase Realtime without custom infrastructure. The solver result write (D-09 in missing-definitions: atomic staging table swap) adds a transaction commit delay. For the planning use case, 1-3 seconds is operationally acceptable -- planners are not making real-time trading decisions.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-17: Cross-Site Transfers -- Tactical, Not Reactive

**Decision:** Cross-site employee transfers operate on a tactical timescale (minutes to hours), not reactive (seconds).

**Rationale:** Multi-site planning is a V2 feature. In MVP, cross-site transfers are manual operations initiated by a site_manager or tenant_admin. The planner marks an employee as `is_multi_site_eligible`, and the employee can then be included in another site's solver input. This is a planning-time decision, not a real-time rebalancing system. Real-time cross-site workforce rebalancing requires inter-site demand visibility, transfer cost modeling, and logistics coordination that are out of scope for MVP.

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-18: Extension Phasing -- btree_gist Now, Others in Phase 2

**Decision:** Enable `btree_gist` extension immediately (required for shift overlap exclusion constraint). Defer `pgvector`, `pgsodium`, and `pgaudit` to Phase 2.

**Rationale:** `btree_gist` is required by INV-5 (Constraint Model) to enforce the no-overlapping-shifts exclusion constraint on `shift_assignment`. This is a hard blocker. `pgvector` is only needed for AI-powered skill matching and document similarity (Phase 2 features). `pgsodium` is for column-level encryption of PII (important but not blocking MVP launch -- RLS provides tenant isolation, and Supabase encrypts at rest). `pgaudit` provides statement-level audit logging that supplements the application-level `audit_log` table (nice to have, not required for MVP compliance).

**Date:** 2026-03-20
**Status:** LOCKED

---

## D-19: Notification Retention -- 90 Days Minimum

**Decision:** All notification records are retained for a minimum of 90 days in the primary database. After the retention period, records are archived to cold storage (S3-compatible object storage), not deleted.

**Rationale:** This reinforces D-11 with implementation specifics. The `notification` table uses a `created_at` index for efficient range queries. A `pg_cron` job runs nightly to archive notifications older than the site's configured retention period (default 90 days, max 365 days). Archived notifications are stored as JSONL files partitioned by organization and month. The `audit_log` table is exempt from this archival -- audit records remain in the primary database for the full 7-year retention period.

**Date:** 2026-03-20
**Status:** LOCKED

---

## Decision Index

| ID | Topic | Answer | Affected Invariants |
|----|-------|--------|-------------------|
| D-01 | Schema structure | Flat `public` with naming prefixes | INV-2, INV-8 |
| D-02 | RLS mechanism | `auth.organization_id()` from JWT | INV-8 |
| D-03 | Proficiency scale | Fixed 5 levels | INV-2, INV-4 |
| D-04 | Materialized view RLS | Security-definer functions | INV-8 |
| D-05 | Event transport | Supabase Realtime + DB Webhooks | INV-7, INV-9 |
| D-06 | MVP solver algorithms | Greedy + HiGHS MIP only | INV-6, INV-1 |
| D-07 | Allowance factor | Single scalar (sum of components) | INV-1 |
| D-08 | Employee interface | Minimal web portal | INV-4, INV-7 |
| D-09 | Audit mechanism | Triggers (critical) + Middleware (supplementary) | INV-9 |
| D-10 | Planning horizon type | DATE | INV-3 |
| D-11 | Notification retention | 90 days minimum, configurable | INV-9 |
| D-12 | Wizard scope | 5 phases | INV-2 |
| D-13 | Event transport (no Kafka) | Supabase Realtime only | INV-7, INV-9 |
| D-14 | Hard constraint overrides | Solver never violates; humans bypass with audit | INV-5, INV-9 |
| D-15 | Assignment polling | Supabase Realtime subscriptions | INV-7 |
| D-16 | Reactive latency target | 1-3 seconds | INV-7 |
| D-17 | Cross-site transfers | Tactical (minutes), not reactive | INV-4 |
| D-18 | Extension phasing | btree_gist now; pgvector/pgsodium/pgaudit Phase 2 | INV-5 |
| D-19 | Notification retention (implementation) | 90 days in DB, then archive to S3 | INV-9 |
