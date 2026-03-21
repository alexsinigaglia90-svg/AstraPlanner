# AstraPlanner Entity Relationships

This document defines every relationship between entities in the AstraPlanner data model. It covers the hierarchical structure from Organization down to individual shift assignments, the demand-to-workforce planning chain, and supporting entities. Includes a text-based ER diagram and a complete cardinality table.

---

## 1. Organizational Hierarchy

### Organization to Sites (1:many)

An Organization is the tenant root. It owns all Sites. A Site cannot exist without an Organization.

```
Organization (1) ──────────── (*) Site
    FK: Site.organization_id → Organization.id
    ON DELETE: CASCADE (deleting org removes all sites)
```

Every Site inherits default configuration from its Organization (`default_timezone`, `default_locale`, `default_currency`, `settings_json`). Site-level `settings_json` overrides Organization defaults where keys overlap. The resolution order is: **Organization defaults < Site overrides < User session overrides**.

### Site to Departments (1:many)

Each Site contains one or more Departments. Departments are optional — small sites may operate without departmental structure, but the entity always exists (at minimum a default department is auto-created during site setup).

```
Site (1) ──────────── (*) Department
    FK: Department.site_id → Site.id
    ON DELETE: CASCADE
```

### Department Self-Referential Hierarchy

Departments support nesting. A parent department can contain sub-departments (e.g., `Outbound` contains `Pick Area A`, `Pick Area B`, `Pack Stations`).

```
Department (1) ──────────── (*) Department (children)
    FK: Department.parent_department_id → Department.id
    ON DELETE: SET NULL (orphaned sub-departments become top-level)
```

Maximum nesting depth is enforced at the application layer (recommended: 3 levels max).

### Department to Processes (1:many)

Processes belong to a Department within a Site. A process can optionally be org-wide (null `department_id`) for cross-departmental activities like `Quality Audit`.

```
Department (1) ──────────── (*) Process
    FK: Process.department_id → Department.id
    ON DELETE: SET NULL (process becomes org-wide)
```

### Full Hierarchy Chain

```
Organization
  └── Site
        └── Department
              └── Process
                    └── ProcessProductivityStandard
```

This hierarchy means every query for operational data filters through `organization_id` (RLS partition key) and then narrows by `site_id`, `department_id`, and `process_id`.

---

## 2. Demand-to-Workforce Planning Chain

The core planning pipeline flows through a series of entity relationships:

```
DemandForecast ──→ WorkloadPlan ──→ ShiftAssignment
     │                   │                  │
     ▼                   ▼                  ▼
  DemandType     ProductivityStandard    Employee
     │                   │              ShiftPattern
     ▼                   ▼                 Site
  Process             Process            Process
```

### DemandForecast to Site + DemandType (Composite)

Each DemandForecast record references both a Site and a DemandType. The combination (`site_id`, `demand_type_id`, `forecast_date`, `plan_version_id`) forms a unique composite key.

```
Site (1) ──────────── (*) DemandForecast
    FK: DemandForecast.site_id → Site.id

DemandType (1) ──────────── (*) DemandForecast
    FK: DemandForecast.demand_type_id → DemandType.id
```

This means demand is always site-specific and type-specific. A single day at a single site might have multiple DemandForecast records — one per demand type (e.g., inbound pallets, outbound orders, return units).

### DemandType to Process Mapping (many:many)

DemandTypes map to Processes through a join table `demand_type_process_mapping`. This mapping defines how demand converts into process workload. For example, 1 `Outbound Order` might require:
- 1.0 unit of `Case Pick` work
- 1.0 unit of `Pack` work
- 0.5 units of `Ship/Load` work (because 2 orders fit per shipment on average)

```
DemandType (*) ──── demand_type_process_mapping ────(*) Process
    Attributes on join table:
      - conversion_ratio (decimal): units of process work per unit of demand
      - is_primary (boolean): whether this is the main process for this demand type
```

This conversion ratio is the critical multiplier in the workload calculation formula:

```
process_volume = demand_volume × conversion_ratio
```

### WorkloadPlan Derivation

WorkloadPlan is a computed entity — it is derived from `DemandForecast` and `ProcessProductivityStandard`:

```
DemandForecast (1) ──────────── (*) WorkloadPlan
    FK: WorkloadPlan.demand_forecast_id → DemandForecast.id

Process (1) ──────────── (*) WorkloadPlan
    FK: WorkloadPlan.process_id → Process.id

PlanVersion (1) ──────────── (*) WorkloadPlan
    FK: WorkloadPlan.plan_version_id → PlanVersion.id
```

The calculation uses:

```
1. Get demand_volume from DemandForecast for (site, demand_type, date)
2. Get conversion_ratio from demand_type_process_mapping for (demand_type, process)
3. Compute process_volume = demand_volume × conversion_ratio
4. Get weighted_uph from ProcessProductivityStandard (weighted by skill distribution of available workforce)
5. Compute hours_needed = process_volume / weighted_uph
6. Compute fte_needed = hours_needed / standard_shift_hours
```

### Process to ProductivityStandards (1:many)

Each Process has multiple productivity standards — one per skill level, optionally per site. When a site-specific standard exists, it takes precedence over the org-wide default.

```
Process (1) ──────────── (*) ProcessProductivityStandard
    FK: ProcessProductivityStandard.process_id → Process.id
    Segmented by: skill_level (1-5), site_id (nullable)
```

Standard resolution order:
1. Site-specific standard for the exact skill level (highest priority)
2. Org-wide standard for the exact skill level
3. Interpolation between adjacent skill levels (application layer)

---

## 3. Employee Relationships

### Employee to Home Site (many:1)

Every employee has a primary home site. This is their default assignment location and determines which labor rules apply.

```
Employee (*) ──────────── (1) Site
    FK: Employee.home_site_id → Site.id
    ON DELETE: RESTRICT (cannot delete a site with assigned employees)
```

### Employee to Department (many:1, optional)

Employees may belong to a department within their home site.

```
Employee (*) ──────────── (0..1) Department
    FK: Employee.department_id → Department.id
    ON DELETE: SET NULL
```

### Employee to Skills (1:many)

An employee can be skilled in multiple processes. Each skill mapping carries a proficiency level (1-5), certification date, and expiry.

```
Employee (1) ──────────── (*) EmployeeSkill
    FK: EmployeeSkill.employee_id → Employee.id
    ON DELETE: CASCADE
```

### EmployeeSkill to Process (many:1)

Each EmployeeSkill record links to exactly one Process. The `proficiency_level` on the skill record corresponds to a `ProcessProductivityStandard` at the same level, enabling the system to calculate the expected UPH for this employee on this process.

```
EmployeeSkill (*) ──────────── (1) Process
    FK: EmployeeSkill.process_id → Process.id
    ON DELETE: CASCADE
```

**Lookup chain for expected throughput:**

```
Employee
  → EmployeeSkill (for process_id = X, proficiency_level = 3)
    → ProcessProductivityStandard (for process_id = X, skill_level = 3, site_id = employee.home_site_id)
      → units_per_hour = 145.50
```

### Employee to ShiftAssignments (1:many)

An employee receives zero or more shift assignments per planning period.

```
Employee (1) ──────────── (*) ShiftAssignment
    FK: ShiftAssignment.employee_id → Employee.id
    ON DELETE: CASCADE
```

The uniqueness constraint `(employee_id, assignment_date, plan_version_id, start_time)` prevents double-booking an employee on the same date and time within the same plan version.

---

## 4. Shift Assignment Relationships

ShiftAssignment is the most relationship-dense entity in the model. It connects:

```
ShiftAssignment
    ├── → Employee (who works)
    ├── → ShiftPattern (what schedule template)
    ├── → Site (where)
    ├── → Process (doing what)
    ├── → Department (in which department)
    └── → PlanVersion (part of which plan)
```

### ShiftAssignment to ShiftPattern (many:1)

```
ShiftAssignment (*) ──────────── (1) ShiftPattern
    FK: ShiftAssignment.shift_pattern_id → ShiftPattern.id
    ON DELETE: RESTRICT (cannot delete shift pattern with active assignments)
```

The ShiftPattern provides the template (start_time, end_time, break_rules), but ShiftAssignment can override the actual `start_time` and `end_time` for flexibility (e.g., staggered starts).

### ShiftAssignment to Site (many:1)

```
ShiftAssignment (*) ──────────── (1) Site
    FK: ShiftAssignment.site_id → Site.id
    ON DELETE: RESTRICT
```

