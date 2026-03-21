# Mixing Errors: Where Invariants and Implementation Are Improperly Mixed

> An invariant is a property that must hold regardless of implementation choice.
> An implementation is a specific technical decision that could change without violating the invariant.
> Mixing them in the same document creates fragile specifications where changing a technology forces redesign of a business concept.

---

### Mixing Error 1: GA Chromosome Encoding Embedded in Solver I/O Specification

**Document:** `algorithm-strategies.md`
**Section:** Section 5.2 (Genetic Algorithm), specifically 5.2.1 (Chromosome Encoding) through 5.2.7 (GA Parameters)

**The Problem:** The document specifies the solver's input/output contract (what goes in: employees, slots, constraints; what comes out: assignments, diagnostics, coverage metrics) alongside implementation-specific details of one particular solver strategy -- the GA chromosome encoding (`chromosome = [a[1], a[2], ..., a[S]]` where `a[s]` is the employee ID assigned to slot `s`), crossover operators (shift-based, process-based, uniform-with-repair), mutation rates (0.05 per gene for swap mutation), population size (200), and tournament selection size (5). The chromosome encoding is also mathematically broken: it represents each slot as a single employee assignment, but workforce scheduling requires multiple employees per slot (a picking process might need 15 employees in the same time slot). The encoding cannot represent this.

**Why It's Harmful:**
1. The broken GA encoding is mixed into a document that also contains the correct MIP formulation and greedy heuristic. A developer might reasonably assume all solver strategies in the same document have been validated to the same standard.
2. The solver I/O contract (the invariant) is buried under 400 lines of GA/SA implementation details. Finding "what does the solver take as input and return as output" requires reading through chromosome encodings and temperature schedules.
3. When the GA encoding is eventually fixed (it must be), the document change will touch both the invariant (solver interface) and the implementation (GA internals), making review harder and increasing the risk of accidentally changing the invariant.

**What is the INVARIANT:**
- The solver takes: a set of employees with skills and availability, a set of demand slots with requirements, a set of constraints (hard and soft), a time budget, and an objective function specification.
- The solver returns: a set of employee-to-slot assignments, a list of uncovered slots, constraint violation diagnostics, solve time, and solution quality metrics.
- This contract is the same regardless of whether the solver uses greedy, MIP, CP-SAT, GA, SA, or any future algorithm.

**What is the IMPLEMENTATION:**
- GA chromosome encoding, crossover operators, mutation rates, population size, tournament selection, fitness function weighting.
- SA temperature schedule, cooling rate, neighborhood generation.
- MIP branching heuristics, cutting planes, symmetry breaking constraints.
- CP-SAT search strategies, LNS neighborhood selection.

**What document should contain what:**
- `optimization-strategy.md` should own the **invariant**: the 4-stage pipeline (demand normalization -> workload computation -> FTE calculation -> assignment optimization), the solver I/O contract (TypeScript interfaces for `SolverInput` and `SolverOutput`), the objective function definitions, and the solver selection criteria.
- `algorithm-strategies.md` should own the **implementation**: each algorithm's internal mechanics, performance characteristics, and parameter tuning. This document should reference the solver I/O contract from optimization-strategy.md and demonstrate that each algorithm conforms to it.
- The broken GA encoding should be flagged and deferred to Phase 3, not included as a production specification.

**Fix:** Extract the solver I/O contract into optimization-strategy.md as formal TypeScript interfaces. Move all algorithm internals to algorithm-strategies.md with a clear "Implements SolverInterface" annotation. Delete the broken GA chromosome encoding until it is redesigned against real problem instances.

---

### Mixing Error 2: 7-Level Configuration Hierarchy Embedded in Workload Computation

**Document:** `optimization-strategy.md`
**Section:** Section 8.1 (Configuration Hierarchy)

**The Problem:** The workload computation pipeline (demand normalization -> hours calculation -> FTE calculation) is a mathematical invariant. The formula `required_hours = demand / productivity_rate * (1 + allowance)` does not change regardless of where the `productivity_rate` value comes from. But Section 8.1 embeds a 7-level configuration hierarchy (`Global Defaults -> Region -> Country -> Site Group -> Site -> Process -> Override`) directly into the pipeline specification. This hierarchy determines how configuration values are resolved, but the pipeline itself does not care -- it just needs a resolved `productivity_rate` value.

