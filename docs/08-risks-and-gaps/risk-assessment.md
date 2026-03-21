# Risk Assessment

## 1. Introduction

This document provides a comprehensive risk assessment for the AstraPlanner platform. Every risk is categorized, scored, assigned an owner archetype, and paired with concrete mitigation strategies. Risks are assessed on two axes -- Likelihood (Low / Medium / High) and Impact (Low / Medium / High) -- producing a composite Risk Score from 1 (Low/Low) to 9 (High/High).

### Scoring Matrix

```
                        I M P A C T
                   Low (1)   Med (2)   High (3)
            High (3)  3         6         9
LIKELIHOOD  Med  (2)  2         4         6
            Low  (1)  1         2         3
```

Risk Score thresholds:
- **1-2**: Accept and monitor.
- **3-4**: Mitigate within normal planning cycles.
- **6**: Prioritize mitigation; assign dedicated owner.
- **9**: Treat as blocking; resolve before launch or implement fail-safes.

---

## 2. Risk Category 1: Technical Risks

### R1.1 -- Optimization Solver Performance at Scale

| Attribute | Detail |
|-----------|--------|
| **Description** | The assignment optimization stage solves a constrained optimization problem (employee-to-slot assignment) that is NP-hard in the general case. At enterprise scale -- 10,000+ employees across 500+ sites with skill matrices, labor rules, and cross-site balancing -- solver run times can exceed acceptable time budgets. A single-site solve targeting 200 employees and 20 processes typically completes in 2-5 seconds. Scaling to 500 simultaneous sites with cross-site constraints (shared labor pools, regional overtime caps) introduces combinatorial explosion. Batch planning windows of 30 minutes may be insufficient for a full enterprise re-plan. |
| **Likelihood** | Medium |
| **Impact** | High |
| **Risk Score** | 6 |
| **Mitigation** | (1) **Hierarchical decomposition**: solve each site independently in parallel, then run a cross-site reconciliation pass that only adjusts shared resources. This converts one O(n^k) problem into many O(m^k) problems where m << n. (2) **Solver time limits with best-found solution**: set hard time caps (e.g., 10s per site, 120s for cross-site) and return the best feasible solution found within the budget along with a gap-to-optimality metric. (3) **Warm-starting**: use the previous plan as the initial feasible solution so the solver only needs to find improvements rather than building from scratch. (4) **Problem reduction**: pre-filter employees who are unavailable, pre-assign employees with single-skill matches, and reduce the decision space before handing to the solver. |
| **Owner** | Engineering Lead -- Optimization |
| **Status** | Design phase; benchmarks needed at 100-site and 500-site scale |

### R1.2 -- Real-Time Data Freshness

| Attribute | Detail |
|-----------|--------|
| **Description** | Workforce plans are only as good as their input data. Demand forecasts that are 4 hours stale during a peak day can result in plans that are 20-40% misaligned with actual floor needs. The system ingests demand from ERP forecasts (batch hourly), WMS order backlogs (event-driven), and manual uploads (ad hoc). If any pipeline stalls -- an ERP job fails silently, a webhook endpoint goes unreachable, or a CSV upload is delayed -- the planning engine operates on stale data without knowing it. |
| **Likelihood** | High |
| **Impact** | Medium |
| **Risk Score** | 6 |
| **Mitigation** | (1) **Staleness indicators**: every data source records `last_successful_sync_at`. The UI displays a freshness badge (green < 30 min, yellow 30-120 min, red > 120 min) next to every plan. (2) **Automatic re-plan triggers**: when a new demand feed arrives, the system compares it to the demand used in the active plan. If deviation exceeds a configurable threshold (default: 15%), it triggers an automatic re-plan with notification. (3) **Confidence decay**: demand forecasts carry a `confidence` field (0.0-1.0). Confidence decays over time: `effective_confidence = base_confidence * e^(-lambda * hours_since_forecast)` with lambda configurable per source. Plans generated from low-confidence data are flagged. (4) **Heartbeat monitoring**: each integration pipeline emits a heartbeat every 5 minutes. Missed heartbeats trigger an alert within 15 minutes. |
| **Owner** | Engineering Lead -- Data Platform |
| **Status** | Partially designed; heartbeat monitoring not yet specified |

