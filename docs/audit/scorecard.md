# AstraPlanner Architecture Scorecard

> Audit Date: 2026-03-20
> Target: "An ultra-scalable, enterprise-grade, AI-driven workforce planning platform for warehouse and logistics environments."
> Scoring Principle: A repository with zero implementation code cannot score above 3.0 on any implementation-dependent dimension, regardless of documentation quality. Vision and domain modeling dimensions are scored on documentation merit.

---

## Scoring Summary

| # | Dimension | Score | Weight | Weighted |
|---|-----------|-------|--------|----------|
| 1 | Product Vision Alignment | 6.0 | 0.04 | 0.24 |
| 2 | Workforce Planning Domain Fit | 7.5 | 0.04 | 0.30 |
| 3 | Warehouse / Logistics Relevance | 8.0 | 0.04 | 0.32 |
| 4 | Enterprise Readiness | 0.0 | 0.07 | 0.00 |
| 5 | Multi-site / Multi-tenant Scalability | 1.0 | 0.06 | 0.06 |
| 6 | Setup Wizard Readiness | 0.5 | 0.05 | 0.025 |
| 7 | Demand Planning Readiness | 0.5 | 0.06 | 0.03 |
| 8 | Workload / FTE Calculation Readiness | 0.5 | 0.06 | 0.03 |
| 9 | Workforce Data Model Readiness | 1.5 | 0.06 | 0.09 |
| 10 | Skills / Proficiency Modeling Readiness | 1.0 | 0.04 | 0.04 |
| 11 | Scheduling / Shift Logic Readiness | 0.5 | 0.06 | 0.03 |
| 12 | Optimization Engine Readiness | 0.5 | 0.07 | 0.035 |
| 13 | UX / Control Room Readiness | 0.5 | 0.05 | 0.025 |
| 14 | Extensibility / Modularity | 1.0 | 0.04 | 0.04 |
| 15 | Database / Data Architecture Maturity | 1.5 | 0.06 | 0.09 |
| 16 | Codebase Structure Quality | 0.0 | 0.05 | 0.00 |
| 17 | Maintainability | 0.0 | 0.04 | 0.00 |
| 18 | Autonomy / AI-readiness | 0.5 | 0.04 | 0.02 |
| 19 | Reliability / Safety for Enterprise Use | 0.0 | 0.04 | 0.00 |
| 20 | Overall Strategic Product Strength | 2.0 | 0.03 | 0.06 |
|   | **WEIGHTED AVERAGE** | | **1.00** | **1.445** |

**Overall Score: 1.4 / 10**

---

## Detailed Dimension Analysis

### 1. Product Vision Alignment — 6.0 / 10

**Rationale:** The vision documents are strong. The philosophy section articulates why logistics workforce planning is hard, why existing tools fail, and how AI-driven optimization creates value. The 10 planning principles are well-reasoned. The decision hierarchy (strategic/tactical/operational/reactive) maps to real planning cadences.

**What's genuinely strong:** The failure modes document. 24 failure modes with severity, likelihood, and mitigations — this reflects genuine domain experience. The automation spectrum (5 levels from manual to autonomous) is a thoughtful framework for progressive AI adoption.

**What's missing:** Any evidence that the vision has been validated. No user research. No customer interviews. No competitive analysis against Quinyx, Legion, Shiftboard, or Blue Yonder. No pricing model. No go-to-market thinking.

**What's misleading:** The vision is described as a "platform" throughout. It is a document. A vision without execution is a wish.

**Why not higher:** Vision without implementation gets capped at 6. The vision also contains internal contradictions (two tech stacks, three solver architectures) that the project's own reviewers flagged. A coherent vision would score 7-8. A contradictory vision scores lower.

---

### 2. Workforce Planning Domain Fit — 7.5 / 10

**Rationale:** The domain model reflects genuine workforce planning knowledge. The demand-to-FTE pipeline (demand volume / UPH = hours, hours / available hours per FTE = headcount) is correct. The constraint catalog includes real-world constraints: min rest between shifts, max consecutive days, overtime thresholds, certification requirements, union seniority. The process categorization (inbound/outbound/value-added/support/returns) maps to real warehouse operations.

