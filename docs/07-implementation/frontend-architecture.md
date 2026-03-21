# Frontend Architecture

## 1. Overview

AstraPlanner's frontend is a Next.js 14+ application using the App Router, built entirely in TypeScript. The interface serves three distinct user archetypes with different needs:

| User Archetype | Primary Interface | Device | Key Requirement |
|---|---|---|---|
| **Site Planner** | Planning Workbench | Desktop (dual monitor) | Precision: drag-and-drop scheduling, constraint visibility, optimization controls |
| **Site Manager** | Control Room | Desktop or tablet (landscape) | Oversight: real-time coverage, alerts, approval workflow |
| **Regional Director** | Reports and Multi-site Dashboard | Desktop or tablet | Aggregation: cross-site KPIs, cost trends, scenario comparison |

The architecture is optimized for the planner experience (the most complex and performance-sensitive interface) while ensuring the manager and director experiences are responsive and data-rich.

---

## 2. Next.js App Router Structure

### 2.1 Route Tree

```
/app/
├── layout.tsx                          // Root layout: providers (QueryClient, Zustand, i18n, Supabase)
├── not-found.tsx                       // 404 page
├── error.tsx                           // Global error boundary
├── globals.css                         // Tailwind base + custom design tokens
│
├── (auth)/                             // Route group: unauthenticated pages
│   ├── layout.tsx                      // Centered card layout, no sidebar
│   ├── login/
│   │   └── page.tsx                    // Email/password login + SSO buttons
│   ├── sso/
│   │   └── [provider]/
│   │       └── page.tsx                // SAML SSO callback handler
│   ├── signup/
│   │   └── page.tsx                    // Trial registration
│   ├── forgot-password/
│   │   └── page.tsx                    // Password reset request
│   ├── reset-password/
│   │   └── page.tsx                    // Password reset confirmation
│   └── onboarding/
│       └── page.tsx                    // Post-signup tenant setup (redirects to wizard)
│
├── (dashboard)/                        // Route group: authenticated application
│   ├── layout.tsx                      // App shell: sidebar nav, header, tenant context
│   ├── page.tsx                        // Dashboard home: site selector + overview cards
│   │
│   ├── control-room/
│   │   ├── layout.tsx                  // Control room layout: full-width, real-time status bar
│   │   ├── page.tsx                    // Default: site coverage overview
│   │   ├── coverage/
│   │   │   └── page.tsx               // Coverage heatmap view
│   │   ├── alerts/
│   │   │   └── page.tsx               // Active alerts feed
│   │   └── live-feed/
│   │       └── page.tsx               // Real-time event stream (assignments, changes, arrivals)
│   │
│   ├── planning/
│   │   ├── layout.tsx                  // Planning layout: toolbar, plan selector, view switcher
│   │   ├── page.tsx                    // Plan list for selected site
│   │   ├── [planId]/
│   │   │   ├── page.tsx               // Plan detail: timeline/grid view with assignments
│   │   │   ├── coverage/
│   │   │   │   └── page.tsx           // Coverage analysis for this plan
│   │   │   ├── cost/
│   │   │   │   └── page.tsx           // Cost breakdown for this plan
│   │   │   ├── compliance/
│   │   │   │   └── page.tsx           // Working time and regulatory compliance
│   │   │   └── history/
│   │   │       └── page.tsx           // Version history and diff viewer
│   │   └── new/
│   │       └── page.tsx               // Create new plan (template selection, date range)
│   │
│   ├── workforce/
│   │   ├── layout.tsx                  // Workforce layout: search, filters, bulk actions
│   │   ├── page.tsx                    // Employee list (paginated, searchable)
│   │   ├── [employeeId]/
│   │   │   └── page.tsx               // Employee detail: profile, skills, schedule, history
│   │   ├── skills/
│   │   │   └── page.tsx               // Skill matrix view (employees x skills grid)
│   │   ├── availability/
│   │   │   └── page.tsx               // Availability calendar (team view)
│   │   └── import/
│   │       └── page.tsx               // Bulk employee import wizard
│   │
│   ├── scenarios/
│   │   ├── page.tsx                    // Scenario list with comparison cards
│   │   ├── [scenarioId]/
│   │   │   └── page.tsx               // Scenario detail: configuration, simulation results
│   │   └── new/
│   │       └── page.tsx               // Scenario builder: what-if parameter configuration
│   │
│   ├── setup/
│   │   ├── page.tsx                    // Wizard step router (redirects to current step)
│   │   └── [step]/
│   │       └── page.tsx               // Individual wizard step (dynamic based on step number)
│   │
│   ├── settings/
│   │   ├── layout.tsx                  // Settings layout: sidebar navigation within settings
│   │   ├── page.tsx                    // Organization settings overview
│   │   ├── sites/
│   │   │   └── page.tsx               // Site management (CRUD)
│   │   ├── users/
│   │   │   └── page.tsx               // User management, role assignment
│   │   ├── integrations/
│   │   │   └── page.tsx               // External system connectors
│   │   ├── notifications/
│   │   │   └── page.tsx               // Notification preferences
│   │   ├── billing/
│   │   │   └── page.tsx               // Subscription management (via Stripe)
│   │   └── api-keys/
│   │       └── page.tsx               // API key management for integrations
│   │
│   ├── reports/
│   │   ├── page.tsx                    // Report catalog
│   │   ├── demand-accuracy/
│   │   │   └── page.tsx               // Demand forecast vs. actual analysis
│   │   ├── workforce-utilization/
│   │   │   └── page.tsx               // Utilization % by site, process, team
│   │   ├── cost-analysis/
│   │   │   └── page.tsx               // Labor cost breakdown, budget vs. actual
│   │   ├── compliance/
│   │   │   └── page.tsx               // Working time compliance audit report
│   │   └── export/
│   │       └── page.tsx               // Custom report builder and export
│   │
│   └── ai/
│       └── page.tsx                    // AI assistant: natural language query interface
│
└── api/
    └── trpc/
        └── [trpc]/
            └── route.ts                // tRPC HTTP handler (Next.js Route Handler)
```

