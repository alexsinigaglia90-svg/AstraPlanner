# AstraPlanner Adversarial Audit: Enterprise Gaps

> Conducted: 2026-03-20
> Scope: Comprehensive gap analysis for enterprise workforce planning
> Method: Compare documented capabilities against what is required for production deployment

---

## Section 1: Missing Implementation (The Obvious Gap)

There is no application. This section exists to state it plainly, because the volume of documentation can obscure this fact.

### What does not exist

- **No Next.js project.** No `package.json`, no `next.config.js`, no `tsconfig.json`, no `app/` or `pages/` directory.
- **No React components.** No UI of any kind. No login page, no dashboard, no scheduling view, no setup wizard.
- **No tRPC routers.** No API layer. No procedure definitions. No middleware. No input validation schemas.
- **No database connection.** No Supabase project. No `supabase/config.toml`. No connection string. No migrations directory.
- **No Supabase Auth.** No auth providers configured. No sign-up flow. No session management.
- **No solver integration.** No HiGHS WASM binding. No solver pipeline. No result writer.
- **No CI/CD pipeline.** No GitHub Actions workflows. No deployment pipeline. No environment management.
- **No test suite.** No unit tests, integration tests, end-to-end tests, or solver validation fixtures.
- **No deployment.** No Vercel project. No production URL. No staging environment. No preview deployments.
- **No monitoring.** No Sentry project. No error tracking. No performance monitoring. No alerting.

### What does exist

- 1 SQL schema file (never executed against a database)
- 1 `.env` file (127 bytes -- likely placeholder or empty key-value pairs)
- 96 AI agent configuration files (for Claude-Flow, not for the application)

The gap between documentation and implementation is not a gap -- it is a chasm. The documentation describes a system that would require 6-12 months of engineering by a team of 3-5. Zero months have been spent.

---

## Section 2: Missing Domain Logic (Gaps in the Documentation Itself)

Even if implementation began today using the documentation as a spec, the specs themselves have gaps that would block development.

### 2.1 The Demand-to-Workload Pipeline

The core calculation is: demand forecast -> workload hours -> required FTEs -> shift assignments. The documentation describes this pipeline in prose but leaves critical edge cases unresolved:

**Intra-day demand variability (documented as bug D6, unfixed):**
- WorkloadPlan uses a single `weighted_uph` per day
- Morning shift with experienced workers at 100% UPH and evening shift with trainees at 65% UPH get the same rate
- This systematically understaffs evenings and overstaffs mornings
- The fix (per-shift weighted UPH) is documented but not applied to schema.sql

**Multi-demand-type aggregation (documented as bug D4, unfixed):**
- 3 demand types mapping to the same process create 3 WorkloadPlan records
- The UNIQUE constraint on `(org_id, site_id, process_id, plan_date, version_id)` rejects this
- No aggregation logic is specified

**Nonlinear demand-capacity relationships (undocumented):**
- The formula assumes linear scaling: 2x demand = 2x workers
- Reality: diminishing returns from congestion (8 forklifts, 12 dock doors -- the 9th picker has nothing to pick into)
- No capacity ceiling model exists
- No equipment constraint interacts with the workload calculation

**Demand volatility handling (undocumented):**
- What happens when Tuesday demand is 3x forecast?
- The reactive layer describes "real-time rebalancing" but no rebalancing algorithm exists
- No safety stock concept for labor (buffer staffing above forecast)

### 2.2 The Optimization Engine

Five solver strategies are described (Greedy, CP-SAT, MIP via HiGHS, GA, SA). None have a defined contract.

**No solver I/O contract:**
- SYSTEMS-REVIEW.md (section 2.2) provides a proposed TypeScript interface, but this is a review recommendation, not an adopted specification
- No document defines what data structure the solver consumes
- No document defines what data structure the solver produces
- Without this contract, the solver cannot be built, tested, or validated

**No mathematical formulation:**
- Decision variables are described in English ("assign employee e to process p in time slot t")
- The objective function is described conceptually ("minimize cost while maximizing coverage and fairness")
- No actual MIP formulation exists: no variable definitions, no constraint matrix, no objective coefficients
- An engineer tasked with building the HiGHS integration would need to derive the formulation from prose

