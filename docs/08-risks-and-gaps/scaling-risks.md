# Scaling Risks

## 1. Introduction

AstraPlanner is designed to support logistics enterprises ranging from a single-site operation with 50 employees to a global enterprise with 5,000 sites and 500,000 employees. Scaling across four dimensions -- data, compute, organizational complexity, and geography -- introduces challenges that require architectural evolution, not just resource scaling. This document analyzes each dimension, identifies breaking points, and provides a phased scaling strategy with cost projections.

---

## 2. Dimension 1: Data Scale

### 2.1 Scale Targets

| Metric | MVP Target | Growth Target | Enterprise Target |
|--------|------------|---------------|-------------------|
| Tenants | 5 | 50 | 200 |
| Sites | 50 | 500 | 5,000 |
| Employees | 5,000 | 50,000 | 500,000 |
| Processes | 50 | 200 | 2,000 |
| Shift assignments per day | 15,000 | 150,000 | 1,500,000 |
| Shift assignments per year | ~5.5M | ~55M | ~550M |
| Demand signals per day | 50,000 | 500,000 | 5,000,000 |
| Historical data retention | 1 year | 2 years | 5 years |
| Total active rows (estimated) | 20M | 500M | 10B |

### 2.2 Where the Data Model Breaks

The primary bottleneck is the `shift_assignments` table, which is the join hub for most queries in the system. A shift assignment row contains:

```
shift_assignments (
  assignment_id     UUID        -- PK
  tenant_id         UUID        -- FK, partition key
  plan_id           UUID        -- FK
  site_id           UUID        -- FK
  employee_id       UUID        -- FK
  process_id        UUID        -- FK
  plan_date         DATE        -- partition key
  time_slot_start   TIMESTAMPTZ
  time_slot_end     TIMESTAMPTZ
  status            ENUM        -- PLANNED, CONFIRMED, IN_PROGRESS, COMPLETED, CANCELLED
  skill_level_used  SMALLINT
  productivity_mult DECIMAL
  override_reason   TEXT
  created_at        TIMESTAMPTZ
  updated_at        TIMESTAMPTZ
)
```

At enterprise scale: 5,000 sites x 300 employees/site x 365 days x 3 shifts/day = **1.64 billion rows per year**. With 5 years of retention, the table reaches **8.2 billion rows**.

**Query patterns that degrade:**

| Query Pattern | MVP Latency | Growth Latency (est.) | Enterprise Latency (est.) | Breaking Point |
|---------------|-------------|----------------------|--------------------------|----------------|
| Single-site daily plan (1 site, 1 day) | < 50 ms | < 50 ms | < 100 ms | Stable -- index on (tenant_id, site_id, plan_date) |
| Site weekly summary (1 site, 7 days) | < 100 ms | < 200 ms | < 500 ms | Manageable with partitioning |
| Cross-site headcount (all sites, 1 day) | < 200 ms | 1-3 s | 10-30 s | Breaks at 500+ sites without materialized views |
| Regional trend report (100 sites, 90 days) | < 500 ms | 3-8 s | 30-120 s | Breaks at Growth scale; requires pre-aggregation |
| Enterprise utilization (all sites, 30 days) | < 1 s | 10-30 s | 2-10 min | Breaks at Growth scale; requires async + MVs |
| Full export (all data, 1 year) | 2-5 s | 5-30 min | Hours | Must be async with streaming at any scale above MVP |

### 2.3 Data Scale Mitigations

**Partitioning Strategy:**

```
shift_assignments
├── partition by RANGE (plan_date)
│   ├── shift_assignments_2026_01  (Jan 2026)
│   ├── shift_assignments_2026_02  (Feb 2026)
│   ├── ...
│   └── shift_assignments_2026_12  (Dec 2026)
```

Monthly partitioning provides:
- Query pruning: queries scoped to a date range only scan relevant partitions
- Maintenance: old partitions can be detached, archived to cold storage, and dropped without locking the entire table
- Vacuum efficiency: each partition is vacuumed independently

At enterprise scale, consider sub-partitioning by `tenant_id` (hash partitioning within each monthly range partition) to prevent any single partition from exceeding 100M rows.