### 2.2 Route Group Rationale

| Route Group | Layout Characteristics | Auth Requirement | Rendering Strategy |
|---|---|---|---|
| `(auth)` | Minimal: centered card, brand header, no navigation | Unauthenticated (redirects to dashboard if logged in) | Server-rendered, static where possible |
| `(dashboard)` | Full app shell: collapsible sidebar, header with site selector and user menu, breadcrumbs | Authenticated (redirects to login if not) | Streaming SSR with Suspense boundaries per data region |

### 2.3 Middleware

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  // 1. Locale detection: check Accept-Language header, fallback to tenant default
  const locale = detectLocale(request);

  // 2. Auth check: validate Supabase JWT from cookie
  const session = await getSession(request);

  // 3. Tenant resolution: extract from subdomain (acme.astraplanner.com → tenant 'acme')
  //    or from custom domain mapping (planning.acmecorp.com → tenant 'acme')
  const tenant = resolveTenant(request);

  // 4. Feature flags: load from edge KV cache
  const flags = await getFeatureFlags(tenant.id);

  // 5. Routing decisions
  if (!session && isDashboardRoute(request)) {
    return redirect('/login');
  }
  if (session && isAuthRoute(request)) {
    return redirect('/');
  }
  if (!tenant.setupCompleted && !isSetupRoute(request)) {
    return redirect('/setup');
  }

  // 6. Set headers for downstream consumption
  request.headers.set('x-tenant-id', tenant.id);
  request.headers.set('x-locale', locale);
  request.headers.set('x-feature-flags', JSON.stringify(flags));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
