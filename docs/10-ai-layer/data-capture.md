# Data Capture: The Intelligence Foundation

This document defines every data signal AstraPlanner captures to power its continuous intelligence layer. Without correct, comprehensive data capture, no learning, prediction, or recommendation is possible. This is the foundation upon which all AI capabilities are built.

**Architectural context**: Data capture operates within AstraPlanner's existing Supabase + tRPC modular monolith. Events flow through the Kafka-based event bus (see `event-architecture.md`), are stored in PostgreSQL with RLS isolation via `organization_id`, and are accelerated by Redis (Upstash) for real-time features. All captured data respects the privacy architecture defined in `ai-integration.md` and the GDPR framework in `gdpr-compliance.md`.

---

## 1. User Behavior Events

User behavior is the richest signal source in AstraPlanner. Every planner interaction encodes implicit preferences, trust levels, and domain expertise that the AI layer must learn from. These events are distinct from the domain events already defined in `event-architecture.md` -- they capture *how* users interact, not just *what* changed.

### 1.1 Navigation Events

Navigation events reveal which features users rely on, how they discover new capabilities, and where they spend their attention.

```typescript
// intelligence.events schema — navigation category

interface NavigationPageView {
  event_type: 'interaction.navigation.page_view';
  payload: {
    page_path: string;                    // e.g., "/sites/DFW-04/plans/current"
    page_category: PageCategory;          // 'control_room' | 'planning_workbench' | 'workforce' | 'demand' | 'settings' | 'reports' | 'simulation'
    referrer_path: string | null;         // previous page within the app
    time_on_page_ms: number;              // duration before navigating away (sent on exit)
    scroll_depth_pct: number;             // 0-100, how far down the page the user scrolled
    site_id: string | null;               // if page is site-scoped
    plan_id: string | null;               // if page is plan-scoped
  };
}

interface NavigationFeatureDiscovery {
  event_type: 'interaction.navigation.feature_discovery';
  payload: {
    feature_key: string;                  // e.g., "scenario_comparison", "ai_plan_review", "bulk_assign"
    discovery_method: 'organic' | 'guided_tour' | 'tooltip' | 'search' | 'notification_link';
    time_since_account_creation_days: number;
    user_role: string;
  };
}

interface NavigationWidgetInteraction {
  event_type: 'interaction.navigation.widget_interaction';
  payload: {
    widget_id: string;                    // e.g., "coverage_heatmap", "cost_breakdown", "alert_feed"
    action: 'expand' | 'collapse' | 'refresh' | 'configure' | 'dismiss';
    dashboard_context: string;            // which dashboard the widget is on
    interaction_count_session: number;    // how many times this widget was interacted with in this session
  };
}
```

**Storage strategy**: Hot (Redis) for active session tracking, warm (PostgreSQL `intelligence.user_events`) for 90-day rolling window, cold (S3 Parquet archives) beyond 90 days.

**Retention**: 90 days in PostgreSQL, 2 years in cold archive, then aggregated into feature summaries and raw events deleted.

**Privacy classification**: `page_path` and `feature_key` are **non-personal**. `user_id` in the envelope is a **quasi-identifier** (can identify individuals when combined with role and site). No PII is captured in navigation events.

### 1.2 Planning Events

Planning events capture the mechanics of how planners build and modify workforce plans. These events encode planning style, speed, and tool proficiency.

```typescript
interface PlanningPlanOpened {
  event_type: 'interaction.planning.plan_opened';
  payload: {
    plan_id: string;
    plan_version: number;
    plan_status: 'draft' | 'pending_review' | 'approved' | 'published';
    plan_period_start: string;            // ISO-8601 date
    plan_period_end: string;
    site_id: string;
    open_source: 'control_room_link' | 'notification' | 'direct_url' | 'plan_list' | 'ai_suggestion';
    time_since_plan_generated_ms: number | null; // null if plan is manually created
  };
}

interface PlanningAssignmentAction {
  event_type: 'interaction.planning.assignment_action';
  payload: {
    plan_id: string;
    action: 'create' | 'move' | 'delete' | 'swap';
    assignment_source: 'manual_drag_drop' | 'manual_form' | 'ai_suggested_accepted' | 'optimizer_output' | 'bulk_action';
    employee_id: string;                  // anonymized in AI pipeline
    process_id: string;
    shift_pattern_id: string;
    assignment_date: string;
    was_ai_suggested: boolean;            // true if this slot had an AI recommendation
    ai_suggestion_accepted: boolean;      // true if user accepted the AI suggestion as-is
    ai_suggestion_modified: boolean;      // true if user started from AI suggestion but changed something
    override_reason: string | null;       // user-provided reason for overriding AI
    time_since_plan_opened_ms: number;    // how long the user has been editing
  };
}

interface PlanningConstraintOverride {
  event_type: 'interaction.planning.constraint_override';
  payload: {
    plan_id: string;
    constraint_type: string;              // e.g., 'max_daily_hours', 'min_rest_between_shifts'
    constraint_id: string;
    original_value: string;               // JSON-encoded original constraint parameter
    override_value: string;               // JSON-encoded overridden value
    severity_overridden: 'hard_constraint' | 'soft_constraint' | 'warning';
    justification: string | null;         // optional free-text justification
  };
}

interface PlanningManualVsAiRatio {
  event_type: 'interaction.planning.session_summary';
  payload: {
    plan_id: string;
    session_id: string;
    total_assignments_made: number;
    manual_assignments: number;
    ai_suggested_accepted: number;
    ai_suggested_modified: number;
    ai_suggested_rejected: number;
    optimizer_assignments_kept: number;
    optimizer_assignments_changed: number;
    session_duration_ms: number;
    edits_per_minute: number;
  };
}
```

