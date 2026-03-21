# Learning Model: Continuous Intelligence Architecture

This document defines how AstraPlanner learns from the data captured in `data-capture.md`. It specifies four complementary learning mechanisms, the boundary between online and offline learning, how feedback loops close, and how confidence governs what the system shows to users.

**Dependency**: This document builds directly on the event schemas, feature store, and storage tiers defined in `data-capture.md`. All references to features, events, and tables assume those definitions.

---

## 1. Learning Mechanisms

AstraPlanner employs four learning mechanisms, each suited to a different type of intelligence. They are listed in ascending order of complexity and descending order of interpretability.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Learning Stack                                  │
│                                                                         │
│  ┌─────────────────────┐   Most interpretable, fastest to act           │
│  │  1. Rule Learning   │   "Planner A always assigns E-012 to picking   │
│  │     (pattern mining)│    on Mondays"                                 │
│  └────────┬────────────┘                                                │
│           ▼                                                             │
│  ┌─────────────────────┐                                                │
│  │  2. Statistical     │   "Site DFW-04 has 15% higher Monday absence   │
│  │     Patterns        │    rate in January"                            │
│  │     (time-series)   │                                                │
│  └────────┬────────────┘                                                │
│           ▼                                                             │
│  ┌─────────────────────┐                                                │
│  │  3. ML Models       │   "P(absence | employee, date, context) = 0.23"│
│  │     (trained models)│                                                │
│  └────────┬────────────┘                                                │
│           ▼                                                             │
│  ┌─────────────────────┐   Most powerful, least interpretable           │
│  │  4. LLM Reasoning   │   "Coverage gaps correlate with senior leave   │
│  │     (Claude)        │    and low cross-training depth"               │
│  └─────────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────┘
```

### 1.1 Rule Learning — Extracting Explicit Rules from User Behavior

Rule learning discovers deterministic patterns in how planners assign employees, override suggestions, and apply constraints. These rules are the most interpretable form of intelligence -- they can be shown to users as "we noticed you always do X" and confirmed or rejected.

#### What Rules Look Like

| Rule Type | Example | Source Data | Confidence Factors |
|-----------|---------|-------------|-------------------|
| **Employee-Process Affinity** | "Planner Maria always assigns Employee E-012 to Picking on Mondays" | `shift_assignment` history filtered by `assignment_source = 'manual'` | Support: 12/14 Mondays in last quarter. Recency: last occurrence 3 days ago. Consistency: 85.7% |
| **Temporal Constraint** | "Site Rotterdam never schedules overtime on Fridays" | `shift_assignment` history: zero `overtime` assignments on Fridays for 6+ months | Support: 26 consecutive Fridays. Recency: last Friday. Consistency: 100% |
| **Process Sequencing** | "When picking volume exceeds 120% of baseline, this planner always adds a packing shift within 2 hours" | `interaction.planning.assignment_action` correlated with `system.plan.quality` (unmet demand) | Support: 8/9 occurrences. Recency: 2 weeks ago. Consistency: 88.9% |
| **Constraint Override Pattern** | "This planner always overrides the min-rest constraint for agency workers" | `interaction.planning.constraint_override` filtered by `constraint_type` and employee contract type | Support: 5 overrides. Recency: 1 week. Consistency: 100% |
| **Shift Preference** | "Employee E-045 is always manually moved from afternoon to morning shift by planner" | `system.plan.override_pattern` where `field_changed = 'shift'` for same employee | Support: 4 overrides. Recency: last week. Consistency: 100% |

#### Implementation: Association Rule Mining

Rules are discovered by an offline batch process (runs weekly per tenant) that applies association rule mining to the `shift_assignment` and `intelligence.user_events` tables.

```typescript
// Rule mining pipeline — runs as a pg_cron-triggered Edge Function

interface MinedRule {
  rule_id: string;                        // deterministic hash of rule components
  organization_id: string;
  rule_type: 'employee_process_affinity' | 'temporal_constraint' | 'process_sequencing' |
             'constraint_override_pattern' | 'shift_preference';
  antecedent: RuleCondition[];            // IF these conditions are met...
  consequent: RuleAction;                 // THEN this action is expected

  // Confidence scoring
  support: number;                        // how many times this pattern occurred (absolute count)
  support_ratio: number;                  // occurrences / total opportunities (0-1)
  recency_days: number;                   // days since last occurrence
  consistency: number;                    // occurrences / (occurrences + contradictions) (0-1)
  confidence_score: number;               // composite: f(support_ratio, recency, consistency)

  // Metadata
  discovered_at: string;
  last_validated_at: string;
  user_confirmed: boolean | null;         // null = not yet shown to user
  active: boolean;
}

interface RuleCondition {
  field: string;                          // e.g., "day_of_week", "employee_id", "process_id"
  operator: 'eq' | 'in' | 'gt' | 'lt' | 'between';
  value: string | number | string[];
}

interface RuleAction {
  action_type: 'assign' | 'avoid' | 'prefer' | 'constrain';
  target_entity: string;                  // e.g., "employee:E-012", "process:PICK-01"
  target_value: string;                   // e.g., "shift:MORNING", "overtime:false"
}
```

#### Confidence Scoring Formula

```
confidence_score = w1 * support_ratio + w2 * recency_factor + w3 * consistency

