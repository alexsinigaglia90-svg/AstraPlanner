# Integration Architecture

This document specifies how AstraPlanner integrates with external enterprise systems. It covers integration patterns, per-system details, the abstraction layer design, error handling, and data freshness SLAs.

---

## 1. Integration Principles

1. **AstraPlanner is not a system of record.** It consumes master data from authoritative sources (HRIS owns employees, ERP owns financials, WMS owns inventory and tasks). AstraPlanner is authoritative only for workforce plans, skill assessments, and optimization outputs.

2. **Integrations are pluggable.** Every external system connects through the Integration Gateway via a standardized connector interface. Swapping ERP vendors does not require changes to the Intelligence or Interaction layers.

3. **Bi-directional where necessary, uni-directional by default.** Most integrations are inbound (AstraPlanner consumes data). Outbound integrations exist where AstraPlanner's outputs drive operational execution (e.g., pushing labor targets to WMS, sending approved plans to payroll).

4. **Eventual consistency is acceptable.** AstraPlanner tolerates short delays in data synchronization (seconds for streaming, minutes for batch). The system is designed for staleness-aware computation -- every data point carries a `last_synced_at` timestamp.

5. **Fail open for reads, fail safe for writes.** If an inbound integration is temporarily unavailable, AstraPlanner continues operating on the most recently synced data. Outbound writes use at-least-once delivery with idempotency keys.

---

## 2. Integration Patterns

### 2.1 REST API (Synchronous)

Used for on-demand data retrieval and real-time lookups.

```
AstraPlanner                          External System
     |                                       |
     |  GET /api/v1/employees?since=...      |
     |-------------------------------------->|
     |                                       |
     |  200 OK (JSON payload)                |
     |<--------------------------------------|
     |                                       |
```

**Characteristics**:
- Request/response, synchronous
- Authentication: OAuth 2.0 client credentials or API key
- Rate limiting: respects external system limits, configurable per connector
- Timeout: 30 seconds default, configurable
- Pagination: cursor-based or offset-based (adapter handles both)

**Used for**: HRIS employee lookups, ERP budget queries, on-demand data refreshes.

### 2.2 Webhooks (Event-Driven Push)

Used when external systems push change notifications to AstraPlanner.

```
External System                      AstraPlanner
     |                                       |
     |  POST /webhooks/{connector_id}/events |
     |-------------------------------------->|
     |                                       |
     |  202 Accepted                         |
     |<--------------------------------------|
     |                                       |
     |  (async processing)                   |
     |                                       |
```

**Characteristics**:
- Inbound: external system calls AstraPlanner's webhook endpoint
- Signature verification: HMAC-SHA256 on request body with shared secret
- Idempotency: deduplication via `X-Event-ID` header (stored in Redis, 24h TTL)
- Response: immediate 202 Accepted; processing is asynchronous
- Retry expectation: AstraPlanner publishes a retry-capable endpoint; if AstraPlanner is down, the external system is expected to retry (most enterprise systems support this)

**Used for**: HRIS change notifications (new hire, termination, leave request), WMS order status changes.

### 2.3 File-Based (SFTP / S3)

Used for batch data exchange, especially with legacy systems.

```
External System --> SFTP/S3 Landing Zone --> AstraPlanner File Watcher
                                                  |
                                             Parse + Validate
                                                  |
                                             Load into DB
                                                  |
                                             Archive original file
```

**Characteristics**:
- Inbound: AstraPlanner monitors SFTP directories or S3 prefixes for new files
- File formats: CSV, fixed-width, Excel (.xlsx), XML, EDI (EDIFACT for some logistics systems)
- File naming convention: `{system}_{data_type}_{date}_{sequence}.{ext}` (e.g., `sap_demand_20260320_001.csv`)
- Processing: files are parsed, validated row-by-row, and loaded; invalid rows are logged to a rejection file
- Archiving: processed files are moved to an archive directory with processing metadata
- Polling frequency: configurable per connector (default: every 5 minutes for SFTP, event-driven for S3)

