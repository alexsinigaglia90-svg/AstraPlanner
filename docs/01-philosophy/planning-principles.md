# AstraPlanner Core Planning Principles

## Overview

These ten principles are not guidelines. They are invariants. Every planning algorithm, every data model, every UI flow in AstraPlanner must be consistent with all ten. When principles conflict (and they will), the resolution is determined by the decision hierarchy documented separately. These principles are numbered for reference, not for priority; they are co-equal.

---

## Principle 1: Demand Drives Everything

### Statement

No workforce plan may exist without an explicit demand signal as its root input. Capacity is never planned in a vacuum.

### Rationale

Workforce planning that begins with supply ("we have 200 workers, let's figure out what they should do") produces schedules, not plans. Schedules fill time slots. Plans match capability to need. The distinction matters because supply-first planning hides the most important question: do we have the right workforce for the work that needs to be done?

Demand-first planning forces the system (and the planner) to answer a sequence of questions in the correct order:

1. What work needs to be done? (Demand signal)
2. How much effort does that work require? (Workload calculation)
3. What skills does that effort require? (Skill decomposition)
4. Who can provide those skills? (Supply matching)
5. What gaps exist? (Gap analysis)
6. How do we close the gaps? (Mitigation planning)

Skipping to step 4 without answering steps 1-3 is how organizations end up with fully staffed warehouses that miss service levels.

### Failure Mode If Violated

**Symptom**: A site is "fully staffed" according to the plan, but throughput targets are consistently missed. Investigation reveals that workers are assigned to zones based on availability, not demand. High-demand zones are understaffed while low-demand zones have idle workers.

**Root cause**: The plan was built from supply, not demand. Shift patterns were filled first, then work was distributed to match the shifts. The plan looked complete but was structurally misaligned with actual work requirements.

### Concrete Logistics Example

A parcel distribution hub receives demand signals from three sources:

- **Inbound manifests**: Truck arrival schedules with estimated pallet/case counts, available 4-12 hours in advance.
- **Outbound order waves**: Customer orders allocated to the hub for fulfillment, available 2-24 hours in advance.
- **Returns forecast**: Expected returns volume based on historical patterns and recent shipment volumes.

AstraPlanner ingests all three demand signals, translates each into workload by activity type (unloading, sorting, picking, packing, loading), decomposes workload into skill-typed labor hours, and only then begins workforce assignment. If inbound volume doubles due to a delayed truck arriving with a backlog, the plan adjusts in real time, pulling workers from lower-priority activities or triggering agency labor requests.

---

## Principle 2: Workload Is the Translation Layer

### Statement

Demand must be translated into workload (hours of effort by skill type) before any workforce assignment occurs. Workload is the universal currency of planning.

### Rationale

Demand arrives in heterogeneous units: pallets to receive, orders to pick, parcels to sort, trucks to load. These units cannot be directly compared or aggregated. Workload translation converts them all into a common unit: hours of effort, qualified by skill type.

This translation is not trivial. It requires:

- **Engineered labor standards**: How long does it take to pick an order? The answer depends on pick method (discrete, batch, wave, zone), item characteristics (weight, fragility, storage location), equipment used, and worker proficiency.
- **Productivity adjustments**: New workers are slower than experienced workers. Night shifts have different productivity profiles than day shifts. Productivity degrades as shifts lengthen.
- **Non-productive time allowances**: Break time, toolbox talks, equipment checks, walking time between zones. These are not "waste"; they are predictable and must be planned.

### Failure Mode If Violated

**Symptom**: Two sites with identical headcounts have wildly different performance. Site A meets targets; Site B consistently falls short. Analysis reveals that Site B has a higher proportion of complex orders (multi-line, multi-zone picks) that take 3x longer per order than Site A's simple single-line orders. But the planning system treated "orders" as a uniform demand unit and allocated equal headcount.

**Root cause**: Demand was not translated through a workload model. "1,000 orders" at Site A is 400 labor hours. "1,000 orders" at Site B is 1,100 labor hours. Without workload translation, these look the same.

### Concrete Logistics Example

A cold-chain warehouse handles three product categories:

| Product Category | Units/Day | Pick Rate (units/hour) | Hours Required | Certification Required    |
|------------------|-----------|------------------------|----------------|---------------------------|
| Ambient          | 15,000    | 180                    | 83.3           | Basic warehouse           |
| Chilled (2-8C)   | 6,000     | 120                    | 50.0           | Cold chain handling       |
| Frozen (-25C)    | 2,000     | 80                     | 25.0           | Frozen goods + PPE trained|

