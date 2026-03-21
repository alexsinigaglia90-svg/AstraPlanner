# Algorithm Strategies

## 1. Overview

AstraPlanner employs multiple solving strategies and selects among them dynamically based on problem size, constraint complexity, time budget, and solution quality requirements. No single algorithm dominates across all scenarios — greedy heuristics excel in real-time contexts, constraint programming handles complex rule environments, MIP optimizes cost precisely, and meta-heuristics explore large multi-objective landscapes. The recommended production configuration is a hybrid approach that chains these strategies.

---

## 2. Strategy 1: Greedy Constructive Heuristic

### 2.1 When to Use

| Criterion | Value |
|-----------|-------|
| Problem size | < 100 employees, < 50 time slots |
| Time budget | Interactive (< 5 seconds) |
| Constraint complexity | Low to moderate |
| Solution quality requirement | "Good enough" — 85–92% of optimal |
| Primary use case | Initial plan generation, real-time single-employee reassignment, what-if previews |

### 2.2 Algorithm

```
GREEDY-CONSTRUCT(slots, employees, constraints):
  1. Compute priority score for each unfilled slot:
       priority[s] = demand_criticality[s] * skill_scarcity[s] * time_urgency[s]
  2. Sort slots by priority (descending — fill hardest slots first)
  3. For each slot s in priority order:
       a. Identify candidate employees: all e where (e, s) passes hard constraints
       b. Score each candidate: match_score(e, s) using soft preference scoring
       c. Select best candidate e* = argmax(match_score)
       d. Assign x[e*][s] = 1
       e. Update employee state (hours worked, consecutive days, etc.)
       f. If no candidate available: mark slot as UNCOVERED, continue
  4. Return assignment set + list of uncovered slots
```

### 2.3 Priority Scoring Detail

The slot priority score determines which slots are filled first. This is critical because greedy algorithms are order-dependent — slots filled early get the best employees.

```
priority[s] = w1 * demand_criticality[s]    // How important is this slot to operations?
            + w2 * skill_scarcity[s]         // How few qualified employees exist for this slot?
            + w3 * time_urgency[s]           // How soon does this slot need to be filled?
            + w4 * certification_gate[s]     // Does this slot require rare certifications?
```

| Component | Calculation | Weight (default) |
|-----------|------------|------------------|
| Demand criticality | `demand_volume[s] / total_demand` | 0.30 |
| Skill scarcity | `1 - (qualified_count[s] / total_employees)` | 0.35 |
| Time urgency | `1 / hours_until_slot_start` (capped) | 0.15 |
| Certification gate | `1.0` if certification required, `0.0` otherwise | 0.20 |

### 2.4 Time Complexity

| Phase | Complexity | Notes |
|-------|-----------|-------|
| Priority computation | O(S) | S = number of slots |
| Sorting | O(S log S) | |
| Candidate identification | O(S x E) | E = number of employees; constraint checks are O(1) with pre-indexed state |
| Candidate scoring | O(S x E_avg) | E_avg = average candidates per slot |
| **Total** | **O(S x E)** | Typically < 100 ms for S=50, E=100 |

### 2.5 Quality Trade-offs

| Metric | Greedy vs. Optimal | Explanation |
|--------|-------------------|-------------|
| Coverage | 95–100% of optimal | Greedy fills most slots; may miss a few due to poor ordering |
| Cost | 105–115% of optimal | Does not globally optimize cost — locally optimal choices may be globally suboptimal |
| Skill match | 90–95% of optimal | Good candidates assigned to high-priority slots; lower-priority slots get leftovers |
| Fairness | 70–80% of optimal | No global balancing — employees selected early may be overloaded |
| Solve time | 1–100 ms | Orders of magnitude faster than exact methods |

### 2.6 Improvement: Regret-Based Greedy

An enhanced variant computes "regret" — the cost of not assigning the best candidate to a slot — and prioritizes slots with the highest regret:

```
regret[s] = match_score(best_candidate, s) - match_score(second_best_candidate, s)
```

Slots where the gap between the best and second-best candidate is largest are filled first, because delaying them risks losing the only good candidate. This typically improves solution quality by 3–5% over standard greedy with minimal additional computation.

