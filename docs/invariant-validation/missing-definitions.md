# Missing Definitions: Required Before Build

> **Status:** Every item in this list is NEEDED for build, not "nice to have."
> **Criteria:** If this definition does not exist, an engineer will get stuck and cannot proceed.
> **Date:** 2026-03-20

---

## MD-01: Solver I/O Contract (TypeScript Interfaces)

**Invariant:** INV-6 (Solver Contract)

**Why needed:** Without typed interfaces, the frontend team cannot build the optimization progress UI, the backend team cannot build the result-writing pipeline, the test team cannot build solver fixtures, and the solver team cannot validate correctness. Four teams are blocked by one missing definition.

**Definition:**

```typescript
// File: src/types/solver.ts

interface TimeSlot {
  id: string;
  period_start: string;  // ISO 8601 timestamptz
  period_end: string;
  duration_minutes: number;
}

interface ProcessDemand {
  process_id: string;
  time_slot_id: string;
  required_fte: number;
  min_skill_level: number;
  required_certifications: string[];
}

interface EmployeeRecord {
  id: string;
  employee_number: string;
  contract_type: 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor';
  weekly_hours_contracted: number;
  hourly_rate: number;
  home_site_id: string;
  is_multi_site_eligible: boolean;
  skills: Array<{
    process_id: string;
    proficiency_level: number;  // 1-5
    productivity_multiplier: number;
    has_active_certification: boolean;
    certification_expiry: string | null;
  }>;
  availability: Array<{
    start: string;  // ISO 8601
    end: string;
  }>;
  current_week_hours: number;
  consecutive_days_worked: number;
}

interface HardConstraint {
  type: string;  // e.g., 'max_weekly_hours', 'min_rest_between_shifts'
  scope: 'employee' | 'site' | 'process';
  parameters: Record<string, number | string | boolean>;
}

interface SoftConstraint {
  type: string;
  weight: number;  // 0.0 to 1.0
  parameters: Record<string, number | string | boolean>;
}

interface ObjectiveConfig {
  minimize_cost_weight: number;
  maximize_coverage_weight: number;
  maximize_skill_match_weight: number;
  minimize_overtime_weight: number;
}

interface Assignment {
  employee_id: string;
  process_id: string;
  time_slot_id: string;
  shift_pattern_id: string;
  scheduled_hours: number;
  cost_estimate: number;
  assignment_source: 'optimizer' | 'locked';
}

interface UnmetDemandSlot {
  process_id: string;
  time_slot_id: string;
  required_fte: number;
  assigned_fte: number;
  gap_fte: number;
}

interface Violation {
  constraint_type: string;
  description: string;
  penalty_incurred: number;
  affected_employees: string[];
}

interface SolverInput {
  site_id: string;
  planning_horizon: { start: string; end: string };
  time_slots: TimeSlot[];
  demand: ProcessDemand[];
  employees: EmployeeRecord[];
  hard_constraints: HardConstraint[];
  soft_constraints: SoftConstraint[];
  locked_assignments: Assignment[];
  objective: ObjectiveConfig;
  time_budget_seconds: number;
}

interface SolverOutput {
  assignments: Assignment[];
  unmet_demand: UnmetDemandSlot[];
  soft_constraint_violations: Violation[];
  metrics: {
    total_cost: number;
    coverage_percentage: number;
    overtime_hours: number;
    solve_time_ms: number;
    optimality_gap: number | null;
    solver_strategy_used: string;
  };
}
```

**Where to document:** `src/types/solver.ts` in the codebase. Reference from `invariants.md` Section 6.

---

## MD-02: Employee Availability Override Entity

**Invariant:** INV-4 (Workforce Model), INV-5 (Constraint Model)

**Why needed:** The optimizer checks "employee is available" as a hard constraint. Without this entity, the optimizer has nowhere to read leave/absence data. Every plan ignores planned absences.

**Definition:**

