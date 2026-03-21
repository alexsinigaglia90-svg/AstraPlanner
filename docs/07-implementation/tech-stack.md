# Technology Stack

## 1. Overview

AstraPlanner's technology stack is selected to maximize three properties simultaneously: **developer velocity** (small team, fast iteration), **enterprise reliability** (thousands of sites, strict uptime), and **AI-native capability** (LLM integration is a first-class concern, not a bolt-on). Every technology choice below was evaluated against these three axes, with explicit alternatives considered and rejected for documented reasons.

The stack converges on a Supabase-centric backend with a Next.js frontend, connected by tRPC for end-to-end type safety. AI capabilities are delivered through Claude (Anthropic) with Ruflo orchestration for multi-agent workflows. Optimization runs on WASM-compiled solvers at the edge. The entire platform can be deployed by a team of 3-5 engineers without dedicated DevOps staff.

---

## 2. Frontend Stack

### 2.1 Framework: Next.js 14+ (App Router) with TypeScript

Next.js provides the foundation for AstraPlanner's web interface. The App Router (introduced in Next.js 13, stabilized in 14) is used exclusively -- no Pages Router code exists in the codebase.

| Capability | How AstraPlanner Uses It |
|---|---|
| Server Components | Dashboard layouts, report pages, and settings pages render on the server. Reduces client JS bundle by ~40% compared to fully client-rendered equivalent. |
| Client Components | Interactive elements: scheduling grid, drag-and-drop assignment, real-time widgets. Marked with `'use client'` directive. |
| Route Groups | `(auth)`, `(dashboard)`, `(public)` groups organize routes without affecting URL structure. |
| Parallel Routes | Control Room uses parallel routes to render the coverage panel and the staffing panel independently, allowing one to stream while the other loads from cache. |
| Server Actions | Form submissions for plan approval, employee updates, and configuration changes. Eliminates dedicated API endpoints for mutations originating from server-rendered forms. |
| Middleware | Tenant resolution (extract tenant from subdomain or cookie), locale detection, auth token validation, feature flag evaluation. Runs at the edge on Vercel. |
| Streaming | Long-running dashboard queries stream partial results using React Suspense boundaries. The demand chart loads independently of the workforce summary. |

**TypeScript configuration** enforces `strict: true`, `noUncheckedIndexedAccess: true`, and `exactOptionalPropertyTypes: true`. All API boundaries (tRPC routers, Supabase queries, Zod schemas) are fully typed with zero `any` usage outside of explicitly typed escape hatches in third-party adapter layers.

### 2.2 UI Library: shadcn/ui + Radix Primitives + Tailwind CSS

AstraPlanner uses shadcn/ui as a component foundation -- not as an installed dependency, but as source-owned components copied into the project and customized.

| Component Source | Role | Customization Level |
|---|---|---|
| shadcn/ui | Buttons, dialogs, dropdowns, tabs, data tables, command palette, toast notifications | Medium -- themed to AstraPlanner design system, extended with logistics-specific variants (e.g., `StatusBadge` for shift states) |
| Radix Primitives | Accessible primitives for popover, tooltip, select, accordion, toggle group | Low -- used through shadcn/ui wrappers, occasionally consumed directly for custom components |
| Tailwind CSS v3.4+ | Utility-first styling across all components | High -- custom design tokens for spacing scale, color palette (brand blues, status semantics), breakpoints aligned to logistics device widths |

**Design token structure:**

```
tailwind.config.ts
├── colors.brand.{50-950}     // AstraPlanner blue palette
├── colors.status.{optimal, warning, critical, inactive}
├── colors.coverage.{over, met, under, gap}
├── spacing.grid               // 4px base unit for scheduling grid alignment
├── screens.tablet-landscape   // 1024px -- primary site-manager device
└── fontSize.dashboard         // Larger text for control room wall displays
```

### 2.3 State Management: Zustand + TanStack Query

State is managed through a clear separation of concerns:

| State Category | Technology | Scope | Persistence |
|---|---|---|---|
| Server state (plans, employees, demand) | TanStack Query v5 | Per-query cache with configurable stale times | In-memory, revalidated on window focus and mutation |
| Client UI state (sidebar open, selected tab, filter panel) | Zustand | Per-store, scoped by domain | SessionStorage for layout prefs, ephemeral for transient UI |
| URL state (selected site, date range, active filters) | `nuqs` (type-safe search params) | URL search parameters | URL itself -- enables shareable deep links |
| Real-time state (live coverage, active users) | Supabase Realtime subscriptions | Per-channel, auto-reconnecting | Not persisted -- always live |
| Form state (wizard inputs, plan edits) | React Hook Form | Per-form instance | LocalStorage draft save every 30 seconds for wizard |

