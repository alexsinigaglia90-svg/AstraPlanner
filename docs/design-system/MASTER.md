# AstraPlanner Design System — MASTER

> **Authority:** This is the single source of truth for all UI/UX decisions across AstraPlanner.
> **Philosophy:** Ultra AAA-grade design. Cartoonish micro-animations. Beautiful interfaces. Speed and usability above all.
> **Generated with:** UI/UX Pro Max Skill
> **Last updated:** 2026-03-21

---

## 1. Design Philosophy

AstraPlanner is enterprise workforce planning software that **refuses to look like enterprise software**. Our design philosophy is built on three pillars:

### 1.1 "Feels Like Magic, Works Like Math"
Behind every beautiful animation is a HiGHS solver crunching constraint matrices. The user never sees the math — they see smooth transitions, satisfying interactions, and clear results. The complexity is hidden; the delight is visible.

### 1.2 "Speed Is a Feature"
Every interaction must feel instant. Pages load with staggered skeleton screens. Actions respond within 100ms with visual feedback. The optimizer runs in the background while the UI stays fully interactive. Perceived performance matters more than actual performance.

### 1.3 "Playful Precision"
We use bouncy spring animations and rounded shapes to create warmth, but every element has a purpose. Cartoonish doesn't mean careless — it means approachable, memorable, and joyful to use 8 hours a day.

---

## 2. Visual Identity

### 2.1 Style: Tactile Digital + Data-Dense Dashboard Hybrid

We combine two style approaches:
- **Tactile Digital** for interactive elements: buttons squish on press, cards float with subtle shadows, transitions use spring physics
- **Data-Dense Dashboard** for information display: clean grids, compact KPI cards, heatmaps, efficient use of space

This hybrid creates a unique identity: **enterprise data delivered through a consumer-grade experience**.

### 2.2 Design Language Keywords
`tactile` · `spring-physics` · `bouncy` · `rounded` · `data-rich` · `cartoonish` · `playful-precision` · `glass-accents` · `staggered-entrance` · `micro-animated`

---

## 3. Color System

### 3.1 Brand Palette — "Cosmic Indigo"

We use an Indigo-based palette that feels modern and vibrant while maintaining WCAG AA compliance for all data-dense views.

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `--primary` | `#6366F1` | `#818CF8` | Primary actions, active states, selected items |
| `--primary-hover` | `#4F46E5` | `#6366F1` | Hover state for primary |
| `--primary-foreground` | `#FFFFFF` | `#FFFFFF` | Text on primary |
| `--secondary` | `#818CF8` | `#A5B4FC` | Secondary actions, links, highlights |
| `--accent` | `#F97316` | `#FB923C` | CTAs, alerts-requiring-attention, badges |
| `--accent-foreground` | `#FFFFFF` | `#0F172A` | Text on accent |
| `--success` | `#10B981` | `#34D399` | Positive indicators, coverage met, approved |
| `--warning` | `#F59E0B` | `#FBBF24` | Caution states, approaching limits |
| `--destructive` | `#EF4444` | `#F87171` | Errors, gaps, overtime alerts, destructive actions |
| `--background` | `#F5F3FF` | `#0F0E1A` | Page background (soft lavender tint) |
| `--foreground` | `#1E1B4B` | `#F5F3FF` | Primary text |
| `--card` | `#FFFFFF` | `#1A1830` | Card surfaces |
| `--card-foreground` | `#1E1B4B` | `#E8E5F5` | Text on cards |
| `--muted` | `#E8E5F5` | `#2A2845` | Muted backgrounds, inactive states |
| `--muted-foreground` | `#64748B` | `#94A3B8` | Secondary text, placeholders |
| `--border` | `#E0E7FF` | `#3730A3` | Borders, dividers |
| `--ring` | `#6366F1` | `#818CF8` | Focus rings |

### 3.2 Coverage Status Colors (Domain-Specific)

These semantic colors are used exclusively in the planning views:

| Token | Color | Meaning |
|-------|-------|---------|
| `--coverage-over` | `#3B82F6` (blue) | Overstaffed (> 110%) |
| `--coverage-met` | `#10B981` (green) | Coverage met (90-110%) |
| `--coverage-under` | `#F59E0B` (amber) | Understaffed (70-90%) |
| `--coverage-gap` | `#EF4444` (red) | Critical gap (< 70%) |
| `--coverage-empty` | `#CBD5E1` (gray) | No demand / no data |

