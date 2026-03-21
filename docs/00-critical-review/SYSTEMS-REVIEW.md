# AstraPlanner — Systems-Level Critical Review

> Conducted: 2026-03-20
> Scope: End-to-end system analysis — architecture, data flows, optimization pipeline, UX rendering, risk coverage
> Reviewers: 3 parallel deep-analysis agents reading all 39 documents

---

## Verdict

The previous review found documentation contradictions. This review found **system design flaws** — places where components that are individually well-designed **break when connected**. The data model cannot support what the optimizer needs. The UX makes promises the backend cannot keep. The risk register misses the risks that the architecture itself creates. The MVP scope document exists now but the build sequence underestimates the hardest integration points.

This is a system that looks complete on paper but has **7 broken handoff points** between layers, **5 unidentified risks** the previous review missed, and **3 fundamental architectural decisions** that must be made before any code is written.

---

## 1. Architectural Flaws: Broken Layer Handoffs

### 1.1 The Optimizer Cannot Compute What It Promises

The optimization engine's skill decay model requires `last_used_date` per employee-skill pair. **This field does not exist in the schema.** The `EmployeeSkill` entity has `assessment_date` and `certification_expiry_date` but no record of when the employee last performed the process. The decay formula (`effective_level = base_level - floor(days_since_last_use / decay_period)`) is uncomputable from the documented data model.

**Impact:** Without skill decay, the optimizer assigns Level 4 employees who haven't picked in 6 months at full Level 4 productivity. Plans overestimate capacity by 10-30% for dormant skills.

**Fix:** Add `last_practiced_date` to `EmployeeSkill`. Populate from `ShiftAssignment` history via a nightly rollup job.

### 1.2 The Data Model Breaks the Demand Pipeline

The `DemandForecast` entity supports `daily`, `weekly`, and `monthly` granularity. The setup wizard offers `15-minute`, `hourly`, and `4-hour` granularity and explicitly states this enables intra-shift rebalancing. **These are incompatible.** Sub-daily demand cannot be stored in the `DemandForecast` table.

The `WorkloadPlan` uses a single `weighted_uph` per day. But morning shifts (experienced workers) and evening shifts (trainees) have 40% different productivity rates. **A single daily UPH systematically understaffs evenings and overstaffs mornings.**

**Impact:** The core calculation — demand → hours → FTEs — is wrong by shift for any site with heterogeneous skill distribution across shifts.

**Fix:**
- Change `DemandForecast` to use `period_start timestamptz` + `period_end timestamptz` instead of `forecast_date date`.
- Change `WorkloadPlan` to one record per shift (or per time slot), not per day.
- Compute `weighted_uph` per shift using the available workforce for that specific shift.

### 1.3 No Absence Data Anywhere in the System

The optimizer checks "employee is not on leave" as a hard constraint. The Control Room shows an "Absenteeism Monitor" widget. The reactive planning layer handles real-time absence events. **There is no entity to store any of this.** No `EmployeeLeave`, no `AbsenceRequest`, no `AvailabilityOverride`. The `Employee` entity has `availability_pattern` (a weekly template) but nothing date-specific.

**Impact:** The system cannot distinguish "employee works Mondays" (template) from "employee is on vacation next Monday" (instance). Every plan ignores planned absences.

**Fix:** Create `employee_availability_override` entity with `(employee_id, date, override_type [leave|absence|training|unavailable], status [planned|confirmed|cancelled])`. This is not optional — it is required for the optimizer to produce valid plans.

### 1.4 Employee Double-Booking Is Not Prevented

The `ShiftAssignment` UNIQUE constraint is on `(employee_id, assignment_date, plan_version_id, start_time)`. This prevents two assignments with identical start times. It does **not** prevent overlapping assignments: 06:00-14:30 AND 08:00-16:30 for the same employee would both insert successfully.

**Fix:** Use a PostgreSQL exclusion constraint with `tstzrange`:
```sql
ALTER TABLE shift_assignment
  ADD CONSTRAINT no_overlapping_shifts
  EXCLUDE USING gist (
    employee_id WITH =,
    plan_version_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  );
```

### 1.5 The Proficiency Scale Is Silently Mismatched

