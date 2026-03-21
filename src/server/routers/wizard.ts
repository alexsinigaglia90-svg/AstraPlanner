import { z } from 'zod'
import { router, adminProcedure } from '../trpc'

const NOT_IMPLEMENTED = { status: 'not_implemented' as const }

export const wizardRouter = router({
  getProgress: adminProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      void ctx
      return NOT_IMPLEMENTED
    }),

  completePhase: adminProcedure
    .input(
      z.object({
        phase: z.number().int().min(1).max(5),
        data: z.record(z.unknown()),
      })
    )
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  skipPhase: adminProcedure
    .input(
      z.object({
        phase: z.number().int().min(4).max(5),  // only phases 4 and 5 can be skipped
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),
})
