# Employee Expanding Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the SlideOver quick-edit with an in-place expanding card that grows from the employee card, with tabbed Profile/Skills/Status interface.

**Architecture:** Single new component `ExpandingCard` with 3 inline sub-components (tabs). Replaces the SlideOver + EditEmployeeForm in employees/page.tsx. Upgraded radial skill grader for AAA-grade skill editing. All data from existing tRPC endpoints.

**Tech Stack:** React, Framer Motion (spring physics), tRPC, inline styles, glassmorphism design system.

**Spec:** `docs/superpowers/specs/2026-03-29-employee-expanding-card-design.md`

---

## File Structure

### New Files
```
src/components/domain/expanding-card.tsx       — Main expanding card with 3 tabs
src/components/domain/radial-skill-grader.tsx   — AAA-grade radial skill grader popover
```

### Modified Files
```
src/app/dashboard/employees/page.tsx           — Replace SlideOver with ExpandingCard
```

---

## Task 1: Radial Skill Grader Component

**Files:**
- Create: `src/components/domain/radial-skill-grader.tsx`

- [ ] **Step 1: Create AAA-grade radial skill grader**

Create `src/components/domain/radial-skill-grader.tsx`. This is a popover component that shows a large (120px) radial ring for selecting proficiency 1-5.

Props:
```typescript
interface RadialSkillGraderProps {
  processName: string
  level: number                    // current 1-5
  onChange: (level: number) => void
  onClose: () => void
}
```

Features:
- 120px diameter SVG ring with 5 segments (one per level)
- Each segment is a 72-degree arc
- Filled segments use gradient (indigo → purple): `linear-gradient` via SVG `<defs>`
- Current level highlighted, unfilled segments are light gray
- Click/tap on a segment to select level
- Center shows level number (large, animated counter)
- Level labels around the ring: "Beginner", "Basis", "Competent", "Gevorderd", "Expert"
- **Particle burst on level-up:** When level increases, 8-12 small circles burst outward from the ring with random angles, scale down and fade out over 400ms. Use Framer Motion `animate` with random x/y offsets.
- Glassmorphism popover background: `rgba(255,255,255,0.92)`, `backdrop-filter: blur(16px)`, rounded-2xl, elevated shadow
- Close on click outside or Escape key
- Spring animation on segment hover (scale pulse)

All inline styles, 'use client', Framer Motion.

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success (component not yet used, but must compile)

- [ ] **Step 3: Commit**

```bash
git add src/components/domain/radial-skill-grader.tsx
git commit -m "feat: AAA-grade radial skill grader with particle effects"
```

---

## Task 2: Expanding Card Component — Shell + Header + Tabs

**Files:**
- Create: `src/components/domain/expanding-card.tsx`

- [ ] **Step 1: Create the expanding card shell**

Create `src/components/domain/expanding-card.tsx` with the outer container, header, and tab navigation. Leave tab content as placeholders that will be filled in Tasks 3-5.

Props:
```typescript
interface ExpandingCardProps {
  employee: {
    id: string
    first_name: string
    last_name: string
    employee_number: string
    contract_type: string
    weekly_hours_contracted: number
    home_site_id: string
    department_id: string | null
    crew_id: string | null
    job_role_id: string | null
    status: string
    is_multi_site_eligible: boolean
  }
  /** Lookup maps from the employees page */
  deptMap: Map<string, string>
  roleMap: Map<string, string>
  crewMap?: Map<string, string>
  /** Available options for edit mode */
  departments: Array<{ id: string; name: string }>
  roles: Array<{ id: string; name: string }>
  crews: Array<{ id: string; name: string }>
  processes: Array<{ id: string; name: string }>
  siteId: string
  onClose: () => void
  onDeleted?: () => void
}
```

Structure:
- Outer wrapper: `motion.div` with `layoutId={employee.id}` for shared layout animation
- Glassmorphism card: `rgba(255,255,255,0.92)`, `backdrop-filter: blur(16px)`, border with indigo glow, elevated shadow
- **Header:** large avatar (48px, gradient), name (18px bold), subtitle (dept + crew + contract), status dot, X close button, "Bewerken"/"Opslaan" button
- **Tab bar:** 3 tabs: "Profiel", "Skills", "Status" — styled as pills, active tab has indigo background
- **Tab content area:** `AnimatePresence mode="wait"` with `snappy` slide transitions
- Close handlers: X button calls `onClose`, Escape key calls `onClose`, click on backdrop calls `onClose`

