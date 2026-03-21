# Planning Adjustments and the Planning Workbench

## 1. Purpose

The Planning Workbench is AstraPlanner's manual adjustment and fine-tuning interface. It is where the AI's optimized plan meets operational reality -- where a site manager says "I know the algorithm put Sarah on picking, but she's coming off an injury and I want her on packing this week" and the system needs to accommodate that decision intelligently.

The Planning Workbench exists because no optimization engine, regardless of sophistication, can capture every relevant factor in workforce planning. Institutional knowledge, employee relationships, unreported constraints, customer-specific requirements, and plain managerial judgment all play roles that no model can fully encode. The Workbench respects this reality by making manual adjustments easy, validated, and traceable.

---

## 2. Why Manual Adjustments Are Necessary

Despite AstraPlanner's AI producing high-quality optimized plans, manual adjustments are required in practice for several categories of reasons:

| Category | Example | Frequency |
|---|---|---|
| **Unstated constraints** | "Tom and Jerry don't work well together on the same line" | Occasional, decreasing as system learns |
| **Real-time events** | Employee calls in sick 30 minutes before shift start | Daily, 2-8% of workforce |
| **Managerial judgment** | "I want to give Maria experience on shipping this week to prepare her for the lead role" | Weekly |
| **Customer requirements** | "Client X insists on having a dedicated team for their orders" | Per contract |
| **Union/labor relations** | "We promised the union rep we'd rotate Saturday shifts fairly" | Per agreement |
| **Data lag** | "The system doesn't know yet that Alex got his forklift certification yesterday" | Until data feeds catch up |
| **Exceptional circumstances** | Facility maintenance reducing workstation capacity, VIP visit requiring extra staffing | Ad hoc |

**Design philosophy:** The system should make adjustments easy but never invisible. Every manual adjustment is logged, validated against constraints, and its impact on plan quality is quantified. The goal is not to prevent overrides but to ensure they are informed overrides.

---

## 3. Adjustment Types

### 3.1 Employee Swap

**Definition:** Replace one employee with another on a specific assignment (process, time slot, date).

**Interface:** Click on an assigned employee in the timeline or heatmap. A panel opens showing the current assignment details and a list of eligible replacement employees, ranked by suitability.

**Swap eligibility criteria:**

| Criterion | Check | Blocking vs Advisory |
|---|---|---|
| Required skills | Replacement must hold all required certifications for the process | Blocking |
| Availability | Replacement must not be assigned elsewhere at the same time | Blocking |
| Working time limits | Swap must not cause replacement to exceed daily/weekly hour limits | Blocking |
| Rest period | Replacement must have had minimum rest since last shift | Blocking |
| Contract type | Some processes are restricted to permanent employees only | Blocking |
| Skill proficiency level | Replacement should meet minimum proficiency rating | Advisory (warning) |
| Overtime impact | Swap may push replacement into overtime | Advisory (cost shown) |
| Fairness score | Swap may create unbalanced workload distribution | Advisory (metric shown) |
| Employee preference | Replacement may have a stated preference against this process or shift | Advisory (shown) |

**Quick swap shortcut:** On the timeline view, drag an employee from one row to another within the same time column. The system validates instantly and shows a green checkmark (valid) or red X (invalid with reason).

### 3.2 Shift Change

**Definition:** Modify the start time, end time, or break placement of a specific employee's shift on a specific day.

**Interface:** Click on a shift block in the timeline view. Drag the left edge to change start time, right edge to change end time. Click the break marker to move it. Or open the detail panel for precise time entry.

**Validation rules:**

| Rule | Description | Type |
|---|---|---|
| Minimum shift length | Shift cannot be shorter than configured minimum (e.g., 4 hours) | Blocking |
| Maximum shift length | Shift cannot exceed configured maximum (e.g., 12 hours) | Blocking |
| Break requirements | Shifts over 6 hours must include a break of at least 30 minutes | Blocking |
| Overlap check | New shift time must not overlap with another assignment for the same employee | Blocking |
| Rest period | New shift must maintain minimum rest gap from previous/next shift | Blocking |
| Site operating hours | Shift must fall within site operating hours unless override is approved | Advisory |
| Coverage impact | System shows the coverage impact of the time change on affected processes | Informational |

### 3.3 Process Reassignment

**Definition:** Move an employee from one process to another within the same shift, for all or part of the shift duration.

