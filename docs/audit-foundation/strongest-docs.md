# AstraPlanner Foundation Audit: Strongest Documents

> Audit date: 2026-03-20
> Scope: All 60 documents (2.1 MB), zero code
> Purpose: Identify the 10 documents most likely to survive contact with a real engineering team

---

## Evaluation Criteria

Each document was assessed on five dimensions:

1. **Engineering Actionability** -- Could a developer read this and start building without asking 20 clarifying questions?
2. **Domain Authenticity** -- Does this reflect real operational knowledge, not just research summaries?
3. **Internal Consistency** -- Does the document contradict itself or other documents?
4. **Non-Obvious Insight** -- Does it contain knowledge that is genuinely hard to acquire without industry experience?
5. **Load-Bearing Status** -- If this document were wrong, would the whole architecture fail?

---

## Top 10 Strongest Documents

### 1. `01-philosophy/failure-modes.md`

**Score: 9/10**

**Why it is strong:** This is the single best document in the entire knowledge base. It catalogs 24 failure modes across 5 categories (Data, Model, Process, Human, Scale) with a structure that is rare even in mature enterprise software documentation: root cause, observable symptoms, real-world logistics analogy, and AstraPlanner-specific mitigation for every failure.

**Best section:** Category 4: Human Failures. The analysis of Override Fatigue (4.1), Trust Collapse (4.2), and Gaming the System (4.3) reflects genuine operational experience. The observation that "resistance to change is rational, not irrational" (Failure 4.5) and the mitigation strategy of crediting planner overrides when they outperform the AI -- these are insights that come from watching real implementations fail, not from reading textbooks.

**Non-obvious insights:**
- Survivorship bias in historical data (Failure 1.5) -- the recognition that planning models trained on past decisions inherit discrimination and under-investment patterns. The forklift/gender example is concrete and actionable.
- Skill mismatch propagation (Failure 2.3) -- that a single misassignment cascades through process flow, reducing system throughput even when every individual station appears adequately staffed. This is a systems-thinking insight that most scheduling software ignores.
- The severity/likelihood/detection matrix at the end provides a genuine prioritization framework.

**How to use during build:** This document should be the primary test case generator. Each failure mode maps directly to an integration test scenario. The QA team should maintain a 24-row test matrix where each row verifies one mitigation strategy.

**Load-bearing assessment:** Moderately load-bearing. If the failure modes are wrong, the mitigations built into the architecture would be misplaced -- but the core planning engine would still function. The document's primary value is defensive design, not structural architecture.

---

### 2. `05-optimization-engine/constraint-handling.md`

**Score: 8.5/10**

**Why it is strong:** This document contains the most legally actionable content in the entire knowledge base. It catalogs hard and soft constraints with jurisdiction-specific legal citations (EU Working Time Directive article numbers, California Labor Code sections, German ArbZG paragraphs). The constraint relaxation priority order (Section 6.1) is a genuinely useful engineering specification.

**Best section:** Section 8: Jurisdiction-Specific Constraint Profiles. The US Federal vs US California vs EU General vs UK Post-Brexit comparison tables provide the kind of structured legal data that would take weeks to compile from primary sources. The level of detail -- California's 7th-consecutive-day overtime rule, Germany's mandatory Sunday rest, Australia's "reasonable overtime" standard -- reflects real compliance research.

**Non-obvious insights:**
- The infeasibility diagnosis algorithm (Section 7.1) -- isolating the bottleneck, identifying binding constraints per candidate, and suggesting minimum relaxation actions -- is a genuinely useful solver design pattern that most documentation would leave as "report infeasible."
- The recognition that soft constraint penalties are on "incomparable scales" (identified as bug A7 in REVIEW-FULL.md) is actually a strength of the document's honesty about an unsolved problem.
- The partial relaxation strategy (Section 6.2) using graduated weight reduction rather than binary relaxation is a sophisticated technique.