### 3.3 Rules
- **Never use raw hex in components** — always reference semantic tokens
- **Dark mode uses desaturated variants** — not inverted colors
- **Status colors always include an icon** — never rely on color alone
- **Minimum contrast 4.5:1** for body text, **3:1** for large text and UI elements

---

## 4. Typography

### 4.1 Font Stack

| Role | Font | Weight(s) | Fallback |
|------|------|-----------|----------|
| **Display / Headlines** | Nunito | 700, 800, 900 | `system-ui, sans-serif` |
| **Body / UI** | DM Sans | 400, 500, 700 | `system-ui, sans-serif` |
| **Data / Numbers** | JetBrains Mono | 400, 500 | `ui-monospace, monospace` |

**Why this combo:**
- **Nunito** has rounded terminals — gives headers a warm, cartoonish, approachable feel without sacrificing readability
- **DM Sans** is geometric and clean — perfect for dense data interfaces, highly readable at small sizes
- **JetBrains Mono** for tabular data — prevents layout shift in numbers, aligns perfectly in grids

### 4.2 Type Scale

| Level | Size | Line Height | Weight | Font | Usage |
|-------|------|-------------|--------|------|-------|
| `display` | 48px / 3rem | 52px | Nunito 900 | Nunito | Hero sections, page titles |
| `h1` | 32px / 2rem | 40px | Nunito 800 | Nunito | Page headings |
| `h2` | 24px / 1.5rem | 32px | Nunito 700 | Nunito | Section headings |
| `h3` | 20px / 1.25rem | 28px | Nunito 700 | Nunito | Card titles, subsections |
| `h4` | 16px / 1rem | 24px | DM Sans 700 | DM Sans | Label headings |
| `body` | 16px / 1rem | 24px | DM Sans 400 | DM Sans | Body text |
| `body-sm` | 14px / 0.875rem | 20px | DM Sans 400 | DM Sans | Secondary info, table cells |
| `caption` | 12px / 0.75rem | 16px | DM Sans 500 | DM Sans | Timestamps, badges, hints |
| `data` | 14px / 0.875rem | 20px | JetBrains Mono 400 | JetBrains Mono | Numbers, metrics, KPIs |
| `data-lg` | 28px / 1.75rem | 36px | JetBrains Mono 500 | JetBrains Mono | Big number KPI cards |
| `kpi-hero` | 40px / 2.5rem | 44px | JetBrains Mono 500 | JetBrains Mono | Dashboard hero metrics |

### 4.3 CSS Import
```css
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,400;0,500;0,700;1,400&family=Nunito:wght@700;800;900&family=JetBrains+Mono:wght@400;500&display=swap');
```

### 4.4 Tailwind Config
```typescript
fontFamily: {
  display: ['Nunito', 'system-ui', 'sans-serif'],
  body: ['DM Sans', 'system-ui', 'sans-serif'],
  mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
}
```

### 4.5 Rules
- **Use tabular figures (`font-variant-numeric: tabular-nums`)** for all number columns
- **Never use text smaller than 12px** — even for captions
- **Numbers always use JetBrains Mono** — prevents layout shift in tables and KPI cards
- **Headlines always use Nunito** — maintains the playful brand feel

---

## 5. Spacing & Layout

### 5.1 Spacing Scale (4px base)

| Token | Size | Usage |
|-------|------|-------|
| `space-0.5` | 2px | Icon-to-text inline gap |
| `space-1` | 4px | Tight padding (badges, chips) |
| `space-2` | 8px | Default inline gap |
| `space-3` | 12px | Input padding, card internal gap |
| `space-4` | 16px | Card padding, section gap (small) |
| `space-6` | 24px | Section gap (medium) |
| `space-8` | 32px | Section gap (large) |
| `space-10` | 40px | Page section spacing |
| `space-12` | 48px | Major section dividers |
| `space-16` | 64px | Page-level vertical rhythm |

### 5.2 Border Radius Scale

| Token | Size | Usage |
|-------|------|-------|
| `radius-sm` | 8px | Small buttons, badges, chips |
| `radius-md` | 12px | Inputs, dropdowns |
| `radius-lg` | 16px | Cards, panels |
| `radius-xl` | 20px | Large cards, modals |
| `radius-2xl` | 24px | Floating panels, popovers |
| `radius-full` | 9999px | Avatars, circular buttons, pills |

**Our corners are intentionally rounder than typical SaaS** — this is what gives AstraPlanner its friendly, cartoonish personality. The minimum radius for any rectangular element is 8px.

### 5.3 Elevation / Shadow Scale

