# Organizational Intelligence Layer

While user intelligence personalizes the experience for individuals, organizational intelligence learns how sites, processes, and the organization as a whole actually operate. This layer detects patterns invisible to any single planner — cross-site benchmarks, process coupling effects, seasonal rhythms, and emerging anomalies.

---

## 1. Site Intelligence Model

The system builds a cognitive model of each site, stored in `intelligence.site_profiles`. A site's model captures its operational fingerprint, performance baselines, and seasonal rhythms.

### 1.1 Operational Fingerprint

| Field | Type | Description | Derivation |
|---|---|---|---|
| `demand_volatility_index` | `numeric(5,3)` | Coefficient of variation of daily demand over trailing 90 days | `stddev(daily_demand) / avg(daily_demand)`. Low (<0.15) = stable/predictable, High (>0.40) = volatile/unpredictable |
| `absence_pattern` | `jsonb` | Structured absence data by multiple dimensions | See detailed structure below |
| `productivity_profile` | `jsonb` | Actual vs standard performance metrics per process | See detailed structure below |
| `bottleneck_map` | `jsonb` | Chronically constrained processes | Processes where `demand_hours > available_hours * 0.95` more than 60% of days |
| `skill_distribution` | `jsonb` | Skill coverage and fragility analysis | See detailed structure below |
| `flex_labor_dependency` | `numeric(3,2)` | Ratio of flex/temp hours to total hours | High (>0.30) = operationally fragile if agency supply disrupted |

**Absence pattern structure:**

```jsonb
{
  "day_of_week": {
    "monday": 0.062,
    "tuesday": 0.041,
    "friday": 0.078
  },
  "seasonal_indices": {
    "01": 1.15,
    "06": 0.85,
    "07": 0.90,
    "12": 1.35
  },
  "team_patterns": [
    {
      "process_id": "uuid",
      "avg_absence_rate": 0.058,
      "trend": "increasing",
      "trend_slope": 0.002
    }
  ],
  "correlation_factors": {
    "weather_sensitivity": 0.35,
    "event_sensitivity": 0.15
  }
}
```

**Skill distribution structure:**

```jsonb
{
  "process_coverage": [
    {
      "process_id": "uuid",
      "process_name": "Picking",
      "certified_count": 45,
      "required_count": 30,
      "coverage_ratio": 1.50,
      "single_point_of_failure": false
    },
    {
      "process_id": "uuid",
      "process_name": "Hazmat Handling",
      "certified_count": 2,
      "required_count": 2,
      "coverage_ratio": 1.00,
      "single_point_of_failure": true,
      "spof_employees": ["uuid-1", "uuid-2"],
      "risk_level": "critical"
    }
  ],
  "cross_training_rate": 0.32,
  "avg_skills_per_employee": 2.8,
  "skill_expiry_forecast": [
    {
      "skill_type": "Forklift Certification",
      "expiring_within_30_days": 5,
      "expiring_within_90_days": 12,
      "renewal_pipeline_count": 8
    }
  ]
}
```

### 1.2 Performance Baselines

Performance baselines establish "normal" for each site so that deviations can be detected and contextualized.

| Field | Type | Description | Recalculation |
|---|---|---|---|
| `coverage_baseline_pct` | `numeric(5,2)` | Typical achieved coverage percentage | Rolling 90-day median, excluding outlier days (>2 SD from mean) |
| `overtime_baseline_pct` | `numeric(5,2)` | Typical overtime as % of total hours | Rolling 90-day median |
| `cost_per_unit_baseline` | `numeric(8,2)` | Labor cost per demand unit processed | Rolling 90-day median, adjusted for wage changes |
| `plan_stability_index` | `numeric(3,2)` | 0.0 (plans never change) to 1.0 (constant flux) | `count(post_publish_changes) / count(published_plans)` over 90 days |
| `fill_rate_by_shift` | `jsonb` | Baseline fill rates per shift type | `{"morning": 0.96, "afternoon": 0.93, "night": 0.87}` |
| `time_to_fill_open_shifts_hours` | `numeric(5,1)` | Average hours to fill an open shift after posting | Tracks responsiveness of the available labor pool |

**Baseline interpretation for a typical retail logistics site:**

```
Site: Distribution Center East (DC-E)
  Coverage baseline:           94.2%
  Overtime baseline:            6.8%
  Cost per unit:              $2.34
  Plan stability:              0.22 (relatively stable)
  Night shift fill rate:       0.84 (chronically understaffed)
  Demand volatility:           0.28 (moderately volatile)
  Cross-training rate:         0.32 (32% of employees certified in 2+ processes)
```

### 1.3 Seasonal Models

Seasonal models capture cyclical patterns that repeat annually. They are built from 12+ months of historical data and refined each cycle.