The wizard defaults to a 4-level proficiency scale. The optimizer assumes a 5-level scale. If an organization uses 4 levels, their "Expert" (level 4 in a 4-level system) maps to "Proficient" (level 4 in a 5-level system, 1.0x productivity instead of 1.1x). Every expert employee is silently undercounted.

**Fix:** The proficiency scale must be org-configurable in the data model, and the optimizer must read the org's scale configuration to map levels to productivity multipliers — not assume a fixed 5-level mapping.

### 1.6 Materialized Views Leak Data Across Tenants

`mv_site_dashboard` and `mv_coverage_gaps` aggregate across all organizations. PostgreSQL materialized views use definer privileges, not invoker privileges. **RLS policies do not apply to materialized views.** Any query against these views from an application context where the tenant filter is not manually added returns cross-tenant data.

**Fix:** Either:
- Query materialized views only through security-definer functions that inject `WHERE organization_id = auth.organization_id()`, or
- Replace with regular views (which inherit RLS) and accept the performance cost, or
- Create per-tenant materialized views (operational complexity)

### 1.7 The Optimizer's Output Write Creates an Inconsistency Window

When the optimizer completes a 500-employee, 28-day plan, it writes ~28,000 `ShiftAssignment` rows. At 5,000 rows per batch transaction, this takes 6 transactions over ~3 seconds. **During these 3 seconds, the plan version is partially written.** Any user opening the Planning Workbench sees a half-populated plan. Cache invalidation events fire per batch, causing 6 UI refreshes that show progressively more data — confusing the user.

**Fix:** Write optimizer output to a staging table. On completion, swap the staging data into the live table in a single transaction using `INSERT INTO ... SELECT FROM staging WHERE plan_version_id = X`. This makes the write atomic from the UI's perspective.

---

## 2. Missing Components

### 2.1 No Employee-Facing Layer (Largest User Group)

Workers are referenced in every document but have no interface:
- `failure-modes.md`: "workers check in via mobile app"
- `event-architecture.md`: "SMS sent to employees"
- `planning-adjustments.md`: "employee_acknowledged flag"
- `ux-concepts.md`: 5 personas defined — none are employees

**What's needed for MVP:** A minimal employee portal (web, not native mobile) showing: my schedule this week, upcoming changes, acknowledge button, report absence. This is not a nice-to-have — it's required for the plan-reality feedback loop that is identified as the #1 risk (R2.5).

### 2.2 No Optimizer Input/Output Contract

The algorithm documents describe 5 solver strategies. None define the data structure the solver consumes or produces. Without this contract:
- Frontend team cannot build the "Optimizing..." progress UI
- Backend team cannot build the result-writing pipeline
- Test team cannot build solver fixtures
- The algorithm itself cannot be validated against expected outputs

**What's needed:** A typed interface:
```typescript
interface SolverInput {
  site_id: string;
  planning_horizon: { start: Date; end: Date };
  time_slot_granularity_minutes: number;
  employees: Array<{ id: string; skills: SkillRecord[]; availability: DateRange[]; constraints: EmployeeConstraint[] }>;
  processes: Array<{ id: string; demand_by_slot: Map<TimeSlot, number>; min_skill_level: number }>;
  shift_patterns: ShiftPattern[];
  hard_constraints: HardConstraint[];
  soft_constraints: SoftConstraint[];
  objective_weights: ObjectiveWeights;
  locked_assignments: ShiftAssignment[];
  time_budget_seconds: number;
}

interface SolverOutput {
  assignments: ShiftAssignment[];
  objective_value: number;
  coverage_by_slot: Map<TimeSlot, CoverageMetric>;
  constraint_violations: SoftConstraintViolation[];
  solve_time_ms: number;
  solver_strategy_used: string;
  optimality_gap_percent: number | null;
}
```

### 2.3 No Concurrency Model for the Planning Workbench

The wizard has real-time presence indicators ("Maria is also editing Phase 3"). The Planning Workbench — where stakes are higher — has nothing. Two managers can silently overwrite each other's work for 10+ minutes before either notices.