Import spring transitions from `@/lib/motion`: `bouncy`, `gentle`, `snappy`, `wobbly`.

Do NOT implement tab content yet — just render the tab name as placeholder text.

- [ ] **Step 2: Verify build**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/domain/expanding-card.tsx
git commit -m "feat: expanding card shell with header and tab navigation"
```

---

## Task 3: Profile Tab

**Files:**
- Modify: `src/components/domain/expanding-card.tsx`

- [ ] **Step 1: Implement ProfileTab sub-component**

Add `ProfileTab` as a function inside `expanding-card.tsx` (not exported, just used internally).

Props: receives all the same props as ExpandingCard plus `editing: boolean`.

**Read mode:**
- 2-column grid of glassmorphism value chips
- Each chip: label (tiny uppercase) + value (bold)
- Fields: Afdeling (from deptMap), Crew (from crewMap or crew_id), Role (from roleMap), Contract (formatted label), Uren/week, Uurloon (show "via role" hint)

**Edit mode (when `editing=true`):**
- Same layout but chips become editable:
- Afdeling → GlassSelect with `departments` options
- Crew → GlassSelect with `crews` options
- Role → GlassSelect with `roles` options
- Contract → GlassSelect with contract type options (full_time, part_time, temporary, seasonal, contractor)
- Uren → number input with glassmorphism style
- Maintain local form state with `useState`

**Save handler:**
- Calls `trpc.workforce.upsertEmployee.useMutation()`
- On success: animated SVG checkmark, green border flash, toast "Opgeslagen"
- Invalidates `workforce.listEmployees`

Import `GlassSelect` from `@/components/domain/glass-select`.

- [ ] **Step 2: Wire tab content in ExpandingCard**

Replace the "Profiel" placeholder with `<ProfileTab ... />`. Pass `editing` state from the header's "Bewerken"/"Opslaan" toggle.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/expanding-card.tsx
git commit -m "feat: expanding card profile tab with read/edit modes"
```

---

## Task 4: Skills Tab

**Files:**
- Modify: `src/components/domain/expanding-card.tsx`

- [ ] **Step 1: Implement SkillsTab sub-component**

Add `SkillsTab` function inside `expanding-card.tsx`.

Data fetching:
- Use `trpc.workforce.getEmployee.useQuery({ id: employee.id })` to get skills array
- The skills come back as `{ id, process_id, proficiency_level, ... }`
- Resolve process names using the `processes` prop (Map lookup)

Skill badges:
- Glassmorphism chips with process name + star rating (★★★★☆)
- Star rating: filled stars = proficiency level, empty stars = remaining to 5
- Indigo color for filled, light gray for empty
- Stagger entrance animation with `containerStagger` + `fadeInUp`

**Tap on badge** → show `RadialSkillGrader` as positioned popover:
- Position relative to the tapped badge (absolute positioning)
- Pass current level, `onChange` calls `trpc.workforce.updateSkill.useMutation()`
- On success: invalidate `workforce.getEmployee`, toast, particle burst in grader
- Close on click outside

**"+ Skill toevoegen"** button:
- Shows a GlassSelect dropdown with processes not yet assigned
- Filter: all processes minus processes the employee already has skills for
- On select: call `trpc.workforce.updateSkill.useMutation()` with `proficiency_level: 1`
- New badge enters with `wobbly` spring animation

