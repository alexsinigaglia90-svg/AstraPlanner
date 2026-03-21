# AstraPlanner Build Plan

> **Authority:** This is the single operational plan for AstraPlanner development. Engineers follow this document from Day 1 to launch and beyond.
> **Status:** ACTIVE
> **Supersedes:** `build-sequence.md`, `phases.md`, and `mvp-definition.md` remain as reference. This document is the operational source of truth.
> **Last updated:** 2026-03-20
> **Target:** Working MVP in 24 weeks. Enhanced product by Month 12. Enterprise by Month 18+.

---

## 1. Product Vision

**The product.** AstraPlanner is an AI-driven workforce planning platform for logistics operations. It replaces spreadsheet-based shift planning with a system that ingests external demand forecasts, computes workload requirements using proven industrial engineering formulas, generates optimized employee schedules via mathematical solvers, and provides a control room for real-time operational visibility. It is multi-tenant SaaS deployed on Vercel and Supabase.

**The user.** Our primary user is the warehouse operations planner -- the person currently spending hours in Excel matching employee names to shift slots, manually checking certifications, and guessing at coverage gaps. They work at distribution centers, fulfillment hubs, and warehouse operations with 50-5,000 employees across 1-50 sites. They already have demand forecasts from their WMS or ERP. They need a tool that turns those forecasts into executable staffing plans without the manual grind.

**The core loop.** Demand arrives (CSV upload or API push) and is converted to process volumes via configurable conversion ratios. Process volumes become required labor hours using productivity rates and allowance factors. Hours become FTE requirements adjusted for absenteeism. The optimization engine matches available employees to required slots, respecting hard constraints (labor law, certifications, availability) while optimizing for cost, coverage, skill match, and overtime minimization. Planners review, adjust, approve, and publish. Employees see their schedules. Actual performance feeds back into the next cycle.

**The differentiator.** AstraPlanner is built from the ground up for AI that earns autonomy over time. MVP ships with deterministic optimization (greedy heuristic + HiGHS MIP solver). V2 adds AI recommendations that learn from planner behavior -- every manual adjustment teaches the system what good plans look like. V3 introduces earned autonomy: the AI acts on high-confidence decisions automatically, while humans retain oversight of novel or edge-case situations. The system gets smarter with every planning cycle, but the human is always in control of the trust boundary.

**Product milestones:**

| Milestone | Timeline | What It Means |
|-----------|----------|---------------|
| **MVP** | 24 weeks | Planning works. A planner can go from demand data to published schedule using the optimizer, with full constraint checking and approval workflow. |
| **Enhanced** | Month 8-12 | AI recommends. The system suggests staffing levels, flags risks, predicts absences, and learns from planner corrections. |
| **Enterprise** | Month 18+ | AI acts. Earned autonomy for routine decisions. Cross-site optimization. SSO/SAML. SOC 2. Strategic workforce planning. |

---

## 2. Scope Lock

### 2.1 Features IN (MVP)

| # | Feature | Description |
|---|---------|-------------|
| 1 | Setup Wizard | 5-phase guided onboarding: org, sites, processes, employees, go-live (D-12) |
| 2 | Demand Ingestion | CSV upload + REST API push with validation, versioning, normalization |
| 3 | Workload Computation | Demand-to-hours-to-FTE conversion using invariant formulas |
| 4 | Optimization Engine | Greedy heuristic (< 1s interactive) + HiGHS MIP (< 10s/60s) per D-06 |
| 5 | Employee Management | CRUD, CSV import, skill assignment (5-level proficiency per D-03), availability |
| 6 | Shift Assignment | AI-generated plans + manual drag-and-drop with real-time constraint validation |
| 7 | Control Room | Coverage heatmap, demand vs capacity, KPI cards, real-time updates |
| 8 | Scenario Simulation | Single-variable what-if, side-by-side comparison, scenario persistence |
| 9 | Plan Versioning | Snapshot-based, version history, diff, restore |
| 10 | Approval Workflow | Draft > Proposed > Approved > Published with role-based transitions |
| 11 | Role-Based Access | 7 roles enforced at UI, API (tRPC middleware), and DB (RLS) levels |

### 2.2 Features OUT

| Feature | Why Deferred | Target |
|---------|-------------|--------|
| Built-in demand forecasting | Needs 6+ months data + ML pipeline | V2 |
| Monte Carlo simulation | Computationally expensive, probabilistic models needed | V2 |
| Cross-site workforce optimization | Multi-site solver, transfer cost modeling | V2 |
| Mobile app (native) | Responsive web is sufficient for MVP | V2+ |
| T&A integration | Streaming infrastructure, hardware integration | V2 |
| Union/CBA rule engine | Deep per-customer customization | V2+ |
| AI document extraction | Document parsing pipeline required | V2 |
| Advanced analytics / BI | Basic KPIs cover MVP needs | V2 |
| Real-time telemetry ingestion | Kafka/Kinesis pipeline needed | V2 |
| Offline mode / Service Workers | CRDTs, conflict resolution | V3+ |
| Multi-region deployment | Replication, data residency | V2+ |
| Payroll calculation | Never -- integration only | Never |
| Clone-and-modify sites | Useful at scale, not needed initially | V1.1 |
| Multi-language UI | i18n infrastructure ready, only English ships | V1.1 |

### 2.3 Technical Constraints

| Constraint | Limit |
|-----------|-------|
| Deployment | Single Supabase project, single region |
| Language | English only |
| Concurrent users | Max 50 active sessions |
| Database | < 10 GB per tenant |
| Interactive optimization | 10-second solver budget |
| Background optimization | 60-second solver budget |
| Edge Function | 60s timeout, 256 MB memory |
| CSV uploads | Max 50 MB per file |
| Claude AI | Rate-limited per tenant (configurable quota) |
| Browsers | Latest 2 versions: Chrome, Firefox, Safari, Edge |

---

## 3. Architecture Summary

This section is a build spec, not a design discussion. All decisions below are LOCKED per `DECISIONS.md`.

