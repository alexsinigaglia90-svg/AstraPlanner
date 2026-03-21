# AI Explainability Framework

Every AI output in AstraPlanner must be explainable. No black-box decisions. This document specifies the explainability philosophy, generation architecture, templates, storage schema, and counterfactual explanation capabilities.

---

## 1. Explainability Philosophy

### 1.1 Core Requirement

If the system cannot explain why it made a decision, it must not make that decision. Explainability is not a post-hoc add-on — it is a structural constraint on system design. Every recommendation, prediction, automated action, and optimizer output carries an explanation that is generated at decision time and stored alongside the result.

This requirement exists for three reasons:

1. **Trust.** Planners will not adopt AI recommendations they do not understand. Explainability is the mechanism through which the system builds trust (see `ai-vision.md` Section 6).
2. **Compliance.** GDPR Article 22 and the EU AI Act require that individuals affected by automated decisions can obtain an explanation. AstraPlanner's explanation system is the technical implementation of this legal requirement (see `privacy-and-guardrails.md` Section 6).
3. **Debugging.** When the system makes a bad recommendation, the explanation reveals why — enabling rapid diagnosis and model improvement without guesswork.

### 1.2 Three Levels of Explanation

Every explainable decision supports three levels of detail. The user receives the appropriate level based on their role, with the option to drill deeper.

| Level | Name | Content | Target Audience | Example |
|---|---|---|---|---|
| **L1** | Summary | One-sentence natural language explanation. Answers "why?" in the simplest terms. | Shift Supervisor, Employee (self-service) | "Maria is recommended because she has the right skill and is available." |
| **L2** | Factors | Ranked list of decision factors with weights and values. Answers "what drove the decision?" | Planner, Manager | "Skill match: 92%, Availability: 100%, Overtime impact: Low (+0h), Preference: Home site, Morning shift preferred." |
| **L3** | Full Trace | Complete decision audit trail. Raw scores, all candidates considered, why each was ranked, which constraints applied, which were binding. | Admin, Compliance Officer, Auditor | Full JSON structure with candidate list, constraint evaluation, objective function contribution, solver metadata. |

### 1.3 Default Explanation Level by Role

| Role | Default Level | Can Access Higher Levels? |
|---|---|---|
| Employee (self-service) | L1 (Summary) | No — employees see only summary explanations for their own assignments |
| Shift Supervisor | L1 (Summary) | Yes — can drill to L2 (Factors) on request |
| Planner | L2 (Factors) | Yes — can drill to L3 (Full Trace) on request |
| Manager | L2 (Factors) | Yes — can drill to L3 (Full Trace) on request |
| Admin | L3 (Full Trace) | N/A — already at highest level |
| Compliance Officer | L3 (Full Trace) | N/A — already at highest level |

**Role-based explanation rendering:**

```typescript
function getExplanation(
  entityType: string,
  entityId: string,
  userRole: UserRole,
  requestedLevel?: ExplanationLevel
): Explanation {
  const maxLevel = ROLE_MAX_EXPLANATION_LEVEL[userRole];
  const defaultLevel = ROLE_DEFAULT_EXPLANATION_LEVEL[userRole];
  const level = requestedLevel
    ? Math.min(requestedLevel, maxLevel)
    : defaultLevel;

  const fullExplanation = explanationStore.get(entityType, entityId);
  return renderAtLevel(fullExplanation, level, userRole);
}

const ROLE_DEFAULT_EXPLANATION_LEVEL: Record<UserRole, number> = {
  employee: 1,
  shift_supervisor: 1,
  planner: 2,
  manager: 2,
  admin: 3,
  compliance: 3,
};

const ROLE_MAX_EXPLANATION_LEVEL: Record<UserRole, number> = {
  employee: 1,
  shift_supervisor: 2,
  planner: 3,
  manager: 3,
  admin: 3,
  compliance: 3,
};
```

---

## 2. Explanation Generation Architecture

### 2.1 Deterministic Decisions (Optimizer Output)

