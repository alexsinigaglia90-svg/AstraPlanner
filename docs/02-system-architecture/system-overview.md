# System Overview

## 1. Purpose and Scope

AstraPlanner is an AI-driven workforce planning platform purpose-built for logistics environments -- warehouses, distribution centers, fulfillment hubs, and transportation depots. It translates demand signals into executable workforce plans, combining autonomous optimization with human override capability.

The platform answers one question at every level of the organization: **"How many of which people, with what skills, need to be where, and when?"**

AstraPlanner operates across three planning horizons:

| Horizon | Timeframe | Use Case | Replanning Frequency |
|---------|-----------|----------|----------------------|
| Strategic | 6-18 months | Headcount budgeting, hiring pipelines, site capacity | Weekly |
| Tactical | 1-12 weeks | Shift pattern design, cross-training plans, temp labor procurement | Daily |
| Operational | 0-7 days | Daily shift assignments, real-time rebalancing, absence coverage | On-demand (minutes) |

---

## 2. Three-Layer Architecture

AstraPlanner is structured as three distinct architectural layers, each with clear responsibilities. All layers run on a Supabase-centric backend with a Next.js frontend, connected by tRPC for end-to-end type safety.

```
+=====================================================================+
|                      INTERACTION LAYER                              |
|                      (Vercel — Next.js 14+ SSR)                    |
|  +-------------+  +----------------+  +-------------+  +--------+  |
|  | Setup Wizard |  | Control Room   |  | Planning    |  | Alerts |  |
|  | (Config UI)  |  | (Dashboards)   |  | Workbench   |  | & Notif|  |
|  +------+------+  +-------+--------+  +------+------+  +---+----+  |
+=========|==================|=================|==============|=======+
          |       tRPC (end-to-end typed)       |              |
          |       Supabase Realtime (WS)        |              |
+---------v------------------v-----------------v--------------v-------+
|                      INTELLIGENCE LAYER                             |
|                  (Supabase Edge Functions — Deno/TS)                |
|  +-----------+  +----------+  +----------+  +--------+  +-------+  |
|  | Demand    |  | Workload |  | Optim.   |  |Scenario|  | AI    |  |
|  | Ingestion |  | Compute  |  | Engine   |  |Simulatr|  |Advisor|  |
|  | (V1:CSV/  |  +----+-----+  | (HiGHS   |  |(Simple |  |(Claude|  |
|  |  REST)    |  |    |        |  WASM)   |  | what-if|  | API)  |  |
|  +-----+-----+  +----+-----+  +----+-----+  +---+----+  +--+----+  |
+========|==============|=============|============|===========|======+
         |              |             |            |           |
+---------v--------------v-------------v------------v-----------v------+
|                        DATA LAYER                                    |
|                (Supabase PostgreSQL + RLS)                           |
|  +----------+  +-----------+  +-----------+  +----------+           |
|  | Demand   |  | HR /      |  | Site      |  | Events & |           |
|  | Signals  |  | Workforce |  | Config    |  | Audit Log|           |
|  | (CSV/API)|  | Data      |  | Store     |  |          |           |
|  +----------+  +-----------+  +-----------+  +----------+           |
|                                                                      |
|  +------------------+  +------------------+  +-------------------+   |
|  | PostgreSQL 16    |  | pgvector         |  | Supabase Storage  |   |
|  | (JSONB, RLS,     |  | (AI Embeddings)  |  | (Files, Exports)  |   |
|  |  pg_cron)        |  |                  |  |                   |   |
|  +------------------+  +------------------+  +-------------------+   |
+======================================================================+

    +-------------------+   +-------------------+
    | Upstash Redis     |   | Fly.io Workers    |
    | (Cache, BullMQ    |   | (Heavy compute:   |
    |  job queues)      |   |  large MIP solves)|
    +-------------------+   +-------------------+

               EXTERNAL SYSTEMS (Inbound only for MVP)
    +-------+  +-------+  +-------+  +-------+
    |  ERP  |  |  WMS  |  | HRIS  |  |  CSV  |
    | (opt) |  | (opt) |  | (opt) |  |Upload |
    +-------+  +-------+  +-------+  +-------+
```

### Where Things Run

