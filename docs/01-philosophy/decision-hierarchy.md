# AstraPlanner Decision Hierarchy

## Overview

Workforce planning decisions span a wide range of time horizons, from annual headcount budgets to minute-by-minute rebalancing of workers across zones. These decisions differ in scope, reversibility, data requirements, latency tolerance, and the appropriate balance between AI autonomy and human control.

AstraPlanner organizes decisions into four levels. Each level has distinct characteristics, and the system's architecture is designed to handle all four simultaneously. This document defines each level, its inputs and outputs, the division of responsibility between AI and humans, and the latency requirements that drive architectural choices.

---

## Decision Hierarchy Overview Table

| Attribute               | Level 0: Strategic           | Level 1: Tactical              | Level 2: Operational           | Level 3: Reactive               |
|-------------------------|------------------------------|--------------------------------|--------------------------------|----------------------------------|
| **Time Horizon**        | 6-18 months                  | 4-8 weeks                     | 1-7 days                      | 0-4 hours                       |
| **Planning Cycle**      | Quarterly / annually         | Monthly / bi-weekly            | Daily / per-shift              | Continuous / event-driven        |
| **Key Inputs**          | Business plan, demand forecast (annual), labor market data, budget | Monthly demand forecast, skill inventory, absence trends, contract terms | Daily demand, shift roster, confirmed availability, real-time WMS data | Live events: absences, demand spikes, equipment failures, weather |
| **AI Role**             | Scenario generation, sensitivity analysis, what-if modeling | Plan optimization, gap identification, cost projection | Assignment optimization, skill matching, constraint checking | Auto-rebalancing, escalation, contingency activation |
| **Human Role**          | Decision-making, budget approval, strategic direction | Plan review, override, approval of significant changes | Exception handling, override of individual assignments | Approval of high-impact reactive decisions |
| **Latency Requirement** | Hours to days                | Minutes to hours               | Seconds to minutes             | Sub-second to seconds            |
| **Reversibility**       | Low (commitments are binding)| Medium (plans can be adjusted) | High (assignments can change)  | Very high (temporary measures)   |
| **Scope**               | Enterprise / region          | Site / department              | Zone / team / shift            | Individual worker / task         |
| **Primary Output**      | Headcount budget, hiring plan, site capacity targets | Weekly workforce plan, shift patterns, agency booking forecast | Shift assignments, zone allocations, overtime approvals | Worker reassignment, agency call-out, escalation to manager |

---

## Level 0: Strategic Decisions

### Definition

Strategic decisions set the workforce planning boundaries for the organization. They determine how many people the organization will employ, what skills the workforce will have, how much will be spent on labor, and how capacity will be distributed across sites. These decisions are infrequent (quarterly or annually), high-impact, and difficult to reverse.

### Key Decisions

| Decision                          | Description                                                                 | Typical Frequency |
|-----------------------------------|-----------------------------------------------------------------------------|--------------------|
| Annual headcount budget           | Total FTEs by site, department, and role for the planning period            | Annual             |
| Hiring and attrition plan         | Planned hires, expected attrition, net headcount change by quarter          | Quarterly          |
| Site capacity planning            | Maximum throughput capacity by site, tied to physical infrastructure and headcount | Annual     |
| Skill development strategy        | Which skills to invest in training, cross-skilling targets, certification programs | Semi-annual  |
| Labor cost envelope               | Total labor budget including wages, overtime, agency, training              | Annual             |
| Automation vs. labor decisions    | Where to invest in automation vs. maintain labor-intensive processes        | As needed          |
| Shift pattern framework           | Allowable shift patterns (e.g., 4x10, 5x8, continental), overtime policies | Annual             |

### Inputs