```sql
CREATE TABLE employee_availability_override (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  employee_id       UUID NOT NULL REFERENCES employee(id) ON DELETE CASCADE,
  start_date        DATE NOT NULL,
  end_date          DATE NOT NULL,
  start_time        TIME,          -- NULL means full day
  end_time          TIME,          -- NULL means full day
  override_type     VARCHAR(30) NOT NULL
    CHECK (override_type IN ('leave', 'absence', 'training', 'unavailable', 'extra_availability')),
  status            VARCHAR(20) NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned', 'confirmed', 'cancelled')),
  reason            TEXT,
  created_by        UUID,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT ck_override_date_range CHECK (end_date >= start_date)
);

CREATE INDEX idx_avail_override_employee ON employee_availability_override(employee_id, start_date, end_date);
CREATE INDEX idx_avail_override_org ON employee_availability_override(organization_id);

ALTER TABLE employee_availability_override ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_avail_override ON employee_availability_override
  USING (organization_id = auth.organization_id());
```

**Where to document:** Add to `schema.sql` in the Workforce module section. Reference from `invariants.md` Section 4.4.

---

## MD-03: Plan State Machine (Transitions, Guards, Roles)

**Invariant:** INV-7 (Plan Lifecycle)

**Why needed:** Without defined transitions, plans can enter inconsistent states. A published plan could be edited. An approved plan could be rejected. The approval workflow cannot be implemented without knowing which transitions are valid and who can trigger them.

**Definition:**

Valid state transitions:

| From | To | Trigger | Required Role | Guard Condition |
|------|-----|---------|---------------|-----------------|
| draft | optimized | Optimizer completes successfully | planner, admin | Plan has at least one demand record |
| optimized | proposed | Planner submits for review | planner | Plan has > 0 assignments |
| proposed | approved | Manager approves | site_manager, admin | Approver is not the proposer |
| proposed | rejected | Manager rejects | site_manager, admin | Must include rejection reason |
| rejected | draft | Automatic on rejection | system | N/A |
| approved | published | Planner or admin publishes | planner, admin | No other published plan for same site+period |
| published | stale | System detects material input change | system | Change threshold exceeded (demand delta > 5% OR any new absence) |
| published | superseded | New version published for same site+period | system | New version reaches published state |
| stale | optimized | Planner re-runs optimizer | planner | N/A |

Invalid transitions (explicitly prohibited):
- published -> draft (must go through stale or supersede)
- proposed -> optimized (must reject first)
- superseded -> any (terminal state)
- Any state -> published (must go through approved first)

Implementation: BEFORE UPDATE trigger on `plan_version` that validates `(OLD.status, NEW.status)` against the transition table. Reject with error code and message on invalid transition.

**Where to document:** Add to `invariants.md` Section 7. Implement as `fn_validate_plan_transition()` trigger function in `schema.sql`.

---

## MD-04: tRPC Procedure Contract (Module Routers)

**Invariant:** INV-1 (Planning Flow -- API layer), INV-8 (Multi-Tenancy -- every procedure is tenant-scoped)

**Why needed:** Frontend engineers cannot build API calls. Backend engineers cannot build handlers. No machine-readable API specification exists. Without procedure definitions, frontend and backend teams cannot work in parallel.

**Definition (core procedures for MVP):**

