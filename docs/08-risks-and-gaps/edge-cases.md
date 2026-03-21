# Edge Cases Catalog

## 1. Introduction

This document catalogs edge cases that could cause incorrect behavior, degraded user experience, data corruption, or system failure in AstraPlanner. Each edge case is documented with the scenario description, expected system behavior, implementation notes, and priority (P0 = must handle at MVP, P1 = must handle before enterprise GA, P2 = handle in subsequent releases).

An edge case is distinct from a bug: it is a valid but unusual input or state that the system must handle gracefully. Many of these scenarios occur regularly in production logistics environments -- they are "edge" cases only from a software design perspective, not from an operational perspective.

---

## 2. Category 1: Demand Edge Cases

### EC-D1: Zero Demand Day (Holiday / Shutdown)

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A site has zero forecasted demand for a day (e.g., Christmas Day, annual maintenance shutdown), but the site is not fully closed. Skeleton crew is needed for security, maintenance, or receiving emergency shipments. The demand feed shows 0 across all processes. |
| **Expected Behavior** | The system should not produce a "zero headcount" plan. Instead: (1) Check the site's `minimum_staffing_rules` configuration, which defines skeleton crew requirements per process or per site regardless of demand. (2) Generate a plan with only the minimum staffing levels populated. (3) If no minimum staffing rules are configured, generate a plan with 0 headcount but surface a warning: "Zero demand detected for [Site] on [Date]. No minimum staffing rules are configured. Confirm this site is fully closed or configure skeleton crew requirements." |
| **Implementation Notes** | The optimization engine must distinguish between "demand is zero and no plan needed" vs. "demand is zero but minimum staffing applies." Add a `site_closure_calendar` table that marks dates as `OPEN`, `SKELETON`, or `CLOSED`. When a day is marked `SKELETON`, the solver uses `minimum_staffing_rules` instead of demand-driven FTE calculations. When `CLOSED`, the solver produces an empty plan with no warnings. When `OPEN` and demand is zero, the warning fires. |
| **Priority** | P0 |

### EC-D2: Demand Spike Beyond Physical Capacity

| Attribute | Detail |
|-----------|--------|
| **Scenario** | Demand forecast for a site exceeds the site's maximum physical capacity. Example: a fulfillment center with 150 picking stations receives demand requiring 200 simultaneous pickers. Even with overtime and temps, there are not enough workstations, dock doors, or staging areas to accommodate the required headcount. |
| **Expected Behavior** | (1) The solver should detect the infeasibility and return a partial plan with a clear infeasibility report: "Demand requires 200 pickers but site maximum capacity is 150 picking stations. Plan covers 75% of demand. Remaining 25% (12,400 units) requires capacity expansion or demand redistribution." (2) If cross-site balancing is enabled, suggest redistributing excess demand to nearby sites with available capacity. (3) Surface recommendations: add a shift, extend operating hours, or request demand deferral. (4) Never silently drop demand -- every unit of demand must be either planned or explicitly flagged as unplannable. |
| **Implementation Notes** | Each site has a `max_capacity` configuration per process (e.g., max simultaneous headcount per zone). The solver includes these as hard constraints. When infeasibility is detected, the solver switches to a "maximize coverage" objective: assign as many employees as possible within capacity constraints, then report the gap. Infeasibility detection should trigger within 2 seconds, not after a full solver timeout. Use a pre-solve check: `if required_FTE[process] > max_capacity[process]: flag infeasible before solving`. |
| **Priority** | P0 |

### EC-D3: Negative Demand Adjustment (Cancellation Wave)

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A large customer cancels orders mid-day, reducing demand by 40% after the plan is already published and partially executed. Employees are already on the floor, shifts are in progress, and the original plan called for 120 headcount but now only 72 are needed. Sending 48 employees home has labor law implications (reporting time pay, minimum shift guarantees). |
| **Expected Behavior** | (1) The system detects the demand drop via the automatic re-plan trigger (demand deviation > 15% threshold). (2) Generate a revised plan that accounts for: (a) employees already on shift (cannot un-schedule past hours); (b) minimum shift length guarantees per jurisdiction and contract; (c) reporting time pay obligations. (3) Surface three options to the manager: (a) "Send home early" -- list employees who can be released with cost implications; (b) "Reassign to other work" -- redirect excess headcount to training, housekeeping, or cross-process support; (c) "Do nothing" -- keep current staffing and absorb the cost. (4) Log the demand adjustment as a planning event for post-shift analysis. |
| **Implementation Notes** | The re-planner must be aware of `shift_in_progress` state. Already-worked hours are treated as sunk. The solver only optimizes remaining hours. `Minimum_shift_guarantee` is a hard constraint (e.g., California: 50% of scheduled shift or 2 hours, whichever is greater). Build a `demand_adjustment_event` audit record linking the original demand, the revised demand, the plan delta, and the chosen manager action. |
| **Priority** | P1 |

### EC-D4: Split Demand (Front-Loaded Arrival Pattern)

| Attribute | Detail |
|-----------|--------|
| **Scenario** | Forecasted demand for the day is 10,000 units evenly distributed across an 8-hour shift, but actual demand arrives as: 6,000 units in the first 2 hours, 2,000 in hours 3-4, and 2,000 in hours 5-8. The staffing plan based on the even distribution is misaligned: understaffed in the morning and overstaffed in the afternoon. |
| **Expected Behavior** | (1) If the system has intra-day demand telemetry (WMS scan rates, order release timestamps), detect the deviation from the forecasted demand curve within 30 minutes. (2) Trigger a mid-shift rebalance: suggest pulling afternoon-scheduled employees forward (if available and willing) or suggest reallocating morning overstaffing to other processes. (3) For future planning, surface the historical arrival pattern: "Demand at [Site] consistently arrives 60% in the first 2 hours. Consider adjusting the demand smoothing profile from 'even' to 'historical_curve'." (4) If operating in operational planning horizon (0-7 days), automatically apply the historical curve to future plans for this site. |
| **Implementation Notes** | Requires integration with real-time demand telemetry (WMS scan events). The demand smoothing module already supports a "historical profile" mode -- this edge case validates that the profile is being learned and applied. The mid-shift rebalancer needs a `reassignment_cost` model: moving an employee mid-shift has a productivity penalty (context switch, relocation time) estimated at 15-30 minutes of lost output. The rebalancer should only suggest moves where the benefit exceeds the cost. |
| **Priority** | P1 |

