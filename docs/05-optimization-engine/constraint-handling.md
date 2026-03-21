# Constraint Handling

## 1. Overview

AstraPlanner's optimizer operates within a dense constraint environment drawn from labor law, employment contracts, safety regulations, operational policy, and employee preferences. This document catalogs every constraint class, defines enforcement behavior, and specifies how the system responds when constraints conflict or render the problem infeasible.

Constraints are divided into two categories:

- **Hard constraints** must never be violated. A solution that violates any hard constraint is rejected outright, regardless of its objective function value.
- **Soft constraints** should be satisfied when possible, but can be relaxed with a quantified penalty. The optimizer balances soft constraint satisfaction against other objectives.

---

## 2. Hard Constraints

### 2.1 Maximum Weekly Working Hours

| Jurisdiction | Limit | Legal Basis | Notes |
|-------------|-------|-------------|-------|
| EU (general) | 48 hours (averaged over 17-week reference period) | EU Working Time Directive 2003/88/EC | Opt-out possible in UK; must be voluntary and documented |
| France | 35 hours standard, 48 hours absolute max | Code du Travail | 35h is contractual; 48h is legal ceiling |
| Germany | 48 hours (8h/day x 6 days), extendable to 60h with compensation | Arbeitszeitgesetz (ArbZG) | Must average to 48h over 24 weeks |
| US (Federal) | No maximum, but overtime after 40 hours | FLSA | State laws may impose daily overtime thresholds |
| US (California) | No weekly max, but overtime after 8h/day and 40h/week; double time after 12h/day | CA Labor Code | Strictest US state |
| UK (post-Brexit) | 48 hours (opt-out available) | Working Time Regulations 1998 | Similar to EU but with UK-specific enforcement |
| Australia | 38 hours ordinary + reasonable overtime | Fair Work Act 2009 | "Reasonable" depends on role, pay, notice |
| India | 48 hours per week | Factories Act / state Shops & Establishments Act | Varies by state |

**Enforcement:** The system tracks cumulative hours per employee per rolling week (configurable: calendar week or rolling 7-day). Any assignment that would push an employee over the applicable limit is blocked.

### 2.2 Minimum Rest Between Shifts

| Jurisdiction | Minimum Rest | Legal Basis |
|-------------|-------------|-------------|
| EU (general) | 11 consecutive hours in every 24-hour period | Working Time Directive Art. 3 |
| France | 11 hours (derogation to 9h in specific sectors) | Code du Travail |
| Germany | 11 hours (reducible to 10h in specific cases) | ArbZG §5 |
| UK | 11 hours | Working Time Regulations |
| US (Federal) | No federal requirement | N/A |
| US (Oregon) | 10 hours for certain industries | Oregon scheduling law |
| US (California) | 8 hours between shifts (specific industries) | IWC Wage Orders |
| Australia | 10 hours (award-dependent) | Modern Awards |

**Enforcement:** Before assigning an employee to a slot, the system checks: `slot_start_time - previous_shift_end_time >= minimum_rest`. If violated, the assignment is excluded from the candidate set.

### 2.3 Maximum Consecutive Working Days

| Jurisdiction | Max Consecutive Days | Legal Basis |
|-------------|---------------------|-------------|
| EU (general) | 6 days, then 1 day rest per 7-day period (or 2 days per 14-day period) | Working Time Directive Art. 5 |
| France | 6 days | Code du Travail |
| Germany | 6 days (Sunday rest mandatory for most workers) | ArbZG §9 |
| UK | 6 days (or 2 rest days per 14-day period) | Working Time Regulations |
| US (Federal) | No federal limit | N/A |
| US (California) | 6 days per workweek (with exceptions) | CA Labor Code §551–552 |
| Australia | Award-dependent, typically 6 | Modern Awards |

**Enforcement:** The system maintains a running count of consecutive working days per employee. Assignments that would create a violation are blocked.

### 2.4 Required Certifications