The assignment site may differ from the employee's home site when `Employee.is_multi_site_eligible = true` and a transfer is needed to fill coverage gaps.

### ShiftAssignment to Process (many:1)

```
ShiftAssignment (*) ──────────── (1) Process
    FK: ShiftAssignment.process_id → Process.id
    ON DELETE: RESTRICT
```

This relationship is validated against `EmployeeSkill`: the assigned employee must have an active skill record for the assigned process with `proficiency_level >= Process.min_skill_level`.

### ShiftAssignment to PlanVersion (many:1)

```
ShiftAssignment (*) ──────────── (1) PlanVersion
    FK: ShiftAssignment.plan_version_id → PlanVersion.id
    ON DELETE: CASCADE (deleting a plan version removes all its assignments)
```

This is critical for scenario modeling: each scenario's PlanVersion has its own complete set of ShiftAssignments, independent of the baseline.

---

## 5. Scenario and Plan Version Relationships

### Scenario Fork Relationship

A Scenario forks from a parent PlanVersion. The fork creates a new PlanVersion that copies the parent's demand forecasts and workload plans, then applies scenario-specific assumption adjustments.

```
PlanVersion (parent) (1) ──────────── (*) Scenario
    FK: Scenario.parent_plan_version_id → PlanVersion.id
    ON DELETE: RESTRICT (cannot delete a baseline that has scenarios)

Scenario (1) ──────────── (*) PlanVersion (scenario versions)
    FK: PlanVersion.scenario_id → Scenario.id
    ON DELETE: SET NULL
```

**Version lineage example:**

```
PlanVersion v1 (baseline)
    ├── Scenario "Peak +20%" → PlanVersion v1.1
    │     └── PlanVersion v1.1.1 (re-optimized after manual edits)
    └── Scenario "Hiring Freeze" → PlanVersion v1.2
```

### PlanVersion Contains All Planning Data

A PlanVersion is the container for a complete planning snapshot:

```
PlanVersion (1)
    ├── (*) DemandForecast (scenario-specific overrides)
    ├── (*) WorkloadPlan (computed hours needed)
    └── (*) ShiftAssignment (employee-level assignments)
```

When a PlanVersion is locked (`is_locked = true`), its child records become immutable — a historical archive of the plan as it was approved.

### PlanVersion Self-Referential Lineage

```
PlanVersion (parent) (1) ──────────── (*) PlanVersion (children)
    FK: PlanVersion.parent_version_id → PlanVersion.id
    ON DELETE: SET NULL
```

This enables a version tree where you can trace any version back to its origin through the `parent_version_id` chain.

---

## 6. Labor Rules Application

### LaborRule Jurisdiction Scoping

LaborRules are applied hierarchically during optimization. The optimizer collects all applicable rules by matching jurisdiction:

```
LaborRule scope resolution (most specific wins):
    1. Site-specific rule  (jurisdiction_site_id = <site_id>)
    2. State-level rule    (jurisdiction_state = <state>, jurisdiction_site_id IS NULL)
    3. Country-level rule  (jurisdiction_country = <country>, jurisdiction_state IS NULL)
    4. Organization-wide   (all jurisdiction fields NULL)
```

```
Organization (1) ──────────── (*) LaborRule
    FK: LaborRule.organization_id → Organization.id

Site (1) ──────────── (*) LaborRule (site-specific)
    FK: LaborRule.jurisdiction_site_id → Site.id
    ON DELETE: CASCADE
```

LaborRules do not have a direct FK to ShiftAssignment. Instead, the optimization engine loads all applicable rules for a site and applies them as constraints during assignment generation. The relationship is implicit and enforced at runtime.

### Rule Application During Optimization

```
For each candidate ShiftAssignment:
  1. Collect all LaborRules where:
     - organization_id matches AND
     - (jurisdiction_site_id = assignment.site_id OR jurisdiction_site_id IS NULL) AND
     - (jurisdiction_state = site.state_province OR jurisdiction_state IS NULL) AND
     - (jurisdiction_country = site.country_code OR jurisdiction_country IS NULL) AND
     - effective_date <= assignment.assignment_date AND
     - (expiry_date IS NULL OR expiry_date > assignment.assignment_date) AND
     - employee.contract_type = ANY(applies_to_contract_types)
  2. Evaluate each rule against the candidate assignment
  3. Hard constraints: reject assignment if violated
  4. Soft constraints: add penalty_score to optimizer cost function
```