### EC-D5: New Demand Type Not Mapped to Any Process

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A demand feed includes a new demand type that does not match any configured process in the site's process catalog. Example: the WMS starts sending "RETURNS_LIQUIDATION" demand, but the site has only configured processes for "RETURNS_PROCESSING" and "RETURNS_RESTOCKING." The system cannot compute workload for a demand type it does not know how to staff. |
| **Expected Behavior** | (1) The ingestion pipeline flags the unmapped demand type during validation. (2) The demand record is quarantined in an `unmapped_demand` holding table -- not discarded, not included in planning. (3) An alert is generated: "New demand type 'RETURNS_LIQUIDATION' received from [Source] for [Site]. 450 units quarantined. Map this demand type to a process or create a new process." (4) The admin UI surfaces a mapping interface: assign the new type to an existing process (with a conversion factor) or create a new process. (5) Once mapped, the quarantined records are reprocessed automatically. (6) If the unmapped demand exceeds 10% of total site demand, escalate the alert to critical. |
| **Implementation Notes** | The ingestion pipeline's validation stage checks `demand_type` against the `process_demand_mapping` table. Unmapped types go to `quarantine_demand` with `quarantine_reason = 'UNMAPPED_DEMAND_TYPE'`. The quarantine table has a retention of 30 days; unresolved records older than 30 days are archived with a warning. The mapping interface should suggest likely process matches using string similarity and historical patterns. |
| **Priority** | P0 |

### EC-D6: Demand from New Site with No Historical Data (Cold Start)

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A new distribution center opens. It has no historical demand patterns, no proven productivity standards, and no calibrated conversion factors. The planning engine relies on historical data for demand smoothing profiles, productivity rate calibration, and absence rate estimation -- none of which exist for this site. |
| **Expected Behavior** | (1) The system uses "peer site" benchmarks: identify sites in the same tenant with similar characteristics (same processes, similar capacity, same region) and use their averages as starting assumptions. (2) If no peer sites exist (first site in the tenant), use industry benchmarks from the vertical configuration pack. (3) All plans generated for a new site carry a "cold start" flag and a prominent UI banner: "Plans for [Site] are based on estimated parameters. Accuracy will improve after 2-4 weeks of operational data." (4) After 2 weeks of operation, the system automatically compares assumed vs. actual parameters and prompts the admin to update. (5) Continuously refine productivity rates using actual throughput data as it accumulates. |
| **Implementation Notes** | Add a `site_maturity` field: `COLD_START` (< 2 weeks of data), `WARMING` (2-8 weeks), `CALIBRATED` (8+ weeks with validated parameters). The optimization engine includes wider buffers for `COLD_START` sites (default 15% overstaffing vs. 5% for calibrated sites). The peer-matching algorithm uses site attributes: `process_set`, `capacity_tier`, `region`, `vertical`. Similarity is computed as a weighted Jaccard index across these attributes. |
| **Priority** | P0 |

---

## 3. Category 2: Workforce Edge Cases

### EC-W1: Employee with No Skills

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A new hire has been added to the HRIS and synced to AstraPlanner, but has not yet been assessed or trained on any process. Their skill record is empty. The solver cannot assign them to any process because every process requires at least Level 1 skill. |
| **Expected Behavior** | (1) The employee is flagged as `UNASSIGNABLE` in the planning view with reason "No skills recorded." (2) The employee is excluded from the available pool for optimization but still counted in headcount reports (total headcount vs. deployable headcount). (3) A recommendation is generated: "12 employees have no recorded skills and cannot be scheduled. Assign initial skills or schedule orientation training." (4) If the site has a "General Labor" or "Training" process configured, the employee can be assigned there without skill requirements. (5) The system tracks how long employees remain in `UNASSIGNABLE` status and escalates after 5 business days. |
| **Implementation Notes** | The employee pool filtering step (before solver invocation) separates employees into `assignable` and `unassignable` sets. The `unassignable` set feeds into a diagnostic report, not the solver. Add a `default_assignment_process` site configuration option that acts as a catch-all for employees without skills. This process has no skill requirements and is typically mapped to orientation, training, or general labor. |
| **Priority** | P0 |

### EC-W2: Employee Qualified for Only One Process (Single Point of Failure)

| Attribute | Detail |
|-----------|--------|
| **Scenario** | An employee is the only person qualified to operate a specialized process (e.g., hazardous materials handling, forklift battery maintenance, refrigeration unit inspection). If that employee is absent, the process cannot be staffed. The solver either leaves the process unstaffed (violating a hard constraint) or the plan becomes infeasible. |
| **Expected Behavior** | (1) The system identifies single-point-of-failure (SPOF) risks during plan generation and configuration review. (2) A persistent warning is displayed: "Process 'HAZMAT_RECEIVING' has only 1 qualified employee (John Smith). Recommend cross-training at least 2 additional employees." (3) If the SPOF employee is absent, the plan flags the process as `UNSTAFFABLE` with a clear reason, rather than silently omitting it. (4) The cross-training recommendation includes candidates: employees with the closest related skills and available training capacity. (5) A SPOF risk report is available at site and organization level, showing all processes with < N qualified employees (configurable threshold, default 3). |
| **Implementation Notes** | After each plan generation, run a SPOF analysis: for each process, count qualified employees at each proficiency level. If `count < spof_threshold` (default 3), flag a SPOF risk. Store SPOF risks in a `workforce_risk` table linked to process and site. The cross-training recommendation engine ranks candidates by: (a) number of related skills already held, (b) training time required (based on skill prerequisites), (c) current utilization (prefer cross-training underutilized employees). |
| **Priority** | P1 |