**Why It's Harmful:**
1. The 7-level hierarchy is implementation that will change. MVP needs 3 levels (org defaults -> site overrides -> field-level overrides, per contradictions-and-gaps.md OE6). The hierarchy is over-engineered for launch and will confuse developers who encounter it during Phase 0-1 implementation.
2. Configuration inheritance bugs are notoriously difficult to debug. If a productivity rate is wrong because of a cascade error at the "Site Group" level, the debugging path goes through 7 layers of resolution logic -- inside a document that is supposed to describe workload math.
3. When a developer reads optimization-strategy.md to implement the workload computation engine, they encounter configuration hierarchy design that is a completely separate engineering problem. The two concerns should be independently implementable and testable.

**What is the INVARIANT:**
- The workload computation formula: `required_hours[process][timeslot] = normalized_demand[process][timeslot] / productivity_rate[process]`
- The FTE calculation: `FTE_required = adjusted_required_hours / available_hours_per_FTE`
- The skill proficiency adjustment: `effective_hours = required_hours / proficiency_multiplier[employee][process]`
- The absenteeism buffer: `gross_FTE = FTE_required / (1 - absenteeism_rate)`
- These formulas are correct regardless of whether the `productivity_rate` comes from a 3-level hierarchy, a 7-level hierarchy, a flat configuration table, or a machine learning model.

**What is the IMPLEMENTATION:**
- The number of hierarchy levels (3 vs 7 vs N).
- The cascade/override resolution logic.
- How the "Site Group" concept is defined.
- The continuous calibration pipeline (comparing planned vs actual throughput).
- Adaptive solver selection based on historical solver performance.

**What document should contain what:**
- `optimization-strategy.md` should own the **invariant**: the pipeline formulas, the input/output data types, and the numeric examples. It should state that `productivity_rate` is "resolved from the configuration system" without specifying how.
- A separate `configuration-system.md` (or a section in the setup wizard docs) should own the **implementation**: the hierarchy levels, cascade logic, override rules, and calibration pipeline.

**Fix:** Remove Section 8.1 from optimization-strategy.md. Replace it with a one-line reference: "Productivity rates and other configuration parameters are resolved by the configuration system (see configuration-system.md). The workload computation engine receives resolved values." Move the hierarchy design to a configuration-focused document and simplify it to 3 levels for MVP.

---

### Mixing Error 3: Kafka Topic Structure Specified for Domain Events

**Document:** `event-architecture.md`
**Section:** Section 1 (Event Bus Infrastructure)

**The Problem:** The document specifies Kafka as the event bus infrastructure -- complete with a 3+ broker cluster, multi-AZ deployment, specific topic naming (`domain.demand.*`, `domain.plan.*`), partition counts (24 partitions per domain topic), partition keys (site_id for domain events, tenant_id for workforce events), replication factor (3), min-in-sync replicas (2), and Confluent Schema Registry. But the actual tech stack (tech-stack.md Section 3.7) uses Supabase Realtime + Database Webhooks for events, with no Kafka anywhere. The domain events themselves (DemandForecastUpdated, PlanGenerated, ShiftAssigned) are the invariant. The transport mechanism (Kafka vs Supabase Realtime vs SQS vs RabbitMQ) is implementation.

**Why It's Harmful:**
1. A developer reading event-architecture.md will set up Kafka. A developer reading tech-stack.md will use Supabase Realtime. The two approaches are architecturally incompatible. This contradiction was identified in contradictions-and-gaps.md (C9) and the system-overview.md rewrite, but event-architecture.md was never updated.
2. The Kafka specification is extremely detailed -- partition counts, replication factors, consumer group patterns, DLQ topic naming. This level of detail implies production readiness. But Kafka is not in the tech stack, and for a Supabase-based architecture with < 50 concurrent users, Kafka adds operational complexity with no benefit.
3. The domain event catalog (Section 3) is excellent and should be preserved. But it is tangled with Kafka-specific concepts like "partition key = site_id" and "consumer group lag," making it impossible to reuse the event catalog for a Supabase Realtime implementation without mentally filtering out the Kafka references.

**What is the INVARIANT:**
- The domain event catalog: `DemandForecastUpdated`, `PlanGenerated`, `ShiftAssigned`, `EmployeeUnavailable`, etc.
- The event envelope: `event_id`, `event_type`, `event_version`, `timestamp`, `tenant_id`, `correlation_id`, `causation_id`, `actor`, `payload`.
- The producer-consumer relationships: Demand Ingestion Service produces `DemandForecastUpdated`, consumed by Workload Engine, AI Advisor, Control Room.
- The latency SLAs per event type.
- The saga patterns (PlanGenerationSaga, PlanApprovalSaga).

**What is the IMPLEMENTATION:**
- Kafka cluster configuration (broker count, partitions, replication).
- Topic naming conventions.
- Partition key strategy.
- Schema Registry choice (Confluent vs AWS Glue vs none).
- Consumer group management.
- Dead letter queue implementation.
- The choice between Kafka vs Supabase Realtime vs SQS vs any other transport.