---

## 7. Supporting Entity Relationships

### AuditLog (Polymorphic)

AuditLog uses a polymorphic relationship pattern — it references any entity by `entity_type` (table name) and `entity_id` (primary key). There are no foreign key constraints to the target entities because audit records must survive even if the source entity is deleted.

```
AuditLog.entity_type = 'ShiftAssignment'
AuditLog.entity_id   = ShiftAssignment.id
(No FK constraint — audit records are permanent)
```

### Notification (User-Targeted)

Notifications reference their source entity through `payload_json` using the same polymorphic pattern as AuditLog.

```
User (1) ──────────── (*) Notification
    FK: Notification.target_user_id → User.id

Notification.payload_json.entity_type → any entity
Notification.payload_json.entity_id   → any entity PK
```

### IntegrationConfig (Organization-Scoped, Site-Optional)

```
Organization (1) ──────────── (*) IntegrationConfig
    FK: IntegrationConfig.organization_id → Organization.id

IntegrationConfig.site_scope → array of Site.id values (no FK, validated at app layer)
```

---

## 8. Text-Based ER Diagram

```
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│   Organization   │1─────*│      Site         │1─────*│   Department     │
│──────────────────│       │──────────────────│       │──────────────────│
│ id (PK)          │       │ id (PK)          │       │ id (PK)          │
│ name             │       │ organization_id  │       │ organization_id  │
│ slug             │       │ name             │       │ site_id (FK)     │
│ subscription_tier│       │ code             │       │ name             │
│ settings_json    │       │ site_type        │       │ code             │
│ ...              │       │ timezone         │       │ manager_emp_id   │
└──────────────────┘       │ operating_hours  │       │ parent_dept_id   │
        │                  │ ...              │       └──────┬───────────┘
        │                  └───────┬──────────┘              │1
        │                     1│   │1                        │
        │                      │   │                    *┌───┴───────────────┐
        │                      │   │                     │    Process        │
        │                      │   │                     │───────────────────│
        │                      │   │                     │ id (PK)           │
        │                      │   │                     │ organization_id   │
        │                      │   │                     │ department_id(FK) │
        │                      │   │                     │ name              │
        │                      │   │                     │ code              │
        │                      │   │                     │ unit_of_measure   │
        │                      │   │                     └───┬───┬───────────┘
        │                      │   │                    1│   │1
        │                      │   │                     │   │
        │               ┌──────┘   │              *┌─────┘   └─────┐*
        │               │          │               │               │
        │          *┌────┴──────┐  │  ┌────────────┴───────┐  ┌────┴──────────────┐
        │           │ Demand    │  │  │ ProcessProductivity│  │  EmployeeSkill    │
        │           │ Forecast  │  │  │ Standard           │  │───────────────────│
        │           │───────────│  │  │────────────────────│  │ id (PK)           │
        │           │ id (PK)   │  │  │ id (PK)            │  │ employee_id (FK)  │
        │           │ site_id   │  │  │ process_id (FK)    │  │ process_id (FK)   │
        │           │ demand_   │  │  │ site_id (FK)       │  │ proficiency_level │
        │           │ type_id   │  │  │ skill_level        │  │ certification_date│
        │           │ volume    │  │  │ units_per_hour     │  │ ...               │
        │           │ ...       │  │  │ ...                │  └────┬──────────────┘
        │           └────┬──────┘  │  └────────────────────┘       │*
        │           *│   │         │                                │
        │            │   │         │                           1┌───┴──────────────┐
        │       1┌───┘   │         │                            │   Employee       │
        │        │       │         │                            │──────────────────│
   ┌────┴────────┴──┐    │         │                            │ id (PK)          │
   │  DemandType    │    │         │                            │ organization_id  │
   │────────────────│    │         │                            │ employee_number  │
   │ id (PK)        │    │         │                            │ home_site_id(FK) │
   │ organization_id│    │         └───────────────────┐        │ contract_type    │
   │ name           │    │                             │        │ ...              │
   │ code           │    │                        *┌───┴────┐   └───┬──────────────┘
   │ unit_of_measure│    │                         │Employee│       │1
   └──────┬─────────┘    │                         │  ↑     │       │
     *│   │              │                         └────────┘       │
      │   │              │                                          │
   ┌──┴───┴───────────┐  │                                     *┌──┴───────────────┐
   │demand_type_      │  │  ┌──────────────────┐                │ ShiftAssignment  │
   │process_mapping   │  │  │  ShiftPattern    │                │──────────────────│
   │──────────────────│  │  │──────────────────│1──────────────*│ id (PK)          │
   │ demand_type_id   │  │  │ id (PK)          │                │ employee_id (FK) │
   │ process_id       │  │  │ organization_id  │                │ shift_pattern_id │
   │ conversion_ratio │  │  │ name             │                │ site_id (FK)     │
   └──────────────────┘  │  │ start_time       │                │ process_id (FK)  │
                         │  │ end_time          │                │ assignment_date  │
                         │  │ paid_hours        │                │ plan_version_id  │
                         │  │ break_rules       │                │ status           │
                         │  │ ...               │                │ ...              │
                         │  └──────────────────┘                └──┬───────────────┘
                         │                                         │*
                    *┌───┴──────────────┐                          │
                     │  WorkloadPlan    │                     1┌───┴──────────────┐
                     │──────────────────│                      │  PlanVersion     │
                     │ id (PK)          │*────────────────────1│──────────────────│
                     │ site_id (FK)     │                      │ id (PK)          │
                     │ process_id (FK)  │                      │ organization_id  │
                     │ plan_version_id  │                      │ version_number   │
                     │ hours_needed     │                      │ scenario_id (FK) │
                     │ fte_needed       │                      │ approval_status  │
                     │ ...              │                      │ is_published     │
                     └──────────────────┘                      │ parent_version_id│
                                                               └───┬──────────────┘
                                                                   │*
                                                              1┌───┴──────────────┐
                                                               │   Scenario       │
                                                               │──────────────────│
                                                               │ id (PK)          │
                                                               │ organization_id  │
                                                               │ parent_plan_     │
                                                               │   version_id(FK) │
                                                               │ assumptions_json │
                                                               │ status           │
                                                               └──────────────────┘

┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐
│   AuditLog       │  │  Notification    │  │ IntegrationConfig│  │   LaborRule      │
│──────────────────│  │──────────────────│  │──────────────────│  │──────────────────│
│ id (PK)          │  │ id (PK)          │  │ id (PK)          │  │ id (PK)          │
│ organization_id  │  │ organization_id  │  │ organization_id  │  │ organization_id  │
│ entity_type      │  │ target_user_id   │  │ source_system    │  │ rule_type        │
│ entity_id        │  │ type             │  │ sync_schedule    │  │ jurisdiction_*   │
│ action           │  │ severity         │  │ last_sync_at     │  │ parameters_json  │
│ before_state     │  │ payload_json     │  │ field_mapping    │  │ severity         │
│ after_state      │  │ read_status      │  │ ...              │  │ ...              │
│ ...              │  │ ...              │  └──────────────────┘  └──────────────────┘
└──────────────────┘  └──────────────────┘
```

