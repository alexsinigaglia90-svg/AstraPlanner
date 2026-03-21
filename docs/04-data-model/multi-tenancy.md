# AstraPlanner Multi-Tenancy Architecture

This document specifies the multi-tenant architecture for AstraPlanner. It covers the isolation strategy, schema design, row-level security policies, caching, data residency compliance, tenant onboarding, configuration hierarchy, performance isolation, and backup/restore procedures.

---

## 1. Tenant Isolation Strategy: Shared Database with Row-Level Security

AstraPlanner uses a **shared database, shared schema** architecture with **Supabase Row-Level Security (RLS)** enforced at the PostgreSQL layer. Every table includes an `organization_id` column that serves as the partition key for tenant isolation.

### Why Shared Database Over Database-Per-Tenant

| Consideration | Shared DB with RLS | DB Per Tenant |
|---|---|---|
| **Operational cost at scale** | Single database instance; linear cost growth | Cost per tenant is multiplicative; 1000 tenants = 1000 DBs |
| **Connection pooling** | Single pool (PgBouncer); efficient at thousands of concurrent users | Separate pools per DB; connection limits hit quickly |
| **Schema migrations** | Single migration; applied once | Must migrate every tenant DB independently; failure modes multiply |
| **Cross-tenant analytics** | Trivial — same schema, same tables (with admin bypass) | Requires ETL pipeline to aggregate across databases |
| **Monitoring and alerting** | Single set of dashboards and alerts | Per-tenant monitoring infrastructure required |
| **Backup/restore** | Single backup strategy; tenant-level logical export for individual restore | Simpler per-tenant restore, but operational overhead for thousands |
| **Noisy neighbor risk** | Must be mitigated (see Section 10) | Natural isolation, but resource waste on idle tenants |
| **Compliance (data residency)** | Requires region-aware routing (see Section 8) | Physical isolation per region, but operational complexity |
| **Time to provision tenant** | Milliseconds (insert row + seed config) | Minutes to hours (create DB, run migrations, configure networking) |

**Decision:** Shared DB wins at AstraPlanner's target scale (thousands of sites, hundreds of organizations). The noisy neighbor and data residency concerns are mitigated with specific strategies documented below.

---

## 2. Schema Design: organization_id as Universal Partition Key

### Column Specification

Every table in the AstraPlanner schema includes:

```sql
organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE
```

This column:
- Is the **first column** in every composite index (enables partition pruning)
- Is included in every **unique constraint** (ensures uniqueness is tenant-scoped)
- Is the **partition key** for PostgreSQL declarative partitioning on high-volume tables
- Is **never nullable** — orphan records are structurally impossible

### Index Strategy

All primary query patterns start with `organization_id`:

```sql
-- Every table gets this baseline index
CREATE INDEX idx_{table}_org ON {table} (organization_id);

-- Composite indexes always lead with organization_id
CREATE INDEX idx_shift_assignment_org_site_date
  ON shift_assignment (organization_id, site_id, assignment_date);

CREATE INDEX idx_demand_forecast_org_site_date
  ON demand_forecast (organization_id, site_id, forecast_date);

CREATE INDEX idx_employee_org_site
  ON employee (organization_id, home_site_id);
```

### Partitioning for High-Volume Tables

Tables that grow to millions of rows are hash-partitioned by `organization_id`:

```sql
CREATE TABLE shift_assignment (
    id UUID DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL,
    -- ... other columns
) PARTITION BY HASH (organization_id);

-- Create 16 partitions (adjustable based on tenant count)
CREATE TABLE shift_assignment_p0 PARTITION OF shift_assignment
    FOR VALUES WITH (MODULUS 16, REMAINDER 0);
CREATE TABLE shift_assignment_p1 PARTITION OF shift_assignment
    FOR VALUES WITH (MODULUS 16, REMAINDER 1);
-- ... through p15
```

Tables partitioned this way:
- `shift_assignment` — highest volume: ~employees x days x plan versions
- `workload_plan` — processes x sites x days x plan versions
- `demand_forecast` — demand types x sites x days
- `audit_log` — every state change in the system

---

## 3. Supabase RLS Policy Examples

### Core RLS Pattern

Every table uses the same fundamental policy pattern. The authenticated user's JWT contains an `organization_id` claim set during login.

