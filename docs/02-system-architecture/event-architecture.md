# Event Architecture

This document specifies AstraPlanner's event-driven architecture, including event bus design, domain event catalog, event sourcing for plan versioning, CQRS, saga patterns, schema management, error handling, and concrete event flow examples.

---

## 1. Event-Driven Architecture Overview

AstraPlanner uses events as the primary mechanism for inter-module communication. This decouples modules, enables asynchronous processing, supports audit requirements, and allows the system to scale each consumer independently.

Three categories of events flow through the system:

| Category | Purpose | Examples | Durability |
|----------|---------|----------|------------|
| **Domain Events** | Record business-meaningful state changes | `PlanGenerated`, `ShiftAssigned`, `DemandForecastUpdated` | Permanent (event store) |
| **Integration Events** | Signal external data synchronization | `IntegrationSyncCompleted`, `WebhookReceived` | 30-day retention |
| **System Events** | Operational health and infrastructure | `ServiceHealthChanged`, `CircuitBreakerTripped`, `ScaleEvent` | 7-day retention |

### Event Bus Infrastructure

```
+----------------------------------------------------------------------+
|  Kafka Cluster (3+ brokers, multi-AZ)                                |
|                                                                      |
|  Topic: domain.demand.*          (partitioned by site_id, 24 parts)  |
|  Topic: domain.workload.*        (partitioned by site_id, 24 parts)  |
|  Topic: domain.plan.*            (partitioned by site_id, 24 parts)  |
|  Topic: domain.workforce.*       (partitioned by tenant_id, 12 parts)|
|  Topic: domain.site.*            (partitioned by site_id, 12 parts)  |
|  Topic: integration.*            (partitioned by connector_id, 6 p.) |
|  Topic: system.*                 (partitioned by service_id, 6 p.)   |
|  Topic: deadletter.*             (partitioned by source_topic, 3 p.) |
|                                                                      |
|  Schema Registry (Confluent / AWS Glue)                              |
|  Retention: domain.* = infinite, integration.* = 30d, system.* = 7d |
+----------------------------------------------------------------------+
```

**Design decisions**:
- **Kafka** over alternatives (SQS, RabbitMQ) because: ordering guarantees per partition, infinite retention for domain events, replay capability, high throughput
- **Partition key = site_id** for domain events: ensures all events for a site are ordered and processed by the same consumer instance (important for plan consistency)
- **Partition key = tenant_id** for workforce events: employee data spans sites but is scoped to a tenant
- **Replication factor = 3**: tolerates loss of any single broker
- **Min in-sync replicas = 2**: ensures no data loss on producer acknowledgment

---

## 2. Event Envelope

Every event shares a common envelope structure:

```
EventEnvelope {
  // Header
  event_id:          UUID (v7, time-ordered)
  event_type:        string              // e.g., "domain.plan.PlanGenerated"
  event_version:     int                 // schema version (e.g., 3)
  timestamp:         ISO-8601 (UTC)      // when the event occurred
  tenant_id:         UUID
  correlation_id:    UUID                // traces a causal chain of events
  causation_id:      UUID                // the event_id that directly caused this event
  actor:             {
    type:            enum (USER, SYSTEM, INTEGRATION)
    id:              string
  }
  metadata:          {
    source_service:  string              // e.g., "optimization-engine"
    source_instance: string              // pod/container ID
    trace_id:        string              // OpenTelemetry trace ID
  }

  // Payload
  payload:           JSONB               // event-specific data (see catalog below)
}
```

### Envelope Guarantees

- `event_id` is globally unique and time-ordered (UUIDv7), enabling chronological ordering without relying on timestamps
- `correlation_id` links all events in a business workflow (e.g., from demand arrival to plan notification)
- `causation_id` enables precise event graph reconstruction (event A caused event B, which caused event C)
- Every event is self-describing: `event_type` + `event_version` uniquely identify the payload schema

---

## 3. Domain Event Catalog

### 3.1 Demand Domain

#### DemandForecastUpdated

Emitted when new demand data is ingested and validated.