When the optimizer (HiGHS MIP solver or greedy heuristic) generates a plan, the explanation is derived from the solver's mathematical output — not from an AI narrative generator.

#### 2.1.1 Constraint Analysis

The explanation identifies which constraints were active (binding) and their impact on the solution:

```typescript
interface OptimizerExplanation {
  assignment_id: string;
  employee_id: string;
  process_id: string;
  shift_id: string;

  // Why this assignment exists
  primary_reason: string;  // "Best skill-cost match for this slot"

  // Constraint status for this assignment
  constraints: {
    constraint_name: string;
    constraint_type: 'hard' | 'soft';
    status: 'satisfied' | 'binding' | 'relaxed';
    shadow_price?: number;  // Dual value: cost of tightening this constraint by one unit
    description: string;
  }[];

  // Objective function contribution
  objective_contribution: {
    total_score: number;
    components: {
      factor: string;     // 'skill_match', 'cost', 'preference', 'overtime', 'fairness'
      weight: number;     // Objective weight for this factor
      raw_value: number;  // Unweighted value
      weighted_value: number; // weight * raw_value
      rank_among_candidates: number; // Where this employee ranked on this factor
    }[];
  };

  // Alternative candidates
  alternatives: {
    employee_id: string;
    total_score: number;
    not_chosen_reason: string;  // "Higher overtime impact (+4h)" or "Lower skill match (L3 vs L4)"
  }[];

  // Trade-off context
  trade_off: string;  // "Assigning Employee B instead would save $12/hr but create a certification gap in Process X"
}
```

#### 2.1.2 Shadow Price Extraction

The optimizer's dual values (shadow prices) reveal the marginal cost of each constraint:

```typescript
// Extract shadow prices from HiGHS solution
function extractShadowPrices(solver: HiGHSSolution): ShadowPrice[] {
  const dualValues = solver.getDualValues();
  return dualValues
    .filter(d => Math.abs(d.value) > 0.01)  // Only report binding constraints
    .map(d => ({
      constraint: d.constraintName,
      shadowPrice: d.value,
      interpretation: interpretShadowPrice(d),
      // e.g., "Relaxing the maximum 40h/week constraint by 1 hour
      //        would reduce total plan cost by $28.50"
    }))
    .sort((a, b) => Math.abs(b.shadowPrice) - Math.abs(a.shadowPrice));
}

function interpretShadowPrice(dual: DualValue): string {
  if (dual.constraintName.startsWith('max_hours_')) {
    return `Relaxing the ${dual.constraintName} constraint by 1 hour would ` +
           `${dual.value > 0 ? 'reduce' : 'increase'} total plan cost by ` +
           `$${Math.abs(dual.value).toFixed(2)}`;
  }
  if (dual.constraintName.startsWith('min_skill_')) {
    return `This skill requirement is binding: all qualified employees are fully utilized. ` +
           `Adding one more qualified employee would improve coverage by ` +
           `${Math.abs(dual.value).toFixed(1)}%`;
  }
  // ... additional constraint type interpretations
}
```

#### 2.1.3 Trade-Off Explanations

For every assignment, the system can articulate what would change if a different choice were made:

```typescript
// Generate trade-off explanation for top alternatives
function generateTradeOff(
  chosen: CandidateScore,
  alternatives: CandidateScore[],
  objectiveWeights: ObjectiveWeights
): string {
  const bestAlt = alternatives[0];  // Next-best candidate
  const diffs = compareCandidates(chosen, bestAlt, objectiveWeights);

  // Construct natural language trade-off
  const advantages = diffs.filter(d => d.direction === 'better');
  const disadvantages = diffs.filter(d => d.direction === 'worse');

  return `Assigning ${bestAlt.employeeLabel} instead would ` +
         disadvantages.map(d => d.description).join(' and ') +
         `, but would ` +
         advantages.map(d => d.description).join(' and ') + '.';
  // Output: "Assigning E-5103 instead would save $4/hr, but would
  //          create a certification gap in Process X and add 2h overtime."
}
```

### 2.2 AI Recommendations

