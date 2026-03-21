# AI Privacy, Ethics, and Guardrails

This document defines the ethical framework, tenant isolation model, data boundaries, guardrail architecture, and regulatory compliance strategy for AstraPlanner's Intelligence Plane. It is a binding specification: any feature that violates these rules must not ship.

---

## 1. AI Data Ethics Framework

### 1.1 Core Principle

**AI learns to serve users better, not to surveil them.**

The Intelligence Plane exists to reduce planning effort, improve plan quality, and surface operational insights. It does not exist to monitor employee behavior, rank individual performance, or provide management with a surveillance tool. Every learning capability in the system must pass a single test: "Does this make the planner's job easier or the plan's outcome better?" If the answer is no, the capability does not belong in the system.

### 1.2 Data Ownership

Data captured about users and employees belongs to the **organization** (the tenant), not to AstraPlanner. AstraPlanner is a data processor under GDPR and equivalent frameworks. This has concrete implications:

| Principle | Implementation |
|---|---|
| Organization owns all intelligence data | All `intelligence.*` tables are partitioned by `organization_id`. Data is never extracted, aggregated, or used outside the tenant boundary without explicit anonymization. |
| AstraPlanner cannot use tenant data for product improvement | No tenant-specific data — including interaction patterns, planning decisions, or model parameters — feeds into AstraPlanner's own product analytics or model training. Usage telemetry is limited to anonymized, aggregate product metrics (feature adoption rates, error rates). |
| Organization can export all intelligence data | The data export endpoint (`POST /api/gdpr/data-export`) includes all `intelligence.*` records for the requesting tenant. |
| Organization can delete all intelligence data | Tenant offboarding triggers complete deletion of all `intelligence.*` data within 30 days (see Section 2.6). |

### 1.3 User Transparency Rights

Every user has the right to understand what the system has learned about them.

| Right | Implementation | API Endpoint |
|---|---|---|
| **Right to inspect** | Users can view their own user intelligence profile: decision patterns, behavioral fingerprint, preference model, and trust scores. Presented in plain language, not raw data. | `GET /api/intelligence/my-profile` |
| **Right to explanation** | Users can request an explanation for any AI-influenced decision that affected them (e.g., "Why was I assigned to this shift?"). See `explainability.md` for full specification. | `GET /api/explain/{entity_type}/{entity_id}` |
| **Right to reset** | Users can reset their user model ("forget my preferences"). This deletes all records in `intelligence.user_profiles`, `intelligence.user_events`, and `intelligence.decision_events` for that user. The system reverts to default behavior for that user. | `POST /api/intelligence/reset-my-profile` |
| **Right to opt out** | Users can opt out of behavioral tracking. The system still functions (using site-level defaults instead of personalized models) but does not capture interaction-level events for that user. | `PATCH /api/intelligence/my-preferences { "behavioral_tracking": false }` |

**Reset implementation:**

```sql
-- Triggered by POST /api/intelligence/reset-my-profile
-- Executed as service role with tenant scoping

DELETE FROM intelligence.user_events
WHERE user_id = $user_id AND organization_id = $org_id;

DELETE FROM intelligence.decision_events
WHERE actor_id = $user_id AND organization_id = $org_id;

DELETE FROM intelligence.user_profiles
WHERE user_id = $user_id AND organization_id = $org_id;

-- Re-initialize with default profile
INSERT INTO intelligence.user_profiles (user_id, organization_id, created_at)
VALUES ($user_id, $org_id, now());

-- Audit the reset
INSERT INTO audit_log (organization_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json)
VALUES ($org_id, $user_id, 'user', 'intelligence_profile_reset', 'UserProfile', $user_id,
        '{"reason": "user_requested", "records_deleted": true}'::jsonb);
```

### 1.4 Anti-Surveillance Guarantees

These are hard constraints that no configuration can override:

| Guarantee | Enforcement |
|---|---|
| **Managers cannot access individual behavioral data of their reports** | RLS policy on `intelligence.user_profiles` and `intelligence.user_events`: only the user themselves and system-admin roles can read individual user intelligence records. Managers see only aggregate site-level intelligence. |
| **Behavioral data is never used for performance evaluation** | The `intelligence.user_profiles` table has no API endpoint that returns data in a format suitable for performance review. No "planner performance ranking" view exists or will be built. |
| **No employee performance ranking** | The system tracks per-employee productivity rates for planning accuracy (workload computation needs to know actual throughput). It never ranks, sorts, or compares employees by productivity in any user-facing output. See Section 4 for the explicit blocklist. |
| **No behavioral data in exports** | When a manager exports employee data, intelligence behavioral data is excluded. Only operational data (assignments, skills, availability) is included. |

**RLS policy for user intelligence data:**

```sql
-- Users can only read their own intelligence profile
CREATE POLICY user_profile_select ON intelligence.user_profiles
    FOR SELECT
    USING (
        organization_id = (auth.jwt() ->> 'organization_id')::uuid
        AND (
            user_id = auth.uid()  -- Users see their own profile
            OR (auth.jwt() ->> 'role') = 'admin'  -- Admins for system maintenance only
        )
    );

-- Managers explicitly cannot access individual user intelligence
-- There is no policy granting manager-role access to user_profiles
-- Aggregate site intelligence is served from intelligence.site_profiles (separate table)
```

---

## 2. Multi-Tenant AI Isolation

