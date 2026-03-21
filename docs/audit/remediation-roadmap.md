# AstraPlanner Adversarial Audit: Remediation Roadmap

> Conducted: 2026-03-20
> Purpose: 30/60/90 day plan to convert documentation into a running product
> Premise: Stop documenting. Start building.

---

## The Rule

**No new documentation files unless they directly support code being written that week.** Every deliverable in this roadmap is measured by whether a user can do something they could not do before. Not whether a document exists. Whether software runs.

---

## FIRST 30 DAYS: "Make It Exist"

### Week 1: Initialize Everything

**Monday-Tuesday: Project scaffolding**
- Run `npx create-next-app@latest astraplanner --typescript --tailwind --app --src-dir`
- Install core dependencies: `@trpc/server`, `@trpc/client`, `@trpc/next`, `@supabase/supabase-js`, `@supabase/ssr`, `zod`
- Configure `tsconfig.json`, ESLint, Prettier
- Set up the project structure: `src/app/`, `src/server/`, `src/lib/`, `src/components/`
- Create a GitHub Actions workflow: lint + type-check on every push
- Deploy to Vercel with preview deployments on PRs

**Wednesday-Thursday: Database**
- Create a Supabase project
- Fix the known schema bugs before execution:
  - Change `demand_granularity` ENUM to include `fifteen_min`, `hourly`, `four_hour`
  - Change `DemandForecast` to use `period_start timestamptz` + `period_end timestamptz`
  - Change `WorkloadPlan` to per-shift granularity
  - Add `btree_gist` extension
  - Add exclusion constraint on `ShiftAssignment` to prevent overlaps
  - Add `employee_availability_override` table
  - Add `approval_record` table
  - Add `last_practiced_date` to `employee_skill`
- Execute the corrected schema.sql against the Supabase database
- Fix whatever breaks (there will be errors the reviews did not catch)
- Set up Supabase migrations (`supabase init`, `supabase db diff`)
- Wrap materialized views in security-definer functions with tenant filtering

**Friday: Auth**
- Configure Supabase Auth (email/password for MVP)
- Build sign-up and login pages
- Set up auth middleware in Next.js
- Verify RLS policies work with real JWT tokens
- Deploy. A user can now sign up and log in. The database exists.

**Week 1 deliverable:** A deployed Next.js application with auth and a real database. This is more than the project has produced in its entire prior history.

### Week 2: First CRUD

**Monday-Tuesday: tRPC setup + Organization/Site CRUD**
- Set up tRPC router with Supabase client
- Build organization settings page (name, timezone, billing email)
- Build sites list + create/edit site form
- Fields: name, address, timezone, operating hours, site type

**Wednesday-Thursday: Department + Process CRUD**
- Build department list per site
- Build process list per department
- Fields: process name, category, equipment required, productivity standard (UPH), min skill level

**Friday: Polish and deploy**
- Add form validation with Zod schemas
- Add loading states, error handling, toast notifications
- Deploy. A user can now create an organization, add sites, define departments and processes.

**Week 2 deliverable:** Functioning CRUD for the organizational hierarchy. Data is in a real database with real RLS enforcement.

### Week 3: Workforce Data

**Monday-Tuesday: Employee management**
- Build employee list with search, filter, pagination
- Build employee create/edit form
- Fields: name, email, contract type, hire date, primary site, department, shift pattern preferences
- Build CSV import for employees (this is how real customers will onboard -- not one-by-one forms)

**Wednesday-Thursday: Skills management**
- Build skills assignment UI (employee -> process -> proficiency level)
- Build bulk skills import via CSV
- Build availability pattern editor (weekly template: which days/shifts each employee is available)
- Build availability override (specific dates: vacation, leave, training)

**Friday: Polish and deploy**
- Employee search by name, site, department, skill
- Skill matrix view (employees as rows, processes as columns, proficiency as cell values)

**Week 3 deliverable:** Complete workforce data management. A user can import 500 employees via CSV, assign skills, and manage availability.

