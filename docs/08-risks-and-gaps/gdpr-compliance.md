# AstraPlanner GDPR Compliance Procedures

This document defines the GDPR compliance framework for AstraPlanner, covering data inventory, data subject rights implementation, retention policies, sub-processor agreements, cross-border transfers, breach notification, and a prioritized implementation checklist.

---

## 1. Data Inventory

### 1.1 Personal Data Collected

| Data Category | Entity/Table | Specific Fields | Legal Basis | Retention Period |
|---|---|---|---|---|
| **Employee Identity** | `employee` | `first_name`, `last_name`, `employee_number` | Legitimate interest (workforce planning) / Contract performance | Active employment + 2 years |
| **Employee Contact** | `employee` | `email`, `phone` | Legitimate interest (schedule notifications) | Active employment + 2 years |
| **Compensation** | `employee` | `hourly_rate`, `pay_grade` | Contract performance (payroll integration) | Active employment + 2 years |
| **Employment Details** | `employee` | `hire_date`, `termination_date`, `contract_type`, `weekly_hours_contracted`, `seniority_date` | Contract performance | Active employment + 7 years (tax/labor compliance) |
| **Employee Preferences** | `employee` | `preferences_json` (shift preferences, days-off) | Consent / Legitimate interest | Active employment + 2 years |
| **Employee Metadata** | `employee` | `metadata_json` (custom fields from HR integration) | Legitimate interest | Active employment + 2 years |
| **Skills & Certifications** | `employee_skill` | `proficiency_level`, `certification_date`, `training_hours_completed`, `assessment_notes` | Legitimate interest (workforce capability) | Active employment + 2 years |
| **Work Schedules** | `shift_assignment` | Employee-to-shift mappings, actual hours, overtime | Legitimate interest / Contract performance | 2 years active, then rolled up |
| **Activity Logs** | `audit_log` | `actor_id`, `actor_ip_address`, actions performed | Legitimate interest (security, compliance) | 7 years |
| **Notifications** | `notification` | `target_user_id` + notification content | Legitimate interest | 90 days |
| **Organization Contact** | `organization` | `billing_email`, `primary_contact_name`, `primary_contact_phone` | Contract performance | Duration of contract + 2 years |
| **Auth Records** | Supabase Auth | Email, password hash, MFA config, login timestamps | Contract performance | Account lifetime + 30 days after deletion |

### 1.2 Data Storage Locations

| Location | Provider | Region | Data Types | Encryption |
|---|---|---|---|---|
| Supabase PostgreSQL | Supabase (AWS) | Configurable per `data_residency_region` | All entity data | AES-256 at rest, TLS 1.3 in transit |
| Supabase Auth | Supabase (AWS) | Same as database | Authentication records | AES-256 at rest |
| Redis Cache | Upstash | Configurable | Cached entity data (ephemeral) | TLS in transit, encrypted at rest |
| Vercel Edge | Vercel (AWS/Cloudflare) | Global edge | Static assets, server-side rendered pages | TLS in transit |
| S3 Archive | AWS S3 | Same region as database | Historical data in Parquet | SSE-S3 or SSE-KMS |
| Claude API | Anthropic | US | Prompt data (workforce context sent for AI features) | TLS in transit; Anthropic does not retain API inputs for training |

### 1.3 Data Flow Diagram

```
External Systems                    AstraPlanner                         Sub-Processors

  WMS/OMS ──── demand data ──────► Edge Functions ──► PostgreSQL
  HRIS ─────── employee data ────► (validation)       (primary store)
  Payroll ──── compensation ─────►                        │
                                                          │
  Employee ─── preferences ──────► Next.js App ──────► Supabase Auth
  Manager ──── approvals ────────► (frontend)            │
  Planner ──── plan edits ───────►                       │
                                                          │
                                    ┌─────────────────────┤
                                    │                     │
                                    ▼                     ▼
                                  Redis              Claude API
                                (cache only)     (AI features only,
                                                  PII pseudonymized)
                                    │                     │
                                    │                     ▼
                                    ▼               Anthropic servers
                                 S3 Archive          (no data retained)
                              (historical data)
```

