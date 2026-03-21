# AstraPlanner Knowledge Base — Full Critical Review

> Conducted: 2026-03-20
> Reviewers: 4 parallel architecture review agents
> Scope: All 31 documents across 8 sections
> Status: **3 critical contradictions, 14 data model bugs, 19 missing documents, 8 over-engineered areas, 11 weak assumptions, 6 legally incorrect specifications**

---

## Verdict

This knowledge base is an **excellent vision document** but an **insufficient implementation spec**. It describes *what* to build with impressive domain fidelity, but not *how*. More critically, it contains irreconcilable contradictions between documents, data model bugs that would break the optimizer, and legally incorrect constraint specifications that would expose customers to compliance liability.

An implementation team reading these 31 documents would spend their first month resolving contradictions before writing a line of code.

---

## Part 1: Critical Contradictions (Blockers)

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

**Resolution:** `system-overview.md` has been rewritten to align with the Supabase stack.

### 1.2 Forecasting Engine: Exists and Doesn't Exist

- `system-overview.md` §4.1 describes a built ML forecasting engine (ARIMA, Prophet, XGBoost) as a core component.
- `gap-analysis.md` Gap 1 lists it as a critical gap requiring "3-4 months, 2 engineers" in V2.

**Resolution:** Forecasting is a V2 feature. MVP relies on external forecast ingestion.

### 1.3 Three Different Optimization Solver Architectures

| Document | Primary Solver | Fallback | Environment |
|----------|---------------|----------|-------------|
| tech-stack.md | HiGHS WASM | Python OR-Tools on Fly.io | Edge Function |
| system-overview.md | OR-Tools / Gurobi | Column generation | Kubernetes pods |
| optimization-strategy.md | HiGHS WASM | CP-SAT refinement | Not specified |

Gurobi costs $10,000+/year and cannot run in WASM. OR-Tools WASM is experimental.

**Resolution:** Standardize on HiGHS WASM for small/medium, Node.js-native HiGHS on Fly.io for large.

---

## Part 2: Data Model Bugs

These are not "gaps" — they are schema errors that would break the system.

| # | Bug | File | Impact |
|---|-----|------|--------|
| D1 | **DemandForecast UNIQUE constraint breaks sub-daily granularity.** Constraint is on `(org_id, site_id, demand_type_id, forecast_date, plan_version_id)`. Hourly forecasts produce 24 rows with the same `forecast_date`, violating uniqueness. Needs `forecast_period_start timestamptz` instead of `forecast_date date`. | data-entities.md | Blocks hourly demand planning |
| D2 | **ShiftAssignment can't represent split-process shifts.** Employee does picking 4hrs + packing 4hrs = 2 ShiftAssignment records. Break rules and daily-hours constraints must span both records. Not documented. | data-entities.md | Breaks cross-training use case |
| D3 | **ShiftAssignment overlap not prevented.** UNIQUE on `(employee_id, date, plan_version_id, start_time)` allows 06:00-14:30 AND 08:00-16:30 for the same employee. Needs exclusion constraint on time ranges. | data-relationships.md | Double-booking employees |
| D4 | **WorkloadPlan contradicts DemandForecast relationship.** 3 demand types mapping to same process creates 3 WorkloadPlan records, violating UNIQUE on `(org_id, site_id, process_id, plan_date, version_id)`. Must aggregate across demand sources. | data-relationships.md | Blocks multi-demand-type sites |
| D5 | **Employee availability buried in freeform JSONB.** No typed AvailabilityPattern entity. Optimizer must deserialize `preferences_json` for every employee on every planning run. | data-entities.md | Performance bottleneck |
| D6 | **WorkloadPlan uses single `weighted_uph` per day.** Morning shift (proficient workers, 100% UPH) and evening shift (novices, 65% UPH) get same rate. Understaffs evenings, overstaffs mornings. | data-entities.md | Systematically wrong plans |
| D7 | **No AbsenceRequest / LeaveRecord entity.** Planned vacations, FMLA, approved time-off — none modeled. Plan ignoring 15% leave rate is useless within 2 weeks. | data-entities.md | Day-1 user failure |
| D8 | **No EquipmentInventory entity.** Process has `equipment_required` tags but no site-level equipment counts. Optimizer can't enforce "only 8 forklifts available." | data-entities.md | Over-assignment to equipment-constrained processes |
| D9 | **No ApprovalRecord entity.** PlanVersion has `approval_status` but no audit trail of who approved when with what comments. Required for regulated industries. | data-relationships.md | Compliance gap |
| D10 | **Materialized views don't inherit RLS.** `mv_site_dashboard` aggregates across all orgs. PostgreSQL materialized views use definer privileges, not invoker. Without explicit tenant filtering, this is a cross-tenant data leakage vector. | scalability-design.md | Security vulnerability |
| D11 | **`pg_dump --where` doesn't exist.** The archival command shown is not valid PostgreSQL. Needs `COPY (SELECT ... WHERE ...) TO STDOUT`. | scalability-design.md | Broken archival process |
| D12 | **No structured role taxonomy.** RLS uses `('planner', 'admin', 'system')`. Wizard defines Site Manager, Regional Manager, HR Manager. These don't map to each other. | multi-tenancy.md | Broken authorization |
| D13 | **Scenario `assumptions_json` is untyped JSONB.** Optimizer consumes it with no schema validation. Structure mismatch = silent failures. | data-entities.md | Runtime errors |
| D14 | **Notification 30-day retention violates predictive scheduling laws.** Some jurisdictions require schedule notification proof for 60-90 days. | scalability-design.md | Legal non-compliance |