**Zustand store architecture:**

```typescript
// stores/planningStore.ts
interface PlanningStore {
  selectedPlanId: string | null;
  viewMode: 'timeline' | 'grid' | 'list';
  zoomLevel: 'hour' | '15min' | '30min';
  highlightMode: 'coverage' | 'skill' | 'cost' | null;
  pinnedEmployeeIds: Set<string>;
  // Actions
  selectPlan: (id: string) => void;
  setViewMode: (mode: ViewMode) => void;
  toggleEmployeePin: (id: string) => void;
}
```

**TanStack Query conventions:**

- `staleTime` for demand data: 5 minutes (demand changes infrequently during a session)
- `staleTime` for employee data: 30 seconds (availability changes matter)
- `staleTime` for plan data: 0 (always refetch -- plans are the core mutable entity)
- Optimistic updates for plan modifications: assignment drag-and-drop immediately reflects in UI, rolls back on server rejection
- Query key factory pattern: `planKeys.detail(planId)`, `demandKeys.bySite(siteId, dateRange)`

### 2.4 Real-time: WebSocket via Supabase Realtime

Supabase Realtime provides two communication patterns used throughout the platform:

| Pattern | Supabase Feature | AstraPlanner Use Case |
|---|---|---|
| Database changes | Postgres Changes (listen to INSERT/UPDATE/DELETE) | Plan updates by other users, demand feed arrivals, employee status changes |
| Broadcast | Channel-based pub/sub | Control Room live metrics, "user is editing this plan" presence indicators |
| Presence | Built-in presence tracking | Show which planners are viewing/editing which plans (collaborative planning awareness) |

**Channel topology:**

```
tenant:{tenantId}:plans         -- plan CRUD events for all sites in tenant
tenant:{tenantId}:site:{siteId} -- site-specific real-time metrics
plan:{planId}:edits             -- granular edit events for collaborative planning
plan:{planId}:presence          -- who is viewing/editing this plan
tenant:{tenantId}:alerts        -- system-wide alert broadcast
```

Row-Level Security (RLS) policies on the Supabase side ensure that a tenant's real-time channels are only accessible to authenticated users belonging to that tenant.

### 2.5 Charts and Visualization: Recharts + Custom SVG

| Visualization Type | Technology | Where Used |
|---|---|---|
| KPI dashboards (bar, line, area, pie) | Recharts | Control Room overview, demand trends, cost tracking, FTE utilization |
| Coverage heatmaps | Custom SVG with D3 scales | Planning workbench -- time-of-day vs. process area matrix, color-coded by coverage % |
| Gantt/timeline views | Custom SVG + dnd-kit integration | Shift assignment timeline, employee schedule view |
| Skill matrices | Custom HTML table with cell-level coloring | Workforce management -- employee skill coverage |
| Sparklines | Recharts `<Sparkline>` | Inline trend indicators in data tables (e.g., demand trend in site list) |
| Scenario comparison | Recharts composed charts | Side-by-side bar + line overlay for A/B scenario metrics |

Recharts was chosen over alternatives (Victory, Nivo, Chart.js) for its React-native composability, reasonable bundle size (~45KB gzipped for used components via tree-shaking), and straightforward responsive container support. Custom SVG is used where Recharts' abstractions impose unacceptable constraints -- heatmaps require cell-level click handlers and tooltip positioning that Recharts' grid charts do not support.

### 2.6 Drag-and-Drop: dnd-kit

dnd-kit powers the scheduling interface where planners assign employees to shifts by dragging:

- **Sortable contexts**: Reorder employees within a shift slot
- **Droppable zones**: Time-slot cells on the scheduling grid accept employee drops
- **Drag overlays**: Ghost preview shows the employee card with skill badges during drag
- **Collision detection**: Custom algorithm prevents dropping an employee into a slot where they lack required skills or violate working-time constraints
- **Accessibility**: Full keyboard support (Space to pick up, Arrow keys to move, Enter to drop) with live ARIA announcements

