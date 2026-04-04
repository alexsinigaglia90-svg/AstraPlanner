// =============================================================================
// File: src/types/solver.ts
// Description: Canonical solver I/O contract. Any solver algorithm must accept
//              SolverInput and produce SolverOutput. No exceptions.
// Source: docs/solver-contract.md (LOCKED)
// =============================================================================

// ---------------------------------------------------------------------------
// Supporting Types
// ---------------------------------------------------------------------------

export interface TimeSlot {
  id: string;
  period_start: string; // ISO 8601 timestamptz
  period_end: string; // ISO 8601 timestamptz
  duration_minutes: number;
}

export interface ProcessDemand {
  process_id: string;
  time_slot_id: string;
  required_fte: number;
  min_skill_level: number; // 1-5
  required_certifications: string[]; // certification type IDs
  max_capacity: number | null;  // max concurrent stations for this process
}

export interface EmployeeRecord {
  id: string;
  employee_number: string;
  contract_type:
    | "full_time"
    | "part_time"
    | "temporary"
    | "seasonal"
    | "contractor";
  weekly_hours_contracted: number;
  hourly_rate: number;
  home_site_id: string;
  is_multi_site_eligible: boolean;
  skills: EmployeeSkillRecord[];
  availability: AvailabilityWindow[];
  current_week_hours: number; // hours already worked this week (for overtime calc)
  consecutive_days_worked: number; // for consecutive-day constraint
}

export interface EmployeeSkillRecord {
  process_id: string;
  proficiency_level: number; // 1-5 (fixed scale per D-03)
  productivity_multiplier: number; // derived from proficiency level
  has_active_certification: boolean;
  certification_expiry: string | null; // ISO 8601 date or null
}

export interface AvailabilityWindow {
  start: string; // ISO 8601 timestamptz
  end: string; // ISO 8601 timestamptz
}

export interface HardConstraint {
  type: string;
  scope: "employee" | "site" | "process";
  parameters: Record<string, number | string | boolean>;
}

export interface SoftConstraint {
  type: string;
  weight: number; // 0.0 to 1.0
  parameters: Record<string, number | string | boolean>;
}

export interface ObjectiveConfig {
  minimize_cost_weight: number;
  maximize_coverage_weight: number;
  maximize_skill_match_weight: number;
  minimize_overtime_weight: number;
}

export interface Assignment {
  employee_id: string;
  process_id: string;
  time_slot_id: string;
  shift_pattern_id: string;
  scheduled_hours: number;
  cost_estimate: number;
  assignment_source: "optimizer" | "manual" | "swap" | "ai_suggested";
  proficiency_level: number; // 1-5, employee's skill level for assigned process
}

export interface UnmetDemandSlot {
  process_id: string;
  time_slot_id: string;
  required_fte: number;
  assigned_fte: number;
  gap_fte: number;
}

export interface Violation {
  constraint_type: string;
  description: string;
  penalty_incurred: number;
  affected_employees: string[];
}

// ---------------------------------------------------------------------------
// Solver Configuration (Wizard output)
// ---------------------------------------------------------------------------

export type SolverMode = 'performance' | 'balanced' | 'training'

export interface SolverConfig {
  mode: SolverMode
  departments: string[]
  processes: string[]
  training_slots: Record<string, number>
}

export interface ProcessFteMetrics {
  process_id: string
  process_name: string
  day_volume: number
  uph: number
  operating_hours: number
  baseline_fte: number
  gross_fte: number
  capped_fte: number
  assigned_fte: number
  training_fte: number
  coverage_pct: number
}

// ---------------------------------------------------------------------------
// Solver Input
// ---------------------------------------------------------------------------

export interface SolverInput {
  /** The site being planned */
  site_id: string;

  /** The date range of the plan (DATE values per D-10) */
  planning_horizon: {
    start: string; // ISO 8601 date, inclusive
    end: string; // ISO 8601 date, inclusive
  };

  /** Ordered list of planning time periods within the horizon */
  time_slots: TimeSlot[];

  /** Required FTEs per process per time slot (output of workload computation) */
  demand: ProcessDemand[];

  /** Available employees with skills, availability, and current state */
  employees: EmployeeRecord[];

  /** Constraints that MUST be satisfied -- violation makes the plan invalid */
  hard_constraints: HardConstraint[];

  /** Constraints that SHOULD be satisfied -- violation incurs a penalty */
  soft_constraints: SoftConstraint[];

  /** Pre-existing assignments that must not be changed */
  locked_assignments: Assignment[];

  /** Objective function weights */
  objective: ObjectiveConfig;

  /** Maximum time the solver may run (seconds) */
  time_budget_seconds: number;

  /** Solver configuration from wizard */
  solver_config: SolverConfig;
}

// ---------------------------------------------------------------------------
// Solver Output
// ---------------------------------------------------------------------------

export interface SolverOutput {
  /** All assignments (includes locked_assignments from input, unchanged) */
  assignments: Assignment[];

  /** Slots where demand could not be fully filled */
  unmet_demand: UnmetDemandSlot[];

  /** Soft constraints that were violated and by how much */
  soft_constraint_violations: Violation[];

  /** Aggregate metrics for the solution */
  metrics: {
    total_cost: number;
    coverage_percentage: number; // 0-100, assigned_fte / required_fte
    overtime_hours: number;
    solve_time_ms: number;
    optimality_gap: number | null; // MIP: gap to proven optimal. Heuristics: null.
    solver_strategy_used: string; // 'greedy' | 'highs_mip'
  };

  /** Per-process FTE breakdown */
  per_process: ProcessFteMetrics[];

  /** Warnings from FTE engine (capacity, training) */
  warnings: string[];

  /** Solver configuration used */
  solver_config: SolverConfig;
}

// ---------------------------------------------------------------------------
// Solver Function Type
// ---------------------------------------------------------------------------

export type SolverFunction = (input: SolverInput) => SolverOutput;

// ---------------------------------------------------------------------------
// Infeasibility Report
// ---------------------------------------------------------------------------

export interface ConflictingConstraint {
  constraint_type: string;
  scope: "employee" | "site" | "process";
  description: string;
  affected_entity_ids: string[];
}

export interface InfeasibilityReport {
  /** True when no solution satisfies all hard constraints with full coverage */
  is_infeasible: boolean;

  /** Which constraints conflict with each other */
  conflicting_constraints: ConflictingConstraint[];

  /** Human-readable explanation of why infeasibility occurred */
  summary: string;

  /** Suggested actions to resolve infeasibility */
  suggestions: string[];
}

// ---------------------------------------------------------------------------
// Validation Result
// ---------------------------------------------------------------------------

export interface ValidationError {
  rule: string;
  message: string;
  affected_assignments: string[]; // assignment indices or employee IDs
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}
