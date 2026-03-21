# AstraPlanner Scalability Design

This document defines how the AstraPlanner data model scales to support thousands of sites, millions of employees, and billions of time-series records. It covers partitioning, indexing, time-series management, read replicas, materialized views, caching, write throughput optimization, data lifecycle policies, estimated data volumes, and query performance targets.

---

## 1. Scale Targets

AstraPlanner is designed for enterprise logistics operators with the following scale characteristics:

| Dimension | Target Scale | Notes |
|---|---|---|
| Organizations (tenants) | 500+ | Mix of starter (10 sites) to enterprise (5000+ sites) |
| Sites per large org | 5,000 | National/global logistics networks |
| Total sites (platform) | 100,000+ | Across all tenants |
| Employees per large org | 500,000 | Including seasonal/temporary |
| Total employees (platform) | 10,000,000+ | Across all tenants |
| Shift assignments per day (large org) | 500,000 | Employees x sites x processes |
| Demand forecast records per day (large org) | 50,000 | Demand types x sites |
| Concurrent users | 50,000 | Mix of planners, managers, employees |
| Planning horizon | 28 days | Forward-looking window |
| Historical retention | 2 years active, 5 years archived | Compliance-driven |

---

## 2. Partitioning Strategy

### Two-Level Partitioning

High-volume tables use a two-level partitioning scheme:

**Level 1: Hash partition by `organization_id`** — distributes tenant data across partitions, enabling parallel scans and reducing index size per partition.

**Level 2: Range partition by date** — for time-series tables, further partitions by month or week within each hash partition.

### Partition Layout for ShiftAssignment

```sql
-- Level 1: Hash by organization_id (16 partitions)
CREATE TABLE shift_assignment (
    id UUID DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    assignment_date DATE NOT NULL,
    employee_id UUID NOT NULL,
    -- ... other columns
    PRIMARY KEY (id, organization_id, assignment_date)
) PARTITION BY HASH (organization_id);

-- Level 2: Range by assignment_date within each hash partition
CREATE TABLE shift_assignment_h0 PARTITION OF shift_assignment
    FOR VALUES WITH (MODULUS 16, REMAINDER 0)
    PARTITION BY RANGE (assignment_date);

-- Monthly sub-partitions within h0
CREATE TABLE shift_assignment_h0_2026_01 PARTITION OF shift_assignment_h0
    FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE shift_assignment_h0_2026_02 PARTITION OF shift_assignment_h0
    FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE shift_assignment_h0_2026_03 PARTITION OF shift_assignment_h0
    FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
-- ... auto-created by partition management job 3 months ahead
```

### Tables and Partitioning Strategy

| Table | Level 1 Partition | Level 2 Partition | Reasoning |
|---|---|---|---|
| `shift_assignment` | HASH(organization_id) x 16 | RANGE(assignment_date) monthly | Highest volume; queried by org+date |
| `workload_plan` | HASH(organization_id) x 16 | RANGE(plan_date) monthly | High volume; date-range queries |
| `demand_forecast` | HASH(organization_id) x 16 | RANGE(forecast_date) monthly | Time-series data; date-range queries |
| `audit_log` | HASH(organization_id) x 16 | RANGE(created_at) monthly | Append-only; time-range queries |
| `notification` | HASH(organization_id) x 8 | RANGE(created_at) weekly | High volume; short retention |
| `employee` | HASH(organization_id) x 8 | None | Moderate volume; no time dimension |
| `employee_skill` | HASH(organization_id) x 8 | None | Moderate volume; no time dimension |
| `site` | None | None | Low volume (<100K total) |
| `process` | None | None | Low volume (<50K total) |
| `shift_pattern` | None | None | Low volume (<10K total) |
| `labor_rule` | None | None | Low volume (<5K total) |

### Automatic Partition Management

A scheduled job creates future partitions and detaches old ones:

```sql
-- Runs nightly: create partitions 3 months ahead, detach partitions older than retention period
-- Implemented as a pg_cron job or external scheduler

-- Create future partition
DO $$
DECLARE
    partition_date DATE := date_trunc('month', CURRENT_DATE + INTERVAL '3 months');
    partition_name TEXT;
    parent_table TEXT;
BEGIN
    FOR i IN 0..15 LOOP
        parent_table := format('shift_assignment_h%s', i);
        partition_name := format('shift_assignment_h%s_%s',
            i, to_char(partition_date, 'YYYY_MM'));

        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I
             FOR VALUES FROM (%L) TO (%L)',
            partition_name, parent_table,
            partition_date,
            partition_date + INTERVAL '1 month'
        );
    END LOOP;
END $$;
```

---

## 3. Indexing Strategy

### Key Query Patterns and Supporting Indexes

#### Pattern 1: Get all employees for a site

```sql
-- Query: SELECT * FROM employee WHERE organization_id = $1 AND home_site_id = $2 AND status = 'active'
CREATE INDEX idx_employee_org_site_status
    ON employee (organization_id, home_site_id, status)
    WHERE status = 'active';
-- Partial index reduces size by excluding terminated employees
```

#### Pattern 2: Get demand forecast for a site and date range

```sql
-- Query: SELECT * FROM demand_forecast
--   WHERE organization_id = $1 AND site_id = $2
--   AND forecast_date BETWEEN $3 AND $4
CREATE INDEX idx_demand_forecast_org_site_date
    ON demand_forecast (organization_id, site_id, forecast_date);
-- Partition pruning eliminates irrelevant monthly partitions first
```

#### Pattern 3: Get shift assignments for a site for a week

```sql
-- Query: SELECT sa.*, e.first_name, e.last_name, sp.name as shift_name
--   FROM shift_assignment sa
--   JOIN employee e ON sa.employee_id = e.id
--   JOIN shift_pattern sp ON sa.shift_pattern_id = sp.id
--   WHERE sa.organization_id = $1 AND sa.site_id = $2
--   AND sa.assignment_date BETWEEN $3 AND $4
--   AND sa.plan_version_id = $5
CREATE INDEX idx_shift_assignment_org_site_date_version
    ON shift_assignment (organization_id, site_id, assignment_date, plan_version_id);
```

#### Pattern 4: Get employee schedule for a date range

```sql
-- Query: SELECT * FROM shift_assignment
--   WHERE organization_id = $1 AND employee_id = $2
--   AND assignment_date BETWEEN $3 AND $4
CREATE INDEX idx_shift_assignment_org_employee_date
    ON shift_assignment (organization_id, employee_id, assignment_date);
```

#### Pattern 5: Get workload coverage gaps

```sql
-- Query: SELECT * FROM workload_plan
--   WHERE organization_id = $1 AND site_id = $2
--   AND plan_version_id = $3 AND coverage_pct < 95.0
CREATE INDEX idx_workload_plan_org_site_version_coverage
    ON workload_plan (organization_id, site_id, plan_version_id, coverage_pct);
```

#### Pattern 6: Audit log lookup by entity

```sql
-- Query: SELECT * FROM audit_log
--   WHERE organization_id = $1 AND entity_type = $2 AND entity_id = $3
--   ORDER BY created_at DESC
CREATE INDEX idx_audit_log_org_entity
    ON audit_log (organization_id, entity_type, entity_id, created_at DESC);
```

#### Pattern 7: Unread notifications for user

```sql
-- Query: SELECT * FROM notification
--   WHERE organization_id = $1 AND target_user_id = $2 AND read_status = false
--   ORDER BY created_at DESC
CREATE INDEX idx_notification_org_user_unread
    ON notification (organization_id, target_user_id, created_at DESC)
    WHERE read_status = false;
-- Partial index: only unread notifications are indexed
```

### Index Maintenance

| Operation | Frequency | Method |
|---|---|---|
| REINDEX | Weekly (low-traffic window) | `REINDEX INDEX CONCURRENTLY` |
| ANALYZE | After bulk operations | `ANALYZE {table}` |
| Index bloat monitoring | Daily | Query `pg_stat_user_indexes` for unused indexes |
| Index usage audit | Monthly | Review `idx_scan` counts; drop indexes with zero scans |

