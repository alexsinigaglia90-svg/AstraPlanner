# Optimization Strategy

## 1. Overview

AstraPlanner's optimization engine converts raw demand signals into fully assigned workforce plans through a four-stage pipeline. Each stage produces a deterministic, auditable intermediate output that feeds the next stage. The pipeline is designed to run at three speeds: interactive (sub-5-second for single-site adjustments), background (under 60 seconds for full-site re-optimization), and batch (up to 30 minutes for enterprise-wide overnight planning across thousands of sites).

The core principle is **demand-driven staffing**: every headcount decision traces back to a quantified demand input, a productivity standard, and a measurable business objective. There are no magic numbers and no hidden heuristics — every coefficient is configurable, auditable, and versioned.

---

## 2. Core Pipeline

```
Demand Signals ──► Demand Normalization ──► Workload Computation ──► FTE Calculation ──► Assignment Optimization
     (raw)           (common units)          (labor hours)            (headcount)          (named assignments)
```

| Stage | Input | Output | Typical Latency |
|-------|-------|--------|-----------------|
| Demand Normalization | Orders, units, pallets, lines, weight | Normalized demand vector per process per time slot | < 100 ms |
| Workload Computation | Normalized demand + productivity standards | Required labor hours per process per time slot | < 200 ms |
| FTE Calculation | Labor hours + workforce parameters | FTE requirement per process per time slot | < 100 ms |
| Assignment Optimization | FTE requirements + employee pool + constraints | Named employee-to-slot assignments | 1 s – 30 min |

---

## 3. Step 1: Demand Normalization

### 3.1 Problem Statement

Logistics demand arrives in heterogeneous units that cannot be directly compared or aggregated. A single distribution center may receive demand expressed as:

- **Order lines** (e-commerce picking)
- **Full pallets** (bulk outbound)
- **Cases** (retail replenishment)
- **Weight in kg** (freight consolidation)
- **Cubic meters** (container loading)
- **Shipment count** (dispatch/transport)

These must be converted into a **common workload unit (CWU)** before any planning can occur.

### 3.2 Conversion Model

Each demand type has a site-specific and process-specific conversion factor maintained in the `demand_conversion_factors` configuration table.

| Demand Type | Unit | CWU Conversion Factor (example) | Rationale |
|-------------|------|----------------------------------|-----------|
| Order lines | 1 line | 1.0 CWU | Baseline unit for pick processes |
| Full pallets | 1 pallet | 12.0 CWU | Equivalent effort to 12 order lines in receiving |
| Cases | 1 case | 2.5 CWU | Based on case pick time vs. each pick time |
| Weight (kg) | 100 kg | 3.0 CWU | Heavy-goods handling factor |
| Cubic volume | 1 m³ | 8.0 CWU | Container load/unload effort |
| Shipments | 1 shipment | 5.0 CWU | Dispatch processing effort |

**Conversion formula:**

```
normalized_demand[process][timeslot] = SUM(
    raw_demand[type][process][timeslot] * conversion_factor[type][process][site]
)
```

### 3.3 Time Slot Granularity

Demand is bucketed into planning time slots. The default granularity is **1 hour**, but the system supports 15-minute, 30-minute, 1-hour, 2-hour, and shift-level granularity. Finer granularity yields more precise staffing but increases solver complexity.

### 3.4 Demand Smoothing

Raw demand often contains spikes that do not reflect actual work arrival patterns (e.g., a batch of 10,000 orders released at midnight that will actually be processed over 8 hours). AstraPlanner applies configurable smoothing:

- **None**: use raw demand as-is (for real-time WMS-driven planning)
- **Moving average**: 3-slot moving average to dampen noise
- **Spread-to-capacity**: distribute demand across slots proportional to available capacity
- **Historical profile**: apply a known intra-day distribution curve (e.g., 60% of orders arrive by 10 AM)

---

## 4. Step 2: Workload Computation

### 4.1 Core Formula

```
required_hours[process][timeslot] = normalized_demand[process][timeslot] / productivity_rate[process]
```

Where `productivity_rate` is expressed in **CWU per hour per worker** at Level 4 (baseline) proficiency.

### 4.2 Productivity Standards Table (Example DC)

