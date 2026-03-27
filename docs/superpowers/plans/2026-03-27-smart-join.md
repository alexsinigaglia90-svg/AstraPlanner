# Smart Join Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable domain-based organization matching so users with the same business email domain can join an existing org with real-time admin approval.

**Architecture:** New `join_request` table tracks pending/approved/rejected requests. Welcome page checks domain match before showing choices. Admin approves via a new Team page in Settings. Supabase Realtime pushes status updates to the waiting user.

**Tech Stack:** Next.js 16, tRPC, Supabase (Realtime subscriptions), Framer Motion, `free-email-domains` npm package

**Spec:** `docs/superpowers/specs/2026-03-27-smart-join-design.md`

---

## Task 1: Install free-email-domains + create migration

**Files:**
- Modify: `package.json`
- Create: `supabase/migrations/00007_join_request.sql`

- [ ] **Step 1: Install dependency**

```bash
npm install free-email-domains
```

- [ ] **Step 2: Create migration file**

Create `supabase/migrations/00007_join_request.sql`:

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

-- Enable realtime for live status updates
ALTER PUBLICATION supabase_realtime ADD TABLE join_request;
```

- [ ] **Step 3: Run migration in Supabase**

Apply this migration via Supabase dashboard → SQL Editor, or `supabase db push`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json supabase/migrations/00007_join_request.sql
git commit -m "chore: add free-email-domains + join_request migration"
```

---

## Task 2: Store domain on org creation + backend endpoints

**Files:**
- Modify: `src/server/routers/onboarding.ts` (update createOrganization, add 3 new endpoints)
- Modify: `src/server/routers/admin.ts` (add 2 new endpoints)

- [ ] **Step 1: Update createOrganization to store domain**

In `src/server/routers/onboarding.ts`, find the `settings_json` insert (currently `{ sector: input.sector }`) and add the domain:

```typescript
const domain = ctx.user.email?.split('@')[1] ?? ''

// In the .insert():
settings_json: { sector: input.sector, domain },
```

- [ ] **Step 2: Add checkDomainMatch endpoint**

Add to `src/server/routers/onboarding.ts`:

```typescript
checkDomainMatch: authenticatedProcedure
  .query(async ({ ctx }) => {
    if (ctx.organizationId) return { match: false }

    const email = ctx.user.email
    if (!email) return { match: false }

    const domain = email.split('@')[1]
    if (!domain) return { match: false }

    // Check public domain
    const freeEmailDomains = (await import('free-email-domains')).default
    if (freeEmailDomains.includes(domain)) return { match: false }

    const admin = createAdminClient()
    const { data: org } = await admin
      .from('organization')
      .select('id, name, slug')
      .eq('settings_json->>domain', domain)
      .limit(1)
      .single()

    if (!org) return { match: false }

    // Get member count
    const { count: siteCount } = await admin
      .from('site')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)

    return {
      match: true,
      organization: {
        id: org.id,
        name: org.name,
        memberCount: 0, // TODO: count users with this org in metadata is expensive; skip for now
        siteCount: siteCount ?? 0,
      },
    }
  }),
```

- [ ] **Step 3: Add requestJoin endpoint**

```typescript
requestJoin: authenticatedProcedure
  .input(z.object({ organization_id: z.string() }))
  .mutation(async ({ ctx, input }) => {
    if (ctx.organizationId) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Already in an organization' })
    }

    const admin = createAdminClient()

    // Check no existing pending request
    const { data: existing } = await admin
      .from('join_request')
      .select('id')
      .eq('user_id', ctx.user.id)
      .eq('organization_id', input.organization_id)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      throw new TRPCError({ code: 'CONFLICT', message: 'Join request already pending' })
    }

    const { data: request, error } = await admin
      .from('join_request')
      .insert({
        organization_id: input.organization_id,
        user_id: ctx.user.id,
        email: ctx.user.email ?? '',
        full_name: ctx.user.user_metadata?.full_name ?? ctx.user.email ?? 'Unknown',
      })
      .select('id')
      .single()

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }

    // Create notification for org admins
    // Get org name for notification text
    const { data: org } = await admin
      .from('organization')
      .select('name')
      .eq('id', input.organization_id)
      .single()

    const userName = ctx.user.user_metadata?.full_name ?? ctx.user.email ?? 'Iemand'
    const orgName = org?.name ?? 'je organisatie'

    await admin.from('notification').insert({
      organization_id: input.organization_id,
      type: 'join_request',
      title: `${userName} wil lid worden van ${orgName}`,
      body: `${ctx.user.email} heeft een verzoek ingediend om lid te worden.`,
      link: '/dashboard/settings/team',
      is_read: false,
    })

    return { requestId: request!.id }
  }),
```

