# User Intelligence Layer

The system builds a cognitive model of each user — not to surveil, but to serve them better. Every interaction teaches AstraPlanner how a planner thinks, what a manager cares about, and how an admin operates. This intelligence makes the platform feel less like software and more like a knowledgeable colleague who remembers your preferences.

---

## 1. User Model Schema

The per-user intelligence model is stored in `intelligence.user_profiles` and captures four dimensions: decision patterns, behavioral fingerprint, role-specific intelligence, and evolving preferences.

### 1.1 Decision Patterns

| Field | Type | Description | Derivation |
|---|---|---|---|
| `override_rate` | `numeric(5,4)` | Percentage of AI suggestions the user modifies before accepting | `modified_suggestions / total_suggestions` over rolling 90-day window |
| `edit_latency_avg_sec` | `integer` | Average seconds between plan generation and first manual edit | Median of last 50 plan interactions; fast (<60s) = careful checker, slow (>300s) = trusts output |
| `constraint_relaxation_map` | `jsonb` | Map of constraint type to relaxation frequency | e.g., `{"overtime_cap": 0.34, "skill_match": 0.12, "break_compliance": 0.02}` — reveals real priorities vs stated priorities |
| `risk_tolerance_score` | `numeric(3,2)` | 0.0 (conservative) to 1.0 (aggressive) | Derived from staffing ratios: `avg_assigned_headcount / avg_required_headcount`. Ratio < 1.0 = high risk tolerance (lean staffing), > 1.1 = low risk tolerance |
| `planning_horizon_days` | `integer` | Typical planning horizon in days | Mode of the date range selected in the last 30 planning sessions |

**Interpretation guide:**

- `override_rate > 0.60`: Independent planner. System should present options rather than single recommendations.
- `override_rate < 0.15`: High AI trust. System can operate with greater autonomy.
- `constraint_relaxation_map` with high `overtime_cap` relaxation: User prioritizes coverage over cost. Shift optimization objective weights should reflect this.
- `risk_tolerance_score < 0.3` combined with `override_rate > 0.5`: Conservative planner who prefers manual control — surface more warnings, fewer auto-actions.

### 1.2 Behavioral Fingerprint

| Field | Type | Description |
|---|---|---|
| `preferred_workflow` | `text` | One of: `ai_first_modify`, `manual_first_ai_fill`, `hybrid_iterative`, `full_delegation` |
| `attention_pattern` | `jsonb` | Widget interaction counts normalized to percentages, e.g., `{"coverage_heatmap": 0.35, "overtime_chart": 0.28, "cost_summary": 0.20, "alerts": 0.17}` |
| `peak_usage_hours` | `int[]` | Array of hours (0-23) when user is typically active, derived from login and interaction timestamps |
| `feature_adoption` | `jsonb` | Map of feature keys to adoption status, e.g., `{"scenario_comparison": true, "bulk_swap": true, "demand_override": false, "shift_templates": true}` |
| `collaboration_style` | `text` | One of: `solo_planner`, `share_and_discuss`, `delegate_and_review`, `collaborative_edit` |
| `session_duration_avg_min` | `integer` | Average planning session duration in minutes |
| `interaction_density` | `numeric(5,2)` | Actions per minute during active sessions — high density = power user |

**Workflow detection logic:**

```
IF first_action_after_plan_open = 'generate_ai_plan' AND subsequent_edits > 3:
    workflow = 'ai_first_modify'
ELIF first_action_after_plan_open = 'manual_assignment' AND ai_fill_used_later = true:
    workflow = 'manual_first_ai_fill'
ELIF alternates_between_ai_and_manual:
    workflow = 'hybrid_iterative'
ELIF first_action = 'generate_ai_plan' AND subsequent_edits <= 1:
    workflow = 'full_delegation'
```

### 1.3 Role-Specific Intelligence

#### Planner Model (`role_intelligence.planner`)

```jsonb
{
  "favored_assignments": [
    {
      "employee_id": "uuid",
      "process_id": "uuid",
      "day_of_week": 1,
      "frequency": 0.85,
      "last_observed": "2026-03-15"
    }
  ],
  "shift_pattern_preferences": {
    "preferred_patterns": ["4x10", "5x8"],
    "avoided_patterns": ["split_shift", "rotating_nights"]
  },
  "overtime_threshold_comfort": {
    "soft_cap_hours": 45,
    "hard_cap_hours": 50,
    "typical_approval_range": [40, 48]
  },
  "notification_preferences": {
    "preferred_lead_time_hours": 24,
    "preferred_channels": ["in_app", "email"],
    "quiet_hours": [22, 6]
  },
  "plan_revision_count_avg": 3.2,
  "swap_vs_reassign_ratio": 0.65
}
```

