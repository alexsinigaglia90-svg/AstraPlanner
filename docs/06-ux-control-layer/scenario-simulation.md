# Scenario Simulation

## 1. Purpose

The Scenario Simulation system is AstraPlanner's what-if analysis engine. It allows workforce planners, site managers, and executives to explore alternative futures before committing to a plan.

Workforce planning is inherently uncertain. Demand forecasts are probabilistic. Employee availability is unpredictable. Regulatory environments shift. The organizations that perform best are not the ones with the most accurate single forecast -- they are the ones that have stress-tested their plans against a range of plausible scenarios and prepared contingencies.

AstraPlanner's Scenario Simulation answers questions like:

- "What if peak season volume is 20% higher than forecast?"
- "What if we lose 15% of our temporary staff in January?"
- "What if we open a third shift at Site 14?"
- "What if the new overtime regulations take effect next quarter?"
- "What if we complete the cross-training program and 40 employees gain forklift certification?"
- "What if we cut the agency budget by 25%?"

Each scenario produces a fully optimized workforce plan with complete KPIs, allowing decision-makers to compare outcomes and choose the strategy that best balances cost, coverage, risk, and compliance.

---

## 2. Scenario Creation Flow

### 2.1 Step 1: Fork the Baseline

Every scenario begins by forking an existing plan as the baseline. The baseline provides the starting point against which all changes are measured.

**Fork sources:**

| Source | Description | Use Case |
|---|---|---|
| Active published plan | The currently published workforce plan | "What if we change something about the current plan?" |
| Last optimized plan | The most recent optimization result (may not be published) | "What if we re-optimize with different assumptions?" |
| Another scenario | An existing scenario's output | "What if we take Scenario A and add another change?" |
| Clean baseline | Demand + workforce data without any optimization applied | "What if we start from scratch with modified inputs?" |

**Fork metadata captured:**

- Fork timestamp and source plan ID.
- User who created the fork.
- Purpose description (free text, required).
- Time horizon: the date range the scenario covers.
- Tags for categorization (e.g., "peak planning," "cost reduction," "compliance").

### 2.2 Step 2: Define Assumptions

The user modifies one or more input parameters to define the scenario. The interface organizes assumptions into five categories, each with specific input controls.

#### 2.2.1 Demand Assumptions

| Parameter | Input Control | Example |
|---|---|---|
| Volume scaling | Slider (-50% to +100%) by process or overall | "Increase inbound volume by 20% across all processes" |
| Volume override | Direct number entry by process and time period | "Set picking volume to 15,000 units/day for weeks 47-52" |
| Demand mix shift | Ratio adjuster across processes | "Shift 10% of volume from case pick to each pick" |
| New demand source | Process configurator | "Add returns processing at 500 units/day starting week 3" |
| Demand pattern change | Day-of-week profile editor | "Saturday volume increases from 60% to 85% of weekday average" |
| Seasonality override | Curve editor with historical overlay | "Override the Q4 peak curve with last year's actual pattern" |

#### 2.2.2 Workforce Assumptions

| Parameter | Input Control | Example |
|---|---|---|
| Headcount change | +/- by employment type (permanent, temp, agency) | "Add 25 temporary workers starting week 45" |
| Attrition rate | Percentage slider with timeline | "Model 15% attrition of temporary staff in January" |
| Skill availability | Skill matrix modifier | "Add 10 forklift-certified employees after training completion in week 4" |
| Absence rate | Percentage override | "Model 8% absence rate instead of the historical 5%" |
| Hiring timeline | Calendar with ramp curve | "Hire 30 employees: 10 in week 42, 10 in week 44, 10 in week 46. Productivity ramp: 60% week 1, 80% week 2, 100% week 3+" |
| Employee departure | Individual employee selector | "Model the loss of 3 specific senior operators" |

#### 2.2.3 Operational Assumptions