| Field | Type | Description |
|-------|------|-------------|
| `site_id` | UUID | Site receiving the demand |
| `process_path` | string | e.g., "INBOUND.RECEIVING.UNLOAD" |
| `period_start` | ISO-8601 | Start of the demand period |
| `period_end` | ISO-8601 | End of the demand period |
| `previous_quantity` | decimal | Previous forecast quantity (null if first version) |
| `new_quantity` | decimal | Updated forecast quantity |
| `demand_unit` | enum | UNITS, ORDERS, LINES, PALLETS, etc. |
| `confidence` | float | Statistical confidence [0-1] |
| `source_system` | string | e.g., "SAP_APO" |
| `version` | int | Demand version number |
| `delta_pct` | float | Percentage change from previous version |

**Producer**: Demand Ingestion Service
**Consumers**: Workload Computation Engine, AI Advisor, Control Room

#### DemandAnomalyDetected

Emitted when ingested demand deviates significantly from historical patterns.

| Field | Type | Description |
|-------|------|-------------|
| `site_id` | UUID | Affected site |
| `process_path` | string | Affected process |
| `anomaly_type` | enum | SPIKE, DROP, ZERO_DEMAND, SEASONAL_DEVIATION |
| `z_score` | float | Standard deviations from mean |
| `expected_quantity` | decimal | What the model expected |
| `actual_quantity` | decimal | What was received |
| `severity` | enum | LOW, MEDIUM, HIGH, CRITICAL |

**Producer**: Demand Ingestion Service (anomaly detector)
**Consumers**: AI Advisor, Control Room (alert feed)

### 3.2 Workload Domain

#### WorkloadComputed

Emitted when workload hours are calculated from demand.

| Field | Type | Description |
|-------|------|-------------|
| `workload_plan_id` | UUID | Identifier for this workload computation |
| `site_id` | UUID | Site |
| `period_start` | ISO-8601 | Planning period start |
| `period_end` | ISO-8601 | Planning period end |
| `total_hours_required` | decimal | Sum of hours across all processes |
| `process_breakdown` | array | `[{process_path, hours, fte_equivalent}]` |
| `demand_version_used` | int | Which demand version was used as input |
| `previous_total_hours` | decimal | Previous computation (null if first) |
| `delta_pct` | float | Change from previous computation |

**Producer**: Workload Computation Engine
**Consumers**: Optimization Engine, Scenario Simulator, Control Room, AI Advisor

### 3.3 Plan Domain

#### PlanGenerated

Emitted when the Optimization Engine produces a new workforce plan.

| Field | Type | Description |
|-------|------|-------------|
| `plan_id` | UUID | Plan identifier |
| `plan_version` | int | Version number |
| `site_id` | UUID | Site |
| `horizon` | enum | OPERATIONAL, TACTICAL, STRATEGIC |
| `period_start` | ISO-8601 | Plan period start |
| `period_end` | ISO-8601 | Plan period end |
| `total_assignments` | int | Number of shift assignments |
| `total_cost` | Money | Estimated total labor cost |
| `unmet_demand_hours` | decimal | Hours of demand not covered |
| `solver_runtime_ms` | int | How long the solver took |
| `optimality_gap_pct` | float | Gap to theoretical optimum |
| `workload_plan_id` | UUID | Input workload plan used |
| `constraint_violations` | array | `[{constraint_id, severity, description}]` |

**Producer**: Optimization Engine
**Consumers**: Planning Workbench, Control Room, AI Advisor, Audit Service

#### PlanApproved

Emitted when a site manager approves a workforce plan.

| Field | Type | Description |
|-------|------|-------------|
| `plan_id` | UUID | Plan identifier |
| `plan_version` | int | Version approved |
| `approved_by` | UUID | User ID of approver |
| `approval_notes` | string | Optional notes |
| `effective_from` | ISO-8601 | When plan takes effect |

**Producer**: Planning Workbench
**Consumers**: Notification Service (notify assigned employees), Multi-Site Coordinator, Audit Service, WMS outbound integration

#### PlanRejected

| Field | Type | Description |
|-------|------|-------------|
| `plan_id` | UUID | Plan identifier |
| `plan_version` | int | Version rejected |
| `rejected_by` | UUID | User ID |
| `rejection_reason` | string | Why the plan was rejected |

**Producer**: Planning Workbench
**Consumers**: AI Advisor (learn from rejection patterns), Audit Service

#### ShiftAssigned

Emitted for each individual employee shift assignment within a plan.