**How to use during build:** The hard constraint table (Section 2) becomes the solver's constraint specification. The jurisdiction profiles (Section 8) become seed data for the compliance configuration. The infeasibility report structure (Section 7.2) becomes the API contract for solver diagnostic output.

**Load-bearing assessment:** Highly load-bearing. If the hard constraints are specified incorrectly (and some are -- see L3, L4 in REVIEW-FULL.md), every plan the system produces could be non-compliant. The 6 legal errors identified in the review must be fixed before this document can be trusted for implementation.

**Reliability verdict:** 7/10. Strong framework, but the identified legal errors (US Federal rest rules, EU consecutive days as soft penalty) mean an engineer should not build directly from this document without legal review.

---

### 3. `06-ux-control-layer/planning-adjustments.md`

**Score: 8.5/10**

**Why it is strong:** This is the most implementation-ready UX document in the set. It specifies 7 adjustment types (swap, shift change, process reassignment, add/remove shift, override capacity, lock assignments, bulk adjustments) with complete validation rules, UI interaction patterns, and approval workflows. The constraint validation response time target (< 200ms) and the cascade impact analysis are engineering-grade specifications.

**Best section:** Section 5: Constraint Validation. The three-level validation (field-level, cross-field, cross-phase) with blocking vs advisory classification and the specific UI mockups for constraint violation dialogs are exactly what a frontend engineer needs. The cascade impact analysis panel (Section 5.4) showing how moving one employee creates downstream gaps is a rare UX specification that anticipates real operational complexity.

**Non-obvious insights:**
- The lock percentage warning (Section 3.6) -- alerting when >30% of assignments are locked, which over-constrains the optimizer -- is an insight from real optimization system UX, not theoretical design.
- The approval workflow matrix (Section 7.2) distinguishing between cost-neutral swaps (no approval) and cost-increasing changes (approval required) reflects real organizational behavior patterns.
- The "Fill This Gap" AI behavior (Section 6.1) with its composite scoring factors (skill match 30%, availability quality 20%, cost efficiency 20%, fatigue risk 15%, fairness 10%, development value 5%) provides an actionable candidate ranking algorithm.

**How to use during build:** This document is the frontend engineering specification for the Planning Workbench. The adjustment type table (Section 10) is a feature checklist. The approval workflow (Section 7.1) is a state machine specification. The AI-assisted adjustment flows (Section 6) are the product requirements for the AI integration layer.

**Load-bearing assessment:** Moderately load-bearing. The Planning Workbench is the primary user interface, so if the adjustment taxonomy is wrong, the user experience breaks. However, the core planning engine operates independently.

---

### 4. `01-philosophy/planning-principles.md`

**Score: 8/10**

**Why it is strong:** The 10 principles are not generic software principles reworded for planning. They contain logistics-specific domain knowledge expressed as architectural invariants. The concrete examples (cold-chain warehouse with three temperature zones, transport depot driver allocation, parcel distribution hub demand signals) are drawn from real operations.

**Best section:** The Principle Interaction Matrix (final section). This is extraordinarily rare in documentation. Most teams define principles and treat them as independent. This document explicitly identifies where principles conflict (Override vs Probabilistic: "Override of a high-confidence plan should carry explicit risk acknowledgment") and where they reinforce (Demand + Temporal: "Demand signals decay; temporal awareness ensures plans update"). This matrix is a design decision framework.

**Non-obvious insights:**
- Principle 2 (Workload Is the Translation Layer) -- the recognition that demand arrives in heterogeneous units (pallets, orders, parcels) and must be converted to a common currency (hours of effort by skill type) before planning can begin. This is the fundamental insight that separates workforce planning from simple scheduling.
- Principle 8 (Temporal Awareness) -- the concept of a "freshness half-life" that varies by decision level (strategic: 30 days, reactive: 30 minutes) is operationally grounded and architecturally useful.

**How to use during build:** Every architectural decision should be tested against the 10 principles. The interaction matrix should be posted in the team workspace. When two features conflict, the matrix provides the resolution framework.

