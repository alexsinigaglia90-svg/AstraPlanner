# MVP Build Sequence

## Overview

This document defines the phased build plan for AstraPlanner MVP, covering 24 weeks from project kickoff to launch readiness. Each phase includes deliverables, dependencies, risks, team allocation, and exit criteria.

**Team assumption**: 3-5 engineers (2-3 fullstack, 1 optimization/backend specialist, 0-1 design/UX). No dedicated DevOps -- infrastructure is fully managed (Vercel + Supabase + Fly.io).

**Methodology**: 2-week sprints within each phase. Weekly demos. Continuous deployment to staging. Production deploys gated by phase exit criteria.

---

## Phase 0: Foundation (Week 1-2)

### Objective
Stand up the complete development infrastructure, authentication system, multi-tenancy foundation, and base database schema so that all subsequent phases can build on a working, deployed stack from day one.

### Deliverables

| Deliverable | Details |
|------------|---------|
| Supastarter scaffold | Initialize project from Supastarter template; configure Next.js 14+ App Router, Tailwind, shadcn/ui, tRPC |
| Supabase project | Provision Supabase project (Pro plan); configure PostgreSQL extensions (pgvector, pg_cron, pgsodium, pg_trgm) |
| Authentication | Supabase Auth configured: email/password signup, JWT with custom claims (tenant_id, role, site_ids), session management |
| Multi-tenancy RLS | Base RLS policies on tenants table; tenant_id column convention established; RLS policy template for all future tables |
| Base schema | Core tables: `tenants`, `users`, `user_roles`, `sites` (stub), `audit_events`; migration scripts via Supabase CLI |
| tRPC foundation | Root router, auth middleware, tenant middleware, logging middleware, error handling; healthcheck endpoint |
| CI/CD pipeline | GitHub Actions: lint + typecheck + unit test on PR; deploy to Vercel preview on PR; deploy to production on merge to main |
| Development environment | Local Supabase (supabase start), seed data script, environment variable management (.env.local template) |
| Monitoring baseline | Sentry configured (frontend + Edge Functions), BetterUptime healthcheck, Supabase Dashboard access |

### Dependencies
- None (Phase 0 is the root)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Supastarter template conflicts with AstraPlanner requirements | Medium | Delays (2-3 days) | Evaluate template during pre-kickoff; identify customization points early |
| Supabase Edge Function Deno runtime compatibility issues with tRPC | Low | Delays (1-2 days) | tRPC has documented Deno support; test immediately in Week 1 |

### Team Allocation
- All engineers (3-5) work on Phase 0 together to establish conventions, coding standards, and shared understanding