When the Intelligence Plane generates a recommendation (staffing suggestion, anomaly alert, pattern insight), the explanation uses feature attribution — identifying which data signals contributed most to the recommendation.

#### 2.2.1 Feature Attribution

```typescript
interface RecommendationExplanation {
  recommendation_id: string;
  recommendation_type: string;  // 'staffing', 'process', 'structural', 'operational'

  // Feature importance (SHAP-like attribution for ML models, rule provenance for rule-based)
  feature_attribution: {
    feature: string;           // 'monday_absence_rate', 'demand_trend_slope', 'overtime_12w_avg'
    importance: number;        // 0.0 to 1.0, sum across features = 1.0
    direction: 'positive' | 'negative';  // Did this feature push toward or against the recommendation?
    value: string;             // Current value: "12.1%"
    baseline: string;          // Comparison value: "site average 7.4%"
    evidence_period: string;   // "Last 12 weeks"
  }[];

  // Supporting evidence (specific data points referenced in the recommendation)
  evidence: {
    data_point: string;       // "Monday absence rate for Department B"
    value: number | string;   // "18%"
    period: string;           // "Weeks 1-12, 2026"
    source_table: string;     // "intelligence.outcomes"
    comparison: string;       // "vs site average of 8%"
  }[];

  // Model metadata
  model: {
    type: string;             // 'gradient_boosted_classifier', 'statistical_rule', 'claude_insight'
    version: string;          // 'absence_v3.2'
    training_date: string;    // When this model was last trained
    accuracy_metric: number;  // Model accuracy on validation set
  };

  // Confidence breakdown
  confidence: {
    overall: number;          // 0.0 to 1.0
    data_quality: number;     // How complete/reliable is the input data?
    model_confidence: number; // How confident is the model in this prediction?
    historical_accuracy: number; // How accurate has this model been historically?
  };
}
```

#### 2.2.2 Rule-Based Recommendation Provenance

For recommendations generated by rules (not ML models), the explanation traces back to the rule that fired:

```typescript
// Example: Certification expiry alert
{
  recommendation_type: 'compliance_risk',
  feature_attribution: [
    {
      feature: 'forklift_certification_expiry',
      importance: 1.0,
      direction: 'positive',
      value: 'Expires 2026-04-15 (26 days)',
      baseline: 'Minimum certified operators required: 5',
      evidence_period: 'Current'
    }
  ],
  evidence: [
    {
      data_point: 'Active forklift-certified operators at Site DFW-04',
      value: 6,
      period: 'Current',
      source_table: 'employee_skill',
      comparison: 'Minimum required: 5. After expiry: 5 (at minimum threshold)'
    }
  ],
  model: {
    type: 'rule_based',
    version: 'certification_monitor_v1',
    rule_definition: 'IF certified_count - expiring_within_30d <= minimum_required THEN alert',
    accuracy_metric: 1.0  // Deterministic rule, always accurate given correct data
  }
}
```

### 2.3 LLM-Generated Insights

When Claude generates an insight or narrative explanation, the structured output includes the explanation as a first-class field — not a separate generation step.

#### 2.3.1 Claude Structured Output for Insights

```typescript
// System prompt instructs Claude to generate explanation alongside insight
const insightWithExplanationSchema = z.object({
  insight: z.string().max(300),
  evidence: z.array(z.object({
    data_point: z.string(),
    value: z.union([z.number(), z.string()]),
    period: z.string(),
    comparison: z.string().optional(),
  })).min(1).max(5),
  confidence: z.number().min(0).max(1),
  confidence_reasoning: z.string().max(200),  // Why the confidence is at this level
  recommended_action: z.string().max(200),
  action_impact: z.string().max(200),  // Expected outcome if the action is taken
  data_limitations: z.string().max(200).optional(),  // Any caveats about data quality
});
```

**Example Claude output:**