**Load-bearing assessment:** Highly load-bearing as a design compass. If these principles are wrong, every design decision derived from them is misguided. The principles themselves appear sound -- the risk is not that they are wrong but that implementations may not enforce them.

---

### 5. `02-system-architecture/integration-architecture.md`

**Score: 8/10**

**Why it is strong:** This document demonstrates real enterprise integration knowledge that cannot be faked. The system-specific details -- SAP BTP authentication, Workday RaaS prerequisite configuration, Korber's JDBC fallback for on-premise deployments, BambooHR's limited filtering requiring full dataset pull and local diff -- are details that come from actually integrating with these systems.

**Best section:** Section 3: System-Specific Integration Details. Each system has a table covering protocol, authentication, inbound/outbound data, sync frequency, and implementation considerations. The consideration notes are where the real knowledge lives: "NetSuite has a governance limit (concurrent requests). Adapter uses SuiteQL for efficient batch queries." "Workday tenant configuration varies; field mapping must be customizable per tenant."

**Non-obvious insights:**
- The data freshness SLA table (Section 6) with tiered freshness requirements (WMS streaming: <5 seconds, HRIS webhook: <15 minutes, payroll: <48 hours) reflects real operational priorities.
- The telemetry pipeline architecture (Section 3.6) with MQTT-to-Kafka bridge and multi-granularity aggregation (1-min, 5-min) is a production-grade design.
- The circuit breaker pattern with per-connector state stored in Redis is an operational necessity that most documentation omits.

**How to use during build:** This document is the integration team's playbook. Each system-specific table becomes a connector implementation ticket. The data freshness SLAs become monitoring alert thresholds. The error handling table (Section 5) becomes the connector retry/circuit-breaker configuration.

**Load-bearing assessment:** Moderately load-bearing. Integration is essential for production use, but incorrect integration specs affect data quality, not system architecture. The risk is operational (stale data) rather than structural.

---

### 6. `07-implementation/tech-stack.md`

**Score: 7.5/10**

**Why it is strong:** The technology decision matrix (Section 7) is the strongest section -- each choice includes not just the selection but the specific alternatives considered and why they were rejected. This is valuable because it prevents re-litigating decisions. The bundle size budget (Section 9) with per-route targets is a practical performance specification.

**Best section:** The state management architecture (Section 2.3) separating server state (TanStack Query), client UI state (Zustand), URL state (nuqs), real-time state (Supabase Realtime), and form state (React Hook Form) is a well-thought-out decomposition that would prevent the common React anti-pattern of putting everything in one global store.

**Non-obvious insights:**
- The HiGHS WASM lazy-loading strategy (2.5 MB binary loaded only on optimization trigger, cached via Service Worker) is a practical solution to the bundle size problem of shipping a solver to the browser.
- The dual-track event system (Track 1: Supabase Realtime for UI updates, Track 2: Database Webhooks for backend processing) avoids the common mistake of using one event system for both purposes.

**How to use during build:** This is the developer onboarding document. Every technology choice includes enough context for a new team member to understand why it was selected. The version compatibility matrix (Section 8) prevents dependency conflicts.

**Load-bearing assessment:** Highly load-bearing. If the tech stack is wrong (and some contradictions exist -- see REVIEW-FULL.md Section 1.1), every engineering decision downstream is affected. The identified contradictions between this document and system-overview.md have been flagged for resolution.

**Reliability verdict:** 6.5/10. The tech stack itself is sound but contains contradictions with other documents (Kafka vs Supabase Realtime, Neo4j vs pgvector, team size 15-20 vs 3-5). The resolution notes indicate system-overview.md is being rewritten to align, but until that is complete, an engineer must treat this document as authoritative over system-overview.md.

---

### 7. `03-setup-wizard/wizard-flow.md`

**Score: 7.5/10**

**Why it is strong:** This is the most detailed UX specification in the entire knowledge base. 8 phases with per-field input tables, validation rules, AI assistance descriptions, and time estimates. The process template tables (Section 5) with industry-specific productivity standards are genuinely useful seed data.