---

## 4. Time-Series Considerations

### Demand and Workload Data Characteristics

Demand forecasts and workload plans are time-series data with these characteristics:
- **Write pattern:** Batch inserts (daily forecasts imported) + real-time updates (manual adjustments)
- **Read pattern:** Range scans by site and date window (current week, next 4 weeks)
- **Retention:** Active data (current + 2 years), then archive, then purge
- **Rollup:** Daily granularity during active period; weekly/monthly rollups for historical analysis

### Retention and Rollup Strategy

```
Timeline:
  ◄── Current ──► ◄── 90 days ──► ◄── 2 years ──► ◄── 5 years ──► ◄── Purge
  │   Daily data  │  Daily data   │  Monthly       │  Annual        │  Deleted
  │   Hot storage │  Warm storage │  rollups only  │  rollups only  │
  │   SSD         │  SSD          │  HDD/S3        │  S3 Glacier    │
```

### Rollup Tables

```sql
-- Monthly rollup for demand (aggregated from daily demand_forecast)
CREATE TABLE demand_forecast_monthly (
    id UUID DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    site_id UUID NOT NULL,
    demand_type_id UUID NOT NULL,
    year_month DATE NOT NULL,  -- first day of month
    total_volume DECIMAL(14,2) NOT NULL,
    avg_daily_volume DECIMAL(12,2) NOT NULL,
    min_daily_volume DECIMAL(12,2) NOT NULL,
    max_daily_volume DECIMAL(12,2) NOT NULL,
    forecast_accuracy_pct DECIMAL(5,2),  -- actual vs forecast
    working_days INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
) PARTITION BY HASH (organization_id);

-- Monthly rollup for shift assignments
CREATE TABLE shift_assignment_monthly (
    id UUID DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    site_id UUID NOT NULL,
    process_id UUID NOT NULL,
    year_month DATE NOT NULL,
    total_scheduled_hours DECIMAL(10,2) NOT NULL,
    total_actual_hours DECIMAL(10,2),
    total_overtime_hours DECIMAL(10,2) NOT NULL,
    unique_employees INTEGER NOT NULL,
    avg_daily_headcount DECIMAL(8,2) NOT NULL,
    coverage_pct DECIMAL(5,2) NOT NULL,
    total_labor_cost DECIMAL(12,2),
    created_at TIMESTAMPTZ DEFAULT now()
) PARTITION BY HASH (organization_id);
```

### Rollup Job

```sql
-- Runs on the 2nd of each month for the previous month
INSERT INTO demand_forecast_monthly (
    organization_id, site_id, demand_type_id, year_month,
    total_volume, avg_daily_volume, min_daily_volume, max_daily_volume,
    working_days
)
SELECT
    organization_id,
    site_id,
    demand_type_id,
    date_trunc('month', forecast_date)::date AS year_month,
    SUM(volume) AS total_volume,
    AVG(volume) AS avg_daily_volume,
    MIN(volume) AS min_daily_volume,
    MAX(volume) AS max_daily_volume,
    COUNT(DISTINCT forecast_date) AS working_days
FROM demand_forecast
WHERE forecast_date >= date_trunc('month', CURRENT_DATE - INTERVAL '1 month')
  AND forecast_date < date_trunc('month', CURRENT_DATE)
  AND is_actual = true
GROUP BY organization_id, site_id, demand_type_id,
         date_trunc('month', forecast_date);
```

### Archival Process

```
1. Daily job identifies partitions older than 2 years
2. Export partition data to Parquet format on S3
3. Verify S3 data integrity (row count + checksum)
4. Detach partition from main table
5. Keep detached partition for 30 days as safety net
6. DROP detached partition after 30 days
7. Update metadata table tracking archived partitions
```

---

## 5. Read Replica Strategy

### Splitting Operational vs Reporting Queries

