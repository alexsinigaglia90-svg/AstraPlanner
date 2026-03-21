# Skill-Based Workforce Matching

## 1. Overview

Skill-based matching is the mechanism by which AstraPlanner assigns individual employees to specific processes, ensuring that every assignment is both safe and productive. The system goes beyond simple "can/cannot do" binary checks — it models proficiency depth, skill adjacency, certification validity, skill decay, and cross-training value to produce assignments that maximize operational output while developing workforce capability over time.

---

## 2. The Skill Model

### 2.1 Skill Definition

A **skill** in AstraPlanner is defined as the tuple:

```
Skill = (Process, Proficiency Level)
```

Each employee has a skill profile — a set of skills with their current proficiency levels, last-used dates, and certification statuses.

### 2.2 Proficiency Levels

| Level | Label | Description | Productivity Multiplier | Supervision Required | Can Train Others |
|-------|-------|-------------|------------------------|---------------------|-----------------|
| 1 | Trainee | Learning the process. Requires direct supervision. Makes frequent errors. Cannot work alone on the process. | 0.60 (60%) | Yes — dedicated supervisor or buddy | No |
| 2 | Basic | Can perform standard tasks independently on simple work. Needs help with exceptions. Error rate is above target but acceptable for non-critical work. | 0.75 (75%) | Periodic check-ins | No |
| 3 | Competent | Handles standard work reliably at acceptable quality. Can recognize exceptions and escalate appropriately. Meets productivity targets most of the time. | 0.90 (90%) | No — independent | No |
| 4 | Proficient | Handles exceptions without assistance. Consistently meets or exceeds productivity targets. Understands why processes work the way they do. Can mentor and train others. | 1.00 (100%) | No — fully autonomous | Yes |
| 5 | Expert | Optimizes and improves processes. Handles all edge cases. Acts as the subject matter expert for the process. Can design training materials and troubleshoot systemic issues. | 1.10 (110%) | No — leads others | Yes — primary trainer |

### 2.3 Proficiency Assessment

Proficiency levels are determined through multiple inputs:

| Assessment Method | Frequency | Weight | Who Initiates |
|-------------------|-----------|--------|---------------|
| Supervisor evaluation | Quarterly | 40% | Team lead / supervisor |
| Productivity data (actual vs. standard) | Continuous | 30% | System (automated) |
| Certification exam results | On certification | 20% | HR / Training |
| Peer feedback | Semi-annually | 10% | Employee / team |

The system calculates a composite score and maps it to the appropriate level. Level changes require supervisor confirmation to prevent gaming through short productivity bursts.

---

## 3. Skill Adjacency

### 3.1 Concept

Skill adjacency captures the relationship between processes — specifically, how easily competence in one process transfers to another. Adjacent skills reduce training time and make cross-assignment more viable.

### 3.2 Adjacency Matrix (Example Warehouse)

The adjacency value (0.0–1.0) represents the degree of skill transfer. A value of 0.8 means 80% of the skills transfer, so a Level 4 picker would start packing at approximately Level 3.2 (rounded to Level 3).

| From \ To | Receiving | Put-away | Picking (each) | Picking (case) | Packing | Shipping | Returns | Forklift | Hazmat |
|-----------|-----------|----------|----------------|----------------|---------|----------|---------|----------|--------|
| Receiving | 1.0 | 0.7 | 0.3 | 0.4 | 0.2 | 0.5 | 0.3 | 0.6 | 0.0 |
| Put-away | 0.7 | 1.0 | 0.3 | 0.3 | 0.1 | 0.3 | 0.2 | 0.8 | 0.0 |
| Picking (each) | 0.2 | 0.2 | 1.0 | 0.7 | 0.6 | 0.3 | 0.5 | 0.1 | 0.0 |
| Picking (case) | 0.3 | 0.3 | 0.7 | 1.0 | 0.4 | 0.4 | 0.4 | 0.3 | 0.0 |
| Packing | 0.2 | 0.1 | 0.5 | 0.3 | 1.0 | 0.6 | 0.5 | 0.0 | 0.0 |
| Shipping | 0.4 | 0.3 | 0.2 | 0.3 | 0.5 | 1.0 | 0.3 | 0.4 | 0.0 |
| Returns | 0.3 | 0.2 | 0.5 | 0.4 | 0.5 | 0.3 | 1.0 | 0.1 | 0.0 |
| Forklift | 0.5 | 0.7 | 0.1 | 0.2 | 0.0 | 0.4 | 0.1 | 1.0 | 0.2 |
| Hazmat | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.0 | 0.2 | 1.0 |