```

---

## 3. Component Architecture

### 3.1 Atomic Design Hierarchy

AstraPlanner follows atomic design principles, with each level in its own directory:

```
/components/
├── atoms/                    // Smallest indivisible UI elements
│   ├── Button.tsx
│   ├── Badge.tsx
│   ├── StatusDot.tsx         // Green/yellow/red/gray status indicator
│   ├── Avatar.tsx
│   ├── Spinner.tsx
│   ├── Tooltip.tsx
│   ├── Skeleton.tsx          // Loading skeleton primitive
│   ├── KeyboardShortcut.tsx  // Keyboard shortcut hint badge
│   └── CurrencyDisplay.tsx   // Locale-aware currency formatting
│
├── molecules/                // Small combinations of atoms
│   ├── FormField.tsx         // Label + input + error message + help text
│   ├── SearchInput.tsx       // Input + search icon + clear button + keyboard shortcut
│   ├── StatCard.tsx          // Number + label + trend indicator + sparkline
│   ├── EmployeeChip.tsx      // Avatar + name + primary skill badge (used in assignments)
│   ├── TimeSlotCell.tsx      // Single cell in the scheduling grid (time + capacity indicator)
│   ├── AlertBanner.tsx       // Icon + message + action button + dismiss
│   ├── ConfidenceIndicator.tsx // AI confidence score display (bar + percentage)
│   └── DateRangePicker.tsx   // From/to date selection with presets (this week, next week, etc.)
│
├── organisms/                // Complex, self-contained UI sections
│   ├── SiteSelector.tsx      // Dropdown with search, grouped by region, shows site status
│   ├── PlanToolbar.tsx       // View mode switcher + zoom + filter toggles + action buttons
│   ├── CoveragePanel.tsx     // Coverage summary: % by process, gap list, timeline chart
│   ├── EmployeePanel.tsx     // Employee list with skill filters, availability indicators
│   ├── NotificationCenter.tsx // Bell icon + dropdown with notification list + mark read
│   ├── ApprovalDialog.tsx    // Plan approval modal: changes summary + approve/reject + comment
│   ├── FilterPanel.tsx       // Collapsible panel with filter groups (skills, status, shift, site)
│   ├── CommandPalette.tsx    // Cmd+K command palette for quick navigation and actions
│   └── AiChatPanel.tsx      // Slide-over panel for AI assistant conversation
│
├── templates/                // Page-level layout compositions
│   ├── DashboardLayout.tsx   // Sidebar + header + main content area + notification drawer
│   ├── PlanningLayout.tsx    // Toolbar + left panel (employees) + center (grid) + right (details)
│   ├── WizardLayout.tsx      // Step indicator + content area + navigation buttons
│   ├── SettingsLayout.tsx    // Side nav + content area
│   └── ReportLayout.tsx     // Filter bar + chart area + data table
│
└── domain/                   // Domain-specific components (not reusable outside AstraPlanner)
    ├── ScheduleGrid.tsx      // The main scheduling grid (time x process matrix with assignments)
    ├── CoverageHeatmap.tsx   // Time x process heatmap showing coverage levels
    ├── SkillMatrix.tsx       // Employees x skills matrix with proficiency levels
    ├── DemandChart.tsx       // Demand forecast visualization with version comparison
    ├── ShiftTimeline.tsx     // Horizontal timeline showing shifts for a single employee
    ├── GanttChart.tsx        // Multi-employee Gantt view for a site's weekly schedule
    ├── CostBreakdown.tsx     // Stacked bar chart: regular + overtime + agency cost
    ├── ComplianceGauge.tsx   // Circular gauge showing compliance % with violation list
    ├── ScenarioCompare.tsx   // Side-by-side scenario metrics comparison panel
    ├── WizardStep.tsx        // Individual wizard step container with AI suggestion panel
    └── OptimizationProgress.tsx // Solver progress indicator (running/completed/failed + metrics)