**What document should contain what:**
- `event-architecture.md` should own the **invariant**: event catalog, event envelope, producer-consumer map, saga patterns, latency SLAs. It should be transport-agnostic.
- A new `event-infrastructure.md` (or a section in tech-stack.md) should own the **implementation**: for MVP, this is Supabase Database Webhooks -> Edge Functions for backend events, and Supabase Realtime for frontend events. The events table in PostgreSQL serves as the durable event store. Kafka is listed as a Phase 3 option for enterprise-scale deployments.

**Fix:** Rewrite event-architecture.md Section 1 to remove all Kafka references. Replace with a transport-agnostic description: "Domain events are produced by services and consumed by interested modules. The transport mechanism is selected based on deployment scale (see tech-stack.md)." Move the Kafka specification to a "Phase 3: Enterprise Event Infrastructure" section or a separate document.

---

### Mixing Error 4: Fleet Learning Algorithms Embedded in Smart Defaults Engine

**Document:** `wizard-logic.md`
**Section:** Section 2.5 (Fleet Learning Defaults, Layer 4) and Section 2.1 (Architecture showing the 5-layer stack)

**The Problem:** The smart defaults engine is a Phase 1 feature -- when a user selects "E-commerce Fulfillment Center" as their industry vertical, the wizard should pre-fill reasonable productivity rates, shift patterns, and break rules. This is the invariant: the concept of adaptive defaults that reduce configuration effort. But Section 2.5 embeds a Phase 3 implementation -- fleet learning -- directly into the Layer 4 of the defaults architecture. Fleet learning requires aggregated cross-tenant configuration data with k-anonymity (n >= 30 similar configurations), coefficient-of-variation thresholds (CoV < 0.3), and privacy safeguards. At launch, there are zero tenants, making fleet learning impossible for 12+ months.

**Why It's Harmful:**
1. A developer implementing the wizard in Phase 5 (Weeks 16-18) encounters a 5-layer architecture where Layer 4 requires infrastructure that cannot exist until Year 2+. They must decide: build the placeholder Layer 4 infrastructure (wasted effort) or skip it (violating the architecture diagram).
2. The fleet learning specification is highly detailed (k-anonymity, CoV thresholds, sample sizes, privacy safeguards) -- 40+ lines of specification for a feature that cannot ship for 12+ months. This detail is indistinguishable from the Layer 1-3 specifications that should be built in Phase 1.
3. The 5-layer architecture diagram makes fleet learning look structurally equivalent to industry defaults and regional defaults. But industry defaults are static JSON files maintained by domain experts (Phase 1), while fleet learning is a statistical aggregation pipeline across tenant databases (Phase 3). These are fundamentally different systems presented as layers of the same stack.

**What is the INVARIANT:**
- The concept of smart defaults: the wizard should pre-fill configuration fields with reasonable values based on context (industry, site type, region).
- The resolution strategy: more specific context overrides less specific context (site-type defaults override industry defaults).
- The user experience: defaults are shown with attribution ("Common setting for warehouse operations in California"), the user can always override.

**What is the IMPLEMENTATION:**
- The number of layers (3 for MVP, 5 for mature product).
- The source of defaults at each layer (static JSON, database lookup, cross-tenant aggregation).
- Fleet learning algorithms (k-anonymity thresholds, CoV calculations, privacy pipelines).
- The specific values at each layer (productivity rates, break rules, shift patterns).

**What document should contain what:**
- `wizard-logic.md` should own the **invariant**: the concept of layered defaults with context-based resolution, the user experience of attributed defaults, and the Layers 0-3 (Global, Industry, Site Type, Regional) that are implementable at launch.
- A separate section in `ai-evolution-roadmap.md` or a new `fleet-learning.md` should own Layer 4 as a **Phase 3 implementation**: the fleet learning pipeline, k-anonymity requirements, privacy safeguards, and the infrastructure needed to aggregate cross-tenant data.

**Fix:** Remove Section 2.5 from wizard-logic.md. Update the architecture diagram in Section 2.1 to show 4 layers (0-3) with a note: "Layer 4 (Fleet Learning) is planned for Phase 3 when sufficient tenant data exists. See ai-evolution-roadmap.md." Move the fleet learning specification to the AI roadmap with the prerequisite: "n >= 30 tenants per segment."

---

### Mixing Error 5: Jurisdiction-Specific Rule VALUES Mixed with Constraint MODEL

**Document:** `constraint-handling.md`
**Section:** Sections 2.1-2.8 (Hard Constraints)