Key observations:
- Picking (each) and Picking (case) are highly adjacent (0.7) — similar physical and cognitive requirements.
- Packing and Picking (each) are moderately adjacent (0.6/0.5) — packing requires knowing what was picked.
- Forklift has high adjacency to Put-away (0.8) but almost none to Packing (0.0) — completely different equipment and motion.
- Hazmat is isolated (0.0 to almost everything) — requires specialized certification with no transferable skills.

### 3.3 Using Adjacency for Cross-Training Recommendations

When an employee needs to learn a new process, the system recommends paths through adjacent skills:

```
Recommended path for Picker → Forklift:
  Picking (each) → Put-away (adjacency 0.2... low)
  Better: Picking (each) → Packing (0.6) → Shipping (0.6) → Receiving (0.5) → Forklift (0.6)
  Best: Picking (each) → Receiving (0.3, direct is faster at 2 hops) → Forklift (0.6)
```

The system computes the shortest adjacency-weighted path and estimates training time.

---

## 4. Cross-Training Value

### 4.1 Measuring Skill Breadth

An employee's **cross-training value (CTV)** quantifies their operational flexibility:

```
CTV[employee] = SUM(
    proficiency_multiplier[process] * process_criticality[process]
    for each process where proficiency >= 2
)
```

Where `process_criticality` reflects how hard it is to staff that process (higher = harder to fill).

| CTV Range | Classification | Description |
|-----------|---------------|-------------|
| 0.0–2.0 | Specialist | Skilled in 1–2 processes only |
| 2.1–5.0 | Flexible | Can cover 3–5 processes at useful proficiency |
| 5.1–8.0 | Versatile | Covers most processes, highly deployable |
| 8.1+ | Universal | Can fill nearly any role, strategic asset |

### 4.2 Incentivizing Cross-Training

AstraPlanner supports configurable incentive modeling:

| Mechanism | Description | Implementation |
|-----------|-------------|----------------|
| Pay differential | Higher base rate for employees with CTV > threshold | Applied in cost calculation |
| Stretch assignment weight | Soft objective to give employees assignments slightly above their level | Objective function term |
| Training hour budget | Allocate N hours/week for cross-training activities | Capacity reservation in planning |
| Certification bonus | One-time bonus for achieving certification in new process | Tracked in employee record |

### 4.3 Optimal Cross-Training Mix

The system recommends a target skill distribution per site:

```
For a site with 200 employees:
  - 20% (40) should be Universal (CTV > 8.0)
  - 30% (60) should be Versatile (CTV 5.1–8.0)
  - 35% (70) should be Flexible (CTV 2.1–5.0)
  - 15% (30) may be Specialist (CTV 0.0–2.0)
```

This distribution balances the cost of cross-training against the flexibility benefit. Sites with high demand variability should skew toward more Versatile/Universal employees.

---

## 5. Skill Decay Model

### 5.1 Decay Rules

Skills degrade without practice. The decay model prevents stale proficiency records from leading to unsafe or unproductive assignments.

```
effective_level[employee][process] = recorded_level - decay_penalty(days_since_last_use)
```

| Days Since Last Use | Decay Penalty | Example (Level 4 → Effective) |
|--------------------|---------------|-------------------------------|
| 0–30 days | 0 levels | Level 4 → Level 4 |
| 31–60 days | 0 levels (warning issued) | Level 4 → Level 4 (flagged) |
| 61–90 days | -0.5 levels (rounded) | Level 4 → Level 4 (border) |
| 91–120 days | -1 level | Level 4 → Level 3 |
| 121–180 days | -1.5 levels (rounded) | Level 4 → Level 3 |
| 181–270 days | -2 levels | Level 4 → Level 2 |
| 271–365 days | -2.5 levels (rounded) | Level 4 → Level 2 |
| > 365 days | Reset to Level 1 (re-training required) | Level 4 → Level 1 |

