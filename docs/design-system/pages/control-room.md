# Control Room — Page Design Override

> Inherits from: [MASTER.md](../MASTER.md)
> Only deviations and additions are documented here.

---

## Layout Override

- **Full-bleed layout** — no max-width, content uses entire viewport
- **No sidebar** — sidebar collapses to thin icon rail (64px) to maximize data space
- **Grid system**: CSS Grid with named areas: `kpi-row | heatmap-main alerts-panel | timeline-footer`
- **Designed for wall displays** (1920px+) — text sizes scale up 1.25x at `desktop-xl` breakpoint

## Unique Components

### KPI Strip (Top)
- Horizontal row of 4-6 KPI cards: Total FTEs, Coverage %, Overtime Hours, Labor Cost, Open Gaps, Alerts
- Each card: `radius-xl` (20px), `elevation-1`, 120px min-width
- **Hero number** uses `kpi-hero` size (40px JetBrains Mono)
- **Trend arrow** (↑ green / ↓ red / → gray) animates on value change
- **Sparkline** (last 7 days) below the number — tiny area chart, 40px tall
- Numbers animate with counter roll (600ms)
- On hover: card lifts + shows tooltip with breakdown

### Coverage Heatmap (Center)
- Custom SVG grid: X-axis = time slots (hours), Y-axis = process areas
- Cell colors from `--coverage-*` tokens
- Cell size: min 48x48px (touch-friendly)
- **On hover**: cell scales 1.08, tooltip shows exact FTE values (required vs assigned)
- **On click**: opens assignment detail for that slot in a slide-over panel
- **Animated entrance**: cells fade in with stagger (20ms per cell, left-to-right, top-to-bottom)
- **Real-time updates**: changed cells pulse briefly (300ms background flash)

### Alert Feed (Right Panel)
- Vertical scrolling list, max 400px width on desktop
- Each alert: icon + severity color bar (left border 4px) + title + timestamp
- New alerts slide in from top with `bouncy` spring
- Grouped by severity: Critical → Warning → Info
- Click to navigate to relevant plan/assignment
- "Mark all read" button at top

### Timeline Strip (Bottom)
- Horizontal scrollable timeline showing the current day's shifts
- Active shift highlighted, upcoming shifts dimmer
- Now-line (vertical red dashed line) moves in real-time
- Shift blocks show employee count as a pill badge

## Animation Additions

| Element | Animation |
|---------|-----------|
| KPI value update | Counter rolls to new value (600ms), trend arrow bounces in |
| Heatmap cell change | Background color transitions (400ms ease), brief scale pulse |
| New alert | Slides in from top with spring + subtle shake for critical |
| Now-line movement | Smooth CSS translateX (updates every 60s) |
| Panel resize | Width animates with `gentle` spring |

## Dark Mode Notes
- Heatmap cell colors remain vivid (not desaturated) — data readability is priority
- KPI card backgrounds use `#1A1830` with subtle indigo border glow
- Alert severity colors stay at full saturation
