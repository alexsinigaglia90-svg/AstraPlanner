# Documentation Restructure Plan

> The current 60 documents across 12 sections are too many and too spread out. An engineering team needs a smaller, more focused set of docs.

Current state: 60 documents, 2.1 MB of text, 12 sections, zero code. An engineer starting the build would need to read 15-20 documents just to understand what to build and how. Many documents contradict each other. Some are aspirational (describing V3 features). Some are redundant (3 review documents covering the same ground).

Target state: ~25 essential documents organized by function (Spec, Guide, Reference), with contradictions resolved and a single source of truth for each architectural decision.

---

## Section 1: Documents to LOCK (Ready for Build)

These documents are strong enough to serve as implementation specs. They should be frozen during build -- changes only if a bug or contradiction is discovered.

| Document | Why It's Ready | Caveat |
|----------|---------------|--------|
| `09-mvp-scope/mvp-definition.md` | Clear scope boundary, testable success criteria, specific feature tables, explicit exclusions with rationale. Best document in the repo. | None. This is the canonical scope document. |
| `09-mvp-scope/build-sequence.md` | Well-structured phases with deliverables, dependencies, exit criteria, team allocation. Critical path correctly identified. | Time estimates are optimistic (see build-readiness.md). Do not treat the week numbers as commitments. |
| `07-implementation/backend-architecture.md` (Sections 2.2-2.6 only) | Module-level tRPC procedure signatures, database tables, domain concepts. Enough detail to start building routers. | Section 3 (schema organization) contradicts schema.sql. Procedure signatures are pseudocode, not typed contracts. |
| `04-data-model/data-entities.md` | 18 entities with full attribute tables and example records. Good domain reference. | Must be cross-referenced with schema.sql. Some entities in this doc are not in the schema. |
| `04-data-model/data-relationships.md` | ER diagram, cardinality table, relationship documentation. Useful for understanding how entities connect. | Treat as reference, not as the schema source of truth. |
| `05-optimization-engine/constraint-handling.md` | Hard/soft constraint catalog with specific examples. Jurisdiction profiles. Relaxation strategies. | Constraint relaxation order needs to be validated against actual solver behavior. |
| `01-philosophy/planning-principles.md` | 10 governing principles with rationale and failure modes. Useful for resolving design debates. | Does not need to be read by every engineer. Useful for the tech lead. |
| `01-philosophy/failure-modes.md` | 24 failure modes across 5 categories with mitigations. Good reference for edge case testing. | Same as above. |

**Total locked documents: 8**

---

## Section 2: Documents to CONSOLIDATE

### Merge 1: Three review documents -> one

**Current:** 3 documents covering overlapping ground
- `00-critical-review/REVIEW.md` -- Initial review summary
- `00-critical-review/REVIEW-FULL.md` -- Full review with 3 contradictions, 14 bugs, 6 legal issues, 19 gaps
- `00-critical-review/SYSTEMS-REVIEW.md` -- Systems-level critique with 7 broken handoffs, 5 new risks

**Problem:** An engineer does not know which review to read. REVIEW.md is a subset of REVIEW-FULL.md. SYSTEMS-REVIEW.md supersedes both but does not reference them. Some findings in REVIEW-FULL.md are not repeated in SYSTEMS-REVIEW.md.

**Merge into:** `00-critical-review/REVIEW-CONSOLIDATED.md`

Structure:
1. Architectural flaws (from SYSTEMS-REVIEW sections 1-2)
2. Schema bugs (from REVIEW-FULL, deduplicated against SYSTEMS-REVIEW)
3. Legal issues (from REVIEW-FULL section on legal)
4. Cross-document contradictions (from SYSTEMS-REVIEW section 8)
5. Prioritized fix list (from SYSTEMS-REVIEW section 6)

Delete REVIEW.md and REVIEW-FULL.md after merge. They are superseded.

### Merge 2: Four philosophy documents -> one

**Current:** 4 documents
- `01-philosophy/philosophy.md` -- Core beliefs, why logistics WFP is hard
- `01-philosophy/planning-principles.md` -- 10 governing principles (strong)
- `01-philosophy/decision-hierarchy.md` -- Strategic/tactical/operational/reactive levels
- `01-philosophy/failure-modes.md` -- 24 failure modes (strong)

**Problem:** An engineer needs to read 4 docs to understand the product philosophy. Only `planning-principles.md` and `failure-modes.md` contain actionable content. `philosophy.md` is motivational text. `decision-hierarchy.md` is a single-page concept that could be a section.