### R1.3 -- AI Reliability (Claude Hallucinations)

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner uses Claude for the setup wizard (guiding organizations through configuration), for natural-language plan explanations, and for AI-driven recommendations ("You should cross-train 12 employees in packing to cover projected attrition"). LLMs can hallucinate plausible-sounding but incorrect advice: inventing productivity standards, misinterpreting labor regulations, or suggesting configurations that violate business rules. In a workforce planning context, a hallucinated recommendation acted upon could result in understaffing, compliance violations, or wasted training investment. |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Risk Score** | 4 |
| **Mitigation** | (1) **Structured output schemas**: all Claude responses are constrained to JSON schemas (using tool_use / structured outputs). The system never displays raw unstructured LLM output to end users. (2) **Validation layers**: every AI-generated configuration value is validated against domain rules before being saved. Example: if Claude suggests a productivity rate of 500 pallets/hr (physically impossible), the validation layer rejects it and asks for correction. (3) **Confidence thresholds**: AI recommendations include a confidence score. Recommendations below 0.7 confidence are presented as "suggestions for review" rather than actionable items. (4) **Human confirmation gates**: high-impact AI suggestions (changes affecting > 50 employees, cost impact > $10K, or changes to labor rules) require explicit manager approval before taking effect. (5) **Grounding**: Claude prompts include the organization's actual data (site list, process catalog, historical productivity) to minimize hallucination surface area. |
| **Owner** | Engineering Lead -- AI/ML |
| **Status** | Validation layers designed; confidence scoring not yet implemented |

### R1.4 -- Database Performance Under Multi-Tenant Load

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner uses PostgreSQL (via Supabase) as the primary data store, with Row-Level Security (RLS) enforcing tenant isolation. At scale -- 200+ tenants, each with hundreds of sites, tens of thousands of employees, and millions of shift assignment records -- query performance degrades. Specific risk areas: (a) RLS policy evaluation adds overhead to every query (estimated 10-30% on complex joins); (b) the `shift_assignments` table grows to billions of rows annually across all tenants; (c) planning-period queries that join demand, employees, skills, and assignments across multiple time slots create complex execution plans; (d) concurrent plan generation across tenants during morning planning windows (7-9 AM local time) creates write contention. |
| **Likelihood** | Medium |
| **Impact** | High |
| **Risk Score** | 6 |
| **Mitigation** | (1) **Connection pooling**: use PgBouncer with transaction-mode pooling, sized at 20 connections per 50 concurrent tenants. (2) **Query optimization**: mandate that all tenant-scoped queries include `tenant_id` as the leading predicate to leverage composite indexes `(tenant_id, ...)`. Enforce via linting in the query layer. (3) **Read replicas**: route all dashboard, reporting, and analytics queries to read replicas. Only plan generation, configuration writes, and assignment updates hit the primary. (4) **Tenant-level rate limiting**: each tenant is allocated a query budget (e.g., 500 queries/min for standard tier, 2000 for enterprise). Exceeding the budget queues requests rather than crashing the database. (5) **Table partitioning**: partition `shift_assignments` by `(tenant_id, plan_date)` using PostgreSQL declarative partitioning. Archive partitions older than 90 days to cold storage. (6) **Materialized views**: pre-compute common dashboard aggregates (headcount by site, utilization by process) on a 5-minute refresh cycle. |
| **Owner** | Engineering Lead -- Data Platform |
| **Status** | Connection pooling configured; partitioning and read replicas pending |

### R1.5 -- Integration Fragility

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner integrates with external systems that the platform team does not control: WMS (Manhattan, Blue Yonder, Korber), HRIS (Workday, SAP SuccessFactors, BambooHR), ERP (SAP, Oracle), TMS, and payroll systems. These systems have: (a) poorly documented or frequently changing APIs; (b) inconsistent data formats across versions; (c) rate limits that vary without notice; (d) maintenance windows that coincide with peak planning periods; (e) custom fields unique to each customer's instance. A single integration failure can block plan generation for an entire site if, for example, the employee roster cannot be refreshed. |
| **Likelihood** | High |
| **Impact** | Medium |
| **Risk Score** | 6 |
| **Mitigation** | (1) **Abstraction layer**: all external systems are accessed through an `IntegrationAdapter` interface. Each adapter translates system-specific APIs into AstraPlanner's canonical data model. Adapter changes do not require core platform changes. (2) **Circuit breakers**: each integration endpoint is wrapped in a circuit breaker (closed -> open after 5 consecutive failures, half-open after 60s cooldown). When open, the system falls back to cached data. (3) **Last-known-good data**: the system maintains a versioned cache of the most recent successful sync for every data entity. Plans can be generated against last-known-good data with a freshness warning. (4) **Retry with backoff**: transient failures retry with exponential backoff (1s, 2s, 4s, 8s, max 60s) and jitter. (5) **Integration health dashboard**: real-time status page showing each adapter's health, last sync time, error rate, and latency percentiles. (6) **Schema versioning**: each adapter declares the API version it targets. Version drift is detected during sync and flagged for adapter update. |
| **Owner** | Engineering Lead -- Integrations |
| **Status** | Adapter pattern designed; circuit breakers and health dashboard pending |

