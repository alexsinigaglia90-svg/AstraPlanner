# AstraPlanner Foundation Audit: Executive Verdict

> Audit Date: 2026-03-20
> Audit Type: Maturity-appropriate adversarial review of pre-build documentation
> Scope: 60 documents (2.1 MB) across 12 sections, including 3 self-critiques and 1 prior adversarial audit
> Posture: Evaluate the foundation as a foundation — not as a finished product

---

## The Calibrated Verdict

AstraPlanner's documentation set is a genuinely strong pre-build foundation in the domains of logistics workforce planning and conceptual architecture, marred by internal contradictions, over-scoped ambition, and critical under-specification at exactly the points where an engineer would need the most precision. It is simultaneously one of the best pre-implementation design documents I have reviewed for this problem domain and one that would cause significant rework in its first month of implementation.

The project has a rare quality: honest self-awareness. Three internal reviews have already identified most of the problems this audit would find. This is a meaningful strength. But it also raises an uncomfortable question: if you already know the schema has 14 bugs, the layers do not connect, and the optimizer cannot compute what it promises — why are the documents not fixed?

---

## Three-Dimensional Assessment

### Dimension 1: Conceptual Quality — 7.5/10

The conceptual foundation is genuinely excellent in several areas:

**What is strong:**

- The 10 planning principles are not generic platitudes. They are operationally specific, each with a failure mode, a logistics example, and a principle interaction matrix. Principle 1 (Demand Drives Everything) correctly identifies the most common mistake in workforce planning — supply-first scheduling. This alone demonstrates deeper domain understanding than most competing products exhibit in their shipped software.

- The failure modes analysis (24 modes, 5 categories) reads like it was written by someone who has watched workforce planning systems fail in production. The distinction between data failures (insidious because plans look normal), model failures (systematically wrong outputs from correct inputs), and human failures (predictable behaviors a system must accommodate) is operationally accurate. The inclusion of "survivorship bias in historical data" and "gaming the system" shows awareness of failure modes that most WFP vendors discover only after deployment.

- The demand-to-workload-to-FTE-to-assignment pipeline is logically sound and correctly sequenced. The formulas are arithmetically correct. The concrete numeric example (Section 7 of optimization-strategy.md) walks through a real distribution center scenario with 50,000 pick lines, 400 pallets, skill-adjusted productivity rates, shift timing factors, and absenteeism buffers. An operations manager could verify this against their own spreadsheet and find it credible.

- The decision hierarchy (strategic/tactical/operational/reactive) with different replanning frequencies and freshness half-lives is a genuinely useful framework that maps to real planning cadences in logistics.

**What is weak:**

- The CWU (Common Workload Unit) abstraction is introduced in the optimization strategy as the universal currency of demand normalization — but the schema, the data entities, and the workload plan table do not use CWUs. They use native demand units and productivity rates in native units. The CWU is a concept looking for an implementation. In the numeric example, it is acknowledged as identity (conversion factor 1.0), which raises the question: is CWU solving a real problem or adding an unnecessary abstraction layer?

- The probabilistic planning principle (Principle 4) is conceptually sound but operationally disconnected. The MVP explicitly defers Monte Carlo simulation. The schema stores no confidence intervals on plan outputs. The workload plan table has no probability distribution fields. The principle exists in the philosophy layer but has no structural support in any other layer. An engineer reading Principle 4 and then reading the MVP definition would be confused about what to build.

- The AI vision document (10-ai-layer/ai-vision.md) describes "AI-native" workforce planning with a "continuous intelligence layer" that "observes, learns, predicts, suggests, and acts." This is aspirational writing, not architecture. The 11 AI layer documents describe a system that would require 2-3 years of data accumulation and a dedicated ML engineering team. For a pre-build project with 3-5 engineers on a 24-week timeline, this is distraction masquerading as vision.


### Dimension 2: Build Readiness — 5.0/10

This is where the assessment must be most precise. The question is not "does code exist?" (it does not) but "could an engineering team of 3-5 people pick up these documents on Monday morning and start building with confidence by Wednesday?"

