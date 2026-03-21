# Phase Plan: Invariants → Implementation

This document maps the path from validated invariants to shipped product.

---

## Phase 0: Invariant Lock (Week 0 — Before Build)

**Goal:** Resolve all open questions in invariants so engineering can start with confidence.

| Decision | Options | Recommendation | Blocker If Unresolved |
|----------|---------|---------------|----------------------|
| RLS mechanism | JWT claims vs session vars vs helper function | JWT claims via `auth.organization_id()` (schema.sql approach) | Every table's security policy |
| Naming | `tenant_id` vs `organization_id` | `organization_id` (matches schema.sql) | Every query, every join |
| Schema structure | Flat `public` vs per-module schemas | Flat `public` for MVP, module prefixes via naming convention | Migration structure, cross-module queries |
| Time model | `forecast_date` (date) vs `period_start/end` (timestamptz) | `period_start/period_end` (timestamptz) — fixes sub-daily planning bug | Demand ingestion, workload computation |
| Proficiency scale | Fixed 5 levels vs org-configurable | Org-configurable with 5-level default | Skill matching, productivity calculation |
| Workload granularity | Per-day vs per-shift vs per-time-slot | Per-shift (balances accuracy and complexity for MVP) | FTE calculation, assignment optimization |
| Solver boundary | Edge Function WASM vs always Fly.io | Attempt WASM first; benchmark in Week 9; Fly.io fallback ready | Optimization architecture |

**Exit criteria:** All 7 decisions documented in a DECISIONS.md file. Schema.sql updated to reflect decisions. Zero open invariant questions.

---

## Phase 1: Foundation + Core Planning (Weeks 1-12)

**Build the invariant pipeline end-to-end: demand → workload → FTE → assignment.**

### Weeks 1-2: Scaffold
- Initialize Next.js + Supabase
- Execute corrected schema.sql
- Auth + RLS + first tRPC router
- CI/CD pipeline

### Weeks 3-5: Data Core
- Site, Process, Employee, Skill CRUD
- CSV import engine
- Employee availability (template + override)

### Weeks 6-8: Demand + Workload
- Demand ingestion (CSV + API)
- Workload computation engine (the invariant formula)
- FTE calculation with shift-level granularity

### Weeks 9-12: Optimization
- HiGHS WASM integration (go/no-go in Week 9)
- Greedy heuristic for interactive use
- Solver contract implementation (typed I/O)
- Plan generation pipeline
- Plan state machine

**What is NOT in Phase 1:**
- No AI features beyond basic Claude suggestions
- No Monte Carlo, GA, SA, or column generation
- No cross-site optimization
- No event sourcing
- No configurable widget dashboards
- No offline mode

---

## Phase 2: UX + Onboarding (Weeks 13-20)

**Make it usable by real planners.**

### Weeks 13-15: Planning UX
- Process View (one scheduling view, not three)
- Drag-and-drop with constraint validation
- Coverage heatmap
- Basic KPI cards

### Weeks 16-18: Setup Wizard
- 5-step wizard (org → sites → processes → employees → rules)
- Smart defaults (static, expert-curated — no fleet learning)
- Basic Claude suggestions (entity extraction only)

### Weeks 19-20: Polish
- Simple scenario simulation (single-variable what-if)
- Approval workflow (4-state machine)
- Email + in-app notifications
- Basic reporting

---

## Phase 3: Hardening + Launch (Weeks 21-24)

- Security audit (RLS penetration test)
- Performance testing (50 concurrent users)
- Edge case handling
- Beta testing with real users
- Monitoring + runbook

---

## Phase 4: Enhanced Intelligence (Months 7-12)

**Only after Phase 1-3 are validated with real users.**

- Recommendation engine (staffing suggestions)
- Absence prediction (ML on accumulated data)
- User behavior tracking infrastructure
- T&A integration
- Employee schedule view (web portal)
- Multi-language (i18n)

---

## Phase 5: Autonomous Planning (Year 2+)

**Only after Phase 4 models are validated.**

- Earned autonomy (L2/L3 automation)
- Cross-site optimization
- Monte Carlo simulation
- Union/CBA rule engine
- Advanced analytics
- Full AI evolution (L4 autonomy for routine decisions)

---

## The Rule

**No phase may begin its unique work until the previous phase's exit criteria are met.**

The invariants (Phase 0) are the foundation. If they're wrong, every phase built on top is wrong. Lock them first.