Certain processes require valid, unexpired certifications. This is a binary hard constraint — no certification means no assignment, regardless of proficiency level or operational need.

| Certification | Processes Gated | Consequence of Violation |
|---------------|----------------|--------------------------|
| Forklift operator license | Forklift operation, powered pallet jack, reach truck | Safety incident risk, OSHA citation, insurance void |
| Hazmat handling certificate | Hazardous materials receiving, storage, shipping | Federal/state violation, fines up to $75,000 per incident (US) |
| Cold chain certification | Cold/frozen storage operations | Product quality risk, regulatory compliance failure |
| First aid / CPR | Team lead (one per shift required) | OSHA General Duty Clause violation |
| Food safety (if applicable) | Food-grade warehouse operations | FDA compliance failure |

**Enforcement:** Checked during Layer 1 hard constraint filtering. See [skill-matching.md](skill-matching.md) for certification tracking details.

### 2.5 Minimum Skill Level

Each process defines a minimum proficiency level below which assignment is unsafe or unproductive:

| Process Category | Minimum Level | Rationale |
|-----------------|---------------|-----------|
| Standard warehouse processes | Level 2 (Basic) | Can work independently on simple tasks |
| Equipment-intensive processes | Level 3 (Competent) | Safety requires reliable independent performance |
| Quality-critical processes | Level 3 (Competent) | Error cost is high |
| Hazardous processes | Level 4 (Proficient) | Must handle exceptions without supervision |

**Enforcement:** `effective_level[employee][process] >= min_level[process]`. Uses decayed effective level, not recorded level.

### 2.6 Site Capacity Limits

Physical site constraints that cannot be exceeded:

| Constraint | Source | Example Value |
|-----------|--------|---------------|
| Maximum headcount per building | Fire code / occupancy permit | 450 persons |
| Maximum headcount per zone | Equipment/workstation count | 60 pickers in Zone A |
| Dock door capacity | Physical infrastructure | 24 receiving doors, 18 shipping doors |
| Forklift fleet size | Equipment inventory | 15 forklifts = max 15 concurrent forklift operators |
| Parking / transport capacity | Facility limitation | 300 parking spaces limits total headcount |

**Enforcement:** The solver includes capacity constraints: `SUM(x[e][p][t] for e where zone[p] == z) <= capacity[z][t]`.

### 2.7 Contract Type Restrictions

| Contract Type | Restriction | Enforcement |
|--------------|-------------|-------------|
| Part-time | Maximum hours per week (e.g., 20h, 25h, 30h) | Track cumulative hours |
| Part-time | May not work certain shifts (e.g., no nights) | Shift eligibility filter |
| Temporary / agency | May not perform certain processes (e.g., no forklift without agency certification) | Process eligibility filter |
| Temporary / agency | Maximum assignment duration (e.g., 12 weeks continuous at same site in EU) | Duration tracking |
| Fixed-term | Contract end date — cannot be scheduled beyond it | Date range check |
| Zero-hours | Cannot be scheduled for more than offered/accepted shifts | Acceptance confirmation required |
| Apprentice | Must have supervisor ratio (e.g., 1:3) | Co-assignment constraint |

### 2.8 Mandatory Breaks

| Jurisdiction | Rule | Legal Basis |
|-------------|------|-------------|
| EU (general) | 20-minute break after 6 hours of work | Working Time Directive Art. 4 |
| France | 20 minutes after 6 consecutive hours | Code du Travail |
| Germany | 30 minutes after 6 hours; 45 minutes after 9 hours | ArbZG §4 |
| UK | 20 minutes after 6 hours | Working Time Regulations |
| US (Federal) | No federal requirement (but FLSA defines paid vs. unpaid breaks) | N/A |
| US (California) | 30-minute meal break before 5th hour; 10-minute rest per 4 hours | CA Labor Code / IWC |
| Australia | Award-dependent, typically 30 minutes after 5 hours | Modern Awards |

