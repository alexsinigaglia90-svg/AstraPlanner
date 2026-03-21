# Build Readiness Assessment

> If an engineering team of 3-5 started building tomorrow using these docs as their spec, what would happen?

**Short answer:** They would have a productive first two days, a frustrating first week, and a potentially derailing first month. The vision is clear. The specs are contradictory. The hardest technical integrations are unvalidated.

---

## Section 1: What an Engineer Could Start Building Immediately

### Buildable from current docs (with caveats)

**1. Supabase project setup + auth configuration**
The tech-stack.md and backend-architecture.md provide enough detail to provision a Supabase project, configure auth with JWT custom claims, and set up the basic CI/CD pipeline. An engineer who knows Supabase could complete this in 1-2 days.

**2. Core CRUD entities (sites, employees, skills)**
The schema.sql, despite its bugs, provides a working starting point for the organizational and workforce tables. The entity definitions in data-entities.md add context. An engineer could create tables and basic tRPC routers for sites, employees, and skills within the first week.

**3. CSV import framework**
The MVP definition specifies CSV import clearly enough (UTF-8, comma-delimited, column mapping UI, validation). Papa Parse is named. An engineer could build the generic import framework.

**4. Frontend scaffold**
Tech-stack.md specifies: Next.js 14+ App Router, shadcn/ui, Tailwind, Zustand, TanStack Query, React Hook Form + Zod. Supastarter is named as the starter kit. An engineer could scaffold this on day 1.

**5. Role-based access control structure**
Four roles (Admin, Planner, Manager, Viewer) with clear capability matrices in mvp-definition.md. Enforceable at UI, API, and DB levels. Specific enough to implement.

### Schema.sql bugs that must be fixed before using it

| Bug | Location | What's Wrong | Fix |
|-----|----------|-------------|-----|
| No absence/leave entity | Missing entirely | Optimizer, control room, and reactive planning all reference employee absences. No table exists to store them. | Create `employee_leave` or `employee_availability_override` table with date ranges and types. |
| `demand_forecast` uses `DATE` not `TIMESTAMPTZ` | Line 323 (`forecast_date DATE`) | Cannot store sub-daily demand (hourly, 15-min). The setup wizard promises sub-daily granularity. The workload engine needs per-shift demand. | Change to `period_start TIMESTAMPTZ` + `period_end TIMESTAMPTZ`. |
| `demand_granularity` enum is wrong | Line 46 | Only `daily`, `weekly`, `monthly`. Missing `hourly`, `15_minute`, `4_hour` that the wizard offers. | Extend enum or remove it and rely on the timestamp range. |
| No overlap prevention on shift_assignment | Missing constraint | Two overlapping shifts for the same employee on the same plan version will both insert. The UNIQUE constraint only catches identical start times. | Add exclusion constraint using `tstzrange` and `gist` index. |
| Missing `last_practiced_date` on employee_skill | Missing column | Skill decay model requires knowing when an employee last performed a skill. Cannot compute effective proficiency without it. | Add `last_practiced_date DATE` column. Populate from shift_assignment history. |
| No `pgvector`, `pgsodium`, `pgaudit`, `pg_cron` extensions | Line 28-29 | Only `pgcrypto` and `pg_trgm` are created. Tech-stack.md lists 7 extensions as dependencies. PII columns are plain VARCHAR. | Add all required extensions. Add pgsodium encryption to PII columns. |
| `organization_id` used everywhere but tech-stack.md says `tenant_id` | Throughout schema | Naming mismatch will cause integration bugs between modules developed by different engineers. | Pick one. Recommend `organization_id` since that matches the schema. Update all other docs. |
| No RLS policies defined | Missing entirely | The schema creates tables but zero RLS policies. The file says "RLS policies" in the header comment but none exist. | Add RLS policies using the chosen mechanism (see Decision Gate 1). |
| `process` table has no `site_id` | Line 201 | Processes are org-level but productivity standards are site-level. The backend-architecture.md says processes are per-site. Joining process to site requires going through `department`, which is optional. | Add optional `site_id` FK to `process`, or accept org-level processes with site-specific productivity standards. |
| Workload computation needs per-shift output | Not modeled | `workload_plan` (if it exists in the full schema) stores per-day aggregates. Morning and evening shifts have 40% different productivity rates. | Model workload at per-shift or per-time-bucket granularity. |

### MVP definition: clear and usable

