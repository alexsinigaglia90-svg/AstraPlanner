# The Control Room

## 1. Purpose

The Control Room is AstraPlanner's primary operational interface -- the screen that site managers open at 06:00 and leave running all day. Its purpose is twofold:

1. **Real-time workforce status monitoring:** At a glance, the user knows whether every process, every shift, and every site is adequately staffed.
2. **Rapid decision-making:** When a gap appears -- an absence, a demand spike, a constraint violation -- the Control Room surfaces the problem, presents AI-generated solutions, and enables one-click resolution.

The Control Room is not an analytics platform. It is a command center. Every element is designed for speed: speed of comprehension (how fast the user understands the current state), speed of identification (how fast the user spots problems), and speed of action (how fast the user resolves problems).

---

## 2. Layout Architecture

The Control Room uses a fixed four-zone layout optimized for wide screens (1440px+). On narrower screens and tablets, panels collapse into a tabbed interface. On mobile, the layout transforms into a scrollable card stack (see `ux-concepts.md`, Section 7).

```
+----------------------------------------------------------------------+
|  TOP BAR: Site Selector | Date/Time | Alert Badge | Plan Status      |
+----------+-----------------------------------------------+-----------+
|          |                                               |           |
|   LEFT   |                                               |   RIGHT   |
|  PANEL   |              CENTER DASHBOARD                 |   PANEL   |
|          |           (Configurable Widgets)               |           |
|  Site    |                                               |   AI      |
|  Tree    |                                               |  Advisor  |
|  Nav     |                                               |           |
|          |                                               |           |
+----------+-----------------------------------------------+-----------+
```

### 2.1 Top Bar

The top bar is persistent across all Control Room views. It provides global context and quick access to critical state indicators.

| Element | Position | Behavior |
|---|---|---|
| **Site Selector** | Left | Dropdown with search. Shows current site name and region. Multi-select available for VP-level users to view aggregated data across sites. Remembers last selection per user. |
| **Date/Time Picker** | Center-left | Defaults to "Today." Allows selection of any date or date range. Relative options: "Today," "Tomorrow," "This Week," "Next Week." Time granularity toggle: hourly, 2-hour, 4-hour, shift. |
| **Alert Badge** | Center-right | Red circle with count of unacknowledged critical and high-severity alerts. Clicking opens alert panel overlay. Badge pulses if any alert is more than 15 minutes old and unacknowledged. |
| **Plan Status Indicator** | Right | Shows the current plan's state: `Draft` (gray), `Optimized` (blue), `Under Review` (yellow), `Published` (green), `Stale` (orange -- data has changed since last optimization). Clicking opens plan metadata panel. |

### 2.2 Left Panel: Site Tree Navigator

The left panel is a hierarchical tree showing the user's organizational scope.

**Hierarchy structure:**

```
Enterprise
  └── Region (e.g., East, West, Central)
       └── Site (e.g., Site 14 - Chicago DC)
            └── Department (e.g., Outbound)
                 └── Process (e.g., Picking Line 3)
```

**Health indicators:**

Each node in the tree displays a colored dot indicating its health status:

| Color | Meaning | Calculation |
|---|---|---|
| Green | Healthy | All child processes have coverage >= 95% and no critical alerts |
| Yellow | Attention needed | Any child process has coverage 80-95% OR any high-severity alert |
| Red | Critical | Any child process has coverage < 80% OR any critical alert |
| Gray | No data | No plan exists or data feed is stale |

**Interaction behaviors:**

- Clicking a node filters the center dashboard to show only data for that scope.
- Right-clicking a node shows a context menu: "View details," "Open in new tab," "Set as default view."
- Drag to reorder favorites. Starred nodes appear at the top of the tree.
- The tree auto-expands to show the first red node when the page loads.
- Collapsed nodes show a summary badge: "3 green, 1 yellow, 0 red."

**Width:** Resizable, default 240px, minimum 200px, maximum 360px. Collapsible to icon-only mode (56px) via toggle button.