---

## 3. Strategy 2: Constraint Programming (CP)

### 3.1 When to Use

| Criterion | Value |
|-----------|-------|
| Problem size | < 500 employees (or decomposed sub-problems) |
| Time budget | Background (< 60 seconds) |
| Constraint complexity | High — many interacting hard constraints, complex shift patterns |
| Solution quality requirement | Near-optimal with guaranteed constraint satisfaction |
| Primary use case | Shift pattern design, complex rostering, highly constrained environments (EU labor law) |

### 3.2 Solver Selection

AstraPlanner uses **Google OR-Tools CP-SAT** as its primary constraint programming solver. CP-SAT is:

- Open source (Apache 2.0 license)
- Supports Boolean satisfiability, integer programming, and constraint propagation
- Handles millions of variables with advanced search strategies
- Supports warm-starting from previous solutions
- Provides proof of optimality or bounded gap

### 3.3 Variable Modeling

**Decision variables:**

```
x[e][p][t] : BoolVar
    1 if employee e is assigned to process p in time slot t, 0 otherwise

overtime[e] : IntVar (domain: 0..max_overtime_hours * 60)
    Minutes of overtime for employee e

total_hours[e] : IntVar (domain: 0..max_weekly_minutes)
    Total assigned minutes for employee e across all slots
```

**Auxiliary variables:**

```
process_assigned[e][t] : IntVar (domain: 0..num_processes)
    Which process (if any) employee e is assigned to in slot t
    Channeling: process_assigned[e][t] = p  iff  x[e][p][t] = 1

works_on_day[e][d] : BoolVar
    1 if employee e works any slot on day d

consecutive_days[e][d] : IntVar (domain: 0..max_consecutive)
    Number of consecutive working days ending on day d for employee e
```

### 3.4 Constraint Encoding

**One assignment per slot per employee:**
```
for each e, t:
    SUM(x[e][p][t] for p in processes) <= 1
```

**Demand satisfaction:**
```
for each p, t:
    SUM(x[e][p][t] for e in employees) >= demand[p][t]
```

**Minimum skill level:**
```
for each e, p, t:
    if effective_level[e][p] < min_level[p]:
        x[e][p][t] = 0    (fixed to zero, removed from search)
```

**Certification requirement:**
```
for each e, p, t:
    if certification_required[p] and not has_valid_cert[e][p]:
        x[e][p][t] = 0
```

**Maximum weekly hours:**
```
for each e:
    total_hours[e] = SUM(x[e][p][t] * slot_duration[t] for p, t)
    total_hours[e] <= max_weekly_hours[e] * 60
```

**Minimum rest between shifts:**
```
for each e, t1, t2 where t2 starts within min_rest hours after t1 ends:
    for each p1, p2:
        x[e][p1][t1] + x[e][p2][t2] <= 1
```

**Maximum consecutive days:**
```
for each e, d:
    consecutive_days[e][d] is constrained via:
    if works_on_day[e][d] == 0: consecutive_days[e][d] = 0
    if works_on_day[e][d] == 1: consecutive_days[e][d] = consecutive_days[e][d-1] + 1
    consecutive_days[e][d] <= max_consecutive_days
```

### 3.5 Search Strategies

CP-SAT supports multiple search strategies. AstraPlanner configures:

| Strategy | Description | When Used |
|----------|-------------|-----------|
| Automatic | CP-SAT's built-in portfolio of strategies | Default |
| Fixed variable ordering | Assign high-priority slots first (similar to greedy ordering) | When greedy warm-start is used |
| Activity-based search | Focus on variables involved in the most constraint propagation | Complex constraint environments |
| LNS (Large Neighborhood Search) | Fix 80% of variables to current best, re-optimize remaining 20% | Large instances, improvement phase |

### 3.6 Large Neighborhood Search (LNS)

For problems too large for full CP-SAT exploration, LNS iteratively improves an initial solution:

```
LNS-IMPROVE(initial_solution, time_budget):
  best = initial_solution
  while time_remaining > 0:
      1. Select a "neighborhood" to destroy:
         - Random: unfix 20% of variables randomly
         - Process-based: unfix all assignments for one process
         - Employee-based: unfix all assignments for 50 employees
         - Time-based: unfix all assignments for one day
      2. Re-optimize the unfixed variables with CP-SAT (sub-time-limit: 5s)
      3. If new solution improves objective: best = new solution
  return best
```

LNS typically improves solution quality by 5–15% over pure greedy construction, within a 30–60 second time budget.

### 3.7 CP Performance Characteristics

| Problem Size (employees x slots) | Variables | Constraints | Typical Solve Time | Quality vs. Optimal |
|----------------------------------|-----------|-------------|--------------------|--------------------|
| 50 x 20 | 5,000 | 15,000 | < 1 s | Optimal |
| 100 x 40 | 60,000 | 200,000 | 2–10 s | Optimal or < 1% gap |
| 200 x 80 | 240,000 | 800,000 | 10–60 s | 1–3% gap |
| 500 x 80 | 600,000 | 2,000,000 | 30–120 s (with LNS) | 3–8% gap |

---

## 4. Strategy 3: Mixed Integer Programming (MIP)

### 4.1 When to Use

| Criterion | Value |
|-----------|-------|
| Problem size | 100–2,000 employees |
| Time budget | Background to batch (10 seconds – 30 minutes) |
| Constraint complexity | Low to moderate (constraints must be linearizable) |
| Solution quality requirement | Near-optimal cost with provable bounds |
| Primary use case | Cost-optimal planning, budget-constrained scheduling, overtime minimization |

### 4.2 Solver Selection

| Solver | License | Performance | Recommended Use |
|--------|---------|-------------|-----------------|
| HiGHS | Open source (MIT) | Good for medium instances | Default for open-source deployments |
| Google OR-Tools LP/MIP | Open source (Apache 2.0) | Good, integrated with CP-SAT | Hybrid strategies |
| Gurobi | Commercial ($$$) | Best-in-class for large MIP | Enterprise deployments with budget |
| CPLEX | Commercial ($$$) | Comparable to Gurobi | Enterprise alternative |
| SCIP | Academic/open | Good research solver | Prototyping and benchmarking |

AstraPlanner abstracts the solver behind an interface, allowing drop-in replacement.

### 4.3 MIP Formulation

**Sets:**
```
E = set of employees         (index e)
P = set of processes          (index p)
T = set of time slots         (index t)
D = set of days               (index d)
```

**Decision variables:**
```
x[e,p,t] ∈ {0, 1}       Assignment of employee e to process p in slot t
o[e] ≥ 0                 Overtime hours for employee e (continuous)
u[p,t] ≥ 0               Understaffing for process p in slot t (continuous slack)
```

**Objective function (minimize total cost):**
```
minimize:
    SUM(e,p,t) { x[e,p,t] * cost[e,t] }                    // Regular labor cost
  + SUM(e) { o[e] * overtime_premium[e] }                     // Overtime premium
  + SUM(p,t) { u[p,t] * understaffing_penalty[p] }           // Penalty for uncovered demand
  - SUM(e,p,t) { x[e,p,t] * skill_bonus[e,p] * w_skill }    // Skill quality bonus
  - SUM(e,p,t) { x[e,p,t] * pref_score[e,t] * w_pref }      // Preference satisfaction bonus
```

**Subject to:**

**(C1) Demand coverage:**
```
for each p, t:
    SUM(e) { x[e,p,t] * proficiency_multiplier[e,p] } + u[p,t] >= demand[p,t]
```

**(C2) One assignment per employee per slot:**
```
for each e, t:
    SUM(p) { x[e,p,t] } <= 1
```

**(C3) Weekly hours limit:**
```
for each e:
    SUM(p,t) { x[e,p,t] * slot_duration[t] } <= max_hours[e]
```

**(C4) Overtime calculation:**
```
for each e:
    o[e] >= SUM(p,t) { x[e,p,t] * slot_duration[t] } - standard_hours[e]
    o[e] >= 0
```