**The Problem:** The constraint model -- the structure of how constraints are defined, evaluated, and enforced -- is an invariant. A hard constraint has a type (max_weekly_hours), an operator (<=), a threshold (48), a scope (per employee), and an enforcement mechanism (block assignment if violated). This structure is the same whether the threshold is 48 hours (EU), 40 hours (US), or 35 hours (France). But constraint-handling.md mixes the constraint model with extensive jurisdiction-specific rule values: 8 rows for maximum weekly hours by jurisdiction, 8 rows for minimum rest, 7 rows for consecutive days, specific California daily OT rules, German Arbeitszeitgesetz section references, and Australian Modern Award details.

**Why It's Harmful:**
1. The jurisdiction-specific values will change when labor laws change. When Germany updates ArbZG (which it does periodically), the fix should be a data update in a configuration table -- not a documentation edit in the constraint modeling document.
2. The values create false confidence. A developer might hardcode "EU minimum rest = 11 hours" from this document, when in practice the value should come from the regional defaults system (wizard-logic.md Layer 3) and be configurable per tenant.
3. The constraint model is hard to understand because it is interleaved with legal references. A developer trying to understand "how does the constraint engine work?" must read through pages of jurisdiction-specific break rules, overtime thresholds, and legal citations.
4. The document lists constraints for US (Federal + 6 states), EU (5 countries), and Asia-Pacific (3 countries) -- 14 jurisdictions. But these are a tiny fraction of the jurisdictions AstraPlanner might eventually serve. The document implicitly claims completeness while covering < 5% of global jurisdictions.

**What is the INVARIANT:**
- Constraint categories: working time limits, rest periods, consecutive days, certifications, capacity, contract restrictions, breaks.
- The hard vs soft constraint distinction: hard constraints are never violated by the solver; soft constraints are penalized.
- Constraint enforcement mechanism: checked during candidate filtering (hard) or scored in the objective function (soft).
- The constraint relaxation protocol: when infeasible, relax soft constraints in priority order and report which were relaxed.

**What is the IMPLEMENTATION:**
- Specific threshold values for each jurisdiction (48 hours EU, 40 hours US, etc.).
- Legal citations (EU Working Time Directive 2003/88/EC, CA Labor Code, ArbZG).
- Jurisdiction-specific exceptions (UK opt-out, German 24-week averaging period, California daily OT).
- The mapping from jurisdiction to constraint parameter values.

**What document should contain what:**
- `constraint-handling.md` should own the **invariant**: the constraint model (types, enforcement, relaxation), the hard/soft distinction, the constraint engine architecture. It should use ONE example jurisdiction to illustrate each constraint type, not 14.
- A `jurisdiction-profiles/` directory (or a section in wizard-logic.md Layer 3) should own the **implementation**: the specific parameter values for each jurisdiction, loaded as configuration data. Each jurisdiction profile is a data record, not a documentation section.
- The constraint engine should load jurisdiction values from the database, not from hardcoded constants derived from documentation.

**Fix:** Refactor constraint-handling.md to define the constraint model with one example jurisdiction (US Federal as the simplest). Move all jurisdiction-specific values to the regional defaults system. Implement jurisdiction profiles as database seed data, not documentation.

---

### Mixing Error 6: Monte Carlo Sampling Mixed with Scenario Comparison Concept

**Document:** `scenario-simulation.md`
**Section:** Section 5 (Monte Carlo Simulation) alongside Sections 2-4 (Scenario creation, types, comparison)

**The Problem:** The document describes two fundamentally different features as parts of the same system:
1. **Deterministic scenario comparison** (Phase 1 invariant): clone a plan, change one variable, re-run optimizer, compare KPIs side-by-side. This is the core concept of what-if analysis.
2. **Monte Carlo simulation** (Phase 3 implementation): define probability distributions for input variables, run 1,000-10,000 iterations with Latin Hypercube Sampling, compute percentile statistics, generate convergence-monitored probabilistic outcomes.

These are presented in a single document with shared UI concepts (the "comparison dashboard" in Section 4 serves both), making it appear that Monte Carlo is an integral part of the scenario system rather than a Phase 3 enhancement.

**Why It's Harmful:**
1. A developer implementing the scenario simulation feature for Phase 6 (Weeks 19-20) will see Monte Carlo as part of the feature scope. The "Execution options" table in Section 2.3 lists "Monte Carlo" alongside "Quick solve" and "Standard solve" as if they are peer options, when Monte Carlo requires 4-6 weeks of additional implementation (contradictions-and-gaps.md OE1).
2. Monte Carlo requires probability distributions calibrated against historical data (demand variance, absence rate distributions). Without 6+ months of data, the distributions are guesses, and the percentile outputs are fiction presented as statistics.
3. The "AI Advisor generates natural-language risk statements from Monte Carlo results" (Section 5.4) couples Monte Carlo with the AI layer, creating a dependency chain that pulls Phase 3 features into Phase 1.