### 3.1 Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | Next.js 14+ (App Router) | Initialized from Supastarter template |
| Database | Supabase (PostgreSQL 15+) | Pro plan, single project |
| Auth | Supabase Auth | Email/password, JWT with `organization_id` + `role` claims |
| API | tRPC | 40+ procedures defined in `api-contracts.md` |
| Solver (interactive) | HiGHS WASM | In Supabase Edge Function or browser |
| Solver (background) | HiGHS native (Node.js) | On Fly.io worker via BullMQ + Upstash Redis |
| AI | Claude API (Anthropic) | Wizard suggestions, future recommendations |
| Hosting (frontend) | Vercel | Preview on PR, production on merge to main |
| Hosting (workers) | Fly.io | Background optimization jobs |
| Real-time | Supabase Realtime (WebSocket) | No Kafka (D-05, D-13) |
| Events | DB Webhooks + Edge Functions | Durable via PostgreSQL `events` table |

### 3.2 Schema

- Flat `public` schema with naming convention prefixes (D-01)
- 20+ tables across 5 modules: Organizational, Demand, Workforce, Planning, System
- RLS on every table via `auth.organization_id()` reading from JWT claims (D-02)
- Materialized views replaced with security-definer functions (D-04)
- `btree_gist` extension for shift overlap exclusion constraint (D-18)
- 8-state plan lifecycle enum with transition trigger
- Audit triggers on 6 critical tables: `employee`, `plan_version`, `shift_assignment`, `labor_rule`, `employee_skill`, `employee_availability_override`
- Atomic optimizer result writes via staging table swap

### 3.3 Solver

Two algorithms per D-06:

| Algorithm | Use Case | Time Budget | Runs Where |
|-----------|----------|-------------|------------|
| Greedy heuristic | Interactive "what-if", gap suggestions | < 1s | TypeScript in browser or Edge Function |
| HiGHS MIP | Production plan generation | 10s (interactive), 60s (background) | WASM in Edge Function or native on Fly.io |

Both conform to the canonical `SolverInput` / `SolverOutput` contract defined in `solver-contract.md`. The solver is a pure function: same input, same output (deterministic). Post-solve validation independently verifies all hard constraints.

### 3.4 API

40+ tRPC procedures organized into 7 module routers:

| Router | Procedures | Scope |
|--------|-----------|-------|
| `org` | getOrganization, updateOrganization, listSites, getSite, updateSiteSettings, listDepartments, listProcesses, upsertProcess | Org & site management |
| `workforce` | listEmployees, getEmployee, upsertEmployee, importEmployeesCSV, updateSkill, createAvailabilityOverride, updateAvailabilityOverride, getMySchedule, acknowledgeSchedule | Employee management & portal |
| `demand` | listForecasts, upsertForecast, importCSV, deleteForecasts, listDemandTypes, upsertDemandType | Demand ingestion |
| `workload` | compute, getForPlan | Workload computation |
| `planning` | listPlanVersions, getPlanVersion, createDraft, runOptimizer, getOptimizerStatus, transitionState, manualAssign, removeAssignment, lockAssignment, overrideHardConstraint | Plan lifecycle |
| `scenario` | create, run, list, promote | What-if simulation |
| `wizard` | getProgress, completePhase, skipPhase | Setup wizard |
| `admin` | listUsers, inviteUser, updateUserRole, deactivateUser, getSystemHealth, getAuditLog, listLaborRules, upsertLaborRule, listNotifications, markNotificationRead | Administration |

All procedures are tenant-scoped via JWT, authenticated, and role-checked in middleware.

### 3.5 Auth & Roles

Supabase Auth with JWT custom claims. 7 roles with hierarchical permissions:

| Role | Scope | Can Do |
|------|-------|--------|
| `super_admin` | Platform | Platform operations (not tenant-visible) |
| `tenant_admin` | Organization | Full config, user management, all sites, billing |
| `site_manager` | Assigned sites | Approve plans, manage workforce, invite users |
| `planner` | Assigned sites | Create/edit plans, run optimizer, submit for approval |
| `supervisor` | Assigned sites | View plans, manage team skills, approve overrides |
| `employee` | Self only | View own schedule, report absence, acknowledge shifts |
| `viewer` | Assigned sites | Read-only dashboards and published plans |

Enforced at three levels: UI route guards, tRPC middleware, RLS policies.

### 3.6 Reference Documents

| Document | Contains |
|----------|---------|
| `DECISIONS.md` | 19 locked architectural decisions |
| `api-contracts.md` | Full tRPC procedure definitions with types |
| `solver-contract.md` | SolverInput/SolverOutput TypeScript interfaces + contract rules |
| `schema.sql` | Complete DDL -- execute in Supabase SQL Editor |
| `core-invariants/invariants.md` | 9 core invariants defining system correctness |
| This document | What to build, when, and how |

---

## 4. Phase Roadmap

### Phase 0: Project Kickoff (Week 0 -- 2-3 days)

**Goal:** Team aligned, tools configured, no open questions.

Before any code is written:

**Setup tasks:**
- [ ] Initialize GitHub repo structure: `/src`, `/tests`, `/supabase/migrations`, `/supabase/functions`, `/docs`
- [ ] Create `.env.example` with all required variables from DECISIONS.md (Supabase URL, anon key, service role key, Upstash Redis URL, Claude API key, Fly.io token)
- [ ] Configure branch protection on `main`: require PR + 1 review + CI pass
- [ ] Set up Vercel project linked to GitHub repo

**Team alignment:**
- [ ] Every engineer reads: `invariants.md`, `DECISIONS.md`, `api-contracts.md`, `solver-contract.md`
- [ ] Review session (2 hours): walk through the planning flow (INV-1), solver contract, and API contracts
- [ ] Assign Phase 1 work items

**Decision gate -- Spike test (1 day):**
- [ ] Deploy a minimal tRPC router to a Supabase Edge Function
- [ ] Confirm tRPC works with Supabase Edge Functions (Deno runtime)
- [ ] If incompatible: tRPC runs on Vercel API routes (Next.js) instead -- documented fallback
- [ ] Result documented in a brief spike report

