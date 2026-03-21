# Schedule Grid / Planning Workbench — Page Design Override

> Inherits from: [MASTER.md](../MASTER.md)
> Only deviations and additions are documented here.

---

## Layout Override

- **Full-width layout** with thin sidebar (icon rail, 64px)
- **Toolbar strip** at top (56px): filters, view mode toggle, undo/redo, zoom controls
- **Grid takes remaining viewport** — scroll is internal to the grid component
- **Split-view option**: grid left (70%) + employee detail right (30%)

## Grid Component

### Structure
- **Y-axis (rows)**: Employees, sorted/grouped by department or skill
- **X-axis (columns)**: Time slots (configurable: 15min, 30min, 1hr, shift-level)
- **Sticky first column** (employee name + avatar, 200px)
- **Sticky header row** (time slot labels)
- **Cell content**: Process name badge + hours (e.g., "Pick 8h")

### Drag-and-Drop Behavior

This is the most animation-intensive feature in AstraPlanner:

| Phase | Visual Effect |
|-------|---------------|
| **Hover over draggable cell** | Cursor changes, cell gets subtle lift (`elevation-1` → `elevation-2`) |
| **Drag start** | Cell lifts out (scale 1.05, `elevation-3`, opacity 0.85), original position shows dashed outline |
| **Dragging** | Element follows cursor smoothly, valid drop targets pulse with green border |
| **Over invalid target** | Target flashes red briefly (200ms), cursor shows no-drop |
| **Drop (valid)** | "Plop" animation: target cell scales 1.06→1.0 with `wobbly` spring, success flash (green bg fade 400ms) |
| **Drop (constraint violation)** | Element snaps back to origin with `bouncy` spring, error toast slides in, violation cells highlighted red |
| **Undo** | Assignment slides back to previous position with `gentle` spring |

### Cell Styling

| State | Background | Border | Text |
|-------|-----------|--------|------|
| Assigned (optimizer) | `--primary/10%` | `--primary/30%` left-3px | `--foreground` |
| Assigned (manual) | `--secondary/10%` | `--secondary/30%` left-3px | `--foreground` |
| Locked | `--muted` | solid `--border` | `--muted-foreground` + lock icon |
| Unmet demand | `--destructive/10%` | `--destructive/40%` dashed | `--destructive` |
| Empty (no demand) | transparent | none | — |
| Hovered | `--primary/5%` | — | — |
| Selected | `--primary/15%` | `--primary` solid 2px | — |
| Constraint violation | `--destructive/15%` | `--destructive` solid 2px | — |

### Real-Time Constraint Validation
- As user drags, the grid instantly validates constraints
- Violations show as red-bordered cells with tooltip explaining the constraint
- Constraint panel (collapsible) at bottom shows active violations count with animated badge

## Toolbar

| Element | Behavior |
|---------|----------|
| View toggle (Timeline / Grid / List) | Animated tab indicator slides with spring |
| Zoom slider (15min → shift) | Grid columns smoothly resize (300ms ease-out) |
| Undo/Redo buttons | Disabled state with opacity 0.4; press animation even when active |
| "Generate Plan" button | Primary CTA, loading spinner on solve, pulsing glow while optimizer runs |
| Filter dropdowns | Department, skill, availability — spring-open animation |

## Animation Additions

| Element | Animation |
|---------|-----------|
| Grid initial load | Rows stagger in (30ms per row, fade + translateX from left) |
| Column resize | Width transitions with `gentle` spring |
| New assignment (optimizer result) | Cells fill sequentially (stagger 20ms) with scale-in + color fill |
| Constraint check complete | Green pulse sweep across validated rows |
| Plan publishing | Rows cascade a "lock" animation (lock icon appears, row bg shifts to muted) |

## Performance Notes
- **Virtualized rows and columns** — only render visible cells (react-window)
- **Canvas fallback** for grids > 200 employees × 48 time slots
- **Debounce drag validation** at 16ms (frame-rate) to avoid jank
- **Optimistic UI**: update grid immediately on drop, validate async, rollback if invalid