| Parameter | Input Control | Example |
|---|---|---|
| Shift pattern change | Shift editor (start, end, break, days) | "Add a twilight shift from 16:00 to 00:00, Monday through Friday" |
| Process automation | Productivity multiplier by process | "Picking productivity increases 15% due to new conveyor system" |
| Site opening/closing | Site configurator | "Open new site with 200 FTEs and 8 processes in week 5" |
| Process change | Process list editor | "Remove manual labeling process (automated in week 3)" |
| Capacity constraint | Workstation/equipment limit modifier | "Limit picking stations to 20 (down from 25) during facility renovation" |

#### 2.2.4 Regulatory Assumptions

| Parameter | Input Control | Example |
|---|---|---|
| Working time rule change | Rule editor | "Maximum weekly hours reduced from 48 to 45" |
| Overtime rule change | Threshold and rate editor | "Overtime threshold changes from 40h to 38h, rate from 1.5x to 2x" |
| Minimum staffing requirement | Headcount floor by process/time | "Fire safety regulation requires minimum 3 staff per shift in hazmat area" |
| Certification requirement | Skill rule editor | "New regulation requires all reach truck operators to hold Category B license" |
| Agency worker rules | Percentage cap or duration limit | "Agency workers capped at 25% of total headcount" |

#### 2.2.5 Cost Assumptions

| Parameter | Input Control | Example |
|---|---|---|
| Wage increase | Percentage by employment type or role | "5% wage increase for all permanent employees effective week 1" |
| Agency rate change | Rate per hour by skill category | "Agency rates increase from $28/h to $32/h" |
| Budget constraint | Total labor budget cap | "Maximum weekly labor budget of $450,000" |
| Overtime budget | Overtime hours or cost cap | "Overtime budget capped at 500 hours per week" |
| Training investment | Cost per employee and time allocation | "Cross-training program: $500/employee, 8 hours of training time per employee" |

### 2.3 Step 3: Run Optimization

Once assumptions are defined, the user clicks "Run Scenario." The system:

1. Creates a modified copy of all input data with the scenario assumptions applied.
2. Runs the full optimization engine against the modified inputs.
3. Calculates all KPIs for the scenario result.
4. Stores the results for comparison.

**Execution options:**

| Option | Description | Typical Runtime |
|---|---|---|
| Quick solve | Reduced iteration count, good for directional insights | 10-30 seconds |
| Standard solve | Full optimization with default parameters | 1-5 minutes |
| Deep solve | Extended iterations for maximum solution quality | 5-20 minutes |
| Monte Carlo | Probabilistic simulation with configurable iteration count | 5-60 minutes |

The user receives a notification when the scenario completes. During execution, a progress indicator shows: "Optimizing... 60% complete. Estimated time remaining: 1 minute 20 seconds."

### 2.4 Step 4: Compare Results

Upon completion, the scenario enters the comparison view where it can be evaluated against the baseline and other scenarios.

---

## 3. Scenario Types

### 3.1 Demand Scenarios

Demand scenarios modify the volume, mix, or pattern of work flowing into the operation. They answer the question: "How should our workforce plan change if demand is different from forecast?"

**Common demand scenarios:**

| Scenario | Assumptions Modified | Key Metrics to Watch |
|---|---|---|
| Peak surge | +20% volume for 4 weeks | Additional FTEs needed, overtime hours, agency cost |
| Demand shortfall | -15% volume sustained | Idle capacity, cost per unit, bench size |
| Channel mix shift | E-commerce +30%, wholesale -20% | Skill rebalancing (each pick vs case pick), training needs |
| New product launch | +5,000 units/day of a new SKU category | New skill requirements, equipment needs, process bottlenecks |
| Flash sale | +50% volume for 2 days with 48h notice | Flex capacity adequacy, agency availability, overtime cost |

### 3.2 Workforce Scenarios

Workforce scenarios modify the availability, composition, or capabilities of the labor pool.

**Common workforce scenarios:**