dnd-kit was selected over `react-beautiful-dnd` (deprecated by Atlassian) and `react-dnd` (lower-level, requires more boilerplate for accessible drag).

### 2.7 Forms: React Hook Form + Zod

All forms in AstraPlanner -- from the setup wizard's multi-step configuration to inline plan editing -- use React Hook Form with Zod schemas for validation.

```typescript
// Shared schema used by both frontend validation and tRPC input validation
const createSiteSchema = z.object({
  name: z.string().min(2).max(100),
  siteType: z.enum(['warehouse', 'dc', 'fulfillment', 'crossdock', 'hub']),
  timezone: z.string().refine(isValidTimezone),
  operatingHours: z.object({
    start: z.string().regex(/^\d{2}:\d{2}$/),
    end: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  maxHeadcount: z.number().int().positive().max(10000),
  address: addressSchema,
});

type CreateSiteInput = z.infer<typeof createSiteSchema>;
```

This "schema-first" pattern means the same Zod object validates form input on the client (instant feedback), validates the tRPC procedure input on the server (defense in depth), and generates TypeScript types (zero type drift).

### 2.8 Internationalization: next-intl

AstraPlanner supports multi-language deployment for global enterprises. next-intl provides:

| Feature | Implementation |
|---|---|
| Locale routing | `/en/dashboard`, `/de/dashboard`, `/fr/dashboard` via Next.js middleware |
| Message bundles | JSON files per locale in `/messages/{locale}.json`, organized by namespace (common, planning, wizard, reports) |
| Date/time formatting | Locale-aware formatting using Intl APIs -- critical for shift times displayed to site managers in local format |
| Number formatting | Locale-specific decimal separators, thousands groupings for headcount and cost figures |
| Pluralization | ICU MessageFormat for complex plurals ("1 employee" vs. "5 employees" vs. Arabic six-form plurals) |
| Server Components | Messages loaded server-side, no client bundle impact for unused locales |

**Supported locales at launch**: en-US, en-GB, de-DE, fr-FR, es-ES, nl-NL, pl-PL (covering primary European logistics markets).

---

## 3. Backend Stack

### 3.1 Runtime: Node.js + TypeScript (Supabase Edge Functions)

The backend runs as Supabase Edge Functions -- Deno-based serverless functions that execute at the edge. Despite the Deno runtime, all application code is written in TypeScript with Node.js-compatible APIs, transpiled for the Deno target.

| Aspect | Detail |
|---|---|
| Runtime | Deno (via Supabase Edge Functions) |
| Language | TypeScript (strict mode) |
| Cold start | ~50-150ms for typical Edge Functions |
| Execution limit | 60 seconds (sufficient for optimization runs on standard problems) |
| Memory | 256MB per invocation (sufficient for WASM solver with typical problem sizes) |
| Concurrency | Automatic scaling managed by Supabase infrastructure |

For computationally intensive tasks exceeding Edge Function limits (large-scale MIP optimization, batch Monte Carlo simulation), dedicated server-side workers are deployed as long-running containers on Fly.io.

### 3.2 API Layer: tRPC

tRPC provides the API layer between the Next.js frontend and the Supabase backend. There is no REST API, no GraphQL schema, and no OpenAPI spec -- the type contract is the TypeScript code itself.

**Router structure:**

```
trpc/
├── router.ts                    // Root router, merges all module routers
├── context.ts                   // Creates context with auth, tenant, db client
├── middleware/
│   ├── auth.ts                  // Validates JWT, attaches user to context
│   ├── tenancy.ts               // Resolves tenant, enforces RLS context
│   ├── rateLimit.ts             // Per-user, per-endpoint rate limiting
│   └── logging.ts               // Structured request/response logging
├── modules/
│   ├── demand.router.ts         // Demand ingestion, querying, forecasting
│   ├── workload.router.ts       // Workload computation triggers and results
│   ├── workforce.router.ts      // Employee CRUD, skill management, availability
│   ├── optimization.router.ts   // Solver invocation, constraint management
│   ├── planning.router.ts       // Plan CRUD, versioning, approval, publishing
│   ├── simulation.router.ts     // Scenario creation, Monte Carlo execution
│   ├── wizard.router.ts         // Setup wizard state management
│   ├── integration.router.ts    // External system connector management
│   ├── notification.router.ts   // Alert preferences, delivery status
│   ├── audit.router.ts          // Event log queries, compliance reports
│   ├── ai.router.ts             // AI query endpoint, insight retrieval
│   └── admin.router.ts          // Tenant admin, user management, billing
```