### 2.3 Center Dashboard

The center dashboard is a configurable grid of widgets. Users can add, remove, resize, and rearrange widgets within a 12-column grid system.

**Default widget layout (for Site Manager role):**

| Position | Widget | Size (columns x rows) |
|---|---|---|
| Top-left | Coverage Heatmap | 8 x 4 |
| Top-right | Risk Alerts | 4 x 4 |
| Middle-left | Demand vs Capacity | 6 x 3 |
| Middle-right | Workforce Utilization | 6 x 3 |
| Bottom-left | Cost Tracker | 4 x 3 |
| Bottom-center | Absenteeism Monitor | 4 x 3 |
| Bottom-right | Cross-Site Balance | 4 x 3 |

**Widget framework capabilities:**

- Drag-and-drop repositioning with snap-to-grid.
- Resize handles on corners and edges.
- Each widget has a header with: title, refresh timestamp, settings gear, maximize button, and drag handle.
- Widgets can be minimized to title-bar-only state.
- Layout is saved per user per role and can be reset to defaults.
- Widget library: users can add from a catalog of 15+ available widgets.

### 2.4 Right Panel: AI Advisor

The right panel contains AstraPlanner's AI Advisor -- a contextual chat and recommendation interface.

**Modes:**

| Mode | Trigger | Behavior |
|---|---|---|
| **Passive** | Default state | Shows top 3-5 contextual recommendations based on current view. Updates when user changes scope or date. |
| **Active** | User clicks on an alert or problem | Shows specific recommendations for the selected issue. "Coverage gap on Picking Line 3 at 14:00. Here are 3 backfill options..." |
| **Conversational** | User types a question | Free-text interaction. "What happens if I move Tom from packing to picking?" AI responds with impact analysis. |

**Recommendation card format:**

```
+--------------------------------------------------+
| [Severity Icon] Recommendation Title              |
| Brief description of the suggestion               |
|                                                    |
| Impact: Coverage +5%, Cost +$120, Risk: Low       |
| Confidence: 92%                                    |
|                                                    |
| [Accept]  [Modify]  [Dismiss]  [Explain More]    |
+--------------------------------------------------+
```

**Interaction with center dashboard:**

- When the user hovers over a recommendation, the relevant widget element highlights (e.g., the affected heatmap cell glows).
- When the user clicks "Accept," the center dashboard updates immediately to reflect the change.
- The AI Advisor tracks the current context. If the user switches from viewing today's plan to tomorrow's, the recommendations update automatically.

**Width:** Fixed at 320px on screens > 1440px. Collapsible to a floating action button on narrower screens. Expandable to 480px for conversational mode.

---

## 3. Key Widgets

### 3.1 Coverage Heatmap

**Purpose:** Show at a glance where coverage is adequate and where gaps exist.

**Structure:** A grid where rows represent processes (or departments, depending on zoom level) and columns represent time slots.

**Cell coloring:**

| Fill Rate | Color | Hex | Visual Treatment |
|---|---|---|---|
| >= 95% | Green | #16A34A | Solid fill |
| 80% - 94% | Yellow | #CA8A04 | Solid fill |
| 50% - 79% | Orange | #EA580C | Solid fill with warning icon |
| < 50% | Red | #DC2626 | Solid fill with critical icon |
| 0% (no one assigned) | Dark red | #991B1B | Striped fill |
| Over-staffed (>110%) | Blue | #2563EB | Solid fill with surplus indicator |

**Cell content:** Each cell displays the fraction (e.g., "4/5") and the percentage. On hover, a tooltip shows:

```
Picking Line 3 | 14:00 - 16:00
Filled: 4 of 5 positions (80%)
Gap: 1 Certified Pick Operator
Assigned: Sarah K., Tom R., Maria L., John D.
Missing skill: Pick-to-Light Certified
AI Suggestion: Chris P. (available, certified, +2h before OT limit)
[Assign Chris] [See All Options] [Ignore]
```

