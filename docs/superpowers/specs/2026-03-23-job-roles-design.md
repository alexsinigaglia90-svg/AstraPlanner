# Job Roles (Functies)

## Context

Warehouse employees have different job roles (operator, team leader, supervisor, technician, etc.) that determine how the solver treats them. Not everyone is productive capacity — a supervisor who spends 30% on the floor is 0.3 FTE for the solver. Overhead roles (HR, admin) are 0 FTE. The solver also needs minimum staffing constraints for leadership roles.

## Decisions

- **Site-scoped**: job roles are masterdata per site
- **Hierarchical**: roles can have a parent (supervisor > team leader > senior operator > operator)
- **Three types**: Productive (100% default), Leadership (configurable % productive), Overhead (0%)
- **Solver integration**: productive percentage, minimum per shift, department/process linkage
- **Work schedule**: follows shift rotation OR custom fixed hours
- **Location**: Settings tab "Roles" (alongside Shifts)
- **Employee linkage**: each employee gets a `job_role_id`

## Data Model

### `job_role` table (new)

```sql
CREATE TABLE job_role (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   UUID         NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id           UUID         NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  name              VARCHAR(100) NOT NULL,
  code              VARCHAR(20)  NOT NULL,
  parent_role_id    UUID         REFERENCES job_role(id) ON DELETE SET NULL,
  role_type         VARCHAR(20)  NOT NULL DEFAULT 'productive',  -- 'productive' | 'leadership' | 'overhead'
  productive_pct    SMALLINT     NOT NULL DEFAULT 100,            -- 0-100, solver multiplier
  follows_shifts    BOOLEAN      NOT NULL DEFAULT true,           -- true = uses crew/shift rotation
  custom_start_time TIME,                                         -- only when follows_shifts = false
  custom_end_time   TIME,
  custom_days       SMALLINT[],                                   -- only when follows_shifts = false, 1=Mon..7=Sun
  min_per_shift     SMALLINT,                                     -- leadership: minimum people with this role per shift
  department_id     UUID         REFERENCES department(id) ON DELETE SET NULL,
  is_active         BOOLEAN      NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_job_role_org_site_code UNIQUE (organization_id, site_id, code),
  CONSTRAINT ck_productive_pct CHECK (productive_pct >= 0 AND productive_pct <= 100)
);
```

### Employee linkage

Add `job_role_id UUID REFERENCES job_role(id) ON DELETE SET NULL` to the `employee` table.

## UI — Settings Roles Page

New tab "Roles" under Settings at `/dashboard/settings/roles`.

### Role List

Cards showing all roles for the active site, grouped by hierarchy (tree view):
- Each card: name, type badge (Productive/Leadership/Overhead), productive % indicator, department badge if linked
- Indented child roles under their parent
- ⋮ menu: Edit, Delete (hold-to-delete, blocked if employees assigned)
- "+ Add Role" button opens wizard

### Role Creation Wizard (centered modal, 3 steps)

**Step 1 — Identity:**
- Name input
- Parent role dropdown (optional — "No parent" = top level)
- Hierarchical preview: shows where this role fits in the tree

**Step 2 — Solver Configuration:**
- Three type cards (like process wizard):
  - **Productive** (green): "Fully productive. Counted as direct capacity by the solver." Default productive % = 100
  - **Leadership** (blue): "Partially productive. Splits time between leading and doing." Default productive % = 30
  - **Overhead** (gray): "Not counted as productive capacity. Administrative or support role." Productive % = 0, locked
- Productive % slider/input (0-100) — visible for Productive and Leadership, locked at 0 for Overhead
- Leadership only: "Minimum per shift" toggle + number input (e.g., "At least 1 team leader per shift")
- Department linkage: dropdown to optionally link this role to a department

**Step 3 — Work Schedule:**
- Two cards:
  - **Follows shift rotation** (default): "Uses the employee's crew and shift assignment"
  - **Custom schedule**: "Fixed working hours, independent of shifts"
- If Custom: start time, end time, day-of-week selector (same 7-circle pattern as shift modal)

## tRPC Endpoints

All in `org.ts`, using admin client.

- `org.listRoles` — input: `{ site_id }`, returns roles with employee_count, ordered by hierarchy
- `org.upsertRole` — input: `{ id?, name, site_id, parent_role_id?, role_type, productive_pct, follows_shifts, custom_start_time?, custom_end_time?, custom_days?, min_per_shift?, department_id? }`
- `org.deleteRole` — input: `{ id }`, blocked if employees assigned

## Employee Integration

- Add `job_role_id` to `workforce.upsertEmployee`, `getEmployee`, `listEmployees`
- Add "Role" dropdown to:
  - Employee edit form (SlideOver)
  - Add Employee wizard (Step 2)
  - Excel dataloader (new "Role" column with fuzzy matching)

## Solver Interface

The solver reads job roles to determine:
1. **Available productive hours** = employee's shift hours × `productive_pct / 100`
2. **Leadership constraints** = for roles with `min_per_shift`, ensure at least N people with that role are scheduled per shift
3. **Schedule source** = if `follows_shifts`, use crew rotation; if custom, use the fixed hours
