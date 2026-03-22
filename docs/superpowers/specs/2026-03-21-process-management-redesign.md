# Process Management Redesign

## Context

The current process management page is a flat card list that doesn't reflect the warehouse domain model. Processes belong to departments, have a norm (units per hour), and a unit of measure. The page needs to handle 30-50 processes across multiple departments while remaining scannable and editable.

## Decisions

- **Layout**: Kanban board — departments as columns, processes as cards within
- **Norm model**: One norm per process (UPH), not per skill level
- **Scope**: Site-specific — each site has its own departments, processes, and norms
- **Department hierarchy**: Flat (one level) — departments are the grouping, processes are children
- **Add process**: Inline card creation — "+ Add" transforms into an editable card (name, UOM dropdown, norm input)
- **Edit/delete**: Card menu via ⋮ icon — edit transforms card into edit mode, delete with confirmation
- **Site scoping**: Processes are scoped to a site via their department (department has `site_id`). No direct `site_id` on process — derive from the department join.

## Data Model Changes

The existing `process` table already has `department_id`, `unit_of_measure`, and the `process_productivity_standard` table holds norms. Changes needed:

1. **Process norm field**: Add `norm_uph DECIMAL(8,2)` to the `process` table directly. This is the single norm the UI shows/edits. The `process_productivity_standard` table remains for future multi-level use but is not used by this UI.
2. **Department color**: Add `color VARCHAR(20) DEFAULT 'indigo'` to the `department` table for kanban column coloring.
3. **No `site_id` on process**: Site is derived from the department's `site_id`. The `listProcesses` endpoint joins through department to filter by site.
4. **Department `code` auto-generation**: When creating a department, `code` is auto-generated from the name (uppercase, spaces → underscores, truncated to 20 chars). Not shown in the UI.
5. **Process `code` auto-generation**: When creating a process, `code` is auto-generated from the name (uppercase, spaces → underscores, truncated to 20 chars). The `category` defaults to `'support'` and `applicable_site_types` defaults to `['warehouse']`.

## UI Components

### ProcessKanbanPage (`src/app/dashboard/processes/page.tsx`)

Full page rewrite. Replaces the current flat card list.

**Layout**:
- Header: "Processes" title + site context subtitle + "+ Department" button
- Kanban board: horizontal flex container with overflow-x auto
- Each department is a `DepartmentColumn` component
- Columns have a consistent min-width (260px) and flex: 1

**Data flow**:
- Fetch departments for active site via tRPC (`org.listDepartments`)
- Fetch processes for active site via tRPC (`org.listProcesses`) — grouped client-side by `department_id`
- Local state for "adding" mode per column and "editing" mode per card

**Orphan processes** (processes with NULL department_id): not shown in the kanban view. These are legacy/misconfigured and can be assigned a department via direct DB edit. No UI for orphans in this iteration.

### DepartmentColumn

**Props**: department (id, name, color), processes[], onAddProcess, onEditProcess, onDeleteProcess, onEditDepartment

**Structure**:
- Column header: color dot + name + process count badge + ⋮ menu
- Process cards list
- "+ Add Process" dashed button at bottom
- When adding: button transforms into `ProcessCardForm`

