# Backend Architecture

## 1. Architectural Philosophy: Modular Monolith on Supabase

AstraPlanner's backend is a **modular monolith** deployed as Supabase Edge Functions, not a microservices architecture. This is a deliberate architectural decision with specific rationale.

### 1.1 Why Not Microservices

| Concern | Microservices Approach | AstraPlanner's Modular Monolith |
|---|---|---|
| Team size | Requires dedicated teams per service (3-8 engineers each) | AstraPlanner's team is 3-5 engineers total -- microservices would create more coordination overhead than value |
| Data consistency | Distributed transactions (sagas, eventual consistency) required across services | Single PostgreSQL instance with ACID transactions -- a plan update that touches demand, workforce, and optimization data is one transaction |
| Deployment complexity | Service mesh, container orchestration, distributed tracing infrastructure | Single `supabase functions deploy` command deploys all Edge Functions |
| Network latency | Service-to-service calls add 5-50ms per hop | In-process function calls between modules cost microseconds |
| Schema evolution | Each service owns its schema, cross-service queries require API calls | Shared PostgreSQL with per-module schemas, cross-module joins are SQL joins |
| Debugging | Distributed tracing required (Jaeger, Zipkin) | Single log stream with correlation IDs, standard stack traces |

### 1.2 How Modularity Is Enforced Without Service Boundaries

The modular monolith achieves isolation through **convention and tooling**, not network boundaries:

1. **Module boundaries**: Each module lives in `/modules/{name}/` with a defined public API (`index.ts` exports). Direct imports of internal module files are blocked by ESLint rules.

2. **Schema isolation**: Each module owns a PostgreSQL schema. The `demand` module owns `demand.*` tables and cannot write to `workforce.*` tables. Cross-schema reads are permitted through views. Cross-schema writes go through the owning module's public API.

3. **Dependency direction**: Modules form a directed acyclic graph. The dependency rule is enforced by `eslint-plugin-boundaries`:

```
integration → demand → workload → optimization → planning → simulation
                         ↑                          ↑
                      workforce                   wizard
                                                    ↑
                                                   ai
audit ← (all modules emit events to audit)
notification ← (all modules can trigger notifications)
```

4. **Event-based decoupling**: When module A needs to trigger behavior in module B without a direct dependency, it emits a domain event. The event handler (a thin orchestration layer) routes the event to module B.

### 1.3 Migration Path to Microservices

If AstraPlanner grows to 20+ engineers, individual modules can be extracted into independent services. The extraction is straightforward because:

- Each module already has a defined public API (the tRPC router + service layer exports)
- Each module owns its schema (can be migrated to a separate database)
- Cross-module communication already uses events (can be replaced with a message bus)
- No module directly accesses another module's database tables

---

## 2. Module Structure

### 2.1 Module Directory Convention

Every module follows an identical internal structure:

```
/modules/{module-name}/
├── router.ts              // tRPC router: defines procedures (queries + mutations)
├── service.ts             // Business logic: orchestrates operations, enforces invariants
├── repository.ts          // Data access: SQL queries, Supabase client calls
├── schema.ts              // Zod schemas: input validation, output types
├── types.ts               // TypeScript types and interfaces (domain models)
├── events.ts              // Domain events emitted by this module
├── errors.ts              // Module-specific error classes
├── constants.ts           // Module configuration constants
├── __tests__/
│   ├── service.test.ts    // Unit tests for business logic (mocked dependencies)
│   ├── repository.test.ts // Integration tests against test database
│   └── router.test.ts     // API-level tests (full request/response cycle)
└── README.md              // Module documentation (API contract, data model, decision log)
```

### 2.2 Module: Demand (`/modules/demand`)

**Responsibility**: Ingest demand data from external sources, normalize it into canonical format, store historical demand, and provide demand queries to downstream modules.

**Key domain concepts**:

| Concept | Description |
|---|---|
| `DemandSignal` | A single demand data point: quantity of work expected for a specific process at a specific site during a specific time period |
| `DemandFeed` | A configured connection to a demand source (ERP, WMS, CSV upload, ML model) |
| `DemandVersion` | A snapshot of demand data at a point in time -- enables comparison between forecast versions |
| `DemandNormalization` | Rules for converting source-specific units (orders, cases, pallets) into standard units per process |

**tRPC procedures**:

```typescript
demandRouter = router({
  // Queries
  getBysite:        query({ siteId, dateRange, version? })     → DemandSignal[]
  getByProcess:     query({ siteId, processId, dateRange })    → DemandSignal[]
  getVersions:      query({ siteId, dateRange })               → DemandVersion[]
  compareVersions:  query({ siteId, versionA, versionB })      → DemandComparison
  getFeedStatus:    query({ siteId })                          → DemandFeedStatus[]

  // Mutations
  uploadCsv:        mutation({ siteId, file, mappingConfig })  → UploadResult
  createFeed:       mutation({ siteId, feedConfig })           → DemandFeed
  updateFeed:       mutation({ feedId, feedConfig })           → DemandFeed
  triggerSync:      mutation({ feedId })                       → SyncJob
  setNormalization: mutation({ siteId, processId, rules })     → NormalizationConfig
});
```

**Database tables** (schema: `demand`):