**What's genuinely strong:** The skill adjacency matrix concept — "if someone can do Pick, they can likely do Pack at 80% efficiency" — is a sophisticated workforce planning concept that most competing tools handle poorly. The demand type taxonomy (WMS import, OMS import, CSV upload, AI forecast, manual entry) reflects real data source diversity.

**What's missing:** Validation against a real warehouse. No case study. No benchmark data from an actual operation. The domain model is informed but untested. The internal review found that the proficiency scale is silently mismatched between components (4-level vs 5-level), which suggests the domain model was designed in isolation, not extracted from real usage.

**What's misleading:** Nothing. The domain modeling is the strongest aspect of this project.

---

### 3. Warehouse / Logistics Relevance — 8.0 / 10

**Rationale:** The highest score in this audit, and deserved. The documentation demonstrates specific logistics knowledge: UPH (units per hour) as the core productivity metric, indirect time calculations, fatigue factors, hazardous zone certifications, peak season demand patterns, cross-dock operations, returns processing as a distinct workflow. These are not generic HR scheduling concepts dressed up for logistics.

**What's genuinely strong:** The process entity with `pieces_per_shift` (PPS) sources (engineered, historical, AI-estimated, manual) shows understanding of how warehouses actually measure productivity. The demand granularity options (15-min to monthly) reflect real planning cadences. The site types (warehouse, distribution center, fulfillment center, cross-dock, store, manufacturing) are correct taxonomy.

**What's missing:** Real-world validation. A single pilot warehouse would have exposed that sub-daily demand granularity cannot be stored in the current data model (the SYSTEMS-REVIEW already found this).

**What's misleading:** Nothing material.

---

### 4. Enterprise Readiness — 0.0 / 10

**Rationale:** Enterprise readiness requires: authentication, authorization, audit logging, deployment, monitoring, SLAs, disaster recovery, compliance certifications, security hardening, performance testing, load testing, penetration testing, SOC 2 compliance, and operational runbooks. This repository has none of these. Not "some of these are incomplete." None of them exist.

**What's genuinely strong:** Nothing. Documentation about enterprise features is not enterprise readiness. The security threat model document exists but describes threats to a system that does not exist.

**What's missing:** Everything. Authentication (Supabase Auth is specified but not configured). Authorization (RLS policies are in schema.sql but never executed). Audit logging (entity defined in schema but no code writes to it). Deployment (zero configuration). Monitoring (zero tooling). DR (RPO 5min / RTO 30min are claimed with no mechanism to achieve them).

**What's misleading:** The GDPR compliance document describes data handling procedures for a system that stores no data. The security threat model analyzes attack surfaces on a system with no attack surface because it does not run.

---

### 5. Multi-site / Multi-tenant Scalability — 1.0 / 10

**Rationale:** The multi-tenancy document is well-written. It describes shared-database with RLS, tenant provisioning, and isolation guarantees. The scalability document provides volume estimates at different tiers (100, 1000, 10000 employees). The 1 point is for the documentation quality alone.

**What's genuinely strong:** The scalability document's honesty about limits — acknowledging that HiGHS WASM in Edge Functions has memory constraints, that materialized views need tenant filtering, that query costs scale non-linearly.

**What's missing:** A database. RLS policies exist in SQL but have never been tested. The SYSTEMS-REVIEW found that materialized views bypass RLS entirely — a data leakage bug that exists in the unexecuted schema. Cross-tenant isolation has never been validated. Multi-site workforce sharing constraints are "hand-waved" (the project's own words).

**What's misleading:** The schema.sql header says "Paste this entire file into the Supabase SQL Editor and execute." This implies a functioning multi-tenant database is one paste away. The schema has 14 documented bugs that would cause runtime failures.

---

### 6. Setup Wizard Readiness — 0.5 / 10