**Interface:** In the timeline view, click and drag an assignment block from one process row to another. Or in the process view, click an employee and select "Reassign to..." from the context menu.

**Partial reassignment:** An employee can be split across processes. For example, picking 06:00-10:00 then packing 10:00-14:00. The interface allows splitting a block by clicking and dragging a split handle.

**Validation:** Same as Employee Swap -- skill and certification checks apply to the target process.

### 3.4 Add/Remove Shift

**Definition:** Create an ad-hoc shift that was not part of the original plan, or cancel a planned shift.

**Add shift flow:**

1. User clicks "Add Shift" button on the toolbar.
2. User specifies: date, start time, end time, process/department.
3. System shows available employees with required skills.
4. User selects employees to assign, or clicks "Auto-fill" for AI assignment.
5. System validates all constraints and creates the shift.

**Remove shift flow:**

1. User right-clicks a shift block and selects "Cancel Shift."
2. System shows impact: which employees are freed, what coverage gaps are created.
3. User confirms. Affected employees are notified (per notification preferences).
4. Cancelled shifts appear as grayed-out blocks with a strikethrough for audit visibility.

### 3.5 Override Capacity

**Definition:** Manually set the required headcount for a process and time slot, overriding the demand-driven calculation.

**Use case:** The site manager knows that despite the demand model showing 5 FTEs needed for packing at 14:00, they actually need 7 because a new packaging format is slower than the standard used in productivity calculations.

**Interface:** Right-click a heatmap cell and select "Override required headcount." Enter the new value. The cell shows a small "M" badge indicating a manual override is in effect.

**Override behavior:**

- The override applies to the specific process x time slot x date combination.
- The optimizer respects overrides when re-optimizing -- it treats the overridden value as a hard constraint.
- Overrides can be set for a single day or a date range.
- Overrides expire automatically at the end of their date range.
- A report of active overrides is available in the Planning section so managers can review and clean up stale overrides.

### 3.6 Lock Assignments

**Definition:** Mark specific employee-to-process-to-timeslot assignments as non-negotiable. The optimizer will not change these assignments when re-optimizing the plan.

**Use case:** The site manager has confirmed with Sarah that she will work the day shift on Saturday. When the plan is re-optimized (because demand changed, or an absence was reported), Sarah's Saturday assignment must remain fixed.

**Interface:** Right-click an assignment block and select "Lock." A padlock icon appears on the block. Locked assignments are visually distinct (slightly darker border, padlock badge).

**Lock scope options:**

| Scope | Description | Example |
|---|---|---|
| Single slot | Lock one assignment for one time slot | "Sarah on picking, Saturday 06:00-10:00" |
| Full day | Lock all of an employee's assignments for a day | "Sarah's entire Saturday schedule is fixed" |
| Full week | Lock all of an employee's assignments for the week | "Don't change anything about Sarah's schedule this week" |
| Process lock | Lock all assignments to a specific process | "Don't change anyone's packing assignments on Friday" |

**Lock limits:** To prevent over-constraining the optimizer, a warning is shown when more than 30% of assignments are locked: "42% of assignments are locked. This significantly limits the optimizer's ability to find efficient solutions. Consider unlocking non-critical assignments."

### 3.7 Bulk Adjustments

**Definition:** Apply the same change across multiple days, employees, or sites simultaneously.

**Bulk adjustment interface:**

1. User selects a scope: date range, employee group (by department, skill, employment type), site(s).
2. User defines the change: shift time modification, process reassignment, capacity override.
3. System previews the change: shows how many assignments are affected, constraint violations, cost impact.
4. User confirms. All changes are applied atomically (all succeed or all rollback).

**Examples:**

| Bulk Adjustment | Description |
|---|---|
| "Move all packing start times from 06:00 to 07:00 for next week" | Updates shift start for all packing assignments Mon-Fri |
| "Add 2 FTEs to receiving for the first 4 hours every day in December" | Creates capacity overrides for 22 days |
| "Cancel all Saturday shifts for temporary employees in week 51" | Removes assignments and notifies affected employees |

---

## 4. Scheduling Interface Views

### 4.1 Timeline View

The primary scheduling view. Employees are rows, time is the horizontal axis.

**Structure:**