### 5.2 Decay Prevention

The system proactively prevents skill decay by:

1. **Rotation recommendations**: When an employee hasn't worked a process for 45+ days, the planner is alerted to schedule a rotation shift.
2. **Automated rotation**: In autonomous planning mode, the solver includes a soft constraint to rotate employees through their secondary skills at least once per 60-day window.
3. **Refresh training**: For skills approaching 90-day non-use, the system can schedule a 2-hour refresher instead of a full shift.

### 5.3 Decay Exceptions

Some skills do not decay at the standard rate:

| Skill Type | Decay Rate | Rationale |
|------------|------------|-----------|
| Physical skills (picking, packing) | Standard | Motor skills degrade with disuse |
| Equipment operation (forklift) | Accelerated (1.5x) | Safety-critical, muscle memory fades |
| Cognitive skills (quality audit) | Slow (0.5x) | Analytical skills are more durable |
| Certification-based (hazmat) | Binary — valid or expired | Certification expiry overrides proficiency |

---

## 6. Certification Requirements

### 6.1 Certification Model

Some processes require active, valid certifications beyond proficiency levels. Certifications are binary gates — without a valid certification, an employee cannot be assigned regardless of proficiency.

| Certification | Required For | Issuing Authority | Validity Period | Renewal Process | Lead Time |
|---------------|-------------|-------------------|-----------------|-----------------|-----------|
| Forklift operator license | Forklift operation, reach truck | OSHA (US) / HSE (UK) / national body | 3 years | Practical test + theory | 2 weeks |
| Hazmat handling | Hazardous materials processes | DOT (US) / ADR (EU) | 2 years | Classroom + exam | 1 week |
| Cold chain certified | Cold storage operations | Company internal | 1 year | Online refresher + practical | 3 days |
| First aid / CPR | Team lead roles, safety officer | Red Cross / equivalent | 2 years | Refresher course | 1 day |
| Powered pallet jack | Powered pallet jack operation | OSHA / company internal | 3 years | Practical assessment | 1 day |
| RF scanner proficient | All WMS-driven processes | Company internal | No expiry | One-time training | 4 hours |

### 6.2 Certification Tracking

The system maintains:

```
certification_record = {
    employee_id: "EMP-4821",
    certification_type: "forklift_operator",
    issued_date: "2024-03-15",
    expiry_date: "2027-03-15",
    issuing_body: "OSHA",
    certificate_number: "OSHA-FL-2024-48210",
    status: "active",           // active | expiring_soon | expired | suspended
    renewal_scheduled: null,
    days_until_expiry: 487
}
```

### 6.3 Expiry Alerts

| Days Until Expiry | Alert Level | Action |
|-------------------|-------------|--------|
| 90 days | Info | Notify employee and supervisor, schedule renewal |
| 60 days | Warning | Escalate to HR, block future planning beyond expiry date |
| 30 days | Urgent | Remove from certified-required assignments after expiry date in future plans |
| 0 days (expired) | Critical | Hard block — cannot be assigned to certification-required processes |

---

## 7. Matching Algorithm

### 7.1 Algorithm Overview

The skill matching algorithm runs as part of the Assignment Optimization stage (Step 4 in the optimization pipeline). It operates in three layers:

```
Layer 1: Hard Constraint Filtering    → Eliminate infeasible assignments
Layer 2: Soft Preference Scoring      → Rank feasible assignments
Layer 3: Optimization                 → Select optimal assignment set
```

### 7.2 Layer 1: Hard Constraint Filtering

For each candidate assignment `(employee, process, timeslot)`, check:

| Constraint | Check | Failure Action |
|------------|-------|----------------|
| Minimum skill level | `effective_level[e][p] >= min_level[p]` | Exclude from candidate set |
| Valid certification | `certification_status[e][cert] == "active"` for all required certs of process `p` | Exclude from candidate set |
| Availability | Employee is not on leave, not already assigned to another slot | Exclude from candidate set |
| Max weekly hours | Adding this slot would not exceed weekly hour limit | Exclude from candidate set |
| Minimum rest | Time since last shift end >= minimum rest period | Exclude from candidate set |
| Contract restrictions | Process is not restricted for employee's contract type | Exclude from candidate set |
| Site access | Employee has access to the site where process is located | Exclude from candidate set |

After Layer 1, only feasible assignments remain.

### 7.3 Layer 2: Soft Preference Scoring

Each feasible assignment is scored on multiple dimensions:

```
match_score[e][p][t] = w1 * proficiency_score
                     + w2 * site_preference_score
                     + w3 * shift_preference_score
                     + w4 * process_preference_score
                     + w5 * continuity_score
                     + w6 * development_score
                     + w7 * cost_score
```

**Scoring components:**

| Component | Weight (default) | Score Range | Calculation |
|-----------|-----------------|-------------|-------------|
| Proficiency score | 0.25 | 0.0–1.0 | `(effective_level - min_level) / (5 - min_level)` |
| Site preference | 0.20 | 0.0–1.0 | 1.0 if primary site, 0.7 if secondary, 0.3 if tertiary, 0.0 if unfamiliar |
| Shift preference | 0.15 | 0.0–1.0 | 1.0 if preferred shift, 0.5 if neutral, 0.0 if dispreferred |
| Process preference | 0.10 | 0.0–1.0 | 1.0 if preferred process, 0.5 if neutral, 0.0 if disliked |
| Continuity | 0.10 | 0.0–1.0 | 1.0 if same process as previous day, decays with days of change |
| Development | 0.05 | 0.0–1.0 | Bonus for stretch assignments that advance skill development goals |
| Cost efficiency | 0.15 | 0.0–1.0 | Inversely proportional to hourly cost; cheaper assignments score higher |

### 7.4 Layer 3: Optimization

The scored candidate assignments are fed into the solver (see [algorithm-strategies.md](algorithm-strategies.md)), which selects the optimal set of assignments maximizing total match score while satisfying all constraints.

---

## 8. Multi-Skill Assignment

### 8.1 Split-Process Shifts

An employee can be assigned to multiple processes within a single shift. This is common when:

- A process has demand for only part of the shift (e.g., receiving is done by 10 AM).
- An employee's primary process is overstaffed for part of the shift.
- A secondary process has a surge mid-shift.

### 8.2 Rules for Split Assignments

| Rule | Value | Rationale |
|------|-------|-----------|
| Maximum processes per shift | 3 | Context-switching overhead; quality degradation |
| Minimum block duration | 2 hours | Startup/transition time makes shorter blocks unproductive |
| Transition time allowance | 15 minutes | Walking, equipment change, system login |
| Both processes must pass hard constraints | Yes | Cannot bypass certification or skill requirements |
| Productivity penalty for split | 5% per switch | Each context switch reduces effective productivity |

### 8.3 Modeling in the Solver

Split assignments are modeled by subdividing time slots:

```
x[e][p][t_sub] ∈ {0, 1}
```

Where `t_sub` represents sub-slots within a shift. A shift of 8 hours with 2-hour minimum blocks has 4 sub-slots. The solver assigns at most 3 distinct processes across the 4 sub-slots.

---

## 9. Skill Gap Analysis

### 9.1 Purpose

Skill gap analysis identifies where the current workforce lacks sufficient coverage to meet demand, informing training investment and hiring decisions.

### 9.2 Gap Calculation

For each process `p` and time period (week/month):

```
supply[p] = SUM(
    available_hours[e] * proficiency_multiplier[e][p]
    for e in employees where effective_level[e][p] >= min_level[p]
)

demand[p] = SUM( required_hours[p][t] for t in time_period )

gap[p] = max(0, demand[p] - supply[p])
gap_ratio[p] = gap[p] / demand[p]
```

### 9.3 Gap Report Output

