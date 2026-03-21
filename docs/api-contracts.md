# tRPC API Contracts

> **Authority:** This is the canonical API specification. Engineers create tRPC routers directly from this file.
> **Invariant:** INV-1 (Planning Flow), INV-8 (Multi-Tenancy -- every procedure is tenant-scoped)
> **Status:** LOCKED as of 2026-03-20
> **Implementation:** `src/server/routers/` -- one file per module router

---

## Global Rules

1. **Tenant scoping:** Every procedure is automatically scoped to the caller's `organization_id` via RLS. No procedure accepts `organization_id` as an input parameter. The JWT claim provides the tenant context.

2. **Authentication:** All procedures require a valid Supabase Auth JWT. Unauthenticated requests are rejected with `UNAUTHORIZED`.

3. **Authorization:** Role checks are performed in middleware before the procedure handler executes. Unauthorized access returns `FORBIDDEN` with the required role(s).

4. **Audit:** Mutations on critical entities produce audit records automatically via database triggers (D-09). Supplementary audit records are created by tRPC middleware for non-table operations.

5. **Pagination:** List queries that may return large result sets use cursor-based pagination with the following standard shape:

```typescript
interface PaginationInput {
  cursor?: string;       // opaque cursor from previous response
  limit?: number;        // default 50, max 200
}

interface PaginatedResult<T> {
  items: T[];
  next_cursor: string | null;
  total_count: number;
}
```

6. **Error codes:** All errors use tRPC error codes: `BAD_REQUEST`, `NOT_FOUND`, `UNAUTHORIZED`, `FORBIDDEN`, `CONFLICT`, `INTERNAL_SERVER_ERROR`.

---

## org (Organization and Site Management)

### `org.getOrganization`

```typescript
// Route: org.getOrganization
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor, viewer
// Side effects: None

input: {}  // uses organization_id from JWT

output: {
  id: string;
  name: string;
  slug: string;
  subscription_tier: 'trial' | 'starter' | 'professional' | 'enterprise';
  settings_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}
```

### `org.updateOrganization`

```typescript
// Route: org.updateOrganization
// Type: Mutation
// Auth: tenant_admin
// Side effects: Audit record (middleware)

input: {
  name?: string;
  settings_json?: Record<string, unknown>;
}

output: {
  id: string;
  name: string;
  slug: string;
  settings_json: Record<string, unknown>;
  updated_at: string;
}
```

### `org.listSites`

```typescript
// Route: org.listSites
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor, viewer
// Side effects: None

input: {}

output: Array<{
  id: string;
  name: string;
  timezone: string;           // IANA timezone
  address: string | null;
  settings_json: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}>
```

### `org.getSite`

```typescript
// Route: org.getSite
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor, viewer
// Side effects: None

input: {
  id: string;
}

output: {
  id: string;
  name: string;
  timezone: string;
  address: string | null;
  settings_json: {
    allowance_factor: number;
    allowance_breakdown: {
      break_allowance: number;
      walk_time_allowance: number;
      startup_shutdown_allowance: number;
      other_allowance: number;
    };
    operating_hours: Record<string, { open: string; close: string }>;
    max_headcount: number | null;
    absenteeism_rate: number;
    notification_retention_days: number; // default 90 per D-11/D-19
  };
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

### `org.updateSiteSettings`

```typescript
// Route: org.updateSiteSettings
// Type: Mutation
// Auth: tenant_admin, site_manager
// Side effects: Audit record (middleware). Emits 'site.settings_updated' event.

input: {
  site_id: string;
  name?: string;
  timezone?: string;
  address?: string | null;
  settings_json?: Partial<{
    allowance_factor: number;
    allowance_breakdown: {
      break_allowance: number;
      walk_time_allowance: number;
      startup_shutdown_allowance: number;
      other_allowance: number;
    };
    operating_hours: Record<string, { open: string; close: string }>;
    max_headcount: number | null;
    absenteeism_rate: number;
    notification_retention_days: number;
  }>;
}

output: {
  id: string;
  name: string;
  timezone: string;
  settings_json: Record<string, unknown>;
  updated_at: string;
}
```

### `org.listDepartments`

```typescript
// Route: org.listDepartments
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor, viewer
// Side effects: None

input: {
  site_id: string;
}