**Where Build Readiness is strong:**

- The build sequence (build-sequence.md) is concrete, realistic, and honest. Nine phases over 24 weeks with specific deliverables, exit criteria, risk assessments, and team allocation per phase. The critical path is correctly identified. The parallelization opportunities are practical. The 4-week allocation for the optimization phase (Phase 3) is explicitly called "highest risk" with buffer. This is not a fantasy schedule.

- The MVP definition (mvp-definition.md) is one of the best MVP scope documents I have seen. It has a clear "in scope" list (11 features with detail) and — critically — a clear "out of scope" list (14 features, each with a rationale for deferral and a target version). The success criteria are measurable: "workload computation produces < 1% arithmetic error vs. manual calculation," "HiGHS optimizer generates a valid shift plan for 50 employees in < 10 seconds." These are testable.

- The schema.sql is an executable DDL with 18 tables, RLS policies, indexes, materialized views, triggers, and comments. Despite its known bugs, it is a meaningful artifact — not pseudocode, not an ER diagram, but SQL that could (with fixes) run against a PostgreSQL database. The table structure maps logically to the domain model. The index selection is informed by documented query patterns.

- The tech stack selection (Supabase + Next.js + tRPC + HiGHS WASM) is coherent for a small team building a SaaS product. The Supastarter scaffolding, managed infrastructure (Vercel, Supabase, Fly.io), and zero-DevOps design philosophy are appropriate for the team size. This is not a Kubernetes-and-microservices fantasy.

**Where Build Readiness fails:**

- The SYSTEMS-REVIEW identifies 7 broken handoff points between layers. The schema cannot store what the optimizer needs (no absence data, no skill decay dates, wrong demand granularity). These are not edge cases — they are Day 1 blockers. An engineer starting Phase 2 (Demand & Workload) would immediately discover that the demand_forecast table cannot store sub-daily forecasts despite the wizard offering hourly granularity. This is a contradiction between documented components that would halt work until resolved.

- There is no optimizer I/O contract. Five solver strategies are described across multiple documents, but nowhere is there a TypeScript interface defining what the solver receives as input and produces as output. The frontend team cannot build the "Optimizing..." UI. The backend team cannot build the result-writing pipeline. The algorithm team cannot validate against expected outputs. This is the single most critical missing specification for an engineering team starting work.

- Three different RLS mechanisms are described across three documents (system-overview.md uses `auth.jwt() ->> 'tenant_id'`, backend-architecture.md uses `current_setting('app.tenant_id')`, schema.sql uses `auth.organization_id()`). Only one can be correct. An engineer implementing the first Edge Function would need to make a choice that the documentation does not make.

- The naming inconsistency between `tenant_id` and `organization_id`, between `DemandSignal` (system-overview) and `demand_forecast` (schema.sql), between 4-level and 5-level proficiency scales — these are the kind of inconsistencies that cause integration bugs when two engineers build from different documents independently.

- The materialized views bypass RLS, creating a cross-tenant data leakage vector. This is identified in the SYSTEMS-REVIEW but not fixed in the schema. An engineer who trusts the schema as-is would ship a security vulnerability.

**The bottom line on build readiness:** An engineer could start building from these docs, but they would spend their first 1-2 weeks resolving contradictions, making architectural decisions the docs defer, and fixing schema bugs — not writing application code. The docs get you to "ready to resolve ambiguity" not "ready to code."


### Dimension 3: Missing Implementation — Expected, Not Penalized

The absence of code is correct for a pre-build study phase. The prior audit (docs/audit/) scored the project 1.4/10 by penalizing the absence of implementation. This was the wrong evaluation frame. A pre-build architecture review that produces a 2.1 MB documentation set, identifies its own flaws, and provides a 24-week build sequence is doing exactly what a pre-build phase should do.

What IS penalizable is the gap between what the documents promise and what the documents specify. The documents promise a system where "demand drives everything" and "plans are probabilistic" — but the schema cannot store probabilistic demand. The documents promise an optimization engine with 5 solver strategies — but no solver I/O contract exists. The documents promise enterprise multi-tenancy — but the RLS approach is contradicted across three documents.