**Middleware chain execution order:**

```
Request → logging → rateLimit → auth → tenancy → procedure handler → response
```

### 3.3 Database: PostgreSQL via Supabase

PostgreSQL is the single source of truth for all AstraPlanner data. Supabase provides managed Postgres with extensions that AstraPlanner relies on heavily.

| Extension | Purpose |
|---|---|
| `pgvector` | Semantic search over workforce data, AI query embeddings |
| `pg_cron` | Scheduled background jobs (demand sync, plan refresh, insight generation) |
| `pgsodium` | Column-level encryption for PII (employee names, contact details) |
| `pg_stat_statements` | Query performance monitoring |
| `pgaudit` | Compliance audit logging for all data mutations |
| `postgis` | Geographic queries for multi-site distance calculations and regional grouping |
| `pg_trgm` | Fuzzy text search for employee name lookup, site search |

**Multi-tenancy model**: Row-Level Security (RLS) policies enforce tenant isolation at the database level. Every table includes a `tenant_id` column and an RLS policy:

```sql
CREATE POLICY tenant_isolation ON demand_signals
  USING (tenant_id = auth.jwt() ->> 'tenant_id');
```

This means even if application code has a bug that omits a `WHERE tenant_id = ...` clause, Postgres itself prevents cross-tenant data access.

### 3.4 Auth: Supabase Auth with SSO/SAML

| Auth Feature | Implementation |
|---|---|
| Email/password | Supabase Auth built-in, used for trial/SMB customers |
| SSO/SAML | Supabase Auth SAML provider, configured per tenant for enterprise customers (Okta, Azure AD, Google Workspace) |
| MFA | TOTP-based MFA via Supabase Auth, mandatory for admin roles |
| JWT structure | Custom claims include `tenant_id`, `role`, `site_ids[]` (sites the user can access), `permissions[]` |
| Session management | JWT with 1-hour expiry, refresh token with 7-day expiry, sliding window |
| Role hierarchy | `super_admin` > `tenant_admin` > `site_manager` > `planner` > `viewer` |

### 3.5 File Storage: Supabase Storage

| Storage Bucket | Contents | Access Policy |
|---|---|---|
| `demand-uploads` | CSV/Excel demand files uploaded by planners | Tenant-scoped, write for planners+, read for viewers+ |
| `schedule-exports` | Generated PDF/Excel schedule exports | Tenant-scoped, auto-deleted after 30 days |
| `wizard-assets` | Site photos, floor plan uploads during setup | Tenant-scoped, permanent |
| `report-snapshots` | Archived report PDFs for compliance | Tenant-scoped, immutable after creation, retained per compliance policy |
| `integration-configs` | Encrypted connector configuration files | Tenant-scoped, admin-only access |

### 3.6 Background Jobs

| Job Type | Technology | Trigger | Examples |
|---|---|---|---|
| Scheduled | `pg_cron` → Edge Function | Cron expression | Demand sync (every 30 min), nightly plan refresh, weekly insight generation |
| Event-driven | Supabase Database Webhooks → Edge Function | Row INSERT/UPDATE/DELETE | Reoptimize on demand change, notify on plan approval, sync on employee update |
| Queue-based | BullMQ (Redis on Upstash) | Enqueue from any Edge Function | Batch optimization runs, report generation, bulk import processing |
| Long-running | Fly.io worker process | BullMQ dequeue | Large MIP solves (>60s), Monte Carlo simulation batches, bulk data migration |

### 3.7 Event Bus: Supabase Realtime + Custom Handler

The event system follows a dual-track architecture:

- **Track 1 (Real-time UI updates)**: Supabase Realtime Postgres Changes. When a row in `plans`, `assignments`, or `demand_signals` changes, connected frontends receive the change within ~200ms. No application code required -- Supabase handles the CDC pipeline.

- **Track 2 (Backend event processing)**: A custom event handler implemented as a Supabase Database Webhook triggers Edge Functions for backend-to-backend communication. Events are logged to an `events` table for audit and replay capability.