```sql
-- Enable RLS on the table
ALTER TABLE site ENABLE ROW LEVEL SECURITY;

-- Force RLS for table owner too (prevents bypass via service role in application code)
ALTER TABLE site FORCE ROW LEVEL SECURITY;
```

### Site Table Policies

```sql
-- SELECT: users can only read sites in their organization
CREATE POLICY site_select_policy ON site
    FOR SELECT
    USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- INSERT: users can only create sites in their organization
CREATE POLICY site_insert_policy ON site
    FOR INSERT
    WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- UPDATE: users can only update sites in their organization
CREATE POLICY site_update_policy ON site
    FOR UPDATE
    USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
    WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- DELETE: users can only delete sites in their organization
CREATE POLICY site_delete_policy ON site
    FOR DELETE
    USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
```

### ShiftAssignment Table Policies (with Role-Based Access)

```sql
-- SELECT: all org users can read assignments
CREATE POLICY shift_assignment_select ON shift_assignment
    FOR SELECT
    USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- INSERT: only planners and admins can create assignments
CREATE POLICY shift_assignment_insert ON shift_assignment
    FOR INSERT
    WITH CHECK (
        organization_id = (auth.jwt() ->> 'organization_id')::uuid
        AND (auth.jwt() ->> 'role') IN ('planner', 'admin', 'system')
    );

-- UPDATE: planners can update draft/published; only admins can update locked
CREATE POLICY shift_assignment_update ON shift_assignment
    FOR UPDATE
    USING (
        organization_id = (auth.jwt() ->> 'organization_id')::uuid
        AND (
            status IN ('draft', 'published')
            OR (auth.jwt() ->> 'role') = 'admin'
        )
    )
    WITH CHECK (
        organization_id = (auth.jwt() ->> 'organization_id')::uuid
    );
```

### AuditLog Policies (Append-Only)

```sql
-- SELECT: org users can read their audit logs
CREATE POLICY audit_log_select ON audit_log
    FOR SELECT
    USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- INSERT: system and authenticated users can create audit entries
CREATE POLICY audit_log_insert ON audit_log
    FOR INSERT
    WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- No UPDATE or DELETE policies — audit logs are immutable
-- Additional trigger to enforce immutability:
CREATE OR REPLACE FUNCTION prevent_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log records cannot be modified or deleted';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_immutable
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();
```

### Employee Table Policies (Site-Scoped Visibility)

```sql
-- Site managers can only see employees at their managed sites
CREATE POLICY employee_site_manager_select ON employee
    FOR SELECT
    USING (
        organization_id = (auth.jwt() ->> 'organization_id')::uuid
        AND (
            -- Admins and planners see all employees in org
            (auth.jwt() ->> 'role') IN ('admin', 'planner')
            -- Site managers see employees at their sites
            OR home_site_id IN (
                SELECT site_id FROM user_site_access
                WHERE user_id = auth.uid()
            )
            -- Employees can see themselves
            OR id = (auth.jwt() ->> 'employee_id')::uuid
        )
    );
```

---

## 4. Cross-Tenant Data Isolation Guarantees

### Enforcement Layers

Tenant isolation is enforced at multiple layers — defense in depth:

| Layer | Mechanism | Bypass Condition |
|---|---|---|
| **Database (L1)** | PostgreSQL RLS policies | Only `service_role` key (never exposed to clients) |
| **API (L2)** | Supabase PostgREST auto-applies RLS via JWT | None — all API calls go through RLS |
| **Application (L3)** | Middleware validates `organization_id` on every request | None — defense in depth |
| **Edge Functions (L4)** | JWT validation + organization_id extraction before DB call | None |
| **Caching (L5)** | Cache keys prefixed with `org:{organization_id}:` | Cache poisoning mitigated via key structure |

### Guarantees

1. **No cross-tenant reads:** RLS policies prevent any SELECT from returning rows where `organization_id` does not match the JWT claim.
2. **No cross-tenant writes:** INSERT and UPDATE policies enforce `organization_id` matching.
3. **No cross-tenant deletes:** DELETE policies enforce `organization_id` matching.
4. **No cross-tenant enumeration:** UUIDs prevent sequential ID guessing; RLS prevents scan-based discovery.
5. **Service role isolation:** The Supabase `service_role` key (which bypasses RLS) is only used by backend workers running in trusted environments (not exposed to client apps).
6. **Audit trail:** Every data modification is logged to `audit_log` with `organization_id`, enabling post-hoc verification of isolation.