**Archival Policy:**

| Data Age | Storage Tier | Query Access | Cost Tier |
|----------|-------------|--------------|-----------|
| 0-90 days | Hot (primary PostgreSQL) | Full query, sub-second | $$$ |
| 91-365 days | Warm (read replica, partitions on slower storage) | Query with 1-5s latency acceptable | $$ |
| 1-5 years | Cold (Parquet files in S3/GCS, queryable via DuckDB or Athena) | Analytics-only, minutes latency | $ |
| 5+ years | Archive (compressed, S3 Glacier) | Restore-on-request, hours latency | ¢ |

**Summary Tables (Materialized Views):**

| Summary Table | Grain | Refresh Cadence | Source |
|---------------|-------|-----------------|--------|
| `mv_daily_headcount` | site x date x process | Hourly (hot) / Daily (warm) | shift_assignments |
| `mv_weekly_utilization` | site x week x process | Daily | shift_assignments + demand |
| `mv_monthly_cost` | site x month | Weekly | shift_assignments + pay rates |
| `mv_skill_coverage` | site x process x skill_level | Daily | shift_assignments + employee_skills |
| `mv_plan_accuracy` | site x date | Daily (next day) | shift_assignments + actuals |

These summary tables reduce enterprise-wide reporting queries from billions of rows to millions, bringing latency back to seconds.

### 2.4 Estimated Query Performance Degradation Curves

```
Response Time (seconds)
│
│                                                          ╱ No optimization
30s ┤                                                    ╱
│                                                      ╱
│                                                    ╱
20s ┤                                                ╱
│                                                ╱
│                                              ╱
10s ┤                                          ╱
│                                        ╱              ╱ With partitioning only
│                                     ╱           ╱
5s  ┤                               ╱         ╱
│                            ╱        ╱
│                         ╱      ╱
2s  ┤                     ╱   ╱
│                    ╱ ╱                ╱ With partitioning + MVs
1s  ┤                ╱╱           ╱
│             ╱─ ─ ─ ─ ─ ─ ╱─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
│          ╱          ╱
500ms┤      ╱─ ─ ─ ╱─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─
│       ╱     ╱
│     ╱   ╱
│   ╱  ╱
│  ╱╱
└──┬──────┬──────┬──────┬──────┬──────┬──────────────
  50     500    1K     2K     3K     5K   Sites
       (MVP)  (Growth)              (Enterprise)

Query: "Cross-site headcount summary for today, all sites"
```

---

## 3. Dimension 2: Compute Scale

### 3.1 Optimization Compute

The assignment optimization stage is the most compute-intensive component. Solver complexity varies by problem structure:

| Problem Type | Variables | Constraints | Typical Solve Time | Scaling Behavior |
|-------------|-----------|-------------|-------------------|------------------|
| Single site, 50 employees, 10 processes | ~500 | ~2,000 | < 1 s | Linear |
| Single site, 200 employees, 20 processes | ~4,000 | ~15,000 | 2-5 s | Quadratic |
| Single site, 500 employees, 30 processes | ~15,000 | ~50,000 | 15-60 s | Super-linear |
| Single site, 1,000 employees, 50 processes | ~50,000 | ~200,000 | 2-10 min | Super-linear |
| Cross-site, 10 sites, shared labor | ~40,000 | ~150,000 + link constraints | 5-30 min | Depends on coupling |
| Cross-site, 100 sites, shared labor | ~400,000 | ~1,500,000 + link constraints | Hours (infeasible as monolith) | Must decompose |

**Breaking point:** A monolithic solver for 100+ sites with shared labor pools is computationally infeasible within any reasonable time budget. The solve time grows approximately as O(n^2.5) where n is the number of decision variables.

**Mitigation: Hierarchical Decomposition**

```
Phase 1: Site-Level Solve (parallel)
├── Site A: solve independently (2s)
├── Site B: solve independently (3s)
├── Site C: solve independently (2s)
├── ... (up to 5,000 sites in parallel)
└── All sites solved in max(individual solve times) ≈ 5-60s

Phase 2: Cross-Site Reconciliation (sequential)
├── Identify shared employees assigned at multiple sites
├── Resolve conflicts using priority rules (primary site first)
├── Identify cross-site capacity transfers
└── Adjust affected sites with fixed constraints from Phase 1
    └── Typical solve time: 30-120s for 100 connected sites
```

