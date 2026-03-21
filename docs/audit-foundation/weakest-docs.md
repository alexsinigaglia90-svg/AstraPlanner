# AstraPlanner Foundation Audit: Weakest and Most Misleading Documents

> Audit date: 2026-03-20
> Scope: All 60 documents (2.1 MB), zero code
> Purpose: Identify the 10 documents most likely to mislead an implementation team

---

## Evaluation Criteria

Each document was assessed for:
1. **Misleading Confidence** -- Does the document present speculation as fact?
2. **Fabricated Data** -- Are benchmarks, statistics, or performance claims invented?
3. **Over-Engineering** -- Is the document designing for Year 5 when Year 0 has not started?
4. **Contradictions** -- Does it disagree with other documents in the set?
5. **Unvalidated Claims** -- Does it make promises that have not been tested?

---

## Top 10 Weakest or Most Misleading Documents

### 1. `05-optimization-engine/algorithm-strategies.md`

**Risk Level: CRITICAL**

**What is wrong:** This document presents fabricated benchmark data as empirical results, describes a broken GA chromosome encoding, and makes unmeasurable performance claims.

**Specific problems:**

- **Section 9.3: Benchmark Results are fabricated.** The table shows solve times for 9 problem instances across 4 solver strategies on "a standard server (8-core, 32 GB RAM)." No solver implementation exists. No benchmarks have been run. No code exists. These numbers are invented and presented with two-decimal-place precision (e.g., "0.02s / 8.2%", "55s / 2.8%"), creating a false impression of empirical measurement. This was identified as bug A1 in REVIEW-FULL.md.

- **Section 5.2.1: GA chromosome encoding is broken.** The encoding assigns one employee per slot (`a[s]` = employee ID for slot s). Real planning slots require multiple employees (30 pickers for one process-time slot). The encoding collapses multi-employee slots into single-employee assignments. An engineer implementing this encoding would produce a fundamentally non-functional solver. (Bug A2 in REVIEW-FULL.md.)

- **Section 6.6: "95-99% of optimal" claim is unmeasurable.** For multi-objective problems (cost + coverage + fairness + preferences), "optimal" depends on the weight vector. Claiming a percentage of optimal without specifying the weight vector is meaningless. (Bug A8.)

- **Section 6.4 Phase 3: "SA at low temperature" is hill climbing.** Starting Phase 3 at low temperature and accepting only improvements eliminates SA's primary advantage (escaping local optima). The document describes hill climbing while calling it simulated annealing. (Bug A3.)

**Risk if an engineer trusts it:** They would implement a GA solver with a broken encoding that cannot produce valid multi-employee assignments, calibrate infrastructure based on fabricated performance numbers, and present unmeasurable quality claims to customers.

**Recommendation:** REWRITE. Strip all benchmark data. Fix the GA encoding to support multi-employee slots. Remove the "95-99% of optimal" claim. For MVP, cut GA/SA entirely (per REVIEW-FULL.md and SYSTEMS-REVIEW.md recommendations) and focus on Greedy + HiGHS MIP.

---

### 2. `03-setup-wizard/wizard-logic.md`

**Risk Level: HIGH**

**What is wrong:** This document describes a "Fleet Learning Defaults" system (Layer 4) that cannot exist at launch, presents AI suggestion confidence scores as calibrated probabilities, and proposes a 7-level configuration hierarchy that is over-engineered.

**Specific problems:**

- **Section 2.5: Fleet Learning Defaults require n>=30 comparable configurations.** The document presents specific fleet-learned defaults ("Picking Productivity: 118 UPH, n=142", "Break Stagger %: 12%, n=67") as if they already exist. At launch, the fleet database will have zero entries. These numbers are fabricated benchmarks for a system that has no data. An engineer building the fleet learning infrastructure before launch is wasting time. (Weak assumption W10 in REVIEW-FULL.md.)

- **Section 6.2: AI suggestion confidence scores are not calibrated probabilities.** The pipeline scores suggestions on "data support, specificity, actionability" but calls the result a "confidence" score. LLM confidence is not frequentist probability. A 92% confidence badge on a shift pattern suggestion does not mean the suggestion is correct 92% of the time. (Weak assumption W3.)