**Merge into:** `01-philosophy/PHILOSOPHY.md`

Structure:
1. Why this product exists (1 paragraph from philosophy.md)
2. Decision hierarchy (1 page from decision-hierarchy.md)
3. 10 planning principles with failure modes (merge planning-principles.md + failure-modes.md)

This cuts 4 files to 1 without losing actionable content.

### Merge 3: Eleven AI layer documents -> one

**Current:** 11 documents in `10-ai-layer/`
- ai-vision.md, ai-architecture.md, data-capture.md, learning-model.md, user-intelligence.md, organizational-intelligence.md, recommendation-engine.md, automation-layer.md, privacy-and-guardrails.md, explainability.md, ai-evolution-roadmap.md

**Problem:** These 11 documents describe an AI system that does not exist and will not be built until V2+ at the earliest. The MVP uses Claude for 3 simple features: wizard suggestions, natural language queries, and daily insights. Eleven documents for 3 features is massive over-documentation.

**Merge into:** `reference/AI-STRATEGY.md`

Structure:
1. MVP AI features (what Claude does in V1: wizard suggestions, NL queries, insights)
2. AI evolution roadmap summary (4 phases, 1 paragraph each)
3. AI guardrails (privacy, what AI may/may not learn -- from privacy-and-guardrails.md)
4. Prompt patterns (from ai-integration.md)

Everything else (user intelligence, organizational intelligence, recommendation engine, automation layers, explainability architecture, data capture pipelines, learning models) is deferred to V2+ and should not be in the active documentation set. Archive the 11 files into `archive/ai-layer-v2/`.

### Merge 4: Four data model documents -> two

**Current:** 5 documents
- data-entities.md, data-relationships.md, multi-tenancy.md, scalability-design.md, schema.sql

**Merge into:**
1. `spec/DATA-MODEL.md` -- Consolidated from data-entities.md + data-relationships.md + multi-tenancy.md (the logical model)
2. `spec/schema.sql` -- The physical schema (keep as-is after bug fixes)

Move scalability-design.md to `reference/` -- it describes V2+ partitioning strategies that are not relevant until the database exceeds 10GB.

### Merge 5: Four system architecture documents -> two

**Current:** 4 documents
- system-overview.md, module-breakdown.md, integration-architecture.md, event-architecture.md

**Merge into:**
1. `spec/ARCHITECTURE.md` -- System overview + module breakdown (the things being built now)
2. `reference/INTEGRATION-ARCHITECTURE.md` -- Integration and event architecture (deferred to V2)

### Merge 6: Three setup wizard documents -> one

**Current:** 3 documents
- wizard-flow.md, wizard-logic.md, wizard-ai-strategies.md

**Merge into:** `spec/WIZARD.md`

Structure:
1. MVP wizard flow (6 steps from mvp-definition.md, not the 8-step version)
2. Smart defaults and templates (from wizard-logic.md)
3. Basic AI suggestions (from wizard-ai-strategies.md, MVP-scoped only)

The 5 AI strategies document (wizard-ai-strategies.md) includes NL setup, document upload, interview mode, clone, and benchmark -- 4 of which are explicitly excluded from MVP. Include only the "basic AI suggestions" strategy.

### Merge 7: Six risk documents -> two

**Current:** 6 documents
- risk-assessment.md, edge-cases.md, scaling-risks.md, gap-analysis.md, security-threat-model.md, gdpr-compliance.md

**Merge into:**
1. `spec/SECURITY-AND-COMPLIANCE.md` -- security-threat-model.md + gdpr-compliance.md (needed for launch)
2. `reference/RISKS.md` -- risk-assessment.md + edge-cases.md + gap-analysis.md (reference during build)

Move scaling-risks.md to `reference/` -- scaling analysis for 10,000+ employees is not MVP-relevant.

---

## Section 3: Documents to REWRITE

### 1. `02-system-architecture/system-overview.md`

**Problem:** This document was rewritten once (per INDEX.md) but still contradicts tech-stack.md and backend-architecture.md.

Specific contradictions:
- Uses `tenant_id` while schema.sql uses `organization_id`
- Describes RLS via `auth.jwt() ->> 'tenant_id'` while backend-architecture.md uses `current_setting('app.tenant_id')`
- References a three-layer architecture that does not match the module structure in backend-architecture.md
- Claims SSO/SAML at launch but mvp-definition.md says email/password only for MVP