```typescript
// Demand Router
demand.listForecasts: Query({ site_id, period_start, period_end }) => DemandForecast[]
demand.upsertForecast: Mutation({ site_id, demand_type_id, period_start, period_end, volume, source }) => DemandForecast
demand.importCSV: Mutation({ site_id, file_url }) => { imported: number; errors: ImportError[] }
demand.deleteForecasts: Mutation({ ids: string[] }) => { deleted: number }

// Workforce Router
workforce.listEmployees: Query({ site_id, status?, search? }) => PaginatedResult<Employee>
workforce.getEmployee: Query({ id }) => Employee & { skills: EmployeeSkill[], overrides: AvailabilityOverride[] }
workforce.upsertEmployee: Mutation({ ...EmployeeFields }) => Employee
workforce.updateSkill: Mutation({ employee_id, process_id, proficiency_level }) => EmployeeSkill
workforce.createAvailabilityOverride: Mutation({ employee_id, start_date, end_date, override_type, reason }) => AvailabilityOverride

// Planning Router
planning.listPlanVersions: Query({ site_id, status? }) => PlanVersion[]
planning.getPlanVersion: Query({ id }) => PlanVersion & { assignments: ShiftAssignment[], workload: WorkloadPlan[] }
planning.createDraft: Mutation({ site_id, plan_period_start, plan_period_end }) => PlanVersion
planning.runOptimizer: Mutation({ plan_version_id, time_budget_seconds? }) => { job_id: string }
planning.getOptimizerStatus: Query({ job_id }) => { status: 'running'|'completed'|'failed', progress?: number }
planning.transitionState: Mutation({ plan_version_id, target_state, reason? }) => PlanVersion
planning.manualAssign: Mutation({ plan_version_id, employee_id, process_id, time_slot_id }) => ShiftAssignment

// Workload Router
workload.compute: Mutation({ site_id, plan_version_id }) => WorkloadPlan[]
workload.getForPlan: Query({ plan_version_id }) => WorkloadPlan[]

// Organization/Site Router
org.getSite: Query({ id }) => Site
org.listSites: Query({}) => Site[]
org.updateSiteSettings: Mutation({ site_id, ...settings }) => Site
```

Every procedure is automatically scoped to the caller's `organization_id` via the RLS layer. No procedure accepts `organization_id` as an input parameter.

**Where to document:** Create `src/server/routers/` directory with one file per module router. Reference procedure list in a new `docs/api-contracts.md`.

---

## MD-05: Role and Permission Taxonomy

**Invariant:** INV-8 (Multi-Tenancy), INV-7 (Plan Lifecycle -- transition permissions)

**Why needed:** Three incompatible role taxonomies exist: RLS uses `('planner', 'admin', 'system')`, the wizard defines `Site Manager, Regional Manager, HR Manager`, and module-breakdown defines `viewer, planner, approver, administrator`. An engineer implementing authorization cannot determine which roles exist or what they can do.

**Definition:**

| Role | Hierarchy Level | Description |
|------|----------------|-------------|
| super_admin | Platform | AstraPlanner platform operator. Bypasses tenant RLS. |
| tenant_admin | Organization | Full access within the organization. Manages users, sites, settings. |
| site_manager | Site | Approves plans, manages employees at their site(s). |
| planner | Site | Creates plans, runs optimizer, proposes plans for approval. |
| supervisor | Department | Views plans, manages team availability, acknowledges assignments. |
| employee | Self | Views own schedule, reports absence, acknowledges changes. |
| viewer | Site | Read-only access to plans and reports. |

Permission matrix (key actions):

| Action | tenant_admin | site_manager | planner | supervisor | employee | viewer |
|--------|-------------|-------------|---------|-----------|----------|--------|
| Create plan | Yes | Yes | Yes | No | No | No |
| Run optimizer | Yes | Yes | Yes | No | No | No |
| Propose plan | Yes | Yes | Yes | No | No | No |
| Approve/reject plan | Yes | Yes | No | No | No | No |
| Publish plan | Yes | Yes | Yes | No | No | No |
| Manual assignment override | Yes | Yes | Yes | No | No | No |
| Hard constraint exception | Yes | Yes | No | No | No | No |
| Manage employees | Yes | Yes | No | Partial | No | No |
| Update skill levels | Yes | Yes | No | Yes | No | No |
| Report absence (self) | Yes | Yes | Yes | Yes | Yes | No |
| View own schedule | Yes | Yes | Yes | Yes | Yes | No |
| View site reports | Yes | Yes | Yes | Yes | No | Yes |
| Manage site settings | Yes | Yes | No | No | No | No |
| Manage org settings | Yes | No | No | No | No | No |

Implement as a `user_role` column on the `user_profile` table (or Supabase Auth metadata). Include `role` in the JWT claims so RLS policies can check role-based permissions without additional queries.

**Where to document:** Add to `invariants.md` as a new section. Implement role check functions in `schema.sql`.

---

## MD-06: Environment Variables and Secrets Inventory

**Invariant:** INV-8 (Multi-Tenancy -- auth configuration), INV-6 (Solver -- worker configuration)

