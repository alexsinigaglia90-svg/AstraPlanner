# Onboarding System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-service onboarding system with 3 paths (demo, self-guided, AI-assisted) so new users can sign up, create an organization, and get started without manual admin intervention.

**Architecture:** New `/welcome` route acts as the onboarding hub after signup. Demo mode uses a client-side DemoProvider with hardcoded seed data. Self-guided mode uses a setup checklist stored in user_metadata. AI-assisted mode uses Vercel AI SDK with Claude tool use to execute tRPC actions. All onboarding state lives in Supabase app_metadata/user_metadata.

**Tech Stack:** Next.js 16, tRPC, Supabase Auth, Framer Motion, Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), Zustand

**Spec:** `docs/superpowers/specs/2026-03-27-onboarding-system-design.md`

---

## Phase 1: Welcome Flow + Organization Creation

Foundation that all other phases depend on. After this phase, new users can sign up, create an organization, and access the dashboard.

### Task 1: Create Organization tRPC Endpoint

**Files:**
- Modify: `src/server/routers/org.ts` (add createOrganization before getOrganization)
- Modify: `src/server/trpc.ts` (add authenticatedProcedure — auth required, no org required)
- Modify: `src/server/routers/_app.ts` (add onboarding router)
- Create: `src/server/routers/onboarding.ts`

- [ ] **Step 1: Add authenticatedProcedure to trpc.ts**

This procedure requires a logged-in user but does NOT require an organization. Needed for the org creation flow.

```typescript
// Add after protectedProcedure definition in src/server/trpc.ts

// Authenticated but no org required — for onboarding flows
export const authenticatedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})
```

- [ ] **Step 2: Create onboarding router**

Create `src/server/routers/onboarding.ts`:

```typescript
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, authenticatedProcedure } from '../trpc'
import { createAdminClient } from '../../lib/supabase/admin'

export const onboardingRouter = router({
  createOrganization: authenticatedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        sector: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Guard: user must not already have an organization
      if (ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User already belongs to an organization',
        })
      }

      const admin = createAdminClient()

      // Create the organization record
      const { data: org, error: orgError } = await admin
        .from('organization')
        .insert({ name: input.name, sector: input.sector })
        .select('id')
        .single()

      if (orgError) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to create organization: ${orgError.message}`,
        })
      }

      // Update user's app_metadata with the new org + tenant_admin role
      const { error: metaError } = await admin.auth.admin.updateUserById(
        ctx.user.id,
        {
          app_metadata: {
            organization_id: org.id,
            role: 'tenant_admin',
            site_ids: [],
            onboarding_mode: null,
          },
        }
      )

      if (metaError) {
        // Rollback: delete the org we just created
        await admin.from('organization').delete().eq('id', org.id)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to update user metadata: ${metaError.message}`,
        })
      }

      return { organizationId: org.id }
    }),

  setDemoMode: authenticatedProcedure
    .mutation(async ({ ctx }) => {
      if (ctx.organizationId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'User already belongs to an organization',
        })
      }

      const admin = createAdminClient()
      const { error } = await admin.auth.admin.updateUserById(ctx.user.id, {
        app_metadata: { mode: 'demo' },
      })

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to set demo mode: ${error.message}`,
        })
      }

      return { mode: 'demo' }
    }),

  exitDemoMode: authenticatedProcedure
    .mutation(async ({ ctx }) => {
      const admin = createAdminClient()
      const { error } = await admin.auth.admin.updateUserById(ctx.user.id, {
        app_metadata: { mode: null },
      })

      if (error) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to exit demo mode: ${error.message}`,
        })
      }

      return { mode: null }
    }),
})
```

- [ ] **Step 3: Register onboarding router in _app.ts**

Add to `src/server/routers/_app.ts`:

```typescript
import { onboardingRouter } from './onboarding'

// Add to the router composition:
export const appRouter = router({
  // ... existing routers
  onboarding: onboardingRouter,
})
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/trpc.ts src/server/routers/onboarding.ts src/server/routers/_app.ts
git commit -m "feat: add onboarding router with createOrganization, setDemoMode, exitDemoMode"
```

---

### Task 2: Update Middleware (proxy.ts)

**Files:**
- Modify: `src/proxy.ts`

- [ ] **Step 1: Add welcome/onboarding route handling**

Replace the entire proxy function in `src/proxy.ts` with:

```typescript
import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll() {},
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const pathname = request.nextUrl.pathname

  // Auth callback — always allow through (token exchange)
  if (pathname.startsWith('/auth/callback')) {
    return response
  }

  // Auth pages — redirect to dashboard if already logged in
  if (pathname.startsWith('/login') || pathname.startsWith('/signup')) {
    if (user) {
      const hasOrg = !!user.app_metadata?.organization_id
      const isDemo = user.app_metadata?.mode === 'demo'
      if (hasOrg || isDemo) {
        return NextResponse.redirect(new URL('/dashboard', request.url))
      }
      return NextResponse.redirect(new URL('/welcome', request.url))
    }
    return response
  }

  // Reset password — must be authenticated
  if (pathname.startsWith('/reset-password')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return response
  }

  // Welcome/onboarding pages — must be authenticated, must NOT have org
  if (pathname.startsWith('/welcome')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    const hasOrg = !!user.app_metadata?.organization_id
    const isDemo = user.app_metadata?.mode === 'demo'
    if (hasOrg || isDemo) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
    return response
  }

  // Protected pages — require auth + org or demo mode
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    const hasOrg = !!user.app_metadata?.organization_id
    const isDemo = user.app_metadata?.mode === 'demo'
    if (!hasOrg && !isDemo) {
      return NextResponse.redirect(new URL('/welcome', request.url))
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/proxy.ts
git commit -m "feat: middleware handles welcome redirect for users without org"
```

---

### Task 3: Welcome Page (Choice Screen)

**Files:**
- Create: `src/app/(auth)/welcome/page.tsx`

- [ ] **Step 1: Create the welcome page**

Create `src/app/(auth)/welcome/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { bouncy, snappy, fadeInUp, containerStagger } from '@/lib/motion'
import { createClient } from '@/lib/supabase/client'
import { trpc } from '@/lib/trpc/client'

const PATHS = [
  {
    id: 'demo',
    title: 'Rondkijken',
    description: 'Bekijk een volledig ingerichte demo-omgeving. Geen wijzigingen mogelijk.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
  },
  {
    id: 'self',
    title: 'Zelf aan de slag',
    description: 'Maak je organisatie aan en richt alles zelf in — met handige tips onderweg.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
  },
  {
    id: 'onboarding',
    title: 'Onboarding programma',
    description: 'Laat je begeleiden door ons team of door AI-assistentie.',
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    ),
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
  },
] as const

export default function WelcomePage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)

  const setDemoMode = trpc.onboarding.setDemoMode.useMutation({
    onSuccess: () => {
      router.push('/dashboard')
      router.refresh()
    },
  })

  async function handleChoice(id: string) {
    setLoading(id)

    if (id === 'demo') {
      setDemoMode.mutate()
      return
    }

    if (id === 'self') {
      router.push('/welcome/create-org?mode=self_guided')
      return
    }

    if (id === 'onboarding') {
      router.push('/welcome/onboarding-choice')
      return
    }
  }

  return (
    <motion.div
      className="relative"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        padding: '36px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 30px rgba(0,0,0,0.04)',
        maxWidth: 480,
      }}
    >
      <div className="absolute top-0 left-8 right-8 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 30%, rgba(255,255,255,0.9) 70%, transparent)' }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, ...bouncy }}
        className="text-[26px] font-black mb-1"
        style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
      >
        Welkom bij AstraPlanner
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, ...bouncy }}
        className="text-[14px] mb-8"
        style={{ color: 'rgba(100, 116, 139, 0.7)', fontFamily: 'var(--font-body)' }}
      >
        Hoe wil je starten?
      </motion.p>

      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-3"
      >
        {PATHS.map((path) => (
          <motion.button
            key={path.id}
            variants={fadeInUp}
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            transition={snappy}
            onClick={() => handleChoice(path.id)}
            disabled={loading !== null}
            className="relative w-full text-left overflow-hidden group"
            style={{
              padding: '20px',
              borderRadius: '16px',
              border: '1px solid rgba(99,102,241,0.08)',
              background: 'rgba(255,255,255,0.6)',
              cursor: loading !== null ? 'not-allowed' : 'pointer',
              opacity: loading !== null && loading !== path.id ? 0.5 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            <div className="flex items-start gap-4">
              <div
                className="flex-shrink-0 flex items-center justify-center"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '14px',
                  background: path.gradient,
                  color: 'white',
                  boxShadow: `0 4px 14px ${path.id === 'demo' ? 'rgba(99,102,241,0.3)' : path.id === 'self' ? 'rgba(16,185,129,0.3)' : 'rgba(245,158,11,0.3)'}`,
                }}
              >
                {loading === path.id ? (
                  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                  </svg>
                ) : (
                  path.icon
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[16px] font-bold mb-0.5"
                  style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
                >
                  {path.title}
                </div>
                <div className="text-[13px]"
                  style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}
                >
                  {path.description}
                </div>
              </div>
              <svg
                width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                className="flex-shrink-0 mt-3 transition-transform duration-200 group-hover:translate-x-1"
                style={{ color: 'rgba(100,116,139,0.3)' }}
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </div>
          </motion.button>
        ))}
      </motion.div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds, `/welcome` route appears in route list.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/welcome/page.tsx
git commit -m "feat: welcome page with 3 onboarding path choices"
```

---

### Task 4: Organization Creation Page

**Files:**
- Create: `src/app/(auth)/welcome/create-org/page.tsx`

- [ ] **Step 1: Create the org creation page**

Create `src/app/(auth)/welcome/create-org/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { bouncy, snappy } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'

const SECTORS = [
  'Logistiek & Warehousing',
  'Productie & Manufacturing',
  'Retail & E-commerce',
  'Food & Beverage',
  'Gezondheidszorg',
  'Overheid & Publieke sector',
  'Anders',
] as const

export default function CreateOrgPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const mode = searchParams.get('mode') ?? 'self_guided'

  const [name, setName] = useState('')
  const [sector, setSector] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  const createOrg = trpc.onboarding.createOrganization.useMutation({
    onSuccess: () => {
      if (mode === 'ai_assisted') {
        router.push('/dashboard?ai=open')
      } else {
        router.push('/dashboard')
      }
      router.refresh()
    },
    onError: (err) => {
      setLoading(false)
      setError(err.message)
    },
  })

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !sector) return
    setLoading(true)
    setError(null)
    createOrg.mutate({ name: name.trim(), sector })
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    height: '52px',
    width: '100%',
    borderRadius: '16px',
    border: `2px solid ${focusedField === field ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.08)'}`,
    padding: '0 18px',
    fontSize: '15px',
    fontFamily: 'var(--font-body)',
    color: '#1E1B4B',
    background: focusedField === field ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
    outline: 'none',
    transition: 'all 0.25s ease',
    boxShadow: focusedField === field
      ? '0 0 0 4px rgba(99,102,241,0.08), 0 4px 20px rgba(99,102,241,0.08)'
      : '0 1px 3px rgba(0,0,0,0.02)',
    boxSizing: 'border-box',
  })

  return (
    <motion.div
      className="relative"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        padding: '36px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 30px rgba(0,0,0,0.04)',
      }}
    >
      <div className="absolute top-0 left-8 right-8 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 30%, rgba(255,255,255,0.9) 70%, transparent)' }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, ...bouncy }}
        className="text-[26px] font-black mb-1"
        style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
      >
        Je organisatie
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, ...bouncy }}
        className="text-[14px] mb-8"
        style={{ color: 'rgba(100, 116, 139, 0.7)', fontFamily: 'var(--font-body)' }}
      >
        Vertel ons over je bedrijf om van start te gaan
      </motion.p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="org-name" className="text-[12px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'rgba(79, 70, 229, 0.6)', fontFamily: 'var(--font-body)' }}
          >
            Organisatienaam
          </label>
          <input
            id="org-name" type="text" required
            value={name} onChange={(e) => setName(e.target.value)}
            onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)}
            disabled={loading} placeholder="Bijv. Logistiek BV"
            style={inputStyle('name')}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, ...bouncy }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="sector" className="text-[12px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'rgba(79, 70, 229, 0.6)', fontFamily: 'var(--font-body)' }}
          >
            Sector
          </label>
          <div className="flex flex-wrap gap-2">
            {SECTORS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSector(s)}
                disabled={loading}
                className="transition-all duration-200"
                style={{
                  padding: '8px 16px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontFamily: 'var(--font-body)',
                  fontWeight: sector === s ? 600 : 400,
                  border: `1.5px solid ${sector === s ? '#6366F1' : 'rgba(99,102,241,0.12)'}`,
                  background: sector === s ? 'rgba(99,102,241,0.08)' : 'transparent',
                  color: sector === s ? '#6366F1' : 'rgba(100,116,139,0.7)',
                  cursor: loading ? 'not-allowed' : 'pointer',
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, ...bouncy }}
          className="pt-2"
        >
          <motion.button
            type="submit"
            disabled={loading || !name.trim() || !sector}
            whileHover={loading ? undefined : { scale: 1.015, y: -2 }}
            whileTap={loading ? undefined : { scale: 0.975 }}
            transition={snappy}
            className="w-full relative overflow-hidden group"
            style={{
              height: '54px',
              borderRadius: '16px',
              border: 'none',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'var(--font-body)',
              cursor: loading || !name.trim() || !sector ? 'not-allowed' : 'pointer',
              color: 'white',
              background: !name.trim() || !sector
                ? 'rgba(99,102,241,0.3)'
                : 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
              boxShadow: !name.trim() || !sector
                ? 'none'
                : '0 4px 14px rgba(99,102,241,0.35), 0 1px 3px rgba(99,102,241,0.2), inset 0 1px 0 rgba(255,255,255,0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
            }}
          >
            {loading ? (
              <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            ) : (
              <>
                Organisatie aanmaken
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </>
            )}
          </motion.button>
        </motion.div>
      </form>

      <AnimatePresence>
        {error && (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: -8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto', transition: bouncy }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            className="mt-5 overflow-hidden"
          >
            <div className="flex items-center gap-2.5 text-[13px] px-4 py-3 rounded-2xl"
              style={{
                background: 'rgba(239, 68, 68, 0.06)',
                border: '1px solid rgba(239, 68, 68, 0.12)',
                color: '#DC2626',
                fontFamily: 'var(--font-body)',
                fontWeight: 500,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
              </svg>
              {error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds, `/welcome/create-org` appears in route list.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/welcome/create-org/page.tsx
git commit -m "feat: organization creation page with sector selection"
```

---

### Task 5: Onboarding Choice Page (AstraDesk vs AI)

**Files:**
- Create: `src/app/(auth)/welcome/onboarding-choice/page.tsx`

- [ ] **Step 1: Create the onboarding choice page**

Create `src/app/(auth)/welcome/onboarding-choice/page.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { bouncy, snappy, fadeInUp, containerStagger } from '@/lib/motion'

export default function OnboardingChoicePage() {
  const router = useRouter()

  return (
    <motion.div
      className="relative"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        padding: '36px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 30px rgba(0,0,0,0.04)',
        maxWidth: 480,
      }}
    >
      <div className="absolute top-0 left-8 right-8 h-[1px]"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.9) 30%, rgba(255,255,255,0.9) 70%, transparent)' }}
      />

      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, ...bouncy }}
        className="text-[26px] font-black mb-1"
        style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
      >
        Onboarding programma
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, ...bouncy }}
        className="text-[14px] mb-8"
        style={{ color: 'rgba(100, 116, 139, 0.7)', fontFamily: 'var(--font-body)' }}
      >
        Kies hoe je begeleid wilt worden
      </motion.p>

      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        className="flex flex-col gap-3"
      >
        {/* AI Assisted */}
        <motion.button
          variants={fadeInUp}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={snappy}
          onClick={() => router.push('/welcome/create-org?mode=ai_assisted')}
          className="relative w-full text-left overflow-hidden group"
          style={{
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid rgba(99,102,241,0.12)',
            background: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex-shrink-0 flex items-center justify-center"
              style={{
                width: 48,
                height: 48,
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #6366F1 0%, #A855F7 100%)',
                color: 'white',
                boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2a4 4 0 0 1 4 4c0 1.95-1.4 3.58-3.25 3.93" />
                <path d="M8.24 2.69A4 4 0 0 0 8 6c0 1.95 1.4 3.58 3.25 3.93" />
                <circle cx="12" cy="14" r="4" />
                <path d="M12 18v4" />
                <path d="M8 22h8" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[16px] font-bold"
                  style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
                >
                  AI Assistent
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(99,102,241,0.08)', color: '#6366F1', fontFamily: 'var(--font-body)' }}
                >
                  Aanbevolen
                </span>
              </div>
              <div className="text-[13px]"
                style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}
              >
                AstraAI begeleidt je live door de setup. Stel vragen, en laat AI je helpen inrichten.
              </div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="flex-shrink-0 mt-3 transition-transform duration-200 group-hover:translate-x-1"
              style={{ color: 'rgba(100,116,139,0.3)' }}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </motion.button>

        {/* AstraDesk Contact */}
        <motion.button
          variants={fadeInUp}
          whileHover={{ scale: 1.02, y: -2 }}
          whileTap={{ scale: 0.98 }}
          transition={snappy}
          onClick={() => router.push('/welcome/contact')}
          className="relative w-full text-left overflow-hidden group"
          style={{
            padding: '20px',
            borderRadius: '16px',
            border: '1px solid rgba(99,102,241,0.08)',
            background: 'rgba(255,255,255,0.6)',
            cursor: 'pointer',
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="flex-shrink-0 flex items-center justify-center"
              style={{
                width: 48,
                height: 48,
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
                color: 'white',
                boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
              }}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[16px] font-bold mb-0.5"
                style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
              >
                Contact AstraDesk
              </div>
              <div className="text-[13px]"
                style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}
              >
                Ons team helpt je persoonlijk met de inrichting. We nemen binnen 24 uur contact op.
              </div>
            </div>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className="flex-shrink-0 mt-3 transition-transform duration-200 group-hover:translate-x-1"
              style={{ color: 'rgba(100,116,139,0.3)' }}
            >
              <path d="M9 18l6-6-6-6" />
            </svg>
          </div>
        </motion.button>
      </motion.div>

      {/* Back link */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="mt-6 text-center"
      >
        <Link href="/welcome"
          className="inline-flex items-center gap-2 text-[13px] font-semibold"
          style={{ color: 'rgba(99,102,241,0.6)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          Terug naar keuzes
        </Link>
      </motion.div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/welcome/onboarding-choice/page.tsx
git commit -m "feat: onboarding choice page — AI assistant vs AstraDesk contact"
```

---

### Task 6: AstraDesk Contact Page

**Files:**
- Create: `src/app/(auth)/welcome/contact/page.tsx`

- [ ] **Step 1: Create the contact page**

Create `src/app/(auth)/welcome/contact/page.tsx`:

```tsx
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { bouncy, snappy } from '@/lib/motion'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [company, setCompany] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [focusedField, setFocusedField] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, company, message }),
      })

      if (!res.ok) {
        throw new Error('Verzenden mislukt. Probeer het later opnieuw.')
      }

      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout')
    } finally {
      setLoading(false)
    }
  }

  const inputStyle = (field: string): React.CSSProperties => ({
    width: '100%',
    borderRadius: '16px',
    border: `2px solid ${focusedField === field ? 'rgba(99,102,241,0.5)' : 'rgba(99,102,241,0.08)'}`,
    padding: '14px 18px',
    fontSize: '15px',
    fontFamily: 'var(--font-body)',
    color: '#1E1B4B',
    background: focusedField === field ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)',
    outline: 'none',
    transition: 'all 0.25s ease',
    boxSizing: 'border-box',
    resize: 'none' as const,
  })

  if (sent) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={bouncy}
        className="relative text-center"
        style={{
          background: 'rgba(255, 255, 255, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: '20px',
          border: '1px solid rgba(0, 0, 0, 0.06)',
          padding: '48px 36px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 30px rgba(0,0,0,0.04)',
        }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...bouncy, delay: 0.1 }}
          className="mx-auto mb-4 flex items-center justify-center"
          style={{ width: 56, height: 56, borderRadius: '16px', background: 'rgba(34,197,94,0.1)' }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </motion.div>
        <h2 className="text-[22px] font-bold mb-2" style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}>
          Bericht verzonden
        </h2>
        <p className="text-[14px] mb-6" style={{ color: 'rgba(100,116,139,0.7)', fontFamily: 'var(--font-body)' }}>
          Het AstraDesk team neemt binnen 24 uur contact met je op.
        </p>
        <Link href="/welcome"
          className="inline-flex items-center gap-2 text-[14px] font-semibold px-5 py-2.5 rounded-xl"
          style={{
            color: '#6366F1',
            textDecoration: 'none',
            fontFamily: 'var(--font-body)',
            background: 'rgba(99,102,241,0.04)',
            border: '1px solid rgba(99,102,241,0.08)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" /><path d="m12 19-7-7 7-7" />
          </svg>
          Terug
        </Link>
      </motion.div>
    )
  }

  return (
    <motion.div
      className="relative"
      style={{
        background: 'rgba(255, 255, 255, 0.85)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderRadius: '20px',
        border: '1px solid rgba(0, 0, 0, 0.06)',
        padding: '36px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 8px 30px rgba(0,0,0,0.04)',
      }}
    >
      <motion.h2
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, ...bouncy }}
        className="text-[26px] font-black mb-1"
        style={{ fontFamily: 'var(--font-display)', color: '#1E1B4B' }}
      >
        Contact AstraDesk
      </motion.h2>
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, ...bouncy }}
        className="text-[14px] mb-8"
        style={{ color: 'rgba(100, 116, 139, 0.7)', fontFamily: 'var(--font-body)' }}
      >
        Ons team helpt je persoonlijk met de inrichting
      </motion.p>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <input
          type="text" required placeholder="Je naam" value={name}
          onChange={(e) => setName(e.target.value)}
          onFocus={() => setFocusedField('name')} onBlur={() => setFocusedField(null)}
          disabled={loading} style={{ ...inputStyle('name'), height: '52px' }}
        />
        <input
          type="text" required placeholder="Bedrijfsnaam" value={company}
          onChange={(e) => setCompany(e.target.value)}
          onFocus={() => setFocusedField('company')} onBlur={() => setFocusedField(null)}
          disabled={loading} style={{ ...inputStyle('company'), height: '52px' }}
        />
        <textarea
          required placeholder="Hoe kunnen we je helpen?" value={message}
          onChange={(e) => setMessage(e.target.value)}
          onFocus={() => setFocusedField('message')} onBlur={() => setFocusedField(null)}
          disabled={loading} rows={4} style={inputStyle('message')}
        />

        <motion.button
          type="submit"
          disabled={loading || !name.trim() || !company.trim() || !message.trim()}
          whileHover={loading ? undefined : { scale: 1.015, y: -2 }}
          whileTap={loading ? undefined : { scale: 0.975 }}
          transition={snappy}
          className="w-full"
          style={{
            height: '54px',
            borderRadius: '16px',
            border: 'none',
            fontSize: '15px',
            fontWeight: 700,
            fontFamily: 'var(--font-body)',
            cursor: loading ? 'not-allowed' : 'pointer',
            color: 'white',
            background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            boxShadow: '0 4px 14px rgba(245,158,11,0.35)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
          }}
        >
          {loading ? (
            <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" strokeOpacity="0.3" />
              <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
            </svg>
          ) : 'Verstuur bericht'}
        </motion.button>
      </form>

      <AnimatePresence>
        {error && (
          <motion.div key="error" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="mt-4 text-[13px] px-4 py-3 rounded-2xl"
            style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', color: '#DC2626', fontFamily: 'var(--font-body)' }}
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 text-center">
        <Link href="/welcome/onboarding-choice"
          className="text-[13px] font-semibold"
          style={{ color: 'rgba(99,102,241,0.6)', textDecoration: 'none', fontFamily: 'var(--font-body)' }}
        >
          ← Terug
        </Link>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 2: Create contact API route**

Create `src/app/api/contact/route.ts`:

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const body = await request.json()
  const { name, company, message } = body

  if (!name || !company || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Get the authenticated user's email
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const email = user?.email ?? 'unknown'

  // Store in a contact_requests table (or send email later)
  // For now, log and return success — replace with email/ticket system later
  console.log('[AstraDesk Contact]', { name, email, company, message, timestamp: new Date().toISOString() })

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(auth\)/welcome/contact/page.tsx src/app/api/contact/route.ts
git commit -m "feat: AstraDesk contact page with form submission"
```

---

### Task 7: Widen auth layout for welcome pages

**Files:**
- Modify: `src/app/(auth)/layout.tsx`

- [ ] **Step 1: Increase max width for welcome pages**

The current auth layout limits cards to 400px. The welcome page needs 480px. Update the card wrapper in `src/app/(auth)/layout.tsx`:

Change `style={{ maxWidth: 400, zIndex: 1 }}` to `style={{ maxWidth: 480, zIndex: 1 }}`.

- [ ] **Step 2: Verify build passes**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/layout.tsx
git commit -m "chore: widen auth layout to 480px for welcome pages"
```

---

### Task 8: Update signup to redirect to welcome

**Files:**
- Modify: `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: Update success message**

After signup, the user needs to confirm their email. The current success message is generic. Update it to mention they'll be taken to the welcome screen after confirming. No code change needed for the redirect — the middleware handles it (signup → email confirm → login → middleware sees no org → redirect to /welcome).

Verify the current signup success screen content is appropriate. If it says "Check your email" that's fine. No changes needed unless the copy needs updating.

- [ ] **Step 2: Commit (if changes were needed)**

```bash
git add src/app/\(auth\)/signup/page.tsx
git commit -m "chore: update signup success copy for onboarding flow"
```

---

### Task 9: End-to-end test Phase 1

**Files:** None (manual testing)

- [ ] **Step 1: Build and run locally**

```bash
npm run build && npm run dev
```

- [ ] **Step 2: Test the full flow**

1. Open incognito browser → go to `localhost:3000/signup`
2. Create a new account with a test email
3. Confirm email in Supabase dashboard (or via email)
4. Login → should redirect to `/welcome`
5. Click "Zelf aan de slag" → should go to `/welcome/create-org`
6. Fill in org name + sector → submit → should redirect to `/dashboard`
7. Verify org appears in Settings page

- [ ] **Step 3: Test middleware redirects**

1. Logged in with org → go to `/welcome` → should redirect to `/dashboard`
2. Logged out → go to `/dashboard` → should redirect to `/login`
3. Logged in without org → go to `/dashboard` → should redirect to `/welcome`

- [ ] **Step 4: Push to Vercel**

```bash
git push origin main
```

---

## Phase 2: Demo Mode

Depends on Phase 1 (welcome flow). Adds hardcoded seed data, DemoProvider, tour overlays, and "Start voor echt" button.

### Task 10: Demo Seed Data

**Files:**
- Create: `src/components/onboarding/demo-seed.ts`

- [ ] **Step 1: Create seed data file**

Create `src/components/onboarding/demo-seed.ts` with realistic demo data for a logistics company. Include: 1 organization, 2 sites, 6 shifts (3 per site), 10 employees with roles/skills, 2 processes, equipment entries. Use UUIDs as IDs. Match the exact types returned by your tRPC queries (reference the org router response shapes).

The file should export typed objects:

```typescript
export const DEMO_ORG = { id: 'demo-org-001', name: 'AstraDemo BV', sector: 'Logistiek & Warehousing', ... }
export const DEMO_SITES = [ ... ]
export const DEMO_SHIFTS = [ ... ]
export const DEMO_EMPLOYEES = [ ... ]
export const DEMO_PROCESSES = [ ... ]
export const DEMO_EQUIPMENT = [ ... ]
export const DEMO_ROLES = [ ... ]
```

Derive the exact shapes by reading the `.select()` columns from each query in `src/server/routers/org.ts` and `src/server/routers/workforce.ts`.

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/onboarding/demo-seed.ts
git commit -m "feat: hardcoded demo seed data for AstraDemo BV"
```

---

### Task 11: Demo Provider Context

**Files:**
- Create: `src/components/onboarding/demo-provider.tsx`
- Create: `src/hooks/use-demo.ts`

- [ ] **Step 1: Create useDemo hook**

Create `src/hooks/use-demo.ts`:

```typescript
import { create } from 'zustand'

interface DemoState {
  isDemo: boolean
  setDemo: (val: boolean) => void
}

export const useDemoStore = create<DemoState>((set) => ({
  isDemo: false,
  setDemo: (val) => set({ isDemo: val }),
}))

export function useDemo() {
  return useDemoStore((s) => s.isDemo)
}
```

- [ ] **Step 2: Create DemoProvider**

Create `src/components/onboarding/demo-provider.tsx`:

```tsx
'use client'

import { useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useDemoStore } from '@/hooks/use-demo'

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const setDemo = useDemoStore((s) => s.setDemo)

  useEffect(() => {
    async function checkDemoMode() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      setDemo(user?.app_metadata?.mode === 'demo')
    }
    checkDemoMode()
  }, [setDemo])

  return <>{children}</>
}
```

- [ ] **Step 3: Add DemoProvider to dashboard layout**

Modify `src/app/dashboard/layout.tsx`:

```typescript
import { AppShell } from '@/components/layout/app-shell'
import { DemoProvider } from '@/components/onboarding/demo-provider'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <DemoProvider>
      <AppShell>{children}</AppShell>
    </DemoProvider>
  )
}
```

- [ ] **Step 4: Verify build passes**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-demo.ts src/components/onboarding/demo-provider.tsx src/app/dashboard/layout.tsx
git commit -m "feat: DemoProvider context + useDemo hook for demo mode detection"
```

---

### Task 12: Demo Banner ("Start voor echt")

**Files:**
- Create: `src/components/onboarding/demo-banner.tsx`
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Create demo banner component**

Create `src/components/onboarding/demo-banner.tsx`:

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { snappy } from '@/lib/motion'
import { useDemo } from '@/hooks/use-demo'
import { trpc } from '@/lib/trpc/client'

export function DemoBanner() {
  const isDemo = useDemo()
  const router = useRouter()

  const exitDemo = trpc.onboarding.exitDemoMode.useMutation({
    onSuccess: () => {
      router.push('/welcome/create-org?mode=self_guided')
      router.refresh()
    },
  })

  if (!isDemo) return null

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 1, ...snappy }}
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
    >
      <motion.button
        whileHover={{ scale: 1.05, y: -2 }}
        whileTap={{ scale: 0.95 }}
        transition={snappy}
        onClick={() => exitDemo.mutate()}
        disabled={exitDemo.isPending}
        className="flex items-center gap-3 px-6 py-3 rounded-full"
        style={{
          background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 50%, #A855F7 100%)',
          color: 'white',
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          fontWeight: 600,
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 8px 32px rgba(99,102,241,0.4), 0 2px 8px rgba(0,0,0,0.1)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
        </svg>
        Start voor echt
      </motion.button>
    </motion.div>
  )
}
```

- [ ] **Step 2: Add DemoBanner to dashboard layout**

Add `<DemoBanner />` after `<AppShell>` in `src/app/dashboard/layout.tsx`.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/demo-banner.tsx src/app/dashboard/layout.tsx
git commit -m "feat: demo banner with 'Start voor echt' floating button"
```

---

### Task 13: Integrate Demo Data into Pages

**Files:**
- Modify: Dashboard pages that fetch data (Settings, Employees, Processes, etc.)

- [ ] **Step 1: Create a demo-aware data hook pattern**

For each page that uses tRPC queries, add a demo mode check at the top of the component. When `isDemo` is true, return the seed data instead of making tRPC calls.

Example pattern for the Settings/Organization page:

```tsx
import { useDemo } from '@/hooks/use-demo'
import { DEMO_ORG } from '@/components/onboarding/demo-seed'

export default function SettingsPage() {
  const isDemo = useDemo()

  // In demo mode, use seed data
  const { data: org } = trpc.org.getOrganization.useQuery(undefined, {
    enabled: !isDemo,
  })

  const displayOrg = isDemo ? DEMO_ORG : org

  // ... rest of component using displayOrg
}
```

Apply this pattern to each dashboard page. The key is: `enabled: !isDemo` on tRPC queries + fallback to seed data.

- [ ] **Step 2: Add mutation blocking toast for demo mode**

In pages that have create/edit/delete actions, wrap the handlers:

```tsx
import { toast } from '@/components/domain/toast'

function handleCreate() {
  if (isDemo) {
    toast.info('Dit is een demo — start je eigen omgeving om wijzigingen te maken')
    return
  }
  // ... actual mutation
}
```

- [ ] **Step 3: Verify build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: integrate demo seed data into all dashboard pages"
```

---

### Task 14: Tour Overlay Component

**Files:**
- Create: `src/components/onboarding/tour-overlay.tsx`

- [ ] **Step 1: Create tour overlay**

Create a reusable spotlight tour component. It takes an array of steps (element selector, title, description) and renders a backdrop with a spotlight cutout highlighting each element. Max 3 steps per page.

Features:
- Semi-transparent backdrop with CSS clip-path spotlight
- Card with title + description + step counter + Next/Close buttons
- Positions automatically near the highlighted element
- Stores "seen" flag in localStorage per page path
- Only shows in demo mode (check `useDemo()`)

- [ ] **Step 2: Add tour configs per page**

Create tour step definitions for key pages: Settings, Employees, Processes, Shifts, Planning.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/tour-overlay.tsx
git commit -m "feat: spotlight tour overlay for demo mode"
```

---

## Phase 3: Self-Guided Setup

Depends on Phase 1. Adds the setup checklist pill and contextual tooltips.

### Task 15: Setup Checklist Component

**Files:**
- Create: `src/components/onboarding/setup-checklist.tsx`
- Create: `src/hooks/use-onboarding.ts`

- [ ] **Step 1: Create useOnboarding hook**

Create `src/hooks/use-onboarding.ts` that:
- Checks `user_metadata.setup_checklist_dismissed`
- Checks `user_metadata.onboarding_mode === 'self_guided'`
- Detects completion of each step by querying existing data:
  - Step 1: `org.listSites` has ≥1 result
  - Step 2: `org.listShifts` has ≥1 result
  - Step 3: `org.listRoles` has ≥1 result
  - Step 4: `workforce.list` has ≥1 result
  - Step 5: `org.listProcesses` has ≥1 result
  - Step 6: manual dismiss (or planning data exists)

- [ ] **Step 2: Create setup checklist component**

Create `src/components/onboarding/setup-checklist.tsx`:
- Floating pill at bottom-right: shows "Setup 2/6" with a progress ring
- Click to expand into a compact card listing all 6 steps with checkmarks
- "Ik weet het al" dismiss button that updates user_metadata
- Uses framer-motion for expand/collapse animation
- Only renders when `onboarding_mode === 'self_guided'` and not dismissed

- [ ] **Step 3: Add to dashboard layout**

Add `<SetupChecklist />` to `src/app/dashboard/layout.tsx`.

- [ ] **Step 4: Verify build passes**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-onboarding.ts src/components/onboarding/setup-checklist.tsx src/app/dashboard/layout.tsx
git commit -m "feat: floating setup checklist pill with auto-detected progress"
```

---

### Task 16: Contextual Tooltip Component

**Files:**
- Create: `src/components/onboarding/contextual-tooltip.tsx`

- [ ] **Step 1: Create contextual tooltip**

Create `src/components/onboarding/contextual-tooltip.tsx`:
- Small tooltip pointing to an element (via ref or CSS selector)
- Max 1 sentence of text
- Auto-dismiss after 8 seconds
- Click anywhere to dismiss
- Stores seen flag in user_metadata (keyed by page path)
- Subtle fade-in animation, no overlay/dimming
- Only shows for self_guided onboarding mode

- [ ] **Step 2: Add tooltips to key pages**

Add one `<ContextualTooltip>` per page at the primary action button:
- Sites page: tooltip at "+ Site toevoegen"
- Shifts page: tooltip at shift creation
- Employees page: tooltip at add employee
- Processes page: tooltip at add process

- [ ] **Step 3: Verify build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/components/onboarding/contextual-tooltip.tsx
git commit -m "feat: contextual tooltips for self-guided onboarding"
```

---

## Phase 4: AI-Assisted Onboarding

Depends on Phase 1. Adds the Claude-powered side panel with tool use.

### Task 17: Install Vercel AI SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install dependencies**

```bash
npm install ai @ai-sdk/anthropic
```

- [ ] **Step 2: Add ANTHROPIC_API_KEY to .env**

Add to your local `.env`:
```
ANTHROPIC_API_KEY=sk-ant-...
```

Also add to Vercel Environment Variables (Settings → Environment Variables).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install Vercel AI SDK + Anthropic provider"
```

---

### Task 18: Claude Chat API Route

**Files:**
- Create: `src/app/api/ai/chat/route.ts`
- Create: `src/components/ai/ai-tools.ts`

- [ ] **Step 1: Define Claude tools**

Create `src/components/ai/ai-tools.ts` that defines tool schemas for:
- `createSite` — name, operating hours
- `createShift` — name, start_time, end_time, site_id
- `createRole` — name, description
- `addEmployee` — full_name, email, role
- `createProcess` — name, site_id
- `getCurrentPage` — returns the current page the user is on
- `getSetupProgress` — returns which setup steps are complete

Each tool should map to the corresponding tRPC mutation input schema.

- [ ] **Step 2: Create the streaming chat route**

Create `src/app/api/ai/chat/route.ts`:

```typescript
import { anthropic } from '@ai-sdk/anthropic'
import { streamText } from 'ai'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
// Import tool definitions

export async function POST(req: Request) {
  const { messages, context } = await req.json()

  // Verify auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const orgId = user.app_metadata?.organization_id
  if (!orgId) return new Response('No organization', { status: 403 })

  const systemPrompt = `Je bent AstraAI, de onboarding assistent van AstraPlanner.
Je helpt de gebruiker om hun workforce planning omgeving in te richten.

Context:
- Organisatie ID: ${orgId}
- Huidige pagina: ${context?.currentPage ?? 'onbekend'}
- Setup voortgang: ${JSON.stringify(context?.setupProgress ?? {})}

Regels:
- Antwoord altijd in het Nederlands
- Wees vriendelijk, kort en to-the-point
- Begeleid stap voor stap: sites → shifts → rollen → medewerkers → processen
- Als de gebruiker een vraag stelt, beantwoord die eerst en ga dan verder met de setup
- Gebruik de beschikbare tools om acties uit te voeren als de gebruiker dat wil
- Bevestig elke actie die je uitvoert`

  const result = streamText({
    model: anthropic('claude-sonnet-4-20250514'),
    system: systemPrompt,
    messages,
    tools: {
      // Register tool definitions here with execute functions
      // that call Supabase admin client to perform actions
    },
    maxSteps: 5,
  })

  return result.toDataStreamResponse()
}
```

- [ ] **Step 3: Implement tool execute functions**

Each tool's `execute` function should use the admin Supabase client to perform the action and return a confirmation message.

- [ ] **Step 4: Verify build passes**

Run: `npm run build`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ai/chat/route.ts src/components/ai/ai-tools.ts
git commit -m "feat: Claude chat API route with tool use for onboarding actions"
```

---

### Task 19: AI Side Panel Component

**Files:**
- Create: `src/components/ai/ai-panel.tsx`

- [ ] **Step 1: Create the AI panel**

Create `src/components/ai/ai-panel.tsx`:
- 380px wide right side panel with glassmorphism design
- Smooth slide-in animation (framer-motion)
- AstraAI avatar with pulsing indigo glow ring at top
- Chat message list with:
  - User bubbles (right-aligned, indigo)
  - AI bubbles (left-aligned, white glass) with typewriter effect
  - Typing indicator with shimmer animation
  - Suggested action buttons below AI messages
- Text input at bottom with send button
- Uses Vercel AI SDK `useChat` hook connected to `/api/ai/chat`
- Passes current page path + setup progress as context

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/ai-panel.tsx
git commit -m "feat: AI side panel with glassmorphism chat interface"
```

---

### Task 20: AI Floating Button

**Files:**
- Create: `src/components/ai/ai-button.tsx`

- [ ] **Step 1: Create floating AI button**

Create `src/components/ai/ai-button.tsx`:
- Small floating button at bottom-right (above demo banner if both visible)
- Pulsing indigo circle with AI icon
- Click toggles the AI panel open/closed
- Only visible for users with `onboarding_mode === 'ai_assisted'` or after AI onboarding

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/components/ai/ai-button.tsx
git commit -m "feat: floating AI button for persistent Claude access"
```

---

### Task 21: Integrate AI Panel into Dashboard

**Files:**
- Modify: `src/app/dashboard/layout.tsx`
- Modify: `src/components/layout/app-shell.tsx`

- [ ] **Step 1: Add AI panel + button to dashboard layout**

Add `<AiPanel>` and `<AiButton>` to the dashboard layout. The panel should:
- Auto-open when URL has `?ai=open` (set by create-org page for ai_assisted mode)
- Otherwise toggled by the floating button
- Panel pushes main content left when open (not overlay)

- [ ] **Step 2: Add flash-highlight effect**

When Claude executes a tool (creates a site, shift, etc.), briefly highlight the relevant UI section with a flash animation. This can be done via a global event emitter or zustand store that components subscribe to.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/app/dashboard/layout.tsx src/components/layout/app-shell.tsx
git commit -m "feat: integrate AI panel into dashboard with auto-open and flash highlights"
```

---

### Task 22: End-to-end Test All Phases

- [ ] **Step 1: Test Demo Mode**
1. Signup → Welcome → "Rondkijken" → Should see demo data on all pages
2. Tour overlays appear on first visit to each page
3. Mutations are blocked with toast
4. "Start voor echt" button works → exits demo → org creation

- [ ] **Step 2: Test Self-Guided**
1. Signup → Welcome → "Zelf aan de slag" → Create org → Dashboard
2. Setup checklist appears as floating pill
3. Contextual tooltips appear on first page visit
4. Checklist auto-updates as you create sites/shifts/etc.
5. "Ik weet het al" dismisses permanently

- [ ] **Step 3: Test AI-Assisted**
1. Signup → Welcome → "Onboarding programma" → "AI Assistent" → Create org → Dashboard with AI panel
2. Claude greets and starts guiding
3. Ask Claude to create a site → site appears in UI with flash highlight
4. Ask a question → Claude explains then resumes
5. Close panel → floating button remains → reopen works

- [ ] **Step 4: Test AstraDesk Contact**
1. "Onboarding programma" → "Contact AstraDesk" → Fill form → Submit → Confirmation

- [ ] **Step 5: Push everything to Vercel**

```bash
git push origin main
```
