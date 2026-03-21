# Data Model Gap Analysis

## Adversarial Audit: schema.sql Fitness for Real Workforce Planning

**Audit Date**: 2026-03-20
**Auditor**: Automated adversarial review
**Schema File**: `docs/04-data-model/schema.sql` (1,145 lines)
**Maturity Score**: 6/10 (well-structured draft, never tested, missing entities)

---

## 1. Executive Summary

`schema.sql` is the single most complete artifact in the AstraPlanner codebase. It defines 18 tables, 1 join table, 3 materialized views, 22 ENUM types, 20+ indexes, full RLS policies, and trigger-based audit log protection. The SQL is syntactically careful and follows PostgreSQL conventions.

However, it has never been executed against a database. It has never been tested with real data. Several structural issues would surface on first execution or first real-world use. Multiple entities required for actual workforce planning are missing.

---

## 2. Execution Readiness Assessment

### 2.1 Would schema.sql Execute Successfully?

**Likely yes, with caveats.** The schema is written in dependency order with deferred foreign keys handled via `ALTER TABLE` statements. Specific concerns:

| Issue | Severity | Details |
|-------|----------|---------|
| `auth.organization_id()` function | Blocking in non-Supabase environment | This function is defined in the `auth` schema (`CREATE OR REPLACE FUNCTION auth.organization_id()`). In Supabase, the `auth` schema exists. In plain PostgreSQL, it does not. The schema would fail on line 858 unless the `auth` schema is created first. |
| `auth.uid()` reference | Blocking in non-Supabase environment | The notification RLS policy on line 1016 references `auth.uid()`, which is a Supabase-provided function. Not defined in this schema. |
| `pg_trgm` extension | Minor | Requires `pg_trgm` to be available. Standard in PostgreSQL 15+ but must be enabled. The `CREATE EXTENSION IF NOT EXISTS` handles this gracefully. |
| `pgcrypto` extension | Minor | Same as above. Handled gracefully. |
| Materialized view `mv_site_dashboard` | Will succeed but return empty | References `shift_assignment` and `site` tables which will be empty. No issue, but worth noting. |

**Verdict**: The schema will execute successfully on a fresh Supabase PostgreSQL instance. It will fail on vanilla PostgreSQL due to `auth` schema dependencies.

### 2.2 Migration Infrastructure

There is no migration infrastructure. The schema is a single monolithic file. This means:

- No incremental migration path. Any schema change requires re-running the entire file or manually writing ALTER statements.
- No version tracking. No tool (Prisma, Drizzle, Supabase migrations, Flyway) is configured.
- No rollback capability.
- No environment separation (dev/staging/prod).

**First step**: Set up `supabase db init` and convert `schema.sql` into an initial migration file.

---

## 3. Bug Analysis

The following bugs and issues exist in `schema.sql`:

### Bug 1: Missing `created_by` Foreign Key on Multiple Tables

`process_productivity_standard.created_by` (line 248) is typed as `UUID NOT NULL` but has no foreign key constraint. It presumably references either `employee(id)` or a Supabase Auth user. Same for `scenario.created_by` (line 480) and `plan_version.created_by` (line 516). These are dangling references -- the database will accept any UUID, including non-existent ones.

### Bug 2: `approved_by` on `plan_version` Has No FK

`plan_version.approved_by` (line 509) is a `UUID` with no foreign key. Same problem as Bug 1.

### Bug 3: `notification.target_user_id` Has No FK

`notification.target_user_id` (line 706) references a Supabase Auth user but has no foreign key to `auth.users`. This is by design in Supabase (you typically do not FK to `auth.users`), but it means the database cannot enforce referential integrity for notifications. A notification can reference a deleted user.

### Bug 4: `audit_log.actor_id` Has No FK

`audit_log.actor_id` (line 669) is nullable with no foreign key. The `entity_id` (line 674) is documented as a "polymorphic reference" with no FK constraint. While this is a deliberate design choice for flexibility, it means the audit log can contain references to non-existent entities with no database-level validation.

### Bug 5: `process.applicable_site_types` is TEXT[] Not ENUM[]

`process.applicable_site_types` (line 208) is `TEXT[]` but should contain values from the `site_type` ENUM. There is no check constraint enforcing that array elements are valid `site_type` values. A process could be created with `applicable_site_types = '{invalid_type, nonsense}'` and the database would accept it.