**Enforcement:** Break time is deducted from productive hours (handled in FTE calculation). The system does not schedule work during break windows and validates that shift patterns include mandated breaks.

---

## 3. Soft Constraints

Soft constraints have configurable weights (default values shown). Higher weight means higher penalty for violation, making the optimizer try harder to satisfy the constraint.

### 3.1 Employee Shift Preferences

| Attribute | Detail |
|-----------|--------|
| Description | Employees can register preferred, neutral, and dispreferred shifts |
| Weight | Configurable (default: 0.15 of total objective) |
| Scoring | Preferred shift: +1.0, Neutral: 0.0, Dispreferred: -0.5 |
| Typical satisfaction rate | 75–85% in most solutions |
| Relaxation order | Relaxed before workload balance but after site preference |

### 3.2 Preferred Site Assignment

| Attribute | Detail |
|-----------|--------|
| Description | Employees have a primary (home) site and may have secondary sites |
| Weight | High (default: 0.20 of total objective) |
| Scoring | Home site: +1.0, Secondary site: +0.5, Other site: 0.0 |
| Typical satisfaction rate | 90–95% (most employees work at home site) |
| Relaxation order | One of the last soft constraints to relax |

### 3.3 Workload Balance

| Attribute | Detail |
|-----------|--------|
| Description | Distribute working hours evenly across eligible employees |
| Weight | Medium (default: 0.08 of total objective) |
| Scoring | Penalty proportional to deviation from mean hours |
| Metric | Standard deviation of assigned hours across employee pool |
| Target | All employees within +/- 10% of mean weekly hours |
| Relaxation order | Relaxed before shift preference |

### 3.4 Minimize Split Shifts

| Attribute | Detail |
|-----------|--------|
| Description | Avoid assigning an employee to multiple processes within one shift |
| Weight | Medium (default: 0.07 of total objective) |
| Scoring | Penalty of -0.3 per process switch within a shift |
| Relaxation order | Relaxed early when demand is highly fragmented |

### 3.5 Skill Development Goals

| Attribute | Detail |
|-----------|--------|
| Description | Assign employees to processes slightly above their current level to promote growth |
| Weight | Low (default: 0.05 of total objective) |
| Scoring | Bonus of +0.2 when assignment is a "stretch" (process where employee is at minimum level) |
| Conditions | Only applied when the process is adequately staffed (not understaffed) |
| Relaxation order | First soft constraint to relax under pressure |

### 3.6 Team Continuity

| Attribute | Detail |
|-----------|--------|
| Description | Keep teams together — employees who regularly work together should continue to be co-assigned |
| Weight | Low (default: 0.05 of total objective) |
| Scoring | Bonus of +0.15 for each pair of team members assigned to the same process and shift |
| Team definition | Configurable: supervisor-defined teams, historically co-assigned groups, or department-based |
| Relaxation order | Relaxed early under staffing pressure |

### 3.7 Overtime Minimization

| Attribute | Detail |
|-----------|--------|
| Description | Minimize total overtime hours across the workforce |
| Weight | Configurable (default: 0.15 of total objective) |
| Scoring | Penalty proportional to overtime hours: `-0.5 * overtime_hours[e]` per employee |
| Interaction | Competes directly with cost minimization (overtime is expensive) and coverage (overtime fills gaps) |
| Relaxation order | Relaxed when coverage would otherwise drop below threshold |

### 3.8 Consecutive Shift Pattern Consistency

| Attribute | Detail |
|-----------|--------|
| Description | Avoid erratic shift patterns (e.g., day-night-day-night) |
| Weight | Medium (default: 0.06 of total objective) |
| Scoring | Penalty of -0.4 for each "direction change" in a week (e.g., going from day to night back to day) |
| Health basis | Circadian rhythm disruption increases injury risk and reduces productivity |

### 3.9 Commute / Travel Minimization (Multi-Site)