### 2.1 Isolation Principle

All learning models, parameters, predictions, and recommendations are strictly tenant-scoped. Tenant A's operational patterns, user behaviors, and model parameters never influence Tenant B's experience. The Intelligence Plane treats each tenant as a completely independent system.

### 2.2 Isolation Architecture

```
Tenant A (org_id: aaa-111)              Tenant B (org_id: bbb-222)
┌─────────────────────────────┐         ┌─────────────────────────────┐
│ intelligence.user_profiles  │         │ intelligence.user_profiles  │
│ intelligence.site_profiles  │         │ intelligence.site_profiles  │
│ intelligence.model_params   │         │ intelligence.model_params   │
│ intelligence.predictions    │         │ intelligence.predictions    │
│ intelligence.recommendations│         │ intelligence.recommendations│
│ intelligence.user_events    │         │ intelligence.user_events    │
│ intelligence.decision_events│         │ intelligence.decision_events│
│ intelligence.outcomes       │         │ intelligence.outcomes       │
│ intelligence.explanations   │         │ intelligence.explanations   │
│ intelligence.pattern_obs    │         │ intelligence.pattern_obs    │
│ intelligence.external_sigs  │         │ intelligence.external_sigs  │
│ intelligence.feedback       │         │ intelligence.feedback       │
└─────────────────────────────┘         └─────────────────────────────┘
         │                                        │
         │  NEVER crosses this boundary           │
         └────────────── ✕ ────────────────────────┘
```

### 2.3 Data Isolation by Type

| Data Type | Table(s) | Isolation Level | Sharing Policy | Deletion on Offboarding |
|---|---|---|---|---|
| User behavioral events | `intelligence.user_events` | Tenant + user scoped | Never shared | Deleted within 30 days |
| User intelligence profiles | `intelligence.user_profiles` | Tenant + user scoped | Never shared | Deleted within 30 days |
| Site intelligence profiles | `intelligence.site_profiles` | Tenant + site scoped | Anonymized aggregate benchmarks only (k >= 20) | Deleted within 30 days |
| Model parameters | `intelligence.model_parameters` | Tenant scoped | Never shared | Deleted within 30 days |
| Predictions | `intelligence.predictions` | Tenant scoped | Never shared | Deleted within 30 days |
| Recommendations | `intelligence.recommendations` | Tenant scoped | Never shared | Deleted within 30 days |
| Decision events | `intelligence.decision_events` | Tenant + user scoped | Never shared | Deleted within 30 days |
| Outcomes | `intelligence.outcomes` | Tenant scoped | Never shared | Deleted within 30 days |
| Pattern observations | `intelligence.pattern_observations` | Tenant scoped | Never shared | Deleted within 30 days |
| Explanations | `intelligence.explanations` | Tenant scoped | Never shared | Deleted within 30 days |
| External signals | `intelligence.external_signals` | Tenant scoped | Public data (weather, holidays) may overlap across tenants but stored per-tenant | Deleted within 30 days |
| Feedback | `intelligence.feedback` | Tenant + user scoped | Never shared | Deleted within 30 days |

### 2.4 Cross-Tenant Benchmark Policy

The only scenario where data from multiple tenants is used together is **anonymized, aggregated benchmarking**. This is strictly bounded:

| Rule | Specification |
|---|---|
| **k-anonymity minimum** | No benchmark is published unless it aggregates data from at least k = 20 distinct organizations. |
| **No identifying attributes** | Benchmark data contains only statistical aggregates: mean, median, P25, P75, standard deviation. No organization names, site names, or any identifying metadata. |
| **Opt-in only** | Organizations must explicitly opt in to contribute data to benchmarks. Default is opted out. Configured in `Organization.settings_json.benchmark_participation`. |
| **Aggregate-only metrics** | Benchmarks cover only operational statistics: absence rates, overtime ratios, plan quality scores, coverage percentages, FTE utilization. Never financial data (labor costs, hourly rates). |
| **No reverse engineering** | Benchmarks with fewer than 20 contributors are suppressed. If removing any single contributor would make a metric identifiable (e.g., one outlier dominates the mean), that metric is excluded. |

**Example benchmark output (what a tenant sees):**

```json
{
  "benchmark": "warehouse_dc_absence_rate",
  "industry": "e-commerce_fulfillment",
  "region": "europe",
  "contributors": 47,
  "period": "2026-Q1",
  "statistics": {
    "mean": 0.087,
    "median": 0.082,
    "p25": 0.065,
    "p75": 0.098,
    "your_value": 0.121,
    "your_percentile": 89
  },
  "interpretation": "Your absence rate (12.1%) is higher than 89% of comparable operations. Industry median is 8.2%."
}
```

### 2.5 Model Weight and Parameter Storage

All learned model parameters are stored per-tenant in `intelligence.model_parameters`:

```sql
CREATE TABLE intelligence.model_parameters (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
    site_id UUID REFERENCES site(id) ON DELETE CASCADE,  -- NULL for org-level models
    model_type TEXT NOT NULL,  -- 'absence_prediction', 'demand_adjustment', 'productivity_calibration', etc.
    model_version INTEGER NOT NULL DEFAULT 1,
    parameters JSONB NOT NULL,  -- Model-specific parameters (weights, coefficients, thresholds)
    training_metadata JSONB,    -- Training data summary: row count, date range, feature list (no raw data)
    performance_metrics JSONB,  -- Accuracy, precision, recall, last evaluation date
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (organization_id, site_id, model_type, model_version)
);

-- RLS: tenant-scoped
ALTER TABLE intelligence.model_parameters ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.model_parameters FORCE ROW LEVEL SECURITY;

CREATE POLICY model_params_tenant_isolation ON intelligence.model_parameters
    FOR ALL
    USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
    WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);

-- Encryption: parameters column encrypted at rest via Supabase's PostgreSQL encryption (AES-256)
-- Additional application-level encryption for sensitive model weights using pgsodium:
-- SELECT pgsodium.crypto_aead_ietf_encrypt(parameters::bytea, '', nonce, key_id)
```

### 2.6 Tenant Offboarding: Intelligence Data Deletion

When a tenant cancels their account, all intelligence data is deleted within 30 days:

```
Tenant offboarding triggered (Organization.status = 'cancelled')
    │
    ├── Day 0: Access blocked (login disabled for all tenant users)
    │
    ├── Day 1-7: Grace period data export available
    │   └── Tenant admin can request export of all intelligence.* data
    │
    ├── Day 7-14: Intelligence data deletion job scheduled
    │   └── pg_cron job: DELETE FROM intelligence.* WHERE organization_id = $org_id
    │       Tables deleted in dependency order:
    │       1. intelligence.feedback
    │       2. intelligence.explanations
    │       3. intelligence.recommendations
    │       4. intelligence.predictions
    │       5. intelligence.outcomes
    │       6. intelligence.decision_events
    │       7. intelligence.user_events
    │       8. intelligence.pattern_observations
    │       9. intelligence.external_signals
    │       10. intelligence.model_parameters
    │       11. intelligence.site_profiles
    │       12. intelligence.user_profiles
    │
    ├── Day 14-21: Verification
    │   └── Automated check: SELECT count(*) FROM intelligence.* WHERE organization_id = $org_id
    │       Must return 0 for all tables. If not, re-run deletion and alert ops.
    │
    └── Day 21-30: Confirmation
        └── Audit record: 'intelligence_data_purged' with table-level row counts
```

### 2.7 RLS Policies on All Intelligence Tables

Every table in the `intelligence` schema uses the same RLS pattern as the core schema (documented in `multi-tenancy.md`). The canonical policy:

```sql
-- Applied to every intelligence.* table
ALTER TABLE intelligence.{table_name} ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligence.{table_name} FORCE ROW LEVEL SECURITY;

CREATE POLICY {table_name}_tenant_isolation ON intelligence.{table_name}
    FOR ALL
    USING (organization_id = (auth.jwt() ->> 'organization_id')::uuid)
    WITH CHECK (organization_id = (auth.jwt() ->> 'organization_id')::uuid);
```

Additional user-scoped policies are applied where specified (e.g., `user_profiles`, `user_events` — see Section 1.4).

---

## 3. What AI Is Allowed to Learn (Explicit Allowlist)

The Intelligence Plane may learn and model the following categories of patterns. Any learning capability not on this list requires explicit approval through the AI governance review process before implementation.

### 3.1 Planning Patterns

| What the system learns | How it learns | How it is used | Privacy impact |
|---|---|---|---|
| How plans are constructed (optimizer settings, manual adjustments, approval patterns) | User event stream: plan generation, manual edits, approval decisions | Personalize recommendation delivery; pre-populate optimizer settings; predict which assignments will be overridden | Low — captures planning decisions, not personal information |
| What shift patterns are preferred per site | Override analysis: which shift patterns are kept vs modified | Suggest preferred shift patterns during plan generation | None — site-level aggregate |
| Planning cadence and timing | Session timestamps, plan generation frequency | Optimize insight delivery timing; predict when planner will next need a plan | Low — captures work patterns of planners (with opt-out per Section 1.3) |

### 3.2 Operational Patterns

| What the system learns | How it learns | How it is used | Privacy impact |
|---|---|---|---|
| Demand seasonality (daily, weekly, monthly, annual cycles) | Demand history analysis (statistical decomposition) | Improve demand forecast accuracy; suggest staffing adjustments for anticipated peaks | None — business data, not personal |
| Absence rates (aggregate, by site/department/day-of-week) | Attendance records aggregated to group level | Calibrate absence buffers in workload computation; generate absence risk alerts | Low — aggregate statistics only; never per-employee absence prediction shown to managers |
| Productivity trends (throughput per process, per proficiency level) | Outcome data: planned vs actual throughput | Calibrate workload computation; identify process bottlenecks; suggest cross-training | Medium — derived from employee output but used only in aggregate for planning |
| Cost patterns (overtime trends, agency usage, labor cost per unit) | Plan outcomes, payroll integration data | Generate cost optimization recommendations; benchmark efficiency across sites | None — financial metrics at site level |

### 3.3 Preference Patterns

| What the system learns | How it learns | How it is used | Privacy impact |
|---|---|---|---|
| Which recommendations are accepted vs rejected | Recommendation feedback events | Improve recommendation relevance; adjust recommendation volume and timing | Low — captures planner decisions |
| Override patterns (what the planner changes and why) | Override events with context | Pre-empt unnecessary recommendations; learn implicit preferences | Low — captures planning decisions |
| Information density preferences | UI interaction analysis: which widgets are used, how much detail is consumed | Adapt dashboard layout and information density per user | Low — UI usage patterns (with opt-out) |

