# AstraPlanner Foundation Scorecard

> Audit Date: 2026-03-20
> Audit Type: Foundation quality assessment (pre-build phase)
> Scoring Principle: Evaluate documentation quality and architectural soundness, not code existence. A pre-build project is scored on whether its documentation constitutes a buildable specification, not on whether it has been built.
> Scale: 0-10, where 5 = adequate for a team to begin work, 7 = strong foundation, 9+ = exceptional

---

## Dimension Scores

### 1. Product Vision Quality — 6.5 / 10

**Score rationale:** The vision is clear, specific to logistics, and differentiated from generic WFM tools. But it is too ambitious for the stated team size (3-5 engineers, 24 weeks) given the scope of what is described across 60 documents.

**Strongest aspect:** The 10 planning principles are not abstract values — they are operational invariants with failure modes, logistics examples, and a principle interaction matrix. Principle 6 (Human Override Is Sacred) shows sophisticated understanding of AI-human collaboration that competing products lack.

**Weakest aspect:** No competitive analysis. Quinyx, Legion, Shiftboard, and Blue Yonder are never mentioned. No pricing model. No go-to-market thinking. The vision describes a product in isolation from its market.

**What's misleading:** The "AI-native" positioning across 11 documents implies AI is central to the MVP. The MVP definition reveals that AI in V1 is limited to "Claude-powered suggestions during the wizard" and an AI advisor for insights. The AI vision and the MVP reality are dramatically misaligned in scope.

**What's missing:** Customer validation. User research. A single interview with a warehouse planner confirming that the described workflows match reality.

---

### 2. Warehouse/Logistics Domain Accuracy — 8.0 / 10

**Score rationale:** The domain modeling demonstrates specific logistics knowledge that goes beyond textbook descriptions. This is the project's strongest dimension.

**Strongest aspect:** The process taxonomy (inbound receiving, put-away, each-pick, case-pick, packing, parcel shipping, pallet shipping, returns, VAS, quality audit) with per-process UPH rates, skill requirements, equipment needs, and hazard levels reflects real warehouse operations. The distinction between each-picking (95 lines/hr) and case-picking (45 cases/hr) shows understanding of actual operational variation.

**Weakest aspect:** No modeling of indirect labor. In a real warehouse, for every 15-20 direct workers, you need 1 lead/supervisor. This ratio affects headcount planning materially and is absent from both the domain model and the formulas.

**What's misleading:** The cold-chain warehouse example (ambient/chilled/frozen with different UPH rates and certification requirements) is excellent but implies the system handles temperature-zone-aware planning. Nothing in the schema or optimizer specifically supports temperature zones as a constraint type.

**What's missing:** Equipment capacity constraints (8 forklifts = max 8 forklift operators at any time), process flow dependencies (picking feeds packing — if picking is slow, packing has idle time), and intra-day demand curves (60% of orders arrive by 10 AM in most DCs).

---

### 3. Workforce Planning Logic Quality — 7.5 / 10

**Score rationale:** The demand-to-workload-to-FTE-to-assignment pipeline is logically correct and well-documented. The formulas are arithmetic. The numeric example is verifiable. But the pipeline breaks at the layer handoffs.

**Strongest aspect:** The complete numeric walkthrough (optimization-strategy.md Section 7) converting 50,000 pick lines into 621.9 adjusted hours into 99 FTEs is a verifiable, arithmetic demonstration of the pipeline. An operations manager could check this against their own spreadsheet.

**Weakest aspect:** The pipeline assumes a single weighted UPH per day per process. The SYSTEMS-REVIEW correctly identifies that morning shifts (experienced workers) and evening shifts (trainees) can differ by 40% in productivity. Using a daily average systematically understaffs evenings and overstaffs mornings.

**What's misleading:** The pipeline looks end-to-end complete, but the schema cannot actually store sub-daily demand (DemandForecast uses `forecast_date date`, not `period_start timestamptz`). The pipeline works on paper but cannot execute against the defined data model.

**What's missing:** Process flow dependency modeling. The pipeline treats each process independently, but in reality, receiving feeds put-away feeds picking feeds packing feeds shipping. If receiving is understaffed by 20%, the picking workforce has 20% less work to do, but the pipeline does not model this cascade.

---