| Table | Key Columns | Indexes | Notes |
|---|---|---|---|
| `demand.signals` | `id`, `tenant_id`, `site_id`, `process_id`, `period_start`, `period_end`, `quantity`, `unit`, `source`, `version`, `confidence` | `(tenant_id, site_id, period_start)`, `(tenant_id, site_id, version)` | Partitioned by month on `period_start` for query performance |
| `demand.feeds` | `id`, `tenant_id`, `site_id`, `source_type`, `connection_config` (encrypted), `sync_schedule`, `last_sync_at`, `status` | `(tenant_id, site_id)` | Connection config encrypted via `pgsodium` |
| `demand.versions` | `id`, `tenant_id`, `site_id`, `version_number`, `source`, `created_at`, `row_count`, `date_range` | `(tenant_id, site_id, version_number)` | Immutable after creation |
| `demand.normalization_rules` | `id`, `tenant_id`, `site_id`, `process_id`, `source_unit`, `target_unit`, `conversion_factor` | `(tenant_id, site_id, process_id)` | Applied during ingestion |

**Events emitted**:

- `demand.synced` — new demand data arrived from a feed
- `demand.uploaded` — manual CSV upload completed
- `demand.anomaly_detected` — statistical anomaly in incoming demand (>2 std dev from historical)

**Background jobs**:

- `demand.sync` (pg_cron, every 30 min): Poll active feeds for new data
- `demand.anomaly_check` (triggered after `demand.synced`): Run statistical checks on new data

### 2.3 Module: Workload (`/modules/workload`)

**Responsibility**: Translate demand signals into workload (FTE hours needed) by applying productivity standards, process times, and efficiency factors.

**Key domain concepts**:

| Concept | Description |
|---|---|
| `ProductivityStandard` | Expected output rate for a process (e.g., 120 units/hour for case picking) |
| `WorkloadCalculation` | Computed FTE requirement: demand quantity / productivity rate, adjusted for efficiency |
| `EfficiencyFactor` | Modifiers applied to productivity: learning curve for new employees, fatigue factor for long shifts, equipment availability |
| `WorkloadProfile` | Time-bucketed FTE requirements for a site (e.g., 12 FTEs picking 06:00-10:00, 8 FTEs picking 10:00-14:00) |

**Computation pipeline**:

```
DemandSignals
  → Group by (site, process, time_bucket)
  → Apply normalization (convert to standard units)
  → Divide by ProductivityStandard for each process
  → Apply EfficiencyFactors (time-of-day, day-of-week, seasonal)
  → Apply indirect labor allowance (breaks, meetings, changeover)
  → Round to WorkloadProfile (FTE-hours per time bucket)
```

**tRPC procedures**:

```typescript
workloadRouter = router({
  compute:              mutation({ siteId, dateRange, demandVersion? })  → WorkloadProfile
  getProfile:           query({ siteId, dateRange })                    → WorkloadProfile
  getProductivityStds:  query({ siteId })                               → ProductivityStandard[]
  setProductivityStd:   mutation({ siteId, processId, standard })       → ProductivityStandard
  getEfficiencyFactors: query({ siteId })                               → EfficiencyFactor[]
  setEfficiencyFactor:  mutation({ siteId, factorConfig })              → EfficiencyFactor
});
```

**Database tables** (schema: `workload`):

| Table | Key Columns | Notes |
|---|---|---|
| `workload.profiles` | `id`, `tenant_id`, `site_id`, `date`, `time_bucket_start`, `time_bucket_end`, `process_id`, `fte_required`, `demand_version`, `computed_at` | Recomputed whenever demand changes |
| `workload.productivity_standards` | `id`, `tenant_id`, `site_id`, `process_id`, `units_per_hour`, `unit_type`, `effective_from`, `effective_to` | Versioned -- historical standards preserved |
| `workload.efficiency_factors` | `id`, `tenant_id`, `site_id`, `factor_type`, `factor_value`, `conditions` (JSONB) | Conditions specify when factor applies (e.g., `{"day_of_week": ["Saturday", "Sunday"]}`) |

### 2.4 Module: Workforce (`/modules/workforce`)

**Responsibility**: Manage the employee registry, skill profiles, availability, contracts, and certifications.

**Key domain concepts**:

| Concept | Description |
|---|---|
| `Employee` | Core employee record with contract type, home site, hire date, employment status |
| `SkillProfile` | Set of skills an employee possesses, each with proficiency level and certification expiry |
| `Availability` | Employee's working availability: contract hours, shift preferences, leave calendar, restrictions |
| `SkillRequirement` | What skills a process requires and at what proficiency level |

**tRPC procedures**:

```typescript
workforceRouter = router({
  // Employee CRUD
  list:                  query({ siteId, filters, pagination })        → PaginatedResult<Employee>
  getById:               query({ employeeId })                         → EmployeeDetail
  create:                mutation({ employeeData })                    → Employee
  update:                mutation({ employeeId, updates })             → Employee
  bulkImport:            mutation({ siteId, file, mappingConfig })     → ImportResult

  // Skills
  getSkillMatrix:        query({ siteId })                             → SkillMatrix
  updateSkill:           mutation({ employeeId, skillId, proficiency, certExpiry? }) → SkillProfile
  getSkillGaps:          query({ siteId, dateRange })                  → SkillGapAnalysis
  suggestCrossTraining:  query({ siteId })                             → CrossTrainingSuggestion[]

  // Availability
  getAvailability:       query({ siteId, dateRange })                  → AvailabilityGrid
  setLeave:              mutation({ employeeId, leaveType, dateRange }) → LeaveRecord
  setRestriction:        mutation({ employeeId, restriction })         → Restriction
  getAbsenceForecast:    query({ siteId, dateRange })                  → AbsenceForecast

  // Search
  searchBySkill:         query({ siteId, skillIds, availability? })    → Employee[]
  semanticSearch:        query({ siteId, naturalLanguageQuery })       → Employee[]  // pgvector
});
```