The mvp-definition.md is the strongest document in the repository. It provides:
- 11 features IN scope with specific capability tables
- 14 features OUT of scope with rationale and planned version
- Technical constraints with specific numbers
- Success criteria with testable acceptance conditions
- Clear risk acknowledgments

An engineer could read this document and understand exactly what "done" looks like. This should be treated as the canonical scope document.

### Build sequence time estimates: questionable

The build-sequence.md has the right structure (phases, deliverables, dependencies, exit criteria) but the estimates assume everything goes right on the first attempt. Specific concerns below in Section 4.

---

## Section 2: Where an Engineer Would Get Stuck in Week 1

### 1. No project scaffold, no directory structure, no package.json

There is zero runnable code. An engineer's first task is to create a project from scratch. The docs name "Supastarter" as the starter kit, but do not specify:
- Which Supastarter template (they have multiple)
- What customizations are needed from the template
- How to integrate tRPC with the Supastarter scaffold
- Whether the project uses `src/` or root-level directories

The backend-architecture.md shows a `/modules/{name}/` convention with 7 files per module. The tRPC router structure shows 12 module routers. But there is no specification for the top-level project structure that connects the Next.js app router to the tRPC routers to the module directories.

**What will happen:** The first engineer will spend 2-3 days making scaffold decisions that affect every subsequent developer. These decisions will not match what the docs describe because the docs describe an idealized structure, not a Supastarter-compatible one.

### 2. RLS mechanism: 3 different approaches, no canonical decision

| Document | RLS Approach | How tenant_id is resolved |
|----------|-------------|--------------------------|
| system-overview.md | `auth.jwt() ->> 'tenant_id'` | Directly from JWT claim in each policy |
| backend-architecture.md | `current_setting('app.tenant_id')` | Set by tRPC middleware via `SET LOCAL` at transaction start |
| schema.sql | `auth.organization_id()` | Custom function reading `request.jwt.claims` |

These are not interchangeable. The JWT-claim approach (system-overview.md) is stateless but requires embedding tenant_id in JWT. The session-variable approach (backend-architecture.md) is more flexible but requires middleware to set it on every request. The custom-function approach (schema.sql) requires writing a Supabase-specific function that may or may not be compatible with Edge Functions.

**What will happen:** If two engineers implement RLS independently (one for the demand module, one for the workforce module), they will use different mechanisms. When these modules interact, RLS will silently fail to apply in one direction or the other.

### 3. tenant_id vs organization_id: no canonical naming

The schema uses `organization_id`. The system overview, backend architecture, and tech stack use `tenant_id`. The build sequence uses `DemandSignal` as a table name; the schema calls it `demand_forecast`. The backend architecture describes a `workforce.employees` table in a per-module schema; the schema puts everything in `public`.

This is not a cosmetic issue. If Engineer A writes a tRPC router that queries `WHERE tenant_id = ...` and Engineer B writes a schema with `organization_id`, the code will not compile. If both names exist in different contexts, every code review becomes a naming negotiation.

### 4. Per-module schemas vs flat schema: no canonical decision

| Document | Schema Organization |
|----------|-------------------|
| backend-architecture.md | Per-module: `demand.*`, `workforce.*`, `planning.*`, `optimization.*`, etc. (11 schemas) |
| schema.sql | All tables in `public` schema |
| tech-stack.md | Silent on schema organization |

This affects:
- Every SQL query (qualified names vs unqualified)
- Every migration file
- Cross-module views and materialized views
- RLS policy scope
- Supabase CLI behavior (schema diffing)

### 5. tRPC router structure: pseudocode only

The backend-architecture.md provides tRPC procedure signatures like:
```
demandRouter = router({
  getBysite: query({ siteId, dateRange, version? }) -> DemandSignal[]
})
```

This is pseudocode. The actual tRPC implementation requires Zod input schemas, context types, middleware chains, error handling, and output types. None of these are defined. The procedure signatures also use names that do not match the schema (e.g., `DemandSignal` vs `demand_forecast`).

**What will happen:** Each engineer will define their own Zod schemas, their own error handling patterns, their own pagination conventions. By Week 3, the 12 routers will have 12 different conventions.

### 6. Environment variables: never listed anywhere

The docs reference Supabase, Vercel, Upstash Redis, Sentry, Claude API, Fly.io, Resend, PostHog, BetterUptime, and Stripe. Each requires API keys or connection strings. No document lists the required environment variables, their names, their formats, or which are needed for local development vs. staging vs. production.