### Testing Protocol

- **Automated tests:** CI pipeline includes cross-tenant access tests that attempt to read/write data with mismatched `organization_id` JWT claims. All must return zero rows or permission denied.
- **Penetration testing:** Quarterly pen tests include tenant isolation bypass attempts.
- **Monitoring:** Alert on any query that returns rows across multiple `organization_id` values (canary query).

---

## 5. Tenant-Scoped Caching Strategy

### Cache Key Structure

All cache keys are prefixed with the organization ID to prevent cross-tenant data leakage:

```
org:{organization_id}:{entity_type}:{key_specifics}
```

Examples:

```
org:a1b2c3d4:site:b2c3d4e5                        # Single site record
org:a1b2c3d4:sites:list                            # All sites for org
org:a1b2c3d4:employee:e5f6a7b8:skills              # Employee skills
org:a1b2c3d4:process_standards:d4e5f6a7:site:b2c3  # Productivity standards
org:a1b2c3d4:config:settings                       # Org settings
org:a1b2c3d4:plan:01234567:summary                 # Plan version summary
```

### Cache Layers

| Layer | Technology | TTL | Content | Invalidation |
|---|---|---|---|---|
| **L1: In-Process** | Node.js LRU cache | 30 seconds | Hot config (org settings, feature flags) | Process restart or explicit bust |
| **L2: Distributed** | Redis (Upstash) | 5-60 minutes | Entity lookups, computed aggregates | Pub/Sub on write events |
| **L3: CDN** | Cloudflare/Vercel Edge | 24 hours | Static assets, org logos, UI config | Deploy-time purge or surrogate keys |

### Redis Namespace Isolation

```
# Each org gets its own Redis key prefix
# Redis ACLs (if using Redis 6+) can restrict key patterns per connection

# Write-through cache on entity update:
async function updateSite(orgId, siteId, data) {
    await db.update('site', siteId, data);
    await redis.del(`org:${orgId}:site:${siteId}`);
    await redis.del(`org:${orgId}:sites:list`);
    await pubsub.publish(`org:${orgId}:cache_invalidation`, {
        entity: 'site',
        id: siteId,
        action: 'update'
    });
}
```

### Cache Warming

On tenant login (first request after cold cache):
1. Fetch and cache org settings, feature flags
2. Fetch and cache user's accessible sites
3. Fetch and cache active shift patterns
4. Fetch and cache labor rules for user's jurisdiction

Warming is async and non-blocking — the first request may be slower, but subsequent requests hit cache.

---

## 6. Data Residency and Regional Compliance

### GDPR and Data Sovereignty Requirements

AstraPlanner operates across regions where data residency laws require personal data to remain within specific geographic boundaries. The `Organization.data_residency_region` field controls where tenant data is stored and processed.

### Supported Regions

| Region Code | Geographic Area | Data Center | Compliance Frameworks |
|---|---|---|---|
| `us-east` | United States East | AWS us-east-1 / Supabase US | SOC 2, CCPA |
| `us-west` | United States West | AWS us-west-2 | SOC 2, CCPA |
| `eu-west` | European Union | AWS eu-west-1 / Supabase EU | GDPR, Schrems II |
| `eu-central` | European Union (Germany) | AWS eu-central-1 | GDPR, BDSG |
| `ap-southeast` | Asia Pacific | AWS ap-southeast-1 | PDPA (Singapore) |
| `au-east` | Australia | AWS ap-southeast-2 | Privacy Act 1988 |

### Architecture for Multi-Region

```
                    ┌─────────────────────┐
                    │   Global Edge       │
                    │  (Cloudflare/Vercel) │
                    │  Routes by org region│
                    └────────┬────────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │ US Region  │  │ EU Region  │  │ AP Region  │
     │ Supabase   │  │ Supabase   │  │ Supabase   │
     │ Instance   │  │ Instance   │  │ Instance   │
     │            │  │            │  │            │
     │ PostgreSQL │  │ PostgreSQL │  │ PostgreSQL │
     │ + Redis    │  │ + Redis    │  │ + Redis    │
     └────────────┘  └────────────┘  └────────────┘
```