**Storage strategy**: All planning events go directly to warm storage (PostgreSQL `intelligence.user_events`) because they are immediately useful for learning. Session summaries are additionally cached in Redis for real-time dashboard metrics.

**Retention**: 1 year in PostgreSQL (planning patterns have seasonal cycles), 5 years in cold archive.

**Privacy classification**: `employee_id` in assignment actions is a **quasi-identifier** and is pseudonymized before use in ML features. `justification` free text may contain **PII** references (e.g., "Maria requested this change") -- it is flagged for PII scrubbing before ingestion into the ML pipeline.

### 1.3 Decision Events

Decision events capture moments where the user makes a choice between alternatives. These are the highest-value learning signals because they directly encode preferences.

```typescript
interface DecisionRecommendationResponse {
  event_type: 'decision.recommendation.response';
  payload: {
    recommendation_id: string;
    recommendation_type: 'assignment_suggestion' | 'rebalance_suggestion' | 'gap_fill' | 'overtime_reduction' | 'cross_training' | 'capacity_alert';
    response: 'accepted' | 'rejected' | 'modified' | 'deferred' | 'dismissed';
    confidence_shown: number;             // what confidence score was displayed to the user
    modification_details: string | null;  // if modified, what changed
    rejection_reason: string | null;      // if rejected, optional reason
    time_to_decision_ms: number;          // time from recommendation shown to user action
    recommendation_source: 'rule_based' | 'ml_model' | 'llm_insight' | 'statistical';
    model_version: string | null;         // which model version generated this
  };
}

interface DecisionScenarioComparison {
  event_type: 'decision.scenario.comparison';
  payload: {
    scenarios_compared: string[];         // scenario IDs
    scenario_selected: string | null;     // which one was chosen (null if none)
    comparison_duration_ms: number;
    metrics_viewed: string[];             // which comparison metrics the user examined
    sort_order_used: string | null;       // what metric they sorted by (reveals priority)
  };
}

interface DecisionPlanVersionSelection {
  event_type: 'decision.plan_version.selection';
  payload: {
    plan_id: string;
    version_selected: number;
    versions_available: number[];
    comparison_viewed: boolean;           // did the user compare versions before selecting?
    revert_from_version: number | null;   // if reverting, which version they came from
  };
}

interface DecisionApprovalAction {
  event_type: 'decision.approval.action';
  payload: {
    plan_id: string;
    plan_version: number;
    action: 'approved' | 'rejected' | 'returned_for_revision';
    approval_comments: string | null;
    time_reviewing_ms: number;            // time plan was open before approval action
    coverage_pct_at_approval: number;
    constraint_violations_at_approval: number;
    total_cost_at_approval: number;
    overtime_hours_at_approval: number;
  };
}
```

**Storage strategy**: Decision events are written to both warm (PostgreSQL) and hot (Redis sorted sets keyed by recommendation type) storage simultaneously. The Redis copy powers real-time recommendation scoring.

**Retention**: 2 years in PostgreSQL (decision patterns evolve slowly), 7 years in cold archive (audit requirement for approval decisions).

**Privacy classification**: `approval_comments` may contain **PII** -- flagged for scrubbing. All other fields are **non-personal** or **quasi-identifiers**.

### 1.4 Attention Events

Attention events capture where users focus their visual attention and cognitive effort. These are implicit signals -- the user does not intentionally communicate anything, but their behavior reveals priorities.

```typescript
interface AttentionHeatmapCellHover {
  event_type: 'interaction.attention.heatmap_hover';
  payload: {
    view_type: 'coverage_grid' | 'demand_timeline' | 'employee_schedule' | 'process_matrix';
    cell_coordinates: {
      row_entity_type: 'process' | 'employee' | 'shift' | 'date';
      row_entity_id: string;
      col_entity_type: 'date' | 'time_slot' | 'site' | 'process';
      col_entity_id: string;
    };
    hover_duration_ms: number;            // only captured if > 500ms (filters noise)
    cell_value: number | null;            // the metric value in the cell (coverage %, FTE count, etc.)
    cell_status: 'critical' | 'at_risk' | 'adequate' | 'over_staffed' | null;
    followed_by_action: boolean;          // did the user take an action on this cell within 10s?
  };
}

interface AttentionNotificationInteraction {
  event_type: 'interaction.attention.notification';
  payload: {
    notification_id: string;
    notification_type: string;            // maps to notification.type
    notification_severity: 'info' | 'warning' | 'critical' | 'action_required';
    action: 'opened' | 'dismissed' | 'snoozed' | 'clicked_through';
    time_to_action_ms: number;            // from notification delivery to user action
    snooze_duration_minutes: number | null;
  };
}

interface AttentionDashboardWidgetFrequency {
  event_type: 'interaction.attention.widget_frequency';
  payload: {
    widget_id: string;
    dashboard_id: string;
    view_count_session: number;
    total_view_duration_ms: number;
    interactions_count: number;           // clicks, hovers, expansions within the widget
    data_exports_from_widget: number;     // how often they export data from this widget
  };
}
```

