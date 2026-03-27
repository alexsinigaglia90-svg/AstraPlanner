# Smart Join — Domain-Based Organization Matching

**Date:** 2026-03-27
**Status:** Approved

## Overview

When a new user registers with a business email (e.g., `@ascentra.nl`), the system detects if an organization with that domain already exists. If so, the user sees a "Smart Join" card and can request to join. The org admin receives a real-time notification, approves/rejects with a role assignment, and the user is redirected live to the dashboard.

Public/free email domains (gmail, outlook, etc. — ~4000 domains via `free-email-domains` npm package) are excluded from matching.

## User Flow

```
New user registers with @ascentra.nl
    ↓
Welcome screen (/welcome)
    ↓
System checks: org exists with domain "ascentra.nl"?
    ├── NO (or public domain) → normal flow (demo/self/onboarding)
    └── YES → Smart Join card:
              "Het lijkt erop dat Ascentra al op AstraPlanner zit!"
              [Ascentra — 3 medewerkers, 1 site]
              [Word lid van Ascentra]  [Eigen organisatie maken]
                    ↓
              Join request created (status: pending)
                    ↓
              Waiting screen (/welcome/join-pending)
              "We hebben Alex gevraagd om je toe te laten"
              Live pulse indicator
                    ↓ (realtime via Supabase subscription)
              Admin receives:
                • Notification in header bell
                • Click → Team page (Settings → Team)
                • Request card: name + email + role dropdown + Approve/Reject
                    ↓
              On approval:
                • User's app_metadata set (org_id, role, site_ids)
                • Waiting screen auto-redirects to /dashboard (live)
              On rejection:
                • User sees: "Je verzoek is afgewezen"
                • "Eigen organisatie maken" button
```

## Database

### New table: `join_request`

```sql
CREATE TABLE join_request (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organization(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL,
  email           VARCHAR(255) NOT NULL,
  full_name       VARCHAR(255) NOT NULL,
  status          VARCHAR(20) NOT NULL DEFAULT 'pending',
  assigned_role   VARCHAR(50),
  decided_by      UUID,
  decided_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_join_request_user UNIQUE (user_id, organization_id)
);

ALTER TABLE join_request ENABLE ROW LEVEL SECURITY;
```

### Domain storage

On org creation (`onboarding.createOrganization`), extract email domain from user's email and store in `settings_json.domain`. Example: user `alex@ascentra.nl` creates org → `settings_json.domain = 'ascentra.nl'`.

**Important:** The existing `createOrganization` endpoint in `src/server/routers/onboarding.ts` must be updated to include the domain in `settings_json` alongside the sector. This is not a new endpoint — just add `domain: email.split('@')[1]` to the existing settings_json insert.

### Domain lookup

```sql
SELECT id, name, slug, settings_json
FROM organization
WHERE settings_json->>'domain' = 'ascentra.nl'
LIMIT 1
```

## Public Domain Filtering

Use `free-email-domains` npm package (~4000 domains). Check before domain lookup:

```typescript
import freeEmailDomains from 'free-email-domains'
const domain = email.split('@')[1]
const isPublic = freeEmailDomains.includes(domain)
// If public → skip domain matching, show normal welcome flow
```

## Realtime

Supabase Realtime subscription on `join_request` table filtered by `user_id`:

```typescript
supabase
  .channel('join-status')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'join_request',
    filter: `user_id=eq.${userId}`,
  }, (payload) => {
    if (payload.new.status === 'approved') → refreshSession() → redirect /dashboard
    if (payload.new.status === 'rejected') → show rejection UI
  })
  .subscribe()
```

Fallback: poll `onboarding.getJoinStatus` every 10 seconds.

## New tRPC Endpoints

### `onboarding.checkDomainMatch`
- **Procedure:** authenticatedProcedure (no org required)
- **Input:** none (reads email from ctx.user)
- **Logic:** extract domain, check free-email-domains list, query organization by domain
- **Returns:** `{ match: boolean, organization?: { id, name, memberCount, siteCount } }`
- memberCount: count of users with this org_id in auth.users app_metadata
- siteCount: count of sites for this org