**Exit criteria:**
- [ ] GitHub repo structure exists with CI/CD skeleton
- [ ] All engineers have read the 4 core documents
- [ ] tRPC + Supabase compatibility confirmed or fallback chosen
- [ ] No open architectural questions

---

### Phase 1: Foundation (Weeks 1-2)

**Goal:** Running application with auth, database, and CI/CD.

**Deliverables:**

1. **Next.js project initialization**
   - Initialize from Supastarter template (or clean Next.js 14+ App Router)
   - Configure TypeScript strict mode, ESLint, Prettier
   - Set up Tailwind CSS + shadcn/ui component library
   - Configure `next-intl` infrastructure (English only, but i18n-ready for V1.1)

2. **Supabase project provisioning**
   - Create Supabase project (Pro plan)
   - Execute corrected `schema.sql` in SQL Editor (20+ tables, enums, RLS, triggers, audit)
   - Verify: all tables created, RLS enabled, `auth.organization_id()` function exists
   - Verify: `btree_gist` extension active, exclusion constraint on `shift_assignment` works
   - Verify: plan state transition trigger fires and rejects invalid transitions

3. **Authentication**
   - Supabase Auth: email/password sign-up and sign-in
   - JWT custom claims hook: inject `organization_id` and `role` into JWT on sign-in
   - Auth middleware: protect all routes, extract user context
   - Redirect logic: unauthenticated -> login, no org -> wizard, complete -> dashboard

4. **tRPC foundation**
   - Root router with module sub-routers (empty handlers initially)
   - Auth middleware: validate JWT, extract `organization_id` and `role`
   - Tenant middleware: set `organization_id` context for all procedures
   - `admin.getSystemHealth` procedure: verify DB connectivity (first working endpoint)
   - Error handling: map Supabase/Postgres errors to tRPC error codes

5. **CI/CD pipeline**
   - GitHub Actions workflow: lint, type-check, test on every PR
   - Vercel integration: preview deployment on PR, production on merge to `main`
   - Supabase CLI: migration runner for schema changes

6. **Seed data script**
   - Create seed script (`supabase/seed.sql` or TypeScript script)
   - Seed: 1 organization, 2 sites (different timezones), 5 processes (picking, packing, receiving, shipping, forklift), 20 employees with varied skills/proficiency levels, 3 shift patterns (day, afternoon, night), sample demand forecasts for 1 week
   - Run on every preview deployment for consistent testing

**Exit criteria:**
- [ ] `npm run dev` starts the application with login page
- [ ] New user can sign up, sign in, and receive a valid JWT with `organization_id` claim
- [ ] `admin.getSystemHealth` returns database connection status
- [ ] RLS prevents cross-tenant access (test: create 2 orgs, attempt cross-access via service role with wrong `organization_id`)
- [ ] Seed data populates correctly and is visible via Supabase Dashboard
- [ ] Preview deployment works on Vercel from a PR
- [ ] CI pipeline passes (lint + type-check + seed data test)

---

### Phase 2: Data Core (Weeks 3-5)

**Goal:** All entity CRUD works, CSV import works, audit trail fires.

**Deliverables:**

1. **Organization & Site management**
   - `org.getOrganization`, `org.updateOrganization`
   - `org.listSites`, `org.getSite`, `org.updateSiteSettings`
   - `org.listDepartments`
   - Site settings include: `allowance_factor`, `allowance_breakdown`, `operating_hours`, `max_headcount`, `absenteeism_rate`, `notification_retention_days`
   - Admin UI pages: organization settings, site list, site detail/settings

2. **Process management**
   - `org.listProcesses`, `org.upsertProcess`
   - Productivity standards: must include all 5 proficiency levels per D-03
   - Validation: `units_per_hour > 0`, Level 4 is baseline (1.0x)
   - UI: process list, create/edit form with productivity standard table

3. **Employee management**
   - `workforce.listEmployees` (with search, filters, pagination)
   - `workforce.getEmployee`, `workforce.upsertEmployee`
   - Employee detail page: profile, skills, availability
   - Status management: active, on_leave, suspended, terminated

4. **CSV import**
   - `workforce.importEmployeesCSV` with dry-run mode
   - File upload to Supabase Storage, parse with Papa Parse
   - Column mapping UI: user maps CSV columns to entity fields
   - Validation: required fields, data types, duplicate employee_number detection
   - Error report: row-level errors with field and message
   - Constraints: UTF-8 encoding, comma-delimited, max 50 MB

5. **Skill assignment**
   - `workforce.updateSkill`
   - UI: skill matrix (employees x processes), click to set proficiency level (1-5)
   - Certification fields: `certification_date`, `expiry_date`
   - Validation: proficiency_level BETWEEN 1 AND 5 (enforced at API and DB)

6. **Availability management**
   - `workforce.createAvailabilityOverride`, `workforce.updateAvailabilityOverride`
   - Template patterns stored in `employee.preferences_json`
   - Override types: leave, absence, training, unavailable, extra_availability
   - Override status lifecycle: planned > confirmed > cancelled
   - UI: employee availability calendar showing template + overrides

7. **Audit verification**
   - Confirm triggers fire on: employee, employee_skill, employee_availability_override
   - Verify `audit_log` records contain `before_state` and `after_state` JSONB
   - `admin.getAuditLog` query works with filters

**Exit criteria:**
- [ ] CRUD operations work for all entities (org, site, process, employee, skill, availability)
- [ ] CSV import successfully imports 1,000 employees with validation errors reported
- [ ] Skill matrix displays and updates correctly
- [ ] Availability override creates `employee_availability_override` records
- [ ] Audit log shows correct before/after state for employee updates
- [ ] RLS confirmed: user in Org A cannot see Org B's employees
- [ ] All tRPC procedures match signatures in `api-contracts.md`

---

### Phase 3: Demand & Workload Engine (Weeks 6-8)

**Goal:** Demand flows into workload requirements that the optimizer can consume.

**Deliverables:**