```jsonb
{
  "demand_seasonal_indices": {
    "01": 0.80, "02": 0.75, "03": 0.85, "04": 0.90,
    "05": 0.95, "06": 1.00, "07": 0.95, "08": 1.05,
    "09": 1.10, "10": 1.20, "11": 1.40, "12": 1.60
  },
  "absence_seasonal_indices": {
    "01": 1.15, "02": 1.05, "03": 0.95, "04": 0.90,
    "05": 0.85, "06": 0.90, "07": 0.95, "08": 0.90,
    "09": 0.85, "10": 0.90, "11": 1.00, "12": 1.30
  },
  "productivity_seasonal_adjustments": {
    "01": 0.95, "07": 0.90, "11": 0.92, "12": 0.88
  },
  "peak_periods": [
    {
      "name": "Black Friday / Cyber Monday",
      "start_month": 11, "start_day": 20,
      "end_month": 12, "end_day": 5,
      "demand_multiplier": 2.2,
      "staffing_strategy": "max_flex_labor"
    },
    {
      "name": "Post-Holiday Returns",
      "start_month": 12, "start_day": 26,
      "end_month": 1, "end_day": 15,
      "demand_multiplier": 1.6,
      "staffing_strategy": "returns_process_priority"
    }
  ]
}
```

### 1.4 PostgreSQL Schema

```sql
-- =============================================================================
-- Schema: intelligence
-- Table: site_profiles
-- Purpose: Per-site cognitive model for operational intelligence
-- =============================================================================

CREATE TABLE intelligence.site_profiles (
    id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id                         uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    organization_id                 uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Model lifecycle
    model_status                    text NOT NULL DEFAULT 'cold_start'
                                    CHECK (model_status IN ('cold_start', 'building', 'active', 'stale')),
    data_start_date                 date,
    last_model_refresh              timestamptz NOT NULL DEFAULT now(),
    data_quality_score              numeric(3,2) NOT NULL DEFAULT 0.0,
    -- 0.0 = no data, 1.0 = complete high-quality history

    -- Operational fingerprint
    demand_volatility_index         numeric(5,3) NOT NULL DEFAULT 0.0,
    absence_pattern                 jsonb NOT NULL DEFAULT '{}'::jsonb,
    productivity_profile            jsonb NOT NULL DEFAULT '{}'::jsonb,
    bottleneck_map                  jsonb NOT NULL DEFAULT '[]'::jsonb,
    skill_distribution              jsonb NOT NULL DEFAULT '{}'::jsonb,
    flex_labor_dependency           numeric(3,2) NOT NULL DEFAULT 0.0,

    -- Performance baselines
    coverage_baseline_pct           numeric(5,2) NOT NULL DEFAULT 0.0,
    overtime_baseline_pct           numeric(5,2) NOT NULL DEFAULT 0.0,
    cost_per_unit_baseline          numeric(8,2) NOT NULL DEFAULT 0.0,
    plan_stability_index            numeric(3,2) NOT NULL DEFAULT 0.0,
    fill_rate_by_shift              jsonb NOT NULL DEFAULT '{}'::jsonb,
    time_to_fill_open_shifts_hours  numeric(5,1) NOT NULL DEFAULT 0.0,

    -- Seasonal models
    demand_seasonal_indices         jsonb NOT NULL DEFAULT '{}'::jsonb,
    absence_seasonal_indices        jsonb NOT NULL DEFAULT '{}'::jsonb,
    productivity_seasonal_adj       jsonb NOT NULL DEFAULT '{}'::jsonb,
    peak_periods                    jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- Site classification
    site_archetype                  text DEFAULT 'standard'
                                    CHECK (site_archetype IN (
                                        'high_volume_stable', 'high_volume_volatile',
                                        'low_volume_stable', 'low_volume_volatile',
                                        'seasonal_peak', 'standard'
                                    )),
    comparable_sites                uuid[] NOT NULL DEFAULT '{}',
    -- Array of site_ids with similar operational profiles

    -- Audit
    created_at                      timestamptz NOT NULL DEFAULT now(),
    updated_at                      timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_site_profile UNIQUE (site_id, organization_id)
);

ALTER TABLE intelligence.site_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_profiles_org_read ON intelligence.site_profiles
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.user_roles
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY site_profiles_system_write ON intelligence.site_profiles
    FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_site_profiles_org ON intelligence.site_profiles(organization_id);
CREATE INDEX idx_site_profiles_site ON intelligence.site_profiles(site_id);
CREATE INDEX idx_site_profiles_archetype
    ON intelligence.site_profiles(organization_id, site_archetype);

CREATE TRIGGER trg_site_profiles_updated
    BEFORE UPDATE ON intelligence.site_profiles
    FOR EACH ROW EXECUTE FUNCTION intelligence.set_updated_at();

-- =============================================================================
-- Table: site_metrics_daily
-- Purpose: Daily metric snapshots for trend detection and baseline computation
-- =============================================================================

CREATE TABLE intelligence.site_metrics_daily (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id                 uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    metric_date             date NOT NULL,

    -- Demand
    total_demand_units      integer NOT NULL DEFAULT 0,
    demand_by_process       jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- Staffing
    total_required_hours    numeric(8,1) NOT NULL DEFAULT 0,
    total_assigned_hours    numeric(8,1) NOT NULL DEFAULT 0,
    total_overtime_hours    numeric(8,1) NOT NULL DEFAULT 0,
    coverage_pct            numeric(5,2) NOT NULL DEFAULT 0,

    -- Absence
    total_absent_count      integer NOT NULL DEFAULT 0,
    absence_rate            numeric(5,4) NOT NULL DEFAULT 0,

    -- Productivity
    actual_uph_by_process   jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- {"process_id": {"actual_uph": 42.5, "standard_uph": 45.0, "variance_pct": -5.6}}

    -- Cost
    total_labor_cost        numeric(10,2) NOT NULL DEFAULT 0,
    cost_per_unit           numeric(8,2) NOT NULL DEFAULT 0,

    -- Plan stability
    post_publish_changes    integer NOT NULL DEFAULT 0,

    created_at              timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_site_metric_date UNIQUE (site_id, metric_date)
);

ALTER TABLE intelligence.site_metrics_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY site_metrics_org_read ON intelligence.site_metrics_daily
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.user_roles
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY site_metrics_system_write ON intelligence.site_metrics_daily
    FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_site_metrics_site_date
    ON intelligence.site_metrics_daily(site_id, metric_date DESC);
CREATE INDEX idx_site_metrics_org_date
    ON intelligence.site_metrics_daily(organization_id, metric_date DESC);
```

