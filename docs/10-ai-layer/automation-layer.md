# Automation Layer

> A progressive autonomy framework that allows the system to earn the right to act on behalf of users, with hard safety boundaries and instant human override at every level.

---

## 1. Automation Spectrum

AstraPlanner defines five levels of automation, inspired by the SAE driving automation levels. Each level represents a different balance between human control and system autonomy.

### Level 0: Manual (Information Only)

The system provides information. The user makes all decisions and takes all actions.

**System behavior:** Display data, highlight patterns, show metrics. No suggested actions.

**Example:**
> Coverage heatmap shows a gap in Picking on Tuesday afternoon. The heatmap cell is colored red. No suggestion is made — the user must interpret the data and decide what to do.

**User experience:** Full cognitive load on the user. Appropriate for complex, novel, or high-stakes situations where the system lacks sufficient context.

**UI indicator:** No automation badge. Standard data displays.

---

### Level 1: Suggestion (Recommend, User Accepts)

The system recommends a specific action. The user must explicitly accept, modify, or reject the suggestion.

**System behavior:** Analyze the situation, generate a recommendation, present it with supporting rationale and clear action buttons.

**Example:**
> "Assign **Employee Maria Santos** to **Picking 14:00-18:00 Tuesday**.
> Rationale: Skill Level 4, available, no overtime impact.
>
> **[Accept]** **[Modify]** **[Reject]**"

**User experience:** Reduced cognitive load — the user evaluates a proposed solution rather than generating one from scratch. Full control retained.

**UI indicator:** `💡 Suggestion` badge on the recommendation card.

---

### Level 2: Assisted Execution (Prepared Action, One-Click Confirm)

The system prepares the action in full (including resolving all details) and presents it for one-click confirmation. The user reviews a fully formed change set.

**System behavior:** Detect the issue, generate the optimal action, pre-fill all parameters, present as a ready-to-apply change.

**Example:**
> "**3 gaps detected** for Wednesday morning. We've prepared optimal backfills:
>
> | Gap | Proposed Assignment | Skill Match | OT Impact |
> |-----|---------------------|-------------|-----------|
> | Picking 06:00-10:00 | Maria Santos (L4) | Exact | None |
> | Packing 06:00-14:00 | Carlos Rivera (L3) | Adequate | +2 hrs |
> | Receiving 10:00-14:00 | Tom Walker (L4) | Exact | None |
>
> **[Apply All]** **[Review Each]** **[Dismiss]**"

**User experience:** Minimal effort to act — one click applies all changes. The user can drill into each change if desired. Significantly faster than manual planning.

**UI indicator:** `⚡ Ready to Apply` badge.

---

### Level 3: Supervised Automation (Act, Notify, Undo Window)

The system acts automatically when the trigger condition is met. The user is notified and can undo the action within a configurable time window.

**System behavior:** Detect the trigger, execute the optimal action immediately, notify the user, provide a prominent undo button with a countdown timer.

**Example:**
> "**Absence detected** for John Martinez (Forklift Operations, Thursday 06:00-14:00).
> **Maria Santos has been auto-assigned** as replacement (Skill Level 4, available).
>
> ⏱️ Undo within **30 minutes** (expires 08:45)
>
> **[Undo]** **[View Details]**"

**User experience:** The user is freed from routine decisions but retains full override capability. The undo window provides a safety net.

**UI indicator:** `🤖 Auto-Applied` badge with undo countdown.

---

### Level 4: Full Automation (Act Silently, Audit Log Only)

The system acts without notification for routine, low-risk decisions. The user sees results in the audit log and periodic summaries.

**System behavior:** Detect the trigger, execute the action, log it. No notification unless the action is part of a batch summary.

**Example:**
> Audit log entry:
> ```
> [2026-03-20 06:15:03] AUTO: Demand updated for Week 13.
> Plan automatically re-optimized. Coverage maintained at 97%.
> Changes: 4 assignments adjusted (net FTE change: 0).
> Autonomy level: L4 (earned). Confidence: 0.96.
> ```

**User experience:** Zero cognitive load for routine operations. The user trusts the system to handle well-understood patterns. Full audit trail available for review.

**UI indicator:** Entries appear in `Automation Activity` panel in Control Room with `🔄 Auto-Handled` badge.

