# AstraPlanner MVP — Implementatie Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Werkende MVP van AstraPlanner — AI-driven workforce planning voor logistiek — in 10 fasen van greenfield naar productie.

**Architecture:** Next.js 14+ App Router (Supastarter) op Vercel, Supabase (PostgreSQL + Auth + RLS + Realtime + Edge Functions) als backend platform, tRPC voor type-safe API, HiGHS WASM solver voor optimalisatie, Framer Motion voor micro-animaties. Design systeem: Cosmic Indigo palette, Nunito/DM Sans/JetBrains Mono fonts, spring-physics animaties.

**Tech Stack:** Next.js 14+, TypeScript (strict), Supabase, tRPC, Tailwind CSS, shadcn/ui, Framer Motion, dnd-kit, Recharts, HiGHS WASM, Zod, Zustand, TanStack Query v5, React Hook Form, Lucide Icons, Vitest, Playwright

**Referentiedocumenten:**
- `docs/DECISIONS.md` — 19 gelocked architecturale beslissingen
- `docs/solver-contract.md` — Solver I/O TypeScript interfaces
- `docs/api-contracts.md` — 40+ tRPC procedure definities
- `docs/04-data-model/schema.sql` — Volledige PostgreSQL DDL
- `docs/core-invariants/invariants.md` — 9 core invarianten
- `docs/design-system/MASTER.md` — Design systeem (kleuren, typography, animaties)
- `docs/design-system/pages/` — Pagina-specifieke design overrides
- `docs/BUILD-PLAN.md` — Origineel bouwplan (referentie)

---

## Fasering Overzicht

| Fase | Naam | Focus | Afhankelijkheid | Geschatte Complexiteit |
|------|------|-------|-----------------|----------------------|
| **0** | Project Kickoff | Repo structuur, tooling, spike tests | — | Klein |
| **1** | Foundation | Auth, database, tRPC, CI/CD, design tokens | Fase 0 |  Medium |
| **2** | Data Core | CRUD voor sites, processen, medewerkers, skills, CSV import | Fase 1 | Groot |
| **3** | Demand & Workload | Demand ingestion, workload formules, FTE berekening | Fase 2 | Medium |
| **4** | Optimization Engine | Greedy heuristic, HiGHS MIP, constraint engine, plan pipeline | Fase 3 | Zeer Groot (hoogste risico) |
| **5** | Planning UX | Control Room, schedule grid, drag-drop, heatmap, KPI's | Fase 4 | Groot |
| **6** | Setup Wizard | 5-staps onboarding wizard met smart defaults | Fase 2 (parallel met 5) | Medium |
| **7** | Employee Portal & Polish | Medewerkerportaal, scenario's, approval workflow, notificaties | Fase 5 + 6 | Medium |
| **8** | Hardening | Security audit, performance tests, edge cases | Fase 7 | Medium |
| **9** | Launch Prep | Beta testing, seed data, monitoring, documentatie | Fase 8 | Klein |

### Critical Path
```
Fase 0 → Fase 1 → Fase 2 → Fase 3 → Fase 4 → Fase 5 → Fase 7 → Fase 8 → Fase 9
                                                   ↗
                              Fase 2 → Fase 6 ────┘
```

Fase 6 (Setup Wizard) kan parallel met Fase 5 (Planning UX) gebouwd worden — de wizard schrijft configuratiedata die de planning engine consumeert, maar hangt niet af van de planning UI.

---

## Fase 0: Project Kickoff

**Goal:** Repo klaar, tooling geconfigureerd, geen open vragen.

### Task 0.1: Repository Structuur

**Files:**
- Create: `src/` (lege directory structuur)
- Create: `tests/` (lege directory structuur)
- Create: `supabase/migrations/`
- Create: `supabase/functions/`
- Create: `scripts/`
- Modify: `.gitignore`

- [ ] **Step 1: Maak de directory structuur aan**

```
src/
├── app/              # Next.js App Router pages
│   ├── (auth)/       # Auth route group (login, signup)
│   ├── (dashboard)/  # Dashboard route group (authenticated)
│   └── (public)/     # Public route group (landing)
├── components/
│   ├── ui/           # shadcn/ui base components
│   ├── domain/       # AstraPlanner domain components
│   └── layout/       # Layout components (sidebar, header)
├── lib/
│   ├── supabase/     # Supabase client, helpers
│   ├── trpc/         # tRPC client, router definitions
│   ├── solver/       # Solver interfaces, greedy, HiGHS
│   └── utils/        # Shared utilities
├── server/
│   ├── routers/      # tRPC routers (1 file per module)
│   ├── middleware/    # Auth, tenant, logging middleware
│   └── services/     # Business logic services
├── stores/           # Zustand stores
├── types/            # Shared TypeScript types
│   └── solver.ts     # Solver I/O contract (from solver-contract.md)
└── styles/           # Global styles, design tokens
tests/
├── unit/             # Vitest unit tests
├── integration/      # tRPC + DB integration tests
└── e2e/              # Playwright end-to-end tests
supabase/
├── migrations/       # SQL migration files
├── functions/        # Edge Functions
└── seed.sql          # Seed data
scripts/              # Build, deployment, utility scripts
config/               # Configuration files
docs/                 # (bestaand) Documentatie
```

- [ ] **Step 2: Update `.gitignore`**