```sql
-- Event logging table
CREATE TABLE events (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id),
  event_type  TEXT NOT NULL,  -- e.g., 'plan.published', 'demand.updated', 'optimization.completed'
  entity_type TEXT NOT NULL,  -- e.g., 'plan', 'demand_signal', 'employee'
  entity_id   UUID NOT NULL,
  payload     JSONB NOT NULL,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## 4. AI Layer

### 4.1 Primary LLM: Claude (Anthropic)

Claude serves as the reasoning engine for all natural-language AI features in AstraPlanner.

| Use Case | Model Tier | Typical Latency | Max Tokens (Output) |
|---|---|---|---|
| Setup wizard entity extraction | Claude Sonnet | 1-3s | 2,000 |
| Natural language query interpretation | Claude Sonnet | 1-2s | 1,000 |
| Daily insight generation (batch) | Claude Haiku | 0.5-1s per insight | 500 |
| Complex anomaly explanation | Claude Sonnet | 2-4s | 2,000 |
| Scenario narrative generation | Claude Opus | 3-8s | 4,000 |
| Multi-step planning reasoning | Claude Opus | 5-15s | 8,000 |

**API integration pattern**: All Claude calls go through a centralized `ai-gateway` Edge Function that handles:

1. API key management (rotated via Supabase Vault)
2. Request/response logging (for audit and prompt improvement)
3. Cost tracking per tenant (metered against AI usage quota)
4. Retry with exponential backoff (3 retries, 1s/2s/4s delays)
5. Circuit breaker (if error rate exceeds 20% over 5 minutes, fall back to deterministic responses)

### 4.2 Orchestration: Ruflo

Ruflo coordinates multi-agent workflows where a single user action requires parallel analysis across multiple domains.

**Example: "Generate a comprehensive plan review for next week"**

```
Ruflo Coordinator
├── Agent 1: Demand Analyst    → Analyzes demand forecast accuracy and trends
├── Agent 2: Workforce Analyst → Checks availability, skills coverage, constraints
├── Agent 3: Cost Analyst      → Evaluates overtime costs, agency spend, budget impact
├── Agent 4: Risk Analyst      → Identifies coverage gaps, single-points-of-failure
└── Synthesis                  → Combines outputs into unified review with recommendations
```

Each agent runs as an independent Claude API call with domain-specific system prompts. Ruflo manages the execution graph (parallel where possible, sequential where dependencies exist), handles partial failures (if one agent times out, the review is generated without that section), and synthesizes the final output.

### 4.3 Embeddings: Voyage AI / OpenAI

Embeddings power semantic search across workforce data:

| Data Indexed | Embedding Model | Vector Dimensions | Storage |
|---|---|---|---|
| Employee skill descriptions | Voyage AI `voyage-3` | 1024 | `pgvector` in Supabase |
| Process definitions | Voyage AI `voyage-3` | 1024 | `pgvector` in Supabase |
| Historical planning notes | OpenAI `text-embedding-3-small` | 1536 | `pgvector` in Supabase |
| Knowledge base articles | Voyage AI `voyage-3` | 1024 | `pgvector` in Supabase |

**Search flow**: User enters "forklift drivers available for overtime" → query is embedded → `pgvector` cosine similarity search retrieves matching employees → results are re-ranked by availability constraints → presented in the UI.

---

## 5. Optimization Layer

### 5.1 Primary Solver: WASM-Compiled HiGHS

HiGHS (High-performance Optimization Software) is compiled to WebAssembly and runs inside Supabase Edge Functions. This eliminates the need for a dedicated optimization server for 90%+ of planning problems.

| Characteristic | Value |
|---|---|
| Solver | HiGHS v1.7+ |
| Compilation target | WASM (via Emscripten) |
| Problem types supported | LP, MIP, QP |
| Typical problem size | 500-5,000 variables, 1,000-10,000 constraints |
| Solve time target | < 10 seconds for operational planning |
| Memory usage | 50-150MB per solve |

**Problem formulation pipeline:**

```
Plan context → Constraint builder → Variable mapper → HiGHS MPS format → WASM solver → Solution parser → Assignment generator
```

### 5.2 Fallback: Server-Side Python Solver

For problems exceeding Edge Function limits (large multi-site optimization, complex multi-period scheduling with integer variables exceeding 5,000):

| Characteristic | Value |
|---|---|
| Solver | Google OR-Tools (CP-SAT) or HiGHS (native) |
| Runtime | Python 3.12 on Fly.io |
| Trigger | BullMQ job from Edge Function |
| Solve time limit | 5 minutes (configurable per tenant) |
| Problem size | Up to 50,000 variables |

### 5.3 Heuristic Engine: TypeScript-Native

A TypeScript-native heuristic engine handles real-time adjustments that need sub-second response times:

| Algorithm | Use Case | Typical Time |
|---|---|---|
| Greedy assignment | "Fill this gap now" -- find best available employee by skill match + proximity | < 100ms |
| Local search (2-opt swap) | "Rebalance this shift" -- improve assignments by pairwise employee swaps | < 500ms |
| Priority queue scheduler | "Auto-assign unassigned demand" -- process unassigned slots in priority order | < 200ms |
| Monte Carlo sampling | "What's the risk?" -- sample 1,000 absence scenarios and report coverage probability | < 2s |

---

## 6. Infrastructure

### 6.1 Hosting Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Vercel                                   │
│  ┌─────────────────┐  ┌──────────────────┐  ┌───────────────┐  │
│  │ Next.js SSR     │  │ Edge Middleware   │  │ Static Assets │  │
│  │ (Node.js 20)    │  │ (Tenant routing) │  │ (CDN-cached)  │  │
│  └────────┬────────┘  └────────┬─────────┘  └───────────────┘  │
│           │                    │                                 │
└───────────┼────────────────────┼─────────────────────────────────┘
            │                    │
            ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Supabase                                  │
│  ┌──────────┐ ┌──────────────┐ ┌───────┐ ┌────────┐ ┌───────┐ │
│  │PostgreSQL│ │Edge Functions│ │ Auth  │ │Storage │ │Realtime│ │
│  │(+ pgvec.)│ │(tRPC + AI)   │ │(SAML) │ │(Files) │ │(WS)   │ │
│  └──────────┘ └──────────────┘ └───────┘ └────────┘ └───────┘ │
└─────────────────────────────────────────────────────────────────┘
            │
            ▼
┌───────────────────────┐  ┌──────────────────────┐
│  Upstash Redis        │  │  Fly.io Workers      │
│  (Cache, BullMQ)      │  │  (Heavy optimization)│
└───────────────────────┘  └──────────────────────┘
```