output: Array<{
  id: string;
  name: string;
  parent_department_id: string | null;
  site_id: string;
}>
```

---

## workforce (Employees, Skills, Availability)

### `workforce.listEmployees`

```typescript
// Route: workforce.listEmployees
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor
// Side effects: None

input: {
  site_id: string;
  status?: 'active' | 'on_leave' | 'suspended' | 'terminated';
  search?: string;          // searches employee_number, first_name, last_name
  department_id?: string;
  process_id?: string;      // filter to employees skilled in this process
  cursor?: string;
  limit?: number;           // default 50, max 200
}

output: PaginatedResult<{
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  contract_type: 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor';
  weekly_hours_contracted: number;
  home_site_id: string;
  status: 'active' | 'on_leave' | 'suspended' | 'terminated';
  is_multi_site_eligible: boolean;
  skill_count: number;
}>
```

### `workforce.getEmployee`

```typescript
// Route: workforce.getEmployee
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor, employee (self only)
// Side effects: None

input: {
  id: string;
}

output: {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  email: string | null;
  contract_type: 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor';
  weekly_hours_contracted: number;
  hourly_rate: number;        // hidden from employee role
  home_site_id: string;
  department_id: string | null;
  is_multi_site_eligible: boolean;
  status: 'active' | 'on_leave' | 'suspended' | 'terminated';
  preferences_json: Record<string, unknown>;
  skills: Array<{
    id: string;
    process_id: string;
    process_name: string;
    proficiency_level: number;    // 1-5
    certification_date: string | null;
    expiry_date: string | null;
    last_practiced_date: string | null;
  }>;
  availability_overrides: Array<{
    id: string;
    start_date: string;
    end_date: string;
    start_time: string | null;
    end_time: string | null;
    override_type: 'leave' | 'absence' | 'training' | 'unavailable' | 'extra_availability';
    status: 'planned' | 'confirmed' | 'cancelled';
    reason: string | null;
  }>;
}
```

### `workforce.upsertEmployee`

```typescript
// Route: workforce.upsertEmployee
// Type: Mutation
// Auth: tenant_admin, site_manager
// Side effects: Audit record (trigger on employee table). Emits 'employee.created' or 'employee.updated'.

input: {
  id?: string;                // omit for create, include for update
  employee_number: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  contract_type: 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor';
  weekly_hours_contracted: number;
  hourly_rate: number;
  home_site_id: string;
  department_id?: string | null;
  is_multi_site_eligible?: boolean;  // default false
  status?: 'active' | 'on_leave' | 'suspended' | 'terminated';
  preferences_json?: Record<string, unknown>;
}

output: {
  id: string;
  employee_number: string;
  first_name: string;
  last_name: string;
  status: string;
  created_at: string;
  updated_at: string;
}
```

### `workforce.importEmployeesCSV`

```typescript
// Route: workforce.importEmployeesCSV
// Type: Mutation
// Auth: tenant_admin, site_manager
// Side effects: Audit record (middleware -- logs file hash, row counts). Emits 'employee.bulk_imported'.

input: {
  site_id: string;
  file_url: string;           // Supabase Storage URL
  column_mapping: Record<string, string>;  // CSV column -> entity field
  dry_run?: boolean;           // default false, validate without inserting
}

output: {
  imported: number;
  skipped: number;
  errors: Array<{
    row: number;
    field: string;
    message: string;
    value: string | null;
  }>;
  dry_run: boolean;
}
```

### `workforce.updateSkill`

```typescript
// Route: workforce.updateSkill
// Type: Mutation
// Auth: tenant_admin, site_manager, supervisor
// Side effects: Audit record (trigger on employee_skill). Emits 'employee.skill_updated'. May trigger staleness check on published plans.

input: {
  employee_id: string;
  process_id: string;
  proficiency_level: number;   // 1-5 (validated, per D-03)
  certification_date?: string | null;
  expiry_date?: string | null;
}

output: {
  id: string;
  employee_id: string;
  process_id: string;
  proficiency_level: number;
  certification_date: string | null;
  expiry_date: string | null;
  updated_at: string;
}
```

### `workforce.createAvailabilityOverride`

```typescript
// Route: workforce.createAvailabilityOverride
// Type: Mutation
// Auth: tenant_admin, site_manager, supervisor, employee (self only)
// Side effects: Audit record (trigger). Emits 'employee.availability_changed'. Triggers staleness check on published plans containing this employee.