With decomposition, enterprise-wide planning completes in 2-5 minutes instead of hours.

### 3.2 AI Compute (Claude API)

| Usage Pattern | Tokens per Call (est.) | Calls per Day (MVP) | Calls per Day (Enterprise) | Daily Token Usage (Enterprise) |
|---------------|----------------------|---------------------|---------------------------|-------------------------------|
| Setup wizard turn | 2K in / 1K out | 50 | 500 | 1.5M |
| Plan explanation | 3K in / 500 out | 200 | 20,000 | 70M |
| AI recommendation | 5K in / 2K out | 50 | 5,000 | 35M |
| Natural language constraint | 1K in / 500 out | 20 | 2,000 | 3M |
| **Total** | | **320** | **27,500** | **~110M tokens/day** |

At Claude Sonnet pricing ($3/M input, $15/M output): ~110M tokens/day split roughly 70% input / 30% output = $231 input + $495 output = **~$726/day = ~$22K/month** at enterprise scale.

**Mitigation:**
- Response caching reduces calls by 40-60%: **$9K-$13K/month**
- Model tiering (Haiku for simple tasks) reduces cost by additional 30%: **$6K-$9K/month**
- Batch processing for recommendations reduces per-call overhead

**Rate Limit Considerations:**

| Anthropic Tier | Requests/min | Tokens/min | Sufficient for |
|----------------|-------------|------------|----------------|
| Tier 1 | 50 | 40K | MVP (5 tenants) |
| Tier 2 | 1,000 | 400K | Growth (50 tenants) |
| Tier 3 | 4,000 | 2M | Enterprise (200 tenants) |
| Custom | Negotiated | Negotiated | Large enterprise |

At enterprise scale with 27,500 calls/day, average rate is ~19 calls/min. Peak rate (morning planning window, 7-9 AM across time zones) could reach 200-500 calls/min. Tier 2 is sufficient for expected peak load; Tier 3 provides headroom.

### 3.3 Real-Time (WebSocket) Connections

Supabase Realtime provides WebSocket connections for live plan updates, presence indicators, and notification delivery.

| Scale | Concurrent Users (est.) | WebSocket Connections | Supabase Limit (Pro) | Supabase Limit (Enterprise) |
|-------|------------------------|----------------------|--------------------|-----------------------------|
| MVP | 50-200 | 50-200 | 500 | 10,000+ |
| Growth | 500-2,000 | 500-2,000 | 500 (exceeded) | 10,000+ |
| Enterprise | 5,000-20,000 | 5,000-20,000 | N/A | Custom negotiation |

**Breaking point:** Supabase Pro plan's 500 concurrent Realtime connections is exceeded at Growth scale. Enterprise plan or self-hosted Supabase is required.

**Mitigation:**
- Limit Realtime connections to active planning sessions only (not dashboards)
- Use polling (30s interval) for non-critical updates (dashboards, reports)
- Implement connection multiplexing: one WebSocket per browser tab, not per component
- At enterprise scale, consider a dedicated WebSocket service (Socket.IO, Ably) for presence and notifications, using Supabase Realtime only for database change streams

### 3.4 Background Job Queue

During peak planning periods (typically 5-8 AM local time when day-shift plans are finalized), the background job queue experiences heavy load:

| Job Type | Duration | Frequency (MVP) | Frequency (Enterprise) | Peak Queue Depth |
|----------|----------|-----------------|----------------------|-----------------|
| Plan generation | 2-60 s | 10/hour | 1,000/hour | 200 |
| Demand ingestion | 1-5 s | 50/hour | 5,000/hour | 500 |
| Report generation | 5-300 s | 5/hour | 500/hour | 100 |
| Integration sync | 2-30 s | 20/hour | 2,000/hour | 300 |
| Data quality check | 1-10 s | 10/hour | 1,000/hour | 200 |
| **Total peak** | | **95/hour** | **9,500/hour** | **~1,300** |