**What the rewrite should do:** Make system-overview.md a 2-page executive summary that references (not duplicates) the canonical documents. It should answer: "What is AstraPlanner's architecture in 5 minutes?" and link to tech-stack.md, backend-architecture.md, and schema.sql for details.

### 2. `05-optimization-engine/algorithm-strategies.md`

**Problem:** Contains fabricated benchmarks. The SYSTEMS-REVIEW (section 5) flags the GA/SA solver strategies as "academic complexity, broken encoding." The benchmark numbers (solve times, solution quality comparisons) cannot be real because no solver code exists.

Specific issues:
- Benchmark table comparing Greedy, CP, MIP, GA/SA, Hybrid -- none of these have been implemented
- Chromosome encoding for GA is described in detail but has known bugs (SYSTEMS-REVIEW item A2)
- CP-SAT, GA/SA, and Hybrid strategies are out of MVP scope (only Greedy + HiGHS MIP per mvp-definition.md)

**What the rewrite should do:** Reduce to two strategies: (1) Greedy heuristic (TypeScript, < 1s, for interactive use), (2) HiGHS MIP (WASM or Fly.io, < 60s, for full optimization). Remove all fabricated benchmarks. Add actual benchmarks after Phase 3 spike.

### 3. `04-data-model/schema.sql`

**Problem:** 10+ bugs identified across SYSTEMS-REVIEW and this audit (see build-readiness.md Section 1 for full list).

**What the rewrite should address:**
- Add missing entities: employee_leave/availability_override, approval_record
- Fix demand_forecast to use timestamptz range instead of DATE
- Add overlap-preventing exclusion constraint on shift_assignment
- Add last_practiced_date to employee_skill
- Add missing extensions (pgvector, pgsodium, pgaudit, pg_cron)
- Add RLS policies for all tables
- Add pgsodium encryption for PII columns
- Resolve organization_id naming consistently
- Add covering indexes identified in SYSTEMS-REVIEW (heatmap tooltip index)

### 4. `07-implementation/tech-stack.md` (Sections 4, 5)

**Problem:** The AI Layer (Section 4) and Optimization Layer (Section 5) sections describe V2+ features as if they are MVP.

Specific contradictions with mvp-definition.md:
- Lists 7 supported locales at launch; MVP is English only
- Describes Monte Carlo as TypeScript-native with < 2s target; MVP defers Monte Carlo
- Describes Service Worker offline caching; MVP defers to V3+
- Lists dual embedding providers (Voyage AI + OpenAI); MVP does not use embeddings
- Describes Ruflo multi-agent orchestration; MVP defers to V2

**What the rewrite should do:** Add a clear "MVP vs Future" label to every technology. Remove or clearly mark V2+ features.

---

## Section 4: Documents to DEFER

These documents describe features that are not built until later phases. They should be moved to an `archive/` or `future/` directory to reduce noise during active build.

### Defer until V2 (Month 4+)

| Document | Why Defer |
|----------|----------|
| `10-ai-layer/ai-vision.md` | AI intelligence layer is V2+ |
| `10-ai-layer/ai-architecture.md` | Three-plane AI architecture not built in MVP |
| `10-ai-layer/data-capture.md` | Event capture pipeline not built in MVP |
| `10-ai-layer/learning-model.md` | ML learning mechanisms not built in MVP |
| `10-ai-layer/user-intelligence.md` | Per-user cognitive model not built in MVP |
| `10-ai-layer/organizational-intelligence.md` | Cross-site benchmarking not built in MVP |
| `10-ai-layer/recommendation-engine.md` | 13-type recommendation engine not built in MVP |
| `10-ai-layer/automation-layer.md` | L0-L4 automation spectrum not built in MVP |
| `10-ai-layer/privacy-and-guardrails.md` | Relevant content merged into AI-STRATEGY.md; rest is V2 |
| `10-ai-layer/explainability.md` | 3-level explanation architecture not built in MVP |
| `10-ai-layer/ai-evolution-roadmap.md` | 4-phase AI journey is strategic planning, not build spec |
| `02-system-architecture/integration-architecture.md` | ERP/WMS/TMS/HRIS connectors are V2 |
| `02-system-architecture/event-architecture.md` | Event bus, CQRS, sagas are V2 architectural patterns |
| `04-data-model/scalability-design.md` | Partitioning, sharding not needed until 10GB+ |
| `08-risks-and-gaps/scaling-risks.md` | Scaling analysis for 10K+ employees is V2+ concern |

### Defer until Phase 6+ (Week 19+)