```
                    ┌─────────────────────┐
                    │   Application        │
                    │                      │
                    │   ┌─────────────┐    │
                    │   │ Query Router │    │
                    │   └──────┬──────┘    │
                    └──────────┼───────────┘
                               │
                ┌──────────────┼──────────────┐
                ▼                              ▼
     ┌────────────────┐              ┌────────────────┐
     │  Primary DB     │  ──WAL──►   │  Read Replica   │
     │  (Read + Write) │  streaming  │  (Read Only)    │
     │                 │             │                 │
     │  Used for:      │             │  Used for:      │
     │  - API CRUD     │             │  - Dashboards   │
     │  - Optimizer    │             │  - Reports      │
     │  - Real-time    │             │  - Exports      │
     │  - Transactions │             │  - Analytics    │
     │                 │             │  - Search       │
     └────────────────┘              └────────────────┘
```

### Query Routing Rules

| Query Type | Target | Max Replication Lag Tolerance | Connection Pool |
|---|---|---|---|
| INSERT/UPDATE/DELETE | Primary | N/A | `api_pool` |
| SELECT in transaction | Primary | N/A | `api_pool` |
| Dashboard aggregations | Read Replica | 30 seconds | `report_pool` |
| CSV/Excel exports | Read Replica | 60 seconds | `report_pool` |
| Employee schedule view | Primary | N/A (must be current) | `api_pool` |
| Historical reports | Read Replica | 5 minutes | `report_pool` |
| Full-text search | Read Replica | 30 seconds | `report_pool` |
| Audit log queries | Read Replica | 60 seconds | `report_pool` |

### Replication Lag Monitoring

```sql
-- Monitor replication lag on replica
SELECT
    CASE
        WHEN pg_last_wal_receive_lsn() = pg_last_wal_replay_lsn() THEN 0
        ELSE EXTRACT(EPOCH FROM now() - pg_last_xact_replay_timestamp())
    END AS replication_lag_seconds;

-- Alert if lag exceeds 60 seconds
-- Action: temporarily route all queries to primary until replica catches up
```

---

## 6. Materialized Views for Dashboard KPIs

Dashboards require aggregated metrics that are expensive to compute on every page load. Materialized views pre-compute these aggregations and refresh on a schedule.

### Site Dashboard Summary

```sql
CREATE MATERIALIZED VIEW mv_site_dashboard AS
SELECT
    sa.organization_id,
    sa.site_id,
    s.name AS site_name,
    sa.assignment_date,
    sa.plan_version_id,
    COUNT(DISTINCT sa.employee_id) AS headcount,
    SUM(sa.scheduled_hours) AS total_scheduled_hours,
    SUM(sa.actual_hours) AS total_actual_hours,
    SUM(sa.overtime_hours) AS total_overtime_hours,
    SUM(sa.cost_estimate) AS total_labor_cost,
    COUNT(CASE WHEN sa.status = 'no_show' THEN 1 END) AS no_show_count,
    COUNT(CASE WHEN sa.status = 'cancelled' THEN 1 END) AS cancelled_count
FROM shift_assignment sa
JOIN site s ON sa.site_id = s.id
WHERE sa.assignment_date >= CURRENT_DATE - INTERVAL '90 days'
GROUP BY sa.organization_id, sa.site_id, s.name,
         sa.assignment_date, sa.plan_version_id;

CREATE UNIQUE INDEX idx_mv_site_dashboard
    ON mv_site_dashboard (organization_id, site_id, assignment_date, plan_version_id);

-- Refresh every 15 minutes during business hours, hourly otherwise
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_site_dashboard;
```

### Coverage Gap Summary

```sql
CREATE MATERIALIZED VIEW mv_coverage_gaps AS
SELECT
    wp.organization_id,
    wp.site_id,
    wp.process_id,
    p.name AS process_name,
    wp.plan_date,
    wp.plan_version_id,
    wp.hours_needed,
    wp.hours_assigned,
    wp.coverage_pct,
    wp.fte_needed,
    wp.fte_assigned,
    (wp.fte_needed - wp.fte_assigned) AS fte_gap,
    CASE
        WHEN wp.coverage_pct >= 100 THEN 'over_staffed'
        WHEN wp.coverage_pct >= 95 THEN 'adequate'
        WHEN wp.coverage_pct >= 85 THEN 'at_risk'
        ELSE 'critical'
    END AS coverage_status
FROM workload_plan wp
JOIN process p ON wp.process_id = p.id
WHERE wp.plan_date >= CURRENT_DATE
  AND wp.plan_date <= CURRENT_DATE + INTERVAL '28 days';

CREATE UNIQUE INDEX idx_mv_coverage_gaps
    ON mv_coverage_gaps (organization_id, site_id, process_id, plan_date, plan_version_id);
```