**(C5) Minimum rest (linearized):**
```
for each e, for each pair (t1, t2) where t2 starts within min_rest after t1:
    SUM(p) { x[e,p,t1] } + SUM(p) { x[e,p,t2] } <= 1
```

**(C6) Consecutive days limit (linearized with auxiliary variables):**
```
for each e, d:
    works[e,d] = max(x[e,p,t] for all p, t in day d)    // Linearized via: works[e,d] >= x[e,p,t]
for each e, for each window of (max_consecutive + 1) consecutive days:
    SUM(d in window) { works[e,d] } <= max_consecutive
```

**(C7) Site capacity:**
```
for each site s, slot t:
    SUM(e,p where site[p]==s) { x[e,p,t] } <= capacity[s]
```

**(C8) Skill level enforcement:**
```
for each e, p where effective_level[e,p] < min_level[p]:
    for each t: x[e,p,t] = 0    (eliminated in preprocessing)
```

### 4.4 Solver Techniques

**Branch and Bound:**
The MIP solver explores a tree of partial solutions, branching on fractional variables and bounding using LP relaxation. Effective pruning strategies:

| Technique | Description | Impact |
|-----------|-------------|--------|
| LP relaxation bound | Solve continuous relaxation for tight lower bound | Primary bounding mechanism |
| Cutting planes | Add valid inequalities to tighten relaxation (Gomory cuts, clique cuts) | Reduces tree size by 30–60% |
| Branching heuristics | Branch on most fractional variable or strong branching | Reduces tree exploration |
| Node presolve | Fix variables implied by current branching decisions | Speeds each node solve |
| Symmetry breaking | Add constraints to eliminate equivalent solutions (employee permutations) | Critical for workforce problems |

**Symmetry breaking** is particularly important in workforce scheduling: if employees A and B have identical skills, costs, and preferences, the solver wastes time exploring both "A to slot 1, B to slot 2" and "B to slot 1, A to slot 2". AstraPlanner adds ordering constraints to break these symmetries:

```
for each pair (e1, e2) where e1 and e2 are interchangeable:
    x[e1, p_first, t_first] >= x[e2, p_first, t_first]
```

### 4.5 MIP Performance Characteristics

| Problem Size | Variables | Solve Time (HiGHS) | Solve Time (Gurobi) | Typical Gap |
|-------------|-----------|--------------------|--------------------|-------------|
| 100 employees, 1 day | 15,000 | 2–5 s | < 1 s | Optimal |
| 200 employees, 1 day | 60,000 | 10–30 s | 3–10 s | < 1% |
| 500 employees, 1 day | 375,000 | 60–300 s | 15–60 s | 1–3% |
| 500 employees, 1 week | 2,625,000 | Time limit (30 min) | 120–600 s | 3–8% |
| 2000 employees, 1 day | 6,000,000 | Requires decomposition | 300–1800 s | 5–15% |

---

## 5. Strategy 4: Meta-Heuristic (Genetic Algorithm / Simulated Annealing)

### 5.1 When to Use

| Criterion | Value |
|-----------|-------|
| Problem size | 200–5,000 employees (or multi-site) |
| Time budget | Batch (5–30 minutes) |
| Constraint complexity | Any |
| Solution quality requirement | Good — within 5–10% of optimal across multiple objectives |
| Primary use case | Multi-objective optimization, Pareto frontier generation, very large instances where exact methods time out |

### 5.2 Genetic Algorithm (GA)

#### 5.2.1 Chromosome Encoding

A workforce plan is encoded as a chromosome — a vector of assignment decisions:

```
chromosome = [a[1], a[2], ..., a[S]]
```

Where `a[s]` is the employee ID assigned to slot `s`. For unassigned slots, `a[s] = NULL`.

**Chromosome length** = number of slots = processes x time_slots (e.g., 15 processes x 16 daily slots = 240 genes per day).

For multi-day planning, the chromosome extends: 240 genes/day x 7 days = 1,680 genes per weekly plan.

#### 5.2.2 Fitness Function