| Level | Shadow | Usage |
|-------|--------|-------|
| `elevation-0` | none | Flat elements, inline |
| `elevation-1` | `0 1px 3px rgba(99,102,241,0.08)` | Cards at rest |
| `elevation-2` | `0 4px 12px rgba(99,102,241,0.12)` | Cards on hover, dropdowns |
| `elevation-3` | `0 8px 24px rgba(99,102,241,0.16)` | Floating panels, popovers |
| `elevation-4` | `0 16px 48px rgba(99,102,241,0.20)` | Modals, command palette |

**Shadows use brand-tinted color** (indigo-tinted rgba) instead of pure black — this creates a cohesive, warmer feel.

### 5.4 Layout Breakpoints

| Token | Width | Target |
|-------|-------|--------|
| `mobile` | 375px | Small phones |
| `mobile-lg` | 428px | Large phones |
| `tablet` | 768px | Tablets portrait |
| `tablet-lg` | 1024px | Tablets landscape / small laptops |
| `desktop` | 1280px | Standard desktop |
| `desktop-lg` | 1440px | Large desktop (primary planner device) |
| `desktop-xl` | 1920px | Wall displays, control room monitors |

### 5.5 Container Widths

| Context | Max Width |
|---------|-----------|
| Auth pages (login, signup) | 480px |
| Wizard flow | 720px |
| Standard content | 1280px |
| Dashboard / Control Room | Full width (with 24px padding) |
| Schedule grid | Full width (with 16px padding) |

### 5.6 Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `z-base` | 0 | Normal flow |
| `z-dropdown` | 10 | Dropdowns, tooltips |
| `z-sticky` | 20 | Sticky headers, sidebars |
| `z-overlay` | 30 | Overlays, scrims |
| `z-modal` | 40 | Modals, dialogs |
| `z-popover` | 50 | Popovers, command palette |
| `z-toast` | 60 | Toast notifications |
| `z-maximum` | 100 | Absolutely-must-be-on-top |

---

## 6. Animation & Micro-Interactions

This is where AstraPlanner becomes truly distinctive. Every interaction has a considered animation.

### 6.1 Spring Physics Configuration

All interactive animations use **spring physics** instead of CSS easing curves. This creates the bouncy, alive, cartoonish feel.

```typescript
// Framer Motion spring configs
const springs = {
  // Quick, snappy — button presses, toggles
  snappy: { type: 'spring', stiffness: 400, damping: 25, mass: 0.8 },

  // Bouncy — card hovers, menu opens, success states
  bouncy: { type: 'spring', stiffness: 300, damping: 20, mass: 1.0 },

  // Gentle — page transitions, large element moves
  gentle: { type: 'spring', stiffness: 200, damping: 26, mass: 1.2 },

  // Wobbly — celebration moments, achievement unlocks
  wobbly: { type: 'spring', stiffness: 180, damping: 12, mass: 1.0 },
}
```

### 6.2 Micro-Interaction Catalog

| Interaction | Animation | Duration | Config |
|------------|-----------|----------|--------|
| **Button press** | Scale to 0.95, subtle squish | ~200ms | `snappy` spring |
| **Button release** | Bounce back to 1.0 with overshoot | ~300ms | `bouncy` spring |
| **Card hover** | Lift (translateY -4px) + shadow increase | ~250ms | `bouncy` spring |
| **Card press** | Scale 0.98 + shadow decrease | ~150ms | `snappy` spring |
| **Toggle switch** | Thumb slides with bounce | ~300ms | `bouncy` spring |
| **Dropdown open** | Scale from 0.95 + fade, origin top | ~250ms | `bouncy` spring |
| **Dropdown close** | Scale to 0.95 + fade out | ~150ms | `snappy` spring |
| **Modal enter** | Scale from 0.9 + fade, backdrop blur | ~350ms | `gentle` spring |
| **Modal exit** | Scale to 0.95 + fade out | ~200ms | `snappy` spring |
| **Toast enter** | Slide from right + fade | ~300ms | `bouncy` spring |
| **Toast exit** | Slide right + fade out | ~200ms | `snappy` spring |
| **Page transition** | Fade + subtle Y shift (20px→0) | ~400ms | `gentle` spring |
| **List item enter** | Stagger: fade + Y shift (12px→0), 30ms delay per item | ~300ms each | `bouncy` spring |
| **Skeleton pulse** | Opacity 0.4↔0.7 shimmer sweep | 1.5s loop | CSS `ease-in-out` |
| **KPI number change** | Counter rolls up/down to new value | ~600ms | CSS `ease-out` |
| **Heatmap cell hover** | Scale 1.05 + tooltip fade in | ~200ms | `snappy` spring |
| **Drag start** | Lift (scale 1.03, shadow increase, opacity 0.9) | ~200ms | `bouncy` spring |
| **Drag over** | Target pulses subtly (scale 1.01↔1.0) | 800ms loop | CSS `ease-in-out` |
| **Drop success** | Target flashes success green + "plop" scale (1.05→1.0) | ~400ms | `wobbly` spring |
| **Tab switch** | Active indicator slides with spring | ~300ms | `bouncy` spring |
| **Sidebar collapse** | Width animates + items fade/stagger | ~350ms | `gentle` spring |
| **Coverage bar fill** | Width animates from 0% to value | ~800ms | CSS `ease-out` |
| **Alert enter** | Slide down + bounce at rest | ~400ms | `wobbly` spring |
| **Success checkmark** | SVG path draws + circle scale | ~500ms | `wobbly` spring |
| **Error shake** | X oscillation (3 shakes, ±6px) | ~400ms | CSS custom keyframes |
| **Approval stamp** | Scale from 0 + rotate 10° → 0° | ~500ms | `wobbly` spring |