| Field | Type | Description |
|-------|------|-------------|
| `assignment_id` | UUID | Assignment identifier |
| `plan_id` | UUID | Parent plan |
| `employee_id` | UUID | Assigned employee |
| `site_id` | UUID | Work site |
| `zone_id` | UUID | Specific zone |
| `process_path` | string | Assigned process |
| `shift_start` | ISO-8601 | Shift start time |
| `shift_end` | ISO-8601 | Shift end time |
| `assignment_type` | enum | REGULAR, OVERTIME, AGENCY, CROSS_SITE |
| `assigned_by` | enum | OPTIMIZER, PLANNER_MANUAL, SYSTEM |

**Producer**: Optimization Engine or Planning Workbench (for manual assignments)
**Consumers**: Notification Service, Control Room, Workforce Registry (assignment history), Audit Service

### 3.4 Workforce Domain

#### EmployeeUnavailable

Emitted when an employee becomes unavailable (leave, sickness, resignation).

| Field | Type | Description |
|-------|------|-------------|
| `employee_id` | UUID | Employee |
| `unavailable_from` | ISO-8601 | Start of unavailability |
| `unavailable_to` | ISO-8601 | End of unavailability (null if indefinite) |
| `reason` | enum | LEAVE_ANNUAL, LEAVE_SICK, LEAVE_PARENTAL, TERMINATED, SUSPENDED, OTHER |
| `source` | enum | HRIS, SELF_SERVICE, MANAGER, SYSTEM |
| `impacts_active_plan` | boolean | Whether this affects any currently active plan |
| `affected_plan_ids` | array[UUID] | Plans that lose this employee |

**Producer**: Workforce Registry
**Consumers**: Optimization Engine (trigger replan), Control Room (alert), AI Advisor, Planning Workbench

#### SkillProfileUpdated

Emitted when an employee's skill profile changes.

| Field | Type | Description |
|-------|------|-------------|
| `employee_id` | UUID | Employee |
| `changes` | array | `[{skill_id, previous_level, new_level, certified, expiry}]` |
| `update_source` | enum | TRAINING_COMPLETION, MANAGER_ASSESSMENT, CERTIFICATION_RENEWAL, CERTIFICATION_EXPIRY |

**Producer**: Workforce Registry
**Consumers**: Optimization Engine (skill availability changed), AI Advisor (training recommendations)

### 3.5 Site Domain

#### SiteCapacityChanged

Emitted when a site's operational capacity changes (e.g., new zone opens, dock closure, equipment breakdown).

| Field | Type | Description |
|-------|------|-------------|
| `site_id` | UUID | Affected site |
| `change_type` | enum | ZONE_ADDED, ZONE_CLOSED, EQUIPMENT_DOWN, OPERATING_HOURS_CHANGED, CAPACITY_LIMIT_CHANGED |
| `zone_id` | UUID | Specific zone (if applicable) |
| `previous_capacity` | JSONB | Previous state |
| `new_capacity` | JSONB | New state |
| `effective_from` | ISO-8601 | When the change takes effect |
| `effective_to` | ISO-8601 | When the change ends (null if permanent) |

**Producer**: Site Configuration Store or IoT integration
**Consumers**: Workload Computation Engine (capacity constraints), Optimization Engine (replan), Control Room, Multi-Site Coordinator

### 3.6 Integration Domain

#### IntegrationSyncCompleted

| Field | Type | Description |
|-------|------|-------------|
| `connector_id` | UUID | Connector that synced |
| `system_type` | string | ERP, WMS, HRIS, etc. |
| `sync_type` | enum | FULL, DELTA, MANUAL |
| `records_processed` | int | Total records |
| `records_created` | int | New records |
| `records_updated` | int | Updated records |
| `records_failed` | int | Failed records |
| `duration_ms` | int | Sync duration |
| `next_scheduled_sync` | ISO-8601 | Next planned sync |

#### IntegrationSyncFailed

| Field | Type | Description |
|-------|------|-------------|
| `connector_id` | UUID | Connector that failed |
| `error_type` | enum | AUTHENTICATION, TIMEOUT, RATE_LIMIT, SCHEMA_MISMATCH, SYSTEM_ERROR |
| `error_message` | string | Error details |
| `retry_count` | int | Retries attempted |
| `circuit_breaker_state` | enum | CLOSED, OPEN, HALF_OPEN |
| `next_retry_at` | ISO-8601 | When next retry is scheduled (null if circuit open) |