### Exit Criteria
- [ ] A user can sign up, log in, and see a blank dashboard scoped to their tenant
- [ ] RLS prevents cross-tenant data access (verified by test: User A cannot query User B's tenant data)
- [ ] tRPC healthcheck endpoint returns 200 from deployed Edge Function
- [ ] CI pipeline runs lint + typecheck + test on every PR in < 5 minutes
- [ ] Staging environment is live on Vercel with Supabase backend
- [ ] All team members can run the full stack locally

---

## Phase 1: Data Core (Week 3-5)

### Objective
Build the foundational data entities -- sites, processes, employees, skills -- with full CRUD APIs and CSV import capability. This phase creates the data substrate that every subsequent feature depends on.

### Deliverables

| Deliverable | Details |
|------------|---------|
| Site management | CRUD for sites: name, timezone, operating hours, zones, capacity constraints. Admin UI for site configuration. |
| Process path definitions | CRUD for process paths per site: process type (receive, pick, pack, ship, etc.), demand unit, productivity rate per skill level, allowance factor |
| Employee management | CRUD for employees: identity, employment type, contracted hours, cost rates. Admin UI with list/detail views. |
| Skill system | CRUD for skills and certifications: skill definitions (tenant-scoped), employee-skill assignments with proficiency level and expiry date |
| Availability management | Employee availability: planned leave entries, recurring unavailability patterns (e.g., "no Sundays"), contracted shift preferences |
| CSV import engine | Generic CSV import framework: upload file -> preview columns -> map to schema -> validate -> import. Reusable across entity types. |
| CSV importers | Specific importers for: employees (bulk onboard), skills (bulk assign), sites (multi-site setup) |
| Data validation | Comprehensive validation: required fields, type checking, referential integrity (e.g., skill assignment requires valid employee_id and skill_id), duplicate detection |
| Audit trail | All CRUD operations emit audit events to the `audit_events` table |

### Dependencies
- Phase 0 complete (auth, RLS, base schema, tRPC foundation)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| CSV import edge cases (encoding, delimiter, date formats) consume excessive time | High | 2-3 day overrun | Limit MVP to UTF-8 CSV with comma delimiter; use a battle-tested parsing library (Papa Parse); defer Excel support |
| Entity model changes during later phases require schema migrations | Medium | Rework (1-2 days per change) | Design schema with JSONB metadata columns for extensibility; keep core columns minimal |

### Team Allocation
- 2 engineers: Backend (tRPC routers, DB schema, RLS policies, CSV import engine)
- 1 engineer: Frontend (Admin UI for sites, employees, skills -- CRUD forms and list views)
- 1 engineer (if available): CSV import UI (upload, preview, column mapping, progress)

### Exit Criteria
- [ ] Admin can create a site with operating hours, zones, and process paths via the UI
- [ ] Admin can import 1,000 employees via CSV in < 15 seconds with validation feedback
- [ ] Admin can define skills and assign them to employees with proficiency levels
- [ ] Employee availability (leave, unavailability) can be entered and is visible in employee detail view
- [ ] All operations produce audit log entries
- [ ] RLS prevents access to entities belonging to other tenants
- [ ] API response time < 500ms for all CRUD operations (P95)

---

## Phase 2: Demand & Workload (Week 6-8)

### Objective
Build the demand ingestion pipeline and workload computation engine -- the analytical core that converts external demand forecasts into labor hour and FTE requirements.

### Deliverables

| Deliverable | Details |
|------------|---------|
| Demand signal schema | `demand_signals` table with versioning support: signal_id, site_id, process_path, period_start/end, quantity, demand_type, version, source, confidence |
| CSV demand upload | Upload demand forecast CSV: column mapping, validation (valid site_id, valid process_path, valid date range), preview, import |
| REST API demand push | tRPC endpoint for programmatic demand ingestion: authenticated, validated, returns import summary |
| Demand versioning | Each upload creates a new version; previous versions retained; UI shows version history per site |
| Demand visualization | Demand dashboard: bar/line charts of demand by process path over time, version comparison, upload history |
| Workload computation engine | Core engine: `demand * (1 / productivity_rate) * (1 + allowance) = required_hours`. Computes per process path, per skill level, per time period. |
| FTE calculation | Convert required hours to required FTEs based on available hours per FTE (contracted hours minus leave/unavailability) |
| Workload output views | Table and chart views of: required hours by process, required FTEs by process, gap analysis (required vs. available FTEs) |
| Computation triggers | Workload recomputes automatically when demand data or productivity rates change (Supabase Database Webhook -> Edge Function) |

### Dependencies
- Phase 1 complete (sites, process paths, employees, skills, availability -- needed for workload computation)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Workload computation performance degrades with large demand datasets | Medium | Slow dashboard loads | Pre-compute and cache workload summaries; recompute only on demand change (event-driven) |
| Customer demand CSV formats vary wildly | High | Import failures, support overhead | Provide strict template with example data; flexible column mapping UI; detailed error messages |

### Team Allocation
- 1 engineer: Demand ingestion (CSV upload, REST API, versioning, validation)
- 1 engineer: Workload computation engine (core algorithm, FTE calculation, caching)
- 1 engineer: Frontend (demand dashboard, workload views, gap analysis charts)

### Exit Criteria
- [ ] A 10,000-row demand CSV uploads and processes in < 30 seconds
- [ ] Workload computation produces correct hours/FTE output (verified against manual spreadsheet calculation, < 1% variance)
- [ ] Demand versioning works: upload V1, upload V2, both visible, comparison available
- [ ] REST API accepts demand data programmatically with proper auth and validation
- [ ] Workload recomputes automatically within 10 seconds of demand data change
- [ ] Gap analysis view correctly shows where required FTEs exceed available FTEs

---

## Phase 3: Optimization (Week 9-12)

### Objective
Integrate the HiGHS WASM solver, build the constraint engine, and implement plan generation -- the core differentiator that transforms AstraPlanner from a data display tool into an intelligent planning system.

**This is the highest-risk phase.** Solver integration, constraint modeling, and solution quality are technically challenging. The 4-week allocation includes buffer.

### Deliverables

| Deliverable | Details |
|------------|---------|
| HiGHS WASM integration | Compile HiGHS to WASM (or use pre-built WASM binary); integrate into Supabase Edge Function; verify LP/MIP solve capability |
| Problem formulation | Translate workload requirements + employee availability + constraints into MIP problem: decision variables (employee-shift-process assignments), objective function, constraint matrix |
| Constraint engine | Hard constraints: max hours/day, max hours/week, minimum rest between shifts, certification requirements, site capacity. Soft constraints: preferences, team continuity, overtime minimization. |
| Greedy heuristic | TypeScript-native fast assignment: sort demand slots by criticality, assign best-available employee by skill match and cost. Sub-second response for manual adjustments. |
| Plan generation pipeline | End-to-end flow: select site + date range -> pull demand + workload + employees + constraints -> formulate problem -> solve -> parse solution -> create plan with shift assignments |
| Plan data model | `plans` table (id, site_id, date_range, status, version, solver_stats), `shift_assignments` table (plan_id, employee_id, process_path, shift_start, shift_end, assignment_type) |
| Solver fallback (Fly.io) | For problems exceeding Edge Function limits: serialize problem -> enqueue to BullMQ -> Fly.io worker solves -> result stored in DB -> notify frontend via Realtime |
| Solution quality metrics | Report solver gap (vs. LP relaxation), solve time, constraint violation summary, unmet demand count |
| Plan API | tRPC endpoints: generate plan, get plan, list plans, get plan assignments, get solver status |

### Dependencies
- Phase 2 complete (demand data and workload computation provide solver inputs)
- Phase 1 complete (employee/skill/availability data provides solver inputs)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| HiGHS WASM binary too large for Edge Function memory (256MB) | Medium | Cannot run solver in Edge Function | Pre-test with realistic problem sizes in Week 9; Fly.io fallback is the safety net |
| Problem formulation produces infeasible models for edge-case employee/constraint combinations | High | Solver returns no solution, user sees error | Implement constraint relaxation: if infeasible, relax soft constraints progressively; report which constraints were relaxed |
| 10-second solve time budget insufficient for 50-employee, 7-day problems | Medium | Poor UX (long waits) or suboptimal solutions | Tune solver parameters (MIP gap tolerance, presolve aggressiveness); use greedy warm-start; fall back to Fly.io for larger problems |
| Solution quality (assignment quality) does not meet planner expectations | Medium | Users reject AI suggestions, fall back to manual | Invest in objective function tuning; provide "explain this assignment" capability; allow easy manual override |

### Team Allocation
- 1 engineer (optimization specialist): HiGHS WASM integration, problem formulation, constraint engine, solver tuning
- 1 engineer: Plan data model, plan generation pipeline, plan API, Fly.io fallback
- 1 engineer: Greedy heuristic, solution parsing, quality metrics, testing with realistic data

### Exit Criteria
- [ ] HiGHS WASM solves a 50-employee, 7-day, single-site problem in < 10 seconds in Edge Function
- [ ] Generated plan satisfies all hard constraints (verified by constraint checker)
- [ ] Greedy heuristic produces a valid (if suboptimal) plan in < 1 second
- [ ] Fly.io fallback successfully handles problems exceeding Edge Function limits
- [ ] Infeasible problems produce a meaningful error message listing which constraints conflict
- [ ] Solution quality metrics are computed and stored with every plan
- [ ] Plan generation works end-to-end: demand data in -> optimized shift assignments out

---

## Phase 4: Planning UX (Week 13-15)

### Objective
Build the user-facing planning experience: control room dashboard, schedule grid, manual adjustment interface, and drag-and-drop assignment -- making the optimization engine's output usable by real planners.

### Deliverables

| Deliverable | Details |
|------------|---------|
| Control room dashboard | Coverage heatmap (time x process area, color-coded by %). Demand vs. capacity chart. KPI cards: total FTEs, coverage %, overtime hours, labor cost estimate. |
| Schedule grid | Tabular view: rows = employees, columns = time slots (shift windows). Cells show assignments color-coded by process. Filterable by process, skill, status. |
| Drag-and-drop assignment | dnd-kit integration: drag employee to shift slot, real-time constraint validation (check skills, hours, rest), visual feedback (green = valid, red = violation with reason). |
| Manual adjustments | Add/remove/swap assignments. Bulk operations: assign pattern, copy day/week. Each change triggers incremental constraint check. |
| Gap view | Highlight uncovered demand slots. Show required skills for each gap. One-click "suggest best employee" using greedy heuristic. |
| Real-time collaboration | Supabase Realtime presence: show which planners are viewing/editing a plan. Lock indicator when another user is editing the same shift slot. |
| Plan comparison | Side-by-side view of two plan versions: highlight added/removed/changed assignments, delta on KPIs (cost, coverage, overtime). |
| Print / export | Export plan as PDF (formatted schedule) and CSV (raw assignment data) for distribution to site managers. |

### Dependencies
- Phase 3 complete (optimization engine generates plans that the UI displays and allows editing)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Drag-and-drop performance degrades with large employee counts (100+) | Medium | Laggy UX, planner frustration | Virtualize the schedule grid (render only visible rows); debounce constraint checks; test with 200+ employees early |
| Coverage heatmap rendering slow with many process areas and time slots | Low | Dashboard load time > 3s target | Use canvas-based rendering for heatmap if SVG performance is insufficient; pre-compute coverage data |

### Team Allocation
- 2 engineers: Frontend (control room, schedule grid, drag-and-drop, manual adjustments, heatmap)
- 1 engineer: Backend (real-time channels, plan comparison API, export generation, constraint check endpoint)

### Exit Criteria
- [ ] Control room loads in < 3 seconds with realistic data (50 employees, 5 process areas, 7 days)
- [ ] Coverage heatmap accurately reflects planned vs. required staffing
- [ ] Drag-and-drop correctly validates constraints and shows violation reasons
- [ ] Planner can generate a plan, review it, make 5 manual adjustments, and publish -- all within 10 minutes
- [ ] Plan comparison correctly highlights differences between two versions
- [ ] Real-time presence shows other active planners
- [ ] PDF export produces a readable, printable schedule

---

## Phase 5: Setup Wizard (Week 16-18)

### Objective
Build the guided configuration wizard that onboards new tenants and sites. This phase can run in parallel with Phase 4 since the wizard produces configuration data (sites, processes, employees) that the planning engine consumes, but does not depend on the planning UI.

### Deliverables

| Deliverable | Details |
|------------|---------|
| Wizard framework | Multi-step form engine: step navigation, progress indicator, state persistence (localStorage + server backup), branching logic, resumability |
| Step 1: Organization | Company name, timezone, industry vertical (warehouse/DC/fulfillment), admin user setup |
| Step 2: Site definition | Site name, address, operating hours (shift windows), zone definitions, capacity constraints |
| Step 3: Process configuration | Select from predefined process templates (receive, put-away, pick, pack, ship, VAS, returns); customize productivity rates and demand units; add custom processes |
| Step 4: Workforce import | CSV upload with guided column mapping; preview imported data; validation report; confirm import |
| Step 5: Skill taxonomy | Define skills from a suggested list (with option to add custom); set proficiency levels; bulk-assign skills to imported employees |
| Step 6: Planning rules | Configure optimization constraints: max hours/day, max hours/week, minimum rest period, overtime rules. Set approval workflow (who approves plans). Notification preferences. |
| Smart defaults | Pre-populate configuration based on industry vertical selection (e.g., warehouse defaults: 3 shifts, standard process paths, common skill set) |
| Basic AI suggestions | Claude-powered suggestions during wizard: "Based on your site configuration, we recommend these process paths" or "Your productivity rates are within industry norms" |
| Wizard completion | Summary screen showing configuration completeness; "Go to Dashboard" action that lands on the control room |

### Dependencies
- Phase 1 complete (entity CRUD APIs that the wizard calls to create sites, employees, skills)
- No dependency on Phase 3 or Phase 4 (wizard does not require optimizer or planning UI)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Wizard UX complexity leads to user abandonment | Medium | Low activation rate | Track step completion analytics (PostHog); test with 3 target users during Phase 5; simplify aggressively |
| AI suggestion latency (Claude API calls) makes wizard feel slow | Low | UX friction | Make AI suggestions async: show spinner, display when ready; wizard progression does not depend on AI response |

### Team Allocation
- 1-2 engineers: Full-stack (wizard framework, all 6 steps, AI integration)
- Design review at mid-phase for UX validation

### Exit Criteria
- [ ] A new user can complete the full wizard (6 steps) in < 60 minutes with realistic data
- [ ] Wizard state persists across browser refreshes (resumable)
- [ ] CSV employee import within wizard works for 500+ employees
- [ ] Smart defaults populate reasonable values for each industry vertical
- [ ] AI suggestions display within 3 seconds and are contextually relevant
- [ ] Wizard completion lands user on a functional control room with their configured data

---

## Phase 6: Polish (Week 19-20)

### Objective
Add the remaining MVP features that enhance usability: scenario simulation, approval workflows, notifications, and basic reporting. These features are important but depend on the core planning system being functional.

### Deliverables

| Deliverable | Details |
|------------|---------|
| Simple scenario simulation | Clone a plan as a scenario; change one variable (demand %, headcount, process rate); re-run optimizer; compare scenario vs. baseline side-by-side |
| Approval workflows | Workflow engine: Draft -> Proposed -> Approved -> Published. Role-based transitions. Rejection with comments. Notification on state change. |
| Email notifications | Plan submitted for approval, plan approved/rejected, coverage alert threshold breached. Delivered via Supabase Auth email or Resend. |
| In-app notifications | Notification center (bell icon): unread count, notification list, mark-as-read, link to relevant entity |
| Basic reporting | Summary report page: weekly labor cost, coverage %, overtime hours, FTE utilization by process path. Filterable by site and date range. |
| Dashboard refinements | Polish based on Phase 4 feedback: improve heatmap readability, add tooltips, improve mobile responsiveness, add data loading states |
| Error handling polish | User-friendly error messages for all failure modes: solver timeout, import validation failure, auth expiry, network errors |

### Dependencies
- Phase 4 complete (planning UX provides the context for scenarios, approvals, notifications)
- Phase 3 complete (optimizer required for scenario re-runs)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Email deliverability issues (spam filters, delays) | Medium | Approval notifications missed | Use established email provider (Resend); configure SPF/DKIM; test with major email providers |
| Scope creep in "polish" phase -- team tries to add too many improvements | High | Phase overruns | Strict scope: only the deliverables listed above; all other improvements go to a post-launch backlog |

### Team Allocation
- 1 engineer: Scenario simulation + approval workflow backend
- 1 engineer: Notifications (email + in-app) + basic reporting
- 1 engineer: Dashboard refinements + error handling polish

### Exit Criteria
- [ ] Scenario simulation: change demand by 20%, re-optimize, compare results -- all works end-to-end
- [ ] Approval workflow: planner proposes -> manager receives notification -> approves/rejects -> planner sees result
- [ ] Email notifications delivered within 5 minutes of triggering event
- [ ] In-app notification center shows unread count and links to relevant entities
- [ ] Basic report page displays accurate weekly metrics

---

## Phase 7: Hardening (Week 21-22)

### Objective
Systematic quality assurance: security audit, performance testing, edge case handling, and documentation. No new features -- this phase is exclusively about making existing features production-grade.

### Deliverables

| Deliverable | Details |
|------------|---------|
| Security audit | RLS policy review (every table); JWT claim validation; input sanitization audit; OWASP Top 10 checklist; Supabase project security settings review |
| RLS penetration test | Automated tests: create two tenants, attempt to access Tenant B's data from Tenant A's session across every tRPC endpoint |
| Performance testing | Load test with 50 concurrent users: measure API response times, dashboard load times, solver performance. Identify and fix bottlenecks. |
| Edge case handling | Systematic review: empty states (no data yet), boundary conditions (exactly 0 employees, max capacity, midnight-crossing shifts), error recovery |
| Database optimization | Index review (pg_stat_statements analysis), query optimization for slow queries, connection pool tuning |
| Solver stress testing | Test optimizer with extreme inputs: 200 employees, 14-day horizon, many constraints; verify fallback to Fly.io works correctly |
| Accessibility audit | WCAG 2.1 AA compliance check: keyboard navigation, screen reader compatibility, color contrast, ARIA labels |
| Documentation | API reference (auto-generated from tRPC types), deployment guide, configuration reference, troubleshooting guide |

### Dependencies
- All feature phases (0-6) complete

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Security audit reveals RLS policy gaps | Medium | Requires schema changes and policy rewrites (2-5 days) | This is exactly why this phase exists; buffer is built into the 2-week allocation |
| Performance testing reveals fundamental bottleneck | Low | Major rework required | Most likely bottleneck is DB queries (fixable with indexes) or solver performance (fixable with Fly.io fallback) |

### Team Allocation
- 1 engineer: Security audit + RLS penetration testing
- 1 engineer: Performance testing + database optimization + solver stress testing
- 1 engineer: Edge case handling + accessibility audit + documentation

### Exit Criteria
- [ ] Zero RLS policy gaps (every tenant-scoped table has a verified policy)
- [ ] RLS penetration test passes: zero cross-tenant data leakage across all endpoints
- [ ] API P95 response time < 500ms under 50-concurrent-user load
- [ ] Dashboard loads in < 3 seconds under load
- [ ] All critical-path edge cases handled gracefully (user sees helpful message, not crash)
- [ ] Accessibility: all interactive elements keyboard-navigable, core flows screen-reader compatible
- [ ] Documentation covers deployment, configuration, and top 10 troubleshooting scenarios

---

## Phase 8: Launch Prep (Week 23-24)

### Objective
Prepare for production launch: beta testing with a real customer (or realistic simulation), seed data for demos, onboarding flow refinement, and monitoring setup.

### Deliverables

| Deliverable | Details |
|------------|---------|
| Beta testing | Deploy to production environment; invite 2-5 beta users; run through complete workflow (wizard -> import -> plan -> review -> approve -> publish); collect feedback |
| Seed data generator | Script to generate realistic demo data: 3 sites, 15 process paths, 200 employees, 30 days of demand history, sample plans. Used for demos and testing. |
| Onboarding flow | First-login experience: welcome screen, guided tour (tooltip walkthrough of key UI areas), link to setup wizard, sample data option for exploration |
| Monitoring finalization | Sentry alert rules configured (error rate > 1% triggers PagerDuty/Slack); BetterUptime status page live; Supabase alerts for DB connection exhaustion, storage limits |
| Runbook | Operational runbook: common failure scenarios (Edge Function timeout, DB connection pool exhaustion, solver failure, auth token expiry), diagnosis steps, resolution actions |
| Backup verification | Test Supabase point-in-time recovery: backup, restore to new project, verify data integrity |
| Launch checklist | Pre-launch verification: DNS, SSL, environment variables, feature flags, rate limits, email sender verification, legal (privacy policy, terms of service links) |
| Bug fixes | Fix all P0/P1 bugs identified during beta testing |

### Dependencies
- Phase 7 complete (hardened system ready for beta users)

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Beta testing reveals usability issues requiring UX rework | High | 1-3 day delay for critical UX fixes | Budget 3 days of the 2-week phase for UX fixes identified in beta; defer non-critical UX improvements to post-launch |
| Beta users find data quality issues with their real data | Medium | Edge cases in import/validation not caught in testing | Keep Phase 8 bug fix buffer; handle edge cases with clear error messages rather than code changes where possible |

### Team Allocation
- All engineers participate in beta testing support and bug fixes
- 1 engineer: Seed data generator + onboarding flow
- 1 engineer: Monitoring finalization + runbook + backup verification
- 1 engineer: Launch checklist + beta user support

### Exit Criteria
- [ ] Beta users complete full workflow without P0 bugs
- [ ] All P0/P1 bugs from beta testing fixed
- [ ] Seed data generator produces realistic demo environment in < 2 minutes
- [ ] Onboarding flow tested with 2+ users who have never seen the product
- [ ] Monitoring alerts fire correctly (test with synthetic errors)
- [ ] Backup/restore procedure verified
- [ ] Launch checklist fully green

---

## Critical Path

The critical path determines the minimum possible timeline. Any delay on the critical path delays the entire project.

```
Phase 0 (Foundation)
    |
    v
Phase 1 (Data Core)
    |
    v
Phase 2 (Demand & Workload)
    |
    v
Phase 3 (Optimization)  <-- HIGHEST RISK PHASE
    |
    v
Phase 4 (Planning UX)
    |
    v
Phase 6 (Polish)  [depends on Phase 3 + Phase 4]
    |
    v
Phase 7 (Hardening)
    |
    v
Phase 8 (Launch Prep)
```

**Total critical path duration**: 24 weeks (no slack on critical path -- all buffer is within Phase 3).

---

## Parallelization Opportunities

| Parallel Track | Can Run Alongside | Reason |
|---------------|-------------------|--------|
| **Phase 5 (Setup Wizard)** | Phase 4 (Planning UX) | Wizard writes config data via Phase 1 APIs; does not depend on optimizer or planning UI |
| **CSV import refinements** | Phase 2 (Demand & Workload) | Import framework built in Phase 1; demand CSV import extends it |
| **Design work for Phase 4 UX** | Phase 3 (Optimization) | Design mockups and prototypes while optimizer is being built |
| **Monitoring/observability setup** | Any phase | Infrastructure work that does not block feature development |
| **Documentation** | Phase 6+ | Begin documenting APIs and user guides after core features stabilize |

### Recommended Parallel Execution (with 4+ engineers)

```
Week  1-2:   [All] Phase 0 - Foundation
Week  3-5:   [All] Phase 1 - Data Core
Week  6-8:   [All] Phase 2 - Demand & Workload
Week  9-12:  [3 eng] Phase 3 - Optimization
Week 13-15:  [2 eng] Phase 4 - Planning UX     |  [1-2 eng] Phase 5 - Setup Wizard
Week 16-18:  [2 eng] Phase 5 - Setup Wizard     |  [1 eng] Phase 6 - Polish (start)
Week 19-20:  [All] Phase 6 - Polish (complete)
Week 21-22:  [All] Phase 7 - Hardening
Week 23-24:  [All] Phase 8 - Launch Prep
```

With parallel execution and 4+ engineers, the wizard (Phase 5) overlaps with the planning UX (Phase 4), potentially saving 1-2 weeks of total calendar time. However, the critical path remains 24 weeks because the optimization engine (Phase 3) is the binding constraint.

---

## Phase Dependency Graph

```
Phase 0 (Foundation)
  ├──> Phase 1 (Data Core)
  │      ├──> Phase 2 (Demand & Workload)
  │      │      └──> Phase 3 (Optimization)
  │      │             └──> Phase 4 (Planning UX)
  │      │                    └──> Phase 6 (Polish)
  │      │                           └──> Phase 7 (Hardening)
  │      │                                  └──> Phase 8 (Launch Prep)
  │      └──> Phase 5 (Setup Wizard) [parallel with Phase 4]
  │             └──> Phase 6 (Polish) [merge point]
```

---

## Weekly Milestone Summary

| Week | Milestone |
|------|-----------|
| 2 | Stack deployed, auth working, first tRPC endpoint live |
| 5 | All entities (sites, employees, skills) manageable via UI and CSV import |
| 8 | Demand uploaded, workload computed, FTE requirements visible |
| 10 | First optimizer-generated plan (may be rough quality) |
| 12 | Optimizer produces production-quality plans with constraint satisfaction |
| 14 | Planners can view and manually adjust plans via drag-and-drop |
| 15 | Control room dashboard live with coverage heatmap |
| 18 | Setup wizard complete; new tenant can onboard end-to-end |
| 20 | Scenarios, approvals, notifications, and reporting functional |
| 22 | Security audit passed, performance benchmarks met |
| 24 | Beta tested, launch-ready |