**Best section:** Phase 3: Process Definition. The pre-built process templates for E-commerce Fulfillment (14 processes with default productivity rates) and Grocery Distribution (11 processes) contain domain-specific numbers that appear calibrated to real-world operations. The validation rules (productivity standards > 3 standard deviations from benchmark trigger a warning) show operational sophistication.

**Non-obvious insights:**
- The cold-storage-specific process defaults (maximum 90 min continuous freezer exposure, mandatory warm-up breaks) reflect regulatory knowledge of cold-chain warehouse operations.
- The AI process gap detection ("You have Picking and Shipping but no Packing process") is a genuinely useful onboarding feature specification.

**How to use during build:** The field tables are the form specification. The validation rules are the validation logic specification. The AI assistance descriptions are the AI integration requirements. The time estimates (75-145 minutes for single site) should be treated with skepticism (see wizard-gap-analysis.md in audit/) but the phase structure is sound.

**Load-bearing assessment:** Moderately load-bearing. The wizard is the first user experience, so if it is wrong, onboarding fails. However, configuration can be corrected post-wizard.

**Reliability caveat:** The "75-145 minutes" time estimate for full setup has been flagged as unrealistic by the audit. Real-world onboarding for a logistics planning tool of this complexity typically takes days to weeks, not hours. The wizard design is strong but the time claims are aspirational.

---

### 8. `07-implementation/ai-integration.md`

**Score: 7.5/10**

**Why it is strong:** This document does something rare: it specifies 5 concrete AI use cases with implementation architectures, prompt designs, fallback strategies, and cost models. The PII stripping middleware architecture (Section 10) with its anonymization pipeline is a responsible design.

**Best section:** Section 9: Fallback Strategy When AI Is Unavailable. This is the most important section because it demonstrates defensive design thinking. Every AI feature has a non-AI fallback: wizard falls back to templates, insights fall back to rule-based alerts, NLQ falls back to a "use the search controls" message, semantic search falls back to pg_trgm trigram search. The circuit breaker configuration (Section 9.4) with specific thresholds is implementation-ready.

**Non-obvious insights:**
- The query cost tier model (Section 4.5) with simple lookups at $0.001 routed to Haiku and complex multi-step reasoning at $0.15 routed to Opus shows real AI cost management thinking.
- The security constraint that Claude never generates raw SQL but instead generates tRPC procedure calls (Section 4.3) is an architecturally important guardrail.
- The per-tenant AI budget model (Section 8.3) with tier-specific limits and overage handling is a practical SaaS billing consideration.

**How to use during build:** Each use case section is an implementation ticket. The prompt designs (abbreviated but structurally complete) are starting points for prompt engineering. The cost model should inform pricing decisions.

**Load-bearing assessment:** Low-to-moderate. AI features are augmentation, not core architecture. The fallback strategies ensure the system functions without AI. The risk is that AI cost projections are wrong (and they likely are -- LLM pricing changes frequently).

---

### 9. `08-risks-and-gaps/edge-cases.md`

**Score: 7.5/10**

**Why it is strong:** This document catalogs 28 edge cases that are genuinely likely in logistics operations: zero demand days with skeleton crews, demand spikes beyond physical capacity, mass absence events (>30%), employees at multiple sites, DST transitions affecting shift durations. Each edge case includes scenario description, expected system behavior, and implementation notes.

**Best section:** EC-D3: Negative Demand Adjustment (Cancellation Wave). The scenario of a major customer canceling orders mid-day after the plan is published is operationally realistic. The specification that the system must account for minimum shift length guarantees, reporting time pay obligations, and provide three options (send home early, reassign, do nothing) reflects real logistics management decisions.