| Attribute | Detail |
|-----------|--------|
| Description | When employees can be assigned across sites, minimize total commute burden |
| Weight | Medium (default: 0.08 of total objective) |
| Scoring | Penalty proportional to distance from home site: `-0.01 * km_distance` |
| Threshold | Assignments > 50 km from home site receive additional penalty |

---

## 4. Constraint Summary Table

| Constraint | Type | Source | Priority | Relaxation Strategy | Violation Penalty |
|-----------|------|--------|----------|--------------------|--------------------|
| Max weekly hours | Hard | Labor law | Mandatory | Cannot relax | Infeasible — blocks assignment |
| Min rest between shifts | Hard | Labor law | Mandatory | Cannot relax | Infeasible — blocks assignment |
| Max consecutive days | Hard | Labor law | Mandatory | Cannot relax | Infeasible — blocks assignment |
| Required certifications | Hard | Safety regulation | Mandatory | Cannot relax | Infeasible — blocks assignment |
| Min skill level | Hard | Operational policy | Mandatory | Cannot relax | Infeasible — blocks assignment |
| Site capacity limits | Hard | Fire code / infrastructure | Mandatory | Cannot relax | Infeasible — blocks assignment |
| Contract type restrictions | Hard | Employment contract | Mandatory | Cannot relax | Infeasible — blocks assignment |
| Mandatory breaks | Hard | Labor law | Mandatory | Cannot relax | Infeasible — blocks assignment |
| Overtime minimization | Soft | Cost policy | Configurable | Allow overtime up to hard limit | -0.5 per overtime hour |
| Shift preference | Soft | Employee satisfaction | Configurable | Assign non-preferred shifts | -0.5 per dispreferred assignment |
| Site preference | Soft | Operational efficiency | High | Assign to non-home site | -0.3 per non-home assignment |
| Workload balance | Soft | Fairness policy | Medium | Allow imbalance up to +/-20% | -0.1 per % deviation from mean |
| Split shift avoidance | Soft | Productivity | Medium | Allow up to 3 process switches | -0.3 per switch |
| Skill development | Soft | HR strategy | Low | Skip stretch assignments | -0.2 per missed opportunity |
| Team continuity | Soft | Team dynamics | Low | Allow team breakup | -0.15 per broken pair |
| Shift pattern consistency | Soft | Health & safety | Medium | Allow direction changes | -0.4 per direction change |
| Commute minimization | Soft | Employee welfare | Medium | Allow distant assignments | -0.01 per km |

---

## 5. Constraint Conflict Resolution

### 5.1 Hard-Hard Conflicts

Hard constraints should never conflict because they represent absolute rules. However, in misconfigured systems, conflicts can arise:

| Conflict | Example | Resolution |
|---------|---------|------------|
| Max hours vs. coverage requirement | System requires 50h/week from an employee but jurisdiction caps at 48h | Flag as infeasible. Cannot schedule >48h. Suggest hiring or agency. |
| Min rest vs. shift pattern | A rotation pattern (day-night-day) violates 11h minimum rest | Reject the pattern at design time. Rotation validator prevents creation. |
| Certification vs. demand | Hazmat demand exists but no certified employees available on that shift | Flag as uncoverable. Escalate to planner. Suggest certification acceleration. |
| Contract restriction vs. need | Only available employees are part-time but full shift coverage needed | Combine multiple part-time employees. If still insufficient, flag gap. |

### 5.2 Soft-Soft Conflicts

Soft constraints regularly conflict. Resolution is through the weighted objective function:

| Conflict | Example | Resolution |
|---------|---------|------------|
| Preference vs. cost | Employee prefers day shift but night shift is cheaper (night differential is already paid) | Weight comparison: if cost weight > preference weight, assign to night |
| Balance vs. skill match | Giving more hours to skilled employees improves quality but hurts fairness | Weight-based trade-off; fairness weight typically yields when gap > 15% |
| Overtime vs. coverage | Reducing overtime may leave slots uncovered | Overtime penalty is compared against coverage penalty; coverage usually wins |
| Team continuity vs. skill development | Keeping teams together prevents stretch assignments | Development weight is low, so team continuity usually wins |
| Commute vs. site preference | Employee prefers Site A but Site B (closer) needs staff | These usually align; when they conflict, site preference weight dominates |