1. **Demand ingestion**
   - `demand.listForecasts`, `demand.upsertForecast`, `demand.deleteForecasts`
   - `demand.listDemandTypes`, `demand.upsertDemandType`
   - `demand.importCSV` with dry-run, column mapping, validation
   - Demand type -> process mapping with conversion ratios
   - Versioning: each upload creates new records; previous retained for audit
   - Validation: non-negative volume, valid time ranges, duplicate detection
   - UI: demand upload page, demand table with filters, demand type configuration

2. **Workload computation**
   - `workload.compute` procedure implementing the invariant formula chain:
     ```
     process_volume = demand_volume * conversion_ratio
     required_hours = process_volume / productivity_rate * (1 + allowance_factor)
     required_fte  = required_hours / available_hours_per_fte
     gross_fte     = required_fte / (1 - absenteeism_rate)
     ```
   - Per-shift computation using `period_start` / `period_end` timestamptz
   - Skill-level weighted UPH: use proficiency-adjusted productivity rates from `process_productivity_standard`
   - Allowance factor: single scalar per D-07, sourced from `site.settings_json.allowance_factor`
   - Absenteeism buffer: sourced from `site.settings_json.absenteeism_rate`
   - `workload.getForPlan` to retrieve computed workload

3. **Workload dashboard**
   - Bar charts: required FTEs vs available FTEs per process per time slot
   - Summary cards: total required FTEs, total available, gap percentage
   - Filterable by site, date range, process

4. **Auto-recompute on demand change**
   - Database Webhook on `demand_forecast` INSERT/UPDATE
   - Edge Function triggers workload recomputation for affected plan versions
   - Published plans marked as `stale` when underlying demand changes

**Exit criteria:**
- [ ] CSV demand upload for 1 week of hourly data (168 time slots) succeeds with validation
- [ ] Workload computation output matches hand-calculated values within 1% tolerance
- [ ] Changing demand volume triggers workload recomputation automatically
- [ ] Dashboard shows correct required vs available FTE bars
- [ ] Demand type with 2 process mappings (e.g., 1 order = 1 pick + 1 pack) fans out correctly
- [ ] Published plan transitions to `stale` when demand is updated for its period

---

### Phase 4: Optimization Engine (Weeks 9-12)

**HIGHEST RISK PHASE. Contains a decision gate at Week 9.**

#### Week 9 -- Decision Gate

Before building the full optimizer, benchmark HiGHS WASM:

- [ ] Create a representative problem: 50 employees, 5 processes, 7-day horizon, 3 shifts/day
- [ ] Run HiGHS WASM in a Supabase Edge Function
- [ ] Measure: memory usage, solve time, solution quality (coverage %)
- [ ] **GO:** if < 200 MB memory AND < 10s solve time -> proceed with Edge Function as primary
- [ ] **NO-GO:** if exceeds limits -> route ALL optimization through Fly.io worker from Day 1

Document the benchmark results. This decision affects the deployment architecture for the rest of the project.

#### Weeks 9-12 Deliverables

1. **Greedy heuristic (TypeScript-native)**
   - Implements `SolverInput -> SolverOutput` contract exactly
   - Assignment priority: highest-demand slots first, best-skilled available employee
   - Hard constraint checking on every assignment attempt
   - Sub-second execution for up to 200 employees
   - Used for: interactive gap suggestions, scenario what-if, fallback

2. **HiGHS MIP integration**
   - Problem formulation: translate `SolverInput` into MIP variables, constraints, objective
   - Decision variables: binary `x[employee][process][timeslot]` = 1 if assigned
   - Hard constraints become MIP constraints (max hours, rest periods, certifications, availability, capacity, no overlap)
   - Soft constraints become penalty terms in objective function with configurable weights
   - Solution parsing: translate MIP solution back to `SolverOutput`
   - Time budget enforcement: HiGHS returns best-found solution at budget expiry
   - Optimality gap reporting in `metrics.optimality_gap`

3. **Constraint engine**
   - Hard constraints: max weekly hours, min rest between shifts, max consecutive days, required certification, min skill level, no overlapping assignments, mandatory break, site capacity, employee availability
   - Soft constraints: shift preference, home site preference, workload balance, overtime minimization, team continuity, shift pattern consistency, split shift avoidance
   - Post-solve validator: independently verify all hard constraints on solver output (INV-5)
   - Constraint violation report: which constraint failed, which employees affected

4. **Plan generation pipeline**
   - `planning.createDraft` -> initial empty plan version
   - `workload.compute` -> compute workload requirements
   - `planning.runOptimizer` -> queue optimization job
   - Solver executes, writes results to `shift_assignment_staging` table
   - Atomic swap: copy staging to `shift_assignment`, update `plan_version.status` to `optimized`
   - Store solver metrics in `plan_version.summary_metrics_json`

5. **Fly.io fallback worker**
   - Fly.io application running Node.js with HiGHS native bindings
   - BullMQ job queue via Upstash Redis
   - `planning.runOptimizer` enqueues job; worker picks up, solves, writes results back to Supabase
   - Progress reporting: worker updates `plan_version` status via Supabase client
   - Timeout handling: job killed at `time_budget_seconds`, best solution returned

6. **Plan state machine**
   - All 8 states: draft, optimized, proposed, approved, published, stale, superseded, rejected
   - `planning.transitionState` with validation: only valid transitions accepted
   - Role-based transition permissions per `api-contracts.md`
   - Rejection requires non-empty reason; approval requires approver != proposer
   - Publishing auto-supersedes previous published plan for same site+period

7. **Infeasibility handling**
   - When no solution satisfies all hard constraints: return partial solution with `unmet_demand` populated
   - `analyzeInfeasibility()` function: identify conflicting constraints, suggest resolutions
   - UI indication: "Plan has coverage gaps -- X slots could not be filled"
   - Suggestions: "Add 2 employees with picking skills" or "Extend shift window"