---

## 2. Automation Eligibility

Not every action type can reach every automation level. The eligibility matrix defines the maximum level each action type can achieve, regardless of earned autonomy.

### Eligibility Matrix

| Action Type | Max Level | Rationale |
|-------------|-----------|-----------|
| Absence backfill (single employee) | Level 3 | Low risk, high urgency, clear best action. Single employee affected. Easy to undo. |
| Demand-triggered re-optimization | Level 3 | Medium risk — changes multiple assignments but within solver constraints. All changes are solver-validated. |
| Overtime approval | Level 1 | Legal and financial implications. Overtime triggers pay premiums and may violate working time regulations. Always requires human judgment. |
| Shift pattern change | Level 1 | Structural change affecting many employees' schedules. Contractual implications (guaranteed hours, preferences). Requires stakeholder discussion. |
| Cross-site employee transfer | Level 1 | Contractual, logistical, and sometimes legal implications (different jurisdictions). Requires coordination across site managers. |
| Productivity standard adjustment | Level 2 | Data-driven decision with clear statistical backing. However, affects all future plans for the process, so should be reviewed before applying. |
| Certification expiry alert | Level 4 | Purely informational — the alert itself carries no action risk. Generating and delivering the alert is always safe. |
| New employee onboarding assignment | Level 2 | Needs supervision pairing, training considerations, and workload ramping. System can propose but human should confirm. |
| Plan publication | Level 0 | **Always requires human decision.** Legal implications — a published plan is a commitment to employees. No automation permitted. |
| Break schedule adjustment | Level 2 | Affects employee experience. Operationally low-risk but employee relations matter. |
| Agency staff request | Level 2 | Financial commitment (agency rates). System can prepare the request; human approves the spend. |
| Intra-site zone reassignment | Level 3 | Low risk — employee stays on same site, same shift. Skill-validated by system. Easy to undo. |
| Demand anomaly escalation | Level 4 | Informational alert only. No action is taken — the system flags the anomaly for human review. |

### Eligibility Override

Tenant administrators can lower the maximum automation level for any action type but can never raise it above the system-defined ceiling.