### 3.4 Performance Patterns (Plan Quality Only)

| What the system learns | How it learns | How it is used | Privacy impact |
|---|---|---|---|
| Plan quality metrics (coverage achievement, constraint satisfaction, cost efficiency) | Outcome reconciliation: planned vs actual | Score plan quality; identify systemic planning gaps; track improvement over time | None — plan-level metrics, not employee-level |
| Coverage achievement rates per site | Actual staffing vs planned staffing | Calibrate coverage targets; identify sites that consistently under/over-staff | None — site-level aggregate |
| Cost trend accuracy (predicted vs actual labor cost) | Financial reconciliation | Improve cost estimation accuracy | None — financial metrics |

---

## 4. What AI Is NOT Allowed to Learn (Explicit Blocklist)

These are hard prohibitions. No feature, configuration, or customer request can override these restrictions. Violations are treated as security incidents.

### 4.1 Individual Employee Performance Rankings

**Prohibited:** The system never ranks, sorts, compares, or scores individual employees by performance, productivity, efficiency, or any proxy thereof.

**Why it exists in the system at all:** The workload computation engine needs per-employee productivity rates (e.g., "Employee E-4821 picks at 91 lines/hr at proficiency Level 4") to accurately compute required FTEs. This data is used exclusively as a planning input.

**What is blocked:**
- No "top performers" or "bottom performers" list, view, report, or API endpoint
- No employee-to-employee productivity comparison in any user-facing output
- No sorting of employees by productivity in any recommendation or assignment explanation
- No alert or insight that identifies specific employees as low-performing
- No trend analysis of individual employee productivity over time presented to managers

**Technical enforcement:**

```typescript
// Output guardrail: strip any employee ranking from AI-generated content
function enforceNoPerformanceRanking(aiOutput: AIResponse): AIResponse {
  const blockedPatterns = [
    /employee.*rank/i, /top.*performer/i, /bottom.*performer/i,
    /least.*productive/i, /most.*productive/i, /slower.*than/i,
    /faster.*than/i, /underperform/i, /outperform/i,
    /performance.*score/i, /efficiency.*rank/i
  ];
  for (const pattern of blockedPatterns) {
    if (pattern.test(JSON.stringify(aiOutput))) {
      auditLog.warn('ai_guardrail_blocked', { pattern: pattern.source, output_hash: hash(aiOutput) });
      return sanitizeRankedContent(aiOutput);
    }
  }
  return aiOutput;
}
```

### 4.2 Protected Characteristics Correlation

**Prohibited:** The system never correlates scheduling patterns, assignment decisions, recommendation outcomes, or any operational metric with protected characteristics (age, gender, ethnicity, disability, religion, sexual orientation, marital status, pregnancy, national origin).

**Why this matters:** Even if protected characteristic data is not directly ingested, proxy variables (zip code, part-time status, shift preferences, absence patterns) can correlate with protected groups. The system must actively prevent this.

**What is blocked:**
- No ingestion of protected characteristic data from HRIS integrations (fields are rejected at the integration mapping stage)
- No correlation analysis between assignment patterns and any demographic proxy
- No AI model that uses demographic features or proxies as input variables
- No insight that references employee demographics in any form

**Technical enforcement:**

```typescript
// Integration field blocklist: these fields are rejected during HRIS mapping
const BLOCKED_HRIS_FIELDS = [
  'date_of_birth', 'age', 'gender', 'sex', 'ethnicity', 'race',
  'nationality', 'religion', 'marital_status', 'disability_status',
  'sexual_orientation', 'pregnancy_status', 'veteran_status',
  'national_origin', 'genetic_information'
];

// Reject at integration configuration time
function validateFieldMapping(mapping: FieldMapping[]): ValidationResult {
  const blocked = mapping.filter(m =>
    BLOCKED_HRIS_FIELDS.includes(m.sourceField.toLowerCase().replace(/[^a-z_]/g, '_'))
  );
  if (blocked.length > 0) {
    return {
      valid: false,
      error: `Protected characteristic fields cannot be imported: ${blocked.map(b => b.sourceField).join(', ')}. ` +
             `AstraPlanner does not process demographic data to prevent discrimination risk.`
    };
  }
  return { valid: true };
}
```

### 4.3 Disciplinary or HR Status

**Prohibited:** The system never ingests, stores, learns from, or uses HR action data including disciplinary records, performance improvement plans, grievances, complaints, investigations, or termination reasons.

**Why:** Workforce planning decisions must be based on operational criteria (skills, availability, hours, preferences), not HR status. Using HR data in planning decisions creates legal liability and ethical harm.

**What is blocked:**
- No HRIS field mapping for disciplinary status, PIP status, or HR case data
- No AI model uses employment "risk" scores from external HR systems
- No recommendation considers an employee's HR history

### 4.4 Personal Life Patterns of Employees

**Prohibited:** The system never infers or models reasons for employee absences, personal circumstances, or life events.

**What the system does:** The absence prediction model predicts the **probability** that a given position will be unfilled on a given day, based on aggregate historical patterns (day-of-week effects, seasonal effects, team-level trends). It does not predict which **specific employee** will be absent or why.