---

## 3. Risk Category 2: Product Risks

### R2.1 -- Setup Complexity Leading to Abandonment

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner requires significant upfront configuration: defining sites, processes, productivity standards, skill matrices, labor rules, shift patterns, and demand sources. Even with an AI-assisted wizard, the volume of decisions can overwhelm operations managers. Early-stage customers with 50+ sites face a setup process that, without templates, could take weeks. Competitor products (Quinyx, NICE WFM) offer simpler initial setup by limiting configurability. Risk of 30-50% trial abandonment during onboarding. |
| **Likelihood** | Medium |
| **Impact** | High |
| **Risk Score** | 6 |
| **Mitigation** | (1) **Industry templates**: pre-built configuration templates for common logistics verticals (e-commerce fulfillment, cold chain, LTL freight) that pre-populate 70-80% of settings. (2) **Progressive disclosure**: the wizard surfaces only essential settings (5-10 screens) for initial plan generation. Advanced settings (skill matrices, custom constraints, scenario parameters) are deferred to post-first-plan refinement. (3) **AI-powered import**: the wizard accepts CSV/Excel uploads of existing staffing data and reverse-engineers configuration from historical patterns. (4) **Time-to-first-plan metric**: track and optimize for < 2 hours from signup to first generated plan. (5) **Guided onboarding team**: dedicated customer success support for enterprise clients during the first 30 days. |
| **Owner** | Product Lead |
| **Status** | Templates for e-commerce fulfillment in design; others not started |

### R2.2 -- Trust Deficit in AI-Generated Plans

| Attribute | Detail |
|-----------|--------|
| **Description** | Operations managers and shift supervisors have years of floor experience. They know which employees work well together, which areas are prone to bottlenecks, and which rules-of-thumb work on their specific floor. An AI system that generates plans without explaining its reasoning will be overridden constantly, negating the platform's value. If override rates exceed 40%, the system becomes an expensive spreadsheet. Historical data from similar tools (workforce management, demand planning) shows that trust is built over 3-6 months of demonstrated accuracy. |
| **Likelihood** | High |
| **Impact** | Medium |
| **Risk Score** | 6 |
| **Mitigation** | (1) **Plan explainability**: every assignment includes a reason chain (e.g., "Assigned Maria to Picking Zone B because: she has Level 5 picking skill, she worked this zone 4 of last 5 shifts (preference continuity), and Zone B is 3 FTEs short of target"). (2) **Override tracking with feedback loop**: when a manager overrides an assignment, the system asks for a reason (dropdown + free text). These overrides feed back into the optimization as soft constraints. (3) **Accuracy scorecard**: weekly report comparing plan vs. actuals (planned headcount vs. actual attendance, planned output vs. actual output). Visible improvement over time builds trust. (4) **Shadow mode**: new deployments run AstraPlanner in shadow mode alongside existing planning for 2-4 weeks. Managers can compare AI plans to their manual plans without commitment. (5) **Gradual autonomy**: start with AI-suggested plans that require full approval, then move to approve-by-exception, then to fully autonomous with override capability. |
| **Owner** | Product Lead + Customer Success |
| **Status** | Explainability designed; shadow mode and accuracy scorecard pending |

### R2.3 -- Feature Scope Creep