### EC-W3: All Employees at Maximum Hours

| Attribute | Detail |
|-----------|--------|
| **Scenario** | Every employee at a site has already been scheduled to their maximum weekly hours (e.g., 40 regular + 10 overtime = 50 hours max per policy). Additional demand arrives but there is no labor capacity available. The solver has no feasible way to cover the demand within the hours constraints. |
| **Expected Behavior** | (1) The solver reports infeasibility: "All employees at [Site] have reached maximum weekly hours. 240 labor hours of demand remain uncovered across 4 processes." (2) The system suggests remedies in priority order: (a) Request temporary labor (if temp agency integration is configured); (b) Transfer employees from other sites (if cross-site sharing is enabled and nearby sites have surplus); (c) Extend maximum hours (requires manager override and compliance check against labor law limits); (d) Defer non-critical demand to the next planning period. (3) Each remedy includes estimated cost and compliance implications. (4) The plan is published as a partial plan with uncovered demand clearly marked. |
| **Implementation Notes** | The solver's infeasibility analyzer categorizes unsatisfied demand by process and priority. `Critical` processes (e.g., receiving perishable goods) are prioritized over `flexible` processes (e.g., inventory cycle counts). The remedy engine is a rule-based recommender that evaluates each option against the site's configuration: temp agency contracted? Cross-site sharing enabled? Hours extension allowed by local law? Each remedy has a `feasibility_check` function and a `cost_estimate` function. |
| **Priority** | P0 |

### EC-W4: Mass Absence Event (> 30% Absent)

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A severe weather event, public transit failure, or illness outbreak causes more than 30% of the workforce to be absent on a single day. The published plan is immediately invalid. Normal absence handling (backfill from available pool) is insufficient because the available pool is depleted. |
| **Expected Behavior** | (1) The system detects the mass absence when the absence count exceeds a configurable threshold (default: 20% of scheduled headcount). (2) Trigger an emergency re-plan that: (a) Identifies which processes can be suspended without safety or compliance risk; (b) Concentrates remaining staff on critical processes; (c) Extends shifts for willing employees (with overtime cost projections); (d) Activates temp agency callouts (if configured). (3) Generate a "mass absence impact report" for management: expected throughput reduction, estimated cost impact, customer service implications (e.g., "Expected shipping delay of 4-6 hours for 2,300 orders"). (4) The UI enters an "emergency mode" with a simplified decision interface: red/yellow/green process status, drag-and-drop reassignment, one-click temp agency request. |
| **Implementation Notes** | Define `absence_severity_levels`: `NORMAL` (< 10%), `ELEVATED` (10-20%), `CRITICAL` (20-30%), `EMERGENCY` (> 30%). Each level triggers different system behaviors. Emergency re-plans use a simplified solver configuration: relax soft constraints (preference continuity, zone familiarity), maintain only hard constraints (skills, safety, compliance). The emergency mode UI is a separate view optimized for rapid decisions under stress -- minimal data, maximum actionability. Process criticality is configured per site: `CRITICAL` (must staff), `IMPORTANT` (staff if possible), `DEFERRABLE` (can suspend). |
| **Priority** | P1 |

### EC-W5: Employee Assigned to Multiple Sites

