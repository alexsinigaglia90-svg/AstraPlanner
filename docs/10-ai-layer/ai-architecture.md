# AI Architecture: The Three-Plane System

## 1. Architectural Overview

AstraPlanner's intelligence is structured as three planes that operate concurrently, each with distinct responsibilities, consistency models, and failure characteristics. This is not a layer cake where data flows top-to-bottom. It is three co-equal planes that interact laterally, each contributing a different kind of intelligence to every planning decision.

```
+========================================================================+
|                       INTERACTION PLANE                                  |
|   Human-facing. Trust-building. Transparent.                            |
|                                                                          |
|   +----------------+  +----------------+  +-----------------+           |
|   | Explanation    |  | Suggestion UI  |  | Autonomy        |           |
|   | Engine         |  | (Insight cards,|  | Controls        |           |
|   | (Why did the   |  |  recommendation|  | (Grant/revoke   |           |
|   |  system do X?) |  |  panels, NLQ)  |  |  per decision   |           |
|   +-------+--------+  +-------+--------+  |  type per site) |           |
|           |                    |            +--------+--------+           |
+===========|====================|=====================|===================+
            |                    |                     |
    explains|           suggests |            controls |
            |                    |                     |
+===========v====================v=====================v===================+
|                       INTELLIGENCE PLANE                                 |
|   Statistical. Probabilistic. Adaptive.                                  |
|                                                                          |
|   +----------------+  +----------------+  +-----------------+           |
|   | Learning       |  | Pattern        |  | Recommendation  |           |
|   | Models         |  | Detection      |  | Engine          |           |
|   | (Absence pred, |  | (Override      |  | (Ranked actions,|           |
|   |  demand drift, |  |  patterns,     |  |  gap filling,   |           |
|   |  productivity  |  |  seasonal      |  |  rebalancing,   |           |
|   |  calibration)  |  |  trends)       |  |  cross-training)|           |
|   +-------+--------+  +-------+--------+  +--------+--------+           |
|           |                    |                     |                    |
|   +-------v--------------------v---------------------v--------+          |
|   |              Real-Time Feature Store (Upstash Redis)      |          |
|   |   Cached user models, recent event windows, prediction    |          |
|   |   scores, site context snapshots                          |          |
|   +-----------------------------------------------------------+          |
|                                                                          |
+===|==================|==================|============================+===+
    |                  |                  |
    | improves inputs  | evaluates output | learns from outcomes
    |                  |                  |
+===v==================v==================v================================+
|                       DETERMINISTIC PLANE                                |
|   Mathematical. Reproducible. Auditable.                                 |
|                                                                          |
|   +----------------+  +----------------+  +-----------------+           |
|   | Workload       |  | Constraint     |  | Optimization    |           |
|   | Computation    |  | Engine         |  | Solver          |           |
|   | (Demand -->    |  | (Hard/soft     |  | (HiGHS WASM,   |           |
|   |  labor hours)  |  |  constraint    |  |  Fly.io workers,|           |
|   |                |  |  validation)   |  |  greedy heurist)|           |
|   +----------------+  +----------------+  +-----------------+           |
|                                                                          |
+=========================================================================+
            |                    |                     |
            v                    v                     v
+=========================================================================+
|                       DATA LAYER                                         |
|   PostgreSQL 16 (RLS) + pgvector + Supabase Storage + Upstash Redis     |
+=========================================================================+
```

---

## 2. The Deterministic Plane

### 2.1 Purpose

The Deterministic Plane produces mathematically correct, reproducible, and auditable outputs. Given the same inputs, it produces the same outputs every time. It owns:

- **Workload computation:** Translating demand forecasts into required labor hours per process per time slot (see `optimization-strategy.md` for formulas).
- **Constraint validation:** Enforcing hard constraints (working time limits, certification requirements, rest periods) and scoring soft constraint violations (preferences, fairness).
- **Optimization solving:** Generating shift assignments that minimize a weighted objective function subject to constraints (HiGHS LP/MIP solver).
- **Scenario simulation:** Running what-if scenarios by modifying inputs and re-solving.

### 2.2 Key Property: Reproducibility

Every optimization run is fully reproducible. The system captures:

```
OptimizationAuditRecord {
  run_id:              UUID
  input_hash:          SHA-256 of all inputs (demand, workforce, constraints, parameters)
  parameters_snapshot: Complete parameter set used (frozen at run time)
  solver_strategy:     Which algorithm was selected and why
  solver_seed:         Random seed (for tie-breaking reproducibility)
  result_hash:         SHA-256 of the output plan
  solve_time_ms:       Wall-clock solve time
  objective_values:    Final value of each objective function component
}
```

Given `input_hash` and `parameters_snapshot`, the solver will produce an identical plan with the same `result_hash`. This property is essential for audit compliance and for the Intelligence Plane's ability to attribute outcome differences to parameter changes rather than solver non-determinism.

### 2.3 What the Deterministic Plane Does NOT Do

- Does not learn. Its parameters are fixed for a given run.
- Does not predict. It operates on the inputs it receives.
- Does not explain in natural language. It produces structured output (constraint violation reports, objective breakdowns) but not human-readable narratives.
- Does not decide which plan is "good." It optimizes an objective function. Whether the objective weights are correct is the Intelligence Plane's concern.

---

## 3. The Intelligence Plane

### 3.1 Purpose

The Intelligence Plane sits alongside the Deterministic Plane. It does not replace the solver -- it makes the solver smarter by improving inputs, evaluating outputs, and learning from outcomes. It owns:

- **Parameter calibration:** Continuously refining productivity rates, absenteeism buffers, fatigue factors, and objective weights based on observed outcomes.
- **Pattern detection:** Identifying recurring patterns in planning decisions, workforce behavior, demand dynamics, and planner overrides.
- **Prediction:** Forecasting absences, demand deviations, overtime risk, and planner overrides before they happen.
- **Recommendation generation:** Producing ranked, actionable recommendations for gap filling, rebalancing, cross-training, and cost optimization.
- **Feedback incorporation:** Processing implicit and explicit feedback to refine all of the above.

### 3.2 How the Intelligence Plane Interacts with the Deterministic Plane

The interaction is precise and unidirectional at each stage:

```
BEFORE optimization:
  Intelligence Plane --> Deterministic Plane
  "Use these calibrated parameters for this run":
    - Productivity rate (picking, L4): 91.3 lines/hr (not the default 95)
    - Absenteeism buffer (Tuesday): 12.1% (not the default 10%)
    - Objective weights: cost=0.30, skill=0.20, preference=0.22 (not defaults)
    - Predicted absences: [E-4821 (73%), E-2019 (45%)] -- factor into availability

DURING optimization:
  No interaction. The solver runs in isolation with the provided inputs.

AFTER optimization:
  Deterministic Plane --> Intelligence Plane
  "Here is the plan output for evaluation":
    - Assignment set (142 assignments)
    - Objective function value: 47,200 (cost) + 3.6 (skill) + 12 (overtime hours)
    - Constraint violations: [2 soft violations, 0 hard violations]
    - Solve time: 8.4 seconds

  Intelligence Plane evaluates:
    - Plan quality score: 87/100 (based on historical comparison)
    - Override prediction: 14% of assignments likely to be overridden
    - Risk assessment: Tuesday afternoon picking is fragile (1 absence = coverage gap)
    - Recommendations: [pre-assign backup for Tuesday PM, consider cross-training 2 packers for picking]
```

### 3.3 Intelligence Plane Modules

The Intelligence Plane is implemented as a set of Supabase Edge Function modules under `/modules/intelligence/`:

```
supabase/functions/modules/intelligence/
  ├── learning/
  │   ├── parameter-calibrator.ts    // Adjusts productivity rates, buffers, weights
  │   ├── outcome-reconciler.ts      // Compares plan vs. actual, computes deltas
  │   └── user-model-updater.ts      // Updates per-user context models
  │
  ├── patterns/
  │   ├── override-detector.ts       // Detects recurring planner override patterns
  │   ├── absence-pattern-analyzer.ts // Identifies absence trends by day/team/season
  │   ├── demand-drift-detector.ts   // Detects systematic forecast errors
  │   └── seasonal-profiler.ts       // Builds seasonal demand/absence profiles
  │
  ├── prediction/
  │   ├── absence-predictor.ts       // Per-employee absence probability scoring
  │   ├── demand-deviation-scorer.ts // Forecast error prediction
  │   ├── overtime-risk-scorer.ts    // Overtime risk per employee per plan
  │   └── override-predictor.ts      // Predicts which assignments will be overridden
  │
  ├── recommendation/
  │   ├── gap-filler.ts              // Identifies and ranks candidates for coverage gaps
  │   ├── rebalancer.ts              // Suggests assignment changes to reduce overtime/cost
  │   ├── cross-training-advisor.ts  // Identifies high-value cross-training opportunities
  │   └── insight-generator.ts       // Generates daily insights via Claude API
  │
  ├── feedback/
  │   ├── implicit-tracker.ts        // Processes UI events as implicit feedback
  │   ├── explicit-collector.ts      // Processes thumbs-up/down, ratings, dismiss actions
  │   └── feedback-aggregator.ts     // Aggregates feedback signals into model updates
  │
  └── shared/
      ├── feature-store.ts           // Read/write to Upstash Redis feature store
      ├── embedding-service.ts       // Generate/query pgvector embeddings via Voyage AI
      ├── claude-client.ts           // Shared Claude API client with cost tracking
      └── tenant-model-loader.ts     // Load tenant-scoped model parameters
```

---

## 4. The Interaction Plane

### 4.1 Purpose

The Interaction Plane is the human-facing surface of the Intelligence Plane. It translates statistical outputs (prediction scores, pattern detections, ranked recommendations) into human-understandable, trust-building interfaces. It owns:

- **Explanation generation:** Converting model outputs into natural language narratives ("Why was E-4821 assigned to Zone 3?").
- **Suggestion presentation:** Rendering recommendations as actionable UI components (insight cards, recommendation panels, one-click actions).
- **Autonomy management:** Providing controls for granting, revoking, and monitoring autonomous decision authority.
- **Feedback collection:** Capturing user responses to suggestions (accept, reject, modify, ignore) and routing them to the Intelligence Plane.

### 4.2 Explanation Engine

Every AI-influenced output in AstraPlanner has an explanation chain. The Explanation Engine assembles these chains into user-appropriate narratives.

**Explanation levels:**

| Level | Audience | Content | Example |
|-------|---------|---------|---------|
| **Summary** | Site managers, executives | One sentence, key factor only | "E-4821 assigned to picking because they are the highest-skilled available picker." |
| **Detailed** | Planners | Multi-factor breakdown with numbers | "E-4821 assigned to Zone 3 picking (06:00-14:00) because: (1) Picking proficiency L4 (top 20% of pool), (2) No overtime impact (32h scheduled this week, limit 40h), (3) Zone 3 preference match (assigned 8 of last 10 weeks), (4) Commute proximity (home site). Score: 92/100." |
| **Technical** | System administrators, auditors | Full model trace with parameter values | "Assignment score: 92.4. Breakdown: skill_score=0.8 * weight_0.20 = 0.16, overtime_score=1.0 * weight_0.15 = 0.15, preference_score=0.9 * weight_0.22 = 0.198, cost_score=0.85 * weight_0.30 = 0.255, fairness_score=0.78 * weight_0.08 = 0.062. Model: parameter_set_v47, calibrated 2026-03-19." |

**Implementation:** Explanation generation uses two paths:
1. **Structured explanations** (no AI required): The optimization solver emits a score breakdown for each assignment. The Explanation Engine formats this into a human-readable template. No Claude API call needed.
2. **Narrative explanations** (Claude API): For complex explanations or natural language queries ("Why is overtime high this week?"), the Explanation Engine sends the structured data to Claude Haiku/Sonnet and requests a natural language narrative. The structured data serves as the ground truth -- Claude adds readability, not information.

### 4.3 Suggestion UI Components

Suggestions flow from the Intelligence Plane through the Interaction Plane to specific UI components:

| Component | Location | Data Source | Interaction Model |
|-----------|---------|------------|-------------------|
| **Insight Cards** | Control Room dashboard, Planning Workbench sidebar | `intelligence.insights` table, refreshed daily via insight generator + real-time via anomaly detector | Read → Dismiss / Act / Provide Feedback |
| **Recommendation Panel** | Planning Workbench, triggered by gap detection or user request | Recommendation Engine (gap-filler, rebalancer) | Review → Accept / Reject / Modify per item |
| **Inline Suggestions** | Within the schedule grid, on hover or on edit | Override predictor + gap filler | Tooltip or popover → Accept / Ignore |
| **NLQ Response** | AI chat panel (right sidebar) | Claude API via ai.router.naturalLanguageQuery | Conversational → Follow-up questions allowed |
| **Autonomy Dashboard** | Settings → AI & Autonomy | `intelligence.autonomy_grants` + `intelligence.competence_scores` | Configure thresholds → Grant / Revoke per decision type |

### 4.4 Autonomy Controls

The Autonomy Dashboard provides granular control over what the system is permitted to do without human approval:

```
Autonomy Controls — Site: DFW-04
─────────────────────────────────────────────────────────────────────

Decision Type              Autonomy Level    Competence    Last 30d
─────────────────────────────────────────────────────────────────────
Absence replacement        [Autonomous]      87%           23 actions
  └── Boundary: Same skill level, no overtime impact
  └── Escalation: No qualified replacement → alert planner

Demand-driven replan       [Assistive]       74%           8 replans
  └── Boundary: Demand delta <15%, cost delta <3%
  └── Escalation: Above thresholds → present draft for review

Certification tracking     [Autonomous]      95%           12 updates
  └── Boundary: Renewals and new certs auto-applied
  └── Escalation: Expiration → compliance alert

Schedule swap              [Proactive]       68%           5 swaps
  └── Current: System suggests, planner approves
  └── Note: Competence trending up (was 61% last month)

Cross-site transfer        [Reactive]        N/A           0 actions
  └── Not enabled for this site
  └── Requires: Enterprise tier + multi-site module

[Grant More Autonomy]  [Revoke All]  [View Audit Log]
```

---

## 5. Event-Driven Architecture for AI

### 5.1 Event Sources

The Intelligence Plane consumes events from three categories of sources:

**User interaction events** (high volume, low latency):

| Event | Captured Data | Volume Estimate |
|-------|-------------|----------------|
| `user.assignment.override` | Original assignment, new assignment, time-to-decision, viewed panels, override reason (if provided) | 50-200/day/site |
| `user.insight.viewed` | Insight ID, view duration, subsequent action (acted, dismissed, ignored) | 100-500/day/site |
| `user.recommendation.response` | Recommendation ID, response (accept/reject/modify), modification details | 20-100/day/site |
| `user.plan.approved` | Plan ID, review duration, changes made during review | 1-5/day/site |
| `user.nlq.query` | Query text, response satisfaction (implicit: follow-up query = unsatisfied) | 10-50/day/site |
| `user.navigation.pattern` | Page transitions, time-on-page, feature usage | 500-2000/day/user |

**System events** (medium volume, variable latency):

| Event | Captured Data | Source |
|-------|-------------|--------|
| `plan.generated` | Plan metrics, solver performance, constraint violations | Optimization Engine |
| `plan.approved` / `plan.rejected` | Approval metadata, rejection reason | Planning Workbench |
| `demand.forecast.updated` | Demand delta, source system, confidence | Demand Ingestion |
| `demand.anomaly.detected` | Anomaly type, z-score, severity | Demand Anomaly Detector |
| `employee.unavailable` | Absence type, duration, impact on active plans | Workforce Registry |
| `skill.profile.updated` | Skill changes, source (training, assessment, expiry) | Workforce Registry |
| `site.capacity.changed` | Capacity delta, affected zones, duration | Site Configuration |

**Outcome events** (low volume, daily batch):

| Event | Captured Data | Source |
|-------|-------------|--------|
| `outcome.plan_vs_actual` | Planned hours vs. actual hours by employee, process, day | Daily reconciliation pipeline |
| `outcome.coverage_gap` | Gaps that materialized, root cause (absence, demand spike, skill mismatch) | Daily reconciliation pipeline |
| `outcome.overtime_actual` | Actual overtime vs. planned overtime by employee | Payroll/attendance data |
| `outcome.forecast_accuracy` | Forecast vs. actual demand by process, day, site | Daily reconciliation pipeline |
| `outcome.productivity_actual` | Actual throughput per employee per process per shift | WMS/TMS data integration |

### 5.2 Event Bus Architecture

Events flow through two tracks, aligned with the existing event architecture (see `event-architecture.md`):

```
Track 1: Real-Time Events (Supabase Realtime)
──────────────────────────────────────────────
User interaction events ──► Supabase Realtime channel:
                             tenant:{org_id}:intelligence:events
                                      │
                                      ▼
                            Intelligence Event Consumer
                            (Supabase Edge Function)
                                      │
                        ┌─────────────┼──────────────┐
                        │             │              │
                        ▼             ▼              ▼
                  Write to      Update Redis     Check pattern
                  intelligence  feature store    triggers
                  .user_events  (real-time       (threshold
                  (PostgreSQL)  user model,      breaches →
                                event windows)   queue analysis)


Track 2: Batch Events (pg_cron → Edge Function)
──────────────────────────────────────────────
Daily at 02:00 local time:
┌──────────────────────────────────────────────────────────────┐
│  Offline Learning Pipeline                                    │
│                                                                │
│  Step 1: Outcome Reconciliation                               │
│    - Load yesterday's plan assignments                        │
│    - Load actual attendance, hours worked, throughput          │
│    - Compute deltas: planned vs. actual per employee/process  │
│    - Store in intelligence.outcomes                           │
│                                                                │
│  Step 2: Parameter Calibration                                │
│    - Recompute productivity rates (rolling 30-day average)    │
│    - Recompute absenteeism rates (rolling 13-week by DOW)     │
│    - Recompute fatigue factors (regression on OT vs. output)  │
│    - Recalibrate objective weights (minimize override rate)   │
│    - Store updated parameters in intelligence.model_params    │
│                                                                │
│  Step 3: Pattern Mining                                       │
│    - Analyze override patterns (clustering by context)        │
│    - Analyze absence patterns (seasonality decomposition)     │
│    - Analyze demand drift (forecast bias detection)           │
│    - Store patterns in intelligence.patterns                  │
│                                                                │
│  Step 4: Model Update                                         │
│    - Retrain absence prediction model (per-tenant)            │
│    - Update demand deviation scorer (per-site)                │
│    - Update user context models (per-user)                    │
│    - Refresh site context snapshots in Redis                  │
│                                                                │
│  Step 5: Competence Score Update                              │
│    - For each autonomous decision type:                       │
│      - Compare AI decisions vs. outcomes (rolling 30-day)     │
│      - Update competence score                                │
│      - Check autonomy grant/revoke thresholds                 │
│    - Store in intelligence.competence_scores                  │
└──────────────────────────────────────────────────────────────┘

Daily at 05:00 local time per site:
┌──────────────────────────────────────────────────────────────┐
│  Insight Generation Pipeline                                  │
│                                                                │
│  Step 1: Metric computation (deterministic, no AI)            │
│    - Coverage gap analysis by day and process (next 7 days)   │
│    - FTE surplus/deficit by day                               │
│    - Overtime hours by employee                               │
│    - Absence rate trends                                      │
│    - Skill coverage ratio by process                          │
│    - Cost vs. budget variance                                 │
│                                                                │
│  Step 2: Insight generation (Claude Haiku, batched)           │
│    - Format all metrics as structured JSON context            │
│    - Request top 5-8 insights with Zod-enforced schema        │
│    - Each insight: category, severity, title, body,           │
│      data_points, suggested_action, confidence                │
│                                                                │
│  Step 3: Deduplication and delivery                           │
│    - Compare with insights from last 7 days (embedding sim)   │
│    - Store new insights in intelligence.insights              │
│    - Deliver via notification module                          │
└──────────────────────────────────────────────────────────────┘
```