#### Manager Model (`role_intelligence.manager`)

```jsonb
{
  "approval_speed_avg_hours": 4.2,
  "rejection_rate": 0.08,
  "rejection_triggers": [
    {
      "trigger": "overtime_percentage_above",
      "threshold": 5.0,
      "frequency": 0.72
    },
    {
      "trigger": "uncovered_slots_above",
      "threshold": 2,
      "frequency": 0.55
    },
    {
      "trigger": "specific_employee_overloaded",
      "threshold": null,
      "frequency": 0.31
    }
  ],
  "reporting_preferences": {
    "preferred_metrics": ["coverage_pct", "cost_per_unit", "overtime_hours"],
    "preferred_granularity": "daily",
    "preferred_format": "chart"
  },
  "cross_site_comparison_frequency": "weekly",
  "escalation_response_time_avg_hours": 1.8
}
```

#### Admin Model (`role_intelligence.admin`)

```jsonb
{
  "config_change_frequency_per_month": 4.5,
  "integration_monitoring_schedule": {
    "typical_check_times": ["08:15", "14:00"],
    "check_duration_avg_min": 3
  },
  "user_management_patterns": {
    "bulk_operations": true,
    "permission_review_frequency_days": 30
  },
  "system_health_attention": {
    "primary_concerns": ["api_latency", "budget_utilization", "error_rate"],
    "dashboard_dwell_time_sec": 45
  }
}
```

### 1.4 Evolving Preferences

Every preference value carries metadata that governs how it evolves over time.

| Metadata Field | Type | Description |
|---|---|---|
| `confidence` | `numeric(3,2)` | 0.0 to 1.0 — how consistent is this pattern? Based on coefficient of variation of the underlying signal |
| `sample_size` | `integer` | Number of observations backing this preference |
| `last_updated` | `timestamptz` | When this preference was last recalculated |
| `decay_half_life_days` | `integer` | Default 90. Recent behavior weighted exponentially more than old behavior |
| `seasonal_adjustment` | `jsonb` | Monthly multipliers, e.g., `{"11": 1.3, "12": 1.5}` for holiday-season planning style differences |

**Preference decay formula:**

```
weight(observation) = exp(-ln(2) * age_in_days / half_life_days)
effective_value = Σ(value_i * weight_i) / Σ(weight_i)
```

**Confidence calculation:**

```
IF coefficient_of_variation < 0.15 AND sample_size >= 20: confidence = HIGH (0.8-1.0)
IF coefficient_of_variation < 0.30 AND sample_size >= 10: confidence = MEDIUM (0.4-0.7)
ELSE: confidence = LOW (0.0-0.3)
```

Low-confidence preferences are not used for personalization — the system falls back to segment-level or role-level defaults.

---

## 2. User Model Construction

### 2.1 Cold Start