**What will happen:** Each engineer will discover needed env vars through trial and error. The `.env.local` file will grow organically with inconsistent naming conventions.

---

## Section 3: Where an Engineer Would Get Stuck in Month 1

### 1. HiGHS WASM integration: no instructions, no validated approach

The tech-stack.md states HiGHS is "compiled to WebAssembly and runs inside Supabase Edge Functions." The build-sequence.md lists "Compile HiGHS to WASM (or use pre-built WASM binary)" as a Phase 3 deliverable. No document provides:
- Which pre-built WASM binary to use (if any exist)
- How to compile HiGHS to WASM using Emscripten
- Whether the resulting binary fits within Edge Function memory limits (256MB)
- How to load a WASM binary in a Deno runtime (Edge Functions use Deno, not Node.js)
- Whether HiGHS WASM has been tested on Supabase Edge Functions by anyone, ever

The SYSTEMS-REVIEW.md flags this as the #1 hardest integration point. No one has validated that this works. If it does not work, the core differentiator of the product (AI-optimized scheduling running at the edge) falls back entirely to Fly.io, adding latency and infrastructure complexity.

**What will happen:** The optimization specialist will spend 1-3 weeks attempting WASM compilation and integration. If the binary exceeds 256MB or Deno has WASM loading issues, Phase 3 needs to be redesigned around a Fly.io-only solver architecture. This would be discovered in Week 9, potentially invalidating the 10-second interactive solve target.

### 2. Solver I/O contract: not defined

SYSTEMS-REVIEW.md section 2.2 explicitly calls this out. The optimization engine needs typed input/output interfaces. The SYSTEMS-REVIEW provides a draft `SolverInput` / `SolverOutput` interface, but this exists only in a review document, not in a spec document. No engineer will know to look there.

Without this contract:
- The frontend team cannot build the optimization progress UI
- The workload module team cannot format solver inputs
- The planning module team cannot parse solver outputs
- No test fixtures can be created

### 3. Edge Function architecture: tRPC + Deno compatibility unvalidated

The backend runs as Supabase Edge Functions (Deno runtime). tRPC is designed for Node.js. The build-sequence.md acknowledges "tRPC has documented Deno support" but rates the risk as "Low." The SYSTEMS-REVIEW.md rates it as the #2 hardest integration point.

Specific concerns:
- BullMQ is a Node.js library. It requires Redis connection via `ioredis`. Neither `ioredis` nor BullMQ have official Deno support.
- tRPC middleware that calls `set_config('app.tenant_id', ...)` needs a PostgreSQL client. Which Postgres client works in Deno Edge Functions?
- The `pgsodium` integration requires server-side decryption. Does this work in Deno?

### 4. BullMQ to Fly.io pipeline: no implementation guide

The architecture describes this chain: Edge Function enqueues job to BullMQ (via Upstash Redis) -> Fly.io worker dequeues and solves -> result stored in DB -> frontend notified via Supabase Realtime. Four systems in sequence. No document describes:
- How to deploy a BullMQ worker on Fly.io
- How the Fly.io worker authenticates with Supabase (service role key? custom JWT?)
- How the worker writes results back to Supabase (direct Postgres connection? Supabase client?)
- How to notify the frontend that the solve is complete (database webhook? Realtime broadcast?)
- Error handling if any link in the chain fails
- How to monitor job status

### 5. Claude integration: prompt templates exist but no execution framework

The ai-integration.md and wizard-ai-strategies.md describe AI use cases and some prompt patterns. But there is no specification for:
- The `ai-gateway` Edge Function architecture (mentioned in tech-stack.md but never defined)
- How to manage Claude API keys in Supabase Vault from Deno Edge Functions
- The cost-tracking mechanism (Redis increment + daily Postgres reconciliation, per tech-stack.md, but no implementation spec)
- Circuit breaker implementation
- Fallback behavior when Claude is unavailable
- How tenant data is pseudonymized before sending to Claude (GDPR requirement from gdpr-compliance.md)

---

## Section 4: Build Sequence Realism Assessment

### Phase 0: Foundation (Week 1-2) -- MODERATELY REALISTIC

**What's realistic:** Supabase project provisioning, auth setup, CI/CD pipeline, basic tRPC scaffolding. These are well-understood tasks.