| Document | Why Defer |
|----------|----------|
| `06-ux-control-layer/scenario-simulation.md` | Monte Carlo simulation deferred from MVP; simple what-if is Phase 6 |

### Keep as reference but do not treat as build spec

| Document | Why Reference Only |
|----------|-------------------|
| `05-optimization-engine/skill-matching.md` | Good domain knowledge but implementation is in constraint-handling.md |
| `05-optimization-engine/optimization-strategy.md` | Demand-to-FTE pipeline description; useful context but formulas are in mvp-definition.md |
| `06-ux-control-layer/ux-concepts.md` | UX philosophy, personas; useful for design decisions but not a build spec |
| `06-ux-control-layer/planning-adjustments.md` | Manual adjustment patterns; useful reference during Phase 4 |
| `08-risks-and-gaps/risk-assessment.md` | 19 risks; useful to review periodically but not a daily build reference |
| `08-risks-and-gaps/edge-cases.md` | 28 edge cases; useful during Phase 7 (hardening) |
| `08-risks-and-gaps/gap-analysis.md` | MVP vs V2 vs V3 feature gaps; useful for roadmap decisions |

---

## Section 5: Documents to CREATE

These documents do not exist but are needed before or during Week 1 of build.

### 1. DECISIONS.md

**Purpose:** Single file capturing all architectural decisions. Resolves the contradictions between existing documents.

**Content:**
- Decision 1: RLS approach (JWT claims vs session variables vs custom function) -- chosen approach, rationale, rejected alternatives
- Decision 2: Schema organization (flat public vs per-module schemas) -- chosen approach, rationale
- Decision 3: Naming convention (organization_id vs tenant_id) -- chosen name, where it appears
- Decision 4: Solver deployment (Edge Function WASM vs Fly.io only vs validate-first) -- chosen approach
- Decision 5: API architecture (tRPC on Edge Functions vs Vercel serverless) -- chosen approach
- Decision 6: State management stores -- initial store list with rationale
- Decision 7: Realtime strategy -- which data uses Realtime vs polling
- Each decision: date, decider, options considered, chosen option, rationale, risks accepted

**Format:** ADR (Architecture Decision Record) format. Each decision is numbered and immutable once made. New decisions are appended, not edited.

### 2. API_CONTRACTS.md

**Purpose:** Typed tRPC procedure definitions with Zod input schemas and output types. The bridge between backend-architecture.md pseudocode and actual implementation.

**Content:**
- For each MVP-relevant module (demand, workload, workforce, optimization, planning, wizard): full procedure list with Zod input schemas and TypeScript output types
- Shared types (Pagination, DateRange, SortOrder)
- Error types per module
- Middleware chain specification

This should be auto-generated from code once the tRPC routers exist. Until then, it must be hand-written.

### 3. SOLVER_CONTRACT.md

**Purpose:** TypeScript interfaces for solver input and output. The contract between the workload module (which produces inputs) and the planning module (which consumes outputs).

**Content:**
- `SolverInput` interface (based on SYSTEMS-REVIEW section 2.2 draft)
- `SolverOutput` interface
- `Constraint` type hierarchy (hard/soft, categories)
- `ObjectiveWeights` configuration
- Problem size estimation formula (how to predict solve time from input size)
- Solver routing logic (when to use greedy vs WASM vs Fly.io)

### 4. ENV_TEMPLATE.md

**Purpose:** Complete list of environment variables needed to run AstraPlanner locally and in production.

**Content:**
```
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DB_URL=

# Vercel
VERCEL_URL=

# Auth
SUPABASE_JWT_SECRET=
NEXTAUTH_SECRET=  (if using NextAuth adapter)

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# AI
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL_DEFAULT=claude-sonnet-4-20250514

# Monitoring
SENTRY_DSN=
SENTRY_AUTH_TOKEN=
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=

# Email
RESEND_API_KEY=

# Fly.io (for solver workers)
FLY_API_TOKEN=
FLY_APP_NAME=

# Stripe (billing)
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Feature flags
FEATURE_AI_SUGGESTIONS=true
FEATURE_SOLVER_WASM=false  # until validated
```

Each variable: required vs optional, which environments need it, where to obtain it, example value format.

### 5. SETUP_GUIDE.md

**Purpose:** Step-by-step instructions to set up the development environment from scratch. An engineer joining on Week 2 should be productive within 4 hours.

