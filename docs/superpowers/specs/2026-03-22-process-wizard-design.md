# Process Creation Wizard

## Context

The kanban board's inline "+ Add Process" card form is too limited. Processes have two types (productive vs supportive), each with different configuration needs. The wizard replaces the inline form with a 3-step modal that guides users through designing a process.

## Decisions

- **Wizard modal** — opens when clicking "+ Add Process" in a department column
- **Process types**: Productive (has output norm) or Supportive (no direct output)
- **Supportive sub-types**: Linked (ratio to parent process FTE) or Standalone (fixed headcount per shift)
- **Priority** — applies to ALL processes (Critical / Important / Flexible), used by solver to prioritize
- **Certifications** — toggleable chips, custom ones can be added
- **Edit mode** — same wizard opens pre-filled when editing an existing process

## Data Model Changes

New columns on `process` table:

```sql
ALTER TABLE process ADD COLUMN IF NOT EXISTS process_type VARCHAR(20) DEFAULT 'productive';  -- 'productive' | 'supportive'
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_type VARCHAR(20);  -- 'linked' | 'standalone' (NULL for productive)
ALTER TABLE process ADD COLUMN IF NOT EXISTS parent_process_id UUID REFERENCES process(id) ON DELETE SET NULL;  -- for linked support
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_ratio_self INTEGER DEFAULT 1;  -- e.g. 1 jam buster
ALTER TABLE process ADD COLUMN IF NOT EXISTS support_ratio_parent INTEGER DEFAULT 1;  -- per 4 pickers
ALTER TABLE process ADD COLUMN IF NOT EXISTS fixed_headcount INTEGER;  -- for standalone support (per shift)
ALTER TABLE process ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'important';  -- 'critical' | 'important' | 'flexible'
ALTER TABLE process ADD COLUMN IF NOT EXISTS conversion_input_uom VARCHAR(30);  -- e.g. 'pallet'
ALTER TABLE process ADD COLUMN IF NOT EXISTS conversion_output_qty DECIMAL(8,2);  -- e.g. 12 (totes per pallet)
ALTER TABLE process ADD COLUMN IF NOT EXISTS certifications_required TEXT[] DEFAULT '{}';  -- e.g. ['forklift', 'ADR']
```

## UI Components

### ProcessWizard (`src/components/domain/process-wizard.tsx`)

Modal component with 3 steps. Opens centered with backdrop blur. Spring animations between steps.

**Props:**
```typescript
interface ProcessWizardProps {
  open: boolean
  onClose: () => void
  departmentId: string
  departmentName: string
  departmentColor: string
  existingProcesses: { id: string; name: string; unit_of_measure: string; norm_uph: number }[]
  initialValues?: ProcessFormData  // for edit mode
  onSave: (data: ProcessFormData) => Promise<void>
}

interface ProcessFormData {
  id?: string
  name: string
  process_type: 'productive' | 'supportive'
  // Productive fields
  unit_of_measure?: string
  norm_uph?: number
  conversion_input_uom?: string
  conversion_output_qty?: number
  // Supportive fields
  support_type?: 'linked' | 'standalone'
  parent_process_id?: string
  support_ratio_self?: number
  support_ratio_parent?: number
  fixed_headcount?: number
  // Common fields (step 3)
  priority: 'critical' | 'important' | 'flexible'
  min_skill_level: number
  certifications_required: string[]
}
```

**Step 1 — Identity:**
- Name input with live SmartIcon
- Two visual cards: Productive vs Supportive
- Next enabled when name is filled and type is selected

**Step 2a — Productive:**
- UOM chip selector (orders, order lines, pallets, cartons, pieces, totes, units, + custom)
- Norm input (large number) with live calculations (per shift, per unit time)
- Optional conversion ratio (input UOM → output qty)

**Step 2b — Supportive:**
- Two sub-type cards: "Linked to a process" vs "Standalone"
- If Linked: process selector from `existingProcesses` + ratio inputs
- If Standalone: fixed headcount per shift input

**Step 3 — Priority & Requirements (all types):**
- Priority: 3 visual cards (Critical 🔴 / Important 🟡 / Flexible 🟢)
- Minimum skill level: 5 clickable buttons (1-5)
- Certifications: toggleable chips + "+ Add" for custom

**Step indicator:** 3 progress bars in header, colored by completion state

**Animations:**
- Modal: `bouncy` entrance, backdrop blur
- Steps: slide left/right with `snappy` transition
- SmartIcon: `wobbly` entrance on match change
- Priority cards: `scalePress` on click

## tRPC Changes

**`org.upsertProcess`** — extend input to accept all new fields:
```typescript
{
  id?: string
  name: string
  department_id: string
  process_type: 'productive' | 'supportive'
  unit_of_measure?: string
  norm_uph?: number
  conversion_input_uom?: string
  conversion_output_qty?: number
  support_type?: 'linked' | 'standalone'
  parent_process_id?: string
  support_ratio_self?: number
  support_ratio_parent?: number
  fixed_headcount?: number
  priority: 'critical' | 'important' | 'flexible'
  min_skill_level?: number
  certifications_required?: string[]
}
```

**`org.listProcesses`** — extend return shape to include new fields so edit mode can pre-fill the wizard.

## Migration

SQL migration `00004_process_wizard.sql` with all ALTER TABLE statements listed above.

## Integration

- `DepartmentColumn` "+ Add Process" button opens the wizard instead of inline `ProcessCardForm`
- `ProcessCard` edit menu opens the wizard in edit mode (pre-filled)
- `ProcessCard` displays a small priority indicator (colored dot) and process type badge
- The inline `ProcessCardForm` component is no longer used for creation (kept for potential future inline editing)