**Database tables** (schema: `workforce`):

| Table | Key Columns | Notes |
|---|---|---|
| `workforce.employees` | `id`, `tenant_id`, `site_id`, `employee_number`, `name` (encrypted), `contract_type`, `weekly_hours`, `hire_date`, `status`, `cost_rate` | PII fields encrypted with `pgsodium` |
| `workforce.skills` | `id`, `tenant_id`, `name`, `category`, `requires_certification`, `description_embedding` (vector) | `description_embedding` enables semantic search |
| `workforce.employee_skills` | `employee_id`, `skill_id`, `proficiency_level` (1-5), `certified_at`, `certification_expires`, `assessed_by` | Junction table with metadata |
| `workforce.availability` | `id`, `employee_id`, `date`, `available_from`, `available_to`, `availability_type` | Types: `contract`, `preference`, `overtime_willing` |
| `workforce.leave_records` | `id`, `employee_id`, `leave_type`, `start_date`, `end_date`, `status`, `approved_by` | Types: `annual`, `sick`, `unpaid`, `training` |
| `workforce.certifications` | `id`, `employee_id`, `certification_type`, `issued_at`, `expires_at`, `issuing_body`, `document_url` | Links to Supabase Storage for scanned documents |

### 2.5 Module: Optimization (`/modules/optimization`)

**Responsibility**: Formulate and solve mathematical optimization problems that assign employees to time slots, minimizing cost while satisfying coverage requirements and respecting constraints.

**Key domain concepts**:

| Concept | Description |
|---|---|
| `OptimizationProblem` | Fully specified mathematical program: variables, objective, constraints |
| `Constraint` | A rule the optimizer must respect (hard) or should try to respect (soft with penalty) |
| `Solution` | A set of variable assignments that satisfies all hard constraints |
| `SolverRun` | A logged execution of the solver: problem stats, solve time, solution quality, gap |

**Constraint taxonomy**:

| Category | Constraint Type | Hard/Soft | Example |
|---|---|---|---|
| Coverage | Minimum staffing | Hard | At least 8 pickers required 06:00-14:00 |
| Coverage | Target staffing | Soft (penalty) | Target 10 pickers (2 over minimum is buffer) |
| Regulatory | Max daily hours | Hard | No employee works more than 10 hours/day |
| Regulatory | Min rest between shifts | Hard | At least 11 hours between shift end and next start |
| Regulatory | Max weekly hours | Hard | No employee exceeds 48 hours in rolling 7-day period |
| Skill | Skill requirement | Hard | Forklift slot requires forklift certification |
| Skill | Skill preference | Soft (reward) | Prefer employees with proficiency >= 4 |
| Contract | Contract hours | Soft (penalty) | Penalize deviation from contracted weekly hours |
| Contract | Overtime limit | Hard | No more than 20% overtime per employee per week |
| Cost | Budget ceiling | Hard | Total labor cost for the week must not exceed budget |
| Cost | Overtime minimization | Soft (objective) | Minimize total overtime hours across all employees |
| Fairness | Equitable distribution | Soft (penalty) | Penalize variance in overtime hours across employees |
| Preference | Shift preference | Soft (reward) | Reward assignments matching employee shift preferences |
| Site | Cross-site assignment | Soft (penalty) | Penalize assigning employees to non-home sites |

**Solver orchestration flow**:

```
1. Receive optimization request (site, date range, constraint overrides)
2. Load workload profile from workload module
3. Load employee availability from workforce module
4. Load constraints from constraint configuration
5. Formulate problem (build variable matrix, objective function, constraint set)
6. Estimate problem size
7. Route to solver:
   ├── Small (< 500 vars): TypeScript heuristic engine (< 1s)
   ├── Medium (500-5000 vars): HiGHS WASM in Edge Function (< 30s)
   └── Large (> 5000 vars): Python OR-Tools on Fly.io worker (< 5min)
8. Parse solution
9. Validate solution against all constraints (defense in depth)
10. Return solution with quality metrics (objective value, gap, violations)
```

**tRPC procedures**:

```typescript
optimizationRouter = router({
  optimize:            mutation({ siteId, dateRange, constraints?, solverConfig? }) → OptimizationResult
  getConstraints:      query({ siteId })                                           → ConstraintConfig
  setConstraints:      mutation({ siteId, constraints })                           → ConstraintConfig
  reoptimize:          mutation({ planId, changedAssignments })                     → OptimizationResult
  getSolverRuns:       query({ siteId, dateRange })                                → SolverRun[]
  explainInfeasibility: query({ solverRunId })                                     → InfeasibilityExplanation
});
```

### 2.6 Module: Planning (`/modules/planning`)

**Responsibility**: Manage the lifecycle of workforce plans -- creation, editing, versioning, approval, publication, and archival.

