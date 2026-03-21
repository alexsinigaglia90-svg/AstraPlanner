import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  router,
  protectedProcedure,
  adminProcedure,
  managerProcedure,
  viewerProcedure,
} from '../trpc'

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
      void input
      // TODO: query auth.users joined with user_profile — requires admin Supabase client
      return { items: [], next_cursor: null, total_count: 0 }
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
      const { data, error } = await ctx.supabase.auth.admin.inviteUserByEmail(input.email, {
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
})