```json
{
  "insight": "Coverage dropped from 96% to 89% between Week 44 and Week 46, driven by a 3x increase in unplanned absences in the packing department.",
  "evidence": [
    {
      "data_point": "Overall coverage rate",
      "value": "89%",
      "period": "Week 46 (Nov 11-17, 2026)",
      "comparison": "vs 96% in Week 44 (Oct 28-Nov 3)"
    },
    {
      "data_point": "Packing department unplanned absence rate",
      "value": "15.2%",
      "period": "Week 45-46",
      "comparison": "vs 5.1% in Weeks 40-44 (3x increase)"
    },
    {
      "data_point": "Packing FTE gap",
      "value": "4.2 FTEs short",
      "period": "Week 46 average",
      "comparison": "no gap in Weeks 40-44"
    }
  ],
  "confidence": 0.88,
  "confidence_reasoning": "High confidence: based on 6 weeks of attendance data with >95% recording completeness. The absence spike is statistically significant (p < 0.01).",
  "recommended_action": "Over-staff packing by 3 FTEs for the next 2 weeks while investigating the absence spike. Consider cross-training 2 picking employees for packing as medium-term buffer.",
  "action_impact": "Expected to restore coverage to 94-96% at an additional cost of approximately $2,400/week.",
  "data_limitations": "Absence reason data not available — unable to determine if spike is seasonal, morale-related, or coincidental."
}
```

---

## 3. Explanation Templates

Standardized templates ensure consistent, high-quality explanations across all decision types. Each template defines the structure; the values are populated from the explanation data at render time.

### 3.1 Assignment Explanation

**Used for:** Any ShiftAssignment in a plan.

**L1 (Summary):**
> Employee {name} was assigned to {process} on {date} ({shift}) because they have the required skill and are available.

**L2 (Factors):**
> Employee {name} was assigned to {process} on {date} ({shift}) based on:
> 1. **Skill match:** {skill_name} at Level {level} (required: Level {min_level}+) — {skill_score}%
> 2. **Availability:** {availability_status} — no conflicting assignments or leave
> 3. **Overtime impact:** {overtime_impact} ({overtime_hours} additional hours)
> 4. **Site preference:** {site_match} ({home_site_or_travel})
> 5. **Shift preference:** {shift_preference_match}
>
> Candidates considered: {candidate_count}. Next best alternative: {alt_name} (not chosen because: {alt_reason}).

**L3 (Full Trace):**
> [Full JSON structure as defined in Section 2.1.1, including all constraint evaluations, shadow prices, objective contribution breakdown, and complete candidate ranking]

### 3.2 Recommendation Explanation

**Used for:** AI-generated staffing, process, structural, or operational recommendations.

**L1 (Summary):**
> We recommend {action} because {trigger_summary}.

**L2 (Factors):**
> **Recommendation:** {action}
>
> **Why:** {trigger_detailed}
>
> **Key factors:**
> {for each factor: "- {factor_name}: {value} (vs baseline {baseline})" }
>
> **Expected impact:** {impact_description}
>
> **Confidence:** {confidence_pct}% — {confidence_reasoning}
>
> **Based on:** {data_sources} covering {evidence_period}

**L3 (Full Trace):**
> [Full feature attribution, evidence array, model metadata, and confidence breakdown as defined in Section 2.2.1]

### 3.3 Automation Explanation

**Used for:** Any action taken by the system at Level 2+ autonomy (assisted, supervised, or autonomous).

**L1 (Summary):**
> This {action_type} was performed automatically because {trigger_summary}.

**L2 (Factors):**
> **Automated action:** {action_description}
>
> **Autonomy level:** Level {level} ({level_name})
>
> **Trigger:** {trigger_detailed}
>
> **Confidence:** {confidence_pct}% (threshold for this action type: {threshold_pct}%)
>
> **What was done:** {action_steps}
>
> **Undo available until:** {undo_deadline}
>
> **Override history:** This action type has been overridden {override_count} times in the last 30 days ({override_rate}% override rate).
>
> **If you disagree:** Click [Undo] to revert, or [Report Issue] to flag for review.

**L3 (Full Trace):**
> Includes: trigger event payload, candidate evaluation, constraint validation results, autonomy grant record, approval chain (for Level 2-3), and execution log with timestamps.