Voeg toe: `node_modules/`, `.env`, `.env.local`, `.next/`, `.vercel/`, `supabase/.temp/`

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: initialize repository directory structure"
```

### Task 0.2: Spike Test — tRPC + Supabase Compatibiliteit

**Files:**
- Create: `scripts/spike-trpc-supabase.md` (resultaten)

- [ ] **Step 1: Onderzoek of tRPC werkt met Supabase Edge Functions (Deno)**

Opties die getest moeten worden:
1. tRPC routers draaien in Supabase Edge Functions (Deno runtime)
2. tRPC routers draaien op Vercel API Routes (Next.js server — fallback)

- [ ] **Step 2: Documenteer resultaat**

Als optie 1 werkt → tRPC in Edge Functions is primary
Als optie 1 faalt → tRPC in Next.js API routes (Vercel) is primary, Edge Functions alleen voor compute-heavy taken (solver, workload)

- [ ] **Step 3: Commit spike resultaat**

### Task 0.3: Solver Contract Types Aanmaken

**Files:**
- Create: `src/types/solver.ts`

- [ ] **Step 1: Kopieer de TypeScript interfaces uit `docs/solver-contract.md`**

Dit zijn de exacte types: `TimeSlot`, `ProcessDemand`, `EmployeeRecord`, `EmployeeSkillRecord`, `AvailabilityWindow`, `HardConstraint`, `SoftConstraint`, `ObjectiveConfig`, `Assignment`, `UnmetDemandSlot`, `Violation`, `SolverInput`, `SolverOutput`, `ConflictingConstraint`, `InfeasibilityReport`, `ValidationError`, `ValidationResult`

- [ ] **Step 2: Commit**

```bash
git add src/types/solver.ts
git commit -m "feat: add canonical solver I/O contract types"
```

**Exit criteria Fase 0:**
- [ ] Directory structuur staat
- [ ] Spike test resultaat gedocumenteerd
- [ ] Solver contract types in codebase
- [ ] Geen open architecturale vragen

---

## Fase 1: Foundation

**Goal:** Draaiende applicatie met auth, database, design tokens en CI/CD.

### Task 1.1: Next.js Project Initialisatie

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`
- Create: `src/app/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Initialiseer Next.js 14+ met App Router**

Optie A: Via Supastarter template (als beschikbaar)
Optie B: `npx create-next-app@latest` met TypeScript, Tailwind, App Router, `src/` directory

- [ ] **Step 2: Configureer TypeScript strict mode**

`tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `exactOptionalPropertyTypes: true`

- [ ] **Step 3: Installeer core dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr @trpc/server @trpc/client @trpc/react-query @trpc/next @tanstack/react-query zod zustand framer-motion lucide-react recharts @dnd-kit/core @dnd-kit/sortable react-hook-form @hookform/resolvers next-intl
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom playwright @playwright/test
```

- [ ] **Step 4: Configureer next-intl infrastructuur**

Installeer en configureer `next-intl` met English als enige locale. i18n-ready voor V1.1 (multi-language). Stel middleware in voor locale detectie. Maak `messages/en.json` aan met basis labels.

- [ ] **Step 5: Installeer en configureer shadcn/ui**

```bash
npx shadcn-ui@latest init
```

Kies: TypeScript, Tailwind CSS, `src/components/ui/`, default style, CSS variables

- [ ] **Step 6: Commit**

### Task 1.2: Design Tokens Implementeren

**Files:**
- Modify: `tailwind.config.ts`
- Create: `src/styles/globals.css` (design token CSS variables)
- Create: `src/styles/fonts.ts` (font loading)

- [ ] **Step 1: Implementeer het Cosmic Indigo kleurensysteem**

Alle tokens uit `docs/design-system/MASTER.md` sectie 3 (Color System) als CSS custom properties en Tailwind config.

Inclusief: light + dark mode, coverage status kleuren, semantic tokens.

- [ ] **Step 2: Configureer fonts**

Google Fonts: Nunito (700, 800, 900), DM Sans (400, 500, 700), JetBrains Mono (400, 500)

Tailwind font families: `display` (Nunito), `body` (DM Sans), `mono` (JetBrains Mono)

- [ ] **Step 3: Implementeer spacing, radius, shadow en z-index schalen**

Alle tokens uit MASTER.md sectie 5 (Spacing & Layout).

Let op: schaduwen gebruiken brand-tinted kleur (indigo rgba), niet pure black.

- [ ] **Step 4: Implementeer animatie configuratie**

Framer Motion spring configs uit MASTER.md sectie 6.1: `snappy`, `bouncy`, `gentle`, `wobbly`

Export als herbruikbare constanten vanuit `src/lib/motion.ts`

- [ ] **Step 5: Commit**

### Task 1.3: Supabase Project & Database Schema

**Files:**
- Create: `supabase/migrations/00001_initial_schema.sql`
- Create: `src/lib/supabase/client.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Maak Supabase project aan (Pro plan)**

Via Supabase Dashboard of CLI. Noteer URL, anon key, service role key.

- [ ] **Step 2: Pas `schema.sql` aan en voer uit**

Gebruik de DDL uit `docs/04-data-model/schema.sql`. Controleer:
- Alle tabellen aangemaakt
- RLS enabled op alle tabellen
- `auth.organization_id()` functie bestaat (D-02)
- `btree_gist` extensie actief
- Exclusion constraint op `shift_assignment` werkt
- Plan state transition trigger actief
- Audit triggers op 6 tabellen: `employee`, `plan_version`, `shift_assignment`, `labor_rule`, `employee_skill`, `employee_availability_override`

- [ ] **Step 3: Configureer Supabase clients**

- Browser client (`createBrowserClient`)
- Server client (`createServerClient` met cookies)
- Middleware client voor route protection

- [ ] **Step 4: Commit**

### Task 1.4: Authenticatie

**Files:**
- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Create: `src/app/(auth)/layout.tsx`
- Modify: `src/lib/supabase/middleware.ts`

- [ ] **Step 1: Implementeer login pagina**

Email/password login met Supabase Auth. Design volgens MASTER.md:
- Centered layout (480px max-width)
- Cosmic Indigo kleuren, Nunito headings
- Button met spring-physics press animatie
- Error shake animatie bij mislukte login
- Loading state op submit button

- [ ] **Step 2: Implementeer signup pagina**

Zelfde design patronen als login. Na signup: redirect naar wizard of dashboard.