**What's underestimated:**
- Supastarter template evaluation and customization: 2-3 days minimum, not accounted for
- Making the 7 architectural decisions listed in Section 5 below: at least 2-3 days of discussion for a new team
- Schema bug fixes (from SYSTEMS-REVIEW): 2-3 days
- Writing RLS policies for the base tables: 1-2 days

**Realistic estimate:** 2.5-3 weeks if the team is experienced with Supabase. 3-4 weeks if they are not.

### Phase 1: Data Core (Week 3-5) -- REALISTIC WITH RISK

**What's realistic:** CRUD for sites, employees, skills is straightforward. 3 weeks is reasonable for a team of 3-4.

**What's underestimated:**
- CSV import edge cases: The build sequence itself flags this as "High likelihood" of 2-3 day overrun. The mitigation (limit to UTF-8 comma CSV) is correct but needs to be decided upfront.
- The employee availability/leave entity is missing from the schema. Building CRUD for it is not in the Phase 1 deliverables, but Phase 3 needs it. Must be added here.
- Audit trail implementation: Every CRUD operation must emit audit events. This is a cross-cutting concern that touches every module.

**Realistic estimate:** 3-4 weeks.

### Phase 2: Demand & Workload (Week 6-8) -- REALISTIC

**What's realistic:** Demand ingestion and workload computation are well-defined mathematically. The formula is simple: `hours = demand / productivity_rate * (1 + allowance)`. CSV upload builds on the Phase 1 framework.

**What's underestimated:**
- The demand schema needs to be fixed first (sub-daily granularity). This is not accounted for.
- Workload computation needs to be per-shift, not per-day (per SYSTEMS-REVIEW). This adds complexity.
- Database webhooks triggering Edge Functions for auto-recomputation: not trivial to debug.

**Realistic estimate:** 3-4 weeks.

### Phase 3: Optimization (Week 9-12) -- HIGH RISK, LIKELY OVERRUN

This is correctly identified as the highest-risk phase. 4 weeks is allocated with "buffer included." The buffer is insufficient.

**The core risk:** HiGHS WASM integration is unvalidated. If the WASM binary does not work in Supabase Edge Functions (memory limit, Deno compatibility, cold start time), the entire architecture needs to be redesigned around Fly.io-only solving. This redesign costs 1-2 weeks and changes the UX model (no more 10-second interactive solves; everything becomes async with progress indicators).

**What's underestimated:**
- Problem formulation (translating business constraints to MIP constraints) is intellectually hard. This is not a "write code" task; it is a "figure out the math" task. Allow 2 weeks for a specialist.
- The Fly.io fallback is listed as a deliverable but the BullMQ->Fly.io pipeline has zero implementation guidance.
- Solution quality tuning (objective function weights, constraint relaxation strategies) requires iterating with realistic data. No seed data exists yet.
- The constraint engine (hard vs soft, relaxation order) needs design that does not exist in any document.

**Realistic estimate:** 5-7 weeks. If HiGHS WASM fails, add 2 weeks for architecture redesign.

### Phase 4: Planning UX (Week 13-15) -- REALISTIC IF SCOPE IS CUT

**What's realistic:** A control room dashboard with a coverage heatmap and KPI cards is 2-3 weeks. A basic schedule grid (read-only) is 1 week.

**What's underestimated:**
- Drag-and-drop with real-time constraint validation: This alone is 2-3 weeks of frontend work. dnd-kit integration, constraint checking on drop, optimistic UI updates, rollback on server rejection.
- The SYSTEMS-REVIEW recommends building ONE view (Process View) instead of three. If the team tries to build all three scheduling views, this phase doubles in duration.
- Supabase Realtime integration for collaborative editing adds another week.

**Realistic estimate (one view):** 3-4 weeks. **With all three views:** 6-8 weeks.

### Overall: Is 24 weeks achievable for 3-5 engineers?

**With the current scope as written:** No. Realistic estimate is 30-36 weeks.

**With recommended scope reductions (one planning view, simplified wizard, no Monte Carlo):** 26-30 weeks with a team of 4-5 experienced engineers. 24 weeks is possible but requires zero scope creep, no major technical surprises on HiGHS WASM, and an optimization specialist who has done MIP formulation before.

**The binding constraint is Phase 3.** If the solver integration goes smoothly, 24-28 weeks is achievable. If it does not, the project slips to 32+ weeks because everything downstream (Phase 4, 5, 6) depends on a working optimizer.

---

## Section 5: Technical Decision Gates