**Used for**: ERP demand forecast files, payroll export/import, bulk employee data loads.

### 2.4 Streaming (Kafka / EventBridge)

Used for high-volume, real-time data feeds.

```
External System --> Kafka Topic (shared or dedicated) --> AstraPlanner Consumer
                                                              |
                                                         Deserialize (Avro/JSON)
                                                              |
                                                         Process + Store
```

**Characteristics**:
- Consumer group-based processing with exactly-once semantics (idempotent consumer)
- Schema registry (Confluent or AWS Glue) for schema evolution
- Partition strategy: by `site_id` for locality-aware processing
- Backpressure: consumer lag monitoring with auto-scaling triggers
- Replay: consumers can rewind to a specific offset for reprocessing

**Used for**: WMS real-time scan events, IoT sensor telemetry, real-time order flow.

---

## 3. System-Specific Integration Details

### 3.1 ERP Integration (SAP, Oracle, NetSuite)

**Purpose**: Demand forecasts, cost center structures, budget data, financial actuals.

#### SAP S/4HANA

| Aspect | Detail |
|--------|--------|
| **Protocol** | OData v4 REST API (SAP API Business Hub) + IDoc for legacy |
| **Authentication** | OAuth 2.0 via SAP BTP (Business Technology Platform) |
| **Inbound data** | Demand forecasts (APO/IBP), cost center hierarchy, GL actuals |
| **Outbound data** | Planned labor hours by cost center (posted as plan values) |
| **Sync frequency** | Demand: hourly poll or event-driven via SAP Event Mesh; Financials: daily batch |
| **Key API endpoints** | `/sap/opu/odata4/sap/api_costcenter/` , `/sap/opu/odata4/sap/api_plannedorder/` |
| **Field mapping** | SAP Material -> AstraPlanner Process Path (via configurable mapping table) |
| **Considerations** | SAP rate limits vary by tenant; typical: 1000 requests/min. Use delta queries (`$filter=LastChangedAt gt ...`) to minimize payload. |

#### Oracle ERP Cloud

| Aspect | Detail |
|--------|--------|
| **Protocol** | REST API (Oracle Fusion REST) + FBDI (File-Based Data Import) for bulk |
| **Authentication** | OAuth 2.0 or Basic Auth (per Oracle Cloud setup) |
| **Inbound data** | Demand forecasts (from Oracle Planning Cloud), budget structures |
| **Outbound data** | Labor plan summaries (via FBDI upload) |
| **Sync frequency** | Batch daily for financials; hourly for demand |
| **Considerations** | Oracle FBDI requires specific CSV formats with control files; the adapter generates these automatically. |

#### NetSuite

| Aspect | Detail |
|--------|--------|
| **Protocol** | SuiteTalk REST API (v2021.2+) or RESTlet for custom endpoints |
| **Authentication** | Token-Based Authentication (TBA) with OAuth 1.0 |
| **Inbound data** | Sales orders (as demand proxy), item fulfillment records |
| **Outbound data** | Labor cost journal entries |
| **Sync frequency** | Demand: every 30 min via saved search API; Financials: daily |
| **Considerations** | NetSuite has a governance limit (concurrent requests). Adapter uses SuiteQL for efficient batch queries. |

### 3.2 WMS Integration (Manhattan, Blue Yonder, Korber)

**Purpose**: Real-time throughput data, order volumes, task completion rates, labor productivity actuals.

#### Manhattan WMOS / Active

| Aspect | Detail |
|--------|--------|
| **Protocol** | REST API + Kafka streaming (Manhattan Active platform) |
| **Authentication** | OAuth 2.0 (Manhattan Identity Service) |
| **Inbound data (batch)** | Order backlog, shipment schedules, wave plans |
| **Inbound data (streaming)** | Task start/complete events, scan events, pick confirmations |
| **Outbound data** | Labor allocation targets by process area and time window |
| **Sync frequency** | Batch: every 15 min; Streaming: real-time |
| **Key events consumed** | `TASK_STARTED`, `TASK_COMPLETED`, `WAVE_RELEASED`, `ORDER_ALLOCATED` |
| **Throughput** | High-volume sites produce 5K-50K task events/hour |