```

### 3.2 Smart vs. Presentational Component Split

| Category | Characteristics | Examples | Data Source |
|---|---|---|---|
| **Presentational** | Pure props-in/render-out, no side effects, no data fetching, fully testable with Storybook | `Button`, `Badge`, `StatCard`, `TimeSlotCell`, `EmployeeChip` | Props only |
| **Smart (container)** | Fetches data, manages subscriptions, dispatches mutations, orchestrates presentational children | `ScheduleGridContainer`, `CoveragePanelContainer`, `EmployeeListContainer` | TanStack Query hooks, Zustand stores, Supabase subscriptions |
| **Hybrid** | Presentational core with localized data needs (e.g., a dropdown that loads its own options) | `SiteSelector`, `SkillFilter`, `DateRangePicker` with server-loaded presets | TanStack Query for option loading only |

**Naming convention**: Smart components live alongside their presentational counterparts. The container component imports and wraps the presentational one:

```
/components/domain/ScheduleGrid/
├── ScheduleGrid.tsx          // Presentational: receives assignments, renders grid
├── ScheduleGridContainer.tsx // Smart: fetches plan data, manages drag-and-drop state
├── ScheduleGrid.stories.tsx  // Storybook stories with mock data
├── ScheduleGrid.test.tsx     // Component tests
└── index.ts                  // Re-exports container as default
```

### 3.3 Domain Component: ScheduleGrid (Detailed Anatomy)

The `ScheduleGrid` is the most complex component in the application. It deserves detailed documentation.

**Structure**:

```
ScheduleGrid
├── GridHeader                 // Time axis: hours (06:00, 07:00, ...) or 15-min slots
├── ProcessRows[]              // One row per process (Receiving, Picking, Packing, ...)
│   ├── ProcessLabel           // Process name + required FTE count + current FTE count
│   ├── TimeSlotCells[]        // One cell per time bucket
│   │   ├── CapacityIndicator  // Color bar: green (covered), yellow (at minimum), red (gap)
│   │   ├── AssignedEmployees  // Stack of EmployeeChip components (draggable)
│   │   └── DropZone           // dnd-kit droppable area for adding employees
│   └── ProcessSummary         // Total hours, cost, coverage % for this process row
├── UnassignedPool             // Bottom: employees available but not assigned
│   └── EmployeeChip[]         // Draggable employee cards with skill badges
└── GridFooter                 // Totals row: FTE per time slot, total cost, overall coverage %
```

**Interaction model**:

| Action | Mechanism | Feedback |
|---|---|---|
| Assign employee to slot | Drag `EmployeeChip` from pool to `DropZone` | Ghost preview during drag. Green highlight on valid drops. Red highlight + shake on invalid (skill mismatch). Optimistic UI update. |
| Remove assignment | Drag `EmployeeChip` out of slot (to pool) or right-click → Remove | Fade-out animation. Slot coverage recalculated. |
| Swap assignments | Drag employee A onto employee B's slot | Swap preview overlay. Both employees' compliance re-checked. |
| Extend/shorten shift | Drag the edge of an assignment block horizontally | Real-time hour count update. Working-time constraint check. |
| View employee details | Click `EmployeeChip` | Slide-over panel with full profile, skills, schedule history. |
| Bulk select time slots | Shift+click across cells | Blue selection highlight. Bulk action bar appears (auto-fill, clear, copy pattern). |
| Zoom in/out | Ctrl+scroll or zoom controls in toolbar | Grid switches between hour/30-min/15-min buckets. Assignments reflow. |

### 3.4 Domain Component: CoverageHeatmap

**Axes**:
- X: Time buckets (hours or 15-min intervals)
- Y: Process areas (Receiving, Picking, Packing, Shipping, ...)

**Cell coloring**:

| Coverage Level | Color | Hex | Meaning |
|---|---|---|---|
| > 110% | Blue | `#3B82F6` | Overstaffed |
| 100-110% | Green | `#22C55E` | Adequately covered |
| 85-100% | Yellow | `#EAB308` | Near minimum |
| 70-85% | Orange | `#F97316` | Understaffed |
| < 70% | Red | `#EF4444` | Critical gap |
| 0% | Dark red | `#991B1B` | No coverage |

**Interactions**: Clicking a cell opens a popover with exact headcount (assigned/required), employee names, and a "Fill gap" button that triggers AI-assisted assignment.

---

## 4. State Management Strategy

### 4.1 Server State: TanStack Query

**Query configuration per data domain**:

| Data Domain | `staleTime` | `gcTime` | `refetchOnWindowFocus` | `refetchInterval` | Rationale |
|---|---|---|---|---|---|
| Demand signals | 5 min | 30 min | Yes | None | Demand changes infrequently; periodic refetch is sufficient |
| Workload profiles | 5 min | 30 min | Yes | None | Derived from demand; same cadence |
| Employee list | 30 sec | 10 min | Yes | None | Availability changes matter for scheduling accuracy |
| Plan data | 0 (always stale) | 5 min | Yes | None | Plans are the primary mutable entity; always fetch fresh |
| Assignments (within a plan) | 0 | 5 min | Yes | 10 sec (when plan is open) | Other users may be editing concurrently |
| AI insights | 1 hour | 24 hours | No | None | Insights are generated daily; stable within a session |
| Tenant configuration | 10 min | 1 hour | No | None | Rarely changes; settings page invalidates |
| Audit logs | 1 min | 5 min | No | None | Append-only; new entries appear with short delay |

**Optimistic updates pattern** (for planning mutations):

```typescript
// Example: assigning an employee to a time slot
const assignMutation = trpc.planning.assign.useMutation({
  onMutate: async ({ planId, employeeId, slotId }) => {
    // 1. Cancel outgoing refetches for this plan
    await queryClient.cancelQueries({ queryKey: planKeys.detail(planId) });

    // 2. Snapshot previous state (for rollback)
    const previousPlan = queryClient.getQueryData(planKeys.detail(planId));

    // 3. Optimistically update the cache
    queryClient.setQueryData(planKeys.detail(planId), (old) => ({
      ...old,
      assignments: [
        ...old.assignments,
        { employeeId, slotId, status: 'pending', source: 'manual' },
      ],
    }));

    return { previousPlan };
  },
  onError: (err, variables, context) => {
    // 4. Rollback on error
    queryClient.setQueryData(
      planKeys.detail(variables.planId),
      context.previousPlan
    );
    toast.error(`Assignment failed: ${err.message}`);
  },
  onSettled: (data, err, variables) => {
    // 5. Always refetch to ensure consistency
    queryClient.invalidateQueries({ queryKey: planKeys.detail(variables.planId) });
  },
});
```