**Interaction:**

1. Click a red or yellow cell to open a slide-over panel with gap details and AI suggestions.
2. Click "Assign" on a suggestion to immediately fill the gap. The cell color updates in real-time.
3. Click a green cell to see who is assigned and their skill match scores.
4. Click a column header (time slot) to see all processes for that time slot in a list view.
5. Click a row header (process) to see the full-day timeline for that process.

**Configuration:**

- Time slot granularity: 30 min, 1 hour, 2 hours, 4 hours, full shift (user selectable).
- Row grouping: by process, by department, by skill category.
- Threshold customization: users can adjust the green/yellow/red thresholds per site.

### 3.2 Demand vs Capacity Chart

**Purpose:** Show whether planned capacity aligns with forecasted demand over time.

**Chart type:** Area chart with three layers.

| Layer | Color | Description |
|---|---|---|
| Forecasted Demand | Red line with light red fill below | Units/hours of work forecasted by the demand model |
| Planned Capacity | Blue line with light blue fill below | Units/hours of work the current plan can deliver |
| Actual (when available) | Black dashed line | Real units/hours delivered (populates as the day progresses) |

**Confidence band:** The demand forecast line includes a P10-P90 shaded band showing forecast uncertainty.

**Interactions:**

- Hover over any point to see exact values and the gap/surplus.
- Click on a point where demand exceeds capacity to see which processes are causing the shortfall.
- Toggle between units and FTE equivalents using a button in the widget header.
- Time range selector: today, this week, next 4 weeks.

**Alert integration:** If demand is forecasted to exceed capacity by more than 10% in any time slot, a warning indicator appears on the chart and a corresponding alert is added to the Risk Alerts widget.

### 3.3 Workforce Utilization

**Purpose:** Show how effectively the workforce is being deployed.

**Chart type:** Horizontal bar chart. One bar per department or process.

**Bar segments:**

| Segment | Color | Definition |
|---|---|---|
| Productive time | Green | Time assigned to value-adding processes |
| Support time | Blue | Time on training, meetings, admin tasks |
| Idle/unassigned | Gray | Available hours not assigned to any process |
| Overtime | Orange | Hours beyond standard contract |
| Absent | Red | Unplanned absence hours |

**Utilization rate calculation:** `(Productive Time + Support Time) / Total Available Hours * 100`

**Benchmark line:** A vertical dashed line at the target utilization rate (configurable, default 85%).

**Interactions:**

- Click on a bar to see the employee-level breakdown for that department.
- Hover to see exact hours and percentages for each segment.
- Sort bars by utilization rate (ascending or descending) or by department name.

### 3.4 Risk Alerts

**Purpose:** Surface upcoming problems before they become emergencies.

**Alert categories:**

| Category | Icon | Example |
|---|---|---|
| Coverage gap | Shield with gap | "Picking Line 3 has 0 certified operators assigned for night shift Thursday" |
| Overtime risk | Clock with exclamation | "5 employees will exceed 48h weekly limit if current plan proceeds" |
| Certification expiry | Badge with timer | "3 forklift certifications expire within 14 days" |
| Absenteeism pattern | Calendar with trend | "Monday absence rate trending 3% above normal for past 4 weeks" |
| Demand-capacity mismatch | Scale imbalance | "Forecasted demand for Friday exceeds planned capacity by 18%" |
| Compliance risk | Legal scale | "Night shift staffing below regulatory minimum for fire safety" |
| Cost overrun | Dollar with arrow up | "Agency spend is 140% of weekly budget" |

**Alert structure:**

Each alert contains:

- **Severity:** Critical (red), High (orange), Medium (yellow), Low (blue).
- **Title:** One-line summary.
- **Detail:** 2-3 sentence explanation with specific numbers.
- **Time context:** When the issue will occur ("Thursday night shift" or "within 14 days").
- **AI recommendation:** Suggested resolution with one-click action.
- **Acknowledge button:** Marks the alert as seen (does not resolve it).
- **Resolve button:** Marks the alert as resolved with an optional note.