**Exit criteria:**
- [ ] Greedy heuristic produces valid plan for test fixture in solver-contract.md (5 employees, 3 processes, 1 day) matching expected output
- [ ] HiGHS MIP produces valid plan for 50 employees, 7 days in < 10 seconds
- [ ] Post-solve validator catches intentionally invalid solutions (100% detection rate)
- [ ] Plan state machine rejects invalid transitions (e.g., draft -> published)
- [ ] Fly.io worker processes a queued job and writes results back to Supabase
- [ ] Infeasibility report correctly identifies the cause when not enough certified forklift operators exist
- [ ] Optimizer run produces audit log entry with input hash, strategy, solve time, result hash

---

### Phase 5: Planning UX (Weeks 13-15)

**Goal:** Planners can see, understand, and adjust the optimized plan.

**Deliverables:**

1. **Process View (primary scheduling view)**
   - Layout: processes as rows, time slots as columns, headcount per cell
   - Each cell shows: assigned count / required count, employee initials
   - Expandable cells: click to see individual employee assignments
   - Color coding: green (>= 95% coverage), yellow (80-94%), red (< 80%)

2. **Drag-and-drop assignment**
   - Library: `dnd-kit`
   - Drag employee from one cell to another
   - On drop: real-time constraint validation via greedy heuristic
   - Accept: assignment moves, coverage updates, KPIs recalculate
   - Reject: show reason ("Employee does not have forklift certification", "Exceeds 48h weekly limit")
   - `planning.manualAssign` and `planning.removeAssignment` tRPC calls

3. **Coverage heatmap**
   - Time-of-day vs process matrix
   - Color intensity by fill rate
   - Tooltip: exact numbers (required FTE, assigned FTE, gap)

4. **KPI cards**
   - Total FTEs assigned / required
   - Coverage percentage (assigned / required across all slots)
   - Total overtime hours
   - Estimated labor cost
   - Solver metrics: strategy used, solve time, optimality gap

5. **Gap view**
   - List of uncovered demand slots sorted by gap severity
   - Per gap: process, time slot, required FTE, assigned FTE, gap
   - One-click "Suggest best employee": runs greedy heuristic for that slot, shows top 3 candidates with reason
   - Click to assign from suggestion

6. **Real-time collaboration**
   - Supabase Realtime subscription on `plan_version` and `shift_assignment`
   - Presence indicators: show who else is viewing this plan
   - Live updates: when another user makes an assignment, it appears immediately (1-3s latency per D-16)

7. **Plan comparison**
   - Select two plan versions for the same site/period
   - Side-by-side diff: assignments added, removed, changed
   - KPI comparison: cost delta, coverage delta, overtime delta

8. **Export**
   - PDF export of published plan (printable schedule grid)
   - CSV export of assignments (employee, process, date, start, end, hours)

**Exit criteria:**
- [ ] Process View renders correctly for a 50-employee, 7-day, 5-process plan
- [ ] Drag-and-drop moves an assignment and shows constraint validation feedback in < 1 second
- [ ] Coverage heatmap colors match actual fill rates
- [ ] KPI cards update when assignments change
- [ ] Gap view lists all uncovered slots from solver output
- [ ] Two users see each other's changes in real-time (1-3 second latency)
- [ ] Plan comparison shows correct diff between two versions
- [ ] PDF and CSV exports contain accurate data matching the UI

---

### Phase 6: Setup Wizard + Employee Portal (Weeks 16-18)

**Run in parallel: wizard team (Engineer 2 + Engineer 5) and employee portal team (Engineer 3).**

#### Setup Wizard (5 steps per D-12)

1. **Step 1: Organization**
   - Company name, industry vertical (warehouse, distribution, fulfillment, manufacturing)
   - Primary timezone (IANA format, searchable dropdown)
   - Company size (employee count range -- informational only)
   - Basic Claude suggestion: "Based on your industry, here are recommended defaults"
   - `wizard.completePhase(1, data)`

2. **Step 2: Sites**
   - Add 1+ sites: name, address, timezone, operating hours (weekly schedule)
   - Allowance breakdown: break time, walk time, startup/shutdown (sums to `allowance_factor` per D-07)
   - Max headcount (optional, for site capacity constraint)
   - Absenteeism rate (default 7%, configurable)
   - `wizard.completePhase(2, data)`

3. **Step 3: Processes**
   - Predefined templates per industry: Picking, Packing, Receiving, Shipping, Forklift, Quality Check, Returns Processing
   - Custom process creation: name, unit of measure, min skill level, hazard level, certification required
   - Productivity standards: must set UPH for all 5 proficiency levels per D-03
   - Level 4 = baseline; system auto-suggests other levels based on standard multipliers
   - Demand type mapping: link demand types to processes with conversion ratios
   - `wizard.completePhase(3, data)`

4. **Step 4: Employees**
   - Two import methods: CSV upload (recommended for > 10) or manual entry
   - CSV import reuses `workforce.importEmployeesCSV` with dry-run preview
   - Skill assignment: bulk assign skills via matrix (employees x processes x proficiency)
   - Availability template: weekly grid (day x shift availability)
   - `wizard.completePhase(4, data)`

5. **Step 5: Go-live checklist**
   - Validation summary: entities created, completeness checks
   - Warnings: processes without productivity standards, employees without skills
   - Test plan generation: "Generate a sample 1-week plan to verify configuration"
   - Confirmation checkboxes for each critical item
   - Activate button: marks wizard as complete, redirects to dashboard
   - `wizard.completePhase(5, data)`

**Wizard infrastructure:**
- State persistence: `localStorage` + server backup (resume across sessions)
- Progress indicator: step numbers with completion status
- Back navigation: can revisit and edit completed steps
- Skip: only steps 4 and 5 can be skipped (with warning about blocked features)
- Smart defaults: static expert-curated templates per industry (no fleet learning in MVP)

#### Employee Schedule Portal (per D-08)

1. **My Schedule view**
   - Read-only schedule: "my shifts this week"
   - Calendar or list view of assignments
   - Each assignment: date, time, process, site, shift name
   - Week navigation: previous/next week

2. **Absence reporting**
   - Form: start date, end date, type (leave, absence, training), reason
   - Creates `employee_availability_override` via `workforce.createAvailabilityOverride`
   - Triggers staleness check on plans containing this employee