**Rationale:** The wizard is documented across three files: wizard-flow.md (8 phases with screens, inputs, validation, time estimates), wizard-logic.md (adaptive intelligence, smart defaults, templates, branching logic), and wizard-ai-strategies.md (5 AI-assisted setup strategies including natural language setup and document upload). Zero UI components, zero form logic, zero validation code, zero AI prompts implemented.

**What's genuinely strong:** The progressive disclosure design — the wizard adapts based on org complexity, skipping phases that don't apply. This is good UX thinking.

**What's missing:** The wizard. All of it. Every screen, every form field, every validation rule, every default value, every template, every AI strategy.

**What's misleading:** The documentation reads like a product spec for a built feature. It is a design spec for an unbuilt feature.

---

### 7. Demand Planning Readiness — 0.5 / 10

**Rationale:** The demand pipeline is documented: ingest demand forecasts from external sources (WMS, OMS, CSV, manual), store in DemandForecast entity, map demand types to processes, calculate workload hours. The internal review found that the DemandForecast entity cannot store sub-daily granularity despite the wizard offering 15-minute intervals. Zero ingestion code exists.

**What's genuinely strong:** The demand source taxonomy is realistic. The mapping from demand types to processes (many-to-many with conversion factors) is a correct domain model.

**What's missing:** Any data pipeline. No CSV parser. No WMS connector. No API endpoint for forecast ingestion. No data validation. No duplicate detection. No time-zone handling.

**What's misleading:** The forecasting engine contradiction — system-overview.md describes built-in ML forecasting (ARIMA, Prophet, XGBoost) while gap-analysis.md lists it as a V2 feature requiring 3-4 months. The project's own review flagged this but the contradiction persists in the docs.

---

### 8. Workload / FTE Calculation Readiness — 0.5 / 10

**Rationale:** The optimization strategy document provides the core formulas: `required_hours = demand_volume / weighted_uph`, `fte_required = required_hours / available_hours_per_fte`, with adjustments for indirect time, fatigue, training overhead, and absenteeism. The formulas are correct. Zero computation code exists.

**What's genuinely strong:** The formula set is complete and includes real-world adjustments (indirect time ratio, fatigue factor, training overhead) that naive implementations miss.

**What's missing:** Any code that executes these formulas. The SYSTEMS-REVIEW found that `WorkloadPlan` uses a single daily `weighted_uph` but morning/evening shifts have 40% different productivity rates — making the core calculation wrong by shift. This design bug has not been fixed because there is no code to fix.

**What's misleading:** The precision of the formulas implies a level of engineering rigor that does not extend to implementation.

---

### 9. Workforce Data Model Readiness — 1.5 / 10

**Rationale:** schema.sql exists and contains ~70+ enum types, 18+ tables, RLS policies, triggers, and indexes. This is more than documentation — it is executable DDL. The extra 0.5 points (above the 1.0 floor for pure documentation) reflect the schema's existence as a structured artifact. However, it has never been executed and contains 14 documented bugs.

**What's genuinely strong:** The schema is comprehensive. Enum types for contract types, demand sources, assignment statuses, and labor rule types reflect real domain complexity. The trigger for `updated_at` timestamps is correct.

**What's missing:** Execution. Bug fixes. The 14 documented bugs include: missing `last_practiced_date` for skill decay, no absence/leave entity, overlapping shift assignments not prevented, materialized views leaking cross-tenant data, proficiency scale mismatch between org config and optimizer assumptions, sub-daily demand granularity not storable.

**What's misleading:** The schema header says it's ready to paste and execute. It is not. Executing it would create a database with known data integrity bugs and a cross-tenant data leakage vector.

---

### 10. Skills / Proficiency Modeling Readiness — 1.0 / 10

**Rationale:** The skill-matching document describes a 5-level proficiency model (Trainee through Expert) with productivity multipliers, an adjacency matrix for skill transferability, and a decay model for skill degradation over time. Sophisticated design. Zero implementation.

**What's genuinely strong:** The adjacency matrix concept. The decay model (proficiency degrades after 90 days of non-use) is operationally valid for warehouses with seasonal workers.