---

## Part 3: Legally Incorrect Specifications

These will expose customers to compliance liability if built as documented.

| # | Issue | File | Jurisdiction |
|---|-------|------|-------------|
| L1 | **"Remove shift: None (always valid)" is wrong.** Shift cancellation triggers compensation obligations in France (< 24hr notice), Australia (minimum engagement), and US predictive scheduling cities. | planning-adjustments.md | FR, AU, US cities |
| L2 | **Nevada overtime rule missing.** AI extracts "federal_standard_40hr" for Nevada. Nevada actually has daily OT after 8 hours (NRS 608). System would produce non-compliant schedules. | wizard-ai-strategies.md | US-NV |
| L3 | **US Federal profile says "No federal minimum rest requirement."** Ignores industry-specific federal rules (DOT hours-of-service for drivers, OSHA standards). | constraint-handling.md | US Federal |
| L4 | **6 consecutive days treated as "fatigue multiplier" not hard limit.** In EU, 6 consecutive days is the legal maximum. German law requires Sunday rest. Treating this as a cost penalty instead of a hard constraint is non-compliant. | optimization-strategy.md vs constraint-handling.md | EU, DE |
| L5 | **Auto-loaded jurisdiction rules create liability.** If auto-loaded California break rules are wrong or stale, customer faces compliance violations believing AstraPlanner validated them. No disclaimer or verification workflow. | wizard-logic.md | All |
| L6 | **CBA/union rules referenced but never modeled.** Seniority bidding, guaranteed hours, mandatory OT rotation — all require specific solver features. "Custom profile entries" is insufficient. Blocks deployment at most large US warehouses. | constraint-handling.md | US union sites |

---

## Part 4: Algorithm & Solver Issues

| # | Issue | File |
|---|-------|------|
| A1 | **Benchmark data is fabricated.** Section 9.3 shows solve times for specific problem instances on specific hardware. No implementation exists to run benchmarks. Presented as empirical data, will mislead infrastructure sizing. | algorithm-strategies.md |
| A2 | **GA chromosome encoding is broken.** Encodes `a[s]` = one employee per slot. Real slots need multiple employees (30 pickers for one process-time slot). Encoding collapses multi-employee slots. | algorithm-strategies.md |
| A3 | **"SA at low temperature" is hill climbing, not SA.** Phase 3 polish removes SA's primary benefit (escaping local optima). Misleading algorithm description. | algorithm-strategies.md |
| A4 | **Monte Carlo on quick-solve is statistically invalid.** Each iteration uses 85-92% optimal solver. Confidence intervals mix real demand uncertainty with artificial solver noise. P90 estimates are not credible. | scenario-simulation.md |
| A5 | **Solver determinism not guaranteed for compliance.** GA/SA are stochastic. Random seed not recorded in audit trail. Union grievance requiring reproducible plan generation would fail. | algorithm-strategies.md |
| A6 | **Timing adjustment multiplication overcounts fatigue.** `consecutive_day_factor * overtime_factor` treats correlated effects as independent. Produces absurd results (38% overhead). | optimization-strategy.md |
| A7 | **Soft constraint penalties are on incomparable scales.** -0.5 per OT hour vs -0.5 per dispreferred assignment — why equal? No calibration methodology. Arbitrary weights produce arbitrary trade-offs. | constraint-handling.md |
| A8 | **"95-99% of optimal" claim is unmeasurable.** For multi-objective problems, "optimal" depends on weights. % of optimal is undefined. | algorithm-strategies.md |

---

## Part 5: The Biggest Undocumented Component

### The mobile application and employee experience

The mobile app is referenced in **every section** but designed in **none**:

- `failure-modes.md`: workers check in via mobile app
- `event-architecture.md`: SMS sent to employees for shift changes
- `decision-hierarchy.md`: workers receive real-time notifications
- `planning-adjustments.md`: employees acknowledge assignments
- `ux-concepts.md`: 5 personas defined — none are the employee

Workers are the largest user group. Their experience (view schedule, request swaps, report absence, acknowledge changes) is entirely unspecified. This is not a V2 feature — it is a launch requirement.

---

## Part 6: Weak Assumptions

| # | Assumption | Reality |
|---|-----------|---------|
| W1 | Ruflo is a production framework | Experimental tool. Multi-agent architecture depends entirely on it. |
| W2 | HiGHS WASM fits 90% of problems in 256MB Edge Functions | No benchmark. 200-employee, 7-day MIP can exceed 256MB. |
| W3 | Claude confidence scores are calibrated probabilities | LLM confidence is not frequentist probability. High confidence on wrong outputs is common. |
| W4 | RLS alone provides tenant isolation | No integration tests for cross-tenant leakage. Materialized views bypass RLS. |
| W5 | 3-5 engineers can build and operate this stack | Stack includes 15+ technologies requiring DevOps expertise. |
| W6 | 30 writes/min rate limit works for planning UX | Drag-and-drop assignment = 1 mutation/action. Hits limit in < 60 seconds. |
| W7 | Single productivity rate per process is accurate | Real rates vary by time of day, fatigue, zone, SKU mix. 20-40% intra-day variance. |
| W8 | Skill taxonomy is consistent across sites | "Case picking" means different things at different sites. Taxonomy unification is a change management project, not a data import. |
| W9 | CBA contracts can be reliably parsed by AI | Legal language with intentional ambiguity. Errors surface during grievances — highest-stakes, lowest-tolerance failure mode. |
| W10 | Fleet learning benchmarks will exist at launch | Need n>=30 comparable configs. Won't have this for any segment at launch. |
| W11 | Planners have time to review every AI suggestion | 24/7 operations. Planners on 12-hour shifts. "Available alert reviewers" is an office assumption. |

---

## Part 7: Over-Engineering for MVP

| Area | Effort | Why Defer |
|------|--------|-----------|
| Monte Carlo simulation (1000 iterations, LHS, correlation matrices) | 4-6 weeks | Simple what-if (change one variable) delivers 80% value at 10% cost |
| Event sourcing for plan versioning | 3-4 weeks | Snapshot-per-version is sufficient. Event sourcing adds complexity without MVP value. |
| GA/SA solver strategies | 4-6 weeks | Greedy + CP-SAT covers 95% of real planning scenarios |
| Service Worker offline mode | 2-3 weeks | Logistics planners are always online |
| 7-locale i18n at launch | 2-3 weeks | Launch English only |
| Configurable widget dashboard (drag-drop, resize, named layouts) | 3-4 weeks | Fixed role-based layouts. User research first. |
| Full WCAG 2.1 AA on schedule grid with drag-and-drop | 4-8 weeks | Basic a11y first. Full compliance in V2. |
| Skill decay model | 1-2 weeks | Most companies manage skills manually. Unvalidated feature. |
| Fleet learning with k-anonymity | 3-4 weeks | No fleet data at launch. Use expert-curated defaults. |
| 7-level configuration hierarchy | 2-3 weeks | 3 levels (global > site > override) is sufficient for MVP |
| Full Gantt view (third scheduling view) | 3-4 weeks | One primary view (Timeline or Process) is sufficient |
| Edge components with CRDTs for offline | 6-8 weeks | Enterprise-grade. Not MVP scope. |

**Total deferred effort: ~40-55 engineering weeks** that can be redirected to core planning quality.

---

## Part 8: Missing Documents

