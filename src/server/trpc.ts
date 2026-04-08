import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { createClient } from '@/lib/supabase/server'
import { type User } from '@supabase/supabase-js'
import { enforceAuth, hasMinRole } from './middleware/auth'
import { checkRateLimit, identifierFor } from '@/lib/rate-limit'

// Define the app roles
export const APP_ROLES = [
  'super_admin',
  'tenant_admin',
  'site_manager',
  'planner',
  'supervisor',
  'employee',
  'viewer',
] as const

export type AppRole = (typeof APP_ROLES)[number]

// Context type
export type Context = {
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User | null
  organizationId: string | null
  role: AppRole | null
  siteIds: string[]
  headers: Headers | null
}

// Create context for each request
export async function createTRPCContext(opts?: {
  headers?: Headers
}): Promise<Context> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Extract custom claims from JWT
  const organizationId = user?.app_metadata?.organization_id ?? null
  const role = (user?.app_metadata?.role as AppRole) ?? null
  const siteIds = (user?.app_metadata?.site_ids as string[]) ?? []

  return {
    supabase,
    user,
    organizationId,
    role,
    siteIds,
    headers: opts?.headers ?? null,
  }
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory

/**
 * Rate-limit middleware. Applied automatically on every authenticated
 * mutation via {@link protectedProcedure}. Queries are not rate-limited
 * here because RLS already gates them and read-heavy traffic is normal
 * during dashboard browsing. The 'mutations' bucket allows 120 writes
 * per minute per user (see src/lib/rate-limit.ts).
 */
const rateLimitMutations = t.middleware(async ({ ctx, type, next }) => {
  if (type === 'mutation') {
    const id = identifierFor({
      userId: ctx.user?.id ?? null,
      headers: ctx.headers ?? undefined,
    })
    const result = await checkRateLimit('mutations', id)
    if (!result.success) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Te veel verzoeken — probeer het over enkele seconden opnieuw.',
      })
    }
  }
  return next()
})

// Protected procedure — requires auth + applies rate-limit on mutations
export const protectedProcedure = t.procedure
  .use(rateLimitMutations)
  .use(async ({ ctx, next }) => {
    const authed = enforceAuth(ctx)
    return next({ ctx: authed })
  })

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

// Role-gated procedure factory
export function roleProcedure(minRole: AppRole) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    if (!hasMinRole(ctx.role, minRole)) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Requires ${minRole} role or higher`,
      })
    }
    return next({ ctx })
  })
}

// Common role shortcuts
export const adminProcedure = roleProcedure('tenant_admin')
export const managerProcedure = roleProcedure('site_manager')
export const plannerProcedure = roleProcedure('planner')
/** Require at least supervisor role (supervisor=40) */
export const supervisorProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (!hasMinRole(ctx.role, 'supervisor')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Minimum role: supervisor' })
  }
  return next({ ctx })
})
export const viewerProcedure = roleProcedure('viewer')