| Attribute | Detail |
|-----------|--------|
| **Scenario** | An employee is registered at two sites 45 minutes apart and is theoretically available at both. Site A schedules them for a morning shift (6 AM - 2 PM) and Site B schedules them for an afternoon shift (2 PM - 10 PM). Without cross-site coordination, the employee has zero break time and 45 minutes of unpaid travel -- a labor law violation in most jurisdictions. Alternatively, both sites might schedule the employee for the same time slot, creating a double-booking. |
| **Expected Behavior** | (1) During plan generation, the cross-site solver detects multi-site employees and applies travel-time constraints. If Site A ends at 2 PM and travel to Site B takes 45 minutes, Site B cannot start before 2:45 PM (plus any mandatory rest period). (2) Double-booking is a hard constraint violation: an employee can be assigned to exactly one site per time slot. (3) The system maintains a `travel_time_matrix` between sites. For employees at multiple sites, minimum gap between assignments is `travel_time + rest_period`. (4) Reports show multi-site employees and their cross-site utilization. (5) If an employee is over-committed across sites, the solver allocates them to the site with the highest need (or per the employee's primary site designation) and surfaces the conflict for manager resolution. |
| **Implementation Notes** | The employee data model includes `primary_site_id` and a `secondary_sites` array. The solver receives multi-site employees with their site eligibility and the travel time matrix. The constraint is: `for each employee e, for each pair of assignments (a1 at site s1, a2 at site s2): a2.start >= a1.end + travel_time(s1, s2) + rest_period`. The travel time matrix is initially populated manually by the admin; future enhancement could use a mapping API. Double-booking prevention is enforced at the database level with a unique constraint on `(employee_id, date, time_slot)` across all sites. |
| **Priority** | P0 |

### EC-W6: Contract Change Mid-Planning Period

| Attribute | Detail |
|-----------|--------|
| **Scenario** | An employee's contract changes from part-time (20 hrs/week) to full-time (40 hrs/week) effective Wednesday of a planning week. Plans published Monday through Sunday were based on 20 hrs/week. The change should be reflected in Thursday-Sunday plans but Monday-Wednesday plans should not be retroactively altered. |
| **Expected Behavior** | (1) When an employee record is updated via HRIS sync, the system detects changes to hours-impacting fields (contract type, max hours, availability pattern). (2) For already-executed plan periods (Monday-Wednesday), no changes are made. (3) For future plan periods (Thursday-Sunday), trigger a re-plan that incorporates the new availability. (4) The planner is notified: "Contract change for [Employee]: part-time -> full-time effective [Date]. Plans for [Date]-[End of period] should be reviewed. Auto-re-plan available." (5) Historical records retain the original contract terms for audit purposes; the change is versioned. |
| **Implementation Notes** | Employee contract changes are tracked in an `employee_contract_history` table with `effective_from` and `effective_to` dates. The solver pulls the contract terms that are effective for each planning day, not just the current contract. The re-plan trigger checks: `if contract_change.effective_date <= current_plan.end_date AND contract_change.effective_date > today: suggest_replan()`. Retroactive changes (effective date in the past) are allowed for record-keeping but do not trigger re-planning -- they only update historical reports. |
| **Priority** | P1 |

### EC-W7: Employee Returns from Leave Mid-Week

| Attribute | Detail |
|-----------|--------|
| **Scenario** | An employee was on approved leave (parental, medical, sabbatical) and returns on Wednesday of a planning week. The plan published for the full week excluded them entirely. They are now available for Thursday-Sunday and should be productively assigned, but the existing plan is already optimized without them. |
| **Expected Behavior** | (1) The leave management system (or HRIS sync) updates the employee's availability status from `ON_LEAVE` to `AVAILABLE` with an effective date. (2) The system adds the returning employee to the available pool for remaining days. (3) Rather than full re-optimization (which could disrupt existing assignments), run an incremental optimization: keep all current assignments fixed, find the best assignment for the returning employee using remaining capacity gaps. (4) Notify the supervisor: "[Employee] returns from leave on [Date] and has been assigned to [Process/Zone]. Review and adjust if needed." (5) If the employee's skills may need refreshing after extended leave, flag this: "Employee was on leave for 8 weeks. Consider a refresher assignment before returning to full duties." |
| **Implementation Notes** | The incremental optimizer is a lighter-weight solver pass that adds employees to a fixed plan. It operates on the residual capacity: `remaining_need[process][slot] = planned_FTE[process][slot] - assigned_FTE[process][slot]`. The returning employee is assigned to slots where remaining_need is highest, weighted by their skill match. For extended leaves (> 4 weeks), the system applies a `skill_freshness_penalty`: reduce the employee's effective skill level by one tier for the first week back, then restore automatically. |
| **Priority** | P1 |

### EC-W8: Seasonal Workforce Ramp (Bulk Onboarding)

| Attribute | Detail |
|-----------|--------|
| **Scenario** | Peak season requires hiring 500 temporary workers in 2 weeks. These employees need to be added to the system, assigned initial skills (typically Level 1-2 in 2-3 processes), and included in planning. The HRIS import may arrive as a single CSV with 500 rows. The system must handle the bulk import without timeout, assign these employees to training schedules during their first week, and include them in production plans at reduced productivity starting week 2. |
| **Expected Behavior** | (1) Bulk import of 500 employees completes within 5 minutes with progress indication. (2) Validation errors are reported per-row (not all-or-nothing): "478 of 500 employees imported successfully. 22 rows have errors (see details)." (3) Imported employees are tagged as `SEASONAL` with contract start/end dates. (4) For week 1, these employees are auto-assigned to training slots if a training process is configured. (5) For week 2+, they enter the production pool at reduced productivity (configurable: default 60% of standard in week 2, 80% in week 3, 100% in week 4). (6) The solver accounts for the ramp-up curve when computing FTE requirements: 1 seasonal employee at 60% productivity = 0.6 FTE, not 1.0 FTE. |
| **Implementation Notes** | Bulk import uses a batch processing pipeline: (a) parse CSV to staging table; (b) validate each row against schema and referential integrity; (c) import valid rows in batches of 50 within a transaction; (d) report errors for invalid rows. The `employee` table includes a `productivity_multiplier` field that is initially set based on the ramp curve: `ramp_factor = min(1.0, 0.4 + 0.2 * weeks_since_start)`. The solver multiplies the employee's effective productivity by this factor. The ramp curve is configurable per site and can be overridden per employee by a supervisor who observes faster or slower learning. |
| **Priority** | P1 |

---

## 4. Category 3: Planning Edge Cases

### EC-P1: Circular Dependency in Constraints

| Attribute | Detail |
|-----------|--------|
| **Scenario** | An administrator configures two rules that create a circular dependency: Rule A says "If Process X is staffed, Process Y must also be staffed." Rule B says "Process Y can only be staffed if Process Z is active." Rule C says "Process Z requires output from Process X to begin." If no employees are initially assigned to any of these processes, the solver cannot determine where to start -- each process requires another to be staffed first. |
| **Expected Behavior** | (1) The constraint validation engine detects the circular dependency during rule creation (not at solve time). (2) When the admin saves Rule C, the system reports: "Circular dependency detected: X -> Y -> Z -> X. At least one process in the chain must be independently staffable. Please designate a 'lead process' or remove one of the dependency rules." (3) If the circular dependency is not caught at configuration time (e.g., imported rules), the solver detects it during the pre-solve phase and returns a clear error: "Constraint cycle detected involving processes [X, Y, Z]. Plan cannot be generated. Contact administrator." (4) The system suggests resolution options: (a) mark one process as "always staffed (minimum 1 FTE)"; (b) convert one hard dependency to a soft preference. |
| **Implementation Notes** | Represent process dependency rules as a directed graph. During constraint validation, run a topological sort. If the sort fails (cycle detected), enumerate the cycle using Tarjan's algorithm and report the involved processes and rules. Store the dependency graph in memory during validation; it does not need persistence. For constraints that arrive via bulk import or API, run the same cycle detection as a post-import validation step. |
| **Priority** | P1 |

### EC-P2: No Feasible Solution Exists

| Attribute | Detail |
|-----------|--------|
| **Scenario** | The combination of hard constraints (skill requirements, labor law limits, availability windows, site capacity) and demand makes it mathematically impossible to generate a plan where all constraints are satisfied. Example: demand requires 50 FTEs with forklift certification, but only 30 certified employees are available, and the certification is a hard safety constraint that cannot be relaxed. |
| **Expected Behavior** | (1) The solver detects infeasibility within the first 10 seconds (not after a full 30-minute solve attempt). (2) The infeasibility analysis identifies the minimal set of conflicting constraints (the "irreducible infeasible set" or IIS). (3) The system reports: "No feasible plan exists. The following constraints cannot all be satisfied simultaneously: [list constraints]. Recommended resolutions: [options]." (4) Resolution options are ranked by impact and feasibility: (a) relax a soft constraint (e.g., allow overtime beyond normal cap); (b) reduce demand target (communicate to customer about capacity); (c) bring in temporary certified labor; (d) allow uncertified employees with supervision (if regulations permit). (5) If the user approves a constraint relaxation, the solver re-runs with the relaxed constraint and reports which constraint was relaxed in the final plan. |
| **Implementation Notes** | Modern constraint solvers (OR-Tools, Gurobi) support IIS computation. When the solver returns `INFEASIBLE`, invoke IIS analysis to find conflicting constraints. Map solver constraint IDs back to business-level rules using the constraint metadata. The resolution recommender uses a priority ordering: prefer relaxing preferences over hard constraints, prefer increasing supply over reducing demand, prefer temporary measures over permanent changes. Log all infeasibility events for trend analysis -- frequent infeasibility at a site indicates structural capacity problems. |
| **Priority** | P0 |

### EC-P3: Plan Published, Then Demand Changes

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A plan for next Monday was published and communicated to employees on Thursday. On Friday, the demand forecast is updated significantly (e.g., a major customer adds a rush order). The plan needs to change, but employees have already arranged childcare, transportation, and second jobs based on the published schedule. Predictive scheduling laws (Oregon, NYC, San Francisco) require compensation for schedule changes within 7-14 days of the shift. |
| **Expected Behavior** | (1) When demand changes trigger a re-plan for an already-published period, the system enters "minimum disruption" mode. (2) Minimum disruption mode: keep all current assignments as soft constraints with high weight. Only change assignments that are absolutely necessary to cover the new demand. (3) Calculate a "disruption score": number of employees whose schedules change. Display this prominently to the manager: "Re-plan would modify schedules for 23 of 140 employees." (4) If predictive scheduling laws apply (configured per site/jurisdiction), calculate and display the penalty cost: "Schedule change penalties: 23 employees x $75 per change = $1,725." (5) Let the manager compare: cost of penalty vs. cost of not meeting demand. Provide a side-by-side view of original plan vs. proposed plan. (6) Track version history: Plan v1 (published), Plan v2 (proposed revision), Plan v2 (approved/rejected). |
| **Implementation Notes** | The "minimum disruption" solver mode uses the published plan as the starting solution and adds a penalty term to the objective function for every assignment change: `disruption_cost = SUM(change_penalty[employee] * is_changed[employee])`. The `change_penalty` varies by jurisdiction and contract type. The solver minimizes `demand_coverage_gap + lambda * disruption_cost` where `lambda` is configurable (higher = less disruption, more demand gap). Plan versioning uses a `plan_version` table with `version_number`, `status` (draft/published/superseded), `change_reason`, and `disruption_report`. |
| **Priority** | P0 |

### EC-P4: Concurrent Plan Editing by Multiple Managers

| Attribute | Detail |
|-----------|--------|
| **Scenario** | Two shift supervisors open the same plan in the planning workbench simultaneously. Manager A moves Employee X from Zone A to Zone B. Manager B, unaware of A's change, assigns Employee Y to Zone A and removes Employee X from Zone A (believing X is still there). Both save their changes. The resulting plan has inconsistencies: Employee X is in Zone B (per A's edit) but was also removed from Zone A by B (redundant), and Zone A may now have a staffing gap. |
| **Expected Behavior** | (1) **Optimistic locking with conflict detection**: when Manager A saves, the plan version increments from v1 to v2. When Manager B attempts to save, the system detects that B's changes were based on v1 but the current version is v2. (2) Manager B receives a conflict notification: "This plan was modified by [Manager A] at [timestamp]. Your changes conflict with theirs. Please review and resolve." (3) The conflict resolution UI shows a three-way diff: original plan (v1), Manager A's changes (v2), and Manager B's proposed changes. Manager B can accept A's changes, override them, or merge. (4) Real-time presence indicators: "Manager A is currently viewing this plan" -- warning before conflicts occur. (5) Cell-level locking option: Manager A locks the employees they are editing, preventing B from modifying the same assignments. |
| **Implementation Notes** | Each plan has a `version` counter (integer, auto-incrementing). Every edit includes the version the edit is based on. On save: `UPDATE plans SET ... WHERE plan_id = ? AND version = ?`. If 0 rows updated, the version has changed -> conflict. Real-time presence uses Supabase Realtime (Presence feature): broadcast user identity and cursor position on the plan grid. Cell-level locking uses Supabase Realtime Broadcast: when a user clicks an assignment cell, broadcast a `lock` event with `(plan_id, employee_id, slot_id, user_id)`. Other clients shade locked cells and disable editing. Locks auto-expire after 60 seconds of inactivity. |
| **Priority** | P1 |