- **Section 2.1: 7-level Smart Defaults hierarchy (Global > Industry > Site Type > Regional > Fleet Learning) is over-engineered.** Three levels (org > site > override) is sufficient for MVP. The 7-level hierarchy introduces configuration inheritance bugs that are notoriously difficult to debug. (Over-engineering item in REVIEW-FULL.md.)

- **Section 4.2: Complexity Scoring.** The system scores each wizard screen's complexity from 1-10 and adjusts AI suggestion detail accordingly. This meta-system adds implementation complexity without demonstrated user value. No user research validates that complexity-adaptive AI responses improve outcomes.

**Risk if an engineer trusts it:** They would build fleet learning infrastructure that has no data to serve, display confidence badges that mislead users about suggestion reliability, and implement a 7-level configuration hierarchy that creates debugging nightmares.

**Recommendation:** SIMPLIFY. Remove fleet learning from MVP (use expert-curated static defaults). Remove confidence scores from AI suggestions or relabel as "relevance scores." Reduce configuration hierarchy to 3 levels. Defer complexity scoring until post-launch user research validates the concept.

---

### 3. `10-ai-layer/ai-vision.md` (and related AI layer documents)

**Risk Level: HIGH**

**What is wrong:** The 11 documents in the AI Intelligence Layer (Section 10) collectively describe a system so sophisticated that building it would consume the entire engineering budget before the core planning engine exists.

**Specific problems:**

- **ai-architecture.md: Three-Plane Architecture** (Deterministic/Intelligence/Interaction) with 9 database schemas, event-driven learning pipelines, and online/offline model training. This is a machine learning platform specification, not an MVP feature.

- **learning-model.md: Four learning mechanisms** (rules, statistics, ML, LLM) with online learning, offline batch training, confidence calibration, and model versioning. There is no training data. There are no users. There is no operational history. Building learning infrastructure before having data to learn from is premature.

- **organizational-intelligence.md: Site fingerprints and cross-site benchmarking** with anomaly detection. Requires multi-tenant operational data that will not exist for 12-24 months post-launch.

- **user-intelligence.md: Per-user cognitive models** with decision pattern tracking and behavioral segmentation. Privacy implications aside, this requires months of user behavior data that does not exist.

- **recommendation-engine.md: 13 recommendation types** with a 7-step generation pipeline, timing intelligence, and fatigue management. The recommendation engine is more complex than the core planning engine.

**Risk if an engineer trusts it:** The AI layer documents describe approximately 80-120 weeks of engineering work. If treated as MVP requirements, they would consume the entire development budget while the core planning engine -- the thing that actually needs to work -- remains unbuilt. This is the "documentation spiral" identified in the audit's structural weaknesses.

**Recommendation:** DEFER entirely to V2/V3. For MVP, implement only: (1) setup wizard NLU entity extraction, (2) daily metric-based insights (deterministic rules, not ML), (3) plan explanation templates. The 11 AI layer documents should be archived as vision documents with a clear "NOT FOR MVP" label.

---

### 4. `02-system-architecture/event-architecture.md`

**Risk Level: HIGH**

**What is wrong:** This document specifies a full CQRS + event sourcing architecture with sagas, compensating transactions, and an event bus infrastructure that contradicts the chosen tech stack.

**Specific problems:**

- **Event sourcing for plan versioning** is identified as over-engineered in both REVIEW-FULL.md and SYSTEMS-REVIEW.md. Snapshot-per-version (storing the full plan state at each version) delivers the same audit capability at a fraction of the complexity. Event sourcing adds event replay logic, event versioning, snapshot management, and eventual consistency concerns -- none of which are justified for a planning tool.

- **The document describes Apache Kafka as the event bus** while tech-stack.md specifies Supabase Realtime. These are fundamentally different technologies with different operational characteristics. An engineer reading this document would design for Kafka (consumer groups, partition strategies, Avro schemas) while the rest of the team builds on Supabase Realtime.

- **Saga orchestration with compensating transactions** is enterprise middleware complexity. The scenarios described (multi-step plan approval with rollback) can be handled with simple database transactions at MVP scale.

**Risk if an engineer trusts it:** They would implement event sourcing (3-4 weeks), Kafka infrastructure (2-3 weeks), and saga orchestration (2-3 weeks) -- approximately 7-10 weeks of work -- that is unnecessary for MVP and contradicts the chosen tech stack.