---

## 2. Process Intelligence

Process intelligence captures how each process actually performs at each site, going beyond static configuration to learn dynamic, real-world behavior.

### 2.1 Productivity Tracking

#### Actual vs Standard UPH Over Time

The system continuously tracks the gap between configured standard UPH (units per hour) and actual achieved UPH per process.

```
Process: Picking at DC-East
  Standard UPH (configured):     45.0
  Actual UPH (90-day average):   42.3 (-6.0%)
  Trend:                         Improving (+0.8% per month)
  Confidence:                    High (CV = 0.09, n = 87 days)
```

When the gap between standard and actual UPH exceeds 10% sustained over 30 days, the system surfaces a recommendation:

> "Picking standard UPH at DC-East is set to 45.0, but actual performance averages 39.2 (-12.9%). Plans are systematically understaffing this process. Consider adjusting the standard to 40.0 or investigating root causes."

#### Skill-Level Productivity Curves

The system validates configured skill-level productivity multipliers against observed data:

| Skill Level | Configured Multiplier | Actual Observed | Deviation | Recommendation |
|---|---|---|---|---|
| Level 1 (Trainee) | 0.50 | 0.55 | +10% | Trainees performing better than expected; minor |
| Level 2 (Standard) | 0.80 | 0.78 | -2.5% | Within tolerance |
| Level 3 (Advanced) | 0.90 | 0.82 | -8.9% | **Review**: Level 3 pickers underperforming assumption by ~9%. Plans may be over-relying on Level 3 staff. |
| Level 4 (Expert) | 1.00 | 1.03 | +3% | Within tolerance |

#### Time-of-Day Productivity

```jsonb
{
  "process": "Picking",
  "site": "DC-East",
  "hourly_productivity_index": {
    "06:00": 0.88,
    "07:00": 0.95,
    "08:00": 1.00,
    "09:00": 1.02,
    "10:00": 1.04,
    "11:00": 0.98,
    "12:00": 0.85,
    "13:00": 0.92,
    "14:00": 1.01,
    "15:00": 1.00,
    "16:00": 0.97,
    "17:00": 0.93,
    "18:00": 0.88,
    "19:00": 0.84,
    "20:00": 0.80,
    "21:00": 0.76,
    "22:00": 0.72
  },
  "shift_productivity_summary": {
    "morning_06_14": 0.96,
    "afternoon_14_22": 0.89,
    "night_22_06": 0.78
  },
  "insight": "Night shift productivity is 19% below morning shift. Consider adjusting night shift staffing by +20% to compensate, or investigate root causes (lighting, supervision, fatigue)."
}
```

#### Employee-Specific Productivity

The system tracks individual productivity deviations without exposing raw data to other employees (privacy-preserving aggregates only):

```
Process: Picking at DC-East
  Top quartile employees:    Average 52.1 UPH (+15.8% above standard)
  Median employees:          Average 44.2 UPH (-1.8% below standard)
  Bottom quartile employees: Average 35.8 UPH (-20.4% below standard)

  Employee #4127 (anonymized in cross-tenant reports):
    Picking UPH: 54.3 (top 5%)
    Packing UPH: 41.2 (median)
    Returns UPH: 58.1 (top 1%)
    → System learns: assign #4127 to Returns or Picking, not Packing
```

### 2.2 Demand-to-Process Correlation Learning

#### Linear Assumption Testing

The standard planning model assumes a linear relationship between demand volume and labor need. The system tests this assumption:

```
Process: Picking
  Linear model:     labor_hours = demand_units / standard_UPH
  Actual observed:  labor_hours = (demand_units / standard_UPH) * complexity_factor

  Where complexity_factor varies with volume:
    Low volume   (< 5000 units):  complexity_factor = 0.95  (slightly easier)
    Normal volume (5000-10000):   complexity_factor = 1.00  (linear holds)
    High volume   (10000-15000):  complexity_factor = 1.08  (congestion effects)
    Surge volume  (> 15000):      complexity_factor = 1.18  (significant nonlinearity)
```

A 10% increase in order volume does not create a 10% increase in picking workload — at high volumes, it creates a 12-13% increase due to warehouse congestion, longer travel paths, and increased error rates.

#### Capacity Walls

The system detects nonlinear breakpoints where a process hits structural capacity limits:

```
Process: Receiving at DC-East
  Capacity wall detected at: 8,200 units/day
  Evidence: Above 8,200 units, throughput plateaus despite additional labor.
  Root cause hypothesis: Physical dock capacity (only 12 bays).
  Recommendation: Above 8,200 units forecast, schedule staggered deliveries
                   or activate overflow receiving area.
```

### 2.3 Cross-Process Dependencies

#### Lag Analysis

The system learns temporal coupling between processes through correlation analysis of daily metrics:

```
Dependency: Receiving → Picking
  Lag: 2-4 hours
  Strength: 0.78 (strong coupling)
  Pattern: When receiving is understaffed before 10:00, picking productivity
           drops 12-18% between 12:00-16:00 due to inventory staging delays.
  Planning implication: Receiving staffing before 10:00 is a leading indicator
                        for afternoon picking capacity. Prioritize morning
                        receiving coverage.

Dependency: Picking → Packing
  Lag: 0.5-1 hour
  Strength: 0.91 (very strong coupling)
  Pattern: Tight coupling — packing throughput directly follows picking with
           minimal buffer. If picking stops, packing idles within 30 minutes.
  Planning implication: Synchronize picking and packing staffing levels.
                        Do not schedule picking without proportional packing.

Dependency: Returns → Restocking
  Lag: 24-48 hours
  Strength: 0.45 (moderate coupling)
  Pattern: Returns processing creates restocking work with a 1-2 day lag.
           Volume is predictable from returns intake.
  Planning implication: Use Monday returns volume to forecast Wednesday
                        restocking demand.
```

#### Independence Detection

Not all processes are coupled. The system identifies truly independent processes that can be staffed in isolation:

```
Independent processes at DC-East:
  - Facilities Maintenance (no demand correlation with order volume)
  - Training & Onboarding (scheduled independently)
  - Quality Audits (periodic, not demand-driven)

Coupled process clusters:
  Cluster 1: Receiving → Putaway → Picking → Packing → Shipping (core flow)
  Cluster 2: Returns → Inspection → Restocking (returns flow)
  Cluster 3: Inventory Count → Adjustment → Replenishment (inventory flow)
```

### 2.4 Process Intelligence Schema

```sql
-- =============================================================================
-- Table: process_intelligence
-- Purpose: Per-process learning within each site
-- =============================================================================

CREATE TABLE intelligence.process_intelligence (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    process_id                  uuid NOT NULL REFERENCES public.processes(id) ON DELETE CASCADE,
    site_id                     uuid NOT NULL REFERENCES public.sites(id) ON DELETE CASCADE,
    organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Productivity tracking
    actual_uph_avg              numeric(6,2),
    actual_uph_trend_slope      numeric(6,4),       -- units per month change
    actual_uph_trend_direction  text DEFAULT 'stable'
                                CHECK (actual_uph_trend_direction IN (
                                    'improving', 'declining', 'stable'
                                )),
    skill_level_actual_mult     jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- {"level_1": 0.55, "level_2": 0.78, "level_3": 0.82, "level_4": 1.03}
    hourly_productivity_index   jsonb NOT NULL DEFAULT '{}'::jsonb,
    shift_productivity_summary  jsonb NOT NULL DEFAULT '{}'::jsonb,
    employee_quartile_uph       jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- {"p25": 35.8, "p50": 44.2, "p75": 52.1, "p90": 56.0}

    -- Demand-to-labor correlation
    complexity_factor_model     jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- {"low": 0.95, "normal": 1.0, "high": 1.08, "surge": 1.18}
    capacity_wall_units         integer,
    capacity_wall_confidence    numeric(3,2) DEFAULT 0.0,
    demand_linearity_score      numeric(3,2) DEFAULT 1.0,
    -- 1.0 = perfectly linear, <0.9 = significant nonlinearity detected

    -- Cross-process dependencies (outbound)
    downstream_dependencies     jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- [{"target_process_id": "uuid", "lag_hours_min": 2, "lag_hours_max": 4,
    --   "coupling_strength": 0.78, "description": "..."}]
    upstream_dependencies       jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_independent              boolean NOT NULL DEFAULT false,

    -- Metadata
    last_model_refresh          timestamptz NOT NULL DEFAULT now(),
    data_points                 integer NOT NULL DEFAULT 0,
    confidence                  numeric(3,2) NOT NULL DEFAULT 0.0,

    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_process_intelligence UNIQUE (process_id, site_id)
);

ALTER TABLE intelligence.process_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY process_intel_org_read ON intelligence.process_intelligence
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.user_roles
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY process_intel_system_write ON intelligence.process_intelligence
    FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_process_intel_site
    ON intelligence.process_intelligence(site_id);
CREATE INDEX idx_process_intel_org
    ON intelligence.process_intelligence(organization_id);

CREATE TRIGGER trg_process_intel_updated
    BEFORE UPDATE ON intelligence.process_intelligence
    FOR EACH ROW EXECUTE FUNCTION intelligence.set_updated_at();
```