---

## 2. Data Subject Rights Implementation

### 2.1 Right of Access (Article 15)

**Scope:** Any employee (data subject) can request a copy of all personal data held about them.

**Implementation:**

```sql
-- Export all data for an employee across all tables
-- This query is executed by a service-role Edge Function after identity verification

-- 1. Core employee record
SELECT * FROM employee WHERE id = $1 AND organization_id = $2;

-- 2. Skills and certifications
SELECT * FROM employee_skill WHERE employee_id = $1 AND organization_id = $2;

-- 3. Shift assignments (current + historical)
SELECT * FROM shift_assignment WHERE employee_id = $1 AND organization_id = $2
ORDER BY assignment_date DESC;

-- 4. Audit log entries where employee was the actor
SELECT * FROM audit_log WHERE actor_id = $1 AND organization_id = $2
ORDER BY created_at DESC;

-- 5. Notifications sent to the employee
SELECT * FROM notification WHERE target_user_id = $1 AND organization_id = $2
ORDER BY created_at DESC;

-- 6. Department manager references
SELECT id, name, code FROM department
WHERE manager_employee_id = $1 AND organization_id = $2;

-- 7. Skill assessments performed by this employee
SELECT es.*, e.employee_number AS assessed_employee
FROM employee_skill es
JOIN employee e ON es.employee_id = e.id
WHERE es.assessed_by = $1 AND es.organization_id = $2;
```

**Process:**
1. Data subject submits request via in-app form or email to org's data controller.
2. Org admin verifies identity (match employee_number + email + secondary verification).
3. System generates JSON/CSV export via dedicated Edge Function endpoint: `POST /api/gdpr/data-export`.
4. Export is encrypted and delivered within 30 days (GDPR requirement).
5. Audit log entry created: `action = 'gdpr_data_export'`, `entity_type = 'Employee'`.

**Response format:** JSON document containing all data organized by category, with machine-readable field names and a human-readable summary.

---

### 2.2 Right to Rectification (Article 16)

**Scope:** Employee can request correction of inaccurate personal data.

**Affected tables:**
- `employee` — name, email, phone, preferences, metadata
- `employee_skill` — assessment notes, certification dates
- Supabase Auth — email address

**Implementation:**

```sql
-- Rectification is performed as a standard UPDATE with full audit trail
-- The application enforces that only correctable fields are modified

-- 1. Update employee record
UPDATE employee SET
    first_name = $new_first_name,
    last_name = $new_last_name,
    email = $new_email,
    phone = $new_phone,
    updated_at = now()
WHERE id = $employee_id AND organization_id = $org_id;

-- 2. The updated_at trigger fires automatically
-- 3. Audit log trigger captures before_state and after_state
-- 4. If email changed, update Supabase Auth record via admin API
```

**Process:**
1. Data subject submits rectification request with specific corrections.
2. Org admin verifies the request and applies corrections.
3. System propagates changes: if email changes, update Supabase Auth.
4. Cache invalidation fires for affected employee records.
5. Confirmation sent to data subject within 30 days.

---

### 2.3 Right to Erasure (Article 17) — "Right to Be Forgotten"

This is the most complex right to implement because employee data is referenced across multiple tables, including embedded references in JSONB blobs.

#### 2.3.1 Erasure Decision Tree

```
Employee erasure request received
    │
    ├── Is there a legal obligation to retain? (e.g., tax, labor law)
    │   ├── YES → Retain with restricted processing (see Section 2.5)
    │   │         Notify data subject of legal basis for retention
    │   └── NO → Proceed with erasure
    │
    ├── Is the employee currently active?
    │   ├── YES → Cannot erase while employment relationship exists
    │   │         (legal basis: contract performance)
    │   └── NO → Proceed with erasure
    │
    └── Execute erasure procedure (see below)
```

#### 2.3.2 Table-by-Table Erasure Procedure

**Step 1: `employee_skill` — straightforward deletion**

```sql
DELETE FROM employee_skill
WHERE employee_id = $employee_id AND organization_id = $org_id;
```