**Non-obvious insights:**
- EC-P5 (DST transition): The recognition that a "10 PM - 6 AM" shift is 7 hours during spring-forward but 9 hours during fall-back, and that payroll may require "paid hours = 8, worked hours = 7" is a detail that breaks real scheduling systems.
- EC-W8 (seasonal bulk onboarding): The productivity ramp curve (60% week 2, 80% week 3, 100% week 4) treated as a solver multiplier is operationally grounded.
- EC-S3 (database failover during plan generation): Specifying that plan generation must be transactional and the write must be atomic is an infrastructure requirement that most documentation ignores.

**How to use during build:** Each edge case is a test scenario. The P0 edge cases (12 total) should be handled before any production deployment. The implementation notes provide design guidance.

**Load-bearing assessment:** Not structurally load-bearing, but operationally critical. If edge cases are not handled, the first week of real-world use will destroy user trust.

---

### 10. `10-ai-layer/automation-layer.md`

**Score: 7/10**

**Why it is strong:** The 5-level automation spectrum (L0-L4) with earned autonomy model is a sophisticated design that avoids the common trap of binary automation (on/off). The safety boundaries (Section 4) -- 7 inviolable rules that automation never crosses -- are well-reasoned and include the critical rule that plan publication always requires human confirmation.

**Best section:** Section 3: Earned Autonomy Model. The earning criteria (acceptance rate, volume, recency, outcome quality) with specific thresholds for each level transition (e.g., Level 2 to Level 3 requires >85% acceptance rate, 50+ suggestions evaluated, outcomes within 5% of human decisions) provide a concrete, implementable trust-building mechanism. The demotion triggers (3 consecutive rejections, adverse outcome) prevent runaway automation.

**Non-obvious insights:**
- The eligibility matrix (Section 2) that caps certain actions at specific automation levels regardless of earned trust -- plan publication is always L0, overtime approval is always L1, certification expiry alerts can reach L4 -- reflects thoughtful risk stratification.
- The emergency stop mechanism with automatic reversion of in-flight actions within their undo window is a critical safety feature.
- The SQL schemas for autonomy tracking (autonomy_levels, autonomy_history, automated_actions) are executable specifications.

**How to use during build:** This is a V2/V3 feature but the safety boundaries (Section 4) should be enforced from day 1. The inviolable rules should be implemented as guard clauses in the API layer even before any automation exists. The SQL schemas can be created as part of the initial migration.

**Load-bearing assessment:** Not load-bearing for MVP (automation is deferred). However, the safety boundaries should be considered architectural constraints that inform the design of human-in-the-loop workflows from the start.

---

## Load-Bearing Documents Assessment

Three documents are genuinely load-bearing -- if they are wrong, the architecture fails:

| Document | Load-Bearing Element | Reliability | Risk |
|----------|---------------------|-------------|------|
| `constraint-handling.md` | Legal compliance rules that the solver enforces | 7/10 -- 6 identified legal errors | HIGH: Non-compliant plans expose customers to liability |
| `planning-principles.md` | Architectural invariants that guide every design decision | 8.5/10 -- principles are sound, interaction matrix is valuable | MEDIUM: If principles are wrong, design decisions derived from them are misguided |
| `tech-stack.md` | Every engineering decision depends on the technology choices | 6.5/10 -- contradicts system-overview.md in several areas | HIGH: Unresolved contradictions block development |

**Overall reliability of load-bearing documents: 7.3/10.**

The identified contradictions and legal errors must be resolved before these documents can be trusted for implementation. The constraint-handling.md legal errors are the highest priority because they affect compliance liability.

---

## Summary

The strongest documents share common qualities:
- They contain **domain-specific knowledge** that cannot be generated from generic software documentation
- They include **concrete examples** from real logistics operations (cold chain, parcel sorting, 3PL multi-client)
- They specify **failure modes and fallbacks**, not just happy paths
- They acknowledge **tensions and trade-offs** rather than pretending everything is solved

The weakest aspect of even the strongest documents is the gap between specification and implementation. These are detailed enough to guide design but not detailed enough to write code against without additional work -- particularly the optimizer I/O contract, the plan state machine, and the absence data model, all of which are identified as missing in the critical reviews.