**Storage strategy**: Attention events are high-volume and low-individual-value. They are batched client-side (every 30 seconds or on page exit) and sent as a single payload. Stored warm in PostgreSQL with aggressive 30-day retention, then aggregated into per-user attention profiles and raw events purged.

**Retention**: 30 days raw, aggregated profiles retained for 1 year.

**Privacy classification**: All fields are **non-personal**. Cell coordinates reference process/shift/date identifiers, not individuals.

### 1.5 Search and Filter Events

Search and filter events reveal what information users are looking for and how they navigate the data model.

```typescript
interface SearchQuery {
  event_type: 'interaction.search.query';
  payload: {
    search_context: 'employee_list' | 'plan_workbench' | 'global_search' | 'ai_chat' | 'skill_matrix';
    query_text: string;                   // the raw search text (PII-scrubbed before ML)
    filters_applied: FilterSpec[];
    results_count: number;
    result_selected_index: number | null; // which result they clicked (null = no selection)
    time_to_first_result_ms: number;
    query_refined: boolean;               // did they modify the query after seeing results?
  };
}

interface FilterSpec {
  field: string;                          // e.g., "skill", "site", "shift", "contract_type", "department"
  operator: 'eq' | 'in' | 'gt' | 'lt' | 'between' | 'contains';
  value: string | string[] | number[];
  position_in_sequence: number;           // 1 = first filter applied, 2 = second, etc.
}

interface SearchFilterPattern {
  event_type: 'interaction.search.filter_pattern';
  payload: {
    context: string;
    filters_sequence: FilterSpec[];       // ordered list of filters as applied
    session_filter_count: number;         // total filters applied in this session
    saved_as_preset: boolean;             // did the user save this filter combination?
    preset_name: string | null;
  };
}
```

**Storage strategy**: Warm (PostgreSQL). Filter patterns are additionally aggregated into per-user filter preference features nightly.

**Retention**: 90 days raw, 1 year aggregated.

**Privacy classification**: `query_text` may contain **PII** (e.g., employee names). It is classified as a **quasi-identifier** and scrubbed before ingestion into ML features. Filter values referencing employee IDs are pseudonymized.

### 1.6 Timing Events

Timing events measure the cadence of user behavior. Speed and rhythm encode trust, expertise, and process efficiency.

```typescript
interface TimingPlanTrustSignal {
  event_type: 'interaction.timing.plan_trust';
  payload: {
    plan_id: string;
    plan_version: number;
    time_plan_generated_to_first_view_ms: number;    // how quickly they look at a new plan
    time_first_view_to_first_edit_ms: number | null;  // null if no edits (high trust signal)
    time_first_edit_to_submission_ms: number | null;
    time_submission_to_approval_ms: number | null;
    total_editing_sessions: number;
    total_editing_duration_ms: number;
    edits_before_submission: number;                   // fewer edits = higher AI trust
  };
}

interface TimingSessionPattern {
  event_type: 'interaction.timing.session_pattern';
  payload: {
    session_start_utc: string;
    session_end_utc: string;
    session_duration_ms: number;
    local_hour_start: number;              // 0-23, user's local time
    day_of_week: number;                   // 0=Sunday, 6=Saturday
    pages_visited: number;
    actions_taken: number;
    idle_periods_count: number;            // periods > 2 min with no interaction
    idle_total_ms: number;
  };
}
```

**Storage strategy**: Warm (PostgreSQL). `plan_trust` signals are also written to Redis for real-time trust score computation.

**Retention**: 1 year (seasonal patterns require full annual cycles).

**Privacy classification**: All fields are **non-personal** (timestamps and durations only). Session start times combined with user_id could theoretically identify work patterns, classified as **quasi-identifier**.

---

## 2. System Behavior Events

System behavior events are generated by AstraPlanner's internal processes. They capture the quality and accuracy of the system's own outputs, forming the objective ground truth against which user behavior signals are calibrated.

### 2.1 Plan Quality Signals

Emitted by the Optimization Engine and Planning module after every plan generation or re-optimization.

```typescript
interface SystemPlanQuality {
  event_type: 'system.plan.quality';
  payload: {
    plan_id: string;
    plan_version: number;
    site_id: string;
    period_start: string;
    period_end: string;

    // Optimizer metrics
    solver_type: 'heuristic' | 'highs_wasm' | 'or_tools';
    solver_runtime_ms: number;
    objective_value: number;
    optimality_gap_pct: number;
    variables_count: number;
    constraints_count: number;

    // Coverage metrics
    total_demand_hours: number;
    total_assigned_hours: number;
    coverage_pct: number;
    unmet_demand_slots: number;           // count of time-process slots with zero coverage
    unmet_demand_hours: number;

    // Constraint health
    hard_constraint_violations: number;    // should always be 0 for valid plans
    soft_constraint_violations: number;
    soft_constraint_penalty_total: number;
    constraint_violation_details: {
      constraint_type: string;
      count: number;
      severity: 'hard' | 'soft';
    }[];

    // Cost metrics
    total_labor_cost: number;
    regular_hours_cost: number;
    overtime_cost: number;
    agency_cost: number;
    cross_site_cost: number;

    // Assignment composition
    total_assignments: number;
    regular_assignments: number;
    overtime_assignments: number;
    agency_assignments: number;
    cross_site_assignments: number;
  };
}
```

### 2.2 Plan-Reality Divergence

