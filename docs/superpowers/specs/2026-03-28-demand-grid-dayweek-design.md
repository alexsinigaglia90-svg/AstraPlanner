# Demand Grid — Week/Day Granularity with AAA-grade UX

**Date:** 2026-03-28
**Status:** Approved

## Overview

Refactor the demand grid from week-only input to a "week-first, drill to day" system. The grid shows weeks as collapsible columns. Click a week to expand into 7 day columns. Forecasts are stored per day; week values are computed totals. Both daily and weekly planners are supported in one unified UI.

## User Flow

### Default (week view)
```
                    Wk14        Wk15        Wk16        Wk17        Wk18        Wk19    → Uren
GTP (units)         270.000     285.000     ___         ___         ___         ___       142h
Manual Pick         4.200       4.800       ___         ___         ___         ___       24h
```

Each week cell shows:
- The week total (sum of 7 days)
- A mini 7-bar chart below the number showing day distribution
- Expand chevron (▸) in the header

### Expanded week
```
                  ┌─ Wk14 ──────────────────────────────────────────────┐
                  │ Ma 30/3  Di 31/3  Wo 1/4  Do 2/4  Vr 3/4  Za  Zo  │ Σ       Wk15     → Uren
GTP (units)       │ 50.000   60.000   40.000   55.000  45.000  20k  0  │ 270.000  285.000  142h
Manual Pick       │ 800      900      600      750     650     500  0  │ 4.200    4.800    24h
```

- Indigo left border on expanded section
- Weekend columns (Za/Zo) have lighter background
- Σ (sum) column is computed, non-editable, muted
- Multiple weeks can be expanded simultaneously

## Smart Features

### 1. Mini heatmap in collapsed week cell
Under the week total, 7 tiny vertical bars (each ~3px wide, ~12px max height) showing relative day volumes. Indigo gradient coloring. Gives visual distribution at a glance.

### 2. Smart distribute on week entry
When user types a week total:
- **First time (no history):** Distribute evenly over Mon-Fri, Sat/Sun = 0
- **Has previous week data:** Use the day-distribution ratio of the most recent filled week for that process. E.g., if last week was 20%-25%-20%-22%-13%-0%-0%, apply same percentages to new total.
- Creates/updates 7 day records in the database

### 3. Live hours indicator per row
Right-most column shows computed total hours: `Σ(weekly volumes) ÷ norm_uph`. Color-coded:
- Green: within capacity
- Amber: approaching limit (>80% of available hours)
- Red: over capacity
Updates live as values change.

### 4. Week header as expandable pill
Week header is a clickable pill-button. Chevron (▸) rotates to (▾) on expand with framer-motion. Smooth expand/collapse animation on the day columns.

## Database

**No schema change needed.** Forecasts are stored per day:
- `period_start` = date (e.g., `2026-03-30`)
- `period_end` = same date
- 1 record per process per day

The existing `demand_forecast` table with `process_id` column (from migration 00013) works as-is.

## Backend Changes

### Update `upsertProcessForecast`
Currently accepts a single period. Add a `granularity` parameter:

```typescript
input: {
  site_id, process_id, volume, unit_of_measure,
  // For day entry:
  date: string,  // ISO date, e.g. "2026-03-30"
  // OR for week entry:
  week_start: string,  // Monday ISO date
  distribute: boolean, // true = smart distribute over 7 days
}
```

When `distribute: true`:
1. Look up most recent week with data for this process
2. If found, use its day-distribution ratios
3. If not found, distribute evenly Mon-Fri, Sat/Sun = 0
4. Upsert 7 day records

### Update `listProcessDemand`
Return day-level records. Frontend aggregates to weeks.

Add `distribution_pattern` to response (optional): the day ratios from the most recent filled week, so frontend can show the mini heatmap for empty weeks too.

## Frontend Changes

### DemandGrid component rewrite
The grid component needs to handle:
- Collapsed weeks (show total + mini heatmap)
- Expanded weeks (show 7 day columns + sum)
- `expandedWeeks: Set<string>` state (which weeks are open)
- Week cell click toggles expansion

### New sub-components
- `MiniHeatmap` — 7-bar SVG for collapsed week cells
- `WeekHeader` — expandable pill with chevron animation
- `DayColumns` — 7 day cells + sum column for expanded week

### DemandGridCell (existing)
No changes needed — works for both day and week cells.

## Styling

- Expanded week section: `borderLeft: 3px solid var(--primary)`, subtle indigo background tint
- Weekend columns: `backgroundColor: rgba(99,102,241,0.02)`
- Day headers: `fontSize: 10, fontWeight: 500` (smaller than week headers)
- Hours column: right-aligned, `fontFamily: var(--font-mono)`, color-coded
- Mini heatmap bars: `fill: rgba(99,102,241, 0.3-0.8)` scaled by relative value
- Chevron rotation: `motion.div animate={{ rotate: expanded ? 90 : 0 }}`

## Copy-paste support

- Paste on collapsed week: interprets as week total, smart distributes
- Paste on expanded day cells: fills day by day (standard grid paste)
- Tab navigation works across visible cells only