```sql
CREATE TABLE intelligence.automation_eligibility_overrides (
    override_id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id),
    site_id         UUID REFERENCES sites(site_id),       -- null = tenant-wide
    action_type     TEXT NOT NULL,
    max_level       INT NOT NULL CHECK (max_level BETWEEN 0 AND 4),
    system_ceiling  INT NOT NULL CHECK (system_ceiling BETWEEN 0 AND 4),
    set_by          UUID NOT NULL REFERENCES auth.users(id),
    set_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason          TEXT,

    CONSTRAINT level_within_ceiling CHECK (max_level <= system_ceiling),
    CONSTRAINT unique_override UNIQUE (tenant_id, site_id, action_type)
);

ALTER TABLE intelligence.automation_eligibility_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY override_tenant_isolation ON intelligence.automation_eligibility_overrides
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

---

## 3. Earned Autonomy Model

Autonomy is not granted globally. It is earned **per action type, per site, per user scope** through demonstrated accuracy and outcome quality.

### Core Principle

> The system must prove it can be trusted for a specific type of decision in a specific context before it is allowed to act with greater independence.

### Autonomy Dimensions

Autonomy is tracked along three dimensions:

- **Action type:** Each action type earns autonomy independently. Being good at absence backfill does not grant autonomy for shift pattern changes.
- **Site:** Each site earns autonomy independently. A well-established site with rich data may reach Level 3, while a new site stays at Level 1.
- **User scope:** Autonomy is earned relative to the users who will be affected. An admin may grant broader autonomy than a planner.

### Earning Criteria

| Criterion | Description | Measurement |
|-----------|-------------|-------------|
| **Accuracy** | Percentage of system suggestions accepted by users (with or without modification) | `accepted_count / (accepted_count + rejected_count)` over rolling window |
| **Volume** | Minimum number of suggestions evaluated | Count of feedback events (accepted + rejected) |
| **Recency** | Recent performance weighted more heavily than historical | Exponential decay with half-life of 30 days |
| **Outcome quality** | When the system acted (or its suggestion was accepted), did the outcome meet operational targets? | Compare actual KPIs (coverage, cost, compliance) to targets for periods where the system's recommendation was followed |

### Earning Thresholds

| Transition | Acceptance Rate | Minimum Volume | Outcome Quality | Additional Conditions |
|------------|-----------------|----------------|-----------------|----------------------|
| Level 0 → Level 1 | Always available | — | — | Default starting state for all action types |
| Level 1 → Level 2 | > 70% | 20+ suggestions evaluated | — | Site must have > 4 weeks of operational data |
| Level 2 → Level 3 | > 85% | 50+ suggestions evaluated | Outcomes within 5% of human-made decisions | No compliance violations in last 14 days |
| Level 3 → Level 4 | > 95% | 100+ suggestions evaluated | Outcomes within 2% of human-made decisions | Zero adverse outcomes in last 30 days. Action type max level must be 4. |

**Recency weighting:**

Suggestions from the last 7 days count 4x. Suggestions from the last 30 days count 2x. Suggestions older than 30 days count 1x. Suggestions older than 90 days are excluded.

### Demotion Triggers

Autonomy can be reduced (demoted) when trust indicators degrade.

| Trigger | Response | Recovery |
|---------|----------|----------|
| **3 consecutive rejections** | Demote one level | Must re-earn through normal thresholds |
| **Adverse outcome** (compliance violation, SLA miss, or grievance traced to automated decision) | Demote to Level 1 | Must re-earn from Level 1; requires 30-day clean period |
| **User explicit request** | Demote to requested level immediately | User can re-enable at any time |
| **Admin override** | Set to any level at or below ceiling | Admin can lift override at any time |
| **Acceptance rate drops below threshold** (rolling 30-day) | Demote one level | Automatically re-promotes when rate recovers for 14 consecutive days |
| **Site data quality issue** | Demote to Level 1 for all action types at site | Restores when data quality checks pass for 7 consecutive days |

### Autonomy Level Schema

```sql
CREATE TABLE intelligence.autonomy_levels (
    autonomy_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id),
    site_id             UUID NOT NULL REFERENCES sites(site_id),
    action_type         TEXT NOT NULL,

    -- Current state
    current_level       INT NOT NULL DEFAULT 1 CHECK (current_level BETWEEN 0 AND 4),
    max_eligible_level  INT NOT NULL CHECK (max_eligible_level BETWEEN 0 AND 4),

    -- Earning metrics (rolling window)
    total_suggestions   INT NOT NULL DEFAULT 0,
    accepted_count      INT NOT NULL DEFAULT 0,
    rejected_count      INT NOT NULL DEFAULT 0,
    modified_count      INT NOT NULL DEFAULT 0,
    acceptance_rate     NUMERIC(5,4) GENERATED ALWAYS AS (
        CASE WHEN (accepted_count + rejected_count) > 0
             THEN accepted_count::NUMERIC / (accepted_count + rejected_count)
             ELSE 0
        END
    ) STORED,

    -- Weighted recent metrics
    recent_acceptance_rate  NUMERIC(5,4),        -- Recency-weighted rate (computed by job)
    recent_window_start     TIMESTAMPTZ,         -- Start of the current evaluation window

    -- Outcome tracking
    outcome_quality_score   NUMERIC(4,3),        -- 0.000 - 1.000
    adverse_outcome_count   INT NOT NULL DEFAULT 0,
    last_adverse_outcome_at TIMESTAMPTZ,
    days_since_adverse      INT GENERATED ALWAYS AS (
        CASE WHEN last_adverse_outcome_at IS NOT NULL
             THEN EXTRACT(DAY FROM now() - last_adverse_outcome_at)::INT
             ELSE NULL
        END
    ) STORED,

    -- Demotion tracking
    consecutive_rejections  INT NOT NULL DEFAULT 0,
    last_demotion_at        TIMESTAMPTZ,
    demotion_reason         TEXT,

    -- Metadata
    level_changed_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Constraints
    CONSTRAINT current_within_eligible CHECK (current_level <= max_eligible_level),
    CONSTRAINT unique_autonomy UNIQUE (tenant_id, site_id, action_type)
);