```
fitness(chromosome) =
    w1 * coverage_score                    // % of demand covered (0–1)
  + w2 * (1 - normalized_cost)             // Lower cost = higher fitness
  + w3 * skill_quality_score               // Average skill match quality (0–1)
  + w4 * preference_satisfaction_score     // % preferences met (0–1)
  + w5 * fairness_score                    // 1 - normalized CV of hours (0–1)
  - penalty * hard_constraint_violations   // Heavy penalty for any hard constraint violation
```

The hard constraint violation penalty is set high enough (e.g., 1000 per violation) that infeasible chromosomes are always ranked below feasible ones, but not so high that the GA cannot use them as stepping stones during evolution.

#### 5.2.3 Initialization

The initial population is generated using multiple strategies for diversity:

| Strategy | Population Share | Method |
|----------|-----------------|--------|
| Greedy construction | 20% | Standard greedy heuristic with random tie-breaking |
| Random feasible | 30% | Random assignments filtered through hard constraints |
| Biased random | 30% | Random with bias toward high-skill-match assignments |
| Imported solution | 10% | Previous day's plan or warm-start solution |
| Pure random | 10% | Fully random (ensures diversity, likely infeasible) |

**Population size:** 100–500 chromosomes (larger for larger problems).

#### 5.2.4 Selection

Tournament selection with tournament size 5: randomly select 5 chromosomes, pick the one with highest fitness. This provides good selection pressure while maintaining diversity.

#### 5.2.5 Crossover Operators

Standard crossover operators do not work well for constrained scheduling problems because combining two feasible parents often produces infeasible children. AstraPlanner uses schedule-aware crossover:

**Operator 1: Shift-Based Crossover**
```
Split chromosomes by shift. For each shift:
  - With probability 0.5, take all assignments from Parent 1
  - Otherwise, take all assignments from Parent 2
Resolve conflicts (employee double-assigned) by keeping the higher-fitness assignment
```

**Operator 2: Process-Based Crossover**
```
For each process p:
  - With probability 0.5, take all assignments for process p from Parent 1
  - Otherwise, take from Parent 2
Resolve conflicts by re-running greedy on conflicted slots
```

**Operator 3: Uniform Crossover with Repair**
```
For each slot:
  - With probability 0.5, take assignment from Parent 1; otherwise from Parent 2
Run repair operator: for each hard constraint violation, randomly reassign the offending slot
```

**Crossover rate:** 0.8 (80% of new chromosomes produced by crossover, 20% by direct copy of parents).

#### 5.2.6 Mutation Operators

| Operator | Description | Rate |
|----------|-------------|------|
| Swap mutation | Swap the assigned employees between two random slots | 0.05 per gene |
| Reassign mutation | Replace the assigned employee in a random slot with a different qualified employee | 0.03 per gene |
| Shift mutation | Move an employee's assignment from one slot to an adjacent slot | 0.02 per gene |
| Process rotation | Move an employee from an overstaffed process to an understaffed one | 0.01 per gene |
| Block mutation | Re-assign all slots for a randomly selected employee using greedy | 0.005 per chromosome |

#### 5.2.7 GA Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Population size | 200 | Balance between diversity and computation per generation |
| Generations | 500–5,000 | Depends on time budget |
| Crossover rate | 0.80 | High crossover for exploitation |
| Mutation rate | 0.03–0.05 per gene | Moderate mutation for exploration |
| Elitism | Top 5% carried unchanged | Preserve best solutions |
| Termination | Time limit OR 100 generations without improvement | Avoid wasting compute |

### 5.3 Simulated Annealing (SA)

#### 5.3.1 Algorithm

```
SA-OPTIMIZE(initial_solution, time_budget):
  current = initial_solution
  best = current
  T = initial_temperature    // e.g., 1000
  T_min = 0.01
  alpha = 0.995              // Cooling rate

  while T > T_min and time_remaining > 0:
      neighbor = generate_neighbor(current)
      delta = fitness(neighbor) - fitness(current)

      if delta > 0:                                   // Improvement
          current = neighbor
      else if random() < exp(delta / T):              // Accept worse with probability
          current = neighbor

      if fitness(current) > fitness(best):
          best = current

      T = T * alpha

  return best
```

#### 5.3.2 Neighborhood Generation