#### Blue Yonder (JDA) WMS

| Aspect | Detail |
|--------|--------|
| **Protocol** | REST API (BY Luminate Platform) + flat file export (legacy) |
| **Authentication** | OAuth 2.0 via Luminate |
| **Inbound data** | Order volumes, labor management module productivity data |
| **Outbound data** | Planned headcount by area |
| **Sync frequency** | API: every 15 min; File: hourly |
| **Considerations** | Legacy JDA installations may only support flat file (CSV/XML) via SFTP. Adapter supports both modes. |

#### Korber (HighJump)

| Aspect | Detail |
|--------|--------|
| **Protocol** | SOAP/XML API (legacy) + REST API (modern) |
| **Authentication** | WS-Security (SOAP) or OAuth 2.0 (REST) |
| **Inbound data** | Task completion, inventory movement events |
| **Sync frequency** | Polling every 10 min (SOAP) or webhook (REST) |
| **Considerations** | Korber installations vary significantly in API availability. Adapter includes a fallback to database-direct read via JDBC for on-premise deployments. |

### 3.3 TMS Integration

**Purpose**: Route planning data, delivery schedules, driver requirements.

| Aspect | Detail |
|--------|--------|
| **Systems** | Oracle Transportation Management (OTM), BluJay TMS, MercuryGate |
| **Protocol** | REST API, XML over SFTP (EDI 204/990) |
| **Inbound data** | Delivery schedules (ETAs), route manifests, required driver count by time window, dock appointment schedules |
| **Outbound data** | Dock labor plan (loaders/unloaders by appointment window) |
| **Sync frequency** | Delivery schedules: every 30 min + event-driven on schedule change; Dock appointments: real-time |
| **Key data mapping** | TMS shipment -> AstraPlanner inbound/outbound demand; TMS dock appointment -> AstraPlanner shift demand for dock processes |

### 3.4 HRIS Integration (Workday, BambooHR, SAP SuccessFactors)

**Purpose**: Employee master data, leave/absence, contracts, organizational structure.

#### Workday

| Aspect | Detail |
|--------|--------|
| **Protocol** | Workday REST API (v41+) + Workday RaaS (Reports-as-a-Service) |
| **Authentication** | OAuth 2.0 (Workday Integration System User) |
| **Inbound data** | Worker profiles, positions, compensation, time-off plans, organization hierarchy |
| **Outbound data** | Skill assessment results, training recommendations |
| **Sync modes** | Full sync: nightly via RaaS report; Delta sync: Workday Business Process event notifications (webhook) |
| **Key Workday objects** | `Worker`, `Position`, `Time_Off`, `Organization`, `Compensation` |
| **Field mapping example** | Workday `Worker.Employee_ID` -> AstraPlanner `employee.external_id`; Workday `Position.Job_Profile.Name` -> AstraPlanner skill inference |
| **Considerations** | Workday tenant configuration varies; field mapping must be customizable per tenant. RaaS report must be pre-configured in Workday by the customer's Workday admin. |

#### BambooHR

| Aspect | Detail |
|--------|--------|
| **Protocol** | REST API (v1) |
| **Authentication** | API key (per-company) |
| **Inbound data** | Employee directory, time-off requests, custom fields |
| **Sync frequency** | Full sync: nightly; Delta: webhook on employee change (if enabled) |
| **Considerations** | BambooHR API has limited filtering. Full dataset is pulled and diffed locally. Suitable for SMB tenants (< 5,000 employees). |

#### SAP SuccessFactors