### 5.3 Hard-Soft Conflicts

Hard constraints always override soft constraints. The system never relaxes a hard constraint to improve soft constraint satisfaction.

---

## 6. Constraint Relaxation Strategy

When no feasible solution exists (all hard constraints satisfied, but not enough employees to cover demand), the system progressively relaxes soft constraints to find the best attainable solution.

### 6.1 Relaxation Priority Order

Constraints are relaxed in order from lowest impact to highest impact:

| Relaxation Step | Constraint Relaxed | Action | Expected Recovery |
|----------------|-------------------|--------|-------------------|
| Step 1 | Skill development goals | Remove stretch assignment bonuses | Frees skilled employees for direct assignment |
| Step 2 | Team continuity | Allow team breakup | Frees employees from team-locked assignments |
| Step 3 | Split shift avoidance | Allow up to 3 splits per shift | Creates additional capacity through multi-processing |
| Step 4 | Shift pattern consistency | Allow direction changes | Opens more shift slots per employee |
| Step 5 | Workload balance | Allow imbalance up to +/-30% | Some employees get more hours, others fewer |
| Step 6 | Shift preference | Assign dispreferred shifts | Access employees who preferred other shifts |
| Step 7 | Overtime minimization | Allow overtime up to hard limit | Extends hours of existing employees |
| Step 8 | Site preference | Assign to non-home sites | Access employees from other sites (multi-site only) |
| Step 9 | Commute minimization | Allow distant site assignments | Broader employee pool (multi-site only) |

If after all soft constraint relaxation the problem is still infeasible (hard constraints prevent coverage), the system reports an infeasibility diagnosis.

### 6.2 Partial Relaxation

The system does not fully relax a constraint at each step. It gradually reduces the penalty weight:

```
relaxation_iterations:
  iteration 1: weight = original_weight * 0.5
  iteration 2: weight = original_weight * 0.1
  iteration 3: weight = 0 (fully relaxed)
```

This produces smoother trade-offs and avoids sudden jumps in solution quality.

---

## 7. Infeasibility Diagnosis

When the solver cannot find any feasible solution (even after relaxing all soft constraints), the system must explain *why* to the planner. This is critical for trust and actionability.

### 7.1 Diagnosis Algorithm

1. **Isolate the bottleneck**: For each time slot and process, compute the ratio of available qualified employees to required FTEs. The slot with the lowest ratio is the primary bottleneck.

2. **Identify binding constraints**: For the bottleneck slot, enumerate which hard constraints are eliminating candidates:
   - "12 employees have the right skill but are already assigned to other processes in this slot"
   - "8 employees have the right skill but would exceed their weekly hour limit"
   - "3 employees have the right skill but have insufficient rest since their last shift"
   - "2 employees have the right skill but lack required certification"

3. **Suggest resolutions**: For each binding constraint, suggest the minimum relaxation or external action needed:
   - "Add 4 agency workers with forklift certification to cover night shift forklift demand"
   - "If Employee X's overtime limit were extended by 2 hours, the day shift picking gap would close"
   - "Cross-training 3 packers to picking would eliminate the afternoon picking shortage within 2 weeks"

### 7.2 Infeasibility Report Structure

