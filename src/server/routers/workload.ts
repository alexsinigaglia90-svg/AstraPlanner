import { z } from 'zod'
import { router, plannerProcedure } from '../trpc'

export const workloadRouter = router({
  compute: plannerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        plan_version_id: z.string().uuid(),
      })
    )
    .mutation(async ({ input }) => {
      // TODO: Phase 3 — implement workload computation
      void input
      return { status: 'not_implemented' as const, message: 'Workload computation will be implemented in Phase 3' }
    }),

  getForPlan: plannerProcedure
    .input(z.object({ plan_version_id: z.string().uuid() }))
    .query(async ({ input }) => {
      // TODO: Phase 3 — query workload_plan records for this plan version
      void input
      return { status: 'not_implemented' as const }
    }),
})