| Scenario | Assumptions Modified | Key Metrics to Watch |
|---|---|---|
| Hiring wave | +50 new employees with productivity ramp | Coverage improvement curve, training cost, mentor availability |
| Attrition spike | -15% of temps, -5% of permanent | Coverage gaps, skill concentration risk, replacement lead time |
| Cross-training program | 40 employees gain new skill certification | Skill coverage breadth, scheduling flexibility index, single-point-of-failure reduction |
| Key person loss | 3 specific senior operators depart | Process coverage for their specialties, knowledge transfer urgency |
| Union action | 30% of workforce unavailable for 1 week | Minimum service levels, agency surge capacity, legal compliance |

### 3.3 Operational Scenarios

Operational scenarios modify how the operation is structured -- shifts, processes, sites, equipment.

**Common operational scenarios:**

| Scenario | Assumptions Modified | Key Metrics to Watch |
|---|---|---|
| Third shift | Add night shift (22:00-06:00) | Throughput increase, night differential cost, employee willingness, regulatory compliance |
| Site opening | New 200-person site | Hiring timeline, training pipeline, cross-site transfer candidates |
| Site consolidation | Close Site B, transfer volume to Site A | Site A capacity sufficiency, employee retention/transfer, cost savings |
| Automation | Picking productivity +30% | FTE reduction, reskilling needs, ROI timeline |
| Extended hours | Shift from 8h to 10h shifts, 4 days/week | Employee preference, overtime impact, coverage pattern change |

### 3.4 Regulatory Scenarios

Regulatory scenarios model the impact of changes in labor laws, safety requirements, or contractual terms.

### 3.5 Cost Scenarios

Cost scenarios model the impact of financial changes on the workforce plan.

---

## 4. Comparison Dashboard

### 4.1 Layout

The comparison dashboard displays two or more scenarios side by side with the baseline always visible as the leftmost column.

```
+------------------------------------------------------------------+
|  Comparison: Baseline vs Scenario A vs Scenario B                 |
+------------------------------------------------------------------+
|               | Baseline      | Scenario A     | Scenario B      |
|               | (Current Plan)| (Peak +20%)    | (Peak +20% +    |
|               |               |                | 3rd Shift)      |
+---------------+---------------+----------------+-----------------+
| Total FTEs    | 312           | 367 (+17.6%)   | 345 (+10.6%)    |
| Coverage %    | 94.2%         | 86.1% (-8.1pp) | 95.8% (+1.6pp)  |
| Overtime hrs  | 420           | 890 (+111.9%)  | 310 (-26.2%)    |
| Agency FTEs   | 28            | 65 (+132.1%)   | 35 (+25.0%)     |
| Weekly cost   | $385,000      | $498,000(+29%) | $432,000(+12%)  |
| Risk score    | 24 (Low)      | 72 (High)      | 31 (Low)        |
| Skill gaps    | 3             | 14             | 5               |
+---------------+---------------+----------------+-----------------+
```

### 4.2 KPI Comparison Table

The full KPI comparison includes the following metrics, each with absolute values and deltas from baseline:

| KPI Category | Metrics |
|---|---|
| **Headcount** | Total FTEs, permanent, temporary, agency, net change |
| **Coverage** | Overall %, by process, by shift, minimum coverage point |
| **Cost** | Total weekly, regular hours, overtime, agency, cost per unit, cost vs budget |
| **Overtime** | Total hours, % of employees in overtime, average overtime per employee, max individual overtime |
| **Utilization** | Overall %, by department, idle hours, productive hours |
| **Risk** | Composite risk score (0-100), coverage risk, skill concentration risk, compliance risk, cost risk |
| **Compliance** | Constraint violations (count and severity), working time violations, certification gaps |
| **Flexibility** | Cross-training index, single-point-of-failure count, bench strength |

### 4.3 Difference Highlighting

The comparison dashboard uses visual indicators to highlight changes:

| Change Magnitude | Visual Treatment |
|---|---|
| Improvement > 5% | Green background, upward arrow |
| Improvement 1-5% | Light green background |
| No significant change (< 1%) | No highlight |
| Degradation 1-5% | Light red background |
| Degradation > 5% | Red background, downward arrow |
| New constraint violation | Red border, warning icon |
| Constraint violation resolved | Green border, check icon |

### 4.4 Sensitivity Analysis

The sensitivity analysis panel answers: "Which input variable has the biggest impact on outcomes?"

**How it works:**

1. The system takes the scenario's modified parameters.
2. For each parameter, it runs a mini-optimization with that parameter at +10% and -10% of its scenario value while holding all other parameters constant.
3. It measures the change in each key output KPI.
4. It presents a tornado chart showing which inputs have the largest effect.

**Example tornado chart output:**

```
Impact on Total Weekly Cost:
                    -$30K                    +$30K
                      |                        |
Demand volume    ████████████████████████████████████  +/- $28K
Agency rate      ██████████████████████                +/- $18K
Absence rate     █████████████████                     +/- $14K
Overtime rate    ████████████                          +/- $9K
Productivity     ███████████                           +/- $8K
Wage level       ██████                               +/- $5K
```

**Interpretation aid:** The AI Advisor provides a narrative summary: "Total weekly cost is most sensitive to demand volume. A 10% increase in demand drives approximately $28,000 in additional labor cost, primarily through overtime and agency usage. Consider securing agency capacity commitments at a fixed rate to reduce this sensitivity."

---

## 5. Monte Carlo Simulation

### 5.1 Purpose

While standard scenarios model deterministic what-if cases ("if demand is exactly 20% higher"), Monte Carlo simulation models probabilistic outcomes ("demand could be anywhere from 5% lower to 30% higher, with most likely outcome of 10% higher").

This is critical for risk quantification. Operations leaders do not just need to know "what happens if demand goes up" -- they need to know "what is the probability that we will need more than 350 FTEs, and what should we pre-commit to?"

### 5.2 Configuration

| Parameter | Description | Default |
|---|---|---|
| Iteration count | Number of simulation runs | 1,000 |
| Demand distribution | Probability distribution for demand volume | Normal, mean = forecast, SD = 10% of forecast |
| Absence distribution | Probability distribution for daily absence rate | Beta, alpha = 2, beta = 38 (mean = 5%) |
| Attrition distribution | Probability distribution for monthly attrition | Poisson, lambda = historical monthly attrition |
| Productivity variance | Probability distribution for worker productivity | Normal, mean = 100%, SD = 5% |
| Correlation settings | Correlations between random variables | Demand-absence: +0.15 (higher volume = more callouts) |

**Distribution configuration UI:**

Each random variable is configured with a visual distribution editor:

- User selects distribution type (Normal, Log-Normal, Beta, Poisson, Uniform, Triangular, Custom).
- Interactive chart shows the probability density function with draggable handles for parameters.
- Historical data overlay shows actual observed distribution for reference.
- Quick presets: "Conservative" (wider distribution), "Best estimate" (narrower), "Worst case" (skewed negative).

### 5.3 Execution

1. The system generates the configured number of random input combinations according to the specified distributions, using Latin Hypercube Sampling for efficient coverage of the parameter space.
2. For each combination, it runs a quick-solve optimization (reduced iterations for speed).
3. It collects the output KPIs from all iterations.
4. It computes percentile statistics across all iterations.

**Runtime estimation:**

| Iterations | Quick Solve per Iteration | Estimated Total Runtime | Parallelization |
|---|---|---|---|
| 100 | 5 seconds | 50 seconds | 10 parallel workers |
| 500 | 5 seconds | 4 minutes | 10 parallel workers |
| 1,000 | 5 seconds | 8 minutes | 10 parallel workers |
| 5,000 | 5 seconds | 40 minutes | 10 parallel workers |