**No constraint formalization:**
- constraint-handling.md catalogs 20+ constraints with names and jurisdictions
- None are expressed mathematically
- "Maximum 8 hours daily" in prose becomes `sum(x[e,p,t] * duration[t] for p in processes for t in time_slots_on_day[d]) <= 8` in MIP -- this translation is non-trivial and undocumented
- Constraint interactions (overtime threshold + consecutive day limit + mandatory break) create complex feasibility regions that are never analyzed

**No test problems:**
- No small benchmark instances (5 employees, 3 processes, 1 day) with known optimal solutions
- No medium instances for regression testing
- No large instances for performance benchmarking
- The fabricated benchmark data in algorithm-strategies.md (section 9.3) makes this worse -- it provides false confidence

**No solver fallback logic:**
- What happens when HiGHS returns INFEASIBLE?
- Which constraints should be relaxed, in what order?
- How is the user informed?
- What is the maximum acceptable solve time before timeout?

### 2.3 The Constraint Engine

**Hard vs. soft constraint boundary is undefined at runtime:**
- constraint-handling.md says hard constraints are "never relaxed"
- planning-adjustments.md allows regulatory override with manager approval
- No mechanism for the solver to report which hard constraint caused infeasibility
- No constraint relaxation priority ordering

**Soft constraint penalty calibration is arbitrary:**
- -0.5 per overtime hour vs. -0.5 per dispreferred assignment
- These are on incomparable scales (dollars vs. preference units)
- No methodology for calibrating weights
- No documentation of how weight changes affect outcomes

**Jurisdiction rule completeness:**
- 6 legal errors already identified (L1-L6 in REVIEW-FULL.md)
- Rules for only ~5 jurisdictions are sketched
- No framework for adding new jurisdictions
- No validation mechanism for rule accuracy
- No legal review process defined

---

## Section 3: Missing Enterprise Infrastructure

### 3.1 Identity and Access Management

- **No SSO/SAML integration.** Enterprise customers require single sign-on. Supabase Auth supports SAML but it is not configured or documented.
- **No SCIM provisioning.** Enterprise HR systems push user adds/removes via SCIM. Without this, user management is manual.
- **No role hierarchy.** RLS uses flat roles (`planner`, `admin`, `system`). The wizard defines Site Manager, Regional Manager, HR Manager. These do not map to each other. The role taxonomy is documented as inconsistent in REVIEW-FULL.md (D12) and remains unfixed.
- **No permission matrix.** Which roles can view/edit/approve/publish for which resources at which scope (site, region, org)? Not defined.

### 3.2 Billing and Commercial

- **No subscription/billing system.** The `organization` table has `subscription_tier` but no billing integration (Stripe, etc.).
- **No usage metering.** How are API calls, solver runs, or AI tokens counted and billed?
- **No trial-to-paid conversion flow.**
- **No seat-based or site-based pricing logic.**
- **No invoice generation or payment processing.**

### 3.3 Administration

- **No admin portal.** No system-wide admin view for managing tenants, monitoring health, or resolving support issues.
- **No tenant provisioning automation.** Creating a new tenant requires manual database inserts.
- **No feature flag system.** No way to enable/disable features per tenant or per tier.
- **No support tooling.** No ability for support staff to impersonate a tenant or view their configuration.

### 3.4 Operations

- **No monitoring/alerting.** No Sentry project, no Datadog, no PagerDuty integration. No alert rules for solver failures, database connection exhaustion, or API error rates.
- **No health checks.** No `/health` endpoint. No readiness/liveness probes.
- **No log aggregation.** No structured logging strategy. No log search capability.
- **No disaster recovery procedure.** RPO/RTO targets are documented in prose. No backup verification, no recovery runbook, no failover automation.
- **No data backup system.** Supabase provides daily backups on Pro plan, but no point-in-time recovery testing has occurred (there is no database to back up).
- **No SOC 2 controls.** Acknowledged as "not started" in security-threat-model.md. SOC 2 Type II requires 6-12 months of evidence collection from a running system.
- **No penetration testing.** No test results, no remediation plan, no testing schedule.

### 3.5 Compliance

- **No data residency controls.** EU customers may require data stored in EU regions. No multi-region Supabase configuration.
- **No data retention automation.** GDPR requires data deletion upon request. The schema uses JSONB snapshots that make surgical deletion architecturally hard (acknowledged in gdpr-compliance.md).
- **No consent management.** No mechanism for employees to consent to schedule optimization using their personal data.
- **No audit trail for compliance.** The `audit_log` table exists in schema.sql but has never been populated. No immutable logging. No tamper detection.