### 4. Demand-to-Workload-to-FTE Model Soundness — 7.0 / 10

**Score rationale:** The formulas are mathematically correct. The adjustments (skill proficiency, shift timing, learning curve, absenteeism buffer) are operationally relevant. The CWU abstraction is conceptually questionable.

**Strongest aspect:** The skill proficiency multiplier table (0.6x for trainees to 1.1x for experts) and the shift timing adjustments (1.12x for night shift, cumulative overtime fatigue) reflect documented industrial engineering research. The learning curve adjustment (1.4x for first 3 shifts, decaying to 1.0x by shift 16) is realistic.

**Weakest aspect:** The CWU (Common Workload Unit) is introduced as a normalization layer but immediately abandoned in the numeric example (conversion factor = 1.0 for all demand types). If native units and native productivity rates are used throughout, CWU adds complexity without value. If CWU is meant to enable cross-process comparison ("1 pallet-receive = 12 CWU = 12 each-picks"), the conversion factors are arbitrary and there is no mechanism to calibrate them.

**What's misleading:** The formulas are presented as a complete model, but the absenteeism buffer is applied as a uniform rate across all processes. In reality, absenteeism varies significantly by shift (night shifts have higher absence), by day of week (Mondays and Fridays are higher), and by process (undesirable tasks have higher absence). The uniform rate oversimplifies.

**What's missing:** Explicit handling of fractional FTE allocation. If Process A needs 2.3 FTEs and Process B needs 1.7 FTEs, and an employee can do both, do they split 0.3 FTE to A and 0.7 FTE to B? The documents describe this as the optimizer's job but do not specify how split-process shifts are represented in the schema (the REVIEW-FULL identifies this as bug D2).

---

### 5. Setup Wizard Concept Strength — 6.0 / 10

**Score rationale:** The wizard is well-designed as a UX concept but unrealistic as an implementation target at the documented scope.

**Strongest aspect:** The 6-phase MVP wizard (organization, site, process, workforce import, skill taxonomy, planning rules) with smart defaults per industry vertical is a sound onboarding approach. The explicit deferral of AI document upload and clone-and-modify to V2 shows appropriate scoping discipline.

**Weakest aspect:** The SYSTEMS-REVIEW correctly identifies that the wizard requires knowledge from 4-6 different people (IT, HR, operations, legal, finance) but is designed for a solo operator. No single person in a logistics company knows the productivity rates, the employee skill levels, the shift patterns, and the overtime rules.

**What's misleading:** The "< 60 minutes" completion target for the wizard. Setting up a real warehouse site requires productivity rate determination (time studies or historical data analysis), employee skill assessment, shift pattern design, and labor rule configuration. This is a multi-day process compressed into a "60-minute wizard." The wizard will either produce low-quality defaults or take much longer than 60 minutes.

**What's missing:** A specification for what happens when the wizard is abandoned partway through. State persistence is mentioned (localStorage + server backup) but there is no design for a site that has completed Steps 1-3 but not Steps 4-6. Can it be used in this partial state? What functionality is available?

---

### 6. Functional Decomposition Quality — 7.0 / 10

**Score rationale:** The 12-module breakdown is logically organized with clear boundaries between demand, workforce, planning, and system concerns. The module dependencies are documented.

**Strongest aspect:** The separation of demand ingestion from workload computation from optimization is architecturally correct. Each stage has a defined input and output. The module-breakdown.md documents API boundaries, scaling strategies, and dependencies per module.

**Weakest aspect:** The Intelligence Layer (Modules 9-12 in the 12-module breakdown) is over-decomposed for a pre-build phase. Recommendation engine, organizational intelligence, user intelligence, and automation layer as four separate modules — each with its own data model, API surface, and scaling strategy — is premature decomposition for capabilities that will not exist until V2+.

**What's misleading:** The decomposition implies all 12 modules are MVP-scope. The MVP definition limits scope to roughly 6 modules (data core, demand, workload, optimization, planning UX, setup wizard). The remaining 6 modules are V2+ work documented at the same level of detail as V1 work, which could mislead an engineer about what to build first.

**What's missing:** Module interaction contracts. The decomposition shows what each module does, but not the data structures passed between modules. The optimizer needs input from 4 other modules (demand, workforce, skills, constraints) but the aggregation contract is undefined.

---