**Breaking point:** If all enterprise sites re-plan simultaneously (e.g., overnight batch planning), the queue receives 5,000 plan generation jobs within a 30-minute window. With average solve time of 10 seconds, sequential processing takes 14 hours. This is unacceptable.

**Mitigation:**
- **Horizontal worker scaling**: auto-scale background workers during peak. Target: process 500 jobs/minute with 50 parallel workers.
- **Priority queuing**: plan generation jobs for operational horizon (today/tomorrow) have higher priority than tactical (next week) or strategic (next quarter) plans.
- **Time-zone staggering**: global enterprises naturally stagger peak load across time zones (US morning planning does not overlap with EU morning planning). The queue benefits from this temporal distribution.
- **Solver caching**: if demand has not changed since the last solve, return the cached plan without re-solving (cache hit rate for unchanged sites: ~30-50%).

---

## 4. Dimension 3: Organizational Scale

### 4.1 Configuration Complexity

Each site has its own configuration: process catalog, productivity standards, shift patterns, labor rules, skill requirements, and integration mappings. At 1,000 sites, configuration management becomes a major operational burden.

**Problem scenarios:**

| Scenario | Impact |
|----------|--------|
| A productivity standard is updated at HQ but not propagated to 800 sites | Plans are inconsistent across the network |
| Each site customizes labor rules slightly, creating 1,000 unique rule sets | Support cannot diagnose issues without understanding each site's rules |
| A new process is introduced (e.g., drone delivery staging) at 200 sites | 200 manual configurations required |
| A regulatory change affects 500 sites in one jurisdiction | Must identify affected sites and update rules without breaking others |

**Mitigation: Configuration Hierarchy**

```
Organization (Global Defaults)
├── Region (US, EU, APAC)
│   ├── Country (US, UK, DE, AU)
│   │   ├── State/Province (CA, TX, NY)
│   │   │   └── Site (Site-specific overrides)
│   │   └── Site
│   └── Country
└── Region

Inheritance: Site inherits from State > Country > Region > Organization
Override: Any level can override any inherited setting
Audit: Every override is logged with reason and approver
```

This reduces 1,000 unique configurations to: 1 org-level base + 3-5 regional overrides + 10-20 country overrides + 50-100 site-specific exceptions. The remaining 880+ sites inherit defaults without any per-site configuration.

**Configuration drift detection:** A weekly job compares each site's effective configuration against its expected baseline (inherited settings). Deviations are reported to regional managers for review.

### 4.2 Permission Model Scaling

| Scale | Users | Roles | Permission Rules | Complexity |
|-------|-------|-------|-----------------|------------|
| MVP | 50 | 5 | ~250 | Manageable |
| Growth | 500 | 15 | ~7,500 | Needs tooling |
| Enterprise | 5,000 | 30 | ~150,000 | Needs hierarchy + automation |

The RBAC model must support:

- **Role hierarchy**: `Super Admin > Org Admin > Regional Manager > Site Manager > Shift Supervisor > Planner > Viewer`
- **Scope binding**: a role is always bound to a scope (org, region, site). "Site Manager at Site-Chicago" has full access to Chicago data and no access to Houston data.
- **Inherited access**: a "Regional Manager for US-Central" has implicit read access to all sites in the US-Central region without per-site grants.
- **Delegated administration**: Site Managers can create Planner and Viewer roles within their site without requiring Org Admin intervention.

**Performance concern:** Permission checks must not add > 5 ms to each API request. At enterprise scale with 150,000 permission rules, a naive implementation (query permissions table per request) would add 20-50 ms. Mitigation: cache effective permissions per user session in a Redis-compatible store (Supabase: pg_session_jwt or external Redis). Cache invalidation on permission changes is scoped to affected users only.

### 4.3 Data Isolation

Multi-tenancy with shared infrastructure requires absolute data isolation. A single data leak between tenants is a contract-terminating, potentially lawsuit-inducing event.

**Isolation layers:**