---

## 3. Organizational Learning

For multi-site tenants, organizational learning identifies cross-site patterns, surfaces best practices, and enables workforce mobility intelligence.

### 3.1 Site Benchmarking

#### Comparable Site Identification

Sites are clustered into comparability groups based on operational similarity:

```
Similarity features:
  - Demand volume tier (low/medium/high)
  - Demand volatility index
  - Process mix (which processes exist at this site)
  - Workforce size
  - Geographic region (affects labor market, regulations)
  - Operating hours (single shift vs multi-shift)
```

**Similarity score** between two sites:

```
similarity(site_A, site_B) =
    0.30 * demand_volume_similarity
  + 0.20 * process_mix_jaccard_index
  + 0.15 * workforce_size_similarity
  + 0.15 * demand_volatility_similarity
  + 0.10 * region_match
  + 0.10 * operating_hours_similarity
```

Sites with `similarity > 0.75` are considered comparable. The `comparable_sites` array in `site_profiles` is updated monthly.

#### Benchmark Dashboard

For each comparable group, the system computes cross-site benchmarks:

```
Comparable Group: "Mid-Volume Multi-Shift Distribution Centers"
Members: DC-East, DC-West, DC-Central, DC-South

Metric              DC-East   DC-West   DC-Central  DC-South   Group Avg
────────────────────────────────────────────────────────────────────────
Coverage %           94.2      96.1      91.8        93.5       93.9
Overtime %            6.8       4.2       9.1         7.3        6.9
Cost per Unit       $2.34     $2.18     $2.67       $2.41      $2.40
Absence Rate         5.8%      4.1%      6.9%        5.5%       5.6%
Plan Stability       0.22      0.15      0.38        0.25       0.25
Cross-Training %    32%       48%       22%         35%        34%
FTE per 1K Units    12.4      10.8      14.1        12.0       12.3

Outlier Insights:
  ✓ DC-West: POSITIVE outlier on cost per unit and overtime.
    Key differentiator: Cross-training rate is 48% vs group avg 34%.
    Hypothesis: Higher cross-training enables better labor flexibility,
    reducing overtime and improving coverage simultaneously.

  ✗ DC-Central: NEGATIVE outlier on plan stability and cost.
    Key differentiator: Plan stability index 0.38 (highest in group).
    Hypothesis: Frequent post-publish plan changes create disruption
    and reduce workforce trust in schedules. Investigate root cause.
```

### 3.2 Best Practice Detection

The system detects operational improvements at individual sites and evaluates transferability to comparable sites.

#### Detection Mechanism

```
FOR each site S in organization:
    FOR each key metric M:
        IF improvement(S, M, last_90_days) > 10%:
            identify_change_events(S, last_90_days)
            -- What configuration changes, process modifications,
            -- or staffing pattern changes coincided with the improvement?

            FOR each comparable site C where C != S:
                IF C has not implemented similar change:
                    assess_transferability(change, C)
                    IF transferability_score > 0.6:
                        generate_recommendation(C, change, evidence_from_S)
```

#### Concrete Example

```
Best Practice Detected:
  Source: DC-West (Site 3)
  Change: Switched from fixed start times to staggered starts
          (15-minute intervals from 06:00 to 07:00)
  Date of Change: 2026-01-15
  Impact:
    - Overtime reduced by 22% (from 5.4% to 4.2%)
    - Morning coverage improved by 4 percentage points
    - Dock congestion incidents reduced by 60%

  Transferability Assessment:
    DC-East  (similarity: 0.82): HIGH transferability
      - Similar demand pattern, similar dock configuration
      - Currently experiences dock congestion 3x/week
      - Estimated impact: -15% to -20% overtime reduction

    DC-South (similarity: 0.78): MEDIUM transferability
      - Similar demand but different dock layout (drive-through vs L-shaped)
      - Staggered starts may help but magnitude uncertain
      - Estimated impact: -8% to -15% overtime reduction

    DC-Central (similarity: 0.71): LOW transferability
      - Single-shift operation; staggered starts less relevant
      - Root cause of overtime is understaffing, not scheduling

  Recommendation surfaced to DC-East and DC-South planners:
    "DC-West reduced overtime by 22% after switching to staggered start times.
     Your site has a similar demand profile. Would you like to model this
     change in a scenario?"
```