**What is blocked:**
- No per-employee absence prediction shown to managers or planners (only aggregate site/department-level absence probability)
- No inference of absence reasons ("Employee X is frequently absent on Mondays" is never surfaced)
- No pattern analysis of individual employee absence timing
- No correlation between absence patterns and external signals (weather, events) at the individual level

### 4.5 Inter-Employee Relationship Patterns

**Prohibited:** The system never models social dynamics, interpersonal relationships, team cohesion metrics at the individual level, or any social graph among employees.

**What is blocked:**
- No modeling of which employees "work well together" based on behavioral signals
- No analysis of communication patterns, collaboration frequency, or social influence
- No "team chemistry" scoring or recommendation based on interpersonal dynamics
- No detection of employee cliques, factions, or social groupings

**What is allowed:** The system may learn that certain **skill combinations** on a team produce better outcomes (e.g., "teams with a mix of L3 and L5 pickers achieve higher throughput than all-L3 teams"). This is skill-based, not person-based.

### 4.6 Competitive Intelligence

**Prohibited:** No learning from one tenant is ever used to advantage or inform another tenant.

**What is blocked:**
- No cross-tenant model transfer (Tenant A's absence model never seeds Tenant B's model)
- No "industry benchmarks" derived from fewer than 20 contributing tenants (see Section 2.4)
- No tenant-specific operational data visible to AstraPlanner staff for sales, marketing, or competitive purposes
- No use of tenant data in case studies, marketing materials, or sales collateral without explicit written consent

---

## 5. Guardrail Architecture

### 5.1 Input Guardrails: What Data Enters the Intelligence Plane

```
External Data Sources                    Intelligence Plane Boundary
                                         ┌──────────────────────────┐
  HRIS Integration ──→ Field Blocklist ──→│                          │
                         (Section 4.2)    │                          │
  User Events ────────→ PII Scrubber ────→│                          │
                                          │   Intelligence           │
  Domain Events ──────→ Sensitive Field ──→│   Processing             │
                         Classifier       │                          │
  Claude API Calls ───→ PII Stripping ───→│                          │
                         Middleware       │                          │
  Demand/Workload ────→ Direct pass ─────→│                          │
  (no PII)                                └──────────────────────────┘
```

#### 5.1.1 PII Scrubbing Before Claude API Calls

The existing PII stripping middleware (documented in `ai-integration.md` Section 10) is extended to all intelligence pipeline calls, not just direct Claude API invocations:

```typescript
// Extended PII scrubber for intelligence pipeline
interface PIIScrubConfig {
  // Fields that are NEVER sent to any AI service or stored in intelligence tables
  neverFields: string[];
  // Fields that are anonymized (replaced with deterministic pseudonym)
  anonymizeFields: string[];
  // Fields that pass through unchanged (operational data)
  allowFields: string[];
}

const INTELLIGENCE_PII_CONFIG: PIIScrubConfig = {
  neverFields: [
    'first_name', 'last_name', 'email', 'phone', 'address',
    'ssn', 'national_id', 'tax_id', 'bank_account',
    'medical_notes', 'health_records', 'emergency_contact',
    'date_of_birth', 'photo_url'
  ],
  anonymizeFields: [
    'employee_id',    // → deterministic hash E-XXXX
    'employee_number', // → deterministic hash
    'site_name',      // → Site-01, Site-02, etc.
    'department_name'  // → Dept-A, Dept-B, etc.
  ],
  allowFields: [
    'skill_code', 'proficiency_level', 'process_code',
    'contract_type', 'weekly_hours', 'shift_pattern',
    'assignment_date', 'demand_quantity', 'productivity_rate'
  ]
};
```

#### 5.1.2 Sensitive Field Classification

| Classification | Fields | Treatment in Intelligence Pipeline |
|---|---|---|
| **NEVER** (PII / Special Category) | Employee names, email, phone, address, SSN, medical data, emergency contacts, date of birth, photos | Stripped before any intelligence processing. Never stored in `intelligence.*` tables. |
| **ANONYMIZE** (Quasi-identifiers) | Employee ID, employee number, site name, department name | Replaced with deterministic pseudonyms that allow internal consistency but prevent re-identification. |
| **ALLOW** (Operational) | Skill codes, proficiency levels, process codes, contract types, weekly hours, shift patterns, demand quantities, productivity rates | Pass through unchanged — these are operational data required for planning intelligence. |
| **AGGREGATE** (Sensitive operational) | Hourly rates, overtime hours, absence dates | Used only in aggregate (site/department level). Individual values never stored in user-facing intelligence outputs. |

#### 5.1.3 Quasi-Identifier Detection

Combinations of non-PII fields that could re-identify individuals are detected and mitigated:

```typescript
// Quasi-identifier detection for intelligence pipeline outputs
const QUASI_ID_COMBINATIONS = [
  ['department', 'contract_type', 'weekly_hours'],  // small department + unique contract = identifiable
  ['site', 'shift_pattern', 'skill_set'],           // rare skill at small site = identifiable
  ['hire_year', 'department', 'proficiency_level'],  // long-tenure + rare skill = identifiable
];

function checkQuasiIdentifiers(record: IntelligenceRecord, siteContext: SiteContext): QuasiIdRisk {
  for (const combo of QUASI_ID_COMBINATIONS) {
    const groupSize = getGroupSize(record, combo, siteContext);
    if (groupSize < 5) {
      return {
        risk: 'high',
        combination: combo,
        groupSize,
        action: 'generalize',  // Replace specific values with ranges/categories
        message: `Combination ${combo.join('+')} identifies a group of only ${groupSize}. Generalizing.`
      };
    }
  }
  return { risk: 'low' };
}

// Generalization: replace specific values with ranges
// "weekly_hours: 32" → "weekly_hours_band: part_time"
// "hire_year: 2019" → "tenure_band: 5-10_years"
```