---

## Over-Engineering Assessment

The following elements are designed beyond what is needed before coding begins:

1. **The 11 AI layer documents (Section 10).** These describe a 4-phase AI evolution from "Assistive" to "Autonomous" with behavioral segmentation, cross-site benchmarking, counterfactual explanations, and earned autonomy. This is a 3-year product roadmap compressed into architecture documents. For a 24-week MVP where AI is limited to "Claude-powered suggestions during the wizard," this is 70+ pages of premature design. An engineer would read these and conclude the project is far more ambitious than the MVP definition suggests.

2. **The event-sourcing architecture (Section 02, event-architecture.md).** CQRS, sagas, event sourcing for plan versioning — this is enterprise event architecture that the MVP explicitly does not need. The MVP uses snapshot-per-version (simple, correct). The event-sourcing design is architectural tourism.

3. **The GA/SA solver strategies (algorithm-strategies.md).** Full chromosome encoding and crossover operators for genetic algorithms. The SYSTEMS-REVIEW already identified that the chromosome encoding is broken (single-employee-per-slot encoding cannot represent 30 pickers for one process-time slot). This is academic complexity that the MVP does not need and the design does not support.

4. **The 7-level configuration hierarchy (Global -> Region -> Country -> SiteGroup -> Site -> Process -> Override).** Configuration inheritance at 7 levels is notoriously difficult to debug. The SYSTEMS-REVIEW recommends 3 levels (org -> site -> override). The 7-level design is premature complexity for a product with zero customers.

5. **Monte Carlo simulation design.** The scenario-simulation.md describes Latin Hypercube Sampling, correlation matrices, and 1,000-iteration simulations. The MVP defers this to V2. Designing the statistical engine before the basic what-if works is over-engineering.

---

## Under-Specification Assessment

The following are missing details that an engineer would need on Day 1:

1. **Optimizer I/O contract.** No TypeScript interfaces for solver input/output. This is the most critical missing specification — it sits at the intersection of the backend (data assembly), the algorithm (solver), and the frontend (progress/result display). Without it, three workstreams cannot begin in parallel.

2. **Employee absence/leave data model.** The optimizer checks "employee is not on leave" as a hard constraint, but there is no entity to store leave data. The SYSTEMS-REVIEW identifies this; the schema is not fixed. This blocks the optimizer from producing valid plans on Day 1 of testing.

3. **Plan state machine.** PlanVersion has an approval_status field with several states but no defined transitions. Can a Published plan go back to Draft? What triggers Stale? Who can transition between states? An engineer implementing the approval workflow has no specification to follow.

4. **API contracts.** No tRPC router definitions. No endpoint specifications. No request/response schemas. The frontend and backend teams cannot develop in parallel without agreed API contracts.

5. **Error handling strategy.** What happens when the solver times out? When a CSV import has 200 valid rows and 50 invalid rows? When an Edge Function hits the 256MB memory limit? The build-sequence mentions these as risks but provides no specification for the user experience of failure.

6. **Multi-site workforce sharing rules.** The MVP scopes this out, which is fine — but the schema still models `is_multi_site_eligible` on employees without specifying what happens with it. An engineer seeing this field would wonder if they need to implement cross-site logic.

---

## Self-Awareness Assessment

The project contains three internal reviews:
- REVIEW.md: Initial summary with proposed fixes
- REVIEW-FULL.md: 3 contradictions, 14 data model bugs, 6 legal issues, 19 gaps
- SYSTEMS-REVIEW.md: 7 broken handoffs, 5 new risks, architectural fixes

Plus a full prior adversarial audit (docs/audit/) with 9 documents scoring the project 1.4/10.

**Is this self-awareness a strength or a sign of churn?**

It is both. The self-awareness is genuinely valuable — it means the project's authors understand their own weaknesses. The SYSTEMS-REVIEW in particular is technically excellent: it identifies real problems (materialized view RLS bypass, optimizer preload latency, inconsistency window during plan writes) that many professional architecture reviews would miss.