### 3.4 Anomaly Explanation

**Used for:** AI-detected anomalies in demand, attendance, cost, or operational patterns.

**L1 (Summary):**
> Anomaly detected: {short_description}.

**L2 (Factors):**
> **Anomaly:** {description}
>
> **Why this is unusual:** {baseline_comparison}
> - Expected: {expected_value} (based on {baseline_period})
> - Observed: {observed_value}
> - Deviation: {deviation_magnitude} ({deviation_direction})
>
> **Possible causes:**
> 1. {cause_1} (likelihood: {likelihood_1})
> 2. {cause_2} (likelihood: {likelihood_2})
> 3. {cause_3} (likelihood: {likelihood_3})
>
> **Recommended action:** {action}
>
> **If no action taken:** {risk_description}

**L3 (Full Trace):**
> Includes: statistical test results (z-score, p-value), baseline computation methodology, anomaly detection model metadata, historical anomaly frequency for this metric, and complete data series for the anomaly period.

### 3.5 Prediction Explanation

**Used for:** AI predictions (absence probability, demand deviation, overtime risk, skill gap emergence).

**L1 (Summary):**
> Predicted: {prediction_summary} with {confidence_pct}% confidence.

**L2 (Factors):**
> **Prediction:** {prediction_detailed}
>
> **Key drivers:**
> {for each driver: "- {driver_name}: {value} (contributes {importance_pct}% to prediction)" }
>
> **Confidence:** {confidence_pct}%
> - Model accuracy on similar predictions: {historical_accuracy}%
> - Data completeness: {data_completeness}%
>
> **Historical accuracy for this prediction type:** {accuracy_track_record}
>
> **What to do:** {recommended_action}

---

## 4. Explanation Storage and Retrieval

### 4.1 Schema: `intelligence.explanations`

Every AI-influenced decision stores its explanation in a dedicated table:

```sql
CREATE TABLE intelligence.explanations (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,

    -- What decision this explanation belongs to
    entity_type TEXT NOT NULL,         -- 'shift_assignment', 'recommendation', 'automation', 'prediction', 'anomaly'
    entity_id UUID NOT NULL,           -- FK to the explained entity
    decision_timestamp TIMESTAMPTZ NOT NULL, -- When the decision was made

    -- Explanation content at all three levels
    summary TEXT NOT NULL,              -- L1: one-sentence explanation
    factors JSONB NOT NULL,             -- L2: ranked factor list with weights
    full_trace JSONB NOT NULL,          -- L3: complete audit trail

    -- Explanation metadata
    explanation_version INTEGER NOT NULL DEFAULT 1, -- Incremented if re-explained after model change
    model_type TEXT,                    -- Which model generated this decision
    model_version TEXT,                 -- Version of the model at decision time
    confidence NUMERIC(3,2),            -- Overall confidence score

    -- Alternatives considered
    alternatives_count INTEGER,         -- How many alternatives were evaluated
    alternatives_summary JSONB,         -- Top 3-5 alternatives with reasons for rejection

    -- Counterfactual (generated on demand, cached once computed)
    counterfactual JSONB,               -- "What would have happened if..." (see Section 5)
    counterfactual_computed_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    -- Indexes
    CONSTRAINT uq_explanation_entity UNIQUE (organization_id, entity_type, entity_id, explanation_version)
);

-- Indexes for common query patterns
CREATE INDEX idx_explanations_org_entity
  ON intelligence.explanations (organization_id, entity_type, entity_id);

CREATE INDEX idx_explanations_org_timestamp
  ON intelligence.explanations (organization_id, decision_timestamp DESC);

CREATE INDEX idx_explanations_org_model
  ON intelligence.explanations (organization_id, model_type, model_version);

-- RLS
ALTER TABLE intelligence.explanations ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.explanations FORCE ROW LEVEL SECURITY;

CREATE POLICY explanations_tenant_isolation ON intelligence.explanations
    FOR SELECT
    USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- Only system role can write explanations
CREATE POLICY explanations_system_write ON intelligence.explanations
    FOR INSERT
    WITH CHECK (
        organization_id = (auth.jwt() ->> 'organization_id')::uuid
        AND (auth.jwt() ->> 'role') IN ('admin', 'system')
    );
```

