# AstraPlanner Foundation Audit: Contradictions, Over-Engineering, Under-Specification, and Gaps

> Audit date: 2026-03-20
> Scope: All 60 documents (2.1 MB), zero code
> Sources: REVIEW-FULL.md, SYSTEMS-REVIEW.md, and independent cross-document analysis

---

## SECTION 1: Internal Contradictions

Documents that disagree with each other on facts, architecture, or specifications.

### Previously Identified Contradictions (from REVIEW-FULL.md and SYSTEMS-REVIEW.md)

#### C1: Hard constraints "never relaxed" vs regulatory override with manager approval

- **Documents:** `constraint-handling.md` Section 3 vs `planning-adjustments.md` Section 5.2
- **Contradiction:** constraint-handling.md states hard constraints "must never be violated" and "a solution that violates any hard constraint is rejected outright." planning-adjustments.md allows regulatory constraint overrides "only by authorized role (Site Manager+) with documented reason."
- **Which is correct:** planning-adjustments.md is more operationally realistic. Hard constraints should be inviolable by the solver, but a human override path with full audit trail is necessary for exceptional circumstances. However, the override should be classified as a "controlled exception" rather than a constraint relaxation.
- **Update needed:** constraint-handling.md should add a section on "Human Exception Path" that describes how authorized users can create assignments that the solver would reject, with mandatory audit trail and compliance warning.

#### C2: Multi-site transfer batch cycle (15 min) vs real-time reactive cross-site transfers

- **Documents:** `module-breakdown.md` (Multi-Site Coordinator, 15-minute batch cycle) vs `decision-hierarchy.md` (Level 3 reactive decisions requiring real-time cross-site response)
- **Contradiction:** The Multi-Site Coordinator processes transfer recommendations on a 15-minute batch cycle. The decision hierarchy claims reactive (Level 3) decisions require sub-second latency, including cross-site transfers triggered by absences.
- **Which is correct:** module-breakdown.md is realistic. Cross-site transfers involve employee notification, travel time, and manager coordination. Real-time automated cross-site transfers are operationally infeasible. The decision hierarchy document overpromises reactive latency for cross-site actions.
- **Update needed:** decision-hierarchy.md should acknowledge that cross-site transfers are tactical (minutes to hours), not reactive (seconds).

#### C3: Override "without justification" (Principle 6) vs manager approval for skill changes

- **Documents:** `planning-principles.md` Principle 6 vs `failure-modes.md` Failure 4.3
- **Contradiction:** Principle 6 states "Any AI-generated recommendation can be overridden by an authorized human at any time, without justification." Failure 4.3 (Gaming the System) states skill profiles "cannot be self-modified by workers without manager approval" and anomaly detection flags suspicious patterns.
- **Which is correct:** Both are correct for their scope. Principle 6 applies to planning overrides (assignment changes). Failure 4.3 applies to data integrity (skill profiles). These are different domains. The contradiction is in the use of the word "override" without scoping.
- **Update needed:** Principle 6 should clarify that "override" applies to planning recommendations, not to data integrity controls (skill profiles, certifications, compliance rules).

#### C4: tRPC middleware sets `app.tenant_id` session variable vs RLS using `auth.jwt()` claim extraction

- **Documents:** `backend-architecture.md` vs `multi-tenancy.md` vs `schema.sql`
- **Contradiction:** Three different RLS mechanisms across three documents:
  - system-overview.md: `auth.jwt() ->> 'tenant_id'`
  - backend-architecture.md: `current_setting('app.tenant_id')` (set by middleware)
  - schema.sql: `auth.organization_id()` (reads `request.jwt.claims`)