**Plan lifecycle**:

```
Draft → Under Review → Approved → Published → Active → Archived
  ↑         │              │
  └─────────┘              │
  (Rejected, back to draft) │
                            ↓
                      Superseded (when a new plan covers the same period)
```

**Key domain concepts**:

| Concept | Description |
|---|---|
| `Plan` | A workforce plan covering a site for a date range, containing assignments |
| `PlanVersion` | An immutable snapshot of a plan at a point in time (enables undo, audit, comparison) |
| `Assignment` | An employee assigned to a time slot at a process with a specific role |
| `ApprovalWorkflow` | Configurable approval chain (e.g., planner → site manager → regional director) |
| `PlanPublication` | A published plan becomes the executable schedule, distributed to site systems |

**tRPC procedures**:

```typescript
planningRouter = router({
  // Plan CRUD
  create:           mutation({ siteId, dateRange, fromTemplate? })  → Plan
  get:              query({ planId, version? })                     → PlanDetail
  list:             query({ siteId, status?, dateRange? })          → Plan[]
  duplicate:        mutation({ planId, newDateRange })              → Plan

  // Assignments
  assign:           mutation({ planId, employeeId, slotId })       → Assignment
  unassign:         mutation({ planId, assignmentId })             → void
  bulkAssign:       mutation({ planId, assignments[] })            → Assignment[]
  swapAssignments:  mutation({ planId, assignmentA, assignmentB }) → Assignment[]
  autoFill:         mutation({ planId, strategy })                 → AutoFillResult

  // Versioning
  getVersions:      query({ planId })                              → PlanVersion[]
  compareVersions:  query({ planId, versionA, versionB })          → PlanDiff
  revertToVersion:  mutation({ planId, versionId })                → Plan

  // Workflow
  submitForReview:  mutation({ planId, reviewers[] })              → ApprovalRequest
  approve:          mutation({ planId, approvalId, comment? })     → Plan
  reject:           mutation({ planId, approvalId, reason })       → Plan
  publish:          mutation({ planId })                           → PlanPublication

  // Analytics
  getCoverage:      query({ planId })                              → CoverageAnalysis
  getCostBreakdown: query({ planId })                              → CostBreakdown
  getCompliance:    query({ planId })                              → ComplianceReport
});
```

**Database tables** (schema: `planning`):

| Table | Key Columns | Notes |
|---|---|---|
| `planning.plans` | `id`, `tenant_id`, `site_id`, `date_start`, `date_end`, `status`, `created_by`, `current_version` | Status enum maps to lifecycle states |
| `planning.plan_versions` | `id`, `plan_id`, `version_number`, `assignments_snapshot` (JSONB), `metrics_snapshot` (JSONB), `created_at`, `created_by` | Immutable. `assignments_snapshot` is denormalized for fast comparison |
| `planning.assignments` | `id`, `plan_id`, `employee_id`, `date`, `start_time`, `end_time`, `process_id`, `role`, `source` | Source: `manual`, `optimizer`, `ai_suggestion`, `template` |
| `planning.approval_workflows` | `id`, `tenant_id`, `site_id`, `steps` (JSONB), `current_step`, `status` | Steps define ordered approvers with role or user ID |
| `planning.publications` | `id`, `plan_id`, `published_at`, `published_by`, `distribution_channels` (JSONB), `acknowledged_at` | Tracks when site received and acknowledged the schedule |

### 2.7 Module: Simulation (`/modules/simulation`)

**Responsibility**: Enable scenario analysis by creating hypothetical variations of plans and running probabilistic simulations.

**Scenario types**:

| Scenario Type | What It Changes | Typical Question |
|---|---|---|
| Demand variation | Scale demand up/down by % or absolute | "What if Black Friday volume is 30% higher than forecast?" |
| Absence impact | Simulate random absences based on historical rates | "What's our coverage risk if we have typical flu-season absences?" |
| Staffing change | Add/remove employees from the available pool | "What happens if we lose 5 pickers next month?" |
| Process change | Modify productivity standards or add new processes | "What if we introduce a new automation line that doubles putaway speed?" |
| Constraint relaxation | Loosen or tighten constraints | "What would it cost to guarantee 100% coverage vs 95%?" |
| Multi-factor | Combine multiple changes | "Black Friday volume + 10% absences + 3 temporary workers" |

**Monte Carlo engine**:

For probabilistic scenarios (absence impact, demand uncertainty), the simulation module runs Monte Carlo analysis:

```
1. Define probability distributions for uncertain variables
   - Absence: per-employee probability from historical rate, day-of-week adjusted
   - Demand: normal distribution around forecast, std dev from forecast accuracy history
2. Sample N scenarios (default: 1,000; configurable up to 10,000)
3. For each scenario:
   a. Generate realized values for all uncertain variables
   b. Run heuristic optimizer (full MIP is too slow for 1,000 iterations)
   c. Record coverage metrics, cost, constraint violations
4. Aggregate results:
   - P50, P90, P95 coverage probability
   - Expected cost distribution
   - Worst-case gap identification
```

**tRPC procedures**:

```typescript
simulationRouter = router({
  createScenario:     mutation({ planId, scenarioConfig })          → Scenario
  runSimulation:      mutation({ scenarioId, iterations?, config? }) → SimulationJob
  getResults:         query({ simulationJobId })                    → SimulationResults
  compareScenarios:   query({ scenarioIds[] })                      → ScenarioComparison
  listScenarios:      query({ planId })                             → Scenario[]
  deleteScenario:     mutation({ scenarioId })                      → void
});
```

