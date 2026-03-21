import { TRPCError } from '@trpc/server'
import { type Context, type AppRole } from '../trpc'

// Middleware: require authenticated user
export function enforceAuth(ctx: Context) {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' })
  }
  if (!ctx.organizationId) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'No organization assigned' })
  }
  return {
    ...ctx,
    user: ctx.user,
    organizationId: ctx.organizationId,
    role: ctx.role!,
  }
}

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<AppRole, number> = {
  super_admin: 100,
  tenant_admin: 90,
  site_manager: 70,
  planner: 50,
  supervisor: 40,
  employee: 20,
  viewer: 10,
}

export function hasMinRole(userRole: AppRole, requiredRole: AppRole): boolean {
  return ROLE_HIERARCHY[userRole] >= ROLE_HIERARCHY[requiredRole]
}