| Attribute | Detail |
|-----------|--------|
| **Description** | Workforce planning touches scheduling, time & attendance, payroll, training, recruitment, compliance, communication, and performance management. Every customer conversation will surface requests to expand into adjacent domains. Without discipline, AstraPlanner becomes a mediocre everything-tool rather than an excellent planning tool. Scope creep delays core feature maturity, strains engineering resources, and blurs market positioning. |
| **Likelihood** | High |
| **Impact** | Medium |
| **Risk Score** | 6 |
| **Mitigation** | (1) **Core vs. adjacent boundary**: explicitly define the product boundary. Core: demand -> workload -> FTE -> assignment. Adjacent: scheduling UX, compliance checking, scenario simulation. Out of scope for V1: payroll, time & attendance, recruitment, LMS. (2) **Integration-first for adjacent needs**: build APIs and webhooks that let specialized tools (payroll, T&A) consume AstraPlanner's output rather than rebuilding their functionality. (3) **Feature scoring framework**: every feature request is scored on (a) alignment with core value prop, (b) revenue impact, (c) engineering effort, (d) maintenance burden. Features below threshold are declined or deferred. (4) **Quarterly scope review**: product team reviews the roadmap quarterly against the core mission statement. Items that drift are pruned. |
| **Owner** | Product Lead |
| **Status** | Boundary definition in progress |

### R2.4 -- Insufficient Domain Customization

| Attribute | Detail |
|-----------|--------|
| **Description** | "Logistics" is not one industry. An e-commerce fulfillment center (high SKU count, each-pick dominant, seasonal spikes) operates nothing like a cold-chain distribution hub (temperature zones, regulatory hold times, specialized certifications) or a parcel sortation facility (conveyor-driven, wave-based, high throughput). If AstraPlanner's data model and optimization constraints assume a generic warehouse, it will fail to capture the operational nuances that make plans useful. Customers will evaluate the platform against their specific sub-vertical and reject it if it cannot model their reality. |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Risk Score** | 4 |
| **Mitigation** | (1) **Extensible process taxonomy**: the process catalog is not hardcoded. Customers define their own process hierarchy (e.g., `COLD_CHAIN.RECEIVING.TEMP_CHECK` or `PARCEL.SORTATION.INDUCTION`). (2) **Custom constraint plugins**: the optimization engine accepts customer-defined constraints via a rule DSL (e.g., "employees with HAZMAT certification must be present in Receiving if hazardous goods are on the inbound schedule"). (3) **Vertical-specific configuration packs**: bundled configurations for top 5 logistics sub-verticals, developed with domain experts. (4) **Field-level extensibility**: custom fields on Employee, Site, and Process entities stored as JSONB, queryable and usable in constraints. |
| **Owner** | Product Lead + Domain Experts |
| **Status** | Extensible taxonomy designed; vertical packs not started |

### R2.5 -- Plan-Reality Gap

| Attribute | Detail |
|-----------|--------|
| **Description** | Workforce plans are theoretical constructs. Reality introduces variables the plan cannot predict: an employee calls out sick 30 minutes before shift start, a truck arrives 2 hours late shifting the demand curve, a conveyor breaks down eliminating a process line. If AstraPlanner produces beautiful plans that consistently diverge from floor reality by > 20%, the system loses credibility. The gap between plan and execution is the single largest source of disillusionment with workforce planning tools. |
| **Likelihood** | High |
| **Impact** | High |
| **Risk Score** | 9 |
| **Mitigation** | (1) **Real-time re-planning**: the operational planning horizon supports sub-minute re-planning triggered by floor events (absence reported, demand spike detected, process line down). (2) **Plan vs. actual dashboard**: continuously track planned headcount, planned output rate, and planned cost against actuals. Surface deviations as they happen, not after the shift ends. (3) **Buffer configuration**: plans include configurable buffers (e.g., 5-10% overstaffing in critical processes) to absorb normal variance. Buffer levels are tuned based on historical variance analysis. (4) **Disruption playbooks**: pre-defined response templates for common disruptions (mass absence > 15%, demand spike > 30% of plan, equipment failure). The system automatically suggests rebalancing actions from the playbook. (5) **Continuous learning**: post-shift analysis identifies systematic plan-vs-actual gaps and adjusts future planning parameters (productivity rates, absence rates, demand profiles) automatically. |
| **Owner** | Engineering Lead -- Optimization + Product Lead |
| **Status** | Re-planning designed; disruption playbooks and continuous learning not started |

---

## 4. Risk Category 3: Operational Risks