### 6.3 Staggered Entrance Pattern

When multiple elements appear (list items, grid cards, KPI cards):

```typescript
// Stagger children on page mount
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,  // 40ms between each child
      delayChildren: 0.1,     // 100ms before first child
    },
  },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: springs.bouncy,
  },
}
```

### 6.4 Number Counter Animation

KPI values animate when they change:
```typescript
// Count up/down to new value
const AnimatedNumber = ({ value, format }) => {
  const spring = useSpring(value, { stiffness: 100, damping: 30 })
  const display = useTransform(spring, (v) => format(Math.round(v)))
  return <motion.span>{display}</motion.span>
}
```

### 6.5 Rules
- **Always use `transform` and `opacity`** — never animate `width`, `height`, `top`, `left`
- **Always respect `prefers-reduced-motion`** — disable springs, use instant transitions
- **Exit animations are faster than enter** — 60-70% of enter duration
- **Maximum 2 simultaneous animations per viewport** — more causes distraction
- **Every animation must have a purpose** — either confirm action, guide attention, or provide spatial context
- **Drag-and-drop animations are critical** — the schedule grid must feel tactile and responsive
- **Number animations are mandatory for KPI cards** — values should never "pop" in, they roll

---

## 7. Component Design Patterns

### 7.1 Buttons

| Variant | Style | Use |
|---------|-------|-----|
| **Primary** | Filled indigo, rounded-lg (12px), shadow | Main actions: Save, Approve, Generate Plan |
| **Secondary** | Outlined indigo, rounded-lg | Secondary actions: Cancel, Reset, Export |
| **Ghost** | Text only, hover bg-muted | Tertiary actions: View details, More options |
| **Destructive** | Filled red, rounded-lg | Destructive: Delete, Reject |
| **Icon** | Circle (radius-full), 40px, ghost | Action icons: Close, Menu, Settings |

All buttons:
- Squish on press (scale 0.95) with spring bounce-back
- Min height 44px (touch target)
- Min width 120px for text buttons
- Loading state: spinner replaces text, button stays same width
- Disabled: opacity 0.5, no press animation, cursor-not-allowed

### 7.2 Cards

All cards use:
- `radius-lg` (16px) corners
- `elevation-1` at rest, `elevation-2` on hover
- Subtle translateY(-4px) lift on hover
- 16-24px internal padding
- Consistent header/body/footer structure

### 7.3 Data Tables

Tables are the workhorse of AstraPlanner. They must be:
- **Horizontally scrollable** on mobile (never break layout)
- **Sticky first column** for employee names
- **Sticky header row**
- **Row highlight on hover** (muted background, 150ms transition)
- **Sortable columns** with animated sort indicator
- **Cell-level editing** for inline adjustments (click to edit, Enter to save)
- **Numbers always right-aligned** in JetBrains Mono

### 7.4 Forms

- **Floating labels** that animate up on focus (spring physics)
- **Inline validation** on blur, not on keystroke
- **Error messages slide in** below the field (spring animation)
- **Success checkmark** appears inline after valid input
- **Auto-save indicator** in wizard forms (subtle "Saved" text fade)
- **12px radius** on all inputs
- **Min height 48px** for all inputs

### 7.5 Modals & Sheets

