# Planning Engine Gap Analysis

## Adversarial Audit: Optimization Engine Readiness

**Audit Date**: 2026-03-20
**Auditor**: Automated adversarial review
**Domain Correctness Score**: 7/10 (the planning approach is sound)
**Implementation Readiness Score**: 0/10 (zero solver code exists)

---

## 1. Executive Summary

The optimization engine is the core value proposition of AstraPlanner. The documentation in `optimization-strategy.md` describes a 4-stage pipeline with detailed formulas, proficiency adjustments, shift timing factors, learning curves, absenteeism buffers, and multi-objective assignment optimization. The domain knowledge demonstrated is solid -- the formulas are correct for warehouse workforce planning.

The problem: none of it is implemented. There is no solver code, no HiGHS integration, no solver I/O contract, no MIP formulation, no test fixtures, no benchmarks, and no validation that the documented approach is computationally feasible within the stated runtime constraints. The gap between the documentation and reality is absolute.

---

## 2. What the Documentation Promises

### 2.1 Four-Stage Pipeline

| Stage | Input | Output | Documented Latency |
|-------|-------|--------|-------------------|
| Demand Normalization | Raw demand (orders, units, pallets, etc.) | Normalized demand vector per process per time slot | < 100 ms |
| Workload Computation | Normalized demand + productivity standards | Required labor hours per process per time slot | < 200 ms |
| FTE Calculation | Labor hours + workforce parameters | FTE requirement per process per time slot | < 100 ms |
| Assignment Optimization | FTE requirements + employee pool + constraints | Named employee-to-slot assignments | 1 s - 30 min |

### 2.2 Five Objective Functions

1. Minimize total labor cost
2. Maximize skill coverage quality
3. Minimize overtime
4. Maximize employee preference satisfaction
5. Minimize workload variance (fairness)

### 2.3 Multi-Objective Resolution

- Weighted sum with configurable weights
- Lexicographic ordering with configurable priority
- (A third strategy is mentioned but the document was truncated)

### 2.4 Three Performance Tiers

- Interactive: < 5 seconds for single-site adjustments
- Background: < 60 seconds for full-site re-optimization
- Batch: up to 30 minutes for enterprise-wide overnight planning

---

## 3. What Actually Exists

**Nothing.** Specifically:

| Artifact | Status |
|----------|--------|
| Solver code (any language) | Does not exist |
| HiGHS WASM binary | Not downloaded, not referenced, no dependency |
| `highs-js` or `highs-wasm` npm package | Not installed (no `package.json` exists) |
| Solver I/O contract (TypeScript interface) | Does not exist |
| MIP model file (.lp or .mps format) | Does not exist |
| Decision variable definitions (code) | Does not exist |
| Constraint matrix construction (code) | Does not exist |
| Objective function construction (code) | Does not exist |
| Test fixtures (sample problems with known solutions) | Does not exist |
| Benchmark results | Does not exist |
| Performance profiling | Does not exist |
| Memory usage analysis | Does not exist |

---

## 4. Detailed Gap Analysis

### 4.1 Stages 1-3 Are Straightforward; Stage 4 Is the Hard Problem

Stages 1-3 (demand normalization, workload computation, FTE calculation) are arithmetic transformations. The formulas in the documentation are correct and simple to implement:

```
required_hours = demand_volume / productivity_rate * timing_factor * learning_curve_factor
gross_FTE = required_hours / net_productive_hours / (1 - absenteeism_rate)
```

These stages are 1-2 weeks of implementation work including tests. They do not require a solver.

**Stage 4 (Assignment Optimization) is the hard problem.** It is a variant of the Nurse Scheduling Problem (NSP), which is NP-hard. The documentation describes it correctly but glosses over the computational complexity.

### 4.2 The MIP Formulation Does Not Exist

The documentation provides decision variables and objective functions in pseudocode:

```
x[e][p][t] in {0, 1}    (binary: assign employee e to process p in slot t)
minimize: SUM( x[e][p][t] * hourly_cost[e][t] )
```

This is a start, but a real MIP formulation requires:

**Decision variables (fully specified)**:
- `x[e][p][t]` -- binary assignment variables
- `o[e]` -- continuous overtime hours per employee
- `y[e][d]` -- binary: does employee e work on day d (for consecutive-day constraints)
- Slack variables for soft constraints

