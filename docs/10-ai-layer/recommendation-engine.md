# Recommendation Engine

> The intelligence layer that transforms raw workforce data into actionable, prioritized recommendations delivered at the right moment to the right user.

---

## 1. Recommendation Taxonomy

Every recommendation the system generates falls into one of four categories. Each category contains specific recommendation types with well-defined triggers, outputs, and expected user actions.

### Category 1: Staffing Recommendations

Staffing recommendations address immediate or near-term workforce allocation decisions.

#### 1.1 Gap Filling

**Trigger:** A process-timeslot combination has fewer assigned FTEs than the demand requirement.

**Output example:**
> "Process **Picking** has a **2-FTE gap on Tuesday 14:00-18:00**. Employee **Maria Santos** (Skill Level 4, available, no overtime impact) is the best match. Second option: **Carlos Rivera** (Skill Level 3, available, would trigger 2 hrs overtime)."

**Data inputs:**
- Current plan assignments vs. demand requirements
- Employee availability calendar
- Skill matrix (employee-process-level)
- Overtime hours already accumulated this week
- Employee preference history (if available)

**Ranking criteria for candidates:**
1. Skill level for the target process (higher is better)
2. Availability (already on-site > available but off-shift > on rest day)
3. Overtime impact (no overtime > within budget > exceeds budget)
4. Fairness score (distribute extra assignments equitably)
5. Travel/zone proximity (same zone > adjacent zone > cross-site)

#### 1.2 Overstaffing Alerts

**Trigger:** A process-timeslot has more assigned FTEs than demand requires by a configurable threshold (default: 110%).

**Output example:**
> "**Packing** is **120% staffed on Wednesday 06:00-14:00** (6 FTEs assigned, 5 required). Consider moving **2 FTEs** to **Receiving** (currently at 75% coverage). Recommended: reassign **Tom Walker** and **Lisa Chen** — both have Receiving Level 3+."

**Data inputs:**
- Assignment-to-demand ratio per process-timeslot
- Under-covered processes in the same time window
- Cross-skill capabilities of overstaffed employees
- Historical reassignment acceptance patterns

#### 1.3 Absence Backfill

**Trigger:** An employee reports absent (sick call, no-show, emergency leave) and leaves a coverage gap.

**Output example:**
> "**John Martinez** called in sick for **Thursday 06:00-14:00** (assigned to **Forklift Operations**).
>
> Top 3 replacement candidates:
> | Rank | Employee | Skill Match | Availability | OT Impact | Score |
> |------|----------|-------------|--------------|-----------|-------|
> | 1 | Maria Santos | Level 4 (exact) | On rest day, willing | +4 hrs (within budget) | 92 |
> | 2 | Carlos Rivera | Level 3 | On-site, underloaded | None | 87 |
> | 3 | Agency Pool | Level 2 (est.) | Available | N/A | 61 |"

**Data inputs:**
- Absent employee's assignments for the affected period
- All employees with matching skills and availability
- Overtime budgets and accumulated hours
- Agency availability and cost rates
- Historical backfill success rates per candidate

#### 1.4 Cross-Training Suggestion

**Trigger:** A process has critically low skill coverage — fewer than a configurable minimum number of qualified employees (default: 3).

**Output example:**
> "You have only **2 employees** certified for **Hazmat Receiving**. If either is absent, the process **stops entirely**.
>
> Recommend cross-training **Employee Sarah Kim**:
> - Adjacent skill: General Receiving, Level 4
> - Training time estimate: 2 weeks (based on skill adjacency model)
> - Impact: reduces single-point-of-failure risk from 50% to 33%
> - Cost: ~40 hours training time (~$1,200 at loaded rate)"

**Data inputs:**
- Skill coverage count per process
- Skill adjacency graph (which skills transfer to which)
- Employee learning velocity (historical training completion times)
- Process criticality rating
- Training cost models

---

### Category 2: Process Improvement Recommendations

Process improvement recommendations address systemic inefficiencies that affect plan quality over time.

#### 2.1 Productivity Standard Adjustment

**Trigger:** Actual productivity consistently deviates from the planning standard by more than 10% over a rolling 4-week window.