-- Indexes
CREATE INDEX idx_autonomy_tenant_site ON intelligence.autonomy_levels (tenant_id, site_id);
CREATE INDEX idx_autonomy_action ON intelligence.autonomy_levels (action_type, current_level);
CREATE INDEX idx_autonomy_review ON intelligence.autonomy_levels (tenant_id, current_level DESC, acceptance_rate DESC);

-- RLS
ALTER TABLE intelligence.autonomy_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY autonomy_tenant_isolation ON intelligence.autonomy_levels
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

### Autonomy Evaluation History

Track every level change for auditability.

```sql
CREATE TABLE intelligence.autonomy_history (
    history_id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    autonomy_id     UUID NOT NULL REFERENCES intelligence.autonomy_levels(autonomy_id),
    tenant_id       UUID NOT NULL,
    site_id         UUID NOT NULL,
    action_type     TEXT NOT NULL,

    previous_level  INT NOT NULL,
    new_level       INT NOT NULL,
    change_type     TEXT NOT NULL,       -- 'promotion' | 'demotion' | 'admin_override' | 'user_request' | 'system_reset'
    reason          TEXT NOT NULL,

    -- Snapshot of metrics at time of change
    metrics_snapshot JSONB NOT NULL,
        -- {acceptance_rate, total_suggestions, outcome_quality, consecutive_rejections, ...}

    changed_by      UUID,               -- null for system-initiated changes
    changed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_autonomy_history_lookup
    ON intelligence.autonomy_history (autonomy_id, changed_at DESC);

ALTER TABLE intelligence.autonomy_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY history_tenant_isolation ON intelligence.autonomy_history
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

### Autonomy Evaluation Job

Runs daily via pg_cron. Evaluates each `(tenant, site, action_type)` tuple against the earning thresholds and triggers promotions or demotions.

```sql
-- Pseudocode for the evaluation function
CREATE OR REPLACE FUNCTION intelligence.evaluate_autonomy_levels()
RETURNS void AS $$
DECLARE
    rec RECORD;
BEGIN
    FOR rec IN SELECT * FROM intelligence.autonomy_levels LOOP
        -- Recompute recent_acceptance_rate with recency weighting
        -- Check promotion criteria
        -- Check demotion triggers
        -- Apply changes and log to autonomy_history
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. Safety Boundaries

Hard limits that automation **never** crosses, regardless of autonomy level, acceptance rate, or any other factor. These are implemented as invariant checks in the automation execution pipeline.

### Inviolable Rules

| # | Rule | Rationale | Enforcement |
|---|------|-----------|-------------|
| S1 | **Never publish a plan without human confirmation** | Published plans are legal commitments to employees. Always Level 0. | `plan.publish()` requires `confirmed_by` UUID. No API path bypasses this. |
| S2 | **Never exceed legal working hour limits** | Violation exposes tenant to fines, lawsuits, and criminal liability in some jurisdictions. | Hard constraint in solver AND post-assignment validation. Assignment rejected if it would breach limit. |
| S3 | **Never assign an employee without required certification** | Safety risk. Assigning uncertified forklift operators, hazmat handlers, etc., creates liability. | Certification check is a mandatory pre-assignment gate. No override path. |
| S4 | **Never schedule an employee marked unavailable or on leave** | Violates employment agreements. Creates trust issues. | Availability check is a mandatory pre-assignment gate. Overriding requires manual admin action with documented reason. |
| S5 | **Never change more than 20% of a published plan without human review** | Large-scale automated changes to a published plan risk operational chaos. | Batch size check before execution. If changes exceed threshold, demote to Level 1 for the batch. |
| S6 | **Never automate for a site in its first 30 days** | Insufficient learning data. System has no track record at the site. | `site.onboarded_at` check. All action types locked to max Level 1 until day 31. |
| S7 | **Never automate across jurisdictional boundaries without explicit configuration** | Different jurisdictions have different labor laws. Cross-border transfers require legal review. | Cross-site automation requires explicit `cross_site_automation_enabled` flag per site pair. |

### Safety Check Implementation

Every automated action passes through the safety boundary check before execution:

```typescript
interface SafetyCheckResult {
  passed: boolean;
  violations: SafetyViolation[];
  warnings: SafetyWarning[];
}

interface SafetyViolation {
  rule: string;          // 'S1' | 'S2' | ... | 'S7'
  description: string;
  severity: 'hard_block'; // Safety violations are always hard blocks
  details: Record<string, unknown>;
}

async function checkSafetyBoundaries(
  action: AutomatedAction,
  context: ExecutionContext
): Promise<SafetyCheckResult> {
  const violations: SafetyViolation[] = [];

  // S1: Plan publication check
  if (action.type === 'plan_publish') {
    violations.push({
      rule: 'S1',
      description: 'Plan publication always requires human confirmation',
      severity: 'hard_block',
      details: { plan_id: action.planId }
    });
  }

  // S2: Working hour limit check
  if (action.affectsEmployeeHours) {
    const projected = await calculateProjectedHours(action);
    for (const emp of projected) {
      if (emp.projectedWeeklyHours > emp.legalLimit) {
        violations.push({
          rule: 'S2',
          description: `Would push ${emp.name} to ${emp.projectedWeeklyHours}h (limit: ${emp.legalLimit}h)`,
          severity: 'hard_block',
          details: { employee_id: emp.id, projected: emp.projectedWeeklyHours, limit: emp.legalLimit }
        });
      }
    }
  }

  // S3: Certification check
  if (action.requiresCertification) {
    const valid = await verifyCertifications(action.employeeId, action.processId);
    if (!valid) {
      violations.push({
        rule: 'S3',
        description: `Employee lacks required certification for ${action.processName}`,
        severity: 'hard_block',
        details: { employee_id: action.employeeId, process_id: action.processId }
      });
    }
  }

  // S4: Availability check
  if (action.assignsEmployee) {
    const available = await checkAvailability(action.employeeId, action.timeSlot);
    if (!available) {
      violations.push({
        rule: 'S4',
        description: `Employee is marked unavailable or on leave`,
        severity: 'hard_block',
        details: { employee_id: action.employeeId, time_slot: action.timeSlot }
      });
    }
  }

  // S5: Published plan change threshold
  if (action.affectsPublishedPlan) {
    const changeRatio = await calculateChangeRatio(action);
    if (changeRatio > 0.20) {
      violations.push({
        rule: 'S5',
        description: `Changes affect ${(changeRatio * 100).toFixed(1)}% of published plan (limit: 20%)`,
        severity: 'hard_block',
        details: { change_ratio: changeRatio, threshold: 0.20 }
      });
    }
  }

  // S6: New site check
  if (action.siteId) {
    const site = await getSite(action.siteId);
    const daysSinceOnboarding = daysBetween(site.onboarded_at, new Date());
    if (daysSinceOnboarding < 30) {
      violations.push({
        rule: 'S6',
        description: `Site onboarded ${daysSinceOnboarding} days ago (minimum: 30 days)`,
        severity: 'hard_block',
        details: { site_id: action.siteId, days: daysSinceOnboarding }
      });
    }
  }

  return { passed: violations.length === 0, violations, warnings: [] };
}
```

---

## 5. Override Architecture

Human override is sacred (Principle 6). Every automated action can be reversed quickly and without friction.

### Undo Window

| Automation Level | Default Undo Window | Configurable Range |
|------------------|---------------------|--------------------|
| Level 3 | 30 minutes | 15 minutes - 4 hours |
| Level 4 | 60 minutes | 30 minutes - 8 hours |
| Level 2 (after apply) | No undo window (standard undo via plan edit history) | — |

During the undo window:
- The action is **live** (it takes effect immediately) but marked as `undo_eligible`
- The user sees a persistent notification with an undo button and countdown timer
- If the user undoes, the system reverts the action atomically and logs the override as a learning signal

### Single-Click Override

**No justification required.** The user does not need to explain why they are overriding. This is a deliberate design decision — requiring justification creates friction that discourages override, which undermines trust.

The override action:
1. Reverts the automated change (restores the previous state)
2. Logs the override event with context (what was undone, when, by whom)
3. Feeds the override into the learning pipeline (counts as a rejection for autonomy evaluation)
4. Resets the consecutive-rejection counter (increments it)

### Bulk Override

**"Undo all automated changes from today"** — a single action that rolls back every automated change made in the current day.