### 3.3 Workforce Mobility Intelligence

For organizations where employees can work at multiple sites, the system tracks cross-site performance and predicts transfer success.

#### Multi-Site Performance Tracking

```sql
-- View: Cross-site employee performance comparison
CREATE VIEW intelligence.employee_cross_site_performance AS
SELECT
    e.id AS employee_id,
    e.organization_id,
    sa.site_id,
    s.name AS site_name,
    p.name AS process_name,
    count(sa.id) AS shift_count,
    avg(sa.actual_uph) AS avg_uph,
    avg(sa.actual_uph) / NULLIF(p.standard_uph, 0) AS performance_ratio,
    max(sa.shift_date) AS last_worked_at_site
FROM public.employees e
JOIN public.shift_assignments sa ON sa.employee_id = e.id
JOIN public.sites s ON s.id = sa.site_id
JOIN public.processes p ON p.id = sa.process_id
WHERE sa.actual_uph IS NOT NULL
GROUP BY e.id, e.organization_id, sa.site_id, s.name, p.name;
```

**Example output:**

```
Employee #4127:
  DC-East  | Picking   | 87 shifts | 54.3 UPH | 1.21x standard | Last: 2026-03-18
  DC-East  | Returns   | 34 shifts | 58.1 UPH | 1.29x standard | Last: 2026-03-15
  DC-West  | Picking   | 12 shifts | 48.7 UPH | 1.08x standard | Last: 2026-02-20
  DC-West  | Packing   |  5 shifts | 39.2 UPH | 0.87x standard | Last: 2026-01-15

  Insight: #4127 performs 12% better at home site (DC-East) vs DC-West.
           Onboarding friction at DC-West appears resolved (improving trend
           across 12 shifts). Strong candidate for cross-site flex pool.
```

#### Transfer Success Prediction

```
transfer_success_score(employee, target_site) =
    0.30 * process_skill_match(employee, target_site.required_processes)
  + 0.25 * prior_cross_site_performance(employee)
  + 0.20 * site_similarity(employee.home_site, target_site)
  + 0.15 * employee_adaptability_score
  + 0.10 * commute_feasibility(employee.location, target_site.location)

employee_adaptability_score =
    based on historical performance variance across sites and processes.
    Low variance across different environments = high adaptability.
```

---

## 4. Anomaly Detection

### 4.1 Detection Hierarchy

Anomalies are detected at three levels, each with progressively finer granularity:

#### Site-Level Anomalies

| Anomaly Type | Detection Method | Threshold | Example |
|---|---|---|---|
| Demand surge | Forecast deviation | Actual > forecast by 25%+ | "DC-East receiving 12,500 units today vs 9,800 forecast (+27.6%)" |
| Demand collapse | Forecast deviation | Actual < forecast by 30%+ | "DC-South volume at 4,200 vs 6,500 forecast (-35.4%). Weather event?" |
| Mass absence | Absence rate deviation | Absence rate > 2x site baseline | "DC-Central absence rate at 14.2% today vs 6.9% baseline. 23 unplanned absences." |
| Coverage crisis | Coverage threshold | Coverage < 80% for any 4-hour window | "Picking coverage at DC-East dropping to 72% between 14:00-18:00" |
| Overtime spike | Overtime deviation | Projected overtime > 2x baseline | "DC-West projected overtime at 13.8% vs 4.2% baseline this week" |
| Cost anomaly | Cost per unit deviation | Cost per unit > 1.5x baseline for 3+ consecutive days | "DC-Central cost per unit at $3.89 vs $2.67 baseline for past 4 days" |

#### Process-Level Anomalies

| Anomaly Type | Detection Method | Threshold | Example |
|---|---|---|---|
| Throughput drop | Statistical process control | Actual UPH > 2 SD below 30-day mean for 3+ consecutive days | "Picking UPH at DC-East dropped from 42.3 to 36.1 avg over last 4 days (-14.7%)" |
| Skill gap emerging | Certification tracking | Certified employee count approaching or below required minimum | "Hazmat Handling at DC-East: 2 certified employees remaining, 1 resignation pending. SPOF risk critical." |
| Capacity wall hit | Throughput plateau detection | Throughput flatlines despite demand increase and available labor | "Receiving throughput plateaued at 8,100 units despite 3 additional staff. Physical capacity limit reached." |
| Quality degradation | Error rate tracking | Error rate > 2x process baseline | "Packing error rate at DC-West: 2.8% vs 1.1% baseline. Correlates with 4 new hires in packing this week." |
| Dependency cascade | Cross-process lag analysis | Downstream process impacted by upstream constraint | "Picking bottleneck detected 2:00 PM. Cause: Receiving understaffed 8:00-10:00 AM (lag correlation: 0.78)." |

#### Employee-Level Anomalies