**What's missing:** The `last_practiced_date` field required for skill decay does not exist in the schema. The proficiency scale is hardcoded as 5-level in the optimizer docs but the wizard allows organizations to choose 4 levels. No matching algorithm code exists. No adjacency matrix data structure exists.

**What's misleading:** The skill decay model is documented as a feature. It is uncomputable from the current data model.

---

### 11. Scheduling / Shift Logic Readiness — 0.5 / 10

**Rationale:** The constraint handling document catalogs 30+ constraints across categories: temporal (max hours, min rest), qualification (certifications, proficiency), regulatory (labor law compliance, overtime), preference (employee preferences, seniority). The constraint relaxation strategy (hard constraints never relax, soft constraints relax in priority order) is well-designed. Zero solver integration. Zero constraint enforcement code.

**What's genuinely strong:** The constraint catalog is the most complete part of the documentation. The jurisdiction profiles (US, UK, EU, AU) with different overtime rules and rest requirements are operationally accurate.

**What's missing:** A scheduler. A solver. Any code that reads constraints, formulates a problem, solves it, and writes assignments. The shift assignment UNIQUE constraint allows overlapping shifts (documented bug). 6 labor law specifications are documented as legally incorrect (per the project's own review).

**What's misleading:** The constraint catalog implies a constraint-aware solver exists. It does not.

---

### 12. Optimization Engine Readiness — 0.5 / 10

**Rationale:** The algorithm strategies document describes 5 approaches: greedy heuristic, constraint programming, mixed-integer programming, genetic/simulated annealing, and a hybrid approach. HiGHS WASM is specified as the primary solver. The demand-to-assignment pipeline is fully documented. Zero solver code exists. HiGHS has not been imported. No WASM binary is present. No benchmark has been run.

**What's genuinely strong:** The hybrid strategy (greedy initial solution, MIP refinement, CP for constraint satisfaction) is a sound approach for workforce scheduling.

**What's missing:** The solver. The HiGHS WASM integration. The problem formulation code (translating domain constraints into mathematical constraints). Benchmark fixtures. Test problems with expected outputs. Memory/time profiling for Edge Function feasibility.

**What's misleading:** Three different solver architectures are described across three documents (HiGHS WASM, OR-Tools/Gurobi on Kubernetes, CP-SAT). This was flagged in the internal review but remains unresolved. Gurobi is referenced despite costing $10K+/year and being incompatible with WASM.

---

### 13. UX / Control Room Readiness — 0.5 / 10

**Rationale:** Four UX documents describe the control room (7 widgets), scenario simulation (what-if analysis, Monte Carlo), planning adjustments (drag-drop scheduling, approval workflows), and UX concepts (5 personas, information architecture). Zero components exist. Zero CSS exists. Zero routes exist.

**What's genuinely strong:** The persona definitions are specific to logistics planning roles (Site Planner, Operations Manager, Shift Supervisor, HR Operations, Regional Director). The control room widget layout is well-thought-out.

**What's missing:** Every pixel. No React components. No Tailwind configuration. No layout system. No data visualization library. No drag-and-drop implementation. No real-time update mechanism.

**What's misleading:** The level of UX specification detail (widget dimensions, interaction flows, keyboard shortcuts) implies these designs have been implemented and tested. They have not been rendered even once.

---

### 14. Extensibility / Modularity — 1.0 / 10

**Rationale:** The module breakdown document describes 12 modules with APIs, dependencies, and scaling strategies. The architecture specifies a modular monolith pattern with bounded contexts. This is sound architectural thinking.

**What's genuinely strong:** The module dependency graph and the decision to use a modular monolith (not microservices) for a small team is pragmatically correct.

**What's missing:** Modules. There are no modules because there is no code. Module boundaries exist only in documentation. No module has an interface. No module has an implementation. No module has been tested in isolation.

**What's misleading:** "Modular monolith" implies a codebase organized into modules. There is no codebase.

---

### 15. Database / Data Architecture Maturity — 1.5 / 10