---

## 9. Complete Cardinality Table

| Entity A | Relationship | Entity B | Cardinality | FK Location | Notes |
|---|---|---|---|---|---|
| Organization | contains | Site | 1:* | `Site.organization_id` | Cascade delete |
| Organization | defines | DemandType | 1:* | `DemandType.organization_id` | Configurable per org |
| Organization | configures | IntegrationConfig | 1:* | `IntegrationConfig.organization_id` | Cascade delete |
| Organization | governs | LaborRule | 1:* | `LaborRule.organization_id` | Org-wide and jurisdiction-scoped |
| Organization | owns | ShiftPattern | 1:* | `ShiftPattern.organization_id` | Shared across sites |
| Site | contains | Department | 1:* | `Department.site_id` | Cascade delete |
| Site | receives | DemandForecast | 1:* | `DemandForecast.site_id` | Per date per demand type |
| Site | has standards | ProcessProductivityStandard | 1:* | `PPS.site_id` | Nullable — org default if null |
| Site | hosts | ShiftAssignment | 1:* | `ShiftAssignment.site_id` | Restrict delete |
| Site | employs (home) | Employee | 1:* | `Employee.home_site_id` | Restrict delete |
| Site | scoped by | LaborRule | 1:* | `LaborRule.jurisdiction_site_id` | Nullable — broader jurisdiction if null |
| Department | parent of | Department | 1:* | `Department.parent_department_id` | Self-referential, set null on delete |
| Department | contains | Process | 1:* | `Process.department_id` | Set null on delete (org-wide fallback) |
| Department | managed by | Employee | *:0..1 | `Department.manager_employee_id` | Set null on delete |
| Department | contains | Employee | 1:* | `Employee.department_id` | Set null on delete |
| Process | measured by | ProcessProductivityStandard | 1:* | `PPS.process_id` | By skill level and site |
| Process | maps to | DemandType | *:* | `demand_type_process_mapping` | Join table with conversion_ratio |
| Process | skilled by | EmployeeSkill | 1:* | `EmployeeSkill.process_id` | Cascade delete |
| Process | assigned in | ShiftAssignment | 1:* | `ShiftAssignment.process_id` | Restrict delete |
| Process | drives | WorkloadPlan | 1:* | `WorkloadPlan.process_id` | Via planning calculation |
| DemandType | classifies | DemandForecast | 1:* | `DemandForecast.demand_type_id` | Restrict delete |
| DemandType | maps to | Process | *:* | `demand_type_process_mapping` | Conversion ratios |
| DemandForecast | feeds | WorkloadPlan | 1:* | `WorkloadPlan.demand_forecast_id` | Nullable FK |
| DemandForecast | belongs to | PlanVersion | *:0..1 | `DemandForecast.plan_version_id` | Null = baseline |
| Employee | skilled in | EmployeeSkill | 1:* | `EmployeeSkill.employee_id` | Cascade delete |
| Employee | assigned to | ShiftAssignment | 1:* | `ShiftAssignment.employee_id` | Cascade delete |
| Employee | assessed | EmployeeSkill | 1:* | `EmployeeSkill.assessed_by` | Nullable, set null on delete |
| ShiftPattern | templates | ShiftAssignment | 1:* | `ShiftAssignment.shift_pattern_id` | Restrict delete |
| PlanVersion | contains | WorkloadPlan | 1:* | `WorkloadPlan.plan_version_id` | Cascade delete |
| PlanVersion | contains | ShiftAssignment | 1:* | `ShiftAssignment.plan_version_id` | Cascade delete |
| PlanVersion | contains | DemandForecast | 1:* | `DemandForecast.plan_version_id` | Scenario overrides |
| PlanVersion | child of | PlanVersion | *:0..1 | `PlanVersion.parent_version_id` | Version lineage, set null on delete |
| PlanVersion | belongs to | Scenario | *:0..1 | `PlanVersion.scenario_id` | Null = baseline |
| Scenario | forks from | PlanVersion | *:1 | `Scenario.parent_plan_version_id` | Restrict delete |
| Scenario | produces | PlanVersion | 1:* | `PlanVersion.scenario_id` | Scenario-specific versions |
| AuditLog | references | (any entity) | *:1 | Polymorphic (`entity_type`, `entity_id`) | No FK constraint; permanent records |
| Notification | targets | User | *:1 | `Notification.target_user_id` | FK to user table |
| Notification | references | (any entity) | *:0..1 | Via `payload_json` | No FK constraint |

---

## 10. Key Relationship Patterns

### Pattern 1: Organization-Scoped Everything

Every entity carries `organization_id`. This is the RLS partition key and the first filter in every query. No cross-tenant joins are ever permitted.

### Pattern 2: Cascading Configuration

Configuration flows downward with override capability:

```
Organization.settings_json
    └── Site.settings_json (overrides matching keys)
        └── Department settings (future: department-level overrides)
            └── Process settings (embedded in process attributes)
```

### Pattern 3: Temporal Validity

Several entities use `effective_date` / `expiry_date` pairs to support historical tracking without deleting records:
- `ProcessProductivityStandard`
- `LaborRule`
- `EmployeeSkill` (certification expiry)

### Pattern 4: Plan Version Isolation

All mutable planning data (DemandForecast, WorkloadPlan, ShiftAssignment) is scoped to a `PlanVersion`. This enables:
- Multiple concurrent scenarios without data conflicts
- Full rollback by switching to a previous version
- Immutable historical snapshots when versions are locked

### Pattern 5: Polymorphic References

AuditLog and Notification use a `(entity_type, entity_id)` pattern instead of foreign keys. This allows them to reference any entity without circular dependencies and ensures audit records survive entity deletion.