input: {
  employee_id: string;
  start_date: string;          // ISO 8601 date
  end_date: string;            // ISO 8601 date, >= start_date
  start_time?: string | null;  // TIME, null = full day
  end_time?: string | null;    // TIME, null = full day
  override_type: 'leave' | 'absence' | 'training' | 'unavailable' | 'extra_availability';
  reason?: string;
}

output: {
  id: string;
  employee_id: string;
  start_date: string;
  end_date: string;
  override_type: string;
  status: 'planned';          // always starts as planned
  created_at: string;
}
```

### `workforce.updateAvailabilityOverride`

```typescript
// Route: workforce.updateAvailabilityOverride
// Type: Mutation
// Auth: tenant_admin, site_manager, supervisor
// Side effects: Audit record (trigger). Emits 'employee.availability_changed'.

input: {
  id: string;
  status?: 'planned' | 'confirmed' | 'cancelled';
  start_date?: string;
  end_date?: string;
  reason?: string;
}

output: {
  id: string;
  status: string;
  updated_at: string;
}
```

---

## demand (Forecasts, Imports)

### `demand.listForecasts`

```typescript
// Route: demand.listForecasts
// Type: Query
// Auth: tenant_admin, site_manager, planner
// Side effects: None

input: {
  site_id: string;
  period_start: string;        // ISO 8601 timestamptz
  period_end: string;          // ISO 8601 timestamptz
  demand_type_id?: string;
  source?: 'wms_import' | 'csv_upload' | 'manual_entry' | 'ai_forecast';
}

output: Array<{
  id: string;
  site_id: string;
  demand_type_id: string;
  demand_type_name: string;
  period_start: string;
  period_end: string;
  volume: number;
  unit_of_measure: string;
  source: string;
  confidence: number | null;   // for AI forecasts
  created_at: string;
  updated_at: string;
}>
```

### `demand.upsertForecast`

```typescript
// Route: demand.upsertForecast
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Audit record (middleware). Emits 'demand.forecast_updated'. Triggers staleness check on published plans for this site/period.

input: {
  id?: string;                 // omit for create
  site_id: string;
  demand_type_id: string;
  period_start: string;        // ISO 8601 timestamptz
  period_end: string;          // ISO 8601 timestamptz
  volume: number;              // must be >= 0
  source: 'wms_import' | 'csv_upload' | 'manual_entry' | 'ai_forecast';
  confidence?: number;         // 0.0-1.0, for AI forecasts
}

output: {
  id: string;
  site_id: string;
  demand_type_id: string;
  period_start: string;
  period_end: string;
  volume: number;
  source: string;
  updated_at: string;
}
```

### `demand.importCSV`

```typescript
// Route: demand.importCSV
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Audit record (middleware -- logs file hash, row counts, error counts). Emits 'demand.csv_imported'.

input: {
  site_id: string;
  file_url: string;            // Supabase Storage URL
  column_mapping?: Record<string, string>;
  dry_run?: boolean;           // default false
}

output: {
  imported: number;
  updated: number;
  errors: Array<{
    row: number;
    field: string;
    message: string;
  }>;
  dry_run: boolean;
}
```

### `demand.deleteForecasts`

```typescript
// Route: demand.deleteForecasts
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Audit record (middleware). Emits 'demand.forecasts_deleted'.

input: {
  ids: string[];               // max 100 per call
}

output: {
  deleted: number;
}
```

### `demand.listDemandTypes`

```typescript
// Route: demand.listDemandTypes
// Type: Query
// Auth: tenant_admin, site_manager, planner
// Side effects: None

input: {}

output: Array<{
  id: string;
  name: string;
  unit_of_measure: string;
  process_mappings: Array<{
    process_id: string;
    process_name: string;
    conversion_ratio: number;
  }>;
}>
```

### `demand.upsertDemandType`

```typescript
// Route: demand.upsertDemandType
// Type: Mutation
// Auth: tenant_admin, site_manager
// Side effects: Audit record (middleware).