**What is the INVARIANT:**
- The concept of scenario comparison: fork a baseline plan, modify assumptions, re-optimize, compare results.
- The assumption categories: demand, workforce, operational, regulatory, cost.
- The comparison metrics: FTE delta, cost delta, coverage delta, constraint violations.
- The scenario lifecycle: Draft -> Proposed -> Approved -> Promoted to Active Plan.
- Scenario persistence: save named scenarios for later review.

**What is the IMPLEMENTATION:**
- Monte Carlo sampling (iteration count, distribution types, LHS, convergence criteria).
- Sensitivity analysis (tornado charts, parameter perturbation).
- Pre-computed scenarios (auto-generated demand +/- 10/20%).
- Multi-variable scenarios (changing multiple assumptions simultaneously).
- AI-generated risk narrative from probabilistic results.

**What document should contain what:**
- `scenario-simulation.md` should own the **invariant**: scenario creation flow (fork, modify, optimize, compare), assumption categories, comparison dashboard layout, scenario lifecycle. Section 5 (Monte Carlo) should be removed entirely.
- A new `monte-carlo-simulation.md` in a Phase 3 section should own the **implementation**: probabilistic simulation, distribution configuration, LHS, convergence, percentile reporting. This document should state its prerequisites: "Requires 6+ months of demand history for distribution parameterization."

**Fix:** Remove Section 5 from scenario-simulation.md. Remove "Monte Carlo" from the execution options table in Section 2.3. Add a note: "Probabilistic simulation (Monte Carlo) is planned for Phase 3. See implementation-layers/layers.md." Create a separate Monte Carlo specification document in a Phase 3 planning section.

---

### Mixing Error 7: Hardcoded Proficiency Scale (5 Levels) vs Configurable Concept

**Document:** `data-entities.md` (EmployeeSkill entity, Section 10) and `wizard-flow.md` (Phase 5)

**Section:** `data-entities.md` -- `CHECK(proficiency_level BETWEEN 1 AND 5)`, `min_skill_level smallint` with values 1-5. `wizard-flow.md` -- Phase 5 defaults to a 4-level scale (Trainee 50%, Developing 75%, Proficient 100%, Expert 110%).

**The Problem:** Two documents hardcode different proficiency scales as implementation, when the invariant is the concept of proficiency levels (employees have varying skill competence that affects productivity). `data-entities.md` hardcodes a 5-level integer scale with CHECK constraint `BETWEEN 1 AND 5`. `wizard-flow.md` defaults to 4 levels with specific labels and productivity multipliers. `optimization-strategy.md` Section 4.3 shows a 5-level scale with different labels (Trainee/Basic/Competent/Proficient/Expert) and different multipliers (0.60/0.75/0.90/1.00/1.10). `constraint-handling.md` Section 2.5 references the 5-level scale for minimum skill enforcement. This was flagged in contradictions-and-gaps.md as C7.

**Why It's Harmful:**
1. If an organization uses the 4-level wizard default, their "Expert" (level 4) maps to "Proficient" (level 4/5) in the solver's 5-level scale. This causes systematic undercounting of expert capacity -- the solver treats their best employees as merely proficient.
2. Different organizations have different proficiency models. Some use 3 levels, some use 5, some use 10-point scales. Hardcoding the scale in a database CHECK constraint makes it impossible to accommodate different models without schema migration.
3. The productivity multipliers differ between documents: wizard-flow.md says Expert = 110%, optimization-strategy.md says Expert = 110% but at Level 5, not Level 4. These are not reconcilable because the scale itself is different.

**What is the INVARIANT:**
- The concept of proficiency levels: employees have varying skill competence for each process.
- Proficiency affects productivity: higher proficiency means more output per hour.
- Minimum proficiency is required for some processes (safety constraint).
- The relationship: `effective_productivity = base_productivity * proficiency_multiplier`.

**What is the IMPLEMENTATION:**
- The number of levels (3, 4, 5, or N).
- The labels for each level (Trainee, Basic, etc.).
- The specific productivity multiplier for each level.
- The minimum level required for each process category.
- Whether the scale is integer or continuous.

**What document should contain what:**
- `data-entities.md` should define `proficiency_level` as an integer with the CHECK constraint referencing an org-configurable maximum: `CHECK(proficiency_level BETWEEN 1 AND org_proficiency_scale_max)`. The entity should reference a `proficiency_scale_config` in the Organization entity.
- `wizard-flow.md` should present the 4-level scale as ONE possible default, with the option to customize during setup.
- `optimization-strategy.md` should use `proficiency_multiplier[employee][process]` without assuming a specific number of levels. The multiplier is looked up from the org's scale configuration.
- `constraint-handling.md` should reference `min_skill_level[process]` as an org-configured value, not a fixed number from a 5-level scale.