When a user first logs in, they receive a **role-default model** seeded from aggregate behavior of users in the same role across the platform (respecting tenant isolation — only cross-tenant aggregates are used, never another tenant's raw data).

| Role | Default Override Rate | Default Workflow | Default Planning Horizon | Default Risk Tolerance |
|---|---|---|---|---|
| Planner | 0.35 | `ai_first_modify` | 7 days | 0.50 |
| Manager | N/A | N/A | 14 days | 0.40 |
| Admin | N/A | N/A | 30 days | 0.30 |
| Viewer | N/A | N/A | 7 days | N/A |

The cold-start model carries `confidence = 0.0` on all fields, signaling "these are defaults, not learned preferences."

### 2.2 Warm-Up Period

**Duration:** First 14 calendar days or 20 planning sessions, whichever comes first.

During warm-up:
- The system **observes and records** all interactions into `intelligence.user_events`.
- The system **does not surface personalized recommendations** — it uses role-level defaults for all behavior.
- The system **does** surface a subtle onboarding indicator: "AstraPlanner is learning your preferences. Personalized suggestions will begin soon."
- At the end of warm-up, the system runs an initial model build and sets `model_status = 'active'`.

### 2.3 Active Learning

After warm-up, the system enters a continuous learning loop:

1. **Observe**: Every user action is recorded as a lightweight event in `intelligence.user_events`.
2. **Aggregate**: Batch jobs compute preference scores from raw events.
3. **Predict**: The user model informs AI plan generation, UI defaults, and notification timing.
4. **Feedback**: User responses to personalized suggestions feed back into the model.
5. **Adapt**: Preferences shift over time via exponential decay weighting.

**Active learning probes** (used sparingly, max 1 per week):
- "You've modified the returns-process assignment 3 times this week. Would you like AstraPlanner to pre-assign [Employee] to returns on Mondays?"
- "Your plans typically use a 5% overtime buffer. Should I use this as your default target?"

User can dismiss, accept, or adjust — all responses feed the model.

### 2.4 Model Update Frequency

| Component | Update Frequency | Method |
|---|---|---|
| Interaction counters | Real-time | Increment on event ingestion |
| Override rate, edit latency | Daily | Nightly batch: recompute from last 90 days of events |
| Behavioral fingerprint | Weekly | Sunday 02:00 UTC batch job per tenant |
| Role-specific intelligence | Weekly | Computed alongside behavioral fingerprint |
| Confidence scores | Weekly | Recomputed with each preference update |
| Seasonal adjustments | Monthly | First day of month, refit seasonal indices from 12+ months of history |

### 2.5 PostgreSQL Schema

```sql
-- =============================================================================
-- Schema: intelligence
-- Table: user_profiles
-- Purpose: Per-user cognitive model for personalization
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS intelligence;

CREATE TABLE intelligence.user_profiles (
    id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id             uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

    -- Model lifecycle
    model_status                text NOT NULL DEFAULT 'cold_start'
                                CHECK (model_status IN ('cold_start', 'warm_up', 'active', 'stale', 'archived')),
    warm_up_started_at          timestamptz,
    model_activated_at          timestamptz,
    last_model_refresh          timestamptz NOT NULL DEFAULT now(),
    total_observations          integer NOT NULL DEFAULT 0,

    -- Decision patterns
    override_rate               numeric(5,4) NOT NULL DEFAULT 0.35,
    edit_latency_avg_sec        integer NOT NULL DEFAULT 120,
    constraint_relaxation_map   jsonb NOT NULL DEFAULT '{}'::jsonb,
    risk_tolerance_score        numeric(3,2) NOT NULL DEFAULT 0.50,
    planning_horizon_days       integer NOT NULL DEFAULT 7,

    -- Behavioral fingerprint
    preferred_workflow          text NOT NULL DEFAULT 'ai_first_modify'
                                CHECK (preferred_workflow IN (
                                    'ai_first_modify', 'manual_first_ai_fill',
                                    'hybrid_iterative', 'full_delegation'
                                )),
    attention_pattern           jsonb NOT NULL DEFAULT '{}'::jsonb,
    peak_usage_hours            int[] NOT NULL DEFAULT ARRAY[9,10,11,14,15,16],
    feature_adoption            jsonb NOT NULL DEFAULT '{}'::jsonb,
    collaboration_style         text NOT NULL DEFAULT 'solo_planner'
                                CHECK (collaboration_style IN (
                                    'solo_planner', 'share_and_discuss',
                                    'delegate_and_review', 'collaborative_edit'
                                )),
    session_duration_avg_min    integer NOT NULL DEFAULT 15,
    interaction_density         numeric(5,2) NOT NULL DEFAULT 2.0,

    -- Role-specific intelligence (polymorphic JSONB)
    role_intelligence           jsonb NOT NULL DEFAULT '{}'::jsonb,

    -- User segment
    segment                     text NOT NULL DEFAULT 'validator'
                                CHECK (segment IN (
                                    'optimizer', 'traditionalist', 'validator', 'delegator'
                                )),
    segment_confidence          numeric(3,2) NOT NULL DEFAULT 0.0,

    -- Preference metadata
    preference_metadata         jsonb NOT NULL DEFAULT '{}'::jsonb,
    -- Structure: { "field_name": { "confidence": 0.8, "sample_size": 45,
    --              "last_updated": "...", "decay_half_life_days": 90,
    --              "seasonal_adjustment": {"11": 1.3} } }

    -- Audit
    created_at                  timestamptz NOT NULL DEFAULT now(),
    updated_at                  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_user_profile UNIQUE (user_id, organization_id)
);

-- RLS: users can read their own profile; admins can read all within org
ALTER TABLE intelligence.user_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_profiles_self_read ON intelligence.user_profiles
    FOR SELECT USING (
        user_id = auth.uid()
        OR organization_id IN (
            SELECT organization_id FROM public.user_roles
            WHERE user_id = auth.uid() AND role = 'admin'
        )
    );

CREATE POLICY user_profiles_system_write ON intelligence.user_profiles
    FOR ALL USING (
        -- Only service role (Edge Functions) can write
        auth.role() = 'service_role'
    );

-- Indexes
CREATE INDEX idx_user_profiles_org ON intelligence.user_profiles(organization_id);
CREATE INDEX idx_user_profiles_user ON intelligence.user_profiles(user_id);
CREATE INDEX idx_user_profiles_segment ON intelligence.user_profiles(organization_id, segment);
CREATE INDEX idx_user_profiles_status ON intelligence.user_profiles(model_status)
    WHERE model_status IN ('warm_up', 'active');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION intelligence.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_profiles_updated
    BEFORE UPDATE ON intelligence.user_profiles
    FOR EACH ROW EXECUTE FUNCTION intelligence.set_updated_at();

-- =============================================================================
-- Table: user_events
-- Purpose: Raw interaction events for model construction
-- =============================================================================

CREATE TABLE intelligence.user_events (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    event_type          text NOT NULL,
    -- Event types: 'plan_generated', 'assignment_overridden', 'constraint_relaxed',
    --              'plan_approved', 'plan_rejected', 'scenario_created',
    --              'widget_interacted', 'feature_used', 'session_started',
    --              'session_ended', 'notification_acknowledged'
    event_payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
    plan_version_id     uuid,
    site_id             uuid,
    occurred_at         timestamptz NOT NULL DEFAULT now(),
    processed           boolean NOT NULL DEFAULT false
);

-- Partition by month for efficient retention management
-- (In production, use native partitioning; shown as simple table for clarity)

ALTER TABLE intelligence.user_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_events_system_only ON intelligence.user_events
    FOR ALL USING (auth.role() = 'service_role');

CREATE INDEX idx_user_events_user_time
    ON intelligence.user_events(user_id, occurred_at DESC);
CREATE INDEX idx_user_events_org_type
    ON intelligence.user_events(organization_id, event_type, occurred_at DESC);
CREATE INDEX idx_user_events_unprocessed
    ON intelligence.user_events(occurred_at)
    WHERE processed = false;

-- Retention: events older than 365 days are archived to cold storage
-- Implemented via pg_cron job: DELETE FROM intelligence.user_events
-- WHERE occurred_at < now() - interval '365 days';
```

---

## 3. Personalization Application

### 3.1 Recommendation Ranking

When the AI layer generates recommendations (shift suggestions, employee assignments, process configurations), results are re-ranked based on the user model before presentation.

**Ranking formula:**

```
relevance_score(recommendation, user) =
    base_quality_score * 1.0
  + alignment_with_override_history * 0.3
  + alignment_with_constraint_priorities * 0.25
  + workflow_compatibility * 0.15
  + recency_of_similar_acceptance * 0.1
```

**Concrete example — Planner Sarah:**
Sarah has `constraint_relaxation_map = {"overtime_cap": 0.45, "skill_match": 0.05}`. When generating Monday plans for the returns process, the system knows Sarah prioritizes skill match over overtime cost. Two candidate plans:
- Plan A: 100% skill match, 8% overtime → `relevance = 0.92`
- Plan B: 90% skill match, 3% overtime → `relevance = 0.78`

For a different planner with inverted priorities, Plan B would score higher.

### 3.2 Default Settings

UI defaults adapt silently based on the user model:

| User Model Field | UI Default Affected | Example |
|---|---|---|
| `planning_horizon_days` | Date range picker default span | User who plans 14 days → calendar opens to 2-week view |
| `attention_pattern` | Dashboard widget layout | Most-interacted widgets promoted to top-left position |
| `preferred_workflow` | Initial plan screen state | `ai_first_modify` → opens with "Generate Plan" button prominent; `manual_first_ai_fill` → opens with empty schedule grid |
| `role_intelligence.planner.shift_pattern_preferences` | Shift template selector default | Pre-selects user's preferred pattern |
| `session_duration_avg_min` | Auto-save frequency | Short sessions → more frequent auto-save |

### 3.3 Notification Timing

```
delivery_time = find_optimal_slot(
    user.peak_usage_hours,
    notification.urgency,
    notification.type
)

-- For urgent notifications (coverage gap in next 4 hours):
--   Deliver immediately regardless of peak hours.
-- For standard notifications (plan ready for review):
--   Deliver at the start of the user's next peak usage window.
-- For informational notifications (weekly report):
--   Deliver during lowest-activity peak hour to avoid interrupting work.
```

**Example — Admin Lisa:**
Lisa's `peak_usage_hours = [8, 9, 14, 15]` and her admin model shows `integration_monitoring_schedule.typical_check_times = ["08:15"]`. The system:
1. Pre-loads integration dashboard data at 08:10 (5 minutes before typical check).
2. Delivers integration health summary notification at 08:12.
3. If an integration error occurred overnight, escalates to 08:00 delivery with "urgent" flag.

### 3.4 Explanation Depth

The system calibrates explanation verbosity based on user behavior:

| Signal | Interpretation | Explanation Style |
|---|---|---|
| High `interaction_density`, uses advanced features | Technical power user | Show confidence intervals, model inputs, constraint trade-offs |
| Low `interaction_density`, short sessions | Operational user | "Recommended: add 2 pickers to afternoon shift" — action-oriented, no math |
| High `override_rate` | Skeptical user | Show reasoning chain: "Suggested because coverage drops to 82% without this assignment" |
| `preferred_workflow = full_delegation` | Trusting user | Minimal explanation, just confirm action taken |

### 3.5 Autonomy Calibration

The system offers progressive autonomy levels based on demonstrated trust:

| Level | Trigger | System Behavior |
|---|---|---|
| **L0: Suggest** | Default for all users | AI suggests; user must explicitly accept |
| **L1: Recommend** | `override_rate < 0.20` for 30+ days | AI recommends with one-click accept; changes highlighted |
| **L2: Auto-apply with review** | `override_rate < 0.10` for 60+ days, `model_status = 'active'` | AI applies changes; user reviews within 24 hours; auto-reverts if not reviewed |
| **L3: Full auto** | Explicit user opt-in + admin approval + `override_rate < 0.05` for 90+ days | AI operates autonomously; user receives summary reports |

Autonomy level can be overridden by the user at any time. The system never unilaterally increases autonomy — it prompts: "Based on your usage patterns, you may benefit from auto-apply mode. Would you like to try it?"

### 3.6 Concrete Personalization Examples

**Example 1 — Planner Sarah (Monday returns process):**
Sarah has assigned Employee #4127 (most senior picker) to the returns process on 17 of the last 20 Mondays. The system:
- Detects this pattern with `confidence = 0.85`.
- When generating Monday plans, pre-assigns Employee #4127 to returns.
- If #4127 is unavailable, the system flags this explicitly: "Your usual returns assignment (Employee #4127) is unavailable Monday. Suggested alternative: Employee #3892 (next most experienced)."

**Example 2 — Manager Tom (overtime rejection threshold):**
Tom has rejected 8 of 11 plans where overtime exceeded 5%. The system:
- Sets `rejection_triggers[0] = {trigger: "overtime_percentage_above", threshold: 5.0, frequency: 0.72}`.
- When generating plans for Tom's approval, adds a soft constraint: `overtime_pct <= 4.5%` (below Tom's threshold by a safety margin).
- If the optimizer cannot meet this constraint, it presents the plan with a prominent warning: "Overtime at 6.2% — above your typical approval threshold of 5%."