- **Backdrop blur** (8px) + scrim (40% black)
- **Enter from center** (scale 0.9→1.0 with fade)
- **Confirm before dismiss** if unsaved changes
- **Max width 640px** for standard modals
- **Always have a clear close affordance** (X button top-right + Escape key)

### 7.6 Toast Notifications

- Slide in from top-right (desktop) or top-center (mobile)
- Auto-dismiss after 4 seconds
- Spring animation on enter, smooth exit
- Include icon (success checkmark, error X, warning triangle, info circle)
- Dismissable with X button or swipe
- Stack vertically if multiple (max 3 visible)

### 7.7 Navigation

- **Sidebar** for desktop (collapsible with spring animation)
- **Bottom nav** for mobile (max 5 items with labels)
- **Active indicator** slides between items with spring physics
- **Breadcrumbs** for 3+ level deep pages
- **Command palette** (Cmd+K) for power users — fuzzy search across all entities

---

## 8. Page-Specific Patterns

### 8.1 Control Room Dashboard
- Full-width layout, no max-width constraint
- KPI cards at top with animated number counters
- Coverage heatmap as the hero element (center-stage)
- Real-time update indicators (subtle pulse on changed values)
- Alerts panel on the right (slide-in items with stagger)

### 8.2 Schedule Grid / Planning Workbench
- Spreadsheet-like grid with sticky headers and first column
- Drag-and-drop assignments with lift, shadow, and "plop" animations
- Color-coded cells by coverage status
- Inline editing for quick adjustments
- Undo/redo with toast feedback
- Real-time constraint validation (red flash on violation)

### 8.3 Setup Wizard
- Centered layout (720px max)
- Step indicator with animated progress bar
- One-question-per-screen for complex config
- Smart defaults pre-filled
- Auto-save on every step
- Success celebration on completion (confetti particles or checkmark animation)

### 8.4 Employee Management
- Master-detail layout (list on left, detail on right)
- Search with instant filtering (debounced 200ms)
- Skill badges with proficiency level dots
- Availability calendar view
- CSV import with progress bar and validation feedback

---

## 9. Icon System

### 9.1 Library
Use **Lucide React** exclusively. Consistent stroke width (2px), rounded line caps.

### 9.2 Sizes
| Token | Size | Usage |
|-------|------|-------|
| `icon-xs` | 14px | Inline with caption text |
| `icon-sm` | 16px | Inside buttons, badges |
| `icon-md` | 20px | Standard UI icons |
| `icon-lg` | 24px | Navigation, section headers |
| `icon-xl` | 32px | Empty states, feature cards |
| `icon-2xl` | 48px | Page-level illustrations |

### 9.3 Rules
- **NEVER use emojis as icons** — always Lucide SVGs
- **Icons always have `aria-label`** when standalone (no adjacent text)
- **Consistent stroke width** across all icons (Lucide default 2px)
- **Animated icons** only for loading states and success/error feedback

---

## 10. Accessibility Requirements

These are non-negotiable, even with the playful design approach:

| Requirement | Standard | How We Achieve It |
|------------|----------|-------------------|
| Color contrast | WCAG AA (4.5:1 body, 3:1 large) | Semantic tokens pre-tested for both modes |
| Focus visibility | 2-4px visible focus ring | Ring color matches `--ring` token |
| Keyboard navigation | Full tab support | All interactive elements focusable, logical tab order |
| Screen reader | Aria labels, landmarks | Role attributes, aria-label on icon buttons |
| Reduced motion | `prefers-reduced-motion` | All springs become instant, skeletons stop animating |
| Touch targets | Min 44x44px | All buttons, inputs, interactive elements |
| Color not sole indicator | Icons + text alongside color | Coverage status always has icon + label |
| Dynamic text scaling | Supports system text size | `rem` units, flexible layouts |

---

## 11. Dark Mode Strategy

Dark mode is a first-class citizen, not an afterthought.

### 11.1 Surface Hierarchy (Dark)
| Surface | Color | Usage |
|---------|-------|-------|
| Page background | `#0F0E1A` | Deepest level — deep indigo-black |
| Card / Panel | `#1A1830` | Elevated surface |
| Hover / Active | `#2A2845` | Interactive state |
| Input background | `#221F3A` | Form inputs |
| Border | `#3730A3` | Subtle indigo borders |

### 11.2 Rules
- **No pure black (`#000000`)** — always use deep indigo-tinted darks
- **No pure white text** — use `#F5F3FF` (slight lavender) for warmth
- **Shadows change to glow** — in dark mode, elevation is expressed as subtle indigo glow instead of drop shadow
- **Test every component in both modes** before shipping