**Sorting:** By severity (default), then by time proximity. Critical alerts always appear first.

**Filtering:** By category, by severity, by time horizon (today, this week, next 30 days).

### 3.5 Cost Tracker

**Purpose:** Show labor cost performance against budget.

**Display elements:**

| Element | Description |
|---|---|
| **Budget bar** | Horizontal bar showing total budget, with filled portion showing actual spend |
| **Variance indicator** | Green (under budget), yellow (0-5% over), red (>5% over) |
| **Cost breakdown table** | Regular hours, overtime, agency/temp, training, other -- each with budget and actual |
| **Trend sparkline** | 4-week trend of total cost vs budget |
| **Forecast indicator** | AI-projected end-of-period spend based on current trends |

**Interactions:**

- Click on any cost category to see the breakdown by department and process.
- Click on overtime cost to see which employees and which assignments are driving overtime.
- Click on agency cost to see agency utilization by process and vendor.

### 3.6 Absenteeism Monitor

**Purpose:** Track real-time absences and ensure backfill is in place.

**Display elements:**

| Element | Description |
|---|---|
| **Absence count** | Large number showing today's total absences vs expected headcount (e.g., "7 of 312 absent, 2.2%") |
| **Absence list** | Scrollable list of absent employees with: name, role, shift, reason (if provided), backfill status |
| **Backfill status indicators** | Green check: backfill assigned. Yellow clock: AI suggestion pending review. Red X: no backfill available |
| **Trend chart** | 30-day rolling absence rate trend with day-of-week pattern overlay |

**Backfill status values:**

| Status | Icon | Meaning | Action Available |
|---|---|---|---|
| Backfilled | Green check | Replacement assigned and confirmed | View assignment |
| Pending | Yellow clock | AI has suggested a replacement, awaiting approval | Accept / Reject / Modify |
| Unresolved | Red X | No suitable replacement found | View options / Escalate |
| Partial | Half-green | Replacement covers part of the shift or lacks some required skills | View details |

**Interactions:**

- Click on an absent employee to see the AI backfill recommendation with full reasoning.
- Click "Accept" to assign the backfill. Heatmap and utilization widgets update immediately.
- Click "Escalate" on an unresolved absence to send a notification to the site manager (if viewer is shift supervisor) or VP (if viewer is site manager).

### 3.7 Cross-Site Balance

**Purpose:** Compare key metrics across sites to identify imbalances and sharing opportunities.

**Display type:** Table with sparklines, scoped to the user's region or enterprise.

| Column | Description |
|---|---|
| Site name | Clickable, navigates to that site's Control Room |
| Coverage % | Today's overall coverage with color indicator |
| Utilization % | Today's workforce utilization |
| Overtime risk | Count of employees approaching overtime limits |
| Cost variance | % over/under budget, color-coded |
| Trend sparkline | 7-day coverage trend |

**Interactions:**

- Click any site row to switch the entire Control Room to that site's view.
- Sort by any column to find best/worst performers.
- Select two sites and click "Compare" to open a side-by-side comparison panel.
- Click "Balance" to ask the AI: "Can any cross-site employee transfers improve coverage?" The AI analyzes surplus/deficit across sites and suggests transfers for multi-site employees.

---

## 4. Interaction Patterns

### 4.1 Coverage Gap Resolution Flow

This is the most common interaction in the Control Room, occurring 5-20 times per day per site.

**Step-by-step flow:**

1. **Identification:** User spots a red or yellow cell on the Coverage Heatmap.
2. **Investigation (one click):** User clicks the cell. A slide-over panel opens showing:
   - Which positions are unfilled and what skills are required.
   - Who was originally assigned but is now unavailable (and why).
   - Current employees in adjacent processes who have the required skills.