**Step 2: `notification` — delete all notifications targeting this user**

```sql
DELETE FROM notification
WHERE target_user_id = $user_id AND organization_id = $org_id;
```

**Step 3: `shift_assignment` — anonymize historical, delete future**

Historical shift assignments are needed for aggregate reporting (coverage metrics, labor cost analysis) but the personal link must be severed.

```sql
-- Delete future/draft assignments
DELETE FROM shift_assignment
WHERE employee_id = $employee_id
  AND organization_id = $org_id
  AND assignment_date > CURRENT_DATE;

-- Anonymize historical assignments
-- Replace employee_id with a deterministic anonymous UUID
-- This preserves aggregate metrics while removing the personal link
UPDATE shift_assignment SET
    employee_id = gen_random_uuid(),  -- breaks the link permanently
    employee_acknowledged = false,
    override_reason = NULL,
    updated_at = now()
WHERE employee_id = $employee_id
  AND organization_id = $org_id;
```

**Step 4: `plan_version.summary_metrics_json` — no employee-level PII**

The `summary_metrics_json` field contains only aggregate KPIs (total hours, coverage percentages). No employee-level data is stored here. No action needed.

**Step 5: `audit_log` — anonymize actor references**

Audit logs must be retained for compliance but the personal link must be severed.

```sql
-- Anonymize actor_id in audit logs
UPDATE audit_log SET
    actor_id = NULL,
    actor_ip_address = NULL,
    -- Redact PII from before_state and after_state JSONB
    before_state = CASE
        WHEN before_state IS NOT NULL THEN
            before_state - 'first_name' - 'last_name' - 'email' - 'phone'
                         - 'hourly_rate' - 'pay_grade'
        ELSE NULL
    END,
    after_state = CASE
        WHEN after_state IS NOT NULL THEN
            after_state - 'first_name' - 'last_name' - 'email' - 'phone'
                        - 'hourly_rate' - 'pay_grade'
        ELSE NULL
    END,
    changes_json = CASE
        WHEN changes_json IS NOT NULL THEN
            changes_json - 'first_name' - 'last_name' - 'email' - 'phone'
                         - 'hourly_rate' - 'pay_grade'
        ELSE NULL
    END
WHERE actor_id = $user_id AND organization_id = $org_id;

-- Also anonymize audit logs where this employee was the subject
-- Note: audit_log immutability trigger must be temporarily bypassed
-- via service role for GDPR erasure. This is the one exception.
UPDATE audit_log SET
    before_state = CASE
        WHEN entity_type = 'Employee' AND entity_id = $employee_id AND before_state IS NOT NULL THEN
            before_state - 'first_name' - 'last_name' - 'email' - 'phone'
                         - 'hourly_rate' - 'pay_grade'
        ELSE before_state
    END,
    after_state = CASE
        WHEN entity_type = 'Employee' AND entity_id = $employee_id AND after_state IS NOT NULL THEN
            after_state - 'first_name' - 'last_name' - 'email' - 'phone'
                        - 'hourly_rate' - 'pay_grade'
        ELSE after_state
    END
WHERE entity_type = 'Employee' AND entity_id = $employee_id AND organization_id = $org_id;
```

**Step 6: `department` — clear manager reference**

```sql
UPDATE department SET
    manager_employee_id = NULL,
    updated_at = now()
WHERE manager_employee_id = $employee_id AND organization_id = $org_id;
```

**Step 7: `employee_skill` assessed_by references**

```sql
UPDATE employee_skill SET
    assessed_by = NULL,
    updated_at = now()
WHERE assessed_by = $employee_id AND organization_id = $org_id;
```

**Step 8: `employee` — delete the core record**

```sql
DELETE FROM employee
WHERE id = $employee_id AND organization_id = $org_id;
```

**Step 9: Supabase Auth — delete user record**

```typescript
// Via Supabase Admin API (Edge Function with service role)
const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
```

**Step 10: Cache invalidation**