input: {
  id?: string;
  name: string;
  unit_of_measure: string;
  process_mappings: Array<{
    process_id: string;
    conversion_ratio: number;  // e.g., 1 order = 1.0 picks
  }>;
}

output: {
  id: string;
  name: string;
  unit_of_measure: string;
  updated_at: string;
}
```

---

## workload (Computation, FTE Calculation)

### `workload.compute`

```typescript
// Route: workload.compute
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Creates/updates workload_plan records. Audit record (middleware).

input: {
  site_id: string;
  plan_version_id: string;
}

output: Array<{
  id: string;
  process_id: string;
  process_name: string;
  time_slot_id: string;
  period_start: string;
  period_end: string;
  demand_volume: number;
  process_volume: number;      // demand_volume * conversion_ratio
  productivity_rate: number;
  allowance_factor: number;
  required_hours: number;      // process_volume / productivity_rate * (1 + allowance_factor)
  required_fte: number;        // required_hours / available_hours_per_fte
  gross_fte: number;           // required_fte / (1 - absenteeism_rate)
}>
```

### `workload.getForPlan`

```typescript
// Route: workload.getForPlan
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor, viewer
// Side effects: None

input: {
  plan_version_id: string;
}

output: Array<{
  id: string;
  process_id: string;
  process_name: string;
  time_slot_id: string;
  period_start: string;
  period_end: string;
  demand_volume: number;
  process_volume: number;
  required_hours: number;
  required_fte: number;
  gross_fte: number;
}>
```

---

## planning (Plans, Optimization, Assignments, State Transitions)

### `planning.listPlanVersions`

```typescript
// Route: planning.listPlanVersions
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor, viewer
// Side effects: None

input: {
  site_id: string;
  status?: 'draft' | 'optimized' | 'proposed' | 'approved' | 'published' | 'stale' | 'superseded' | 'rejected';
  plan_period_start?: string;  // DATE filter
  plan_period_end?: string;    // DATE filter
}

output: Array<{
  id: string;
  site_id: string;
  version_number: number;
  status: string;
  plan_period_start: string;   // DATE
  plan_period_end: string;     // DATE
  created_by: string;
  assignment_count: number;
  coverage_percentage: number | null;
  created_at: string;
  updated_at: string;
}>
```

### `planning.getPlanVersion`

```typescript
// Route: planning.getPlanVersion
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor, viewer
// Side effects: None

input: {
  id: string;
}

output: {
  id: string;
  site_id: string;
  version_number: number;
  status: string;
  plan_period_start: string;
  plan_period_end: string;
  created_by: string;
  approved_by: string | null;
  rejection_reason: string | null;
  input_snapshot_hash: string | null;  // hash at publish time for staleness detection
  solver_metrics: {
    total_cost: number;
    coverage_percentage: number;
    overtime_hours: number;
    solve_time_ms: number;
    solver_strategy_used: string;
  } | null;
  assignments: Array<{
    id: string;
    employee_id: string;
    employee_number: string;
    employee_name: string;
    process_id: string;
    process_name: string;
    time_slot_id: string;
    start_time: string;
    end_time: string;
    scheduled_hours: number;
    cost_estimate: number;
    assignment_source: 'optimizer' | 'locked' | 'manual';
  }>;
  workload: Array<{
    process_id: string;
    process_name: string;
    time_slot_id: string;
    required_fte: number;
    assigned_fte: number;
    gap_fte: number;
  }>;
  created_at: string;
  updated_at: string;
}
```

### `planning.createDraft`

```typescript
// Route: planning.createDraft
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Audit record (trigger on plan_version). Emits 'plan.draft_created'.

input: {
  site_id: string;
  plan_period_start: string;   // DATE (per D-10)
  plan_period_end: string;     // DATE
}

output: {
  id: string;
  site_id: string;
  version_number: number;
  status: 'draft';
  plan_period_start: string;
  plan_period_end: string;
  created_at: string;
}
```

### `planning.runOptimizer`

```typescript
// Route: planning.runOptimizer
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Audit record (middleware -- logs input hash, solver strategy, solve time, result hash). Emits 'plan.optimization_started'. On completion emits 'plan.optimization_completed'. Writes results via atomic staging table swap (MD-09).