---

## Section 4: Missing Workforce Planning Specifics

These are domain features that any enterprise workforce planning buyer would expect. They are absent from both documentation and implementation.

### 4.1 Employee Self-Service

- **No shift swap workflow.** Employees cannot request to swap shifts with colleagues. No matching logic. No manager approval flow. No seniority-based priority. This is a day-1 operational need at every logistics site.
- **No shift bid/preference system.** Employees cannot express shift preferences beyond a static `availability_pattern` in JSONB.
- **No self-service absence requests.** No way for employees to request time off through the system.
- **No schedule view for employees.** The largest user group (workers) has no interface at all. This is documented as a gap in both REVIEW-FULL.md and SYSTEMS-REVIEW.md and remains unaddressed.
- **No mobile experience.** Referenced in every document ("workers check in via mobile app"), designed in none.

### 4.2 Time and Attendance

- **No time clock integration.** Planned schedules must be compared against actual attendance. No integration with time clock systems (Kronos, ADP, etc.).
- **No actual-vs-planned comparison.** The core feedback loop for workforce planning -- did the plan match reality? -- does not exist.
- **No no-show handling workflow.** What happens when an employee does not show up? The reactive layer describes it conceptually, but there is no entity, no workflow, and no escalation path.
- **No tardiness tracking.** No mechanism to record or analyze late arrivals.

### 4.3 Payroll and Cost Control

- **No payroll integration.** Schedule changes affect pay. No integration with payroll systems.
- **No cost modeling.** The optimizer minimizes "cost" but no cost model is defined. What is the hourly rate? Is it by role, by employee, by shift differential? Where do overtime multipliers come from?
- **No budget module.** No labor budget definition. No budget-vs-actual tracking. No budget alert thresholds.
- **No cost-per-unit tracking.** The core logistics KPI (cost per unit picked/packed/shipped) requires integrating schedule cost with demand volume.

### 4.4 Labor Relations

- **No union/CBA rule engine.** Seniority bidding, guaranteed hours, mandatory overtime rotation, job classification restrictions, grievance procedures -- all require specific solver constraints and workflow logic. constraint-handling.md acknowledges CBA as "unsupported" but does not size the gap.
- **No seniority-based scheduling.** Many union contracts require shift preference by seniority. The optimizer has no seniority concept.
- **No guaranteed hours tracking.** Part-time contracts often guarantee minimum weekly hours. No entity tracks guaranteed vs. scheduled vs. actual hours.

### 4.5 Skills and Training

- **No training/certification management.** Certification expiry dates exist in the schema but no workflow for tracking, scheduling, or enforcing re-certification.
- **No training schedule integration.** Training sessions reduce available capacity. No mechanism to block employees during training.
- **No cross-training planning.** The system tracks who CAN do what, but has no mechanism for planning who SHOULD learn what next.

### 4.6 Contingent Workforce

- **No agency worker management.** Logistics sites routinely use temp agencies. No entity for agency relationships, agency worker pools, cost rates, or lead times.
- **No agency request workflow.** When demand exceeds internal capacity, the system should suggest agency staff. No mechanism exists.
- **No contractor compliance tracking.** Contractor vs. employee classification, working time limits for temps, agency markup tracking.

### 4.7 Reporting and Analytics

- **No historical reporting.** No mechanism to answer "how did we perform last month?"
- **No variance analysis.** No comparison of planned vs. actual staffing, cost, or productivity.
- **No export/download capability.** No PDF schedule export, no CSV data export, no Excel integration.
- **No executive dashboard.** No multi-site, multi-region rollup view for senior management.

---

## Summary

The gap between AstraPlanner's documentation and a deployable enterprise workforce planning system is approximately 12-18 months of engineering work by a team of 5, assuming the team starts building immediately and stops producing new architecture documents.

The documentation is genuinely valuable as a domain specification. The constraint catalog, failure modes analysis, and multi-tenancy design are strong enough to serve as implementation specs. But they are specs for a system that has not been started, embedded in a repository that has spent its energy on AI orchestration tooling and recursive self-review instead of construction.