**Color scheme**: 6 preset colors — indigo (#6366f1), emerald (#10b981), amber (#f59e0b), pink (#ec4899), cyan (#06b6d4), red (#ef4444). Column background, dot, count badge, and norm number all use the department's color.

### ProcessCard

**Props**: process (id, name, unit_of_measure, norm_uph), color, onEdit, onDelete

**Structure**:
- Process name (font-weight: 700, 13px)
- Norm display: large number (22px, 800 weight, monospace, department color) + "/hr" suffix + UOM badge
- ⋮ menu button → dropdown with Edit, Delete

**Interactions**:
- Hover: subtle elevation + border color shift
- ⋮ click: dropdown menu
- Edit: card transforms into `ProcessCardForm` with current values pre-filled
- Delete: confirmation dialog. Blocked if process has employee_skill or shift_assignment records (server-side check).

### ProcessCardForm

**Props**: initialValues? (for edit mode), departmentId, departmentColor, onSave, onCancel

**Structure**:
- Name input (text, auto-focused)
- Row: UOM dropdown + norm number input
- Row: Save button (gradient, department color) + Cancel button

**UOM options**: orders, order lines, pallets, cartons, pieces, units (extensible)

### DepartmentCreateForm

Inline form that appears as a new column when "+ Department" is clicked.

**Structure**:
- Color picker: 6 circular preset swatches
- Name input
- Create + Cancel buttons
- Dashed "+ Add Process" placeholder below

**Auto-generated fields**: `code` is derived from name (e.g. "Value Added Services" → "VALUE_ADDED_SERVICES"), truncated to 20 chars.

### Department ⋮ Menu

- Rename Department → inline edit of column header
- Change Color → color picker popover
- Delete Department → confirmation, blocked server-side if department has processes

## tRPC Changes

### New/Modified Endpoints

**`org.listDepartments`** (modify existing):
- Input: `{ site_id: string }`
- Returns: `{ id, name, color, process_count }[]` ordered by name
- Uses admin client with `organization_id` filter
- Aggregates process count via separate count query

**`org.upsertDepartment`** (new):
- Input: `{ id?, name, site_id, color }` — `code` auto-generated from name, `organization_id` from context
- Creates or updates department
- Uses admin client

**`org.deleteDepartment`** (new):
- Input: `{ id: string }`
- Server checks: fails with descriptive message if department has processes
- Uses admin client

**`org.listProcesses`** (modify):
- Input: `{ site_id: string }` (required)
- Joins through `department` to filter by `department.site_id`
- Returns: `{ id, name, code, unit_of_measure, norm_uph, department_id }[]`
- Uses admin client with `organization_id` filter

**`org.upsertProcess`** (modify):
- Input: `{ id?, name, unit_of_measure, norm_uph, department_id }`
- Auto-generates: `code` from name, `category` defaults to `'support'`, `organization_id` from context
- Uses admin client

**`org.deleteProcess`** (new):
- Input: `{ id: string }`
- Server checks: count of `employee_skill` rows + `shift_assignment` rows for this process. If > 0, return error with count and message "Cannot delete: X employees have skills for this process"
- Note: `employee_skill` has ON DELETE CASCADE in the DB, but we check application-side to prevent accidental data loss
- Uses admin client

## Animation

All animations use the existing motion library (`@/lib/motion`):
- Column appear: `containerStagger` + `fadeInUp`
- Card appear: `fadeInUp` with stagger within column
- Card hover: `whileHover={{ y: -2, boxShadow: 'var(--elevation-2)' }}`
- Form appear: `bouncy` transition when "+ Add" transforms into form
- Delete: `AnimatePresence` exit animation

## Migration

SQL migration `00003_process_kanban.sql`:

```sql
-- 1. Add color to department
ALTER TABLE department ADD COLUMN IF NOT EXISTS color VARCHAR(20) DEFAULT 'indigo';

-- 2. Add norm_uph to process
ALTER TABLE process ADD COLUMN IF NOT EXISTS norm_uph DECIMAL(8,2);

-- 3. Backfill norm_uph from process_productivity_standard
-- Pick the row with skill_level = 3 (median), most recent effective_date, NULL site_id (global)
UPDATE process p
SET norm_uph = pps.units_per_hour
FROM (
  SELECT DISTINCT ON (process_id) process_id, units_per_hour
  FROM process_productivity_standard
  WHERE skill_level = 3
  ORDER BY process_id, effective_date DESC NULLS LAST
) pps
WHERE p.id = pps.process_id AND p.norm_uph IS NULL;

-- 4. Default norm_uph for any remaining processes
UPDATE process SET norm_uph = 0 WHERE norm_uph IS NULL;
```