---

## 4. Event Sourcing for Plan Versioning

Workforce plans are the most critical data in AstraPlanner. Every change to a plan is captured as an event, enabling full reconstruction of plan state at any point in time.

### 4.1 Plan Event Stream

Each plan has a dedicated event stream identified by `plan_id`. The stream contains an ordered sequence of events that, when replayed, produce the current plan state.

```
Plan Event Stream: plan-{plan_id}
  |
  +-- [0] PlanCreated           { plan_id, site_id, period, parameters }
  +-- [1] WorkloadAttached      { workload_plan_id, total_hours }
  +-- [2] SolverStarted         { solver_type, time_budget }
  +-- [3] SolverCompleted       { runtime_ms, gap_pct, status }
  +-- [4] ShiftAssigned         { employee_id, shift, process }
  +-- [5] ShiftAssigned         { employee_id, shift, process }
  +-- [6] ... (hundreds of assignment events)
  +-- [n] PlanGenerationComplete { total_assignments, total_cost }
  +-- [n+1] PlanSubmittedForApproval { submitted_by }
  +-- [n+2] AssignmentOverridden { assignment_id, old_employee, new_employee, reason }
  +-- [n+3] PlanRevalidated     { violations_found }
  +-- [n+4] PlanApproved        { approved_by, notes }
  +-- [n+5] PlanPublished       { published_by, effective_from }
```

### 4.2 State Reconstruction

The plan aggregate is reconstructed by replaying events:

```
function rebuildPlanState(events: PlanEvent[]): PlanState {
  let state = initialPlanState()
  for (const event of events) {
    state = applyEvent(state, event)
  }
  return state
}
```

For performance, **snapshots** are taken periodically. A snapshot captures the full plan state at a specific event sequence number. Reconstruction then starts from the latest snapshot and replays only subsequent events.

Snapshot strategy:
- Snapshot after every 100 events
- Snapshot after `PlanApproved` (common query point)
- Snapshots stored in the document store (PostgreSQL JSONB)

### 4.3 Time Travel

Event sourcing enables "time travel" queries:

- **"What did the plan look like before the manager's edits?"** -- Replay events up to the event before `AssignmentOverridden`
- **"Show me the plan as it was when originally generated"** -- Replay up to `PlanGenerationComplete`
- **"Who changed Maria's assignment and when?"** -- Query events filtered by `employee_id = Maria's ID`

### 4.4 Audit Benefits

Event sourcing provides a complete, immutable audit trail automatically. Every plan state change is traceable to:
- Who made the change (`actor`)
- When (`timestamp`)
- What changed (event payload with before/after embedded)
- Why (causal chain via `correlation_id` and `causation_id`)
- What triggered it (system event, user action, or integration event)

---

## 5. CQRS Pattern

AstraPlanner uses Command Query Responsibility Segregation (CQRS) for the planning domain, where write patterns and read patterns are fundamentally different.

### 5.1 Write Side (Command)

Commands modify plan state and produce events:

```
Commands (write path):
  CreatePlan        --> PlanCreated event
  AssignShift       --> ShiftAssigned event
  OverrideAssignment --> AssignmentOverridden event
  ApprovePlan       --> PlanApproved event
  RejectPlan        --> PlanRejected event

Write Store: Event Store (append-only, PostgreSQL)
  - Table: plan_events (plan_id, sequence_num, event_type, payload, timestamp)
  - Indexed by: (plan_id, sequence_num)
  - Partitioned by: tenant_id
```

Write operations are validated against the current aggregate state (loaded from event replay or snapshot) before the event is appended.

### 5.2 Read Side (Query)

Read models are projections of the event stream, optimized for specific query patterns:

| Read Model | Optimized For | Storage | Updated By |
|------------|--------------|---------|------------|
| `plan_timeline_view` | Gantt chart rendering (workbench) | PostgreSQL (denormalized) | `ShiftAssigned`, `AssignmentOverridden`, `ShiftRemoved` events |
| `plan_summary` | Dashboard KPIs (control room) | Redis (cached) | `PlanGenerated`, `PlanApproved` events |
| `employee_schedule` | Individual employee's upcoming shifts | PostgreSQL (indexed by employee) | `ShiftAssigned`, `ShiftRemoved` events |
| `site_headcount` | Headcount by site/zone/hour | TimescaleDB (time-bucketed) | `ShiftAssigned`, `ShiftRemoved`, `EmployeeUnavailable` events |
| `plan_cost_projection` | Labor cost breakdown | PostgreSQL (materialized view) | `ShiftAssigned` events + cost lookups |
| `plan_version_diff` | Side-by-side plan comparison | PostgreSQL (per-version snapshots) | `PlanGenerationComplete`, `PlanApproved` events |