**Example 3 — Admin Lisa (integration monitoring):**
Lisa checks integration health every weekday morning at 08:15. The system:
- Pre-fetches and caches integration status data at 08:10.
- If all integrations are healthy, shows a green summary banner (no click needed).
- If an issue exists, sends a push notification at 08:12 with the specific integration and error type.

---

## 4. User Segmentation

### 4.1 Segment Definitions

The system automatically clusters users into behavioral segments using the following feature vector:

```
segment_features = [
    override_rate,
    interaction_density,
    feature_adoption_count / total_features,
    session_duration_avg_min,
    ai_generation_frequency,
    manual_assignment_frequency
]
```

| Segment | Override Rate | AI Usage | Interaction Style | Typical Role |
|---|---|---|---|---|
| **Optimizer** | < 0.15 | High (generates multiple scenarios, compares) | Data-driven, explores dashboards deeply | Senior Planner |
| **Traditionalist** | > 0.50 | Low (uses AI reluctantly or not at all) | Experience-driven, prefers manual control | Tenured Planner |
| **Validator** | 0.15 - 0.50 | Medium (generates AI plan, then reviews line by line) | Thorough, methodical, moderate session duration | Mid-level Planner |
| **Delegator** | < 0.10 | Very high (generates and accepts with minimal review) | Fast sessions, low interaction density | Time-pressured Planner |

