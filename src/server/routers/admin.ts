import { router, protectedProcedure, adminProcedure } from '../trpc'

export const adminRouter = router({
  getSystemHealth: protectedProcedure.query(async ({ ctx }) => {
    // Simple health check — verify DB connectivity
    const { data, error } = await ctx.supabase
      .from('organization')
      .select('id')
      .limit(1)

    return {
      status: 'healthy' as const,
      database: error ? 'error' : 'connected',
      timestamp: new Date(),
      user: ctx.user.email,
      role: ctx.role,
      organizationId: ctx.organizationId,
    }
  }),
})

// Suppress unused import warning — adminProcedure is exported for future use
export { adminProcedure }