**Output example:**
> "Actual pick rate for **Process Picking, Zone A** is consistently **12% below standard** (4-week rolling average: 83.7 lines/hr vs. standard: 95 lines/hr).
>
> Recommend adjusting standard from **95 to 84 lines/hr** to improve plan accuracy.
>
> Impact: Plans built on current standard under-allocate by ~0.7 FTE per shift. Adjusting would reduce unplanned overtime by an estimated **18 hours/week** ($540/week at OT rate)."

**Data inputs:**
- Actual vs. planned productivity per process (rolling 4-week window)
- Deviation trend (is it converging or diverging?)
- Root cause indicators (new employees, equipment changes, SKU mix shifts)

#### 2.2 Shift Pattern Optimization

**Trigger:** Demand distribution across time windows does not match the current shift pattern allocation.

**Output example:**
> "Demand analysis (13-week rolling) shows **60% of volume** arrives between **06:00-14:00**. Current shift pattern splits evenly across 3 shifts (33%/33%/33%).
>
> Recommend weighted staffing: **45% / 35% / 20%** across Shift 1 / Shift 2 / Shift 3.
>
> Projected impact:
> - Coverage improvement: +8% average (from 89% to 97%)
> - Cost reduction: -$4,200/week (reduced overstaffing on Shift 3)
> - Implementation: requires 6 employee shift changes (all within contract terms)"

**Data inputs:**
- Demand volume distribution by hour/shift (13-week rolling)
- Current shift pattern and employee assignments
- Contract constraints (guaranteed hours, shift preferences)
- Cost differentials (night shift premiums)

#### 2.3 Break Schedule Optimization

**Trigger:** Throughput data shows consistent dips correlating with synchronized break times.

**Output example:**
> "Staggering breaks by **15 minutes across zones** would eliminate the **12:00-12:30 throughput dip** (currently a 22% drop in pick rate).
>
> Proposed schedule:
> - Zone A: 11:45-12:15
> - Zone B: 12:00-12:30
> - Zone C: 12:15-12:45
>
> Estimated daily throughput gain: **+340 lines** (~2.1% daily improvement)"

**Data inputs:**
- Throughput time series at 15-minute granularity
- Current break schedules per zone
- Break duration requirements (legal, contractual)
- Zone interdependencies (downstream starvation effects)

---

### Category 3: Structural Recommendations

Structural recommendations address medium-to-long-term workforce planning decisions.

#### 3.1 Headcount Planning

**Trigger:** Demand trend analysis projects sustained coverage shortfalls beyond what existing workforce can cover, even with full availability and overtime.

**Output example:**
> "Based on **13-week demand trend**, **Site 3** needs **8 additional FTEs** by Q3 to maintain 95% coverage target.
>
> Breakdown:
> - Picking: +3 FTEs (demand up 18%)
> - Packing: +2 FTEs (demand up 12%)
> - Returns: +3 FTEs (new returns program launching Week 28)
>
> Hiring lead time estimate: 6 weeks (based on site historical data)
> Recommended action: initiate hiring process by **Week 22** at latest."

**Data inputs:**
- Demand forecast (13-week and 52-week)
- Current headcount and attrition projections
- Skill distribution of current workforce
- Historical hiring lead times
- Seasonal patterns from prior years

#### 3.2 Skill Investment ROI

**Trigger:** Periodic analysis (weekly) identifies skill gaps where cross-training investment yields measurable cost savings.

**Output example:**
> "**ROI analysis:** Cross-training **5 employees** in **Returns Processing** would reduce agency spend by **$12,000/month**.
>
> | Metric | Current | After Training |
> |--------|---------|----------------|
> | Returns-qualified employees | 4 | 9 |
> | Agency hours/month (Returns) | 320 | 40 |
> | Agency cost/month | $14,400 | $1,800 |
> | Training investment | — | $6,000 (one-time) |
> | **Payback period** | — | **18 days** |"

**Data inputs:**
- Agency spend per process per month
- Agency vs. internal cost differential
- Skill gap severity per process
- Training cost estimates (time, materials, productivity loss during training)
- Employee suitability scores (who can learn this fastest)

#### 3.3 Site Comparison