| Layer | Mechanism | Verification |
|-------|-----------|--------------|
| Database (primary) | PostgreSQL RLS on every table, keyed on `tenant_id` | Automated tests: create data as Tenant A, query as Tenant B, assert empty result. Run on every schema migration. |
| API | Middleware extracts `tenant_id` from JWT, sets as PostgreSQL session variable | Integration tests: authenticate as Tenant A, request Tenant B's resources, assert 403. |
| File storage | Supabase Storage policies scoped to tenant-specific buckets | Manual review quarterly; automated scan for misconfigured buckets. |
| Search/indexing | If full-text search is introduced, index per tenant or filter at query time | Index isolation test on every deployment. |
| Logs | Tenant ID included in every log entry; log access restricted by tenant | Log access audit quarterly. |
| AI prompts | Never include Tenant A's data in prompts for Tenant B | Prompt construction reviewed in code review; tenant context set in AI service layer. |
| Caching | Cache keys prefixed with `tenant_id`; cache flush scoped to tenant | Cache key audit on every new caching implementation. |

### 4.4 Onboarding Provisioning Time

| Scale Phase | New Tenant Provisioning | Target Time | Current Estimate |
|-------------|------------------------|-------------|------------------|
| MVP | Create tenant record, seed base config, provision storage bucket | < 5 minutes | 15-30 minutes (manual) |
| Growth | Above + configure integration endpoints, import initial data, validate | < 1 hour | 2-5 days (semi-manual) |
| Enterprise | Above + multi-site bulk setup, regional rule config, SSO integration, data migration from legacy | < 1 day | 2-4 weeks (manual) |

**Target state (automated):**
- Tenant provisioning (database records, storage, auth): **< 30 seconds** (API-driven, fully automated)
- Base configuration from template: **< 2 minutes** (template application + AI wizard)
- Integration configuration: **< 30 minutes** (guided, with automated connection testing)
- Data import (50,000 employees): **< 10 minutes** (bulk import pipeline)
- Validation and first plan: **< 1 hour** (AI-assisted validation + one-click plan)
- **Total: < 2 hours for a self-service onboarding, < 1 day for enterprise with SI support**

---

## 5. Dimension 4: Geographic Scale

### 5.1 Multi-Region Deployment

| Region | Data Center | Latency from US-East | Use Case |
|--------|-------------|---------------------|----------|
| US-East (primary) | AWS us-east-1 / Supabase | -- | US customers, global default |
| US-West | AWS us-west-2 | ~60 ms | US West Coast customers |
| EU-West | AWS eu-west-1 | ~80 ms | EU customers (GDPR compliance) |
| APAC | AWS ap-southeast-1 | ~200 ms | Asia-Pacific customers |

**Latency impact on user experience:**

| Operation | Acceptable Latency | Single-Region (US-East) for EU User | Multi-Region (EU-West) for EU User |
|-----------|-------------------|-------------------------------------|-------------------------------------|
| Page load (cached) | < 200 ms | ~300 ms (CDN helps) | < 100 ms |
| API call (simple) | < 300 ms | ~400 ms | < 150 ms |
| Plan generation trigger | < 500 ms | ~500 ms | < 200 ms |
| WebSocket event | < 100 ms | ~180 ms | < 50 ms |
| Report download | < 2 s | ~3 s | < 1.5 s |

Multi-region deployment reduces p95 API latency for EU users from ~400 ms to ~150 ms, a meaningful improvement for interactive planning workflows.

### 5.2 Data Residency Requirements

| Regulation | Jurisdiction | Requirement | Impact |
|------------|-------------|-------------|--------|
| GDPR | EU/EEA | Personal data of EU residents must be processed in the EU (or under adequacy agreements) | Must deploy EU database instance |
| UK GDPR | UK | Similar to GDPR, post-Brexit separate regulation | UK may share EU instance or require separate |
| PIPEDA | Canada | Data should remain in Canada where feasible; cross-border transfers need contractual safeguards | Canadian customers may require dedicated instance |
| Privacy Act 1988 | Australia | APP 8 requires reasonable steps to protect data transferred overseas | Australian customers may prefer APAC instance |
| PDPA | Singapore | Transfer restrictions with contractual requirements | Covered by APAC instance |
| State laws (US) | Various US states | Generally no data residency requirement, but some sector-specific rules | US-East or US-West sufficient |

