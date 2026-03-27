# Onboarding System Design

**Date:** 2026-03-27
**Status:** Approved

## Overview

Self-service signup flow with three onboarding paths: demo mode (rondkijken), self-guided setup, and AI-assisted onboarding with live Claude integration. Includes AstraDesk contact option for human-assisted onboarding.

## User Flow

```
Signup (/signup)
    ↓
Account created (no organization)
    ↓
Welcome Screen (/welcome)
    ├── "Rondkijken" → Demo Mode
    │     • Hardcoded seed data, read-only
    │     • Guided tour overlays per page (max 3 steps each)
    │     • Floating "Start voor echt" button to exit demo
    │
    ├── "Zelf aan de slag" → Create Org → Dashboard
    │     • Setup checklist (floating pill, collapsible)
    │     • Contextual tooltips (1 per page, auto-dismiss 8s)
    │     • Both permanently dismissible
    │
    └── "Onboarding programma"
            ├── "Contact AstraDesk" → Contact form (email)
            └── "AI Assisted" → Create Org → Dashboard + AI Panel
                  • Persistent side panel (380px, glassmorphism)
                  • Claude chat with typewriter effect
                  • Claude can execute tRPC actions (create sites, shifts, etc.)
                  • Flash-highlight on UI elements when Claude creates/modifies
                  • Post-onboarding: floating AI button for continued access
```

## Design Decisions

### Demo Mode

- **Data source:** Hardcoded seed data in `demo-seed.ts` — no database calls
- **Interception:** `DemoProvider` wraps the dashboard layout. It provides a React context with `isDemo: true`. Individual page components check this flag and render seed data instead of making tRPC queries. This avoids replacing the tRPC layer itself — each page simply has `if (isDemo) return <DemoView />` at the top.
- **Mutations blocked:** Toaster message "Dit is een demo — start je eigen omgeving om wijzigingen te maken"
- **Tour overlays:** Spotlight overlay highlighting 2-3 key elements per page, with title + 1-sentence explanation. "Volgende" / "Sluiten" buttons. Once closed, never returns (localStorage flag).
- **Exit demo:** Floating button at bottom → org creation flow → removes `mode: demo` from metadata

**Seed data includes:**
- 1 organization ("AstraDemo BV")
- 2 sites with operating hours
- 3 shifts per site
- 8-10 employees with skills and roles
- 2 processes with demand data
- Equipment entries

### Self-Guided Setup

- **Org creation:** Simple form — organization name + business sector
- **Setup checklist:** Floating pill bottom-right showing "Setup 2/6". Expands to compact list:
  1. Create a site
  2. Configure shifts
  3. Add roles
  4. Add employees
  5. Define processes
  6. Plan your first week
- Steps auto-detected (e.g., ≥1 site exists → step 1 complete)
- Dismissible via "Ik weet het al" — disappears permanently
- State stored in `user_metadata` (cross-device)

- **Contextual tooltips:** One small tooltip per page at primary action button on first visit. Max 1 sentence, auto-dismiss after 8 seconds or on click. No overlay, no dimming. Flag stored in `user_metadata`.

### AI-Assisted Onboarding

- **Side panel:** Persistent right panel (~380px), glassmorphism design, smooth slide-in animation
- **Avatar:** AstraAI with pulsing indigo/purple glow ring
- **Chat UX:**
  - Typewriter effect on Claude's messages (letter by letter)
  - Typing indicator with subtle shimmer
  - Suggested action buttons below Claude's messages
- **Capabilities:**
  - Context-aware: knows current page, org data, setup progress
  - Can execute tRPC actions: createSite, createShift, createRole, addEmployee, createProcess
  - Flash-highlight on UI elements when actions are executed
  - Can answer questions about AstraPlanner concepts
- **Flow:**
  1. User chooses "AI Assisted" → org created → dashboard opens with panel
  2. Claude greets and starts guided setup conversation
  3. Step-by-step through setup in conversational style
  4. User can ask questions at any time — Claude switches to explanation mode then resumes
  5. End: "Setup complete! Close this panel. I'm always available via the AI icon."
- **Post-onboarding:** Floating AI button (pulsing indigo circle) bottom-right. Opens panel on click.

### AstraDesk Contact

- Simple contact form: name, email (pre-filled), company name, message
- Submits via API route (sends email to team)
- Confirmation screen: "We nemen binnen 24 uur contact op"
- Later replaced by AstraDesk ticket system

## Technical Architecture

### State Management

All onboarding state lives in Supabase `app_metadata` / `user_metadata`:

```
app_metadata: {
  organization_id: string | null,
  role: "tenant_admin" | ...,
  mode: "demo" | null,
  onboarding_mode: "self_guided" | "ai_assisted" | null,
}

user_metadata: {
  onboarding_step: number,
  setup_checklist_dismissed: boolean,
  dismissed_tooltips: string[],   // page paths
  setup_complete: boolean,
}
```

### New tRPC Endpoints

- `org.createOrganization` — public procedure (only for users without org). Creates org record + updates `app_metadata` with `organization_id` and `role: tenant_admin`.
- `contact.submit` — public procedure. Sends AstraDesk contact form email.

### Claude API Integration

- Streaming endpoint: `src/app/api/ai/chat/route.ts`
- Uses Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)
- System prompt includes: current page, org data, setup progress, available actions
- Tool use: Claude gets tools that wrap tRPC endpoints
- New env var: `ANTHROPIC_API_KEY`

### New Files

| File | Purpose |
|---|---|
| `src/app/(auth)/welcome/page.tsx` | Choice screen (3 options) |
| `src/app/(auth)/welcome/create-org/page.tsx` | Org creation form |
| `src/app/(auth)/welcome/contact/page.tsx` | AstraDesk contact page |
| `src/app/api/ai/chat/route.ts` | Claude API streaming endpoint |
| `src/components/onboarding/demo-provider.tsx` | Context provider for demo data |
| `src/components/onboarding/demo-seed.ts` | Hardcoded seed data |
| `src/components/onboarding/demo-banner.tsx` | "Start voor echt" floating button |
| `src/components/onboarding/setup-checklist.tsx` | Floating pill + checklist |
| `src/components/onboarding/contextual-tooltip.tsx` | Non-invasive tooltip component |
| `src/components/onboarding/tour-overlay.tsx` | Spotlight tour for demo mode |
| `src/components/ai/ai-panel.tsx` | Side panel with chat interface |
| `src/components/ai/ai-button.tsx` | Floating AI button (post-onboarding) |
| `src/components/ai/ai-tools.ts` | Claude tool definitions (tRPC wrappers) |
| `src/hooks/use-onboarding.ts` | Hook for onboarding state/step detection |

### Middleware Update (proxy.ts)

- Users without org + without `mode: demo` → redirect to `/welcome`
- Users with `mode: demo` → dashboard with demo provider
- `/welcome` routes pass through for users without org

### New Dependencies

- `ai` (Vercel AI SDK)
- `@ai-sdk/anthropic` (Anthropic provider for Vercel AI SDK)