### EC-P5: Plan Spans Daylight Saving Time Change

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A planning period includes the daylight saving time (DST) transition. In spring (clocks forward), the night shift on transition day is 7 hours instead of 8. In fall (clocks back), the night shift is 9 hours instead of 8. Plans built on the assumption of 8-hour shifts produce incorrect labor hour calculations. An employee on a "10 PM - 6 AM" shift during spring-forward actually works 7 hours but may expect 8 hours of pay. |
| **Expected Behavior** | (1) The system stores all times in UTC internally and converts to local time for display. (2) Shift definitions use wall-clock times (e.g., "10 PM - 6 AM local"), but duration calculations use UTC timestamps, automatically accounting for DST. (3) On DST transition days, the system flags affected shifts: "Night shift on [Date] is 7 hours (DST spring-forward) instead of the standard 8 hours. Payroll adjustment may be required." (4) If labor law or contract requires 8 hours of pay for a DST-shortened shift, the system notes this as "paid hours = 8, worked hours = 7" for payroll export. (5) The staffing calculation adjusts: a 7-hour night shift requires proportionally more FTEs to cover the same output if demand is constant. |
| **Implementation Notes** | All `datetime` fields in the database use `timestamptz` (timestamp with time zone). Shift templates define `start_time` and `end_time` in local wall-clock time plus `timezone`. Duration is calculated as `UTC(end_time, timezone) - UTC(start_time, timezone)`, which automatically handles DST. Add a `dst_transition` flag to the date dimension table, populated by a timezone library (e.g., `luxon`, `date-fns-tz`). When `dst_transition = true`, run additional validation on shift durations and surface warnings. Maintain separate `worked_hours` and `paid_hours` fields on shift assignments for DST days. |
| **Priority** | P1 |