Computed daily by comparing the published plan against actual outcomes (when Time & Attendance data is available).

```typescript
interface SystemPlanRealityDivergence {
  event_type: 'system.plan.reality_divergence';
  payload: {
    plan_id: string;
    site_id: string;
    divergence_date: string;              // the date being compared

    // Headcount divergence
    planned_headcount: number;
    actual_headcount: number | null;      // null if T&A data not yet available
    headcount_delta: number | null;
    headcount_delta_pct: number | null;

    // Demand divergence (forecast accuracy)
    forecasted_demand_volume: number;
    actual_demand_volume: number | null;   // null if actual not yet known
    demand_delta: number | null;
    demand_delta_pct: number | null;
    demand_mape: number | null;            // Mean Absolute Percentage Error

    // Absence divergence
    planned_absences: number;              // expected based on leave calendar
    actual_absences: number | null;        // actual no-shows + unplanned leave
    unplanned_absence_count: number | null;
    unplanned_absence_rate: number | null;

    // Coverage divergence
    planned_coverage_pct: number;
    actual_coverage_pct: number | null;

    // Process-level breakdown
    process_divergence: {
      process_id: string;
      planned_fte: number;
      actual_fte: number | null;
      planned_demand: number;
      actual_demand: number | null;
    }[];
  };
}
```

### 2.3 Override Patterns

Captured when a user modifies an AI-generated or optimizer-generated assignment. This is a critical learning signal for understanding where the system gets it wrong.

```typescript
interface SystemOverridePattern {
  event_type: 'system.plan.override_pattern';
  payload: {
    plan_id: string;
    assignment_id: string;
    override_by_user_id: string;

    // What was changed
    original_source: 'optimizer' | 'ai_suggested' | 'rule_based';
    field_changed: 'employee' | 'process' | 'shift' | 'date' | 'deleted';
    original_value: string;               // employee_id, process_id, etc.
    new_value: string;

    // Context at time of override
    reason_provided: string | null;
    reason_category: 'employee_preference' | 'skill_mismatch' | 'schedule_conflict' |
                     'team_dynamics' | 'process_knowledge' | 'other' | 'no_reason' | null;

    // Was there an outcome to compare?
    original_predicted_quality: number | null;  // model's predicted quality for original
    override_actual_quality: number | null;     // filled in retrospectively if outcome data available
  };
}
```

### 2.4 Performance Signals

System health metrics that feed into anomaly detection and capacity planning for the AI layer itself.

```typescript
interface SystemPerformanceSignal {
  event_type: 'system.performance.metrics';
  payload: {
    metric_window_start: string;          // 5-minute window start
    metric_window_end: string;

    // Per-tenant metrics
    organization_id: string;
    api_requests_count: number;
    api_avg_latency_ms: number;
    api_p99_latency_ms: number;
    api_error_count: number;
    api_error_rate: number;

    // Solver metrics
    solver_invocations: number;
    solver_avg_runtime_ms: number;
    solver_timeout_count: number;
    solver_infeasible_count: number;

    // AI metrics
    ai_api_calls: number;
    ai_avg_latency_ms: number;
    ai_total_input_tokens: number;
    ai_total_output_tokens: number;
    ai_total_cost_usd: number;
    ai_cache_hit_rate: number;
  };
}
```

### 2.5 Demand Signals

Forecast accuracy tracking computed weekly by the demand module.

```typescript
interface SystemDemandAccuracy {
  event_type: 'system.demand.accuracy';
  payload: {
    site_id: string;
    evaluation_period_start: string;
    evaluation_period_end: string;

    // Overall accuracy
    mape: number;                          // Mean Absolute Percentage Error
    wmape: number;                         // Weighted MAPE (weighted by volume)
    bias: number;                          // systematic over/under-forecasting
    bias_direction: 'over' | 'under' | 'neutral';

    // Per-demand-type accuracy
    demand_type_accuracy: {
      demand_type_id: string;
      demand_type_name: string;
      mape: number;
      bias: number;
      volume_contribution_pct: number;     // how much of total demand this type represents
    }[];

    // Temporal patterns
    day_of_week_accuracy: {
      day: number;                         // 0-6
      mape: number;
      avg_bias: number;
    }[];

    // Anomaly frequency
    anomalies_detected: number;
    anomaly_types: {
      type: 'spike' | 'drop' | 'zero_demand' | 'seasonal_deviation';
      count: number;
    }[];

    // Seasonal pattern detection
    seasonal_index_detected: boolean;
    seasonal_period: 'weekly' | 'monthly' | 'quarterly' | 'annual' | null;
    seasonal_amplitude: number | null;     // peak-to-trough ratio
  };
}
```

**Storage for all system events**: Warm (PostgreSQL `intelligence.system_events`), with plan quality and divergence events additionally indexed in the `analytics` schema as materialized views for dashboard consumption.

**Retention**: 2 years in PostgreSQL (sufficient for multi-year trend analysis), indefinite in cold archive.

**Privacy classification**: All system events are **non-personal**. They reference entity IDs (site, plan, process) but no employee PII. User IDs in override patterns are **quasi-identifiers** used only for per-user learning, never exposed externally.

---

## 3. Event Schema Design

### 3.1 Canonical Intelligence Event Envelope

The intelligence event envelope extends the domain event envelope defined in `event-architecture.md` with fields specific to the learning pipeline. Intelligence events flow through the same Kafka infrastructure but on dedicated topics.