input: {
  plan_version_id: string;
  solver_strategy?: 'greedy' | 'highs_mip';  // default: 'highs_mip'
  time_budget_seconds?: number;                // default: 30, max: 300
  objective_overrides?: Partial<{
    minimize_cost_weight: number;
    maximize_coverage_weight: number;
    maximize_skill_match_weight: number;
    minimize_overtime_weight: number;
  }>;
}

output: {
  job_id: string;
  status: 'queued';
  estimated_duration_seconds: number;
}
```

### `planning.getOptimizerStatus`

```typescript
// Route: planning.getOptimizerStatus
// Type: Query
// Auth: tenant_admin, site_manager, planner
// Side effects: None
// Note: Prefer Supabase Realtime subscription on plan_version for live updates (D-15)

input: {
  job_id: string;
}

output: {
  job_id: string;
  plan_version_id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  progress_percentage: number | null;  // 0-100 during running
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  metrics: {
    total_cost: number;
    coverage_percentage: number;
    overtime_hours: number;
    solve_time_ms: number;
    optimality_gap: number | null;
    solver_strategy_used: string;
  } | null;
}
```

### `planning.transitionState`

```typescript
// Route: planning.transitionState
// Type: Mutation
// Auth: Depends on transition (see state machine in MD-03):
//   - propose: planner, site_manager, tenant_admin
//   - approve/reject: site_manager, tenant_admin (approver != proposer)
//   - publish: planner, site_manager, tenant_admin
//   - re-optimize from stale: planner, site_manager, tenant_admin
// Side effects: Audit record (trigger on plan_version). Emits 'plan.state_changed'. On publish: supersedes previous published plan for same site+period, emits 'plan.published', triggers employee notifications.

input: {
  plan_version_id: string;
  target_state: 'proposed' | 'approved' | 'rejected' | 'published';
  reason?: string;             // required for rejection
}

output: {
  id: string;
  status: string;              // the new state
  previous_status: string;
  transitioned_by: string;
  transitioned_at: string;
}

// Validation:
// - Transition must be valid per state machine (MD-03)
// - Invalid transitions return BAD_REQUEST with allowed transitions
// - Rejection requires non-empty reason
// - Approval requires approver != plan creator/proposer
// - Publish requires no other published plan for same site+period (old one auto-superseded)
```

### `planning.manualAssign`

```typescript
// Route: planning.manualAssign
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Audit record (trigger on shift_assignment). Emits 'plan.assignment_changed'.

input: {
  plan_version_id: string;
  employee_id: string;
  process_id: string;
  time_slot_id: string;
  shift_pattern_id: string;
}

output: {
  id: string;
  employee_id: string;
  process_id: string;
  time_slot_id: string;
  start_time: string;
  end_time: string;
  scheduled_hours: number;
  cost_estimate: number;
  assignment_source: 'manual';
}

// Validation:
// - Plan must be in 'draft' or 'optimized' state
// - Employee must be available during the time slot
// - Employee must have required skill level for the process
// - Employee must have required certifications
// - Assignment must not overlap with existing assignments
// - Hard constraints are validated; violations return BAD_REQUEST
```

### `planning.removeAssignment`

```typescript
// Route: planning.removeAssignment
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Audit record (trigger). Emits 'plan.assignment_changed'.

input: {
  assignment_id: string;
}

output: {
  deleted: boolean;
}

// Validation:
// - Plan must be in 'draft' or 'optimized' state
// - Locked assignments cannot be removed (return FORBIDDEN)
```

### `planning.lockAssignment`

```typescript
// Route: planning.lockAssignment
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Audit record (trigger). Emits 'plan.assignment_locked'.

input: {
  assignment_id: string;
}

output: {
  id: string;
  assignment_source: 'locked';
  updated_at: string;
}

// Effect: Marks the assignment as locked. The solver will preserve this
// assignment in subsequent optimization runs (Rule 4 of solver contract).
```

### `planning.overrideHardConstraint`

```typescript
// Route: planning.overrideHardConstraint
// Type: Mutation
// Auth: site_manager, tenant_admin (per D-14)
// Side effects: Audit record with action='hard_constraint_override' (middleware). Emits 'plan.constraint_overridden'.

input: {
  plan_version_id: string;
  assignment_id: string;
  constraint_type: string;     // which hard constraint is being bypassed
  reason: string;              // mandatory justification
}