**Architecture for data residency:**

```
Global Control Plane (US-East)
├── Organization registry
├── User authentication (global SSO)
├── Billing and subscription management
├── Global configuration templates
└── Cross-region orchestration

Regional Data Planes
├── US Data Plane (US-East)
│   ├── PostgreSQL (Supabase project)
│   ├── File storage
│   ├── Background workers
│   └── API servers
├── EU Data Plane (EU-West)
│   ├── PostgreSQL (Supabase project)
│   ├── File storage
│   ├── Background workers
│   └── API servers
└── APAC Data Plane (APAC)
    ├── PostgreSQL (Supabase project)
    ├── File storage
    ├── Background workers
    └── API servers
```

The global control plane contains no PII. All employee data, plans, demand data, and operational records reside in the regional data plane. A tenant is assigned to one region and cannot span regions (an organization with US and EU operations creates two tenants, one per region, linked by a parent organization ID in the control plane).

### 5.3 Multi-Language, Multi-Currency, Multi-Regulation

| Dimension | MVP | Growth | Enterprise |
|-----------|-----|--------|------------|
| Languages | English | English, Spanish, French, German | 15+ languages via i18n framework |
| Currencies | USD | USD, EUR, GBP, CAD | 20+ currencies via currency service |
| Regulations | US Federal + 5 states | US (20 states), UK, Germany | 40+ jurisdictions |
| Date/time formats | US (MM/DD/YYYY) | US, EU (DD/MM/YYYY), ISO | Locale-driven |
| Number formats | US (1,234.56) | US, EU (1.234,56) | Locale-driven |

**Implementation approach:**
- All strings in the UI pass through an i18n framework (react-intl or similar). No hardcoded English strings.
- All monetary values stored as integers in smallest denomination (cents) with currency code. Display formatting is locale-driven.
- All dates stored as ISO-8601 / UTC. Display formatting is locale-driven.
- Regulation rules are tagged with jurisdiction codes and loaded based on site configuration.

### 5.4 Time Zone Handling Across Global Operations

A global enterprise with sites in 15 time zones faces unique planning challenges:

| Challenge | Description | Solution |
|-----------|-------------|----------|
| "Today" means different things | When a US-East planner views "today's plan," it's already tomorrow in Singapore | All date references use the site's local date, not the viewer's date. Cross-site views label dates with timezone. |
| Batch planning window overlap | If batch planning runs at "2 AM local time" for every site, the global queue receives waves of jobs across 24 hours | Beneficial for load distribution -- no global peak. Scheduler runs per-site at the configured local time. |
| Cross-site reporting periods | "This week" starts Monday in Europe, Sunday in the US | Configurable week-start per region. Reports specify the reporting period explicitly. |
| DST transitions | 2 transitions per year per timezone, on different dates | All computations in UTC. DST-aware date library (Luxon). Shift duration calculated from UTC, not wall clock. |
| Real-time monitoring | A global ops center monitors all sites simultaneously | Dashboard displays current local time per site. "Active shifts" query converts each site's current time to UTC for the filter. |

---

## 6. Scaling Strategy Roadmap

### Phase 1: MVP (Months 1-6)

| Parameter | Target |
|-----------|--------|
| Tenants | < 10 |
| Sites | < 50 |
| Employees | < 5,000 |
| Region | Single (US-East) |
| Database | Single Supabase Pro project |
| Solver | Single-threaded, per-site |
| AI | Claude Sonnet, single API key |
| Background jobs | Supabase Edge Functions |

**Architecture:** Monolithic Next.js application on Vercel. Single PostgreSQL database via Supabase. No partitioning, no read replicas, no multi-region. All components in US-East.

**What works at this scale:** Everything. A single PostgreSQL instance handles 5,000 employees and 50 sites without any optimization. Solver runs for individual sites complete in seconds. Claude API costs are negligible ($200-500/month).

### Phase 2: Growth (Months 6-18)

| Parameter | Target |
|-----------|--------|
| Tenants | < 50 |
| Sites | < 500 |
| Employees | < 50,000 |
| Region | US-East + EU-West |
| Database | Supabase Pro + read replica |
| Solver | Multi-threaded, parallel per-site |
| AI | Claude Sonnet + Haiku, tiered |
| Background jobs | Dedicated worker service (containerized) |