```typescript
interface IntelligenceEventEnvelope {
  // === Standard envelope (inherited from domain events) ===
  event_id: string;                       // UUID v7 (time-ordered)
  event_type: string;                     // taxonomy: "interaction.*", "decision.*", "system.*", "outcome.*"
  event_version: number;                  // schema version for this event type
  timestamp: string;                      // ISO-8601 UTC, microsecond precision
  organization_id: string;               // tenant partition key (always present)
  correlation_id: string;                // traces causal chains across events

  // === Intelligence-specific fields ===
  user_id: string | null;                // null for system-generated events
  session_id: string | null;             // browser session ID, null for system events
  site_id: string | null;               // null if event is org-wide (e.g., settings change)

  // Entity reference (what entity is this event about?)
  entity_type: string | null;            // 'plan' | 'assignment' | 'employee' | 'site' | 'recommendation' | null
  entity_id: string | null;

  // Payload (event-specific data, validated against event_type + event_version schema)
  payload: Record<string, unknown>;       // JSONB — specific structure per event_type

  // Client metadata (null for server-side events)
  metadata: {
    client_version: string | null;        // frontend app version (e.g., "1.14.2")
    viewport_size: string | null;         // e.g., "1920x1080"
    device_type: 'desktop' | 'tablet' | 'mobile' | null;
    browser: string | null;               // e.g., "Chrome 124"
    timezone_offset_minutes: number | null;
    connection_type: 'wifi' | 'cellular' | 'wired' | null;
  } | null;
}
```

### 3.2 Event Taxonomy

Events are organized into four top-level namespaces:

| Namespace | Purpose | Examples | Volume Profile |
|-----------|---------|----------|---------------|
| `interaction.*` | User's physical interactions with the UI | `interaction.navigation.page_view`, `interaction.planning.assignment_action`, `interaction.attention.heatmap_hover` | High volume (100-500 events/user/session) |
| `decision.*` | User's explicit choices between alternatives | `decision.recommendation.response`, `decision.approval.action`, `decision.scenario.comparison` | Low volume (5-20 events/user/session) |
| `system.*` | System-generated metrics and quality signals | `system.plan.quality`, `system.plan.reality_divergence`, `system.demand.accuracy` | Medium volume (100-1000 events/site/day) |
| `outcome.*` | Delayed outcomes linking decisions to results | `outcome.plan.coverage_achieved`, `outcome.recommendation.validated`, `outcome.override.result` | Low volume (10-50 events/site/day) |

### 3.3 Kafka Topic Structure for Intelligence Events

```
Topic: intelligence.interaction.*    (partitioned by user_id, 12 partitions)
Topic: intelligence.decision.*       (partitioned by user_id, 12 partitions)
Topic: intelligence.system.*         (partitioned by site_id, 12 partitions)
Topic: intelligence.outcome.*        (partitioned by site_id, 6 partitions)

Retention: intelligence.interaction.* = 30 days (high volume, aggregated daily)
Retention: intelligence.decision.*    = 365 days (high value, low volume)
Retention: intelligence.system.*      = 365 days (medium volume)
Retention: intelligence.outcome.*     = 365 days (essential for feedback loops)
```

### 3.4 Volume Estimates Per Tenant Per Day

Based on a mid-sized tenant with 3 sites, 500 employees, 5 active planners:

| Event Category | Estimated Events/Day | Avg Payload Size | Daily Storage |
|---------------|---------------------|-----------------|--------------|
| `interaction.navigation.*` | 2,000 | 0.5 KB | 1 MB |
| `interaction.planning.*` | 500 | 1.0 KB | 0.5 MB |
| `interaction.attention.*` | 5,000 | 0.3 KB | 1.5 MB |
| `interaction.search.*` | 200 | 0.8 KB | 0.16 MB |
| `interaction.timing.*` | 100 | 0.4 KB | 0.04 MB |
| `decision.*` | 50 | 1.2 KB | 0.06 MB |
| `system.*` | 1,000 | 2.0 KB | 2.0 MB |
| `outcome.*` | 30 | 1.5 KB | 0.05 MB |
| **Total** | **~8,880** | | **~5.3 MB** |

At 100 tenants: ~888,000 events/day, ~530 MB/day, ~16 GB/month in PostgreSQL before archival.

### 3.5 Ingestion Architecture: Batch vs Streaming

| Event Category | Ingestion Mode | Rationale |
|---------------|---------------|-----------|
| `interaction.navigation.*` | **Batched** (client-side buffer, flush every 30s or on page exit) | High volume, low urgency. Client-side batching reduces API calls by 10-20x. |
| `interaction.planning.*` | **Streaming** (immediate POST on each action) | Medium volume, needed for real-time collaboration indicators and undo tracking. |
| `interaction.attention.*` | **Batched** (client-side buffer, flush every 30s) | Highest volume, lowest urgency. Aggregated client-side before sending. |
| `interaction.search.*` | **Streaming** (debounced, 500ms after last keystroke) | Needed for real-time search suggestion improvement. |
| `interaction.timing.*` | **Batched** (sent on session end or page exit) | Computed client-side as session summaries. |
| `decision.*` | **Streaming** (immediate) | Highest value. Must be captured instantly to update recommendation scores. |
| `system.*` | **Streaming** (emitted by backend processes) | Generated server-side, written directly to Kafka and PostgreSQL. |
| `outcome.*` | **Batch** (computed by scheduled jobs) | Generated by daily/weekly batch jobs that compare plans to actuals. |

