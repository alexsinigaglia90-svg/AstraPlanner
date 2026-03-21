# UX Concepts and Design Philosophy

## 1. Purpose of This Document

This document defines the UX philosophy, design principles, user personas, and information architecture that govern every screen, interaction, and notification in AstraPlanner. Enterprise workforce planning is a domain where the underlying complexity is enormous -- demand models, constraint solvers, skill matrices, regulatory rules -- but the users making daily decisions are operations managers, not data scientists. Every design decision in AstraPlanner exists to resolve this tension: expose the power of the system without exposing the complexity.

---

## 2. The Core Challenge

### 2.1 The Complexity Problem

A single logistics site with 400 employees, 12 processes, 3 shifts, and a 4-week planning horizon produces a combinatorial space of roughly 10^18 possible workforce assignments. The optimization engine navigates this space in seconds. The UX layer must present the result -- and allow meaningful human intervention -- in a way that feels intuitive to someone who has never written a formula more complex than a SUM in Excel.

The problem is not just data volume. It is decision density. A site manager reviewing a weekly plan must understand:

- Whether coverage meets demand across every process and time slot.
- Where the AI made tradeoffs (e.g., accepted 85% coverage on returns processing to maintain 100% on outbound shipping).
- Which assignments are fragile (dependent on a single qualified employee showing up).
- What the cost implications are of the current plan versus alternatives.
- Which employees are approaching overtime limits, certification expirations, or contractual constraints.

Presenting all of this simultaneously creates cognitive overload. Hiding it creates blind spots. AstraPlanner's UX resolves this with five design principles.

### 2.2 Who We Are Designing For

AstraPlanner's users are not software engineers. They are operations professionals who:

- Manage 50-2,000 employees across 1-200 sites.
- Make workforce decisions under time pressure (a truck arrives in 30 minutes, who unloads it?).
- Have deep domain expertise but limited patience for software learning curves.
- Distrust fully automated systems because they have been burned by "black box" tools before.
- Need to justify their decisions to leadership with data, not gut feel.

Every pixel on every screen must earn its place by helping one of these people make a better decision, faster.

---

## 3. Design Principles

### 3.1 Principle 1: Progressive Disclosure

**Statement:** Show only what is needed at each decision level. Complexity exists but is layered beneath the surface, accessible on demand.

**Why this matters:** A VP reviewing cross-site performance does not need to see individual employee assignments. A shift supervisor does not need to see quarterly budget forecasts. Showing everything to everyone guarantees that no one sees what they need.

**How it manifests:**

| Decision Level | What Is Shown | What Is Hidden (Available on Drill-Down) |
|---|---|---|
| Enterprise overview | Site-level KPIs: coverage %, cost variance, risk count | Process-level breakdowns, individual assignments |
| Site dashboard | Process-level coverage heatmap, daily cost trend | Employee-level assignments, constraint details |
| Process detail | Headcount vs demand by time slot, skill gap indicators | Individual employee schedules, certification status |
| Employee detail | Full schedule, skill matrix, hours balance, constraints | Optimization solver reasoning, alternative assignments |

**Implementation rules:**

- Default views show 5-7 key metrics. Never more than 10.
- Every summary element (number, chart bar, heatmap cell) is clickable and leads to one level deeper.
- Drill-down preserves context: the parent view remains visible or breadcrumbed so the user never loses orientation.
- The system remembers each user's preferred disclosure level and restores it on login.

### 3.2 Principle 2: Guided Autonomy

**Statement:** The AI suggests, the user confirms, the system learns. Autonomy is earned through demonstrated accuracy, not assumed.

**Why this matters:** Operations managers will reject a system that makes decisions without their input. They will also abandon a system that requires them to make every decision manually. The sweet spot is a system that does the heavy lifting but puts the human in the approval seat.

**How it manifests:**