**Architectural changes required:**
1. **Table partitioning**: implement monthly partitioning on `shift_assignments` and `demand_signals`
2. **Read replicas**: route all reporting and analytics queries to read replicas
3. **Materialized views**: create pre-aggregated summary tables for dashboard queries
4. **EU data plane**: deploy a second Supabase project in EU region for GDPR compliance
5. **Background worker service**: migrate from Supabase Edge Functions to a dedicated containerized worker service (ECS/Cloud Run) for plan generation and heavy batch jobs
6. **Connection pooling**: deploy PgBouncer for transaction-mode connection pooling
7. **AI model tiering**: implement Haiku for simple tasks, Sonnet for standard, reserve Opus for complex reasoning
8. **Solver parallelism**: run site-level solves in parallel using worker threads or distributed across containers

**Estimated effort:** 3-4 engineers for 4-6 months.

### Phase 3: Enterprise (Months 18-36)

| Parameter | Target |
|-----------|--------|
| Tenants | < 200 |
| Sites | < 5,000 |
| Employees | < 500,000 |
| Region | US-East + US-West + EU-West + APAC |
| Database | Multi-region Supabase + cold storage archival |
| Solver | Distributed solver with hierarchical decomposition |
| AI | Claude API with custom agreement, response caching layer |
| Background jobs | Kubernetes-based auto-scaling job queue |

**Architectural changes required:**
1. **Global control plane**: separate the global metadata service (org registry, auth, billing) from regional data planes
2. **APAC data plane**: third regional deployment for Asia-Pacific customers
3. **Archival pipeline**: implement cold storage archival for historical data (> 1 year)
4. **Distributed solver**: deploy solver as a stateless microservice with auto-scaling. Hierarchical decomposition for cross-site optimization.
5. **AI response caching**: deploy a caching layer (Redis) for AI responses. Cache explanations, recommendations, and wizard responses.
6. **Auto-scaling workers**: Kubernetes-based worker pools with auto-scaling based on queue depth. Target: 500 concurrent plan generation jobs.
7. **Advanced monitoring**: distributed tracing (OpenTelemetry), per-tenant resource tracking, capacity forecasting
8. **Configuration management service**: dedicated service for hierarchical configuration with inheritance, override tracking, and drift detection

**Estimated effort:** 6-8 engineers for 12-18 months.

### Summary: What Changes at Each Phase

| Component | MVP | Growth Change | Enterprise Change |
|-----------|-----|---------------|-------------------|
| Database | Single PG | + Partitioning, read replicas, MVs | + Multi-region, archival, sub-partitioning |
| Compute | Serverless functions | + Dedicated workers, parallel solver | + K8s auto-scaling, distributed solver |
| AI | Single model, direct calls | + Model tiering | + Response cache, custom rate limits |
| Storage | Single Supabase | + EU region | + APAC region, cold storage |
| Auth | Supabase Auth | + SSO (SAML/OIDC) | + Multi-region auth, delegated admin |
| Monitoring | Basic logging | + APM, per-tenant metrics | + Distributed tracing, capacity forecasting |
| Configuration | Flat per-site | + Templates, basic inheritance | + Hierarchical config service, drift detection |
| Deployment | Vercel + Supabase | + Containerized workers | + Multi-region K8s, global control plane |

---

## 7. Cost Scaling Analysis

### 7.1 Supabase Costs

| Tier | Plan | Monthly Cost | Included | Suitable For |
|------|------|-------------|----------|--------------|
| Free | Free | $0 | 500 MB DB, 1 GB storage, 50K edge fn invocations | Development/testing |
| Pro | Pro | $25/project | 8 GB DB, 100 GB storage, 2M edge fn invocations | MVP (single project) |
| Pro + addons | Pro | $25 + usage | Compute addon ($150-1,200), PITR ($100), read replicas ($300+) | Growth |
| Enterprise | Custom | $3,000-10,000+ | Custom limits, SLA, dedicated support | Enterprise |