```
INFEASIBILITY REPORT
====================
Plan Date: 2025-11-18
Site: DC-East

SUMMARY: Cannot generate a feasible plan. 6 FTE-shifts cannot be covered.

BOTTLENECK 1: Night Shift Forklift (2 FTE required, 0 available)
  Cause: Only 4 employees are forklift-certified. All 4 are assigned to day/afternoon.
  Binding constraint: Maximum consecutive days (2 operators on day 6, cannot work night)
  Resolution options:
    (a) Certify 2 additional employees for forklift [lead time: 2 weeks]
    (b) Request 2 agency forklift operators for night shift [lead time: 48 hours]
    (c) Reschedule forklift-dependent night work to afternoon [operational change]

BOTTLENECK 2: Afternoon Shift Picking (4 FTE short)
  Cause: 30 FTEs required, only 26 qualified and available.
  Binding constraint: 8 qualified pickers are at weekly hour limit (48h).
  Resolution options:
    (a) Authorize 4 hours overtime for 4 pickers [cost: $320 premium]
    (b) Cross-assign 4 packers with picking adjacency (0.5) [productivity impact: -10%]
    (c) Request 4 agency pickers [cost: $640/day]

CONSTRAINT RELAXATION ATTEMPTED:
  - All soft constraints relaxed to zero weight
  - 4 of 6 gaps were closed through relaxation
  - Remaining 2 gaps require external action (see resolutions above)
```

### 7.3 "What-If" Infeasibility Analysis

The system supports speculative constraint relaxation:

- **"What if we allowed 50-hour weeks?"** → Re-solve with modified hard constraint, report how many gaps close.
- **"What if we had 10 more forklift-certified employees?"** → Add virtual employees, re-solve, report impact.
- **"What if we reduced night shift demand by 20%?"** → Modify demand, re-solve, report feasibility.

These what-if analyses run in interactive mode (< 5 seconds) and help planners understand the sensitivity of the plan to constraint changes.

---

## 8. Jurisdiction-Specific Constraint Profiles

AstraPlanner ships with pre-configured constraint profiles for major jurisdictions. Sites select their profile during setup (via the setup wizard), and the appropriate hard constraints are automatically applied.

### 8.1 Profile: United States (Federal)

| Constraint | Value | Source |
|-----------|-------|--------|
| Max weekly hours | No federal maximum (overtime after 40h) | FLSA |
| Min rest between shifts | No federal requirement | N/A |
| Max consecutive days | No federal limit | N/A |
| Mandatory breaks | No federal requirement (paid breaks < 20 min must be compensated) | FLSA |
| Overtime rate | 1.5x after 40 hours/week | FLSA |
| Child labor restrictions | Under 18: limited hours, no hazardous work | FLSA |

### 8.2 Profile: United States (California)

| Constraint | Value | Source |
|-----------|-------|--------|
| Max weekly hours | No statutory max (overtime rules apply) | CA Labor Code |
| Daily overtime | 1.5x after 8h/day; 2x after 12h/day | CA Labor Code |
| Weekly overtime | 1.5x after 40h/week | CA Labor Code |
| 7th consecutive day | 1.5x for first 8h; 2x after 8h | CA Labor Code §510 |
| Min rest between shifts | No general requirement (predictive scheduling in some cities) | Varies |
| Meal break | 30 min before 5th hour; 2nd meal before 10th hour | IWC Wage Orders |
| Rest break | 10 min per 4 hours worked | IWC Wage Orders |
| Split shift premium | 1 hour at minimum wage if split shift | IWC Wage Orders |

### 8.3 Profile: European Union (General)

| Constraint | Value | Source |
|-----------|-------|--------|
| Max weekly hours | 48h averaged over 17-week reference period | Directive 2003/88/EC Art. 6 |
| Min daily rest | 11 consecutive hours per 24h period | Art. 3 |
| Min weekly rest | 24 consecutive hours + 11h daily rest = 35h per 7-day period | Art. 5 |
| Max consecutive days | 6 (implied by weekly rest) | Art. 5 |
| Break after 6h | Minimum 20 minutes (details per member state) | Art. 4 |
| Night work | Max 8h per 24h period (averaged) | Art. 8 |
| Night worker health assessment | Free health assessment before assignment and regularly thereafter | Art. 9 |

### 8.4 Profile: United Kingdom (Post-Brexit)