### R3.1 -- Data Quality Dependency

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner's planning quality is directly proportional to the quality of input data. Productivity standards that are 2 years stale overestimate or underestimate labor need by 15-30%. Skill assessments that are self-reported rather than validated lead to misassignment. Employee availability records that are not maintained create phantom capacity (scheduling employees who are actually on leave). Garbage in, garbage out is the defining risk for any analytics-heavy platform, and workforce planning is no exception. |
| **Likelihood** | High |
| **Impact** | High |
| **Risk Score** | 9 |
| **Mitigation** | (1) **Data quality scoring**: every data entity (employee record, productivity standard, demand forecast) carries a quality score based on completeness, recency, and source reliability. Plans generated from low-quality data display a prominent warning. (2) **Automated anomaly detection**: flag productivity standards that deviate > 2 standard deviations from industry benchmarks. Flag skill assessments that have not been updated in > 180 days. Flag employee records missing critical fields (availability, primary site, skills). (3) **Data stewardship workflow**: assign data owners per domain (HR data -> HR team, productivity -> industrial engineering, demand -> planning team). Generate periodic data quality reports for each owner. (4) **Progressive data enrichment**: the system works with minimal data initially (employees + shifts + basic demand) and improves plan quality as more data dimensions are populated. Never block plan generation due to missing non-critical data. (5) **Baseline validation**: during setup, the wizard cross-references uploaded productivity standards against industry benchmarks and historical data to identify obvious errors. |
| **Owner** | Product Lead + Customer Success |
| **Status** | Data quality scoring designed; anomaly detection not started |

### R3.2 -- Change Management Resistance

| Attribute | Detail |
|-----------|--------|
| **Description** | Many logistics operations plan their workforce using spreadsheets, whiteboards, or legacy systems that have been in place for 10+ years. The operations manager who maintains the "master spreadsheet" has built significant institutional knowledge and political capital around that process. Replacing it with an AI system threatens their perceived value and requires new skills. Change management failure is the #1 reason workforce planning implementations fail, accounting for 40-60% of failed deployments across the industry. |
| **Likelihood** | High |
| **Impact** | Medium |
| **Risk Score** | 6 |
| **Mitigation** | (1) **Champion identification**: work with customer leadership to identify 2-3 internal champions per site who are willing to pilot the system and advocate for it. (2) **Spreadsheet import/export**: allow managers to export plans to Excel and import adjustments from Excel. Meet them where they are before migrating them forward. (3) **Training program**: structured training tracks for different user roles (planner, supervisor, site manager, executive) with certification. (4) **Quick wins**: configure the system to immediately surface one high-value insight during onboarding (e.g., "Your current Tuesday night shift is overstaffed by 8 FTEs, costing $12,400/week"). (5) **Parallel operation**: run AstraPlanner alongside existing processes for 4-6 weeks, comparing outputs, before cutover. |
| **Owner** | Customer Success Lead |
| **Status** | Training materials in early development |

### R3.3 -- Regulatory Complexity

| Attribute | Detail |
|-----------|--------|
| **Description** | Labor regulations vary enormously across jurisdictions. Key areas of complexity: (a) overtime rules (daily vs. weekly calculation, California vs. federal, EU Working Time Directive); (b) break requirements (mandatory meal breaks after X hours, rest periods between shifts); (c) minor labor restrictions (limited hours, prohibited tasks); (d) scheduling predictability laws (Oregon, New York City, San Francisco -- require advance schedule posting with penalties for changes); (e) union/CBA rules that override statutory minimums; (f) temporary worker regulations (max duration, equal treatment, agency-specific rules). A single compliance violation can result in $500-$50,000 in fines per occurrence plus litigation risk. |
| **Likelihood** | Medium |
| **Impact** | High |
| **Risk Score** | 6 |
| **Mitigation** | (1) **Rule engine architecture**: labor rules are modeled as declarative constraints in the optimization engine, not hardcoded logic. Each rule has: jurisdiction, effective date, rule type (hard constraint vs. soft penalty), and parameters. (2) **Pre-built rule library**: ship with validated rule sets for top 20 US states, Canada, UK, Germany, France, Netherlands, and Australia. (3) **Compliance check layer**: every generated plan passes through a compliance validator before publication. Violations are flagged with severity (blocking vs. warning) and regulatory reference. (4) **Legal review cadence**: quarterly review of rule library against legislative changes, performed by labor law advisory partner. (5) **Customer-configurable rules**: customers can add jurisdiction-specific rules or CBA rules via the admin interface, validated by the constraint engine for logical consistency. |
| **Owner** | Product Lead + Legal Advisor |
| **Status** | Rule engine architecture designed; rule library has 5 US states and UK only |