### 4.2 Segment Assignment

Segment assignment uses a simple rule-based classifier (not ML — interpretability and debuggability are more important at this scale):

```sql
-- Segment classification query (runs weekly)
UPDATE intelligence.user_profiles SET
    segment = CASE
        WHEN override_rate < 0.10 AND interaction_density < 1.5
            AND session_duration_avg_min < 8
            THEN 'delegator'
        WHEN override_rate < 0.15
            AND (feature_adoption->>'scenario_comparison')::boolean = true
            THEN 'optimizer'
        WHEN override_rate > 0.50
            THEN 'traditionalist'
        ELSE 'validator'
    END,
    segment_confidence = CASE
        WHEN total_observations > 100 THEN 0.90
        WHEN total_observations > 50 THEN 0.70
        WHEN total_observations > 20 THEN 0.50
        ELSE 0.20
    END
WHERE model_status = 'active';
```

### 4.3 Segment-Level Defaults

When a user's individual preference has low confidence, the system falls back to their segment's default:

| Setting | Optimizer | Traditionalist | Validator | Delegator |
|---|---|---|---|---|
| Explanation depth | Full (data + reasoning) | Minimal (action only) | Medium (key factors) | Summary only |
| Recommendation count | 3-5 options | 1 best option | 1 option + diff from manual | 1 auto-applied |
| Default autonomy level | L1 (Recommend) | L0 (Suggest) | L0 (Suggest) | L2 (Auto-apply with review) |
| Notification frequency | High (real-time alerts) | Low (daily digest) | Medium (batched 2x/day) | Low (exceptions only) |
| Dashboard default view | Analytics + scenarios | Schedule grid | Schedule grid + validation panel | Summary cards |