### 7. Data Model Direction Quality — 6.5 / 10

**Score rationale:** The schema.sql is a real artifact — 1,138 lines of executable DDL with tables, constraints, indexes, RLS policies, triggers, and materialized views. It reflects correct domain relationships. But it has 14 documented bugs that would prevent it from supporting the optimizer.

**Strongest aspect:** The table design correctly separates organizational hierarchy (organization -> site -> department -> process), demand (demand_type -> demand_forecast), workforce (employee -> employee_skill -> shift_pattern), and planning (plan_version -> workload_plan -> shift_assignment). Foreign keys, check constraints, and unique constraints are comprehensive.

**Weakest aspect:** 14 known bugs identified by the project's own reviews — most critically, no absence/leave entity, a UNIQUE constraint that allows employee double-booking, demand granularity limited to daily, and materialized views that bypass RLS and leak data across tenants.

**What's misleading:** The schema header says "Paste this entire file into the Supabase SQL Editor and execute." This implies a ready-to-run database. The known bugs would cause runtime failures in the optimizer (no absence data to check), the planning engine (double-booked employees), and the dashboard (cross-tenant data leakage from materialized views).

**What's missing:** The `employee_availability_override` entity (leave, absence, training), the `approval_record` entity (audit trail for plan approvals), the `equipment_inventory` entity (site-level equipment counts), and `last_practiced_date` on `employee_skill` (required for skill decay).

---

### 8. Multi-tenant/Enterprise Architecture Quality — 6.0 / 10

**Score rationale:** The Supabase + RLS approach is architecturally sound for the stated scale (single-tenant MVP, multi-tenant ready). The RLS implementation in schema.sql is comprehensive. But it is undermined by the materialized view data leakage bug and contradictory RLS predicates across documents.

**Strongest aspect:** RLS policies on every tenant-scoped table, enforced at the PostgreSQL level independent of application code. The `auth.organization_id()` helper function extracting tenant context from JWT claims is the correct Supabase-native pattern. The immutable audit log with a trigger preventing UPDATE/DELETE is a proper compliance design.

**Weakest aspect:** Three different RLS mechanisms documented across three documents (JWT claim extraction via three different syntax patterns). Only one can be implemented. An engineer would need to resolve this contradiction before writing the first Edge Function.

**What's misleading:** The phrase "enterprise-grade" appears in multiple documents. Enterprise-grade implies SOC 2 compliance, SLA guarantees, disaster recovery, and operational maturity — none of which can be achieved in a pre-build phase. The RLS architecture is appropriate for a SaaS product; calling it "enterprise-grade" overpromises.

**What's missing:** A tenant provisioning workflow (how is a new organization created? who runs the setup? what database operations occur?). The multi-tenancy.md document describes isolation guarantees but not the operational process of creating, configuring, and decommissioning tenants.

---

### 9. AI/Autonomy Concept Validity — 4.0 / 10

**Score rationale:** The AI layer documents describe a compelling long-term vision but are disconnected from the MVP reality and contain unvalidated assumptions about what is technically feasible within the stated timeline and team size.

**Strongest aspect:** The 5-level automation spectrum (L0 Manual to L4 Autonomous) with "earned autonomy" — where the system progressively earns the right to act autonomously by demonstrating accuracy — is a thoughtful framework for AI trust-building. The override learning concept (system adjusts recommendations based on override patterns) is operationally sound.

**Weakest aspect:** 11 documents describing an AI layer that will not exist in the MVP. The AI-in-MVP is limited to Claude-powered suggestions in the wizard and an AI advisor for insights. The gap between what is described (organizational intelligence, cross-site benchmarking, behavioral segmentation, counterfactual explanations) and what will be built (a ChatGPT-style suggestion box) is enormous.

**What's misleading:** The AI documents read as if they describe the V1 product. They describe V3+ capabilities at V1 documentation depth. An engineer or investor reading these would conclude that AstraPlanner's AI capabilities are far more developed than they are. The phrase "AI-native" implies AI is woven into every interaction; in the MVP, AI is an optional suggestion layer.

**What's missing:** Concrete prompt templates for the AI advisor. The documents describe what the AI should say but not how to prompt Claude to say it. For the MVP AI features (wizard suggestions, plan explanations, proactive alerts), prompt engineering specifications would be more useful than architectural blueprints for autonomous decision-making.