But the self-awareness has a troubling pattern: problems are identified but not resolved. The schema still has 14 known bugs. The three RLS mechanisms are still contradictory. The absence entity is still missing. The SYSTEMS-REVIEW provides a "Week 1-4" fix plan, but it was never executed. This creates a documentation set that is simultaneously aware of its flaws and burdened by them. An engineer inheriting this project gets not just the docs but also a backlog of known issues that are documented but unfixed.

The charitable interpretation: this is a disciplined team that documents problems before fixing them. The less charitable interpretation: this is a team that is more comfortable writing about problems than solving them.

---

## Domain Modeling Assessment

The warehouse logistics and workforce planning domain modeling is the strongest aspect of the entire project. Specific evidence:

- **UPH rates are realistic.** 95 lines/hr for each-picking, 18 pallets/hr for receiving, 30 orders/hr for packing — these are within the range of real warehouse engineered standards. The variation by skill level (0.6x for trainees, 1.1x for experts) matches real-world proficiency curves.

- **Shift timing factors are operationally accurate.** The 1.12x night shift factor, the 1.08x cumulative overtime factor, and the 1.20x 7th-consecutive-day factor reflect documented fatigue research and real warehouse performance data.

- **Process categorization is correct.** Inbound, outbound, value-added, support, and returns as the five process categories map to how real warehouses organize work. The equipment requirements, hazard levels, and certification requirements per process are operationally relevant.

- **The absenteeism model is realistic.** 5-7% for full-time, 10-15% for agency, 12-18% for seasonal surge — these are industry-standard ranges. The gross-up formula (FTE_required / (1 - absence_rate)) is correct.

**Where domain modeling falls short:**

- No representation of indirect labor (supervisors, leads, quality auditors who are needed as a ratio of direct headcount).
- No modeling of ramp-up time for new site launches (the "cold start" problem is discussed philosophically but not modeled in the data).
- No equipment constraints (the REVIEW-FULL identifies the missing EquipmentInventory entity — 8 forklifts means max 8 forklift operators, but this cannot be modeled).
- No representation of process dependencies (Zone A feeds Zone B; if Zone A is understaffed, Zone B has idle time). The SYSTEMS-REVIEW discusses this but the data model does not support it.

---

## The Final Question: Genuine Foundation or Sophisticated Documentation?

**It is a genuine foundation — with caveats.**

The conceptual model, domain expertise, and planning principles constitute real intellectual property that would take months to recreate. The MVP definition and build sequence are pragmatic and buildable. The schema, despite its bugs, encodes correct domain relationships. The tech stack selection is appropriate for the team size.

But it will not survive contact with implementation without 2-3 weeks of focused resolution work:
1. Fix the 14 schema bugs (especially absence entity, demand granularity, shift assignment overlap)
2. Write the optimizer I/O contract
3. Resolve the RLS mechanism contradiction
4. Standardize naming (organization_id vs tenant_id, DemandSignal vs demand_forecast)
5. Trim the 11 AI layer documents to a single "AI in MVP" page
6. Define the plan state machine

An engineering team that does this preparatory work would then have a strong foundation. A team that skips it and starts coding from the current docs would waste their first month on avoidable integration failures.

---

## Scores

| Dimension | Score | Rationale |
|-----------|-------|-----------|
| **Foundation Quality** (conceptual + architectural strength) | **7.0 / 10** | Exceptional domain modeling and planning principles. Sound tech stack selection. Weakened by internal contradictions and over-scoped AI vision. |
| **Build Readiness** (could an engineer start building tomorrow?) | **5.0 / 10** | MVP definition and build sequence are strong. Schema is a real artifact. But 14 known bugs, no I/O contracts, contradictory RLS, and missing entities mean 2-3 weeks of resolution before productive coding begins. |
| **Domain Accuracy** (does this reflect real warehouse workforce planning?) | **8.0 / 10** | UPH rates, shift factors, constraint types, demand taxonomies, and process categories reflect real logistics operations. Weakened by missing indirect labor, equipment constraints, and process dependencies. |