| Anomaly Type | Detection Method | Threshold | Example |
|---|---|---|---|
| Sudden productivity change | Individual trend deviation | Productivity change > 20% sustained for 5+ shifts | "Employee #3892: Picking UPH dropped from 48.2 to 37.1 (-23%) over last 7 shifts." |
| Unusual absence pattern | Pattern deviation from personal baseline | Absence frequency > 3x personal baseline in rolling 30 days | "Employee #5501: 4 unplanned absences in last 3 weeks vs historical average of 0.5/month." |
| Skill expiry cluster | Certification date tracking | 3+ skill certifications expiring within 30 days for same employee | "Employee #2204: Forklift, Hazmat, and First Aid certifications all expire within next 25 days." |
| Overutilization | Hours tracking | Employee scheduled >95th percentile hours for role for 3+ consecutive weeks | "Employee #4127: Scheduled 52, 49, 51 hours over last 3 weeks. Burnout risk." |

### 4.2 Anomaly Classification

Every detected anomaly is classified into one of three categories, which determines the response protocol:

| Classification | Definition | Typical Duration | Response Approach |
|---|---|---|---|
| **Temporary** | External event causing short-term disruption | Hours to days | Tactical adjustment; wait for resolution |
| **Structural** | Operational configuration no longer matches reality | Weeks to months | Process or configuration change needed |
| **Systemic** | Fundamental capability gap | Months to quarters | Strategic intervention (hiring, training, investment) |

**Classification decision tree:**

```
1. Has an external event been identified? (weather, holiday, road closure)
   YES → Classify as TEMPORARY
   NO  → Continue

2. Did the anomaly resolve within 5 business days without intervention?
   YES → Classify as TEMPORARY (retroactive)
   NO  → Continue

3. Is the anomaly isolated to one process or shift?
   YES → Classify as STRUCTURAL (process-level fix needed)
   NO  → Continue

4. Does the anomaly correlate with a workforce capability metric?
   (skill gaps, training pipeline, headcount shortage)
   YES → Classify as SYSTEMIC
   NO  → Classify as STRUCTURAL (default for persistent unexplained anomalies)
```

### 4.3 Response Protocol

| Classification | Immediate Action | Short-Term Response | Long-Term Response |
|---|---|---|---|
| **Temporary** | Alert on-shift manager. Suggest reallocation from lower-priority processes. | Re-optimize remaining plan for the day. Activate flex labor pool if available. | Log event for seasonal model refinement. Update demand volatility index. |
| **Structural** | Flag for planner review at next planning session. | Generate scenario comparing current config vs adjusted config. Surface AI recommendation: "Adjust standard UPH for Picking from 45.0 to 41.0 based on 60-day actuals." | Update process configuration. Retrain affected models. Communicate change to affected planners. |
| **Systemic** | Surface to admin and site manager with data package. | Generate workforce gap analysis: "Site needs 3 additional certified forklift operators within 60 days." | Feed into hiring pipeline, training program planning, and capacity investment decisions. |

### 4.4 Escalation Matrix

```
Anomaly Severity = f(impact_scope, duration, deviation_magnitude)

Severity Levels:
  INFO:     Logged, visible in analytics. No notification.
  WARNING:  Notification to assigned planner(s).
  ALERT:    Notification to planner(s) + site manager.
  CRITICAL: Notification to planner(s) + site manager + admin.
                Real-time dashboard banner. Auto-generated action plan.
```

| Trigger Condition | Severity | Notification Target | Response SLA |
|---|---|---|---|
| Single metric 1-2 SD from baseline | INFO | Dashboard only | None |
| Single metric > 2 SD from baseline | WARNING | Planner | Acknowledge within 4 hours |
| Multiple correlated metrics anomalous | ALERT | Planner + Manager | Acknowledge within 1 hour |
| Coverage < 75% in any upcoming 4-hour window | ALERT | Planner + Manager | Acknowledge within 1 hour |
| SPOF process at risk (last certified employee absent/leaving) | CRITICAL | Planner + Manager + Admin | Immediate |
| Site-wide coverage < 70% | CRITICAL | Planner + Manager + Admin | Immediate |
| Cascading anomalies across 2+ processes | CRITICAL | Planner + Manager + Admin | Within 30 minutes |
| Anomaly persists > 5 days without acknowledgment | AUTO-ESCALATE | Next level up | Within 2 hours |

### 4.5 Anomaly Detection Schema