### 4.2 Client State: Zustand Stores

| Store | Responsibilities | Persistence |
|---|---|---|
| `uiStore` | Sidebar collapsed state, active tab per section, dark mode preference | `sessionStorage` (persists across page navigations within a session) |
| `planningStore` | Selected plan ID, view mode (timeline/grid/list), zoom level, highlight mode, pinned employees | None (ephemeral; plan selection is URL-driven via search params) |
| `filterStore` | Active filters per page (skill filters, status filters, date range) | URL search params (shareable) |
| `wizardStore` | Current wizard step, partial configuration state, AI suggestion acceptance/rejection history | `localStorage` (survives browser refresh; important for long setup sessions) |
| `notificationStore` | Unread count, last-seen timestamp, expanded/collapsed state | `localStorage` for last-seen; unread count from server |

### 4.3 URL State: Search Params

URL state enables shareable deep links. A planner can copy a URL and send it to a manager, who sees the exact same view.

**URL state mapping**:

| Search Param | Type | Example | Controls |
|---|---|---|---|
| `site` | UUID | `?site=abc-123` | Which site is selected |
| `from` / `to` | ISO date | `?from=2026-03-23&to=2026-03-29` | Date range for planning view |
| `view` | Enum | `?view=grid` | View mode (timeline, grid, list) |
| `process` | UUID[] | `?process=p1,p2` | Filtered processes (only show these rows) |
| `skill` | UUID[] | `?skill=s1,s2` | Filter employees by skill |
| `status` | Enum[] | `?status=gap,warning` | Filter coverage cells by status |
| `highlight` | Enum | `?highlight=cost` | Highlight mode (coverage, skill, cost) |
| `employee` | UUID | `?employee=emp-456` | Employee detail panel open |

Managed via `nuqs` for type-safe search param parsing with Zod validation.

### 4.4 Real-time State: Supabase Subscriptions

```typescript
// hooks/useRealtimePlan.ts
function useRealtimePlan(planId: string) {
  const queryClient = useQueryClient();
  const supabase = useSupabaseClient();

  useEffect(() => {
    const channel = supabase
      .channel(`plan:${planId}:edits`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'planning',
          table: 'assignments',
          filter: `plan_id=eq.${planId}`,
        },
        (payload) => {
          // Invalidate the plan query to trigger refetch
          queryClient.invalidateQueries({ queryKey: planKeys.detail(planId) });

          // Show toast for changes by other users
          if (payload.new.updated_by !== currentUserId) {
            toast.info(`${payload.new.updated_by_name} modified an assignment`);
          }
        }
      )
      .on('presence', { event: 'sync' }, () => {
        const presenceState = channel.presenceState();
        // Update "users viewing this plan" indicator
        setPlanViewers(Object.values(presenceState).flat());
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({
            user_id: currentUserId,
            user_name: currentUserName,
            viewing_since: new Date().toISOString(),
          });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [planId]);
}
```

---

## 5. Performance Optimization

### 5.1 Code Splitting

| Split Strategy | Implementation | Bundle Impact |
|---|---|---|
| Route-based splitting | Automatic via Next.js App Router (each `page.tsx` is a separate chunk) | Users only load JS for the current route |
| Component lazy loading | `React.lazy()` for heavy components: `ScheduleGrid`, `CoverageHeatmap`, `GanttChart` | 80-120KB deferred per component until needed |
| Library lazy loading | Dynamic imports for `recharts`, `dnd-kit`, HiGHS WASM | Charts load only on dashboard pages; drag-and-drop only on planning pages |
| Locale splitting | Only the active locale's messages are loaded (via `next-intl` server loading) | ~15-30KB savings per unused locale |

### 5.2 Virtual Scrolling

Large datasets that cannot be paginated (because the user needs to scroll through them continuously) use virtual scrolling:

| View | Technology | Rows Virtualized | Row Height | Overscan |
|---|---|---|---|---|
| Employee list | `@tanstack/react-virtual` | Up to 10,000 employees | 56px (fixed) | 10 rows |
| Schedule grid (vertical) | `@tanstack/react-virtual` | Up to 200 process rows per site | 48px (fixed) | 5 rows |
| Audit log | `@tanstack/react-virtual` | Unlimited (paginated fetch + virtual scroll) | 40px (fixed) | 20 rows |
| Data tables (general) | `@tanstack/react-table` + `@tanstack/react-virtual` | Varies | Variable (measured) | 5 rows |