The `generate_neighbor` function applies one of the mutation operators from the GA section, selected randomly with weights favoring swap and reassign mutations.

#### 5.3.3 Temperature Schedule

| Phase | Temperature Range | Acceptance of Worse Solutions | Purpose |
|-------|-------------------|-------------------------------|---------|
| Hot (early) | 1000–100 | 40–60% of worse neighbors accepted | Broad exploration, escape local optima |
| Warm (mid) | 100–10 | 10–30% accepted | Focused exploration around promising regions |
| Cool (late) | 10–0.01 | < 5% accepted | Exploitation, fine-tuning best solution |

#### 5.3.4 SA vs. GA Trade-offs

| Dimension | GA | SA |
|-----------|----|----|
| Solution diversity | Multiple solutions (Pareto set possible) | Single solution trajectory |
| Parallelization | Naturally parallel (population is independent) | Sequential (but can run multiple chains) |
| Parameter sensitivity | Moderate (population size, crossover/mutation rates) | High (temperature schedule is critical) |
| Typical quality | Slightly better for multi-objective | Slightly better for single-objective |
| Memory | O(population_size x chromosome_length) | O(chromosome_length) |

---

## 6. Strategy 5: Hybrid Approach (Recommended)

### 6.1 Architecture

The hybrid approach chains strategies in three phases, using each strategy's strength:

```
Phase 1: GREEDY CONSTRUCTION (fast feasible solution)
    ↓
Phase 2: EXACT IMPROVEMENT (CP/MIP within time budget)
    ↓
Phase 3: LOCAL SEARCH POLISH (simulated annealing for fine-tuning)
```

### 6.2 Phase 1: Greedy Construction (Target: 0.5–2 seconds)

**Goal:** Produce a feasible solution quickly.

- Run regret-based greedy heuristic.
- Output: a complete assignment with 90–95% of optimal quality.
- This solution serves two purposes:
  1. If time budget is exhausted (interactive mode), return this solution.
  2. Otherwise, use as warm start for Phase 2.

### 6.3 Phase 2: Exact Improvement (Target: 5–300 seconds)

**Goal:** Improve the greedy solution using exact methods.

**Strategy selection logic:**

```
if constraint_complexity == HIGH and problem_size <= 500:
    solver = CP-SAT
    warm_start with greedy solution
    set time_limit = min(remaining_budget * 0.7, 60s)

elif objective == COST_MINIMIZE and constraints are linear:
    solver = MIP (HiGHS or Gurobi)
    warm_start with greedy solution (MIP hint)
    set time_limit = min(remaining_budget * 0.7, 300s)

elif problem_size > 500:
    decompose problem by site or shift
    solve each sub-problem with CP-SAT or MIP in parallel
    stitch solutions together, resolve cross-sub-problem constraints

else:
    solver = CP-SAT (default)
```

**Warm starting** provides the solver with the greedy solution as an initial incumbent. This:
- Gives the solver an immediate upper bound, enabling more aggressive pruning.
- Reduces solve time by 30–50% compared to cold start.
- Guarantees that the solver's output is at least as good as the greedy solution.

### 6.4 Phase 3: Local Search Polish (Target: 2–30 seconds)

**Goal:** Fine-tune the solution on soft objectives that exact solvers may have traded off.

- Run simulated annealing starting from the Phase 2 output.
- Focus neighborhood moves on:
  - Improving employee preference satisfaction.
  - Balancing workload distribution.
  - Reducing unnecessary process switches.
- Accept only improvements or neutral moves (low temperature from start).
- This phase typically improves soft constraint satisfaction by 3–8% without degrading hard constraint satisfaction or primary objective.

### 6.5 Adaptive Solver Selection

The system learns over time which strategy works best for each site:

```
solver_history[site] = [
    { strategy: "CP-SAT", solve_time: 12s, quality: 0.94, gap: 2.1% },
    { strategy: "MIP-HiGHS", solve_time: 45s, quality: 0.96, gap: 0.8% },
    { strategy: "CP-SAT", solve_time: 8s, quality: 0.95, gap: 1.5% },
    ...
]
```

After 10+ runs, the system computes average performance per strategy and defaults to the strategy with the best quality-per-second ratio for that site's typical problem shape.