| Process | Demand (hrs/week) | Supply (effective hrs/week) | Gap (hrs) | Gap Ratio | Severity | Recommendation |
|---------|-------------------|-----------------------------|-----------|-----------|----------|----------------|
| Picking (each) | 3,200 | 3,100 | 100 | 3.1% | Low | Cross-train 5 packers to picking |
| Forklift | 480 | 320 | 160 | 33.3% | Critical | Hire 3 certified operators + certify 5 internal |
| Hazmat | 120 | 80 | 40 | 33.3% | Critical | Send 4 employees to hazmat certification (2-week lead) |
| Packing | 1,800 | 2,100 | 0 | 0.0% | None | Overstaffed — candidates for cross-training |
| Returns | 600 | 500 | 100 | 16.7% | Medium | Cross-train 6 pickers (adjacent skill, low training cost) |

### 9.4 Training ROI Model

For each recommended training action, the system estimates:

```
training_cost = training_hours * (trainer_hourly_rate + trainee_hourly_rate) + certification_fee
annual_value = gap_hours_filled * (agency_cost_per_hour - internal_cost_per_hour) * 52
ROI = (annual_value - training_cost) / training_cost * 100
payback_period_weeks = training_cost / (annual_value / 52)
```

**Example:**

| Training Action | Training Cost | Annual Value | ROI | Payback Period |
|-----------------|--------------|--------------|-----|----------------|
| Cross-train 5 packers → picking | $4,500 | $31,200 | 593% | 7.5 weeks |
| Certify 5 employees for forklift | $7,500 | $52,000 | 593% | 7.5 weeks |
| Hazmat certification for 4 employees | $6,000 | $24,960 | 316% | 12.5 weeks |

---

## 10. Process Requirements Reference Table

| Process | Min Skill Level | Certification Required | Avg Proficiency Needed | Typical Staffing | Cross-Train From (Best Adjacency) |
|---------|----------------|----------------------|----------------------|------------------|----------------------------------|
| Receiving (pallet) | 2 | None | 3.2 | 4–8 per shift | Put-away (0.7), Shipping (0.5) |
| Put-away | 2 | Forklift (if powered) | 3.0 | 4–6 per shift | Receiving (0.7), Forklift (0.8) |
| Picking (each) | 2 | RF Scanner | 3.5 | 40–100 per shift | Picking case (0.7), Packing (0.5) |
| Picking (case) | 2 | RF Scanner | 3.3 | 10–30 per shift | Picking each (0.7), Receiving (0.4) |
| Packing | 2 | None | 3.4 | 20–50 per shift | Picking each (0.6), Returns (0.5) |
| Shipping (parcel) | 2 | None | 3.2 | 10–30 per shift | Packing (0.6), Receiving (0.5) |
| Shipping (pallet) | 3 | Forklift | 3.5 | 4–8 per shift | Receiving (0.5), Put-away (0.3) |
| Returns processing | 2 | None | 3.0 | 5–20 per shift | Picking each (0.5), Packing (0.5) |
| Quality audit | 3 | None | 4.0 | 2–5 per shift | Returns (0.4), Packing (0.3) |
| Forklift operation | 3 | Forklift License | 3.8 | 4–10 per shift | Put-away (0.8), Receiving (0.6) |
| Hazmat handling | 4 | Hazmat Cert | 4.2 | 1–4 per shift | None (isolated skill) |
| Cold chain | 3 | Cold Chain Cert | 3.5 | 2–8 per shift | Picking each (0.3) |
| Value-added services | 3 | Varies | 3.8 | 2–10 per shift | Packing (0.4) |

---

## 11. Concrete Example: Matching 200 Employees to 15 Processes Across 3 Shifts

### 11.1 Scenario Setup

**Site:** Distribution Center East, operating 3 shifts (Day: 06:00–14:00, Afternoon: 14:00–22:00, Night: 22:00–06:00).

**Demand (FTEs required per shift):**