- [ ] **Step 4: Add getJoinStatus endpoint**

```typescript
getJoinStatus: authenticatedProcedure
  .query(async ({ ctx }) => {
    const admin = createAdminClient()
    const { data } = await admin
      .from('join_request')
      .select('id, status, organization_id')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!data) return { status: null }

    let organizationName: string | undefined
    if (data.organization_id) {
      const { data: org } = await admin
        .from('organization')
        .select('name')
        .eq('id', data.organization_id)
        .single()
      organizationName = org?.name ?? undefined
    }

    return {
      status: data.status as 'pending' | 'approved' | 'rejected',
      organizationName,
    }
  }),
```

- [ ] **Step 5: Add admin endpoints**

Add to `src/server/routers/admin.ts`:

```typescript
listJoinRequests: adminProcedure
  .query(async ({ ctx }) => {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('join_request')
      .select('id, user_id, email, full_name, status, created_at')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })

    if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    return { requests: data ?? [] }
  }),

resolveJoinRequest: adminProcedure
  .input(z.object({
    request_id: z.string(),
    action: z.enum(['approve', 'reject']),
    role: z.enum(['site_manager', 'planner', 'supervisor', 'employee', 'viewer']).optional(),
  }))
  .mutation(async ({ ctx, input }) => {
    const admin = createAdminClient()

    // Get the request
    const { data: request } = await admin
      .from('join_request')
      .select('id, user_id, organization_id, email')
      .eq('id', input.request_id)
      .eq('organization_id', ctx.organizationId)
      .single()

    if (!request) throw new TRPCError({ code: 'NOT_FOUND', message: 'Request not found' })

    if (input.action === 'approve') {
      const role = input.role ?? 'viewer'

      // Update user metadata
      const { error: metaError } = await admin.auth.admin.updateUserById(request.user_id, {
        app_metadata: {
          organization_id: request.organization_id,
          role,
          site_ids: [],
          mode: null,
        },
      })

      if (metaError) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: metaError.message })

      // Update join request
      await admin
        .from('join_request')
        .update({
          status: 'approved',
          assigned_role: role,
          decided_by: ctx.user.id,
          decided_at: new Date().toISOString(),
        })
        .eq('id', input.request_id)
    } else {
      await admin
        .from('join_request')
        .update({
          status: 'rejected',
          decided_by: ctx.user.id,
          decided_at: new Date().toISOString(),
        })
        .eq('id', input.request_id)
    }

    return { success: true }
  }),
```

- [ ] **Step 6: Build and commit**

```bash
npm run build
git add src/server/routers/onboarding.ts src/server/routers/admin.ts
git commit -m "feat: Smart Join backend — domain match, join request, admin resolve"
```

---

## Task 3: Update welcome page with Smart Join card

**Files:**
- Modify: `src/app/(auth)/welcome/page.tsx`

- [ ] **Step 1: Add domain match query and Smart Join card**

At the top of the WelcomePage component, add:
```typescript
const domainMatch = trpc.onboarding.checkDomainMatch.useQuery()
```

Before the existing 3 choices, conditionally render a Smart Join card when `domainMatch.data?.match`:

The card should show:
- Org name from `domainMatch.data.organization.name`
- Site count from `domainMatch.data.organization.siteCount`
- "Word lid van [org]" button → calls `requestJoin.mutate({ organization_id })` → navigates to `/welcome/join-pending`
- "Eigen organisatie maken" link below → shows the normal 3 choices

Style: prominent card with indigo gradient border, glass background, org avatar (first letter), stats badges.

- [ ] **Step 2: Build and commit**

```bash
npm run build
git add src/app/\(auth\)/welcome/page.tsx
git commit -m "feat: Smart Join card on welcome page with domain matching"
```

---

## Task 4: Join pending waiting screen

**Files:**
- Create: `src/app/(auth)/welcome/join-pending/page.tsx`
- Modify: `src/proxy.ts` (add route)

- [ ] **Step 1: Create waiting page**

Create `src/app/(auth)/welcome/join-pending/page.tsx`:

Features:
- Glass card in auth layout
- Animated pulsing indigo ring (CSS animation)
- Text: "We hebben [org admin] gevraagd om je toe te laten"
- Supabase Realtime subscription on `join_request` filtered by user_id
- On `status = 'approved'` → `supabase.auth.refreshSession()` → `router.push('/dashboard')`
- On `status = 'rejected'` → show rejection message + "Eigen organisatie maken" button
- Fallback: poll `getJoinStatus` every 10 seconds
- Back link to `/welcome`

- [ ] **Step 2: Update proxy.ts**

Add `/welcome/join-pending` to the welcome routes (already handled by the `/welcome` prefix check).

Verify the existing middleware already covers this — it checks `pathname.startsWith('/welcome')`.

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add src/app/\(auth\)/welcome/join-pending/page.tsx
git commit -m "feat: join pending waiting screen with realtime status updates"
```

---

## Task 5: Team page in Settings

**Files:**
- Create: `src/app/dashboard/settings/team/page.tsx`
- Modify: `src/app/dashboard/settings/layout.tsx` (add Team tab)

- [ ] **Step 1: Add Team tab to settings layout**

In `src/app/dashboard/settings/layout.tsx`, add to the `tabs` array:

```typescript
{ label: 'Team', href: '/dashboard/settings/team' },
```

Add it after 'Audit Log'.

- [ ] **Step 2: Create team page**

Create `src/app/dashboard/settings/team/page.tsx`:

Two sections:

**Openstaande verzoeken:**
- Query: `trpc.admin.listJoinRequests.useQuery()`
- Filter to show only `status === 'pending'`
- Each request card: avatar circle (initials from full_name), name, email, relative time
- Role dropdown: `<select>` with options: site_manager, planner, supervisor, employee, viewer
- "Goedkeuren" button (green gradient) → calls `resolveJoinRequest({ request_id, action: 'approve', role })`
- "Weigeren" button (red, subtle) → calls `resolveJoinRequest({ request_id, action: 'reject' })`
- Empty state: "Geen openstaande verzoeken"

**Teamleden:**
- For now: list of approved join requests + a note that full user management is coming
- Query approved requests from `listJoinRequests` filtered by status

Style: match existing settings page patterns (glass cards, font-body, motion animations).

- [ ] **Step 3: Build and commit**

```bash
npm run build
git add src/app/dashboard/settings/team/page.tsx src/app/dashboard/settings/layout.tsx
git commit -m "feat: Team settings page — join request management + member list"
```

---

## Task 6: End-to-end test + push

- [ ] **Step 1: Build verification**

```bash
npm run build
```

- [ ] **Step 2: Manual test flow**

1. User A creates org with `@test.nl` → domain stored in settings_json
2. User B registers with `@test.nl` → welcome page shows Smart Join card
3. User B clicks "Word lid" → redirected to waiting screen
4. User A sees notification → goes to Settings → Team
5. User A selects role + approves → User B auto-redirected to dashboard
6. Test rejection flow: repeat with User C, reject → rejection UI shown

- [ ] **Step 3: Push to Vercel**

```bash
git push origin main
```