**Schedule grid virtualization detail**: The scheduling grid virtualizes both axes. The vertical axis (processes) is row-virtualized. The horizontal axis (time slots) scrolls natively but uses visibility detection to defer rendering of off-screen time slot cells. This allows a grid with 50 processes x 96 time slots (15-minute intervals over 24 hours = 4,800 cells) to render only the ~200 visible cells at any time.

### 5.3 Web Workers

Client-side computations that could block the main thread are offloaded to Web Workers:

| Worker | Computation | Input | Output | Typical Duration |
|---|---|---|---|---|
| `coverageWorker` | Calculate coverage percentages for all cells in the schedule grid | Assignment data + workload profile | Coverage map (time slot → coverage %) | 20-50ms for 1-week plan |
| `costWorker` | Calculate labor cost breakdown per employee, per shift | Assignment data + employee cost rates + overtime rules | Cost breakdown object | 10-30ms |
| `heuristicWorker` | Run greedy auto-fill algorithm for empty slots | Available employees + requirements + constraints | Proposed assignments | 100-500ms |
| `diffWorker` | Compute diff between two plan versions | Two assignment snapshots | Change list with additions, removals, modifications | 30-80ms |

Workers are initialized lazily and pooled (one instance per worker type, reused across invocations).

### 5.4 Skeleton Loaders and Progressive Loading

Every data-driven component has a corresponding skeleton:

```typescript
// components/domain/CoveragePanel/CoveragePanelSkeleton.tsx
export function CoveragePanelSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-48" />           {/* Title */}
      <div className="grid grid-cols-4 gap-4">
        <Skeleton className="h-24" />              {/* Coverage % card */}
        <Skeleton className="h-24" />              {/* Gap count card */}
        <Skeleton className="h-24" />              {/* FTE total card */}
        <Skeleton className="h-24" />              {/* Cost card */}
      </div>
      <Skeleton className="h-64" />                {/* Coverage chart */}
    </div>
  );
}
```

**Progressive loading strategy for the Planning page**:

```
1. [Immediate]  App shell renders (sidebar, header, breadcrumbs) — cached layout
2. [< 200ms]    Plan metadata loads (name, date range, status) — small query
3. [< 500ms]    Coverage summary loads (aggregate numbers) — materialized view
4. [< 800ms]    Schedule grid renders with assignment data — main query
5. [< 1.5s]     Employee panel loads with availability — secondary query
6. [Lazy]       Optimization metrics load — computed on demand
7. [Lazy]       AI insights for this plan — loaded when insight panel is opened
```

Each stage is wrapped in a React Suspense boundary with the appropriate skeleton fallback.

### 5.5 Service Worker for Offline Capability

A Service Worker (registered via `next-pwa` or a custom registration) provides limited offline capability:

| Feature | Online | Offline |
|---|---|---|
| View published schedules | Live data | Cached last-viewed schedule (read-only) |
| View employee profiles | Live data | Cached profiles from last session |
| Edit plans | Full editing with real-time sync | Blocked (shows "offline" banner) |
| Receive notifications | Real-time | Queued, delivered on reconnect |
| Run optimization | Server-side solver | Blocked |
| AI assistant | Live Claude API | Blocked (shows "AI unavailable offline") |

The Service Worker caches:

- Application shell (HTML, CSS, JS) — full offline app shell rendering
- Last-viewed plan data — stored in IndexedDB via Workbox
- Employee directory — cached for offline lookup
- Static assets — immutable cache with hash-based invalidation

---

## 6. Accessibility

### 6.1 WCAG 2.1 AA Compliance

AstraPlanner targets WCAG 2.1 Level AA compliance across all interfaces. Key measures:

| WCAG Criterion | Implementation |
|---|---|
| 1.1.1 Non-text Content | All icons have `aria-label`. Charts have `aria-describedby` linking to data table alternatives. Heatmap cells have screen-reader-accessible text. |
| 1.3.1 Info and Relationships | Semantic HTML (`<table>`, `<th>`, `<nav>`, `<main>`, `<aside>`). Schedule grid uses `role="grid"` with `role="gridcell"` and `aria-colindex`/`aria-rowindex`. |
| 1.4.3 Contrast | All text meets 4.5:1 contrast ratio. Status colors (green/yellow/red) are supplemented with icons/patterns for color-blind users. |
| 1.4.11 Non-text Contrast | Interactive elements have 3:1 contrast against background. Focus rings are clearly visible. |
| 2.1.1 Keyboard | All interactions are keyboard-accessible. Focus order follows visual order. |
| 2.1.2 No Keyboard Trap | Modal dialogs trap focus correctly and can be dismissed with Escape. |
| 2.4.7 Focus Visible | Custom focus ring style: `ring-2 ring-blue-500 ring-offset-2`. |
| 4.1.2 Name, Role, Value | All form elements have associated labels. Custom components use ARIA roles. |