```sql
-- =============================================================================
-- Table: anomalies
-- Purpose: Detected anomalies with classification and response tracking
-- =============================================================================

CREATE TABLE intelligence.anomalies (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    site_id                 uuid REFERENCES public.sites(id),
    process_id              uuid REFERENCES public.processes(id),
    employee_id             uuid REFERENCES public.employees(id),

    -- Detection
    anomaly_level           text NOT NULL
                            CHECK (anomaly_level IN ('site', 'process', 'employee')),
    anomaly_type            text NOT NULL,
    -- e.g., 'demand_surge', 'throughput_drop', 'mass_absence',
    --       'skill_gap_emerging', 'sudden_productivity_change'
    detection_method        text NOT NULL,
    -- e.g., 'forecast_deviation', 'statistical_process_control',
    --       'certification_tracking', 'trend_analysis'
    deviation_value         numeric(8,2),
    deviation_unit          text,
    -- e.g., '%', 'UPH', 'count', 'hours'
    threshold_used          numeric(8,2),
    baseline_value          numeric(8,2),
    actual_value            numeric(8,2),

    -- Classification
    classification          text DEFAULT 'unclassified'
                            CHECK (classification IN (
                                'temporary', 'structural', 'systemic', 'unclassified'
                            )),
    severity                text NOT NULL DEFAULT 'info'
                            CHECK (severity IN ('info', 'warning', 'alert', 'critical')),

    -- Lifecycle
    status                  text NOT NULL DEFAULT 'open'
                            CHECK (status IN (
                                'open', 'acknowledged', 'investigating',
                                'mitigated', 'resolved', 'false_positive'
                            )),
    detected_at             timestamptz NOT NULL DEFAULT now(),
    acknowledged_at         timestamptz,
    acknowledged_by         uuid REFERENCES auth.users(id),
    resolved_at             timestamptz,
    resolved_by             uuid REFERENCES auth.users(id),
    resolution_notes        text,
    auto_escalated          boolean NOT NULL DEFAULT false,

    -- Context
    description             text NOT NULL,
    -- Human-readable description generated by the system
    suggested_actions       jsonb NOT NULL DEFAULT '[]'::jsonb,
    -- [{"action": "Activate flex pool", "priority": 1, "estimated_impact": "..."}]
    related_anomaly_ids     uuid[] NOT NULL DEFAULT '{}',
    -- Linked anomalies for cascading events
    context_data            jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Supporting data for investigation

    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE intelligence.anomalies ENABLE ROW LEVEL SECURITY;

CREATE POLICY anomalies_org_read ON intelligence.anomalies
    FOR SELECT USING (
        organization_id IN (
            SELECT organization_id FROM public.user_roles
            WHERE user_id = auth.uid()
        )
    );

CREATE POLICY anomalies_org_write ON intelligence.anomalies
    FOR UPDATE USING (
        organization_id IN (
            SELECT organization_id FROM public.user_roles
            WHERE user_id = auth.uid() AND role IN ('admin', 'planner', 'manager')
        )
    );

CREATE POLICY anomalies_system_insert ON intelligence.anomalies
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_anomalies_org_status
    ON intelligence.anomalies(organization_id, status, severity)
    WHERE status NOT IN ('resolved', 'false_positive');
CREATE INDEX idx_anomalies_site
    ON intelligence.anomalies(site_id, detected_at DESC)
    WHERE status NOT IN ('resolved', 'false_positive');
CREATE INDEX idx_anomalies_open
    ON intelligence.anomalies(organization_id, detected_at DESC)
    WHERE status = 'open';

CREATE TRIGGER trg_anomalies_updated
    BEFORE UPDATE ON intelligence.anomalies
    FOR EACH ROW EXECUTE FUNCTION intelligence.set_updated_at();
```

---

## 5. Intelligence Refresh Architecture

### 5.1 Processing Pipeline

```
Data Flow:
  Raw Events → Daily Aggregation → Model Refresh → Anomaly Detection → Recommendations

Schedule (all times UTC):
  Continuous:   Event ingestion into intelligence.user_events and site_metrics_daily
  01:00 daily:  Aggregate site_metrics_daily from previous day's shift data
  02:00 daily:  Refresh user_profiles (interaction counters, override rates)
  02:30 daily:  Refresh site_profiles (baselines, volatility indices)
  03:00 daily:  Run anomaly detection across all active sites
  03:30 daily:  Generate recommendations from anomaly + intelligence data
  Sunday 04:00: Weekly model refresh (behavioral fingerprints, process intelligence,
                cross-site benchmarks, seasonal model refit)
  1st of month: Monthly deep refresh (seasonal indices, site archetypes,
                comparable site clustering, best practice detection)
```

### 5.2 Data Quality Gates

Intelligence models are only as good as their input data. Each model carries a `data_quality_score`:

| Score Range | Label | Meaning | System Behavior |
|---|---|---|---|
| 0.0 - 0.3 | Poor | Insufficient or inconsistent data | Model outputs suppressed; role/segment defaults used |
| 0.3 - 0.6 | Fair | Enough data for basic patterns, some gaps | Model outputs shown with low-confidence indicator |
| 0.6 - 0.8 | Good | Reliable patterns with adequate history | Model outputs shown normally |
| 0.8 - 1.0 | Excellent | Rich history, consistent data, seasonal coverage | Full model capabilities enabled (seasonal adjustment, anomaly detection) |

Data quality score factors:
- History depth (months of data available)
- Completeness (% of days with non-null metrics)
- Consistency (absence of impossible values or suspicious patterns)
- Recency (is the most recent data within 24 hours?)
