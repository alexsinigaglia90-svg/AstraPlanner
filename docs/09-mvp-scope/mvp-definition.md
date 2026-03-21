# MVP Definition

## 1. MVP Identity

**Product**: AstraPlanner V1 -- AI-driven workforce planning for logistics operations.

**MVP thesis**: A single logistics site can replace spreadsheet-based shift planning with an AI-optimized system that ingests external demand forecasts, computes workload requirements, generates optimized schedules, and provides a control room for visibility -- all without requiring enterprise integration, real-time streaming, or multi-site orchestration.

**Ship date target**: 24 weeks from project kickoff (see `build-sequence.md` for phased delivery).

---

## 2. MVP User Profile

| Attribute | Specification |
|-----------|--------------|
| **Customer type** | Single-tenant (one organization per deployment) |
| **Site count** | 1-50 sites (each site optimized independently) |
| **Employee count** | < 5,000 employees total across all sites |
| **User roles** | Admin, Planner, Manager, Viewer |
| **Concurrent users** | Max 50 active browser sessions |
| **Industry** | Warehouses, distribution centers, fulfillment hubs |
| **Current tooling** | Spreadsheets (Excel/Google Sheets) or basic WFM software |
| **Technical maturity** | Can provide demand forecasts via CSV or API; no requirement for real-time system integration |

---

## 3. Features IN Scope

### 3.1 Setup Wizard (Phases 1-6, Simplified)

Guided multi-step configuration for onboarding tenants and sites.

| Step | What It Does | MVP Simplification |
|------|-------------|-------------------|
| 1. Organization setup | Company profile, timezone, basic hierarchy | No multi-region hierarchy -- flat tenant with sites |
| 2. Site definition | Operating hours, zones, process paths | Manual entry only, no floor-plan upload |
| 3. Process configuration | Define processes, set productivity rates, map demand units | Predefined templates for common warehouse processes |
| 4. Workforce import | Bulk CSV import, field mapping, validation | CSV only -- no direct HRIS connector in wizard |
| 5. Skill taxonomy | Define skills, assign proficiency levels | Flat skill list (no hierarchical skill graph) |
| 6. Planning rules | Optimization constraints, approval workflows, notifications | Basic constraint set (max hours, rest periods, certifications) |

**Explicitly excluded from MVP wizard**:
- AI-assisted document upload (extract config from uploaded PDFs/docs)
- Clone-and-modify (copy settings from existing site)
- Integration connection step (configure ERP/WMS/HRIS connectors)
- Validation dry-run step

### 3.2 Demand Ingestion

| Capability | Details |
|-----------|---------|
| CSV upload | Upload demand forecast files via the UI; validate schema, map columns, preview before import |
| REST API | Push demand data programmatically via authenticated tRPC endpoint |
| Versioning | Each upload creates a new version; previous versions retained for audit |
| Validation | Schema validation, duplicate detection, out-of-range alerts |
| Normalization | Map heterogeneous demand units to canonical `DemandSignal` structure |

**Not included**: Real-time streaming ingestion, Kafka/Kinesis connectors, automatic polling of external systems.

### 3.3 Workload Computation

| Capability | Details |
|-----------|---------|
| Demand-to-hours conversion | `Required Hours = Demand / Productivity Rate * (1 + Allowance)` per process path |
| FTE calculation | `Required FTEs = Required Hours / Available Hours per FTE` |
| Skill-level awareness | Productivity rates vary by employee skill level |
| Multi-period computation | Compute across shift windows for daily/weekly horizons |
| Output | Workload requirements by site, process path, skill level, and time period |

### 3.4 Basic Optimization

| Capability | Details |
|-----------|---------|
| Greedy heuristic | Fast initial assignment (< 1s) for real-time UI interactions |
| HiGHS MIP solver | Optimal assignment for single-site plans (< 10s interactive, < 60s background) |
| Constraint engine | Hard constraints: max hours, rest periods, certifications, capacity. Soft constraints: preferences, team continuity, overtime minimization |
| Objective function | Minimize weighted combination of cost, unmet demand, overtime, skill mismatch |
| Single-site scope | Each site optimized independently |