**Why needed:** No `.env.example` exists. An engineer cloning the repository cannot set up a development environment. No secrets management strategy is documented. API keys for Claude, integration credentials, and SMTP configuration have no defined storage mechanism.

**Definition:**

```env
# .env.example -- AstraPlanner Development Environment

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_DB_URL=postgresql://postgres:password@db.your-project.supabase.co:5432/postgres

# Authentication
SUPABASE_JWT_SECRET=your-jwt-secret

# AI / Claude
ANTHROPIC_API_KEY=sk-ant-your-key
AI_MODEL=claude-sonnet-4-20250514
AI_MAX_TOKENS_PER_REQUEST=4096
AI_MONTHLY_BUDGET_USD=500

# Solver (Fly.io worker for large problems)
SOLVER_WORKER_URL=https://astraplanner-solver.fly.dev
SOLVER_MAX_TIME_SECONDS=60
SOLVER_MEMORY_THRESHOLD_MB=256

# Application
NEXT_PUBLIC_APP_URL=http://localhost:3000
NODE_ENV=development

# Email (for notifications)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
NOTIFICATION_FROM_EMAIL=notifications@astraplanner.app
```

Secrets management: Use Supabase Vault for database-level secrets (integration credentials). Use Vercel Environment Variables for application-level secrets (API keys). Never store secrets in `settings_json` or any application table.

**Where to document:** Create `.env.example` in the repository root. Add secrets management section to a deployment guide.

---

## MD-07: Allowance Factor Structure

**Invariant:** INV-1 (Planning Flow -- FTE computation formula)

**Why needed:** The workload formula uses `allowance_factor` as a single scalar: `required_hours = process_volume / productivity_rate * (1 + allowance_factor)`. The FTE calculation section of `optimization-strategy.md` uses an itemized breakdown (breaks, walk time, startup/shutdown). These are two different representations. An engineer implementing the formula does not know which to use.

**Definition:** The allowance factor is a single scalar for computation purposes. It represents the sum of all non-productive time as a fraction of productive time. The itemized breakdown exists for configuration purposes only -- the wizard collects individual components, sums them, and stores the result as `allowance_factor` on the site settings.

```
allowance_factor = break_allowance + walk_time_allowance + startup_shutdown_allowance + other_allowance
```

Example: 10-minute paid break per 4 hours (4.2%) + 5-minute walk time per hour (8.3%) + 10 minutes startup/shutdown per shift (2.1%) = 0.146 total allowance factor.

The formula always uses the single scalar:
```
required_hours = process_volume / productivity_rate * (1 + 0.146)
```

Storage: `site.settings_json.allowance_factor` (computed scalar). The individual components are stored in `site.settings_json.allowance_breakdown` for display and recalculation but are never used directly in the formula.

**Where to document:** Add to `invariants.md` Section 1.2 as a clarification.

---

## MD-08: Staleness Detection Thresholds

**Invariant:** INV-7 (Plan Lifecycle -- Published to Stale transition)

**Why needed:** The plan lifecycle defines that a published plan becomes "Stale" when inputs change. But "inputs change" is not defined precisely. If every minor edit triggers stale, plans are constantly stale and the state is meaningless. If the threshold is too high, stale plans are treated as current.

**Definition:**

A published plan transitions to Stale when ANY of these conditions is met:
1. **Demand change:** Total demand volume for any process within the plan's horizon changes by more than 5% compared to the demand snapshot at publish time.
2. **New absence:** Any employee assigned in the plan has a new confirmed availability override (leave, absence) that overlaps with their assignment.
3. **Skill change:** Any employee assigned in the plan has a proficiency level change for a process they are assigned to.
4. **Certification expiry:** Any employee assigned in the plan has a certification expiry within the plan's horizon.
5. **Labor rule change:** Any labor rule applicable to the plan's site/jurisdiction is modified.

Detection mechanism: A `pg_cron` job runs every 15 minutes. It compares published plans' `input_snapshot_hash` (stored at publish time) against current input state. If any threshold is exceeded, it transitions the plan to Stale and creates a notification for the site planner.

