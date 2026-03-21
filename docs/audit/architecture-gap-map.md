# Architecture Gap Map

## Adversarial Audit: Documented Architecture vs. Reality

**Audit Date**: 2026-03-20
**Auditor**: Automated adversarial review
**Verdict**: 100% gap across all layers. Zero implementation code exists.

---

## Summary Gap Table

| Layer | Documented | Implemented | Gap |
|-------|-----------|-------------|-----|
| Frontend (Next.js 14+) | Full App Router, 30+ routes, shadcn/ui, setup wizard, control room, planning workbench, alerts | Nothing. Zero `.tsx` files. Zero `.ts` files. No `package.json`. No `next.config.js`. | 100% |
| Backend (Supabase Edge Functions) | 10+ modules: demand ingestion, workload compute, optimization engine, scenario simulator, AI advisor, tRPC routers | Nothing. No Edge Function code. No `supabase/functions/` directory. No tRPC definitions. | 100% |
| Database (PostgreSQL) | `schema.sql` with 18 tables + 1 join table + 3 materialized views, 22 ENUMs, 20+ indexes, full RLS policies | `schema.sql` exists as a text file. It has never been executed against any database. No Supabase project exists. No migrations directory. | 100% |
| Auth (Supabase Auth) | SSO/SAML, JWT with custom claims (`organization_id`, `user_role`), MFA, RBAC with 5 roles (admin, owner, planner, manager, viewer) | Nothing. No Supabase project. No auth configuration. The `auth.organization_id()` helper function in schema.sql references Supabase Auth infrastructure that does not exist. | 100% |
| Optimization (HiGHS WASM) | 4-stage pipeline, 5 objective functions, multi-objective optimization with weighted sum and lexicographic strategies, HiGHS WASM integration | Nothing. Zero solver code. No HiGHS dependency. No WASM binary. No solver I/O contract. | 100% |
| AI (Claude API) | 5 use cases: AI advisor, NL setup, document upload parsing, CBA parsing, smart defaults | Nothing. No Claude API integration. No API key management. No prompt templates. | 100% |
| Real-time (Supabase Realtime) | WebSocket channels for live plan updates, presence tracking, collaborative editing | Nothing. No Supabase project. No real-time subscriptions. | 100% |
| Cache (Upstash Redis) | Feature store, session cache, BullMQ job queues, rate limiting | Nothing. No Upstash account. No Redis client code. No queue definitions. | 100% |
| Workers (Fly.io) | Heavy compute workers for large MIP solves (>60s), batch processing, bulk imports | Nothing. No Fly.io configuration. No Dockerfile. No worker code. | 100% |
| CI/CD | GitHub Actions pipelines (implied by standard practice) | Nothing. No `.github/workflows/` directory. No deployment configuration of any kind. | 100% |
| Monitoring | Sentry error tracking, BetterUptime status page (referenced in architecture docs) | Nothing. No monitoring configuration. No error tracking. | 100% |

---

## Layer-by-Layer Analysis

### 1. Frontend (Next.js 14+ on Vercel)

**What the docs promise**: A full Next.js 14+ application with App Router, server-side rendering, Edge Middleware for tenant routing, and a comprehensive UI built with shadcn/ui. The docs describe at minimum: a setup wizard with 8 phases and dozens of form fields, a "Control Room" dashboard with real-time metrics, a "Planning Workbench" for interactive schedule manipulation, an alerts/notifications panel, and admin screens for site/employee/process management. The wizard flow document alone specifies 50+ input fields across 8 phases with AI-assisted interactions, map visualizations, drag-and-drop reordering, and bulk import functionality.

**What actually exists**: Zero frontend code. No `package.json`, no `next.config.js`, no components, no pages, no styles. The entire `docs/` tree is Markdown.

**First implementation step**: Initialize a Next.js 14+ project with TypeScript, Tailwind CSS, and shadcn/ui. Create the root layout, auth middleware stub, and a single landing page. Estimated: 1 day.

**Estimated effort to MVP-functional**: 8-12 weeks for a single developer. The wizard alone (8 phases, 50+ fields, validation, state management, AI integration panels) is 3-4 weeks. The planning workbench with interactive schedule grid is another 3-4 weeks. Dashboards, admin screens, and notification UI fill the remainder.

---

### 2. Backend (Supabase Edge Functions)

**What the docs promise**: The "Intelligence Layer" running as Supabase Edge Functions (Deno/TypeScript). Described modules include: demand ingestion with validation/enrichment, workload computation engine, optimization engine with HiGHS WASM, scenario simulator, AI advisor (Claude gateway), tRPC routers providing end-to-end type safety. The system-overview.md describes these as stateless functions reading from and writing to PostgreSQL.