### R3.4 -- Vendor Lock-In

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner has significant dependencies on three vendors: (a) **Supabase** for database, authentication, real-time subscriptions, and edge functions; (b) **Anthropic Claude** for AI-powered setup wizard, plan explanations, and recommendations; (c) **Vercel** for frontend hosting, edge rendering, and serverless API routes. If any vendor changes pricing, deprecates features, suffers extended outages, or is acquired, AstraPlanner's operations are directly impacted. Supabase is a relatively young company; Claude's API pricing has changed multiple times; Vercel's pricing model penalizes high-traffic applications. |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Risk Score** | 4 |
| **Mitigation** | (1) **Database abstraction**: while Supabase is the primary backend, the data access layer uses a repository pattern. Migrating to self-hosted PostgreSQL, AWS RDS, or Google Cloud SQL requires changing the connection layer, not the application logic. Estimated migration effort: 2-4 weeks. (2) **AI provider abstraction**: the AI service layer defines an `AIProvider` interface. Claude is the primary implementation, but the interface supports OpenAI GPT-4, Google Gemini, or self-hosted models as alternatives. Key prompts and schemas are provider-agnostic. (3) **Hosting portability**: the Next.js application is containerizable. Deployment to AWS (ECS/Fargate), GCP (Cloud Run), or Azure (Container Apps) is feasible with 1-2 weeks of DevOps work. (4) **Vendor evaluation cadence**: semi-annual review of vendor pricing, reliability, and roadmap alignment. Maintain a documented migration runbook for each critical vendor. (5) **Cost monitoring**: track per-vendor costs monthly. Set alerts at 120% and 150% of budgeted spend. |
| **Owner** | CTO / Engineering Lead |
| **Status** | Repository pattern partially implemented; AI abstraction designed |

### R3.5 -- Security and Compliance (Workforce Data)

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner processes highly sensitive data: employee PII (names, addresses, national IDs), compensation data (pay rates, overtime), health-related information (absence reasons, accommodation requirements), performance data (skill assessments, productivity metrics), and scheduling preferences. This data is subject to GDPR (EU), CCPA (California), PIPEDA (Canada), and various sector-specific regulations. A data breach could expose thousands of employee records, resulting in regulatory fines (up to 4% of global revenue under GDPR), litigation, and reputational destruction. Multi-tenant architecture adds risk: a bug in RLS policies could expose Tenant A's data to Tenant B. |
| **Likelihood** | Low |
| **Impact** | High |
| **Risk Score** | 3 |
| **Mitigation** | (1) **RLS enforcement**: Supabase RLS policies on every table, enforced at the database level (not application level). Automated tests verify tenant isolation by attempting cross-tenant queries with every schema migration. (2) **Encryption**: data encrypted at rest (AES-256) and in transit (TLS 1.3). Sensitive fields (national ID, pay rate) are additionally encrypted at the application level with tenant-specific keys. (3) **Access controls**: RBAC with principle of least privilege. No user role has access to raw PII in bulk. PII fields are masked in logs, error messages, and non-production environments. (4) **Audit logging**: every data access, modification, and export is logged with user ID, timestamp, and action. Logs are immutable and retained for 7 years. (5) **SOC 2 Type II**: pursue SOC 2 certification within 12 months of launch. Conduct third-party penetration testing quarterly. (6) **Data retention policies**: configurable per tenant. Default: active data retained indefinitely during subscription; archived after 90 days; hard-deleted 30 days after subscription termination. (7) **Incident response plan**: documented runbook for data breach response, including notification timelines (72 hours under GDPR), containment procedures, and communication templates. |
| **Owner** | Security Lead + CTO |
| **Status** | RLS policies implemented; encryption at rest via Supabase; application-level encryption and SOC 2 not started |

---

## 5. Risk Category 4: Scaling Risks

### R4.1 -- Onboarding Velocity

