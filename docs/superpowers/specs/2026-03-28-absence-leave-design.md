# Verzuim & Verlof — Design Spec

**Datum:** 2026-03-28
**Status:** Goedgekeurd
**Scope:** Twee aparte pagina's (verzuim + verlof) met wizard flows, impact alerts, en AI-gedreven vervangsuggesties

---

## 1. Overzicht

Twee nieuwe pagina's voor afwezigheidsbeheer:
- **Verzuim** (`/dashboard/verzuim`) — ziek/herstelmeldingen door supervisors/managers
- **Verlof** (`/dashboard/verlof`) — verlofaanvragen door iedereen, goedkeuring door supervisors/managers

Beide integreren met de workload compute pipeline zodat afwezigheid direct zichtbaar is in de FTE coverage.

## 2. Rollenmodel

### Verzuim

| Actie | tenant_admin | site_manager | supervisor | planner | employee |
|---|---|---|---|---|---|
| Ziekmelding doen | ja | ja | ja (eigen team) | nee | nee |
| Herstelmelding doen | ja | ja | ja (eigen team) | nee | nee |
| Verzuim historie (alle) | ja | ja | nee | nee | nee |
| Verzuim historie (eigen team) | ja | ja | ja | nee | nee |

**Belangrijk:** Niemand mag zichzelf ziek- of betermelden. Verzuim-reden wordt NIET opgeslagen (AVG/WAV compliance). Planners en employees hebben geen toegang tot het verzuimscherm.

### Verlof

| Actie | tenant_admin | site_manager | planner | supervisor | employee |
|---|---|---|---|---|---|
| Eigen verlof aanvragen | ja | ja | ja | ja | ja |
| Verlof voor ander aanvragen | ja | ja | nee | ja (eigen team) | nee |
| Verlof goedkeuren/afwijzen | ja | ja | nee | ja (eigen team) | nee |
| Verlofoverzicht (alle) | ja | ja | ja (leesrechten) | nee | nee |
| Eigen verlof zien | ja | ja | ja | ja | ja |

## 3. Database

Bestaande `employee_availability_override` tabel wordt gebruikt. Geen migratie nodig.

- `override_type = 'absence'` voor verzuim
- `override_type = 'leave'` voor verlof
- `status`: `planned` (aangevraagd), `confirmed` (goedgekeurd/bevestigd), `cancelled`
- `reason`: altijd NULL voor verzuim (AVG), vrij tekstveld voor verlof
- `start_date`, `end_date`: periode van afwezigheid
- `start_time`, `end_time`: NULL = hele dag, anders partieel

## 4. API (tRPC Router)

Nieuwe router: `src/server/routers/absence.ts`

| Endpoint | Min. rol | Beschrijving |
|---|---|---|
| `reportSick` | supervisor | Ziekmelding (alleen voor teamlid, niet voor zichzelf) |
| `reportRecovered` | supervisor | Herstelmelding |
| `requestLeave` | employee | Verlofaanvraag (voor zichzelf) |
| `requestLeaveFor` | supervisor | Verlof voor teamlid |
| `approveLeave` | supervisor | Goedkeuren/afwijzen |
| `listActive` | supervisor | Lopende afwezigheden (gefilterd op rol/team) |
| `listHistory` | manager | Historische data (verzuim: alleen manager+) |
| `getImpact` | supervisor | Impact-berekening: welke processen/shifts geraakt |
| `getSuggestions` | supervisor | Vervangers voorstellen op basis van scoring |

### Role filtering

- supervisor: queries gefilterd op `crew_id` match (eigen team)
- manager+: alles op de site
- planner: alleen verlof-endpoints, geen verzuim

### Zelfmelding blokkade

`reportSick` en `reportRecovered` valideren dat `employee_id !== ctx.user.id`. Server-side enforced, niet alleen UI.

## 5. Solver Integratie

### Workload compute aanpassing

De `workload.ts` compute pipeline krijgt een extra stap:

1. Query `employee_availability_override` voor overrides die overlappen met de compute-periode
2. Voor elke match: zet `available_hours = 0` voor die medewerker/dag combinatie
3. Coverage herberekening reflecteert automatisch de afwezigheid

### Impact Alert (Laag 1)

