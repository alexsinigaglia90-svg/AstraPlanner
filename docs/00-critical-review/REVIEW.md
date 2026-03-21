# AstraPlanner Knowledge Base — Critical Review

> Conducted: 2026-03-20
> Status: **31 documents reviewed. 3 critical contradictions, 12 gaps, 6 over-engineered areas identified.**

---

## Verdict

This knowledge base is an **excellent vision document** but an **insufficient implementation spec**. It tells a team *what* to build with impressive detail, but not *how*. More critically, it contains **three irreconcilable contradictions** that would halt an implementation team in week one.

---

## 1. Critical Contradictions (Must Fix Immediately)

### 1.1 Two Incompatible Tech Stacks

`system-overview.md` and `tech-stack.md` describe **fundamentally different platforms**:

| Concern | system-overview.md | tech-stack.md |
|---------|-------------------|---------------|
| Runtime | Python 3.12 + Kubernetes (EKS/GKE) | TypeScript + Supabase Edge Functions (Deno) |
| Event Bus | Apache Kafka / AWS EventBridge | Supabase Realtime |
| Time-Series DB | TimescaleDB / InfluxDB | Standard PostgreSQL |
| Graph DB | Neo4j / AWS Neptune | pgvector + relational tables |
| API Gateway | Kong | None (tRPC direct) |
| Observability | OpenTelemetry + Jaeger + ELK | Sentry + Vercel Analytics |
| Team Size | 15-20 engineers + DevOps | 3-5 engineers |

**Impact:** A developer reading both documents cannot know which system to build.

**Fix:** `system-overview.md` must be rewritten to align with the `tech-stack.md` Supabase-centric architecture. The Kubernetes/Kafka stack is a future-state vision, not the current design.

### 1.2 Forecasting Engine: Exists and Doesn't Exist

- `system-overview.md` §4.1 describes a built-in ML forecasting engine (ARIMA, Prophet, XGBoost, LightGBM, ensemble) as a **core Intelligence Layer component**.
- `gap-analysis.md` Gap 1 lists the forecasting engine as a **critical gap** requiring "3-4 months, 2 engineers" in V2.

**Impact:** Is demand forecasting in scope for MVP or not? This changes the product roadmap and the integration architecture (if external forecasts are required, the integration layer is load-bearing from day one).

**Fix:** Resolve to one truth. Recommendation: forecasting is a V2 feature. `system-overview.md` must mark it as planned, not built. MVP relies on external forecast ingestion.

### 1.3 Optimization Solver: Three Different Descriptions

| Document | Primary Solver | Fallback | Environment |
|----------|---------------|----------|-------------|
| tech-stack.md | HiGHS WASM | Python OR-Tools on Fly.io | Edge Function |
| system-overview.md | OR-Tools / Gurobi | Column generation | Kubernetes pods |
| optimization-strategy.md | HiGHS WASM | CP-SAT refinement | Not specified |

**Impact:** Gurobi costs $10,000+/year and cannot run in WASM. OR-Tools WASM is experimental. HiGHS WASM in a 256MB Edge Function cannot solve enterprise-scale MIP problems. These are three different architectures.

**Fix:** Standardize on HiGHS WASM for small/medium problems (< 500 variables) in Edge Functions, with a Node.js-native HiGHS fallback on Fly.io for large problems. Remove all Gurobi and Kubernetes references.

---

## 2. Gaps — Missing Documents

| # | Missing Document | Why It's Critical |
|---|-----------------|-------------------|
| G1 | **Database schema as SQL** | No `CREATE TABLE` statements, indexes, constraints, or triggers. Schema-as-prose is not buildable. |
| G2 | **tRPC procedure contracts** | Input/output schemas are pseudocode. No machine-readable API spec exists. |
| G3 | **Security threat model** | Platform stores employee PII, compensation, schedules. No STRIDE analysis, no attack surface mapping. |
| G4 | **Deployment & environment spec** | No env vars list, no Supabase project config, no IaC templates, no deployment scripts. |
| G5 | **Integration connector spec** | 12+ external systems listed. Zero have actual API field mappings or response schemas. |
| G6 | **Disaster recovery runbook** | RPO 5min / RTO 30min claimed but no failover procedure described for Supabase architecture. |
| G7 | **Data migration & seed data** | No tenant bootstrap spec. No industry benchmark data source. No seed templates. |
| G8 | **Test strategy** | No test pyramid, no integration test approach for RLS, no optimization solver test fixtures. |
| G9 | **GDPR compliance procedures** | Right-to-erasure across JSONB snapshots, audit logs, and plan versions is architecturally hard and undocumented. |
| G10 | **MVP scope definition** | No single document defines what ships in V1 vs V2 vs V3. Scattered across gap-analysis and various files. |
| G11 | **Prompt management system** | AI prompts are inline strings. No versioning, testing, or deployment pipeline for prompts. |
| G12 | **Cost model** | No projected infrastructure cost at each scale tier. scaling-risks.md has partial data but no unified cost model. |