### 4.2 API: Explanation Retrieval

```
GET /api/explain/{entity_type}/{entity_id}

Query Parameters:
  level: 1 | 2 | 3  (optional, defaults to role-appropriate level)
  version: integer   (optional, defaults to latest)

Response (L2 example):
{
  "entity_type": "shift_assignment",
  "entity_id": "asgn_abc123",
  "decision_timestamp": "2026-03-22T09:15:00Z",
  "explanation_level": 2,
  "summary": "Maria was assigned to Picking Zone 3 on Monday morning because she has the right skill and is available.",
  "factors": [
    {
      "factor": "Skill match",
      "value": "Picking proficiency Level 4 (required: Level 3+)",
      "score": 0.92,
      "weight": 0.30,
      "rank": 1
    },
    {
      "factor": "Availability",
      "value": "Available — no conflicts",
      "score": 1.00,
      "weight": 0.25,
      "rank": 1
    },
    {
      "factor": "Overtime impact",
      "value": "+0h (within contracted hours)",
      "score": 1.00,
      "weight": 0.20,
      "rank": 1
    },
    {
      "factor": "Home site",
      "value": "This is Maria's home site",
      "score": 1.00,
      "weight": 0.15,
      "rank": 1
    },
    {
      "factor": "Shift preference",
      "value": "Morning — matches preference",
      "score": 0.90,
      "weight": 0.10,
      "rank": 2
    }
  ],
  "alternatives_considered": 12,
  "top_alternative": {
    "employee_label": "E-5103",
    "total_score": 0.84,
    "not_chosen_reason": "Lower skill match (Level 3 vs Level 4) and would add 2h overtime"
  },
  "confidence": 0.93,
  "model": "optimizer_v3 + planner_approval"
}
```

### 4.3 Explanation Versioning

If a model is retrained or updated, existing explanations are **not modified**. They remain accurate records of why the decision was made at the time it was made, using the model version that was active at that time.

If an explanation is re-generated (e.g., because the user requests a fresh explanation after a model update), a new explanation record is created with `explanation_version` incremented. Both the original and updated explanations are retained.

```
Decision made on 2026-03-22 using absence_model_v2
  → Explanation v1 stored (references absence_model_v2)

Model updated to absence_model_v3 on 2026-04-01
  → Explanation v1 unchanged (still references absence_model_v2)

User requests re-explanation on 2026-04-05
  → Explanation v2 created (references absence_model_v3)
  → Both v1 and v2 are queryable
  → Default API response returns v2 (latest)
  → v1 accessible via ?version=1 parameter
```

### 4.4 Retention

Explanations are retained as long as the decision they explain:

| Entity Type | Explanation Retention | Rationale |
|---|---|---|
| `shift_assignment` | 2 years (matches shift_assignment retention) | Labor law compliance, dispute resolution |
| `recommendation` | 90 days (matches recommendation lifecycle) | Sufficient for feedback loop analysis |
| `automation` | 2 years (autonomous actions have regulatory implications) | Audit trail for automated decisions |
| `prediction` | 90 days | Historical prediction accuracy analysis |
| `anomaly` | 1 year | Pattern analysis across anomaly history |

Retention enforcement is handled by the same pg_cron retention job that manages other data lifecycle rules (see `gdpr-compliance.md` Section 3.2).

---

## 5. Counterfactual Explanations

### 5.1 Purpose

Counterfactual explanations answer "What would have happened if...?" questions. They allow planners and managers to understand the impact of decisions by comparing the actual outcome with hypothetical alternatives.

### 5.2 Counterfactual Types