### Skill Matrix Summary

```sql
CREATE MATERIALIZED VIEW mv_skill_matrix AS
SELECT
    es.organization_id,
    e.home_site_id AS site_id,
    es.process_id,
    p.name AS process_name,
    es.proficiency_level,
    COUNT(*) AS employee_count,
    COUNT(CASE WHEN es.status = 'active' THEN 1 END) AS active_count,
    COUNT(CASE WHEN es.expiry_date < CURRENT_DATE + INTERVAL '30 days'
               AND es.expiry_date IS NOT NULL THEN 1 END) AS expiring_soon_count
FROM employee_skill es
JOIN employee e ON es.employee_id = e.id
JOIN process p ON es.process_id = p.id
WHERE e.status = 'active'
GROUP BY es.organization_id, e.home_site_id, es.process_id,
         p.name, es.proficiency_level;

CREATE UNIQUE INDEX idx_mv_skill_matrix
    ON mv_skill_matrix (organization_id, site_id, process_id, proficiency_level);
```

### Refresh Schedule

| Materialized View | Refresh Interval | Refresh Method | Duration (est.) |
|---|---|---|---|
| `mv_site_dashboard` | 15 minutes | CONCURRENTLY | 10-30 seconds |
| `mv_coverage_gaps` | 5 minutes | CONCURRENTLY | 5-15 seconds |
| `mv_skill_matrix` | 1 hour | CONCURRENTLY | 15-45 seconds |
| `mv_org_summary` | 30 minutes | CONCURRENTLY | 20-60 seconds |

All refreshes use `REFRESH MATERIALIZED VIEW CONCURRENTLY` to avoid locking readers during refresh. This requires a unique index on the view.

---

## 7. Caching Layers

### Layer Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Client Browser                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Browser Cache (Service Worker)                   │   │
│  │  - Static assets (365 days)                       │   │
│  │  - API responses (stale-while-revalidate)         │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────┐
│  CDN Edge (Cloudflare/Vercel)                            │
│  - Static assets: 24h cache                              │
│  - API: no-cache (dynamic, tenant-specific)              │
│  - Org logos/branding: 7d cache with surrogate key purge │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────┐
│  Application Server                                      │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  L1: In-Process LRU Cache (per worker)            │   │
│  │  TTL: 30 seconds                                  │   │
│  │  Content: org settings, feature flags, labor rules│   │
│  │  Size: 50MB per worker                            │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  L2: Redis (Upstash/ElastiCache)                  │   │
│  │  TTL: 5-60 minutes (key-specific)                 │   │
│  │  Content:                                         │   │
│  │   - Entity lookups (site, employee, process): 15m │   │
│  │   - Computed aggregates (dashboard KPIs): 5m      │   │
│  │   - Resolved config per site: 5m                  │   │
│  │   - Session data: 24h                             │   │
│  │   - Rate limit counters: 1m sliding window        │   │
│  │  Size: 2-8GB per region                           │   │
│  └──────────────────────────────────────────────────┘   │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────┼─────────────────────────────────┐
│  PostgreSQL + Materialized Views                         │
│  - Source of truth for all data                          │
│  - Materialized views as "database-level cache"          │
│  - Buffer pool (shared_buffers): 25% of RAM              │
└─────────────────────────────────────────────────────────┘
```

### Redis Cache Content Breakdown

| Cache Category | Key Pattern | TTL | Invalidation |
|---|---|---|---|
| Org settings | `org:{id}:config:settings` | 5 min | On org settings update |
| Site list | `org:{id}:sites:list` | 15 min | On site create/update/delete |
| Site detail | `org:{id}:site:{site_id}` | 15 min | On site update |
| Employee roster | `org:{id}:site:{site_id}:employees` | 10 min | On employee create/update |
| Process list | `org:{id}:processes:list` | 30 min | On process create/update |
| Shift patterns | `org:{id}:shift_patterns:list` | 60 min | On pattern create/update |
| Labor rules | `org:{id}:labor_rules:{jurisdiction}` | 60 min | On rule create/update |
| Dashboard KPIs | `org:{id}:site:{site_id}:kpi:{date}` | 5 min | On assignment update |
| Resolved config | `org:{id}:config:resolved:{site_id}` | 5 min | On config update |
| Skill matrix | `org:{id}:site:{site_id}:skill_matrix` | 30 min | On skill update |

### Cache Invalidation Strategy

Invalidation uses a publish/subscribe model:

```
Database Trigger (on INSERT/UPDATE/DELETE)
    │
    ▼