---

## 3. Weak Assumptions

### 3.1 "Ruflo is a production framework"
Ruflo is referenced throughout as a multi-agent orchestration layer. It is listed in the tech stack decision matrix with alternatives considered. But Ruflo is an early-stage tool, not a battle-tested production framework. The entire multi-agent architecture depends on it. **Risk: High.**

**Fix:** Document Ruflo as experimental. Design the AI integration layer so multi-agent coordination is a progressive enhancement, not a hard dependency. Single-agent Claude calls must work for all critical paths.

### 3.2 "HiGHS WASM fits in Edge Functions for 90%+ of problems"
The 256MB memory cap and 60-second execution limit for Supabase Edge Functions are stated in the docs. But no benchmark validates that 90% of real workforce scheduling problems fit within these constraints. A 200-employee, 7-day, 15-process MIP problem can easily have 20,000+ variables and require > 256MB.

**Fix:** Add a concrete benchmark matrix: problem size → memory usage → solve time → fits in Edge Function (yes/no). Route to Fly.io worker earlier than currently planned.

### 3.3 "Claude's confidence scores are calibrated"
The system uses Claude's self-reported confidence (0-1) to drive UI treatment: > 0.9 = auto-accept, 0.7-0.9 = show with highlight, < 0.7 = require confirmation. But LLM confidence is not a calibrated probability. Claude frequently reports high confidence on wrong outputs.

**Fix:** Replace Claude's self-reported confidence with a heuristic confidence based on: (a) did the output pass schema validation, (b) are numeric values within plausible ranges, (c) do referenced entities exist. This is more reliable than asking the LLM "how sure are you?"

### 3.4 "RLS alone provides sufficient tenant isolation"
RLS is the only tenant isolation mechanism. No application-level query scoping, no integration tests that verify cross-tenant leakage, no runtime assertion layer. RLS misconfigurations are a known Supabase failure mode.

**Fix:** Add defense-in-depth: application-level tenant scoping in the tRPC middleware (already partially described), automated cross-tenant leakage tests in CI, and runtime assertions that query results contain only the expected `organization_id`.

### 3.5 "3-5 engineers can build and operate this"
The stack includes: Supabase Edge Functions, Fly.io workers, Upstash Redis, BullMQ, pgvector, pg_cron, pg_net, pgsodium, postgis, Vercel middleware, Supabase Realtime, WASM compilation, Service Workers, multi-region deployment. This requires at minimum a part-time DevOps/platform function.

**Fix:** Acknowledge that MVP requires 5-7 engineers including one with infrastructure/DevOps focus. Or reduce the stack complexity.

### 3.6 "Rate limits are compatible with real usage"
Backend docs specify 30 writes/minute per user. A planner drag-and-dropping assignments makes 1 mutation per action. Assigning one employee every 2 seconds hits the rate limit. This is a UX-breaking constraint.

**Fix:** Batch drag-and-drop mutations. Client accumulates changes for 2-3 seconds, sends as a single batch mutation. Rate limit should be on batch operations, not individual assignments.

---

## 4. Over-Engineering for MVP

| Area | What's Over-Engineered | Recommendation |
|------|----------------------|----------------|
| Monte Carlo simulation | 1000-iteration probabilistic scenarios with P10/P50/P90 | Defer to V2. MVP needs simple what-if (change one variable, see result). |
| Service Worker offline | Caching read-only views for offline use | Logistics planners are always online. Defer to V3. |
| 7-locale i18n at launch | next-intl with 7 supported locales | Launch with English only. Add i18n framework but don't translate until demand exists. |
| Storybook visual regression | Full component library with visual regression tests | Use Storybook for development but defer visual regression CI to post-MVP. |
| WCAG 2.1 AA on schedule grid | Full keyboard nav + screen reader for drag-and-drop grid | This is a 4-8 week effort alone. Achieve basic a11y; full compliance in V2. |
| Cell-level schema isolation | Per-module Postgres schemas with cross-schema views | Use single schema with naming conventions for MVP. Enforce module boundaries via lint. |
| Skill decay model | Proficiency degrades -1 level after 90 days of non-use | Interesting but unvalidated. Most logistics companies manually manage skill records. Defer. |
| Event sourcing for plans | Every plan state change is an immutable event | Use simple plan versioning (snapshot per version) for MVP. Event sourcing adds complexity without clear MVP value. |

---

## 5. Under-Defined Areas

