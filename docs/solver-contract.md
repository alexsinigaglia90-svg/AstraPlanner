# Solver I/O Contract

> **Authority:** This document defines the boundary between the planning logic and any solver algorithm. All solver implementations MUST conform to this contract.
> **Invariant:** INV-6 (Solver Contract)
> **Status:** LOCKED as of 2026-03-20
> **Source file:** `src/types/solver.ts`

---

## TypeScript Interfaces

```typescript
// =============================================================================
// File: src/types/solver.ts
// Description: Canonical solver I/O contract. Any solver algorithm must accept
//              SolverInput and produce SolverOutput. No exceptions.
// =============================================================================

// ---------------------------------------------------------------------------
// Supporting Types
// ---------------------------------------------------------------------------

export interface TimeSlot {
  id: string;
  period_start: string;   // ISO 8601 timestamptz
  period_end: string;     // ISO 8601 timestamptz
  duration_minutes: number;
}

export interface ProcessDemand {
  process_id: string;
  time_slot_id: string;
  required_fte: number;
  min_skill_level: number;           // 1-5
  required_certifications: string[]; // certification type IDs
}

export interface EmployeeRecord {
  id: string;
  employee_number: string;
  contract_type: 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor';
  weekly_hours_contracted: number;
  hourly_rate: number;
  home_site_id: string;
  is_multi_site_eligible: boolean;
  skills: EmployeeSkillRecord[];
  availability: AvailabilityWindow[];
  current_week_hours: number;        // hours already worked this week (for overtime calc)
  consecutive_days_worked: number;   // for consecutive-day constraint
}

export interface EmployeeSkillRecord {
  process_id: string;
  proficiency_level: number;         // 1-5 (fixed scale per D-03)
  productivity_multiplier: number;   // derived from proficiency level
  has_active_certification: boolean;
  certification_expiry: string | null; // ISO 8601 date or null
}

export interface AvailabilityWindow {
  start: string;  // ISO 8601 timestamptz
  end: string;    // ISO 8601 timestamptz
}

export interface HardConstraint {
  type: string;  // e.g., 'max_weekly_hours', 'min_rest_between_shifts',
                 //       'max_consecutive_days', 'required_certification',
                 //       'min_skill_level', 'no_overlapping_assignments',
                 //       'mandatory_break', 'site_capacity'
  scope: 'employee' | 'site' | 'process';
  parameters: Record<string, number | string | boolean>;
}

export interface SoftConstraint {
  type: string;  // e.g., 'shift_preference', 'home_site_preference',
                 //       'workload_balance', 'overtime_minimization',
                 //       'team_continuity', 'shift_pattern_consistency',
                 //       'split_shift_avoidance', 'skill_development',
                 //       'commute_minimization'
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
  assignment_source: 'optimizer' | 'locked';
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
// Solver Input
// ---------------------------------------------------------------------------

export interface SolverInput {
  /** The site being planned */
  site_id: string;

  /** The date range of the plan (DATE values per D-10) */
  planning_horizon: {
    start: string;  // ISO 8601 date, inclusive
    end: string;    // ISO 8601 date, inclusive
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
    coverage_percentage: number;     // 0-100, assigned_fte / required_fte
    overtime_hours: number;
    solve_time_ms: number;
    optimality_gap: number | null;   // MIP: gap to proven optimal. Heuristics: null.
    solver_strategy_used: string;    // 'greedy' | 'highs_mip'
  };
}

// ---------------------------------------------------------------------------
// Infeasibility Report
// ---------------------------------------------------------------------------

export interface ConflictingConstraint {
  constraint_type: string;
  scope: 'employee' | 'site' | 'process';
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
  affected_assignments: string[];  // assignment indices or employee IDs
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}
```

---

## Contract Rules

These rules are non-negotiable. Every solver implementation must satisfy all of them.

### Rule 1: Standard Interface

ANY solver algorithm must accept `SolverInput` and produce `SolverOutput`. No solver may require additional inputs or produce differently structured outputs. The solver is a pure function:

```typescript
type SolverFunction = (input: SolverInput) => SolverOutput;
```

### Rule 2: Immutable Input

The solver MUST NOT modify the `SolverInput` object. It is a pure function. The caller retains ownership of the input and may use it for post-solve validation. Deep-clone the input if internal mutation is required.

### Rule 3: Hard Constraint Satisfaction