---

## 12. Performance Targets

| Metric | Target | How |
|--------|--------|-----|
| First Contentful Paint | < 1.2s | SSR with Next.js, critical CSS inlined |
| Largest Contentful Paint | < 2.5s | Streaming Suspense, skeleton screens |
| Cumulative Layout Shift | < 0.05 | Reserved space for async content, image dimensions |
| Interaction to Next Paint | < 200ms | Optimistic updates, spring animations mask latency |
| Animation frame rate | 60fps | Only `transform`/`opacity`, no layout thrashing |
| List virtualization | > 50 items | React-window for employee lists, assignment tables |
| Bundle size (initial) | < 200KB gzipped | Route-level code splitting, dynamic imports |

---

## 13. Responsive Strategy

### 13.1 Mobile-First, Desktop-Optimized

AstraPlanner is primarily a desktop tool (planners work on laptops/monitors), but must be fully usable on tablets and viewable on phones.

| Breakpoint | Experience |
|-----------|------------|
| Mobile (375-767px) | View-only dashboards, simplified navigation, employee portal |
| Tablet (768-1023px) | Full dashboards, simplified schedule grid, touch-friendly controls |
| Desktop (1024-1439px) | Full application, sidebar navigation, split-view layouts |
| Large Desktop (1440px+) | Extended grid views, multi-panel layouts, control room mode |

### 13.2 Rules
- **Touch targets 44px minimum** on all breakpoints
- **No horizontal scroll** except within the schedule grid component
- **Sidebar collapses to bottom nav** on mobile
- **Charts simplify** on mobile (fewer ticks, larger touch targets)
- **Table cells enlarge** on touch devices

---

## 14. Chart & Data Visualization

### 14.1 Chart Library
Use **Recharts** for standard charts (line, bar, area) and **custom SVG** for the coverage heatmap.

### 14.2 Chart Color Palette
```typescript
const chartColors = [
  '#6366F1', // indigo (primary series)
  '#F97316', // orange (secondary series)
  '#10B981', // emerald (positive)
  '#3B82F6', // blue (neutral series)
  '#8B5CF6', // violet (tertiary)
  '#EC4899', // pink (quaternary)
]
```

### 14.3 Rules
- **Always include legends** positioned near the chart
- **Tooltips on hover/tap** showing exact values
- **Grid lines are subtle** (`--border` color at 50% opacity)
- **Animate on entrance** — bars grow, lines draw, areas fill (800ms ease-out)
- **Respect reduced-motion** — show data immediately without animation
- **Use patterns (dashed/dotted) alongside color** for accessibility
- **Empty state** shows helpful message with illustration, never a blank chart

---

## 15. Pre-Delivery Checklist

Before any page or component ships:

### Visual Quality
- [ ] No emojis used as icons (Lucide SVGs only)
- [ ] All corners use the defined radius scale (min 8px)
- [ ] Shadows use brand-tinted color (indigo rgba), not pure black
- [ ] Font usage matches specification (Nunito/DM Sans/JetBrains Mono)
- [ ] Semantic color tokens used everywhere (no raw hex in components)

### Interaction
- [ ] All buttons have press animation (scale 0.95 spring)
- [ ] All cards have hover lift animation
- [ ] Touch targets ≥ 44x44px
- [ ] Loading states use skeleton screens (not spinners, except inline)
- [ ] Success/error states have clear animation feedback
- [ ] `prefers-reduced-motion` disables all springs and transitions

### Data Display
- [ ] Numbers use JetBrains Mono with tabular figures
- [ ] KPI values animate when changing (counter roll)
- [ ] Status indicators use icon + color + text (never color alone)
- [ ] Tables have sticky headers and first column

### Responsive
- [ ] Tested at 375px, 768px, 1024px, 1440px
- [ ] No horizontal scroll on page level
- [ ] Touch-friendly on tablet
- [ ] Charts readable on mobile

### Dark Mode
- [ ] Both modes tested and functional
- [ ] Contrast ratios verified in both modes
- [ ] Shadows convert to subtle glows in dark mode
- [ ] No pure black or pure white used

### Accessibility
- [ ] Keyboard navigation works for all interactive elements
- [ ] Focus rings visible (2-4px)
- [ ] All images/icons have alt text or aria-label
- [ ] Heading hierarchy is sequential (h1→h2→h3)
- [ ] Form fields have visible labels (not placeholder-only)
