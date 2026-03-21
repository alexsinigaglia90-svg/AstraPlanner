import { z } from 'zod'
import { router, plannerProcedure, managerProcedure, viewerProcedure } from '../trpc'

const NOT_IMPLEMENTED = { status: 'not_implemented' as const }

const planStatusEnum = z.enum([
  'draft', 'optimized', 'proposed', 'approved', 'published', 'stale', 'superseded', 'rejected',
])

export const planningRouter = router({
  listPlanVersions: viewerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        status: planStatusEnum.optional(),
        plan_period_start: z.string().optional(),
        plan_period_end: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  getPlanVersion: viewerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  createDraft: plannerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        plan_period_start: z.string(),
        plan_period_end: z.string(),
      })
    )
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  runOptimizer: plannerProcedure
    .input(
      z.object({
        plan_version_id: z.string().uuid(),
        solver_strategy: z.enum(['greedy', 'highs_mip']).optional(),
        time_budget_seconds: z.number().min(1).max(300).optional(),
        objective_overrides: z
          .object({
            minimize_cost_weight: z.number().optional(),
            maximize_coverage_weight: z.number().optional(),
            maximize_skill_match_weight: z.number().optional(),
            minimize_overtime_weight: z.number().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  getOptimizerStatus: plannerProcedure
    .input(z.object({ job_id: z.string() }))
    .query(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  transitionState: plannerProcedure
    .input(
      z.object({
        plan_version_id: z.string().uuid(),
        target_state: z.enum(['proposed', 'approved', 'rejected', 'published']),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  manualAssign: plannerProcedure
    .input(
      z.object({
        plan_version_id: z.string().uuid(),
        employee_id: z.string().uuid(),
        process_id: z.string().uuid(),
        time_slot_id: z.string().uuid(),
        shift_pattern_id: z.string().uuid(),
      })
    )
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  removeAssignment: plannerProcedure
    .input(z.object({ assignment_id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  lockAssignment: plannerProcedure
    .input(z.object({ assignment_id: z.string().uuid() }))
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),

  overrideHardConstraint: managerProcedure
    .input(
      z.object({
        plan_version_id: z.string().uuid(),
        assignment_id: z.string().uuid(),
        constraint_type: z.string().min(1),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ input }) => {
      void input
      return NOT_IMPLEMENTED
    }),
})