pg_notify('cache_invalidation', '{"org_id":"...","table":"site","id":"...","op":"UPDATE"}')
    │
    ▼
Application Listener (subscribes to pg_notify channel)
    │
    ├── Delete specific Redis keys
    ├── Publish to Redis Pub/Sub for other app instances
    └── Clear L1 in-process cache
```

---

## 8. Write Throughput Optimization

### Bulk Import Pipeline

Large data imports (employee rosters, historical demand, initial setup) use a batched pipeline:

```
CSV/API Upload
    │
    ▼
┌──────────────┐
│  Validation   │  ← Schema validation, data type checks, FK reference checks
│  (async)      │     Runs in worker process, not API thread
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Staging      │  ← Insert into staging table (no indexes, no constraints)
│  Table        │     COPY command for maximum throughput (~500K rows/sec)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Transform    │  ← Apply business rules, generate UUIDs, resolve FKs
│  + Enrich     │     Runs as a single SQL transaction
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Insert into  │  ← INSERT INTO ... SELECT FROM staging
│  Target Table │     Batch size: 5,000 rows per transaction
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Post-Import  │  ← ANALYZE table, invalidate caches, send notifications
│  Cleanup      │     Drop staging table
└──────────────┘
```

### Real-Time Write Optimization

For real-time updates (shift swaps, manual adjustments, attendance recording):

```
API Request
    │
    ▼
┌──────────────┐
│  Validate     │  ← Synchronous validation (FK checks, business rules)
│  + Write      │     Single-row INSERT/UPDATE
└──────┬───────┘
       │
       ├── Synchronous: write to primary DB
       │
       └── Asynchronous (via queue):
           ├── Invalidate cache keys
           ├── Recalculate affected workload coverage
           ├── Send notifications to affected users
           ├── Write audit log entry
           └── Update materialized views (if stale)
```

### Queue-Based Async Processing

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  API writes   │────►│  Job Queue   │────►│  Workers      │
│  to DB        │     │  (BullMQ/    │     │  (Node.js)    │
│               │     │   pg_boss)   │     │               │
└──────────────┘     └──────────────┘     └──────────────┘

Queue Types:
  - cache_invalidation (priority: high, concurrency: 20)
  - audit_log_write (priority: medium, concurrency: 10)
  - notification_send (priority: medium, concurrency: 5)
  - coverage_recalc (priority: low, concurrency: 3)
  - report_generation (priority: low, concurrency: 2)
  - data_export (priority: low, concurrency: 1)
```

### Write Throughput Targets

| Operation | Target Throughput | Method |
|---|---|---|
| Single shift assignment create | < 50ms | Direct INSERT |
| Bulk shift assignment (optimizer output) | 10,000 rows/sec | Batched INSERT (5K per txn) |
| Employee roster import (CSV) | 50,000 rows/min | COPY + staging table |
| Demand forecast import | 100,000 rows/min | COPY + staging table |
| Audit log write | 5,000 rows/sec | Async queue + batch INSERT |
| Real-time attendance update | 1,000 events/sec | Single INSERT + async side effects |