3. **AI suggestion:** The panel includes a ranked list of backfill candidates:

   | Rank | Employee | Skill Match | Availability | OT Impact | Cost Impact | Overall Score |
   |------|----------|-------------|--------------|-----------|-------------|---------------|
   | 1 | Tom R. | 98% | Available now | +0h | +$0 (regular) | 96 |
   | 2 | Lisa M. | 92% | Available, other site | +0h | +$45 (travel) | 84 |
   | 3 | Agency temp | 75% | 2h lead time | N/A | +$180 | 62 |

4. **Action (one click):** User clicks "Assign" next to a candidate. System validates constraints in real-time.
5. **Confirmation:** If no constraint violations, the assignment is made immediately. The heatmap cell turns green. The affected employee's schedule updates. If constraint violations exist, a warning dialog appears with options to override or choose another candidate.
6. **Notification:** The assigned employee receives a notification (per their notification preferences).

**Total time from identification to resolution: 15-30 seconds for a standard backfill.**

### 4.2 Overtime Alert Resolution Flow

1. **Alert appears** in Risk Alerts widget: "5 employees will exceed 48h weekly limit if current plan proceeds."
2. **User clicks** the alert. Slide-over panel opens showing:
   - List of affected employees with current hours, planned remaining hours, and limit.
   - For each employee: which assignments are pushing them over the limit.
3. **AI suggests** resolution options:
   - "Remove John D. from Saturday shift and assign external temp. Impact: +$200 cost, -0% coverage."
   - "Shorten Lisa M.'s Friday shift by 2h and redistribute her picking tasks. Impact: +$0 cost, -3% picking coverage 16:00-18:00."
   - "Approve overtime exception for Tom R. (4h over limit). Requires manager approval. Impact: +$120 overtime premium."
4. **User selects** a resolution. System validates and applies the change.

### 4.3 Demand Spike Response Flow

1. **Demand vs Capacity chart** shows demand forecast exceeding capacity for tomorrow afternoon.
2. **User clicks** the gap area on the chart. Panel opens showing:
   - Which processes are driving the demand increase.
   - Current planned capacity vs required capacity, broken down by process.
   - Available flex capacity: bench employees, cross-trained employees, agency options.
3. **AI Advisor** proactively suggests: "Tomorrow's inbound volume is 15% above plan due to delayed trailer arrival. Recommend adding 4 employees to receiving 14:00-18:00. Here are the best options..."
4. **User reviews** and accepts recommendations, modifying as needed.

---

## 5. Real-Time Data Strategy

### 5.1 Data Refresh Architecture

The Control Room uses a tiered refresh strategy to balance real-time awareness with system performance.

| Data Category | Refresh Method | Frequency | Rationale |
|---|---|---|---|
| **Absence reports** | WebSocket push | Immediate | Absences require immediate backfill action |
| **Coverage status** | WebSocket push | On change | Coverage changes only when assignments change |
| **Alerts** | WebSocket push | On generation | Alerts are time-sensitive by definition |
| **Plan status changes** | WebSocket push | On change | Users need to know when plans are published or modified |
| **Demand forecast updates** | Polling | Every 15 minutes | Forecasts update periodically, not continuously |
| **Cost data** | Polling | Every 30 minutes | Cost calculations are batch-processed |
| **Utilization metrics** | Polling | Every 15 minutes | Calculated from time & attendance data feeds |
| **Cross-site data** | Polling | Every 5 minutes | Aggregated from multiple site data streams |
| **Historical trends** | On page load + cache | On navigation | Trend data changes slowly; cache is sufficient |

### 5.2 WebSocket Connection Management

- **Connection:** Established on Control Room load. Single multiplexed WebSocket per browser tab.
- **Reconnection:** Automatic reconnection with exponential backoff (1s, 2s, 4s, 8s, max 30s). User sees a "Reconnecting..." banner after 5 seconds of disconnection.
- **Fallback:** If WebSocket is unavailable (corporate proxy, network issues), the system falls back to long-polling at 10-second intervals. A "Limited real-time" indicator appears.
- **Data compression:** WebSocket messages use MessagePack encoding, reducing payload size by approximately 40% versus JSON.
- **Heartbeat:** Client sends ping every 30 seconds. Server responds with pong and optional data refresh signal.