Total demand: 23,000 units. Total workload: 158.3 hours. But these hours are not fungible. A basic warehouse worker cannot pick in the frozen zone. The workload translation layer exposes this, producing three separate labor demand curves that must be matched to three separate (but overlapping) skill pools.

---

## Principle 3: Skills Are First-Class Citizens

### Statement

Worker skills, proficiency levels, certifications, and recency of practice are modeled as primary entities in the data model, not as attributes of a job code or role.

### Rationale

Legacy WFM systems model workers as holders of a "job code" or "role": Picker, Packer, Forklift Operator. This coarse-grained model fails in logistics because:

- A single worker typically holds multiple skills at different proficiency levels.
- Proficiency degrades with time away from practice (a forklift operator who hasn't driven in 6 months is not as capable as one who drove yesterday).
- Certifications expire and must be tracked independently of proficiency.
- Training investments should be targeted at skills the organization needs, not roles.

AstraPlanner models skills as a graph structure:

```
Worker "Jane Doe"
  ├── Skill: Case Picking
  │     ├── Proficiency: Expert (Level 4/5)
  │     ├── Last practiced: 2 days ago
  │     └── Certification: Not required
  ├── Skill: Reach Truck Operation
  │     ├── Proficiency: Competent (Level 3/5)
  │     ├── Last practiced: 14 days ago
  │     └── Certification: Valid until 2026-09-15
  ├── Skill: Hazmat Handling
  │     ├── Proficiency: Novice (Level 1/5)
  │     ├── Last practiced: 45 days ago
  │     └── Certification: Valid until 2026-06-01
  └── Skill: Returns Processing
        ├── Proficiency: Advanced (Level 4/5)
        ├── Last practiced: 1 day ago
        └── Certification: Not required
```

### Failure Mode If Violated

**Symptom**: The system assigns workers to activities they are technically qualified for but practically unable to perform at required productivity levels. Forklift operators who are "certified" but have not driven in months cause accidents or throughput drops. Workers assigned to picking in unfamiliar zones take 2-3x longer than standards.

**Root cause**: The skill model only tracked binary qualification (has skill / does not have skill) without proficiency or recency. The plan was technically valid but operationally ineffective.

### Concrete Logistics Example

A 3PL warehouse onboards a new client contract requiring food-grade handling. The planner needs to identify workers who can be deployed:

- **Immediately deployable**: Workers with active food safety certification AND proficiency level 3+ AND practiced within 30 days. Result: 23 workers.
- **Deployable after refresher**: Workers with active certification AND proficiency level 2+ AND practiced within 90 days. Requires 4-hour refresher training. Result: 41 additional workers.
- **Deployable after training**: Workers with no certification. Requires 16-hour training program. Result: remaining workforce.

Without skill-as-first-class-citizen modeling, the planner sees only: "87 workers have 'Food Handling' in their job code." They cannot distinguish between immediately deployable and needs-training-first, leading to either undertrained workers on the floor or a panicked last-minute training scramble.

---

## Principle 4: Plans Are Probabilistic, Not Deterministic

### Statement

Every plan produced by AstraPlanner carries a confidence score, a risk assessment, and a sensitivity analysis. There is no such thing as "the plan." There are plan scenarios with probabilities.

### Rationale

Deterministic planning assumes that inputs are known with certainty: demand will be exactly 15,000 units, productivity will be exactly 150 units/hour, absence will be exactly 5%. In logistics, none of these assumptions hold. Demand forecasts have error bars. Productivity varies by worker, time of day, and product mix. Absence rates spike unpredictably.

A deterministic plan optimized for the expected case provides no information about what happens when the expected case does not materialize. A probabilistic plan says: "Under the most likely scenario (60% probability), 45 workers are sufficient. Under the high-demand scenario (25% probability), 52 workers are needed. Under the extreme scenario (5% probability), 60 workers are needed. The remaining 10% of scenarios fall between these bounds."

This gives planners actionable information. They can decide how much risk to accept. Do they staff for the 60th percentile (cheaper but risky) or the 85th percentile (more expensive but safer)?

### Failure Mode If Violated

**Symptom**: Plans consistently fail on "unusual" days, but every day is unusual in some way. Mondays have higher absence. Fridays have rush orders. Tuesdays after holidays have backlog surges. The plan is only correct on the mythical "average" day, which rarely occurs.

**Root cause**: The plan was built for the mean of all input distributions. Since the mean of a distribution is just one point, the plan is exactly right approximately never. It is approximately right most of the time but exactly right never, and catastrophically wrong on the tails.

### Concrete Logistics Example

A transport depot plans driver allocations for next-day delivery routes:

| Scenario          | Probability | Routes Required | Drivers Needed | Cost      |
|-------------------|-------------|-----------------|----------------|-----------|
| Low demand        | 15%         | 28              | 30             | $12,600   |
| Expected demand   | 55%         | 35              | 38             | $15,960   |
| High demand       | 20%         | 42              | 45             | $18,900   |
| Surge (promotion) | 10%         | 55              | 58             | $24,360   |

The planner chooses to staff 42 drivers (covers 90% of scenarios). The remaining 10% is mitigated by pre-arranged agency driver agreements with a 4-hour call-out window. This decision is explicit, documented, and costed. Under a deterministic model, the planner would staff 38 drivers and be surprised by the surge 30% of the time.

---

## Principle 5: Every Plan Has a Cost and a Risk Score

### Statement

Plans are not evaluated solely on feasibility (can it work?) but on two additional dimensions: cost (what does it cost?) and risk (what is the probability and impact of failure?).

### Rationale

A feasible plan that costs 40% more than necessary is a bad plan. A cheap plan that has a 30% chance of catastrophic failure is a bad plan. Planning is a multi-objective optimization problem, and cost and risk are two of the objectives.

Cost in workforce planning includes:

- **Direct labor cost**: Wages, overtime premiums, shift differentials.
- **Agency/temporary labor cost**: Typically 1.5-2.5x the cost of permanent staff for equivalent hours.
- **Training cost**: Hours spent training instead of producing.
- **Disruption cost**: Impact of last-minute schedule changes on worker satisfaction and retention.
- **Opportunity cost**: What else could these workers be doing?

Risk in workforce planning includes:

- **Service level risk**: Probability that throughput targets will not be met.
- **Compliance risk**: Probability that working time regulations will be violated.
- **Safety risk**: Probability of incidents due to fatigue, skill mismatch, or overcrowding.
- **Retention risk**: Impact of the plan on worker satisfaction and turnover.

### Failure Mode If Violated

**Symptom**: The organization consistently overspends on labor during peaks because the planning system only optimized for feasibility ("can we fill all shifts?") without considering cost. Overtime is authorized reactively because the plan did not pre-position capacity. Agency spend is 3x budget because agency requests are made with 2-hour notice (premium rates) instead of 48-hour notice (standard rates).

**Root cause**: The planning system produced a binary output (feasible/infeasible) without scoring cost or risk. The planner had no visibility into the cost implications of plan choices until after the fact.

### Concrete Logistics Example

AstraPlanner presents three plan options for a peak week:

| Plan Option | Total Cost | Service Level Risk | Overtime Hours | Agency Workers | Risk Score |
|-------------|------------|--------------------|----------------|----------------|------------|
| Plan A      | $187,000   | 2% (Low)           | 340            | 25             | 12/100     |
| Plan B      | $162,000   | 8% (Medium)        | 180            | 12             | 34/100     |
| Plan C      | $141,000   | 22% (High)         | 40             | 0              | 71/100     |

The planner can see the trade-offs explicitly. Plan C is cheapest but has a 22% chance of missing service levels. Plan A is safest but costs $46K more. Plan B is the compromise. The planner selects Plan B and configures the system to auto-escalate to Plan A if demand exceeds the 85th percentile threshold by Wednesday.

---

## Principle 6: Human Override Is Sacred

### Statement

Any AI-generated recommendation can be overridden by an authorized human at any time, without justification. The system records the override, learns from it, but never prevents it.

### Rationale

This principle exists for three reasons:

1. **The AI does not have complete information.** A planner may know that a particular worker is unreliable on Fridays, that a specific zone has a leaking roof making it slower in rain, or that a client visit tomorrow requires extra workers in the shipping area for appearance. These contextual factors are not in the data.

2. **Trust requires an escape hatch.** If the system cannot be overridden, users will not trust it. If users do not trust it, they will work around it, creating shadow plans in spreadsheets. The override mechanism is not a concession to human stubbornness; it is an architectural requirement for adoption.

3. **Overrides are training data.** Every override tells the system something it did not know. If a planner consistently overrides the AI's recommendation for a particular zone or shift, that pattern reveals a gap in the model. The system should learn from overrides, not just tolerate them.

### Failure Mode If Violated

**Symptom**: Planners lose confidence in the system because they cannot correct obviously wrong recommendations. They begin maintaining parallel plans in spreadsheets. The system's plans are published but ignored. Over time, the system becomes shelfware.

**Root cause**: The system treated its recommendations as authoritative rather than advisory. Override mechanisms were either absent, buried in complex workflows, or generated warning messages that made planners feel punished for overriding.

### Concrete Logistics Example

The AI recommends assigning Worker M to the night shift in the returns zone based on skill match and availability. The site manager overrides this, assigning Worker M to the day shift in outbound instead. The system records:

```
Override Record:
  Original: Worker M → Night Shift, Returns Zone
  Override: Worker M → Day Shift, Outbound
  Override by: Site Manager (J. Torres)
  Reason (optional): "Worker M requested day shifts this week for childcare. Returns zone is overstaffed on nights."
  Timestamp: 2026-03-18T14:22:00Z
```

The system does not block this. It recalculates the plan with Worker M's new assignment, identifies any resulting gap in the night returns zone, and suggests a replacement. Over time, if the system sees a pattern (Worker M is always overridden away from night shifts), it adjusts its future recommendations accordingly.

---

## Principle 7: Multi-Site Coherence

### Statement

Workforce planning across multiple sites must be coherent: decisions at one site must account for their impact on other sites, and workforce is treated as a shared resource pool within defined constraints.

### Rationale

Enterprise logistics networks are interconnected. A decision to pull 10 workers from Site B to cover a peak at Site A has consequences for Site B. If Site B then misses its own targets, pulling from Site C creates a cascade. Planning each site independently and then trying to reconcile at the network level is computationally simpler but produces inferior outcomes.

Multi-site coherence does not mean centralized planning. It means that site-level plans are generated within a network-level framework that ensures:

- **Resource balance**: Workers transferred to one site are subtracted from the donor site's capacity.
- **Cost optimization**: Cross-site transfers incur travel costs and productivity losses (unfamiliar environment). These costs are factored into the optimization.
- **Constraint propagation**: If a regulatory constraint limits working hours at Site A, and a worker splits time between Site A and Site B, the constraint applies to their combined hours.
- **Fair allocation**: Scarce skills (e.g., certified hazmat handlers) are allocated across sites based on need and risk, not first-come-first-served.

### Failure Mode If Violated

**Symptom**: Site managers "hoard" workers, refusing to share with neighboring sites even during low-demand periods. Conversely, during peaks, multiple sites compete for the same pool of agency workers, driving up costs. Network-level labor budgets are exceeded because each site optimizes locally without considering network impact.

**Root cause**: Each site plans independently. There is no mechanism to allocate shared resources optimally across the network. Site managers act rationally given their local incentives but produce globally suboptimal outcomes.

### Concrete Logistics Example

A regional logistics network has three warehouses within 30 miles of each other:

| Site       | Base Headcount | This Week's Demand | Required FTEs | Surplus/Deficit |
|------------|----------------|---------------------|---------------|-----------------|
| Warehouse A| 120            | High (peak event)   | 145           | -25             |
| Warehouse B| 85             | Normal              | 78            | +7              |
| Warehouse C| 95             | Low (client pause)  | 62            | +33             |

Without multi-site coherence, Warehouse A requests 25 agency workers at premium rates ($28/hr). With multi-site coherence, AstraPlanner identifies that 25 workers are available across B and C, arranges temporary transfers (travel cost: $15/worker/day), and meets Warehouse A's demand at a fraction of the agency cost. The system also ensures that B and C retain sufficient coverage for their own operations.

---

## Principle 8: Temporal Awareness

### Statement

Plans degrade over time as assumptions diverge from reality. Every plan has a freshness score that decays, and the system automatically triggers replanning when freshness drops below a threshold.

### Rationale

A plan created on Monday morning is based on Monday morning's information. By Wednesday, several things have changed:

- Demand forecasts have been updated (possibly significantly).
- Workers have called in sick or returned from absence.
- Actual productivity data from Monday and Tuesday has revealed that standards were optimistic or pessimistic.
- A new order from a major client has arrived.
- Weather forecasts have changed, affecting delivery routes and warehouse conditions.

A plan that does not account for this information decay will systematically underperform. The rate of decay depends on the decision level:

| Decision Level | Plan Freshness Half-Life | Trigger for Replan              |
|----------------|--------------------------|----------------------------------|
| Strategic      | 30 days                  | Budget revision, demand reforecast|
| Tactical       | 7 days                   | Weekly demand update, absence trend|
| Operational    | 8-12 hours               | Shift start, demand update, absence|
| Reactive       | 30 minutes               | Any material change               |

### Failure Mode If Violated

**Symptom**: The plan published on Monday is still being executed on Friday despite Monday's assumptions being invalid. Workers are assigned to zones that no longer need them. Overtime was approved based on a demand forecast that was revised downward on Tuesday but never propagated to the workforce plan.

**Root cause**: The plan was treated as a static artifact. No mechanism existed to detect that its underlying assumptions had changed or to trigger replanning.

### Concrete Logistics Example

AstraPlanner assigns a freshness score to each plan component:

```
Plan: Week 12, Warehouse Delta
  Component: Inbound staffing
    Based on: Carrier delivery schedule v3 (updated 2026-03-17 06:00)
    Freshness: 92% (schedule updated 4 hours ago)
    Next scheduled refresh: 2026-03-17 14:00

  Component: Outbound staffing
    Based on: Order forecast v7 (updated 2026-03-16 22:00)
    Freshness: 68% (forecast is 12 hours old, high-volatility period)
    Action: Auto-replan triggered. New forecast v8 received at 08:30.

  Component: Returns staffing
    Based on: Returns model (seasonal, updated weekly)
    Freshness: 85% (model updated 3 days ago, low volatility)
    Next scheduled refresh: 2026-03-20 (weekly cycle)
```

The outbound staffing component's freshness dropped below the 70% threshold, automatically triggering a replan using the updated forecast. The planner is notified of the change and can review the updated plan.

---

## Principle 9: Progressive Disclosure

### Statement

The system presents the simplest useful view by default and reveals complexity only when the user requests it or when the situation demands it.

### Rationale

Workforce planning systems serve users with vastly different needs and expertise levels:

- **A team leader** needs to know: "Who is on my team today, and what are they doing?"
- **A site planner** needs to know: "Is my site staffed correctly for this week? Where are the gaps?"
- **A regional planner** needs to know: "How are my 15 sites performing against plan? Where do I need to intervene?"
- **An operations director** needs to know: "Are we going to hit our service levels this month? What is the labor cost trend?"

Showing the operations director the individual worker assignment screen is noise. Showing the team leader the network-level optimization dashboard is irrelevant. But both of these users exist in the same system.

Progressive disclosure is the design principle that resolves this. The default view is simple, summarized, and action-oriented. Complexity is available but not imposed.

### Failure Mode If Violated

**Symptom**: The system is powerful but unusable. Training takes weeks. Adoption is low among operational users. Only "power users" (typically central planning teams) can navigate the system. Site-level planners revert to spreadsheets because the system is "too complicated."

**Root cause**: The system was designed for the most complex use case and imposed that complexity on all users. There was no layered information architecture.

### Concrete Logistics Example

A site planner opens AstraPlanner on Monday morning. The default view shows:

**Level 1 (Default)**:
```
Week 12 Plan Status: ON TRACK
  Staffing coverage: 96% (above 90% target)
  Attention needed: 2 gaps (Wednesday PM, Friday AM)
  [View details]
```

The planner clicks "View details" for Wednesday PM:

**Level 2 (Detail)**:
```
Wednesday PM Gap: Picking Zone 2
  Required: 8 pickers (based on 4,200-unit forecast)
  Assigned: 6 pickers
  Gap: 2 pickers
  Options:
    (a) Assign from overstaffed zones (Zone 4 has +3): [Apply]
    (b) Request overtime from morning shift: [Request]
    (c) Request agency workers: [Request]
    (d) Accept risk (forecast may decrease): [Accept]
  [Show workload calculation] [Show skill requirements] [Show cost comparison]
```

The planner clicks "Show cost comparison":

**Level 3 (Analysis)**:
```
Cost Comparison for Gap Resolution:
  Option (a) Internal transfer:  $0 incremental (workers already on shift)
  Option (b) Overtime:           $340 (2 workers x 4 hours x $42.50 OT rate)
  Option (c) Agency:             $480 (2 workers x 4 hours x $60 agency rate)
  Option (d) Accept risk:        Expected cost of service miss: $1,200 (15% probability x $8,000 impact)
```

Each level adds detail without requiring the user to process information they do not need.

---

## Principle 10: Auditability

### Statement

Every planning decision must be traceable to its inputs, assumptions, and the identity of the decision-maker (human or AI). The system maintains a complete, immutable audit trail.

### Rationale

Auditability is required for three reasons:

1. **Regulatory compliance**: Working time regulations, equal treatment laws, and labor agreements require organizations to demonstrate that planning decisions are lawful and non-discriminatory. "The AI decided" is not an acceptable audit response.

2. **Continuous improvement**: Understanding why a plan failed requires understanding why it was created the way it was. If the inputs were wrong, the model needs better data. If the model was wrong, the algorithm needs adjustment. If the human override was wrong, the override process needs review. Without auditability, root cause analysis is impossible.

3. **Accountability**: In organizations with distributed planning authority, auditability establishes who made which decisions. This is not about blame; it is about learning. When a site consistently overspends on overtime, the audit trail reveals whether the cause is inaccurate demand forecasts, excessive human overrides, or a misconfigured planning parameter.

### Failure Mode If Violated

**Symptom**: A discrimination claim is filed because a worker was consistently assigned to undesirable shifts. The organization cannot demonstrate that the assignment was based on objective criteria (skill match, rotation policy, availability) because the planning system did not record why each assignment was made. Legal exposure increases dramatically.

**Root cause**: The system recorded the outcome (who was assigned where) but not the rationale (why). The decision process was a black box.

### Concrete Logistics Example

AstraPlanner's audit trail for a single assignment decision:

```
Decision Record: DR-2026-03-18-00847
  Type: Worker Assignment
  Worker: ID 4472 (K. Patel)
  Assignment: Picking Zone 3, Shift 2 (14:00-22:00), 2026-03-19

  Decision made by: AI (Planning Engine v4.2.1)
  Decision timestamp: 2026-03-18T10:15:22Z

  Input factors:
    Demand: Zone 3 requires 10 pickers, Shift 2 (source: Forecast v8, confidence 78%)
    Worker availability: K. Patel available Shift 2 (no leave, no conflict)
    Skill match: K. Patel has Picking proficiency 4/5, Zone 3 experience 12 shifts in last 30 days
    Working time: K. Patel at 32 hours this week, under 48-hour limit
    Preference: K. Patel has no shift preference recorded
    Rotation: K. Patel last assigned Zone 3 on 2026-03-14 (within rotation policy)

  Alternative candidates considered: 14
  Ranking: K. Patel ranked #2 of 14 (ranked below J. Liu, who was assigned to higher-priority Zone 1)

  Constraints satisfied: Working time [PASS], Certification [PASS], Rest period [PASS], Rotation [PASS]

  Override: None
```

This record is immutable, queryable, and available for compliance audits, performance reviews, and model improvement analysis.

---

## Principle Interaction Matrix

Principles do not exist in isolation. They interact, and sometimes tension arises between them. The following matrix identifies key interactions:

| Principle Pair        | Interaction Type | Resolution                                                              |
|-----------------------|------------------|-------------------------------------------------------------------------|
| 1 (Demand) + 3 (Skills) | Reinforcing   | Demand decomposition requires skill taxonomy; they depend on each other |
| 4 (Probabilistic) + 5 (Cost/Risk) | Reinforcing | Probabilistic plans enable meaningful cost/risk scoring            |
| 6 (Override) + 10 (Auditability) | Reinforcing | Overrides are valuable audit data; auditability makes overrides safe |
| 6 (Override) + 4 (Probabilistic) | Tension    | Override of a high-confidence plan should carry an explicit risk acknowledgment |
| 7 (Multi-site) + 9 (Progressive) | Tension    | Multi-site coherence adds complexity; progressive disclosure must manage it |
| 8 (Temporal) + 6 (Override) | Tension        | Auto-replanning may undo a human override; system must flag and re-request approval |
| 1 (Demand) + 8 (Temporal) | Reinforcing    | Demand signals decay; temporal awareness ensures plans update when demand changes |
| 3 (Skills) + 7 (Multi-site) | Reinforcing  | Skill sharing across sites enables network-level optimization               |
| 5 (Cost/Risk) + 7 (Multi-site) | Reinforcing | Cross-site transfers have costs that must be scored at network level        |
| 9 (Progressive) + 10 (Auditability) | Tension | Full auditability generates data volume; progressive disclosure must summarize it |