Bij ziek/verlofmelding berekent `getImpact`:
- Welke processen de medewerker skills voor heeft
- Hoeveel coverage daalt per proces/week
- Hoeveel shifts onbezet raken

Getoond in wizard bevestigingsstap.

### Vervangsuggesties (Laag 2)

`getSuggestions` berekent een gewogen score (0-100) per kandidaat:

| Factor | Gewicht | Berekening |
|---|---|---|
| Skill match | 40% | Proficiency level 1-5 → score 20-100 |
| Beschikbaarheid | 30% | Geen overlap = 100, deels = pro-rata, al ingepland = -50 |
| Team proximity | 15% | Zelfde crew=100, zelfde dept=60, andere dept=20 |
| Recente inzet | 15% | Niet recent = bonus, recent = penalty |

Output: Top 3-5 kandidaten met confidence badge (hoog/medium/laag).

Suggesties zijn adviserend — geen automatische herplanning (dat is Phase 5 Laag 3).

**NB:** Het suggestie-algoritme is een actief design topic. Zie `memory/project_suggestion_algorithm.md` voor open vragen en evolution path.

## 6. UI Componenten

### Nieuwe bestanden

| Component | Bestand | Doel |
|---|---|---|
| Verzuim pagina | `src/app/dashboard/verzuim/page.tsx` | Hoofdpagina met timeline + KPIs |
| Verlof pagina | `src/app/dashboard/verlof/page.tsx` | Hoofdpagina met timeline + kalender |
| AbsenceWizard | `src/components/domain/absence-wizard.tsx` | Ziekmelding wizard (3 stappen) |
| LeaveWizard | `src/components/domain/leave-wizard.tsx` | Verlof wizard (4 stappen) |
| AbsenceCard | `src/components/domain/absence-card.tsx` | Animated timeline card |
| ImpactAlert | `src/components/domain/impact-alert.tsx` | Coverage impact preview |
| ReplacementSuggestions | `src/components/domain/replacement-suggestions.tsx` | Gescoorde vervangsuggesties |
| MiniCalendar | `src/components/domain/mini-calendar.tsx` | Compacte maandkalender |

### Pagina layouts

**Verzuim:** KPI strip (3 cards) + timeline cards (actieve ziekmeldingen) + historisch overzicht (accordion, manager+)

**Verlof:** KPI strip (3 cards) + timeline cards (lopende aanvragen) + mini kalender sidebar

### Wizard flows

**Verzuim wizard (3 stappen):**
1. Zoek medewerker — live search, avatar cards, gefilterd op eigen team voor supervisor
2. Datum selectie — eerste ziektedag + verwachte duur (optioneel)
3. Bevestiging — impact alert + vervangsuggesties + bevestig-knop

**Verlof wizard (4 stappen):**
1. Medewerker selectie — "voor mezelf" toggle of teamlid zoeken
2. Datum range — kalender date-range picker (van-tot)
3. Type + notitie — vakantie/bijzonder verlof/onbetaald + optionele notitie
4. Review — impact alert + vervangsuggesties + submit

### Animaties (AAA-grade)

- Wizard stap-transities: slide + spring physics (bestaande `snappy` transition)
- Ziekmelding bevestigd: animated checkmark SVG + card verschijnt in timeline met spring bounce
- Herstelmelding: card kleurt groen, particle burst, fade-out naar historie
- Impact alert: coverage bars groeien in, percentage animeert naar beneden
- Suggestie-cards: stagger entrance, confidence score als animated radial mini-gauge
- Kalender: datum-selectie met glassmorphism highlight, range-selectie kleurt in met gradient
- Verlof goedgekeurd: confetti-achtige particle burst + status-badge morph

## 7. Navigatie

Twee nieuwe items in de sidebar:
- "Verzuim" — alleen zichtbaar voor supervisor, site_manager, tenant_admin
- "Verlof" — zichtbaar voor iedereen

Positie: onder "Medewerkers", boven "Planning".

## 8. Buiten scope

- Automatische herplanning (Phase 5 Laag 3)
- Verlof-saldo berekening (vakantiedagen tellen)
- Bedrijfsarts integratie
- Wettelijke meldtermijnen (UWV 42e-dag melding)
- Push notificaties bij goedkeuring/afwijzing
