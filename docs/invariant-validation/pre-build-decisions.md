# Pre-Build Decisions: Forced Answers

> **Status:** Every decision in this list MUST be made before coding starts.
> **Rule:** One answer per decision. No options. The rationale explains why.
> **Date:** 2026-03-20

---

## D-01: Schema Structure -- Flat or Modular?

**Question:** Should PostgreSQL tables be organized in a flat `public` schema or in per-module schemas (`demand.*`, `workforce.*`, `planning.*`)?

**Answer:** Flat `public` schema.

**Rationale:** Modular schemas add complexity to RLS policies (each schema needs independent RLS configuration), cross-module queries (require schema-qualified names or search_path manipulation), and migrations (each schema needs its own migration chain). For MVP with fewer than 30 tables and a 3-5 engineer team, the organizational benefit does not justify the operational cost. Use naming conventions (`demand_`, `workforce_`, `planning_` prefixes) for logical grouping.

**Affected invariants:** INV-2 (Organization Hierarchy), INV-8 (Multi-Tenancy)

**Consequence if wrong:** If we choose modular and it causes RLS bugs, we have cross-tenant data leakage -- existential risk. If we choose flat and outgrow it, we migrate to modular schemas in V2 with a mechanical refactor (rename tables, update queries). The downside of flat is manageable; the downside of modular-done-wrong is catastrophic.

---

## D-02: RLS Mechanism -- Which One?

**Question:** Which of the three documented RLS mechanisms is canonical?

**Answer:** `auth.organization_id()` reading from `request.jwt.claims ->> 'organization_id'`.

**Rationale:** This is Supabase-native, works with Supabase Auth JWTs without middleware, and is already implemented in `schema.sql`. The `current_setting('app.tenant_id')` approach requires middleware to set a session variable on every request -- an additional failure point. The `auth.jwt() ->> 'tenant_id'` approach uses the wrong column name (`tenant_id` vs `organization_id`). Exception: service-role connections (optimizer background jobs) use `current_setting('app.organization_id')` set by the job runner, since there is no JWT in background contexts.

**Affected invariants:** INV-8 (Multi-Tenancy Boundary)

**Consequence if wrong:** Every RLS policy in the system is wrong, creating cross-tenant data leakage vectors on every table.

---

## D-03: Proficiency Scale -- Fixed or Configurable?

**Question:** Is the proficiency scale fixed at 5 levels system-wide, or configurable per organization?

**Answer:** Fixed at 5 levels for MVP.

**Rationale:** The schema enforces `CHECK (proficiency_level BETWEEN 1 AND 5)`. The optimizer, constraint engine, and productivity formulas all assume 5 levels. Making it configurable requires: adding `proficiency_scale_config` to Organization, making the CHECK constraint dynamic (not possible in standard PostgreSQL -- requires a trigger), updating the optimizer to read the org's scale, and updating every UI component that displays proficiency. This is 2-3 weeks of work across all layers for a feature whose absence affects zero launch customers (all will use the default). The wizard must present 5 levels: Trainee (0.60x), Basic (0.75x), Competent (0.90x), Proficient (1.00x), Expert (1.10x). Post-MVP, add configurability if customer demand requires it.

**Affected invariants:** INV-2 (Organization Hierarchy), INV-4 (Workforce Model)

**Consequence if wrong:** If a customer genuinely needs a different scale (e.g., 3 levels), they cannot use the system until we add configurability. This is a known limitation, not a bug. Document it in onboarding materials.

---

## D-04: Materialized View RLS -- Functions or Regular Views?

**Question:** How do we prevent materialized views from leaking data across tenants?

**Answer:** Replace materialized views with security-definer functions.

**Rationale:** Regular views inherit RLS but cannot be indexed or pre-computed -- query performance suffers. Per-tenant materialized views (one MV per organization) create operational complexity (provisioning, refresh scheduling, cleanup). Security-definer functions that wrap the query and inject `WHERE organization_id = auth.organization_id()` provide tenant isolation with predictable performance. The function returns a table type matching the original MV columns. Callers use `SELECT * FROM fn_site_dashboard()` instead of `SELECT * FROM mv_site_dashboard`. The function body can include `REFRESH MATERIALIZED VIEW CONCURRENTLY` on a TTL basis for caching, or simply execute the query directly for MVP.

**Affected invariants:** INV-8 (Multi-Tenancy Boundary)

**Consequence if wrong:** If we keep materialized views without tenant filtering, any bug that omits the `WHERE` clause leaks data across tenants. A data breach in a multi-tenant SaaS is existential.

---

## D-05: Event Transport -- Kafka or Supabase Realtime?