| Autonomy Level | Description | Example | User Action Required |
|---|---|---|---|
| Level 0: Manual | System presents data, user decides | "Here are 5 qualified employees for this gap" | User selects and assigns |
| Level 1: Suggested | System recommends one option, explains why | "We recommend Sarah (98% skill match, available, lowest overtime)" | User accepts or overrides |
| Level 2: Auto-with-review | System acts, user reviews before publish | "Plan optimized. 3 changes flagged for review." | User reviews flagged items, approves |
| Level 3: Autonomous | System acts, user is notified after | "Backfill assigned for Maria's absence. Notification sent." | User can reverse if needed |

**Autonomy progression rules:**

- New installations start at Level 1 for all decision types.
- Each decision type (backfill, overtime approval, cross-training assignment) has its own autonomy level.
- Autonomy level increases only when the AI's suggestions have been accepted 20+ times consecutively for that decision type at that site.
- Any user override resets the consecutive counter for that decision type.
- Autonomy level can be manually set by administrators regardless of history.
- Audit log captures every autonomy-level change and the reason.

### 3.3 Principle 3: Contextual Intelligence

**Statement:** Every screen shows relevant insights alongside the data the user is viewing. The user should never have to leave a screen to understand what the data means.

**Why this matters:** Data without context is noise. A coverage rate of 87% means nothing unless you know that the target is 95%, that last week was 92%, that the gap is caused by two certified forklift operators being on leave, and that a trained replacement is available on the bench.

**How it manifests:**

- **Inline annotations:** When a heatmap cell is yellow (80-95% coverage), a tooltip shows: "Picking Line 3, 14:00-16:00: 4 of 5 positions filled. Gap: 1 certified pick operator. Suggested: Tom R. (available, certified, 2h remaining before overtime)."
- **Trend indicators:** Every KPI shows a directional arrow and a comparison period. "Coverage: 91% (+3% vs last week, -2% vs target)."
- **Causal explanations:** When a metric deviates from target, the system surfaces the top 3 contributing factors. "Overtime is 12% above budget because: (1) unplanned absences up 18%, (2) peak volume 8% above forecast, (3) 2 new hires not yet certified for night shift."
- **Peer comparisons:** Site managers see how their site compares to similar sites. "Your coverage rate ranks 14th out of 23 sites in the East region. Top quartile threshold: 94%."

**Implementation rules:**

- Context panels load asynchronously to avoid blocking the primary data view.
- Contextual insights are generated by a dedicated analytics pipeline, not computed on-the-fly by the UI.
- Insights are ranked by relevance to the current view and user role. A site manager sees site-specific insights; a VP sees portfolio-level patterns.
- Users can dismiss insights they find unhelpful. Dismissal patterns feed back into the relevance model.

### 3.4 Principle 4: Confidence Visualization

**Statement:** Every AI output shows its confidence level and the basis for its recommendation. No black boxes.

**Why this matters:** Trust is the scarcest resource in enterprise AI adoption. Operations managers who have spent 20 years building intuition about workforce needs will not defer to an algorithm they cannot interrogate. Showing confidence transforms the AI from an oracle into a collaborator.

**How it manifests:**

| AI Output | Confidence Display | Basis Display |
|---|---|---|
| Demand forecast | Confidence interval band on chart (P10-P90) | "Based on 52 weeks of history, adjusted for Easter shift and promotional calendar" |
| Recommended assignment | Match score (0-100) with breakdown | "Skill match: 95%, Availability: 100%, Cost efficiency: 82%, Fatigue risk: Low" |
| Plan feasibility | Feasibility score with constraint status | "12 of 14 constraints satisfied. Violated: Max consecutive days (John D.), Preferred shift (Lisa M.)" |
| Scenario outcome | Probability distribution of key metrics | "P50 outcome: 340 FTEs needed. P90 outcome: 375 FTEs. Key driver: inbound volume variance" |
| Backfill suggestion | Suitability ranking with rationale | "#1: Tom R. (score 94) -- certified, available, on-site. #2: External temp (score 71) -- 4h lead time, training needed" |