### 5.3 Event Consumers

| Consumer | Trigger | Processing Time | Output |
|----------|---------|----------------|--------|
| **Real-time Insight Generator** | `demand.anomaly.detected`, `employee.unavailable` | < 5 seconds | Immediate alert to Control Room |
| **Anomaly Detector** | `demand.forecast.updated` (z-score > 2.0) | < 2 seconds | `DemandAnomalyDetected` event |
| **Quick Recommender** | `user.assignment.override`, coverage gap detection | < 5 seconds | Inline suggestion on Planning Workbench |
| **Override Pattern Analyzer** | Batch trigger when `override_count > threshold` | < 30 seconds | Pattern entry in `intelligence.patterns` |
| **Offline Learning Pipeline** | pg_cron daily at 02:00 | 5-30 minutes per tenant | Updated model parameters, patterns, predictions |
| **Insight Generator** | pg_cron daily at 05:00 | 30-60 seconds per site | 5-8 insights per site stored and delivered |
| **Competence Scorer** | pg_cron daily at 02:30 | < 5 minutes per tenant | Updated competence scores, autonomy adjustments |

---

## 6. The Learning Loop

The Learning Loop is the core mechanism that makes the system smarter over time. It is not a metaphor -- it is a concrete, instrumented process.

```
┌─────────────────────────────────────────────────────────────────┐
│                        THE LEARNING LOOP                         │
│                                                                   │
│    ┌──────────┐                                                  │
│    │ OBSERVE  │ ◄──── UI events, domain events, outcome data     │
│    │          │                                                   │
│    └────┬─────┘                                                  │
│         │ raw signals                                            │
│         ▼                                                        │
│    ┌──────────┐                                                  │
│    │ ANALYZE  │ ◄──── Pattern detection, statistical analysis    │
│    │          │        Embedding similarity, trend decomposition  │
│    └────┬─────┘                                                  │
│         │ detected patterns                                      │
│         ▼                                                        │
│    ┌──────────────┐                                              │
│    │ HYPOTHESIZE  │ ◄──── "Tuesday absences are elevated"        │
│    │              │        "Planner prefers seniors in shipping"  │
│    │              │        "Picking rate has declined 8%"         │
│    └────┬─────────┘                                              │
│         │ recommendations                                        │
│         ▼                                                        │
│    ┌──────────┐                                                  │
│    │ PRESENT  │ ◄──── Explanation Engine formats for user         │
│    │          │        Insight cards, recommendation panels       │
│    └────┬─────┘                                                  │
│         │ user sees recommendation                               │
│         ▼                                                        │
│    ┌──────────┐        ┌────────────────────────┐                │
│    │   ACT    │───────►│ User accepts / rejects  │               │
│    │          │        │ / modifies / ignores    │                │
│    └────┬─────┘        └────────────────────────┘                │
│         │ action + context                                       │
│         ▼                                                        │
│    ┌──────────┐                                                  │
│    │  LEARN   │ ◄──── Incorporate feedback into model            │
│    │          │        Update parameters, adjust confidence       │
│    │          │        Refine patterns, recalibrate predictions   │
│    └────┬─────┘                                                  │
│         │ updated model                                          │
│         └──────────────────────────► back to OBSERVE             │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

**Concrete example of one full loop iteration:**

1. **Observe:** Over 8 consecutive Tuesdays, the system captures that planner `usr_planner_01` overrides the optimizer's picking assignments for the 14:00-22:00 shift, moving senior employees (proficiency L4-L5) from picking to shipping.

2. **Analyze:** The override pattern analyzer clusters these events by context. Common context: Tuesday, afternoon shift, senior employees, picking→shipping direction. Statistical significance: p < 0.01 (this is not random).

3. **Hypothesize:** The system forms a hypothesis stored in `intelligence.patterns`:
   ```json
   {
     "pattern_id": "pat_abc123",
     "type": "override_pattern",
     "description": "Planner consistently moves senior employees from picking to shipping on Tuesday afternoons",
     "confidence": 0.89,
     "evidence_count": 8,
     "first_observed": "2026-01-14",
     "last_observed": "2026-03-10",
     "suggested_action": "Pre-assign 2 senior employees (L4+) to shipping for Tuesday 14:00-22:00 shift",
     "expected_impact": "Eliminate ~15 minutes of manual override per week"
   }
   ```

4. **Present:** The Insight Generator creates an insight card:
   > "For the past 8 Tuesdays, you've moved senior pickers to afternoon shipping. I can pre-assign E-4821 and E-5103 to shipping automatically. This matches your established pattern and saves ~15 minutes of weekly adjustment. [Enable] [Not now] [This isn't a pattern I want to keep]"

5. **Act:** Planner clicks [Enable].

6. **Learn:** The system:
   - Updates the optimizer's input for future Tuesday plans: E-4821 and E-5103 are pre-assigned to shipping 14:00-22:00.
   - Records the explicit positive feedback on this pattern.
   - Increases confidence in similar override patterns at this site.
   - Monitors outcomes: does the pre-assignment produce the same or better results as the manual override?

---

## 7. Real-Time vs. Offline Processing

### 7.1 Processing Tiers

| Tier | Latency Target | Trigger | Processing Location | Use Cases |
|------|---------------|---------|-------------------|-----------|
| **Real-time** | < 5 seconds | Event arrival | Supabase Edge Function (synchronous) | Anomaly detection, constraint violation alerts, quick candidate recommendations, inline suggestions |
| **Near-real-time** | < 5 minutes | Event accumulation threshold or periodic sweep | Supabase Edge Function (async via BullMQ) | Insight generation from event clusters, trend detection, recommendation ranking, override pattern detection |
| **Offline (daily)** | < 30 minutes | pg_cron at 02:00 local | Supabase Edge Function (batch) or Fly.io worker for heavy compute | Model retraining, parameter calibration, seasonal analysis, cross-site benchmarking, competence scoring |
| **Offline (weekly)** | < 2 hours | pg_cron Sunday 01:00 | Fly.io worker | User preference model updates, long-range pattern mining, organizational context model refresh |

### 7.2 What Runs Where

**Real-time (< 5 seconds):**

```
Event: employee.unavailable (E-4821 called sick)
    │
    ▼