### Region Routing

1. During tenant onboarding, the admin selects a data residency region.
2. The organization record is stored in a **global metadata database** (contains only `id`, `slug`, `data_residency_region` — no PII).
3. All tenant data is stored in the region-specific Supabase instance.
4. The edge layer reads the global metadata to route requests to the correct regional instance.
5. Region cannot be changed after onboarding without a formal data migration process (support-assisted, with downtime window).

### Personal Data Classification

| Data Category | Classification | Residency Requirement | Encryption |
|---|---|---|---|
| Employee names, emails, phones | PII | Must reside in org's declared region | AES-256 at rest, TLS 1.3 in transit |
| Employee IDs, skill levels | Pseudonymized | Must reside in org's declared region | AES-256 at rest |
| Demand volumes, workload plans | Business data | Must reside in org's declared region | AES-256 at rest |
| Audit logs | Compliance data | Must reside in org's declared region; 7-year retention | AES-256 at rest |
| Aggregated analytics (no PII) | Anonymized | Can be replicated to global analytics DB | TLS in transit |
| Organization settings, feature flags | Non-sensitive | Global metadata DB (no PII content) | TLS in transit |

---

## 7. Tenant Onboarding and Provisioning Flow

### Provisioning Steps

```
Step 1: Organization Creation
    ├── Admin submits signup form (name, email, region, tier)
    ├── System creates Organization record in global metadata DB
    ├── System creates Organization record in regional Supabase instance
    └── Assigns unique slug and organization_id

Step 2: Seed Default Data
    ├── Create default DemandTypes (orders, units, lines, pallets, cases)
    ├── Create default ShiftPatterns (Morning, Afternoon, Night)
    ├── Create default LaborRules for org's country
    ├── Create default Processes based on industry template
    └── Create default ProcessProductivityStandards (industry averages)

Step 3: Admin User Setup
    ├── Create admin user account in Supabase Auth
    ├── Assign 'admin' role with organization_id claim in JWT
    ├── Send welcome email with login credentials
    └── Generate API keys for integration setup

Step 4: Setup Wizard Initiation
    ├── On first login, redirect to AI-guided setup wizard
    ├── Wizard collects: industry type, site count, shift patterns, processes
    ├── Wizard customizes seeded data based on responses
    └── Wizard creates first Site and Department structure

Step 5: Integration Configuration (optional)
    ├── User configures WMS/OMS/HRIS integrations
    ├── System runs test connection and field mapping validation
    ├── First sync imports historical data (employees, demand)
    └── Recurring sync schedule activated
```

### Provisioning Timeline

| Step | Duration | Blocking? |
|---|---|---|
| Organization creation | < 500ms | Yes |
| Seed default data | < 2 seconds | Yes |
| Admin user setup | < 1 second | Yes |
| Welcome email | Async | No |
| Setup wizard | 5-15 minutes (user-driven) | No |
| First integration sync | 1-30 minutes (data-dependent) | No |

Total time from signup to usable system: **under 5 seconds** for the automated steps. The setup wizard and integration configuration are user-paced.

### Tenant Deprovisioning

```
1. Admin requests account cancellation → status set to 'cancelled'
2. 30-day grace period: data retained, access blocked (login disabled)
3. Data export: tenant can request full data export (JSON/CSV) during grace period
4. After grace period:
   a. Soft delete: all records marked inactive, PII scrubbed
   b. 90 days later: hard delete of all tenant data
   c. Audit logs retained for 7 years (legal compliance) with PII anonymized
5. Organization record in global metadata DB updated to 'purged'
```

---

## 8. Tenant Configuration Hierarchy

Configuration is resolved using a three-level hierarchy with override semantics. More specific levels override less specific ones.

### Resolution Order

```
Level 1: Global Defaults (hardcoded in application)
    └── Level 2: Organization Overrides (Organization.settings_json)
          └── Level 3: Site Overrides (Site.settings_json)
```

### Configuration Keys and Defaults