### 5.2 Processing Guardrails: What the Intelligence Plane Computes

#### 5.2.1 Bias Detection

Automated bias detection runs as part of every model training pipeline and every plan generation cycle:

```typescript
// Bias detection pipeline (runs daily via pg_cron at 03:00)
interface BiasCheckResult {
  metric: string;
  dimension: string;
  groups: { group: string; value: number; count: number }[];
  disparateImpact: number;  // ratio of lowest-performing group to highest
  threshold: number;        // 0.8 per four-fifths rule
  passed: boolean;
  action: 'none' | 'flag' | 'block';
}

async function runBiasDetection(orgId: string, siteId: string): Promise<BiasCheckResult[]> {
  const checks: BiasCheckResult[] = [];

  // Check 1: Overtime distribution by department
  // Are certain departments systematically assigned more overtime?
  checks.push(await checkDistribution(orgId, siteId, 'overtime_hours', 'department'));

  // Check 2: Undesirable shift distribution by contract type
  // Are part-time employees disproportionately assigned to night/weekend shifts?
  checks.push(await checkDistribution(orgId, siteId, 'undesirable_shifts', 'contract_type'));

  // Check 3: Skill development opportunity distribution by tenure band
  // Are newer employees getting fewer cross-training opportunities?
  checks.push(await checkDistribution(orgId, siteId, 'cross_training_assignments', 'tenure_band'));

  // Check 4: Assignment preference satisfaction by department
  // Are some departments' preferences systematically ignored?
  checks.push(await checkDistribution(orgId, siteId, 'preference_satisfaction_rate', 'department'));

  return checks;
}
```

**Four-fifths rule:** For any measurable outcome (overtime hours, desirable shift assignments, cross-training opportunities), the ratio between the most-advantaged and least-advantaged group must not fall below 0.8. If it does, the system flags the pattern for human review.

**Bias detection does not require protected characteristic data.** It checks distribution equity across operational groups (departments, contract types, tenure bands, shift patterns). If any operational group is systematically disadvantaged, it indicates a potential problem regardless of whether that group correlates with a protected characteristic.

#### 5.2.2 Fairness Constraints

The optimizer incorporates fairness constraints that prevent systematic disadvantage:

```sql
-- Fairness constraint: overtime distribution
-- Maximum overtime standard deviation across employees within a site-week
-- Prevents concentration of overtime on a few employees
ALTER TABLE site ADD COLUMN IF NOT EXISTS
  max_overtime_stddev_hours NUMERIC(4,1) DEFAULT 4.0;

-- Fairness constraint: undesirable shift distribution
-- Maximum ratio of undesirable shifts (night, weekend, holiday) per employee
-- relative to the site average. Prevents repeatedly assigning the same
-- employees to unwanted shifts.
ALTER TABLE site ADD COLUMN IF NOT EXISTS
  max_undesirable_shift_ratio NUMERIC(3,2) DEFAULT 1.5;
```

#### 5.2.3 Outcome Monitoring

Continuous monitoring detects whether AI-influenced decisions systematically disadvantage any employee cohort:

| Metric | Measurement | Threshold | Action if Breached |
|---|---|---|---|
| Overtime distribution equity | Coefficient of variation of overtime hours per employee per month | CV > 0.6 | Flag for planner review; include in weekly insight digest |
| Shift desirability equity | Gini coefficient of undesirable shift count per employee per quarter | Gini > 0.35 | Flag for manager review; recommend rotation adjustment |
| Cross-training access | Standard deviation of cross-training hours per employee per quarter | SD > 8 hours | Recommend cross-training for under-served employees |
| Recommendation acceptance by employee | Are recommendations involving certain employees systematically rejected? | Rejection rate for any employee > 2x site average | Investigate; may indicate planner bias (not system bias) — surface to compliance |

### 5.3 Output Guardrails: What the Intelligence Plane Recommends

#### 5.3.1 Recommendation Content Rules

Every AI-generated recommendation, insight, or explanation must comply with these rules before delivery to the user:

| Rule | Specification | Enforcement |
|---|---|---|
| **No individual characteristics beyond skills and availability** | Recommendations reference employees by skill match, availability, overtime impact, and preference — never by personal attributes, reliability, attitude, or behavioral traits. | Output filter checks for blocked terms (see Section 4.1 enforcement) |
| **Role-appropriate explanations** | Planners see: "Employee A is the best match for Process X based on skill level (L4) and availability." Managers see the same plus cost context. No role ever sees: "Employee A is more reliable than Employee B." | Explanation template system with role-based rendering (see `explainability.md`) |
| **No comparative employee language** | Explanations never compare employees to each other in evaluative terms. "Employee A has Skill X at Level 4" is allowed. "Employee A is better than Employee B" is prohibited. | Output content filter with pattern matching |
| **Bounded automation** | Automated actions respect the safety boundaries defined in `ai-vision.md` Section 3.4. No autonomous action exceeds the granted autonomy level for its decision type. | Autonomy rules engine validates every automated action before execution |