**Recommendation:** DELETE or relabel as "V3 Vision." For MVP, use Supabase Realtime for UI events, database webhooks for backend events, and snapshot-per-version for plan history.

---

### 5. `06-ux-control-layer/scenario-simulation.md`

**Risk Level: MEDIUM-HIGH**

**What is wrong:** This document specifies a Monte Carlo simulation engine with statistical rigor that is inappropriate for the current phase and contains a fundamental methodological flaw.

**Specific problems:**

- **Monte Carlo on heuristic solver is statistically invalid.** Each iteration uses the greedy heuristic (85-92% of optimal) to save time. This means the confidence intervals mix real demand uncertainty with artificial solver suboptimality noise. The P90 cost estimate includes both "demand might be higher" and "the solver might find a worse solution." These are conflated, making the confidence intervals meaningless. (Bug A4 in REVIEW-FULL.md.)

- **1,000-10,000 iterations with Latin Hypercube Sampling and correlation matrices** is academic overkill for a product that has zero users. Simple what-if analysis (change one variable, see the result) delivers 80% of the value at 10% of the cost. (Over-engineering item in REVIEW-FULL.md.)

- **The document specifies features that depend on statistical models that do not exist:** demand correlation matrices, forecast confidence distributions, and sensitivity analysis. These require historical operational data to calibrate. At launch, there is no data.

**Risk if an engineer trusts it:** They would build a Monte Carlo engine (4-6 weeks) that produces statistically invalid results and cannot be calibrated until months of operational data accumulates. The simple what-if feature that users actually need would be delayed.

**Recommendation:** DEFER to V2. For MVP, implement simple what-if: the user changes one input (demand +20%, 5 employees absent), the system re-runs the solver with modified inputs, and displays the result alongside the base plan. No Monte Carlo, no correlation matrices, no LHS.

---

### 6. `04-data-model/data-entities.md`

**Risk Level: HIGH (due to bugs, not ambition)**

**What is wrong:** This document is the foundational data model specification, but it contains 14 bugs that would break the optimizer and the UX if built as documented. These are not gaps or wishes -- they are schema errors.

**Specific problems (from REVIEW-FULL.md Part 2):**

- **D1: DemandForecast UNIQUE constraint breaks sub-daily planning.** The constraint is on `(org_id, site_id, demand_type_id, forecast_date, plan_version_id)`. Hourly forecasts produce 24 rows with the same `forecast_date`, violating uniqueness. The fix is to use `period_start timestamptz` instead of `forecast_date date`.

- **D5: Employee availability is buried in freeform JSONB** (`preferences_json`). No typed AvailabilityPattern entity exists. The optimizer must deserialize JSONB for every employee on every planning run, creating a performance bottleneck and preventing database-level constraint validation.

- **D6: WorkloadPlan uses a single `weighted_uph` per day.** Morning shifts (experienced workers) and evening shifts (trainees) have 40% different productivity rates. A single daily UPH systematically understaffs evenings and overstaffs mornings.

- **D7: No AbsenceRequest/LeaveRecord entity.** The system cannot distinguish "employee works Mondays" (template) from "employee is on vacation next Monday" (instance). Every plan ignores planned absences. This is a day-1 user failure.

- **D10: Materialized views don't inherit RLS.** Cross-tenant data leakage vector.

**Risk if an engineer trusts it:** They would build a schema that cannot store sub-daily demand, cannot track employee absences, and leaks data between tenants. Every plan produced by the optimizer would be wrong because it ignores absences and uses blended daily productivity rates.

**Recommendation:** REWRITE the data entities to fix all 14 bugs before any code is written. This is the highest-priority rewrite in the entire knowledge base because the schema is the foundation for everything else.

---

### 7. `05-optimization-engine/optimization-strategy.md` (referenced but not in the 18-file read list)

**Risk Level: MEDIUM-HIGH**

**What is wrong (based on cross-references in REVIEW-FULL.md and SYSTEMS-REVIEW.md):**

- **L4: EU 6-consecutive-day limit treated as a cost penalty, not a hard constraint.** In the EU, 6 consecutive working days is a legal maximum, not a suggestion. German law requires mandatory Sunday rest. Treating this as a "fatigue multiplier" soft constraint means the optimizer could produce plans that schedule 7+ consecutive days and merely add a cost penalty. This is non-compliant.

