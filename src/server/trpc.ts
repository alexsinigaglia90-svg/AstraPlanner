import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { createClient } from '@/lib/supabase/server'
import { type User } from '@supabase/supabase-js'
import { enforceAuth, hasMinRole } from './middleware/auth'

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
}

// Create context for each request
export async function createTRPCContext(): Promise<Context> {
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
  }
}

const t = initTRPC.context<Context>().create({
  transformer: superjson,
})

export const router = t.router
export const publicProcedure = t.procedure
export const createCallerFactory = t.createCallerFactory

// Protected procedure — requires auth
export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const authed = enforceAuth(ctx)
  return next({ ctx: authed })
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
export const viewerProcedure = roleProcedure('viewer')