**What's needed:** At minimum:
- Presence indicators ("Tom is viewing Week 48, Site 14")
- Broadcast of changes via Supabase Realtime ("Tom assigned Employee X to Picking at 14:00")
- Conflict detection at edit time, not at undo time

### 2.4 No Plan State Machine

`PlanVersion` has `approval_status` with values like Draft, Optimized, Under Review, Published, Stale. But **the valid transitions are never defined.** Can Published go back to Draft? What triggers Stale — any data change, or only demand changes? Who can transition between states?

**What's needed:** An explicit state machine:
```
Draft → Optimized (via optimizer completion)
Optimized → Under Review (via planner submission)
Under Review → Approved (via manager approval)
Under Review → Draft (via rejection with comments)
Approved → Published (via planner publish action)
Published → Stale (via demand forecast update or absence event)
Stale → Optimized (via re-optimization)
Published → Superseded (via new version published)
```

---

## 3. Scalability Risks

### 3.1 Optimizer Data Preload Is the True Bottleneck

The `< 60 second` plan generation target refers to solver time only. Before solving, the optimizer must:

| Step | Work | Estimated Latency |
|------|------|-------------------|
| Load 500 employees + skills | 5-table join per process | 2-5s |
| Compute skill decay for each | Requires `last_used_date` (missing) | 1-2s |
| Load 28 days of demand | Filter + aggregate DemandForecast | 0.5-1s |
| Load labor rules for jurisdiction | 4-level hierarchy resolution | 0.5s |
| Load locked assignments | Filter ShiftAssignment | 0.5s |
| Build candidate matrix (500 × 20 × 84 slots) | 840,000 cells | 1-3s |
| **Total preload** | | **5-12s** |

The real end-to-end latency for plan generation is **65-72 seconds**, not 60. If skill decay is added (requiring ShiftAssignment history queries), preload could reach 15-20 seconds.

**Fix:** Pre-compute and cache the employee-skill-availability matrix per site. Invalidate on employee/skill changes. This reduces preload from 5-12s to < 1s.

### 3.2 Rate Limit Math Breaks Under Normal Concurrent Usage

Frontend polls assignments every 10 seconds = 6 reads/min per user. Backend rate limit = 100 reads/min per user. That leaves 94 reads/min for everything else — sounds fine for a single user.

But the rate limit in `backend-architecture.md` is stated as **100 reads/min per user**, while a single open Planning Workbench tab also runs:
- TanStack Query background refetches on `employees` (staleTime: 5min)
- TanStack Query background refetches on `workload` (staleTime: 1min)
- Coverage heatmap polling if not on WebSocket
- Dashboard widget data fetches

A planner with the Planning Workbench + Control Room open easily hits 20-30 reads/min from background polling alone, plus 6/min from assignment polling. **Real usage is 25-36 reads/min before any user interaction.**

With 50 concurrent users at 30 reads/min = 1,500 reads/min to the database. The `scalability-design.md` connection pool is 200 max PostgreSQL connections. At 1,500 reads/min, each connection handles ~7.5 queries/min = 1 query every 8 seconds. This is sustainable — but leaves zero headroom for optimizer pre-load queries (which are expensive multi-table joins running simultaneously).

**Fix:** Batch polling into a single aggregated subscription per plan view. Replace polling with Supabase Realtime subscriptions for assignment changes. Reserve a dedicated connection pool for optimizer queries.

### 3.3 Monte Carlo Simulation Blocks Background Workers

A single Monte Carlo run (1,000 iterations, 10 parallel workers) occupies workers for 8-15 minutes. The tenant fairness limit caps each tenant at 20% of the worker pool. If the pool has 50 workers, one Monte Carlo run takes 10 workers for 15 minutes, blocking those workers from processing other tenants' quick-solve requests.

**Fix:** Monte Carlo is deferred from MVP (per mvp-definition.md). For V2, implement priority queues with preemption: interactive solves preempt Monte Carlo iterations.

---

## 4. UX Complexity Issues

### 4.1 The Coverage Heatmap Tooltip Requires a Live Query That Isn't Indexed

Hovering a heatmap cell shows assigned employees and missing skills. Target: < 100ms. The query requires:
1. Filter `ShiftAssignment` by `(site_id, process_id, plan_version_id, time_range)`
2. Join to `Employee` for names
3. Cross-check `EmployeeSkill` for skill gaps