| Component | Runtime | Responsibility |
|-----------|---------|---------------|
| **Next.js App** | Vercel (Node.js 20, SSR + Edge Middleware) | UI rendering, tenant routing, static assets via CDN |
| **tRPC Routers** | Supabase Edge Functions (Deno/TypeScript) | API endpoints, business logic, AI gateway, demand processing |
| **HiGHS Solver** | Supabase Edge Functions (WASM) | Small-to-medium optimization (< 5,000 variables, < 10s solve time) |
| **Heavy Compute** | Fly.io (containerized workers) | Large MIP solves (> 60s), batch processing, bulk imports |
| **Database** | Supabase Managed PostgreSQL 16 | All persistent state, RLS-enforced multi-tenancy, pgvector, pg_cron |
| **Cache / Queues** | Upstash Redis | Session cache, BullMQ job queues, rate limiting |
| **File Storage** | Supabase Storage | CSV uploads, schedule exports, wizard assets |
| **Auth** | Supabase Auth | JWT-based auth, SSO/SAML, MFA, custom claims |
| **Real-time** | Supabase Realtime | WebSocket channels for live updates, presence, plan collaboration |

---

## 3. Data Layer

The Data Layer is the foundation. It owns all persistent state, manages data ingestion, enforces schema consistency via PostgreSQL and Row-Level Security, and provides queryable storage to the Intelligence Layer.

### 3.1 Ingestion Pipelines

All external data enters AstraPlanner through managed ingestion pathways. For MVP, ingestion is limited to CSV upload and REST API -- real-time streaming is out of scope.

```
Source --> Upload/API --> Validate + Enrich --> Insert (PostgreSQL) --> Notify (Supabase Realtime)
```

| Pipeline | Source | Ingestion Mode | Typical Volume | Freshness Target |
|----------|--------|----------------|----------------|------------------|
| Demand Feed | Manual CSV upload, REST API | Batch (on-demand upload, scheduled API pull) | 1K-50K rows per upload | < 5 min after upload |
| HR / Workforce | CSV import, HRIS webhook (optional) | Batch import + event-triggered updates | 50-5,000 employee records/tenant | < 15 min for changes |
| Site Configuration | Setup wizard, admin UI | Event-driven on admin changes | 1-50 site records/tenant | Immediate |

### 3.2 Demand Feeds

Demand data is the primary input to the entire planning chain. AstraPlanner normalizes demand from uploads and API calls into a canonical `DemandSignal` structure:

```
DemandSignal {
  signal_id:        UUID
  tenant_id:        UUID
  site_id:          UUID
  source:           enum (CSV_UPLOAD, REST_API, EXTERNAL_FORECAST)
  demand_type:      enum (UNITS, ORDERS, LINES, PALLETS, CASES, WEIGHT_KG)
  process_path:     string          // e.g., "INBOUND.RECEIVING.UNLOAD"
  period_start:     ISO-8601
  period_end:       ISO-8601
  quantity:         decimal
  confidence:       float [0.0-1.0]  // confidence of the external forecast
  version:          int              // supports multiple forecast versions
  metadata:         JSONB            // source-specific attributes
  ingested_at:      ISO-8601
}
```

Demand feeds support versioning: when a new forecast arrives, it does not overwrite the previous version. Both are retained, enabling forecast accuracy tracking and audit trails.

> **V2 scope**: Built-in demand forecasting (statistical models, ML-based prediction) is planned for V2. MVP relies on external forecast ingestion -- customers generate forecasts in their existing ERP/WMS systems and upload or push them to AstraPlanner.

### 3.3 HR / Workforce Data

The Workforce Registry stores the canonical employee record:

- **Identity**: employee ID, name, employment type (FTE, part-time, temp, agency)
- **Skills & Certifications**: skill list with proficiency levels, expiry dates
- **Contracts**: contracted hours, shift preferences, overtime limits
- **Availability**: planned leave, recurring unavailability
- **Cost**: hourly rate, overtime multiplier, agency markup
- **Assignment History**: past site/role assignments for preference modeling

For MVP, employee data is imported via CSV or entered through the admin UI. HRIS integration is available as an optional webhook receiver but is not required.

### 3.4 Site Configurations

Each site is modeled as a hierarchical structure:

```
Tenant (Organization)
  └── Site (e.g., "DFW-DC-04")
       └── Zone (e.g., "Receiving Dock A")
            └── Process Path (e.g., "INBOUND.RECEIVING.UNLOAD")
```

Site configuration includes:

- **Operating hours**: shift windows, break policies
- **Process definitions**: which logistics processes run at this site (receive, put-away, pick, pack, ship, VAS, returns)
- **Productivity standards**: engineered rates per process per skill level (units/hour)
- **Capacity constraints**: max headcount per zone
- **Labor rules**: mandatory rest periods, jurisdiction-specific regulations

### 3.5 Storage Architecture

| Store | Technology | Data | Retention |
|-------|-----------|------|-----------|
| Primary DB | PostgreSQL 16 (Supabase managed) with JSONB, RLS | Plans, assignments, configurations, employees, demand, events | Active + 2 years |
| Vector Store | pgvector extension in same PostgreSQL instance | AI embeddings for semantic search (skills, processes) | Active |
| File Storage | Supabase Storage (S3-compatible) | CSV uploads, schedule exports, wizard assets, report snapshots | 2 years (configurable) |
| Cache | Upstash Redis (serverless) | Session state, computed plan snapshots, rate limiting, BullMQ queues | TTL-based (minutes to hours) |
| Audit Log | PostgreSQL `events` table (append-only) | All domain events and state-change audit entries | 7 years (compliance) |

---

## 4. Intelligence Layer

The Intelligence Layer contains all computational logic. It runs as Supabase Edge Functions (Deno/TypeScript) and is stateless by design -- all state is read from and written to the Data Layer via PostgreSQL.

### 4.1 Demand Forecasting

> **V2 -- MVP relies on external forecast ingestion.**
>
> Built-in demand forecasting (statistical models, ML predictions, ensemble methods) is planned for V2. In MVP, customers upload or push demand forecasts generated by their existing ERP, WMS, or BI systems. AstraPlanner validates, normalizes, and versions these external forecasts but does not generate them.

AstraPlanner's V1 value is in the conversion of demand forecasts (from any source) into optimized workforce plans -- not in generating the forecasts themselves.

### 4.2 Workload Computation

Translates demand forecasts into labor hours required. This is the core conversion engine:

```
Required Hours = (Forecasted Demand in Units) / (Productivity Rate in Units/Hour) * (1 + Allowance Factor)
```

The computation is process-path aware:

| Process Path | Demand Unit | Productivity Rate | Allowance | Output |
|-------------|-------------|-------------------|-----------|--------|
| INBOUND.RECEIVING.UNLOAD | Pallets | 22 pallets/hr (Skill Level 3) | 12% (fatigue, travel) | Hours |
| PICK.EACH.ZONE-A | Lines | 95 lines/hr (Skill Level 2) | 15% | Hours |
| PACK.STANDARD | Orders | 30 orders/hr (Skill Level 2) | 10% | Hours |
| SHIP.LOAD.LTL | Pallets | 18 pallets/hr (Skill Level 3) | 8% | Hours |

Productivity rates are tiered by skill level. In V2, rates can be calibrated using actual telemetry data (closed-loop feedback).

FTE conversion: `Required FTEs = Required Hours / Available Hours per FTE per Period`

### 4.3 Optimization Engine

The optimization engine takes workload requirements, workforce availability, and constraints, and produces an optimal (or near-optimal) workforce plan.

**Solver architecture (two-tier)**:

| Tier | Runtime | Problem Size | Time Budget | Use Case |
|------|---------|-------------|-------------|----------|
| Edge (primary) | HiGHS WASM in Supabase Edge Function | < 5,000 variables | 10 seconds (interactive) | Single-site daily/weekly plans |
| Server (fallback) | HiGHS native or OR-Tools on Fly.io | < 50,000 variables | 60 seconds (background) | Large single-site or complex constraints |

> **MVP constraint**: Cross-site workforce sharing optimization is out of scope. Each site is optimized independently.

**Objective function** (minimizes weighted combination):
- Labor cost (primary)
- Skill mismatch penalty
- Overtime penalty
- Unmet demand penalty (heavily weighted)
- Employee preference violations