| Aspect | Detail |
|--------|--------|
| **Protocol** | OData v2 REST API |
| **Authentication** | OAuth 2.0 SAML bearer assertion |
| **Inbound data** | Employee Central data (personal info, employment, compensation, absence) |
| **Sync modes** | Full: nightly via `PerPerson` / `EmpEmployment` entities; Delta: CDC replication via `PerPerson?$filter=lastModifiedDateTime gt ...` |
| **Considerations** | SuccessFactors entity model is deeply nested. Adapter flattens the hierarchy into AstraPlanner's canonical employee structure. |

### 3.5 Payroll Integration

**Purpose**: Actual labor cost data, overtime actuals, budget variance tracking.

| Aspect | Detail |
|--------|--------|
| **Systems** | ADP Workforce Now, Ceridian Dayforce, SAP Payroll |
| **Protocol** | REST API (ADP, Ceridian) or file-based (SAP Payroll) |
| **Inbound data** | Pay period actuals (regular hours, OT hours, gross cost by employee), labor cost allocations by cost center |
| **Outbound data** | Planned hours and cost center allocations (for pre-payroll validation) |
| **Sync frequency** | Per pay period (weekly or bi-weekly), imported within 24 hours of payroll close |
| **Data mapping** | Payroll cost center -> AstraPlanner site + process; Payroll earnings codes -> AstraPlanner labor types (regular, OT, premium, agency) |
| **Considerations** | Payroll data is highly sensitive (PII + compensation). All payroll data is encrypted at rest and in transit. Access is restricted to the finance admin role. |

### 3.6 IoT / Telemetry Integration

**Purpose**: Real-time operational data from warehouse floor equipment and sensors.

| Data Source | Protocol | Payload | Frequency | Use in AstraPlanner |
|------------|----------|---------|-----------|---------------------|
| RF scanner events | Kafka (from WMS) | Task ID, timestamp, worker ID, location | Per-scan (real-time) | Actual productivity calculation |
| Conveyor throughput | MQTT -> Kafka bridge | Items/minute, belt status | Every 10 sec | Capacity monitoring |
| Dock door sensors | MQTT -> Kafka bridge | Door open/close, trailer present | On change | Inbound/outbound flow tracking |
| Environmental sensors | MQTT -> Kafka bridge | Temperature, humidity | Every 60 sec | Cold-chain compliance |
| Forklift telematics | Vendor API (REST) | Location, speed, battery level, impact events | Every 30 sec | Equipment utilization, safety compliance |
| Badge/turnstile | REST webhook | Employee ID, entry/exit, timestamp | On event | Actual attendance tracking |

**Telemetry Pipeline Architecture**:

```
Sensors/Devices
     |
     v
MQTT Broker (Mosquitto / AWS IoT Core)
     |
     v
Kafka Bridge (protocol translation)
     |
     v
Kafka Topic: telemetry.raw.{site_id}
     |
     +---> Stream Processor (Kafka Streams / Flink)
     |         |
     |         +---> 1-min aggregates --> TimescaleDB
     |         +---> 5-min aggregates --> TimescaleDB
     |         +---> Anomaly detection --> Alert Service
     |
     +---> Cold Storage (S3, Parquet) -- retained 90 days
```

---

## 4. Integration Abstraction Layer

All integrations are mediated by a common abstraction layer that decouples AstraPlanner's core domain from external system specifics.

### 4.1 Connector Interface

Every external system integration implements the `ExternalConnector` interface:

```
interface ExternalConnector {
  // Lifecycle
  initialize(config: ConnectorConfig): Promise<void>
  healthCheck(): Promise<HealthStatus>
  disconnect(): Promise<void>

  // Inbound (pull)
  fetchRecords(query: FetchQuery): AsyncIterable<RawRecord>
  fetchDelta(since: DateTime): AsyncIterable<RawRecord>

  // Inbound (push - for webhook-based connectors)
  handleWebhook(payload: WebhookPayload): Promise<ProcessingResult>

  // Outbound
  pushRecords(records: OutboundRecord[]): Promise<PushResult>

  // Schema
  getFieldMapping(): FieldMapping
  validateMapping(mapping: FieldMapping): ValidationResult
}
```