**Trigger:** Available on-demand and in weekly digest for multi-site tenants.

**Output example:**
> "**Site 7** achieves **3% higher coverage** at **8% lower cost per FTE-hour** than **Site 12**.
>
> Key drivers:
> - Cross-training rate: 40% vs. 24% (Site 7 has more flexible workforce)
> - Overtime ratio: 5.2% vs. 9.1% (Site 7 plans more accurately)
> - Agency dependency: 3% vs. 11% (Site 7's skill depth reduces agency need)
>
> Recommendation: Apply Site 7's cross-training program to Site 12. Estimated annual savings: **$156,000**."

**Data inputs:**
- Per-site KPIs: coverage %, cost per FTE-hour, overtime ratio, agency ratio
- Cross-training penetration rates
- Plan accuracy (planned vs. actual)
- Employee satisfaction proxies (turnover rate, absence rate)

---

### Category 4: Operational Alerts

Operational alerts flag risks that require attention but may not have a single clear recommended action.

#### 4.1 Risk Warnings

**Trigger:** Upcoming events that will reduce operational capacity if not addressed.

**Output example:**
> "**3 forklift certifications** expire next month (Employees: J. Martinez 03/15, S. Kim 03/22, T. Walker 03/28). If not renewed, **Receiving capacity drops by 30%**.
>
> Action required: Schedule recertification. Nearest available training slot: March 10 (vendor confirmed 3 slots available)."

**Data inputs:**
- Certification expiry dates
- Process-certification mapping
- Capacity impact analysis (what happens if certification lapses)
- Training/recertification vendor availability

#### 4.2 Demand Anomaly Detection

**Trigger:** Incoming forecast deviates from seasonal norms by more than a configurable threshold (default: 25%).

**Output example:**
> "Next week's forecast is **35% above seasonal norm** (projected: 142,000 lines vs. seasonal expectation: 105,000 lines).
>
> Possible causes: promotional event, seasonal shift, data error.
>
> **Verify with demand planning team before generating plan.** If accurate, you will need approximately **12 additional FTEs** to maintain coverage targets."

**Data inputs:**
- Incoming demand forecast
- Historical seasonal baselines (same week, prior 2 years)
- Known promotional/event calendar
- Statistical anomaly detection (z-score > 2.0)

#### 4.3 Compliance Risk Detection

**Trigger:** Current or projected plan state creates legal or contractual compliance violations.

**Output example:**
> "Current plan has **4 employees at 47.5 weekly hours**. Any overtime pushes them past the **48-hour EU Working Time Directive limit**.
>
> At-risk employees:
> | Employee | Planned Hours | Buffer to Limit |
> |----------|---------------|-----------------|
> | Maria Santos | 47.5 | 0.5 hrs |
> | Carlos Rivera | 47.0 | 1.0 hrs |
> | Tom Walker | 47.5 | 0.5 hrs |
> | Lisa Chen | 47.0 | 1.0 hrs |
>
> Recommendation: Redistribute 6 hours across employees with capacity (avg. planned hours for site: 38.2)."

**Data inputs:**
- Planned hours per employee per week
- Legal working hour limits (jurisdiction-dependent)
- Contractual maximum hours
- Accumulated hours year-to-date (for annual limits)
- Rest period requirements (11 hours between shifts in EU)

---

## 2. Recommendation Generation Pipeline

The pipeline runs continuously, processing data changes and producing ranked, personalized recommendations.

```
┌──────────┐    ┌───────────┐    ┌──────────┐    ┌────────────┐    ┌─────────┐    ┌─────────────────┐    ┌──────────┐
│  Signal  │───>│ Candidate │───>│ Filtering│───>│ Enrichment │───>│ Ranking │───>│ Personalization │───>│ Delivery │
│ Detection│    │ Generation│    │          │    │            │    │         │    │                 │    │          │
└──────────┘    └───────────┘    └──────────┘    └────────────┘    └─────────┘    └─────────────────┘    └──────────┘
```

### Step 1: Signal Detection

Continuous monitoring of data streams for recommendation triggers.

**Data streams monitored:**

| Stream | Polling Interval | Trigger Conditions |
|--------|------------------|--------------------|
| Plan assignments vs. demand | On plan change, on demand change | Gap > 0 or surplus > threshold |
| Employee availability | Real-time (event-driven) | Absence reported, availability changed |
| Skill matrix changes | On update | Coverage count drops below minimum |
| Certification registry | Daily | Expiry within configurable window (default: 30 days) |
| Productivity actuals | Daily (end of shift) | Deviation from standard > 10% (4-week rolling) |
| Demand forecast | On forecast upload | Anomaly score > 2.0 (z-score) |
| Hours accumulation | On plan change | Employee within 90% of legal limit |

**Implementation:**

Signals are detected via a combination of:
- **Database triggers** (PostgreSQL `NOTIFY`/`LISTEN`) for real-time data changes
- **Scheduled jobs** (pg_cron) for periodic analysis (daily, weekly)
- **Edge Function webhooks** for external data ingestion (demand forecast uploads)

Each signal is written to the `intelligence.signals` queue table:

```sql
CREATE TABLE intelligence.signals (
    signal_id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id),
    site_id         UUID REFERENCES sites(site_id),
    signal_type     TEXT NOT NULL,       -- e.g., 'coverage_gap', 'absence_reported', 'cert_expiring'
    signal_data     JSONB NOT NULL,      -- type-specific payload
    detected_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at    TIMESTAMPTZ,         -- null until candidate generation picks it up
    expires_at      TIMESTAMPTZ,         -- signals become stale
    CONSTRAINT fk_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(tenant_id)
);

CREATE INDEX idx_signals_unprocessed
    ON intelligence.signals (tenant_id, detected_at)
    WHERE processed_at IS NULL;

-- Enable RLS
ALTER TABLE intelligence.signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY signals_tenant_isolation ON intelligence.signals
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

### Step 2: Candidate Generation

For each signal, the system generates one or more candidate recommendations.

**Signal-to-recommendation mapping:**

| Signal Type | Recommendation Types Generated |
|-------------|-------------------------------|
| `coverage_gap` | Gap filling (one per viable candidate employee, max 5) |
| `overstaffing` | Overstaffing alert (one per overstaffed process-timeslot) |
| `absence_reported` | Absence backfill (one recommendation with ranked candidates) |
| `skill_coverage_low` | Cross-training suggestion (one per suggested trainee) |
| `productivity_deviation` | Productivity standard adjustment (one per process) |
| `demand_distribution_mismatch` | Shift pattern optimization (one per site) |
| `throughput_dip` | Break schedule optimization (one per zone group) |
| `demand_trend` | Headcount planning (one per site, quarterly) |
| `agency_spend_high` | Skill investment ROI (one per process with high agency use) |
| `cert_expiring` | Risk warning (one per batch of expiring certifications) |
| `demand_anomaly` | Demand anomaly alert (one per forecast period) |
| `hours_near_limit` | Compliance risk alert (one per batch of at-risk employees) |

**Candidate generation is deterministic** — given the same signal and data state, it produces the same candidates. This ensures reproducibility and testability.

### Step 3: Filtering

Remove candidates that should not be delivered.

**Filter rules (applied in order):**

1. **Duplicate suppression:** If an equivalent recommendation (same type, same entity, same action) already exists in `delivered` or `seen` status, skip unless the underlying data has materially changed (configurable delta threshold per type).
2. **Staleness check:** If the signal's `expires_at` has passed, discard.
3. **Confidence threshold:** Discard candidates with confidence score below the minimum (default: 0.4 on a 0-1 scale).
4. **Dismiss memory:** If the user previously dismissed an equivalent recommendation and the underlying conditions have not changed, suppress for a configurable cooldown period (default: 7 days).
5. **Plan state filter:** Some recommendations only apply in certain plan states (e.g., gap-filling is irrelevant for a Published plan unless re-optimization is enabled).
6. **Capacity filter:** If the user has already received the maximum recommendations for this session (default: 5 active), queue lower-priority candidates for next session or digest.

### Step 4: Enrichment

Add context to each surviving candidate to make it actionable.

**Enrichment dimensions:**

| Dimension | Description | Example |
|-----------|-------------|---------|
| **Why this matters** | Business impact in concrete terms | "This gap means 340 fewer lines picked, delaying 12 shipments" |
| **Confidence explanation** | Why we are this confident (or not) | "Based on 8 weeks of data, prediction accuracy for this pattern is 91%" |
| **Impact quantification** | Numerical impact estimate | "Estimated cost savings: $450/day" |
| **Action options** | Concrete steps the user can take | "[Assign Maria] [See alternatives] [Dismiss]" |
| **Related recommendations** | Links to related recommendations | "See also: Overstaffing alert for Packing (could source FTEs from there)" |
| **Historical context** | What happened last time | "Similar gap occurred Week 12 — resolved by overtime (cost: $680)" |

### Step 5: Ranking

Score each recommendation using a weighted multi-factor formula.

**Scoring formula:**

```
recommendation_score = impact_weight * impact + urgency_weight * urgency + confidence_weight * confidence + relevance_weight * relevance
```

**Factor definitions (each scored 0.0 to 1.0):**

| Factor | 0.0 (lowest) | 0.5 (moderate) | 1.0 (highest) |
|--------|---------------|-----------------|----------------|
| **Impact** | Cosmetic improvement, < $50/week | Moderate efficiency gain, $50-500/week | Critical coverage/compliance, > $500/week |
| **Urgency** | Structural, can wait weeks | Should act within 3-5 days | Must act within 24 hours |
| **Confidence** | Sparse data, < 60% prediction accuracy | Moderate data, 60-85% accuracy | Rich data, > 85% accuracy |
| **Relevance** | User has never acted on this type | User sometimes engages | User consistently acts on this type |

**Default weights (configurable per tenant):**

| Weight | Default Value | Rationale |
|--------|---------------|-----------|
| `impact_weight` | 0.35 | Impact matters most for business value |
| `urgency_weight` | 0.30 | Time-sensitive items need priority |
| `confidence_weight` | 0.20 | Low-confidence recommendations waste user time |
| `relevance_weight` | 0.15 | Personalization is a refinement, not a primary driver |

**Example calculation:**

> Gap filling recommendation for Picking on Tuesday:
> - Impact: 0.8 (significant coverage gap, ~$400/day revenue risk)
> - Urgency: 0.9 (gap is for tomorrow)
> - Confidence: 0.85 (strong skill match data, verified availability)
> - Relevance: 0.7 (this planner acts on gap recommendations 70% of the time)
>
> Score = 0.35 * 0.8 + 0.30 * 0.9 + 0.20 * 0.85 + 0.15 * 0.7
>        = 0.280 + 0.270 + 0.170 + 0.105
>        = **0.825**

### Step 6: Personalization

Re-rank based on the individual user's behavioral model.

**User model attributes:**

| Attribute | How It's Built | Effect on Ranking |
|-----------|----------------|-------------------|
| **Category affinity** | Track accept/dismiss ratio per recommendation category | Boost categories with > 50% acceptance; dampen categories with < 20% acceptance |
| **Time-of-day preference** | Track when user most often acts on recommendations | Delay delivery to preferred action windows |
| **Detail preference** | Track whether user expands details or acts on summary | Adjust enrichment verbosity |
| **Scope preference** | Track whether user acts on own-site vs. cross-site recommendations | Filter or dampen out-of-scope recommendations |
| **Action speed** | Track time from delivery to action | Fast actors get more real-time recommendations; deliberate users get digest format |

**User model storage:**

```sql
CREATE TABLE intelligence.user_recommendation_profile (
    user_id             UUID PRIMARY KEY REFERENCES auth.users(id),
    tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id),
    category_affinities JSONB NOT NULL DEFAULT '{}',
        -- e.g., {"staffing": 0.82, "process_improvement": 0.45, "structural": 0.30, "operational_alerts": 0.91}
    preferred_hours     INT[] DEFAULT ARRAY[8,9,10,11,14,15],  -- hours (UTC) when user is most active
    detail_level        TEXT NOT NULL DEFAULT 'standard',       -- 'minimal' | 'standard' | 'detailed'
    scope_preference    TEXT NOT NULL DEFAULT 'own_site',       -- 'own_site' | 'multi_site' | 'all'
    avg_action_time_sec INT,                                     -- average seconds from seen to acted_on
    fatigue_score       NUMERIC(3,2) DEFAULT 0.00,              -- 0.00 = fresh, 1.00 = fatigued
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE intelligence.user_recommendation_profile ENABLE ROW LEVEL SECURITY;
```

### Step 7: Delivery

Determine timing and channel for each recommendation.

**Delivery channels:**

| Channel | Use Case | Format |
|---------|----------|--------|
| **In-app banner** | High-urgency, immediate action needed | Toast notification with action button |
| **Contextual inline** | Relevant to entity user is currently viewing | Embedded card within the entity view |
| **Control Room widget** | Session-start overview | Prioritized list in the Control Room dashboard |
| **Email digest** | Non-urgent structural recommendations | Weekly summary email (Monday morning) |
| **Push notification** | Critical alerts when user is not in-app | Mobile/desktop push (opt-in only) |

**Channel selection logic:**

```
IF urgency >= 0.8 AND user_is_online:
    channel = 'in_app_banner'
ELIF urgency >= 0.8 AND NOT user_is_online:
    channel = 'push_notification'
ELIF recommendation is contextual AND user is viewing related entity:
    channel = 'contextual_inline'
ELIF urgency >= 0.4:
    channel = 'control_room_widget'
ELSE:
    channel = 'email_digest'
```

---

## 3. Timing Intelligence

### When to Show Recommendations

#### IMMEDIATE (urgency >= 0.8)

Delivered as soon as generated, regardless of user activity.

- Safety or compliance risks (working hour violations, missing certifications for active assignments)
- Critical coverage gaps for today or tomorrow (gap in a process with no buffer)
- Absence backfill when the absence is for the current or next shift

#### SESSION-START (urgency 0.4 - 0.8)

Delivered when the user logs in or opens the planning view.

- Coverage gaps for the upcoming planning period
- Pending plan issues that need resolution before publication
- New recommendations since last session

#### CONTEXTUAL (any urgency)

Delivered inline when the user is viewing the relevant entity.

- Skill gap recommendation shown when viewing the process detail page
- Overstaffing alert shown when viewing the shift timeline
- Employee cross-training suggestion shown on the employee profile
- Productivity adjustment shown on the process configuration page

#### DIGEST (urgency < 0.4)

Aggregated and delivered on a schedule (default: weekly on Monday at 08:00 local time).

- Structural recommendations (headcount planning, skill investment ROI)
- Site comparison insights
- Trend summaries (coverage trend, overtime trend, agency spend trend)

### When NOT to Show Recommendations

**Active editing protection:**
- If the user is in the middle of a drag-and-drop assignment sequence (detected via UI state), queue all non-critical recommendations until the edit sequence completes.
- If the user has made more than 3 unsaved changes in the current session, suppress non-critical banners.

**Dismiss memory:**
- If a recommendation has been dismissed and the underlying conditions have not materially changed (same gap, same magnitude within 10%), suppress for 7 days.
- If dismissed with reason "not relevant," suppress for 30 days.
- If dismissed with reason "already handled," verify by checking if the condition actually resolved. If it did, suppress permanently. If not, re-deliver after 3 days with updated context.

**Attention budget management:**
- Maximum **5 active recommendations** per session (across all channels except digest).
- If the budget is exhausted, new recommendations queue for the next session unless urgency >= 0.9 (safety/compliance override).
- Budget resets when the user starts a new session (> 30 minutes of inactivity).

### Recommendation Fatigue Management

**Monitoring metrics:**
- Accept/dismiss ratio per user (rolling 30-day window)
- Time-to-action (are recommendations being acted on quickly or sitting?)
- Recommendation volume delivered per user per week

**Fatigue response thresholds:**

| Accept/Dismiss Ratio | System Response |
|-----------------------|-----------------|
| > 50% | Healthy. Maintain current volume. |
| 30% - 50% | Caution. Reduce volume by 25%. Increase confidence threshold to 0.5. |
| 20% - 30% | Warning. Reduce volume by 50%. Only deliver urgency >= 0.6. |
| < 20% | Critical. Reduce to max 2 per session. Only deliver urgency >= 0.8. Review recommendation quality. |

**Recovery:** If ratio improves above the threshold for 2 consecutive weeks, restore the previous volume level.

---

## 4. Recommendation Data Model

### Core Table: `intelligence.recommendations`

```sql
CREATE TABLE intelligence.recommendations (
    recommendation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    site_id             UUID,                                   -- null for cross-site recommendations
    plan_id             UUID,                                   -- null if not plan-specific

    -- Classification
    category            TEXT NOT NULL,                           -- 'staffing' | 'process_improvement' | 'structural' | 'operational_alert'
    rec_type            TEXT NOT NULL,                           -- 'gap_filling' | 'overstaffing' | 'absence_backfill' | ... (see taxonomy)
    priority            TEXT NOT NULL DEFAULT 'medium',          -- 'critical' | 'high' | 'medium' | 'low'

    -- Content
    title               TEXT NOT NULL,                           -- Short summary (< 120 chars)
    description         TEXT NOT NULL,                           -- Full explanation with context
    impact_summary      TEXT,                                    -- One-line impact statement
    action_options      JSONB NOT NULL DEFAULT '[]',             -- Array of {action_id, label, action_type, payload}
    related_entity_type TEXT,                                    -- 'process' | 'employee' | 'plan' | 'site'
    related_entity_id   UUID,                                    -- ID of the primary related entity
    supporting_data     JSONB NOT NULL DEFAULT '{}',             -- All data backing the recommendation

    -- Scoring
    impact_score        NUMERIC(4,3) NOT NULL,                   -- 0.000 - 1.000
    urgency_score       NUMERIC(4,3) NOT NULL,                   -- 0.000 - 1.000
    confidence_score    NUMERIC(4,3) NOT NULL,                   -- 0.000 - 1.000
    relevance_score     NUMERIC(4,3),                            -- 0.000 - 1.000 (set during personalization)
    composite_score     NUMERIC(4,3),                            -- Computed weighted score

    -- Lifecycle
    status              TEXT NOT NULL DEFAULT 'generated',
        -- 'generated' | 'delivered' | 'seen' | 'acted_on' | 'dismissed' | 'expired' | 'superseded'
    target_user_id      UUID,                                    -- null = any eligible user for this site
    delivery_channel     TEXT,                                    -- 'in_app_banner' | 'contextual_inline' | 'control_room_widget' | 'email_digest' | 'push_notification'
    delivery_timing     TEXT NOT NULL DEFAULT 'session_start',   -- 'immediate' | 'session_start' | 'contextual' | 'digest'

    -- Provenance
    source_signal_id    UUID REFERENCES intelligence.signals(signal_id),
    generation_model    TEXT NOT NULL DEFAULT 'rule_engine',      -- 'rule_engine' | 'ml_model' | 'claude_api'
    generation_version  TEXT NOT NULL,                            -- Version of the generation logic

    -- Timestamps
    generated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at        TIMESTAMPTZ,
    seen_at             TIMESTAMPTZ,
    acted_on_at         TIMESTAMPTZ,
    dismissed_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ NOT NULL,                     -- Recommendation becomes stale

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('generated', 'delivered', 'seen', 'acted_on', 'dismissed', 'expired', 'superseded')),
    CONSTRAINT valid_category CHECK (category IN ('staffing', 'process_improvement', 'structural', 'operational_alert')),
    CONSTRAINT valid_priority CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    CONSTRAINT valid_delivery_timing CHECK (delivery_timing IN ('immediate', 'session_start', 'contextual', 'digest')),
    CONSTRAINT scores_in_range CHECK (
        impact_score BETWEEN 0 AND 1
        AND urgency_score BETWEEN 0 AND 1
        AND confidence_score BETWEEN 0 AND 1
        AND (relevance_score IS NULL OR relevance_score BETWEEN 0 AND 1)
        AND (composite_score IS NULL OR composite_score BETWEEN 0 AND 1)
    )
);