| Process | Day Shift | Afternoon Shift | Night Shift | Total FTE/Day |
|---------|-----------|-----------------|-------------|---------------|
| Receiving | 6 | 4 | 2 | 12 |
| Put-away | 5 | 4 | 2 | 11 |
| Picking (each) | 35 | 30 | 10 | 75 |
| Picking (case) | 8 | 6 | 0 | 14 |
| Packing | 20 | 18 | 5 | 43 |
| Shipping (parcel) | 10 | 12 | 3 | 25 |
| Shipping (pallet) | 4 | 3 | 0 | 7 |
| Returns | 6 | 4 | 0 | 10 |
| Quality audit | 2 | 2 | 1 | 5 |
| Forklift | 4 | 3 | 2 | 9 |
| Hazmat | 1 | 1 | 0 | 2 |
| Cold chain | 3 | 2 | 0 | 5 |
| VAS | 3 | 2 | 0 | 5 |
| Loading dock | 3 | 3 | 1 | 7 |
| Inventory count | 0 | 0 | 4 | 4 |
| **Total** | **110** | **94** | **30** | **234** |

**Available workforce:** 200 employees, each working one shift per day.

**Problem:** 234 FTE-shifts required but only 200 employees. The system must identify the 34 FTE-shift gap.

### 11.2 Step 1: Hard Constraint Filtering

The system builds a candidate matrix `C[e][p][s]` (200 x 15 x 3 = 9,000 cells):

- 14 employees eliminated from forklift due to expired or absent license.
- 196 employees eliminated from hazmat due to no certification (only 4 are certified).
- 180 employees eliminated from cold chain due to no certification (20 are certified).
- Night shift eliminated for 40 part-time employees (contract restriction).
- 15 employees have shift-specific medical restrictions.

After filtering, the candidate matrix is approximately 35% non-zero (feasible).

### 11.3 Step 2: Soft Preference Scoring

Each feasible cell gets a match score. Distribution of scores across the 3,150 feasible cells:

| Score Range | Count | Percentage | Interpretation |
|-------------|-------|------------|----------------|
| 0.80–1.00 | 420 | 13% | Excellent match — primary skill, preferred shift, home site |
| 0.60–0.79 | 890 | 28% | Good match — adequate skill, acceptable shift |
| 0.40–0.59 | 1,050 | 33% | Acceptable match — can do it, not preferred |
| 0.20–0.39 | 590 | 19% | Poor match — marginal skill, unpreferred shift |
| 0.00–0.19 | 200 | 6% | Minimal match — barely feasible |

### 11.4 Step 3: Optimization Result

The solver (hybrid greedy + CP) produces:

| Metric | Value |
|--------|-------|
| Assignments made | 200 (all employees assigned) |
| FTE-shifts covered | 200 of 234 required |
| Coverage rate | 85.5% |
| Gap FTE-shifts | 34 (flagged for agency/overtime) |
| Average match score | 0.72 |
| Employees on preferred shift | 168 (84%) |
| Employees on preferred process | 142 (71%) |
| Multi-skill assignments (split shifts) | 18 employees covering 2 processes each |
| Overtime assignments | 12 employees on 10-hour shifts (+24 FTE-hours) |
| Solve time | 4.2 seconds |

### 11.5 Gap Analysis Output

The unfilled 34 FTE-shifts break down as:

| Process | Shift | Gap | Root Cause | Recommended Action |
|---------|-------|-----|------------|-------------------|
| Picking (each) | Afternoon | 8 | Insufficient afternoon-available pickers | Request 8 agency pickers |
| Picking (each) | Night | 5 | Few employees willing/eligible for night | Offer night premium to 5 day pickers |
| Packing | Afternoon | 6 | Packing pool exhausted | Cross-assign 6 returns employees (adjacency 0.5) |
| Shipping (parcel) | Night | 3 | Night certification gap | Schedule 3 employees for night shift orientation |
| Forklift | Night | 2 | Only 2 of 4 certified operators available nights | Certify 2 additional night-shift employees |
| Inventory count | Night | 4 | Specialized night activity, limited night pool | Assign 4 picking-skilled employees (adjacency 0.3, acceptable) |
| Other processes | Various | 6 | Assorted minor gaps | Agency backfill |