```
             06:00   08:00   10:00   12:00   14:00   16:00   18:00
Employee A  |==Picking========|--Break--|==Packing==========|
Employee B  |==Receiving======|--Break--|==Picking==========|
Employee C  |      |==Picking==========|--Break--|==Ship===|
Employee D  (OFF)
Employee E  |==Picking [LOCKED]========|--Break--|==Pick===|
```

**Color coding:** Each process has a distinct color. Breaks are gray. Locked assignments have a padlock icon. Overtime segments have a dashed border.

**Interactions:**

- **Drag left/right edge:** Change shift start/end time.
- **Drag entire block:** Move assignment to different time (same employee and process).
- **Drag to different row:** Swap assignment to different employee.
- **Click and drag split handle:** Split a block into two process assignments.
- **Right-click:** Context menu with Lock, Swap, Reassign, Cancel, View Details.
- **Ctrl+Click multiple blocks:** Select multiple assignments for bulk operations.

**Filtering:**

- By department, process, shift, employment type, skill.
- Search bar to find specific employees.
- Toggle to show/hide off-duty employees.
- Toggle to show/hide locked assignments only.

**Zoom levels:** 30-minute slots, 1-hour slots, 2-hour slots, shift-level overview.

### 4.2 Process View

Processes are rows, time is the horizontal axis. Each cell shows the number of employees assigned versus required.

**Structure:**

```
                06:00   08:00   10:00   12:00   14:00   16:00   18:00
Picking L1     | 5/5   | 5/5   | 5/5   | 4/5   | 3/5   | 2/3   |
Picking L2     | 4/5   | 5/5   | 5/5   | 5/5   | 5/5   | 3/3   |
Packing        | 8/8   | 8/8   | 7/8   | 8/8   | 8/8   | 5/6   |
Receiving      | 3/3   | 3/3   | 4/4   | 4/4   | 3/3   | 2/2   |
Shipping       | 2/2   | 2/2   | 2/2   | 3/3   | 4/4   | 4/4   |
```

**Cell behavior:** Same color coding as the Coverage Heatmap (green/yellow/red based on fill rate). Clicking a cell shows the list of assigned employees with option to add, remove, or swap.

### 4.3 Gantt View

A detailed view showing shift blocks as horizontal bars with employee details embedded.

**Structure:**

Each bar shows:
- Employee name and ID.
- Shift time (start to end).
- Assigned process(es) with color segments.
- Status icons: locked (padlock), overtime (clock), skill warning (triangle).
- Break periods as gaps in the bar.

**Sorting options:** By employee name, by shift start time, by process, by employment type.

**Grouping options:** By department, by process, by shift pattern, by team/supervisor.

**Interactions:** Same as Timeline View (drag, right-click, etc.) but with richer visual detail per bar.

---

## 5. Constraint Validation

### 5.1 Real-Time Validation Engine

Every adjustment triggers an instant constraint validation. The system evaluates the proposed change against all active constraints before applying it.

**Validation response time target:** < 200ms from user action to validation result displayed.

**Validation result display:**

| Result | Visual Indicator | User Action |
|---|---|---|
| Valid | Green checkmark animation on the adjusted element | Change applied automatically |
| Advisory warning | Yellow warning icon with tooltip | Change applied, warning shown. User can proceed or undo |
| Blocking violation | Red X with explanation panel | Change not applied. User sees what rule is violated and why |

### 5.2 Constraint Categories and Handling

| Constraint Category | Examples | Blocking or Advisory | Override Allowed |
|---|---|---|---|
| **Legal/regulatory** | Max working hours per day, minimum rest between shifts, certification requirements | Blocking | Only by authorized role (Site Manager+) with documented reason |
| **Contractual** | Union-agreed shift patterns, maximum consecutive weekends, guaranteed minimum hours | Blocking | Only by HR/Workforce Planner with union liaison notification |
| **Safety** | Minimum staffing for hazmat areas, forklift certification, first-aid responder presence | Blocking | No override allowed |
| **Organizational** | Target coverage rates, utilization targets, overtime budgets | Advisory | Any planner can override |
| **Preference** | Employee shift preferences, process preferences, team assignments | Advisory | Any planner can override |
| **AI-recommended** | Fatigue risk thresholds, fairness distribution, cross-training development | Advisory | Any planner can override |

### 5.3 Warning vs Blocking

When a constraint is violated, the system displays a validation panel:

**Blocking violation example:**