### 4.2 Adapter Pattern

Each concrete system has an adapter that implements `ExternalConnector`:

```
ExternalConnector (interface)
├── SapS4HanaAdapter
├── OracleErpAdapter
├── NetSuiteAdapter
├── ManhattanWmsAdapter
├── BlueYonderWmsAdapter
├── KorberWmsAdapter
├── WorkdayHrisAdapter
├── BambooHrAdapter
├── SapSuccessFactorsAdapter
├── AdpPayrollAdapter
├── CeridianPayrollAdapter
├── GenericRestAdapter     (configurable for custom REST APIs)
├── GenericSftpAdapter     (configurable for any file-based integration)
└── GenericKafkaAdapter    (configurable for any Kafka-based integration)
```

### 4.3 Field Mapping Engine

Each connector includes a configurable field mapping that translates external system fields to AstraPlanner's canonical model:

```
FieldMapping {
  source_field:     string    // e.g., "Worker.Employee_ID"
  target_field:     string    // e.g., "employee.external_id"
  transform:        enum (DIRECT, UPPERCASE, LOWERCASE, DATE_FORMAT, LOOKUP, CUSTOM)
  transform_config: JSONB     // e.g., {"format": "YYYY-MM-DD"} or {"lookup_table": "department_map"}
  required:         boolean
  default_value:    string | null
}
```

Mappings are configured per connector instance (since the same system type may have different field names across customer deployments) and are validated during the Setup Wizard.

### 4.4 Data Normalization Pipeline

Every inbound record passes through:

1. **Deserialization**: parse raw format (JSON, CSV, XML, Avro) into structured object
2. **Field mapping**: apply configured field mapping to produce canonical fields
3. **Type coercion**: convert string representations to typed values (dates, numbers, enums)
4. **Validation**: check required fields, value ranges, referential integrity
5. **Enrichment**: add computed fields (e.g., `ingested_at`, `source_connector_id`, `data_hash`)
6. **Deduplication**: check `data_hash` against recent records to prevent duplicate processing
7. **Emit**: write to operational DB and publish domain event

---

## 5. Error Handling and Retry Strategies

### 5.1 Error Classification

| Category | Examples | Response |
|----------|---------|----------|
| **Transient** | Network timeout, 503 Service Unavailable, connection reset | Retry with exponential backoff |
| **Rate limit** | 429 Too Many Requests | Pause, respect `Retry-After`, resume |
| **Authentication** | 401 Unauthorized, 403 Forbidden | Alert admin, pause connector, do not retry |
| **Data error** | Invalid field value, missing required field, referential integrity violation | Log to dead-letter queue, continue processing remaining records |
| **Schema error** | Unexpected response format, missing expected fields | Alert, pause connector, require mapping review |
| **System error** | AstraPlanner internal error during processing | Retry (transient) or alert engineering (persistent) |

### 5.2 Retry Configuration

```
RetryPolicy {
  max_retries:          int       // default: 5 for transient, 0 for auth
  initial_delay_ms:     int       // default: 1000
  backoff_multiplier:   float     // default: 2.0
  max_delay_ms:         int       // default: 60000 (1 minute)
  jitter:               boolean   // default: true (adds random 0-25% to delay)
  retry_on:             [int]     // HTTP status codes to retry: [408, 429, 500, 502, 503, 504]
}
```

### 5.3 Circuit Breaker

Each connector has an independent circuit breaker:

| State | Behavior | Transition |
|-------|----------|------------|
| **CLOSED** | Normal operation, requests pass through | -> OPEN when failure count exceeds threshold (default: 5 failures in 60 seconds) |
| **OPEN** | All requests short-circuited (fast fail), queued for later | -> HALF_OPEN after cooldown period (default: 60 seconds) |
| **HALF_OPEN** | Allow one probe request through | -> CLOSED if probe succeeds; -> OPEN if probe fails |