| Process | Productivity Rate (CWU/hr) | Unit Basis | Source |
|---------|---------------------------|------------|--------|
| Receiving (pallet) | 18.0 | Pallets/hr | Engineered standard |
| Put-away | 15.0 | Pallets/hr | Engineered standard |
| Picking (each) | 95.0 | Lines/hr | Time study |
| Picking (case) | 45.0 | Cases/hr | Time study |
| Packing | 30.0 | Orders/hr | Time study |
| Shipping (parcel) | 55.0 | Parcels/hr | Time study |
| Shipping (pallet) | 22.0 | Pallets/hr | Time study |
| Returns processing | 20.0 | Items/hr | Historical average |
| Quality audit | 40.0 | Items/hr | Sample-based |
| Value-added services | 12.0 | Units/hr | Task-dependent |

### 4.3 Skill Proficiency Adjustment

Not all workers perform at the baseline rate. Proficiency levels apply a multiplier to the effective productivity rate, which inversely affects the required hours for that worker.

| Proficiency Level | Label | Productivity Multiplier | Effective Rate (if baseline = 95 lines/hr) | Hours per 1000 Lines |
|-------------------|-------|------------------------|-------------------------------------------|---------------------|
| Level 1 | Trainee | 0.60 | 57.0 lines/hr | 17.54 h |
| Level 2 | Basic | 0.75 | 71.25 lines/hr | 14.04 h |
| Level 3 | Competent | 0.90 | 85.5 lines/hr | 11.70 h |
| Level 4 | Proficient | 1.00 | 95.0 lines/hr | 10.53 h |
| Level 5 | Expert | 1.10 | 104.5 lines/hr | 9.57 h |

**Adjusted formula when assigning a specific employee:**

```
effective_hours[employee][process][timeslot] =
    required_hours[process][timeslot] / proficiency_multiplier[employee][process]
```

When computing aggregate FTE requirements (before individual assignment), the system uses the **expected average proficiency** for the workforce pool:

```
avg_proficiency = SUM(proficiency_multiplier[e][process] for e in available_pool) / |available_pool|
adjusted_required_hours = required_hours / avg_proficiency
```

### 4.4 Shift Timing Adjustments

Productivity varies by time of day and shift pattern. The system applies timing adjustment factors:

| Factor | Multiplier on Required Hours | Rationale |
|--------|------------------------------|-----------|
| Day shift (06:00–14:00) | 1.00 | Baseline |
| Afternoon shift (14:00–22:00) | 1.03 | Slight fatigue, slightly lower supervision |
| Night shift (22:00–06:00) | 1.12 | Reduced alertness, safety protocols, slower pace |
| Overtime (hours > 8 in a day) | 1.08 per hour beyond 8 | Cumulative fatigue factor |
| Overtime (hours > 10 in a day) | 1.15 per hour beyond 10 | Steep fatigue degradation |
| 6th consecutive day | 1.10 | Weekly fatigue accumulation |
| 7th consecutive day | 1.20 | Significant fatigue, safety risk |

**Combined adjustment:**

```
timing_factor = base_shift_factor * overtime_factor * consecutive_day_factor
adjusted_required_hours = required_hours * timing_factor
```

### 4.5 Learning Curve Adjustment

For new processes or newly trained employees, a learning curve adjustment applies for the first N shifts:

| Shifts on Process | Learning Curve Factor |
|-------------------|-----------------------|
| 1–3 | 1.40 (40% slower) |
| 4–7 | 1.20 (20% slower) |
| 8–15 | 1.10 (10% slower) |
| 16+ | 1.00 (fully ramped) |

---

## 5. Step 3: FTE Calculation

### 5.1 Core Formula

```
FTE_required[process][timeslot] = adjusted_required_hours[process][timeslot] / available_hours_per_FTE[timeslot]
```

### 5.2 Available Hours per FTE

A standard 8-hour shift does not yield 8 hours of productive work. The system accounts for:

| Deduction | Minutes | Source |
|-----------|---------|--------|
| Paid breaks | 30 min | 2x 15-min breaks (jurisdiction-dependent) |
| Unpaid meal break | 30 min | Not counted in paid hours but reduces availability |
| Startup/shutdown | 15 min | Shift briefing, equipment prep, cleanup |
| Non-productive time | 15 min | Walk time, queue time, system delays |
| **Total deductions from 8h shift** | **60 min** | |
| **Net productive hours** | **7.0 h** | |

For a 10-hour shift, deductions scale:

| Deduction | Minutes |
|-----------|---------|
| Paid breaks | 45 min (3x 15-min) |
| Unpaid meal break | 30 min |
| Startup/shutdown | 15 min |
| Non-productive time | 20 min |
| **Net productive hours** | **8.17 h** |

### 5.3 Absenteeism Buffer

Planned headcount must account for expected absences. The absenteeism buffer is applied as a gross-up:

```
gross_FTE_required = FTE_required / (1 - absenteeism_rate)
```

| Workforce Segment | Typical Absenteeism Rate | Source |
|--------------------|--------------------------|--------|
| Full-time permanent | 5–7% | Historical HR data |
| Part-time permanent | 7–9% | Historical HR data |
| Temporary / agency | 10–15% | Agency SLA data |
| Seasonal surge | 12–18% | Historical peak data |
| **Blended default** | **8–12%** | **Weighted average** |

**Example:** If 100 FTEs are required and the blended absenteeism rate is 10%:

```
gross_FTE_required = 100 / (1 - 0.10) = 111.1 → round up to 112 FTEs
```

### 5.4 Rounding Strategy

FTE requirements are fractional, but people are whole. The rounding strategy is configurable:

| Strategy | Description | When to Use |
|----------|-------------|-------------|
| Ceiling | Always round up | Conservative; use for safety-critical or SLA-bound processes |
| Nearest | Standard rounding | Default for most processes |
| Floor-with-flex | Round down, flag remainder as flex need | When flex/agency pool is available |
| Banker's rounding | Round to nearest even | When aggregating across many slots to avoid systematic bias |

---

## 6. Step 4: Assignment Optimization

### 6.1 Decision Variables

For each employee `e`, process `p`, and time slot `t`:

```
x[e][p][t] ∈ {0, 1}    (1 if employee e is assigned to process p in slot t, 0 otherwise)
```

### 6.2 Objective Functions

AstraPlanner supports multiple objective functions that can be combined via weighted sum or lexicographic ordering.

#### Objective 1: Minimize Total Labor Cost

```
minimize: SUM( x[e][p][t] * hourly_cost[e][t] )
```

Where `hourly_cost[e][t]` includes base pay, shift differentials, overtime premiums, and agency markup.

| Cost Component | Typical Value | When Applied |
|----------------|---------------|--------------|
| Base hourly rate | $18–32/hr | Always |
| Night shift differential | +15% | 22:00–06:00 |
| Weekend differential | +25% | Saturday/Sunday |
| Overtime premium (1.5x) | +50% | Hours > 40/week (US) or > 8/day |
| Double-time | +100% | Hours > 12/day or 7th consecutive day |
| Agency markup | +40–60% | Temporary workers |

#### Objective 2: Maximize Skill Coverage Quality

```
maximize: SUM( x[e][p][t] * skill_score[e][p] )
```

Where `skill_score[e][p]` is the proficiency level (1–5) of employee `e` for process `p`.

#### Objective 3: Minimize Overtime

```
minimize: SUM( overtime_hours[e] )
```

Where `overtime_hours[e] = max(0, total_hours[e] - standard_hours_threshold)`.

#### Objective 4: Maximize Employee Preference Satisfaction

```
maximize: SUM( x[e][p][t] * preference_score[e][t] )
```

Where `preference_score[e][t]` encodes shift preferences, day-off preferences, and process preferences.

#### Objective 5: Workload Fairness

```
minimize: VARIANCE( total_hours[e] for e in employee_pool )
```

Or equivalently, minimize the difference between the maximum and minimum assigned hours across employees.

### 6.3 Multi-Objective Optimization

When multiple objectives are active, AstraPlanner uses one of three resolution strategies:

| Strategy | Description | Configuration |
|----------|-------------|---------------|
| **Weighted Sum** | Combine all objectives into a single score using configurable weights. `total = w1*cost + w2*skill + w3*overtime + w4*preference + w5*fairness` | Default weights: cost=0.35, skill=0.25, overtime=0.20, preference=0.12, fairness=0.08 |
| **Lexicographic** | Optimize objectives in strict priority order. First minimize cost, then among cost-optimal solutions maximize skill coverage, etc. | Priority order configurable per site |
| **Pareto Frontier** | Generate multiple non-dominated solutions and present to the planner for selection. | Used in scenario simulation mode |

### 6.4 Solver Strategy Selection

The engine dynamically selects the solving approach based on problem characteristics:

| Problem Size | Constraint Complexity | Time Budget | Selected Strategy |
|-------------|----------------------|-------------|-------------------|
| Small (< 100 employees, < 50 slots) | Low | Interactive (< 5s) | Greedy heuristic |
| Small | High | Interactive | Constraint programming |
| Medium (100–500 employees) | Any | Background (< 60s) | Hybrid: greedy + CP refinement |
| Large (500–2000 employees) | Low–Medium | Background | MIP with time limit |
| Large | High | Batch (< 30 min) | Hybrid: greedy + MIP + local search |
| Very large (> 2000 employees) | Any | Batch | Decomposition + parallel MIP per sub-problem |

Details of each algorithm strategy are covered in [algorithm-strategies.md](algorithm-strategies.md).

---

## 7. Concrete Numeric Example

**Scenario:** A single distribution center on a Tuesday in November.

### 7.1 Raw Demand

| Process | Demand Type | Volume | Time Window |
|---------|-------------|--------|-------------|
| Receiving | Pallets | 400 pallets | 06:00–14:00 (8h) |
| Put-away | Pallets | 400 pallets | 07:00–15:00 (8h) |
| Picking (each) | Order lines | 50,000 lines | 06:00–22:00 (16h) |
| Packing | Orders | 8,000 orders | 08:00–22:00 (14h) |
| Shipping (parcel) | Parcels | 7,500 parcels | 10:00–22:00 (12h) |
| Returns | Items | 2,000 items | 06:00–14:00 (8h) |

### 7.2 Step 1: Demand Normalization

All demand is already in native process units, so CWU conversion factors are 1.0 for this example (conversion is identity when productivity rates are expressed in native units).

### 7.3 Step 2: Workload Computation

| Process | Volume | Productivity Rate | Raw Hours | Avg Proficiency | Adj. Hours | Shift Factor | Final Hours |
|---------|--------|-------------------|-----------|-----------------|------------|--------------|-------------|
| Receiving | 400 pallets | 18 pallets/hr | 22.2 h | 0.92 (mostly L3–L4) | 24.1 h | 1.00 (day) | 24.1 h |
| Put-away | 400 pallets | 15 pallets/hr | 26.7 h | 0.90 | 29.6 h | 1.00 | 29.6 h |
| Picking | 50,000 lines | 95 lines/hr | 526.3 h | 0.88 (mixed pool) | 598.0 h | 1.04 (blended day+afternoon) | 621.9 h |
| Packing | 8,000 orders | 30 orders/hr | 266.7 h | 0.91 | 293.1 h | 1.03 (blended) | 301.9 h |
| Shipping | 7,500 parcels | 55 parcels/hr | 136.4 h | 0.93 | 146.7 h | 1.05 (afternoon-heavy) | 154.0 h |
| Returns | 2,000 items | 20 items/hr | 100.0 h | 0.85 (many L2–L3) | 117.6 h | 1.00 | 117.6 h |
| **Total** | | | **1,078.3 h** | | **1,209.1 h** | | **1,249.1 h** |

### 7.4 Step 3: FTE Calculation

Assuming 8-hour shifts with 7.0 net productive hours per shift:

| Process | Final Hours | FTE (raw) | Absenteeism Buffer (10%) | Gross FTE | Rounded (ceiling) |
|---------|-------------|-----------|--------------------------|-----------|-------------------|
| Receiving | 24.1 h | 3.4 | 3.8 | 3.8 | 4 |
| Put-away | 29.6 h | 4.2 | 4.7 | 4.7 | 5 |
| Picking | 621.9 h | 88.8 | 98.7 | 98.7 | 99 |
| Packing | 301.9 h | 43.1 | 47.9 | 47.9 | 48 |
| Shipping | 154.0 h | 22.0 | 24.4 | 24.4 | 25 |
| Returns | 117.6 h | 16.8 | 18.7 | 18.7 | 19 |
| **Total** | **1,249.1 h** | **178.4** | **198.2** | | **200** |

Note: Picking demand is spread across day shift (60%) and afternoon shift (40%). The 99 FTE breaks down to approximately 60 day-shift pickers and 39 afternoon-shift pickers.

### 7.5 Step 4: Assignment Optimization

**Available workforce pool:** 220 employees (180 permanent + 40 temporary).

