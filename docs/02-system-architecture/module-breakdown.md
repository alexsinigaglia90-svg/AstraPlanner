# Module Breakdown

This document provides a detailed specification of every module in the AstraPlanner platform. Each module is described in terms of its responsibility, inputs, outputs, key APIs, internal components, dependencies, and scaling strategy.

---

## Module 1: Demand Ingestion Service

### Responsibility

Receives demand signals from external systems and internal uploads, validates and normalizes them into a canonical format, detects anomalies, and publishes `DemandIngested` events for downstream processing.

### Inputs

| Input | Source | Format | Frequency |
|-------|--------|--------|-----------|
| ERP demand forecasts | SAP APO, Oracle ASCP, NetSuite | JSON via REST API, IDOC flat file, CSV via SFTP | Hourly or on-change |
| WMS order backlog | Manhattan, Blue Yonder, Korber | JSON via webhook | Real-time |
| Manual uploads | Planner via UI | CSV, Excel (.xlsx) | Ad hoc |
| ML-generated forecasts | Internal Forecast Engine | Protobuf via Kafka | On model run completion |
| Historical demand corrections | Planner via UI | JSON via REST | Ad hoc |

### Outputs

| Output | Destination | Format |
|--------|-------------|--------|
| Canonical `DemandSignal` records | Operational DB (demand_signals table) | PostgreSQL rows |
| `DemandIngested` event | Event bus (Kafka topic: `demand.ingested`) | Avro-encoded event |
| `DemandAnomalyDetected` event | Event bus | Avro-encoded event |
| Ingestion audit log | Audit service | Structured JSON |
| Raw file archive | S3 (`/raw/demand/{tenant}/{date}/`) | Original file |

### Internal Components

1. **Source Adapters**: pluggable connectors for each source system. Each adapter handles authentication, pagination, rate limiting, and format-specific parsing. Adapters implement a `DemandSourceAdapter` interface:
   ```
   interface DemandSourceAdapter {
     connect(config: ConnectionConfig): Promise<void>
     fetch(since: DateTime): AsyncIterable<RawDemandRecord>
     healthCheck(): Promise<HealthStatus>
   }
   ```

2. **Normalizer**: converts source-specific records into canonical `DemandSignal` format. Handles unit-of-measure conversions (e.g., cases to eaches), timezone normalization to UTC, and demand-type mapping.

3. **Validator**: enforces schema rules and business rules:
   - Required fields present and correctly typed
   - `site_id` exists in site registry
   - `period_start` < `period_end`
   - `quantity` >= 0
   - No duplicate signals (idempotency check via composite key)

4. **Anomaly Detector**: statistical checks on incoming demand:
   - Z-score check against rolling 8-week average (flag if |z| > 3.0)
   - Year-over-year comparison (flag if delta > configurable threshold, default 50%)
   - Zero-demand detection for sites/processes that historically have non-zero demand
   - Anomalies are flagged but not rejected -- they proceed with an `anomaly_flags` array attached

5. **Versioning Manager**: assigns monotonically increasing version numbers per (site, process_path, period) tuple. Maintains a `current_version` pointer for downstream consumers.

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/demand/ingest` | POST | Submit demand records (JSON array) |
| `/api/v1/demand/upload` | POST (multipart) | Upload CSV/Excel file |
| `/api/v1/demand/signals` | GET | Query demand signals with filters |
| `/api/v1/demand/signals/{id}` | GET | Get single demand signal with version history |
| `/api/v1/demand/anomalies` | GET | List detected anomalies |
| `/api/v1/demand/sources` | GET | List configured source adapters and their health |
| `/api/v1/demand/sources/{id}/sync` | POST | Trigger manual sync for a source |

### Dependencies

- **Upstream**: Integration Gateway (for external system connectivity)
- **Downstream**: Workload Computation Engine (consumes `DemandIngested` events), AI Advisor (consumes `DemandAnomalyDetected` events)
- **Infrastructure**: PostgreSQL, Kafka, S3, Redis (for deduplication cache)

### Scaling Strategy

- Stateless service, horizontally scalable behind a load balancer
- Kafka consumer groups for parallel event processing (partition by `site_id`)
- File upload processing offloaded to async workers (separate pod pool)
- Anomaly detection runs as a sidecar process to avoid blocking ingestion throughput
- Target: sustain 10,000 demand records/second per tenant during peak ingestion windows

---

## Module 2: Workload Computation Engine

### Responsibility

Converts demand signals into labor-hour requirements by applying process definitions, productivity rates, and allowance factors. Produces a `WorkloadPlan` that specifies how many hours of each skill type are needed at each site, zone, and time period.

### Inputs

| Input | Source |
|-------|--------|
| `DemandSignal` records (current version) | Operational DB / `DemandIngested` event |
| Process definitions | Site Configuration Store |
| Productivity rate tables | Site Configuration Store |
| Allowance factors | Site Configuration Store |
| Skill-to-process mapping | Workforce Registry |
| Calendar/operating hours | Site Configuration Store |

### Outputs

| Output | Destination |
|--------|-------------|
| `WorkloadPlan` records | Operational DB (`workload_plans` table) |
| `WorkloadComputed` event | Event bus (`workload.computed`) |
| Workload breakdown report | Planning Workbench (via API) |

### Core Computation Logic

The engine evaluates every combination of (site, process_path, time_period, skill_level):

```
For each site in scope:
  For each process_path configured at site:
    For each planning_period (shift / day / week):
      demand = sum(DemandSignals for this site, process, period)
      base_hours = demand / productivity_rate[process][skill_level]
      adjusted_hours = base_hours * (1 + allowance_factor[process])
      workload_record = {
        site_id, process_path, period, skill_level,
        demand_units, required_hours: adjusted_hours,
        min_headcount: ceil(adjusted_hours / shift_length),
        demand_source_version, computed_at
      }
```

### Multi-Skill Resolution

When a process can be performed by employees with different skill levels at different productivity rates, the engine produces workload rows for each applicable skill level. The Optimization Engine downstream decides the optimal skill-level mix.

| Process | Skill Level 1 (Trainee) | Skill Level 2 (Standard) | Skill Level 3 (Expert) |
|---------|------------------------|--------------------------|----------------------|
| PICK.EACH | 60 lines/hr | 95 lines/hr | 120 lines/hr |
| PACK.STANDARD | 18 orders/hr | 30 orders/hr | 40 orders/hr |
| INBOUND.UNLOAD | N/A (cert required) | 18 pallets/hr | 22 pallets/hr |

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/workload/compute` | POST | Trigger computation for specified sites and periods |
| `/api/v1/workload/plans` | GET | Query workload plans with filters |
| `/api/v1/workload/plans/{id}` | GET | Get detailed workload breakdown |
| `/api/v1/workload/plans/{id}/compare` | GET | Compare two workload plan versions |
| `/api/v1/workload/rates` | GET/PUT | View/update productivity rate tables |