where:
  w1 = 0.3   (support weight)
  w2 = 0.3   (recency weight)
  w3 = 0.4   (consistency weight — most important: a rule that's always followed is reliable)

  support_ratio = occurrences / total_opportunities
  recency_factor = exp(-0.03 * days_since_last_occurrence)   // decays to ~0.37 at 30 days
  consistency = occurrences / (occurrences + contradictions)
```

A rule must meet minimum thresholds to be stored:
- `support >= 3` (at least 3 occurrences to avoid noise)
- `support_ratio >= 0.1` (at least 10% of opportunities)
- `consistency >= 0.7` (at least 70% of the time)

#### Storage

```sql
CREATE TABLE intelligence.learned_rules (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    rule_type           VARCHAR(50) NOT NULL,
    antecedent          JSONB NOT NULL,
    consequent          JSONB NOT NULL,
    support             INT NOT NULL,
    support_ratio       DECIMAL(5,4) NOT NULL,
    recency_days        INT NOT NULL,
    consistency         DECIMAL(5,4) NOT NULL,
    confidence_score    DECIMAL(5,4) NOT NULL,
    discovered_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_validated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_occurrence_at  TIMESTAMPTZ NOT NULL,
    user_confirmed      BOOLEAN,
    active              BOOLEAN NOT NULL DEFAULT true,
    site_id             UUID,
    user_id             UUID,                     -- null if rule is site-wide
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ck_lr_support CHECK (support >= 3),
    CONSTRAINT ck_lr_consistency CHECK (consistency >= 0.7)
);

CREATE INDEX idx_learned_rules_org_site_type
    ON intelligence.learned_rules (organization_id, site_id, rule_type)
    WHERE active = true;
CREATE INDEX idx_learned_rules_org_user
    ON intelligence.learned_rules (organization_id, user_id)
    WHERE active = true AND user_id IS NOT NULL;

ALTER TABLE intelligence.learned_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY lr_tenant ON intelligence.learned_rules
    FOR ALL USING (organization_id = auth.organization_id());
```

### 1.2 Statistical Pattern Detection — Finding Regularities in Data

Statistical patterns are computed from time-series data without training ML models. They use well-understood statistical methods (rolling averages, z-scores, change-point detection) and are fully deterministic given the same input data.

#### Pattern Categories

**Absence Patterns**

```typescript
interface AbsencePattern {
  pattern_id: string;
  organization_id: string;
  site_id: string;
  scope: 'site' | 'department' | 'team' | 'shift';
  scope_id: string;                       // department_id, shift_pattern_id, etc.

  pattern_type: 'day_of_week_effect' | 'seasonal_effect' | 'trend' | 'anomaly';
  description: string;                    // human-readable: "Monday absence rate is 15% in Department B, vs 8% site average"

  // Statistical measures
  baseline_rate: number;                  // the comparison baseline (e.g., site average)
  observed_rate: number;                  // the observed rate for this scope
  z_score: number;                        // standard deviations from baseline
  p_value: number;                        // statistical significance
  effect_size: number;                    // practical significance (observed - baseline)

  // Time context
  observation_period_start: string;
  observation_period_end: string;
  sample_size: number;                    // number of employee-days in the sample

  confidence_score: number;               // composite confidence (sample size + significance + stability)
}
```

**Implementation**: Computed using PostgreSQL window functions against the `system.plan.reality_divergence` events:

```sql
-- Example: detect day-of-week absence patterns per department
WITH daily_absence AS (
    SELECT
        e.department_id,
        EXTRACT(DOW FROM se.timestamp) AS dow,
        (se.payload->>'unplanned_absence_rate')::DECIMAL AS absence_rate,
        se.organization_id
    FROM intelligence.system_events se
    JOIN site s ON (se.payload->>'site_id')::UUID = s.id
    JOIN employee e ON e.home_site_id = s.id
    WHERE se.event_type = 'system.plan.reality_divergence'
      AND se.timestamp >= NOW() - INTERVAL '90 days'
      AND se.organization_id = $1
),
dept_dow_avg AS (
    SELECT
        department_id,
        dow,
        AVG(absence_rate) AS avg_rate,
        STDDEV(absence_rate) AS stddev_rate,
        COUNT(*) AS sample_size
    FROM daily_absence
    GROUP BY department_id, dow
),
site_avg AS (
    SELECT AVG(absence_rate) AS site_avg_rate
    FROM daily_absence
)
SELECT
    d.department_id,
    d.dow,
    d.avg_rate,
    s.site_avg_rate,
    (d.avg_rate - s.site_avg_rate) / NULLIF(d.stddev_rate, 0) AS z_score,
    d.sample_size
FROM dept_dow_avg d
CROSS JOIN site_avg s
WHERE d.sample_size >= 10
  AND ABS(d.avg_rate - s.site_avg_rate) > 0.05
ORDER BY ABS(d.avg_rate - s.site_avg_rate) DESC;
```

**Demand Patterns**

Detect systematic forecast biases by comparing planned demand to actual demand.

```typescript
interface DemandPattern {
  pattern_id: string;
  site_id: string;
  demand_type_id: string;
  pattern_type: 'systematic_bias' | 'day_type_effect' | 'post_holiday_spike' | 'seasonal_cycle';
  description: string;                    // "Site 3 consistently exceeds forecast by 12% on the first business day after holidays"

  bias_direction: 'over_forecast' | 'under_forecast' | 'none';
  bias_magnitude_pct: number;
  condition: string | null;               // "first_business_day_after_holiday", "monday", "q4", etc.

  observation_period_months: number;
  sample_size: number;
  confidence_score: number;
}
```

**Productivity Drift**

Detect gradual changes in actual output rates that diverge from configured productivity standards.

```typescript
interface ProductivityDrift {
  site_id: string;
  process_id: string;
  shift_pattern_id: string | null;
  drift_type: 'decline' | 'improvement' | 'volatility_increase';
  description: string;                    // "Pick rate for night shift has declined 8% over last quarter"

  baseline_uph: number;                   // configured productivity standard
  current_avg_uph: number;               // rolling 30-day actual average
  drift_pct: number;                      // (current - baseline) / baseline * 100
  drift_trend_slope: number;              // units per hour per week (regression slope)

  observation_period_weeks: number;
  confidence_score: number;
}
```

**Change-Point Detection**

Identify moments where a time series shifts regime (e.g., absence rate jumps from 5% to 12%).

Implementation uses the CUSUM (Cumulative Sum) algorithm in an Edge Function:

```typescript
// Change-point detection via CUSUM algorithm
function detectChangePoints(
  series: { date: string; value: number }[],
  threshold: number = 4.0,               // CUSUM threshold (in std devs)
  drift: number = 0.5                    // allowable drift before alarm
): ChangePoint[] {
  const mean = series.reduce((s, p) => s + p.value, 0) / series.length;
  const std = Math.sqrt(series.reduce((s, p) => s + (p.value - mean) ** 2, 0) / series.length);

  let cumSum = 0;
  const changePoints: ChangePoint[] = [];

  for (const point of series) {
    const normalized = (point.value - mean) / std;
    cumSum = Math.max(0, cumSum + normalized - drift);

    if (cumSum > threshold) {
      changePoints.push({
        date: point.date,
        cumulative_sum: cumSum,
        value_at_change: point.value,
        baseline_mean: mean,
        shift_magnitude: point.value - mean,
      });
      cumSum = 0; // reset after detection
    }
  }

  return changePoints;
}
```

#### Storage for Statistical Patterns

```sql
CREATE TABLE intelligence.statistical_patterns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    site_id             UUID NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    pattern_category    VARCHAR(50) NOT NULL,      -- 'absence', 'demand', 'productivity', 'change_point'
    pattern_type        VARCHAR(50) NOT NULL,
    description         TEXT NOT NULL,
    parameters          JSONB NOT NULL,            -- all pattern-specific metrics
    confidence_score    DECIMAL(5,4) NOT NULL,
    observation_start   TIMESTAMPTZ NOT NULL,
    observation_end     TIMESTAMPTZ NOT NULL,
    sample_size         INT NOT NULL,
    active              BOOLEAN NOT NULL DEFAULT true,
    superseded_by       UUID REFERENCES intelligence.statistical_patterns(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stat_patterns_org_site_cat
    ON intelligence.statistical_patterns (organization_id, site_id, pattern_category)
    WHERE active = true;

ALTER TABLE intelligence.statistical_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY sp_tenant ON intelligence.statistical_patterns
    FOR ALL USING (organization_id = auth.organization_id());
```

### 1.3 ML Models — Trained Predictive Models

ML models learn non-linear relationships that rule mining and simple statistics cannot capture. AstraPlanner uses lightweight models that can be trained in Edge Functions and whose predictions can be served within the existing Supabase infrastructure.

#### Model 1: Absence Probability Model

Predicts the probability that a specific employee will be absent on a given date.

```typescript
interface AbsenceModelInput {
  // Employee features
  employee_tenure_days: number;
  contract_type: 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor';
  department_id: string;
  home_site_id: string;
  recent_absence_count_30d: number;
  recent_absence_count_90d: number;
  days_since_last_absence: number;

  // Temporal features
  day_of_week: number;                    // 0-6
  month: number;                          // 1-12
  is_holiday_adjacent: boolean;           // day before or after a public holiday
  is_pay_period_boundary: boolean;
  days_until_next_holiday: number;

  // Contextual features
  department_absence_rate_30d: number;
  site_absence_rate_30d: number;
  assigned_shift_type: 'morning' | 'afternoon' | 'night' | 'flex';
  consecutive_work_days: number;          // how many days in a row this employee has worked
  scheduled_hours_this_week: number;
}

interface AbsenceModelOutput {
  probability: number;                    // P(absent) in [0, 1]
  risk_tier: 'low' | 'medium' | 'high';  // low: <0.1, medium: 0.1-0.25, high: >0.25
  top_risk_factors: {
    feature: string;
    contribution: number;                 // SHAP-like feature importance
  }[];
}
```

**Model type**: Gradient-boosted decision tree (XGBoost). Chosen for its performance on tabular data with mixed feature types, interpretable feature importance, and small model size (~50KB serialized).

**Training**: Weekly per-tenant batch retraining on accumulated `system.plan.reality_divergence` data. Minimum 90 days of data required to train; tenants with less data use the industry-average model.

**Inference**: Model weights are loaded into an Edge Function. Inference takes <5ms per employee. For a site with 200 employees, batch prediction completes in <1 second.

#### Model 2: Demand Adjustment Model

Learns systematic biases in demand forecasts and produces adjusted forecasts.

```typescript
interface DemandAdjustmentInput {
  // Raw forecast
  forecast_volume: number;
  forecast_confidence: number;
  demand_type_id: string;

  // Historical accuracy
  site_mape_30d: number;
  site_bias_30d: number;
  demand_type_mape_30d: number;

  // Temporal context
  day_of_week: number;
  month: number;
  is_holiday: boolean;
  is_post_holiday: boolean;
  days_since_month_start: number;
  seasonal_index: number;

  // Trend features
  volume_trend_7d: number;               // slope of actual volumes over last 7 days
  volume_trend_30d: number;
}

interface DemandAdjustmentOutput {
  adjusted_volume: number;
  adjustment_factor: number;              // multiplier applied (e.g., 1.12 for +12% correction)
  confidence_interval: {
    lower: number;
    upper: number;
    level: number;                        // 0.9 for 90% CI
  };
  adjustment_reason: string;             // "Historical Monday under-forecast bias of 12%"
}
```

**Model type**: Linear regression with seasonal decomposition for simple patterns; gradient-boosted trees for complex multi-factor adjustments. The simpler model is preferred when it achieves comparable accuracy (within 2% MAPE).

#### Model 3: Assignment Quality Model

Predicts how well a specific employee-process-shift combination will work, based on historical assignment outcomes.

```typescript
interface AssignmentQualityInput {
  // Assignment triple
  employee_proficiency_level: number;     // 1-5
  process_id: string;
  shift_type: 'morning' | 'afternoon' | 'night';

  // Employee context
  employee_assignments_to_process_30d: number;
  employee_assignments_to_shift_30d: number;
  employee_override_rate_for_process: number;  // how often this assignment gets overridden
  employee_preference_match: boolean;     // does this match their stated preference?

  // Site context
  process_coverage_current_pct: number;   // how covered is this process already?
  team_familiarity_score: number;         // how many people in this shift does the employee usually work with?
  cross_site: boolean;                    // is this a non-home-site assignment?
}

interface AssignmentQualityOutput {
  quality_score: number;                  // 0-1, higher is better
  keep_probability: number;               // P(this assignment survives to publication without override)
  risk_factors: string[];                 // e.g., ["low_proficiency", "night_shift_not_preferred"]
}
```

**Model type**: Logistic regression. The binary outcome is "was this assignment overridden before plan publication?" Historical `shift_assignment` records with `assignment_source = 'optimizer'` provide the training data, and the label is derived from `system.plan.override_pattern` events.

#### Model Storage and Versioning

```sql
CREATE TABLE intelligence.models (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    model_type          VARCHAR(50) NOT NULL,      -- 'absence_probability', 'demand_adjustment', 'assignment_quality'
    model_version       INT NOT NULL,
    site_id             UUID,                       -- null for org-wide models
    status              VARCHAR(20) NOT NULL DEFAULT 'training',  -- 'training', 'validating', 'active', 'retired'

    -- Model artifact
    weights_json        JSONB NOT NULL,             -- serialized model weights (for lightweight models)
    feature_names       TEXT[] NOT NULL,             -- ordered list of input feature names
    feature_importances JSONB,                      -- per-feature importance scores

    -- Training metadata
    training_data_start TIMESTAMPTZ NOT NULL,
    training_data_end   TIMESTAMPTZ NOT NULL,
    training_samples    INT NOT NULL,
    training_duration_ms INT NOT NULL,

    -- Validation metrics
    validation_metrics  JSONB NOT NULL,             -- model-type-specific: AUC, MAPE, F1, etc.
    validation_samples  INT NOT NULL,

    -- Lifecycle
    promoted_at         TIMESTAMPTZ,                -- when this version became 'active'
    retired_at          TIMESTAMPTZ,
    retired_reason      TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_model_org_type_version UNIQUE (organization_id, model_type, model_version, site_id)
);

CREATE INDEX idx_models_active
    ON intelligence.models (organization_id, model_type, site_id)
    WHERE status = 'active';

ALTER TABLE intelligence.models ENABLE ROW LEVEL SECURITY;
CREATE POLICY m_tenant ON intelligence.models
    FOR ALL USING (organization_id = auth.organization_id());
```

#### Training Pipeline

```
Weekly Training Pipeline (pg_cron triggers Edge Function)
│
├── 1. Extract training data
│     ├── Query intelligence.system_events for ground truth
│     ├── Query intelligence.site_features for pre-computed features
│     └── Query intelligence.user_features for user-level features
│
├── 2. Feature engineering
│     ├── Compute derived features (interactions, ratios)
│     ├── Handle missing values (median imputation for numeric, mode for categorical)
│     └── Split: 80% train, 20% validation (time-ordered, no future leakage)
│
├── 3. Train model
│     ├── For each model type:
│     │    ├── Fit model on training set
│     │    ├── Evaluate on validation set
│     │    └── Compute feature importances
│     └── Compare to currently active model
│
├── 4. Model selection
│     ├── If new model improves validation metric by > 1%:
│     │    ├── Promote new model to 'active'
│     │    ├── Retire previous model
│     │    └── Log model transition in audit
│     └── If not improved:
│          └── Discard new model, keep current active model
│
└── 5. Deployment
      ├── Serialize model weights to intelligence.models table
      ├── Invalidate Redis cached predictions
      └── Log model version change as system event
```

**Per-tenant vs shared models**: Each tenant gets its own model trained on its data. Tenants with insufficient data (<90 days or <1000 training samples) use an industry-average model trained on anonymized, aggregated data from all tenants (opt-in, covered by data processing agreement). Once a tenant accumulates enough data, their personalized model replaces the industry model.

### 1.4 LLM Reasoning — Claude for Complex, Contextual Analysis

Claude handles analysis that requires combining multiple signals, reasoning about causality, and producing natural language explanations. This is the most expensive and slowest learning mechanism, reserved for high-value insights.

#### Use Cases for LLM Reasoning

**Cross-cutting insight generation**:

```typescript
interface LLMInsightRequest {
  context: {
    site_id: string;
    period: { start: string; end: string };

    // Pre-computed metrics (not raw data)
    coverage_gaps: { process: string; date: string; gap_pct: number }[];
    absence_anomalies: AbsencePattern[];
    demand_accuracy: DemandPattern[];
    productivity_drifts: ProductivityDrift[];
    override_patterns: { rule_type: string; frequency: number; recent_example: string }[];
    skill_gaps: { process: string; required_fte: number; qualified_fte: number }[];

    // Recent changes
    recent_employee_changes: { type: 'hired' | 'terminated' | 'transferred' | 'leave'; count: number }[];
    recent_demand_changes: { demand_type: string; change_pct: number }[];
  };
}

// Example Claude output:
// "Coverage gaps have increased 20% this month at Site DFW-04, concentrated
//  in picking (Tuesday PM and Thursday AM). This correlates with three
//  factors: (1) Three senior employees (avg tenure 4.2 years, proficiency
//  level 5) went on parental leave simultaneously, (2) their replacements
//  have an average proficiency of 2.8, reducing effective UPH by ~15%,
//  and (3) demand for e-commerce picking has trended up 8% month-over-month.
//
//  Recommended actions:
//  - Immediate: Authorize 12 hours/week of overtime for proficiency-4+
//    pickers to cover the gap until replacements reach proficiency 4
//    (estimated 6-8 weeks based on training velocity data).
//  - Short-term: Accelerate cross-training for E-156 and E-203, who have
//    adjacent skills and the fastest learning rates in recent training
//    cohorts (E-156: 1.8x average skill acquisition speed, E-203: 1.5x).
//  - Medium-term: If demand trend continues, initiate hiring for 2
//    additional pickers within 4 weeks to avoid structural understaffing."
```

**Anomaly interpretation**: When a statistical pattern deviates from expectations, Claude analyzes possible causes by correlating multiple signals.

```typescript
// Input to Claude when a change-point is detected
interface AnomalyInterpretationRequest {
  anomaly: {
    type: 'absence_spike' | 'demand_drop' | 'productivity_decline' | 'override_surge';
    metric: string;
    baseline_value: number;
    anomalous_value: number;
    detection_date: string;
  };
  concurrent_events: {
    event_type: string;
    description: string;
    timestamp: string;
  }[];                                    // other notable events around the same time
  historical_similar_anomalies: {
    date: string;
    resolution: string;
    root_cause: string;
  }[];                                    // past anomalies of the same type
}
```

**Natural language explanations of model predictions**: When the absence model flags an employee as high-risk, Claude translates the feature importances into a human-readable explanation.

```typescript
// Model outputs: P(absent) = 0.34, top features: consecutive_work_days=6, month=1, day=monday
// Claude translates to:
// "Employee E-045 has a 34% predicted absence probability for Monday January 19th.
//  The main risk factors are: (1) they will have worked 6 consecutive days by Monday,
//  which historically increases their absence rate by 18 percentage points, (2) January
//  Mondays have a site-wide absence rate 15% above average, and (3) this employee's
//  recent 30-day absence count (3 days) is above their historical average (1.5 days/month)."
```

#### Implementation

LLM reasoning is invoked on two schedules:

| Schedule | Trigger | Scope | Claude Model | Estimated Cost |
|----------|---------|-------|-------------|---------------|
| Daily (05:00 local) | pg_cron | Per site: top 5-8 cross-cutting insights | Claude Haiku | ~$0.02/site |
| Weekly (Sunday 20:00) | pg_cron | Per site: comprehensive trend analysis + recommendations | Claude Sonnet | ~$0.15/site |
| On-demand | User clicks "AI Analysis" | Specific plan, scenario, or anomaly | Claude Sonnet | ~$0.10/request |

All LLM outputs are stored in `intelligence.llm_insights`:

```sql
CREATE TABLE intelligence.llm_insights (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    site_id             UUID REFERENCES site(id) ON DELETE CASCADE,
    insight_type        VARCHAR(50) NOT NULL,
    schedule            VARCHAR(20) NOT NULL,      -- 'daily', 'weekly', 'on_demand'
    input_hash          VARCHAR(64) NOT NULL,      -- SHA-256 of input context (deduplication)
    input_context       JSONB NOT NULL,            -- the structured context sent to Claude
    output_text         TEXT NOT NULL,              -- Claude's response
    output_structured   JSONB,                     -- parsed structured components (if applicable)
    model_used          VARCHAR(50) NOT NULL,       -- 'claude-haiku-3', 'claude-sonnet-4', etc.
    input_tokens        INT NOT NULL,
    output_tokens       INT NOT NULL,
    cost_usd            DECIMAL(8,4) NOT NULL,
    confidence_score    DECIMAL(5,4),
    status              VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'superseded', 'dismissed'
    dismissed_by        UUID,
    dismissed_reason    TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_insight_dedup UNIQUE (organization_id, site_id, insight_type, input_hash)
);

CREATE INDEX idx_llm_insights_org_site_active
    ON intelligence.llm_insights (organization_id, site_id, created_at DESC)
    WHERE status = 'active';

ALTER TABLE intelligence.llm_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY li_tenant ON intelligence.llm_insights
    FOR ALL USING (organization_id = auth.organization_id());
```

---

## 2. Online vs Offline Learning

### 2.1 Online Learning (Real-Time, Every Event)

Online learning updates are triggered synchronously by Kafka consumers processing intelligence events. They must complete within 50ms to avoid backpressure on the event pipeline.

#### What Updates in Real Time

| Update | Trigger Event | Storage | Operation |
|--------|--------------|---------|-----------|
| Running override rate | `decision.recommendation.response` | Redis counter | `INCR feat:user:{org}:{user}:overrides_7d` with 7-day TTL |
| AI trust score (EMA) | `decision.recommendation.response` | Redis float | `new_score = 0.9 * old_score + 0.1 * (accepted ? 1.0 : 0.0)` |
| Recommendation ranking | `decision.recommendation.response` | Redis sorted set | `ZINCRBY rec_scores:{org}:{rec_type} (accepted ? +1 : -1) {rec_id}` |
| User preference update | `interaction.planning.assignment_action` where `assignment_source = 'manual'` | Redis hash | Increment affinity counter for employee-process-shift triple |
| Time since last replan | `system.plan.quality` | Redis key | `SET feat:site:{org}:{site}:last_replan_at {timestamp}` |
| Active session metrics | `interaction.timing.session_pattern` | Redis hash | Update session duration, action count, idle periods |

#### Implementation: Redis Update Handlers

```typescript
// Kafka consumer for decision events → Redis updates
async function handleDecisionEvent(event: IntelligenceEventEnvelope): Promise<void> {
  if (event.event_type === 'decision.recommendation.response') {
    const { recommendation_type, response } = event.payload as DecisionRecommendationResponse['payload'];
    const orgId = event.organization_id;
    const userId = event.user_id!;
    const accepted = response === 'accepted';
    const pipe = redis.pipeline();

    // 1. Update override rate counter (7-day sliding window)
    const overrideKey = `feat:user:${orgId}:${userId}:overrides_7d`;
    const totalKey = `feat:user:${orgId}:${userId}:rec_total_7d`;
    if (!accepted) pipe.incr(overrideKey);
    pipe.incr(totalKey);
    pipe.expire(overrideKey, 7 * 86400);
    pipe.expire(totalKey, 7 * 86400);

    // 2. Update AI trust score (exponential moving average)
    const trustKey = `feat:user:${orgId}:${userId}:ai_trust_score`;
    const currentTrust = await redis.get(trustKey);
    const prevScore = currentTrust ? parseFloat(currentTrust) : 0.5; // default: neutral
    const newScore = 0.9 * prevScore + 0.1 * (accepted ? 1.0 : 0.0);
    pipe.set(trustKey, newScore.toFixed(4), { ex: 7 * 86400 });

    // 3. Update recommendation ranking
    const recScoreKey = `rec_scores:${orgId}:${recommendation_type}`;
    pipe.zincrby(recScoreKey, accepted ? 1 : -1, event.payload.recommendation_id);

    await pipe.exec();
  }
}
```

### 2.2 Offline Learning (Batch, Daily/Weekly)

Offline learning runs as scheduled Edge Functions triggered by `pg_cron`. These operations are compute-intensive and operate on accumulated data.

| Job | Schedule | Runtime Target | Output |
|-----|----------|---------------|--------|
| Feature computation (user-level) | Daily 02:00 UTC | < 5 min per tenant | `intelligence.user_features` rows |
| Feature computation (site-level) | Daily 02:30 UTC | < 5 min per tenant | `intelligence.site_features` rows |
| Statistical pattern detection | Daily 03:00 UTC | < 10 min per tenant | `intelligence.statistical_patterns` rows |
| Rule mining | Weekly Sunday 03:00 UTC | < 15 min per tenant | `intelligence.learned_rules` rows |
| ML model retraining | Weekly Sunday 04:00 UTC | < 30 min per tenant (all 3 models) | `intelligence.models` rows |
| LLM insight generation (daily) | Daily 05:00 site-local | < 2 min per site | `intelligence.llm_insights` rows |
| LLM trend analysis (weekly) | Weekly Sunday 20:00 site-local | < 5 min per site | `intelligence.llm_insights` rows |
| Cross-site benchmarks | Weekly Monday 01:00 UTC | < 10 min per tenant | `intelligence.site_features` (benchmark features) |
| Seasonal index computation | Monthly 1st 04:00 UTC | < 5 min per tenant | `intelligence.temporal_features` rows |
| Event archival to S3 | Daily 06:00 UTC | < 30 min total | `intelligence.archive_manifest` rows + S3 objects |
| Outcome event generation | Daily 07:00 UTC | < 10 min per tenant | `intelligence.outcome_events` rows |

#### Cross-Site Benchmarking

For tenants with multiple sites, the benchmark job computes comparative features:

```typescript
interface CrossSiteBenchmark {
  organization_id: string;
  benchmark_date: string;
  metrics: {
    site_id: string;
    site_name: string;
    coverage_pct: number;
    absence_rate: number;
    overtime_pct: number;
    cost_per_fte_hour: number;
    forecast_accuracy_mape: number;
    planner_override_rate: number;
    solver_runtime_avg_ms: number;
  }[];
  rankings: {
    metric: string;
    best_site_id: string;
    worst_site_id: string;
    median: number;
    std_dev: number;
  }[];
}
```

This enables insights like: "Site Rotterdam's absence rate (12%) is 2.3 standard deviations above the org average (7%). Site Eindhoven is the best performer at 4.5%."

---

## 3. Feedback Incorporation

The feedback loop is the mechanism by which AstraPlanner's predictions and recommendations improve over time. Three types of feedback are incorporated, each with different latency.

### 3.1 Immediate Feedback (< 1 second)

Triggered when a user responds to a recommendation.

```
Recommendation shown to user
    │
    ├── User accepts → immediate positive signal
    │   └── Redis: increment recommendation score
    │   └── Redis: update user AI trust score (+)
    │   └── PostgreSQL: log decision event with response='accepted'
    │
    ├── User rejects → immediate negative signal
    │   └── Redis: decrement recommendation score
    │   └── Redis: update user AI trust score (-)
    │   └── PostgreSQL: log decision event with response='rejected'
    │   └── IF reason provided: log override pattern for rule mining
    │
    └── User modifies → mixed signal (partially useful)
        └── Redis: slight positive (0.3 instead of 1.0) to recommendation score
        └── PostgreSQL: log modification details for fine-grained learning
```

**Score update formula** with temporal decay:

```typescript
function updateRecommendationScore(
  currentScore: number,
  feedback: 'accepted' | 'rejected' | 'modified',
  daysSinceLastUpdate: number
): number {
  // Apply temporal decay to existing score
  const decayFactor = Math.exp(-0.01 * daysSinceLastUpdate); // ~37% decay at 100 days
  const decayedScore = currentScore * decayFactor;

  // Apply feedback signal
  const feedbackSignals = {
    accepted: +1.0,
    modified: +0.3,
    rejected: -1.0,
  };

  const learningRate = 0.15; // how much each feedback event shifts the score
  return decayedScore + learningRate * feedbackSignals[feedback];
}
```

### 3.2 Delayed Feedback (1-7 days)

Delayed feedback connects planning decisions to operational outcomes. It requires comparing the published plan against actual results.

```
Plan published (Day 0)
    │
    ├── Day 1-5: Plan executes in the warehouse
    │   └── Time & Attendance data flows in (actual hours, no-shows)
    │   └── WMS data flows in (actual demand volumes, actual throughput)
    │
    └── Day 7: Outcome evaluation job runs
        │
        ├── Compare: planned coverage vs actual coverage
        │   └── Was the plan adequate? Over-staffed? Under-staffed?
        │
        ├── Compare: planned demand vs actual demand
        │   └── Was the forecast accurate? Which direction was the error?
        │
        ├── Compare: planned headcount vs actual headcount
        │   └── How many unplanned absences occurred?
        │
        └── Generate outcome events:
            ├── outcome.plan.coverage_achieved
            │   { plan_id, planned_coverage_pct, actual_coverage_pct, delta }
            ├── outcome.plan.cost_accuracy
            │   { plan_id, planned_cost, actual_cost, variance_pct }
            └── outcome.plan.absence_accuracy
                { plan_id, predicted_absences, actual_absences, mape }
```

**Outcome events are the ground truth** for model validation. They flow back into the training pipeline:
- Absence model: actual absences vs predicted absences → retraining label
- Demand model: actual demand vs adjusted forecast → retraining label
- Assignment quality model: was the assignment kept through execution? → retraining label

### 3.3 Counterfactual Learning

When a user overrides an AI suggestion, AstraPlanner tracks the outcome of both paths to determine whether the user's override was justified.

```typescript
interface CounterfactualComparison {
  event_type: 'outcome.counterfactual.comparison';
  payload: {
    override_event_id: string;            // the original override event
    plan_id: string;
    assignment_id: string;

    // AI's original suggestion
    ai_suggestion: {
      employee_id: string;
      process_id: string;
      shift_pattern_id: string;
      predicted_quality_score: number;
    };

    // User's override
    user_override: {
      employee_id: string;
      process_id: string;
      shift_pattern_id: string;
    };

    // Outcomes (filled in after execution)
    ai_hypothetical_outcome: {
      employee_would_have_been_available: boolean;  // did the AI-suggested employee actually show up?
      process_was_understaffed: boolean;
    } | null;

    user_actual_outcome: {
      employee_was_available: boolean;
      process_coverage_achieved: boolean;
      override_justified: boolean;         // computed: was the user's choice demonstrably better?
    } | null;

    // Verdict
    verdict: 'user_was_right' | 'ai_was_right' | 'inconclusive' | 'pending';
    verdict_confidence: number;
  };
}
```

**How counterfactual outcomes are evaluated**:

1. If the user overrode employee assignment (changed who was assigned):
   - Check if the AI-suggested employee was actually available (not absent) on the day → if absent, user was right
   - Check if the user's chosen employee showed up and the process was adequately covered → if yes, user was right
   - If both employees were available and coverage was similar, verdict is inconclusive

2. Verdicts feed back into model retraining:
   - `user_was_right`: the override pattern is reinforced in rule learning, and the model features that led to the AI suggestion are penalized
   - `ai_was_right`: the override pattern is weakened (confidence decay), and the user's AI trust score is slightly reduced
   - `inconclusive`: no weight change

### 3.4 Feedback Attribution

When a recommendation is accepted, the system traces which signals contributed to it and strengthens those signals.

```typescript
interface FeedbackAttribution {
  recommendation_id: string;
  recommendation_accepted: boolean;
  contributing_signals: {
    signal_type: 'learned_rule' | 'statistical_pattern' | 'ml_model' | 'llm_insight';
    signal_id: string;                    // rule_id, pattern_id, model_id, insight_id
    contribution_weight: number;          // how much this signal influenced the recommendation (0-1)
  }[];
}

// On acceptance: for each contributing signal, increase its confidence_score
// On rejection: for each contributing signal, decrease its confidence_score
// Weight of adjustment is proportional to contribution_weight

function adjustSignalConfidence(
  currentConfidence: number,
  accepted: boolean,
  contributionWeight: number
): number {
  const adjustmentRate = 0.05 * contributionWeight; // larger contribution → larger adjustment
  if (accepted) {
    return Math.min(1.0, currentConfidence + adjustmentRate);
  } else {
    return Math.max(0.0, currentConfidence - adjustmentRate * 1.5); // penalize failures more
  }
}
```

---

## 4. Confidence Building

Confidence is the gating mechanism that determines what the AI layer shows to users. Without confidence management, a new system would either overwhelm users with unreliable suggestions (eroding trust) or stay silent until it has excessive data (providing no value during critical early adoption).

### 4.1 Confidence Score Per Model and Rule

Every intelligence output carries a `confidence_score` in [0, 1]:

| Intelligence Source | Confidence Computation | Starting Value |
|--------------------|----------------------|---------------|
| Learned rules | `f(support_ratio, recency, consistency)` (see Section 1.1) | Starts at computed value from mining; minimum 0.3 to be stored |
| Statistical patterns | `f(sample_size, p_value, effect_size, stability)` | Depends on statistical significance; typically 0.4-0.8 |
| ML models | `f(validation_metric, training_size, days_since_retrain, prediction_calibration)` | 0.3 for new per-tenant model, 0.2 for industry-average model |
| LLM insights | Set by Claude's self-assessment, capped at 0.9 (LLM cannot have certainty above this) | 0.5 for first insight of a type at a site |

### 4.2 Confidence Thresholds for Action Levels

The confidence score determines the prominence and autonomy level of each intelligence output:

```
Confidence Score    Action Level              UI Treatment                    Automation
─────────────────────────────────────────────────────────────────────────────────────────────
< 0.30              SILENT LEARNING           Not shown to user.              None.
                                              Used internally only.
                                              Logged for model improvement.

0.30 – 0.59         INSIGHT                   Shown in "Insights" panel       None.
                                              with low visual prominence.
                                              Gray badge. Collapsible.
                                              "The system has noticed..."

0.60 – 0.79         RECOMMENDATION            Shown as recommendation         None, but
                                              card with medium prominence.    pre-fills forms
                                              Blue badge. Action buttons.     if user initiates
                                              "Recommended: ..."              the action.

0.80 – 0.94         STRONG RECOMMENDATION     Shown prominently with          Eligible for
                                              high visual weight. Orange      assisted
                                              badge. Impact preview shown.    automation:
                                              "Strongly recommended: ..."     "Apply with
                                                                              one click"

>= 0.95             AUTOMATION-ELIGIBLE       Shown with confirmation         Can be auto-
                                              that this will be applied       applied if tenant
                                              automatically unless            has enabled
                                              user intervenes. Green          auto-apply for
                                              badge with countdown.           this rule type.
                                              "Will be applied in 2 hours     Requires explicit
                                              unless you cancel."             tenant opt-in.
```

**Implementation**:

```typescript
interface ConfidenceGatedOutput {
  source_type: 'rule' | 'pattern' | 'model' | 'llm';
  source_id: string;
  confidence_score: number;
  action_level: 'silent' | 'insight' | 'recommendation' | 'strong_recommendation' | 'automation_eligible';
  content: {
    title: string;
    body: string;
    suggested_action: string | null;
    impact_preview: Record<string, number> | null;
  };
  display_config: {
    prominence: 'low' | 'medium' | 'high' | 'critical';
    badge_color: 'gray' | 'blue' | 'orange' | 'green';
    show_confidence: boolean;             // show the confidence percentage to the user
    show_evidence: boolean;               // show the supporting data points
    auto_apply_eligible: boolean;
    auto_apply_delay_hours: number | null;
  };
}

function computeActionLevel(confidence: number): ConfidenceGatedOutput['action_level'] {
  if (confidence >= 0.95) return 'automation_eligible';
  if (confidence >= 0.80) return 'strong_recommendation';
  if (confidence >= 0.60) return 'recommendation';
  if (confidence >= 0.30) return 'insight';
  return 'silent';
}

function computeDisplayConfig(actionLevel: string): ConfidenceGatedOutput['display_config'] {
  const configs: Record<string, ConfidenceGatedOutput['display_config']> = {
    silent: { prominence: 'low', badge_color: 'gray', show_confidence: false, show_evidence: false, auto_apply_eligible: false, auto_apply_delay_hours: null },
    insight: { prominence: 'low', badge_color: 'gray', show_confidence: true, show_evidence: false, auto_apply_eligible: false, auto_apply_delay_hours: null },
    recommendation: { prominence: 'medium', badge_color: 'blue', show_confidence: true, show_evidence: true, auto_apply_eligible: false, auto_apply_delay_hours: null },
    strong_recommendation: { prominence: 'high', badge_color: 'orange', show_confidence: true, show_evidence: true, auto_apply_eligible: true, auto_apply_delay_hours: null },
    automation_eligible: { prominence: 'critical', badge_color: 'green', show_confidence: true, show_evidence: true, auto_apply_eligible: true, auto_apply_delay_hours: 2 },
  };
  return configs[actionLevel];
}
```

### 4.3 Cold Start Strategy

New tenants have no historical data. The cold start strategy ensures they still receive value from the AI layer from day one, while the system transparently builds confidence.

```
Tenant Onboarding Timeline
─────────────────────────────────────────────────────────────────────────────

Day 0: Tenant signs up
  └── Load industry-average models (pre-trained on anonymized cross-tenant data)
  └── Load template rules for the tenant's logistics archetype (from wizard template)
  └── Set all confidence scores to industry baseline:
        - absence_model: 0.20 (silent learning)
        - demand_model: 0.20 (silent learning)
        - assignment_quality_model: 0.20 (silent learning)
        - rules: none yet (no history)
        - statistical patterns: none yet (no data)

Day 1-7: First week of operation
  └── System begins capturing user behavior events
  └── System begins capturing system events (plan quality, demand data)
  └── No AI recommendations shown yet (all below 0.30 threshold)
  └── User sees: "AstraPlanner is learning your operation. AI recommendations
       will appear as we understand your planning patterns."

Day 7-30: First month
  └── First statistical patterns emerge (if sufficient data volume):
        - Day-of-week demand patterns (requires 2+ weeks of daily data)
        - Basic absence rate by site (requires actual T&A data)
  └── Demand model calibration begins (comparing forecast to actuals)
  └── Confidence for simple patterns may reach 0.30-0.40 (insight level)
  └── User sees: first low-prominence insights in the Insights panel

Day 30-90: First quarter
  └── Rule mining first run (requires 30+ days of assignment history)
  └── Per-tenant ML model training begins (minimum 90 days data for absence model)
  └── Confidence for established patterns reaches 0.40-0.60 (recommendation level)
  └── User sees: first recommendations with medium prominence

Day 90+: Steady state
  └── All models retrain weekly on tenant-specific data
  └── Rule confidence builds through validation
  └── High-frequency patterns reach 0.80+ (strong recommendation level)
  └── Rare patterns build confidence slowly over months
  └── User sees: full AI recommendation suite at varying confidence levels
```

**Industry-average model details**:

The industry-average models are pre-trained on anonymized, aggregated data and provide reasonable baselines:

| Model | Industry Baseline Performance | Typical Per-Tenant Improvement |
|-------|------------------------------|-------------------------------|
| Absence probability | ~65% AUC (barely useful) | ~78% AUC after 90 days, ~85% after 6 months |
| Demand adjustment | ~18% MAPE (modest improvement over raw forecast) | ~12% MAPE after 90 days, ~8% after 6 months |
| Assignment quality | ~58% accuracy (near random) | ~72% after 90 days, ~80% after 6 months |

These numbers illustrate why confidence starts low for industry models and builds as per-tenant data accumulates.

### 4.4 Confidence Decay

Models and rules that are not validated lose confidence over time. This prevents stale intelligence from persisting when conditions change.

```typescript
function applyConfidenceDecay(
  currentConfidence: number,
  daysSinceLastValidation: number,
  decayType: 'rule' | 'pattern' | 'model'
): number {
  // Different decay rates per intelligence type
  const decayRates: Record<string, number> = {
    rule: 0.005,     // rules decay slowly: 50% confidence after ~140 days without validation
    pattern: 0.008,  // patterns decay moderately: 50% after ~87 days
    model: 0.01,     // models decay faster: 50% after ~70 days (force retraining)
  };

  const rate = decayRates[decayType];
  const decayFactor = Math.exp(-rate * daysSinceLastValidation);
  return currentConfidence * decayFactor;
}
```

**Decay schedule**:

| Intelligence Type | Validation Window | Decay to 50% | Decay to "Silent" (0.30) |
|-------------------|------------------|--------------|--------------------------|
| Learned rules | 30 days | ~140 days | ~240 days |
| Statistical patterns | 30 days | ~87 days | ~150 days |
| ML models | 7 days (retraining cycle) | ~70 days | ~120 days |
| LLM insights | 7 days (regeneration cycle) | N/A (regenerated, not decayed) | N/A |

**Decay triggers**:

- A rule's confidence decays when it is not observed in new data (no matching assignment pattern within the validation window)
- A pattern's confidence decays when the underlying statistical test's p-value increases beyond the significance threshold on fresh data
- A model's confidence decays when validation metrics on new data drop below the performance threshold (e.g., AUC drops below 0.65)

**Revalidation**: The weekly batch pipeline recomputes confidence for all active rules and patterns against the latest data. Models are revalidated on their weekly retraining cycle. Any intelligence output whose confidence decays below 0.30 is marked `active = false` and no longer contributes to recommendations.

### 4.5 Confidence Reporting

Tenant admins and planners can view the AI confidence dashboard:

```
AI Confidence Overview — Site: Eindhoven FC
────────────────────────────────────────────────────────

Learning Status: Mature (187 days of data)

Active Intelligence:
  Rules:              23 active  (8 strong, 11 medium, 4 low confidence)
  Statistical Patterns: 14 active  (5 strong, 7 medium, 2 low confidence)
  ML Models:          3 active   (absence: 0.81, demand: 0.73, assignment: 0.68)
  LLM Insights:       12 active  (last generated: 2 hours ago)

Recommendation Accuracy (last 30 days):
  Accepted:          67%
  Rejected:          18%
  Modified:          15%

Override Analysis:
  AI was right (counterfactual): 42%
  User was right:                38%
  Inconclusive:                  20%

Model Performance Trends:
  Absence model AUC:    0.83 (▲ +0.02 vs last month)
  Demand MAPE:          9.2% (▼ -1.1% vs last month)
  Assignment accuracy:  76%  (▲ +3% vs last month)
```

---

## 5. Intelligence Schema Summary

All intelligence tables live in the `intelligence` schema, with RLS enforced via `organization_id`.

```sql
-- Complete table inventory for the intelligence schema

-- Data capture (raw events)
intelligence.user_events              -- user behavior events (interaction.*, decision.*)
intelligence.system_events            -- system-generated events (system.*)
intelligence.outcome_events           -- delayed feedback events (outcome.*)
intelligence.archive_manifest         -- tracks cold-archived event batches

-- Feature store
intelligence.user_features            -- per-user computed features
intelligence.site_features            -- per-site computed features
intelligence.temporal_features        -- time-dependent features

-- Learning outputs
intelligence.learned_rules            -- mined behavioral rules
intelligence.statistical_patterns     -- detected statistical patterns
intelligence.models                   -- trained ML model artifacts
intelligence.llm_insights             -- Claude-generated insights

-- Feedback tracking
intelligence.recommendation_log       -- all recommendations shown to users
intelligence.feedback_attributions    -- which signals contributed to which recommendations
intelligence.counterfactual_outcomes  -- override verdicts (user_was_right / ai_was_right)
```

Supporting tables for feedback tracking:

```sql
CREATE TABLE intelligence.recommendation_log (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL,
    recommendation_type VARCHAR(50) NOT NULL,
    confidence_score    DECIMAL(5,4) NOT NULL,
    action_level        VARCHAR(30) NOT NULL,
    content             JSONB NOT NULL,
    contributing_signals JSONB NOT NULL,            -- array of {signal_type, signal_id, weight}
    response            VARCHAR(20),                -- null until user responds
    response_at         TIMESTAMPTZ,
    plan_id             UUID,
    site_id             UUID,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_rec_log_org_user_time
    ON intelligence.recommendation_log (organization_id, user_id, created_at DESC);
CREATE INDEX idx_rec_log_org_type_response
    ON intelligence.recommendation_log (organization_id, recommendation_type, response);

ALTER TABLE intelligence.recommendation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY rl_tenant ON intelligence.recommendation_log
    FOR ALL USING (organization_id = auth.organization_id());

CREATE TABLE intelligence.counterfactual_outcomes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    override_event_id   UUID NOT NULL,
    plan_id             UUID NOT NULL,
    assignment_id       UUID NOT NULL,
    ai_suggestion       JSONB NOT NULL,
    user_override       JSONB NOT NULL,
    ai_hypothetical     JSONB,                     -- filled after execution
    user_actual         JSONB,                     -- filled after execution
    verdict             VARCHAR(20) NOT NULL DEFAULT 'pending',
    verdict_confidence  DECIMAL(5,4),
    evaluated_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_counterfactual_org_verdict
    ON intelligence.counterfactual_outcomes (organization_id, verdict);
CREATE INDEX idx_counterfactual_pending
    ON intelligence.counterfactual_outcomes (organization_id, created_at)
    WHERE verdict = 'pending';

ALTER TABLE intelligence.counterfactual_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY co_tenant ON intelligence.counterfactual_outcomes
    FOR ALL USING (organization_id = auth.organization_id());
```

---

## 6. Integration with Existing Architecture

The learning model integrates into AstraPlanner's existing modules without modifying their internal structure:

| Existing Module | Integration Point | What the Learning Model Provides |
|-----------------|-------------------|----------------------------------|
| **Optimization Engine** | Pre-optimization feature injection | Absence probabilities per employee (adjust available hours), demand adjustments (correct forecast bias), assignment quality scores (rank candidates) |
| **Planning Workbench** | Recommendation panel | Learned rules surfaced as "suggested assignments", assignment quality as visual indicators (green/yellow/red) on drag-drop candidates |
| **Control Room** | Insight widget | Statistical patterns and LLM insights displayed as prioritized cards with confidence badges |
| **Notification Module** | High-confidence recommendations | Strong recommendations (>0.80) generate notification events for relevant planners |
| **Simulation Module** | Scenario parameter defaults | Seasonal indices and demand adjustments pre-populate scenario parameters; absence model provides probabilistic absence rates for Monte Carlo |
| **Audit Module** | Decision traceability | All recommendations, responses, and feedback attributions are logged and queryable for compliance |
| **AI Chat (NLQ)** | Context enrichment | Active learned rules, patterns, and recent insights are included in Claude's context when answering natural language queries |