**What actually exists**: Zero backend code. No `supabase/` directory. No function definitions. No tRPC router definitions. No Deno configuration.

**First implementation step**: Initialize a Supabase project (local dev with `supabase init`). Create the first Edge Function for health-check. Set up tRPC with a basic router. Estimated: 1-2 days.

**Estimated effort to MVP-functional**: 6-10 weeks. The workload computation engine (demand normalization + hours calculation + FTE calculation) is 2-3 weeks including tests. The optimization engine integration with HiGHS is 3-4 weeks (see planning engine gap analysis). API endpoints for CRUD operations across 18 tables is 1-2 weeks.

---

### 3. Database (PostgreSQL on Supabase)

**What the docs promise**: A fully normalized schema with 18 tables, 1 join table, 3 materialized views, 22 custom ENUM types, comprehensive check constraints, foreign keys with appropriate cascade/restrict behaviors, 20+ indexes tuned to documented query patterns, full Row-Level Security, and an immutable audit log with trigger protection.

**What actually exists**: A single `schema.sql` file (1,145 lines). It is well-structured and would likely execute against PostgreSQL 15+ with the `pgcrypto` and `pg_trgm` extensions. However, it has never been executed. No Supabase project exists. No migration tool is configured. No seed data exists.

**First implementation step**: Create a Supabase project. Execute `schema.sql` against it. Validate that all tables, constraints, indexes, RLS policies, and materialized views are created without errors. Create a seed script with test data for at least one organization, one site, and a handful of employees. Estimated: 1-2 days.

**Estimated effort to MVP-functional**: 1-2 weeks. The schema itself is the most complete artifact in the project. Work needed: execute and validate, write migrations infrastructure, create seed data, test RLS policies with actual JWT claims, add the missing entities identified in the data model gap analysis.

---

### 4. Auth (Supabase Auth)

**What the docs promise**: Supabase Auth with SSO/SAML for enterprise customers, JWT-based authentication with custom claims (`organization_id` and `user_role`), MFA, and RBAC with 5 roles. The `schema.sql` includes `auth.organization_id()` and `auth.user_role()` helper functions that extract claims from JWTs. All RLS policies depend on these functions.

**What actually exists**: The helper functions are defined in `schema.sql` but have never been tested because no Supabase Auth instance exists. The custom claims injection mechanism (described as "set during login via a Supabase Edge Function or database function") has no implementation.

**First implementation step**: Set up Supabase Auth with email/password login. Create a database function or Edge Function that injects `organization_id` and `user_role` into JWT custom claims on sign-in. Test that RLS policies correctly filter data. Estimated: 2-3 days.

**Estimated effort to MVP-functional**: 2-3 weeks. Email/password auth: 2-3 days. Custom claims injection: 2-3 days. Role-based UI guards: 1 week. SSO/SAML (enterprise requirement): 1-2 weeks additional and requires Supabase Pro plan.

---

### 5. Optimization Engine (HiGHS WASM)

**What the docs promise**: A 4-stage pipeline (demand normalization, workload computation, FTE calculation, assignment optimization). The assignment optimization stage uses HiGHS (a MIP solver) compiled to WASM, running inside Supabase Edge Functions. Five objective functions are described in prose: minimize labor cost, maximize skill coverage, minimize overtime, maximize preference satisfaction, minimize workload variance. Multi-objective optimization via weighted sum or lexicographic ordering. Three performance tiers: interactive (<5s), background (<60s), batch (up to 30 min).

**What actually exists**: Zero solver code. The formulas in `optimization-strategy.md` are written in pseudocode, not executable code. No HiGHS WASM binary. No solver I/O contract (what JSON goes in, what JSON comes out). No MIP formulation with proper mathematical notation (no constraint matrix, no variable bounds). No test fixtures.

**First implementation step**: Install `highs-js` (the WASM build of HiGHS). Write a minimal proof-of-concept that solves a toy assignment problem: 5 employees, 3 processes, 1 time slot, minimize cost. Validate that it runs within Supabase Edge Function memory limits (256 MB). Estimated: 3-5 days.

**Estimated effort to MVP-functional**: 6-10 weeks. See planning engine gap analysis for details. This is the highest-risk layer in the entire system.

---

### 6. AI Integration (Claude API)

**What the docs promise**: Five AI use cases: (1) AI advisor for explaining plans and suggesting improvements, (2) natural language setup in the wizard, (3) document upload and parsing (e.g., employee rosters, CBA documents), (4) CBA/union contract parsing to extract labor rules, (5) smart defaults based on industry data.

**What actually exists**: Nothing. No Claude API key management. No prompt engineering. No AI gateway Edge Function.

**First implementation step**: Create a single Edge Function that calls the Claude API with a hardcoded prompt to answer a question about a workforce plan. Estimated: 1 day.