### `onboarding.requestJoin`
- **Procedure:** authenticatedProcedure
- **Input:** `{ organization_id: string }`
- **Guards:** user has no org, no existing pending request
- **Logic:** insert join_request, create notification for all org admins
- **Returns:** `{ requestId: string }`

### `onboarding.getJoinStatus`
- **Procedure:** authenticatedProcedure
- **Input:** none
- **Logic:** query latest join_request for this user
- **Returns:** `{ status: 'pending' | 'approved' | 'rejected' | null, organizationName?: string }`

### `admin.listJoinRequests`
- **Procedure:** adminProcedure
- **Returns:** `{ requests: Array<{ id, email, full_name, created_at, status }> }`

### `admin.resolveJoinRequest`
- **Procedure:** adminProcedure
- **Input:** `{ request_id: string, action: 'approve' | 'reject', role?: AppRole }`
- **Logic (approve):**
  1. Update join_request: status='approved', assigned_role, decided_by, decided_at
  2. Update user's app_metadata via admin client: organization_id, role, site_ids: []
  3. Create notification for the requesting user
- **Logic (reject):**
  1. Update join_request: status='rejected', decided_by, decided_at
  2. Create notification for the requesting user

## Pages

### Welcome page update (`/welcome`)
- On mount: call `onboarding.checkDomainMatch`
- If match found: show Smart Join card above the 3 existing choices
- Card shows: org name, member count, site count
- "Word lid" button calls `onboarding.requestJoin` → redirects to `/welcome/join-pending`
- "Eigen organisatie maken" link → normal flow (`/welcome/create-org`)

### Join pending page (`/welcome/join-pending`)
- Auth layout (same as other welcome pages)
- Animated pulse indicator (indigo glow ring)
- Text: "We hebben [admin] gevraagd om je toe te laten. Dit duurt meestal minder dan een minuut."
- Supabase Realtime subscription on join_request
- Approved → `refreshSession()` → redirect `/dashboard`
- Rejected → show rejection card with "Eigen organisatie maken" button
- Fallback: poll every 10s
- Back link to `/welcome`

### Team page (`/dashboard/settings/team`)
- New tab in Settings navigation (after Audit Log)
- Only visible for `tenant_admin` role
- Two sections:

**Openstaande verzoeken:**
- Cards with: avatar circle (initials), full_name, email, relative time
- Role dropdown (site_manager, planner, supervisor, employee, viewer)
- Goedkeuren button (green) + Weigeren button (red, hold-to-confirm)
- Empty state: "Geen openstaande verzoeken"

**Teamleden:**
- Table/list: name, email, role badge, joined date
- Source: query auth.users where app_metadata.organization_id matches

### Notification integration
- On new join request → insert notification for all admins
- Notification text: "[name] wil lid worden van [org]"
- Click → navigate to `/dashboard/settings/team`
- Existing notification bell in header shows badge count

## Middleware update (`proxy.ts`)
- `/welcome/join-pending` → allow through for authenticated users without org
- Same pattern as existing `/welcome` routes

## Dependencies
- `free-email-domains` npm package

## Files to create/modify

| File | Action |
|---|---|
| `src/server/routers/onboarding.ts` | Add checkDomainMatch, requestJoin, getJoinStatus |
| `src/server/routers/admin.ts` | Add listJoinRequests, resolveJoinRequest |
| `src/app/(auth)/welcome/page.tsx` | Add Smart Join card |
| `src/app/(auth)/welcome/join-pending/page.tsx` | New: waiting screen |
| `src/app/dashboard/settings/team/page.tsx` | New: team management |
| `src/app/dashboard/settings/page.tsx` | Add Team tab to nav |
| `src/components/layout/sidebar.tsx` | No change needed (Settings already exists) |
| `src/proxy.ts` | Add /welcome/join-pending route |
| `src/server/routers/onboarding.ts` | Store domain on org creation |
| `supabase/migrations/` | New migration for join_request table |
