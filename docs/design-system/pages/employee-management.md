# Employee Management — Page Design Override

> Inherits from: [MASTER.md](../MASTER.md)
> Only deviations and additions are documented here.

---

## Layout

- **Master-detail split**: list panel (40%) + detail panel (60%) on desktop
- **Full-width list** on tablet/mobile, detail opens as slide-over sheet
- **Sidebar visible** (standard navigation)

## Employee List Panel

### Search & Filters
- Search input at top with magnifying glass icon
- **Instant search**: debounced 200ms, results filter with staggered fade
- Filter chips below search: department, contract type, skill, status
- Active filters shown as pills with X dismiss (spring-in animation)

### List Items
- Each item: avatar (40px circle) + name + department badge + skill count pill
- **Hover**: lift + shadow increase (`bouncy` spring)
- **Selected**: left border 4px `--primary` + bg `--primary/5%`, spring slide-in
- **Status dot**: colored circle (8px) — active (green), on leave (amber), terminated (gray)
- **Skeleton loading**: 8 placeholder rows with shimmer animation

### Bulk Actions
- Checkbox appears on hover (left of avatar)
- Bulk action bar slides up from bottom with spring when items selected
- Actions: Assign Skill, Change Status, Export, Delete

## Detail Panel

### Header
- Large avatar (80px) + name (h2 Nunito) + role badge + status badge
- Edit button (ghost, pencil icon) — switches to inline edit mode with fade transition
- "Last active" timestamp in caption text

### Tabs
- Skills, Availability, History, Documents
- Animated underline indicator slides between tabs (`bouncy` spring)
- Tab content fades + slides in on switch (200ms)

### Skills Tab
- Grid of skill cards (2-column on desktop)
- Each card: skill name + proficiency dots (5 dots, filled by level) + certification badge + expiry date
- **Proficiency dots animate** on first view: fill sequentially (100ms per dot, scale-in)
- Add skill: opens modal with skill selector + proficiency slider
- Certification expiring soon: amber warning border + clock icon

### Availability Tab
- Weekly calendar grid view (7 columns × 24 rows)
- Color blocks for availability windows
- Click-to-set: click a cell to toggle availability (green fill animates in)
- Drag to select range: selection highlight follows finger/cursor
- Leave entries shown as overlay blocks with striped pattern

### History Tab
- Timeline view: vertical line with event dots
- Events: assignments, skill changes, status changes, absences
- Each event fades + slides in on scroll (intersection observer)

## CSV Import Flow

- "Import Employees" button in toolbar
- Opens full-screen overlay (not modal — needs space for column mapping)
- Three stages with animated step indicator:
  1. **Upload**: drop zone with file icon animation
  2. **Map columns**: drag-and-drop column matching with spring animations
  3. **Review**: data table preview with validation highlights (green rows = valid, red = errors)
- Import progress: animated progress bar with live counter ("142 / 500 employees imported")
- Completion: summary card with stats (imported, skipped, errors) + staggered number counters

## Animation Additions

| Element | Animation |
|---------|-----------|
| List filter result | Items that don't match fade out (150ms), remaining items close gaps (300ms spring) |
| Detail panel open | Panel slides in from right with `gentle` spring (mobile: slide-over sheet from bottom) |
| Skill proficiency change | Old dots fade, new dots fill sequentially with `bouncy` spring |
| Avatar upload | Old avatar cross-fades to new (300ms), subtle scale pulse on complete |
| Bulk select | Checkbox slides in from left (150ms), action bar springs up from bottom |
