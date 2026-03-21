import { z } from 'zod'
import { router, plannerProcedure } from '../trpc'

const NOT_IMPLEMENTED = { status: 'not_implemented' as const }

export const scenarioRouter = router({
  create: plannerProcedure
    .input(
      z.object({
        base_plan_version_id: z.string().uuid(),
        name: z.string().min(1),
        description: z.string().optional(),
        modifications: z.object({
          demand_overrides: z
            .array(
              z.object({
                process_id: z.string().uuid(),
                time_slot_id: z.string().uuid(),
                new_required_fte: z.number().min(0),
              })
            )
            .optional(),
          employee_removals: z.array(z.string().uuid()).optional(),
          employee_additions: z.array(z.string().uuid()).optional(),
          constraint_changes: z
            .array(
              z.object({
                constraint_type: z.string().min(1),
                new_parameters: z.record(z.union([z.number(), z.string(), z.boolean()])),
              })
            )
            .optional(),
        }),
      })
    )
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  run: plannerProcedure
    .input(
      z.object({
        scenario_id: z.string().uuid(),
        solver_strategy: z.enum(['greedy', 'highs_mip']).optional(),
        time_budget_seconds: z.number().min(1).optional(),
      })
    )
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  list: plannerProcedure
    .input(z.object({ base_plan_version_id: z.string().uuid() }))
    .query(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  promote: plannerProcedure
    .input(z.object({ scenario_id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),
})