-- Performance indexes
CREATE INDEX idx_rec_tenant_status ON intelligence.recommendations (tenant_id, status, composite_score DESC);
CREATE INDEX idx_rec_target_user ON intelligence.recommendations (target_user_id, status, delivery_timing);
CREATE INDEX idx_rec_site_category ON intelligence.recommendations (site_id, category, status);
CREATE INDEX idx_rec_entity ON intelligence.recommendations (related_entity_type, related_entity_id) WHERE status IN ('delivered', 'seen');
CREATE INDEX idx_rec_expiry ON intelligence.recommendations (expires_at) WHERE status IN ('generated', 'delivered', 'seen');

-- RLS
ALTER TABLE intelligence.recommendations ENABLE ROW LEVEL SECURITY;

CREATE POLICY rec_tenant_isolation ON intelligence.recommendations
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);

CREATE POLICY rec_user_visibility ON intelligence.recommendations
    FOR SELECT
    USING (
        target_user_id IS NULL  -- broadcast to all site users
        OR target_user_id = current_setting('app.current_user_id')::UUID
    );
```

### Feedback Table: `intelligence.recommendation_feedback`

```sql
CREATE TABLE intelligence.recommendation_feedback (
    feedback_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recommendation_id   UUID NOT NULL REFERENCES intelligence.recommendations(recommendation_id),
    user_id             UUID NOT NULL REFERENCES auth.users(id),
    tenant_id           UUID NOT NULL,

    -- Feedback
    action_taken        TEXT NOT NULL,                           -- 'accepted' | 'modified_and_accepted' | 'dismissed' | 'deferred'
    dismiss_reason      TEXT,
        -- 'not_relevant' | 'already_handled' | 'disagree' | 'timing_wrong' | 'too_low_confidence' | 'other'
    dismiss_comment     TEXT,                                    -- Free-text explanation (optional)
    modification_diff   JSONB,                                   -- If modified, what was changed from the suggestion

    -- Context
    action_selected     TEXT,                                    -- Which action_option was chosen (action_id)
    time_to_action_sec  INT,                                     -- Seconds from 'seen' to this feedback
    session_id          UUID,                                    -- Link to the user session

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT valid_action CHECK (action_taken IN ('accepted', 'modified_and_accepted', 'dismissed', 'deferred')),
    CONSTRAINT valid_dismiss_reason CHECK (
        dismiss_reason IS NULL
        OR dismiss_reason IN ('not_relevant', 'already_handled', 'disagree', 'timing_wrong', 'too_low_confidence', 'other')
    )
);