| # | Document | Section | Why Critical |
|---|----------|---------|-------------|
| 1 | **schema.sql** | 04-data-model | No CREATE TABLE, indexes, or constraints. Schema-as-prose is not buildable. |
| 2 | **tRPC procedure contracts** | 07-implementation | Pseudocode APIs. No machine-readable spec. |
| 3 | **Security threat model** | 08-risks-and-gaps | STRIDE analysis for platform with employee PII. |
| 4 | **GDPR compliance procedures** | 08-risks-and-gaps | Right-to-erasure across JSONB snapshots is architecturally hard. |
| 5 | **Deployment & environment spec** | 07-implementation | No env vars, no Supabase config, no IaC. |
| 6 | **Integration connector spec** | 02-system-architecture | 12+ systems listed, zero have field mappings. |
| 7 | **Disaster recovery runbook** | 08-risks-and-gaps | RPO/RTO claimed, no procedure documented. |
| 8 | **Data migration & seed data** | 04-data-model | No tenant bootstrap, no benchmark data source. |
| 9 | **Test strategy** | 07-implementation | No test pyramid, no RLS integration tests, no solver fixtures. |
| 10 | **MVP scope definition** | new section 09 | No single doc defines V1 vs V2 vs V3 boundary. |
| 11 | **Build sequence** | new section 09 | No phased implementation plan. |
| 12 | **Prompt management system** | 07-implementation | Prompts are inline strings. No versioning or testing. |
| 13 | **Cost model** | new section 09 | No projected infra cost at each scale tier. |
| 14 | **Mobile app / employee experience spec** | 06-ux-control-layer | Referenced everywhere, designed nowhere. |
| 15 | **Role & permission taxonomy** | 04-data-model | RLS roles don't match wizard roles. |
| 16 | **Optimizer input/output contract** | 05-optimization-engine | What data format does the solver consume/produce? |
| 17 | **Shift swap / schedule change request workflow** | 04-data-model | Day-1 operational need. No entity, no workflow. |
| 18 | **Data quality management strategy** | 03-setup-wizard | "Garbage in, garbage out" acknowledged but no remediation path. |
| 19 | **Identity resolution across source systems** | 02-system-architecture | Matching workers across SAP/WMS/payroll dismissed as "fuzzy matching." |

---

## Part 9: Cross-Document Contradictions

| # | Contradiction | Documents |
|---|-------------|-----------|
| C1 | Hard constraints "never relaxed" vs planning-adjustments allows regulatory override with manager approval | constraint-handling.md vs planning-adjustments.md |
| C2 | Multi-site transfer on 15-minute batch cycle vs reactive layer requiring real-time cross-site transfers | module-breakdown.md vs decision-hierarchy.md |
| C3 | Principle 6 "override without justification" vs failure-modes requiring manager approval for skill changes | planning-principles.md vs failure-modes.md |
| C4 | tRPC middleware sets `app.tenant_id` session variable vs RLS using `auth.jwt()` claim extraction | backend-architecture.md vs multi-tenancy.md |
| C5 | 10-second `refetchInterval` on assignments = 6 req/min vs 100 reads/min rate limit (only 4 other queries allowed) | frontend-architecture.md vs backend-architecture.md |
| C6 | Sub-second Level 3 reactive latency vs all documents describing Supabase Edge Functions with 50-150ms cold starts | decision-hierarchy.md vs tech-stack.md |

---

## Part 10: Strongest Documents (What to Keep)

Not everything needs fixing. These documents are genuinely strong:

| Document | Why It's Strong |
|----------|----------------|
| `failure-modes.md` | 24 real failure modes with honest mitigations. Best document in the set. |
| `constraint-handling.md` | Jurisdiction-specific legal data. Strongest optimization doc (minus the bugs above). |
| `planning-adjustments.md` | Most implementation-ready UX doc. Adjustment taxonomy is complete. |
| `multi-tenancy.md` | Correctly justified shared-DB + RLS. Defense-in-depth is solid. |
| `integration-architecture.md` | Real-world integration knowledge (Korber JDBC fallback, Workday RaaS prereqs). |
| `planning-principles.md` | Principle interaction matrix showing tensions is rare and valuable. |

---

## Part 11: Recommended Immediate Actions

### Priority 1: Fix Blockers (Week 1)
1. ~~Rewrite `system-overview.md` to align with Supabase stack~~ (in progress)
2. ~~Create MVP scope definition~~ (in progress)
3. ~~Write `schema.sql` with corrected constraints~~ (in progress)
4. Fix the 6 legally incorrect specifications (L1-L6)
5. Resolve the 6 cross-document contradictions (C1-C6)

### Priority 2: Close Critical Gaps (Week 2-3)
6. Add AbsenceRequest, EquipmentInventory, ApprovalRecord entities to data model
7. Fix DemandForecast unique constraint for sub-daily granularity
8. Fix materialized view RLS leakage
9. Define role taxonomy consistently across all documents
10. Write security threat model

### Priority 3: Validate Assumptions (Week 3-4)
11. Benchmark HiGHS WASM memory/time on 3 real-size problems
12. Validate Ruflo for production multi-agent orchestration
13. Test tRPC + Supabase Edge Functions (Deno) compatibility
14. Profile optimizer data loading and solve time for 200-employee site

### Priority 4: Defer Over-Engineering (Ongoing)
15. Remove Monte Carlo, GA/SA, event sourcing, offline mode, fleet learning from MVP scope
16. Simplify to 3-level config hierarchy, single scheduling view, fixed dashboard layouts
17. Redirect ~40-55 engineering weeks to core planning quality