### Dependencies

- **Upstream**: Demand Ingestion Service, Site Configuration Store
- **Downstream**: Optimization Engine, Scenario Simulator, Control Room
- **Infrastructure**: PostgreSQL, Kafka, Redis (computation result caching)

### Scaling Strategy

- CPU-bound computation; scales horizontally by partitioning across sites
- Each site's workload is independently computable (embarrassingly parallel)
- Results are cached in Redis with TTL matching the demand refresh cycle
- Incremental recomputation: only recalculates when demand signals or rates change
- Target: compute workload for 1,000 sites in under 60 seconds (parallel)

---

## Module 3: Workforce Registry

### Responsibility

Maintains the authoritative record of all employees, their skills, certifications, contracts, availability, and assignment history. Serves as the "people data" backbone for the entire platform.

### Inputs

| Input | Source |
|-------|--------|
| Employee master data | HRIS integration (CDC + full sync) |
| Skill assessments | Internal skill management UI, training system integrations |
| Certification records | Training system, manual entry |
| Availability/leave | HRIS, time & attendance system, employee self-service |
| Contract details | HRIS, HR admin UI |
| Assignment history | Internal (written by Optimization Engine) |

### Outputs

| Output | Destination |
|--------|-------------|
| Employee profiles | Optimization Engine, Planning Workbench, Control Room |
| Skill matrices | Optimization Engine, AI Advisor |
| Availability calendars | Optimization Engine |
| `EmployeeProfileUpdated` event | Event bus |
| `SkillProfileUpdated` event | Event bus |
| `EmployeeUnavailable` event | Event bus |

### Data Model (Key Entities)

```
Employee {
  employee_id:       UUID
  tenant_id:         UUID
  external_id:       string        // HRIS system ID
  name:              PersonName
  employment_type:   enum (FTE, PART_TIME, TEMP, AGENCY)
  home_site_id:      UUID
  hire_date:         date
  contract: {
    weekly_hours:    decimal
    shift_pattern:   enum (FIXED, ROTATING, FLEXIBLE)
    overtime_limit:  decimal (hours/week)
    notice_period:   int (days)
    hourly_rate:     Money
    overtime_rate:   Money
    agency_markup:   decimal (percentage, if AGENCY)
  }
  status:            enum (ACTIVE, ON_LEAVE, SUSPENDED, TERMINATED)
}

EmployeeSkill {
  employee_id:       UUID
  skill_id:          UUID
  proficiency_level: int (1-5)
  certified:         boolean
  certification_expiry: date | null
  last_assessed:     date
  assessed_by:       enum (SYSTEM, MANAGER, SELF, TRAINING_PROVIDER)
}

Availability {
  employee_id:       UUID
  date:              date
  available_from:    time | null     // null = unavailable all day
  available_to:      time | null
  reason:            enum (SCHEDULED, LEAVE_ANNUAL, LEAVE_SICK, TRAINING, UNAVAILABLE_OTHER)
  source:            enum (HRIS, SELF_SERVICE, MANAGER_OVERRIDE, SYSTEM)
}
```

### Skill Graph

Skills are organized in a directed acyclic graph (stored in Neo4j):