---

### 10. Realism of Planning Engine Design — 7.0 / 10

**Score rationale:** The HiGHS WASM + greedy heuristic + Fly.io fallback is a viable solver architecture. The two-tier approach (Edge Function for interactive, Fly.io for heavy compute) is pragmatic. But key integration questions are unanswered.

**Strongest aspect:** The constraint catalog is comprehensive and operationally relevant — max hours per day/week, minimum rest between shifts, certification requirements, overtime thresholds with jurisdiction-specific rules. The distinction between hard constraints (must satisfy) and soft constraints (penalized if violated) is correct for MIP formulation.

**Weakest aspect:** No solver I/O contract. The algorithm documents describe 5 strategies but none define the TypeScript interface consumed by the solver or the data structure it produces. Without this contract, the solver cannot be developed, tested, or integrated.

**What's misleading:** The performance benchmarks in algorithm-strategies.md (specific solve times on specific hardware) are fabricated — no implementation exists to produce benchmarks. Presenting speculative performance estimates as empirical data would mislead infrastructure sizing decisions.

**What's missing:** How does the greedy heuristic warm-start the MIP solver? What is the handoff between Edge Function timeout and Fly.io fallback — does the user wait, or is there a polling/notification mechanism? How does the frontend know a background solve has completed? These integration mechanics are where real complexity lives.

---

### 11. UX/Planner Control Concept Quality — 6.5 / 10

**Score rationale:** The control room and planning workbench designs reflect how real planners work — heatmaps for coverage visibility, drag-and-drop for manual adjustments, gap highlighting for attention routing. But the UX scope is too large for the MVP timeline.

**Strongest aspect:** The coverage heatmap (time-of-day vs. process area, color-coded by staffing percentage) is the right default view for a site planner. The progressive disclosure design (Level 1: status summary, Level 2: gap details with options, Level 3: cost analysis) maps to real planner workflows.

**Weakest aspect:** Three scheduling views (Timeline, Process, Gantt) with full drag-and-drop and constraint validation. The SYSTEMS-REVIEW correctly identifies this as "12-16 weeks of frontend work" and recommends building one view (Process View) for MVP. The documentation describes a V2 UX in V1 scope.

**What's misleading:** The control room widget descriptions (7 widgets with specific interaction patterns) read as UI specifications, but no wireframes, mockups, or component designs exist. An engineer would need to interpret prose descriptions into visual layouts.

**What's missing:** Mobile/responsive design specifications. The MVP defers a native mobile app but claims "responsive web app covers mobile viewing needs." No responsive breakpoints, mobile-specific interaction patterns, or touch-target specifications are documented.

---

### 12. Scalability of the Product Model — 5.5 / 10

**Score rationale:** The hierarchical decomposition (site-level independence with network-level coordination) is architecturally correct for scaling from 1 to 1000 sites. But the MVP is single-tenant, single-region, with no cross-site optimization — so scalability is theoretical.

**Strongest aspect:** The scalability document provides honest volume estimates at different tiers (100, 1000, 10000 employees), query cost projections, and partitioning strategies. The acknowledgment that HiGHS WASM will hit memory limits at ~200 employees shows realistic assessment.

**Weakest aspect:** The gap between "architecture ready for multi-tenant" and "tested at multi-tenant scale" is enormous. RLS has never been executed. Connection pooling has never been tested under load. The materialized view data leakage bug means multi-tenant scalability is architecturally broken until fixed.

**What's misleading:** Performance targets (P95 < 500ms, dashboard load < 3s, solver < 10s) are stated as requirements but have no empirical basis. Without a running system, these targets are aspirational, not validated.

**What's missing:** Cost modeling at scale. How much does Supabase cost at 100 tenants? At 1000? What is the Fly.io compute cost for heavy solver workloads? The deployment topology describes managed services but not their cost implications at scale.

---

### 13. Internal Consistency Across Documents — 4.5 / 10

**Score rationale:** The 60 documents tell mostly the same story at the conceptual level but contradict each other significantly at the implementation level. Three internal reviews have documented these contradictions; they remain unfixed.

**Strongest aspect:** The conceptual consistency is high — demand-first planning, skill-as-first-class-citizen, probabilistic planning, human override — these themes are consistent across philosophy, architecture, and UX documents.