**Visual language for confidence:**

- **High confidence (>85%):** Solid color, no additional indicators.
- **Medium confidence (60-85%):** Hatched or semi-transparent fill, yellow info icon, tooltip with explanation.
- **Low confidence (<60%):** Dashed border, orange warning icon, explicit "Low confidence" label, mandatory tooltip.
- **Insufficient data:** Gray fill, "Insufficient data" label, link to data requirements.

**Interrogation flow:**

Any user can click on a confidence indicator and see:

1. The data sources used (and their recency).
2. The model or algorithm that produced the output.
3. The top 3 factors that increased or decreased confidence.
4. What additional data would improve confidence.

### 3.5 Principle 5: One-Click Depth

**Statement:** Any summary can be drilled into with exactly one click. No navigation mazes, no "go to another module," no context-switching.

**Why this matters:** Every additional click between a question and its answer is an opportunity for the user to lose context, get frustrated, or give up and make a gut decision instead.

**How it manifests:**

- A coverage percentage on the dashboard is clickable. One click shows the process-level breakdown.
- A red cell on the heatmap is clickable. One click shows unfilled positions and suggested backfills.
- An overtime number is clickable. One click shows affected employees and their hours balance.
- A cost variance is clickable. One click shows the breakdown by cost driver (regular hours, overtime, agency, training).
- An AI recommendation is clickable. One click shows the full reasoning chain with confidence breakdown.

**Implementation rules:**

- Drill-down opens in a slide-over panel, not a new page. The parent view remains visible and the user can close the panel to return instantly.
- Drill-down panels can themselves contain clickable elements for further depth (panel-in-panel, max 3 levels).
- Every drill-down panel has a "Pop out" button that opens the detail as a full page for users who want to focus.
- Keyboard shortcut: Escape closes the current panel and returns to the parent view.
- Drill-down state is preserved in the URL so users can share deep links with colleagues.

---

## 4. User Personas

### 4.1 VP of Operations

| Attribute | Detail |
|---|---|
| **Title** | Vice President of Operations / Director of Logistics |
| **Scope** | 10-200 sites, 5,000-50,000 employees |
| **Primary goal** | Ensure enterprise-wide service levels while controlling labor cost |
| **Decision frequency** | Weekly strategic reviews, monthly budget reviews, quarterly planning |
| **Key questions** | "Are we meeting service levels across all sites?" "Where are we over/under-staffed?" "What's our labor cost trend?" "Which sites need intervention?" |
| **Technical comfort** | Moderate. Uses dashboards and reports. Does not build them. |
| **Risk tolerance** | Low. Wants proven plans with data backing. |
| **AstraPlanner usage** | Enterprise dashboard, cross-site comparisons, scenario simulation, budget tracking |

**Typical workflow:**

1. Open enterprise dashboard on Monday morning.
2. Review cross-site coverage scorecard. Identify sites in red.
3. Click into a red site to understand the root cause (demand spike? absenteeism? skill gap?).
4. If systemic, open scenario simulation to model a response (e.g., agency hiring wave).
5. Approve or reject site managers' escalated plan change requests.
6. Review weekly cost report against budget.

### 4.2 Site Manager

| Attribute | Detail |
|---|---|
| **Title** | Site Manager / Operations Manager / Warehouse Manager |
| **Scope** | 1 site, 100-2,000 employees |
| **Primary goal** | Meet daily throughput targets with available workforce |
| **Decision frequency** | Daily plan review, intra-day adjustments |
| **Key questions** | "Is today's plan going to work?" "Where are my coverage gaps?" "Who called in sick and who's backfilling?" "Am I going to hit overtime limits?" |
| **Technical comfort** | Low to moderate. Prefers visual displays over tables. |
| **Risk tolerance** | Moderate. Willing to try AI suggestions but wants override ability. |
| **AstraPlanner usage** | Control Room, Planning Workbench, absenteeism management, overtime monitoring |