**Rationale:** schema.sql is a real artifact — 500+ lines of PostgreSQL DDL with enums, tables, constraints, indexes, RLS policies, and triggers. It demonstrates real database design skill. But it has never been executed, contains 14 known bugs, and has a cross-tenant data leakage vulnerability.

**What's genuinely strong:** The enum design is thorough and domain-appropriate. The RLS policy structure (using `auth.uid()` and a `user_organization` mapping) is the correct Supabase pattern. The partitioning strategy for time-series data is sound.

**What's missing:** A database. Migration tooling. Seed data. Index tuning based on actual query patterns. The 14 bug fixes. Absence/leave entity. Skill decay tracking field. Overlapping shift prevention. Materialized view tenant isolation.

**What's misleading:** The schema is presented as executable. Executing it would create a database with known integrity violations and a security vulnerability.

---

### 16. Codebase Structure Quality — 0.0 / 10

**Rationale:** There is no codebase. Zero source code files exist. The CLAUDE.md specifies a `/src` directory structure. No `/src` directory exists. The CLAUDE.md specifies `npm run build` / `npm run test` / `npm run lint`. No `package.json` exists. These commands cannot run.

**What's genuinely strong:** Nothing. There is nothing to evaluate.

**What's missing:** A codebase.

**What's misleading:** CLAUDE.md describes build, test, and lint commands for a project that has none of these capabilities. A developer following these instructions would encounter immediate failure.

---

### 17. Maintainability — 0.0 / 10

**Rationale:** Maintainability requires code to maintain. There is no code. There are no dependencies to update. There are no tests to keep passing. There are no interfaces to keep stable. There is no tech debt because there is no tech.

**What's genuinely strong:** The documentation is well-organized and would make future code easier to maintain — if future code existed.

**What's missing:** Something to maintain.

**What's misleading:** Nothing. This score is simply a consequence of having no implementation.

---

### 18. Autonomy / AI-readiness — 0.5 / 10

**Rationale:** Eleven AI layer documents describe a comprehensive AI vision: data capture strategy, recommendation engine, user intelligence, organizational intelligence, automation layers, privacy guardrails, explainability, learning models, and a 4-phase evolution roadmap. The automation spectrum (5 levels from manual to autonomous) is a thoughtful progressive adoption framework.

**What's genuinely strong:** The 4-phase AI evolution roadmap (Assisted -> Augmented -> Autonomous -> Adaptive) is realistic and avoids the trap of promising full autonomy on day one. The privacy guardrails document addresses real concerns about AI in HR contexts.

**What's missing:** Any AI code. No Claude API calls. No prompt templates. No embedding generation. No vector search. No recommendation pipeline. No learning loop. The Ruflo/claude-flow configuration in the repo is agent orchestration tooling, not application AI.

**What's misleading:** The AI layer documentation is the largest section (11 documents). This creates an impression of deep AI capability. The AI capability is zero. The internal review flagged that Claude's self-reported confidence scores are unreliable — a design flaw in a system that does not exist.

---

### 19. Reliability / Safety for Enterprise Use — 0.0 / 10

**Rationale:** Enterprise reliability requires: deployment, monitoring, alerting, error tracking, graceful degradation, circuit breakers, health checks, SLAs, incident response procedures, backup/restore procedures, and disaster recovery. None of these exist. The system cannot be reliable because it does not run.

**What's genuinely strong:** The risk assessment document identifies 15+ risks with likelihood and impact scores. The failure modes document catalogs 24 failure modes. This risk awareness would be valuable for a running system.

**What's missing:** A running system. Deployment. Monitoring. Tests. Any mechanism to detect, prevent, or recover from failure. The RPO 5min / RTO 30min claims have no implementation path.

**What's misleading:** The risk assessment and failure mode documentation imply risk management of a live system. These are risk assessments of a design document.

---

### 20. Overall Strategic Product Strength — 2.0 / 10