**Question:** Which event transport mechanism does the system use?

**Answer:** Supabase Realtime for frontend events. Database Webhooks + Edge Functions for backend event processing. PostgreSQL `events` table for durable event storage.

**Rationale:** Kafka requires a 3+ broker cluster, ZooKeeper/KRaft, topic management, consumer group monitoring, and Schema Registry maintenance. These operational concerns exceed the capacity of a 3-5 engineer team. Supabase Realtime is included in the Supabase subscription, requires zero infrastructure management, and handles the expected scale (< 50 concurrent users, < 1,000 events/minute). The domain event catalog, event envelope, and saga patterns from `event-architecture.md` are transport-agnostic and are preserved. If scale demands it, migrate to a dedicated event bus in Phase 3.

**Affected invariants:** INV-7 (Plan Lifecycle -- staleness detection), INV-9 (Audit -- event capture)

**Consequence if wrong:** If Supabase Realtime proves insufficient at scale, migration to Kafka is a Phase 3 infrastructure project (2-3 weeks). If we start with Kafka, we add 4-6 weeks of infrastructure work to Phase 0 and ongoing operational burden that the team cannot sustain.

---

## D-06: Solver Architecture -- Which Algorithms Ship in MVP?

**Question:** Which solver algorithms are included in the MVP?

**Answer:** Greedy heuristic + HiGHS MIP. No GA, SA, CP-SAT, or Monte Carlo.

**Rationale:** The GA chromosome encoding is mathematically broken (cannot represent multi-employee slots). SA at low temperature degenerates to hill climbing. CP-SAT adds a dependency (OR-Tools) that is not in the tech stack. Monte Carlo is deferred per `mvp-definition.md`. Greedy heuristic provides sub-second interactive "what-if" solves. HiGHS MIP provides near-optimal solutions for production planning. Together they cover 95% of real planning scenarios. HiGHS WASM runs in-browser or in Edge Functions for problems up to ~200 employees. Node.js-native HiGHS on Fly.io handles larger problems.

**Affected invariants:** INV-6 (Solver Contract), INV-1 (Planning Flow)

**Consequence if wrong:** If greedy + HiGHS cannot produce acceptable plans for a customer's problem structure, we add CP-SAT as a Phase 2 algorithm. The solver I/O contract (INV-6) ensures any new algorithm plugs in without changing the surrounding code.

---

## D-07: Allowance Factor -- Scalar or Structured?

**Question:** Is the allowance factor in the workload formula a single scalar or an itemized breakdown?

**Answer:** Single scalar for computation. Itemized breakdown for configuration.

**Rationale:** The formula `required_hours = process_volume / productivity_rate * (1 + allowance_factor)` uses a single scalar. This is invariant. The wizard collects individual components (break time, walk time, startup/shutdown) for user clarity, sums them, and stores the result as a single `allowance_factor` on the site settings. The individual components are stored for display and recalculation but are never used in the computation formula. This avoids the ambiguity of "which breakdown structure" while giving users a transparent configuration experience.

**Affected invariants:** INV-1 (Planning Flow)

**Consequence if wrong:** If we use an itemized breakdown in the formula, every formula reference must iterate over components, and adding a new component type requires a formula change. The scalar approach makes the formula stable and the component list extensible.

---

## D-08: Employee-Facing Interface -- Build or Defer?

**Question:** Does the MVP include an employee-facing schedule view?

**Answer:** Yes. Minimal web portal, not a native mobile app.

**Rationale:** Employees are the largest user group. Every document references employee interactions (schedule viewing, absence reporting, acknowledgment) but no interface is designed. Without it, the plan-reality feedback loop cannot function. The minimal portal shows: my schedule this week, upcoming changes, acknowledge button, report absence form. This is 2-3 weeks of development. The alternative -- "employees receive email/SMS notifications only" -- breaks the absence reporting flow (Blocker 2 depends on employees being able to create availability overrides).

**Affected invariants:** INV-4 (Workforce Model -- availability overrides), INV-7 (Plan Lifecycle -- acknowledgment)

**Consequence if wrong:** If we defer and launch without employee access, supervisors must manually enter all absences on behalf of their teams. For a 500-employee site, this is operationally infeasible. The system produces plans that ignore absences within 2 weeks.

---

## D-09: Audit Logging -- Triggers or Middleware?

**Question:** Are audit records created by database triggers or application middleware?

**Answer:** Both. Triggers for critical tables. Middleware for supplementary actions.

