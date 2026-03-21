# AstraPlanner Knowledge Base

> AI-Driven Workforce Planning Platform for Logistics Environments
> 78 documents | 2.6 MB | Last validated: 2026-03-20
> Invariants: **17/20 LOCKED** | 3 WEAK (Phase 2) | 0 CONTRADICTORY | 0 MISSING
> Status: **BUILD READY**
> Foundation Score: **6.0 / 10** | Build Readiness: **5.0 / 10** | Domain Accuracy: **8.0 / 10**

**START HERE:** [BUILD-PLAN.md](BUILD-PLAN.md) — the single operational document for the entire project

**Reference:** [DECISIONS.md](DECISIONS.md) | [solver-contract.md](solver-contract.md) | [api-contracts.md](api-contracts.md) | [schema.sql](04-data-model/schema.sql)

---

## 00 — Critical Review

| Document | Description |
|----------|-------------|
| [SYSTEMS-REVIEW.md](00-critical-review/SYSTEMS-REVIEW.md) | **START HERE** — Systems-level critique: 7 broken handoffs, 5 new risks, architecture fixes |
| [REVIEW-FULL.md](00-critical-review/REVIEW-FULL.md) | Full document review: 3 contradictions, 14 data model bugs, 6 legal issues, 19 gaps |
| [REVIEW.md](00-critical-review/REVIEW.md) | Initial review summary with proposed fixes |

## 01 — Philosophy

| Document | Description |
|----------|-------------|
| [philosophy.md](01-philosophy/philosophy.md) | Core beliefs, why logistics WFP is hard, AI-driven vs legacy systems |
| [planning-principles.md](01-philosophy/planning-principles.md) | 10 governing principles with rationale and failure modes |
| [decision-hierarchy.md](01-philosophy/decision-hierarchy.md) | Strategic → Tactical → Operational → Reactive decision levels |
| [failure-modes.md](01-philosophy/failure-modes.md) | 24 failure modes across 5 categories with mitigations |

## 02 — System Architecture

| Document | Description |
|----------|-------------|
| [system-overview.md](02-system-architecture/system-overview.md) | Three-layer architecture aligned to Supabase stack *(rewritten)* |
| [module-breakdown.md](02-system-architecture/module-breakdown.md) | 12 modules with APIs, dependencies, scaling strategies |
| [integration-architecture.md](02-system-architecture/integration-architecture.md) | ERP/WMS/TMS/HRIS/payroll/IoT integration patterns |
| [event-architecture.md](02-system-architecture/event-architecture.md) | Event bus, CQRS, sagas, event sourcing for plan versioning |

## 03 — Setup Wizard

| Document | Description |
|----------|-------------|
| [wizard-flow.md](03-setup-wizard/wizard-flow.md) | 8-phase wizard with screens, inputs, validation, time estimates |
| [wizard-logic.md](03-setup-wizard/wizard-logic.md) | Adaptive intelligence, smart defaults, templates, branching logic |
| [wizard-ai-strategies.md](03-setup-wizard/wizard-ai-strategies.md) | 5 AI strategies: NL setup, doc upload, interview, clone, benchmark |

## 04 — Data Model

| Document | Description |
|----------|-------------|
| [data-entities.md](04-data-model/data-entities.md) | 18 entities with full attribute tables and example records |
| [data-relationships.md](04-data-model/data-relationships.md) | ER diagram, 35-row cardinality table, relationship documentation |
| [multi-tenancy.md](04-data-model/multi-tenancy.md) | Shared DB + RLS, isolation guarantees, tenant provisioning |
| [scalability-design.md](04-data-model/scalability-design.md) | Partitioning, indexing, time-series, volume estimates at scale |
| [schema.sql](04-data-model/schema.sql) | Executable PostgreSQL DDL with RLS policies *(new)* |

## 05 — Optimization Engine

| Document | Description |
|----------|-------------|
| [optimization-strategy.md](05-optimization-engine/optimization-strategy.md) | Demand → Workload → FTE → Assignment pipeline with formulas |
| [skill-matching.md](05-optimization-engine/skill-matching.md) | 5-level proficiency model, adjacency matrix, matching algorithm |
| [constraint-handling.md](05-optimization-engine/constraint-handling.md) | Hard/soft constraints catalog, jurisdiction profiles, relaxation |
| [algorithm-strategies.md](05-optimization-engine/algorithm-strategies.md) | Greedy, CP, MIP, GA/SA, hybrid approach with benchmarks |

## 06 — UX / Control Layer