- **Business plan**: Revenue targets, growth forecasts, new client onboarding timelines.
- **Demand forecast (long-range)**: Annualized demand by site, typically with +/- 20-30% uncertainty at this horizon.
- **Labor market data**: Wage benchmarks, unemployment rates, competitor activity in local labor markets.
- **Attrition models**: Predicted turnover by site, role, and tenure band.
- **Regulatory pipeline**: Upcoming changes to working time regulations, minimum wage, agency worker rules.

### AI Role at Level 0

The AI does not make strategic decisions. It enables them by:

- **Scenario modeling**: "If demand grows 15% and attrition remains at 18%, we need to hire 340 workers across 12 sites. Here is the cost curve and the timeline."
- **Sensitivity analysis**: "The plan is most sensitive to attrition rate. A 2-point increase in attrition (18% to 20%) requires $1.2M additional hiring spend."
- **What-if simulation**: "What if we cross-skill 30% of workers to handle both picking and packing? Net savings: $800K/year. Risk: 6-month transition period with 8% productivity dip."
- **Benchmark comparison**: "Site A's labor cost per unit is 22% above network average. Root causes: lower automation level, higher agency mix, above-market wages."

### Human Role at Level 0

Humans own all strategic decisions. The AI provides analysis and recommendations, but budget approval, hiring authorization, and capacity investments are human decisions. These decisions involve judgment calls that go beyond data: competitive strategy, organizational culture, risk appetite, investor expectations.

### Latency Requirement

Hours to days. Strategic analysis jobs may run for extended periods (complex Monte Carlo simulations across a 500-site network). Results are consumed in planning meetings, not in real-time dashboards.

### Concrete Logistics Example

A national parcel carrier plans its workforce for the next fiscal year. AstraPlanner ingests the commercial team's volume forecast (12% growth, concentrated in Q4), the HR team's attrition model (16% annualized, higher in first 90 days), and the operations team's productivity improvement targets (5% through automation in sorting).

The system generates three strategic scenarios:

**Scenario A: Conservative hiring**
- Hire 280 permanent workers across 45 sites
- Rely on 15% agency surge capacity for Q4 peak
- Total labor cost: $142M (+8% vs. current year)
- Risk: Agency availability is not guaranteed; 2 sites in tight labor markets may face shortages

**Scenario B: Aggressive hiring**
- Hire 420 permanent workers across 45 sites
- Reduce agency dependency to 5% surge capacity
- Total labor cost: $148M (+12% vs. current year)
- Risk: If demand growth is below forecast, overstaffing costs $3.2M in idle labor

**Scenario C: Hybrid (cross-skilling focus)**
- Hire 310 permanent workers
- Invest $1.8M in cross-skilling program (target: 40% of workforce multi-skilled)
- Agency surge capacity at 10%
- Total labor cost: $145M (+10% vs. current year)
- Risk: Cross-skilling takes 6 months to yield productivity gains; H1 may be tight

The leadership team selects Scenario C with a modification: accelerate cross-skilling to start immediately and increase H1 agency budget by $600K as a bridge. This decision is recorded in AstraPlanner and cascades down to Level 1 tactical planning as headcount targets, training schedules, and agency budgets by site.

---

## Level 1: Tactical Decisions

### Definition

Tactical decisions translate strategic boundaries into actionable workforce plans for the medium term (4-8 weeks). They determine shift patterns, weekly staffing levels, agency booking volumes, and training schedules at the site level. Tactical plans are the bridge between strategic intent and operational execution.

### Key Decisions

| Decision                          | Description                                                                 | Typical Frequency  |
|-----------------------------------|-----------------------------------------------------------------------------|---------------------|
| Weekly staffing plan              | FTEs by day, shift, and activity type for each site                         | Weekly              |
| Shift pattern assignment          | Which workers are on which shift pattern for the upcoming cycle             | Bi-weekly/monthly   |
| Agency labor booking              | Volume and timing of agency worker requests by site                         | Weekly              |
| Overtime budget allocation        | Authorized overtime hours by site and department                            | Weekly              |
| Cross-site transfer planning      | Planned worker movements between sites for the upcoming period              | Weekly              |
| Training schedule                 | Which workers attend which training sessions, and when                      | Monthly             |
| Absence cover strategy            | How predicted absences will be covered (overtime, agency, rebalancing)      | Weekly              |