Circuit breaker state is stored in Redis and shared across all gateway instances.

### 5.4 Dead Letter Queue (DLQ)

Records that fail processing after all retries are routed to a dead-letter queue:

```
DeadLetterEntry {
  entry_id:          UUID
  connector_id:      UUID
  original_payload:  JSONB      // the raw record that failed
  error_type:        string     // classification
  error_message:     string     // detailed error
  error_stack:       string     // stack trace (internal errors only)
  retry_count:       int        // how many times retry was attempted
  first_failed_at:   ISO-8601
  last_failed_at:    ISO-8601
  status:            enum (PENDING, REPLAYED, DISCARDED)
  resolution_notes:  string     // admin notes when resolving
}
```

DLQ entries can be:
- **Replayed**: admin fixes the root cause (e.g., updates field mapping) and replays the entry
- **Discarded**: admin determines the record is invalid and should be ignored
- **Bulk replayed**: all entries for a connector are replayed after a systemic fix

DLQ alerts trigger when queue depth exceeds configurable thresholds (default: 100 entries per connector).

---

## 6. Data Freshness SLAs

Data freshness defines the maximum acceptable delay between a change occurring in the source system and that change being queryable in AstraPlanner.

| Integration Type | Data Category | Freshness SLA | Measurement Point | Degradation Response |
|-----------------|---------------|---------------|-------------------|---------------------|
| WMS Streaming | Scan events, task completions | < 5 seconds | Source event timestamp -> AstraPlanner time-series DB write | Dashboard shows "delayed" indicator; telemetry-based KPIs marked as stale |
| WMS Batch | Order backlog, wave plans | < 15 minutes | Source system query time -> AstraPlanner DB write | Workload computation uses last-known-good data with staleness warning |
| HRIS Webhook | Employee changes (hire, term, leave) | < 15 minutes | HRIS event -> AstraPlanner Workforce Registry update | Plan validation warns about potentially stale employee data |
| HRIS Full Sync | Complete employee roster | < 24 hours | Nightly sync completion | Alert if sync missed; block plan approval if data > 48 hours stale |
| ERP Demand | Demand forecasts | < 30 minutes (event) / < 2 hours (batch) | Forecast publication in ERP -> AstraPlanner demand signal | Workload computation uses previous forecast version |
| ERP Financial | Cost center budgets, GL actuals | < 24 hours | GL posting date -> AstraPlanner import | Cost dashboards show "as of" date; no operational impact |
| Payroll | Pay period actuals | < 48 hours after pay period close | Payroll close -> AstraPlanner import | Cost variance reports show data lag indicator |
| TMS | Delivery schedules, dock appts | < 30 minutes | Schedule change in TMS -> AstraPlanner dock demand update | Dock staffing plan uses last-known schedule |
| IoT Telemetry | Sensor readings | < 10 seconds | Sensor reading -> AstraPlanner time-series DB | Dashboard shows "sensor offline" after 60s gap |

### Freshness Monitoring

Each integration connector reports its freshness status:

```
FreshnessStatus {
  connector_id:     UUID
  last_sync_at:     ISO-8601          // when last successful sync completed
  records_synced:   int               // count in last sync
  freshness_sla_ms: int               // configured SLA in milliseconds
  current_lag_ms:   int               // actual lag (now - last_sync_at)
  status:           enum (FRESH, WARNING, STALE, OFFLINE)
  // FRESH: lag < SLA
  // WARNING: SLA < lag < 2x SLA
  // STALE: lag > 2x SLA
  // OFFLINE: no successful sync in > 4x SLA
}
```

Freshness status is displayed on the Control Room integration health dashboard and triggers alerts at WARNING and STALE thresholds.

---

## 7. Security Considerations

### 7.1 Credential Management

- All external system credentials are stored in a secrets manager (HashiCorp Vault or AWS Secrets Manager)
- Credentials are never stored in the application database or configuration files
- OAuth tokens are cached in memory with automatic refresh before expiry
- API keys are rotated on a configurable schedule (default: 90 days) with zero-downtime rotation