Iterations are executed in parallel across available compute workers. The user sees a progress bar and can view partial results as iterations complete.

### 5.4 Results Presentation

**Probability distribution charts:**

For each key output KPI, the system displays a histogram with overlaid percentile markers:

```
FTEs Required (1,000 iterations)

  150 |        ████
  120 |      ████████
   90 |    ████████████
   60 |  ████████████████
   30 | ██████████████████████
    0 +-----|------|------|------
      300   325    350    375  400
            P10    P50    P90
```

**Percentile summary table:**

| Metric | P10 (Optimistic) | P25 | P50 (Most Likely) | P75 | P90 (Conservative) |
|---|---|---|---|---|---|
| Total FTEs needed | 318 | 330 | 347 | 362 | 378 |
| Weekly cost | $392K | $408K | $431K | $456K | $485K |
| Coverage % | 96.8% | 95.1% | 93.2% | 90.8% | 87.4% |
| Overtime hours | 280 | 380 | 510 | 670 | 840 |

**Risk quantification statements:**

The AI Advisor generates natural-language risk statements from the Monte Carlo results:

- "There is a 15% chance you will need more than 370 FTEs in week 47. Pre-committing agency contracts for 25 additional workers would reduce coverage risk from 28% to 6% at a cost of $12,000 in standby fees."
- "There is a 90% probability that weekly labor cost will fall between $392K and $485K. Budget at the P75 level ($456K) to achieve 75% confidence of staying within budget."
- "The single largest risk driver is demand volume variance. If demand forecasting accuracy can be improved from +/-15% to +/-10%, the P90 FTE requirement drops from 378 to 358."

### 5.5 Convergence Monitoring

The system monitors whether the Monte Carlo results have converged (i.e., running more iterations would not materially change the percentile estimates).

**Convergence criteria:**

- The P50 estimate for total FTEs has changed by less than 0.5% over the last 100 iterations.
- The P90 estimate for total cost has changed by less than 1% over the last 100 iterations.

If convergence is achieved before all iterations complete, the system notifies the user: "Results converged after 650 of 1,000 iterations. Additional iterations are unlikely to change results. [Stop Early] [Continue]."

---

## 6. Scenario Approval Workflow

### 6.1 Workflow States

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────────┐
│  Draft   │───>│ Proposed │───>│ Approved │───>│ Promoted to  │
│          │    │          │    │          │    │ Active Plan  │
└──────────┘    └──────────┘    └──────────┘    └──────────────┘
                     │
                     v
                ┌──────────┐
                │ Rejected │
                │(with note)│
                └──────────┘