### 6.2 CDN: Vercel Edge Network

All static assets (JS bundles, CSS, images, fonts) are served from Vercel's Edge Network with aggressive caching. Dynamic pages use ISR (Incremental Static Regeneration) where applicable -- the marketing/docs site is fully static, while the dashboard is SSR with streaming.

### 6.3 Monitoring and Observability

| Layer | Tool | What It Monitors |
|---|---|---|
| Frontend errors | Sentry (Browser SDK) | JavaScript exceptions, React error boundaries, failed API calls |
| Backend errors | Sentry (Deno SDK) | Edge Function exceptions, unhandled rejections, timeout errors |
| Database | Supabase Dashboard + pg_stat_statements | Query performance, connection pool usage, table sizes, RLS policy hits |
| Uptime | BetterUptime | Endpoint health checks every 60s, status page for enterprise customers |
| AI costs | Custom dashboard (internal) | Per-tenant Claude API usage, cost per feature, error rates by model |
| Performance | Vercel Analytics + Web Vitals | LCP, FID, CLS, TTFB per route |
| Business metrics | PostHog | Feature adoption, wizard completion rates, planning workflow funnels |

### 6.4 CI/CD: GitHub Actions

| Pipeline | Trigger | Steps | Duration Target |
|---|---|---|---|
| PR Check | Pull request opened/updated | Lint (ESLint + Prettier) → Type check → Unit tests (Vitest) → Integration tests (Playwright) → Bundle size check | < 5 minutes |
| Staging Deploy | Merge to `develop` | PR Check + Deploy to Vercel preview + Deploy Edge Functions to staging Supabase | < 8 minutes |
| Production Deploy | Merge to `main` | PR Check + Deploy to Vercel production + Deploy Edge Functions to prod Supabase + DB migration (if any) + Smoke tests | < 12 minutes |
| Nightly | Cron (02:00 UTC) | Full E2E suite (Playwright, 200+ scenarios) + Performance benchmarks + Dependency audit + OWASP ZAP scan | < 30 minutes |

### 6.5 Starter Kit: Supastarter

Supastarter provides the scaffolding for enterprise SaaS concerns that are not unique to AstraPlanner:

| Feature from Supastarter | AstraPlanner Customization |
|---|---|
| Authentication flows (login, signup, forgot password, MFA) | Themed with AstraPlanner design system, added SSO/SAML configuration UI |
| Team/organization management | Extended to support multi-level hierarchy (enterprise → region → site) |
| Billing (Stripe integration) | Customized pricing tiers: per-site pricing with AI usage metering add-on |
| Admin dashboard | Extended with tenant impersonation, site provisioning, feature flag management |
| Email templates (React Email) | Rewritten for AstraPlanner notifications: plan approval requests, coverage alerts, schedule publications |
| Internationalization setup | Leveraged as-is, extended with logistics-domain translation keys |

---

## 7. Technology Decision Matrix

| Layer | Technology | Purpose | Why This Choice | Alternatives Considered |
|---|---|---|---|---|
| **Frontend Framework** | Next.js 14+ (App Router) | SSR, routing, API routes, middleware | Best-in-class React framework with edge support, streaming SSR, and Vercel integration | Remix (less mature streaming), Astro (not suited for app-heavy SPA), SvelteKit (smaller ecosystem) |
| **UI Components** | shadcn/ui + Radix | Accessible, composable UI primitives | Source-owned (not a dependency), accessible by default, highly customizable | MUI (heavy, opinionated styling), Ant Design (less composable), Chakra UI (runtime CSS-in-JS perf issues) |
| **Styling** | Tailwind CSS | Utility-first CSS | Fast development, consistent spacing/color, excellent tree-shaking, no runtime cost | CSS Modules (more boilerplate), Styled Components (runtime overhead), vanilla-extract (build complexity) |
| **Client State** | Zustand | Local UI state management | Tiny bundle (1KB), simple API, no boilerplate, TypeScript-native | Redux Toolkit (overkill for UI state), Jotai (atomic model adds complexity), Recoil (deprecated) |
| **Server State** | TanStack Query v5 | API data caching, sync, mutations | Optimistic updates, infinite query support, devtools, mature ecosystem | SWR (fewer features), Apollo (GraphQL-specific), custom hooks (reimventing the wheel) |
| **Real-time** | Supabase Realtime | Live data sync, presence | Integrated with Supabase DB (zero config for Postgres changes), built-in auth | Socket.io (requires separate server), Pusher (vendor lock-in, per-connection pricing), Ably (cost at scale) |
| **Charts** | Recharts | Data visualization | React-native, declarative API, reasonable bundle, responsive | Victory (larger bundle), Nivo (D3 wrapper overhead), Chart.js (imperative API, React wrapper quality) |
| **Drag-and-Drop** | dnd-kit | Schedule assignment UX | Accessible, performant, framework-agnostic sensors, active maintenance | react-beautiful-dnd (deprecated), react-dnd (lower-level, more boilerplate), Pragmatic drag-and-drop (newer, less proven) |
| **Forms** | React Hook Form + Zod | Form state and validation | Uncontrolled by default (performant), Zod schemas shared with tRPC, minimal re-renders | Formik (more re-renders), Final Form (smaller ecosystem), custom (time-consuming) |
| **i18n** | next-intl | Multi-language support | Server Component support, ICU MessageFormat, type-safe messages | next-i18next (Pages Router legacy), react-intl (no server component support), i18next (manual Next.js integration) |
| **API Layer** | tRPC | Type-safe client-server communication | End-to-end types with zero codegen, works with Next.js and Supabase, procedure-level middleware | REST + OpenAPI (type codegen required), GraphQL (schema maintenance overhead), gRPC (not browser-native) |
| **Database** | PostgreSQL (Supabase) | Primary data store | RLS for multi-tenancy, pgvector for AI, pg_cron for jobs, mature JSON support, Supabase managed | PlanetScale/MySQL (no RLS, no pgvector), CockroachDB (cost), MongoDB (schema flexibility not needed, consistency matters) |
| **Auth** | Supabase Auth | Authentication and authorization | Integrated with RLS, SAML/SSO support, managed MFA, JWT with custom claims | Auth0 (expensive at scale), Clerk (vendor lock-in), NextAuth (manual DB integration) |
| **Background Jobs** | pg_cron + BullMQ | Scheduled and queued tasks | pg_cron requires no infrastructure, BullMQ provides visibility and retry for heavy jobs | Temporal (overkill), Inngest (vendor dependency), AWS SQS (not Supabase-native) |
| **Cache** | Upstash Redis | Session cache, job queues, rate limiting | Serverless Redis (pay-per-request), global replication, BullMQ compatible | Vercel KV (limited features), Momento (less proven), DynamoDB (over-engineered for cache) |
| **LLM** | Claude (Anthropic) | AI reasoning, NLU, generation | Superior instruction following, structured output reliability, large context window, safety | GPT-4o (less reliable structured output), Gemini (less proven for enterprise), Llama (self-hosting overhead) |
| **Multi-Agent** | Ruflo | AI workflow orchestration | Parallel agent execution, failure isolation, result synthesis, built for Claude | LangGraph (Python-centric), CrewAI (less production-ready), custom (significant build effort) |
| **Embeddings** | Voyage AI / OpenAI | Semantic search vectors | High-quality logistics-domain embeddings, cost-effective for batch processing | Cohere (less dimension flexibility), local models (infrastructure overhead) |
| **Optimization Solver** | HiGHS (WASM) | Mathematical programming | Open-source, WASM-compilable, handles LP/MIP/QP, no server required | OR-Tools (larger WASM binary), CPLEX (commercial license cost), Gurobi (commercial license cost) |
| **Hosting (Frontend)** | Vercel | SSR hosting, CDN, edge | Native Next.js support, preview deployments per PR, edge middleware, analytics | AWS Amplify (less Next.js integration), Cloudflare Pages (experimental Next.js support), Netlify (less streaming support) |
| **Hosting (Backend)** | Supabase | Managed Postgres, Edge Functions, Auth, Storage, Realtime | Unified platform reduces operational complexity, generous free tier for development, open-source core | AWS (operational overhead), Firebase (NoSQL mismatch), Railway (less integrated) |
| **Hosting (Workers)** | Fly.io | Long-running optimization jobs | Fast container start (~300ms), global regions, simple deployment, affordable for burst workloads | AWS ECS (complex setup), Render (slower cold starts), Railway (less control over placement) |
| **Monitoring** | Sentry + Supabase Dashboard | Error tracking, performance | Sentry: best-in-class error grouping and source maps. Supabase Dashboard: native DB observability | Datadog (expensive), New Relic (expensive), LogRocket (session replay overkill) |
| **CI/CD** | GitHub Actions | Build, test, deploy pipelines | Native GitHub integration, generous free minutes, marketplace actions for Vercel/Supabase | GitLab CI (if not on GitHub), CircleCI (cost at scale), Jenkins (operational burden) |
| **Starter Kit** | Supastarter | SaaS boilerplate (auth, billing, teams) | Saves 2-3 months of boilerplate, Supabase-native, maintained, includes Stripe billing | SaaSkit (less feature-complete), Shipfast (not Supabase), Build from scratch (time cost) |