**Constraint matrix (not documented at all)**:
- Each employee assigned to at most one process per time slot: `SUM_p(x[e][p][t]) <= 1 for all e, t`
- Demand satisfaction: `SUM_e(x[e][p][t] * proficiency[e][p]) >= FTE_required[p][t] for all p, t`
- Maximum daily hours: `SUM_{p,t in day}(x[e][p][t] * slot_hours) <= max_daily for all e, day`
- Maximum weekly hours: similar
- Minimum rest between shifts: `x[e][p][t] + x[e][p'][t+1] <= 1` when gap < min_rest (requires careful time slot modeling)
- Maximum consecutive days: requires auxiliary variables and linking constraints
- Skill eligibility: `x[e][p][t] <= has_skill[e][p]` (employee can only be assigned to processes they are skilled for)
- Site capacity: `SUM_{e,p}(x[e][p][t]) <= max_headcount[site][t]`
- Equipment constraints: not modeled (equipment inventory does not exist in schema)
- Break placement: not modeled (breaks are fixed-duration in shift patterns, not optimized)

**Variable bounds**:
- `x[e][p][t] in {0, 1}`
- `o[e] >= 0`
- Domain restrictions based on employee availability (absence, leave)

**Problem size estimation**:

For a medium site with 200 employees, 10 processes, and 7 days at hourly granularity (168 time slots):

- Binary variables: 200 * 10 * 168 = 336,000
- Constraints: roughly 5x the number of variables = ~1.7 million
- Non-zeros in constraint matrix: ~10 million

This is a large MIP problem. HiGHS can handle it, but not in 5 seconds, and possibly not in 60 seconds. The documented "interactive" latency target of < 5 seconds is almost certainly unachievable for problems of this size.

### 4.3 The HiGHS WASM Integration Is Untested

The architecture documents state that HiGHS will run as WASM inside Supabase Edge Functions. Critical unknowns:

| Question | Status | Risk |
|----------|--------|------|
| Does `highs-js` (WASM build) work in Deno runtime? | Unknown | High -- Supabase Edge Functions run Deno, not Node.js. WASM compatibility is not guaranteed. |
| What is the WASM binary size? | Unknown | Medium -- Edge Functions have deployment size limits. The HiGHS WASM binary is approximately 2-4 MB. |
| Does the solver fit in 256 MB memory? | Unknown | High -- for a 200-employee problem, the solver's internal data structures (branch-and-bound tree, LP relaxations, cut pools) could exceed 256 MB. |
| Can the solver complete within Edge Function timeout? | Unknown | High -- Supabase Edge Functions have a default timeout of 60 seconds (extendable to 150 seconds on Pro plan). Large MIP problems may need 5-30 minutes. |
| What happens when the solver hits the memory limit? | Unknown | High -- OOM in WASM typically crashes the isolate with no graceful degradation. |

**The fallback path (Fly.io workers for large problems) is also unimplemented.** If HiGHS WASM does not work in Edge Functions, the entire solver must run on Fly.io, which requires a completely different deployment model, queue infrastructure, and result-retrieval mechanism.

### 4.4 No Solver I/O Contract

There is no TypeScript interface defining:
- What data the solver receives as input (employees, skills, shifts, demand, constraints, objective weights)
- What data the solver returns as output (assignments, objective value, constraint violations, solve statistics)
- How solver errors are reported (infeasible, unbounded, timeout, memory limit)
- How partial solutions are handled (time limit reached with feasible but suboptimal solution)

This contract is the most critical missing artifact. Without it, neither the backend nor the frontend can be developed in parallel with the solver.

**A minimal solver I/O contract would look like**:

```
Input:
  - employees: { id, skills: { processId, proficiency }[], availability: { date, available: boolean }[], hourly_rate, max_daily_hours, max_weekly_hours }[]
  - processes: { id, name }[]
  - demand: { processId, date, timeSlot, fte_required }[]
  - shifts: { id, start, end, paid_hours }[]
  - constraints: { type, parameters }[]
  - objective: { weights: { cost, skill, overtime, preference, fairness } }

Output:
  - assignments: { employeeId, processId, shiftId, date, timeSlot }[]
  - metrics: { totalCost, avgSkillScore, totalOvertime, preferenceScore, fairnessScore }
  - solveStats: { status: 'optimal' | 'feasible' | 'infeasible' | 'timeout', gap: number, solveTimeMs: number, nodesExplored: number }
  - violations: { constraintType, severity, details }[]
```