output: {
  id: string;
  override_id: string;
  constraint_type: string;
  overridden_by: string;
  overridden_at: string;
}
```

---

## scenario (What-If Simulations)

### `scenario.create`

```typescript
// Route: scenario.create
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: None (scenarios are ephemeral until saved)

input: {
  base_plan_version_id: string;
  name: string;
  description?: string;
  modifications: {
    demand_overrides?: Array<{
      process_id: string;
      time_slot_id: string;
      new_required_fte: number;
    }>;
    employee_removals?: string[];        // employee IDs to exclude
    employee_additions?: string[];       // employee IDs to add
    constraint_changes?: Array<{
      constraint_type: string;
      new_parameters: Record<string, number | string | boolean>;
    }>;
  };
}

output: {
  scenario_id: string;
  name: string;
  base_plan_version_id: string;
  created_at: string;
}
```

### `scenario.run`

```typescript
// Route: scenario.run
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Audit record (middleware -- logs scenario parameters). Uses greedy solver for fast turnaround (per D-06).

input: {
  scenario_id: string;
  solver_strategy?: 'greedy' | 'highs_mip';  // default: 'greedy' for fast what-if
  time_budget_seconds?: number;                // default: 10
}

output: {
  scenario_id: string;
  result: {
    assignments: Array<{
      employee_id: string;
      process_id: string;
      time_slot_id: string;
      scheduled_hours: number;
      cost_estimate: number;
    }>;
    metrics: {
      total_cost: number;
      coverage_percentage: number;
      overtime_hours: number;
      solve_time_ms: number;
    };
    comparison_to_base: {
      cost_delta: number;
      coverage_delta: number;
      overtime_delta: number;
      assignments_changed: number;
    };
  };
}
```

### `scenario.list`

```typescript
// Route: scenario.list
// Type: Query
// Auth: tenant_admin, site_manager, planner
// Side effects: None

input: {
  base_plan_version_id: string;
}

output: Array<{
  scenario_id: string;
  name: string;
  description: string | null;
  status: 'created' | 'completed' | 'failed';
  cost_delta: number | null;
  coverage_delta: number | null;
  created_at: string;
}>
```

### `scenario.promote`

```typescript
// Route: scenario.promote
// Type: Mutation
// Auth: tenant_admin, site_manager, planner
// Side effects: Creates a new plan_version in 'optimized' state with the scenario's assignments. Audit record.

input: {
  scenario_id: string;
}

output: {
  new_plan_version_id: string;
  status: 'optimized';
}
```

---

## wizard (Setup Wizard Steps)

### `wizard.getProgress`

```typescript
// Route: wizard.getProgress
// Type: Query
// Auth: tenant_admin
// Side effects: None

input: {}

output: {
  current_phase: number;       // 1-5 (per D-12)
  completed_phases: number[];
  is_complete: boolean;
  phases: Array<{
    phase: number;
    name: string;
    status: 'not_started' | 'in_progress' | 'completed';
    required_fields_remaining: number;
  }>;
}
```

### `wizard.completePhase`

```typescript
// Route: wizard.completePhase
// Type: Mutation
// Auth: tenant_admin
// Side effects: Audit record (middleware). Emits 'wizard.phase_completed'.

input: {
  phase: number;               // 1-5
  data: Record<string, unknown>;
  // Phase 1: { organization_name, industry, timezone }
  // Phase 2: { site_name, site_timezone, site_address, operating_hours, allowance_breakdown }
  // Phase 3: { processes: Array<{ name, unit_of_measure, productivity_standards }> }
  // Phase 4: { import_method: 'csv' | 'manual', file_url?, employees?: Array<...> }
  // Phase 5: { confirmed_checklist: string[] }
}

output: {
  phase: number;
  status: 'completed';
  next_phase: number | null;   // null if all phases complete
  validation_warnings: string[];
}

// Validation per phase:
// Phase 1: Organization name required, timezone must be valid IANA
// Phase 2: At least one site required, operating hours validated
// Phase 3: At least one process required, productivity standards must cover all 5 proficiency levels (D-03)
// Phase 4: At least one employee required (can be added later but warned)
// Phase 5: All checklist items must be confirmed
```

### `wizard.skipPhase`

```typescript
// Route: wizard.skipPhase
// Type: Mutation
// Auth: tenant_admin
// Side effects: Audit record (middleware).