### 7.2 Data in Transit

- All REST API calls use TLS 1.2+ (TLS 1.3 preferred)
- SFTP connections use SSH key-based authentication (password auth disabled)
- Kafka connections use SASL/SCRAM + TLS
- Webhook endpoints validate HMAC signatures before processing

### 7.3 Data at Rest

- Payroll and compensation data is encrypted at the field level (AES-256-GCM) in addition to storage-level encryption
- PII fields (names, addresses) are encrypted at rest with tenant-specific keys
- Dead-letter queue entries containing PII are auto-purged after 30 days

### 7.4 Access Control

- Integration configuration requires the `Enterprise Admin` role
- Connector credentials are write-only after creation (cannot be read back via API)
- Audit log records every integration configuration change and credential access

---

## 8. Integration Summary Table

| System | Direction | Protocol | Frequency | Key Data Elements | Freshness SLA | Auth Method |
|--------|-----------|----------|-----------|-------------------|---------------|-------------|
| SAP S/4HANA | In | OData REST | Hourly + event | Demand forecasts, cost centers, GL actuals | 30 min (demand), 24h (financial) | OAuth 2.0 |
| SAP S/4HANA | Out | OData REST | Daily | Planned labor hours by cost center | 24h | OAuth 2.0 |
| Oracle ERP Cloud | In | REST + FBDI | Hourly + daily | Demand forecasts, budgets | 2h (demand), 24h (financial) | OAuth 2.0 |
| Oracle ERP Cloud | Out | FBDI | Daily | Labor plan summaries | 24h | OAuth 2.0 |
| NetSuite | In | REST (SuiteTalk) | 30 min | Sales orders, fulfillment records | 30 min | TBA/OAuth 1.0 |
| NetSuite | Out | REST | Daily | Labor cost journal entries | 24h | TBA/OAuth 1.0 |
| Manhattan WMS | In (batch) | REST | 15 min | Order backlog, wave plans | 15 min | OAuth 2.0 |
| Manhattan WMS | In (stream) | Kafka | Real-time | Task events, scan events | 5 sec | SASL/SCRAM |
| Manhattan WMS | Out | REST | On plan publish | Labor allocation targets | 15 min | OAuth 2.0 |
| Blue Yonder WMS | In | REST + SFTP | 15 min + hourly | Order volumes, productivity data | 15 min | OAuth 2.0 |
| Korber WMS | In | REST / SOAP | 10 min | Task completions, inventory movements | 15 min | OAuth 2.0 / WS-Security |
| Workday | In (delta) | REST webhook | Real-time | Worker changes, time-off events | 15 min | OAuth 2.0 |
| Workday | In (full) | RaaS | Nightly | Full worker dataset | 24h | OAuth 2.0 |
| Workday | Out | REST | Weekly | Skill assessments | 7 days | OAuth 2.0 |
| BambooHR | In | REST | Nightly + webhook | Employee directory, time-off | 24h (full), 15 min (webhook) | API key |
| SAP SuccessFactors | In | OData REST | Nightly + delta | Employee Central data | 24h (full), 15 min (delta) | OAuth 2.0 SAML |
| ADP Workforce Now | In | REST | Per pay period | Pay actuals, hours worked | 48h post-close | OAuth 2.0 |
| Ceridian Dayforce | In | REST | Per pay period | Pay actuals, hours worked | 48h post-close | OAuth 2.0 |
| TMS (OTM / BluJay) | In | REST + SFTP | 30 min + event | Delivery schedules, dock appointments | 30 min | OAuth 2.0 / API key |
| IoT Sensors | In | MQTT -> Kafka | Real-time | Scan rates, equipment status, environment | 10 sec | mTLS / SASL |
| Badge/Turnstile | In | REST webhook | On event | Employee entry/exit events | 5 min | API key + HMAC |