```sql
-- Identify all automated actions eligible for bulk undo
SELECT action_id, action_type, executed_at, undo_payload
FROM intelligence.automated_actions
WHERE site_id = :site_id
  AND executed_at >= CURRENT_DATE
  AND automation_level >= 3
  AND status = 'executed'
  AND undo_eligible = true
ORDER BY executed_at DESC;
```

The bulk undo:
- Reverts changes in reverse chronological order (most recent first)
- Each revert is atomic — if one fails, the rest still proceed
- Generates a single audit entry: "Bulk override: N automated actions from DATE reverted by USER"

### Emergency Stop

Admin-level control to immediately disable all automation for a site or entire tenant.

```sql
CREATE TABLE intelligence.emergency_stops (
    stop_id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(tenant_id),
    site_id         UUID,                   -- null = tenant-wide stop
    activated_by    UUID NOT NULL REFERENCES auth.users(id),
    activated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason          TEXT NOT NULL,
    deactivated_by  UUID,
    deactivated_at  TIMESTAMPTZ,
    is_active       BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX idx_emergency_stop_active
    ON intelligence.emergency_stops (tenant_id, site_id)
    WHERE is_active = true;

ALTER TABLE intelligence.emergency_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY stop_tenant_isolation ON intelligence.emergency_stops
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

**When an emergency stop is active:**
- All automation levels for the affected scope are forced to Level 0 (information only)
- In-flight automated actions within their undo window are automatically reverted
- A prominent banner appears in the UI: "Automation paused by [Admin Name] at [Time]. Reason: [Reason]"
- The emergency stop remains active until explicitly deactivated by an admin

**Emergency stop does not affect:**
- Informational alerts (Level 4 certification expiry alerts, demand anomaly alerts)
- Historical data and audit trails
- The recommendation engine (suggestions still appear, just cannot auto-execute)

---

## 6. Audit Trail for Automated Actions

Every automated action (Level 2+) produces a comprehensive audit record. This trail serves three purposes: compliance, debugging, and learning.

### Automated Action Log Schema

```sql
CREATE TABLE intelligence.automated_actions (
    action_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL REFERENCES tenants(tenant_id),
    site_id             UUID NOT NULL REFERENCES sites(site_id),

    -- What was done
    action_type         TEXT NOT NULL,
    action_description  TEXT NOT NULL,           -- Human-readable description
    action_payload      JSONB NOT NULL,          -- Full action details (assignments changed, parameters modified)
    affected_entities   JSONB NOT NULL,          -- [{type: 'employee', id: '...'}, {type: 'process', id: '...'}]
    affected_count      INT NOT NULL,            -- Number of entities affected

    -- Why it was done
    trigger_signal_id   UUID REFERENCES intelligence.signals(signal_id),
    recommendation_id   UUID REFERENCES intelligence.recommendations(recommendation_id),
    trigger_description TEXT NOT NULL,           -- "Absence reported for John Martinez"

    -- Decision context
    confidence_score    NUMERIC(4,3) NOT NULL,   -- Confidence at time of action
    automation_level    INT NOT NULL,             -- Level that authorized this action (2, 3, or 4)
    autonomy_id         UUID REFERENCES intelligence.autonomy_levels(autonomy_id),
    alternatives_considered JSONB,               -- Other options the system evaluated and why this one was chosen

    -- Execution
    executed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    execution_duration_ms INT,                   -- How long the action took to execute

    -- Undo
    undo_eligible       BOOLEAN NOT NULL DEFAULT true,
    undo_window_expires TIMESTAMPTZ,
    undo_payload        JSONB,                   -- Data needed to reverse the action

    -- Status
    status              TEXT NOT NULL DEFAULT 'executed',
        -- 'executed' | 'undone_by_user' | 'undone_by_system' | 'undone_emergency_stop' | 'confirmed'

    -- Outcome (populated later)
    outcome_measured    BOOLEAN NOT NULL DEFAULT false,
    outcome_data        JSONB,
        -- {coverage_achieved: 0.97, target_coverage: 0.95, cost_actual: 450, cost_projected: 420}
    outcome_quality     NUMERIC(4,3),            -- 0.000 - 1.000 (1.0 = outcome matched or exceeded projection)
    outcome_measured_at TIMESTAMPTZ,

    -- Override details (if undone)
    undone_by           UUID REFERENCES auth.users(id),
    undone_at           TIMESTAMPTZ,
    undo_type           TEXT,                    -- 'single' | 'bulk' | 'emergency_stop'

    -- Constraints
    CONSTRAINT valid_status CHECK (status IN ('executed', 'undone_by_user', 'undone_by_system', 'undone_emergency_stop', 'confirmed')),
    CONSTRAINT valid_automation_level CHECK (automation_level BETWEEN 2 AND 4)
);