- [ ] **Step 3: Configureer JWT custom claims**

JWT hook die `organization_id` en `role` injecteert in het token.
Supabase Auth hook of Database function die claims toevoegt.

- [ ] **Step 4: Implementeer 7-rollen model (per BUILD-PLAN.md)**

Alle 7 rollen met JWT custom claims en RLS policies:
- `super_admin` — Platform operations
- `tenant_admin` — Full config, user management, all sites, billing
- `site_manager` — Approve plans, manage workforce, invite users (assigned sites)
- `planner` — Create/edit plans, run optimizer, submit for approval (assigned sites)
- `supervisor` — View plans, manage team skills, approve overrides (assigned sites)
- `employee` — View own schedule, report absence, acknowledge shifts (self only)
- `viewer` — Read-only dashboards and published plans (assigned sites)

Implementeer op drie niveaus:
1. **UI route guards**: role-based page access
2. **tRPC middleware**: role check per procedure
3. **RLS policies**: role-based row filtering per tabel

- [ ] **Step 5: Implementeer route protection middleware**

- Niet-geauthenticeerd → redirect naar `/login`
- Geauthenticeerd zonder org → redirect naar `/wizard`
- Geauthenticeerd met org → toegang tot dashboard (role-based routing)
- Employee role → redirect naar `/schedule` (employee portal)

- [ ] **Step 6: Commit**

### Task 1.5: tRPC Foundation

**Files:**
- Create: `src/server/trpc.ts` (tRPC initialisatie, context)
- Create: `src/server/middleware/auth.ts`
- Create: `src/server/middleware/tenant.ts`
- Create: `src/server/routers/_app.ts` (root router)
- Create: `src/server/routers/admin.ts` (eerste werkende router)
- Create: `src/lib/trpc/client.ts`
- Create: `src/lib/trpc/provider.tsx`

- [ ] **Step 1: Configureer tRPC server**

- Context: Supabase client, user, organization_id, role
- Auth middleware: valideer JWT, extract claims
- Tenant middleware: zet organization_id context
- Error handling: map Supabase/Postgres errors naar tRPC error codes

- [ ] **Step 2: Implementeer root router met module sub-routers (empty stubs)**

```typescript
export const appRouter = createTRPCRouter({
  org: orgRouter,
  workforce: workforceRouter,
  demand: demandRouter,
  workload: workloadRouter,
  planning: planningRouter,
  scenario: scenarioRouter,
  wizard: wizardRouter,
  admin: adminRouter,
})
```

- [ ] **Step 3: Implementeer `admin.getSystemHealth`**

Eerste werkende endpoint. Controleert DB connectivity, geeft status terug.

- [ ] **Step 4: Configureer tRPC client + React Query provider**

- [ ] **Step 5: Commit**

### Task 1.6: CI/CD Pipeline

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: GitHub Actions CI workflow**

Op elke PR: lint, type-check, `vitest run`, Playwright (indien e2e tests bestaan)
Target: < 5 minuten

- [ ] **Step 2: Vercel integratie**

Link repo aan Vercel project. Preview deployment op PR, production op merge naar `main`.

- [ ] **Step 3: Commit**

### Task 1.7: Seed Data

**Files:**
- Create: `supabase/seed.sql`

- [ ] **Step 1: Schrijf seed script**

Inhoud:
- 1 organization ("AstraLogistics")
- 2 sites (Amsterdam DC, Rotterdam Hub — verschillende timezones)
- 5 processen (Picking, Packing, Receiving, Shipping, Forklift)
- Productivity standards per proces (5 proficiency levels per D-03)
- 20 medewerkers met gevarieerde skills, proficiency levels en contract types
- 3 shift patterns (day 06-14, afternoon 14-22, night 22-06)
- Demand forecasts voor 1 week (hourly)
- Labor rules (max 48h/week, 11h rust, max 6 opeenvolgende dagen)

- [ ] **Step 2: Test seed — voer uit op Supabase**

- [ ] **Step 3: Commit**

### Task 1.8: Base Layout Components