```typescript
// Invalidate all cache keys referencing this employee
await redis.del(`org:${orgId}:site:${siteId}:employees`);
await redis.del(`org:${orgId}:site:${siteId}:skill_matrix`);
// Force materialized view refresh
await supabase.rpc('refresh_materialized_views');
```

**Step 11: S3 archived data**

```
- Scan archived Parquet files for employee_id
- Rewrite Parquet files with employee data anonymized
- This is the most expensive operation and may take 24-48 hours for large archives
- Document the process and timeline in the response to the data subject
```

#### 2.3.3 JSONB Embedded References

The `plan_version` table has a `summary_metrics_json` field that contains only aggregate metrics — no employee-level data. However, if any custom JSONB fields in `settings_json`, `preferences_json`, `metadata_json`, or `optimizer_config_json` contain employee references, they must be scrubbed:

```sql
-- Scrub any JSONB fields that might contain the employee's name or ID
-- This is a safety sweep across all JSONB columns
UPDATE plan_version SET
    optimizer_config_json = regexp_replace(
        optimizer_config_json::text,
        $employee_id::text,
        'REDACTED',
        'g'
    )::jsonb
WHERE organization_id = $org_id
  AND optimizer_config_json::text LIKE '%' || $employee_id::text || '%';
```

#### 2.3.4 Audit Trail for Erasure

The erasure operation itself must be logged (without PII):

```sql
INSERT INTO audit_log (organization_id, actor_id, actor_type, action, entity_type, entity_id, metadata_json)
VALUES (
    $org_id,
    $admin_user_id,
    'user',
    'gdpr_erasure',
    'Employee',
    $employee_id,
    jsonb_build_object(
        'request_date', $request_date,
        'completion_date', now(),
        'tables_affected', ARRAY['employee', 'employee_skill', 'shift_assignment', 'audit_log', 'notification', 'department'],
        'records_deleted', $deleted_count,
        'records_anonymized', $anonymized_count
    )
);
```

---

### 2.4 Right to Data Portability (Article 20)

**Scope:** Data subject can request their data in a structured, commonly used, machine-readable format.

**Export format:** JSON (primary), CSV (alternative).

**API endpoint:** `POST /api/gdpr/data-portability`

**Export structure:**

```json
{
  "export_metadata": {
    "data_subject_id": "employee_number",
    "organization": "org_name",
    "export_date": "2026-03-20T00:00:00Z",
    "format_version": "1.0",
    "schema": "https://astraplanner.io/schemas/gdpr-export-v1.json"
  },
  "personal_data": {
    "identity": { "first_name": "...", "last_name": "...", "employee_number": "..." },
    "contact": { "email": "...", "phone": "..." },
    "employment": { "hire_date": "...", "contract_type": "...", "weekly_hours": 40.0 },
    "compensation": { "hourly_rate": 22.50, "pay_grade": "W3" },
    "preferences": { "preferred_shift": "morning", "days_off": ["sunday"] }
  },
  "skills": [
    { "process": "Case Pick", "proficiency_level": 4, "certification_date": "2025-11-20" }
  ],
  "schedule_history": [
    { "date": "2026-03-25", "site": "CHI-DC-01", "shift": "Morning A", "process": "Case Pick", "hours": 8.0 }
  ]
}
```

---

### 2.5 Right to Restrict Processing (Article 18)

**Scope:** Data subject can request that their data be stored but not actively processed (e.g., not included in optimizer runs).

**Implementation:** Soft-restriction via employee status and a processing flag.

```sql
-- Restrict processing: set status and add restriction flag
UPDATE employee SET
    status = 'suspended',
    metadata_json = metadata_json || '{"gdpr_processing_restricted": true, "restriction_date": "2026-03-20"}'::jsonb,
    updated_at = now()
WHERE id = $employee_id AND organization_id = $org_id;
```

**Application-level enforcement:**
- The optimizer must check `metadata_json ->> 'gdpr_processing_restricted'` and exclude restricted employees from shift assignments.
- Restricted employees are not included in skill matrix calculations.
- Existing shift assignments remain visible but no new assignments are created.
- The employee's data remains in the database but is not actively used for planning.