**Weakest aspect:** Implementation-level contradictions are numerous:
- Three different RLS predicates across three documents
- `tenant_id` vs `organization_id` naming
- `DemandSignal` vs `demand_forecast` entity naming
- 4-level vs 5-level proficiency scales
- tech-stack.md claims 7 locales at launch; MVP says English only
- tech-stack.md claims Monte Carlo in V1; MVP defers to V2
- system-overview.md (pre-rewrite) described a completely different tech stack (Python, Kubernetes, Kafka)

**What's misleading:** The "(rewritten)" tags on some documents suggest contradictions have been resolved. Some have (the tech stack was reconciled). Others have not (RLS predicate, naming conventions).

**What's missing:** A single canonical specification document that resolves all known contradictions. The three reviews identify problems; no document resolves them authoritatively.

---

### 14. Clarity of Prioritization/MVP Logic — 8.0 / 10

**Score rationale:** The MVP definition is one of the strongest documents in the repository. Clear in/out scope, measurable success criteria, honest risk acknowledgments, and a realistic build sequence.

**Strongest aspect:** The "Features Explicitly OUT of Scope" table with 14 deferred features, each with a rationale and target version. This is rare discipline in pre-build documentation. The success criteria are measurable and testable (< 1% arithmetic error, < 10 second solve time, < 60 minute wizard completion).

**Weakest aspect:** The 24-week build sequence has zero slack on the critical path. Phase 3 (Optimization) is correctly identified as highest-risk with 4-week allocation — but if Phase 3 takes 6 weeks (likely for solver integration), Phase 4-8 compress or the ship date slips.

**What's misleading:** Nothing significant. The MVP definition is honest about what is and is not included.

**What's missing:** A "what if we're behind" contingency plan. What features get cut if Phase 3 takes 6 weeks instead of 4? What is the minimum viable MVP (the MVP of the MVP)?

---

### 15. Buildability of the Current Design — 5.0 / 10

**Score rationale:** An engineer could start building from these docs, but would spend 1-2 weeks resolving contradictions before writing productive application code.

**Strongest aspect:** The build sequence provides specific deliverables, exit criteria, team allocation, and risks per phase. The schema.sql provides a concrete starting point for the database. The tech stack is coherent and well-documented.

**Weakest aspect:** The missing optimizer I/O contract, the contradictory RLS mechanisms, the 14 schema bugs, and the naming inconsistencies would all surface as blockers in the first sprint. An engineer following the build sequence would reach Phase 2 (Demand & Workload) and discover the schema cannot store hourly demand.

**What's misleading:** The build sequence implies a team can start coding in Week 1. In practice, Week 1 would be spent resolving contradictions and fixing the schema — which the SYSTEMS-REVIEW's own "Week 1" fix plan acknowledges.

**What's missing:** A resolved, canonical version of the schema with all known bugs fixed. The current schema.sql is a draft with documented defects — not a specification an engineer can trust.

---

### 16. Degree of Over-engineering Risk — 4.0 / 10 (lower is worse)

**Score rationale:** Significant over-engineering risk. The documentation designs V2-V3 features at the same depth as V1 features, creating confusion about what to build and premature architectural commitments.

**Strongest aspect:** The MVP definition explicitly defers 14 features. The build sequence is scoped to MVP. Where prioritization decisions are made, they are made well.

**Weakest aspect:** The 11 AI layer documents (70+ pages), the event-sourcing architecture, the GA/SA solver strategies, the 7-level configuration hierarchy, and the Monte Carlo simulation design are all pre-build design for post-MVP features. Combined, they represent approximately 40% of the total documentation volume for features that will not ship in V1.

**What's misleading:** The equal documentation depth across V1, V2, and V3 features implies they are equally important and equally imminent. A new team member would struggle to distinguish "build this now" from "think about this later."

**What's missing:** A clear visual or structural separation between MVP documents and future-vision documents. The INDEX.md lists all documents without version-scoping annotations.

---

### 17. Degree of Under-specification Risk — 4.5 / 10 (lower is worse)

**Score rationale:** Critical specifications are missing at exactly the integration points where engineers need the most precision.

**Strongest aspect:** The planning formulas, the constraint catalog, and the domain model are well-specified. An engineer implementing the workload computation engine has sufficient specification.