### 6.6 Hybrid Performance

| Phase | Time Used | Quality Improvement | Cumulative Quality |
|-------|-----------|--------------------|--------------------|
| Phase 1 (Greedy) | 0.5 s | Baseline (85–92%) | 85–92% |
| Phase 2 (CP/MIP) | 5–60 s | +5–12% | 93–98% |
| Phase 3 (Local search) | 2–15 s | +1–4% | 95–99% |

---

## 7. Solver Time Budgets

### 7.1 Budget Tiers

| Tier | Label | Total Time Budget | When Triggered | User Experience |
|------|-------|-------------------|----------------|-----------------|
| T1 | Interactive | < 5 seconds | User clicks "optimize" in UI, single-employee drag-and-drop | Instant result, spinner for < 3s |
| T2 | Background | < 60 seconds | Full site re-optimization, demand change event | Progress bar, "optimizing..." status |
| T3 | Batch | < 30 minutes | Overnight enterprise-wide planning, scenario simulation | Queued job, notification on completion |

### 7.2 Budget Allocation (Hybrid Strategy)

| Tier | Phase 1 (Greedy) | Phase 2 (Exact) | Phase 3 (Polish) |
|------|-------------------|-----------------|------------------|
| T1 (5s) | 0.5s | 3.5s | 1.0s |
| T2 (60s) | 1.0s | 45s | 14s |
| T3 (30 min) | 2s | 25 min | 4 min 58s |

### 7.3 Early Termination

The solver monitors progress and can terminate early:

- **Optimality proof**: If the solver proves the current solution is optimal (gap = 0%), stop immediately.
- **Plateau detection**: If no improvement has been found in the last 30% of elapsed time, terminate and return current best.
- **Diminishing returns**: If the last improvement was < 0.1% of objective value, stop.
- **User cancellation**: The planner can cancel at any time and receive the best solution found so far.

---

## 8. Problem Decomposition for Scale

### 8.1 Site-Level Decomposition

Most workforce scheduling problems decompose naturally by site, since employees are typically assigned to a single site. Each site's problem is solved independently and in parallel.

```
enterprise_plan = PARALLEL_MAP(
    site_ids,
    lambda site: HYBRID_SOLVE(demand[site], employees[site], constraints[site])
)
```

**Parallelism:** With 2,000 sites and 16 parallel workers, each worker handles ~125 sites sequentially. At 60 seconds per site, total time = 125 x 60 = 7,500 seconds = ~2 hours. With 64 workers: ~31 minutes.

### 8.2 Shift-Level Decomposition

Within a site, shifts can be partially decomposed:

1. Solve each shift independently.
2. Add linking constraints (consecutive day tracking, weekly hours) as post-processing.
3. Resolve conflicts with a small repair MIP.

### 8.3 Process-Level Decomposition

For very large sites, decompose by process cluster (using skill adjacency to group related processes):

```
Cluster 1: Receiving, Put-away, Forklift (shared employee pool)
Cluster 2: Picking (each), Picking (case), Packing, Returns (shared pool)
Cluster 3: Shipping, Loading dock (shared pool)
Cluster 4: Hazmat, Cold chain (specialized, small)
```

Each cluster is solved independently. Cross-cluster assignments (employees who can work in multiple clusters) are handled in a coordination phase.

---

## 9. Benchmarking Framework

### 9.1 Benchmark Instances

AstraPlanner includes a set of standardized benchmark instances for comparing solver performance:

| Instance ID | Employees | Processes | Slots | Days | Hard Constraints | Soft Constraints | Description |
|-------------|-----------|-----------|-------|------|------------------|------------------|-------------|
| SMALL-01 | 50 | 5 | 3 shifts | 1 | Basic (US Federal) | Standard set | Small single-day problem |
| SMALL-07 | 50 | 5 | 3 shifts | 7 | Basic (US Federal) | Standard set | Small weekly problem |
| MED-01 | 200 | 10 | 3 shifts | 1 | EU Working Time | Full set | Medium single-day, EU rules |
| MED-07 | 200 | 10 | 3 shifts | 7 | EU Working Time | Full set | Medium weekly, EU rules |
| LARGE-01 | 1000 | 15 | 3 shifts | 1 | EU Working Time | Full set | Large single-day |
| LARGE-07 | 1000 | 15 | 3 shifts | 7 | EU Working Time | Full set | Large weekly |
| XLARGE-01 | 5000 | 20 | 3 shifts | 1 | EU + CBA rules | Full set + custom | Enterprise-scale |
| CERT-HEAVY | 200 | 15 | 3 shifts | 7 | Extensive certifications | Full set | Certification-constrained |
| MULTI-SITE | 500 (shared) | 10/site | 3 shifts | 7 | EU Working Time | Full set + commute | 5-site shared pool |

### 9.2 Benchmark Metrics

| Metric | Definition | Target |
|--------|------------|--------|
| Solve time | Wall-clock time from input to output | Within tier budget |
| Objective value | Value of the combined objective function | Higher is better |
| Optimality gap | `(best_known - solution) / best_known * 100%` | < 5% for production |
| Coverage rate | `assigned_demand / total_demand * 100%` | > 95% |
| Hard constraint violations | Count of violated hard constraints | Must be 0 |
| Soft constraint satisfaction | Weighted percentage of satisfied soft constraints | > 75% |
| Memory usage | Peak RSS during solve | < 4 GB |

### 9.3 Benchmark Results (Reference)

Results on a standard server (8-core, 32 GB RAM):

| Instance | Greedy (time/gap) | CP-SAT (time/gap) | MIP-HiGHS (time/gap) | Hybrid (time/gap) |
|----------|-------------------|--------------------|----------------------|-------------------|
| SMALL-01 | 0.02s / 8.2% | 0.3s / 0.0% | 0.5s / 0.0% | 1.1s / 0.0% |
| SMALL-07 | 0.1s / 12.1% | 3.2s / 0.2% | 2.8s / 0.1% | 5.5s / 0.0% |
| MED-01 | 0.1s / 9.5% | 8.4s / 1.1% | 5.2s / 0.6% | 12.0s / 0.4% |
| MED-07 | 0.6s / 14.3% | 55s / 2.8% | 42s / 1.9% | 58s / 1.2% |
| LARGE-01 | 0.4s / 11.2% | 48s / 4.5% | 35s / 2.3% | 52s / 1.8% |
| LARGE-07 | 2.1s / 16.8% | timeout | 420s / 5.1% | 480s / 3.4% |
| XLARGE-01 | 1.8s / 13.4% | timeout | timeout (needs decomp) | 180s / 4.2% (decomposed) |
| CERT-HEAVY | 0.3s / 18.6% | 22s / 1.4% | 18s / 2.1% | 28s / 0.9% |
| MULTI-SITE | 1.2s / 15.3% | 120s / 3.8% | 95s / 2.7% | 140s / 2.1% |

---

## 10. Strategy Comparison Summary

| Strategy | Problem Size Sweet Spot | Time Budget | Solution Quality | Deterministic | Parallelizable | Best For |
|----------|------------------------|-------------|------------------|---------------|----------------|----------|
| Greedy Heuristic | < 100 employees | < 5s | 85–92% of optimal | Yes (with fixed tie-breaking) | N/A (already fast) | Real-time adjustments, warm starts |
| CP (CP-SAT) | < 500 employees | 5–120s | 95–100% of optimal | Yes | Limited | Complex constraints, shift pattern design |
| MIP (HiGHS/Gurobi) | 100–2,000 employees | 10s–30 min | 95–100% of optimal | Yes | Limited | Cost optimization, provable bounds |
| GA | 200–5,000 employees | 5–30 min | 90–95% of optimal | No (stochastic) | Yes (population) | Multi-objective, Pareto frontier |
| SA | 100–2,000 employees | 2–30 min | 90–95% of optimal | No (stochastic) | Yes (multi-chain) | Single-objective fine-tuning |
| **Hybrid** | **Any** | **Any** | **95–99% of optimal** | **Phase 1: yes; Phase 2–3: configurable** | **Yes (decomposition)** | **Production default** |