**Fix:** Add `proficiency_scale` configuration to the Organization entity (or site-level settings). Change the CHECK constraint to reference this configuration. Reconcile the multiplier values across documents by making them configurable per org with the 4-level wizard defaults as the starting point.

---

### Mixing Error 8: Ruflo Multi-Agent Orchestration as Production Architecture

**Document:** `ai-integration.md`
**Section:** Section 4.2 (referenced as Ruflo in tech-stack.md Section 4.2)

**The Problem:** The document treats Ruflo multi-agent orchestration as a production architecture component. tech-stack.md lists it in the technology decision matrix alongside proven technologies (Next.js, PostgreSQL, Claude). ai-integration.md describes a specific multi-agent workflow ("Generate a comprehensive plan review") with 4 named agents (Demand Analyst, Workforce Analyst, Cost Analyst, Risk Analyst) running as parallel Claude API calls, coordinated by Ruflo with execution graph management, partial failure handling, and result synthesis. This is presented as a concrete implementation blueprint, not an experimental option.

**Why It's Harmful:**
1. mvp-definition.md explicitly defers Ruflo to "V2 (validation phase)" and describes it as "Experimental technology." But ai-integration.md and tech-stack.md present it as part of the production stack. A developer reading tech-stack.md would reasonably plan for Ruflo integration in Phase 0.
2. The multi-agent workflow described can be achieved with a single Claude call using a structured prompt that covers all 4 analysis domains. The multi-agent approach adds latency (4 parallel API calls instead of 1), cost (4x token usage), and orchestration complexity for marginal quality improvement.
3. Ruflo as a dependency creates vendor risk. If Ruflo's API changes or the project is abandoned, the entire AI orchestration layer needs replacement. Single-agent Claude with structured prompts has no orchestration dependency.

**What is the INVARIANT:**
- AI-powered analysis should cover multiple domains (demand, workforce, cost, risk) for comprehensive plan review.
- AI features must have deterministic fallbacks when the AI is unavailable.
- AI usage is metered per tenant with cost tracking.
- PII is never sent to external AI services.

**What is the IMPLEMENTATION:**
- Single-agent vs multi-agent architecture.
- Ruflo vs LangGraph vs CrewAI vs custom orchestration vs no orchestration.
- The specific agent decomposition (4 agents vs 1 agent with 4 sections in the prompt).
- Execution graph management, partial failure handling.

**What document should contain what:**
- `ai-integration.md` should own the **invariant**: AI capabilities (entity extraction, insight generation, NL query, plan explanation), integration architecture (ai-gateway Edge Function), cost management, privacy safeguards, deterministic fallbacks.
- Multi-agent orchestration should be described as an **experimental Phase 3 option** in `ai-evolution-roadmap.md`, not as production architecture. The MVP implementation should be single-agent Claude with structured prompts covering all analysis domains.
- `tech-stack.md` should move Ruflo from the main technology matrix to a "Future Considerations" section with the note: "Validated in Phase 2, production in Phase 3 if single-agent proves insufficient."

**Fix:** Remove Ruflo from the production architecture descriptions in ai-integration.md and tech-stack.md. Replace the multi-agent workflow example with a single-agent structured prompt example that achieves the same analytical coverage. Add Ruflo as an experimental option in ai-evolution-roadmap.md Phase 3.

---

### Mixing Error 9: Phase 2/3 Features Listed as Launch Stack

**Document:** `tech-stack.md`
**Section:** Section 2.8 (Internationalization), Section 5.3 (Heuristic Engine), Section 9 (Bundle Size Budget)

**The Problem:** tech-stack.md lists several Phase 2/3 features as part of the launch technology stack:
1. **7 locales at launch** (Section 2.8): "Supported locales at launch: en-US, en-GB, de-DE, fr-FR, es-ES, nl-NL, pl-PL." mvp-definition.md says English only.
2. **Monte Carlo sampling in TypeScript heuristic engine** (Section 5.3): Listed as a TypeScript-native algorithm: "Monte Carlo sampling -- 'What's the risk?' -- sample 1,000 absence scenarios and report coverage probability -- < 2s." mvp-definition.md defers Monte Carlo to V2.
3. **Service Worker for HiGHS WASM caching** (Section 9): "The HiGHS WASM binary (~2.5 MB) is loaded lazily and cached in the browser via Service Worker for subsequent uses." mvp-definition.md defers Service Workers and offline mode to V3+.
4. **Dual embedding providers** (Section 4.3): Voyage AI and OpenAI embeddings for semantic search. mvp-definition.md does not mention embeddings at all.
5. **PostGIS extension** (Section 3.3): For "Geographic queries for multi-site distance calculations and regional grouping." MVP optimizes sites independently with no cross-site geographic queries.
6. **pgaudit extension** (Section 3.3): For "Compliance audit logging." Not included in schema.sql (contradictions-and-gaps.md C11).