### 5.3 Projection Update

Read models are updated asynchronously by event consumers:

```
Event Store ---> Kafka topic: domain.plan.* ---> Projection Workers ---> Read Model DBs
```

**Consistency**: read models are eventually consistent with the event store. Typical lag: < 500ms. The UI shows a "refreshing" indicator during the projection lag window after a write operation.

**Rebuild**: if a read model becomes corrupted or a new projection is added, it can be rebuilt by replaying the entire event stream for the affected plans. This is a batch operation that runs during off-peak hours.

---

## 6. Saga Patterns

Multi-step workflows that span multiple modules are coordinated using the saga pattern. AstraPlanner uses **orchestration-based sagas** with a central saga coordinator.

### 6.1 Plan Generation Saga

Triggered when new demand data arrives and a replan is needed.

```
Saga: PlanGenerationSaga
Step 1: [Workload Engine]  Compute workload from updated demand
           |
           +-- Success --> Step 2
           +-- Failure --> Compensate: mark demand as "computation_failed", alert

Step 2: [Workforce Registry]  Lock employee availability snapshot
           |
           +-- Success --> Step 3
           +-- Failure --> Compensate: release workload computation, retry

Step 3: [Optimization Engine]  Solve optimization problem
           |
           +-- Success --> Step 4
           +-- Failure (infeasible) --> Step 3a
           +-- Failure (timeout) --> Compensate: release locks, retry with extended time budget

Step 3a: [AI Advisor]  Analyze infeasibility, generate recommendations
           |
           +-- Notify planner with infeasibility report
           +-- End saga (manual intervention required)

Step 4: [Planning Workbench]  Create draft plan, notify planner
           |
           +-- PlanGenerated event emitted
           +-- End saga (plan awaits human review)
```

### 6.2 Plan Approval Saga

Triggered when a planner submits a plan for approval.

```
Saga: PlanApprovalSaga
Step 1: [Planning Workbench]  Validate plan (final constraint check)
           |
           +-- Valid --> Step 2
           +-- Invalid --> Reject with violations, End saga

Step 2: [Compliance Service]  Run compliance checks
           |
           +-- Pass --> Step 3
           +-- Fail --> Block approval, list violations, End saga

Step 3: [Notification Service]  Notify approver(s)
           |
           +-- Approver approves --> Step 4
           +-- Approver rejects --> PlanRejected event, notify planner, End saga

Step 4: [Multi-Site Coordinator]  Update cross-site allocations (if applicable)
           |
           +-- Success --> Step 5
           +-- Failure --> Compensate: revert cross-site changes, alert

Step 5: [Integration Gateway]  Push plan to WMS (labor allocation targets)
           |
           +-- Success --> Step 6
           +-- Failure --> Compensate: alert (plan is approved internally regardless)

Step 6: [Notification Service]  Notify all assigned employees
           |
           +-- PlanPublished event
           +-- End saga
```

### 6.3 Saga State Machine

Each saga instance is persisted as a state machine:

```
SagaInstance {
  saga_id:           UUID
  saga_type:         string    // e.g., "PlanGenerationSaga"
  tenant_id:         UUID
  correlation_id:    UUID
  current_step:      int
  status:            enum (RUNNING, COMPLETED, FAILED, COMPENSATING)
  created_at:        ISO-8601
  updated_at:        ISO-8601
  step_results:      [{step, status, started_at, completed_at, output, error}]
  compensation_log:  [{step, action, result}]
}
```

Saga instances are stored in PostgreSQL. A saga watchdog process monitors for stuck sagas (no progress in configurable timeout, default: 10 minutes) and triggers alerts.

---

## 7. Event Schema Management

### 7.1 Schema Registry

All event schemas are registered in a schema registry (Confluent Schema Registry or AWS Glue Schema Registry). Each event type has a registered schema with:

- Schema ID (numeric, auto-assigned)
- Event type (subject name)
- Version number
- Schema definition (Avro or JSON Schema)
- Compatibility mode

### 7.2 Schema Versioning

Events follow **semantic versioning** for schemas:

| Change Type | Version Bump | Compatibility | Example |
|-------------|-------------|---------------|---------|
| Add optional field | Minor (v1 -> v2) | BACKWARD compatible | Adding `delta_pct` to `WorkloadComputed` |
| Add required field with default | Minor | BACKWARD compatible | Adding `severity` with default "MEDIUM" |
| Remove field | Major (v1 -> v2) | BREAKING | Removing `legacy_field` |
| Rename field | Major | BREAKING | Renaming `qty` to `quantity` |
| Change field type | Major | BREAKING | Changing `quantity` from int to decimal |

**Compatibility mode**: BACKWARD (default). New consumers can read old events. Old consumers can continue reading without updating (new optional fields are ignored).

### 7.3 Schema Evolution Example

```
// DemandForecastUpdated v1
{
  "site_id": "uuid",
  "process_path": "string",
  "period_start": "datetime",
  "period_end": "datetime",
  "quantity": "decimal",
  "source_system": "string"
}

// DemandForecastUpdated v2 (backward compatible)
{
  "site_id": "uuid",
  "process_path": "string",
  "period_start": "datetime",
  "period_end": "datetime",
  "quantity": "decimal",
  "source_system": "string",
  "confidence": "float",       // NEW (optional, default: 1.0)
  "version": "int",            // NEW (optional, default: 1)
  "delta_pct": "float"         // NEW (optional, default: null)
}
```

Consumers running against v1 schema continue working when they receive v2 events (extra fields are ignored). New consumers can read both v1 and v2 events (missing optional fields use defaults).

---

## 8. Dead Letter Queue Handling

### 8.1 When Events Go to DLQ

An event is routed to the dead-letter topic when:

1. **Deserialization failure**: event payload does not match registered schema
2. **Processing failure after retries**: consumer fails to process after N retries (default: 3)
3. **Poison pill**: event causes consumer crash (detected by consumer restart without offset advance)
4. **Business rule rejection**: event references a non-existent entity (e.g., unknown `site_id`)

### 8.2 DLQ Topic Structure

```
deadletter.{original_topic_name}
```

Each DLQ message includes:
- Original event (unmodified)
- Error metadata: error type, error message, stack trace, retry count, timestamp of each attempt
- Original topic and partition/offset

### 8.3 DLQ Processing

```
DLQ Monitor (background service)
  |
  +-- Periodically scans DLQ topics
  +-- Classifies entries:
  |     +-- Transient (retry-eligible): re-queued to original topic after cooldown
  |     +-- Data issue: flagged for manual review in Integration Dashboard
  |     +-- Schema issue: flagged for engineering review
  |     +-- Poison pill: quarantined, alert sent
  |
  +-- DLQ dashboard in Control Room:
        +-- Total entries by topic
        +-- Age of oldest entry
        +-- Error type distribution
        +-- Replay/discard actions
```

### 8.4 DLQ SLA

| Metric | Target |
|--------|--------|
| DLQ entry alert | < 5 minutes after first entry |
| Transient retry | Within 15 minutes |
| Manual review (data issue) | Within 4 hours (business hours) |
| Schema fix (engineering) | Within 24 hours |
| DLQ drain target | < 100 entries across all topics |

---

## 9. Event Replay

### 9.1 Use Cases for Replay

| Use Case | Scope | Trigger |
|----------|-------|---------|
| Read model rebuild | Specific projection, specific tenant | Manual (after bug fix or new projection deployment) |
| Audit investigation | Specific plan or employee | On-demand query |
| Debugging | Specific event sequence | Developer request |
| Disaster recovery | All events for a tenant | DR failover procedure |
| Testing | Subset of production events | QA request (anonymized) |

### 9.2 Replay Mechanism

Events are retained indefinitely in the Kafka domain topics (infinite retention). Replay is performed by:

1. Creating a new consumer group with a specific group ID (e.g., `replay-projection-x-20260320`)
2. Seeking to the desired offset (beginning, specific timestamp, or specific event ID)
3. Consuming events through the target processor
4. Monitoring progress via consumer lag metrics
5. Decommissioning the replay consumer group after completion