```

| State | Description | Who Can Transition |
|---|---|---|
| **Draft** | Scenario is being created or modified. Not visible to approvers. | Creator |
| **Proposed** | Creator has submitted the scenario for review. Read-only for creator. | Creator submits |
| **Under Review** | Approver is actively evaluating the scenario. | Approver opens |
| **Approved** | Approver has accepted the scenario as a valid plan. | Approver approves |
| **Rejected** | Approver has rejected with feedback. Creator can revise and re-propose. | Approver rejects |
| **Promoted** | Approved scenario has been promoted to replace the active plan. | Approver or Admin promotes |
| **Archived** | Scenario is no longer active. Retained for historical reference. | Any authorized user |

### 6.2 Approval Roles

| Scenario Scope | Creator | Approver |
|---|---|---|
| Single site, current week | Site Manager | VP of Operations (or delegated) |
| Single site, future weeks | Workforce Planner | Site Manager |
| Multi-site | VP of Operations | CFO or delegated executive |
| Regulatory response | HR / Workforce Planner | VP of Operations + Legal review |
| Budget-impacting (>5% variance) | Any creator | VP of Operations + Finance |

### 6.3 Promotion Process

When a scenario is promoted to the active plan:

1. The current active plan is archived with its full history.
2. The scenario's optimized plan becomes the new active plan.
3. All affected employee schedules are updated.
4. Notifications are sent to all site managers whose sites are affected.
5. The change is logged in the audit trail with: who promoted, when, which scenario, and the business justification.

**Safety check:** Before promotion, the system displays a confirmation dialog showing:
- Number of employee schedules that will change.
- Number of sites affected.
- Coverage and cost differences from the current active plan.
- Any new constraint violations introduced.

---

## 7. Scenario History and Audit Trail

### 7.1 What Is Logged

Every action on a scenario is logged in an immutable audit trail:

| Action | Logged Data |
|---|---|
| Scenario created | Creator, timestamp, fork source, purpose description |
| Assumption added/modified | Parameter name, old value, new value, user, timestamp |
| Optimization run | Solve type, duration, result summary, solver parameters |
| Scenario proposed | User, timestamp, reviewer assignment |
| Scenario reviewed | Reviewer, timestamp, comments |
| Scenario approved/rejected | Approver, timestamp, decision rationale |
| Scenario promoted | Promoter, timestamp, affected sites, business justification |
| Scenario archived | User, timestamp, reason |

### 7.2 Scenario Comparison History

Users can compare any two historical scenarios to understand how planning assumptions and outcomes have evolved over time. This is valuable for post-season retrospectives: "How accurate were our peak-season scenarios compared to actual outcomes?"

**Retrospective analysis:**

After a scenario's time horizon has passed, AstraPlanner automatically calculates actual vs predicted outcomes:

| Metric | Scenario Prediction | Actual Outcome | Variance |
|---|---|---|---|
| Total FTEs used | 347 | 355 | +2.3% |
| Weekly cost | $431K | $448K | +3.9% |
| Coverage achieved | 93.2% | 91.8% | -1.4pp |

This feedback loop improves future scenario quality by identifying systematic biases in assumptions.

---

## 8. Performance Considerations

### 8.1 Pre-Computation

To reduce perceived latency, the system pre-computes common scenarios:

| Pre-Computed Scenario | Trigger | Refresh Frequency |
|---|---|---|
| Demand +10% / +20% / -10% / -20% | Always available | Re-computed when demand forecast updates |
| Absence rate +3pp / +5pp | Always available | Re-computed when plan changes |
| Agency removal | Always available | Re-computed when plan changes |

Pre-computed scenarios are available for instant comparison without waiting for optimization.

### 8.2 Caching Strategy

| Data | Cache Duration | Invalidation Trigger |
|---|---|---|
| Scenario results | Indefinite (immutable once computed) | Never (results are point-in-time) |
| Comparison calculations | 1 hour | Underlying scenario modified |
| Sensitivity analysis | 4 hours | Underlying scenario modified |
| Monte Carlo results | Indefinite | Never (stochastic results are point-in-time) |
| Pre-computed scenarios | Until re-computed | Source data change |

### 8.3 Background Execution

Scenarios that take more than 30 seconds to compute are automatically moved to background execution:

1. User clicks "Run Scenario."
2. System estimates runtime. If > 30 seconds, displays: "This scenario will take approximately 4 minutes. You'll be notified when it's ready. [Run in Background] [Wait]."
3. If "Run in Background," the user can continue working in other parts of AstraPlanner.
4. On completion, an in-app notification and optional push notification are delivered.
5. Results are available for the user to view at any time.

### 8.4 Resource Limits

| Limit | Value | Rationale |
|---|---|---|
| Max concurrent scenarios per user | 3 | Prevent single user from consuming all compute |
| Max concurrent scenarios per site | 10 | Prevent resource starvation across users |
| Max scenario time horizon | 52 weeks | Computational complexity grows non-linearly beyond this |
| Max Monte Carlo iterations | 10,000 | Diminishing returns beyond this for most distributions |
| Scenario result retention | 12 months | Storage management; archived scenarios retain summary only |
| Max assumptions per scenario | 50 | UX and interpretability; scenarios with too many changes are difficult to analyze |