### Week 4: Demand and Workload

**Monday-Tuesday: Demand ingestion**
- Build CSV upload for demand forecasts (columns: date, period_start, period_end, demand_type, volume)
- Build demand type management (name, category, unit of measure)
- Build demand-type-to-process mapping
- Display demand data in a simple table with date filters

**Wednesday-Thursday: Workload computation**
- Implement the core formula: `required_hours = demand_volume / weighted_uph`
- Compute `required_fte = required_hours / shift_duration`
- Compute per-shift weighted UPH using the available workforce skill distribution for that shift
- Display workload plan as a table: site > process > date > shift > required FTEs vs. available FTEs

**Friday: Polish and deploy**
- Add coverage gap highlighting (required > available = red)
- Add summary statistics (total required FTEs, total available, gap %)

**Week 4 deliverable:** A user can upload demand data and see workload calculations with coverage gaps. This is the first moment the system provides analytical value.

### Day 30 Checkpoint

At the end of 30 days, a user can:
1. Sign up and create an organization
2. Add sites with departments and processes
3. Import employees via CSV and assign skills
4. Set employee availability and leave
5. Upload demand forecasts
6. See workload calculations with coverage gap analysis

This is not impressive by product standards. It is a basic data management application with one computation. But it is infinitely more than what exists today, because infinity times zero is the relevant comparison.

---

## DAYS 31-60: "Make It Plan"

### Week 5-6: Solver Integration (The Riskiest Milestone)

This is the hardest technical work in the entire project. Two full weeks is aggressive but necessary.

**Week 5: Solver pipeline**
- Define the solver I/O contract as TypeScript interfaces (this is the one document worth writing)
- Build the data preload pipeline: query employees, skills, availability, demand, constraints for a site/date range
- Build the employee-skill-availability matrix (pre-compute and cache)
- Integrate HiGHS WASM (start with `highs-js` npm package in a Node.js process, not Edge Function)
- Build MIP formulation:
  - Decision variables: `x[e,p,t]` = 1 if employee e assigned to process p in time slot t
  - Objective: minimize cost + maximize coverage + penalize soft constraint violations
  - Hard constraints: max daily hours, min rest between shifts, no overlaps, skill requirements, availability
  - Soft constraints: preferred shifts, overtime minimization, fairness
- Test against a small problem: 10 employees, 3 processes, 1 day
- Test against a medium problem: 50 employees, 8 processes, 7 days
- Measure: memory usage, solve time, solution feasibility

**Decision gate at end of Week 5:** Does HiGHS WASM solve a 50-employee, 7-day problem in under 60 seconds with under 512MB memory? If yes, continue with WASM. If no, deploy HiGHS via a Node.js process on Fly.io and route solver requests there.

**Week 6: Result pipeline + solver UX**
- Build the result writer: solver output -> staging table -> atomic swap to ShiftAssignment
- Build solver progress reporting (WebSocket or polling)
- Build the "Generate Plan" button: select site, date range, click generate, see progress, see results
- Build constraint violation reporting: which soft constraints were violated and by how much
- Build infeasibility reporting: if the solver returns INFEASIBLE, which hard constraint is likely the cause
- Handle solver timeout: if solve exceeds time budget, return best feasible solution found so far

**Week 5-6 deliverable:** A user can click "Generate Plan" and get an AI-optimized shift schedule. This is the product's core value proposition.

### Week 7-8: Planning Workbench

**Week 7: Process View**
- Build one scheduling view: Process View (processes as rows, time slots as columns, assigned employees as cells)
- Implement drag-and-drop assignment (move employee between processes/slots)
- Real-time constraint validation on drag: check skill level, availability, max hours, min rest
- Display constraint violations inline (red border + tooltip explaining which constraint is violated)
- Implement manual assignment: click cell -> search employee -> assign