3. **Schedule acknowledgment**
   - New/changed assignments shown with "Acknowledge" button
   - `workforce.acknowledgeSchedule` marks assignments as acknowledged
   - Managers can see acknowledgment status per employee

4. **Auth flow**
   - Separate login experience for employees (simplified UI)
   - Employee role: scoped to own data only (own schedule, own overrides)
   - Cannot view other employees' schedules, pay rates, or plan details

**Exit criteria:**
- [ ] New tenant completes wizard in < 60 minutes (timed test)
- [ ] Wizard creates all required entities: org, site, processes with productivity standards, employees with skills
- [ ] Wizard can be resumed after browser refresh
- [ ] Employee sees their published schedule for the current week
- [ ] Employee submits absence request, planner sees it, plan becomes stale
- [ ] Employee acknowledges schedule, manager sees acknowledgment status

---

### Phase 7: Polish (Weeks 19-20)

**Goal:** Scenario simulation, approval workflow, notifications, and basic reporting. This is the scope boundary -- no new features beyond what is listed here.

**Deliverables:**

1. **Scenario simulation**
   - `scenario.create`: clone plan, define modifications (demand %, headcount, process rate)
   - `scenario.run`: re-run optimizer with modified inputs (default: greedy for speed)
   - `scenario.list`: view all scenarios for a base plan
   - Side-by-side comparison: cost delta, coverage delta, overtime delta, assignments changed
   - `scenario.promote`: promote scenario to new plan version

2. **Approval workflow**
   - `planning.transitionState` for: propose, approve, reject, publish
   - Rejection requires reason (text field)
   - Approval requires approver != proposer
   - Email notification on: plan proposed (to approvers), plan approved (to proposer), plan rejected (to proposer), plan published (to all assigned employees)
   - In-app notification via `admin.listNotifications`

3. **Notification center**
   - Bell icon in header with unread count
   - Notification dropdown: list of recent notifications
   - Click notification: navigate to relevant page (plan, schedule, approval)
   - Mark as read: individual and bulk
   - Notification types: schedule_published, plan_stale, approval_needed, absence_reported

4. **Basic reporting**
   - Weekly summary report per site: total cost, coverage %, overtime hours, utilization by process
   - Plan vs actual (where actual_hours populated): scheduled hours vs actual hours per employee
   - Exportable as CSV

5. **Dashboard refinements**
   - Landing dashboard after login: site overview cards, active plans, pending approvals, recent notifications
   - Quick actions: create new plan, view current schedule, run scenario

6. **Error handling polish**
   - User-friendly error messages for all failure modes
   - Solver timeout: "Optimization took longer than expected. Showing best solution found."
   - Constraint violation on drag-and-drop: specific reason with affected constraint name
   - Network errors: retry with exponential backoff, offline indicator
   - Empty states: helpful messages when no data exists ("No employees yet -- import via CSV or add manually")

**Exit criteria:**
- [ ] Scenario: change demand +20%, re-run, compare side-by-side with baseline
- [ ] Approval: planner proposes > manager approves > planner publishes
- [ ] Rejection: manager rejects with reason > planner sees reason > revises > re-proposes
- [ ] Notification: employee receives notification when schedule is published
- [ ] Weekly report matches KPI cards on the dashboard
- [ ] All error states show user-friendly messages (no raw error codes)

---

### Phase 8: Hardening (Weeks 21-22)

**Goal:** Security verified, performance validated, edge cases handled.

**Deliverables:**

1. **RLS penetration test**
   - Create 2 test tenants with full data (employees, plans, assignments)
   - Attempt cross-tenant access on every tRPC endpoint (automated test suite)
   - Verify: zero data leakage across all 40+ procedures
   - Test service role isolation: background jobs only access their target tenant

2. **Performance test**
   - 50 concurrent users (simulated with k6 or Artillery)
   - API P95 < 500ms for standard CRUD operations
   - Dashboard load < 3 seconds on 10 Mbps connection
   - CSV import: 10,000 rows in < 30 seconds
   - Workload computation: 168 time slots (1 week hourly) in < 5 seconds

3. **Solver stress test**
   - 200 employees, 14-day horizon, 5 processes, 3 shifts/day
   - HiGHS MIP within 60-second budget
   - Verify: solution quality (coverage > 80%), no hard constraint violations
   - Memory usage within Fly.io container limits

4. **Edge case handling**
   - Empty states: no employees, no demand, no processes
   - Boundary conditions: employee with 0 contracted hours, process with 0 UPH
   - Midnight-crossing shifts: 22:00 - 06:00 next day
   - Single-day planning horizon
   - All employees on leave (100% absenteeism)
   - Max CSV file size (50 MB)

5. **Accessibility audit (basic level)**
   - Keyboard navigation for all interactive elements
   - Color contrast ratio >= 4.5:1 for text
   - ARIA labels on buttons, inputs, and interactive elements
   - Screen reader compatibility for critical flows (login, schedule view)

6. **Documentation**
   - API reference: auto-generated from tRPC router definitions
   - Deployment guide: step-by-step for Vercel + Supabase + Fly.io
   - Runbook: common failure scenarios and resolution steps (Edge Function timeout, DB connection exhaustion, solver failure, queue backup)

**Exit criteria:**
- [ ] RLS pentest: 0 cross-tenant data access across all endpoints
- [ ] Performance: API P95 < 500ms, dashboard < 3s (under 50 concurrent users)
- [ ] Solver: 200-employee, 14-day plan generates valid solution within 60s
- [ ] All edge cases handled without unhandled exceptions
- [ ] Keyboard navigation works for: login, create plan, view schedule, drag-and-drop (focus management)
- [ ] Deployment guide tested: new engineer can deploy to staging in < 2 hours

---

### Phase 9: Launch (Weeks 23-24)

**Goal:** Beta-tested, monitored, ready for real users.

**Deliverables:**