These decisions MUST be made before or during Week 1 of build. Deferring any of them will cause rework.

### Decision 1: RLS Approach

**Options:**

| Option | How it works | Pros | Cons |
|--------|-------------|------|------|
| A. JWT claims | `auth.jwt() ->> 'organization_id'` in each RLS policy | Stateless, Supabase-native, works with direct DB access from client | Requires organization_id in every JWT; JWT must be refreshed if user changes orgs; no fine-grained site filtering in RLS |
| B. Session variables | `current_setting('app.tenant_id')::uuid` set by middleware via `SET LOCAL` | Flexible, can set additional context (site_ids, role); works in transactions | Requires middleware on every request; if middleware is skipped, RLS is open; does not work with direct Supabase client queries |
| C. Custom function | `auth.organization_id()` reads from `request.jwt.claims` | Encapsulates logic in one place; can evolve without changing policies | Must be maintained; Supabase-specific; function must handle edge cases (missing claim, null) |

**Recommendation:** Option A (JWT claims) for simplicity and Supabase-native compatibility. Use `auth.jwt() ->> 'organization_id'` consistently across all policies. Accept the limitation that site-level filtering happens at the application layer, not RLS.

**Risk of wrong choice:** If the team picks B (session variables) and later needs direct Supabase client access (e.g., for Realtime subscriptions or Storage policies), the session variable approach does not apply to those contexts. RLS silently fails, creating a data leakage vulnerability.

### Decision 2: Schema Organization

**Options:**

| Option | How it works | Pros | Cons |
|--------|-------------|------|------|
| A. Flat public schema | All tables in `public` | Simple; Supabase tools assume `public`; no cross-schema complications; RLS applies cleanly | No module boundary enforcement at DB level; large schema to navigate |
| B. Per-module schemas | `demand.*`, `workforce.*`, `planning.*` | Clear ownership; modules cannot accidentally write to each other's tables; cleaner migration organization | Supabase RLS on non-public schemas requires explicit setup; cross-schema joins need qualified names; Supabase client auto-detection may not work; migration tooling complications |

**Recommendation:** Option A (flat public schema) for MVP. Use naming conventions (table prefixes like `demand_`, `workforce_`, `planning_`) instead of separate schemas. The per-module schema approach (Option B) adds operational complexity that a 3-5 person team does not need.

**Risk of wrong choice:** If the team picks B and then discovers that Supabase Realtime, Storage policies, or the client SDK do not work cleanly with non-public schemas, they will spend days debugging infrastructure issues instead of building features.

### Decision 3: Naming Convention

**Options:**

| Option | Current usage | Where it appears |
|--------|-------------|-----------------|
| A. `organization_id` | schema.sql | Tables, foreign keys, RLS policies |
| B. `tenant_id` | system-overview.md, backend-architecture.md, tech-stack.md | API layer, middleware, JWT claims, documentation |

**Recommendation:** `organization_id` everywhere. It is more semantically meaningful (an organization is a real concept; a tenant is an infrastructure concept). The schema already uses it. Update all other documents to match.

**Risk of wrong choice:** Minimal functionally, but the cognitive overhead of translating between two names on every code review, every Slack question, and every debugging session adds up. Pick one. Enforce it.

### Decision 4: Solver Deployment

**Options:**

| Option | How it works | Pros | Cons |
|--------|-------------|------|------|
| A. Edge Function WASM (primary) + Fly.io (fallback) | Small/medium problems run HiGHS WASM in Edge Functions; large problems enqueue to Fly.io | Low latency for interactive solves (< 10s); no server to manage for most requests | Unvalidated approach; Edge Function memory limit (256MB) may be too small; WASM cold start in Deno is unknown |
| B. Fly.io only | All optimization runs on Fly.io workers | Proven approach; no WASM complexity; full native solver performance; OR-Tools available | All solves are async; no sub-second interactive feedback; requires always-running Fly.io instances (cost); BullMQ pipeline must be robust |
| C. Validate first, decide later | Spend Week 1 of Phase 3 benchmarking HiGHS WASM on Edge Functions. Decide based on results. | Data-driven decision; no wasted effort | Delays Phase 3 start by 1 week; architecture remains uncertain until then |

**Recommendation:** Option C. Do not commit to WASM until it is benchmarked. Budget 3-5 days in early Phase 0 or Phase 1 for a spike: compile HiGHS to WASM, deploy to Supabase Edge Function, test with a 50-employee/7-day problem. If memory exceeds 200MB or solve time exceeds 15 seconds, default to Option B.