### 2.8 Module: Wizard (`/modules/wizard`)

**Responsibility**: Guide new tenants through initial configuration via an AI-assisted multi-step wizard that configures sites, processes, productivity standards, shift patterns, and employee pools.

**Wizard steps**:

| Step | Title | Inputs | AI Assistance |
|---|---|---|---|
| 1 | Organization Profile | Company name, industry, size, regions | None |
| 2 | Site Definition | Site names, types, locations, operating hours | AI suggests site types from company description |
| 3 | Process Design | Activity types, process flows, dependencies | AI extracts processes from natural language operation description |
| 4 | Productivity Standards | Units/hour per process, efficiency factors | AI suggests benchmarks from industry data for similar operations |
| 5 | Shift Patterns | Shift templates, rotation rules, break rules | AI proposes shift patterns matching described operation hours |
| 6 | Workforce Setup | Employee import, skill mapping, contract types | AI maps imported skill columns to AstraPlanner skill taxonomy |
| 7 | Demand Connection | Connect demand feeds or upload historical data | AI detects data format and suggests column mapping |
| 8 | Review and Launch | Summary of all configuration, validation | AI generates plain-language summary of configured setup |

**Template engine**: Pre-built templates accelerate setup for common logistics archetypes:

| Template | Site Type | Pre-configured |
|---|---|---|
| `e-commerce-fc` | E-commerce Fulfillment Center | Receiving, stowing, picking (each/batch/wave), packing, shipping, returns |
| `distribution-center` | Traditional DC | Receiving, cross-docking, case picking, pallet picking, loading |
| `cold-chain` | Temperature-Controlled Warehouse | Receiving (dock scheduling), frozen storage, refrigerated storage, ambient, shipping |
| `parcel-hub` | Parcel Sort Center | Inbound unload, sort, outbound load, exception handling |
| `3pl-multi-client` | Third-Party Logistics | Per-client process variants, shared labor pool, client-specific SLAs |

### 2.9 Module: Integration (`/modules/integration`)

**Responsibility**: Manage bidirectional data exchange between AstraPlanner and external systems (ERP, WMS, HRIS, payroll).

**Connector architecture**:

```
External System → Connector Adapter → Normalization Layer → AstraPlanner Module
                                    ← Reverse Sync        ←
```

**Supported connectors**:

| System Type | Specific Systems | Data Flow | Sync Method |
|---|---|---|---|
| WMS | Manhattan, Blue Yonder, SAP EWM, Oracle WMS | Demand data IN, schedule OUT | REST API polling + webhook |
| HRIS | Workday, SAP SuccessFactors, BambooHR, ADP | Employee data IN/OUT | SCIM 2.0 or REST API |
| ERP | SAP S/4HANA, Oracle ERP, Microsoft Dynamics | Demand forecast IN, labor cost OUT | RFC/BAPI (via middleware) or REST |
| TMS | Oracle OTM, Blue Yonder TMS, SAP TM | Inbound volume forecast IN | REST API |
| Payroll | ADP, Ceridian, local payroll systems | Actual hours OUT, cost rates IN | SFTP (batch) or REST |
| Time & Attendance | Kronos/UKG, ADP, Deputy | Actual attendance IN, planned schedule OUT | REST API |
| Generic | Any REST API | Configurable | Custom adapter |

**ETL pipeline stages**:

```
Extract → Validate (schema + business rules) → Transform (map to canonical model) →
Load (upsert to AstraPlanner) → Confirm (acknowledgment to source) → Log (audit trail)
```

Each pipeline stage is independently retryable. Failed records are routed to a dead letter queue with diagnostic information for manual review.

### 2.10 Module: Notification (`/modules/notification`)

**Responsibility**: Generate, route, and deliver alerts and notifications to users through configured channels.

**Notification categories**:

| Category | Trigger | Urgency | Default Channel |
|---|---|---|---|
| Coverage alert | Coverage drops below threshold | High | Push + Email |
| Plan approval request | Plan submitted for review | Medium | In-app + Email |
| Plan published | Plan approved and published | Medium | In-app + Email |
| Demand anomaly | Statistical outlier in demand feed | Medium | In-app |
| Certification expiry | Employee certification expiring in N days | Low | In-app (planner) + Email (employee manager) |
| System alert | Integration failure, solver timeout | High | In-app + Email (admins) |
| AI insight | New AI-generated recommendation available | Low | In-app |
| Schedule change | Employee's schedule modified | Medium | Push (if mobile enabled) |

**Delivery channels**:

| Channel | Technology | Use Case |
|---|---|---|
| In-app | Supabase Realtime broadcast to connected clients | All notifications |
| Email | Resend API (transactional email) | Approval requests, critical alerts, digests |
| Push | Web Push API (via service worker) | Urgent coverage alerts for on-call managers |
| Webhook | Outbound HTTP POST | Integration with customer's internal tools (Slack, Teams, PagerDuty) |

**Notification preferences**: Per-user configuration specifying which categories they receive and through which channels. Managers see all notifications for their sites. Planners see planning-related notifications. Viewers see only published schedule changes.