**Why It's Harmful:**
1. A developer using tech-stack.md as the implementation specification will budget time for 7 locale translations (2-3 weeks), Monte Carlo implementation (4-6 weeks), Service Worker lifecycle management (1-2 weeks), embedding pipeline (2-3 weeks), PostGIS integration (1 week), and pgaudit configuration (1 week). Total: 10-16 weeks of wasted effort on features that are explicitly out of MVP scope.
2. The tech stack document does not distinguish between "technologies we need at launch" and "technologies we plan to use eventually." Every item is presented with equal urgency and equal detail.
3. Bundle size estimates in Section 9 include Service Worker overhead, which inflates the apparent complexity of the frontend architecture.

**What is the INVARIANT:**
- The platform needs a frontend framework (Next.js), a database (PostgreSQL), an API layer (tRPC), an auth system (Supabase Auth), a solver (HiGHS), and an AI engine (Claude).
- The technology selection criteria: developer velocity, enterprise reliability, AI-native capability.

**What is the IMPLEMENTATION:**
- Which extensions are enabled at which phase (pgvector at launch, PostGIS at Phase 2, pgaudit at Phase 2).
- How many locales are supported at each phase (English at launch, 7 locales at Phase 2).
- Which AI features are available at each phase (entity extraction at launch, embeddings at Phase 2, Monte Carlo at Phase 3).
- Caching strategy (browser cache at launch, Service Worker at Phase 3).

**What document should contain what:**
- `tech-stack.md` should have an explicit "MVP Stack" vs "Target Stack" distinction for EVERY technology listed. A column in the technology decision matrix should indicate the phase when each technology is introduced.
- Phase 2/3 features should be clearly marked: "Planned for Phase 2" or "Not in MVP" in the relevant sections.
- Bundle size estimates should reflect the MVP bundle, not the full target bundle.

**Fix:** Add a "Phase" column to the technology decision matrix in Section 7. Move 7-locale support to Phase 2. Remove Monte Carlo from the heuristic engine section (or mark it as Phase 3). Remove Service Worker references from the bundle size section. Mark PostGIS and pgaudit as Phase 2. Remove dual embedding providers (or mark as Phase 2).

---

### Mixing Error 10: Kubernetes/Kafka Architecture in Core System Description

**Document:** `system-overview.md` (original version, pre-rewrite) and `event-architecture.md` (current)

**Section:** system-overview.md was rewritten to align with Supabase. event-architecture.md Section 1 still specifies Kafka.

**The Problem:** The original system-overview.md described a Kubernetes + Kafka architecture as the core platform infrastructure. This was the wrong implementation for the chosen invariants (multi-tenant workforce planning for 3-5 engineer team). The rewrite corrected system-overview.md to use Supabase + Vercel + Fly.io. But event-architecture.md was not updated and still specifies a "Kafka Cluster (3+ brokers, multi-AZ)" with 8 topics, 24 partitions each, Confluent Schema Registry, and infinite retention. The invariant (domain events with producer-consumer relationships) is correct and valuable. The implementation (Kafka) contradicts the tech stack and is operationally inappropriate for the team size and scale.

**Why It's Harmful:**
1. event-architecture.md is one of the most detailed and well-designed documents in the knowledge base. The domain event catalog, the event envelope, the saga patterns, and the concrete event flow examples are excellent invariant specifications. But they are trapped inside a Kafka-specific implementation that contradicts the actual tech stack.
2. A developer who reads system-overview.md (Supabase-centric) and then reads event-architecture.md (Kafka-centric) faces a fundamental architectural contradiction. They must decide which document to trust, and neither provides guidance on resolution.
3. Kafka for a 3-5 engineer team with < 50 concurrent users is massive over-engineering. A Kafka cluster requires broker management, ZooKeeper (or KRaft) configuration, topic management, consumer group monitoring, Schema Registry maintenance, and partition rebalancing. These operational concerns are larger than the entire AstraPlanner backend.
4. The CQRS pattern in Section 5.3 specifies "Event Store -> Kafka topic: domain.plan.* -> Projection Workers -> Read Model DBs" -- a distributed systems architecture that requires eventual consistency management, projection rebuilds, and blue-green deployment of read models. For MVP, a simple PostgreSQL trigger that updates a materialized view achieves the same result.