| Attribute | Detail |
|-----------|--------|
| **Description** | Enterprise sales cycles produce lumpy onboarding demand. Closing 3 enterprise deals in one quarter could mean onboarding 3 organizations with 500+ sites each within 90 days. Current onboarding requires: (a) integration setup (2-5 days per source system); (b) data migration (1-3 days); (c) configuration validation (2-5 days); (d) training (3-5 days per site cluster). If onboarding capacity is 2-3 clients per month and demand is 5+, clients wait, lose momentum, and potentially churn before go-live. |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Risk Score** | 4 |
| **Mitigation** | (1) **Self-service onboarding**: invest in the AI wizard and template system to enable customers to self-configure 80% of their setup. Target: first plan in < 2 hours without human assistance. (2) **Onboarding automation**: automated integration testing, data validation pipelines, and configuration health checks reduce manual onboarding effort by 50%. (3) **Partner channel**: train implementation partners (consulting firms, SI partners) to handle onboarding, expanding capacity beyond the internal team. (4) **Tiered onboarding**: Standard tier: self-service + async support. Premium tier: dedicated onboarding specialist. Enterprise tier: on-site implementation team. (5) **Onboarding cohorts**: batch new clients into monthly cohorts to create economies of scale in training and support. |
| **Owner** | Customer Success Lead + Product Lead |
| **Status** | Self-service wizard in development; partner channel not started |

### R4.2 -- Support Burden

| Attribute | Detail |
|-----------|--------|
| **Description** | AstraPlanner is a complex system that touches core business operations. Support issues range from simple ("how do I add an employee?") to complex ("the optimization engine assigned 3 employees to Zone C but our union contract says Zone C requires a minimum of 5 during night shift -- why did the solver violate this?"). Complex support requires understanding of the customer's configuration, the optimization engine's constraint model, and potentially the solver's decision trace. Hiring and training support engineers who can handle this takes 3-6 months. If support quality drops, customer satisfaction and retention suffer. |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Risk Score** | 4 |
| **Mitigation** | (1) **In-app diagnostics**: the system provides a "Plan Diagnostics" view that shows which constraints were active, which were binding, and which were relaxed, in plain language. This enables customers to self-diagnose 60-70% of plan questions. (2) **Tiered support model**: L1 (in-app help, chatbot, knowledge base) -> L2 (support engineers with system access) -> L3 (optimization engineers with solver expertise). Target: 80% resolution at L1, 15% at L2, 5% at L3. (3) **Decision trace export**: every plan generation produces a downloadable decision trace that support engineers can analyze without needing to reproduce the scenario. (4) **Knowledge base**: comprehensive, searchable knowledge base built from support tickets, organized by topic and customer vertical. (5) **Support tooling**: internal admin dashboard showing customer configuration, recent plan runs, data quality scores, and integration health -- reducing investigation time per ticket by 40-60%. |
| **Owner** | Support Lead + Engineering Lead |
| **Status** | Plan diagnostics designed; support tooling not started |

### R4.3 -- Multi-Region Deployment

| Attribute | Detail |
|-----------|--------|
| **Description** | Enterprise customers with global operations require data residency compliance: EU employee data must be stored and processed in EU data centers (GDPR Article 44+), Australian data may need to stay in Australia (Privacy Act 1988), and certain US government-adjacent contracts require US-only processing. AstraPlanner's current architecture assumes a single Supabase project (single region). Multi-region deployment requires: (a) separate database instances per region; (b) cross-region configuration synchronization (org-level settings are global, employee data is regional); (c) authentication that works across regions; (d) a routing layer that directs users to the correct regional instance. This is a significant architectural change. |
| **Likelihood** | Low |
| **Impact** | High |
| **Risk Score** | 3 |
| **Mitigation** | (1) **Region-aware data model**: tag every record with a `data_region` field from day one, even before multi-region deployment. This enables future partitioning without schema changes. (2) **Global vs. regional split**: design the data model so that global data (organization config, process templates, role definitions) is small and replicable, while regional data (employees, plans, demand) is large and region-bound. (3) **Phased approach**: Phase 1 (MVP): single region (US). Phase 2: add EU region for GDPR compliance. Phase 3: add APAC. Each phase is a 3-6 month project. (4) **Supabase multi-project**: use separate Supabase projects per region, with a lightweight global metadata service for cross-region operations (user authentication, org-level config). (5) **CDN and edge rendering**: Vercel's global edge network handles frontend latency. Backend API latency is the focus of multi-region work. |
| **Owner** | CTO / Infrastructure Lead |
| **Status** | Not started; `data_region` field not yet in schema |

### R4.4 -- Cost Scaling (AI API Costs)