**Risk of wrong choice:** If the team assumes WASM works (Option A) and builds the interactive solve UX around it, discovering in Week 10 that it does not work requires redesigning the UX to be async-only. This is a 2-week setback on the critical path.

### Decision 5: API Architecture

**Options:**

| Option | How it works | Pros | Cons |
|--------|-------------|------|------|
| A. tRPC on Supabase Edge Functions (Deno) | All tRPC routers deploy as Edge Functions | Low latency (edge deployment); managed infrastructure; no server to maintain | Deno compatibility risks with npm packages (BullMQ, ioredis); 60-second timeout; 256MB memory; limited debugging tools |
| B. tRPC on standalone Node.js (Vercel Serverless Functions) | tRPC routers deploy as Vercel serverless functions; Supabase is database-only | Full Node.js ecosystem; no Deno compatibility issues; familiar tooling | Vercel function cold starts; separate deployment from Supabase; cannot use Supabase Edge Function features (Vault, built-in auth context) |
| C. Hybrid | Simple CRUD routers on Edge Functions; optimization and AI routers on Vercel/Fly.io | Best runtime for each workload | Two deployment targets; split configuration; harder to debug |

**Recommendation:** Option B for MVP. Deploy tRPC as Vercel serverless functions. Use Supabase as a database and auth provider, not as a compute platform. This eliminates the Deno compatibility risk entirely. Supabase Edge Functions can be used later for specific use cases (database webhooks, scheduled jobs) where Deno compatibility is less of a concern.

**Risk of wrong choice:** If the team picks A and discovers that critical npm packages (BullMQ, certain Postgres clients, WASM loaders) do not work in Deno, they face a migration to B mid-build. This is a 1-2 week disruption.

### Decision 6: State Management

**Options are already well-specified in tech-stack.md.** The Zustand + TanStack Query + nuqs combination is sound. The remaining decision is: which specific Zustand stores?

**Recommendation:** Start with two stores:
1. `uiStore`: sidebar state, selected tab, filter panel visibility, view mode preferences
2. `planningStore`: selected plan ID, zoom level, highlight mode, pinned employees

Do not create more stores until the need is proven. Over-engineering state management on day 1 creates unnecessary abstraction.

### Decision 7: Realtime Strategy

**Options:**

| Option | How it works | Pros | Cons |
|--------|-------------|------|------|
| A. Supabase Realtime (Postgres Changes) | Listen to row changes on `plans`, `assignments`, `demand_signals` | Zero backend code; automatic; row-level granularity | Noisy (fires on every column change); does not carry context about who/why; RLS applies (good for security, bad for admin views) |
| B. Supabase Realtime (Broadcast) | Application code broadcasts events on named channels | Full control over event payload; efficient; carries context | Requires explicit broadcast calls in every mutation; easy to forget |
| C. Polling (TanStack Query) | Background refetch on configurable intervals | Simplest; no WebSocket complexity; works everywhere | Latency (seconds, not milliseconds); consumes rate limit budget; does not scale to many concurrent users |

**Recommendation:** Option A for plan/assignment changes (critical for collaborative editing). Option C for low-frequency data (employee list, site config). Do not use Broadcast (Option B) until the team understands the failure modes of Postgres Changes.

**Risk of wrong choice:** If the team builds everything on polling (Option C), 50 concurrent users will consume 1,500+ reads/minute, exhausting the rate limit budget and database connection pool. If the team builds everything on Realtime (Option A), they will deal with excessive UI refreshes from noisy change events.

---

## Summary

| Readiness Area | Score | Notes |
|---------------|-------|-------|
| Vision clarity | 9/10 | MVP definition is excellent |
| Technical specification | 4/10 | Contradictions between docs; key decisions unmade |
| Implementation guidance | 2/10 | No runnable code, no project scaffold, no env vars |
| Hardest risk mitigation | 1/10 | HiGHS WASM, tRPC+Deno, BullMQ pipeline all unvalidated |
| Build sequence realism | 5/10 | Right structure, optimistic estimates, critical path correctly identified |

**The team should NOT start building features on day 1.** Week 1 should be entirely dedicated to: (1) making the 7 decisions above, (2) fixing schema bugs, (3) spiking HiGHS WASM and tRPC+Deno compatibility, and (4) creating the project scaffold. Feature development starts in Week 2.