| Constraint | Value | Source |
|-----------|-------|--------|
| Max weekly hours | 48h (opt-out available — must be voluntary, written, revocable) | Working Time Regulations 1998 |
| Min daily rest | 11 hours | Reg. 10 |
| Min weekly rest | 24 hours per 7-day period (or 48h per 14-day period) | Reg. 11 |
| Break after 6h | 20 minutes (uninterrupted, away from workstation) | Reg. 12 |
| Night work | Max 8h per 24h period (averaged over 17 weeks) | Reg. 6 |
| Young workers (under 18) | Max 8h/day, 40h/week; 12h rest; 48h weekly rest; no night work | Reg. 5A, 6A, 10A, 11A |

### 8.5 Profile: Australia / APAC

| Constraint | Value | Source |
|-----------|-------|--------|
| Max ordinary hours | 38h/week (averaged over roster cycle) | Fair Work Act 2009 s.62 |
| Reasonable overtime | No fixed cap; must be "reasonable" considering risk, personal circumstances, notice | Fair Work Act s.62 |
| Min engagement | Award-dependent (typically 3h minimum per shift) | Modern Awards |
| Break between shifts | Award-dependent (typically 10h) | Modern Awards |
| Meal break | 30 min unpaid after 5h (award-dependent) | Modern Awards |

### 8.6 Custom Profiles

Sites can create custom constraint profiles by:
1. Starting from a jurisdiction template.
2. Adding company-specific rules (e.g., "no more than 4 consecutive night shifts" even if law allows 6).
3. Adding site-specific rules (e.g., "building X has a 200-person fire code limit").
4. Adding union/CBA rules (e.g., "seniority-based shift preference" as a hard constraint).

Custom profiles are versioned and auditable. Changes require approval from an authorized administrator.

---

## 9. Constraint Validation and Testing

### 9.1 Pre-Solve Validation

Before invoking the solver, the system performs static validation:

| Check | Description | Failure Action |
|-------|-------------|----------------|
| Demand feasibility | Is total demand achievable with total available workforce? | Warn if demand exceeds 90% of theoretical max capacity |
| Certification coverage | For each certified process, is at least 1 certified employee available per required shift? | Error if zero coverage for any required slot |
| Skill coverage | For each process, are enough employees qualified at minimum level? | Warn if qualified pool < 120% of requirement |
| Constraint consistency | Do hard constraints form a satisfiable set? (e.g., 11h rest + 8h shift = 19h cycle, allows 2 shifts/day) | Error if constraints are self-contradictory |
| Data completeness | Are all required employee attributes populated? | Error with list of missing data |

### 9.2 Post-Solve Verification

After the solver produces a solution, every hard constraint is independently verified:

```
for each assignment in solution:
    assert weekly_hours[employee] <= max_weekly_hours[jurisdiction]
    assert rest_since_last_shift[employee] >= min_rest[jurisdiction]
    assert consecutive_days[employee] <= max_consecutive[jurisdiction]
    assert all_certifications_valid(employee, process)
    assert effective_skill_level(employee, process) >= min_level[process]
    assert site_headcount[site][slot] <= site_capacity[site]
    assert contract_restrictions_met(employee, assignment)
    assert breaks_scheduled(employee, shift)
```

If any assertion fails, the solution is rejected and the solver is re-invoked with tightened constraints. This double-check prevents solver bugs from producing illegal plans.

### 9.3 Constraint Monitoring Dashboard

The planner UI displays real-time constraint health:

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Hard constraint violations | 0 | N/A (always red if > 0) | > 0 |
| Soft constraint satisfaction | > 80% | 60–80% | < 60% |
| Overtime utilization | < 5% of total hours | 5–15% | > 15% |
| Certification expiry risk | All > 90 days | Any 30–90 days | Any < 30 days |
| Skill coverage ratio | > 130% demand | 100–130% | < 100% |
| Workload balance (CV) | < 0.10 | 0.10–0.20 | > 0.20 |