**Client-side batching implementation**:

```typescript
// Event buffer in the frontend (React context provider)
class EventBuffer {
  private buffer: IntelligenceEventEnvelope[] = [];
  private flushInterval: number = 30_000;    // 30 seconds
  private maxBufferSize: number = 100;       // flush early if buffer fills

  enqueue(event: IntelligenceEventEnvelope): void {
    this.buffer.push(event);
    if (this.buffer.length >= this.maxBufferSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    await trpc.intelligence.ingestBatch.mutate({ events: batch });
  }

  // Called on visibilitychange (tab hidden) and beforeunload
  flushSync(): void {
    if (this.buffer.length === 0) return;
    const batch = this.buffer.splice(0);
    navigator.sendBeacon('/api/intelligence/ingest', JSON.stringify({ events: batch }));
  }
}
```

---

## 4. Feature Engineering Pipeline

Raw events are not directly useful for ML models. The feature engineering pipeline transforms high-volume, sparse events into dense, meaningful features at multiple aggregation levels.

### 4.1 User-Level Features

Features computed per `user_id`, representing individual planner behavior and preferences.

| Feature Name | Computation | Source Events | Freshness | Storage |
|-------------|-------------|--------------|-----------|---------|
| `override_rate_7d` | `COUNT(overrides) / COUNT(ai_suggestions_shown)` over rolling 7 days | `decision.recommendation.response` | Real-time (Redis counter) | Redis + PostgreSQL daily snapshot |
| `override_rate_30d` | Same as above, 30-day window | Same | Daily batch | PostgreSQL materialized view |
| `avg_time_to_first_edit_ms` | `AVG(time_first_view_to_first_edit_ms)` over last 10 plans | `interaction.timing.plan_trust` | Per-plan-open | PostgreSQL |
| `preferred_planning_horizon` | Most frequent `plan_period_end - plan_period_start` range in last 20 plans opened | `interaction.planning.plan_opened` | Weekly batch | PostgreSQL |
| `shift_pattern_preference_score` | Per shift pattern, `COUNT(manual_assignments_to_pattern) / COUNT(all_manual_assignments)` | `interaction.planning.assignment_action` | Daily batch | PostgreSQL JSONB |
| `filter_sequence_fingerprint` | Most common ordered sequence of filter fields (e.g., `[skill, site, availability]`) | `interaction.search.filter_pattern` | Weekly batch | PostgreSQL JSONB |
| `ai_trust_score` | Exponential moving average: `0.9 * prev + 0.1 * (accepted ? 1 : 0)` per recommendation response | `decision.recommendation.response` | Real-time (Redis) | Redis + PostgreSQL daily snapshot |
| `session_time_preference` | Distribution of `local_hour_start` across sessions (morning/afternoon/evening planner) | `interaction.timing.session_pattern` | Weekly batch | PostgreSQL JSONB |
| `attention_process_affinity` | Which processes the user hovers over most in the coverage grid, normalized | `interaction.attention.heatmap_hover` | Daily batch | PostgreSQL JSONB |
| `edits_per_plan_trend` | Linear trend of `edits_before_submission` over last 20 plans (decreasing = growing trust) | `interaction.planning.session_summary` | Weekly batch | PostgreSQL |

### 4.2 Site-Level Features

Features computed per `site_id`, representing operational patterns and performance characteristics.

| Feature Name | Computation | Source Events | Freshness | Storage |
|-------------|-------------|--------------|-----------|---------|
| `avg_coverage_gap_pct` | `AVG(100 - coverage_pct)` from published plans, rolling 30 days | `system.plan.quality` | Daily batch | PostgreSQL materialized view |
| `absence_rate_trend` | Linear regression slope of `unplanned_absence_rate` over rolling 90 days | `system.plan.reality_divergence` | Weekly batch | PostgreSQL |
| `demand_volatility_index` | `STDDEV(actual_demand) / AVG(actual_demand)` per process, rolling 90 days | `system.demand.accuracy` | Weekly batch | PostgreSQL |
| `process_bottleneck_score` | Per process: `frequency_of_unmet_demand / total_unmet_demand_events`. Higher = more bottlenecked. | `system.plan.quality` (unmet_demand_slots) | Daily batch | PostgreSQL JSONB |
| `forecast_accuracy_by_type` | Per demand type: rolling 30-day MAPE | `system.demand.accuracy` | Weekly batch | PostgreSQL JSONB |
| `overtime_ratio_trend` | `overtime_hours / total_hours` trend over 12 weeks | `system.plan.quality` | Weekly batch | PostgreSQL |
| `planner_override_rate_site` | `COUNT(overrides) / COUNT(optimizer_assignments)` across all planners at this site | `system.plan.override_pattern` | Daily batch | PostgreSQL |
| `replan_frequency` | Number of re-optimizations per published plan, rolling 30 days | `system.plan.quality` (count per plan_id) | Daily batch | PostgreSQL |
| `avg_solver_runtime_trend` | Trend of `solver_runtime_ms` over 30 days (increasing = growing complexity) | `system.plan.quality` | Weekly batch | PostgreSQL |
| `headcount_accuracy` | `1 - ABS(planned_headcount - actual_headcount) / planned_headcount`, rolling 30 days | `system.plan.reality_divergence` | Daily batch | PostgreSQL |