**Estimated effort to MVP-functional**: 4-6 weeks. The AI advisor (explain plans) is 1-2 weeks. NL setup is 2-3 weeks of prompt engineering and UI integration. Document parsing (CBA extraction) is the riskiest AI claim and could take 3-4 weeks with uncertain accuracy. Smart defaults require a training dataset that does not exist.

---

### 7. Real-time (Supabase Realtime)

**What the docs promise**: WebSocket-based real-time updates for live plan changes, presence tracking for collaborative editing, and instant notification delivery.

**What actually exists**: Nothing. No Supabase project means no Realtime infrastructure.

**First implementation step**: Enable Realtime on key tables (plan_version, shift_assignment, notification) in Supabase. Subscribe to changes from the frontend. Estimated: 1-2 days.

**Estimated effort to MVP-functional**: 1-2 weeks. Realtime is relatively straightforward with Supabase -- the heavy lifting is in the frontend UI that reacts to changes.

---

### 8. Cache/Queues (Upstash Redis)

**What the docs promise**: Upstash Redis for session caching, computed plan snapshots, rate limiting, and BullMQ job queues for async processing.

**What actually exists**: Nothing.

**First implementation step**: Create an Upstash Redis instance. Use it for session caching in the Next.js app. Estimated: half a day.

**Estimated effort to MVP-functional**: 1-2 weeks. BullMQ queue setup for async solver jobs is the main work item.

---

### 9. Workers (Fly.io)

**What the docs promise**: Containerized workers on Fly.io for heavy compute: large MIP solves exceeding 60 seconds (which cannot run in Edge Functions), batch processing, and bulk imports.

**What actually exists**: Nothing. No Dockerfile. No Fly.io account. No worker code.

**First implementation step**: Create a basic Fly.io app with a health-check endpoint. Deploy a containerized Node.js worker that can pull jobs from a Redis queue. Estimated: 1-2 days.

**Estimated effort to MVP-functional**: 2-3 weeks. Most of the effort is in the solver code itself (shared with item 5), plus queue integration and deployment pipeline.

---

### 10. CI/CD

**What the docs promise**: Not explicitly documented in detail, but implied by the architecture (Vercel for frontend, Supabase CLI for Edge Functions, Fly.io for workers).

**What actually exists**: Nothing. No `.github/workflows/`. No deployment scripts.

**First implementation step**: Create a GitHub Actions workflow that runs linting and type-checking on push. Estimated: half a day.

**Estimated effort to MVP-functional**: 1 week. Automated deployments to Vercel (frontend), Supabase (Edge Functions + migrations), and Fly.io (workers).

---

### 11. Monitoring

**What the docs promise**: Error tracking and uptime monitoring (implied by production architecture).

**What actually exists**: Nothing.

**First implementation step**: Integrate Sentry into the Next.js app and Edge Functions. Estimated: half a day.

**Estimated effort to MVP-functional**: 1 week. Sentry integration, custom dashboards, alerting rules, uptime monitoring.

---

## Total Estimated Effort to Reach MVP

| Layer | Weeks (1 senior dev) |
|-------|---------------------|
| Database (execute + validate + seed) | 1-2 |
| Auth (Supabase Auth + custom claims + RLS testing) | 2-3 |
| Backend API (CRUD + workload computation) | 6-10 |
| Optimization Engine (HiGHS integration + solver) | 6-10 |
| Frontend (wizard + dashboards + planning workbench) | 8-12 |
| AI Integration (advisor + NL setup) | 4-6 |
| Real-time | 1-2 |
| Cache/Queues | 1-2 |
| Workers (Fly.io) | 2-3 |
| CI/CD + Monitoring | 1-2 |
| **Total (sequential)** | **32-52 weeks** |
| **Total (team of 3, parallelized)** | **14-20 weeks** |

These estimates assume experienced developers familiar with Supabase, Next.js, and operations research. They do not include QA, user testing, documentation updates, or production hardening.

---

## Critical Path

The longest dependency chain is:

1. Database (must exist first) -> 1-2 weeks
2. Auth (required for all API access) -> 2-3 weeks (can partially overlap with #1)
3. Backend API (CRUD layer) + Workload Computation -> 6-10 weeks
4. Optimization Engine (depends on workload computation output) -> 6-10 weeks (partially overlaps with #3)
5. Frontend (depends on working API) -> 8-12 weeks (partially overlaps with #3 and #4)

**Critical path duration: approximately 16-24 weeks with a team of 3.**

The optimization engine is the single highest-risk item. If HiGHS WASM does not fit within Edge Function memory constraints, the entire architecture must be redesigned around Fly.io workers as the primary solver runtime.
