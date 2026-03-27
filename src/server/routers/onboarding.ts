import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, authenticatedProcedure } from '../trpc'
import { createAdminClient } from '@/lib/supabase/admin'

export const onboardingRouter = router({
  /**
   * Create a new organization for the authenticated user.
   * Guards that the user has no existing org before creating.
   * On metadata update failure, rolls back org creation.
   */
  createOrganization: authenticatedProcedure
    .input(z.object({ name: z.string().min(1), sector: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.organizationId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User already belongs to an organization',
        })
      }

      const admin = createAdminClient()

      // Create organization record
      const { data: org, error: orgError } = await admin
        .from('organization')
        .insert({ name: input.name, sector: input.sector })
        .select('id')
        .single()

      if (orgError || !org) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: orgError?.message ?? 'Failed to create organization',
        })
      }

      // Update user app_metadata with org and role
      const { error: metaError } = await admin.auth.admin.updateUserById(
        ctx.user.id,
        {
          app_metadata: {
            ...ctx.user.app_metadata,
            organization_id: org.id,
            role: 'tenant_admin',
            site_ids: [],
          },
        }
      )

      if (metaError) {
        // Roll back org creation
        await admin.from('organization').delete().eq('id', org.id)

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to assign organization to user: ${metaError.message}`,
        })
      }

      return { organizationId: org.id }
    }),

  /**
   * Set demo mode for the authenticated user.
   * Guards that the user has no existing org.
   */
  setDemoMode: authenticatedProcedure.mutation(async ({ ctx }) => {
    if (ctx.organizationId) {
      throw new TRPCError({
        code: 'CONFLICT',
        message: 'User already belongs to an organization',
      })
    }

    const admin = createAdminClient()

    const { error } = await admin.auth.admin.updateUserById(ctx.user.id, {
      app_metadata: {
        ...ctx.user.app_metadata,
        mode: 'demo',
      },
    })

    if (error) {
      throw new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: `Failed to set demo mode: ${error.message}`,
      })
    }

    return { mode: 'demo' }
  }),

  /**
   * Exit demo mode — removes mode from app_metadata.
   */
  exitDemoMode: authenticatedProcedure.mutation(async ({ ctx }) => {
    const admin = createAdminClient()

    // Spread existing metadata and set mode to null to remove it
    const { mode: _removed, ...restMeta } = ctx.user.app_metadata ?? {}

    const { error } = await admin.auth.admin.updateUserById(ctx.user.id, {
      app_metadata: {
        ...restMeta,
        mode: null,
      },
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