CREATE INDEX idx_feedback_rec ON intelligence.recommendation_feedback (recommendation_id);
CREATE INDEX idx_feedback_user ON intelligence.recommendation_feedback (user_id, created_at DESC);

ALTER TABLE intelligence.recommendation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_tenant_isolation ON intelligence.recommendation_feedback
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

### Status Lifecycle

```
                    ┌─────────────┐
                    │  generated  │
                    └──────┬──────┘
                           │ (delivery engine sends to user)
                    ┌──────▼──────┐
                    │  delivered  │
                    └──────┬──────┘
                           │ (user sees it in UI)
                    ┌──────▼──────┐
                    │    seen     │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼───────┐ ┌──▼──────┐
       │  acted_on   │ │dismissed │ │ expired │
       └─────────────┘ └──────────┘ └─────────┘

  Additionally:
  - Any status can transition to 'superseded' if a newer
    recommendation for the same entity/type is generated
  - 'generated' transitions to 'expired' if expires_at passes
    before delivery
```

### Expiration Job

```sql
-- Run via pg_cron every 15 minutes
UPDATE intelligence.recommendations
SET status = 'expired'
WHERE status IN ('generated', 'delivered', 'seen')
  AND expires_at < now();
```

### Supersession Logic

When a new recommendation is generated for the same `(site_id, rec_type, related_entity_type, related_entity_id)`, any existing recommendation in status `generated` or `delivered` is marked as `superseded`. Recommendations in `seen` status are left active (the user is already looking at it) but flagged with `superseded_by` pointing to the new recommendation ID.

```sql
ALTER TABLE intelligence.recommendations
    ADD COLUMN superseded_by UUID REFERENCES intelligence.recommendations(recommendation_id);
```