### EC-P6: Site Timezone Differs from HQ Timezone

| Attribute | Detail |
|-----------|--------|
| **Scenario** | An organization's HQ is in New York (ET), but they have sites in Los Angeles (PT), London (GMT/BST), and Singapore (SGT). A corporate planner at HQ views plans for all sites. When they see "8:00 AM shift start," they need to know: is that 8 AM at the site or 8 AM at HQ? Cross-site reports aggregating headcount "at 2 PM" must reconcile different time zones. A demand deadline of "midnight" means different absolute times at different sites. |
| **Expected Behavior** | (1) All plan displays default to the site's local timezone. The UI clearly labels the timezone: "Los Angeles DC (PT, UTC-8)." (2) The user can toggle to their own timezone or UTC for cross-site comparison. (3) Cross-site reports offer three options: (a) each site in its own timezone; (b) all sites normalized to a reference timezone (selectable); (c) all sites in UTC. (4) Demand deadlines and cut-off times are always stored and communicated with explicit timezone: "Order cutoff: 11:59 PM ET" not "midnight." (5) The planning engine uses UTC for all calculations and only converts to local time at the UI layer. |
| **Implementation Notes** | Every `site` record has a `timezone` field (IANA timezone name, e.g., `America/Los_Angeles`). All planning computations use UTC. The API returns timestamps in UTC; the frontend converts using the site's timezone (for plan views) or the user's timezone (for notifications, personal views). Cross-site report queries: aggregate by UTC time slot, then label axes with the selected timezone. Never store local time without timezone context. The user profile includes a `preferred_timezone` setting. |
| **Priority** | P0 |