### 6.2 Keyboard Navigation for Scheduling

The schedule grid supports full keyboard navigation:

| Key | Action |
|---|---|
| Arrow keys | Move focus between grid cells (time slots) |
| Enter | Open cell action menu (assign, view, edit) |
| Space | Select cell (toggle selection for bulk actions) |
| Shift + Arrow | Extend selection range |
| Tab | Move between grid regions (process rows → employee panel → toolbar) |
| Escape | Clear selection, close popover, cancel drag |
| Ctrl + Z | Undo last assignment change |
| Ctrl + Shift + Z | Redo |
| / | Open command palette |
| ? | Show keyboard shortcut help |

### 6.3 Screen Reader Support

| Component | Screen Reader Behavior |
|---|---|
| Schedule grid | Announces: "Picking process, 8:00 AM to 9:00 AM, 6 of 8 employees assigned, 75% coverage" |
| Coverage heatmap | Announces cell value: "Packing, 2:00 PM, 95% coverage, adequate" |
| Drag-and-drop | Live region announces: "Picked up John Smith. Over Picking 9:00 AM slot. 3 of 5 positions filled." |
| Notifications | New notifications announced via `aria-live="polite"` region |
| AI responses | AI-generated text announced progressively as it streams |

---

## 7. Responsive Design

### 7.1 Breakpoint Strategy

| Breakpoint | Width | Target Device | Primary Users |
|---|---|---|---|
| `sm` | 640px | Mobile phone | Employees viewing their schedule (future mobile app replaces this) |
| `md` | 768px | Tablet portrait | Not a primary target (orientation lock recommended) |
| `lg` | 1024px | Tablet landscape | Site managers reviewing coverage on floor tablets |
| `xl` | 1280px | Desktop (standard) | Planners, regional directors |
| `2xl` | 1536px | Desktop (wide) | Planners with dual monitors, control room wall displays |

### 7.2 Layout Adaptations

| Route | Desktop (`xl+`) | Tablet Landscape (`lg`) | Mobile (`sm`) |
|---|---|---|---|
| Control Room | Full dashboard: 3-column grid with charts, heatmap, alerts | 2-column: stacked charts, simplified heatmap | Single column: KPI cards, alert list only |
| Planning Workbench | 3-panel: employee list (left) + grid (center) + details (right) | 2-panel: collapsible employee list + grid. Details as modal. | Not supported (shows "use desktop" message) |
| Workforce | Table with inline editing | Card layout (one card per employee) | Simplified card list |
| Reports | Chart + data table side by side | Chart above, table below (stacked) | Chart only, table as separate scroll section |
| Settings | Side nav + content | Top nav + content | Accordion navigation |

### 7.3 Touch Optimization

For tablet users (site managers):

| Interaction | Desktop | Tablet |
|---|---|---|
| Assign employee | Drag and drop | Long-press employee → tap target slot |
| View coverage detail | Hover tooltip | Tap cell → bottom sheet popover |
| Approve plan | Click button | Tap button (larger touch target: min 44x44px) |
| Navigate time | Horizontal scroll | Swipe gesture |
| Zoom | Ctrl+scroll | Pinch-to-zoom |

---

## 8. Testing Strategy

| Test Type | Tool | Scope | Count Target | CI Execution |
|---|---|---|---|---|
| Unit tests | Vitest | Individual functions, hooks, utilities | ~500 tests | Every PR (<60s) |
| Component tests | Vitest + Testing Library | Presentational components with mock data | ~200 tests | Every PR (<90s) |
| Integration tests | Vitest + MSW (Mock Service Worker) | Smart components with mocked API | ~100 tests | Every PR (<120s) |
| E2E tests | Playwright | Full user flows through the browser | ~200 scenarios | Nightly (30 min) |
| Visual regression | Playwright screenshots + Percy | Key views at each breakpoint | ~50 snapshots | Weekly |
| Accessibility tests | axe-core (via Testing Library) + manual screen reader audit | All pages and modals | Integrated into component tests | Every PR |
| Performance tests | Lighthouse CI | Core routes (dashboard, planning, reports) | 6 routes | Every PR (budget checks) |