#### 5.3.2 Output Content Filter

```typescript
// Final output filter applied to all AI-generated content before delivery
function filterAIOutput(output: AIOutput, context: OutputContext): FilteredAIOutput {
  let filtered = output;

  // 1. Strip any PII that leaked through (defense in depth)
  filtered = stripLeakedPII(filtered);

  // 2. Remove employee performance comparisons
  filtered = removePerformanceComparisons(filtered);

  // 3. Remove protected characteristic references
  filtered = removeProtectedCharacteristicRefs(filtered);

  // 4. Apply role-appropriate detail level
  filtered = applyRoleFilter(filtered, context.userRole);

  // 5. Validate explanation depth matches user role
  filtered = enforceExplanationDepth(filtered, context.userRole);

  // 6. Log the filtering action for audit
  await auditLog.write({
    action: 'ai_output_filtered',
    filters_applied: filtered.filtersApplied,
    content_hash: hash(output),
    filtered_hash: hash(filtered),
    organization_id: context.orgId,
  });

  return filtered;
}
```

---

## 6. Compliance Integration

### 6.1 GDPR Article 22: Automated Decision-Making

Workforce assignment is automated decision-making that significantly affects individuals. AstraPlanner must comply with Article 22 requirements.

#### 6.1.1 AstraPlanner's Position

| GDPR Article 22 Requirement | AstraPlanner's Response |
|---|---|
| Right not to be subject to solely automated decisions with significant effects | Plan publication always requires human approval. The system never auto-publishes a plan that assigns employees to shifts without a human reviewer. Even at Level 4 autonomy, the scope is limited to routine adjustments (absence backfill), not wholesale plan creation. |
| Right to obtain human intervention | The planner reviews and approves every plan before it affects employees. Employees can request review of their assignment through their manager. |
| Right to express a point of view | Employees can set shift preferences and availability constraints. These are hard inputs to the optimizer, not optional hints. |
| Right to obtain an explanation of the decision | The explanation endpoint reconstructs the decision factors for any ShiftAssignment. See Section 6.1.2. |

#### 6.1.2 Explanation Endpoint for Automated Decisions

```
GET /api/explain/shift_assignment/{assignment_id}

Response:
{
  "assignment": {
    "employee_id": "E-4821",
    "process": "Picking - Zone 3",
    "date": "2026-03-25",
    "shift": "Morning A (06:00-14:00)"
  },
  "decision_factors": [
    {
      "factor": "Skill match",
      "value": "Picking proficiency Level 4 (required: Level 3+)",
      "weight": 0.30,
      "contribution": "positive"
    },
    {
      "factor": "Availability",
      "value": "Available, no conflicting assignments or leave",
      "weight": 0.25,
      "contribution": "positive"
    },
    {
      "factor": "Overtime impact",
      "value": "0 additional overtime hours (within contracted 40h)",
      "weight": 0.20,
      "contribution": "positive"
    },
    {
      "factor": "Home site",
      "value": "This is the employee's home site (no travel required)",
      "weight": 0.15,
      "contribution": "positive"
    },
    {
      "factor": "Preference match",
      "value": "Employee prefers morning shifts (matched)",
      "weight": 0.10,
      "contribution": "positive"
    }
  ],
  "alternatives_considered": 12,
  "decision_source": "optimizer_v3 + planner_approval",
  "approved_by": "usr_planner_01",
  "approved_at": "2026-03-22T09:15:00Z"
}
```

### 6.2 GDPR Article 35: DPIA for AI-Driven Workforce Planning

A Data Protection Impact Assessment is required because AstraPlanner involves:

1. **Large-scale processing of employee personal data** — potentially thousands of employees per tenant
2. **Systematic monitoring of work patterns** — shift assignments, attendance tracking, overtime recording
3. **Automated decision-making affecting individuals** — optimizer-generated shift assignments
4. **AI-based profiling** — the Intelligence Plane builds user and site models from behavioral data

The DPIA must be completed before any AI learning features process live employee data. See `gdpr-compliance.md` Section 6 for the DPIA structure and timeline.

### 6.3 EU AI Act: High-Risk AI Classification

Workforce management AI is likely classified as **high-risk** under the EU AI Act (Article 6, Annex III, Category 4: "AI systems intended to be used for making decisions affecting terms of work-related relationships, the promotion or termination of work-related contractual relationships, for the allocation of tasks based on individual behavior, personal traits or characteristics").

#### 6.3.1 EU AI Act Compliance Matrix