### Inputs

- **Medium-range demand forecast**: 4-8 week demand by site, updated weekly, with scenario ranges (P50, P75, P90).
- **Confirmed workforce availability**: Leave approvals, known absences, return-from-leave dates.
- **Skill inventory**: Current skill matrix by site, including pending certifications and training completions.
- **Budget constraints**: Remaining overtime and agency budgets for the period.
- **Contractual constraints**: Minimum/maximum hours by worker, shift pattern restrictions, notice periods for changes.

### AI Role at Level 1

The AI takes a more active role at this level:

- **Plan generation**: The AI generates the complete weekly staffing plan, proposing shift patterns, headcounts by zone, and agency volumes.
- **Gap identification**: "Week 14 has a 12-FTE gap in outbound at Site C due to concurrent leave approvals. Recommended: 8 agency workers + 4 overtime shifts."
- **Cost optimization**: "Shifting 6 workers from the 5x8 pattern to 4x10 for the next 4 weeks saves $14K in overtime and improves coverage on high-demand days."
- **Skill gap alerts**: "3 forklift certifications expire in Week 15. Training must be scheduled by Week 13 to maintain coverage."

### Human Role at Level 1

Humans review and approve tactical plans. Their focus is on:

- Validating that the demand forecast underpinning the plan is reasonable.
- Approving significant changes to shift patterns (these affect workers' lives and require sensitivity).
- Authorizing agency spend above routine levels.
- Making judgment calls on competing priorities ("Site A and Site B both need extra workers, but we only have budget for one").

### Latency Requirement

Minutes to hours. Tactical plans are generated on-demand (a planner requests a plan for the next 4 weeks) and should be available within minutes for a single site or within an hour for a network-wide plan. Interactive what-if modifications ("what if I move 5 workers from days to nights?") should recalculate in under 30 seconds.

### Concrete Logistics Example

A 3PL warehouse has a new client go-live in Week 16. The demand forecast shows a ramp from 0 to 8,000 units/day over 4 weeks. AstraPlanner's tactical plan:

**Week 14 (soft launch)**:
- Demand: 2,000 units/day
- Required: 12 additional workers (8 pickers, 2 packers, 2 receivers)
- Source: Cross-skill 8 existing workers from low-demand zones + 4 agency workers
- Training: 12 workers complete new-client induction (product handling, system procedures) in Week 13

**Week 15 (ramp)**:
- Demand: 5,000 units/day
- Required: 28 additional workers
- Source: 8 cross-skilled (already trained) + 12 agency workers (booked Week 13 for Week 15 start) + 8 overtime shifts from existing workforce
- Risk: Agency quality unknown for new client processes; assign experienced workers as zone leads

**Week 16 (full volume)**:
- Demand: 8,000 units/day
- Required: 38 additional workers
- Source: 12 permanent hires (recruitment started Week 10) + 18 agency + 8 overtime
- Contingency: If permanent hires are delayed, increase agency to 26 (pre-authorized with agency partner)

The site planner reviews this plan, approves Weeks 14-15, and modifies Week 16 to add 2 more quality checkers based on client contract requirements the AI did not have visibility to (an override captured in the audit trail).

---

## Level 2: Operational Decisions

### Definition

Operational decisions are the day-to-day execution of the tactical plan. They determine which specific workers are assigned to which specific tasks on which specific shifts. This is where the plan meets reality: individual workers with individual skills, preferences, and constraints are matched to specific work requirements.

### Key Decisions

| Decision                          | Description                                                                 | Typical Frequency    |
|-----------------------------------|-----------------------------------------------------------------------------|----------------------|
| Shift assignment                  | Which worker is assigned to which shift                                     | Daily                |
| Zone/area allocation              | Which workers are assigned to which zones within a shift                    | Per shift            |
| Task assignment                   | Which specific tasks (pick waves, truck unloads) are assigned to which workers | Continuous within shift |
| Overtime confirmation             | Confirm or withdraw previously planned overtime based on actual demand      | Daily                |
| Agency worker task assignment     | Assign specific tasks to arriving agency workers based on their skill profiles | Per shift          |
| Productivity monitoring           | Identify underperforming zones and adjust staffing                         | Hourly               |

### Inputs

- **Confirmed demand**: Actual orders, confirmed truck arrivals, real-time WMS backlog data.
- **Confirmed availability**: Who actually showed up. Clocked-in workers vs. planned workers.
- **Real-time productivity**: Units processed per hour by zone, updated from WMS/LMS.
- **Current skill assignments**: Who is doing what right now.
- **Intra-day demand updates**: New orders arriving, trucks running late, priority changes.

### AI Role at Level 2

At the operational level, AI acts with significant autonomy within the boundaries set by Level 1 plans:

- **Auto-assignment**: The AI assigns workers to zones and tasks based on skill match, productivity history, rotation policy, and preference, without requiring human approval for routine assignments.
- **Intra-day rebalancing**: If Zone A is ahead of schedule and Zone B is behind, the AI can move workers between zones (provided they have the required skills) without human intervention.
- **Overtime management**: If demand exceeds the planned threshold, the AI can activate pre-approved overtime up to the authorized budget.
- **Productivity alerting**: "Zone 3 is running at 78% of standard. Root cause analysis: 3 of 8 assigned workers are at proficiency Level 2 (expected: Level 3+). Recommendation: swap Worker R (Level 4, currently in overstaffed Zone 1) with Worker T (Level 2, currently in Zone 3)."

### Human Role at Level 2

Humans handle exceptions and judgment calls:

- Overriding AI assignments when local context matters.
- Handling inter-personal issues (worker conflicts, accommodation requests).
- Approving non-routine decisions (sending workers home early due to demand drop, calling in additional agency at short notice).
- Validating AI-flagged anomalies ("demand in Zone 5 is 200% of forecast; is this real or a data error?").

### Latency Requirement

Seconds to minutes. A shift starts at 06:00. By 06:05, every worker must know their assignment. If a worker calls in sick at 05:45, the system must reassign their work and notify affected parties within minutes. Intra-day rebalancing decisions should compute in seconds.

### Concrete Logistics Example

Tuesday morning at a distribution center. Shift starts at 06:00.

**05:30 - Pre-shift planning**:
AstraPlanner reviews confirmed attendance (112 of 118 planned workers clocked in), updated demand (14,200 units to pick vs. 13,800 planned), and skill availability. The system generates zone assignments:

```
Zone Assignments - Shift 1, Tuesday 2026-03-19
  Receiving:    14 workers (demand: 8 trucks arriving 06:00-10:00)
  Picking Z1:   18 workers (demand: 4,200 units, high-value items)
  Picking Z2:   22 workers (demand: 5,800 units, standard)
  Picking Z3:   15 workers (demand: 4,200 units, bulky items)
  Packing:      24 workers (demand: matched to pick completion rate)
  Shipping:     12 workers (demand: 6 trailers departing 12:00-16:00)
  Returns:       7 workers (demand: 800 units)
  Unassigned:    0
  Gap:           6 workers (covered by 4 overtime + 2 agency arriving 07:00)
```

**09:15 - Intra-day rebalancing**:
Real-time data shows Picking Z2 is 15% ahead of schedule (experienced team) while Picking Z3 is 20% behind (2 workers struggling with bulky items). The AI automatically moves 2 workers from Z2 to Z3 (both have bulky-item picking skills), notifying the zone leads via the mobile app. No human approval required; this is within the operational autonomy boundary.

**11:30 - Escalation**:
A major client calls with a priority order: 1,200 additional units needed by end of shift. This exceeds the pre-approved demand variance threshold (+15%). The system flags this to the shift manager: "Priority order will require 3 additional pickers for 4 hours. Options: (a) extend 3 day-shift workers by 4 hours (overtime cost: $382), (b) reassign from Returns (will delay returns processing by ~2 hours), (c) request 3 agency workers for evening shift. Recommendation: Option (a), lowest cost and fastest deployment." The shift manager approves Option (a).

---

## Level 3: Reactive Decisions

### Definition

Reactive decisions respond to unplanned events in real time. These are not planned in advance; they are triggered by events that deviate from the operational plan. The system must respond within minutes or seconds to maintain operational continuity.

### Key Decisions

| Decision                          | Description                                                                 | Typical Trigger       |
|-----------------------------------|-----------------------------------------------------------------------------|-----------------------|
| Absence replacement               | Replace a worker who called in sick or no-showed                            | Absence notification  |
| Demand spike response             | Add capacity to handle unexpected demand surge                              | WMS threshold alert   |
| Equipment failure reallocation     | Reassign workers when equipment (conveyor, forklift) breaks down            | Equipment alert       |
| Weather-related adjustment         | Adjust plans for weather impact (delayed trucks, road closures, heat/cold)  | Weather data feed     |
| Safety incident response           | Reallocate workers around an incident zone, backfill affected positions     | Incident report       |
| Priority order handling            | Fast-track a high-priority order by reallocating resources                  | Customer/sales alert  |

### Inputs

- **Real-time event streams**: Absence notifications, WMS alerts, equipment status, weather feeds, customer escalations.
- **Current state**: Who is where, doing what, right now. Real-time position and assignment data.
- **Available reserves**: Workers on break, workers in low-priority tasks, agency workers on standby, workers available for overtime.
- **Constraint state**: How close are workers to working time limits, rest period requirements, certification boundaries.

### AI Role at Level 3

At the reactive level, AI must act with maximum speed and minimal friction:

- **Auto-replace on absence**: When a worker calls in sick, the system immediately identifies the best replacement from available pools (on-site unassigned, overtime-eligible, agency on standby), reassigns the work, and notifies affected parties. For routine absences in non-critical roles, this happens without human approval.
- **Demand spike buffering**: When real-time demand exceeds the 90th percentile threshold, the system activates the contingency plan defined at Level 1 (e.g., call in pre-arranged agency workers, activate overtime for willing workers).
- **Cascade management**: When a reactive decision creates a secondary gap (e.g., moving Worker X to cover an absence in Zone A creates a gap in Zone B), the system resolves the cascade automatically, considering the full constraint set.

### Human Role at Level 3

Humans are involved in reactive decisions only when:

- The AI's confidence is low ("I can cover 2 of the 3 absent workers but have no qualified replacement for the third; please advise").
- The decision has high impact (closing a zone, canceling a delivery route, sending workers home).
- The event is novel (a type of disruption the system has not seen before).
- Safety is involved (any decision with safety implications is escalated to a human).

### Latency Requirement

Sub-second to seconds. When a forklift breaks down in a narrow aisle and 4 workers are now idle, the system must reassign them within seconds. Agency call-outs should be triggered within minutes of the decision. The reactive layer is the most latency-sensitive part of the system and drives architectural choices around event processing, in-memory state management, and pre-computed contingency plans.

### Concrete Logistics Example

**07:42 - Event**: Three workers in the freezer zone (-25C) report that the heating in the break room adjacent to the freezer has failed. Regulatory policy limits continuous freezer work to 45 minutes without a warming break. Without the break room, workers cannot safely continue.

**07:42:05 - AI response** (automated):
1. Immediately flags the 6 workers currently in freezer rotation.
2. Calculates that freezer throughput will drop to 40% if workers must walk to the distant break room (adds 15 minutes per cycle).
3. Identifies that the ambient warehouse break room (3-minute walk) is available as an alternative.
4. Recalculates freezer rotation schedule with the alternative break room.
5. Notifies affected workers via mobile app: "Break room change: use ambient break room (Building B, Room 104) for warming breaks today."

**07:42:08 - AI escalation** (requires human):
1. Alerts the facilities manager about the heating failure.
2. Alerts the shift manager: "Freezer zone throughput reduced by approximately 15% due to extended break cycle. Expected shortfall: 340 units by end of shift. Options: (a) extend 2 freezer-trained workers by 2 hours (overtime: $170), (b) reduce outbound commitment for frozen goods by 340 units (notify transport by 10:00), (c) accept and recover tomorrow."
3. Shift manager selects Option (a) and authorizes the overtime.

**07:43 - Resolution**: Total response time from event to resolution: 61 seconds. Workers are notified, rotation is adjusted, throughput impact is quantified, and mitigation is approved.

---

## How Levels Feed Into Each Other

The four levels are not independent. They form a cascading hierarchy where higher-level decisions constrain lower-level decisions, and lower-level feedback refines higher-level models.

### Top-Down Flow (Constraints Cascade Down)

```
Level 0 (Strategic)
  │
  ├─► Headcount budget ──────────────► Level 1: "You have 120 FTEs to plan with"
  ├─► Skill development targets ──────► Level 1: "30% of workforce must be cross-skilled by Q3"
  ├─► Overtime policy ────────────────► Level 1: "Max 10% overtime as % of total hours"
  │
  Level 1 (Tactical)
    │
    ├─► Weekly staffing plan ─────────► Level 2: "Tuesday needs 112 workers in this configuration"
    ├─► Agency bookings ──────────────► Level 2: "8 agency workers confirmed for Wednesday"
    ├─► Approved overtime budget ──────► Level 2: "40 overtime hours authorized this week"
    │
    Level 2 (Operational)
      │
      ├─► Shift assignments ──────────► Level 3: "These 112 workers are assigned; this is the baseline"
      ├─► Zone allocations ───────────► Level 3: "Zone coverage is the starting point for rebalancing"
      ├─► Pre-computed contingencies ──► Level 3: "If Worker X is absent, replacement priority is [Y, Z, W]"
```

### Bottom-Up Flow (Feedback Refines Models)

```
Level 3 (Reactive)
  │
  ├─► Actual absence patterns ────────► Level 2: Adjust daily absence buffer
  ├─► Real-time productivity data ────► Level 2: Recalibrate zone staffing
  │
  Level 2 (Operational)
    │
    ├─► Actual vs. planned hours ─────► Level 1: Improve weekly plan accuracy
    ├─► Override frequency by zone ───► Level 1: Identify systematic planning gaps
    ├─► Skill performance data ───────► Level 1: Update skill proficiency scores
    │
    Level 1 (Tactical)
      │
      ├─► Forecast accuracy metrics ──► Level 0: Calibrate demand forecasting model
      ├─► Agency utilization trends ──► Level 0: Adjust hiring vs. agency strategy
      ├─► Overtime trend data ────────► Level 0: Revise overtime budget/policy
      ├─► Attrition actuals ──────────► Level 0: Update attrition model
```

---

## Decision Ownership Matrix

This matrix defines who (or what) owns each type of decision. "Own" means making the final call. "Support" means providing analysis, recommendations, or execution.

| Decision                              | AI                | Site Planner       | Site Manager       | Regional Director  | VP Operations      |
|---------------------------------------|--------------------|--------------------|--------------------|--------------------|---------------------|
| Annual headcount budget               | Support (scenarios)| Input              | Input              | Recommend          | Own                 |
| Hiring plan                           | Support (modeling) | Input              | Recommend          | Own                | Approve             |
| Shift pattern framework               | Support (analysis) | Recommend          | Own                | Approve            | Inform              |
| Weekly staffing plan                  | Generate           | Own                | Approve            | Inform             | -                   |
| Agency booking (routine)              | Generate           | Own                | Inform             | -                  | -                   |
| Agency booking (above threshold)      | Generate           | Recommend          | Own                | Inform             | -                   |
| Daily shift assignment (routine)      | Own                | Monitor            | -                  | -                  | -                   |
| Daily shift assignment (exception)    | Recommend          | Own                | Inform             | -                  | -                   |
| Intra-day zone rebalancing            | Own                | Monitor            | -                  | -                  | -                   |
| Absence replacement (routine)         | Own                | Monitor            | -                  | -                  | -                   |
| Overtime authorization (within budget)| Own                | Monitor            | Inform             | -                  | -                   |
| Overtime authorization (over budget)  | Recommend          | Recommend          | Own                | Inform             | -                   |
| Emergency response (safety)           | Support            | Support            | Own                | Inform             | Inform              |
| Cross-site transfer                   | Recommend          | Input (both sites) | Own (donor site)   | Approve            | -                   |
| Worker training schedule              | Recommend          | Own                | Approve            | Inform             | -                   |

---

## Latency Architecture Implications

Each decision level imposes different latency requirements on the system architecture.

| Level     | Latency Target   | Architecture Implication                                                      |
|-----------|------------------|-------------------------------------------------------------------------------|
| Level 0   | Hours to days     | Batch processing acceptable. Complex simulations run asynchronously. Results stored and presented in dashboards. |
| Level 1   | Minutes to hours  | Near-real-time computation. Plans generated on-demand. Incremental recalculation preferred over full recomputation. Caching of intermediate results. |
| Level 2   | Seconds to minutes| Real-time computation. Assignment engine must respond within seconds. Pre-computed contingency plans for common scenarios. In-memory skill and availability indexes. |
| Level 3   | Sub-second to seconds | Event-driven, stream-processing architecture. State held in memory. Pre-computed decision trees for common reactive scenarios. Fallback to simpler heuristics if optimization engine cannot respond in time. |

The reactive layer (Level 3) is the most architecturally demanding. It requires:

- **Event bus**: Real-time event ingestion from multiple sources (WMS, time-and-attendance, IoT sensors, weather APIs).
- **In-memory state**: Current assignments, worker locations, skill availability, constraint state -- all in memory for sub-second query.
- **Pre-computed contingencies**: For the most common reactive scenarios (single absence, demand spike up to 20%), the system pre-computes responses during Level 2 planning, so that Level 3 execution is a lookup, not a computation.
- **Graceful degradation**: If the optimization engine is overloaded, the reactive layer falls back to rule-based heuristics (e.g., "replace absent worker with the nearest available worker who has the same primary skill") rather than waiting for the optimal solution.

---

## Cross-Level Conflict Resolution

When decisions at different levels conflict, the resolution follows these rules:

1. **Higher levels constrain lower levels, but do not override them in real time.** If the strategic plan says "no more than 10% agency," but the reactive layer needs to call in agency workers to handle a safety-critical demand spike, the reactive decision takes priority. The violation is logged and surfaced to Level 0 for review.

2. **Lower levels cannot permanently modify higher-level decisions.** A reactive overtime authorization does not increase the weekly overtime budget. It is a temporary exception that is reviewed during the next Level 1 planning cycle.

3. **Conflicts are escalated, not suppressed.** If Level 2 assignments consistently deviate from the Level 1 plan (e.g., overtime is used every day despite being planned as occasional), the system flags this as a structural misalignment and recommends a Level 1 replan.

4. **Human overrides at any level are respected at all levels below.** If a site manager overrides the Level 1 plan to reserve 5 workers for a special project, Level 2 and Level 3 treat those 5 workers as unavailable. The override cascades down.