---

## 3. Data Retention Policies

### 3.1 Retention Schedule

| Entity | Active Retention | Post-Termination | Archive Format | Purge After | Legal Basis for Retention |
|---|---|---|---|---|---|
| `employee` (PII fields) | Active employment | 2 years | Anonymized in-place | Anonymized, never fully purged (referential integrity) | Legitimate interest, tax/labor compliance |
| `employee` (non-PII fields) | Active employment | 7 years | In database | 7 years post-termination | Tax and labor law compliance |
| `employee_skill` | Active employment | 2 years | Deleted | 2 years post-termination | No legal obligation |
| `shift_assignment` | 90 days | 2 years active, then rolled up | Monthly rollup + Parquet on S3 | 5 years (rolled up aggregates) | Labor law, payroll audit |
| `workload_plan` | 90 days | 2 years | Monthly rollup + Parquet | 5 years | Business records |
| `demand_forecast` | 2 years | N/A (no PII) | Monthly rollup + Parquet | 7 years | Business records |
| `audit_log` | 1 year | N/A | Parquet on S3 | 7 years | SOC 2, legal compliance |
| `notification` | 30 days | N/A | Not archived | 90 days | No legal obligation |
| `plan_version` (metadata) | 6 months post plan period | Indefinite | In database | Never | Business records |
| Supabase Auth records | Account lifetime | 30 days post-deletion | N/A | 30 days | GDPR minimization |

### 3.2 Automated Retention Enforcement

```sql
-- Nightly retention job (run via pg_cron at 03:00 UTC)

-- 1. Anonymize terminated employees after 2 years
UPDATE employee SET
    first_name = 'Anonymized',
    last_name = 'Employee-' || LEFT(id::text, 8),
    email = NULL,
    phone = NULL,
    hourly_rate = NULL,
    preferences_json = '{}',
    metadata_json = jsonb_build_object('anonymized_at', now()::text, 'original_metadata', '{}')
WHERE status = 'terminated'
  AND termination_date < CURRENT_DATE - INTERVAL '2 years'
  AND first_name != 'Anonymized';

-- 2. Delete expired notifications
DELETE FROM notification
WHERE created_at < CURRENT_DATE - INTERVAL '90 days';

-- 3. Archive old audit logs (handled by partition management)
-- See scalability-design.md for partition detach/archive procedures
```

---

## 4. Data Processing Agreements (DPA)

### 4.1 Sub-Processor Register

| Sub-Processor | Service | Data Processed | DPA Status | Data Location | SCCs Required |
|---|---|---|---|---|---|
| **Supabase** (via AWS) | Database, Auth, Edge Functions, Realtime | All entity data, authentication records | Required | US-East (default), EU available | Yes (US transfers) |
| **Vercel** (via AWS/Cloudflare) | Frontend hosting, serverless functions | Session tokens, rendered pages (no PII stored) | Required | Global edge (transient) | Yes (global edge) |
| **Anthropic** (Claude API) | AI-powered planning recommendations | Pseudonymized workforce data in prompts | Required | US | Yes (US transfers); verify Anthropic's data retention policy |
| **Upstash** (Redis) | Caching, rate limiting | Cached entity data (ephemeral, TTL-limited) | Required | Configurable | Depends on region |
| **AWS S3** | Archive storage | Historical data in Parquet format | Covered by Supabase DPA or direct AWS DPA | Same region as database | Depends on region |

### 4.2 DPA Requirements

Each DPA must include:
- Subject matter and duration of processing
- Nature and purpose of processing
- Types of personal data processed
- Categories of data subjects
- Obligations and rights of the controller
- Sub-processor's obligations:
  - Process data only on documented instructions
  - Ensure persons authorized to process have committed to confidentiality
  - Implement appropriate technical and organizational security measures
  - Assist with data subject rights requests
  - Delete or return all personal data after end of service
  - Make available all information necessary to demonstrate compliance
  - Allow and contribute to audits

### 4.3 Anthropic-Specific Considerations

The Claude API integration requires special attention:

- **Data minimization:** Never send raw PII to Claude. Pseudonymize employee names and use aggregate data where possible.
- **Prompt logging:** Verify Anthropic's policy on prompt/completion logging. As of the current API terms, Anthropic does not use API inputs for model training.
- **Data residency:** Claude API is hosted in the US. EU customers' data will cross borders when AI features are used.
- **Mitigation:** Offer an option to disable AI features for organizations that cannot accept US data transfers. Document this in the AI feature consent flow.

---

## 5. Cross-Border Data Transfers

### 5.1 Transfer Mechanisms

| Transfer | Mechanism | Status |
|---|---|---|
| EU to US (Supabase) | Standard Contractual Clauses (SCCs), Module 2 (controller-to-processor) | Required; negotiate with Supabase |
| EU to US (Anthropic/Claude) | SCCs Module 2 + supplementary measures (pseudonymization) | Required; verify with Anthropic |
| EU to US (Vercel) | SCCs Module 2 (transient processing only) | Required; verify with Vercel |
| EU to EU (EU-hosted Supabase) | No transfer mechanism needed | Available; use EU region for EU customers |
| UK transfers | UK International Data Transfer Agreement (IDTA) | Required for UK customers |

### 5.2 Supplementary Measures

For transfers to the US:
1. **Pseudonymization** of employee PII before transfer to AI services.
2. **Encryption** in transit (TLS 1.3) and at rest (AES-256).
3. **Access controls** — US-based sub-processors access only data necessary for their function.
4. **Data residency option** — EU customers can choose EU-region Supabase deployment.
5. **Contractual protections** — sub-processors must notify of government access requests.

### 5.3 Data Residency Implementation

The `organization.data_residency_region` field controls data placement:

| Region Value | Database Region | S3 Region | Cache Region | AI Features |
|---|---|---|---|---|
| `us-east` | AWS us-east-1 | us-east-1 | us-east-1 | Full (Claude US) |
| `eu-west` | AWS eu-west-1 | eu-west-1 | eu-west-1 | Limited (pseudonymized data sent to US) |
| `eu-central` | AWS eu-central-1 | eu-central-1 | eu-central-1 | Limited |
| `ap-southeast` | AWS ap-southeast-1 | ap-southeast-1 | ap-southeast-1 | Limited |

---

## 6. Data Protection Impact Assessment (DPIA) Outline

A full DPIA is required under Article 35 because AstraPlanner involves:
- Large-scale processing of employee personal data
- Systematic monitoring of employee work patterns (shift assignments, attendance)
- Automated decision-making affecting employees (optimizer-generated assignments)

### 6.1 DPIA Structure

1. **Description of processing**
   - Nature: Collection, storage, analysis, and automated processing of employee workforce data
   - Scope: All employees of subscribing organizations (potentially millions)
   - Context: Workforce planning for logistics operations
   - Purpose: Optimize shift scheduling, ensure labor law compliance, forecast workforce needs

2. **Necessity and proportionality assessment**
   - Is this processing necessary? Yes — manual workforce planning at scale is not viable
   - Is it proportionate? Yes — only data relevant to scheduling is collected
   - Could the purpose be achieved with less data? Partial — compensation data could be omitted if payroll integration is not used

3. **Risk assessment** (see `security-threat-model.md` for detailed STRIDE analysis)
   - Risk to data subjects: unauthorized access to PII, discriminatory automated decisions, schedule manipulation
   - Risk to organization: regulatory fines, reputational damage, operational disruption

4. **Measures to address risks**
   - Technical: RLS, encryption, pseudonymization, access controls
   - Organizational: DPAs, training, incident response procedures
   - Monitoring: audit logs, anomaly detection, periodic access reviews

### 6.2 DPIA Timeline

| Phase | Activity | Target Date | Owner |
|---|---|---|---|
| 1 | Draft DPIA document | Pre-launch - 60 days | DPO / Privacy Lead |
| 2 | Internal review (engineering + legal) | Pre-launch - 45 days | Engineering Lead + Legal |
| 3 | DPA consultation (if required by supervisory authority) | Pre-launch - 30 days | DPO |
| 4 | Implement identified mitigations | Pre-launch - 14 days | Engineering |
| 5 | Final approval and sign-off | Pre-launch - 7 days | DPO + CEO |
| 6 | Annual review and update | Launch + 12 months | DPO |