**What is the INVARIANT:**
- Domain events as the inter-module communication mechanism.
- The event envelope structure (event_id, event_type, tenant_id, correlation_id, causation_id, payload).
- The domain event catalog (DemandForecastUpdated, PlanGenerated, ShiftAssigned, etc.).
- Producer-consumer relationships (who produces which events, who consumes them).
- Saga patterns for multi-step workflows (PlanGenerationSaga, PlanApprovalSaga).
- Latency SLAs per event type.
- The concept of event replay for audit and debugging.

**What is the IMPLEMENTATION:**
- Event transport: Kafka vs Supabase Realtime + Database Webhooks vs SQS vs RabbitMQ.
- Event storage: Kafka topics with infinite retention vs PostgreSQL events table vs dedicated event store.
- Schema management: Confluent Schema Registry vs JSON Schema validation in application code vs Zod runtime validation.
- Read model projection: Kafka consumer workers vs PostgreSQL triggers vs Supabase Database Webhooks.
- CQRS: full CQRS with separate read/write stores vs simplified read caching with TanStack Query.

**What document should contain what:**
- `event-architecture.md` should own the **invariant**: event catalog, event envelope, producer-consumer map, saga patterns, latency SLAs, replay concepts. All Kafka-specific references should be removed.
- `tech-stack.md` Section 3.7 should own the **MVP implementation**: Supabase Realtime for frontend events, Database Webhooks -> Edge Functions for backend event processing, PostgreSQL `events` table for durable event storage. This section already exists and describes the correct MVP approach.
- A Phase 3 section (either in event-architecture.md or a separate document) should describe the migration path to a dedicated event bus (Kafka or equivalent) if/when scale demands it.

**Fix:** Rewrite event-architecture.md to be transport-agnostic. Remove the Kafka cluster diagram, topic specifications, partition strategies, Schema Registry references, and consumer group patterns. Preserve the domain event catalog, event envelope, saga patterns, and concrete event flow examples (these are the document's greatest strengths). Add a "Transport Selection" section that says: "MVP uses Supabase Realtime + Database Webhooks (see tech-stack.md). Enterprise-scale deployments may migrate to a dedicated event bus."

---

## Summary of Mixing Patterns

| Error | Document | Invariant Mixed With | Phase Impact |
|-------|----------|---------------------|-------------|
| 1 | algorithm-strategies.md | Solver I/O contract mixed with broken GA encoding | Developer implements broken GA instead of focusing on HiGHS MIP |
| 2 | optimization-strategy.md | Workload formulas mixed with 7-level config hierarchy | Developer builds 7-level hierarchy when 3 levels suffice for MVP |
| 3 | event-architecture.md | Domain event catalog mixed with Kafka infrastructure | Developer sets up Kafka instead of using Supabase Realtime |
| 4 | wizard-logic.md | Smart defaults concept mixed with fleet learning algorithms | Developer builds fleet learning pipeline with zero tenant data |
| 5 | constraint-handling.md | Constraint model mixed with 14 jurisdiction-specific rule sets | Developer hardcodes jurisdiction values instead of configuring them |
| 6 | scenario-simulation.md | What-if comparison mixed with Monte Carlo simulation | Developer scopes Monte Carlo into Phase 1 scenario feature |
| 7 | data-entities.md + wizard-flow.md | Proficiency concept mixed with hardcoded scale sizes (4 vs 5) | Solver misinterprets skill levels, causing systematic planning errors |
| 8 | ai-integration.md | AI capability requirements mixed with Ruflo orchestration | Developer integrates experimental framework into production stack |
| 9 | tech-stack.md | Launch stack mixed with Phase 2/3 technologies | Developer budgets 10-16 weeks for features not in MVP scope |
| 10 | event-architecture.md + system-overview.md (original) | Domain events mixed with Kubernetes/Kafka infrastructure | Developer faces architectural contradiction between two documents |

---

## The Root Cause

All 10 mixing errors share the same root cause: **the documentation was written as a vision document, not an implementation specification.** Vision documents describe the end state. Implementation specifications describe what to build now and what to build later. When vision and implementation are mixed in the same document at the same level of detail, every concept appears equally urgent and equally ready to build.

**The fix pattern is consistent across all 10 errors:**
1. Identify the invariant (the business concept or interface that must hold regardless of technology choice).
2. Identify the implementation (the specific technology, algorithm, or configuration that realizes the invariant).
3. Put the invariant in a domain document with no technology references.
4. Put the implementation in a technology document with explicit phase annotations.
5. If an implementation is Phase 2 or later, mark it clearly and do not include it in Phase 1 specifications.