**Files:**
- Create: `src/components/layout/sidebar.tsx`
- Create: `src/components/layout/header.tsx`
- Create: `src/components/layout/app-shell.tsx`
- Create: `src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Implementeer collapsible sidebar**

- Desktop: 240px expanded, 64px collapsed (icon rail)
- Mobile: bottom navigation (max 5 items)
- Collapse/expand met `gentle` spring animatie
- Active item indicator schuift met `bouncy` spring
- Navigatie items: Dashboard, Planning, Medewerkers, Demand, Instellingen

- [ ] **Step 2: Implementeer header**

- Logo + org naam links
- Notificatie bell icon + user avatar rechts
- Command palette trigger (Cmd+K)
- Responsive

- [ ] **Step 3: Implementeer app shell (dashboard layout)**

Combineert sidebar + header + main content area.

- [ ] **Step 4: Commit**

**Exit criteria Fase 1:**
- [ ] `npm run dev` start de applicatie met login pagina
- [ ] Gebruiker kan inloggen en ziet een leeg dashboard met sidebar
- [ ] Design tokens (kleuren, fonts, shadows) zijn actief
- [ ] tRPC healthcheck endpoint werkt
- [ ] RLS voorkomt cross-tenant toegang
- [ ] Seed data is correct geladen
- [ ] CI pipeline draait op PR's
- [ ] Preview deployment werkt op Vercel

---

## Fase 2: Data Core

**Goal:** Alle entity CRUD werkt, CSV import werkt, audit trail vuurt.

### Task 2.1: Organization & Site Management

**Files:**
- Create: `src/server/routers/org.ts`
- Create: `src/app/(dashboard)/settings/page.tsx`
- Create: `src/app/(dashboard)/settings/sites/page.tsx`
- Create: `src/app/(dashboard)/settings/sites/[siteId]/page.tsx`

Procedures: `org.getOrganization`, `org.updateOrganization`, `org.listSites`, `org.getSite`, `org.updateSiteSettings`, `org.listDepartments`

Site settings inclusief: `allowance_factor`, `allowance_breakdown`, `operating_hours`, `max_headcount`, `absenteeism_rate`

### Task 2.2: Process Management

**Files:**
- Create: `src/server/routers/org.ts` (extend met process procedures)
- Create: `src/app/(dashboard)/settings/processes/page.tsx`

Procedures: `org.listProcesses`, `org.upsertProcess`

Inclusief productivity standards voor alle 5 proficiency levels per D-03.
Validatie: `units_per_hour > 0`, Level 4 is baseline (1.0x)

### Task 2.3: Employee Management

**Files:**
- Create: `src/server/routers/workforce.ts`
- Create: `src/app/(dashboard)/employees/page.tsx` (lijst)
- Create: `src/app/(dashboard)/employees/[employeeId]/page.tsx` (detail)
- Create: `src/components/domain/employee-list.tsx`
- Create: `src/components/domain/employee-detail.tsx`

Procedures: `workforce.listEmployees` (search, filters, pagination), `workforce.getEmployee`, `workforce.upsertEmployee`

UI: Master-detail layout volgens `docs/design-system/pages/employee-management.md`:
- Lijst met avatar, naam, afdeling badge, skill count pill
- Hover lift animatie op list items
- Search met instant filtering (debounced 200ms)
- Status dot: active (groen), on_leave (amber), terminated (grijs)

### Task 2.4: CSV Import Engine

**Files:**
- Create: `src/lib/csv/parser.ts`
- Create: `src/lib/csv/validator.ts`
- Create: `src/lib/csv/mapper.ts`
- Create: `src/components/domain/csv-import-wizard.tsx`

Generiek CSV import framework:
1. Upload bestand → preview kolommen
2. Map kolommen naar schema velden (drag-drop met spring animaties)
3. Valideer → toon errors per rij
4. Importeer met progress bar

Specifieke importers: medewerkers, skills, demand data
Constraints: UTF-8, comma-delimited, max 50 MB
Library: Papa Parse

### Task 2.5: Skill Systeem

**Files:**
- Extend: `src/server/routers/workforce.ts`
- Create: `src/components/domain/skill-matrix.tsx`
- Create: `src/components/domain/skill-badge.tsx`

Procedure: `workforce.updateSkill`

UI:
- Skill badges met proficiency level dots (5 dots, gevuld per level)
- Dots animeren bij eerste view: sequentieel vullen (100ms per dot, scale-in)
- Certification badge met expiry datum
- Skill matrix: employees × processen grid, click om proficiency te zetten

### Task 2.6: Availability Management

**Files:**
- Extend: `src/server/routers/workforce.ts`
- Create: `src/components/domain/availability-calendar.tsx`

Procedures: `workforce.createAvailabilityOverride`, `workforce.updateAvailabilityOverride`

UI: Weekkalender view met beschikbaarheidsblokken.
Click-to-toggle beschikbaarheid met groene fill animatie.

### Task 2.7: Audit Verificatie

- [ ] Bevestig dat triggers vuren op: `employee`, `employee_skill`, `employee_availability_override`
- [ ] Verifieer `audit_log` records bevatten `before_state` en `after_state` JSONB
- [ ] Implementeer `admin.getAuditLog` query met filters

**Exit criteria Fase 2:**
- [ ] CRUD werkt voor alle entities (org, site, process, employee, skill, availability)
- [ ] CSV import verwerkt 1.000 medewerkers met validatie-errors gerapporteerd
- [ ] Skill matrix toont en update correct
- [ ] Audit log toont correcte before/after state
- [ ] RLS bevestigd: user in Org A kan Org B's data niet zien
- [ ] Alle tRPC procedures matchen signatures in `api-contracts.md`

---

## Fase 3: Demand & Workload Engine

**Goal:** Demand stroomt in, workload formules berekenen FTE requirements.

### Task 3.1: Demand Ingestion

**Files:**
- Create: `src/server/routers/demand.ts`
- Create: `src/app/(dashboard)/demand/page.tsx`
- Create: `src/components/domain/demand-upload.tsx`
- Create: `src/components/domain/demand-table.tsx`

Procedures: `demand.listForecasts`, `demand.upsertForecast`, `demand.importCSV`, `demand.deleteForecasts`, `demand.listDemandTypes`, `demand.upsertDemandType`

Features:
- CSV upload met kolom mapping en validatie
- REST API endpoint voor programmatic ingestion
- Versioning: elke upload maakt nieuwe versie, vorige bewaard
- Demand type → process mapping met conversie ratios
- UI: demand tabel met filters, versie history, upload geschiedenis

### Task 3.2: Workload Computation Engine

**Files:**
- Create: `src/server/services/workload.ts`
- Create: `src/server/routers/workload.ts`
- Create: `tests/unit/workload.test.ts`

Procedure: `workload.compute`

Implementeert de INVARIANTE formule keten:
```
process_volume = demand_volume * conversion_ratio
required_hours = process_volume / productivity_rate * (1 + allowance_factor)
required_fte = required_hours / available_hours_per_fte
gross_fte = required_fte / (1 - absenteeism_rate)
```

- Per-shift berekening met `period_start` / `period_end` timestamptz
- Skill-level gewogen UPH: proficiency-adjusted productivity rates
- Allowance factor: single scalar per D-07
- Absenteeism buffer: `site.settings_json.absenteeism_rate`

**CRITICAL:** Unit tests moeten hand-berekende waarden matchen (< 1% afwijking)

### Task 3.3: Workload Dashboard

**Files:**
- Create: `src/app/(dashboard)/workload/page.tsx`
- Create: `src/components/domain/workload-chart.tsx`
- Create: `src/components/domain/fte-gap-view.tsx`

UI:
- Bar charts: required FTEs vs available FTEs per process per time slot
- KPI cards: total required FTEs, total available, gap percentage
- Animated number counters (counter roll, 600ms)
- Staggered entrance voor chart bars
- Filterable per site, datumbereik, proces

### Task 3.4: Auto-Recompute bij Demand Wijziging

- Database Webhook op `demand_forecast` INSERT/UPDATE
- Edge Function triggert workload herberekening
- Gepubliceerde plannen marked als `stale` bij demand wijziging

**Exit criteria Fase 3:**
- [ ] CSV demand upload voor 1 week hourly data slaagt met validatie
- [ ] Workload output matcht hand-berekende waarden (< 1% afwijking)
- [ ] Demand versioning werkt: upload V1, upload V2, beiden zichtbaar
- [ ] Dashboard toont correcte required vs available FTE bars
- [ ] Demand type met 2 process mappings (1 order = 1 pick + 1 pack) fant correct uit
- [ ] Gepubliceerd plan transitiëert naar `stale` bij demand update

---

## Fase 4: Optimization Engine

**HOOGSTE RISICO FASE. Bevat een decision gate.**

### Task 4.0: Decision Gate — HiGHS WASM Benchmark

**Files:**
- Create: `scripts/benchmark-highs.ts`

- [ ] **Benchmark HiGHS WASM** met representatief probleem: 50 medewerkers, 5 processen, 7-dag horizon, 3 shifts/dag
- [ ] Meet: geheugengebruik, solve time, solution quality
- [ ] **GO:** < 200 MB memory EN < 10s solve time → Edge Function als primary
- [ ] **NO-GO:** overschrijdt limieten → ALLE optimalisatie via Fly.io worker

### Task 4.1: Greedy Heuristic

**Files:**
- Create: `src/lib/solver/greedy.ts`
- Create: `tests/unit/solver/greedy.test.ts`

Implementeert `SolverInput → SolverOutput` contract exact.
Assignment prioriteit: hoogste-demand slots eerst, best-skilled beschikbare medewerker.
Hard constraint checking bij elke assignment poging.
Sub-seconde executie tot 200 medewerkers.

**Test:** moet exact de expected output produceren van de test fixture in `solver-contract.md`

### Task 4.2: Constraint Engine

**Files:**
- Create: `src/lib/solver/constraints.ts`
- Create: `src/lib/solver/validator.ts`
- Create: `tests/unit/solver/constraints.test.ts`
- Create: `tests/unit/solver/validator.test.ts`

Hard constraints: max weekly hours, min rest between shifts, max consecutive days, required certification, min skill level, no overlapping assignments, mandatory break, site capacity, employee availability.

Post-solve validator: onafhankelijk alle hard constraints verifiëren op solver output (INV-5).

### Task 4.3: HiGHS MIP Integratie

**Files:**
- Create: `src/lib/solver/highs.ts`
- Create: `src/lib/solver/formulator.ts` (SolverInput → MIP model)
- Create: `src/lib/solver/parser.ts` (MIP solution → SolverOutput)
- Create: `tests/unit/solver/highs.test.ts`

Problem formulering:
- Decision variables: binair `x[employee][process][timeslot]` = 1 als toegewezen
- Hard constraints → MIP constraints
- Soft constraints → penalty termen in objective function
- Time budget enforcement
- Optimality gap reporting

### Task 4.4: Plan Generation Pipeline

**Files:**
- Create: `src/server/routers/planning.ts`
- Create: `src/server/services/plan-generator.ts`

Flow:
1. `planning.createDraft` → leeg plan version
2. `workload.compute` → workload requirements
3. `planning.runOptimizer` → queue optimization job
4. Solver draait, schrijft resultaat naar `shift_assignment_staging`
5. Atomic swap: staging → `shift_assignment`, status naar `optimized`
6. Solver metrics opgeslagen in `plan_version.summary_metrics_json`

### Task 4.5: Plan State Machine

Alle 8 states: `draft`, `optimized`, `proposed`, `approved`, `published`, `stale`, `superseded`, `rejected`

`planning.transitionState` met validatie: alleen geldige transities.
Role-based transition permissions per `api-contracts.md`.

### Task 4.6: Infeasibility Handling

`analyzeInfeasibility()`: identificeer conflicterende constraints, geef suggesties.
Partial solutions met `unmet_demand` populated.

### Task 4.7: Fly.io Fallback Worker (indien nodig per decision gate)

- Fly.io applicatie met Node.js + HiGHS native bindings
- BullMQ job queue via Upstash Redis
- Progress reporting via Supabase Realtime

**Exit criteria Fase 4:**
- [ ] Greedy heuristic produceert valid plan voor test fixture (5 employees, 3 processen, 1 dag)
- [ ] HiGHS MIP produceert valid plan voor 50 medewerkers, 7 dagen in < 10 seconden
- [ ] Post-solve validator vangt opzettelijk ongeldige solutions (100% detectie)
- [ ] Plan state machine weigert ongeldige transities
- [ ] Infeasibility report identificeert correct de oorzaak
- [ ] Fly.io worker verwerkt een queued job en schrijft resultaat terug naar Supabase
- [ ] Optimizer run produceert audit log entry met input hash, strategy, solve time, result hash

---

## Fase 5: Planning UX

**Goal:** Planners kunnen het geoptimaliseerde plan zien, begrijpen en aanpassen.

### Task 5.1: Control Room Dashboard

**Files:**
- Create: `src/app/(dashboard)/control-room/page.tsx`
- Create: `src/components/domain/kpi-strip.tsx`
- Create: `src/components/domain/coverage-heatmap.tsx`
- Create: `src/components/domain/alert-feed.tsx`

Design: `docs/design-system/pages/control-room.md`

- Full-bleed layout, sidebar als icon rail (64px)
- KPI strip bovenaan met animated number counters (40px JetBrains Mono)
- Coverage heatmap als hero element (custom SVG)
- Alert feed rechts met staggered spring-in animaties
- Real-time updates via Supabase Realtime

### Task 5.2: Schedule Grid

**Files:**
- Create: `src/app/(dashboard)/planning/page.tsx`
- Create: `src/components/domain/schedule-grid.tsx`
- Create: `src/components/domain/grid-cell.tsx`
- Create: `src/components/domain/grid-toolbar.tsx`

Design: `docs/design-system/pages/schedule-grid.md`

- Rows = medewerkers, Columns = time slots
- Sticky first column (naam + avatar) + sticky header row
- Cell content: process naam badge + uren
- Color coding per coverage status
- Virtualized rows en columns (react-window) voor performance
- Staggered entrance: rijen stagger in (30ms per rij)

### Task 5.3: Drag-and-Drop Assignment

**Files:**
- Create: `src/components/domain/draggable-assignment.tsx`
- Create: `src/components/domain/droppable-cell.tsx`
- Extend: `src/components/domain/schedule-grid.tsx`

Meest animatie-intensieve feature:
- dnd-kit integratie
- Drag start: cell lift (scale 1.05, elevation-3, opacity 0.85)
- Over valid target: target pulst met groene border
- Drop success: "plop" animatie (scale 1.06→1.0, wobbly spring)
- Drop met constraint violation: snap-back + error toast
- Real-time constraint validatie via greedy heuristic

### Task 5.4: Gap View & Employee Suggestions

**Files:**
- Create: `src/components/domain/gap-view.tsx`

Lijst van uncovered demand slots gesorteerd op severity.
Per gap: proces, time slot, required FTE, assigned FTE, gap.
"Suggest best employee" button: draait greedy heuristic, toont top 3 kandidaten.

### Task 5.5: Plan Comparison & Export

- Twee plan versies side-by-side: assignments added/removed/changed
- KPI vergelijking: cost delta, coverage delta, overtime delta
- PDF export (printbaar schedule grid)
- CSV export (assignment data)

### Task 5.6: Real-time Collaboration

- Supabase Realtime subscription op `plan_version` en `shift_assignment`
- Presence indicators: wie bekijkt/bewerkt dit plan
- Live updates bij wijzigingen (1-3s latency per D-16)

**Exit criteria Fase 5:**
- [ ] Control Room laadt in < 3 seconden met realistic data
- [ ] Coverage heatmap kleuren matchen actual fill rates
- [ ] Drag-and-drop valideert constraints en toont violation reasons in < 1 seconde
- [ ] KPI cards updaten wanneer assignments wijzigen
- [ ] Gap view toont alle uncovered slots
- [ ] Plan comparison toont correct diff

---

## Fase 6: Setup Wizard (parallel met Fase 5)

**Goal:** Nieuwe tenants kunnen zichzelf onboarden via een guided wizard.

### Task 6.1: Wizard Framework

**Files:**
- Create: `src/app/(dashboard)/wizard/page.tsx`
- Create: `src/app/(dashboard)/wizard/layout.tsx`
- Create: `src/components/domain/wizard-shell.tsx`
- Create: `src/components/domain/wizard-stepper.tsx`
- Create: `src/stores/wizard-store.ts`

Design: `docs/design-system/pages/setup-wizard.md`

- Centered layout (720px max)
- Step indicator met animated progress bar
- State persistence: localStorage + server backup
- Stap transities: content slides met bouncy spring
- Resumable na browser refresh

### Task 6.2: Wizard Steps 1-5

5 stappen per D-12. **Mapping t.o.v. mvp-definition.md** (die 6 steps noemt):
- mvp-definition steps 1+2 (Org setup + Site definition) → **Wizard Step 1+2**
- mvp-definition step 3 (Process config) → **Wizard Step 3** (inclusief productivity rates + demand type mapping)
- mvp-definition steps 4+5 (Workforce import + Skill taxonomy) → **Wizard Step 4** (gecombineerd per D-12)
- mvp-definition step 6 (Planning rules) → verplaatst naar site settings (niet in wizard per D-12)
- Nieuw: **Wizard Step 5** (Go-live checklist) — niet in mvp-definition maar wel in D-12

De 5 stappen:
1. **Organization**: bedrijfsnaam, industry vertical, timezone, admin user setup
2. **Sites**: site definitie, operating hours, zones, allowance breakdown, absenteeism rate
3. **Processen**: templates per industry, productivity rates per 5 proficiency levels, demand type → process mapping met conversie ratios
4. **Medewerkers + Skills**: CSV import of handmatige invoer, bulk skill assignment, availability templates
5. **Go-live checklist**: validatie summary, completeness checks, test plan generatie, activeer

### Task 6.3: Smart Defaults & AI Suggestions

- Pre-filled waarden per industry selection
- Claude API suggesties (async, niet blokkerend)
- "Based on your industry" tooltips

### Task 6.4: Completion Celebration

- Confetti particles bij afronding (15-20 particles, gravity physics)
- Checkmark SVG path draw animatie
- "You're all set!" tekst met bouncy spring
- CTA buttons met stagger fade-in

**Exit criteria Fase 6:**
- [ ] Nieuwe tenant voltooit wizard in < 60 minuten
- [ ] Wizard maakt alle entities aan: org, site, processen, medewerkers met skills
- [ ] Wizard kan hervat worden na browser refresh
- [ ] Smart defaults vullen redelijke waarden per industry

---

## Fase 7: Employee Portal & Polish

**Goal:** Medewerkerportaal, scenario's, approval workflow, notificaties.

### Task 7.1: Employee Schedule Portal (per D-08)

> **Scope note:** `mvp-definition.md` lists employee self-service portal as V2. However, `DECISIONS.md` D-08 overrides this: "Minimal web portal in MVP" because without it, supervisors must manually enter all absences — operationally infeasible for 500+ employee sites. BUILD-PLAN.md Phase 6 confirms inclusion.

- Mijn rooster view (read-only, week navigatie)
- Afwezigheid melden formulier
- Schedule acknowledgment button
- Aparte vereenvoudigde login ervaring voor medewerkers

### Task 7.2: Scenario Simulation

- `scenario.create`: kloon plan, definieer wijzigingen
- `scenario.run`: heroptimaliseer met gewijzigde inputs
- Side-by-side vergelijking: cost/coverage/overtime deltas
- `scenario.promote`: promoveer scenario naar nieuw plan version

### Task 7.3: Approval Workflow

- `planning.transitionState`: propose, approve, reject, publish
- Rejection vereist reden
- Approval vereist approver ≠ proposer
- Email notificatie bij state transitions

### Task 7.4: Notification Center

- Bell icon in header met unread count badge
- Notification dropdown met recente notificaties (spring-in animatie)
- Click → navigeer naar relevant pagina
- Mark as read (individueel en bulk)
- Notificatie types: schedule_published, plan_stale, approval_needed, absence_reported

### Task 7.5: Basic Reporting

- Weekly summary report per site: total cost, coverage %, overtime hours, FTE utilization per proces
- Plan vs actual view: geplande uren vs werkelijke uren per medewerker (waar `actual_hours` beschikbaar)
- Filterable per site en datumbereik
- Exporteerbaar als CSV
- Animated chart entrances per design system

### Task 7.6: Dashboard Landing

- Site overview cards
- Actieve plannen
- Pending approvals
- Recente notificaties
- Quick actions: nieuw plan, huidig rooster, scenario draaien

### Task 7.7: Error Handling Polish

- User-friendly error messages voor alle failure modes
- Solver timeout: "Optimization took longer than expected. Showing best solution found."
- Constraint violation: specifieke reden met affected constraint naam
- Empty states: helpful messages met actie ("No employees yet — import via CSV")
- Network errors: retry met exponential backoff

**Exit criteria Fase 7:**
- [ ] Medewerker ziet gepubliceerd rooster voor huidige week
- [ ] Medewerker meldt afwezigheid, planner ziet het, plan wordt stale
- [ ] Scenario: demand +20%, heroptimaliseer, vergelijk met baseline
- [ ] Approval flow: planner proposes → manager approves → planner publishes
- [ ] Notificatie bij schedule publicatie
- [ ] Weekly report matcht KPI cards op het dashboard
- [ ] Alle error states tonen user-friendly messages (geen raw error codes)

---

## Fase 8: Hardening

**Goal:** Security geverifieerd, performance gevalideerd, edge cases afgehandeld.

### Task 8.1: RLS Penetration Test

- 2 test tenants met volledige data
- Cross-tenant access poging op alle 40+ tRPC endpoints
- Verifieer: nul data lekkage
- Test service role isolatie bij background jobs

### Task 8.2: Performance Test

- 50 concurrent users (k6 of Artillery)
- API P95 < 500ms
- Dashboard load < 3 seconden op 10 Mbps
- CSV import: 10.000 rijen in < 30 seconden
- Workload computation: 168 time slots in < 5 seconden

### Task 8.3: Solver Stress Test

- 200 medewerkers, 14-dag horizon, 5 processen, 3 shifts/dag
- HiGHS MIP binnen 60-seconde budget
- Coverage > 80%, geen hard constraint violations

### Task 8.4: Edge Case Handling

- Empty states: geen medewerkers, geen demand, geen processen
- Boundary conditions: medewerker met 0 contracted hours, proces met 0 UPH
- Midnight-crossing shifts: 22:00 - 06:00 volgende dag
- Timezone edge cases: DST overgangen
- Concurrent edits: twee planners bewerken hetzelfde plan

### Task 8.5: Accessibility Audit

- Keyboard navigatie voor alle interactieve elementen
- Focus rings zichtbaar (2-4px)
- Screen reader compatibiliteit (aria-labels, landmarks)
- `prefers-reduced-motion` gerespecteerd
- Contrast ratios geverifieerd in beide modes
- Touch targets ≥ 44px

### Task 8.6: Documentatie

- API reference: auto-gegenereerd vanuit tRPC router definities
- Deployment guide: stap-voor-stap voor Vercel + Supabase + Fly.io
- Runbook: veelvoorkomende failure scenarios en resolutie stappen (Edge Function timeout, DB connection exhaustion, solver failure)

### Task 8.7: Design System Quality Gate

Voer de volledige pre-delivery checklist uit `docs/design-system/MASTER.md` sectie 15 uit voor alle pagina's:
- Visual Quality (icons, corners, shadows, fonts, tokens)
- Interaction (press animations, hover lifts, touch targets, loading states)
- Data Display (JetBrains Mono numbers, animated counters, status indicators)
- Responsive (375px, 768px, 1024px, 1440px)
- Dark Mode (beide modes getest, contrast geverifieerd)
- Accessibility (keyboard nav, focus rings, aria-labels, heading hierarchy)

**Exit criteria Fase 8:**
- [ ] Nul cross-tenant data lekkage
- [ ] Alle performance targets gehaald
- [ ] Solver handled 200 medewerkers zonder crashes
- [ ] Edge cases produceren friendly error messages, geen crashes
- [ ] Accessibility checklist volledig gepasseerd
- [ ] API reference, deployment guide en runbook geschreven
- [ ] Design system quality gate gepasseerd voor alle pagina's

---

## Fase 9: Launch Prep

**Goal:** Klaar voor eerste gebruikers.

### Task 9.1: Monitoring & Alerting

- Sentry geconfigureerd (frontend + Edge Functions)
- BetterUptime healthcheck
- Supabase Dashboard alerting
- Error budget: < 0.5% error rate

### Task 9.2: Seed Data voor Demo

- Realistische demo dataset: 150 medewerkers, 3 sites, 2 weken demand (per BUILD-PLAN.md)
- Pre-generated optimized plans voor demo walk-through
- Scenario voorbeelden met duidelijke cost/coverage trade-offs

### Task 9.3: In-App Onboarding Flow

- First-login welcome screen met product overview
- Guided tour (tooltips) voor key features: Control Room, Schedule Grid, Demand Upload
- "Try with demo data" optie die seed data laadt voor nieuwe tenants
- Tour dismissable en herstart-baar vanuit Settings

### Task 9.4: Onboarding Documentatie

- Quick start guide voor nieuwe klanten
- Wizard walk-through met screenshots
- API documentatie voor demand ingestion endpoint
- Troubleshooting FAQ

### Task 9.5: Operationele Readiness

- Feature flags / kill switches voor optimizer en AI features (via `organization.feature_flags` JSONB)
- Rate limiting per tenant voor Claude API calls (configurable quota)
- Legal pages: Terms of Service, Privacy Policy (statische pagina's)
- Beta testing plan: 2-5 echte gebruikers, feedback collectie, bug triage (P0-P3 classificatie)

### Task 9.6: Final Verification

Alle success criteria uit `docs/09-mvp-scope/mvp-definition.md` sectie 6:
- [ ] Functional criteria (9 items)
- [ ] Non-functional criteria (7 items)
- [ ] Quality criteria (5 items)
- [ ] Operational criteria (4 items)

**Exit criteria Fase 9:**
- [ ] Monitoring live en werkend
- [ ] Demo dataset beschikbaar (150 medewerkers, 3 sites)
- [ ] In-app onboarding tour functioneel
- [ ] Documentatie compleet (quick start, API docs, FAQ)
- [ ] Feature flags en rate limiting operationeel
- [ ] Legal pages live (ToS, Privacy Policy)
- [ ] Beta feedback verwerkt, geen open P0/P1 bugs
- [ ] Alle MVP success criteria uit `mvp-definition.md` sectie 6 gepasseerd
- [ ] **LAUNCH READY** ✓

---

## Bijlage: File Architecture Overview

```
src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx                    # App shell with sidebar
│   │   ├── page.tsx                      # Landing dashboard
│   │   ├── control-room/page.tsx         # Control Room
│   │   ├── planning/page.tsx             # Schedule Grid
│   │   ├── employees/
│   │   │   ├── page.tsx                  # Employee list
│   │   │   └── [employeeId]/page.tsx     # Employee detail
│   │   ├── demand/page.tsx               # Demand management
│   │   ├── workload/page.tsx             # Workload dashboard
│   │   ├── settings/
│   │   │   ├── page.tsx                  # Org settings
│   │   │   ├── sites/page.tsx            # Site list
│   │   │   ├── sites/[siteId]/page.tsx   # Site detail
│   │   │   └── processes/page.tsx        # Process management
│   │   └── wizard/
│   │       ├── page.tsx                  # Wizard flow
│   │       └── layout.tsx                # Wizard layout (no sidebar)
│   └── (employee)/                       # Employee portal
│       ├── layout.tsx
│       ├── schedule/page.tsx
│       └── absence/page.tsx
├── components/
│   ├── ui/                               # shadcn/ui components
│   ├── domain/
│   │   ├── kpi-strip.tsx
│   │   ├── kpi-card.tsx
│   │   ├── coverage-heatmap.tsx
│   │   ├── alert-feed.tsx
│   │   ├── schedule-grid.tsx
│   │   ├── grid-cell.tsx
│   │   ├── grid-toolbar.tsx
│   │   ├── draggable-assignment.tsx
│   │   ├── droppable-cell.tsx
│   │   ├── gap-view.tsx
│   │   ├── employee-list.tsx
│   │   ├── employee-detail.tsx
│   │   ├── skill-matrix.tsx
│   │   ├── skill-badge.tsx
│   │   ├── availability-calendar.tsx
│   │   ├── demand-upload.tsx
│   │   ├── demand-table.tsx
│   │   ├── workload-chart.tsx
│   │   ├── fte-gap-view.tsx
│   │   ├── csv-import-wizard.tsx
│   │   ├── wizard-shell.tsx
│   │   ├── wizard-stepper.tsx
│   │   ├── plan-comparison.tsx
│   │   ├── notification-center.tsx
│   │   └── animated-number.tsx
│   └── layout/
│       ├── sidebar.tsx
│       ├── header.tsx
│       └── app-shell.tsx
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   ├── server.ts
│   │   └── middleware.ts
│   ├── trpc/
│   │   ├── client.ts
│   │   └── provider.tsx
│   ├── solver/
│   │   ├── greedy.ts
│   │   ├── highs.ts
│   │   ├── formulator.ts
│   │   ├── parser.ts
│   │   ├── constraints.ts
│   │   └── validator.ts
│   ├── csv/
│   │   ├── parser.ts
│   │   ├── validator.ts
│   │   └── mapper.ts
│   ├── motion.ts                         # Spring configs
│   └── utils/
│       ├── format.ts
│       └── dates.ts
├── server/
│   ├── trpc.ts
│   ├── middleware/
│   │   ├── auth.ts
│   │   └── tenant.ts
│   ├── routers/
│   │   ├── _app.ts
│   │   ├── org.ts
│   │   ├── workforce.ts
│   │   ├── demand.ts
│   │   ├── workload.ts
│   │   ├── planning.ts
│   │   ├── scenario.ts
│   │   ├── wizard.ts
│   │   └── admin.ts
│   └── services/
│       ├── workload.ts
│       └── plan-generator.ts
├── stores/
│   ├── planning-store.ts
│   └── wizard-store.ts
├── types/
│   └── solver.ts
└── styles/
    ├── globals.css
    └── fonts.ts
```