- **A6: Timing adjustment multiplication overcounts fatigue.** The formula `consecutive_day_factor * overtime_factor` treats correlated effects as independent. An employee on day 6 of consecutive work who is also in overtime gets a compounding penalty that produces absurd results (38% overhead). The effects are correlated, not independent.

- **The solver I/O contract is missing.** The algorithm documents describe 5 solver strategies but none define what data structure the solver consumes or produces. Without this contract, the frontend, backend, and test teams cannot build their components independently. (Identified in SYSTEMS-REVIEW.md Section 2.2.)

**Risk if an engineer trusts it:** They would implement a solver that produces non-compliant EU schedules and uses a faulty fatigue formula that distorts staffing calculations.

**Recommendation:** FIX the EU consecutive-day constraint to be a hard limit. Fix the fatigue formula to use `max(consecutive_day_factor, overtime_factor)` instead of multiplication. Write the solver I/O contract as TypeScript interfaces before any solver work begins.

---

### 8. `03-setup-wizard/wizard-ai-strategies.md`

**Risk Level: MEDIUM-HIGH**

**What is wrong:** This document describes 5 AI-powered setup strategies (NL setup, document upload, interview mode, clone from similar, benchmark comparison) that are collectively more complex than the core planning engine.

**Specific problems:**

- **Strategy 2: Document Upload.** The system accepts uploaded SOPs, shift schedules, and labor agreements, then uses Claude to extract entities. CBA (Collective Bargaining Agreement) parsing is identified as the highest-risk AI claim in the system (W9 in REVIEW-FULL.md). Legal language with intentional ambiguity, parsed by an LLM, where errors surface during union grievances -- the highest-stakes, lowest-tolerance failure mode possible.

- **Strategy 5: Benchmark Comparison.** Requires fleet data that does not exist at launch (W10).

- **L2: Nevada overtime rule handling is wrong.** The document describes AI extracting "federal_standard_40hr" for Nevada, but Nevada actually has daily overtime after 8 hours (NRS 608). The AI would produce non-compliant configurations.

- **L5: Auto-loaded jurisdiction rules create liability.** If the auto-loaded California break rules are wrong or stale, the customer faces compliance violations while believing AstraPlanner validated them. No disclaimer or verification workflow exists.

**Risk if an engineer trusts it:** They would build CBA parsing AI that will produce liability-creating errors, auto-load jurisdiction rules without disclaimers, and rely on benchmark data that does not exist.

**Recommendation:** SIMPLIFY to one AI strategy for MVP: natural language entity extraction (Strategy 1) with manual confirmation of every extracted entity. Defer document upload, interview mode, and benchmark comparison. Add prominent disclaimers to all auto-loaded jurisdiction rules: "These rules are starting points. You are responsible for verifying compliance with your local regulations."

---

### 9. `04-data-model/scalability-design.md`

**Risk Level: MEDIUM**

**What is wrong:** This document designs for enterprise scale (5,000 sites, 500,000 employees) before the system handles one site with 50 employees. It also contains technically incorrect PostgreSQL commands.

**Specific problems:**

- **D11: `pg_dump --where` does not exist.** The archival command shown is not valid PostgreSQL. The correct approach is `COPY (SELECT ... WHERE ...) TO STDOUT`. An engineer following this document would get a syntax error. (Bug D11 in REVIEW-FULL.md.)

- **D14: 30-day notification retention violates predictive scheduling laws.** Some jurisdictions (San Francisco, Oregon) require schedule notification proof for 60-90 days. The specified 30-day retention would make the system non-compliant.

- **Premature volume estimates.** The document estimates data volumes at "Year 3" scale (100 million shift assignments, 500 million demand records) and designs partitioning strategies, time-series data tiers, and archival policies accordingly. This is useful vision but not actionable for MVP, and the implementation effort of table partitioning, time-series tiers, and automated archival would consume weeks of engineering time.

**Risk if an engineer trusts it:** They would implement table partitioning, archival pipelines, and time-series tiers for a system that currently has zero data, using a PostgreSQL command that does not work, with a retention policy that violates predictive scheduling laws.