### 9.3 Replay Safeguards

- **Idempotency**: all event consumers are idempotent. Replaying an event that was already processed produces no additional effect (enforced via `event_id` deduplication)
- **Side-effect suppression**: during replay, side effects (notifications, outbound integrations) are suppressed via a `replay_mode` flag in the consumer context
- **Rate limiting**: replay consumers run at a configurable rate (default: 10,000 events/sec) to avoid overwhelming downstream systems
- **Isolation**: replay writes to a separate read model instance that is swapped in atomically after replay completes (blue-green projection)

---

## 10. Concrete Event Flow Examples

### 10.1 New Demand Forecast Triggers Replan

This is the most common end-to-end flow in AstraPlanner.

```
Time   Event                              Producer                Consumer(s)
──────────────────────────────────────────────────────────────────────────────
T+0s   ERP publishes new forecast          SAP S/4HANA             Integration Gateway
       via OData API

T+2s   IntegrationSyncCompleted            Integration Gateway     (monitoring)
       {connector: "sap-erp-prod",
        records: 1200, created: 45,
        updated: 1155}

T+3s   DemandForecastUpdated              Demand Ingestion Svc    Workload Engine,
       {site_id: "DFW-04",                                        AI Advisor,
        process: "PICK.EACH.ZONE-A",                               Control Room
        prev_qty: 12000, new_qty: 15200,
        delta_pct: +26.7%}

T+3s   DemandAnomalyDetected              Demand Ingestion Svc    AI Advisor,
       {site_id: "DFW-04",                                        Control Room
        anomaly_type: SPIKE,
        z_score: 2.8, severity: MEDIUM}

T+5s   WorkloadComputed                   Workload Engine         Optimization Engine,
       {site_id: "DFW-04",                                        Control Room
        total_hours: 847 (was 672),
        delta_pct: +26.0%}

T+6s   PlanGenerationSaga started         Saga Coordinator        (internal)
       {saga_type: "AutoReplan",
        trigger: "workload_change > 10%"}

T+8s   [Solver starts]                    Optimization Engine     (internal)

T+35s  PlanGenerated                      Optimization Engine     Planning Workbench,
       {plan_id: "...", version: 7,                                Control Room,
        assignments: 142,                                          AI Advisor,
        unmet_hours: 12.5,                                         Audit Service
        cost: $48,200}

T+35s  ShiftAssigned (x142)               Optimization Engine     Notification Svc,
       (one event per assignment)                                  Control Room,
                                                                   Workforce Registry

T+36s  InsightGenerated                   AI Advisor              Control Room,
       {type: CAPACITY_ALERT,                                      Planning Workbench
        message: "DFW-04 pick will be
        3 FTEs short on Tuesday AM.
        Recommend: approve 2 OT
        extensions + 1 agency temp."}

T+37s  AlertCreated                       Control Room            Notification Service
       {severity: WARNING,
        site: "DFW-04",
        message: "Revised plan ready
        for review. 12.5 hrs unmet."}

T+37s  [Push notification sent]           Notification Service    Site Manager (phone)
       [Email sent]                                               Planner (inbox)
```

**Total elapsed time**: ~37 seconds from ERP forecast publication to manager notification.

### 10.2 Employee Calls in Sick Triggers Intra-Day Replan

```
Time   Event                              Producer                Consumer(s)
──────────────────────────────────────────────────────────────────────────────
T+0s   Manager records absence             Time & Attendance       Workforce Registry
       in attendance system

T+5s   EmployeeUnavailable                Workforce Registry      Optimization Engine,
       {employee_id: "E-4821",                                     Control Room,
        reason: LEAVE_SICK,                                        Planning Workbench
        from: "2026-03-20T06:00",
        to: "2026-03-20T18:00",
        impacts_active_plan: true,
        affected_plans: ["P-9912"]}

T+6s   [Auto-replan triggered]            Optimization Engine     (internal)
       Only re-solves affected shifts
       (incremental, not full replan)

T+18s  ShiftAssigned                      Optimization Engine     Notification Svc,
       {employee_id: "E-5103",                                     Control Room
        (reassignment from pack to pick
         to cover gap)}

T+18s  InsightGenerated                   AI Advisor              Control Room
       {message: "E-5103 (pack)
        reassigned to pick to cover
        E-4821 sick absence. Pack
        coverage adequate with
        remaining staff."}

T+19s  [SMS sent to E-5103]               Notification Service    Employee E-5103
       "Your shift assignment for today
        has been updated. Please check
        AstraPlanner for details."
```