### 4.5 No Test Fixtures

There are no test problems with known optimal solutions. Without test fixtures, there is no way to validate that the solver produces correct results. Required fixtures:

| Fixture | Size | Purpose |
|---------|------|---------|
| Trivial | 3 employees, 2 processes, 1 day | Verify basic assignment logic. Hand-solvable. |
| Small | 10 employees, 5 processes, 1 day | Verify constraint handling (skills, max hours). |
| Medium | 50 employees, 10 processes, 7 days | Verify multi-day constraints (consecutive days, weekly hours). |
| Large | 200 employees, 15 processes, 7 days | Performance benchmark. Verify memory and time limits. |
| Infeasible | 5 employees, 10 processes, 1 day | Verify graceful handling of infeasible problems (not enough staff). |
| Degenerate | 1 employee, 1 process, 1 day | Edge case validation. |

### 4.6 The Benchmark Data Is Fabricated

The documentation in `optimization-strategy.md` includes latency estimates:

| Stage | Documented Latency |
|-------|-------------------|
| Demand Normalization | < 100 ms |
| Workload Computation | < 200 ms |
| FTE Calculation | < 100 ms |
| Assignment Optimization | 1 s - 30 min |

These numbers are not measured. They are aspirational estimates. The SYSTEMS-REVIEW has confirmed that benchmark data in `algorithm-strategies.md` is fabricated. Without running the solver on real-sized problems, these latency claims are meaningless.

For stages 1-3 (arithmetic), < 200 ms is plausible for single-site problems. For stage 4 (MIP), the 1-second lower bound is optimistic for any non-trivial problem, and the 30-minute upper bound may be insufficient for enterprise-wide batch runs.

### 4.7 The "Three Performance Tiers" Are Aspirational

| Tier | Claim | Reality |
|------|-------|---------|
| Interactive (< 5s) | Single-site adjustments | For a single-slot adjustment (reassign one employee), < 5s is feasible using heuristics, not MIP. For re-optimizing an entire day after one change, < 5s requires warm-starting from a previous solution, which HiGHS supports but has never been tested in this context. |
| Background (< 60s) | Full-site re-optimization | For a 200-employee site, a full 7-day optimization may not converge to optimality in 60 seconds. The solver can be configured to return the best feasible solution found within the time limit, but solution quality is unknown. |
| Batch (< 30 min) | Enterprise-wide (thousands of sites) | If each site takes 60 seconds, 1,000 sites take 1,000 minutes (16 hours) sequentially. Parallelism across Fly.io workers could reduce this, but the queue infrastructure does not exist. |

---

## 5. Domain Correctness Assessment

Despite the zero implementation status, the planning approach documented in `optimization-strategy.md` is sound:

### 5.1 What the Documentation Gets Right

| Aspect | Assessment |
|--------|-----------|
| Demand normalization with conversion factors | Correct. Standard approach in WFM (Workforce Management) systems. |
| Productivity standards with proficiency multipliers | Correct. The 5-level proficiency scale (0.6x to 1.1x) is realistic and matches industry practice. |
| Shift timing adjustments (night shift, overtime fatigue) | Correct. The specific multipliers (night=1.12, OT>8h=1.08, OT>10h=1.15) are within industry ranges. |
| Learning curve factors | Correct. The 40%/20%/10%/0% degradation over first 16 shifts is reasonable. |
| Absenteeism buffer with gross-up formula | Correct. Standard WFM calculation. The segment-specific rates (FT=5-7%, temp=10-15%) are realistic. |
| Net productive hours deduction | Correct. 7.0 net hours from an 8-hour shift (after breaks, startup, non-productive time) is industry standard. |
| Multi-objective optimization with weighted sum | Correct approach, though the default weights (cost=0.35, skill=0.25, overtime=0.20, preference=0.12, fairness=0.08) are arbitrary and should be tuned per customer. |
| FTE rounding strategies | Correct. Ceiling/nearest/floor-with-flex/banker's rounding options cover real scenarios. |

### 5.2 What the Documentation Gets Wrong or Omits