### 4.3 Temporal Features

Features that capture time-dependent patterns, essential for seasonal and cyclical effects.

| Feature Name | Computation | Granularity | Storage |
|-------------|-------------|------------|---------|
| `day_of_week_effect` | Per site + process: average demand multiplier by day of week (e.g., Monday = 1.15x, Sunday = 0.7x) | Updated weekly | PostgreSQL |
| `seasonal_index` | Per site + demand type: multiplicative seasonal index by month (12 values, normalized to mean=1.0) | Updated monthly | PostgreSQL |
| `time_since_last_replan` | `NOW() - last_plan_generation_timestamp` per site | Real-time | Redis |
| `holiday_proximity` | Days until next/since last public holiday (per site's country), plus holiday type | Computed on read | Application logic |
| `pay_period_phase` | Position within the current pay period (start/mid/end, as fraction 0-1) | Computed on read | Application logic |
| `weather_season` | Binary flags for season transitions known to affect logistics (e.g., Q4 peak, summer lull) | Monthly | PostgreSQL |

### 4.4 Feature Store Design

The feature store uses two tiers to balance freshness with cost:

**Tier 1: Real-Time Features (Redis)**

For features that must be available within seconds of the underlying event.

```
Redis key patterns:
  feat:user:{org_id}:{user_id}:override_rate_7d     → float
  feat:user:{org_id}:{user_id}:ai_trust_score       → float
  feat:site:{org_id}:{site_id}:time_since_replan    → timestamp
  feat:rec:{org_id}:{recommendation_id}:score       → float (sorted set)

Updated by: Kafka consumers processing intelligence.decision.* and intelligence.system.* events
TTL: 7 days (refreshed on every update; stale features are treated as missing)
```

**Tier 2: Batch Features (PostgreSQL Materialized Views)**

For features computed on accumulated data, refreshed on schedule.

```sql
-- intelligence schema tables for the feature store

CREATE TABLE intelligence.user_features (
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL,
    feature_name        VARCHAR(100) NOT NULL,
    feature_value       JSONB NOT NULL,          -- scalar or structured (e.g., JSONB array for distributions)
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from          TIMESTAMPTZ NOT NULL,    -- feature is valid for events after this time
    valid_to            TIMESTAMPTZ,             -- null = currently valid
    model_version       VARCHAR(50),             -- which pipeline version computed this

    CONSTRAINT pk_user_features PRIMARY KEY (organization_id, user_id, feature_name, valid_from)
);

CREATE TABLE intelligence.site_features (
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    site_id             UUID NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    feature_name        VARCHAR(100) NOT NULL,
    feature_value       JSONB NOT NULL,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    valid_from          TIMESTAMPTZ NOT NULL,
    valid_to            TIMESTAMPTZ,
    model_version       VARCHAR(50),

    CONSTRAINT pk_site_features PRIMARY KEY (organization_id, site_id, feature_name, valid_from)
);

CREATE TABLE intelligence.temporal_features (
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    site_id             UUID NOT NULL REFERENCES site(id) ON DELETE CASCADE,
    feature_name        VARCHAR(100) NOT NULL,
    reference_date      DATE NOT NULL,            -- the date this feature describes
    feature_value       JSONB NOT NULL,
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT pk_temporal_features PRIMARY KEY (organization_id, site_id, feature_name, reference_date)
);

-- Enable RLS on all intelligence tables
ALTER TABLE intelligence.user_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.site_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.temporal_features ENABLE ROW LEVEL SECURITY;

CREATE POLICY uf_tenant ON intelligence.user_features
    FOR ALL USING (organization_id = auth.organization_id());
CREATE POLICY sf_tenant ON intelligence.site_features
    FOR ALL USING (organization_id = auth.organization_id());
CREATE POLICY tf_tenant ON intelligence.temporal_features
    FOR ALL USING (organization_id = auth.organization_id());

-- Indexes for feature lookup
CREATE INDEX idx_user_features_lookup
    ON intelligence.user_features (organization_id, user_id, feature_name, valid_from DESC);
CREATE INDEX idx_site_features_lookup
    ON intelligence.site_features (organization_id, site_id, feature_name, valid_from DESC);
CREATE INDEX idx_temporal_features_lookup
    ON intelligence.temporal_features (organization_id, site_id, feature_name, reference_date DESC);
```

**Feature freshness requirements**:

| Feature Category | Required Freshness | Refresh Mechanism | Staleness Handling |
|-----------------|-------------------|-------------------|-------------------|
| Real-time counters (override rate, trust score) | < 5 seconds | Kafka consumer → Redis update | Use last known value with staleness flag |
| Session-level features (session summary, trust timing) | End of session | Client flush → batch insert | Previous session's values used |
| Daily batch features (site coverage gap, absence trend) | < 24 hours | `pg_cron` at 02:00 UTC | Previous day's values used, warning logged |
| Weekly batch features (seasonal index, filter fingerprint) | < 7 days | `pg_cron` Sunday 03:00 UTC | Previous week's values used |
| Monthly features (seasonal decomposition) | < 30 days | `pg_cron` 1st of month 04:00 UTC | Previous month's values used |

---

## 5. Intelligence Event Storage Schema

The following PostgreSQL tables store the raw intelligence events before they are processed into features.

```sql
-- Create the intelligence schema
CREATE SCHEMA IF NOT EXISTS intelligence;

-- ============================================================================
-- Raw event storage (warm tier)
-- ============================================================================

CREATE TABLE intelligence.user_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    user_id             UUID NOT NULL,
    session_id          UUID,
    event_type          VARCHAR(100) NOT NULL,
    event_version       INT NOT NULL DEFAULT 1,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT now(),
    site_id             UUID,
    entity_type         VARCHAR(50),
    entity_id           UUID,
    payload             JSONB NOT NULL,
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Partition by month for efficient archival and pruning
-- (Declarative partitioning would be applied in production; shown here as single table for clarity)

CREATE INDEX idx_user_events_org_user_time
    ON intelligence.user_events (organization_id, user_id, timestamp DESC);
CREATE INDEX idx_user_events_org_type_time
    ON intelligence.user_events (organization_id, event_type, timestamp DESC);
CREATE INDEX idx_user_events_org_session
    ON intelligence.user_events (organization_id, session_id)
    WHERE session_id IS NOT NULL;
CREATE INDEX idx_user_events_org_entity
    ON intelligence.user_events (organization_id, entity_type, entity_id, timestamp DESC)
    WHERE entity_id IS NOT NULL;

-- GIN index on payload for ad-hoc queries on event-specific fields
CREATE INDEX idx_user_events_payload
    ON intelligence.user_events USING gin (payload jsonb_path_ops);

ALTER TABLE intelligence.user_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY ue_tenant ON intelligence.user_events
    FOR ALL USING (organization_id = auth.organization_id());

CREATE TABLE intelligence.system_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    event_type          VARCHAR(100) NOT NULL,
    event_version       INT NOT NULL DEFAULT 1,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT now(),
    site_id             UUID,
    entity_type         VARCHAR(50),
    entity_id           UUID,
    payload             JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_events_org_type_time
    ON intelligence.system_events (organization_id, event_type, timestamp DESC);
CREATE INDEX idx_system_events_org_site_time
    ON intelligence.system_events (organization_id, site_id, timestamp DESC)
    WHERE site_id IS NOT NULL;

ALTER TABLE intelligence.system_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY se_tenant ON intelligence.system_events
    FOR ALL USING (organization_id = auth.organization_id());

-- ============================================================================
-- Outcome events (delayed feedback linking decisions to results)
-- ============================================================================

CREATE TABLE intelligence.outcome_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    event_type          VARCHAR(100) NOT NULL,
    timestamp           TIMESTAMPTZ NOT NULL DEFAULT now(),
    site_id             UUID,

    -- Link to the original decision/recommendation
    source_event_id     UUID,                     -- the decision event this outcome relates to
    source_event_type   VARCHAR(100),

    -- Outcome data
    payload             JSONB NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_outcome_events_source
    ON intelligence.outcome_events (organization_id, source_event_id)
    WHERE source_event_id IS NOT NULL;
CREATE INDEX idx_outcome_events_org_type_time
    ON intelligence.outcome_events (organization_id, event_type, timestamp DESC);

ALTER TABLE intelligence.outcome_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY oe_tenant ON intelligence.outcome_events
    FOR ALL USING (organization_id = auth.organization_id());

-- ============================================================================
-- Archival tracking
-- ============================================================================

CREATE TABLE intelligence.archive_manifest (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     UUID NOT NULL,
    source_table        VARCHAR(100) NOT NULL,
    archive_period_start TIMESTAMPTZ NOT NULL,
    archive_period_end  TIMESTAMPTZ NOT NULL,
    record_count        BIGINT NOT NULL,
    archive_path        TEXT NOT NULL,             -- S3 path to Parquet file
    archive_size_bytes  BIGINT NOT NULL,
    archived_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified            BOOLEAN NOT NULL DEFAULT false
);
```

---

## 6. Data Capture Privacy Framework

All data capture operates under the privacy architecture defined in `ai-integration.md` and the GDPR framework in `gdpr-compliance.md`. Key principles specific to the intelligence layer:

| Principle | Implementation |
|-----------|---------------|
| **Purpose limitation** | Intelligence events are used solely for improving AstraPlanner's recommendations and planning quality. They are never sold, shared externally, or used for employee surveillance reporting. |
| **Data minimization** | Attention events (highest volume, lowest value) are aggregated into daily profiles within 30 days. Raw hover data is not retained beyond this window. |
| **PII scrubbing** | Free-text fields (`override_reason`, `approval_comments`, `query_text`) pass through a PII detection pipeline before ingestion into ML features. Detected PII is replaced with category tags (e.g., `[EMPLOYEE_NAME]`). |
| **Pseudonymization** | Employee IDs in ML features are pseudonymized per-tenant using a one-way hash salted with the organization_id. The mapping is not stored -- features reference pseudonymous IDs only. |
| **Consent** | Behavioral tracking is disclosed in the platform's terms of use. Enterprise tenants can opt out of behavioral event capture (they lose personalized recommendations but retain rule-based features). |
| **Right to erasure** | When a user is deleted, all `intelligence.user_events` for that `user_id` are purged, and all `intelligence.user_features` are deleted. Aggregated site-level features that incorporated this user's data are recomputed without them. |
| **Tenant data deletion** | When an organization is deleted (`ON DELETE CASCADE`), all intelligence data is removed from PostgreSQL. Cold archive deletion is triggered asynchronously via the archive manifest. |