Edge Function: intelligence/prediction/absence-impact-scorer
    │
    ├── Check: Does E-4821 have active assignments today?
    │   └── Yes: picking Zone 3, 06:00-14:00
    │
    ├── Assess: What is the coverage impact?
    │   └── Zone 3 drops from 13/12 FTE (108%) to 12/12 (100%)
    │   └── Below comfort threshold (105%)? Yes.
    │
    ├── Find candidates: Query Redis feature store for
    │   available employees with picking L3+ skill
    │   └── 4 candidates found, ranked by composite score
    │
    ├── Check autonomy: Is absence replacement autonomous for this site?
    │   └── Yes: competence score 87%, boundary conditions met
    │
    ├── Execute: Assign top candidate (E-5103)
    │   └── Create ShiftAssigned event
    │   └── Send SMS notification to E-5103
    │   └── Log autonomous action in intelligence.autonomous_actions
    │
    └── Notify planner: Morning summary entry
        "E-4821 absent (sick). Auto-replaced with E-5103
         (picking L4, no overtime impact). Coverage: 108%."

Total elapsed: 3.2 seconds
```

**Near-real-time (< 5 minutes):**

```
Trigger: 5th override in the past 2 hours at Site DFW-04
    │
    ▼
BullMQ job: intelligence/patterns/override-cluster-analyzer
    │
    ├── Load recent overrides (last 2 hours, this site)
    │
    ├── Cluster by context:
    │   └── 3 overrides in picking (moving employees to different zones)
    │   └── 2 overrides in packing (replacing with higher-skilled employees)
    │
    ├── Check against known patterns:
    │   └── Picking zone rebalancing is a known pattern (confidence 0.82)
    │   └── Packing skill upgrade is new (first occurrence this pattern)
    │
    ├── Generate insight (if new pattern):
    │   └── "Planner has upgraded 2 packing assignments to higher-skilled
    │        employees in the past hour. If this is a response to quality
    │        issues, consider enabling quality-weighted assignment scoring
    │        for packing."
    │
    └── Store in intelligence.insights, deliver notification

Total elapsed: 45 seconds
```

**Offline (daily):**

```
pg_cron trigger: 02:00 local time
    │
    ▼
Edge Function: intelligence/learning/daily-learning-pipeline
    │
    ├── Step 1: Outcome reconciliation (5 min)
    │   ├── Load yesterday's plan assignments (all sites for this tenant)
    │   ├── Load actual data: hours worked, throughput, absences
    │   ├── Compute deltas per employee per process
    │   └── Store in intelligence.outcomes
    │
    ├── Step 2: Parameter calibration (10 min)
    │   ├── Productivity rates: rolling 30-day actual avg by process/proficiency
    │   │   └── Output: picking L4 actual = 91.3 lines/hr (was 92.1 yesterday)
    │   ├── Absenteeism: rolling 13-week by DOW
    │   │   └── Output: Tuesday = 12.1% (was 11.9% yesterday)
    │   ├── Fatigue factors: regression (overtime hours → productivity drop)
    │   │   └── Output: 1.12 per hour beyond 8 (stable)
    │   ├── Objective weights: Bayesian optimization (minimize override rate)
    │   │   └── Output: preference weight up from 0.21 to 0.22
    │   └── Store all in intelligence.model_parameters with changelog
    │
    ├── Step 3: Pattern mining (5 min)
    │   ├── Override patterns: cluster last 7 days of overrides
    │   ├── Absence patterns: seasonality decomposition update
    │   ├── Demand drift: forecast bias by source system
    │   └── Store in intelligence.patterns
    │
    ├── Step 4: Model update (5 min)
    │   ├── Absence prediction: retrain gradient boosted model
    │   ├── Demand deviation: update error distribution parameters
    │   ├── User models: refresh per-user context vectors
    │   └── Push updated model snapshots to Redis feature store
    │
    └── Step 5: Competence scoring (2 min)
        ├── For each autonomous decision type:
        │   ├── Compute: AI decisions vs. outcomes (rolling 30 days)
        │   ├── Update competence score
        │   └── Check thresholds: grant/revoke autonomy if crossed
        └── Store in intelligence.competence_scores
```

---

## 8. Feedback Loops

### 8.1 Implicit Feedback

Implicit feedback is derived from user behavior without requiring explicit action. The system infers signal from absence of action as well as from action.

| User Behavior | Signal | Strength | Processing |
|--------------|--------|----------|------------|
| User accepts recommendation | Positive: this was a good suggestion | Strong positive | Increment recommendation quality score for this context |
| User ignores recommendation (visible >30 seconds, no action taken) | Weak negative: suggestion was not compelling enough to act on | Weak negative | Decrement recommendation relevance score for this user/context |
| User explicitly rejects recommendation (clicks [Reject] or [Dismiss]) | Negative: this was a bad or irrelevant suggestion | Strong negative | Decrement, log context for pattern analysis |
| User overrides AI-generated assignment | Learning signal: the AI's choice was wrong for this specific case | Contextual (not inherently negative) | Capture full context (original assignment, new assignment, all visible data at time of override) |
| User spends >60 seconds on explanation before accepting | Moderate positive, but the explanation needed work | Moderate positive | Increment quality score, flag explanation complexity for simplification |
| User modifies recommendation before accepting | Partial positive: right direction, wrong specifics | Moderate positive | Capture the delta between suggestion and accepted version |
| User asks follow-up question after insight | Engagement signal: insight was interesting but incomplete | Positive (engagement) | Log follow-up as evidence that insight topic is valuable |

**Processing pipeline for implicit feedback:**

```typescript
// intelligence/feedback/implicit-tracker.ts

interface ImplicitFeedbackEvent {
  event_type: 'recommendation.accepted' | 'recommendation.rejected' |
              'recommendation.ignored' | 'recommendation.modified' |
              'insight.viewed' | 'insight.dismissed' | 'insight.acted_on' |
              'assignment.overridden' | 'explanation.viewed';
  entity_id: string;        // recommendation_id, insight_id, or assignment_id
  user_id: string;
  tenant_id: string;
  site_id: string;
  timestamp: string;
  context: {
    time_to_action_ms: number;
    viewed_panels: string[];
    session_duration_min: number;
    actions_this_session: number;
  };
  modification?: {
    original: Record<string, unknown>;
    modified: Record<string, unknown>;
  };
}

async function processImplicitFeedback(event: ImplicitFeedbackEvent) {
  // 1. Compute signal strength
  const signal = computeSignalStrength(event);
  // signal: { direction: 'positive' | 'negative', strength: 0.0-1.0 }

  // 2. Update recommendation quality model
  await updateRecommendationQuality(event.entity_id, signal);

  // 3. Update user preference model
  await updateUserModel(event.user_id, event, signal);

  // 4. If override, capture learning context
  if (event.event_type === 'assignment.overridden') {
    await captureOverrideContext(event);
  }

  // 5. Update Redis feature store
  await featureStore.increment(
    `user:${event.user_id}:feedback:${signal.direction}`,
    signal.strength
  );
}
```

### 8.2 Explicit Feedback

Explicit feedback is collected through purpose-built UI elements:

| UI Element | Location | Data Captured |
|-----------|---------|-------------|
| Thumbs up/down on insight cards | Control Room, Planning Workbench | `{insight_id, rating: 'up' | 'down', user_id}` |
| "This was helpful" / "Not relevant" toggle on recommendations | Recommendation panel | `{recommendation_id, helpful: boolean, user_id}` |
| Override reason dropdown | Assignment override dialog | `{assignment_id, reason: enum('skill_mismatch', 'employee_preference', 'coverage_concern', 'manager_request', 'other'), free_text?: string}` |
| Plan rejection reason | Plan approval workflow | `{plan_id, rejection_reason: string, violated_expectations: string[]}` |
| Autonomy feedback after autonomous action | Morning summary, autonomous action log | `{action_id, was_correct: boolean, would_have_done_differently?: string}` |

### 8.3 Feedback-to-Model Pipeline

```
Explicit Feedback                    Implicit Feedback
    │                                    │
    ▼                                    ▼