**Weakest aspect:** No optimizer I/O contract, no API contracts, no plan state machine, no error handling strategy, no absence data model. These are not edge cases — they are required for the core planning workflow.

**What's misleading:** The documentation volume (2.1 MB, 60 files) implies comprehensive specification. In reality, the documentation is deep on concepts and shallow on integration contracts. The spaces between components are under-specified while the components themselves are over-specified.

**What's missing:** TypeScript interfaces for cross-module communication. tRPC router definitions. Error response schemas. WebSocket event contracts. These integration specifications are what enable parallel development — without them, engineers must coordinate verbally on every cross-module interaction.

---

### 18. Missing Critical Business Logic — 5.5 / 10

**Score rationale:** The core planning logic (demand to FTE) is present. The gap is in adjacent business logic that real deployments require.

**Strongest aspect:** The demand-to-workload-to-FTE pipeline, the skill matching algorithm, and the constraint handling framework are sufficient for a first implementation.

**Weakest aspect:** No absence management workflow. No cost reporting logic (how are labor costs aggregated — by cost center? by site? by process?). No overtime approval workflow beyond the basic plan approval.

**What's misleading:** The comprehensive constraint catalog implies all constraints are implementable. Several constraints (union seniority bidding, CBA guaranteed hours, predictive scheduling compliance) are listed but described as "custom profile entries" — which is insufficient for implementation.

**What's missing:** Indirect labor modeling (supervisor-to-worker ratios), overtime cost calculation logic (base rate x OT multiplier x hours, with jurisdiction-specific rules for daily vs weekly OT), and schedule notification requirements (predictive scheduling laws in US cities require advance notice with specific penalty calculations).

---

### 19. Missing Critical Technical Foundations — 5.0 / 10

**Score rationale:** The tech stack is coherent and the deployment topology is reasonable. The gaps are in integration contracts and operational specifications.

**Strongest aspect:** The Supabase + Next.js + tRPC stack is well-documented with specific version requirements, deployment targets, and managed service selections. The choice to use Supastarter for SaaS scaffolding is pragmatic.

**Weakest aspect:** No solver I/O contract. No API route definitions. No database migration strategy (beyond "Supabase CLI" which is not a strategy). No error handling patterns. No caching strategy for the optimizer preload.

**What's misleading:** The tech stack document claims production-readiness for features (HiGHS WASM in Edge Functions, BullMQ in Deno, Ruflo multi-agent orchestration) that have limited or no production precedent in the described configuration. The SYSTEMS-REVIEW correctly identifies HiGHS WASM in Edge Functions as the #1 integration risk.

**What's missing:** Proof that HiGHS WASM works within Supabase Edge Function memory limits. A 30-minute spike test would validate or invalidate the core solver architecture. This validation could be done without building the product — just the solver integration — and it has not been done.

---

### 20. Overall Foundation Strength — 6.5 / 10

**Score rationale:** Weighing all dimensions, this is a stronger-than-average pre-build foundation. The domain expertise is genuine. The planning logic is correct. The MVP definition is disciplined. The self-awareness is rare and valuable. But the internal contradictions, missing integration contracts, and over-scoped AI vision reduce the practical value for an engineering team starting implementation.

**Strongest aspect:** The combination of domain accuracy, planning logic, failure mode analysis, and honest self-critique creates a foundation that, once its known issues are resolved, would give an engineering team genuine confidence in what they are building and why.

**Weakest aspect:** The gap between conceptual quality (high) and implementation-level specification (inadequate at integration points) means the documentation is better as a learning resource than as a build specification. An engineer would understand the domain deeply but still not know how to wire the optimizer to the database.

**What's misleading:** The documentation volume and organizational structure create an impression of completeness. The 60 documents across 12 sections look like a comprehensive specification. In reality, they are a comprehensive concept document with specification gaps at the most critical integration points.

**What's missing:** A "Day 1 Engineering Guide" that resolves all known contradictions, provides the canonical schema (bugs fixed), defines the optimizer I/O contract, specifies the plan state machine, and tells an engineer exactly where to start. This document does not exist but could be created in 3-5 days from the existing material.

---

## Score Summary