### Bug 6: `labor_rule.applies_to_contract_types` is TEXT[] Not ENUM[]

Same issue as Bug 5. `labor_rule.applies_to_contract_types` (line 641) defaults to `'{full_time,part_time,temporary,seasonal,contractor}'` as TEXT values, but `contract_type` is a defined ENUM. No validation that array elements match the ENUM.

### Bug 7: `shift_pattern.days_of_week` Lacks Range Validation

`shift_pattern.days_of_week` (line 443) is `SMALLINT[]` representing days of the week. There is no CHECK constraint ensuring values are between 0-6 (or 1-7). The database would accept `days_of_week = '{99, -5, 1000}'`.

### Bug 8: Circular Reference Between `scenario` and `plan_version`

`scenario.parent_plan_version_id` references `plan_version(id)`, and `plan_version.scenario_id` references `scenario(id)`. This circular FK creates insertion complexity -- you cannot insert a scenario that references a plan_version that references back to that scenario without deferring one constraint or using NULL. The schema handles this with nullable FKs, but the application logic must be careful about insertion order.

### Bug 9: `demand_forecast` Unique Index Uses COALESCE Hack

Line 543: `CREATE UNIQUE INDEX uq_demand_forecast_combo ON demand_forecast (organization_id, site_id, demand_type_id, forecast_date, COALESCE(plan_version_id, '00000000-0000-0000-0000-000000000000'));`

This uses a hardcoded UUID zero as a sentinel value for NULL plan_version_id. While functional, it is fragile -- if anyone ever creates a plan_version with this UUID (astronomically unlikely but architecturally dirty), it would cause collisions. A partial unique index would be cleaner.

### Bug 10: No Composite Index for `shift_assignment` Double-Booking Prevention Across Plan Versions

The unique constraint `uq_shift_assignment_no_double_book` (line 610-611) includes `plan_version_id` in the uniqueness check. This means the same employee CAN be double-booked at the same time in different plan versions. This is intentional for what-if scenarios, but there is no mechanism to prevent double-booking when a plan version is published/approved. A published plan should not allow an employee to be assigned to two places at the same time.

### Bug 11: `workload_plan.coverage_pct` is Not Computed

`coverage_pct` (line 564) is stored as a column with a default of 0. It should be `hours_assigned / hours_needed * 100` according to the COMMENT. But there is no trigger or computed column to maintain this. The application must manually update it, creating a risk of stale data.

### Bug 12: Overnight Shift Handling

`shift_pattern` has `start_time TIME` and `end_time TIME` with `is_overnight BOOLEAN`. For an overnight shift (22:00-06:00), `end_time < start_time`. The CHECK constraint `ck_sp_duration` validates `duration_hours > 0 AND duration_hours <= 24`, but there is no validation that `duration_hours` is consistent with the difference between `start_time` and `end_time` (accounting for overnight wrapping). A shift defined as 22:00-06:00 with `duration_hours = 2` would pass all constraints.

### Bug 13: No Soft Delete Pattern

Multiple tables have status columns (`employee_status`, `site_status`, etc.) but no consistent soft-delete pattern. `ON DELETE CASCADE` on several foreign keys means a hard delete of an organization cascades to delete all sites, departments, processes, employees, and plans. For a multi-tenant SaaS, this is dangerous -- an accidental organization deletion wipes all data with no recovery path (no soft-delete, no trash/archive).

### Bug 14: `integration_config.connection_params_encrypted` Assumes Application-Level Encryption

The column is `BYTEA NOT NULL` with a COMMENT saying "AES-256-GCM encrypted connection credentials. Per-tenant encryption keys." But there is no encryption infrastructure. No key management. No encryption/decryption functions. The schema assumes the application will handle this, but the application does not exist. If someone stores plaintext in this BYTEA column, the database would accept it.

---

## 4. Missing Entities for Real-World Operations

The following entities are required for real workforce planning but do not exist in the schema:

### 4.1 AbsenceRequest / Leave Management

**Criticality**: High

The optimization engine needs to know who is available. The schema has `employee.status` (active/on_leave/suspended/terminated) and `employee.preferences_json`, but there is no structured absence management:

- No `absence_request` table (request date, type, status, approval)
- No `leave_balance` table (vacation days remaining, sick days)
- No `unavailability_pattern` table (recurring unavailability like "every other Friday off")
- No integration point with external leave management systems

Without this, the solver cannot know which employees are available on which dates. This is a fundamental input to the assignment optimization.

### 4.2 EquipmentInventory / Equipment Constraints

**Criticality**: Medium

`process.equipment_required` (line 213) is `TEXT[]` listing required equipment types. But there is no table tracking actual equipment inventory:

- No `equipment` table (equipment_id, type, site_id, quantity, status)
- No `equipment_assignment` table (which equipment is assigned to which shift)
- No capacity constraint linking equipment availability to process throughput

If a site has 10 forklifts and a process requires forklift access, the solver needs to know that at most 10 employees can work that process simultaneously. Without equipment inventory, this constraint cannot be enforced.

### 4.3 ApprovalRecord / Approval Workflow

**Criticality**: Medium

`plan_version.approval_status` tracks the current state (draft/pending_review/approved/rejected/superseded), and `approved_by` + `approved_at` record who approved. But there is no approval history:

- No `approval_record` table (plan_version_id, approver_id, action, comment, timestamp)
- No multi-level approval chain (manager -> director -> VP)
- No delegation rules (if VP is out, director can approve)

Enterprise customers require auditable approval workflows. The current model only tracks the final approval, not the approval chain.

### 4.4 ScheduleSwap / Shift Trading

**Criticality**: Medium

The `assignment_source` ENUM includes `'swap'` but there is no mechanism for employees to request or approve shift swaps:

- No `swap_request` table (requester, respondent, original_assignment, proposed_assignment, status)
- No swap validation logic (ensuring the swap does not violate labor rules)

### 4.5 CostRate / Cost Configuration

**Criticality**: Medium

`employee.hourly_rate` is a single decimal. Real labor costing requires:

- Shift differentials (night, weekend, holiday)
- Overtime multipliers (1.5x, 2x) that vary by jurisdiction
- Agency markup rates
- Benefit cost loading
- Seasonal rate adjustments

A `cost_rate` table with effective dates and rate components is needed.

### 4.6 Holiday / Calendar

**Criticality**: High

There is no holiday or calendar table. The solver needs to know:

- Which dates are public holidays (varies by country, state, and site)
- Which dates have modified operating hours
- Which dates have premium pay rates

Without a calendar entity, the optimizer cannot correctly calculate overtime, holiday pay, or staffing requirements for non-standard days.

---

## 5. RLS Policy Analysis

### 5.1 Would the RLS Policies Work?

**Yes, in a Supabase context**, assuming:
1. The `auth.organization_id()` function correctly extracts the org ID from the JWT
2. The JWT custom claims are set correctly during login
3. The Supabase client is used with the `anon` key (not the `service_role` key)

### 5.2 RLS Issues

| Issue | Severity | Details |
|-------|----------|---------|
| Fallback to zero UUID | Medium | `auth.organization_id()` returns `'00000000-0000-0000-0000-000000000000'` when the JWT claim is missing (line 862). If an unauthenticated request reaches the database, it will see all data belonging to org `00000000...`. This org should never exist, but it is a defense-in-depth failure. A better fallback is to return NULL and let the policy deny access. |
| Fallback to 'viewer' role | Low | `auth.user_role()` defaults to `'viewer'` (line 872). This is safe -- viewer has read-only access. But it means a misconfigured JWT grants read access to all org data instead of no access. |
| `dept_modify` uses `FOR ALL` | Medium | The `dept_modify` policy (line 925) uses `FOR ALL`, which covers INSERT, UPDATE, and DELETE. But it also covers SELECT, which conflicts with `dept_select`. PostgreSQL RLS uses OR logic across policies for the same operation, so this is technically fine -- but it is confusing and could mask bugs. |
| No row-level filtering for managers | Low | Managers can see all employees in their organization, not just employees in their department. The `emp_select` policy (line 959) filters only by `organization_id`. A department manager at a 5,000-person company can see all 5,000 employees' hourly rates. |
| Audit log insert policy is too permissive | Medium | `al_insert` (line 1009) allows any authenticated user to insert audit log entries for their org. In practice, audit logs should only be written by the service role or by database triggers, not by end users. A malicious user could flood the audit log with fake entries. |