input: {
  phase: number;
  reason: string;
}

output: {
  phase: number;
  status: 'skipped';
  blocking_features: string[];  // features that won't work without this phase
}

// Only phases 4 and 5 can be skipped. Phases 1-3 are mandatory.
```

---

## admin (User Management, System Configuration)

### `admin.listUsers`

```typescript
// Route: admin.listUsers
// Type: Query
// Auth: tenant_admin
// Side effects: None

input: {
  role?: 'tenant_admin' | 'site_manager' | 'planner' | 'supervisor' | 'employee' | 'viewer';
  site_id?: string;
  cursor?: string;
  limit?: number;
}

output: PaginatedResult<{
  id: string;
  email: string;
  full_name: string;
  role: string;
  site_ids: string[];          // sites this user has access to
  last_sign_in: string | null;
  created_at: string;
}>
```

### `admin.inviteUser`

```typescript
// Route: admin.inviteUser
// Type: Mutation
// Auth: tenant_admin, site_manager (site_manager can only invite roles below their own)
// Side effects: Sends invitation email via Supabase Auth. Audit record (middleware). Emits 'user.invited'.

input: {
  email: string;
  full_name: string;
  role: 'site_manager' | 'planner' | 'supervisor' | 'employee' | 'viewer';
  site_ids: string[];          // which sites this user can access
  employee_id?: string;        // link to employee record (for employee role)
}

output: {
  user_id: string;
  email: string;
  role: string;
  invitation_sent: boolean;
}

// Validation:
// - site_manager can only invite planner, supervisor, employee, viewer
// - tenant_admin can invite any role except super_admin
// - employee_id is required when role is 'employee'
```

### `admin.updateUserRole`

```typescript
// Route: admin.updateUserRole
// Type: Mutation
// Auth: tenant_admin
// Side effects: Audit record (middleware). Updates JWT claims on next token refresh. Emits 'user.role_changed'.

input: {
  user_id: string;
  role: 'tenant_admin' | 'site_manager' | 'planner' | 'supervisor' | 'employee' | 'viewer';
  site_ids?: string[];
}

output: {
  user_id: string;
  role: string;
  site_ids: string[];
  updated_at: string;
}
```

### `admin.deactivateUser`

```typescript
// Route: admin.deactivateUser
// Type: Mutation
// Auth: tenant_admin
// Side effects: Audit record (middleware). Emits 'user.deactivated'. Does NOT delete -- soft deactivation.

input: {
  user_id: string;
  reason: string;
}

output: {
  user_id: string;
  deactivated: boolean;
  deactivated_at: string;
}
```

### `admin.getSystemHealth`

```typescript
// Route: admin.getSystemHealth
// Type: Query
// Auth: tenant_admin
// Side effects: None

input: {}

output: {
  database: {
    connected: boolean;
    latency_ms: number;
  };
  active_plans: number;
  active_employees: number;
  pending_optimizations: number;
  notification_queue_depth: number;
  storage_usage_mb: number;
}
```

### `admin.getAuditLog`

```typescript
// Route: admin.getAuditLog
// Type: Query
// Auth: tenant_admin
// Side effects: None

input: {
  entity_type?: string;
  entity_id?: string;
  actor_id?: string;
  action?: string;
  date_from?: string;          // ISO 8601
  date_to?: string;            // ISO 8601
  cursor?: string;
  limit?: number;              // default 50, max 200
}

output: PaginatedResult<{
  id: string;
  actor_id: string;
  actor_type: 'user' | 'system' | 'api_integration' | 'ai_optimizer';
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  created_at: string;
}>
```

### `admin.listLaborRules`

```typescript
// Route: admin.listLaborRules
// Type: Query
// Auth: tenant_admin, site_manager
// Side effects: None

input: {
  site_id?: string;
  jurisdiction?: string;
}