**Hard constraints** (must satisfy):
- Maximum hours per employee per day/week (legal)
- Mandatory rest between shifts
- Certification requirements (e.g., forklift license)
- Site capacity limits
- Contractual obligations (guaranteed hours for FTEs)

**Soft constraints** (penalized if violated):
- Employee shift preferences
- Team continuity
- Fair distribution of undesirable shifts
- Minimize agency labor usage

**Heuristic fallback**: A TypeScript-native greedy assignment algorithm provides sub-second responses for real-time manual adjustments (drag-and-drop reassignment, gap filling).

### 4.4 Scenario Simulator

Enables planners to explore "what-if" scenarios without affecting the active plan:

- **Demand change**: "What if next week's volume is 20% higher than forecast?"
- **Labor disruption**: "What if 10% of staff are unavailable?"
- **Process change**: "What if we add a VAS station?"
- **Cost exploration**: "What is the cost difference between overtime vs. agency temps?"

MVP supports simple single-variable scenarios: change one input, re-run the optimizer, compare results side-by-side.

> **V2 scope**: Monte Carlo simulation (probabilistic outcomes across 1,000+ demand scenarios) is planned for V2.

### 4.5 AI Advisor

A natural-language interface powered by Claude (Anthropic) that synthesizes insights:

- **Proactive alerts**: "Site DFW-04 will be 12 FTEs short on Tuesday receiving shift based on updated forecast"
- **Root cause analysis**: "Overtime at site ORD-02 has increased 23% month-over-month, driven by 3 unfilled positions in the pick department"
- **Recommendations**: "Cross-training 4 pack operators on pick processes would reduce agency spend by $18K/month"
- **Plan explanations**: "Maria was assigned to the night shift because she is the only certified forklift operator available"

AI calls are routed through a centralized `ai-gateway` Edge Function with cost tracking, retry logic, and circuit breaker protection.

> **Experimental**: Multi-agent orchestration via Ruflo (parallel analysis by demand/workforce/cost/risk agents with synthesized output) is experimental. Single-agent Claude is the primary path for MVP. Ruflo integration will be validated in controlled testing before production enablement.

---

## 5. Interaction Layer

The Interaction Layer runs on Vercel as a Next.js 14+ application using the App Router, with Server Components for dashboard layouts and Client Components for interactive scheduling, drag-and-drop, and real-time widgets.

### 5.1 Setup Wizard

A guided, multi-step configuration experience for onboarding new tenants and sites (simplified for MVP -- Phases 1-6):

1. **Organization setup**: company profile, timezone, basic hierarchy
2. **Site definition**: operating hours, zones, process paths
3. **Process configuration**: define each process, set initial productivity rates, map demand units
4. **Workforce import**: CSV bulk import, field mapping, data quality validation
5. **Skill taxonomy**: define skills, assign proficiency levels
6. **Planning rules**: set optimization constraints, approval workflows, notification preferences

> **MVP simplification**: AI-assisted document upload (extract configuration from uploaded documents) and clone-and-modify (copy settings from an existing site) are deferred to V2.