---

## 8. Version Compatibility Matrix

| Technology | Minimum Version | Target Version | Update Cadence |
|---|---|---|---|
| Node.js | 20.x LTS | 22.x LTS | Follow LTS releases |
| Next.js | 14.2 | 15.x (latest stable) | Monthly minor updates |
| TypeScript | 5.3 | 5.6+ | Quarterly |
| React | 18.3 | 19.x (when stable) | Follow Next.js compatibility |
| PostgreSQL | 15 | 16 | Follow Supabase managed version |
| Supabase CLI | 1.150+ | Latest | Monthly |
| HiGHS | 1.7 | Latest | As needed for solver improvements |
| Tailwind CSS | 3.4 | 4.x (when stable) | Follow major releases cautiously |

---

## 9. Bundle Size Budget

| Route | JS Budget (gzipped) | Current Estimate | Key Contributors |
|---|---|---|---|
| Login page | 80 KB | ~60 KB | React, Next.js runtime, auth form |
| Dashboard shell | 150 KB | ~130 KB | React, layout, navigation, Zustand stores |
| Control Room | 250 KB | ~210 KB | + Recharts, Supabase Realtime client, heatmap renderer |
| Planning Workbench | 300 KB | ~270 KB | + dnd-kit, scheduling grid, HiGHS WASM loader (lazy) |
| Setup Wizard | 200 KB | ~170 KB | + React Hook Form, multi-step form engine, AI chat component |
| Reports | 200 KB | ~160 KB | + Recharts (full), export utilities |

The HiGHS WASM binary (~2.5 MB) is loaded lazily only when a user triggers an optimization action, and is cached in the browser via Service Worker for subsequent uses.