### 2.11 Module: Audit (`/modules/audit`)

**Responsibility**: Record all significant system events for compliance, debugging, and analytics.

**Audit event structure**:

```typescript
interface AuditEvent {
  id: string;                    // UUID
  tenant_id: string;
  timestamp: string;             // ISO-8601, microsecond precision
  actor_id: string;              // User who performed the action (or 'system')
  actor_type: 'user' | 'system' | 'api_key' | 'scheduler';
  action: string;                // e.g., 'plan.created', 'assignment.modified', 'employee.skill_updated'
  entity_type: string;           // e.g., 'plan', 'assignment', 'employee'
  entity_id: string;
  changes: {                     // What changed (before/after for updates)
    field: string;
    old_value: unknown;
    new_value: unknown;
  }[];
  metadata: {                    // Context
    ip_address?: string;
    user_agent?: string;
    correlation_id: string;      // Links related events across a single operation
    request_id: string;
    site_id?: string;
  };
}
```

**Retention policy**: Audit events are retained for 7 years (configurable per tenant for compliance). Events older than 90 days are moved to cold storage (Supabase Storage as compressed JSONL files) and removed from the active `audit.events` table.

**Compliance reports**: The audit module generates pre-built reports:

- Working time compliance: Did any employee exceed legal limits?
- Certification compliance: Were any uncertified employees assigned to certified-only roles?
- Plan change audit: Complete history of who changed what in a plan and when
- Data access audit: Who accessed which employee records (GDPR/DSGVO compliance)

---

## 3. Database Schema Organization

All tables reside in a single PostgreSQL instance on Supabase, organized into per-module schemas:

```
PostgreSQL Instance
├── auth (Supabase managed)          -- users, sessions, identities
├── storage (Supabase managed)       -- file metadata
├── public                           -- shared tables: tenants, sites, feature_flags
├── demand                           -- demand.signals, demand.feeds, demand.versions, ...
├── workload                         -- workload.profiles, workload.productivity_standards, ...
├── workforce                        -- workforce.employees, workforce.skills, ...
├── optimization                     -- optimization.solver_runs, optimization.constraints, ...
├── planning                         -- planning.plans, planning.assignments, ...
├── simulation                       -- simulation.scenarios, simulation.results, ...
├── wizard                           -- wizard.sessions, wizard.templates, ...
├── integration                      -- integration.connectors, integration.sync_logs, ...
├── notification                     -- notification.alerts, notification.preferences, ...
├── audit                            -- audit.events
└── analytics                        -- Materialized views for dashboard queries
```

**Cross-schema access rules**:

| Access Pattern | Implementation |
|---|---|
| Module reads own schema | Direct SQL queries in repository layer |
| Module reads another schema | Read-only views (e.g., `planning` schema has `v_employee_availability` view from `workforce`) |
| Module writes to another schema | Call the owning module's service layer (never direct INSERT/UPDATE to foreign schema) |
| Dashboard queries spanning schemas | Materialized views in `analytics` schema, refreshed on schedule or on demand |

**Key materialized views** (schema: `analytics`):

| View | Source Schemas | Refresh Frequency | Purpose |
|---|---|---|---|
| `mv_site_coverage_summary` | planning, workload | Every 5 minutes | Control Room coverage widget |
| `mv_workforce_utilization` | planning, workforce | Every 15 minutes | Workforce utilization dashboard |
| `mv_demand_vs_actual` | demand, planning | Hourly | Demand accuracy tracking |
| `mv_cost_summary` | planning, workforce | Daily | Cost reporting dashboard |
| `mv_skill_gap_matrix` | workforce, workload | Daily | Skill gap analysis |

---

## 4. API Design

### 4.1 tRPC Router Composition

```typescript
// trpc/router.ts — root router
export const appRouter = createRouter({
  demand:       demandRouter,
  workload:     workloadRouter,
  workforce:    workforceRouter,
  optimization: optimizationRouter,
  planning:     planningRouter,
  simulation:   simulationRouter,
  wizard:       wizardRouter,
  integration:  integrationRouter,
  notification: notificationRouter,
  audit:        auditRouter,
  ai:           aiRouter,
  admin:        adminRouter,
});

export type AppRouter = typeof appRouter;
```

### 4.2 Shared Middleware

| Middleware | Purpose | Applied To |
|---|---|---|
| `logging` | Structured JSON log of every request (method, duration, status, correlation ID) | All procedures |
| `rateLimit` | Per-user rate limiting (100 requests/minute for queries, 30 for mutations) | All procedures |
| `auth` | Validates JWT, attaches user object to context, rejects expired tokens | All procedures except public |
| `tenancy` | Extracts `tenant_id` from JWT, sets Postgres `app.tenant_id` for RLS | All procedures except public |
| `siteAccess` | Validates user has access to the requested `site_id` (checks `site_ids[]` in JWT) | Procedures with `siteId` input |
| `auditLog` | Automatically logs mutations to audit.events table | All mutations |
| `costTracking` | Tracks AI token usage for billing | AI procedures |

### 4.3 Error Handling Strategy

**Structured error taxonomy**:

```typescript
class AppError extends TRPCError {
  constructor(
    public readonly errorCode: string,      // Machine-readable: 'PLAN_NOT_FOUND', 'SKILL_REQUIRED'
    public readonly httpStatus: number,      // 400, 404, 409, 422, 500
    public readonly userMessage: string,     // Human-readable, translatable
    public readonly details?: unknown,       // Additional context for debugging
    public readonly retryable: boolean = false,
  ) {}
}

// Module-specific error subclasses
class OptimizationError extends AppError {
  constructor(
    public readonly solverStatus: string,    // 'INFEASIBLE', 'TIMEOUT', 'UNBOUNDED'
    public readonly relaxationSuggestions?: string[],
  ) {}
}
```

**Error categories and handling**:

| Error Category | HTTP Status | Retry Policy | User Experience |
|---|---|---|---|
| Validation error | 400 | No retry | Inline field-level error messages |
| Not found | 404 | No retry | "Resource not found" with navigation suggestion |
| Conflict (concurrent edit) | 409 | Auto-retry with merge | "Another user modified this plan. Reload to see changes." |
| Solver infeasible | 422 | No retry, suggest relaxation | "No valid plan exists with current constraints. Suggestions: ..." |
| Rate limited | 429 | Auto-retry after `Retry-After` | Transparent retry, user does not see the error |
| Internal error | 500 | 3 retries with backoff | "Something went wrong. Our team has been notified." |
| AI service unavailable | 503 | 3 retries, then fallback | Deterministic fallback response (no AI features, cached insights) |

**Dead letter handling**: Failed background jobs (after exhausting retry policy) are written to `integration.dead_letter_queue` with full context:

```sql
CREATE TABLE integration.dead_letter_queue (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     UUID NOT NULL,
  job_type      TEXT NOT NULL,
  payload       JSONB NOT NULL,
  error_message TEXT NOT NULL,
  error_stack   TEXT,
  attempts      INT NOT NULL,
  first_failed  TIMESTAMPTZ NOT NULL,
  last_failed   TIMESTAMPTZ NOT NULL,
  resolved      BOOLEAN DEFAULT false,
  resolved_by   UUID REFERENCES auth.users(id),
  resolved_at   TIMESTAMPTZ
);
```

Admins can view, retry, or dismiss dead letter items through the admin dashboard.

---

## 5. Caching Strategy

| Cache Layer | Technology | Data Cached | TTL | Invalidation |
|---|---|---|---|---|
| Edge (request-level) | Vercel Edge Cache | Static assets, public pages | 1 year (immutable hashes) | Deploy-time purge |
| Application (session) | Upstash Redis | User session data, tenant config, feature flags | 1 hour | On config change event |
| Application (rate limit) | Upstash Redis | Per-user request counters | 1 minute sliding window | Automatic expiry |
| Application (AI response) | Upstash Redis | Cached AI responses for repeated queries | 24 hours | Manual invalidation or data change |
| Database (materialized views) | PostgreSQL | Dashboard aggregations | 5-60 minutes (varies by view) | `REFRESH MATERIALIZED VIEW CONCURRENTLY` via pg_cron |
| Database (query plan) | PostgreSQL `pg_prewarm` | Hot table pages | Persistent until eviction | Automatic LRU |
| Client (browser) | TanStack Query in-memory cache | API responses | 0-5 minutes (varies by data type) | Optimistic update + background revalidation |
| Client (offline) | Service Worker Cache API | Read-only schedule view, employee list | Until next sync | Background sync on reconnect |

**Cache warming**: On Edge Function cold start, critical caches are warmed:

1. Tenant configuration (feature flags, constraint defaults)
2. Site list for the tenant
3. Active plan IDs (to pre-populate query keys)

---

## 6. Logging and Observability

### 6.1 Structured Logging

All logs are emitted as structured JSON to stdout (consumed by Supabase log drain or Vercel log stream):

```json
{
  "level": "info",
  "timestamp": "2026-03-20T14:32:01.123Z",
  "correlation_id": "req_abc123",
  "request_id": "edge_fn_xyz789",
  "tenant_id": "tenant_456",
  "user_id": "user_012",
  "module": "optimization",
  "action": "solver.completed",
  "duration_ms": 2340,
  "solver": "highs_wasm",
  "variables": 1200,
  "constraints": 3400,
  "objective_value": 156.7,
  "gap_percent": 0.02,
  "status": "optimal"
}
```

### 6.2 Correlation IDs

Every inbound request receives a `correlation_id` (UUID v7 for time-ordering). This ID propagates through:

- tRPC context → service calls → repository queries → background jobs triggered → AI API calls

When debugging an issue, searching logs by `correlation_id` shows the complete chain of operations across all modules.

### 6.3 Performance Traces

Critical paths are instrumented with timing spans:

```
[optimize] total=2340ms
  ├── [load_workload] 45ms
  ├── [load_workforce] 62ms
  ├── [formulate_problem] 180ms
  ├── [solve_highs] 1890ms
  ├── [validate_solution] 35ms
  └── [persist_assignments] 128ms
```

Performance traces exceeding defined thresholds trigger alerts:

| Path | Threshold | Alert Channel |
|---|---|---|
| Plan load (single site, 1 week) | > 2s | Sentry performance alert |
| Optimization solve (operational, single site) | > 30s | Sentry + admin notification |
| Dashboard page load (server render) | > 3s | Vercel Analytics alert |
| AI response (any Claude call) | > 15s | Sentry + AI cost dashboard flag |
| Demand sync (per feed) | > 5 min | Integration module alert |

