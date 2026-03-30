import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  router,
  protectedProcedure,
  adminProcedure,
  managerProcedure,
  viewerProcedure,
} from '../trpc'
import { createAdminClient } from '@/lib/supabase/admin'

const roleEnum = z.enum([
  'tenant_admin', 'site_manager', 'planner', 'supervisor', 'employee', 'viewer',
])

const paginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(200).optional().default(50),
})

export const adminRouter = router({
  getSystemHealth: protectedProcedure.query(async ({ ctx }) => {
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

  listUsers: adminProcedure
    .input(
      paginationInput.extend({
        role: roleEnum.optional(),
        site_id: z.string().uuid().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const adminClient = createAdminClient()

      // Supabase admin listUsers returns up to 1000 per page; we post-filter by org
      // because there is no server-side filter on app_metadata via the REST API.
      const { data, error } = await adminClient.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      // Filter to users belonging to this organization
      let users = (data?.users ?? []).filter(
        (u) => u.app_metadata?.organization_id === ctx.organizationId,
      )

      // Optional role filter
      if (input.role) {
        users = users.filter((u) => u.app_metadata?.role === input.role)
      }

      // Optional site filter — site_ids is an array in app_metadata
      if (input.site_id) {
        users = users.filter((u) => {
          const siteIds: string[] = u.app_metadata?.site_ids ?? []
          return siteIds.includes(input.site_id!)
        })
      }

      // Stable sort by email
      users.sort((a, b) => (a.email ?? '').localeCompare(b.email ?? ''))

      const total_count = users.length
      // Apply cursor-based pagination (cursor = last user id)
      const startIdx = input.cursor
        ? users.findIndex((u) => u.id === input.cursor) + 1
        : 0
      const page = users.slice(startIdx, startIdx + input.limit)
      const lastUser = page[page.length - 1]

      const items = page.map((u) => ({
        user_id: u.id,
        email: u.email ?? null,
        full_name: (u.user_metadata?.full_name as string | undefined) ?? null,
        role: (u.app_metadata?.role as string | undefined) ?? null,
        site_ids: (u.app_metadata?.site_ids as string[] | undefined) ?? [],
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
        is_deactivated: (u.app_metadata?.deactivated as boolean | undefined) ?? false,
      }))

      return {
        items,
        next_cursor: page.length === input.limit && lastUser ? lastUser.id : null,
        total_count,
      }
    }),

  inviteUser: adminProcedure
    .input(
      z.object({
        email: z.string().email(),
        full_name: z.string().min(1),
        role: z.enum(['site_manager', 'planner', 'supervisor', 'employee', 'viewer']),
        site_ids: z.array(z.string().uuid()),
        employee_id: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const adminClient = createAdminClient()
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(input.email, {
        data: {
          full_name: input.full_name,
          role: input.role,
          site_ids: input.site_ids,
          organization_id: ctx.organizationId,
          ...(input.employee_id ? { employee_id: input.employee_id } : {}),
        },
      })

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return {
        user_id: data.user.id,
        email: data.user.email ?? input.email,
        role: input.role,
        invitation_sent: true,
      }
    }),

  updateUserRole: adminProcedure
    .input(
      z.object({
        user_id: z.string().uuid(),
        role: roleEnum,
        site_ids: z.array(z.string().uuid()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.auth.admin.updateUserById(input.user_id, {
        app_metadata: {
          role: input.role,
          ...(input.site_ids !== undefined ? { site_ids: input.site_ids } : {}),
        },
      })

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return {
        user_id: input.user_id,
        role: input.role,
        site_ids: input.site_ids ?? [],
        updated_at: new Date().toISOString(),
      }
    }),

  deactivateUser: adminProcedure
    .input(
      z.object({
        user_id: z.string().uuid(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error } = await ctx.supabase.auth.admin.updateUserById(input.user_id, {
        ban_duration: 'none',
        app_metadata: { deactivated: true, deactivation_reason: input.reason },
      })

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return {
        user_id: input.user_id,
        deactivated: true,
        deactivated_at: new Date().toISOString(),
      }
    }),

  getAuditLog: adminProcedure
    .input(
      paginationInput.extend({
        entity_type: z.string().optional(),
        entity_id: z.string().optional(),
        actor_id: z.string().optional(),
        action: z.string().optional(),
        date_from: z.string().optional(),
        date_to: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('audit_log')
        .select('id, actor_id, actor_type, action, entity_type, entity_id, before_state, after_state, created_at', { count: 'exact' })
        .order('created_at', { ascending: false })
        .limit(input.limit)

      if (input.entity_type) query = query.eq('entity_type', input.entity_type)
      if (input.entity_id) query = query.eq('entity_id', input.entity_id)
      if (input.actor_id) query = query.eq('actor_id', input.actor_id)
      if (input.action) query = query.eq('action', input.action)
      if (input.date_from) query = query.gte('created_at', input.date_from)
      if (input.date_to) query = query.lte('created_at', input.date_to)
      if (input.cursor) query = query.gt('created_at', input.cursor)

      const { data, error, count } = await query

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      const items = data ?? []
      const last = items[items.length - 1]

      return {
        items,
        next_cursor: items.length === input.limit && last ? last.created_at : null,
        total_count: count ?? 0,
      }
    }),

  listLaborRules: managerProcedure
    .input(
      z.object({
        site_id: z.string().uuid().optional(),
        jurisdiction: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('labor_rule')
        .select('id, name, jurisdiction, constraint_type, rule_type, parameters, site_ids, is_active')
        .eq('is_active', true)

      if (input.jurisdiction) query = query.eq('jurisdiction', input.jurisdiction)
      if (input.site_id) query = query.contains('site_ids', [input.site_id])

      const { data, error } = await query

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return data ?? []
    }),

  upsertLaborRule: managerProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        jurisdiction: z.string().min(1),
        constraint_type: z.enum(['hard', 'soft']),
        rule_type: z.string().min(1),
        parameters: z.record(z.union([z.number(), z.string(), z.boolean()])),
        site_ids: z.array(z.string().uuid()).optional(),
        is_active: z.boolean().optional().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('labor_rule')
        .upsert({
          ...(input.id ? { id: input.id } : {}),
          name: input.name,
          jurisdiction: input.jurisdiction,
          constraint_type: input.constraint_type,
          rule_type: input.rule_type,
          parameters: input.parameters,
          site_ids: input.site_ids ?? [],
          is_active: input.is_active,
        })
        .select('id, name, constraint_type, rule_type, updated_at')
        .single()

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return data
    }),

  listNotifications: viewerProcedure
    .input(
      paginationInput.extend({
        unread_only: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('notification')
        .select('id, type, title, body, is_read, action_url, created_at', { count: 'exact' })
        .eq('user_id', ctx.user.id)
        .order('created_at', { ascending: false })
        .limit(input.limit)

      if (input.unread_only) query = query.eq('is_read', false)
      if (input.cursor) query = query.gt('created_at', input.cursor)

      const { data, error, count } = await query

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      const items = data ?? []
      const last = items[items.length - 1]

      return {
        items,
        next_cursor: items.length === input.limit && last ? last.created_at : null,
        total_count: count ?? 0,
      }
    }),

  markNotificationRead: viewerProcedure
    .input(z.object({ notification_ids: z.array(z.string().uuid()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { error, count } = await ctx.supabase
        .from('notification')
        .update({ is_read: true })
        .in('id', input.notification_ids)
        .eq('user_id', ctx.user.id)

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return { updated: count ?? input.notification_ids.length }
    }),

  listJoinRequests: adminProcedure.query(async ({ ctx }) => {
    const admin = createAdminClient()

    const { data, error } = await admin
      .from('join_request')
      .select('id, user_id, email, full_name, status, created_at')
      .eq('organization_id', ctx.organizationId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
    }

    return {
      requests: (data ?? []) as Array<{
        id: string
        user_id: string
        email: string | null
        full_name: string | null
        status: string
        created_at: string
      }>,
    }
  }),

  resolveJoinRequest: adminProcedure
    .input(
      z.object({
        request_id: z.string().uuid(),
        action: z.enum(['approve', 'reject']),
        role: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Get the request and verify it belongs to this organization
      const { data: request, error: fetchError } = await admin
        .from('join_request')
        .select('id, user_id, organization_id, status')
        .eq('id', input.request_id)
        .single()

      if (fetchError || !request) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Join request not found' })
      }

      if (request.organization_id !== ctx.organizationId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Join request does not belong to your organization' })
      }

      if (input.action === 'approve') {
        const assignedRole = input.role ?? 'employee'

        // Update user app_metadata
        const { error: metaError } = await admin.auth.admin.updateUserById(request.user_id, {
          app_metadata: {
            organization_id: ctx.organizationId,
            role: assignedRole,
            site_ids: [],
            mode: null,
          },
        })

        if (metaError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: metaError.message })
        }

        // Update join request record
        const { error: updateError } = await admin
          .from('join_request')
          .update({
            status: 'approved',
            assigned_role: assignedRole,
            decided_by: ctx.user.id,
            decided_at: new Date().toISOString(),
          })
          .eq('id', input.request_id)

        if (updateError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: updateError.message })
        }
      } else {
        // Reject
        const { error: updateError } = await admin
          .from('join_request')
          .update({
            status: 'rejected',
            decided_by: ctx.user.id,
            decided_at: new Date().toISOString(),
          })
          .eq('id', input.request_id)

        if (updateError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: updateError.message })
        }
      }

      return { success: true }
    }),
})