---

## 9. Data Lifecycle: Active, Archive, Purge

### Lifecycle Policies by Entity

| Entity | Active Period | Archive Trigger | Archive Storage | Purge After |
|---|---|---|---|---|
| ShiftAssignment | Current + 90 days | `assignment_date < CURRENT_DATE - 90` | Monthly rollup + S3 Parquet | 5 years (rolled up) |
| WorkloadPlan | Current + 90 days | `plan_date < CURRENT_DATE - 90` | Monthly rollup + S3 Parquet | 5 years (rolled up) |
| DemandForecast | Current + 2 years | `forecast_date < CURRENT_DATE - 730` | Monthly rollup + S3 Parquet | 7 years (rolled up) |
| AuditLog | Current + 1 year | `created_at < CURRENT_DATE - 365` | S3 Parquet (full records) | 7 years (compliance) |
| Notification | Current + 30 days | `created_at < CURRENT_DATE - 30` | Not archived | 90 days |
| PlanVersion | Current + 6 months | `plan_period_end < CURRENT_DATE - 180 AND is_locked` | Metadata retained; child data archived | Never (metadata only) |
| Scenario | Current + 6 months | `status IN ('completed','rejected','archived')` | Metadata retained | Never (metadata only) |
| Employee | While employed + 2 years | `status = 'terminated' AND termination_date < CURRENT_DATE - 730` | PII anonymized, record retained | Never (anonymized) |

### Archival Process Flow

```
1. Nightly archive job runs at 03:00 UTC
2. For each entity type with archive policy:
   a. Identify partitions eligible for archival
   b. Export partition to S3 in Parquet format:
      s3://{bucket}/archive/{org_id}/{entity}/{year}/{month}/data.parquet
   c. Verify export (row count + checksum match)
   d. If rollup table exists: compute and insert rollup records
   e. Detach partition from main table
   f. After 30-day safety window: DROP detached partition
3. Update archive_metadata table with S3 location
4. Send summary notification to platform admins
```

### PII Anonymization for Terminated Employees

```sql
-- After 2 years post-termination, anonymize PII but retain the record
-- for referential integrity (historical shift assignments still reference employee_id)
UPDATE employee SET
    first_name = 'Anonymized',
    last_name = 'Employee-' || LEFT(id::text, 8),
    email = NULL,
    phone = NULL,
    preferences_json = '{}',
    metadata_json = '{}'
WHERE status = 'terminated'
  AND termination_date < CURRENT_DATE - INTERVAL '2 years'
  AND first_name != 'Anonymized';  -- idempotent
```

---

## 10. Estimated Data Volumes

### Per-Site Volume Estimates

| Entity | Records per Site per Day | Records per Site per Month | Records per Site per Year |
|---|---|---|---|
| ShiftAssignment | 200-500 | 6,000-15,000 | 73,000-182,500 |
| WorkloadPlan | 20-50 | 600-1,500 | 7,300-18,250 |
| DemandForecast | 5-15 | 150-450 | 1,825-5,475 |
| Employee | — (static) | ~200-500 total | — |
| EmployeeSkill | — (static) | ~600-2,500 total | — |
| AuditLog | 100-500 | 3,000-15,000 | 36,500-182,500 |
| Notification | 50-200 | 1,500-6,000 | 18,250-73,000 |

### Platform-Wide Volume at 1,000 Sites

| Entity | Records (1,000 Sites) | Avg Row Size | Table Size | Annual Growth |
|---|---|---|---|---|
| ShiftAssignment | 109M - 182M/year | ~400 bytes | 40-70 GB/year | 40-70 GB |
| WorkloadPlan | 7.3M - 18.3M/year | ~350 bytes | 2.5-6.5 GB/year | 2.5-6.5 GB |
| DemandForecast | 1.8M - 5.5M/year | ~300 bytes | 0.5-1.6 GB/year | 0.5-1.6 GB |
| Employee | 200K - 500K total | ~500 bytes | 100-250 MB | Slow growth |
| EmployeeSkill | 600K - 2.5M total | ~250 bytes | 150-625 MB | Slow growth |
| AuditLog | 36M - 182M/year | ~1,000 bytes | 36-182 GB/year | 36-182 GB |
| Notification | 18M - 73M/year | ~500 bytes | 9-36 GB/year | 9-36 GB |
| **Total (active)** | — | — | **~90-300 GB/year** | — |