**Recommendation:** DEFER scalability implementation to when actual data volumes justify it. Fix the `pg_dump` command. Increase notification retention to 90 days (covers the strictest known jurisdiction). Keep the scalability estimates as planning reference but do not implement until reaching 10+ sites.

---

### 10. `02-system-architecture/system-overview.md` (original version)

**Risk Level: CRITICAL (but resolution in progress)**

**What is wrong:** This document described a fundamentally different platform from what tech-stack.md specifies. It is the source of the most critical contradiction in the entire knowledge base.

**Specific problems (from REVIEW-FULL.md Part 1):**

- **Python 3.12 + Kubernetes vs TypeScript + Supabase Edge Functions.** Two completely different runtime environments, requiring different skills, different infrastructure, and different engineering decisions.

- **Apache Kafka vs Supabase Realtime.** Two different event systems with different operational characteristics.

- **Neo4j + TimescaleDB + InfluxDB vs PostgreSQL + pgvector.** Three additional databases vs one.

- **15-20 engineers + DevOps vs 3-5 engineers.** Completely different team size assumptions.

- **The document also describes a built ML forecasting engine (ARIMA, Prophet, XGBoost)** as a core component, while gap-analysis.md lists it as a critical gap requiring "3-4 months, 2 engineers" in V2.

**Risk if an engineer trusts it:** They would architect for Kubernetes, Kafka, and Neo4j while the rest of the team builds on Supabase and Vercel. The resulting system would be unbuildable.

**Recommendation:** The INDEX.md notes this document has been rewritten to align with the Supabase stack. Verify the rewrite is complete and all references to the old architecture (Python, Kafka, Neo4j, Kubernetes) have been removed from every document in the knowledge base. The old version should be deleted, not archived, to prevent confusion.

---

## Pattern Analysis

The weakest documents share common anti-patterns:

1. **Fabricated empirical data.** Benchmark tables with precise numbers (solve times to two decimal places, sample sizes of n=142) for a system with zero code. This creates false confidence in infrastructure sizing and performance claims.

2. **Designing for Year 5 before Day 1.** Fleet learning, organizational intelligence, Monte Carlo with correlation matrices, CQRS event sourcing -- all designed in detail for a maturity level that is years away, while the foundational schema has bugs that prevent Day 1 functionality.

3. **AI as magic.** CBA parsing, fleet benchmarking, confidence-calibrated suggestions -- the AI layer documents consistently overestimate what LLMs can reliably do in production while underspecifying the deterministic systems that must work regardless of AI availability.

4. **Missing the simple version.** For every feature, the documents jump to the sophisticated implementation without specifying the simple version that should ship first. What-if analysis before Monte Carlo. Manual skill management before skill decay models. Static defaults before fleet learning.

5. **Contradictions between documents.** The tech stack contradiction (Kafka vs Realtime, Python vs TypeScript) is the most severe, but there are at least 6 additional cross-document contradictions that would force an implementation team to spend their first month resolving conflicts.

---

## Summary Table

| Rank | Document | Core Problem | Action |
|------|----------|-------------|--------|
| 1 | algorithm-strategies.md | Fabricated benchmarks, broken GA encoding | REWRITE, cut GA/SA from MVP |
| 2 | wizard-logic.md | Fleet learning fiction, over-engineered hierarchy | SIMPLIFY to 3-level defaults |
| 3 | AI layer (11 docs) | 80-120 weeks of work disguised as features | DEFER to V2/V3 |
| 4 | event-architecture.md | Wrong tech stack, over-engineered | DELETE or label "V3 Vision" |
| 5 | scenario-simulation.md | Statistically invalid Monte Carlo | DEFER, build simple what-if |
| 6 | data-entities.md | 14 schema bugs | REWRITE (highest priority) |
| 7 | optimization-strategy.md | Non-compliant EU constraints, no I/O contract | FIX legal errors, write contract |
| 8 | wizard-ai-strategies.md | CBA parsing liability, missing disclaimers | SIMPLIFY to NL extraction only |
| 9 | scalability-design.md | Premature scaling, broken commands | DEFER, fix commands |
| 10 | system-overview.md (original) | Wrong architecture entirely | VERIFY rewrite is complete |