The solver must assign 200 of the 220 available employees across 6 processes and 2–3 shifts, subject to:
- All hard constraints (certifications, max hours, rest periods)
- Soft preferences (shift preferences, process preferences)
- Objective: minimize cost (primary), maximize skill coverage (secondary)

**Solver selection:** 220 employees, moderate constraints, background mode selected. Engine runs hybrid greedy + CP refinement.

**Result (summary):**

| Metric | Value |
|--------|-------|
| Employees assigned | 200 of 220 |
| Unassigned (bench/reserve) | 20 |
| Total assigned hours | 1,400 h (200 x 7.0 net) |
| Utilization rate | 89.2% (1,249.1 / 1,400) |
| Overtime hours | 32 h (4 employees on 10h shifts) |
| Preference satisfaction | 82% of preferences met |
| Average skill match score | 3.6 / 5.0 |
| Solve time | 8.4 seconds |

### 7.6 Output

The final plan is a set of assignment records:

```
{
  "employee_id": "EMP-4821",
  "date": "2025-11-18",
  "shift": "day",
  "start_time": "06:00",
  "end_time": "14:00",
  "process": "picking_each",
  "zone": "Zone-A",
  "skill_level": 4,
  "cost": 168.00,
  "is_overtime": false,
  "preference_matched": true
}
```

---

## 8. Pipeline Configuration and Tuning

### 8.1 Configuration Hierarchy

Configuration cascades from global defaults down to site-specific overrides:

```
Global Defaults → Region → Country → Site Group → Site → Process → Override
```

Any parameter (productivity rates, absenteeism rates, shift factors, objective weights) can be overridden at any level. Lower levels take precedence.

### 8.2 Continuous Calibration

The pipeline is designed for continuous improvement:

1. **Productivity rate calibration**: Compare planned vs. actual throughput weekly. If actual consistently deviates by more than 5%, flag for review and suggest updated rate.
2. **Absenteeism rate update**: Rolling 13-week average, updated weekly per workforce segment.
3. **Shift factor validation**: Compare planned vs. actual hours per unit by shift. Adjust timing factors quarterly.
4. **Objective weight tuning**: Track plan acceptance rate by planners. If planners consistently override a particular aspect (e.g., always moving employees to preferred shifts), increase the weight of that objective.

### 8.3 Audit Trail

Every optimization run produces a full audit record:

| Field | Description |
|-------|-------------|
| `run_id` | Unique identifier for the optimization run |
| `trigger` | What initiated the run (scheduled, manual, demand change, absence) |
| `input_hash` | SHA-256 of all input data for reproducibility |
| `parameters_snapshot` | Complete set of parameters used |
| `solver_strategy` | Which algorithm was selected and why |
| `solve_time_ms` | Wall-clock solve time |
| `objective_values` | Final value of each objective function |
| `constraint_violations` | Any soft constraint violations with severity |
| `result_hash` | SHA-256 of the output plan |
| `accepted` | Whether the planner approved the plan |
| `override_count` | Number of manual changes made by planner |

---

## 9. Scalability Considerations

### 9.1 Problem Decomposition

For enterprise-scale planning (thousands of sites), the engine decomposes the problem:

1. **Site-level independence**: Each site is optimized independently in parallel (sites do not share employees in most configurations).
2. **Multi-site shared pools**: When employees can float between sites, a two-phase approach is used:
   - Phase 1: Determine FTE requirements per site independently.
   - Phase 2: Solve the cross-site allocation problem (which is much smaller: employees x sites, not employees x slots).
3. **Temporal decomposition**: For weekly planning, each day can be solved independently with linking constraints for consecutive-day rules carried forward.

### 9.2 Performance Targets

| Scenario | Sites | Employees/Site | Total Variables | Target Solve Time |
|----------|-------|----------------|-----------------|-------------------|
| Single site, interactive | 1 | 200 | ~60,000 | < 5 s |
| Single site, background | 1 | 2,000 | ~600,000 | < 60 s |
| Multi-site, batch | 100 | 200 avg | ~6,000,000 | < 10 min (parallel) |
| Enterprise, overnight | 2,000 | 200 avg | ~120,000,000 | < 30 min (parallel) |

### 9.3 Warm Starting

When re-optimizing (e.g., after a demand change or absence notification), the engine uses the previous solution as a warm start. This dramatically reduces solve time because:

- The previous solution provides a feasible starting point.
- The solver only needs to find improvements, not construct from scratch.
- Typically 80–90% of assignments remain unchanged.