---

## 6. Index Analysis

### 6.1 Are the Indexes Sufficient?

The schema defines 18 indexes aligned with 7 documented query patterns. Coverage is reasonable for the documented use cases.

### 6.2 Missing Indexes

| Query Pattern | Missing Index | Impact |
|---------------|--------------|--------|
| Employee schedule lookup by employee + date range | `idx_shift_assignment_org_employee_date` exists but does not include `plan_version_id` | Queries for "show me my schedule for the published plan" require a filter scan on plan_version_id |
| Workload plan lookup by plan_version_id | No index on `workload_plan(plan_version_id)` alone | Querying all workload for a specific plan version requires scanning the composite index |
| Process lookup by department | No index on `process(department_id)` | Filtering processes by department requires a full table scan (mitigated by small table size) |
| Employee lookup by department | No index on `employee(department_id)` | Same issue; mitigated by `idx_employee_org_site_status` for most queries |
| Demand forecast by plan_version_id | No dedicated index | The unique index `uq_demand_forecast_combo` can serve this but is suboptimal for plan-version-only queries |

### 6.3 Partial Index Concern

Several indexes use `WHERE` clauses (e.g., `WHERE status = 'active'`, `WHERE is_active = true`). These are efficient for the common case but will not accelerate queries for inactive records. If admin screens need to show inactive employees or deactivated processes, separate indexes or full-table scans will be needed.

---

## 7. ENUM Completeness

| ENUM | Missing Values | Impact |
|------|---------------|--------|
| `site_type` | No `sortation_center`, `returns_center` (common in e-commerce) | Minor -- can use `distribution_center` or `fulfillment_center` as workaround |
| `process_category` | No `inventory` category (cycle count, replenishment are common processes) | Medium -- the wizard doc lists "Inventory" as a process category but it does not exist in the ENUM. Must use `support` as a workaround. |
| `contract_type` | No `agency` type (distinct from `contractor` in many jurisdictions) | Medium -- agency workers have different cost structures and rules |
| `employee_status` | No `pending_start` status for employees hired but not yet started | Low |
| `assignment_status` | No `swapped` status to track assignments that were traded | Low |
| `labor_rule_type` | No `minimum_wage`, `holiday_premium`, `shift_differential` rule types | Medium -- these are common labor rules that cannot be represented |

---

## 8. Maturity Scoring

| Dimension | Score | Notes |
|-----------|-------|-------|
| Schema design quality | 7/10 | Well-normalized, appropriate use of ENUMs, good constraint coverage, thoughtful comments |
| Execution readiness | 6/10 | Likely executes on Supabase. Has not been tested. |
| Real-world data fitness | 5/10 | Missing absence management, equipment tracking, holiday calendar, approval workflow, cost rates |
| RLS correctness | 6/10 | Functional but has the zero-UUID fallback issue and overly permissive audit log inserts |
| Index coverage | 7/10 | Good coverage of documented patterns. Missing a few secondary patterns. |
| Migration readiness | 1/10 | No migration tool. Monolithic SQL file. No seed data. |
| Bug count | 5/10 | 14 identified issues ranging from minor to medium severity. No showstoppers. |
| **Overall Maturity** | **6/10** | A solid draft schema that needs testing, bug fixes, and missing entity additions before production use |

---

## 9. Recommended Immediate Actions

1. **Execute schema.sql** against a fresh Supabase instance and verify all objects are created without errors.
2. **Fix the zero-UUID fallback** in `auth.organization_id()` -- return NULL instead, which will cause RLS to deny access rather than potentially match a real org.
3. **Add the `process_category` value `'inventory'`** to match the wizard documentation.
4. **Add CHECK constraints** to `shift_pattern.days_of_week` to enforce values 0-6.
5. **Add CHECK constraints or triggers** to validate `process.applicable_site_types` elements against `site_type` ENUM values.
6. **Create the `absence_request` table** -- it is the highest-priority missing entity for the solver.
7. **Create the `holiday_calendar` table** -- required for correct overtime and staffing calculations.
8. **Set up Supabase migrations** so the schema can evolve incrementally.
9. **Create seed data** for at least one complete org/site/employee/process/demand scenario for development testing.