```
+------------------------------------------------------------------+
| [X] BLOCKED: Working Time Violation                                |
|                                                                    |
| Assigning Tom R. to this shift would result in 13 hours of work   |
| on March 22, exceeding the 12-hour daily maximum.                 |
|                                                                    |
| Current hours: 8h (06:00-14:00 on Picking Line 2)                |
| Proposed addition: 5h (14:00-19:00 on Packing)                   |
| Total: 13h (maximum: 12h)                                         |
|                                                                    |
| Alternatives:                                                      |
| - Shorten proposed shift to 4h (14:00-18:00) [Apply]             |
| - Assign Chris P. instead (available, qualified) [Swap]           |
| - Remove Tom's morning assignment and assign full PM [Replace]    |
+------------------------------------------------------------------+
```

**Advisory warning example:**

```
+------------------------------------------------------------------+
| [!] WARNING: Overtime Impact                                       |
|                                                                    |
| This assignment will push Lisa M. into overtime.                  |
|                                                                    |
| Current weekly hours: 38h                                          |
| After this assignment: 46h (+8h overtime)                         |
| Overtime cost: $192 (8h x $24/h x 1.0 premium)                   |
|                                                                    |
| [Proceed Anyway]  [Find Alternative]  [Cancel]                    |
+------------------------------------------------------------------+
```

### 5.4 Cascade Impact Analysis

When a change affects coverage on another process or creates a secondary gap, the system proactively shows the cascade:

```
+------------------------------------------------------------------+
| CASCADE IMPACT                                                     |
|                                                                    |
| Moving Maria from Picking Line 3 (14:00-18:00) also affects:     |
|                                                                    |
| 1. Picking Line 3, 14:00-18:00: coverage drops from 5/5 to 4/5  |
|    (80%). Maria is the only certified pick-to-light operator.     |
|    Suggestion: Assign Tom R. to cover (certified, available)      |
|                                                                    |
| 2. Packing, 14:00-18:00: coverage increases from 7/8 to 8/8     |
|    (100%). This resolves the existing gap.                        |
|                                                                    |
| Net impact: +1 gap created, +1 gap resolved. Net coverage: 0%    |
| change. Skill concentration risk on Picking Line 3 increases.     |
|                                                                    |
| [Apply with Cascade Fix]  [Apply Without Fix]  [Cancel]          |
+------------------------------------------------------------------+
```

---

## 6. AI-Assisted Adjustments

### 6.1 "Fill This Gap"

**Trigger:** User clicks on an unfilled position (red cell in heatmap or empty slot in process view) and selects "Fill This Gap."

**AI behavior:**

1. Identifies all employees who:
   - Hold the required skills and certifications.
   - Are available during the target time slot (not assigned elsewhere, not on leave).
   - Would not violate any blocking constraint if assigned.
2. Ranks candidates by a composite score:

   | Factor | Weight | Description |
   |---|---|---|
   | Skill match | 30% | How closely the employee's skills match the position requirements |
   | Availability quality | 20% | Already on-site > on bench > requires recall |
   | Cost efficiency | 20% | Regular hours preferred over overtime; permanent over agency |
   | Fatigue risk | 15% | Lower hours worked this week preferred |
   | Fairness | 10% | Balances additional assignments across employees |
   | Development value | 5% | Aligns with cross-training plan if applicable |

3. Presents the top 5 candidates with scores and one-click assignment.

### 6.2 "Rebalance This Day"

**Trigger:** User clicks "Rebalance" from the day-view toolbar.

**AI behavior:**

1. Takes all locked assignments as fixed constraints.
2. Takes all existing manual adjustments as soft preferences (AI will try to maintain them but may suggest changes).
3. Re-runs the optimizer for the selected day only.
4. Presents a diff view: "The optimizer suggests 8 changes to improve coverage from 89% to 96%."
5. Each suggested change can be accepted or rejected individually.
6. If some changes are rejected, the user can click "Re-optimize around rejections" to get an updated set of suggestions.

**Rebalance scope options:**

| Scope | Description |
|---|---|
| Single process | Only rebalance assignments for one process |
| Single shift | Only rebalance assignments within one shift |
| Full day | Rebalance all assignments for the day |
| Date range | Rebalance across multiple days (heavier computation) |

### 6.3 "What's the Impact?"

**Trigger:** User selects one or more proposed adjustments (not yet applied) and clicks "What's the Impact?"

**AI behavior:**