**Week 8: Plan management**
- Implement plan state machine: Draft -> Optimized -> Under Review -> Approved -> Published
- Build plan version comparison: show diff between two plan versions (added/removed/changed assignments)
- Build plan publish workflow: approve -> publish -> notify affected employees
- Implement locked assignments: mark specific assignments as "locked" before re-optimization
- Implement Supabase Realtime for concurrent editing awareness (presence indicators)

**Week 7-8 deliverable:** A user can view an optimized plan, make manual adjustments with constraint validation, compare versions, and publish the final plan.

### Day 60 Checkpoint

At the end of 60 days, a user can:
1. Everything from Day 30, plus:
2. Generate an AI-optimized shift plan for a site
3. View the plan in a Process View with drag-and-drop editing
4. See real-time constraint validation when making manual changes
5. Compare plan versions
6. Publish a plan

This is an MVP workforce planning product. It is not enterprise-grade. It does not have an employee portal, agency management, payroll integration, or CBA support. But it solves the core problem: given demand, employees, and constraints, produce and refine a shift plan.

---

## DAYS 61-90: "Make It Usable"

### Week 9-10: Control Room

**Week 9: Coverage dashboard**
- Build the coverage heatmap: processes as rows, time slots as columns, color = coverage % (green/yellow/red)
- Build the heatmap tooltip: hover to see assigned employees and missing skills
- Add the covering index for heatmap tooltip performance
- Build the daily summary: total FTEs, overtime hours, coverage %, open gaps

**Week 10: KPIs and alerts**
- Build KPI cards: labor cost, overtime %, coverage rate, skill utilization
- Build a basic alert system: understaffing alerts, overtime threshold alerts, expiring certification alerts
- Build the notification center: list of alerts with acknowledge/dismiss actions
- Wire up Supabase Realtime for live dashboard updates when plans change

**Week 9-10 deliverable:** A Control Room where planners can see at a glance how their plans are performing.

### Week 11-12: Setup Wizard + Employee View

**Week 11: Setup wizard (simplified)**
- Build a 5-step wizard (not 8): Organization -> Sites & Processes -> Employees (CSV import) -> Demand (CSV upload) -> Review & Go Live
- No AI document parsing in the wizard. Manual entry and CSV import only.
- Add inline validation and progress indicators
- Target: a new customer can complete setup in 60 minutes, not 295

**Week 12: Employee schedule view**
- Build a minimal employee portal (a separate route, not a separate app)
- Employee can see: my schedule this week, my schedule next week
- Employee can see: upcoming changes (highlighted)
- Employee can: report absence for a future date
- Employee can: acknowledge a published schedule
- No shift swap, no bid, no preferences -- those are V2

**Week 11-12 deliverable:** New customers can set up in under an hour. Employees can view their schedules.

### Day 90 Checkpoint

At the end of 90 days, a user can:
1. Set up a new organization through a guided wizard (60 minutes)
2. Import employees and demand data via CSV
3. Generate optimized shift plans
4. Edit plans with drag-and-drop and constraint validation
5. Monitor coverage and KPIs in a Control Room
6. Publish plans to employees
7. Employees can view their schedules and report absences

This is a launchable product. It is not feature-complete. But it is a product that delivers value and can be sold, used, and improved based on real feedback from real users.

---

## WHAT TO STOP DOING

### Stop immediately

1. **Stop writing architecture documents.** The architecture section has 31 documents. It is over-specified. Any new architecture question should be answered by writing code that proves the answer, not a document that describes it.

2. **Stop conducting architecture reviews that produce documents.** The three reviews (REVIEW.md, REVIEW-FULL.md, SYSTEMS-REVIEW.md) found real problems. But the response to finding problems was writing more documents. The response should be fixing code.

3. **Stop designing AI features.** The 11 documents in section 10 (ai-layer) describe an AI system that learns from user interactions. There are no users. There are no interactions. These documents are speculative fiction until the product exists. Do not add to them.

4. **Stop configuring Claude-Flow agent topologies.** The repository has 96 agent configuration files. None of them produce application code. The time spent configuring Byzantine fault-tolerant consensus for AI agent swarms could have been spent building a login page.