---

## 7. Breach Notification Procedures

### 7.1 72-Hour Notification Timeline

```
Hour 0: Breach detected or reported
    │
    ├── Immediately: Activate incident response team
    ├── Immediately: Contain the breach (revoke access, patch vulnerability)
    │
    ▼
Hour 0-4: Initial assessment
    ├── What data was affected?
    ├── How many data subjects?
    ├── What is the likely impact?
    ├── Is the breach ongoing?
    │
    ▼
Hour 4-24: Detailed investigation
    ├── Root cause analysis
    ├── Scope determination (which organizations/employees affected)
    ├── Evidence preservation (audit logs, access logs)
    │
    ▼
Hour 24-48: Notification preparation
    ├── Draft supervisory authority notification
    ├── Draft affected organization notifications
    ├── Draft data subject notifications (if high risk)
    │
    ▼
Hour 48-72: Notification delivery
    ├── Submit to lead supervisory authority (Article 33)
    ├── Notify affected organizations (controller-to-controller)
    ├── If high risk: notify affected data subjects (Article 34)
    │
    ▼
Post-72 hours: Ongoing
    ├── Continue investigation
    ├── Implement remediation
    ├── Update supervisory authority with additional details
    └── Post-incident review and lessons learned
```

### 7.2 Notification Content (Article 33)

The supervisory authority notification must include:
1. Nature of the breach (type, categories of data, approximate number of subjects)
2. Contact details of the DPO
3. Likely consequences of the breach
4. Measures taken or proposed to address the breach

### 7.3 Breach Severity Classification

| Severity | Criteria | Notification Required | Example |
|---|---|---|---|
| Low | No PII exposed; system vulnerability discovered but not exploited | Internal log only | Failed SQL injection attempt blocked by parameterized queries |
| Medium | Limited PII exposed to unauthorized internal users | Supervisory authority + affected organization | RLS misconfiguration allowing read access to 1 other tenant's non-compensation employee data |
| High | PII including compensation data exposed externally | Supervisory authority + affected organizations + affected data subjects | Database credential leak exposing employee records |
| Critical | Mass cross-tenant data breach; authentication bypass | Supervisory authority (all) + all affected organizations + all affected data subjects + public disclosure | Supabase service role key compromised; full database access |

### 7.4 Breach Detection Mechanisms

| Mechanism | What It Detects | Response |
|---|---|---|
| RLS bypass test failures in CI/CD | Schema changes that break tenant isolation | Block deployment |
| Anomalous query patterns (pg_stat_statements) | Unusual SELECT patterns, cross-tenant JOINs | Alert security team |
| Failed authentication rate monitoring | Credential stuffing attempts | Progressive lockout + alert |
| Audit log anomaly detection | Unusual actor patterns, bulk data access | Alert security team |
| S3 access logging | Unauthorized archive access | Alert + block |
| Supabase Dashboard access alerts | Admin panel access from unusual IPs | Alert + MFA re-verification |

---

## 8. Technical Measures

### 8.1 Encryption

| Layer | Method | Key Management |
|---|---|---|
| Data at rest (PostgreSQL) | AES-256 (Supabase-managed) | Supabase manages; keys rotated automatically |
| Data at rest (S3 archive) | SSE-S3 or SSE-KMS | AWS KMS; per-tenant keys recommended for enterprise tier |
| Data in transit | TLS 1.3 (minimum TLS 1.2) | Certificate managed by Supabase/Vercel |
| Integration credentials | AES-256-GCM (`integration_config.connection_params_encrypted`) | Per-tenant encryption keys stored in Supabase Vault |
| SSO configuration | AES-256-GCM (`organization.sso_config_json`) | Same as above |
| Backups | Encrypted by Supabase | Supabase-managed |

### 8.2 Pseudonymization Strategy