**Typical workflow:**

1. Arrive at 06:00, open Control Room filtered to their site.
2. Review coverage heatmap for the day. Green means no action needed.
3. Check absence notifications. Accept AI backfill suggestions or manually reassign.
4. Mid-morning: review real-time coverage against plan. Adjust if volume is higher/lower than forecast.
5. End of day: review next-day plan, approve any pending changes.
6. Weekly: review week-ahead plan, flag concerns, run "what-if" for known upcoming changes.

### 4.3 Shift Supervisor

| Attribute | Detail |
|---|---|
| **Title** | Shift Supervisor / Team Lead / Floor Manager |
| **Scope** | 1 shift at 1 site, 20-100 employees |
| **Primary goal** | Execute the plan: right people, right place, right time |
| **Decision frequency** | Continuous, real-time during shift |
| **Key questions** | "Who is assigned where right now?" "Someone didn't show up -- who can cover?" "We're behind on picking -- can I pull someone from packing?" "Is this employee certified for this equipment?" |
| **Technical comfort** | Low. Needs mobile-first, tap-friendly interfaces. |
| **Risk tolerance** | High for small tactical moves, low for anything affecting other shifts. |
| **AstraPlanner usage** | Mobile shift view, real-time assignment board, quick-swap interface, skill lookup |

**Typical workflow:**

1. Start of shift: open mobile app, review assignment board.
2. Conduct headcount. Mark no-shows in the app.
3. Accept or modify AI-suggested reassignments for gaps.
4. During shift: respond to real-time alerts (process falling behind, break rotation reminders).
5. End of shift: confirm actual assignments for payroll/reporting accuracy.

### 4.4 HR / Workforce Planner

| Attribute | Detail |
|---|---|
| **Title** | Workforce Planner / HR Business Partner / Talent Manager |
| **Scope** | 1-20 sites, focused on people rather than operations |
| **Primary goal** | Maintain a healthy, compliant, skilled workforce pipeline |
| **Decision frequency** | Weekly analysis, monthly planning, quarterly strategy |
| **Key questions** | "Do we have enough certified forklift operators for next quarter?" "Which employees are approaching overtime limits?" "What's our agency spend trend?" "Who should we cross-train to reduce single-point-of-failure risk?" |
| **Technical comfort** | Moderate to high. Comfortable with reports and data analysis. |
| **Risk tolerance** | Low. Compliance-focused. |
| **AstraPlanner usage** | Skill matrix management, certification tracking, cross-training recommendations, compliance dashboards, hiring needs forecasting |

**Typical workflow:**

1. Weekly: review skill gap analysis. Identify processes with fewer than 3 qualified employees (fragility risk).
2. Monthly: analyze overtime and agency trends. Flag sites exceeding thresholds.
3. Quarterly: run workforce planning scenarios for upcoming seasonal ramps. Determine hiring needs 8-12 weeks in advance.
4. Ongoing: update employee skill records, process certification renewals, manage cross-training programs.

### 4.5 System Administrator

| Attribute | Detail |
|---|---|
| **Title** | IT Administrator / System Administrator / Platform Owner |
| **Scope** | Entire AstraPlanner deployment |
| **Primary goal** | Keep the system running, secure, integrated, and correctly configured |
| **Decision frequency** | As needed for configuration; continuous for monitoring |
| **Key questions** | "Are all integrations healthy?" "Are data feeds arriving on time?" "Who needs access provisioned?" "Is the optimization engine performing within SLA?" |
| **Technical comfort** | High. Comfortable with APIs, logs, and configuration interfaces. |
| **Risk tolerance** | Very low for production changes. Prefers staged rollouts. |
| **AstraPlanner usage** | Admin console, integration monitoring, user management, audit logs, system health dashboard |

**Typical workflow:**