5. **Stop adding to the knowledge base.** Every new document added to the repository creates a maintenance burden and an expectation of implementation. The documentation is already 3-6x more detailed than what the first implementation pass needs.

6. **Stop treating schema.sql as a document.** Execute it. Fix what breaks. It is code, not prose.

### Stop after this audit

7. **Stop producing review documents.** This audit is the fourth review. It should be the last one that produces documentation. The next review should review code.

---

## WHAT TO PRESERVE

The documentation is not worthless. Some of it is genuinely excellent and should be used as implementation specs:

### Use as-is

| Document | Use As |
|----------|--------|
| failure-modes.md | **Test plan.** Each of the 24 failure modes becomes a test case. "What happens when the solver returns INFEASIBLE?" becomes an integration test. |
| constraint-handling.md | **Constraint catalog for the solver.** Translate each constraint into a mathematical formulation and implement it. Ignore the 6 legal errors (L1-L6) -- fix them in code, not in the document. |
| planning-adjustments.md | **UX spec for the Planning Workbench.** The adjustment taxonomy (add/remove/move/split/swap) maps directly to UI actions. |
| multi-tenancy.md | **RLS implementation guide.** The shared-DB + RLS justification and defense-in-depth approach are correct. Implement them. |
| mvp-definition.md | **Scope document.** Use it to say no to features that are not on the list. |
| build-sequence.md | **Phase ordering.** The phases are roughly correct. Follow them. |

### Use selectively

| Document | Use This Part | Ignore This Part |
|----------|--------------|-----------------|
| data-entities.md | Entity definitions and field lists | The prose descriptions (use the schema.sql instead) |
| optimization-strategy.md | The 5 timing adjustment factors | The GA/SA strategies (use Greedy + HiGHS MIP only for MVP) |
| algorithm-strategies.md | Nothing for MVP | Everything (GA chromosome encoding is broken, benchmarks are fabricated) |
| scenario-simulation.md | The concept of "what-if scenarios" | Monte Carlo, LHS, correlation matrices (simple what-if only for MVP) |
| tech-stack.md | The Supabase + Next.js + tRPC stack decision | The 7-locale i18n, offline mode, embedding providers |
| ai-integration.md | The concept of AI-assisted wizard | The multi-agent orchestration, confidence calibration |

### Do not use

| Document | Why |
|----------|-----|
| All 11 ai-layer documents | Premature. No product to learn from. |
| algorithm-strategies.md GA/SA sections | Broken encoding. Fabricated benchmarks. |
| scalability-design.md Monte Carlo sections | Deferred from MVP. |
| system-overview.md | Has been rewritten once already. Let the implementation be the source of truth. |

---

## Success Criteria

### Day 30 success

- [ ] A URL exists (on Vercel) where someone can sign up
- [ ] schema.sql has been executed against a real Supabase database without errors
- [ ] At least one RLS policy has been tested with a real JWT token
- [ ] 500 employees can be imported via CSV in under 30 seconds
- [ ] Workload calculations produce a number that a domain expert validates as reasonable

### Day 60 success

- [ ] HiGHS produces a feasible shift plan for a 50-employee, 7-day problem
- [ ] A planner can drag-and-drop an assignment and see constraint validation in under 200ms
- [ ] Two plan versions can be compared side-by-side
- [ ] The solver pipeline (data load -> solve -> write results) completes in under 90 seconds for 200 employees

### Day 90 success

- [ ] A new user can complete setup and generate their first plan in under 90 minutes
- [ ] An employee can view their published schedule
- [ ] The coverage heatmap loads in under 2 seconds for a 500-employee site
- [ ] The system has been used by at least one real planner at a real site, even in a pilot/beta capacity

### The only metric that matters

On Day 1 of this roadmap, the repository has 163 files and 0 running features.
On Day 90, the measurement is: **how many real users have generated a real plan?**

If that number is zero, the roadmap failed regardless of how many features were built. If that number is one, the project has more validation than 51 documents could ever provide.
