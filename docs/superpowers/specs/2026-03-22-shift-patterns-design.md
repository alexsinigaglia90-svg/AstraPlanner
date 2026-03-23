# Shift Patterns, Crews & Rotation

## Context

The solver needs to know which employees work which shifts on which weeks. This requires three concepts: shifts (time blocks), crews (groups of people), and a rotation schedule that maps crews to shifts across a repeating cycle.

## Decisions

- **3-layer model**: Shifts (time blocks) → Crews (employee groups) → Rotation (crew-shift mapping per week)
- **Site-scoped**: shifts, crews, and rotation are per site
- **Crew assignment**: employees are assigned to a crew, not directly to a shift
- **Cycle length**: user-configurable (2, 3, 4+ weeks)
- **Breaks**: time + duration only, no paid/unpaid distinction
- **Location**: `/dashboard/settings/shifts` under Settings

## Data Model

### `shift_pattern` table (existing, add `site_id`)

Already exists with all needed columns. Changes:
- Add `site_id UUID REFERENCES site(id)` — nullable initially, backfill, then NOT NULL
- Remove `paid_hours` from UI (keep in DB, not shown/edited)
- `break_rules_json`: `{ breaks: [{ after_hours: number, duration_minutes: number }] }`
- `days_of_week`: `SMALLINT[]` — 1=Mon through 7=Sun

### `crew` table (new)

```sql
CREATE TABLE crew (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id         UUID         NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  name            VARCHAR(100) NOT NULL,
  code            VARCHAR(20)  NOT NULL,
  color           VARCHAR(20)  DEFAULT 'indigo',
  is_active       BOOLEAN      NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT uq_crew_org_site_code UNIQUE (organization_id, site_id, code)
);
```

### `rotation_schedule` table (new)

```sql
CREATE TABLE rotation_schedule (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID     NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  site_id         UUID     NOT NULL REFERENCES site(id) ON DELETE CASCADE,
  cycle_weeks     SMALLINT NOT NULL DEFAULT 2,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_rotation_site UNIQUE (organization_id, site_id)
);
```

### `rotation_entry` table (new)

```sql
CREATE TABLE rotation_entry (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rotation_schedule_id UUID     NOT NULL REFERENCES rotation_schedule(id) ON DELETE CASCADE,
  crew_id              UUID     NOT NULL REFERENCES crew(id) ON DELETE CASCADE,
  shift_pattern_id     UUID     NOT NULL REFERENCES shift_pattern(id) ON DELETE CASCADE,
  week_number          SMALLINT NOT NULL,
  CONSTRAINT uq_rotation_crew_week UNIQUE (rotation_schedule_id, crew_id, week_number)
);
```

### Employee linkage

Add `crew_id UUID REFERENCES crew(id) ON DELETE SET NULL` to the `employee` table.

## UI — Settings Shifts Page

Page at `/dashboard/settings/shifts` with three sections stacked vertically:

### Section 1: Shifts

Card-based list of shift time blocks for the active site.

Each card shows:
- Name (e.g. "Vroege Dienst")
- Visual time bar: colored block on a 24-hour axis showing start→end
- Duration (auto-calculated from start/end, accounting for overnight)
- Active days: 7 small circles for Mon-Sun, filled for active days
- Pauze info: e.g. "15min na 2.5u"
- ⋮ menu: Edit, Delete (hold-to-delete if used in rotation)

**Add Shift** button opens a modal:
- Name input
- Start time + End time (time pickers or hour:minute inputs)
- Duration: auto-calculated, shown as read-only
- Days of week: 7 clickable day circles (Mon-Sun), default all weekdays
- Breaks: list of break rules. Each: "after [X] hours → [Y] min pause". Add/remove break rules.
- Overnight toggle: auto-detected when end < start

### Section 2: Crews

Simple card list of crews.

Each card shows:
- Name + color dot
- Member count (from employee table)

**Add Crew** button opens a small modal:
- Name input
- Color picker (6 presets, same as departments, filtered to unused)

Edit/Delete via ⋮ menu. Delete blocked if crew has employees or rotation entries.

### Section 3: Rotation Schedule

Visible only when there are both shifts AND crews.

**Setup:**
- Cycle length selector: dropdown or button group (2, 3, 4, or custom number)
- Below: a matrix/grid

**Matrix:**
- Columns: Week 1, Week 2, ..., Week N
- Rows: one per crew
- Each cell: a dropdown or clickable selector showing available shifts
- Cell shows the shift name + a colored block matching the shift's color

When the user changes the cycle length, the matrix resizes. Existing entries are preserved where possible.

**Save**: saves the entire rotation (upsert all entries atomically).

## tRPC Endpoints

All use admin client with `organization_id` filter.

### Shifts
- `org.listShifts` — input: `{ site_id }`, returns shift patterns for site
- `org.upsertShift` — input: `{ id?, name, site_id, start_time, end_time, days_of_week, break_rules, is_overnight? }`
- `org.deleteShift` — input: `{ id }`, blocked if used in rotation_entry

### Crews
- `org.listCrews` — input: `{ site_id }`, returns crews with member_count
- `org.upsertCrew` — input: `{ id?, name, site_id, color }`
- `org.deleteCrew` — input: `{ id }`, blocked if has employees or rotation entries

### Rotation
- `org.getRotation` — input: `{ site_id }`, returns schedule + entries
- `org.saveRotation` — input: `{ site_id, cycle_weeks, entries: [{ crew_id, shift_pattern_id, week_number }] }`, upserts schedule + replaces all entries atomically

### Employee
- Extend `workforce.upsertEmployee` to accept `crew_id`
- Extend `workforce.getEmployee` / `listEmployees` to return `crew_id`

## Employee Edit Integration

Add a "Crew" dropdown to the employee edit form (`EditEmployeeForm`). Shows crews for the active site. Optional — can be null.