| EU AI Act Requirement | AstraPlanner Implementation |
|---|---|
| **Transparency** (Article 13) | Every AI output includes an explanation. Users are informed when AI has influenced a decision. AI-generated content is labeled as such. The system documentation describes all AI capabilities, limitations, and data usage. |
| **Human oversight** (Article 14) | Human-in-the-loop at plan publication (Level 0 for all plan approvals). Planners can override any AI recommendation. Autonomy levels are configurable and revocable per decision type. Kill switch: any admin can disable all AI features instantly via `Organization.settings_json.ai_enabled = false`. |
| **Accuracy** (Article 15) | Model performance metrics tracked continuously (accuracy, precision, recall). Models that fall below accuracy thresholds are automatically deactivated (see `ai-vision.md` Section 3.4, autonomy revocation). Prediction accuracy reported in weekly insight digests. |
| **Robustness** (Article 15) | Deterministic fallback for every AI feature (see `ai-integration.md` Section 9). Circuit breaker prevents cascading failures. System functions without AI (plans still generate via optimizer). Input validation prevents adversarial data injection. |
| **Data governance** (Article 10) | Training data is tenant-scoped and documented. Data quality checks run before model training. Bias detection runs on every model update. Data lineage tracked: every model knows which data it was trained on and when. |
| **Risk management** (Article 9) | This document serves as the risk management framework. Guardrails (Sections 3-5) define boundaries. Bias detection (Section 5.2) monitors ongoing risk. Incident response: any guardrail violation triggers an automated alert to the tenant admin and AstraPlanner compliance team. |
| **Record-keeping** (Article 12) | All AI decisions logged in `intelligence.explanations`. Model versions tracked in `intelligence.model_parameters`. Training data lineage in `training_metadata`. Audit trail for all model updates, deployments, and deactivations. |
| **Registration** (Article 51) | AstraPlanner must register in the EU AI Act database before deploying high-risk AI features in the EU. Registration includes: intended purpose, risk assessment summary, conformity assessment results. |

### 6.4 SOC 2 Implications

| SOC 2 Trust Service Criteria | AI-Specific Requirement | AstraPlanner Implementation |
|---|---|---|
| **CC6.1** (Logical access controls) | AI model access restricted to authorized processes | `intelligence.*` tables protected by RLS. Model parameter updates require `admin` or `system` role. No user-facing write access to model tables. |
| **CC7.2** (System monitoring) | AI system behavior monitored for anomalies | Model performance dashboards. Prediction accuracy tracked. Guardrail violation alerting. Circuit breaker metrics. |
| **CC8.1** (Change management) | AI model updates follow change management process | Model versions tracked. Rollback capability (activate previous model version). Model deployment requires approval for production-grade models. |
| **PI1.4** (Processing integrity) | AI outputs are accurate and complete | Bias detection runs on every model training cycle. Output validation against guardrails. Explanation stored for every AI-influenced decision. |

### 6.5 Compliance Status Summary

| Regulation | Requirement | AstraPlanner Implementation | Status |
|---|---|---|---|
| GDPR Art. 22 | Human oversight for automated decisions | Human-in-the-loop at plan publication; explanation endpoint | Designed, implementation in Phase 1 |
| GDPR Art. 35 | DPIA for high-risk processing | DPIA framework defined in `gdpr-compliance.md` | Planned, pre-launch |
| GDPR Art. 5(1)(b) | Purpose limitation | AI learns only for planning improvement (Section 3 allowlist) | Enforced by design |
| GDPR Art. 5(1)(c) | Data minimization | PII stripping middleware; sensitive field classification | Implemented (MVP) |
| GDPR Art. 13/14 | Transparency | User profile inspection; explanation endpoints; AI labeling | Designed, Phase 1-2 |
| EU AI Act Art. 6 | High-risk classification | Self-assessed as high-risk; compliance matrix (Section 6.3.1) | Assessed |
| EU AI Act Art. 9 | Risk management | Guardrail architecture (Section 5); bias detection | Designed, Phase 1-2 |
| EU AI Act Art. 13 | Transparency | Explainability framework (see `explainability.md`) | Designed, Phase 1-2 |
| EU AI Act Art. 14 | Human oversight | Autonomy levels with human approval gates | Designed, Phase 1 |
| EU AI Act Art. 51 | Registration | Must register before EU deployment of high-risk features | Not started |
| SOC 2 CC6.1 | Access control for AI models | RLS on intelligence tables; role-based model management | Designed |
| SOC 2 CC8.1 | Change management for models | Model versioning and deployment approval | Designed, Phase 2 |
| UK GDPR | Same as GDPR (post-Brexit equivalent) | Same implementation as GDPR | Same status |
| CCPA | Right to know, right to delete | Data export and deletion endpoints cover intelligence data | Designed |

---

## 7. Governance Process

### 7.1 AI Feature Review

Every new AI learning capability must go through a governance review before implementation:

1. **Proposer** files an AI Feature Proposal describing: what the system will learn, how it will learn, how the output will be used, what data is required, and privacy impact assessment.
2. **Engineering review** validates technical feasibility and guardrail compliance.
3. **Privacy review** validates against the allowlist (Section 3) and blocklist (Section 4). Any feature touching employee data requires explicit privacy sign-off.
4. **Compliance review** validates against GDPR, EU AI Act, and SOC 2 requirements.
5. **Approval** requires sign-off from engineering lead + privacy lead. Features touching the blocklist (Section 4) are auto-rejected and require escalation to executive review.

### 7.2 Incident Response for Guardrail Violations

If a guardrail is violated (blocked content passes filters, bias threshold breached, cross-tenant data leakage detected):

1. **Immediate:** The offending feature is disabled via feature flag. Affected AI outputs are quarantined.
2. **Within 4 hours:** Root cause analysis initiated. Affected tenants notified if data was exposed.
3. **Within 24 hours:** Fix deployed or confirmed timeline for fix. Post-incident review scheduled.
4. **Within 7 days:** Post-incident report published internally. Guardrail strengthened to prevent recurrence.
5. **If GDPR-relevant:** Follows the 72-hour breach notification procedure in `gdpr-compliance.md` Section 7.