| # | Dimension | Score |
|---|-----------|-------|
| 1 | Product Vision Quality | 6.5 |
| 2 | Warehouse/Logistics Domain Accuracy | 8.0 |
| 3 | Workforce Planning Logic Quality | 7.5 |
| 4 | Demand-to-Workload-to-FTE Model Soundness | 7.0 |
| 5 | Setup Wizard Concept Strength | 6.0 |
| 6 | Functional Decomposition Quality | 7.0 |
| 7 | Data Model Direction Quality | 6.5 |
| 8 | Multi-tenant/Enterprise Architecture Quality | 6.0 |
| 9 | AI/Autonomy Concept Validity | 4.0 |
| 10 | Realism of Planning Engine Design | 7.0 |
| 11 | UX/Planner Control Concept Quality | 6.5 |
| 12 | Scalability of the Product Model | 5.5 |
| 13 | Internal Consistency Across Documents | 4.5 |
| 14 | Clarity of Prioritization/MVP Logic | 8.0 |
| 15 | Buildability of the Current Design | 5.0 |
| 16 | Degree of Over-engineering Risk | 4.0 |
| 17 | Degree of Under-specification Risk | 4.5 |
| 18 | Missing Critical Business Logic | 5.5 |
| 19 | Missing Critical Technical Foundations | 5.0 |
| 20 | Overall Foundation Strength | 6.5 |

---

## Computed Averages

### Foundation Quality Average (Dimensions 1-12)

Dimensions 1-12 assess the conceptual and architectural strength of the design:

| Dimension | Score |
|-----------|-------|
| 1. Product Vision Quality | 6.5 |
| 2. Warehouse/Logistics Domain Accuracy | 8.0 |
| 3. Workforce Planning Logic Quality | 7.5 |
| 4. Demand-to-Workload-to-FTE Model Soundness | 7.0 |
| 5. Setup Wizard Concept Strength | 6.0 |
| 6. Functional Decomposition Quality | 7.0 |
| 7. Data Model Direction Quality | 6.5 |
| 8. Multi-tenant/Enterprise Architecture Quality | 6.0 |
| 9. AI/Autonomy Concept Validity | 4.0 |
| 10. Realism of Planning Engine Design | 7.0 |
| 11. UX/Planner Control Concept Quality | 6.5 |
| 12. Scalability of the Product Model | 5.5 |
| **Average** | **6.5** |

### Build Readiness Average (Dimensions 13-19)

Dimensions 13-19 assess whether an engineering team could start building from this documentation:

| Dimension | Score |
|-----------|-------|
| 13. Internal Consistency Across Documents | 4.5 |
| 14. Clarity of Prioritization/MVP Logic | 8.0 |
| 15. Buildability of the Current Design | 5.0 |
| 16. Degree of Over-engineering Risk | 4.0 |
| 17. Degree of Under-specification Risk | 4.5 |
| 18. Missing Critical Business Logic | 5.5 |
| 19. Missing Critical Technical Foundations | 5.0 |
| **Average** | **5.2** |

### Overall Foundation Score

Weighted: 60% Foundation Quality + 40% Build Readiness

**Overall Foundation Score = (0.60 x 6.5) + (0.40 x 5.2) = 3.9 + 2.1 = 6.0 / 10**

---

## Interpretation

A score of 6.0/10 means: **this is a viable foundation that requires focused resolution work before an engineering team can build productively from it.**

It is not a 1.4/10 (the prior audit's score, which penalized the absence of code rather than evaluating the foundation). It is not a 9/10 (which would mean an engineer could clone the repo and start coding immediately).

The path from 6.0 to 8.0 is well-defined and achievable in 2-3 weeks:
1. Fix the 14 schema bugs (especially absence entity, demand granularity, shift overlap)
2. Write the optimizer I/O contract as TypeScript interfaces
3. Resolve the three contradictory RLS mechanisms to one canonical approach
4. Standardize naming conventions (organization_id everywhere, demand_forecast everywhere)
5. Separate MVP-scope documents from future-vision documents (physically or with clear annotations)
6. Define the plan state machine with valid transitions and role permissions
7. Create a "Day 1 Engineering Guide" that resolves all known contradictions

The path from 6.0 to 3.0 is also easy: start coding without resolving the contradictions and discover them at integration time, 8 weeks into the build, when fixing them is 10x more expensive.