The composite index `idx_shift_assignment_org_site_date_version` covers `(org_id, site_id, date, version)` but **does not include `process_id` or time range**. The tooltip query scans all assignments for that site/date/version and filters in-memory. At 500 employees × 3 shifts = 1,500 assignments per day, this is a sequential scan of 1,500 rows per hover.

**Fix:** Add a covering index: `(organization_id, site_id, assignment_date, plan_version_id, process_id) INCLUDE (employee_id, start_time, end_time)`. This makes the tooltip an index-only scan.

### 4.2 The Scenario Comparison Dashboard Has No Pre-Computed Support

Comparing 3 scenarios requires cross-version joins on `WorkloadPlan` and `ShiftAssignment` aggregated by `(site, date, process)`. No materialized view covers cross-version comparison. The `< 3 second` target requires either:
- Pre-computing comparison metrics when a scenario solve completes (not documented), or
- Running 3 parallel aggregation queries at comparison time (likely exceeds 3s at scale)

**Fix:** When a scenario solve completes, compute and store summary KPIs (total_cost, coverage_rate, overtime_hours, fte_count) as columns on `PlanVersion`. Comparison becomes a simple query against the `PlanVersion` table.

### 4.3 The Setup Wizard Tries to Do Too Much in One Flow

8 phases, 75-295 minutes, requiring knowledge from 4-6 different people (IT, HR, operations, legal, finance). No single person in a logistics company has all this knowledge. The wizard is designed for a solo operator but requires a committee.

**Fix for MVP:**
- Split the wizard into role-specific tracks: IT track (integrations), HR track (employees, rules), Ops track (processes, demand, standards)
- Allow tracks to complete independently with inter-track validation at the end
- Reduce the MVP wizard to 5 phases (org, sites, processes, employees, go-live) — defer demand integration to a separate setup flow

### 4.4 Three Scheduling Views Is Two Too Many

The Planning Workbench offers Timeline View, Process View, and Gantt View — all with full drag-and-drop. Building 3 production-quality interactive scheduling views with constraint validation, optimistic updates, and virtualization is 12-16 weeks of frontend work.

**Fix for MVP:** Build one view (Process View — processes as rows, time slots as columns, headcount per cell). This is the most useful for operations planning. Timeline (employee-centric) can be V2. Gantt is power-user — V3.

---

## 5. Over-Engineering Assessment

### Things That Should Be Cut From MVP

| Feature | Current State | Why Cut | What to Ship Instead |
|---------|--------------|---------|---------------------|
| Monte Carlo simulation | 1,000 iterations, LHS, correlation | Statistical engine competing with core planning | Simple what-if: change one variable, see result |
| GA/SA solver strategies | Full chromosome encoding, crossover ops | Academic complexity, broken encoding (A2) | Greedy + HiGHS MIP only |
| Event sourcing for plans | Immutable event stream, time travel | Significant complexity for debugging feature | Snapshot-per-version (just store the full plan) |
| Skill decay model | Automatic proficiency degradation | Requires `last_used_date` that doesn't exist | Manual skill management (supervisors update levels) |
| Fleet learning defaults | k-anonymity, CoV thresholds | No fleet data at launch | Expert-curated static defaults |
| 7-level config hierarchy | Global→Region→Country→SiteGroup→Site→Process→Override | Config inheritance bugs are notoriously hard | 3 levels: org → site → override |
| Configurable widget dashboard | Drag-drop, resize, named layouts | Premature before user research | Fixed role-based layouts |
| Full WCAG 2.1 AA on drag-drop grid | Keyboard nav, screen reader, ARIA | 4-8 week effort alone | Basic a11y; full compliance V2 |
| CBA contract AI parsing | NLP extraction from legal documents | Highest-risk AI claim in the system | Manual CBA rule entry |
| Edge/offline with CRDTs | Offline-first with conflict resolution | 6-8 week effort, not MVP scope | Online-only |

**Estimated effort freed: ~45-60 engineering weeks** redirected to core planning quality.

### Things That Should Be Added to MVP (Currently Missing)