Calculates and displays a before/after comparison:

| Metric | Before | After | Change |
|---|---|---|---|
| Overall coverage | 94.2% | 93.8% | -0.4pp |
| Picking coverage | 96.0% | 92.0% | -4.0pp |
| Packing coverage | 87.5% | 100.0% | +12.5pp |
| Total overtime | 420h | 428h | +8h (+$192) |
| Risk score | 24 | 26 | +2 |
| Cost | $385,000 | $385,192 | +$192 |
| Constraint violations | 0 | 0 | No change |

The AI also provides a narrative summary: "This set of changes resolves the packing gap but creates a moderate coverage concern on Picking Line 3 in the 14:00-18:00 window. Net cost impact is minimal (+$192 in overtime). Recommend assigning a cross-trained employee to Picking Line 3 to maintain coverage."

---

## 7. Approval Workflow

### 7.1 Workflow Overview

Not all adjustments require approval. The approval workflow is configurable per organization and per adjustment type.

```
Planner makes adjustment
        │
        ▼
  Constraint validation passes?
        │
   Yes  │  No
   │    └──> Blocked (cannot proceed without authorized override)
   ▼
  Approval required for this type?
        │
   No   │  Yes
   │    └──> Submitted for review ──> Manager reviews
   │              │                        │
   │              │              Approved   │  Rejected
   │              │                 │       │     │
   │              │                 ▼       │     ▼
   │              │           Applied to    │  Returned with
   │              │           plan          │  feedback
   ▼              │                         │
  Applied to plan immediately               │
        │                                   │
        ▼                                   │
  Plan published? ──────────────────────────┘
        │
   Yes  │  No
   │    └──> Changes saved as draft, visible only to planners
   ▼
  Employees notified of schedule changes
```

### 7.2 Approval Configuration

| Adjustment Type | Default Approval Required | Configurable | Rationale |
|---|---|---|---|
| Employee swap (same cost) | No | Yes | Low impact, common operation |
| Employee swap (cost increase) | Yes, if cost delta > threshold | Yes, threshold configurable | Financial oversight |
| Shift time change (< 2 hours) | No | Yes | Minor operational adjustment |
| Shift time change (> 2 hours) | Yes | Yes | Significant schedule impact on employee |
| Add shift (within budget) | Yes | Yes | Headcount and cost implications |
| Add shift (exceeds budget) | Yes, VP-level | Escalation level configurable | Budget control |
| Cancel shift | Yes | Yes | Employee impact and potential contractual issues |
| Override capacity | No | Yes | Operational judgment call |
| Lock assignments | No | No | Informational, no direct impact |
| Bulk adjustments | Yes | No (always required) | High impact, error-prone |
| Regulatory constraint override | Yes, HR + Site Manager | No (always required) | Legal risk |

### 7.3 Approval Interface

The approver sees a dedicated "Pending Approvals" queue accessible from the top navigation bar (with badge count).

Each pending approval shows:

- **Submitter:** Who made the adjustment.
- **Timestamp:** When it was submitted.
- **Type:** What kind of adjustment.
- **Summary:** One-line description (e.g., "Add 4 employees to Saturday night shift, Site 14").
- **Impact panel:** Before/after comparison of key metrics (generated by "What's the Impact?" automatically).
- **Constraint status:** Any advisory warnings associated with the change.
- **Actions:** Approve, Reject (with required comment), Request Modification.

**Bulk approval:** The approver can select multiple pending items and approve or reject them in batch.

**Approval SLA:** Organizations can configure an approval timeout. If an adjustment is not reviewed within the configured window (default: 4 hours for same-day changes, 24 hours for future changes), an escalation notification is sent to the approver's manager.

---

## 8. Undo/Redo and History

### 8.1 Undo/Redo Stack

The Planning Workbench maintains a full undo/redo stack for the current editing session.

| Feature | Behavior |
|---|---|
| **Undo** | Ctrl+Z (Cmd+Z on Mac). Reverts the last adjustment. Stack depth: 50 actions. |
| **Redo** | Ctrl+Y (Cmd+Y on Mac). Re-applies the last undone adjustment. |
| **Session scope** | Undo stack is maintained per user per planning session. Closing the browser clears the stack. |
| **Multi-user awareness** | If another user has modified the same assignment, undo will warn: "This assignment was modified by another user since your change. Undo may conflict." |
| **Undo after approval** | Approved changes cannot be undone via Ctrl+Z. They must be reversed by creating a new adjustment that goes through the approval workflow. |