output: Array<{
  id: string;
  name: string;
  jurisdiction: string;
  constraint_type: 'hard' | 'soft';
  rule_type: string;           // e.g., 'max_weekly_hours', 'min_rest_between_shifts'
  parameters: Record<string, number | string | boolean>;
  site_ids: string[];          // sites this rule applies to (empty = all sites)
  is_active: boolean;
}>
```

### `admin.upsertLaborRule`

```typescript
// Route: admin.upsertLaborRule
// Type: Mutation
// Auth: tenant_admin, site_manager
// Side effects: Audit record (trigger on labor_rule). Emits 'labor_rule.changed'. Triggers staleness check on published plans at affected sites.

input: {
  id?: string;
  name: string;
  jurisdiction: string;
  constraint_type: 'hard' | 'soft';
  rule_type: string;
  parameters: Record<string, number | string | boolean>;
  site_ids?: string[];         // empty = all sites in the organization
  is_active?: boolean;         // default true
}

output: {
  id: string;
  name: string;
  constraint_type: string;
  rule_type: string;
  updated_at: string;
}
```

---

## Process Management (under org router)

### `org.listProcesses`

```typescript
// Route: org.listProcesses
// Type: Query
// Auth: tenant_admin, site_manager, planner, supervisor, viewer
// Side effects: None

input: {
  department_id?: string;
}

output: Array<{
  id: string;
  name: string;
  unit_of_measure: string;
  department_id: string | null;
  min_skill_level: number;
  hazard_level: number;
  requires_certification: boolean;
  is_active: boolean;
  productivity_standards: Array<{
    skill_level: number;       // 1-5
    units_per_hour: number;
    site_id: string | null;    // null = org-wide default
  }>;
}>
```

### `org.upsertProcess`

```typescript
// Route: org.upsertProcess
// Type: Mutation
// Auth: tenant_admin, site_manager
// Side effects: Audit record (middleware). Emits 'process.updated'.

input: {
  id?: string;
  name: string;
  unit_of_measure: string;
  department_id?: string | null;
  min_skill_level?: number;    // default 1
  hazard_level?: number;       // default 0
  requires_certification?: boolean;
  productivity_standards: Array<{
    skill_level: number;       // 1-5
    units_per_hour: number;
    site_id?: string | null;
  }>;
}

output: {
  id: string;
  name: string;
  updated_at: string;
}

// Validation:
// - productivity_standards must include all 5 proficiency levels (D-03)
// - units_per_hour must be > 0
// - Level 4 is the baseline (1.0x); other levels must be proportional
```

---

## Employee Portal (under workforce router)

### `workforce.getMySchedule`

```typescript
// Route: workforce.getMySchedule
// Type: Query
// Auth: employee (self only), supervisor, site_manager, tenant_admin
// Side effects: None
// Note: For employee portal (D-08)

input: {
  week_start?: string;         // DATE, defaults to current week
}

output: {
  employee_id: string;
  employee_name: string;
  week_start: string;
  week_end: string;
  total_scheduled_hours: number;
  assignments: Array<{
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    process_name: string;
    site_name: string;
    shift_name: string;
    status: 'scheduled' | 'acknowledged';
  }>;
  upcoming_changes: Array<{
    change_type: 'new_assignment' | 'modified' | 'cancelled';
    description: string;
    effective_date: string;
    requires_acknowledgment: boolean;
  }>;
}
```

### `workforce.acknowledgeSchedule`

```typescript
// Route: workforce.acknowledgeSchedule
// Type: Mutation
// Auth: employee (self only)
// Side effects: Audit record (trigger). Emits 'schedule.acknowledged'.

input: {
  assignment_ids: string[];
}

output: {
  acknowledged: number;
  acknowledged_at: string;
}
```

---

## Notification Procedures (under admin router)

### `admin.listNotifications`

```typescript
// Route: admin.listNotifications
// Type: Query
// Auth: All authenticated roles (filtered to user's notifications)
// Side effects: None

input: {
  unread_only?: boolean;       // default false
  cursor?: string;
  limit?: number;
}

output: PaginatedResult<{
  id: string;
  type: string;                // e.g., 'schedule_published', 'plan_stale', 'approval_needed'
  title: string;
  body: string;
  is_read: boolean;
  action_url: string | null;
  created_at: string;
}>
```

### `admin.markNotificationRead`

```typescript
// Route: admin.markNotificationRead
// Type: Mutation
// Auth: All authenticated roles (own notifications only)
// Side effects: None

input: {
  notification_ids: string[];
}

output: {
  updated: number;
}
```