| Document | Description |
|----------|-------------|
| [ux-concepts.md](06-ux-control-layer/ux-concepts.md) | UX philosophy, 5 personas, information architecture |
| [control-room.md](06-ux-control-layer/control-room.md) | Real-time dashboard layout, 7 widgets, interaction flows |
| [scenario-simulation.md](06-ux-control-layer/scenario-simulation.md) | What-if analysis, Monte Carlo, comparison dashboard |
| [planning-adjustments.md](06-ux-control-layer/planning-adjustments.md) | Manual adjustments, drag-drop scheduling, approval workflows |

## 07 — Implementation

| Document | Description |
|----------|-------------|
| [tech-stack.md](07-implementation/tech-stack.md) | Full stack: Next.js, Supabase, Claude, HiGHS, Supastarter |
| [backend-architecture.md](07-implementation/backend-architecture.md) | Modular monolith, 10 modules, tRPC, RLS, job queues |
| [frontend-architecture.md](07-implementation/frontend-architecture.md) | App Router structure, state management, performance, a11y |
| [ai-integration.md](07-implementation/ai-integration.md) | 5 AI use cases, prompt patterns, Ruflo multi-agent, cost mgmt |

## 08 — Risks & Gaps

| Document | Description |
|----------|-------------|
| [risk-assessment.md](08-risks-and-gaps/risk-assessment.md) | 19 risks across 4 categories with mitigation strategies |
| [edge-cases.md](08-risks-and-gaps/edge-cases.md) | 28 edge cases (13 P0, 15 P1) across demand/workforce/planning |
| [scaling-risks.md](08-risks-and-gaps/scaling-risks.md) | Data/compute/org/geo scaling analysis, 3-phase roadmap, cost model |
| [gap-analysis.md](08-risks-and-gaps/gap-analysis.md) | 10 functional gaps, MVP vs V2 vs V3 phasing, dependency graph |
| [security-threat-model.md](08-risks-and-gaps/security-threat-model.md) | STRIDE analysis, attack surfaces, top 10 pre-launch controls *(new)* |
| [gdpr-compliance.md](08-risks-and-gaps/gdpr-compliance.md) | Data subject rights, erasure procedures, sub-processor DPAs *(new)* |

## 09 — MVP Scope

| Document | Description |
|----------|-------------|
| [mvp-definition.md](09-mvp-scope/mvp-definition.md) | Hard scope boundary: 11 in, 14 out, success criteria *(new)* |
| [build-sequence.md](09-mvp-scope/build-sequence.md) | 9 phases over 24 weeks with dependencies and exit criteria *(new)* |

## 10 — AI Intelligence Layer

| Document | Description |
|----------|-------------|
| [ai-vision.md](10-ai-layer/ai-vision.md) | AI-native vs AI-assisted, five pillars, trust equation, intelligence spectrum |
| [ai-architecture.md](10-ai-layer/ai-architecture.md) | Three-plane architecture (Deterministic/Intelligence/Interaction), event-driven learning, 9 DB schemas |
| [data-capture.md](10-ai-layer/data-capture.md) | User & system event schemas, feature engineering pipeline, storage tiers |
| [learning-model.md](10-ai-layer/learning-model.md) | 4 learning mechanisms (rules, statistics, ML, LLM), online/offline, confidence model |
| [user-intelligence.md](10-ai-layer/user-intelligence.md) | Per-user cognitive model, decision patterns, behavioral segmentation |
| [organizational-intelligence.md](10-ai-layer/organizational-intelligence.md) | Site fingerprints, process learning, cross-site benchmarking, anomaly detection |
| [recommendation-engine.md](10-ai-layer/recommendation-engine.md) | 13 recommendation types, 7-step generation pipeline, timing intelligence, fatigue management |
| [automation-layer.md](10-ai-layer/automation-layer.md) | 5-level automation spectrum (L0-L4), earned autonomy model, safety boundaries |
| [privacy-and-guardrails.md](10-ai-layer/privacy-and-guardrails.md) | AI ethics framework, what AI may/may not learn, bias detection, EU AI Act compliance |
| [explainability.md](10-ai-layer/explainability.md) | 3-level explanations, generation architecture, counterfactual explanations |
| [ai-evolution-roadmap.md](10-ai-layer/ai-evolution-roadmap.md) | 4-phase journey: Assistive → Recommendation → Semi-Autonomous → Autonomous |

## Audit (Adversarial Review)