| Counterfactual Type | Question | Example | Generation Method |
|---|---|---|---|
| **Employee substitution** | "What if Employee A had not been available?" | "If Maria had not been available, Tom would have been assigned (lower skill match, $4/hr higher cost, 2h overtime impact)." | Re-run assignment scorer with Employee A removed from candidate pool |
| **Override impact** | "What if you had accepted the AI recommendation instead of overriding?" | "If you had accepted the AI recommendation, coverage would have been 96% instead of 91%. The override moved E-4821 from picking to packing, leaving a coverage gap in Zone 3." | Compare actual outcome metrics with the metrics from the original recommendation |
| **Constraint relaxation** | "What if the maximum overtime constraint were 44h instead of 40h?" | "Relaxing overtime to 44h would have eliminated the coverage gap on Tuesday (saving $800 in agency cost) by allowing E-5103 to work an additional 4h." | Re-run optimizer with modified constraint; compare solutions |
| **Demand change** | "What if demand had been 10% higher?" | "With 10% higher demand, you would need 4 additional FTEs on Wednesday and Thursday. Current plan would have 87% coverage (vs current 95%)." | Re-run workload computation and optimizer with modified demand |
| **Temporal** | "What if this absence had been reported 2 hours earlier?" | "If the absence had been reported at 04:00 instead of 06:00, the system would have auto-replaced with E-5103 (available, confirmed via SMS). Instead, manual replacement at 06:45 resulted in 45 minutes of uncovered time." | Simulate the automation pipeline with the earlier trigger time |

### 5.3 Counterfactual Generation

Counterfactuals are generated **on demand** (not pre-computed) because they are computationally expensive and most decisions do not require them.

```typescript
// Counterfactual generation endpoint
// POST /api/explain/{entity_type}/{entity_id}/counterfactual
// Body: { "what_if": "employee_unavailable", "params": { "employee_id": "E-4821" } }

async function generateCounterfactual(
  entityType: string,
  entityId: string,
  whatIf: CounterfactualType,
  params: Record<string, unknown>,
  orgId: string
): Promise<CounterfactualResult> {
  // 1. Load the original decision context (inputs that were used at decision time)
  const originalContext = await explanationStore.getFullTrace(entityType, entityId);

  // 2. Modify the context according to the counterfactual
  const modifiedContext = applyCounterfactual(originalContext, whatIf, params);

  // 3. Re-run the decision with modified context
  let counterfactualResult: DecisionResult;
  switch (entityType) {
    case 'shift_assignment':
      counterfactualResult = await optimizer.solve(modifiedContext);
      break;
    case 'recommendation':
      counterfactualResult = await recommender.evaluate(modifiedContext);
      break;
    case 'automation':
      counterfactualResult = await automationEngine.simulate(modifiedContext);
      break;
    default:
      throw new Error(`Counterfactual not supported for entity type: ${entityType}`);
  }

  // 4. Compare original and counterfactual outcomes
  const comparison = compareOutcomes(originalContext.result, counterfactualResult);

  // 5. Generate narrative explanation using Claude
  const narrative = await claude.generate({
    system: COUNTERFACTUAL_NARRATIVE_PROMPT,
    context: {
      original: originalContext,
      counterfactual: counterfactualResult,
      comparison,
      whatIf,
    },
    schema: counterfactualNarrativeSchema,
  });

  // 6. Cache the result in the explanation record
  await explanationStore.updateCounterfactual(entityType, entityId, {
    what_if: whatIf,
    params,
    original_outcome: comparison.original,
    counterfactual_outcome: comparison.counterfactual,
    delta: comparison.delta,
    narrative: narrative.text,
    computed_at: new Date(),
  });

  return {
    what_if: whatIf,
    narrative: narrative.text,
    original: comparison.original,
    counterfactual: comparison.counterfactual,
    delta: comparison.delta,
  };
}
```

### 5.4 Privacy Considerations for Counterfactuals

Counterfactual explanations involving specific employees must respect the same privacy rules as direct explanations:

| Rule | Implementation |
|---|---|
| Employee names are pseudonymized at appropriate depth | L1 counterfactual: "Another employee would have been assigned." L2: "E-5103 would have been assigned." L3: Full candidate details visible only to admin/compliance. |
| No performance comparison language | Counterfactual says "lower skill match" not "less skilled than" |
| No individual employee data visible to employees | An employee querying their own assignment can see "If you had not been available, another qualified employee would have been assigned" — never the specific alternative |
| Counterfactuals respect role-based access | A planner can see counterfactual details at L2. A shift supervisor at L1 only. |