| Aspect | Issue |
|--------|-------|
| No demand uncertainty modeling | The documentation mentions confidence intervals in `demand_forecast` but does not describe how uncertainty propagates through the planning pipeline. Robust optimization or stochastic programming approaches are not mentioned. |
| No solution warm-starting | When a plan is manually adjusted, re-optimization should warm-start from the adjusted solution. This is critical for the "interactive" tier but not documented. |
| No decomposition strategy | For large problems, the MIP should be decomposed (e.g., by day, by department, or by site). No decomposition strategy is documented. |
| No heuristic fallback | If the MIP solver cannot find a solution within the time limit, a constructive heuristic (greedy assignment) should provide a feasible (if suboptimal) solution. Not documented. |
| No infeasibility diagnosis | When constraints are contradictory (not enough skilled staff), the solver should identify which constraints are causing infeasibility. This requires Irreducible Infeasible Set (IIS) computation, which HiGHS does not natively support. |
| Overtime calculation assumes US rules | The overtime multipliers (1.5x after 8h/day or 40h/week) are US-specific. EU Working Time Directive, Australian award rates, and other jurisdictions have different rules. The schema has `labor_rule` but the solver formulation does not parameterize overtime calculation by jurisdiction. |
| No support for split shifts | The model assumes each employee works one contiguous shift per day. Some warehouses use split shifts (work 4h, break 4h, work 4h). Not modeled. |
| No support for flex-start shifts | The model assigns employees to fixed shift patterns. Some operations use staggered start times (e.g., start between 06:00-08:00). Not modeled. |

---

## 6. Implementation Roadmap

### Phase 1: Prove HiGHS Feasibility (1-2 weeks)

1. Install `highs-js` in a Deno/Node.js environment
2. Create a toy MIP problem (5 employees, 3 processes, 1 day) and solve it
3. Measure memory usage and solve time
4. Test in Supabase Edge Function sandbox
5. If Edge Functions cannot handle it, pivot to Fly.io workers as primary runtime

**Go/no-go decision**: If HiGHS WASM does not work in the target runtime, the architecture must change before any further solver development.

### Phase 2: Define Solver I/O Contract (1 week)

1. Define TypeScript interfaces for solver input and output
2. Create the 6 test fixtures listed in section 4.5
3. Document error states and partial solution handling
4. Get sign-off from stakeholders on the contract

### Phase 3: Implement Stages 1-3 (2-3 weeks)

1. Demand normalization (conversion factors, time slot bucketing, smoothing)
2. Workload computation (hours = demand / productivity * adjustments)
3. FTE calculation (gross-up for absenteeism, rounding)
4. Write unit tests against the test fixtures
5. Integration test: CSV upload -> normalized demand -> workload -> FTE requirements

### Phase 4: Implement Stage 4 MIP Model (4-6 weeks)

1. Model decision variables, constraints, and objective function
2. Build constraint matrix construction code from database state
3. Implement weighted-sum multi-objective
4. Add time limits and solution quality reporting
5. Test against all fixtures
6. Profile memory usage for 200-employee problem
7. Implement Fly.io worker fallback for problems exceeding Edge Function limits

### Phase 5: Performance Optimization (2-3 weeks)

1. Implement solution warm-starting for interactive edits
2. Implement problem decomposition for batch runs
3. Implement greedy heuristic fallback for timeout cases
4. Benchmark across problem sizes and document actual latencies

---

## 7. Scoring Summary

| Dimension | Score | Notes |
|-----------|-------|-------|
| Domain correctness of planning approach | 7/10 | Formulas are correct. Proficiency, timing, learning curve, and absenteeism adjustments are industry-standard. Missing demand uncertainty and decomposition. |
| Mathematical rigor of MIP formulation | 3/10 | Decision variables and objectives are stated in pseudocode. No constraint matrix. No variable bounds. No mathematical notation. Not sufficient to implement from. |
| Implementation readiness | 0/10 | Zero code. Zero dependencies. Zero tests. Zero benchmarks. |
| Runtime feasibility confidence | 2/10 | HiGHS WASM has never been tested in the target runtime. Memory limits are unknown. Performance claims are fabricated. |
| Test coverage | 0/10 | No test fixtures. No unit tests. No integration tests. No benchmark suite. |
| **Overall** | **2.4/10** | Sound domain knowledge with zero implementation and significant architectural risk around solver runtime feasibility. |