```
Logistics
├── Inbound
│   ├── Receiving (includes: RF Scanner Operation)
│   ├── Put-Away (includes: Forklift Operation, WMS Navigation)
│   └── Quality Check
├── Storage
│   ├── Inventory Count
│   └── Replenishment
├── Outbound
│   ├── Pick (Each) (includes: RF Scanner Operation, Zone Navigation)
│   ├── Pick (Case)
│   ├── Pick (Pallet) (includes: Forklift Operation)
│   ├── Pack (Standard)
│   ├── Pack (Custom/VAS)
│   └── Ship/Load (includes: Dock Operations)
└── Support
    ├── Forklift Operation (certification required, renewal: annual)
    ├── Hazmat Handling (certification required, renewal: biennial)
    ├── Team Lead
    └── Trainer
```

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/workforce/employees` | GET | List employees with filters (site, skill, availability) |
| `/api/v1/workforce/employees/{id}` | GET | Full employee profile |
| `/api/v1/workforce/employees/{id}/skills` | GET/PUT | View/update skill profile |
| `/api/v1/workforce/employees/{id}/availability` | GET/PUT | View/update availability |
| `/api/v1/workforce/employees/import` | POST | Bulk import from HRIS |
| `/api/v1/workforce/skills/taxonomy` | GET | Full skill taxonomy tree |
| `/api/v1/workforce/skills/matrix` | GET | Skill matrix for a site (employees x skills) |
| `/api/v1/workforce/certifications/expiring` | GET | Certifications expiring within N days |

### Dependencies

- **Upstream**: HRIS Integration (via Integration Gateway), Training systems
- **Downstream**: Optimization Engine, Planning Workbench, AI Advisor, Control Room
- **Infrastructure**: PostgreSQL (employee records), Neo4j (skill graph), Redis (availability cache)

### Scaling Strategy

- Read-heavy workload; employs read replicas and aggressive caching
- Skill graph queries are cached with a 5-minute TTL (invalidated on `SkillProfileUpdated` events)
- Availability lookups are pre-materialized into a date-indexed cache for the next 30 days
- Bulk import jobs run as background workers to avoid impacting read performance
- Target: serve 5,000 employee lookups/second, skill matrix queries in < 100ms

---

## Module 4: Optimization Engine

### Responsibility

Produces optimal or near-optimal workforce plans by solving a constrained optimization problem that matches available workforce supply to computed workload demand, minimizing cost while respecting all hard constraints.

### Inputs

| Input | Source |
|-------|--------|
| `WorkloadPlan` | Workload Computation Engine |
| Employee roster with skills | Workforce Registry |
| Employee availability | Workforce Registry |
| Site constraints (capacity, operating hours) | Site Configuration Store |
| Labor rules (legal, contractual, union) | Site Configuration Store |
| Cost parameters (rates, overtime multipliers) | Workforce Registry + Finance Config |
| Objective weights | Tenant configuration |
| Planner overrides (locked assignments) | Planning Workbench |

### Outputs

| Output | Destination |
|--------|-------------|
| `WorkforcePlan` (shift assignments) | Operational DB, Planning Workbench |
| `PlanGenerated` event | Event bus |
| `ShiftAssigned` events (one per assignment) | Event bus |
| Solver diagnostics (gap analysis, infeasibility report) | Planning Workbench, AI Advisor |
| Unmet demand report | Control Room, AI Advisor |

### Solver Architecture

```
+-------------------------------------------------------------+
|  Optimization Engine                                        |
|                                                             |
|  +------------------+    +--------------------+             |
|  | Problem Builder  |--->| Pre-processor      |             |
|  | (data assembly)  |    | (domain reduction, |             |
|  +------------------+    |  heuristic warmstart|             |
|                          +--------+-----------+             |
|                                   |                         |
|                          +--------v-----------+             |
|                          | Solver Core        |             |
|                          | +---------------+  |             |
|                          | | MIP Solver    |  |  (OR-Tools  |
|                          | | (operational) |  |   / Gurobi) |
|                          | +---------------+  |             |
|                          | | Column Gen    |  |             |
|                          | | (tactical)    |  |             |
|                          | +---------------+  |             |
|                          | | LP Relaxation |  |             |
|                          | | (strategic)   |  |             |
|                          | +---------------+  |             |
|                          +--------+-----------+             |
|                                   |                         |
|                          +--------v-----------+             |
|                          | Post-processor     |             |
|                          | (feasibility check,|             |
|                          |  plan assembly)     |             |
|                          +--------------------+             |
+-------------------------------------------------------------+
```

### Constraint Model

**Hard Constraints (enforced as solver constraints):**

| Constraint | Description | Source |
|-----------|-------------|--------|
| HC-1: Max daily hours | Employee cannot exceed N hours/day (default: 10) | Labor law |
| HC-2: Max weekly hours | Employee cannot exceed N hours/week (default: 48 EU, 60 US) | Labor law |
| HC-3: Minimum rest | Minimum 11 hours between shift end and next shift start | EU Working Time Directive |
| HC-4: Certification required | Certain processes require valid certification | Safety regulations |
| HC-5: Site capacity | Zone/workstation headcount cannot exceed physical limit | Site configuration |
| HC-6: Guaranteed hours | FTE employees must be assigned at least their contracted hours | Employment contract |
| HC-7: Availability | Cannot assign employee during approved leave or unavailability | HR policy |
| HC-8: Single assignment | Employee can only be at one site/zone at a time | Physics |

**Soft Constraints (penalized in objective function):**

| Constraint | Penalty Weight (default) | Description |
|-----------|-------------------------|-------------|
| SC-1: Overtime | 3.0x hourly cost | Each overtime hour penalized at premium rate |
| SC-2: Agency usage | 2.0x equivalent FTE cost | Prefer internal staff over agency |
| SC-3: Skill mismatch | $15/hour equivalent | Assigning overqualified worker to simple task |
| SC-4: Preference violation | $5/shift | Violating employee shift preference |
| SC-5: Team split | $10/shift per person | Breaking up an established team |
| SC-6: Unmet demand | $500/hour unmet | Hours of demand with no assignment (heavily penalized) |
| SC-7: Commute distance | $2/km over threshold | Cross-site assignment travel cost proxy |

### Solver Strategy Selection

| Planning Horizon | Solver | Time Budget | Typical Problem Size |
|-----------------|--------|-------------|---------------------|
| Operational (daily) | MIP (mixed-integer programming) | 30 seconds | 200 employees, 50 shifts, 10 processes |
| Tactical (weekly) | Column generation with MIP subproblem | 5 minutes | 500 employees, 350 shifts, 15 processes |
| Strategic (quarterly) | LP relaxation + rounding heuristic | 30 minutes | 2,000 employees, 2,000 shifts, 20 processes |

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/optimizer/solve` | POST | Submit optimization request |
| `/api/v1/optimizer/plans` | GET | List generated plans |
| `/api/v1/optimizer/plans/{id}` | GET | Get plan with full assignment detail |
| `/api/v1/optimizer/plans/{id}/diagnostics` | GET | Solver diagnostics (gap, runtime, constraints hit) |
| `/api/v1/optimizer/plans/{id}/infeasibility` | GET | Infeasibility analysis (which constraints conflict) |
| `/api/v1/optimizer/plans/{id}/approve` | POST | Approve plan, triggering downstream notifications |
| `/api/v1/optimizer/plans/{id}/reject` | POST | Reject plan with reason |

### Dependencies

- **Upstream**: Workload Computation Engine, Workforce Registry, Site Configuration Store
- **Downstream**: Planning Workbench, Control Room, AI Advisor, Audit Service
- **Infrastructure**: Dedicated compute nodes (CPU-optimized), Redis (warm-start cache), PostgreSQL

### Scaling Strategy

- Compute-intensive; runs on dedicated node pools with CPU-optimized instances (c6i/c7g on AWS)
- Each solve request runs in an isolated container with configurable resource limits
- Horizontal scaling by tenant: each tenant's solve jobs run on separate workers
- Warm-start caching: previous solution is cached and used as initial feasible solution for incremental re-solves
- Solve jobs are queued in a priority queue (operational > tactical > scenario)
- Target: sustain 50 concurrent solve jobs across all tenants

---

## Module 5: Scenario Simulator

### Responsibility

Enables planners to explore hypothetical scenarios ("what-if" analyses) without modifying the active production plan. Scenarios are clones of real plans with modified parameters.

### Inputs

| Input | Source |
|-------|--------|
| Base plan (snapshot) | Optimization Engine output |
| Scenario parameters (overrides) | Planner via UI or API |
| Historical variability data | Time-series DB |
| Probability distributions | Statistical models |

### Outputs

| Output | Destination |
|--------|-------------|
| Scenario plan(s) | Scenario DB (isolated from production) |
| Scenario comparison report | Planning Workbench |
| Monte Carlo distribution results | Planning Workbench, AI Advisor |
| `ScenarioCompleted` event | Event bus |

### Scenario Types

| Type | Description | Example |
|------|-------------|---------|
| **Demand override** | Modify demand volume for specific processes/periods | "Peak season: +40% pick volume for 2 weeks" |
| **Supply shock** | Remove or add workforce capacity | "Flu outbreak: 20% of warehouse staff unavailable Mon-Wed" |
| **Process change** | Add/remove/modify process paths | "Add new VAS station requiring 2 certified operators per shift" |
| **Cost exploration** | Change cost parameters | "What if agency rate increases by 15%?" |
| **Policy change** | Modify constraints | "What if we allow 12-hour shifts instead of 10?" |
| **Monte Carlo** | Probabilistic demand with N iterations | "Run 1,000 demand samples from forecast distribution, report P50/P90 cost" |

### Monte Carlo Engine

For probabilistic scenarios:

1. Sample N demand vectors from the forecast confidence distribution
2. For each sample, run the Optimization Engine solver (with reduced time budget)
3. Aggregate results: compute percentile distributions for key KPIs (cost, headcount, overtime, unmet demand)
4. Generate a sensitivity analysis: which input variables have the highest impact on output variance

Configuration:
- `iterations`: 100 (fast) to 10,000 (thorough), default 1,000
- `confidence_levels`: [0.10, 0.25, 0.50, 0.75, 0.90, 0.95, 0.99]
- `time_budget_per_iteration`: 5 seconds (uses heuristic solver, not full MIP)
- `parallel_workers`: configurable, default 10

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/scenarios` | POST | Create a new scenario |
| `/api/v1/scenarios` | GET | List scenarios for a site/region |
| `/api/v1/scenarios/{id}` | GET | Get scenario details and results |
| `/api/v1/scenarios/{id}/run` | POST | Execute the scenario |
| `/api/v1/scenarios/{id}/compare` | GET | Compare scenario results to base plan |
| `/api/v1/scenarios/monte-carlo` | POST | Run Monte Carlo simulation |
| `/api/v1/scenarios/{id}/promote` | POST | Promote scenario result to active plan |

### Dependencies

- **Upstream**: Optimization Engine (solver), Workload Computation Engine, Workforce Registry
- **Downstream**: Planning Workbench (visualization), AI Advisor (insight generation)
- **Infrastructure**: Dedicated compute pool (shared with Optimization Engine), PostgreSQL, Redis

### Scaling Strategy

- Monte Carlo simulations are embarrassingly parallel; fan out across worker pool
- Scenario data is stored in isolated schema partitions to prevent interference with production data
- Long-running simulations execute asynchronously with progress reporting via WebSocket
- Auto-scaling: spin up additional solver workers during heavy scenario usage
- Target: complete a 1,000-iteration Monte Carlo for a single site in under 90 seconds

---

## Module 6: AI Advisor

### Responsibility

Synthesizes data from all other modules to generate natural-language insights, proactive recommendations, anomaly explanations, and plan justifications. Acts as the "intelligent assistant" layer.

### Inputs

| Input | Source |
|-------|--------|
| Demand forecasts and anomalies | Demand Ingestion Service |
| Workload computations | Workload Computation Engine |
| Plans and solver diagnostics | Optimization Engine |
| Employee data and skill gaps | Workforce Registry |
| Real-time KPIs | Control Room / Time-series DB |
| Historical trends | Time-series DB |

### Outputs

| Output | Destination |
|--------|-------------|
| Insight cards (structured recommendations) | Control Room, Planning Workbench |
| Anomaly explanations | Alert system |
| Plan explanations (why an assignment was made) | Planning Workbench |
| Natural-language summary reports | Email digests, dashboard widgets |
| `InsightGenerated` event | Event bus |

### Insight Categories

| Category | Trigger | Example Output |
|----------|---------|----------------|
| **Capacity alert** | Workload > available supply | "Site ORD-02 will be 8 FTEs short on pick process Tuesday AM shift. Recommend: approve 4 agency temps + 4 overtime extensions." |
| **Cost optimization** | Identified savings opportunity | "Cross-training 6 pack operators on pick at site DFW-04 would reduce weekly agency spend by $4,200 based on last 4 weeks of demand." |
| **Forecast anomaly** | Demand deviates from pattern | "Thursday demand for site LAX-01 receiving is 3.2 standard deviations above the 8-week rolling average. Verify with WMS team." |
| **Certification risk** | Expiring certifications | "3 forklift certifications at site ATL-07 expire within 30 days. Without renewal, Tuesday/Thursday night shifts will have no certified operator." |
| **Trend analysis** | Sustained metric drift | "Overtime hours at site SEA-03 have increased 23% month-over-month for 3 consecutive months, driven by 4 unfilled FTE positions in outbound." |
| **Plan explanation** | User asks "why this assignment?" | "Maria was assigned to night shift because she is 1 of 2 certified forklift operators available, and HC-4 requires one per inbound shift." |

### Architecture

The AI Advisor is built as a pipeline:

1. **Data Aggregator**: collects relevant metrics and state from all modules
2. **Pattern Detector**: rule-based and ML-based detection of noteworthy patterns
3. **Insight Generator**: applies templates and LLM-based generation for natural-language output
4. **Prioritizer**: ranks insights by urgency (SLA risk > cost > informational) and deduplicates
5. **Delivery Router**: sends insights to appropriate channels based on recipient preferences

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/advisor/insights` | GET | List insights for a site/region with priority filtering |
| `/api/v1/advisor/insights/{id}/acknowledge` | POST | Acknowledge an insight |
| `/api/v1/advisor/explain/plan/{planId}` | GET | Get natural-language explanation of a plan |
| `/api/v1/advisor/explain/assignment/{assignmentId}` | GET | Explain why an employee was assigned to a specific shift |
| `/api/v1/advisor/recommendations` | GET | Get actionable recommendations |
| `/api/v1/advisor/digest` | GET | Generate summary digest for a time period |

### Dependencies

- **Upstream**: All intelligence layer modules, Workforce Registry, Time-series DB
- **Downstream**: Control Room, Planning Workbench, Alert system, Email service
- **Infrastructure**: PostgreSQL (insight store), Redis (deduplication), LLM API (for NL generation)

### Scaling Strategy

- Insight generation runs on a scheduled cadence (every 5 minutes for operational, hourly for tactical)
- Event-driven triggers for urgent insights (demand anomaly, critical understaffing)
- LLM calls are batched and rate-limited to manage API costs
- Insights are cached and only regenerated when underlying data changes
- Target: generate and deliver critical insights within 60 seconds of triggering event

---

## Module 7: Setup Wizard Service

### Responsibility

Orchestrates the multi-step configuration process for onboarding new tenants and sites. Manages wizard state, validates configuration at each step, applies templates, and produces a complete, validated site configuration.

### Inputs

| Input | Source |
|-------|--------|
| User inputs (forms, uploads) | Setup Wizard UI |
| Industry templates | Template library (internal) |
| HRIS connection credentials | Admin user |
| ERP/WMS connection details | Admin user |
| Sample demand data | File upload or integration test |

### Outputs

| Output | Destination |
|--------|-------------|
| Tenant configuration | Configuration Store |
| Site configurations | Configuration Store |
| Process definitions | Configuration Store |
| Integration connection configs | Integration Gateway |
| `TenantOnboarded` event | Event bus |
| `SiteConfigured` event | Event bus |
| Configuration audit trail | Audit Service |

### Wizard Steps

| Step | Name | Actions | Validation |
|------|------|---------|------------|
| 1 | Organization Setup | Company name, industry vertical, regional hierarchy, timezone | Valid timezone, unique tenant name |
| 2 | Site Definition | Site name, address, operating hours, shift patterns, zones | At least one shift pattern, valid hours |
| 3 | Process Configuration | Select process paths, set productivity rates, map demand units | At least one process, rates > 0 |
| 4 | Workforce Import | HRIS connection or CSV upload, field mapping, data quality check | Minimum required fields present, no duplicate IDs |
| 5 | Skill Taxonomy | Select from template or custom-define, map skills to processes | Every process has at least one mapped skill |
| 6 | Integration Setup | Configure source system connections, test connectivity, set sync schedule | Successful connection test for each source |
| 7 | Planning Rules | Optimization constraints, approval workflows, notification preferences | Constraints are non-contradictory |
| 8 | Validation & Go-Live | Dry run (sample computation), data quality scorecard, go-live toggle | Quality score >= 80%, no blocking errors |

### Template Engine

Pre-built templates accelerate setup for common logistics operations:

| Template | Description | Pre-configured |
|----------|-------------|----------------|
| `warehouse-standard` | General-purpose warehouse with inbound/outbound | 8 process paths, standard rates, 3-shift pattern |
| `fulfillment-ecommerce` | High-velocity ecommerce fulfillment center | 12 process paths, each-pick focus, flexible shifts |
| `cold-chain` | Temperature-controlled facility | Cold-zone constraints, cert requirements, reduced shift lengths |
| `cross-dock` | Cross-docking / transshipment hub | Minimal storage, high inbound/outbound velocity |
| `returns-center` | Reverse logistics / returns processing | Returns-specific processes, quality grading |

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/wizard/sessions` | POST | Start a new wizard session |
| `/api/v1/wizard/sessions/{id}` | GET | Get current wizard state |
| `/api/v1/wizard/sessions/{id}/steps/{step}` | PUT | Submit data for a wizard step |
| `/api/v1/wizard/sessions/{id}/steps/{step}/validate` | POST | Validate step without advancing |
| `/api/v1/wizard/templates` | GET | List available templates |
| `/api/v1/wizard/sessions/{id}/apply-template` | POST | Apply a template to the session |
| `/api/v1/wizard/sessions/{id}/dry-run` | POST | Run validation dry-run |
| `/api/v1/wizard/sessions/{id}/go-live` | POST | Finalize and activate configuration |

### Dependencies

- **Upstream**: Admin user input
- **Downstream**: All modules (consumes the configuration this module produces)
- **Infrastructure**: PostgreSQL (wizard state), S3 (uploaded files), Integration Gateway (connection testing)

### Scaling Strategy

- Low-throughput, high-importance module; runs on standard application pods
- Wizard state is persisted in the database (survives pod restarts)
- Connection testing runs with configurable timeouts (30 seconds per source)
- Go-live dry-run executes a mini-pipeline (ingest sample data, compute workload, run solver) in an isolated environment
- Target: support 50 concurrent wizard sessions

---

## Module 8: Control Room

### Responsibility

Provides real-time operational dashboards and KPI monitoring for site managers, regional directors, and enterprise executives. Surfaces alerts and enables rapid operational decisions.

### Inputs

| Input | Source |
|-------|--------|
| Real-time telemetry (aggregated) | Time-series DB |
| Active plan data | Optimization Engine / Operational DB |
| Attendance data | Time & attendance integration |
| Insights and alerts | AI Advisor |
| KPI targets | Site Configuration Store |

### Outputs

| Output | Destination |
|--------|-------------|
| Dashboard visualizations | Browser (React SPA) |
| Alert notifications | Notification service (push, email, SMS) |
| Exported reports | S3 (PDF, CSV) |

### Dashboard Views

| View | Audience | Key Metrics | Refresh |
|------|----------|-------------|---------|
| **Site Operations** | Site Manager | Headcount (planned vs actual), throughput rate, overtime accumulation, unmet demand | 60 sec |
| **Regional Rollup** | Regional Director | Aggregate headcount, cross-site utilization, budget variance, top alerts | 5 min |
| **Enterprise Overview** | VP/C-suite | Total labor cost vs budget, FTE utilization %, top 10 risk sites, trend lines | 15 min |
| **Workforce Heatmap** | Planner | Skill coverage gaps, certification expirations, availability patterns | 5 min |
| **Cost Tracker** | Finance | Labor cost burn rate, overtime cost, agency cost, projected end-of-period | Daily |

### Alert Management

The Control Room aggregates alerts from across the platform and provides a unified alert management interface:

- **Alert inbox**: prioritized list, filterable by severity, site, category
- **Acknowledge**: mark alert as seen with optional notes
- **Escalation**: auto-escalate unacknowledged critical alerts after configurable timeout (default: 30 min)
- **Snooze**: temporarily suppress an alert for a specified duration
- **Resolve**: mark alert as resolved with resolution notes (feeds back to AI Advisor)

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/controlroom/dashboards` | GET | List available dashboards for current user |
| `/api/v1/controlroom/kpis` | GET | Query KPI values with time range and granularity |
| `/api/v1/controlroom/alerts` | GET | List active alerts |
| `/api/v1/controlroom/alerts/{id}/acknowledge` | POST | Acknowledge an alert |
| `/api/v1/controlroom/alerts/{id}/resolve` | POST | Resolve an alert |
| `/api/v1/controlroom/reports/export` | POST | Generate and export a report |
| `/ws/v1/controlroom/live` | WebSocket | Real-time KPI stream |

### Dependencies

- **Upstream**: All intelligence modules (via events and APIs), Workforce Registry, Time-series DB
- **Downstream**: Notification service, Report storage
- **Infrastructure**: TimescaleDB (metrics), Redis (dashboard cache), WebSocket server

### Scaling Strategy

- Read-heavy, fan-out pattern; caches dashboard data in Redis with short TTL (30-60 seconds)
- WebSocket connections managed via sticky sessions on the load balancer
- KPI aggregation queries run against TimescaleDB continuous aggregates (pre-computed)
- Static report generation offloaded to background workers
- Target: support 200 concurrent dashboard sessions per tenant, WebSocket update latency < 2 seconds

---

## Module 9: Planning Workbench

### Responsibility

The primary interface for workforce planners to review, modify, and approve workforce plans. Provides drag-and-drop scheduling, version comparison, constraint-aware editing, and approval workflows.

### Inputs

| Input | Source |
|-------|--------|
| Generated plans | Optimization Engine |
| Workload breakdown | Workload Computation Engine |
| Employee roster and availability | Workforce Registry |
| Constraint definitions | Site Configuration Store |
| AI recommendations | AI Advisor |

### Outputs

| Output | Destination |
|--------|-------------|
| Manual plan adjustments | Optimization Engine (for re-validation) |
| Locked assignments (planner overrides) | Optimization Engine (as solver constraints) |
| Plan approval/rejection | Approval workflow engine |
| `PlanApproved` / `PlanRejected` events | Event bus |
| `ManualAdjustmentMade` event | Event bus, Audit Service |

### Core Features

**Timeline View**: Gantt chart showing shifts across a configurable time axis (day/week). Each row is an employee or a role/skill group. Color-coded by process path, with icons for constraint violations.

**Drag-and-Drop**: Planner can:
- Move an assignment from one shift to another
- Reassign an employee from one process to another
- Extend or shorten a shift duration
- Each drag-drop action triggers real-time constraint validation (server-side check in < 500ms)

**Constraint Validator**: On every manual edit, the system checks all hard constraints and reports:
- Violations (blocks the edit unless planner explicitly overrides with justification)
- Warnings (soft constraint violations with cost impact displayed)
- Suggestions (alternative assignments that would satisfy constraints)

**Approval Workflow**:

| State | Transitions | Actor |
|-------|-------------|-------|
| `DRAFT` | Submit for approval | Planner |
| `PENDING_APPROVAL` | Approve, Reject, Request changes | Site Manager |
| `APPROVED` | Publish (makes plan active) | Site Manager |
| `PUBLISHED` | Revise (creates new version) | Planner |
| `REJECTED` | Revise and resubmit | Planner |

**Version History**: Every plan change creates a new version. Planners can:
- View version timeline
- Compare any two versions side-by-side (diff view)
- Roll back to a previous version (creates a new version with rolled-back content)

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/workbench/plans` | GET | List plans for the planner's scope |
| `/api/v1/workbench/plans/{id}` | GET | Get plan with assignments in timeline format |
| `/api/v1/workbench/plans/{id}/assignments` | PUT | Submit manual assignment changes |
| `/api/v1/workbench/plans/{id}/validate` | POST | Validate current plan against all constraints |
| `/api/v1/workbench/plans/{id}/submit` | POST | Submit plan for approval |
| `/api/v1/workbench/plans/{id}/approve` | POST | Approve plan (manager) |
| `/api/v1/workbench/plans/{id}/reject` | POST | Reject plan with comments |
| `/api/v1/workbench/plans/{id}/publish` | POST | Publish approved plan |
| `/api/v1/workbench/plans/{id}/versions` | GET | List version history |
| `/api/v1/workbench/plans/{id}/versions/compare` | GET | Compare two versions |

### Dependencies

- **Upstream**: Optimization Engine, Workload Computation Engine, Workforce Registry, AI Advisor
- **Downstream**: Optimization Engine (for re-validation), Audit Service, Notification Service
- **Infrastructure**: PostgreSQL, Redis (session state), WebSocket (real-time collaboration)

### Scaling Strategy

- Serves interactive user sessions; WebSocket-based for real-time updates
- Plan data is loaded into client-side state with server-side validation on each mutation
- Constraint validation is a synchronous API call (must respond in < 500ms)
- Approval workflow state machine is event-sourced for full auditability
- Target: support 100 concurrent planning sessions per tenant, constraint validation P95 < 500ms

---

## Module 10: Integration Gateway

### Responsibility

Manages all inbound and outbound communication with external systems. Provides protocol translation, authentication, rate limiting, retry logic, and monitoring for all integrations.

### Inputs

| Input | Source |
|-------|--------|
| Inbound API calls | External systems (ERP, WMS, HRIS, etc.) |
| Inbound webhooks | External systems |
| Inbound files | SFTP / S3 landing zones |
| Outbound data requests | Internal services |

### Outputs

| Output | Destination |
|--------|-------------|
| Normalized inbound data | Demand Ingestion, Workforce Registry, other internal services |
| Outbound API responses | External systems |
| Outbound file deliveries | SFTP / S3 |
| Integration health metrics | Control Room, Monitoring |
| `IntegrationSyncCompleted` / `IntegrationSyncFailed` events | Event bus |

### Integration Patterns Supported

| Pattern | Implementation | Use Case |
|---------|---------------|----------|
| REST API (inbound) | API endpoints with OpenAPI spec | WMS pushing order data |
| REST API (outbound) | HTTP client with retry/circuit breaker | Pulling from ERP |
| Webhook (inbound) | Webhook receiver with signature verification | HRIS change notifications |
| Webhook (outbound) | Webhook dispatcher with retry | Notifying external systems of plan changes |
| File-based (inbound) | SFTP watcher / S3 event trigger | Batch demand file drops |
| File-based (outbound) | Scheduled file generation + SFTP push / S3 write | Payroll export files |
| Streaming (inbound) | Kafka consumer / Kinesis reader | Real-time WMS telemetry |
| Streaming (outbound) | Kafka producer | Real-time plan updates to WMS |

### Connector Registry

Each external system connection is registered as a `Connector` with:

```
Connector {
  connector_id:     UUID
  tenant_id:        UUID
  system_type:      enum (ERP, WMS, TMS, HRIS, PAYROLL, IOT, CUSTOM)
  system_name:      string  // e.g., "SAP S/4HANA Production"
  protocol:         enum (REST, SFTP, KAFKA, S3, WEBHOOK)
  connection_config: encrypted JSONB  // URLs, credentials, topics
  sync_schedule:    cron expression | "realtime" | "on-demand"
  field_mapping:    JSONB  // source field -> AstraPlanner field mapping
  status:           enum (ACTIVE, PAUSED, ERROR, CONFIGURING)
  last_sync:        ISO-8601
  error_count:      int (rolling 24h)
  circuit_breaker:  enum (CLOSED, OPEN, HALF_OPEN)
}
```

### Error Handling

| Error Type | Strategy | Max Retries | Backoff |
|-----------|----------|-------------|---------|
| Transient (timeout, 503) | Exponential backoff retry | 5 | 1s, 2s, 4s, 8s, 16s |
| Authentication failure (401/403) | Alert, pause connector, no retry | 0 | N/A |
| Data validation error | Log to dead-letter queue, continue batch | N/A | N/A |
| Rate limit (429) | Respect `Retry-After` header | 10 | As specified |
| Circuit breaker open | Queue requests, retry after cooldown | N/A | 60s cooldown |

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/integrations/connectors` | GET/POST | List or create connectors |
| `/api/v1/integrations/connectors/{id}` | GET/PUT/DELETE | Manage a connector |
| `/api/v1/integrations/connectors/{id}/test` | POST | Test connectivity |
| `/api/v1/integrations/connectors/{id}/sync` | POST | Trigger manual sync |
| `/api/v1/integrations/connectors/{id}/health` | GET | Connector health and recent sync history |
| `/api/v1/integrations/webhooks/register` | POST | Register an outbound webhook |
| `/api/v1/integrations/dead-letter` | GET | View dead-letter queue entries |
| `/api/v1/integrations/dead-letter/{id}/replay` | POST | Replay a dead-letter entry |

### Dependencies

- **Upstream**: External systems
- **Downstream**: Demand Ingestion Service, Workforce Registry, all data consumers
- **Infrastructure**: PostgreSQL (connector registry), Redis (rate limiting), Kafka, S3, Vault (credentials)

### Scaling Strategy

- Stateless gateway; scales horizontally
- Each connector runs as an independent worker (can scale per-connector)
- File processing workers auto-scale based on queue depth
- Circuit breaker state stored in Redis (shared across instances)
- Target: handle 1,000 inbound API calls/second, process 100 files/hour, sustain 50K streaming events/second

---

## Module 11: Multi-Site Coordinator

### Responsibility

Manages cross-site workforce operations for enterprises with multiple facilities. Handles site hierarchy, regional rollups, cross-site workforce sharing, and coordinated planning.

### Inputs

| Input | Source |
|-------|--------|
| Site hierarchy definition | Configuration Store |
| Per-site plans | Optimization Engine |
| Cross-site sharing policies | Tenant configuration |
| Employee home-site and mobility preferences | Workforce Registry |

### Outputs

| Output | Destination |
|--------|-------------|
| Cross-site transfer recommendations | Planning Workbench, AI Advisor |
| Regional aggregate metrics | Control Room |
| Coordinated multi-site plan | Optimization Engine (as constraints) |
| `CrossSiteTransferRequested` event | Event bus |
| `SiteCapacityChanged` event | Event bus |

### Site Hierarchy Model

```
Enterprise (Tenant)
├── Region: North America
│   ├── Sub-region: US East
│   │   ├── Site: ATL-DC-01  (Atlanta DC)
│   │   ├── Site: ATL-DC-02  (Atlanta FC)
│   │   └── Site: CLT-DC-01  (Charlotte DC)
│   └── Sub-region: US West
│       ├── Site: LAX-DC-01
│       └── Site: SEA-FC-01
└── Region: EMEA
    ├── Sub-region: UK
    │   └── Site: LHR-DC-01
    └── Sub-region: Continental EU
        ├── Site: FRA-DC-01
        └── Site: AMS-FC-01
```

### Cross-Site Workforce Sharing

When one site has surplus labor and another has a deficit, the coordinator can recommend or auto-execute transfers:

**Eligibility rules**:
- Employee must have `mobility_flag = true` in their profile
- Target site must be within configurable max distance (default: 80km)
- Employee must possess required skills for the target process
- Transfer must not violate labor law constraints (e.g., maximum travel time rules)
- Union agreements may restrict cross-site movement

**Sharing optimization**: The coordinator runs a secondary optimization pass that considers all sites in a region simultaneously, treating cross-site transfers as variables with associated travel cost penalties.

### Regional Rollup Metrics

| Metric | Aggregation | Granularity |
|--------|------------|-------------|
| Total headcount (planned vs actual) | Sum across sites | Region, sub-region |
| Labor cost | Sum across sites | Region, sub-region |
| Utilization % | Weighted average | Region, sub-region |
| Unmet demand hours | Sum across sites | Region, sub-region |
| Cross-site transfers | Count | Region |
| Agency labor % | Weighted average | Region, sub-region |

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/multisite/hierarchy` | GET/PUT | View or update site hierarchy |
| `/api/v1/multisite/rollup` | GET | Regional KPI rollup |
| `/api/v1/multisite/transfers` | GET/POST | List or create cross-site transfer requests |
| `/api/v1/multisite/transfers/{id}/approve` | POST | Approve a transfer |
| `/api/v1/multisite/sharing-policy` | GET/PUT | View/update sharing policies |
| `/api/v1/multisite/capacity` | GET | View capacity surplus/deficit across sites |

### Dependencies

- **Upstream**: Optimization Engine (per-site plans), Workforce Registry, Site Configuration
- **Downstream**: Optimization Engine (cross-site constraints), Control Room, Planning Workbench
- **Infrastructure**: PostgreSQL, Redis (capacity cache)

### Scaling Strategy

- Moderate compute; cross-site optimization is a smaller problem than per-site (fewer variables)
- Regional rollups are pre-computed and cached (5-minute TTL)
- Transfer recommendations batch-processed on a 15-minute cycle
- Target: support hierarchies with up to 5,000 sites, rollup queries in < 2 seconds

---

## Module 12: Audit & Compliance Service

### Responsibility

Records every decision, configuration change, and data modification for regulatory compliance, labor law adherence, and operational accountability. Provides tamper-evident logging and compliance reporting.

### Inputs

| Input | Source |
|-------|--------|
| Audit events | All modules (via event bus and direct API) |
| Compliance rule definitions | Configuration Store |
| Regulatory calendar | Compliance configuration |
| Plan decisions with justifications | Optimization Engine, Planning Workbench |

### Outputs

| Output | Destination |
|--------|-------------|
| Audit log entries | Append-only audit store |
| Compliance reports | Report storage (S3), Control Room |
| Compliance violation alerts | Alert system |
| Regulatory filing data | Export (CSV, XML) for government submissions |

### Audit Log Structure

Every audit entry captures:

| Field | Description |
|-------|-------------|
| `entry_id` | Unique identifier (UUID v7, time-ordered) |
| `tenant_id` | Tenant scope |
| `timestamp` | Event time (UTC, microsecond precision) |
| `actor` | Who: user ID, service account, or "SYSTEM" |
| `action` | What: dot-notation action code (e.g., `plan.assignment.override`) |
| `resource_type` | Entity type affected |
| `resource_id` | Entity ID |
| `before_state` | State before change (JSONB snapshot) |
| `after_state` | State after change (JSONB snapshot) |
| `reason` | Human-readable justification |
| `correlation_id` | Links related entries across a workflow |
| `metadata` | Additional context (IP address, user-agent, session ID) |

### Compliance Checks

| Check | Regulation | Frequency | Action on Violation |
|-------|-----------|-----------|-------------------|
| Maximum weekly hours | EU Working Time Directive / FLSA | On every plan generation | Block plan approval, flag in workbench |
| Minimum rest between shifts | EU WTD (11 hours) | On every assignment | Prevent assignment, alert planner |
| Youth worker restrictions | National labor laws | On assignment of flagged employees | Prevent assignment |
| Overtime limit compliance | Contractual / legal | Weekly rollup | Alert manager, auto-cap in optimizer |
| Equal treatment (agency workers) | Agency Workers Regulations | Quarterly audit | Compliance report |
| Record retention | GDPR, local labor law | Monthly | Auto-archive or delete as required |
| Right to disconnect | Applicable jurisdictions | On notification scheduling | Suppress notifications outside working hours |

### Regulatory Reporting

Pre-built report templates for common regulatory requirements:

| Report | Jurisdiction | Frequency | Content |
|--------|-------------|-----------|---------|
| Working hours summary | EU | Monthly | Hours worked per employee, overtime, rest compliance |
| Labor cost allocation | All | Monthly | Cost by cost center, process, labor type |
| Agency worker report | UK/EU | Quarterly | Agency vs permanent ratio, equal treatment compliance |
| Skills & certification audit | All | Annual | Certification status, expiry tracking, training completion |
| Data retention compliance | GDPR | Annual | Data categories held, retention periods, deletion log |

### Key APIs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/audit/entries` | GET | Query audit log with filters |
| `/api/v1/audit/entries/{id}` | GET | Get full audit entry with before/after state |
| `/api/v1/audit/trail/{resourceType}/{resourceId}` | GET | Full change history for a resource |
| `/api/v1/compliance/checks` | GET | List compliance check results |
| `/api/v1/compliance/violations` | GET | List active violations |
| `/api/v1/compliance/reports` | GET/POST | List or generate compliance reports |
| `/api/v1/compliance/reports/{id}/export` | GET | Download report (PDF, CSV, XML) |

### Dependencies

- **Upstream**: All modules (event producers)
- **Downstream**: Control Room (alerts), Report storage
- **Infrastructure**: PostgreSQL (append-only audit table, partitioned by month), S3 (report storage, long-term archive)

### Scaling Strategy

- Write-heavy, append-only workload; uses PostgreSQL table partitioning by month
- Old partitions are compressed and archived to S3 (Parquet format) after 90 days
- Audit writes are asynchronous (via Kafka consumer) to avoid adding latency to source operations
- Compliance checks run as scheduled batch jobs (not on the hot path)
- Query performance maintained via targeted indexes on (tenant_id, resource_type, timestamp)
- Target: sustain 10,000 audit writes/second, query 90-day history in < 5 seconds

---

## Module Interaction Matrix

This matrix shows which modules communicate with which, and the nature of the interaction.

| | Demand Ingest | Workload Engine | Workforce Reg. | Optimizer | Scenario Sim | AI Advisor | Setup Wizard | Control Room | Workbench | Integration GW | Multi-Site | Audit |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Demand Ingest** | -- | Event | -- | -- | -- | Event | -- | -- | -- | Data In | -- | Events |
| **Workload Engine** | Reads | -- | Reads | Event | Reads | Event | -- | Reads | Reads | -- | -- | Events |
| **Workforce Reg.** | -- | Reads | -- | Reads | Reads | Reads | Writes | Reads | Reads | Data In | Reads | Events |
| **Optimizer** | -- | Reads | Reads | -- | Reads | Event | -- | Event | Event | -- | Reads/Writes | Events |
| **Scenario Sim** | -- | Calls | Reads | Calls | -- | Event | -- | -- | Event | -- | -- | Events |
| **AI Advisor** | Reads | Reads | Reads | Reads | Reads | -- | -- | Writes | Writes | -- | Reads | Events |
| **Setup Wizard** | Configures | Configures | Configures | Configures | -- | -- | -- | -- | -- | Configures | Configures | Events |
| **Control Room** | -- | -- | -- | -- | -- | Reads | -- | -- | -- | -- | Reads | -- |
| **Workbench** | -- | Reads | Reads | Calls | Calls | Reads | -- | -- | -- | -- | -- | Events |
| **Integration GW** | Delivers | -- | Delivers | -- | -- | -- | Tests | -- | -- | -- | -- | Events |
| **Multi-Site** | -- | -- | Reads | Reads/Writes | -- | Reads | -- | Reads | Reads | -- | -- | Events |
| **Audit** | -- | -- | -- | -- | -- | -- | -- | Reads | -- | -- | -- | -- |

Legend:
- **Reads**: synchronous read (API call or DB query)
- **Writes**: synchronous write (API call)
- **Calls**: invokes computation (synchronous or async with callback)
- **Event**: asynchronous event via Kafka
- **Data In**: delivers ingested data
- **Configures**: provides configuration during setup
- **Tests**: tests connectivity during setup
- **Delivers**: delivers normalized external data