### 5.5 Counterfactual API

```
POST /api/explain/{entity_type}/{entity_id}/counterfactual

Request Body:
{
  "what_if": "employee_unavailable",
  "params": {
    "employee_id": "emp_abc123"
  }
}

Response:
{
  "what_if": "employee_unavailable",
  "narrative": "If Maria had not been available, Tom would have been assigned to Picking Zone 3 on Monday morning. Tom has Picking proficiency Level 3 (vs Maria's Level 4), which would reduce expected throughput by approximately 8%. The assignment would also add 2 hours of overtime for Tom, increasing shift cost by $48.",
  "original": {
    "assigned_employee": "E-4821",
    "skill_match": 0.92,
    "overtime_impact_hours": 0,
    "estimated_cost": 168.00,
    "coverage_pct": 95
  },
  "counterfactual": {
    "assigned_employee": "E-5103",
    "skill_match": 0.78,
    "overtime_impact_hours": 2,
    "estimated_cost": 216.00,
    "coverage_pct": 95
  },
  "delta": {
    "skill_match": -0.14,
    "overtime_impact_hours": +2,
    "estimated_cost": +48.00,
    "coverage_pct": 0
  }
}
```

---

## 6. Explainability Metrics

### 6.1 Tracking Explanation Usage

| Metric | Measurement | Target |
|---|---|---|
| **Explanation request rate** | % of AI-influenced decisions where the user requests an explanation | Baseline tracking — high rate may indicate low trust, low rate may indicate trust or disengagement |
| **Explanation depth drill-down rate** | % of L1 explanations where users drill to L2, and L2 to L3 | < 20% drill-down from L2 to L3 indicates L2 is sufficient for most users |
| **Explanation satisfaction** | Implicit: did the user take a different action after reading the explanation? Explicit: optional thumbs-up/down on explanations | > 80% of explanations do not result in override (indicating the explanation was convincing) |
| **Counterfactual request rate** | % of decisions where users request a counterfactual | Baseline tracking — high rate indicates users are actively evaluating alternatives |
| **Time to explanation** | Latency from explanation request to display | L1/L2: < 500ms (pre-computed). L3: < 2s (may require data assembly). Counterfactual: < 10s (requires re-computation). |

### 6.2 Explanation Quality Monitoring

```typescript
// Monthly explanation quality audit (automated)
async function auditExplanationQuality(orgId: string, month: string): Promise<QualityReport> {
  // 1. Completeness: do all AI-influenced decisions have explanations?
  const decisionsWithoutExplanations = await db.query(`
    SELECT sa.id, sa.assignment_source
    FROM shift_assignment sa
    LEFT JOIN intelligence.explanations e
      ON e.entity_type = 'shift_assignment' AND e.entity_id = sa.id
    WHERE sa.organization_id = $1
      AND sa.assignment_source IN ('optimizer', 'ai_recommendation', 'automation')
      AND sa.created_at >= $2 AND sa.created_at < $3
      AND e.id IS NULL
  `, [orgId, monthStart, monthEnd]);

  // 2. Accuracy: for override-reversal cases, was the explanation plausible?
  // (If user overrode after reading explanation, the explanation may have been wrong)
  const overridesAfterExplanation = await getOverridesAfterExplanationView(orgId, month);

  // 3. Consistency: do similar decisions produce similar explanations?
  const explanationVariance = await measureExplanationConsistency(orgId, month);

  return {
    completeness: 1 - (decisionsWithoutExplanations.length / totalDecisions),
    overrideAfterExplanationRate: overridesAfterExplanation.rate,
    consistencyScore: explanationVariance.score,
    gaps: decisionsWithoutExplanations,
    recommendations: generateQualityRecommendations(completeness, overrideRate, consistency),
  };
}
```