intelligence.explicit_feedback      intelligence.implicit_feedback
    │                                    │
    └──────────────┬─────────────────────┘
                   │
                   ▼
        Feedback Aggregator (daily batch)
                   │
    ┌──────────────┼──────────────────────┐
    │              │                      │
    ▼              ▼                      ▼
Recommendation   User Model           Parameter
Quality Model    Update               Adjustment
    │              │                      │
    │  "Insight X   │  "User Y prefers    │  "Override rate for
    │  has 85%      │  senior employees   │  cost weight 0.35
    │  helpfulness  │  in shipping on     │  is 18%. Reduce to
    │  rating"      │  Tuesdays"          │  0.30 to test if
    │              │                      │  overrides decrease"
    ▼              ▼                      ▼
intelligence.    intelligence.         intelligence.
insight_quality  user_models           model_parameters
```

---

## 9. Integration with Existing Architecture

### 9.1 Intelligence Plane as Edge Function Module

The Intelligence Plane runs as Supabase Edge Functions, consistent with the existing backend architecture. It does not introduce a separate service or infrastructure component.

```
supabase/functions/
  ├── api/                    # Existing tRPC routers
  │   ├── demand.ts
  │   ├── workforce.ts
  │   ├── plan.ts
  │   ├── scenario.ts
  │   └── ai.ts               # AI gateway (existing)
  │
  ├── modules/
  │   ├── optimization/        # Existing optimization module
  │   ├── workload/            # Existing workload computation
  │   ├── notification/        # Existing notification module
  │   └── intelligence/        # NEW: Intelligence Plane module
  │       ├── learning/
  │       ├── patterns/
  │       ├── prediction/
  │       ├── recommendation/
  │       ├── feedback/
  │       └── shared/
  │
  └── jobs/
      ├── daily-learning.ts    # pg_cron trigger: 02:00
      ├── daily-insights.ts    # pg_cron trigger: 05:00
      └── weekly-models.ts     # pg_cron trigger: Sunday 01:00
```

### 9.2 Learning Data Schema

All intelligence data is stored in a dedicated `intelligence` schema within the same PostgreSQL database, isolated from operational tables but sharing the same RLS enforcement via `organization_id`.

```sql
-- intelligence schema tables

CREATE SCHEMA intelligence;

-- Raw event storage (partitioned by tenant, TTL-managed)
CREATE TABLE intelligence.user_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id         UUID NOT NULL,
  site_id         UUID,
  event_type      TEXT NOT NULL,
  event_data      JSONB NOT NULL,
  session_id      UUID,
  created_at      TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);
-- Partitioned monthly, old partitions dropped after 90 days

-- Decision events (permanent)
CREATE TABLE intelligence.decision_events (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  decision_type   TEXT NOT NULL,  -- 'assignment_override', 'plan_approval', etc.
  context         JSONB NOT NULL, -- full context snapshot at decision time
  outcome         JSONB,          -- populated by outcome reconciliation
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Outcome reconciliation data (permanent)
CREATE TABLE intelligence.outcomes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  site_id         UUID NOT NULL,
  plan_id         UUID NOT NULL,
  date            DATE NOT NULL,
  planned         JSONB NOT NULL, -- {hours, headcount, cost, by_process}
  actual          JSONB NOT NULL, -- {hours, headcount, cost, by_process}
  deltas          JSONB NOT NULL, -- {hours_delta, cost_delta, by_process_deltas}
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, site_id, plan_id, date)
);