### 4.4 Segment Transitions

Users can move between segments as their behavior evolves. The system tracks segment history to detect meaningful transitions:

- **Traditionalist → Validator**: Often occurs after training or after seeing AI accuracy improve. The system should celebrate this: "Your AI-assisted plans have saved an average of 45 minutes per planning session."
- **Validator → Optimizer**: Power user development. Offer advanced features proactively.
- **Optimizer → Delegator**: Trust established. Confirm autonomy level increase.
- **Any → Traditionalist**: Possible regression due to AI errors. Investigate: were recent AI suggestions poor? Flag for quality review.

Segment transition triggers a review of all personalization settings to ensure they align with the new segment's defaults (unless the user has explicitly overridden them).

---

## 5. Privacy and Data Governance

### 5.1 Transparency

- Users can view their own profile via **Settings > My AI Profile**.
- The profile page shows: current segment, key preferences detected, autonomy level, and a plain-language summary: "AstraPlanner has learned that you prefer to plan 2 weeks ahead and prioritize full coverage over overtime minimization."
- Users can correct any preference: "This is wrong — I actually prefer to minimize overtime." Manual corrections carry `confidence = 1.0` and override learned values.

### 5.2 Data Minimization

- Raw events (`intelligence.user_events`) are retained for 365 days, then archived.
- Aggregated profiles (`intelligence.user_profiles`) are retained as long as the user account is active.
- Upon user deletion, all intelligence data is hard-deleted within 72 hours (GDPR compliance).
- No intelligence data ever leaves the tenant boundary. Cross-tenant aggregates use differential privacy (noise injection) for cold-start seeding.

### 5.3 Opt-Out

Users can opt out of personalization entirely via **Settings > Privacy > Personalization**. When opted out:
- `model_status` is set to `'archived'`.
- All raw events are deleted.
- The user receives role-level defaults only.
- No interaction data is recorded beyond standard application logs.