1. **Beta testing**
   - 2-5 real users (planners from target customer segment)
   - Provide seed data matching their actual site configuration
   - Observe full workflow: wizard > demand upload > optimize > adjust > approve > publish
   - Collect feedback: usability issues, missing features, confusing flows
   - Daily triage: categorize bugs as P0 (blocking), P1 (painful), P2 (annoying), P3 (cosmetic)

2. **Bug fixes**
   - Fix all P0 and P1 bugs
   - P2 bugs: fix if time permits, otherwise document as known issues
   - P3 bugs: defer to V1.1

3. **Demo environment**
   - Seed data generator: create realistic demo data for sales demos
   - Demo org: "Apex Logistics" with 3 sites, 150 employees, 1 month of demand data
   - Pre-generated plans showing optimizer capabilities

4. **Onboarding flow**
   - First-login welcome screen with product overview
   - Guided tour (tooltips) for key features: dashboard, create plan, optimizer, schedule view
   - Option to start with sample data: "Try AstraPlanner with demo data before configuring your own"

5. **Monitoring & alerting**
   - Sentry: error tracking, performance monitoring, release tracking
   - BetterUptime: status page, uptime monitoring, alert escalation
   - Supabase Dashboard: database metrics, connection pool, storage usage
   - Alert thresholds: Edge Function error rate > 5%, API P95 > 1s, DB connections > 80%

6. **Operational readiness**
   - Backup verification: test Supabase point-in-time recovery (restore to 1 hour ago)
   - Environment verification: all env vars set in production, no development defaults
   - Feature flags: kill switch for optimizer (fall back to manual-only), Claude AI toggle
   - Rate limits: API rate limiting per tenant (configurable)
   - Legal pages: terms of service, privacy policy, cookie consent (placeholders OK, but must exist)

**Launch checklist:**
- [ ] DNS configured, SSL active
- [ ] All environment variables set in production (no .env defaults)
- [ ] Feature flags configured and tested
- [ ] Rate limits active
- [ ] Monitoring dashboards accessible
- [ ] Backup restore tested successfully
- [ ] 2+ beta users completed full workflow without blocking issues
- [ ] All P0/P1 bugs resolved
- [ ] Legal pages published
- [ ] Status page live

---

## 5. Post-MVP Roadmap

### V1.1: Quick Wins (Month 7-8)

| Feature | Effort | Impact |
|---------|--------|--------|
| Clone-and-modify sites | 1 week | Faster multi-site onboarding |
| Multi-language (Dutch, German) | 2 weeks | European market entry |
| Timeline View (employee-centric) | 2 weeks | Alternate scheduling perspective |
| Enhanced Claude suggestions in wizard | 1 week | Smarter onboarding defaults |
| Bulk skill assignment improvements | 3 days | Faster employee setup |

### V2: Enhanced Intelligence (Month 8-12)

| Feature | Description |
|---------|-------------|
| Recommendation engine | Staffing level suggestions, process optimization, structural recommendations |
| Absence prediction ML | Trained on 6+ months of historical absence data |
| T&A integration | 2-3 time & attendance providers (API connectors) |
| Demand forecast adjustment | Model that learns from forecast vs actual demand patterns |
| User behavior tracking | Infrastructure to learn from planner corrections and manual overrides |
| Cross-site benchmarking | Compare productivity and coverage across sites within a tenant |
| Advanced reporting / BI export | Custom reports, data export to external BI tools |
| pgvector + pgsodium | AI embeddings for skill matching, column-level PII encryption |

### V3: Semi-Autonomous Planning (Month 12-18)

| Feature | Description |
|---------|-------------|
| Earned autonomy (L2/L3) | AI auto-executes high-confidence routine decisions with human oversight |
| Cross-site optimization | Multi-site solver with transfer costs and logistics |
| Monte Carlo scenario simulation | Probabilistic outcome distributions for demand uncertainty |
| Union/CBA rule engine | Complex labor agreement rules per customer |
| Built-in demand forecasting | Statistical models trained on tenant's historical demand |
| Native mobile app | iOS/Android for employee schedule and manager approvals |
| SSO/SAML | Enterprise auth for large organizations |

### V4: Enterprise Scale (Month 18+)

| Feature | Description |
|---------|-------------|
| Full AI autonomy (L4) | AI handles routine planning end-to-end, humans handle exceptions |
| Multi-region deployment | Data residency, low-latency global access |
| Event sourcing | Full plan history with operation-level replay |
| Fleet learning | Cross-tenant anonymized defaults for new customer onboarding |
| SOC 2 Type II | Enterprise security certification |
| Strategic workforce planning | Long-term headcount forecasting, hiring plan optimization |

---

## 6. Team Structure & Ways of Working

### 6.1 Roles

| Person | Focus | Phases |
|--------|-------|--------|
| **Engineer 1** (Lead/Fullstack) | Architecture, tRPC foundation, solver integration, code review | All phases, primary on 0-1, 4 |
| **Engineer 2** (Fullstack) | Data core, CRUD, CSV import, wizard | Primary on 2, 6 (wizard) |
| **Engineer 3** (Fullstack) | Planning UX, Control Room, scheduling views, employee portal | Primary on 5, 6 (portal) |
| **Engineer 4** (Backend/Optimization) | HiGHS integration, constraint engine, workload computation, Fly.io worker | Primary on 3, 4 |
| **Engineer 5** (UX/Frontend, part-time) | Setup wizard design, dashboard design, user testing, accessibility | Primary on 6 (wizard), 7 |

### 6.2 Cadence

| Activity | When | Duration | Format |
|----------|------|----------|--------|
| Sprint planning | Monday, start of sprint | 30 min | Synchronous (video) |
| Daily standup | Daily | Async | Written (Slack/Linear -- 3 bullets: did, doing, blocked) |
| Demo | Friday, end of sprint | 30 min | Recorded video (show working software) |
| Phase exit review | End of each phase | 60 min | Synchronous -- review exit criteria checkboxes, go/no-go |
| Retrospective | End of each phase | 30 min | What worked, what didn't, what to change |

Sprints are 2 weeks. Phases span 1-3 sprints.

### 6.3 Source of Truth