-- Model parameters (versioned, per-tenant)
CREATE TABLE intelligence.model_parameters (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  site_id         UUID,           -- NULL = org-wide parameter
  parameter_type  TEXT NOT NULL,   -- 'productivity_rate', 'absence_rate', etc.
  parameter_key   TEXT NOT NULL,   -- 'picking.L4', 'tuesday', etc.
  value           JSONB NOT NULL,  -- parameter value (can be scalar or complex)
  previous_value  JSONB,           -- value before this update
  evidence        JSONB,           -- statistical evidence for the change
  version         INTEGER NOT NULL DEFAULT 1,
  valid_from      TIMESTAMPTZ DEFAULT now(),
  valid_to        TIMESTAMPTZ,     -- NULL = current
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Detected patterns
CREATE TABLE intelligence.patterns (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  site_id         UUID,
  pattern_type    TEXT NOT NULL,   -- 'override_pattern', 'absence_trend', etc.
  description     TEXT NOT NULL,
  confidence      FLOAT NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  evidence_count  INTEGER NOT NULL DEFAULT 0,
  first_observed  TIMESTAMPTZ NOT NULL,
  last_observed   TIMESTAMPTZ NOT NULL,
  status          TEXT NOT NULL DEFAULT 'active', -- 'active', 'confirmed', 'dismissed'
  suggested_action TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Generated insights (delivered to users)
CREATE TABLE intelligence.insights (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  site_id         UUID NOT NULL,
  category        TEXT NOT NULL,   -- 'capacity_forecast', 'absence_pattern', etc.
  severity        TEXT NOT NULL,   -- 'high', 'medium', 'low'
  title           VARCHAR(80) NOT NULL,
  body            VARCHAR(500) NOT NULL,
  data_points     JSONB NOT NULL,
  suggested_action VARCHAR(300),
  confidence      FLOAT NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  ai_generated    BOOLEAN DEFAULT true,
  delivered_to    UUID[],          -- user IDs who received this insight
  feedback        JSONB,           -- aggregated feedback
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Competence scores for autonomy management
CREATE TABLE intelligence.competence_scores (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  site_id         UUID NOT NULL,
  decision_type   TEXT NOT NULL,
  competence      FLOAT NOT NULL CHECK (competence BETWEEN 0 AND 1),
  sample_size     INTEGER NOT NULL,
  window_start    TIMESTAMPTZ NOT NULL,
  window_end      TIMESTAMPTZ NOT NULL,
  autonomy_level  TEXT NOT NULL,   -- 'reactive', 'proactive', 'assistive', 'autonomous'
  grant_threshold FLOAT NOT NULL DEFAULT 0.80,
  revoke_threshold FLOAT NOT NULL DEFAULT 0.70,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, site_id, decision_type)
);

-- Autonomous action log
CREATE TABLE intelligence.autonomous_actions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  site_id         UUID NOT NULL,
  decision_type   TEXT NOT NULL,
  action_taken    JSONB NOT NULL,  -- what the system did
  rationale       JSONB NOT NULL,  -- why (model inputs, scores, boundary check)
  outcome         JSONB,           -- populated after outcome is known
  was_correct     BOOLEAN,         -- populated by outcome reconciliation or user feedback
  user_feedback   JSONB,           -- explicit feedback from planner
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Explicit feedback
CREATE TABLE intelligence.feedback (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id         UUID NOT NULL,
  entity_type     TEXT NOT NULL,   -- 'insight', 'recommendation', 'autonomous_action'
  entity_id       UUID NOT NULL,
  rating          TEXT,            -- 'up', 'down', 'helpful', 'not_relevant'
  free_text       TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- User context models (per-user intelligence profile)
CREATE TABLE intelligence.user_models (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  user_id         UUID NOT NULL UNIQUE,
  planning_style  JSONB,           -- derived preferences, override patterns
  trust_indicators JSONB,          -- engagement metrics, feedback patterns
  feature_vector  vector(384),     -- embedding of user behavior for similarity
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- RLS policies (applied to all intelligence tables)
-- Example for intelligence.insights:
ALTER TABLE intelligence.insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON intelligence.insights
  USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
```

### 9.3 pgvector for Embedding-Based Similarity

pgvector is used for three similarity search use cases within the Intelligence Plane:

| Use Case | What Gets Embedded | Embedding Model | Dimension | Query Pattern |
|----------|-------------------|-----------------|-----------|--------------|
| **Similar sites** | Site context vector (operational rhythm, workforce characteristics, demand profile) | Voyage AI | 384 | "Find sites similar to DFW-04 for benchmarking" |
| **Similar employees** | Employee context vector (skill profile, productivity profile, reliability profile) | Voyage AI | 384 | "Find employees with similar capabilities to E-4821 for replacement" |
| **Similar patterns** | Pattern description + context embedding | Voyage AI | 384 | "Has this override pattern been seen at other sites?" |
| **Insight deduplication** | Insight body text embedding | Voyage AI | 384 | "Is this insight semantically similar to one generated yesterday?" |

**Embedding pipeline:**

```
New entity or updated entity
    │
    ▼
Embedding Service (intelligence/shared/embedding-service.ts)
    │
    ├── Check embedding cache (Redis): key = hash(entity_type:entity_id:content_hash)
    │   └── Cache hit? Return cached embedding.
    │   └── Cache miss? Continue.
    │
    ├── Strip PII (names, emails, phones)
    │
    ├── Call Voyage AI embedding API (batch if multiple entities)
    │   └── Model: voyage-3-lite (384 dimensions)
    │   └── Cost: ~$0.06 per million tokens
    │
    ├── Store embedding in pgvector column
    │   └── intelligence.user_models.feature_vector
    │   └── or dedicated embedding table with foreign key
    │
    └── Cache in Redis with TTL = 7 days
```

### 9.4 Claude API for Intelligence Functions

The Intelligence Plane uses Claude through the existing `ai-gateway` Edge Function (see `ai-integration.md` Section 7-9). Intelligence-specific uses:

| Function | Claude Model | Input | Output | Frequency | Est. Cost |
|----------|-------------|-------|--------|-----------|-----------|
| Daily insight generation | Haiku | Site metrics JSON (~2,000 tokens) | 5-8 insights JSON (~800 tokens) | Daily per site | ~$0.002/site/day |
| Explanation narrative | Haiku | Structured score breakdown (~500 tokens) | Natural language narrative (~200 tokens) | On-demand | ~$0.001/request |
| Pattern description | Haiku | Pattern context data (~800 tokens) | Human-readable pattern description (~300 tokens) | Per new pattern | ~$0.001/pattern |
| Override analysis | Sonnet | Override cluster data (~1,500 tokens) | Root cause analysis + recommendation (~600 tokens) | Near-real-time (threshold trigger) | ~$0.01/analysis |
| Cross-site benchmarking narrative | Sonnet | Multi-site comparison data (~3,000 tokens) | Benchmarking report (~1,500 tokens) | Weekly | ~$0.03/report |

### 9.5 Redis (Upstash) as Real-Time Feature Store

The feature store provides sub-millisecond access to frequently queried intelligence data. It is the hot cache for the Intelligence Plane.

**Key-value patterns:**

```
# User model cache (refreshed daily, updated incrementally)
user:{user_id}:model → JSON (planning_style, trust_indicators, recent_overrides)
TTL: 24 hours

# Site context snapshot (refreshed daily)
site:{site_id}:context → JSON (operational_rhythm, workforce_characteristics, absence_patterns)
TTL: 24 hours

# Recent event windows (rolling)
site:{site_id}:events:last_2h → Sorted Set (event_id → timestamp)
TTL: 3 hours

# Prediction scores (refreshed by real-time scorer)
employee:{emp_id}:absence_prob:{date} → Float
TTL: until date passes

# Override counters (real-time)
site:{site_id}:override_count:today → Integer
TTL: end of day

# Recommendation quality scores (rolling)
recommendation_type:{type}:quality → Float (rolling average)
TTL: 30 days

# Competence scores (daily refresh)
site:{site_id}:competence:{decision_type} → Float
TTL: 48 hours
```

---

## 10. Multi-Tenant AI Isolation

### 10.1 Isolation Model

All intelligence data and models are tenant-scoped. The Intelligence Plane never shares learned models, patterns, predictions, or recommendations across tenants.

| Component | Isolation Mechanism | Enforcement Point |
|-----------|-------------------|-------------------|
| **Model parameters** | `organization_id` column + RLS policy | PostgreSQL RLS on `intelligence.model_parameters` |
| **Patterns** | `organization_id` column + RLS policy | PostgreSQL RLS on `intelligence.patterns` |
| **Predictions** | Tenant-scoped model training (each tenant has its own model instance) | Model training pipeline filters by `organization_id` |
| **Feature store (Redis)** | Key prefix: `tenant:{org_id}:...` | Application-level key construction + Redis ACL (Upstash namespace isolation) |
| **Embeddings** | `organization_id` column on embedding tables + RLS | pgvector queries include `WHERE organization_id = ...` (enforced by RLS) |
| **Claude API calls** | Tenant context included in prompt; no cross-tenant data in any prompt | PII stripping middleware scopes data loading to tenant |
| **Insights** | `organization_id` column + RLS policy | PostgreSQL RLS on `intelligence.insights` |
| **Competence scores** | `organization_id` column + RLS policy | PostgreSQL RLS on `intelligence.competence_scores` |

### 10.2 No Cross-Tenant Learning

Each tenant's intelligence models are trained exclusively on that tenant's data. There is no "fleet learning" or "federated model" in V1.

**Why:** Cross-tenant learning introduces privacy and competitive sensitivity concerns. Two competing logistics operators on the same platform should never benefit from each other's operational data, even in aggregated form.

**Exception -- anonymized benchmarks (V2 scope):** In V2, AstraPlanner will offer opt-in anonymized benchmarking. Participating tenants contribute anonymized, aggregated metrics (e.g., "average absence rate for e-commerce fulfillment centers with 100-500 employees in Western Europe") to a benchmark pool. Individual tenant data is never identifiable. Participation is opt-in and controlled by the tenant admin. Benchmark data flows one way: aggregated metrics are published for comparison, but no model training occurs on cross-tenant data.

### 10.3 Per-Tenant Model Storage

```sql
-- Each tenant has its own set of model parameters
-- No shared parameters between tenants

SELECT * FROM intelligence.model_parameters
WHERE organization_id = 'tenant_acme_123'  -- RLS enforces this
  AND parameter_type = 'productivity_rate'
  AND site_id = 'site_dfw_04'
  AND valid_to IS NULL;  -- current parameters only

-- Result:
-- parameter_key  | value                    | version | evidence
-- picking.L1     | {"rate": 54.8, "n": 42}  | 12      | {"30d_avg": 54.8, "trend": "stable"}
-- picking.L2     | {"rate": 68.2, "n": 87}  | 15      | {"30d_avg": 68.2, "trend": "-2.1%"}
-- picking.L3     | {"rate": 82.1, "n": 134} | 18      | {"30d_avg": 82.1, "trend": "+0.5%"}
-- picking.L4     | {"rate": 91.3, "n": 56}  | 22      | {"30d_avg": 91.3, "trend": "-1.8%"}
-- picking.L5     | {"rate": 101.7, "n": 23} | 9       | {"30d_avg": 101.7, "trend": "stable"}
```

### 10.4 Tenant Onboarding for Intelligence

When a new tenant onboards, the Intelligence Plane initializes with:

1. **Industry-default parameters** from the setup wizard's template selection (e.g., "e-commerce fulfillment center" template includes baseline productivity rates, absence rates, and fatigue factors derived from published logistics industry benchmarks -- not from other tenants).

2. **Empty model state.** No patterns, no predictions, no competence scores. The system starts at Level 1 (Reactive) for all decision types.

3. **Immediate observation.** From the first interaction, the system begins capturing events and building the tenant's unique context model.

4. **Accelerated learning period.** For the first 30 days, the offline learning pipeline runs twice daily (02:00 and 14:00) instead of once, to build the initial model faster.

---

## 11. Security and Privacy Considerations

### 11.1 Intelligence Data Classification

| Data Category | Classification | Access Control | Retention |
|--------------|---------------|---------------|-----------|
| Raw user events | Internal / Sensitive | Intelligence Plane only (not exposed via API) | 90 days (raw), aggregated metrics permanent |
| Decision events | Internal | Intelligence Plane + Audit | Permanent |
| Model parameters | Internal | Intelligence Plane + Admin API (read-only for tenant admins) | Permanent (versioned) |
| Patterns | Internal | Intelligence Plane + displayed to planners via Interaction Plane | Permanent |
| Insights | User-facing | Delivered to authorized users (site-scoped) | 30 days (active), archived permanently |
| Competence scores | Internal / Admin | Intelligence Plane + Autonomy Dashboard (admin only) | Permanent |
| User models | Internal / Sensitive | Intelligence Plane only (behavioral profiling data) | Updated in-place, no raw history retention |

### 11.2 User Behavioral Data Protections

The Intelligence Plane captures detailed user interaction data (click patterns, time-on-screen, override frequency). This data is sensitive:

- **Purpose limitation:** Behavioral data is used exclusively for improving the planning system's recommendations. It is never used for employee performance evaluation, never shared with the user's manager, and never surfaced in any reporting outside the Intelligence Plane.
- **Aggregation:** User models are stored as aggregated vectors and statistics, not as raw event logs. Raw events are retained for 90 days for debugging and then purged.
- **Transparency:** Users can view their own user model summary via a "My AI Profile" page showing what the system has learned about their preferences (without revealing raw interaction data).
- **Deletion:** When a user account is deleted, their user model, all associated feedback, and all raw events are permanently deleted within 30 days (GDPR right to erasure).

---

## 12. Failure Modes and Degradation

### 12.1 Intelligence Plane Failure

If the Intelligence Plane becomes unavailable (Edge Function errors, Redis outage, model corruption):

| Component Failed | Impact | Degradation Behavior |
|-----------------|--------|---------------------|
| Redis feature store | No real-time predictions, no cached user models | Optimizer uses last-known-good parameters from PostgreSQL. Recommendations degrade to generic (non-personalized). |
| Daily learning pipeline | Parameters not updated, no new patterns detected | System continues on current parameters. An alert is generated if the pipeline fails 2 consecutive days. |
| Insight generator | No new daily insights | Control Room shows "Insights temporarily unavailable. Last generated: {date}." Cached insights remain visible. |
| Claude API (via ai-gateway) | No narrative explanations, no NLQ responses | Structured explanations still work (template-based). NLQ returns "AI assistant temporarily unavailable." Insights fall back to metric-only alerts. |
| pgvector queries | No embedding-based similarity search | Similarity search falls back to `pg_trgm` trigram matching. Less accurate but always available. |

**Key guarantee:** The Deterministic Plane is never dependent on the Intelligence Plane's availability. Plans always generate. The optimizer always runs. Constraint validation always works. The Intelligence Plane makes plans better, but its absence never prevents plans from being generated.

### 12.2 Data Quality Failures

| Failure | Detection | Recovery |
|---------|----------|---------|
| Outcome data missing (no actual vs. planned reconciliation) | Daily pipeline detects missing attendance/throughput data | Skip calibration for affected day. Alert admin: "Outcome data incomplete for {date}. Parameters not updated." |
| Feedback data skewed (single user submitting many negative ratings) | Statistical outlier detection on feedback volume per user | Cap feedback influence per user per day. Flag for review. |
| Model parameter drift (calibrated values diverge significantly from engineered standards) | Guardrails: parameters cannot move more than 30% from baseline without admin review | Alert: "Picking productivity rate has drifted 25% from baseline. Manual review required before further auto-calibration." |
| Embedding model version change | Version tracked in `intelligence.embedding_metadata` | Trigger full re-embedding of affected entities. Stale embeddings marked with version mismatch flag. |