- **Which is correct:** The schema.sql approach (JWT-based, using Supabase's native `auth.jwt()` function) is the most Supabase-native and should be canonical. The middleware approach (`current_setting`) is appropriate for service-role connections where JWT is not available.
- **Update needed:** Standardize on `auth.jwt() ->> 'tenant_id'` for all user-facing RLS policies. Use `current_setting('app.tenant_id')` only for service-role server-side operations with explicit documentation.

#### C5: 10-second polling rate vs 100 reads/min rate limit

- **Documents:** `frontend-architecture.md` vs `backend-architecture.md`
- **Contradiction:** Frontend polls assignments every 10 seconds (6 req/min). Background TanStack Query refetches add 20-30 req/min. Total: 25-36 req/min before user interaction. Rate limit is 100 reads/min per user. A planner with Planning Workbench + Control Room open approaches the limit from background activity alone.
- **Which is correct:** The rate limit is too low for the polling strategy, or the polling frequency is too high.
- **Update needed:** Replace polling with Supabase Realtime subscriptions for assignment changes. Reserve polling for data that does not support real-time subscriptions. Increase rate limit to 300 reads/min or batch background fetches into aggregated queries.

#### C6: Sub-second Level 3 reactive latency vs Edge Function cold starts

- **Documents:** `decision-hierarchy.md` vs `tech-stack.md`
- **Contradiction:** The decision hierarchy claims reactive (Level 3) decisions have sub-second latency requirements. Supabase Edge Functions have 50-150ms cold starts, plus database query time, plus solver execution time. A realistic end-to-end latency for a reactive re-assignment is 500ms-2s, not sub-second.
- **Which is correct:** tech-stack.md is realistic about cold start latency. decision-hierarchy.md's sub-second target is aspirational.
- **Update needed:** decision-hierarchy.md should specify realistic latency targets: 1-3 seconds for single-employee reactive decisions, 5-30 seconds for shift-level re-optimization.

### Newly Identified Contradictions

#### C7: Proficiency scale mismatch (4-level vs 5-level)

- **Documents:** `wizard-flow.md` Phase 5 vs `planning-principles.md` Principle 3 vs `constraint-handling.md` Section 2.5
- **Contradiction:** wizard-flow.md Phase 5 defaults to a 4-level proficiency scale (Trainee/Developing/Proficient/Expert at 50%/75%/100%/110%). planning-principles.md Principle 3 shows a 5-level scale (1-5). constraint-handling.md references minimum skill levels using the 5-level scale. If an organization uses 4 levels, their "Expert" (level 4) maps to "Proficient" (level 4/5) in the solver, causing systematic undercounting.
- **Which is correct:** The proficiency scale must be org-configurable, not hardcoded.
- **Update needed:** Add `proficiency_scale_config` to the Organization entity. The solver must read the org's scale to map levels to productivity multipliers.

#### C8: Naming inconsistency -- tenant_id vs organization_id

- **Documents:** system-overview.md uses `tenant_id`, schema.sql uses `organization_id`, backend-architecture.md uses both, build-sequence.md references table names that do not exist in schema.sql (`DemandSignal` vs `demand_forecast`).
- **Impact:** Integration bugs between independently-developed modules. An engineer referencing schema.sql and another referencing system-overview.md will use different column names.
- **Update needed:** Standardize on one term. Recommendation: use `organization_id` in the data model (matching schema.sql) and `tenant` in infrastructure/architecture documents. Create a glossary entry.

#### C9: Tech stack contradicts MVP scope

- **Documents:** `tech-stack.md` vs `mvp-definition.md`
- **Contradiction:**
  - tech-stack.md lists 7 locales at launch; mvp-definition.md says English only
  - tech-stack.md describes TypeScript-native Monte Carlo engine; mvp-definition.md defers Monte Carlo to V2
  - tech-stack.md describes Service Worker offline caching; mvp-definition.md defers offline to V3+
  - tech-stack.md lists dual embedding providers (Voyage AI + OpenAI); mvp-definition.md does not mention embeddings
- **Which is correct:** mvp-definition.md should be authoritative for scope. tech-stack.md should be updated to distinguish "MVP stack" from "target stack."
- **Update needed:** Add a column to tech-stack.md technology decision matrix indicating MVP vs V2 vs V3 for each technology.

#### C10: Schema structure -- flat vs modular

- **Documents:** `backend-architecture.md` vs `schema.sql`
- **Contradiction:** backend-architecture.md describes per-module PostgreSQL schemas (`demand.*`, `workforce.*`, `planning.*`). schema.sql places all tables in the `public` schema. This affects every ORM query, every migration, and every cross-module view.
- **Which is correct:** Must be decided before Phase 0 ends. The modular approach is better for large codebases but adds complexity.
- **Update needed:** Make a decision and update both documents. Recommendation for MVP: use `public` schema with naming conventions (`demand_`, `workforce_`, `planning_` prefixes) to avoid schema management overhead.

#### C11: Missing extensions in schema.sql

- **Documents:** `schema.sql` vs `tech-stack.md` and `backend-architecture.md`
- **Contradiction:** schema.sql does not include `pgvector`, `pgsodium`, `pgaudit`, or `pg_cron` -- all described as core dependencies. Employee PII columns (`first_name`, `last_name`, `email`) are plain VARCHAR with no encryption, contradicting the stated `pgsodium` encryption requirement.
- **Update needed:** Add extension enablement to schema.sql. Add encryption to PII columns. Add pgaudit configuration.

### Overall Consistency Score: **4/10**

The knowledge base has fundamental contradictions in its most load-bearing specifications: the tech stack, the data model, the RLS mechanism, and the proficiency scale. An implementation team would need to spend 1-2 weeks resolving contradictions before writing code. The contradictions between tech-stack.md and system-overview.md (now being resolved) were the most severe, but the remaining contradictions (C4-C11) are individually smaller but collectively create significant integration risk.

---

## SECTION 2: Over-Engineering

Features and systems designed in excessive detail for a pre-build phase.

### Over-Engineering Inventory

| # | Feature | Document(s) | Effort to Build | Why It Is Premature | Simplified MVP Version |
|---|---------|-------------|-----------------|---------------------|----------------------|
| OE1 | Monte Carlo simulation (1,000-10,000 iterations, LHS, correlation matrices) | scenario-simulation.md | 4-6 weeks | No demand correlation data exists. Heuristic solver noise contaminates confidence intervals (Bug A4). | Simple what-if: change one input, re-run solver, compare results. |
| OE2 | GA/SA solver strategies (chromosome encoding, crossover operators, temperature schedules) | algorithm-strategies.md | 4-6 weeks | GA encoding is broken (Bug A2). SA Phase 3 is just hill climbing (Bug A3). Greedy + HiGHS MIP covers 95% of real scenarios. | Greedy heuristic + HiGHS MIP with warm start. |
| OE3 | Event sourcing for plan versioning (immutable event stream, time travel, event replay) | event-architecture.md | 3-4 weeks | Snapshot-per-version provides the same audit capability. Event sourcing adds complexity (event versioning, snapshot management, eventual consistency) without MVP value. | Store full plan state at each version. |
| OE4 | Fleet Learning Defaults (k-anonymity, aggregated cross-tenant config data, CoV thresholds) | wizard-logic.md Section 2.5 | 3-4 weeks | No fleet data at launch. Requires n>=30 comparable configurations per field. Won't have data for any segment for 12+ months. | Expert-curated static defaults per industry vertical. |
| OE5 | 11-document AI Intelligence Layer (learning models, organizational intelligence, user cognitive models, recommendation engine with 13 types) | 10-ai-layer/ (all 11 docs) | 80-120 weeks total | No users, no operational data, no training data. Building ML infrastructure before having data is premature. | MVP AI: NLU entity extraction for wizard, rule-based daily alerts, plan explanation templates. |
| OE6 | 7-level configuration hierarchy (Global > Industry > SiteType > Regional > Fleet > Custom) | wizard-logic.md Section 2.1 | 2-3 weeks | Configuration inheritance bugs are notoriously difficult to debug. Most deployments need 3 levels. | 3 levels: org defaults > site overrides > field-level overrides. |
| OE7 | Configurable widget dashboard (drag-drop, resize, named layouts, role-based defaults, custom widget catalog) | control-room.md Section 2.3 | 3-4 weeks | Premature before user research validates which widgets users actually need. Fixed layouts are faster to build and easier to support. | Fixed role-based dashboard layouts. User research in V2, customization in V3. |
| OE8 | Three scheduling views (Timeline, Process, Gantt) with full drag-and-drop, constraint validation, and virtualization | planning-adjustments.md Section 4 | 12-16 weeks for all three | Building 3 production-quality interactive scheduling views is 3x the work for marginal incremental value. | One view (Process View: processes as rows, time slots as columns). Timeline view in V2. Gantt in V3. |
| OE9 | CRDT-based offline mode with edge components | Referenced in tech-stack.md, audit docs | 6-8 weeks | Enterprise logistics planners are always online. Offline planning introduces conflict resolution complexity. | Online-only. |
| OE10 | Full WCAG 2.1 AA compliance on drag-and-drop scheduling grid | Referenced in tech-stack.md, frontend-architecture.md | 4-8 weeks | Keyboard-accessible drag-and-drop with ARIA announcements across a scheduling grid is one of the hardest a11y problems in web development. | Basic a11y (keyboard navigation, screen reader labels). Full compliance in V2. |
| OE11 | Skill decay model (automatic proficiency degradation based on days since last practice) | Multiple docs in optimization-engine/ | 1-2 weeks | Requires `last_practiced_date` that does not exist in the schema (SYSTEMS-REVIEW 1.1). Most companies manage skill levels manually. Unvalidated feature assumption. | Manual skill management: supervisors update proficiency levels. |
| OE12 | CBA/union contract AI parsing (NLP extraction from legal documents) | wizard-ai-strategies.md Strategy 2 | 3-4 weeks | Highest-risk AI claim. Legal language with intentional ambiguity. Errors surface during union grievances (W9). | Manual CBA rule entry with structured forms. |
| OE13 | 7-locale internationalization at launch | tech-stack.md Section 2.8 | 2-3 weeks | Translation and QA across 7 languages. English-only covers the launch market. | English only. Add locales based on customer demand. |

**Total over-engineering effort: approximately 130-180 engineering weeks** that could be redirected to core planning quality, schema bug fixes, and the missing MVP components.

### Over-Engineering Risk Score: **8/10**

The documentation set designs a mature enterprise platform while the actual product maturity is pre-alpha. The AI Intelligence Layer alone (11 documents, 80-120 weeks of work) exceeds the total engineering budget suggested by the tech stack's "3-5 engineer" team assumption for the first year. If an implementation team treats the documentation as a requirements specification, they will spend 2-3 years building infrastructure before delivering a working planning tool.

---

## SECTION 3: Under-Specification

Places where an engineer would get stuck because the documentation does not provide enough detail to build.

### Under-Specification Inventory

| # | Missing Specification | Needed By | Impact If Missing | What Needs to Be Specified |
|---|----------------------|-----------|-------------------|---------------------------|
| US1 | **Optimizer Input/Output Contract** | Backend team, frontend team, test team | Cannot build solver, cannot build result display, cannot write solver tests | TypeScript interfaces for `SolverInput` (employees, processes, demand, constraints, time budget) and `SolverOutput` (assignments, diagnostics, coverage metrics, solve time). SYSTEMS-REVIEW.md Section 2.2 provides a starting point. |
| US2 | **Plan State Machine** | Backend team, frontend team | Invalid plan transitions (can Published go back to Draft?), undefined triggers for Stale state, unclear role permissions per transition | Explicit state diagram with valid transitions, triggering events, and role permissions. SYSTEMS-REVIEW.md Section 2.4 provides a draft. |
| US3 | **Absence/Leave Data Entity** | Optimizer, Control Room, reporting | Every plan ignores planned absences. System cannot distinguish weekly availability template from date-specific leave. Day-1 user failure. | `employee_availability_override` entity with (employee_id, date, override_type, status). SYSTEMS-REVIEW.md Section 1.3 specifies the fix. |
| US4 | **Employee-Facing Interface** | Employees (largest user group), plan-reality feedback loop | Workers cannot view their schedule, report absence, or acknowledge changes. The closed-loop feedback that failure-modes.md identifies as critical (Failure 3.1) cannot function. | Minimal employee web portal: view schedule, report absence, acknowledge schedule changes. SYSTEMS-REVIEW.md Section 2.1. |
| US5 | **tRPC Procedure Contracts** | Frontend team, backend team | Frontend engineers cannot build API calls. Backend engineers cannot build handlers. No machine-readable API specification exists. | Type-safe procedure definitions for all module routers (demand, workload, workforce, optimization, planning, wizard, integration). |
| US6 | **Role and Permission Taxonomy** | Auth layer, RLS policies, UI permission checks | RLS uses `('planner', 'admin', 'system')`. Wizard defines Site Manager, Regional Manager, HR Manager. Module-breakdown defines viewer, planner, approver, administrator. These three taxonomies don't map to each other (Bug D12). | Single role hierarchy: `super_admin > tenant_admin > site_manager > planner > supervisor > viewer`. Map each role to specific permissions per module. |
| US7 | **Deployment and Environment Specification** | DevOps/infrastructure | No environment variables, no Supabase project configuration, no Infrastructure-as-Code, no secrets management for API keys | `.env.example`, Supabase project setup guide, Vercel project configuration, secrets inventory (Claude API key, integration credentials, SMTP). |
| US8 | **Test Strategy** | QA team, all developers | No test pyramid, no RLS integration test plan, no solver test fixtures, no strategy for testing constraint compliance | Test strategy document: unit test coverage targets, integration test plan (especially for RLS cross-tenant isolation), solver test fixtures with known-good solutions, compliance constraint test scenarios. |
| US9 | **Workbench Concurrency Model** | Frontend team, real-time infrastructure | Two managers can silently overwrite each other's work. No presence indicators, no conflict detection. | Supabase Realtime subscription per plan version. Broadcast assignment changes. Presence indicators. Conflict detection at edit time. |
| US10 | **Data Migration and Seed Data** | Onboarding team, development team | No tenant bootstrap procedure, no benchmark/test data source, no strategy for migrating from existing planning tools | Tenant provisioning procedure, seed data for development/testing (sample employees, demand, processes), import specifications for common source formats. |
| US11 | **Equipment Inventory Entity** | Optimizer, capacity planning | Process has `equipment_required` tags but no site-level equipment counts. Optimizer cannot enforce "only 8 forklifts available" (Bug D8). | `site_equipment` entity with (site_id, equipment_type, quantity_available, maintenance_schedule). Optimizer uses as capacity constraint. |
| US12 | **Shift Swap / Schedule Change Request Workflow** | Employee self-service, supervisor workflow | Day-1 operational need. Employees request shift swaps constantly. No entity, no workflow, no approval chain. | `shift_swap_request` entity with requester, target_employee, proposed_swap, status, approver. Workflow: request > supervisor review > accept/reject > plan update. |
| US13 | **Prompt Management System** | AI team | Prompts are inline strings in documentation. No versioning, no A/B testing, no performance tracking. When prompts need updating (which they will), there is no system for managing the change. | Prompt template library with version control, deployment mechanism, and performance tracking (acceptance rate, error rate per prompt version). |
| US14 | **Cost Model / Infrastructure Cost Projections** | Business planning, pricing decisions | No projected infrastructure cost at each scale tier. Cannot make pricing decisions without knowing cost-to-serve. | Cost model: Supabase plan costs by tier, Vercel costs by usage, Claude API costs by feature usage volume, Fly.io costs for solver workers. Map to pricing tiers. |
| US15 | **Identity Resolution Across Source Systems** | Integration team | Worker IDs differ across SAP, WMS, and payroll. "Fuzzy matching" is mentioned but no algorithm, no confidence threshold, no manual resolution workflow is specified. | Identity resolution service: matching rules (exact ID match, name + DOB match, fuzzy name match with confidence threshold), manual resolution UI for ambiguous matches, audit trail. |

### Under-Specification Risk Score: **7/10**

The most critical under-specifications are US1 (Optimizer I/O Contract), US3 (Absence Entity), and US4 (Employee Interface). Without the optimizer contract, the solver team, backend team, and frontend team cannot work independently. Without the absence entity, every plan the system produces is wrong. Without the employee interface, the largest user group has no way to interact with the system.

The under-specifications are fixable -- most require 1-3 days of specification work each. The risk is not that they are hard to fix but that they are easy to miss, leading to integration failures when separately-developed components first connect.

---

## SECTION 4: Conceptual Gaps

Domain logic that is entirely absent from the documentation.

### Missing Workforce Planning Concepts

| # | Concept | Why It Matters | Where It Should Appear |
|---|---------|---------------|----------------------|
| CG1 | **Annualized hours contracts** | Common in European logistics. Employee contracted for 1,800 hours/year, distributed flexibly across weeks. More hours in peak season, fewer in quiet periods. The current model assumes fixed weekly hours, which cannot represent this contract type. | data-entities.md (Employee contract model), constraint-handling.md (annualized hours constraint) |
| CG2 | **Split shifts** | Common in last-mile delivery and food service logistics. Employee works 06:00-10:00, goes home, returns 16:00-20:00. The current data model can represent this as two ShiftAssignments but the minimum rest constraint (11 hours between shifts) would incorrectly flag this as a violation. | constraint-handling.md (split shift exception), data-entities.md (shift type classification) |
| CG3 | **On-call / standby scheduling** | Common in cold chain and hazmat operations. Employee is not on-site but must be reachable within 60 minutes. On-call hours may count toward working time limits in some jurisdictions (EU case law). | data-entities.md (assignment type: active/standby/on-call), constraint-handling.md (on-call working time rules) |
| CG4 | **Attrition forecasting** | Workforce planning is not just scheduling -- it includes headcount planning. If turnover is 40% annually (common in warehouse operations), the planner needs to account for ramp-down of departing employees and ramp-up of replacements. | A new document in 05-optimization-engine/ covering workforce capacity planning beyond shift scheduling |
| CG5 | **Absenteeism prediction** | The documents model historical absence patterns but do not predict future absences. A planning system should forecast expected absence rates by day-of-week, season, and team to build buffer capacity into plans proactively rather than reactively. | optimization-strategy.md (absence buffer calculation), data-entities.md (absence forecast entity) |
| CG6 | **Worker fatigue modeling beyond consecutive days** | The current fatigue model only considers consecutive working days. Real fatigue is influenced by shift type (night > day), physical intensity (freezer > ambient), shift duration, and rotation pattern (forward rotation > backward rotation). Ergonomics research (e.g., Folkard & Tucker) provides validated models. | constraint-handling.md (expanded fatigue model with shift type, intensity, and rotation factors) |
| CG7 | **Seasonal demand shaping** | The system optimizes supply (workforce) to meet demand, but does not consider demand shaping -- renegotiating delivery windows, shifting promotional events, or staggering client onboarding to flatten demand peaks. This is a strategic planning capability. | A new document or section covering demand-side planning options |

### Missing Logistics Operational Realities

| # | Reality | Why It Matters | Where It Should Appear |
|---|---------|---------------|----------------------|
| LG1 | **Induction / ramp-up costs** | Hiring temporary workers for peak season has a hidden cost: weeks 1-2 are at 60% productivity. The system models this productivity ramp but does not model the training cost (trainer time, reduced throughput of the training zone, admin time for onboarding). | A cost model section in optimization-strategy.md |
| LG2 | **Equipment sharing and contention** | Two forklifts cannot be in the same aisle simultaneously. Picking carts have a maximum density per zone. The documents model equipment as a headcount constraint but not as a spatial/temporal contention resource. | constraint-handling.md (equipment contention constraints), data-entities.md (equipment allocation entity) |
| LG3 | **Supervisor-to-worker ratios** | Many operations require 1 supervisor per N workers (typically 1:15-1:25). Agency workers often require higher supervision ratios (1:10). The optimizer should enforce minimum supervisor ratios per shift. | constraint-handling.md (supervisor ratio constraint), data-entities.md (add supervisor flag to employee) |
| LG4 | **Handoff/transition time between zones** | When an employee is reassigned from Zone A to Zone B mid-shift, there is 10-30 minutes of non-productive time (walk, re-orient, log into new system). The productivity impact of zone changes is not modeled. | optimization-strategy.md (zone transition penalty in objective function) |
| LG5 | **Break staggering optimization** | The documents mention break staggering (max 15% of workforce on break simultaneously) but do not model the optimization problem: which employees take breaks when, ensuring that no process drops below minimum staffing during any break window. | optimization-strategy.md (break scheduling as a sub-problem of the main optimization) |

### Missing Enterprise Requirements

| # | Requirement | Why It Matters | Where It Should Appear |
|---|------------|---------------|----------------------|
| ER1 | **SSO/SCIM provisioning** | Enterprise customers require automated user provisioning via SCIM protocol. When an employee is deactivated in Okta/Azure AD, they must be immediately deactivated in AstraPlanner. Supabase Auth supports SAML but SCIM support is unclear. | tech-stack.md (auth section), a new integration spec for identity providers |
| ER2 | **Data residency requirements** | EU customers may require that employee PII is stored in EU data centers only. Supabase hosted on AWS may default to US regions. The architecture does not address data residency. | A new section in tech-stack.md or a compliance document covering data residency by region |
| ER3 | **Audit log immutability** | For regulated industries (pharma, food), audit logs must be tamper-proof. PostgreSQL tables can be modified by database admins. The current architecture does not provide cryptographic immutability guarantees. | audit-and-compliance module documentation, potentially using append-only S3 storage for audit records |
| ER4 | **Change management and rollback** | When configuration changes (productivity standards, shift patterns, constraint rules) are deployed across 500 sites, there must be a mechanism to roll back a change if it causes problems at one site without affecting others. | A new section in the setup/configuration documentation covering change propagation and rollback |
| ER5 | **Integration with existing LMS (Labor Management Systems)** | Many large warehouses already have a Labor Management System (Manhattan LMS, Blue Yonder LM) that tracks individual worker productivity. AstraPlanner should consume this data for productivity calibration, but no LMS integration is specified. | integration-architecture.md (add LMS as a source system type) |
| ER6 | **Report scheduling and distribution** | Enterprise users expect automated report generation and email distribution on a schedule (weekly headcount summary to VP, daily coverage report to site managers). The Control Room shows reports but has no scheduled distribution mechanism. | control-room.md or a new reporting specification |
| ER7 | **API rate limiting per integration partner** | When AstraPlanner serves as a data source for downstream systems (payroll, BI tools), those systems need rate-limited API access. The current rate limiting is per-user, not per-integration-partner. | tech-stack.md (API layer section), integration-architecture.md (outbound API section) |

---

## Score Summary

| Dimension | Score | Interpretation |
|-----------|-------|---------------|
| Internal Consistency | 4/10 | 11 contradictions identified, including architecture-level conflicts between tech stack documents |
| Over-Engineering Risk | 8/10 | 130-180 weeks of over-engineered features documented in detail while foundational schema has unfixed bugs |
| Under-Specification Risk | 7/10 | 15 critical specifications missing, including optimizer I/O contract, absence data model, and employee interface |
| Conceptual Completeness | 6/10 | Strong on scheduling optimization, weak on workforce capacity planning, missing several operational realities |

### Overall Documentation Quality: 5/10

The documentation demonstrates exceptional domain knowledge and vision but fails as an implementation specification due to:

1. **Contradictions** that force resolution before development can begin
2. **Over-engineering** that would consume the entire engineering budget on non-MVP features
3. **Under-specification** of the exact interfaces needed for teams to work independently
4. **Conceptual gaps** in operational realities that experienced logistics professionals would immediately notice

The path forward is clear: fix the 14 schema bugs, resolve the 11 contradictions, write the 5 most critical missing specifications (optimizer I/O, absence entity, plan state machine, employee portal, role taxonomy), and defer the 130-180 weeks of over-engineered features to post-MVP. This work can be completed in 3-4 weeks of focused specification effort before coding begins.