| Configuration Key | Global Default | Org Override Example | Site Override Example |
|---|---|---|---|
| `planning_horizon_days` | `14` | `28` | `7` (short-cycle site) |
| `approval_workflow_enabled` | `false` | `true` | `false` (autonomous site) |
| `ai_auto_plan_enabled` | `false` | `true` | — (inherits from org) |
| `overtime_alert_threshold_pct` | `10` | `15` | `20` (high-OT site) |
| `min_coverage_target_pct` | `95` | `98` | `90` (flexible site) |
| `shift_swap_enabled` | `true` | — (inherits global) | `false` (union site) |
| `max_consecutive_work_days` | `6` | `5` | — (inherits from org) |
| `demand_forecast_model` | `'linear_regression'` | `'prophet'` | `'xgboost'` |
| `notification_channels` | `['in_app']` | `['in_app','email']` | `['in_app','email','sms']` |

### Resolution Algorithm

```typescript
function resolveConfig(key: string, orgSettings: object, siteSettings: object): any {
    // Site override takes highest priority
    if (siteSettings && key in siteSettings) {
        return siteSettings[key];
    }
    // Organization override is next
    if (orgSettings && key in orgSettings) {
        return orgSettings[key];
    }
    // Fall back to global default
    return GLOBAL_DEFAULTS[key];
}
```

### Configuration Caching

Resolved configuration is cached per-site in Redis with a 5-minute TTL:

```
org:{org_id}:config:resolved:{site_id} → { full merged config object }
```

Cache is invalidated when either `Organization.settings_json` or `Site.settings_json` is updated, via a database trigger that publishes to the invalidation channel.

---

## 9. Performance Isolation: Preventing Noisy Neighbor Problems

In a shared-database architecture, a single tenant running expensive queries can degrade performance for all tenants. AstraPlanner mitigates this at multiple levels.

### Strategy Table

| Concern | Strategy | Implementation |
|---|---|---|
| **Query cost** | Statement timeout per connection | `SET statement_timeout = '30s'` for API connections; `120s` for background workers |
| **Connection exhaustion** | Per-tenant connection limits via PgBouncer | PgBouncer `max_client_conn` per pool; tenants mapped to pools by org_id hash |
| **Large result sets** | Mandatory pagination on all list endpoints | API enforces `limit` (max 1000) and `offset` on all collection queries |
| **Expensive reports** | Read replica routing | Reporting queries (dashboards, exports) routed to read replicas |
| **Bulk imports** | Queue-based processing with rate limiting | Imports processed via async job queue; max 10 concurrent jobs per tenant |
| **Real-time subscriptions** | Channel-level rate limiting | Supabase Realtime limits subscriptions per tenant; heartbeat-based pruning |
| **Storage** | Per-tenant storage quotas | Enforced at application layer; tracked in Organization metadata |
| **API rate limiting** | Per-tenant rate limits based on subscription tier | Edge middleware: starter=100 req/min, professional=500 req/min, enterprise=2000 req/min |
| **Background jobs** | Fair scheduling with tenant-weighted priority queues | Job processor uses weighted round-robin; no tenant can consume >20% of worker pool |
| **Index bloat** | Partitioning by organization_id | Hash partitioning distributes data across partitions; VACUUM runs per-partition |

### Connection Pooling Architecture

```
Client Request
    │
    ▼
┌─────────────────────┐
│  Supabase Edge       │
│  (JWT validation)    │
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  PgBouncer           │
│  (Transaction mode)  │
│                      │
│  Pool: api_pool      │ ← API connections (short-lived, statement_timeout=30s)
│  Pool: worker_pool   │ ← Background workers (long-lived, statement_timeout=120s)
│  Pool: report_pool   │ ← Reporting (read replica, statement_timeout=300s)
│                      │
│  max_client_conn=500 │
│  default_pool_size=25│
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  PostgreSQL           │
│  (max_connections=200)│
└──────────────────────┘
```

### Query Cost Monitoring

```sql
-- pg_stat_statements view filtered by organization_id patterns
-- Alert when any single tenant exceeds 30% of total query time in a 5-minute window

SELECT
    userid,
    query,
    calls,
    total_exec_time,
    mean_exec_time,
    rows
FROM pg_stat_statements
WHERE mean_exec_time > 1000  -- queries averaging over 1 second
ORDER BY total_exec_time DESC
LIMIT 20;
```