1. Morning: check system health dashboard. Verify all data feeds arrived overnight.
2. Review integration error queue. Investigate and resolve failed syncs.
3. Process access requests: provision new users, assign roles, configure site-level permissions.
4. Manage configuration changes: update process definitions, modify constraint rules, adjust optimization parameters.
5. Coordinate with AstraPlanner support for upgrades and patches.

---

## 5. Information Architecture

### 5.1 Navigation Model

AstraPlanner uses a role-adaptive navigation model. The global navigation bar contains the same top-level sections for all users, but the default landing page, available sub-sections, and visible data are governed by the user's role and site assignments.

**Top-level navigation sections:**

| Section | Icon | VP Ops | Site Mgr | Shift Sup | HR Planner | Sys Admin |
|---|---|---|---|---|---|---|
| Control Room | Dashboard | Enterprise view | Site view | Shift view | -- | -- |
| Planning | Calendar | Cross-site summary | Site planning workbench | Shift assignment board | Workforce plan | -- |
| Scenarios | Branch | Full access | Site-scoped | Read-only | Full access | -- |
| People | Users | Read-only summary | Site roster | Shift roster | Full access | -- |
| Analytics | Chart | Full access | Site-scoped | -- | Full access | -- |
| Configuration | Gear | Read-only | Site config | -- | Skill/cert config | Full access |
| Admin | Shield | -- | -- | -- | -- | Full access |

### 5.2 Default Landing Pages by Role