**Not included**: Cross-site workforce sharing optimization, multi-period strategic planning solver, column generation algorithms.

### 3.5 Employee Management

| Capability | Details |
|-----------|---------|
| Employee profiles | Name, ID, employment type, contact, contracted hours |
| Skills and certifications | Skill assignments with proficiency levels and expiry dates |
| Availability | Planned leave, recurring unavailability patterns |
| CSV import/export | Bulk operations for employee data |
| CRUD via admin UI | Add, edit, deactivate employees through the web interface |

### 3.6 Shift Assignment

| Capability | Details |
|-----------|---------|
| AI-generated plans | Optimizer produces complete shift assignments from workload requirements + availability |
| Manual adjustments | Drag-and-drop reassignment with real-time constraint validation |
| Gap identification | Highlight uncovered demand slots requiring attention |
| Conflict detection | Flag constraint violations (overtime, rest, certification) in real-time |
| Plan publishing | Finalized plans are marked as published and become the active schedule |

### 3.7 Control Room

| Capability | Details |
|-----------|---------|
| Coverage heatmap | Time-of-day vs. process area matrix, color-coded by staffing coverage % |
| Demand vs. capacity view | Forecasted demand overlaid with planned workforce capacity |
| Basic alerts | Understaffing warnings, certification gap alerts, overtime threshold notifications |
| KPI summary | Total FTEs, coverage %, overtime hours, estimated labor cost |
| Real-time updates | Dashboard updates via Supabase Realtime (WebSocket) |

### 3.8 Simple Scenario Simulation

| Capability | Details |
|-----------|---------|
| Single-variable what-if | Change one input (demand volume, headcount, process rate), re-run optimizer |
| Side-by-side comparison | Compare scenario result against baseline plan on key metrics |
| Scenario persistence | Save named scenarios for later review |
| Metrics displayed | FTE delta, cost delta, coverage delta, constraint violations |

**Not included**: Monte Carlo simulation, multi-variable scenarios, probabilistic outcome distributions.

### 3.9 Plan Versioning

| Capability | Details |
|-----------|---------|
| Snapshot-based | Each plan save creates an immutable snapshot with a version number |
| Version history | Browse previous versions of any plan |
| Version comparison | Side-by-side diff showing changes between any two versions |
| Restore | Restore a previous version as the new draft |

**Not included**: Event-sourced plan history, granular operation-level replay.

### 3.10 Basic Approval Workflow

| Capability | Details |
|-----------|---------|
| Workflow states | Draft -> Proposed -> Approved -> Published |
| Role-based transitions | Planners propose; Managers/Admins approve; system publishes |
| Approval notifications | Email + in-app notification when a plan is submitted for approval |
| Rejection with comments | Approvers can reject with a reason, sending it back to draft |

**Not included**: Multi-level approval chains, delegation, conditional auto-approval rules.

### 3.11 Role-Based Access Control

| Role | Capabilities |
|------|-------------|
| Admin | Full system configuration, user management, all site access, billing |
| Planner | Create/edit plans, run scenarios, submit for approval (assigned sites) |
| Manager | View/approve plans, view dashboards, manage workforce data (assigned sites) |
| Viewer | Read-only access to dashboards and published plans (assigned sites) |

Enforced at three levels: UI (route guards), API (tRPC middleware), Database (RLS policies).

---

## 4. Features Explicitly OUT of Scope

The following features are intentionally excluded from MVP. Each has been evaluated and deferred for documented reasons.