-- Indexes
CREATE INDEX idx_actions_tenant_site ON intelligence.automated_actions (tenant_id, site_id, executed_at DESC);
CREATE INDEX idx_actions_undo_window ON intelligence.automated_actions (undo_window_expires)
    WHERE status = 'executed' AND undo_eligible = true;
CREATE INDEX idx_actions_outcome_pending ON intelligence.automated_actions (tenant_id)
    WHERE outcome_measured = false AND status = 'executed';
CREATE INDEX idx_actions_type ON intelligence.automated_actions (action_type, executed_at DESC);

-- RLS
ALTER TABLE intelligence.automated_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY actions_tenant_isolation ON intelligence.automated_actions
    USING (tenant_id = current_setting('app.current_tenant_id')::UUID);
```

### Audit Record Content

Every audit record answers these questions:

| Question | Field(s) | Example |
|----------|----------|---------|
| **What was done?** | `action_type`, `action_description`, `action_payload` | "Absence backfill: Assigned Maria Santos to Forklift Operations 06:00-14:00 Thursday" |
| **Why was it done?** | `trigger_signal_id`, `trigger_description`, `recommendation_id` | "Triggered by absence report for John Martinez (signal: abc123). Based on recommendation rec456." |
| **How confident was the system?** | `confidence_score` | 0.92 |
| **What level authorized it?** | `automation_level`, `autonomy_id` | Level 3 (earned autonomy for absence_backfill at Site 3) |
| **Can it be undone?** | `undo_eligible`, `undo_window_expires` | Yes, undo window expires at 08:45 UTC |
| **What was the outcome?** | `outcome_data`, `outcome_quality` | Coverage achieved: 97% (target: 95%). Outcome quality: 0.94. |
| **Was it overridden?** | `status`, `undone_by`, `undone_at` | "undone_by_user" by Planner Jane at 08:30 UTC |

### Outcome Measurement

A scheduled job (runs end-of-day) evaluates the outcome of automated actions:

```sql
-- Pseudocode for outcome measurement
CREATE OR REPLACE FUNCTION intelligence.measure_action_outcomes()
RETURNS void AS $$
DECLARE
    action_rec RECORD;
BEGIN
    FOR action_rec IN
        SELECT * FROM intelligence.automated_actions
        WHERE outcome_measured = false
          AND status = 'executed'
          AND executed_at < now() - INTERVAL '8 hours'  -- Allow time for outcome to materialize
    LOOP
        -- Compare actual KPIs for the affected time period against projected KPIs
        -- Calculate outcome_quality score
        -- Update the record
        -- Feed outcome into autonomy evaluation pipeline
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### Audit Dashboard

The Control Room includes an **Automation Activity** panel showing:

- **Today's automated actions:** count, types, confidence distribution
- **Override rate:** percentage of automated actions overridden (today, 7-day, 30-day)
- **Outcome quality trend:** rolling average of outcome quality scores
- **Autonomy level summary:** current levels per action type, recent promotions/demotions
- **Safety boundary hits:** count of actions blocked by safety rules (indicates the system is correctly self-limiting)

### Retention Policy

| Data Type | Retention Period | Rationale |
|-----------|-----------------|-----------|
| Automated action records | 2 years | Compliance and audit requirements |
| Outcome measurements | 2 years | Tied to action records |
| Autonomy level history | 2 years | Explains why the system had certain permissions |
| Signal records | 90 days | High volume, primarily for debugging |
| Emergency stop records | Indefinite | Critical governance events |

```sql
-- Retention cleanup job (runs weekly)
DELETE FROM intelligence.signals
WHERE detected_at < now() - INTERVAL '90 days';

DELETE FROM intelligence.automated_actions
WHERE executed_at < now() - INTERVAL '2 years';

DELETE FROM intelligence.autonomy_history
WHERE changed_at < now() - INTERVAL '2 years';
```