### 5.1 The Optimization Module Has the Least Documentation
Paradoxically, the most novel and complex component — the optimization engine — has the least implementation detail. `algorithm-strategies.md` describes 5 solver strategies but doesn't specify which one is the MVP default. There are no test fixtures, no benchmark problems, no "here is a 50-employee problem and the expected output."

### 5.2 Integration Connectors Are Aspirational
12+ external systems are listed with high-level data flow descriptions. Zero have actual API specifications, field mappings, authentication flows, or error handling for real-world API quirks (pagination, rate limits, eventual consistency).

### 5.3 The Plan-Reality Feedback Loop Is the Core Value Prop — and Is "Not Started"
The highest-scored risk (R2.5, Plan-Reality Gap, score 9) has all mitigations marked "not started." The prerequisite (Time & Attendance integration, Gap 5) is also incomplete. The system's core differentiator — plans that adapt to reality — cannot be delivered until both are built. Neither is in the MVP scope.

### 5.4 Emergency/Reactive Planning Has No Implementation Path
`decision-hierarchy.md` defines Level 3 (Reactive) decisions with < 15 minute latency requirements. But no document describes the technical implementation: what triggers reactive re-planning, how fast the solver can run in reactive mode, what the UI looks like during an emergency, how notifications reach floor supervisors in real-time.

### 5.5 Multi-Site Workforce Sharing Is Hand-Waved
"Employees can be shared across sites under constraints" is stated repeatedly but the constraint model for cross-site sharing (travel time, home site preference, contract restrictions, union rules about site transfers) is not formalized. The optimizer treats this as a soft constraint but the business rules are complex and jurisdiction-specific.

---

## 6. Proposed Documentation Structure Updates

### New Documents to Create

```
/docs
  /00-critical-review
    REVIEW.md                    ← this document
  /01-philosophy
    (no changes)
  /02-system-architecture
    system-overview.md           ← REWRITE to align with tech-stack.md
    (rest unchanged)
  /03-setup-wizard
    (no changes)
  /04-data-model
    data-entities.md
    data-relationships.md
    multi-tenancy.md
    scalability-design.md
    schema.sql                   ← NEW: actual CREATE TABLE statements
  /05-optimization-engine
    optimization-strategy.md
    skill-matching.md
    constraint-handling.md
    algorithm-strategies.md
    benchmark-fixtures.md        ← NEW: test problems with expected outputs
  /06-ux-control-layer
    (no changes)
  /07-implementation
    tech-stack.md
    backend-architecture.md
    frontend-architecture.md
    ai-integration.md
    deployment-guide.md          ← NEW: env vars, Supabase config, IaC
    api-contracts.md             ← NEW: tRPC procedure reference
    prompt-management.md         ← NEW: prompt versioning and testing
  /08-risks-and-gaps
    risk-assessment.md
    edge-cases.md
    scaling-risks.md
    gap-analysis.md
    security-threat-model.md     ← NEW: STRIDE analysis, attack surfaces
    gdpr-compliance.md           ← NEW: data subject rights, erasure procedures
  /09-mvp-scope                  ← NEW SECTION
    mvp-definition.md            ← NEW: what ships in V1, hard scope boundary
    mvp-architecture.md          ← NEW: simplified arch for MVP only
    mvp-cost-model.md            ← NEW: projected infra costs at MVP scale
    build-sequence.md            ← NEW: what to build first, second, third
```

### Documents to Rewrite

| Document | Issue | Action |
|----------|-------|--------|
| `system-overview.md` | Describes Kubernetes/Kafka stack that contradicts tech-stack.md | Full rewrite to align with Supabase-centric architecture |
| `gap-analysis.md` | Forecasting engine is both a gap and a built feature | Resolve: it's a gap. Update all references. |
| `risk-assessment.md` | Missing risks for Ruflo, HiGHS WASM, tRPC+Deno compatibility | Add 3 new risks |
| `ai-integration.md` | Ruflo treated as production-ready | Add fallback architecture without Ruflo |

---

## 7. Recommended Immediate Actions

1. **Resolve the tech stack contradiction.** Pick one architecture. Rewrite `system-overview.md`.
2. **Define MVP scope explicitly.** Create `/09-mvp-scope/mvp-definition.md` with a hard boundary.
3. **Write `schema.sql`.** Convert data-entities.md into actual DDL. This forces decisions.
4. **Benchmark the optimizer.** Build 3 test problems (small/medium/large), run HiGHS WASM, measure memory and time. This validates or invalidates the Edge Function strategy.
5. **Validate Ruflo.** Confirm it can orchestrate multi-agent Claude calls in production. If not, design a simpler single-agent fallback.
6. **Write the security threat model.** This is a compliance blocker for enterprise sales.