---

## 10. Backup and Restore at Tenant Level

### Backup Strategy

| Backup Type | Frequency | Retention | Scope | Technology |
|---|---|---|---|---|
| **Full database** | Daily at 02:00 UTC | 30 days | All tenants | Supabase automated backups (pg_dump) |
| **WAL archiving** | Continuous | 7 days | All tenants | Point-in-time recovery (PITR) |
| **Tenant logical export** | On-demand | Per request | Single tenant | Custom pg_dump with WHERE clause |
| **Audit log archive** | Monthly | 7 years | Per tenant | S3 export (Parquet format) |

### Tenant-Level Restore Process

Since all tenants share a single database, restoring a single tenant without affecting others requires a logical restore approach:

```
Step 1: Extract tenant data from backup
    pg_dump --table='*' --data-only \
        --where="organization_id = '{org_id}'" \
        $DATABASE_URL > tenant_backup.sql

Step 2: Restore to staging environment
    psql $STAGING_DATABASE_URL < tenant_backup.sql

Step 3: Validate data integrity in staging
    - Run referential integrity checks
    - Verify row counts match backup manifest
    - Run application-level consistency checks

Step 4: Apply to production
    Option A (full replace):
        - Delete all current tenant data (CASCADE from Organization)
        - Insert from backup
        - Within a single transaction

    Option B (selective restore):
        - Identify specific entities/time range to restore
        - Merge restored data with current state
        - Resolve conflicts (keep newer vs. restore older)

Step 5: Verify and audit
    - Run post-restore validation queries
    - Create audit_log entry for the restore operation
    - Notify tenant admin of completion
```

### Self-Service Data Export

Tenant admins can export their organization's complete data at any time:

```
POST /api/v1/admin/data-export

Response:
{
    "export_id": "exp_abc123",
    "status": "processing",
    "estimated_completion": "2026-03-20T16:00:00Z",
    "download_url": null  // populated when complete
}

// Export format: ZIP containing JSON files per entity
// tenant_export_20260320.zip
//   ├── organization.json
//   ├── sites.json
//   ├── departments.json
//   ├── processes.json
//   ├── employees.json  (PII included, encrypted at rest)
//   ├── shift_assignments.json
//   ├── demand_forecasts.json
//   ├── ... (all entities)
//   └── manifest.json (checksums, row counts, export metadata)
```

---

## 11. Isolation Concern Summary Table

| Isolation Concern | Strategy | Implementation |
|---|---|---|
| **Data isolation (reads)** | Row-Level Security | PostgreSQL RLS policies filter by `organization_id` from JWT |
| **Data isolation (writes)** | Row-Level Security + app validation | RLS WITH CHECK clauses + middleware validation |
| **Schema isolation** | Shared schema with org_id partition key | All tables include `organization_id`; all unique constraints include it |
| **Network isolation** | Edge-level routing | Supabase project per region; Cloudflare routes by org region |
| **Cache isolation** | Key prefix namespacing | All Redis keys prefixed with `org:{organization_id}:` |
| **Connection isolation** | Connection pooling with limits | PgBouncer pools; per-tenant rate limits at API layer |
| **Compute isolation** | Rate limiting + queue fairness | API rate limits by tier; job queue weighted round-robin |
| **Storage isolation** | Quota enforcement | Per-org storage limits tracked in Organization metadata |
| **Encryption isolation** | Per-tenant encryption keys | Integration credentials encrypted with tenant-specific keys (KMS) |
| **Backup isolation** | Logical export per tenant | pg_dump with WHERE clause; on-demand self-service export |
| **Compliance isolation** | Regional deployment | Org data stored in declared region; cross-region replication prohibited |
| **Audit isolation** | Org-scoped audit logs | Immutable audit_log with RLS; 7-year retention |
| **Feature isolation** | Per-org feature flags | `Organization.feature_flags` controls feature gates |
| **Configuration isolation** | Hierarchical config override | Global defaults → org settings → site settings |
| **Search isolation** | Org-scoped full-text indexes | `tsvector` columns include `organization_id` in GIN index |
| **Realtime isolation** | Channel-scoped subscriptions | Supabase Realtime channels namespaced by org_id |