The solver MUST satisfy all hard constraints OR return an infeasibility report. A solution that violates any hard constraint is invalid and will be rejected by the post-solve validator. When hard constraints make full coverage impossible, the solver reduces coverage (leaving gaps in `unmet_demand`) rather than violating constraints.

### Rule 4: Locked Assignments

The solver MUST respect `locked_assignments`. Every assignment in `input.locked_assignments` must appear in `output.assignments` with identical `employee_id`, `process_id`, `time_slot_id`, and `scheduled_hours`. The solver may NOT reassign, remove, or modify locked assignments. Locked assignments have `assignment_source: 'locked'`.

### Rule 5: Time Budget

The solver MUST complete within `time_budget_seconds` OR return the best-found solution at budget expiry. `output.metrics.solve_time_ms` must not exceed `time_budget_seconds * 1000`. If the solver cannot prove optimality within the budget, it returns the best feasible solution found and sets `optimality_gap` to the remaining gap (for MIP) or `null` (for heuristics).

### Rule 6: Determinism

The solver output MUST be deterministic for the same `SolverInput` and the same random seed. Given identical input, the solver produces identical output. This is required for reproducibility in audit trails and regression testing.

---

## Infeasibility Handling

When no feasible solution exists that satisfies all hard constraints with 100% demand coverage, the solver output looks like this:

1. `SolverOutput.metrics.coverage_percentage` will be < 100%.
2. `SolverOutput.unmet_demand` will list every process/time_slot combination where demand could not be filled, with the exact gap.
3. `SolverOutput.assignments` will contain the best partial solution -- the maximum number of valid assignments that satisfy all hard constraints.

To determine WHY infeasibility occurred, the caller invokes a separate analysis:

```typescript
function analyzeInfeasibility(
  input: SolverInput,
  output: SolverOutput
): InfeasibilityReport;
```

The `InfeasibilityReport` identifies which constraints conflict. Common causes:
- Insufficient employees with required skills/certifications for a process
- Employee availability gaps during high-demand time slots
- Hard constraint interactions (e.g., max weekly hours + high demand = not enough capacity)
- Locked assignments consuming capacity needed elsewhere

---

## Validation Function

After the solver produces output, the post-solve validator independently verifies all hard constraints. This double-check prevents solver bugs from producing illegal plans (INV-5).

```typescript
function validateSolverOutput(
  input: SolverInput,
  output: SolverOutput
): ValidationResult;
```

The validator checks:
1. **No overlapping assignments:** No employee is assigned to two time slots that overlap.
2. **Max weekly hours:** No employee exceeds their weekly hour limit (contracted hours + applicable overtime limit).
3. **Min rest between shifts:** Every employee has the required rest period between consecutive assignments.
4. **Max consecutive days:** No employee exceeds the maximum consecutive working days.
5. **Required certifications:** Every assignment to a process requiring certification is to an employee with an active, unexpired certification.
6. **Min skill level:** Every assignment satisfies `employee.skills[process].proficiency_level >= demand.min_skill_level`.
7. **Employee availability:** Every assignment falls within the employee's availability windows.
8. **Locked assignments preserved:** Every `input.locked_assignments` entry appears in `output.assignments` unchanged.
9. **Site capacity:** No time slot exceeds the site's maximum headcount.
10. **Mandatory breaks:** Shift durations that require breaks include break time.

If `ValidationResult.valid` is `false`, the solution is REJECTED. The optimizer must re-run or the plan remains in `draft` state.

---

## Test Fixture

A complete example with a small problem: 5 employees, 3 processes, 1 day, 3 shifts.

### Input