| Component | Why It's MVP | Effort |
|-----------|-------------|--------|
| Employee availability/absence entity | Optimizer produces invalid plans without it | 1 week |
| Minimal employee schedule view | Workers need to see their schedule | 2-3 weeks |
| Overlap-prevention exclusion constraint | Prevents employee double-booking | 1 day |
| Optimizer I/O contract (TypeScript types) | Solver cannot be developed without it | 3 days |
| Plan state machine | Prevents invalid plan transitions | 2 days |
| Heatmap tooltip index | < 100ms hover target unachievable without it | 1 day |
| RLS-safe materialized view queries | Prevents cross-tenant data leakage | 2 days |

---

## 6. Concrete Improvements — Prioritized

### Week 1: Fix the Foundation

1. **Add missing entities to schema.sql:**
   - `employee_availability_override` (leave, absence, training, unavailable)
   - `approval_record` (who approved what plan version, when, with what comments)
   - Add `last_practiced_date` to `employee_skill`

2. **Fix broken constraints:**
   - Replace ShiftAssignment UNIQUE with exclusion constraint (prevent overlaps)
   - Fix DemandForecast to use `period_start/period_end timestamptz`
   - Change WorkloadPlan to per-shift granularity
   - Add `proficiency_scale_config` to Organization (not hardcoded 5 levels)

3. **Fix materialized view RLS leak:**
   - Wrap all MV queries in security-definer functions with tenant filter

4. **Write the optimizer I/O contract** as TypeScript interfaces

### Week 2: Resolve Architectural Decisions

5. **Decide on the employee-facing layer:**
   - Minimal web portal (schedule view, absence reporting, acknowledgment)
   - Add to build sequence as Phase 4.5 (parallel with Planning UX)

6. **Define the plan state machine** with valid transitions and role permissions

7. **Design the optimizer preload cache:**
   - Pre-compute employee-skill-availability matrix per site
   - Invalidate on employee/skill/availability changes
   - Target: preload < 1s instead of 5-12s

8. **Design the Workbench concurrency model:**
   - Supabase Realtime subscription per plan version
   - Broadcast assignment changes to all viewers
   - Presence indicators ("Tom is editing Week 48")

### Week 3: Fix Legal Issues

9. **Fix 6 legally incorrect specifications:**
   - L1: Add shift cancellation constraints per jurisdiction
   - L2: Add Nevada daily OT rule
   - L3: Add industry-specific federal rest rules
   - L4: Change EU consecutive days from soft penalty to hard constraint
   - L5: Add disclaimer to auto-loaded jurisdiction rules
   - L6: Document CBA as unsupported in MVP with explicit warning

10. **Sign sub-processor DPAs** (Supabase, Vercel, Anthropic) — GDPR blocker

### Week 4: Validate Assumptions

11. **Benchmark HiGHS WASM** at 50, 200, 500 employees on Supabase Edge Function
    - Measure: memory usage, solve time, solution quality
    - Decision gate: if 200-employee problem exceeds 256MB, route all MIP to Fly.io

12. **Validate Ruflo** for production multi-agent orchestration
    - If fails: fallback to sequential single-agent Claude calls
    - Design wizard AI to work without multi-agent coordination

13. **Test tRPC + Supabase Edge Functions (Deno)** compatibility
    - Test: BullMQ, pg_cron triggers, connection pooling behavior
    - Identify any npm packages that don't work in Deno

---

## 7. Revised Build Sequence (Key Changes from Current)

The current build-sequence.md has the right phases but wrong ordering for the hardest risks:

| Phase | Current | Revised | Why |
|-------|---------|---------|-----|
| 0 | Foundation (auth, schema, RLS) | **Same + fix schema bugs + optimizer I/O contract** | Can't build anything on a broken schema |
| 1 | Data core (CRUD) | **Same + employee availability entity** | Optimizer needs this from day 1 |
| 2 | Demand & workload | **Same but per-shift workload, not per-day** | Fixes the systematic understaffing bug |
| 3 | Optimization | **Add: preload cache, staging table writes, benchmarking** | The riskiest phase — needs more design upfront |
| 4 | Planning UX | **One view (Process View) only, not three** | Saves 8-12 weeks |
| 4.5 | *(new)* Employee schedule view | **Minimal read-only portal** | Required for plan-reality feedback loop |
| 5 | Setup wizard | **5 phases, not 8. No AI document upload.** | Reduces complexity, faster to ship |
| 6 | Polish | **Same** | |
| 7 | Hardening | **Add: RLS integration tests, legal compliance audit** | Security and compliance validation |
| 8 | Launch | **Same** | |