| Feature | Rationale for Deferral | Planned Version |
|---------|----------------------|-----------------|
| **Built-in demand forecasting** | Requires historical data accumulation (6+ months), ML pipeline, model management. MVP customers already have forecasts from ERP/WMS. | V2 |
| **Monte Carlo simulation** | Computationally expensive, requires probabilistic demand models. Simple what-if scenarios cover 80% of planner needs. | V2 |
| **Multi-agent Ruflo orchestration** | Experimental technology. Single-agent Claude provides sufficient AI capability for MVP features. | V2 (validation phase) |
| **Cross-site workforce sharing optimization** | Requires multi-site solver, transfer cost modeling, inter-site logistics. Single-site optimization delivers immediate value. | V2 |
| **Mobile app** | Responsive web app covers mobile viewing needs. Native app adds build/maintenance burden without proportional value for planners (desktop-primary workflow). | V2+ |
| **Employee self-service portal** | Shift swap requests, availability updates, preference management. Requires separate auth flow and notification system for non-planner users. | V2 |
| **Payroll calculation** | AstraPlanner plans labor; it does not replace payroll systems. Export planned hours for payroll processing. | Never (integration only) |
| **Time & attendance integration** | Real-time badge/scan integration for actual vs. planned tracking. Requires streaming infrastructure and site hardware integration. | V2 |
| **Union/CBA rule engine** | Complex labor agreement rules (seniority bidding, bumping rights, grievance tracking). Requires deep domain customization per customer. | V2+ |
| **Offline mode / Service Workers** | Progressive Web App with offline capability. Requires local data sync, conflict resolution (CRDTs), service worker lifecycle management. | V3+ |
| **Multi-region deployment** | Single Supabase project in one region for MVP. Multi-region adds complexity (replication lag, conflict resolution, data residency). | V2+ |
| **Advanced analytics / BI** | Custom report builder, data export to BI tools, embedded analytics. Basic KPI dashboards cover MVP needs. | V2 |
| **AI document extraction** | Auto-configure sites from uploaded floor plans, process documents, labor agreements. Requires document parsing pipeline. | V2 |
| **Clone-and-modify sites** | Copy configuration from existing site as starting point. Useful at scale but not needed for initial 1-50 site deployments. | V1.1 |
| **Real-time telemetry ingestion** | Streaming scan events, IoT sensor data, equipment status. Requires Kafka/Kinesis pipeline. | V2 |
| **Multi-language UI** | next-intl infrastructure is in place but only English translations ship in MVP. | V1.1 |

---

## 5. MVP Technical Constraints

| Constraint | Limit | Rationale |
|-----------|-------|-----------|
| Supabase project | Single project, single region | Simplicity; multi-region adds operational complexity beyond MVP needs |
| Language | English only | Translation is non-trivial; i18n infrastructure ready for V1.1 |
| Concurrent users | Max 50 active sessions | Supabase connection pool limits; sufficient for single-tenant with 1-50 sites |
| Database size | < 10 GB per tenant | Supabase Pro plan allocation; sufficient for 5,000 employees, 50 sites, 2 years of plans |
| Optimization (interactive) | 10-second solver time budget | HiGHS WASM in Edge Function; keeps UI responsive |
| Optimization (background) | 60-second solver time budget | Fly.io worker for larger problems; BullMQ queue |
| Edge Function execution | 60-second timeout, 256MB memory | Supabase platform limits |
| File uploads | Max 50MB per CSV file | Supabase Storage limits; sufficient for 100K+ row demand files |
| AI (Claude) usage | Rate-limited per tenant (configurable quota) | Cost control; AI features are metered |
| Browser support | Latest 2 versions of Chrome, Firefox, Safari, Edge | Standard evergreen browser support |

---

## 6. Success Criteria for MVP Launch

MVP is considered launch-ready when ALL of the following criteria are met:

### 6.1 Functional Criteria

- [ ] A new tenant can complete the setup wizard (Phases 1-6) and have a functional site configured in < 60 minutes
- [ ] Demand data can be uploaded via CSV and is validated, normalized, and visible within 5 minutes
- [ ] Workload computation correctly converts demand into hours/FTE with < 1% arithmetic error vs. manual calculation
- [ ] HiGHS optimizer generates a valid shift plan for a 50-employee, 7-day, single-site scenario in < 10 seconds
- [ ] A planner can manually adjust assignments via drag-and-drop with real-time constraint validation
- [ ] Coverage heatmap accurately reflects planned staffing vs. demand requirements
- [ ] Plan versioning correctly snapshots and allows side-by-side comparison
- [ ] Approval workflow transitions (draft -> proposed -> approved -> published) work end-to-end
- [ ] RBAC enforces role boundaries at UI, API, and database levels (verified by security test)

