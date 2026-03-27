import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, authenticatedProcedure } from '../trpc'
import { createAdminClient } from '@/lib/supabase/admin'

/** Generate a URL-safe slug from a name */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
}

export const onboardingRouter = router({
  createOrganization: authenticatedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        sector: z.string().min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (ctx.organizationId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User already belongs to an organization',
        })
      }

      const admin = createAdminClient()

      // Generate slug + use user email as billing_email
      const baseSlug = slugify(input.name)
      const slug = `${baseSlug}-${Date.now().toString(36)}`
      const billingEmail = ctx.user.email ?? ''

      // Create organization record (sector stored in settings_json since no column exists)
      const { data: org, error: orgError } = await admin
        .from('organization')
        .insert({
          name: input.name,
          slug,
          billing_email: billingEmail,
          settings_json: { sector: input.sector },
        })
        .select('id')
        .single()

      if (orgError || !org) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: orgError?.message ?? 'Failed to create organization',
        })
      }

      // Update user app_metadata with org, role, and clear any demo mode
      const { error: metaError } = await admin.auth.admin.updateUserById(
        ctx.user.id,
        {
          app_metadata: {
            ...ctx.user.app_metadata,
            organization_id: org.id,
            role: 'tenant_admin',
            site_ids: [],
            mode: null,
          },
        }
      )

      if (metaError) {
        await admin.from('organization').delete().eq('id', org.id)
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Failed to assign organization to user: ${metaError.message}`,
        })
      }

      return { organizationId: org.id }
    }),

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

  exitDemoMode: authenticatedProcedure.mutation(async ({ ctx }) => {
    const admin = createAdminClient()

    const { error } = await admin.auth.admin.updateUserById(ctx.user.id, {
      app_metadata: {
        ...ctx.user.app_metadata,
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