**Content:**
1. Prerequisites (Node.js version, Supabase CLI, Docker for local Supabase)
2. Clone and install
3. Supabase local setup (`supabase start`, apply migrations, seed data)
4. Environment variable setup (reference ENV_TEMPLATE.md)
5. Run the app locally
6. Run tests
7. Deploy to staging (Vercel preview)
8. Common issues and fixes

---

## Section 6: Proposed Restructured Index

### New directory structure

```
docs/
  spec/                     # What to build (frozen during development)
    mvp-definition.md         # Scope boundary (LOCKED)
    build-sequence.md         # Phased plan (LOCKED, estimates advisory)
    ARCHITECTURE.md           # System overview + module breakdown (REWRITTEN)
    DATA-MODEL.md             # Entities + relationships + multi-tenancy (CONSOLIDATED)
    schema.sql                # Physical schema (REWRITTEN, bug-fixed)
    BACKEND.md                # Backend architecture (LOCKED, sections 2-6)
    FRONTEND.md               # Frontend architecture (from current frontend-architecture.md)
    WIZARD.md                 # Setup wizard spec (CONSOLIDATED from 3 docs)
    CONSTRAINTS.md            # Hard/soft constraint catalog (LOCKED)
    SECURITY-AND-COMPLIANCE.md # Threat model + GDPR (CONSOLIDATED from 2 docs)

  guide/                    # How to build it (created during Week 1)
    DECISIONS.md              # Architectural decisions (NEW)
    SETUP_GUIDE.md            # Dev environment setup (NEW)
    ENV_TEMPLATE.md           # Environment variables (NEW)
    API_CONTRACTS.md          # tRPC procedure types (NEW)
    SOLVER_CONTRACT.md        # Solver I/O interfaces (NEW)

  reference/                # Domain knowledge (read when needed)
    PHILOSOPHY.md             # Principles + failure modes (CONSOLIDATED from 4 docs)
    TECH-STACK.md             # Technology decisions (LOCKED, V2 features marked)
    RISKS.md                  # Risk assessment + edge cases + gaps (CONSOLIDATED from 3 docs)
    OPTIMIZATION-STRATEGY.md  # Demand-to-FTE pipeline (from current doc)
    SKILL-MATCHING.md         # Proficiency model (from current doc)
    UX-CONCEPTS.md            # Personas + IA (from current doc)
    CONTROL-ROOM.md           # Dashboard layout (from current doc)
    AI-STRATEGY.md            # MVP AI features + V2 roadmap (CONSOLIDATED from 11 docs)
    ALGORITHM-STRATEGIES.md   # Greedy + MIP only (REWRITTEN, benchmarks removed)

  review/                   # Audit trail (historical, not active build docs)
    REVIEW-CONSOLIDATED.md    # All review findings (CONSOLIDATED from 3 docs)
    build-readiness.md        # This audit's readiness assessment
    documentation-restructure.md # This file

  archive/                  # Deferred docs (not needed during MVP build)
    ai-layer-v2/              # All 11 AI layer docs
    integration-v2/           # Integration architecture, event architecture
    scaling-v2/               # Scalability design, scaling risks
    simulation-v2/            # Scenario simulation (Monte Carlo)

  audit/                    # Previous audit results (keep as historical record)
    executive-verdict.md
    scorecard.md
    structural-weaknesses.md
    enterprise-gaps.md
    remediation-roadmap.md
    architecture-gap-map.md
    wizard-gap-analysis.md
    data-model-gap-analysis.md
    planning-engine-gap-analysis.md
```

### Restructured INDEX.md