| Document | Description |
|----------|-------------|
| [executive-verdict.md](audit/executive-verdict.md) | **Overall: 1.4/10** — 1.9 MB docs, zero code. Exceptional vision, zero execution. |
| [scorecard.md](audit/scorecard.md) | 20-dimension scoring: domain fit 7.5, enterprise readiness 0.0, weighted avg 1.4 |
| [structural-weaknesses.md](audit/structural-weaknesses.md) | 8 deep weaknesses: documentation spiral, tooling inversion, schema-without-DB |
| [enterprise-gaps.md](audit/enterprise-gaps.md) | Missing: all implementation, enterprise infra, workforce domain features |
| [remediation-roadmap.md](audit/remediation-roadmap.md) | 30/60/90 day plan: stop documenting, start building |
| [architecture-gap-map.md](audit/architecture-gap-map.md) | All 11 layers at 100% gap. MVP effort: 14-20 weeks (team of 3) |
| [wizard-gap-analysis.md](audit/wizard-gap-analysis.md) | Design 7/10, implementation 0/10. "75-145 minutes" estimate is fiction |
| [data-model-gap-analysis.md](audit/data-model-gap-analysis.md) | Maturity 6/10. 14+ bugs, 6 missing entities, never executed |
| [planning-engine-gap-analysis.md](audit/planning-engine-gap-analysis.md) | Domain correctness 7/10, implementation 0/10. Zero solver code |

## Foundation Audit (Maturity-Appropriate)

| Document | Description |
|----------|-------------|
| [executive-verdict.md](audit-foundation/executive-verdict.md) | **Foundation: 6.0/10, Build Readiness: 5.0/10, Domain: 8.0/10** |
| [foundation-scorecard.md](audit-foundation/foundation-scorecard.md) | 20-dimension scoring calibrated to pre-build phase |
| [strongest-docs.md](audit-foundation/strongest-docs.md) | Top 10 strongest docs ranked with load-bearing assessment |
| [weakest-docs.md](audit-foundation/weakest-docs.md) | Top 10 weakest/misleading docs with specific problems |
| [contradictions-and-gaps.md](audit-foundation/contradictions-and-gaps.md) | 11 contradictions, over-engineering 8/10 risk, under-spec 7/10 risk |
| [build-readiness.md](audit-foundation/build-readiness.md) | Week 1 blockers, Month 1 risks, 7 decision gates, build sequence realism |
| [documentation-restructure.md](audit-foundation/documentation-restructure.md) | Reduce 60 docs → 25 active. Lock 8, consolidate 7, defer 15, create 5 |

## Core Invariants (Must Be Correct Before Build)

| Document | Description |
|----------|-------------|
| [invariants.md](core-invariants/invariants.md) | **THE FOUNDATION** — 9 invariants with TypeScript contracts, known bugs, resolution items |

## Implementation Layers (Can Evolve Over Time)

| Document | Description |
|----------|-------------|
| [layers.md](implementation-layers/layers.md) | 43 concepts classified into Phase 1 (18), Phase 2 (12), Phase 3 (13) |
| [mixing-errors.md](implementation-layers/mixing-errors.md) | 10 places where invariants and implementation are improperly mixed |

## Phase Plan

| Document | Description |
|----------|-------------|
| [phases.md](phase-plan/phases.md) | Phase 0-5 roadmap: invariant lock → core planning → UX → launch → intelligence → autonomy |
| [build-readiness-check.md](phase-plan/build-readiness-check.md) | Invariant readiness: 6.5/10. 7 blockers for Week 1, path to 9/10 in 3-5 days |

## Invariant Validation (Build Gate)

| Document | Description |
|----------|-------------|
| [invariant-scoreboard.md](invariant-validation/invariant-scoreboard.md) | All 20 invariants validated: 8 LOCKED, 6 WEAK, 4 CONTRADICTORY, 2 MISSING |
| [blockers.md](invariant-validation/blockers.md) | 10 critical blockers. Top 5 must resolve before Day 1. ~42 hours total. |
| [contradictions.md](invariant-validation/contradictions.md) | 15 contradictions with forced single-answer resolutions |
| [missing-definitions.md](invariant-validation/missing-definitions.md) | 10 missing specs WITH full definitions provided (solver contract, absence entity, state machine) |
| [pre-build-decisions.md](invariant-validation/pre-build-decisions.md) | 12 forced decisions. No options — one answer each. |
| [readiness-verdict.md](invariant-validation/readiness-verdict.md) | **CONDITIONAL PASS.** Build starts March 28 if 5 days of resolution work begins now. |