**Rationale:** Triggers are automatic and cannot be bypassed by application bugs -- every write to `employee`, `plan_version`, `shift_assignment`, `labor_rule`, `employee_skill`, and `employee_availability_override` produces an audit record regardless of which code path triggered the write. Middleware handles actions that are not direct table writes: optimizer runs (input/result hashes), CSV imports (file metadata), AI interactions (token usage), and configuration changes. This hybrid approach ensures critical audit records are never missed (triggers) while avoiding trigger overhead on high-volume, low-criticality tables (middleware).

**Affected invariants:** INV-9 (Audit Requirement)

**Consequence if wrong:** If we use only triggers, every table gets audit overhead, including high-frequency tables like `notification` where audit is unnecessary. If we use only middleware, a bug in any code path silently drops audit records for critical entities, creating compliance gaps that surface during regulatory audits.

---

## D-10: Planning Horizon Fields -- DATE or timestamptz?

**Question:** Are `plan_version.plan_period_start` and `plan_period_end` DATE or timestamptz?

**Answer:** DATE.

**Rationale:** The planning horizon defines "which days are in scope" -- e.g., "Week 48: November 25 through December 1." The intra-day granularity is defined by the time slots within the horizon, which are timestamptz. Using DATE for the horizon boundary avoids timezone-related edge cases (a planning horizon of "2026-11-25T00:00:00Z" in a Chicago timezone would technically start on November 24th local time). DATE is unambiguous: "November 25" means November 25 at the site, regardless of timezone.

**Affected invariants:** INV-3 (Time Model)

**Consequence if wrong:** If we use timestamptz, every planning horizon query must account for site timezone conversion, adding complexity to every plan-scoping query. DATE is simpler and correct for this specific use case.

---

## D-11: Notification Retention Period

**Question:** How long are notifications retained before automated cleanup?

**Answer:** 90 days minimum. Configurable per jurisdiction.

**Rationale:** Predictive scheduling laws in San Francisco, New York City, and Oregon require schedule notification proof for 60-90 days. The current 30-day retention in `scalability-design.md` would cause legal non-compliance for customers in these jurisdictions. Set the default to 90 days. Allow configuration up to 365 days for customers with stricter requirements. Notifications older than the retention period are archived to cold storage (S3), not deleted, to satisfy the 7-year audit retention requirement.

**Affected invariants:** INV-9 (Audit Requirement)

**Consequence if wrong:** If retention is too short, customers in predictive scheduling jurisdictions cannot prove compliance during a labor dispute. The liability falls on the customer, but the trust falls on AstraPlanner.

---

## D-12: Wizard Scope -- How Many Phases?

**Question:** How many phases does the MVP setup wizard have?

**Answer:** 5 phases.

**Rationale:** The current 8-phase, 75-295 minute wizard requires knowledge from 4-6 different people (IT, HR, operations, legal, finance). No single person has all this knowledge. MVP wizard: (1) Organization setup, (2) Site configuration, (3) Process definition + productivity standards, (4) Employee import + skill assignment, (5) Go-live checklist. Demand integration (currently Phase 6) becomes a separate setup flow accessible from the main application after the wizard completes. AI-powered document upload (Phase 7) is deferred to Phase 2. Advanced configuration (Phase 8) is absorbed into site/process settings.

**Affected invariants:** INV-2 (Organization Hierarchy -- wizard creates the hierarchy)

**Consequence if wrong:** If the wizard is too complex, customers abandon setup before completing it. If it is too simple, customers launch with incomplete configuration and produce bad plans. The 5-phase version covers the minimum viable configuration.

---

## Summary

| ID | Decision | Answer | Effort |
|----|----------|--------|--------|
| D-01 | Schema structure | Flat `public` | 0 (already implemented) |
| D-02 | RLS mechanism | `auth.organization_id()` from JWT | 4 hours (doc cleanup) |
| D-03 | Proficiency scale | Fixed 5 levels | 2 hours (wizard fix) |
| D-04 | Materialized view RLS | Security-definer functions | 6 hours |
| D-05 | Event transport | Supabase Realtime + DB Webhooks | 0 (no Kafka to build) |
| D-06 | MVP solver algorithms | Greedy + HiGHS MIP only | 0 (scope reduction) |
| D-07 | Allowance factor | Single scalar (sum of components) | 1 hour (doc clarification) |
| D-08 | Employee interface | Yes, minimal web portal | 2-3 weeks (Phase 4.5) |
| D-09 | Audit mechanism | Triggers (critical) + Middleware (supplementary) | 2 days (trigger setup) |
| D-10 | Planning horizon type | DATE | 0 (already implemented) |
| D-11 | Notification retention | 90 days minimum | 1 hour (config change) |
| D-12 | Wizard scope | 5 phases | 0 (scope reduction) |

All 12 decisions are final. Implementation proceeds from these answers.