```markdown
# AstraPlanner Build Documentation

> AI-Driven Workforce Planning Platform for Logistics
> 25 active documents | Restructured for build readiness

## Start Here
1. [MVP Definition](spec/mvp-definition.md) -- What we are building (scope boundary)
2. [Build Sequence](spec/build-sequence.md) -- When we build each piece (24-week plan)
3. [Decisions](guide/DECISIONS.md) -- Architectural decisions (resolve contradictions)
4. [Setup Guide](guide/SETUP_GUIDE.md) -- Get your dev environment running

## Spec (What to Build)
| Document | Purpose |
|----------|---------|
| [MVP Definition](spec/mvp-definition.md) | Hard scope boundary: 11 features in, 14 out |
| [Build Sequence](spec/build-sequence.md) | 9 phases, dependencies, exit criteria |
| [Architecture](spec/ARCHITECTURE.md) | System layers, module breakdown |
| [Data Model](spec/DATA-MODEL.md) | Entities, relationships, multi-tenancy |
| [Schema](spec/schema.sql) | PostgreSQL DDL (executable) |
| [Backend](spec/BACKEND.md) | Modules, tRPC, RLS, jobs, caching |
| [Frontend](spec/FRONTEND.md) | App Router, state, components |
| [Wizard](spec/WIZARD.md) | 6-step onboarding flow |
| [Constraints](spec/CONSTRAINTS.md) | Hard/soft constraint catalog |
| [Security](spec/SECURITY-AND-COMPLIANCE.md) | Threat model, GDPR, controls |

## Guide (How to Build It)
| Document | Purpose |
|----------|---------|
| [Decisions](guide/DECISIONS.md) | 7 architectural decision records |
| [Setup Guide](guide/SETUP_GUIDE.md) | Dev environment from scratch |
| [Env Template](guide/ENV_TEMPLATE.md) | All environment variables |
| [API Contracts](guide/API_CONTRACTS.md) | tRPC procedures with types |
| [Solver Contract](guide/SOLVER_CONTRACT.md) | Optimizer input/output interfaces |

## Reference (Domain Knowledge)
| Document | When to Read |
|----------|-------------|
| [Philosophy](reference/PHILOSOPHY.md) | Design debates, "why" questions |
| [Tech Stack](reference/TECH-STACK.md) | Technology selection rationale |
| [Risks](reference/RISKS.md) | Risk review, edge case testing |
| [Optimization Strategy](reference/OPTIMIZATION-STRATEGY.md) | Demand-to-FTE math |
| [Skill Matching](reference/SKILL-MATCHING.md) | Proficiency model |
| [UX Concepts](reference/UX-CONCEPTS.md) | Personas, information architecture |
| [Control Room](reference/CONTROL-ROOM.md) | Dashboard layout spec |
| [AI Strategy](reference/AI-STRATEGY.md) | MVP AI features, V2 roadmap |
| [Algorithm Strategies](reference/ALGORITHM-STRATEGIES.md) | Greedy + MIP approach |

## Review (Historical Audit)
| Document | Purpose |
|----------|---------|
| [Consolidated Review](review/REVIEW-CONSOLIDATED.md) | All findings from 3 review rounds |
| [Build Readiness](review/build-readiness.md) | Can we build from these docs? |
| [Restructure Plan](review/documentation-restructure.md) | This document |
```

### Document count comparison

| Category | Before | After | Reduction |
|----------|--------|-------|-----------|
| Critical review | 3 | 1 | -2 |
| Philosophy | 4 | 1 | -3 |
| System architecture | 4 | 1 active + 2 archived | -3 active |
| Setup wizard | 3 | 1 | -2 |
| Data model | 5 | 2 active + 1 archived | -3 active |
| Optimization engine | 4 | 3 | -1 |
| UX / Control layer | 4 | 2 active + 1 archived + 1 deferred | -2 active |
| Implementation | 4 | 3 | -1 |
| Risks & gaps | 6 | 2 active + 2 archived | -4 active |
| MVP scope | 2 | 2 | 0 |
| AI layer | 11 | 1 active + 11 archived | -10 active |
| Audit | 9 | 9 (keep as historical) | 0 |
| New (guide/) | 0 | 5 | +5 |
| **Total active** | **59** | **25** | **-34** |

### Migration steps

1. **Week 0, Day 1:** Create directory structure (`spec/`, `guide/`, `reference/`, `review/`, `archive/`)
2. **Week 0, Day 1:** Move the 15 deferred documents to `archive/`
3. **Week 0, Day 2:** Consolidate review docs (3 -> 1)
4. **Week 0, Day 2:** Consolidate philosophy docs (4 -> 1)
5. **Week 0, Day 3:** Create DECISIONS.md with the 7 decision gates (team discussion required)
6. **Week 0, Day 3:** Create ENV_TEMPLATE.md (can be done by any engineer)
7. **Week 0, Day 4:** Fix schema.sql bugs (see build-readiness.md for full list)
8. **Week 0, Day 5:** Create SETUP_GUIDE.md (once the project scaffold exists)
9. **Week 1:** Create API_CONTRACTS.md and SOLVER_CONTRACT.md (requires decision gate outcomes)
10. **Ongoing:** Consolidate remaining merges (wizard docs, risk docs, AI layer) as time permits

The goal is not to spend weeks reorganizing docs. The goal is to spend 2-3 days making the docs usable, then start building. The consolidation merges (steps 2-4) are the highest priority. The new documents (steps 5-9) are created as the team makes decisions.