**Projected Supabase costs by scale:**

| Scale | Projects | Compute | Storage | Replicas | Total/month |
|-------|----------|---------|---------|----------|-------------|
| MVP | 1 Pro | Small ($150) | 20 GB ($0) | 0 | $175 |
| Growth | 2 Pro (US+EU) | Medium x2 ($600) | 200 GB ($50) | 2 ($600) | $1,300 |
| Enterprise | 3 Enterprise | Large x3 ($3,600) | 2 TB ($500) | 6 ($1,800) | $9,900+ |

### 7.2 Claude API Costs

| Scale | Daily Calls | Daily Tokens | Model Mix | Monthly Cost |
|-------|------------|-------------|-----------|-------------|
| MVP | 320 | ~5M | 100% Sonnet | $200-500 |
| Growth | 3,000 | ~50M | 60% Sonnet, 30% Haiku, 10% Opus | $2,000-4,000 |
| Enterprise | 27,500 | ~110M | 50% Sonnet, 40% Haiku, 10% Opus (with caching) | $6,000-12,000 |

### 7.3 Vercel Costs

| Scale | Plan | Bandwidth | Serverless Invocations | Monthly Cost |
|-------|------|-----------|----------------------|-------------|
| MVP | Pro ($20/dev) | 1 TB | 1M | $20-100 |
| Growth | Pro + team | 5 TB | 10M | $200-500 |
| Enterprise | Enterprise | 20 TB+ | 100M+ | $2,000-5,000 |

### 7.4 Additional Infrastructure (Growth and Enterprise)

| Component | Growth/month | Enterprise/month |
|-----------|-------------|-----------------|
| Background workers (ECS/Cloud Run) | $300-800 | $2,000-5,000 |
| Redis (caching) | $50-200 | $500-1,500 |
| Monitoring (Datadog/New Relic) | $200-500 | $1,000-3,000 |
| CDN (Cloudflare/Fastly) | $0-100 | $500-1,500 |
| Cold storage (S3/GCS) | $10-50 | $200-500 |
| DNS, certificates, misc | $50 | $200 |

### 7.5 Total Infrastructure Cost Summary

| Scale Tier | Sites | Employees | Monthly Infra Cost | Cost per Site/month | Cost per Employee/month |
|------------|-------|-----------|-------------------|--------------------|-----------------------|
| MVP | 50 | 5,000 | $500-$900 | $10-$18 | $0.10-$0.18 |
| Growth | 500 | 50,000 | $4,000-$7,500 | $8-$15 | $0.08-$0.15 |
| Enterprise | 5,000 | 500,000 | $22,000-$40,000 | $4.40-$8.00 | $0.04-$0.08 |

**Key insight:** Infrastructure cost per site and per employee *decreases* with scale due to shared fixed costs (compute baseline, monitoring, support tooling) and caching efficiency. At enterprise scale, infrastructure cost is approximately $5-8 per site per month or $0.05-0.08 per employee per month -- a negligible fraction of the labor cost being optimized ($15,000-50,000/month in labor per site for a typical DC).

---

## 8. Scaling Risk Summary

| Risk | Breaking Point | Mitigation Readiness | Action Required |
|------|---------------|---------------------|-----------------|
| Database query performance | 500+ sites without partitioning | Design ready, not implemented | Implement before Growth phase |
| Solver compute time | 100+ sites with shared labor | Algorithm designed, not benchmarked | Benchmark hierarchical decomposition at 100-site scale |
| WebSocket connection limits | 500 concurrent users (Supabase Pro) | Alternative known (Enterprise plan or external service) | Evaluate before Growth phase |
| Background job queue saturation | 5,000 simultaneous plan generations | Auto-scaling worker design ready | Implement at Growth phase |
| AI API cost escalation | 200+ tenants without caching | Caching layer designed, not built | Implement before Growth phase |
| Configuration management | 500+ sites with unique rules | Hierarchical config designed, not built | Implement at Growth phase |
| Data residency | First EU customer | Multi-project approach identified | Implement EU data plane before first EU customer |
| Multi-region latency | First APAC customer with interactive planning | Architecture designed | Deploy APAC data plane based on customer demand |