---

---

## 8. Cross-Document Coherence Issues (From Architecture Review)

The third review agent found additional contradictions that compound the handoff failures above:

### 8.1 Three Different RLS Mechanisms Across Three Documents

| Document | RLS Predicate |
|----------|--------------|
| system-overview.md | `auth.jwt() ->> 'tenant_id'` |
| backend-architecture.md | `current_setting('app.tenant_id')` (set by middleware) |
| schema.sql | `auth.organization_id()` (reads `request.jwt.claims`) |

These are three different security implementations. Only one can be correct. Using them inconsistently means some Edge Functions bypass RLS. The schema.sql approach (JWT-based) is the most Supabase-native and should be canonical.

### 8.2 Schema Structure: Flat vs Modular — Not Decided

- `backend-architecture.md` describes per-module PostgreSQL schemas: `demand.*`, `workforce.*`, `planning.*`
- `schema.sql` places all tables in the `public` schema

This affects every ORM query, every migration, every cross-module view, and the materialized view architecture. Must be decided before Phase 0 ends.

### 8.3 schema.sql Missing Critical Extensions

The schema.sql does not include `pgvector`, `pgsodium`, `pgaudit`, or `pg_cron` — all described as core dependencies in tech-stack.md and backend-architecture.md. Employee PII columns (`first_name`, `last_name`, `email`) are plain VARCHAR with no encryption, contradicting the stated `pgsodium` encryption requirement.

### 8.4 Naming Inconsistency: tenant_id vs organization_id

System-overview uses `tenant_id`. Schema.sql uses `organization_id`. Backend-architecture uses both interchangeably. Build-sequence uses `DemandSignal` as a table name that doesn't exist in schema.sql (which calls it `demand_forecast`). These inconsistencies will cause integration bugs between independently-developed modules.

### 8.5 Tech Stack Still Contradicts MVP Scope

| Claim | tech-stack.md | mvp-definition.md |
|-------|--------------|-------------------|
| Locales | 7 at launch | English only |
| Monte Carlo | TypeScript-native, < 2s | V2 (deferred) |
| Service Workers | Offline schedule caching | V3+ (deferred) |
| Embedding providers | Voyage AI + OpenAI (dual) | Not mentioned |

### 8.6 Seven Hardest Integration Points (Ranked by Risk)

1. **HiGHS WASM in Edge Functions** — 256MB limit vs solver memory. No production precedent. If this fails, all optimization routes through Fly.io, adding latency and complexity.
2. **tRPC in Deno runtime** — Limited production validation. Compatibility issues with npm packages (BullMQ, etc.).
3. **Supabase Realtime + optimistic UI + concurrent editing** — Race conditions between optimistic state, server confirmation, and other users' WebSocket events.
4. **BullMQ → Fly.io → Supabase Realtime** — 4-system async chain for large solver results. Any link failure leaves plans in "processing" state.
5. **RLS consistency across migrations** — Every new table needs correct policies. Service role bypass must be audited.
6. **pgvector + RLS** — Semantic search across embeddings must respect tenant isolation. HNSW index scans could surface cross-tenant results if RLS is misconfigured.
7. **AI cost tracking (Redis increment + daily PostgreSQL reconciliation)** — Dual-write consistency gap affects billing accuracy.

---

## Summary

This system's architecture is fundamentally sound in its layered design (data → optimization → UX). But **the layers don't connect properly.** The data model can't support what the optimizer needs (no absences, no skill decay dates, wrong granularity). The optimizer's output write is non-atomic. The UX makes latency promises the database indexes don't support. The risk register misses risks the architecture itself creates.

The good news: these are all fixable with 3-4 weeks of focused design work before coding begins. The worst outcome would be starting to code against the current specs and discovering these handoff failures at integration time.