| Attribute | Detail |
|-----------|--------|
| **Description** | Claude API costs are usage-based. AstraPlanner uses Claude for: (a) setup wizard conversations (5-20 messages per session); (b) plan explanations (1 call per plan view); (c) recommendations (1-3 calls per planning cycle); (d) natural-language constraint authoring. At MVP scale (50 sites, 5 tenants), estimated Claude costs are $200-500/month. At enterprise scale (5,000 sites, 200 tenants), costs could reach $20,000-50,000/month if every user action triggers an API call. Claude Opus costs approximately $15/M input tokens and $75/M output tokens; even with Sonnet ($3/$15), costs compound quickly with high concurrency. |
| **Likelihood** | Medium |
| **Impact** | Medium |
| **Risk Score** | 4 |
| **Mitigation** | (1) **Response caching**: cache AI responses for identical or near-identical queries. Plan explanations for the same plan are cached and served from cache. Setup wizard responses for common configurations are pre-computed. Estimated cache hit rate: 40-60%. (2) **Model tiering**: use Claude Haiku ($0.25/$1.25 per M tokens) for simple tasks (data validation, format conversion), Sonnet for standard tasks (explanations, recommendations), and Opus only for complex tasks (novel constraint authoring, multi-step reasoning). (3) **Batch processing**: aggregate recommendation requests and process in batches rather than per-user-action. (4) **Token budget per tenant**: allocate a monthly AI token budget per tenant based on their tier. Standard: 1M tokens/month. Enterprise: 10M tokens/month. Overage is billed or throttled. (5) **Graceful degradation**: if AI budget is exhausted, the system falls back to template-based explanations and rule-based recommendations rather than failing entirely. |
| **Owner** | Engineering Lead -- AI/ML + Finance |
| **Status** | Model tiering designed; caching and budgets not implemented |

---

## 6. Risk Matrix Visualization

```
                          I M P A C T
                    Low           Medium          High
              +---------------+---------------+---------------+
              |               |               |               |
   High       |               | R1.2  R1.5    | R2.5  R3.1    |
              |               | R2.2  R2.3    |               |
              |               | R3.2          |               |
              +---------------+---------------+---------------+
              |               |               |               |
L  Medium     |               | R1.3  R2.4    | R1.1  R1.4    |
I             |               | R3.4  R4.1    | R2.1  R3.3    |
K             |               | R4.2  R4.4    |               |
E             +---------------+---------------+---------------+
L             |               |               |               |
I  Low        |               |               | R3.5  R4.3    |
H             |               |               |               |
O             |               |               |               |
O             +---------------+---------------+---------------+
D
```

---

## 7. Top 5 Risks Requiring Immediate Attention

| Priority | Risk ID | Risk Name | Score | Rationale for Priority |
|----------|---------|-----------|-------|------------------------|
| 1 | R2.5 | Plan-Reality Gap | 9 | This is the existential product risk. If plans do not survive contact with the floor, the entire value proposition collapses. Real-time re-planning and disruption playbooks must be functional at MVP. |
| 2 | R3.1 | Data Quality Dependency | 9 | Even a perfect optimization engine produces bad plans from bad data. Data quality scoring and validation must be in place before onboarding the first enterprise customer. Every early deployment that fails due to data quality poisons the reference customer pipeline. |
| 3 | R1.1 | Solver Performance at Scale | 6 | Must be validated before signing contracts with 500+ site enterprises. A failed demo due to solver timeout is a lost deal. Benchmarking and hierarchical decomposition should begin immediately. |
| 4 | R1.4 | Database Performance Under Multi-Tenant Load | 6 | Partitioning and read replica strategy must be implemented before the 10th tenant onboards. Performance degradation at 20 tenants would require costly re-architecture under pressure. |
| 5 | R2.2 | Trust Deficit in AI Plans | 6 | Explainability and shadow mode are prerequisites for successful enterprise deployments. Without them, pilot programs will show high override rates, and expansion within the account stalls. |

---

## 8. Risk Review Cadence

| Review Type | Frequency | Participants | Output |
|-------------|-----------|--------------|--------|
| Risk standup | Weekly | Engineering leads, Product lead | Updated risk status, new risks identified |
| Risk review | Monthly | Full leadership team | Risk register update, mitigation progress review |
| Risk audit | Quarterly | Leadership + external advisor | Independent assessment, mitigation effectiveness review |
| Post-incident review | Per incident | Incident responders + relevant risk owners | Root cause analysis, risk register update, mitigation gap identification |

Each risk in this register is a living item. Status transitions follow: **Identified -> Mitigation In Progress -> Mitigated -> Accepted / Closed**. No risk is ever deleted; closed risks remain in the register for historical reference and pattern analysis.
