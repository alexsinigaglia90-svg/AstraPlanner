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

      // Create organization record (sector + domain stored in settings_json since no column exists)
      const domain = ctx.user.email?.split('@')[1] ?? ''

      const { data: org, error: orgError } = await admin
        .from('organization')
        .insert({
          name: input.name,
          slug,
          billing_email: billingEmail,
          settings_json: { sector: input.sector, domain },
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

  checkDomainMatch: authenticatedProcedure.query(async ({ ctx }) => {
    // If user already has an org, no match needed
    if (ctx.organizationId) {
      return { match: false } as const
    }

    const domain = ctx.user.email?.split('@')[1] ?? ''
    if (!domain) return { match: false } as const

    // Skip public/free email domains
    const freeEmailDomains = (await import('free-email-domains')).default
    if ((freeEmailDomains as string[]).includes(domain)) {
      return { match: false } as const
    }

    const admin = createAdminClient()

    // Find organization with matching domain
    const { data: org } = await admin
      .from('organization')
      .select('id, name')
      .eq('settings_json->>domain', domain)
      .single()

    if (!org) return { match: false } as const

    // Get site count
    const { count: siteCount } = await admin
      .from('site')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', org.id)

    return {
      match: true,
      organization: {
        id: org.id,
        name: org.name,
        siteCount: siteCount ?? 0,
      },
    } as const
  }),

  requestJoin: authenticatedProcedure
    .input(z.object({ organization_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Guard: user must not already have an org
      if (ctx.organizationId) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'User already belongs to an organization',
        })
      }

      const admin = createAdminClient()

      // Guard: no existing pending request for this user+org combo
      const { data: existing } = await admin
        .from('join_request')
        .select('id')
        .eq('user_id', ctx.user.id)
        .eq('organization_id', input.organization_id)
        .eq('status', 'pending')
        .maybeSingle()

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: 'A pending join request already exists for this organization',
        })
      }

      const fullName = (ctx.user.user_metadata?.full_name as string | undefined) ?? ctx.user.email ?? 'Unknown'

      // Insert join request
      const { data: request, error: requestError } = await admin
        .from('join_request')
        .insert({
          user_id: ctx.user.id,
          organization_id: input.organization_id,
          email: ctx.user.email,
          full_name: fullName,
          status: 'pending',
        })
        .select('id')
        .single()

      if (requestError || !request) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: requestError?.message ?? 'Failed to create join request',
        })
      }

      // Fetch org name for notification title
      const { data: org } = await admin
        .from('organization')
        .select('name')
        .eq('id', input.organization_id)
        .single()

      const orgName = org?.name ?? 'organisatie'

      // Insert notification for org admins
      await admin.from('notification').insert({
        organization_id: input.organization_id,
        type: 'join_request',
        title: `${fullName} wil lid worden van ${orgName}`,
        body: `${ctx.user.email} heeft een verzoek ingediend om lid te worden.`,
        link: '/dashboard/settings/team',
        is_read: false,
      })

      return { requestId: request.id }
    }),

  getJoinStatus: authenticatedProcedure.query(async ({ ctx }) => {
    const admin = createAdminClient()

    const { data: request } = await admin
      .from('join_request')
      .select('status, organization_id')
      .eq('user_id', ctx.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!request) return { status: null }

    // Get org name
    const { data: org } = await admin
      .from('organization')
      .select('name')
      .eq('id', request.organization_id)
      .single()

    return {
      status: request.status as string,
      organizationName: org?.name ?? null,
    }
  }),
})