**E2E critical paths** (must pass before any production deploy):

1. Login → navigate to planning → view a plan → make an assignment → save
2. Login → setup wizard → complete all 8 steps → verify site created
3. Login → control room → verify real-time updates arrive within 5 seconds
4. Login → scenarios → create scenario → run simulation → view results
5. Login → workforce → search employee by skill → view profile

---

## 9. Error Handling

### 9.1 Error Boundary Hierarchy

```
RootErrorBoundary (app/error.tsx)
  └── catches: unexpected crashes, provider failures
      → shows: full-page error screen with "Reload" button and Sentry report link

  DashboardErrorBoundary (app/(dashboard)/error.tsx)
    └── catches: layout-level errors (sidebar data fail, auth issues)
        → shows: error banner within layout, navigation remains functional

    PageErrorBoundary (per page error.tsx)
      └── catches: page-level data fetch failures
          → shows: inline error card with "Retry" button

      WidgetErrorBoundary (components/organisms/*ErrorBoundary)
        └── catches: individual widget failures (chart render error, subscription disconnect)
            → shows: widget-level error placeholder ("Could not load coverage chart. Retry")
```

This granular hierarchy ensures that a single failing widget does not take down the entire dashboard. If the coverage chart fails to render due to malformed data, the rest of the planning workbench continues to function.

### 9.2 Error Reporting

Every caught error is reported to Sentry with:

- User context (tenant, role, site access -- no PII)
- Page context (route, search params, component tree)
- State context (Zustand store snapshot, TanStack Query cache keys)
- Replay context (Sentry Session Replay captures the last 30 seconds of user interaction)

---

## 10. Design System Tokens

### 10.1 Color Palette

```
Brand:
  primary-50:  #EFF6FF    // Background tints
  primary-100: #DBEAFE
  primary-500: #3B82F6    // Primary buttons, links
  primary-700: #1D4ED8    // Hover states
  primary-900: #1E3A5F    // Dark mode primary

Semantic:
  success:     #22C55E    // Met coverage, approved status
  warning:     #EAB308    // Near-minimum coverage, pending status
  danger:      #EF4444    // Coverage gaps, rejected status, errors
  info:        #3B82F6    // Informational, AI suggestions

Coverage (gradient):
  over:        #3B82F6    // > 110% staffed
  met:         #22C55E    // 100-110% staffed
  near:        #EAB308    // 85-100% staffed
  under:       #F97316    // 70-85% staffed
  gap:         #EF4444    // < 70% staffed
  none:        #991B1B    // 0% coverage

Neutrals:
  gray-50:     #F9FAFB    // Page background
  gray-100:    #F3F4F6    // Card background
  gray-200:    #E5E7EB    // Borders
  gray-500:    #6B7280    // Secondary text
  gray-900:    #111827    // Primary text
```

### 10.2 Typography Scale

| Token | Size | Weight | Use |
|---|---|---|---|
| `heading-xl` | 30px / 2rem | 700 | Page titles |
| `heading-lg` | 24px / 1.5rem | 600 | Section headers |
| `heading-md` | 20px / 1.25rem | 600 | Card titles |
| `heading-sm` | 16px / 1rem | 600 | Widget titles |
| `body-lg` | 16px / 1rem | 400 | Primary body text |
| `body-md` | 14px / 0.875rem | 400 | Table cells, form labels |
| `body-sm` | 12px / 0.75rem | 400 | Captions, timestamps, badge text |
| `mono` | 13px / 0.8125rem | 400 (monospace) | Code, IDs, technical values |
| `dashboard` | 36px / 2.25rem | 700 | Large KPI numbers on control room |

### 10.3 Spacing Scale

Based on a 4px grid:

| Token | Value | Use |
|---|---|---|
| `space-1` | 4px | Tight internal padding (badge padding) |
| `space-2` | 8px | Default element gap |
| `space-3` | 12px | Form field vertical spacing |
| `space-4` | 16px | Card internal padding |
| `space-6` | 24px | Section spacing |
| `space-8` | 32px | Panel padding |
| `space-12` | 48px | Page section margins |
| `space-16` | 64px | Large section breaks |
| `grid-cell` | 48px | Schedule grid cell height |
| `grid-slot` | Varies (60px/30px/15px) | Schedule grid column width (based on zoom level) |