```json
{
  "site_id": "site-001",
  "planning_horizon": {
    "start": "2026-03-23",
    "end": "2026-03-23"
  },
  "time_slots": [
    {
      "id": "slot-morning",
      "period_start": "2026-03-23T06:00:00Z",
      "period_end": "2026-03-23T14:00:00Z",
      "duration_minutes": 480
    },
    {
      "id": "slot-afternoon",
      "period_start": "2026-03-23T14:00:00Z",
      "period_end": "2026-03-23T22:00:00Z",
      "duration_minutes": 480
    },
    {
      "id": "slot-night",
      "period_start": "2026-03-23T22:00:00Z",
      "period_end": "2026-03-24T06:00:00Z",
      "duration_minutes": 480
    }
  ],
  "demand": [
    {
      "process_id": "proc-picking",
      "time_slot_id": "slot-morning",
      "required_fte": 2.0,
      "min_skill_level": 2,
      "required_certifications": []
    },
    {
      "process_id": "proc-packing",
      "time_slot_id": "slot-morning",
      "required_fte": 1.0,
      "min_skill_level": 2,
      "required_certifications": []
    },
    {
      "process_id": "proc-picking",
      "time_slot_id": "slot-afternoon",
      "required_fte": 1.0,
      "min_skill_level": 2,
      "required_certifications": []
    },
    {
      "process_id": "proc-packing",
      "time_slot_id": "slot-afternoon",
      "required_fte": 1.0,
      "min_skill_level": 2,
      "required_certifications": []
    },
    {
      "process_id": "proc-forklift",
      "time_slot_id": "slot-morning",
      "required_fte": 1.0,
      "min_skill_level": 3,
      "required_certifications": ["cert-forklift"]
    }
  ],
  "employees": [
    {
      "id": "emp-001",
      "employee_number": "E001",
      "contract_type": "full_time",
      "weekly_hours_contracted": 40,
      "hourly_rate": 18.50,
      "home_site_id": "site-001",
      "is_multi_site_eligible": false,
      "skills": [
        {
          "process_id": "proc-picking",
          "proficiency_level": 4,
          "productivity_multiplier": 1.0,
          "has_active_certification": false,
          "certification_expiry": null
        },
        {
          "process_id": "proc-packing",
          "proficiency_level": 3,
          "productivity_multiplier": 0.9,
          "has_active_certification": false,
          "certification_expiry": null
        }
      ],
      "availability": [
        { "start": "2026-03-23T06:00:00Z", "end": "2026-03-23T14:00:00Z" }
      ],
      "current_week_hours": 0,
      "consecutive_days_worked": 0
    },
    {
      "id": "emp-002",
      "employee_number": "E002",
      "contract_type": "full_time",
      "weekly_hours_contracted": 40,
      "hourly_rate": 17.00,
      "home_site_id": "site-001",
      "is_multi_site_eligible": false,
      "skills": [
        {
          "process_id": "proc-picking",
          "proficiency_level": 3,
          "productivity_multiplier": 0.9,
          "has_active_certification": false,
          "certification_expiry": null
        }
      ],
      "availability": [
        { "start": "2026-03-23T06:00:00Z", "end": "2026-03-23T14:00:00Z" }
      ],
      "current_week_hours": 0,
      "consecutive_days_worked": 0
    },
    {
      "id": "emp-003",
      "employee_number": "E003",
      "contract_type": "full_time",
      "weekly_hours_contracted": 40,
      "hourly_rate": 20.00,
      "home_site_id": "site-001",
      "is_multi_site_eligible": false,
      "skills": [
        {
          "process_id": "proc-forklift",
          "proficiency_level": 4,
          "productivity_multiplier": 1.0,
          "has_active_certification": true,
          "certification_expiry": "2027-01-15"
        },
        {
          "process_id": "proc-picking",
          "proficiency_level": 2,
          "productivity_multiplier": 0.75,
          "has_active_certification": false,
          "certification_expiry": null
        }
      ],
      "availability": [
        { "start": "2026-03-23T06:00:00Z", "end": "2026-03-23T14:00:00Z" }
      ],
      "current_week_hours": 0,
      "consecutive_days_worked": 0
    },
    {
      "id": "emp-004",
      "employee_number": "E004",
      "contract_type": "part_time",
      "weekly_hours_contracted": 24,
      "hourly_rate": 16.50,
      "home_site_id": "site-001",
      "is_multi_site_eligible": false,
      "skills": [
        {
          "process_id": "proc-picking",
          "proficiency_level": 3,
          "productivity_multiplier": 0.9,
          "has_active_certification": false,
          "certification_expiry": null
        },
        {
          "process_id": "proc-packing",
          "proficiency_level": 4,
          "productivity_multiplier": 1.0,
          "has_active_certification": false,
          "certification_expiry": null
        }
      ],
      "availability": [
        { "start": "2026-03-23T14:00:00Z", "end": "2026-03-23T22:00:00Z" }
      ],
      "current_week_hours": 0,
      "consecutive_days_worked": 0
    },
    {
      "id": "emp-005",
      "employee_number": "E005",
      "contract_type": "full_time",
      "weekly_hours_contracted": 40,
      "hourly_rate": 17.50,
      "home_site_id": "site-001",
      "is_multi_site_eligible": false,
      "skills": [
        {
          "process_id": "proc-picking",
          "proficiency_level": 3,
          "productivity_multiplier": 0.9,
          "has_active_certification": false,
          "certification_expiry": null
        },
        {
          "process_id": "proc-packing",
          "proficiency_level": 3,
          "productivity_multiplier": 0.9,
          "has_active_certification": false,
          "certification_expiry": null
        }
      ],
      "availability": [
        { "start": "2026-03-23T14:00:00Z", "end": "2026-03-23T22:00:00Z" }
      ],
      "current_week_hours": 0,
      "consecutive_days_worked": 0
    }
  ],
  "hard_constraints": [
    {
      "type": "max_weekly_hours",
      "scope": "employee",
      "parameters": { "max_hours": 48 }
    },
    {
      "type": "min_rest_between_shifts",
      "scope": "employee",
      "parameters": { "min_rest_hours": 11 }
    },
    {
      "type": "no_overlapping_assignments",
      "scope": "employee",
      "parameters": {}
    },
    {
      "type": "required_certification",
      "scope": "process",
      "parameters": {}
    },
    {
      "type": "min_skill_level",
      "scope": "process",
      "parameters": {}
    }
  ],
  "soft_constraints": [
    {
      "type": "overtime_minimization",
      "weight": 0.15,
      "parameters": {}
    },
    {
      "type": "workload_balance",
      "weight": 0.08,
      "parameters": {}
    }
  ],
  "locked_assignments": [],
  "objective": {
    "minimize_cost_weight": 0.4,
    "maximize_coverage_weight": 0.35,
    "maximize_skill_match_weight": 0.15,
    "minimize_overtime_weight": 0.1
  },
  "time_budget_seconds": 10
}
```