**Rationale:** The strategic vision is genuine. The domain understanding is real. The documentation quality is exceptional. But strategy without execution is academic. This project has exceptional inputs (domain knowledge, architectural thinking, self-critical review) and zero outputs (no product, no users, no revenue, no validated learning).

**What's genuinely strong:** If an experienced team of 5-7 engineers inherited this documentation, they would have a meaningful head start — perhaps 2-3 months of requirements gathering and architecture design already done. That has real value.

**What's missing:** 18-24 months of engineering execution. Customer validation. Market testing. Revenue. A team.

**What's misleading:** The repository structure (organized docs, SQL schema, internal reviews with bug counts) creates an impression of a mature project in development. It is a pre-development planning exercise.

---

## Weighted Score Calculation

### Weight Rationale

Implementation-dependent dimensions (4, 6-19) receive higher weights because the target vision specifies a "platform" — which is an implemented, deployed, running system. Vision-dependent dimensions (1-3, 20) receive lower weights because strong documentation alone cannot deliver a platform.

| Category | Dimensions | Total Weight |
|----------|-----------|-------------|
| Vision & Domain (can score on docs alone) | 1, 2, 3, 20 | 0.15 |
| Implementation-Critical (require code) | 4-19 | 0.85 |

### Final Calculation

- Vision & Domain weighted contribution: 0.92 / 10 (from dimensions 1-3, 20)
- Implementation weighted contribution: 0.525 / 10 (from dimensions 4-19)
- **Combined weighted score: 1.4 / 10**

---

## Comparison: Where AstraPlanner Sits

| Maturity Level | Score Range | Description | AstraPlanner? |
|---------------|------------|-------------|---------------|
| **Concept** | 0.0 - 0.5 | Idea exists, maybe a pitch deck | No — past this |
| **Design** | 0.5 - 2.0 | Architecture docs, domain model, no code | **YES — here** |
| **Prototype** | 2.0 - 3.5 | Core vertical slice works, nothing else | Not yet |
| **Alpha** | 3.5 - 5.0 | Core features work, rough edges, no scale | Not yet |
| **Beta** | 5.0 - 6.5 | Feature-complete for MVP, limited users | Not yet |
| **Production** | 6.5 - 8.0 | Deployed, monitored, real users, scaling | Not yet |
| **Enterprise** | 8.0 - 10.0 | Multi-tenant, compliant, SLAs, proven at scale | Not yet |

AstraPlanner is at the **top of the Design tier** — the documentation is genuinely better than most projects produce. But it has not crossed the threshold into Prototype, which requires at least one working vertical slice.

---

## What Would Move the Score

| Action | Estimated Effort | Score Impact |
|--------|-----------------|-------------|
| Execute schema.sql, fix 14 bugs, validate RLS | 1 week | +0.5 |
| Initialize Next.js + Supabase + tRPC project | 1 week | +0.5 |
| Build CRUD for org/site/process entities | 2 weeks | +0.8 |
| Integrate HiGHS WASM, solve toy problem | 2 weeks | +1.0 |
| Build setup wizard Phase 1 (org creation) | 2 weeks | +0.5 |
| Build one Control Room widget with real data | 2 weeks | +0.5 |
| Add authentication and basic RBAC | 1 week | +0.5 |
| Deploy to Vercel + Supabase hosted | 1 week | +0.5 |
| Write first integration test suite | 2 weeks | +0.5 |
| End-to-end: demand input -> solver -> schedule output | 4 weeks | +2.0 |

**12 weeks of focused engineering would bring the score from 1.4 to approximately 5.0-6.0** — which is the Beta range. This is achievable because the design work is done. The bottleneck is purely execution.

---

## Final Statement

AstraPlanner has the best documentation of any pre-implementation project this audit has reviewed. That is simultaneously a genuine compliment and a damning observation. The documentation is a map. The territory has not been explored. The map may be wrong — the project's own reviewers have already found 14 places where it is. Until code validates or invalidates these designs, the score cannot exceed the Design tier ceiling of 2.0.

**Score: 1.4 / 10. Classification: Late-stage Design phase. Zero implementation.**