### 6.2 Non-Functional Criteria

- [ ] API response time (P95) < 500ms for standard CRUD operations
- [ ] Dashboard loads in < 3 seconds on a 10 Mbps connection
- [ ] System handles 50 concurrent users without degradation (verified by load test)
- [ ] Zero cross-tenant data leakage (verified by RLS penetration test)
- [ ] All state-changing operations produce audit log entries
- [ ] System recovers from Edge Function timeout gracefully (user sees error, can retry)
- [ ] CSV import handles 10,000 rows in < 30 seconds with validation feedback

### 6.3 Quality Criteria

- [ ] Unit test coverage > 80% for business logic (workload computation, constraint engine)
- [ ] End-to-end test suite covers all critical paths (Playwright, 50+ scenarios)
- [ ] No P0/P1 bugs open
- [ ] Security audit completed (OWASP Top 10 checklist, RLS policy review)
- [ ] Performance benchmarks documented and baselined

### 6.4 Operational Criteria

- [ ] Monitoring and alerting configured (Sentry, BetterUptime, Supabase Dashboard)
- [ ] Runbook documented for common failure scenarios (Edge Function timeout, DB connection exhaustion, solver failure)
- [ ] Backup and restore procedure tested (Supabase point-in-time recovery)
- [ ] Onboarding documentation sufficient for a new customer to self-serve setup wizard

---

## 7. Estimated Build Sequence (Summary)

The detailed build sequence with deliverables, dependencies, risks, and exit criteria is in `build-sequence.md`. Below is the high-level phasing:

| Phase | Weeks | Focus | Key Deliverable |
|-------|-------|-------|----------------|
| 0 | 1-2 | Foundation | Supastarter scaffold, Supabase project, auth, RLS, base schema |
| 1 | 3-5 | Data Core | Site/process/employee/skill CRUD, CSV import |
| 2 | 6-8 | Demand & Workload | Demand ingestion, workload computation, FTE calculation |
| 3 | 9-12 | Optimization | HiGHS WASM, greedy heuristic, constraint engine, plan generation |
| 4 | 13-15 | Planning UX | Control room, schedule grid, manual adjustments, drag-and-drop |
| 5 | 16-18 | Setup Wizard | Guided configuration flow, smart defaults, basic AI suggestions |
| 6 | 19-20 | Polish | Scenario simulation, approval workflows, notifications, reporting |
| 7 | 21-22 | Hardening | Security audit, performance testing, edge cases, documentation |
| 8 | 23-24 | Launch Prep | Beta testing, seed data, onboarding flow, monitoring setup |

**Critical path**: Phase 0 -> Phase 1 -> Phase 2 -> Phase 3 -> Phase 4. The optimization engine (Phase 3) cannot begin until demand and workload data structures exist (Phases 1-2). The planning UX (Phase 4) requires a working optimizer.

**Parallelizable**: Phase 5 (Setup Wizard) can be built in parallel with Phase 4 (Planning UX) by a second developer or sub-team, since the wizard writes configuration data consumed by the planning engine, but does not depend on the planning UI.

---

## 8. Risk Acknowledgments

| Risk | Impact | Mitigation |
|------|--------|-----------|
| HiGHS WASM performance insufficient for target problem sizes | Solver fails or times out on real customer data | Fly.io fallback solver is the safety net; tune problem formulation to reduce variable count |
| Supabase Edge Function limits too restrictive | 60s timeout or 256MB memory insufficient for some operations | Offload to Fly.io workers via BullMQ; design for async result delivery |
| Single-region Supabase creates latency for non-local users | Users far from Supabase region experience slow DB queries | Vercel CDN caches static content globally; accept higher latency for MVP; plan multi-region for V2 |
| RLS policy gaps allow cross-tenant data leakage | Security breach, loss of customer trust | Mandatory RLS policy review as part of every schema migration; automated penetration test in CI |
| MVP scope creep delays launch | Ship date slips, team burns out | This document is the hard scope boundary; any addition requires removing something else |