| Document | What It Governs | Mutable? |
|----------|----------------|----------|
| `DECISIONS.md` | Architectural choices | LOCKED (ADR process to change) |
| `api-contracts.md` | API procedure definitions | LOCKED (versioned changes only) |
| `solver-contract.md` | Solver I/O boundary | LOCKED |
| `schema.sql` | Database schema | Via migration only |
| **This document** | What to build, when | Updated at phase boundaries |
| `invariants.md` | System correctness properties | LOCKED |

### 6.4 Definition of Done (per feature)

- [ ] Code passes TypeScript strict mode (`tsc --noEmit` clean)
- [ ] Unit tests for business logic (workload formulas, constraint checks, state transitions)
- [ ] Integration test for tRPC procedure (happy path + error cases)
- [ ] RLS test: verify tenant isolation for any new data access
- [ ] Works on Vercel preview deployment
- [ ] Exit criteria checkbox checked in this document
- [ ] Code reviewed by at least 1 other engineer

### 6.5 Branch Strategy

- `main`: production-ready, deploys to production on merge
- `feature/*`: one branch per feature or task, PR to `main`
- Preview deployments: Vercel creates a preview URL for every PR
- No long-lived feature branches: merge to `main` at least weekly
- Database migrations: sequential, numbered, reviewed before merge

---

## 7. Risk Register

| # | Risk | Likelihood | Impact | Mitigation | Decision Point |
|---|------|-----------|--------|-----------|---------------|
| 1 | HiGHS WASM exceeds Edge Function limits (memory/time) | Medium | High | Fly.io fallback worker ready as primary path. Benchmark before committing. | **Week 9 benchmark** |
| 2 | tRPC + Supabase Edge Function (Deno) compatibility | Low | Medium | Phase 0 spike test. Fallback: tRPC on Vercel API routes. | **Week 0 Day 1** |
| 3 | Solver solution quality insufficient for real-world problems | Medium | Medium | Tune MIP formulation, adjust constraint weights, add cutting planes. Test with realistic data. | **Week 11 user testing** |
| 4 | CSV import edge cases consume excessive development time | High | Low | Strict CSV template, Papa Parse handles encoding, defer Excel/XLSX support. Limit to UTF-8 comma-delimited. | **Week 4** |
| 5 | Scope creep in Polish phase (Weeks 19-20) | High | Medium | This document is the scope boundary. Any addition requires removing something. Phase 7 deliverables are enumerated and fixed. | **Week 19** |

---

## 8. Success Metrics

### 8.1 Launch Criteria (Week 24)

All must be TRUE to launch:

- [ ] New tenant completes wizard in < 60 minutes
- [ ] 50-employee, 7-day plan generates in < 10 seconds (interactive) or < 60 seconds (background)
- [ ] API P95 < 500ms under 50 concurrent users
- [ ] Dashboard loads < 3 seconds on 10 Mbps connection
- [ ] Zero cross-tenant data leakage (RLS penetration test passed)
- [ ] All P0/P1 bugs resolved
- [ ] 2+ beta users complete full workflow without blocking issues
- [ ] CSV import handles 10,000 rows in < 30 seconds with validation feedback
- [ ] All state-changing operations produce audit log entries
- [ ] Workload computation matches hand calculation within 1% tolerance

### 8.2 90-Day Post-Launch Targets

| Metric | Target |
|--------|--------|
| Paying tenants | 5+ |
| Support tickets per tenant per week | < 3 |
| Plans published without major edits | > 70% |
| Planner time per plan | < 30 minutes (vs hours with spreadsheets) |
| System uptime | > 99.5% |
| Edge Function error rate | < 1% |

---

## Appendix A: Critical Path

```
Phase 0 (Week 0)
    |
Phase 1: Foundation (Weeks 1-2)
    |
Phase 2: Data Core (Weeks 3-5) -----> Phase 6: Wizard (Weeks 16-18)*
    |
Phase 3: Demand & Workload (Weeks 6-8)
    |
Phase 4: Optimization Engine (Weeks 9-12) -- HIGHEST RISK
    |
Phase 5: Planning UX (Weeks 13-15) --> Phase 6: Employee Portal (Weeks 16-18)*
    |
Phase 7: Polish (Weeks 19-20)
    |
Phase 8: Hardening (Weeks 21-22)
    |
Phase 9: Launch (Weeks 23-24)

* Phase 6 runs in parallel. Wizard team starts after Phase 2 data layer is stable.
  Employee portal team starts after Phase 5 scheduling views exist.
```

**Critical path:** Phase 0 > Phase 1 > Phase 2 > Phase 3 > Phase 4 > Phase 5 > Phase 7 > Phase 8 > Phase 9.

The optimization engine (Phase 4) is the longest phase (4 weeks) and highest risk. It cannot begin until demand and workload data structures exist (Phase 3). The planning UX (Phase 5) requires a working optimizer. Everything flows through this critical path.

**Parallel work:** Phase 6 (Wizard + Employee Portal) can be built by a separate sub-team starting around Week 10, since the wizard writes configuration data that the data core (Phase 2) already supports. The employee portal depends on published plans from Phase 5 but can use seed data for development.

## Appendix B: Key Formulas

For quick reference, the invariant formulas that drive the entire system:

```
1. Process Volume
   process_volume = demand_volume * conversion_ratio

2. Required Hours
   required_hours = process_volume / productivity_rate * (1 + allowance_factor)

3. Required FTE
   required_fte = required_hours / available_hours_per_fte

4. Gross FTE (absenteeism buffer)
   gross_fte = required_fte / (1 - absenteeism_rate)

5. Effective Productivity Rate
   effective_rate = base_rate_at_level_4 * proficiency_multiplier[employee_level]

   Proficiency multipliers (D-03):
   Level 1 (Trainee):    0.60x
   Level 2 (Basic):      0.75x
   Level 3 (Competent):  0.90x
   Level 4 (Proficient): 1.00x (baseline)
   Level 5 (Expert):     1.10x
```

These formulas are INVARIANT. The parameters are configurable. The structure cannot change.