### 8.2 Adjustment History Log

Every adjustment is recorded in a persistent history log, regardless of whether it was undone or not.

**History log fields:**

| Field | Description |
|---|---|
| Timestamp | When the adjustment was made |
| User | Who made the adjustment |
| Type | Swap, shift change, reassignment, etc. |
| Before state | The assignment state before the change |
| After state | The assignment state after the change |
| Validation result | Constraints checked and results |
| Approval status | Pending, approved, rejected, not required |
| Undo status | Active, undone, re-done |
| Linked adjustments | Other adjustments made as part of the same logical change (e.g., cascade fixes) |

**History view:** Accessible from the Planning Workbench toolbar. Filterable by user, type, date range, and employee. Each history entry can be clicked to see the full before/after detail and to optionally "Revert to this state" (which creates new adjustments to reverse all changes made after the selected point).

---

## 9. Plan Publishing and Notification

### 9.1 Publishing Flow

Once adjustments are complete and approved, the plan is published to make it visible to employees and supervisors.

**Publishing steps:**

1. **Pre-publish validation:** System runs a final comprehensive constraint check across all assignments. Any new violations are flagged.
2. **Publish preview:** Shows summary of changes since last publication:
   - Number of employees with schedule changes.
   - Number of new assignments, cancelled assignments, modified assignments.
   - Coverage and cost summary.
3. **Publish confirmation:** User clicks "Publish." The plan state changes from "Draft" or "Under Review" to "Published."
4. **Employee notification:** All employees with changed schedules receive notifications via their configured channels.
5. **Supervisor notification:** Shift supervisors receive a summary of changes affecting their shift.

### 9.2 Employee Notification Content

Employee notifications include:

| Element | Description |
|---|---|
| Summary | "Your schedule for next week has been updated" |
| Changes | List of specific changes: "Monday: Picking 06:00-14:00 (was: Packing 06:00-14:00)" |
| Full schedule | Link to view the complete updated schedule in the employee self-service portal or mobile app |
| Acknowledge | Button/link to acknowledge receipt (optional, configurable per organization) |

**Notification timing rules:**

| Schedule Change Lead Time | Notification Channel | Additional Action |
|---|---|---|
| > 7 days before shift | Email, in-app | Standard notification |
| 3-7 days before shift | Email, in-app, push | Highlighted as "upcoming change" |
| 1-3 days before shift | Email, push, SMS (if enabled) | Marked urgent. Requires acknowledgment |
| < 24 hours before shift | Push, SMS, phone call (if critical) | Escalated to supervisor if not acknowledged within 2 hours |

---

## 10. Adjustment Type Reference Table

| Adjustment Type | Validation Rules | AI Assistance Available | Approval Required (Default) | Undo Available | Typical Use Case |
|---|---|---|---|---|---|
| Employee swap | Skill match, availability, working time, rest period, contract type | "Fill This Gap" ranks candidates | No (same cost), Yes (cost increase) | Yes (Ctrl+Z) | Cover for absence, balance workload |
| Shift time change | Min/max shift length, break rules, overlap, rest period | Impact analysis | No (< 2h change), Yes (> 2h) | Yes (Ctrl+Z) | Adjust to actual demand timing |
| Process reassignment | Skill/certification for target process | Skill match verification, cascade analysis | No | Yes (Ctrl+Z) | Balance process coverage |
| Add shift | All standard constraints for new shift | Auto-fill with best available employees | Yes | Yes (Ctrl+Z, before approval) | Respond to demand spike |
| Remove shift | None (always valid to remove) | Impact analysis on coverage | Yes | No (create new shift instead) | Respond to demand drop |
| Override capacity | None (manual override by definition) | Demand model comparison shown | No | Yes (Ctrl+Z) | Correct demand model inaccuracy |
| Lock assignments | Max lock percentage warning | None needed | No | Yes (unlock) | Protect confirmed arrangements |
| Bulk adjustments | All individual rules applied per change, atomic commit | Preview with aggregate impact | Yes (always) | Partial (individual items can be reverted) | Systematic schedule changes |
| Regulatory override | Requires authorized role, documented reason | Alternative suggestions to avoid override | Yes (HR + Site Manager) | No (new override to reverse) | Exceptional circumstances only |