### Platform-Wide Volume at 10,000 Sites (Enterprise Scale)

| Entity | Records (10,000 Sites) | Table Size | Notes |
|---|---|---|---|
| ShiftAssignment | 1-1.8 Billion/year | 400-700 GB/year | Partitioning essential |
| AuditLog | 360M - 1.8 Billion/year | 360 GB - 1.8 TB/year | Aggressive archival required |
| WorkloadPlan | 73M - 183M/year | 25-65 GB/year | Moderate, manageable |
| DemandForecast | 18M - 55M/year | 5-16 GB/year | Moderate, manageable |
| Notification | 180M - 730M/year | 90-360 GB/year | Short retention helps |
| Employee | 2M - 5M total | 1-2.5 GB | Static, fits in memory |
| **Total (active, pre-archive)** | — | **~1-3 TB/year** | Archival keeps active set under 500 GB |

---

## 11. Query Performance Targets

| Operation | Target Latency (p95) | Strategy |
|---|---|---|
| Get site list for org | < 50ms | Redis cache (L2), 15-min TTL |
| Get employee roster for site | < 100ms | Index on (org_id, home_site_id, status) + cache |
| Get weekly schedule for site | < 200ms | Index on (org_id, site_id, assignment_date, plan_version_id) + partition pruning |
| Get employee's personal schedule | < 50ms | Index on (org_id, employee_id, assignment_date) |
| Get demand forecast for site + week | < 100ms | Index on (org_id, site_id, forecast_date) + partition pruning |
| Get workload coverage gaps | < 150ms | Materialized view `mv_coverage_gaps` |
| Dashboard KPI aggregation | < 200ms | Materialized view `mv_site_dashboard` + Redis cache |
| Skill matrix for site | < 100ms | Materialized view `mv_skill_matrix` + Redis cache |
| Audit log for entity | < 200ms | Index on (org_id, entity_type, entity_id, created_at DESC) |
| Unread notification count | < 30ms | Partial index on (org_id, user_id) WHERE read_status = false |
| Optimizer run (full site week) | < 60 seconds | Dedicated worker, preloaded data, constraint solver |
| Bulk import (10K employees) | < 30 seconds | COPY + staging table pipeline |
| Plan version comparison | < 500ms | Parallel queries + in-memory diff |
| Cross-site org summary | < 300ms | Materialized view + Redis cache |
| Full-text employee search | < 100ms | GIN index on tsvector column, read replica |

### Latency Budget Breakdown (Typical API Request)

```
Total budget: 200ms (p95)

  Edge routing + TLS:           10ms
  JWT validation:                5ms
  L1 cache check:                1ms
  L2 Redis cache check:          3ms
  Cache miss → PostgreSQL:     120ms (including network)
  Response serialization:       10ms
  Network to client:            51ms
                              ------
  Total:                       200ms
```

### Monitoring and Alerting Thresholds

| Metric | Warning | Critical | Action |
|---|---|---|---|
| API p95 latency | > 300ms | > 1000ms | Investigate slow queries; check replica lag |
| Database CPU | > 60% sustained | > 85% sustained | Scale up or add read replica |
| Redis memory | > 70% of max | > 90% of max | Review TTLs; increase instance size |
| Replication lag | > 30 seconds | > 120 seconds | Route reporting to primary; investigate |
| Partition size | > 10GB | > 50GB | Add sub-partitions; review retention |
| Connection pool usage | > 70% | > 90% | Increase pool size; audit connection leaks |
| Queue depth (any queue) | > 1,000 | > 10,000 | Scale workers; investigate backpressure |
| Active table size | > 200GB total | > 500GB total | Trigger archival review |