### 6.4 Health Checks

Every Edge Function exposes a `/health` endpoint returning:

```json
{
  "status": "healthy",
  "version": "1.14.2",
  "uptime_seconds": 3600,
  "dependencies": {
    "database": { "status": "healthy", "latency_ms": 5 },
    "redis": { "status": "healthy", "latency_ms": 2 },
    "claude_api": { "status": "healthy", "latency_ms": 450 },
    "highs_wasm": { "status": "loaded", "memory_mb": 12 }
  }
}
```

---

## 7. Security Architecture

### 7.1 Row-Level Security (RLS)

Every table with tenant data has RLS policies enforcing tenant isolation:

```sql
-- Standard tenant isolation policy (applied to all tenant-scoped tables)
ALTER TABLE planning.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_select ON planning.plans
  FOR SELECT USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation_insert ON planning.plans
  FOR INSERT WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation_update ON planning.plans
  FOR UPDATE USING (tenant_id = current_setting('app.tenant_id')::uuid);

CREATE POLICY tenant_isolation_delete ON planning.plans
  FOR DELETE USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

The `app.tenant_id` session variable is set by the `tenancy` middleware at the start of every database transaction:

```sql
SELECT set_config('app.tenant_id', $1, true);  -- true = local to transaction
```

### 7.2 API Rate Limiting

| Endpoint Category | Rate Limit | Window | Burst Allowance |
|---|---|---|---|
| Read queries | 100 requests | 1 minute | 20 additional |
| Write mutations | 30 requests | 1 minute | 5 additional |
| AI queries | 10 requests | 1 minute | 0 |
| File uploads | 5 requests | 1 minute | 0 |
| Bulk operations | 2 requests | 1 minute | 0 |
| Auth endpoints | 10 requests | 5 minutes | 0 (brute force protection) |

Rate limit state is stored in Upstash Redis with sliding window counters. Rate-limited responses include `Retry-After` and `X-RateLimit-Remaining` headers.

### 7.3 Input Validation

All inputs are validated at three levels:

1. **Client-side** (React Hook Form + Zod): Immediate feedback, prevents malformed requests
2. **API layer** (tRPC input validation via Zod): Rejects invalid inputs before they reach business logic
3. **Database** (CHECK constraints, NOT NULL, FK constraints): Final defense against data corruption

SQL injection is prevented by using Supabase's query builder (parameterized queries) exclusively -- no string concatenation in SQL.

### 7.4 Secret Management

| Secret | Storage | Rotation |
|---|---|---|
| Supabase service role key | Vercel environment variable (encrypted) | Quarterly manual rotation |
| Claude API key | Supabase Vault (encrypted at rest) | Quarterly |
| Stripe API keys | Supabase Vault | Quarterly |
| Integration connector credentials | `pgsodium` column encryption in `integration.connectors` | Per-connector policy |
| JWT signing secret | Supabase managed | Automatic |
| Upstash Redis credentials | Vercel environment variable | Quarterly |

### 7.5 Data Encryption

| Data State | Encryption | Implementation |
|---|---|---|
| In transit | TLS 1.3 | Enforced by Vercel (frontend) and Supabase (backend) |
| At rest (database) | AES-256 | Supabase managed disk encryption |
| At rest (PII columns) | `pgsodium` transparent column encryption | Employee names, email, phone, address |
| At rest (files) | AES-256 | Supabase Storage managed encryption |
| At rest (backups) | AES-256 | Supabase managed backup encryption |

---

## 8. Database Migration Strategy

Migrations are managed via Supabase CLI (`supabase db diff` for generation, `supabase db push` for application):

| Environment | Migration Method | Approval Required | Rollback Strategy |
|---|---|---|---|
| Local development | `supabase db reset` (destructive, seed data) | None | Reset and re-seed |
| Staging | `supabase db push` (applies pending migrations) | PR review | Reverse migration script (manual) |
| Production | `supabase db push` via CI/CD pipeline | Two-reviewer approval on migration PR | Reverse migration script, tested on staging first |

**Migration conventions**:

- File naming: `YYYYMMDD_HHMMSS_descriptive_name.sql`
- Every migration includes both `UP` and `DOWN` sections
- Destructive changes (column drops, table drops) require a two-phase approach: first deprecate (add new column, migrate data), then remove (in a subsequent release)
- All migrations are tested against a production-size dataset clone before production deployment

---

## 9. Performance Targets

| Operation | Target Latency | Current Benchmark | Scaling Limit |
|---|---|---|---|
| Dashboard page load (SSR) | < 1.5s | ~1.1s | Limited by PostgreSQL query time for materialized views |
| Plan load (1 site, 1 week) | < 800ms | ~500ms | ~200 employees per site before requiring pagination |
| Employee list (paginated, 50 per page) | < 300ms | ~180ms | Pagination + indexes handle 50K+ employees |
| Optimization solve (single site, 1 week) | < 15s | ~3-8s | Problem size dependent (see solver routing) |
| AI insight query | < 5s | ~2-4s | Claude API latency dependent |
| Real-time update propagation | < 500ms | ~200ms | Supabase Realtime infrastructure dependent |
| Demand sync (per feed) | < 2 min | ~45s | Data volume dependent |
| Report generation (PDF) | < 30s | ~12s | Scales with date range and site count |