**Total elapsed time**: ~19 seconds from absence recording to employee notification.

---

## 11. Event Summary Table

| Event | Producer | Consumers | Payload Summary | Latency SLA |
|-------|----------|-----------|-----------------|-------------|
| `DemandForecastUpdated` | Demand Ingestion Service | Workload Engine, AI Advisor, Control Room | Site, process, quantity change, confidence | < 5s from ingestion |
| `DemandAnomalyDetected` | Demand Ingestion Service | AI Advisor, Control Room | Site, anomaly type, z-score, severity | < 5s from ingestion |
| `WorkloadComputed` | Workload Computation Engine | Optimization Engine, Scenario Sim, Control Room | Site, period, total hours, process breakdown | < 10s from demand event |
| `PlanGenerated` | Optimization Engine | Workbench, Control Room, AI Advisor, Audit | Plan ID, cost, assignments count, gap | < 60s from workload event |
| `PlanApproved` | Planning Workbench | Notification Svc, Multi-Site, Audit, Integration GW | Plan ID, approver, effective date | < 2s from approval click |
| `PlanRejected` | Planning Workbench | AI Advisor, Audit | Plan ID, rejector, reason | < 2s from rejection click |
| `ShiftAssigned` | Optimization Engine / Workbench | Notification Svc, Control Room, Workforce Registry, Audit | Employee, site, zone, process, shift times | < 1s from plan generation |
| `EmployeeUnavailable` | Workforce Registry | Optimization Engine, Control Room, Workbench | Employee, dates, reason, affected plans | < 15s from source event |
| `SkillProfileUpdated` | Workforce Registry | Optimization Engine, AI Advisor | Employee, skill changes, source | < 5s from source event |
| `SiteCapacityChanged` | Site Config / IoT | Workload Engine, Optimization Engine, Control Room | Site, change type, old/new capacity | < 30s from source event |
| `IntegrationSyncCompleted` | Integration Gateway | Monitoring | Connector, records processed, duration | < 5s from sync completion |
| `IntegrationSyncFailed` | Integration Gateway | Alert system, Monitoring | Connector, error type, circuit state | < 5s from failure |
| `ScenarioCompleted` | Scenario Simulator | Planning Workbench | Scenario ID, result summary | < 5s from simulation end |
| `InsightGenerated` | AI Advisor | Control Room, Workbench | Insight type, severity, message | < 60s from triggering event |
| `CrossSiteTransferRequested` | Multi-Site Coordinator | Workbench, Notification Svc | Employee, from-site, to-site, dates | < 5s from recommendation |
| `ComplianceViolationDetected` | Audit & Compliance Service | Control Room, Workbench | Violation type, regulation, employee/plan | < 5s from detection |

---

## 12. Observability

### 12.1 Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `events.produced.total` (by type) | Total events produced | Spike > 3x normal rate |
| `events.consumed.total` (by type, consumer) | Total events consumed | N/A |
| `events.consumer.lag` (by group) | Consumer group lag | > 10,000 events or > 60 seconds |
| `events.processing.duration_ms` (by type) | Time to process an event | P99 > 5 seconds |
| `events.dlq.depth` (by topic) | Dead-letter queue depth | > 0 (any DLQ entry triggers alert) |
| `events.saga.duration_ms` (by type) | Saga completion time | P99 > 5 minutes |
| `events.saga.stuck` | Sagas with no progress > timeout | > 0 |

### 12.2 Tracing

Every event carries an OpenTelemetry `trace_id` in its metadata. This enables end-to-end distributed tracing from the initial trigger (e.g., ERP API call) through all intermediate events and service calls to the final outcome (e.g., notification delivery).

Trace visualization in Jaeger/Grafana Tempo shows the full event cascade with timing at each stage.

### 12.3 Event Explorer (Developer Tool)

An internal developer tool for querying and visualizing event streams:

- Search events by: type, tenant, site, correlation_id, time range, payload content
- Visualize event causation graph (which event caused which)
- Replay individual events or event sequences to a test consumer
- Compare event volumes across time periods (detect anomalies)
- Export event sequences for debugging or test fixtures