**Where to document:** Add to `invariants.md` Section 7.4 as concrete thresholds.

---

## MD-09: Optimizer Output Write Strategy

**Invariant:** INV-6 (Solver Contract -- output handling), INV-7 (Plan Lifecycle -- Draft to Optimized transition)

**Why needed:** A 500-employee, 28-day plan produces approximately 28,000 shift assignment rows. Writing these in batches creates an inconsistency window where the plan is partially populated. Users see a half-built plan. Cache invalidation fires per batch, causing multiple UI refreshes.

**Definition:**

The optimizer writes results to a staging table (`shift_assignment_staging`) with identical schema to `shift_assignment`. On completion, a single transaction atomically:
1. Deletes existing non-locked assignments for the plan version from `shift_assignment`
2. Inserts all staging rows into `shift_assignment`
3. Updates `plan_version.status` to `optimized`
4. Deletes staging rows

```sql
BEGIN;
  DELETE FROM shift_assignment
    WHERE plan_version_id = $1
    AND assignment_source != 'locked';
  INSERT INTO shift_assignment SELECT * FROM shift_assignment_staging
    WHERE plan_version_id = $1;
  UPDATE plan_version SET status = 'optimized', updated_at = now()
    WHERE id = $1;
  DELETE FROM shift_assignment_staging WHERE plan_version_id = $1;
COMMIT;
```

This makes the write atomic from the UI's perspective. A single Realtime event fires after the transaction commits.

**Where to document:** Add to `invariants.md` Section 6, post-solve pipeline.

---

## MD-10: Audit Logging Implementation Mechanism

**Invariant:** INV-9 (Audit Requirement)

**Why needed:** The `audit_log` table exists with the correct structure, but no mechanism is defined for populating it. Without a decision on triggers vs middleware, engineers will implement audit logging inconsistently -- some tables will have triggers, others will rely on application code, and some writes will be missed entirely.

**Definition:**

Use database triggers for critical tables. Use application middleware for supplementary audit.

Trigger-audited tables (automatic, cannot be bypassed):
- `employee` (all changes to employee records)
- `employee_skill` (proficiency changes)
- `plan_version` (state transitions)
- `shift_assignment` (assignment creates, updates, deletes)
- `labor_rule` (constraint configuration changes)
- `employee_availability_override` (leave/absence changes)

Application-audited actions (logged by the tRPC middleware layer):
- Optimizer runs (input hash, solver strategy, solve time, result hash)
- CSV imports (file hash, row counts, error counts)
- Configuration changes (site settings, organization settings)
- AI interactions (prompt hash, response hash, token usage)

Trigger template:
```sql
CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO audit_log (
    organization_id, actor_id, actor_type, action,
    entity_type, entity_id, before_state, after_state
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    COALESCE(current_setting('app.actor_id', true), 'system'),
    COALESCE(current_setting('app.actor_type', true), 'system'),
    TG_OP,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP IN ('UPDATE','DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT','UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Where to document:** Add trigger definitions to `schema.sql`. Document the middleware pattern in `docs/api-contracts.md`.

---

## Summary

| ID | Missing Definition | Invariant | Effort to Define |
|----|-------------------|-----------|-----------------|
| MD-01 | Solver I/O contract (TypeScript) | INV-6 | 1 day |
| MD-02 | Availability override entity | INV-4, INV-5 | 4 hours |
| MD-03 | Plan state machine | INV-7 | 4 hours |
| MD-04 | tRPC procedure contracts | INV-1, INV-8 | 1 day |
| MD-05 | Role and permission taxonomy | INV-7, INV-8 | 4 hours |
| MD-06 | Environment variables and secrets | INV-8 | 2 hours |
| MD-07 | Allowance factor structure | INV-1 | 1 hour |
| MD-08 | Staleness detection thresholds | INV-7 | 2 hours |
| MD-09 | Optimizer output write strategy | INV-6, INV-7 | 2 hours |
| MD-10 | Audit logging mechanism | INV-9 | 4 hours |

**Total effort: approximately 5 days of focused specification work.**

All definitions above are provided in full -- not placeholders. They can be committed to the codebase and documentation as-is.