For AI features and analytics, employee data is pseudonymized before processing:

```typescript
// Pseudonymization function for AI prompt construction
function pseudonymizeEmployee(employee: Employee): PseudonymizedEmployee {
  return {
    id: hashWithSalt(employee.id, tenantSalt),  // deterministic but irreversible
    skills: employee.skills.map(s => ({
      process_code: s.process_code,           // non-PII, kept as-is
      proficiency_level: s.proficiency_level,  // non-PII, kept as-is
    })),
    contract_type: employee.contract_type,     // category, not PII
    weekly_hours: employee.weekly_hours,        // aggregate, not PII
    // PII fields omitted entirely: name, email, phone, hourly_rate
  };
}
```

### 8.3 Access Controls Summary

| Role | Employee PII | Compensation | Schedules | Plans | Audit Logs | Integrations |
|---|---|---|---|---|---|---|
| Owner | Read/Write | Read/Write | Read | Read/Write | Read | Read/Write |
| Admin | Read/Write | Read/Write | Read | Read/Write | Read | Read/Write |
| Planner | Read | No access | Read/Write | Read/Write | Read | No access |
| Manager | Read (own dept) | No access | Read (own dept) | Read | No access | No access |
| Employee | Read (self only) | Read (self only) | Read (self only) | No access | No access | No access |
| Viewer | Read | No access | Read | Read | No access | No access |

---

## 9. Implementation Checklist

| # | Task | Priority | Effort | Status | Depends On |
|---|---|---|---|---|---|
| 1 | Create data processing register (Article 30) | P0 | Low | Not started | — |
| 2 | Implement GDPR data export endpoint (Article 15) | P0 | Medium | Not started | — |
| 3 | Implement GDPR erasure procedure (Article 17) | P0 | High | Not started | #2 |
| 4 | Implement audit log PII anonymization for erasure | P0 | High | Not started | #3 |
| 5 | Sign DPA with Supabase | P0 | Low | Not started | — |
| 6 | Sign DPA with Vercel | P0 | Low | Not started | — |
| 7 | Sign DPA with Anthropic | P0 | Low | Not started | — |
| 8 | Draft and publish privacy policy | P0 | Medium | Not started | #1 |
| 9 | Implement consent management for AI features | P1 | Medium | Not started | — |
| 10 | Implement data rectification endpoint (Article 16) | P1 | Low | Not started | — |
| 11 | Implement processing restriction flag (Article 18) | P1 | Low | Not started | — |
| 12 | Implement data portability export (Article 20) | P1 | Medium | Not started | #2 |
| 13 | Conduct DPIA | P1 | High | Not started | #1, #8 |
| 14 | Implement automated retention enforcement (nightly job) | P1 | Medium | Not started | — |
| 15 | Implement PII scrubbing in application logs | P1 | Medium | Not started | — |
| 16 | Implement AI prompt pseudonymization | P1 | Medium | Not started | — |
| 17 | Set up breach notification workflow and templates | P1 | Medium | Not started | — |
| 18 | Implement employee self-service data access in UI | P2 | High | Not started | #2 |
| 19 | Establish SCCs with US-based sub-processors | P2 | Medium | Not started | #5, #6, #7 |
| 20 | Implement per-tenant encryption keys for enterprise tier | P2 | High | Not started | — |
| 21 | Build GDPR admin dashboard (request tracking, status) | P2 | High | Not started | #2, #3, #10, #11 |
| 22 | Train org admins on GDPR procedures | P2 | Low | Not started | #8, #17 |
| 23 | Implement S3 archive PII anonymization for erasure | P2 | High | Not started | #3 |
| 24 | Annual DPIA review process | P3 | Low | Not started | #13 |
| 25 | Appoint DPO (if required by scale of processing) | P1 | Low | Not started | — |

**Effort estimates:** Low = 1-2 days, Medium = 3-5 days, High = 1-3 weeks.

**Priority definitions:** P0 = must have before launch (legal requirement), P1 = should have before launch (risk reduction), P2 = implement within 90 days post-launch, P3 = ongoing.