**Hold-to-delete** on skill badge:
- 1.2s hold → badge shrinks with scale(0) and opacity 0, then removed
- Calls a delete mutation (or updateSkill is sufficient if there's a delete endpoint)
- Check if `workforce.deleteSkill` exists; if not, just hide for now

- [ ] **Step 2: Wire tab content**

Replace "Skills" placeholder with `<SkillsTab ... />`.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/expanding-card.tsx
git commit -m "feat: expanding card skills tab with radial grader and add/delete"
```

---

## Task 5: Status Tab

**Files:**
- Modify: `src/components/domain/expanding-card.tsx`

- [ ] **Step 1: Implement StatusTab sub-component**

Add `StatusTab` function inside `expanding-card.tsx`.

**Availability status:**
- Determine status from current absence overrides
- Query: `trpc.absence.listActive.useQuery({ site_id: siteId, type: undefined }, { retry: false })`
- Find if this employee has an active override
- Show colored dot + label: green "Beschikbaar", red "Ziek" (if absence), amber "Verlof" (if leave)
- If query fails (role too low): show "Status niet beschikbaar" in muted text

**Week overview:**
- 5 day blocks (Ma-Vr) in a row
- Green = beschikbaar, Red = afwezig (has override for that day), Gray = weekend (Za/Zo, smaller)
- Calculate from the active overrides: check if each day of current week falls within any override's start_date..end_date range
- Animated entrance with stagger

**Navigation links:**
- "Ga naar Verzuim" → `router.push('/dashboard/verzuim')`
- "Ga naar Verlof" → `router.push('/dashboard/verlof')`
- Styled as subtle glassmorphism link-buttons with arrow icon

**Read only** — no edit actions in this tab.

- [ ] **Step 2: Wire tab content**

Replace "Status" placeholder with `<StatusTab ... />`.

- [ ] **Step 3: Verify build**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/domain/expanding-card.tsx
git commit -m "feat: expanding card status tab with availability week view"
```

---

## Task 6: Integration — Replace SlideOver in Employees Page

**Files:**
- Modify: `src/app/dashboard/employees/page.tsx`

- [ ] **Step 1: Import ExpandingCard**

Add import at top of `src/app/dashboard/employees/page.tsx`:
```typescript
import { ExpandingCard } from '@/components/domain/expanding-card'
```

- [ ] **Step 2: Add crew map**

The page has `deptMap` and `roleMap` but no `crewMap`. Add a crews query and map:
```typescript
const crewsQuery = trpc.org.listCrews.useQuery(
  { site_id: activeSiteId! },
  { enabled: !!activeSiteId && !isDemo },
)
const crewMap = useMemo(() => {
  const m = new Map<string, string>()
  for (const c of crewsQuery.data ?? []) m.set(c.id, c.name)
  return m
}, [crewsQuery.data])
```

Check if `listCrews` exists first. If not, use an empty map.

- [ ] **Step 3: Replace SlideOver with ExpandingCard**

Remove the SlideOver block (lines ~1057-1084) and replace with:
```typescript
{quickEditEmployee && (
  <ExpandingCard
    employee={quickEditEmployee}
    deptMap={deptMap}
    roleMap={roleMap}
    crewMap={crewMap}
    departments={deptMapData.map((d) => ({ id: d.id, name: d.name }))}
    roles={roleMapData.map((r) => ({ id: r.id, name: r.name }))}
    crews={(crewsQuery.data ?? []).map((c) => ({ id: c.id, name: c.name }))}
    processes={procMapData.map((p) => ({ id: p.id, name: p.name }))}
    siteId={activeSiteId!}
    onClose={() => { setQuickEditEmployee(null); /* invalidate employees */ }}
    onDeleted={() => { setQuickEditEmployee(null); setAllEmployees([]); setCursor(undefined) }}
  />
)}
```

- [ ] **Step 4: Add card dim effect**

When `quickEditEmployee` is set, add a dim overlay to the card list. Wrap the employee cards grid in a container that reduces opacity when a card is expanded:
```typescript
style={{ opacity: quickEditEmployee ? 0.3 : 1, transition: 'opacity 300ms ease', pointerEvents: quickEditEmployee ? 'none' : 'auto' }}
```

- [ ] **Step 5: Remove old SlideOver import**

Remove `SlideOver` and `EditEmployeeForm` imports if no longer used elsewhere in the file.

- [ ] **Step 6: Verify build**

Run: `npm run build`

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/employees/page.tsx src/components/domain/expanding-card.tsx
git commit -m "feat: replace SlideOver with expanding card in employees page"
```

---

## Task 7: Final Build + Polish Verification

**Files:** none (verification only)

- [ ] **Step 1: Full build**

Run: `npm run build`
Expected: success

- [ ] **Step 2: Run tests**

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 3: Visual verification**

Start dev server, navigate to `/dashboard/employees`:
- Hold-press an employee card → expanding card opens with animation
- Switch between Profiel/Skills/Status tabs
- In Profiel: click "Bewerken", change a field, click "Opslaan"
- In Skills: click a skill badge → radial grader popover
- In Status: see week availability blocks

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: employee expanding card — complete AAA-grade quick edit"
```