The wizard is resumable (state is persisted per step via localStorage with server backup), supports branching logic (skip steps not relevant to the tenant's operation type), and generates a configuration audit trail.

### 5.2 Control Room Dashboard

Operational visibility for site managers and planners:

- **Coverage heatmap**: time-of-day vs. process area matrix, color-coded by coverage percentage
- **Demand vs. capacity**: forecasted demand overlaid with planned workforce capacity
- **Labor utilization**: hours worked vs. hours planned, overtime accumulation
- **Cost tracker**: labor cost burn rate vs. budget
- **Alert feed**: prioritized list of issues requiring attention (understaffing, certification gaps)

Dashboards update via Supabase Realtime WebSocket channels. Operational views refresh within seconds of underlying data changes.

### 5.3 Planning Workbench

The primary workspace for workforce planners:

- **Schedule grid**: tabular view of shifts and assignments across time slots and process areas
- **Drag-and-drop scheduling**: assign/reassign employees to shifts with real-time constraint validation (powered by dnd-kit)
- **Bulk operations**: apply shift patterns, copy weeks, mass-reassign by skill group
- **Approval workflows**: submit plans for manager review, track approval status
- **Version comparison**: side-by-side diff of plan versions (what changed, impact on KPIs)
- **Undo/redo**: full operation history within a planning session

### 5.4 Alerts and Notifications

Multi-channel notification system:

| Alert Type | Channels | Latency | Example |
|-----------|----------|---------|---------|
| Critical (coverage gap) | Email, in-app | < 5 min | "Site LAX-01 will miss staffing target: 8 FTEs short on dock loading" |
| Warning (attention needed) | Email, in-app | < 15 min | "Forecast revision increased Tuesday pick demand by 15%" |
| Informational | In-app, daily digest | < 1 hour | "Plan for next week auto-approved (no constraint violations)" |

For MVP, notifications are delivered via in-app alerts and email (via Supabase Auth email infrastructure or a third-party provider like Resend). SMS and push notifications are V2.

---

## 6. Cross-Cutting Concerns

### 6.1 Multi-Tenancy

AstraPlanner uses **Row-Level Security (RLS)** as the primary tenant isolation mechanism. Every table includes a `tenant_id` column with an RLS policy enforced at the PostgreSQL level:

```sql
CREATE POLICY tenant_isolation ON demand_signals
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

This means even if application code has a bug that omits a `WHERE tenant_id = ...` clause, PostgreSQL itself prevents cross-tenant data access.

| Component | Isolation Model | Rationale |
|-----------|----------------|-----------|
| Database tables | RLS policies on every tenant-scoped table | Data isolation enforced at DB level, zero trust in application code |
| Edge Functions | Shared, tenant-scoped via JWT claims | Cost efficiency, single deployment |
| Supabase Realtime channels | Channel names include `tenant_id`, RLS on underlying tables | Event isolation |
| File storage | Supabase Storage RLS policies per bucket | Tenant-scoped file access |
| Cache (Redis) | Key prefix per tenant | Namespace isolation |
| Optimization solver | Shared Edge Function, queued via BullMQ for fairness | Prevents one tenant from starving others |

### 6.2 Authentication and Authorization

- **Authentication**: Supabase Auth with support for email/password (SMB), SSO/SAML (enterprise via Okta, Azure AD, Google Workspace), and TOTP-based MFA (mandatory for admin roles).
- **Authorization**: Role-Based Access Control (RBAC) enforced via JWT custom claims and RLS policies.

| Role | Scope | Capabilities |
|------|-------|-------------|
| Admin | All sites in tenant | Full configuration, user management, billing |
| Planner | Assigned sites | Create/edit plans, run scenarios, submit for approval |
| Manager | Assigned sites | View/approve plans, manage local workforce |
| Viewer | Assigned sites | Read-only dashboard access |

JWT custom claims structure:
```json
{
  "tenant_id": "uuid",
  "role": "planner",
  "site_ids": ["uuid1", "uuid2"],
  "permissions": ["plan:create", "plan:edit", "scenario:run"]
}
```

### 6.3 Audit Logging

Every state-changing operation is recorded in an append-only `events` table in PostgreSQL:

```
AuditEntry {
  id:             UUID (gen_random_uuid())
  tenant_id:      UUID
  timestamp:      TIMESTAMPTZ (now())
  actor:          { type: USER|SYSTEM, id: UUID }
  event_type:     string  // e.g., "plan.shift.assign", "demand.uploaded"
  entity_type:    string  // e.g., "ShiftAssignment", "DemandSignal"
  entity_id:      UUID
  payload:        JSONB   // before/after state, context
  created_by:     UUID    // references auth.users
}
```

Audit logs are append-only (no UPDATE or DELETE permissions), stored in the same PostgreSQL instance (separate schema for logical separation), and retained for a minimum of 7 years.

### 6.4 Event System

AstraPlanner uses a dual-track event architecture built on Supabase primitives:

- **Track 1 (Real-time UI updates)**: Supabase Realtime Postgres Changes. When a row in `plans`, `assignments`, or `demand_signals` changes, connected frontends receive the change via WebSocket within ~200ms.

- **Track 2 (Backend event processing)**: Supabase Database Webhooks trigger Edge Functions for backend reactions (e.g., demand change triggers reoptimization, plan approval triggers notification).

Events are logged to the `events` table for audit and replay capability. There is no separate message broker -- PostgreSQL + Supabase Realtime + Database Webhooks handle all event routing for MVP scale.

---

## 7. System Boundaries and External Integrations

AstraPlanner does not attempt to replace existing enterprise systems. It occupies a specific niche -- workforce planning and optimization -- and integrates with surrounding systems for data exchange.

For MVP, integrations are limited to CSV import and REST API ingestion. Direct connector integrations (ERP, WMS, HRIS) are available as optional configurations but are not required for initial deployment.

| System | Direction | Integration Method (MVP) | Key Data Exchanged |
|--------|-----------|--------------------------|-------------------|
| ERP (SAP, Oracle, NetSuite) | Inbound | CSV upload or REST API push | Demand forecasts, cost center budgets |
| WMS (Manhattan, Blue Yonder) | Inbound | CSV upload or REST API push | Order volumes, process throughput data |
| HRIS (Workday, BambooHR) | Inbound | CSV import or webhook receiver | Employee master data, leave requests |
| Any external system | Outbound | REST API (read-only endpoints) | Planned labor hours, schedule exports |

---

## 8. Deployment Topology

AstraPlanner is deployed as a managed-service stack requiring zero dedicated DevOps staff. The entire platform runs on three managed services: Vercel, Supabase, and Fly.io.

### 8.1 Production Architecture

```
+------------------------------------------------------------------+
|  Vercel (Frontend + Edge)                                        |
|                                                                  |
|  +------------------+     +------------------+  +-------------+  |
|  | Next.js SSR      |     | Edge Middleware   |  | Static CDN  |  |
|  | (Node.js 20)     |     | (Tenant routing, |  | (JS, CSS,   |  |
|  |                  |     |  auth validation) |  |  images)    |  |
|  +--------+---------+     +--------+---------+  +-------------+  |
+-----------|------------------------|---------+-------------------+
            |        tRPC calls      |
            v                        v
+------------------------------------------------------------------+
|  Supabase (Backend Platform)                                     |
|                                                                  |
|  +--------------+  +----------+  +--------+  +---------+         |
|  | Edge         |  |PostgreSQL|  |Supabase|  |Supabase |         |
|  | Functions    |  |16 + RLS  |  |  Auth  |  | Storage |         |
|  | (Deno/TS,    |  |+ pgvector|  | (SAML, |  | (Files) |         |
|  |  tRPC,       |  |+ pg_cron |  |  MFA)  |  |         |         |
|  |  HiGHS WASM) |  |          |  |        |  |         |         |
|  +--------------+  +----------+  +--------+  +---------+         |
|                                                                  |
|  +------------------+                                            |
|  | Supabase Realtime|  <-- WebSocket channels for live updates   |
|  +------------------+                                            |
+------------------------------------------------------------------+
            |
    +-------+-------+
    |               |
+---v-----------+  +v------------------+
| Upstash Redis |  | Fly.io Workers    |
| (Serverless)  |  | (Containerized)   |
| - BullMQ jobs |  | - Large MIP solves|
| - Rate limits |  | - Batch processing|
| - Session     |  | - Heavy compute   |
|   cache       |  |   (> 60s runs)    |
+---------------+  +-------------------+
```

### 8.2 MVP Deployment Constraints

- **Single Supabase project** in a single region (no multi-region replication for MVP)
- **No edge/offline components** -- MVP requires internet connectivity
- **No blue-green database deployments** -- migrations run directly with Supabase CLI
- **Feature flags** managed via environment variables or a simple flags table in PostgreSQL

### 8.3 Deployment Pipeline

```
Code Commit --> CI (lint, typecheck, Vitest, Playwright) --> Vercel Preview Deploy
  --> Review + Approve --> Merge to main
  --> Vercel Production Deploy + Supabase Edge Function Deploy + DB Migration (if any)
  --> Smoke Tests --> Done
```

- Vercel handles preview deployments per PR automatically
- Supabase CLI deploys Edge Functions and runs database migrations
- GitHub Actions orchestrates the full pipeline (target: < 12 minutes for production deploy)

---

## 9. Key Non-Functional Requirements

| Requirement | Target | Measurement | Notes |
|------------|--------|-------------|-------|
| **API Response Time (P95)** | < 500ms | Vercel + Sentry metrics | tRPC calls through Edge Functions |
| **Optimization Solve Time (Interactive)** | < 10 seconds | Solver instrumentation | Single-site plan, HiGHS WASM |
| **Optimization Solve Time (Background)** | < 60 seconds | Fly.io worker metrics | Large problems via BullMQ |
| **Dashboard Update Latency** | < 2 seconds | Supabase Realtime metrics | Via WebSocket (not polling) |
| **CSV Import Processing** | < 30 seconds for 10K rows | Edge Function metrics | Validate + insert + notify |
| **System Availability** | 99.5% (monthly) | BetterUptime | Supabase + Vercel managed uptime |
| **Recovery Point Objective (RPO)** | 24 hours | Supabase daily backups | Point-in-time recovery on Pro plan |
| **Recovery Time Objective (RTO)** | 4 hours | Manual failover | Single-region, Supabase-managed restore |
| **Concurrent Users** | 50 per tenant | Load testing | Active browser sessions (MVP ceiling) |
| **Tenant Count** | 1 (single-tenant MVP) | N/A | Multi-tenant architecture ready, single customer at launch |
| **Database Size** | < 10 GB per tenant | Supabase Dashboard | Plans, employees, demand, events |
| **Edge Function Cold Start** | < 150ms | Supabase metrics | Typical for Deno-based functions |
| **Data Retention (Operational)** | 2 years | Storage policy | Plans, assignments, demand |
| **Data Retention (Compliance)** | 7 years | Storage policy | Audit logs |

---

## 10. Technology Stack Summary

| Layer | Component | Technology | Role |
|-------|-----------|-----------|------|
| Frontend | Framework | Next.js 14+ (App Router, TypeScript) | SSR, routing, middleware |
| Frontend | UI Components | shadcn/ui + Radix Primitives | Accessible, composable UI |
| Frontend | Styling | Tailwind CSS | Utility-first CSS |
| Frontend | Client State | Zustand | UI state management |
| Frontend | Server State | TanStack Query v5 | API data caching, optimistic updates |
| Frontend | Charts | Recharts + Custom SVG | Data visualization, heatmaps |
| Frontend | Drag-and-Drop | dnd-kit | Schedule assignment UX |
| Frontend | Forms | React Hook Form + Zod | Validation (shared with tRPC) |
| API | Type-safe RPC | tRPC | End-to-end typed client-server communication |
| Backend | Runtime | Supabase Edge Functions (Deno/TypeScript) | API endpoints, business logic |
| Backend | Database | PostgreSQL 16 (Supabase managed) | Primary data store, RLS, pgvector, pg_cron |
| Backend | Auth | Supabase Auth | JWT, SSO/SAML, MFA |
| Backend | File Storage | Supabase Storage | Uploads, exports, assets |
| Backend | Real-time | Supabase Realtime | WebSocket, presence, live updates |
| Backend | Cache / Queues | Upstash Redis | BullMQ, rate limiting, session cache |
| Backend | Heavy Compute | Fly.io workers | Large optimization, batch processing |
| AI | Primary LLM | Claude (Anthropic) | Reasoning, NLU, insight generation |
| AI | Multi-Agent | Ruflo (experimental) | Parallel agent orchestration (V2 validation) |
| AI | Embeddings | Voyage AI | Semantic search vectors (pgvector) |
| Optimization | Solver (Edge) | HiGHS (WASM) | LP/MIP for single-site planning |
| Optimization | Solver (Server) | HiGHS native / OR-Tools (Fly.io) | Large-scale MIP |
| Optimization | Heuristics | TypeScript-native (greedy, local search) | Sub-second real-time adjustments |
| Infra | Frontend Hosting | Vercel | SSR, CDN, edge middleware |
| Infra | Backend Platform | Supabase | Managed Postgres, Edge Functions, Auth, Storage, Realtime |
| Infra | Monitoring | Sentry + Supabase Dashboard + BetterUptime | Errors, DB performance, uptime |
| Infra | Analytics | Vercel Analytics + PostHog | Web vitals, feature adoption |
| Infra | CI/CD | GitHub Actions | Build, test, deploy pipelines |
| Infra | Starter Kit | Supastarter | SaaS scaffolding (auth flows, billing, teams) |