### EC-P7: Plan Approval Delayed Past Effective Date

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A plan for Monday requires manager approval by Friday. The manager is out of office and does not approve by Monday morning. Employees arrive for their shift with no approved plan. The system must decide whether to use the unapproved draft, fall back to the previous week's plan, or leave employees unassigned. |
| **Expected Behavior** | (1) The system sends escalating reminders: 48 hours before effective date (email), 24 hours (email + in-app), 4 hours (SMS/push to approver and backup approver). (2) A backup approver is configured per site (typically the approver's manager or a peer). If the primary approver has not acted by the escalation threshold (configurable, default: 12 hours before effective date), the backup approver receives approval authority. (3) If no approval by effective date, the system applies the configured fallback policy per site: (a) "Auto-approve draft" -- the draft becomes the active plan with a flag "auto-approved due to missed deadline"; (b) "Repeat last plan" -- the previous period's plan is cloned and applied; (c) "Block" -- no plan is active; employees see "no schedule available, contact your manager." (4) All auto-approval and fallback events are logged and surfaced in management reports. |
| **Implementation Notes** | The approval workflow has states: `DRAFT` -> `PENDING_APPROVAL` -> `APPROVED` / `REJECTED` / `AUTO_APPROVED`. A scheduled job runs every hour checking for plans where `effective_date - NOW() < escalation_threshold AND status = PENDING_APPROVAL`. The fallback policy is a site-level configuration: `plan_approval_fallback_policy ENUM('AUTO_APPROVE', 'REPEAT_LAST', 'BLOCK')`. The `REPEAT_LAST` option clones the most recent approved plan and adjusts dates. The clone operation must also handle any employees whose availability has changed since the original plan. |
| **Priority** | P1 |

---

## 5. Category 4: System Edge Cases

### EC-S1: Integration Source Returns Corrupt Data

| Attribute | Detail |
|-----------|--------|
| **Scenario** | An HRIS API returns employee records where numeric fields contain strings ("N/A" instead of a number for hours), dates are in unexpected formats (MM/DD/YYYY instead of ISO-8601), or required fields are null. The WMS sends demand data with negative quantities or quantities exceeding plausible maximums (e.g., 999,999,999 units). |
| **Expected Behavior** | (1) The ingestion pipeline validates every field against the expected schema before processing. (2) Records failing validation are quarantined in a `data_quarantine` table with the raw data, source system, timestamp, and specific validation errors. (3) Valid records in the same batch are processed normally -- a single bad record does not block the entire import. (4) A data quality alert is generated: "HRIS sync completed: 4,892 records imported, 23 quarantined (12 invalid dates, 8 null required fields, 3 out-of-range values)." (5) Quarantined records are surfaced in an admin data quality dashboard where they can be manually corrected and re-imported or permanently discarded. (6) If quarantined records exceed 5% of the batch, the entire batch is flagged for review (possible systemic issue with the source). |
| **Implementation Notes** | Each integration adapter defines a validation schema using a schema library (e.g., Zod). Validation is applied per-record in the adapter layer before records reach the core data model. Quarantine records store: `raw_payload` (JSONB), `source_system`, `validation_errors` (JSONB array), `quarantine_timestamp`, `resolution_status` (PENDING/CORRECTED/DISCARDED), `resolved_by`, `resolved_at`. The quarantine dashboard shows trends over time to identify integration partners with deteriorating data quality. |
| **Priority** | P0 |

### EC-S2: AI Service (Claude) is Down

| Attribute | Detail |
|-----------|--------|
| **Scenario** | The Anthropic API is unreachable (outage, rate limit exceeded, network partition). The setup wizard cannot generate AI-guided configuration suggestions, plan explanations are unavailable, and AI recommendations do not generate. If the system is tightly coupled to Claude, core functionality is blocked. |
| **Expected Behavior** | (1) Core planning functionality (demand normalization, workload computation, FTE calculation, assignment optimization) is completely independent of the AI service and continues to operate normally. (2) AI-dependent features degrade gracefully: (a) Setup wizard falls back to a template-based flow without AI suggestions (more manual, but functional); (b) Plan explanations fall back to structured template-based explanations generated from assignment metadata ("Assigned to Picking because: highest skill match, process has open capacity"); (c) Recommendations are queued and generated when the service recovers. (3) The UI displays an unobtrusive banner: "AI assistant is temporarily unavailable. Core planning functions are unaffected." (4) The system retries Claude API calls with exponential backoff (1s, 2s, 4s, 8s, max 60s) and circuit breaker (open after 5 failures, half-open after 5 minutes). |
| **Implementation Notes** | The AI service layer has a `HealthStatus` enum: `HEALTHY`, `DEGRADED` (high latency or partial errors), `UNAVAILABLE`. Health is determined by a background probe that sends a lightweight health-check prompt every 60 seconds. When `UNAVAILABLE`, all AI-dependent UI components switch to their fallback implementations. Fallback implementations are maintained and tested as first-class code paths, not afterthoughts. Each AI-dependent feature has a feature flag: `ai.setup_wizard.enabled`, `ai.plan_explanations.enabled`, `ai.recommendations.enabled`. These can be individually toggled. |
| **Priority** | P0 |

### EC-S3: Database Failover During Plan Generation

| Attribute | Detail |
|-----------|--------|
| **Scenario** | The primary PostgreSQL database fails over to a replica while a plan generation job is in progress. The plan generation involves multiple writes: saving the plan header, saving individual assignments (potentially thousands of rows), updating employee schedule records, and creating audit log entries. If the failover interrupts the write sequence, the database may contain a partial plan: header exists but only 60% of assignments were written. |
| **Expected Behavior** | (1) Plan generation operates within a database transaction. Either all writes succeed or none do. A failover during the transaction causes a rollback. (2) The plan generation job detects the connection failure and retries from the beginning (not from the point of failure). (3) The user sees: "Plan generation was interrupted by a system event. Retrying automatically. Your plan will be ready shortly." (4) If retry succeeds, the user is notified and the plan is displayed. If retry fails (3 attempts over 5 minutes), the system reports: "Plan generation failed due to a system issue. Our team has been notified. You can retry manually." (5) No partial plans are ever visible to users. A plan is either `GENERATING`, `COMPLETE`, or `FAILED`. |
| **Implementation Notes** | Plan generation uses a single database transaction for the write phase. The transaction includes: `INSERT plan_header`, `INSERT plan_assignments (batch)`, `INSERT plan_audit_log`, `UPDATE plan_header SET status = 'COMPLETE'`. If the transaction fails for any reason, the plan status remains `GENERATING`. A background cleanup job detects plans in `GENERATING` status for more than 15 minutes and transitions them to `FAILED` with a notification. The plan generation job is idempotent: retrying with the same inputs produces the same outputs (deterministic solver with fixed random seed). |
| **Priority** | P0 |

### EC-S4: User with Permissions to Multiple Tenants

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A consulting firm or corporate parent has users who need access to multiple tenant organizations (e.g., a regional VP overseeing three distribution companies, each as a separate tenant). The user must be able to switch between tenants without logging out. Data isolation must be absolute: while viewing Tenant A's data, no queries should be able to return Tenant B's data, even by accident. |
| **Expected Behavior** | (1) The user's profile includes a list of `authorized_tenants` with role assignments per tenant (may have different roles in different tenants). (2) A tenant switcher UI allows selecting the active tenant. Switching tenant reloads the application context: navigation, data, filters, and permissions all reflect the selected tenant. (3) The active tenant is stored in the session (server-side, not client-side to prevent tampering). All API calls include the active tenant in the request context (set by middleware, not by the client). (4) RLS policies ensure that database queries are scoped to `current_setting('app.tenant_id')`, which is set per-connection by the API middleware. (5) Cross-tenant reporting (if authorized) is handled by a separate analytics service that explicitly queries multiple tenants and labels results by tenant. It never runs in the context of a single tenant's RLS policies. |
| **Implementation Notes** | The session stores `active_tenant_id`. API middleware sets `SET LOCAL app.tenant_id = ?` on every database connection before executing queries. RLS policies filter on `tenant_id = current_setting('app.tenant_id')::uuid`. The tenant switcher calls a dedicated endpoint that validates the user's authorization for the target tenant and updates the session. Cross-tenant queries use a service account that bypasses RLS, with explicit `WHERE tenant_id IN (...)` clauses. This service account is only used by the analytics service and is not accessible via the public API. Audit logs include `tenant_id` to track which tenant context each action occurred in. |
| **Priority** | P1 |

### EC-S5: Bulk Import with 50,000 Employees

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A large enterprise uploads a CSV file with 50,000 employee records during initial onboarding. The upload process times out after 30 seconds (Vercel serverless function limit), leaving the user with no feedback on whether the import succeeded, partially succeeded, or failed entirely. |
| **Expected Behavior** | (1) The upload endpoint accepts the file, validates the header row (schema check), and returns immediately with a `job_id` and status `PROCESSING`. (2) The actual import runs as a background job (Supabase Edge Function, Vercel background function, or dedicated worker). (3) The UI shows a progress indicator: "Importing employees: 23,456 of 50,000 processed (46%). Estimated time remaining: 3 minutes." Progress is pushed via WebSocket (Supabase Realtime). (4) On completion: "Import complete: 49,312 records imported successfully. 688 records had errors. [Download error report]." (5) The error report is a CSV with the original rows, appended with error descriptions, downloadable for correction and re-upload. (6) The import is resumable: if the job crashes mid-import, it can be retried without duplicating already-imported records (using a unique identifier per row, e.g., employee ID or national ID). |
| **Implementation Notes** | The import pipeline: (a) Client uploads file to Supabase Storage (supports files up to 5 GB). (b) Upload triggers an edge function that parses the file in streaming mode (not loading entire file into memory). (c) Records are validated and inserted in batches of 100 within transactions. (d) Progress is written to a `import_jobs` table: `(job_id, total_rows, processed_rows, success_count, error_count, status)`. (e) The client subscribes to Realtime changes on the `import_jobs` row. (f) Deduplication uses `ON CONFLICT (tenant_id, external_employee_id) DO UPDATE` to handle re-imports. The import function processes 50,000 records in approximately 3-5 minutes at a rate of 150-250 records/second including validation. |
| **Priority** | P1 |

### EC-S6: Report Generation for 1,000 Sites

| Attribute | Detail |
|-----------|--------|
| **Scenario** | A corporate executive requests a headcount summary report across all 1,000 sites for the past quarter. The report requires aggregating shift assignment data from 1,000 sites x 90 days x ~200 employees x ~3 shifts = ~54 million assignment records. Generating this report synchronously would time out and consume excessive database resources, impacting other users. |
| **Expected Behavior** | (1) Reports involving more than 50 sites or more than 30 days of historical data are automatically routed to asynchronous generation. (2) The user sees: "Generating report for 1,000 sites across 90 days. This will take approximately 5-10 minutes. You'll be notified when it's ready." (3) The report is generated against read replicas, not the primary database. (4) The completed report is stored as a downloadable file (CSV, Excel, or PDF) in Supabase Storage with a link sent via in-app notification and email. (5) The report link expires after 7 days. (6) For frequently requested reports, pre-compute the underlying aggregates on a daily schedule using materialized views, reducing generation time from minutes to seconds. |
| **Implementation Notes** | Reports are categorized by estimated cost: (a) `INSTANT` (< 5s, < 10 sites, < 7 days): run synchronously, return inline. (b) `FAST` (< 30s, < 50 sites, < 30 days): run synchronously with a loading indicator. (c) `ASYNC` (> 30s estimated): queue as background job. Cost estimation uses: `estimated_time = row_estimate * cost_per_row`. `row_estimate = sites * days * avg_employees_per_site * avg_shifts_per_day`. Pre-computed materialized views: `mv_daily_headcount_by_site` (refreshed nightly), `mv_weekly_utilization_by_process` (refreshed weekly), `mv_monthly_cost_by_region` (refreshed monthly). Reports that can be served from materialized views bypass the async pipeline entirely. |
| **Priority** | P1 |

---

## 6. Edge Case Priority Summary

| Priority | Count | Category Breakdown |
|----------|-------|-------------------|
| P0 (MVP) | 12 | Demand: 3, Workforce: 2, Planning: 3, System: 4 |
| P1 (Enterprise GA) | 16 | Demand: 3, Workforce: 6, Planning: 4, System: 3 |
| P2 (Future) | 0 | (All cataloged cases are P0 or P1) |

### P0 Edge Cases (Must Handle at MVP)

1. EC-D1: Zero demand day (skeleton crew)
2. EC-D2: Demand spike beyond physical capacity
3. EC-D5: New demand type not mapped to any process
4. EC-D6: Cold start for new site
5. EC-W1: Employee with no skills
6. EC-W3: All employees at max hours
7. EC-W5: Employee at multiple sites (double-booking prevention)
8. EC-P2: No feasible solution exists
9. EC-P3: Plan published, then demand changes
10. EC-P6: Site timezone differs from HQ timezone
11. EC-S1: Integration source returns corrupt data
12. EC-S2: AI service (Claude) is down
13. EC-S3: Database failover during plan generation

These must be handled before any production deployment because they represent scenarios that will occur in the first week of real-world use and, if mishandled, will cause immediate loss of user trust.