### Expected Output

```json
{
  "assignments": [
    {
      "employee_id": "emp-001",
      "process_id": "proc-picking",
      "time_slot_id": "slot-morning",
      "shift_pattern_id": "shift-day",
      "scheduled_hours": 8,
      "cost_estimate": 148.00,
      "assignment_source": "optimizer"
    },
    {
      "employee_id": "emp-002",
      "process_id": "proc-picking",
      "time_slot_id": "slot-morning",
      "shift_pattern_id": "shift-day",
      "scheduled_hours": 8,
      "cost_estimate": 136.00,
      "assignment_source": "optimizer"
    },
    {
      "employee_id": "emp-003",
      "process_id": "proc-forklift",
      "time_slot_id": "slot-morning",
      "shift_pattern_id": "shift-day",
      "scheduled_hours": 8,
      "cost_estimate": 160.00,
      "assignment_source": "optimizer"
    },
    {
      "employee_id": "emp-004",
      "process_id": "proc-packing",
      "time_slot_id": "slot-afternoon",
      "shift_pattern_id": "shift-afternoon",
      "scheduled_hours": 8,
      "cost_estimate": 132.00,
      "assignment_source": "optimizer"
    },
    {
      "employee_id": "emp-005",
      "process_id": "proc-picking",
      "time_slot_id": "slot-afternoon",
      "shift_pattern_id": "shift-afternoon",
      "scheduled_hours": 8,
      "cost_estimate": 140.00,
      "assignment_source": "optimizer"
    }
  ],
  "unmet_demand": [
    {
      "process_id": "proc-packing",
      "time_slot_id": "slot-morning",
      "required_fte": 1.0,
      "assigned_fte": 0.0,
      "gap_fte": 1.0
    }
  ],
  "soft_constraint_violations": [],
  "metrics": {
    "total_cost": 716.00,
    "coverage_percentage": 83.3,
    "overtime_hours": 0,
    "solve_time_ms": 45,
    "optimality_gap": null,
    "solver_strategy_used": "greedy"
  }
}
```

### Explanation

- **Morning shift (06:00-14:00):** emp-001 and emp-002 fill the 2.0 FTE picking demand. emp-003 fills the 1.0 FTE forklift demand (only employee with the required forklift certification and skill level >= 3). The 1.0 FTE packing demand for morning is UNMET because all morning-available employees are already assigned -- emp-001 could pack but is needed for picking (higher demand).
- **Afternoon shift (14:00-22:00):** emp-004 fills the 1.0 FTE packing demand (highest proficiency at level 4). emp-005 fills the 1.0 FTE picking demand.
- **Night shift (22:00-06:00):** No demand, no assignments.
- **Coverage:** 5 out of 6 FTE demand slots filled = 83.3%. The morning packing gap is reported in `unmet_demand`.
- **No hard constraints violated:** All assignments respect skill levels, certifications, and availability windows.