### 5.3 Optimistic UI Updates

When a user takes an action (e.g., assigns a backfill), the UI updates immediately without waiting for server confirmation. If the server rejects the action (e.g., another user already assigned that employee), the UI reverts with an explanation: "Assignment failed: Tom R. was assigned to Site 12 by another manager 30 seconds ago. Here are alternative options."

---

## 6. Role-Based View Customization

### 6.1 Pre-Configured Layouts by Role

| Role | Default Widgets | Hidden Widgets | Special Features |
|---|---|---|---|
| VP of Operations | Cross-Site Balance (large), Cost Tracker, Coverage Summary (aggregated), Risk Alerts | Employee-level widgets | Multi-site selector, portfolio view |
| Site Manager | Coverage Heatmap (large), Demand vs Capacity, Risk Alerts, Cost Tracker, Absenteeism Monitor, Utilization | Cross-Site Balance (available but not default) | Full AI Advisor |
| Shift Supervisor | Coverage Heatmap (shift-filtered), Absenteeism Monitor, Assignment Board | Cost Tracker, Demand vs Capacity (available but not default) | Quick-swap buttons, mobile-optimized |
| HR / Workforce Planner | Skill Gap Overview, Certification Status, Cross-Training Progress, Overtime Monitor | Coverage Heatmap (available but not default) | Workforce analytics |

### 6.2 Customization Rules

- Users can add any widget from the catalog regardless of role.
- Users cannot remove widgets that are marked as "mandatory" by their administrator.
- Layout changes are saved automatically and persist across sessions.
- Administrators can push a layout update to all users of a role (users receive a prompt: "Your administrator has updated the recommended layout. Apply changes?").
- Users can save multiple named layouts and switch between them (e.g., "Morning review" vs "End of day closeout").

---

## 7. Display Options

### 7.1 Dark Mode

The Control Room supports a dark mode optimized for shift operations, particularly night shifts where bright screens cause eye strain and glare.

| Element | Light Mode | Dark Mode |
|---|---|---|
| Background | #FFFFFF | #111827 |
| Card background | #F9FAFB | #1F2937 |
| Text (primary) | #111827 | #F9FAFB |
| Text (secondary) | #6B7280 | #9CA3AF |
| Borders | #E5E7EB | #374151 |
| Green indicator | #16A34A | #22C55E (brighter for contrast) |
| Red indicator | #DC2626 | #EF4444 (brighter for contrast) |

**Activation:** Manual toggle in user settings. Auto-switch option: dark mode between 20:00 and 06:00 based on site local time.

### 7.2 Large Display Mode

For control rooms with wall-mounted displays, a "Kiosk Mode" is available:

- Hides navigation elements and user-specific controls.
- Increases font sizes by 50% and widget padding by 30%.
- Auto-rotates through pre-configured widget views on a configurable interval (default: 30 seconds per view).
- Shows a site-level clock and shift countdown timer.
- Supports multi-monitor setups: each monitor can display a different widget set.

### 7.3 Density Options

| Density | Row Height | Font Size | Use Case |
|---|---|---|---|
| Compact | 32px | 12px | Power users who want to see maximum data |
| Default | 40px | 14px | Standard desktop usage |
| Comfortable | 48px | 16px | Touch-screen and accessibility |

### 7.4 Color-Blind Accessibility

All color-coded elements include secondary visual indicators:

| Standard Color | Color-Blind Alternative |
|---|---|
| Green (healthy) | Green + checkmark icon + solid fill |
| Yellow (warning) | Amber + triangle icon + diagonal stripe pattern |
| Red (critical) | Red + circle-X icon + crosshatch pattern |
| Blue (info) | Blue + info-circle icon + dotted border |

Users can enable "High contrast patterns" in accessibility settings to activate these alternatives globally.