| Role | Default Landing Page | Rationale |
|---|---|---|
| VP of Operations | Enterprise Control Room (cross-site scorecard) | First question is always "how are we doing across the network?" |
| Site Manager | Site Control Room (today's coverage heatmap) | First question is always "is today's plan going to work?" |
| Shift Supervisor | Shift Assignment Board (current shift) | First question is always "who is where right now?" |
| HR / Workforce Planner | Skill Gap Dashboard | First question is always "do we have the right people with the right skills?" |
| System Administrator | System Health Dashboard | First question is always "is everything running?" |

### 5.3 Breadcrumb and Context Preservation

Every navigation action within AstraPlanner appends to a breadcrumb trail. The trail preserves:

- The section (e.g., Control Room).
- The scope (e.g., East Region > Site 14).
- The time context (e.g., Week 47, 2026).
- The filter state (e.g., "Showing: Day Shift only").

Users can click any breadcrumb segment to jump back. The forward state is preserved for 5 minutes so the user can return without re-navigating.

### 5.4 Search and Quick Navigation

A global search bar (Ctrl+K / Cmd+K) supports:

- **Employee search:** Name, ID, or skill. "Find: forklift certified, available tomorrow AM."
- **Process search:** Process name or code. Navigates to process detail view.
- **Site search:** Site name, code, or region. Navigates to site Control Room.
- **Action search:** "Create scenario," "Run optimization," "View overtime report." Navigates to the relevant function.
- **Help search:** "How do I lock an assignment?" Surfaces contextual help article.

---

## 6. Notification Strategy

### 6.1 Notification Philosophy

Notifications exist to surface information that requires awareness or action, not to demonstrate that the system is working. Every notification must pass the "so what?" test: if the recipient cannot take a meaningful action or change a decision based on the notification, it should not be sent.

### 6.2 Notification Triggers and Severity

| Trigger | Severity | Recipient(s) | Channel | Example |
|---|---|---|---|---|
| Coverage drops below 80% for a process/timeslot | Critical | Site Manager, Shift Supervisor | In-app banner, push notification, SMS | "Picking coverage at 14:00 is 60% (3 of 5 positions). 2 backfill options available." |
| Employee absence reported | High | Shift Supervisor, Site Manager | In-app, push notification | "Maria S. reported absent for Day Shift. AI backfill assigned: Tom R. Review?" |
| Plan optimization completed | Medium | Site Manager, HR Planner | In-app | "Week 48 plan optimized. Coverage: 94%. 5 items flagged for review." |
| Employee approaching overtime limit | High | Site Manager, HR Planner | In-app, email | "John D. has 38 of 40 allowed weekly hours. Scheduled for 6 more hours this week." |
| Certification expiring within 30 days | Medium | HR Planner, Employee | In-app, email | "Forklift certification for Lisa M. expires Dec 15. Renewal required." |
| Integration data feed delayed | High | System Administrator | In-app, email, PagerDuty | "WMS data feed delayed by 45 minutes. Last successful sync: 05:15." |
| Scenario approved for promotion | Medium | Site Manager, VP Ops | In-app, email | "Scenario 'Q1 Peak Ramp' approved by VP Ops. Promoted to active plan for weeks 3-6." |
| Budget variance exceeds 10% | High | VP Ops, Site Manager | In-app, email | "Site 14 labor cost is 14% over budget for week 47. Primary driver: overtime (+22%)." |
| AI autonomy action taken | Low | Site Manager | In-app | "Auto-backfill: assigned Chris P. to Packing Line 2, 10:00-14:00." |
| Plan published to employees | Low | Site Manager | In-app | "Week 48 plan published. 312 employees notified." |

### 6.3 Notification Channels

| Channel | Use Case | Latency | User Control |
|---|---|---|---|
| **In-app banner** | All notifications while user is active | Immediate (WebSocket) | Can mute by category |
| **In-app notification center** | Historical log of all notifications | Immediate | Always on, read/unread tracking |
| **Push notification (mobile)** | Critical and high severity when user is not in-app | < 30 seconds | Configurable by severity |
| **Email** | Medium severity and above, daily digest option | < 5 minutes | Configurable: immediate, digest, or off |
| **SMS** | Critical only, opt-in | < 60 seconds | Opt-in per notification type |
| **PagerDuty / webhook** | System health alerts for admin team | < 30 seconds | Configured by admin |

### 6.4 Notification Preferences

Users can configure notification preferences at three levels:

1. **Global:** Enable/disable entire channels (e.g., "No SMS notifications").
2. **Category:** Set severity threshold per category (e.g., "Only Critical for coverage alerts").
3. **Schedule:** Quiet hours (e.g., "No push notifications between 22:00 and 06:00 unless Critical").

Administrators can set organization-wide minimum notification rules (e.g., "Critical coverage alerts cannot be muted by any user").

---

## 7. Mobile vs Desktop Considerations

### 7.1 Design Philosophy: Mobile Is Not a Shrunken Desktop

AstraPlanner does not attempt to replicate the desktop experience on mobile. Instead, the mobile experience is purpose-built for the three scenarios where mobile is the primary device:

1. **Shift supervisors on the warehouse floor** who need to check assignments, mark absences, and approve swaps while walking between zones.
2. **Site managers reviewing alerts** during off-hours or while away from their desk.
3. **VP-level executives checking dashboards** during travel or meetings.

### 7.2 Mobile vs Desktop Feature Matrix

| Feature | Desktop | Mobile |
|---|---|---|
| Control Room (full dashboard) | Full widget grid, configurable layout | Scrollable card stack, key metrics only |
| Coverage heatmap | Full process x timeslot grid, click-to-drill | Simplified list view: "3 red, 5 yellow, 22 green" with tap-to-detail |
| Planning Workbench (drag-and-drop) | Full drag-and-drop timeline | Not available. Quick-swap and approve/reject only |
| Scenario Simulation | Full creation and comparison | View results only. Creation requires desktop |
| Employee lookup | Full profile with schedule, skills, history | Quick profile: current assignment, skills, availability |
| Notifications | Sidebar panel | Native push + in-app feed |
| AI Advisor | Chat panel with rich formatting | Conversational interface, voice input supported |
| Offline capability | Not applicable (always connected) | View cached current-day plan, queue absence reports |

### 7.3 Mobile Interaction Patterns

- **Swipe gestures:** Swipe right on an AI suggestion to accept, swipe left to reject.
- **Long press:** Long press on an employee name to see quick profile.
- **Pull to refresh:** Refresh current view data.
- **Haptic feedback:** Vibration on critical alerts and confirmation of actions.
- **Large touch targets:** Minimum 48x48dp for all interactive elements. Optimized for gloved operation in cold-chain environments.

### 7.4 Responsive Breakpoints

| Breakpoint | Width | Layout Adaptation |
|---|---|---|
| Mobile portrait | < 600px | Single column, stacked cards, bottom navigation |
| Mobile landscape / small tablet | 600-900px | Two-column where beneficial, side navigation drawer |
| Tablet | 900-1200px | Adapted desktop layout, collapsible side panels |
| Desktop | 1200-1800px | Full layout with side panels |
| Large desktop / control room display | > 1800px | Extended layout with persistent side panels, larger widgets |

### 7.5 Accessibility

AstraPlanner meets WCAG 2.1 AA compliance across all interfaces:

- All color-coded indicators (red/yellow/green) also include shape or pattern differentiation for color-blind users.
- All interactive elements are keyboard-navigable with visible focus indicators.
- Screen reader support with ARIA labels on all charts and data visualizations.
- Minimum contrast ratio of 4.5:1 for text, 3:1 for graphical elements.
- Reduced motion mode available for users with vestibular sensitivities.
- Font size adjustable from 100% to 150% without layout breakage.

---

## 8. Visual Design Language

### 8.1 Color System

| Color | Hex | Usage |
|---|---|---|
| Green (healthy) | #16A34A | Coverage >95%, constraints met, on-budget |
| Yellow (warning) | #CA8A04 | Coverage 80-95%, approaching limits, minor variance |
| Red (critical) | #DC2626 | Coverage <80%, constraint violated, significant variance |
| Blue (information) | #2563EB | AI suggestions, informational highlights, selected state |
| Gray (neutral) | #6B7280 | Disabled elements, unavailable time slots, baseline data |
| Purple (scenario) | #7C3AED | Scenario-specific data, "what-if" overlays |

### 8.2 Typography

- **Primary font:** Inter (variable weight). Optimized for screen readability at small sizes.
- **Monospace font:** JetBrains Mono. Used for numerical data tables and IDs.
- **Heading scale:** 24/20/16/14px for H1/H2/H3/H4. Body text at 14px. Small/caption at 12px.

### 8.3 Component Library

AstraPlanner uses a custom component library built on a headless UI framework. Key components include:

- **MetricCard:** Displays a KPI with value, trend arrow, comparison, and drill-down affordance.
- **HeatmapGrid:** Configurable grid with color-coded cells, tooltips, and click handlers.
- **TimelineBar:** Horizontal bar representing a time period with segments for different assignments.
- **ConfidenceBadge:** Displays AI confidence with color, percentage, and expandable detail.
- **AlertBanner:** Dismissible banner with severity color, message, and action buttons.
- **SlideOverPanel:** Right-sliding panel for drill-down detail, stackable up to 3 levels.
- **CommandPalette:** Global search and action interface triggered by Ctrl+K.

---

## 9. Performance Requirements for UX

| Interaction | Maximum Latency | Measurement Point |
|---|---|---|
| Page load (initial) | 2 seconds | First meaningful paint |
| Page load (subsequent, cached) | 500ms | Content visible |
| Drill-down panel open | 300ms | Panel visible with data |
| Heatmap cell click to tooltip | 100ms | Tooltip rendered |
| Search results (first batch) | 200ms | Results displayed |
| Notification delivery (in-app) | 500ms | Banner visible after server event |
| Drag-and-drop feedback | 16ms | Visual feedback per frame (60fps) |
| Plan save (after edit) | 1 second | Confirmation displayed |
| Scenario comparison load | 3 seconds | Side-by-side view rendered |

These targets assume a modern browser on a wired or strong WiFi connection. Mobile targets are 1.5x the desktop latency targets. Degraded network conditions trigger a "limited connectivity" indicator with graceful feature reduction (e.g., defer chart animations, load text data first).
