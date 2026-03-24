/**
 * org router — Organization and Site Management
 * Source of truth: docs/api-contracts.md §org + §Process Management
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  router,
  viewerProcedure,
  adminProcedure,
  managerProcedure,
} from '../trpc'
import { createAdminClient } from '../../lib/supabase/admin'

// ---------------------------------------------------------------------------
// Shared site settings shape
// ---------------------------------------------------------------------------

const AllowanceBreakdownSchema = z.object({
  break_allowance: z.number(),
  walk_time_allowance: z.number(),
  startup_shutdown_allowance: z.number(),
  other_allowance: z.number(),
})

const OperatingHoursSchema = z.record(
  z.object({ open: z.string(), close: z.string() }),
)

const SiteSettingsSchema = z.object({
  allowance_factor: z.number().optional(),
  allowance_breakdown: AllowanceBreakdownSchema.optional(),
  operating_hours: OperatingHoursSchema.optional(),
  max_headcount: z.number().nullable().optional(),
  absenteeism_rate: z.number().optional(),
  notification_retention_days: z.number().optional(),
})

// ---------------------------------------------------------------------------
// Helper: throw on Supabase error
// ---------------------------------------------------------------------------

function assertNoError(
  error: { message: string } | null,
  label: string,
): void {
  if (error) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: `${label}: ${error.message}`,
    })
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const orgRouter = router({
  // -------------------------------------------------------------------------
  // getOrganization
  // -------------------------------------------------------------------------
  getOrganization: viewerProcedure.query(async ({ ctx }) => {
    if (!ctx.organizationId) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'No organization in token',
      })
    }

    const { data, error } = await ctx.supabase
      .from('organization')
      .select(
        'id, name, slug, subscription_tier, default_timezone, default_locale, default_currency, settings_json, created_at, updated_at',
      )
      .eq('id', ctx.organizationId)
      .single()

    assertNoError(error, 'getOrganization')

    if (!data) {
      throw new TRPCError({ code: 'NOT_FOUND', message: 'Organization not found' })
    }

    return data as {
      id: string
      name: string
      slug: string
      subscription_tier: 'trial' | 'starter' | 'professional' | 'enterprise'
      settings_json: Record<string, unknown>
      created_at: string
      updated_at: string
    }
  }),

  // -------------------------------------------------------------------------
  // updateOrganization
  // -------------------------------------------------------------------------
  updateOrganization: adminProcedure
    .input(
      z.object({
        name: z.string().min(1).optional().describe('Organization display name'),
        settings_json: z
          .record(z.unknown())
          .optional()
          .describe('Organization-level settings'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ctx.organizationId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'No organization in token',
        })
      }

      const { data, error } = await ctx.supabase
        .from('organization')
        .update({ ...input, updated_at: new Date().toISOString() })
        .eq('id', ctx.organizationId)
        .select('id, name, slug, settings_json, updated_at')
        .single()

      assertNoError(error, 'updateOrganization')

      if (!data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Organization not found',
        })
      }

      return data as {
        id: string
        name: string
        slug: string
        settings_json: Record<string, unknown>
        updated_at: string
      }
    }),

  // -------------------------------------------------------------------------
  // listSites
  // -------------------------------------------------------------------------
  listSites: viewerProcedure.query(async ({ ctx }) => {
    const { data, error } = await ctx.supabase
      .from('site')
      .select('id, name, code, site_type, timezone, address_line1, city, country_code, settings_json, created_at, status')
      .order('name')

    assertNoError(error, 'listSites')

    return (data ?? []).map((site) => ({
      id: site.id as string,
      name: site.name as string,
      code: site.code as string,
      site_type: site.site_type as string,
      timezone: site.timezone as string,
      address: [site.address_line1, site.city, site.country_code].filter(Boolean).join(', '),
      settings_json: (site.settings_json ?? {}) as Record<string, unknown>,
      is_active: site.status === 'active',
      created_at: site.created_at as string,
    }))
  }),

  // -------------------------------------------------------------------------
  // getSite
  // -------------------------------------------------------------------------
  getSite: viewerProcedure
    .input(z.object({ id: z.string().uuid().describe('Site ID') }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('site')
        .select(
          'id, name, code, site_type, timezone, address_line1, city, postal_code, country_code, settings_json, status, created_at, updated_at',
        )
        .eq('id', input.id)
        .single()

      assertNoError(error, 'getSite')

      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' })
      }

      return {
        ...data,
        address: [data.address_line1, data.city, data.country_code].filter(Boolean).join(', '),
        is_active: data.status === 'active',
      } as {
        id: string
        name: string
        code: string
        site_type: string
        timezone: string
        address: string | null
        settings_json: {
          allowance_factor: number
          allowance_breakdown: {
            break_allowance: number
            walk_time_allowance: number
            startup_shutdown_allowance: number
            other_allowance: number
          }
          operating_hours: Record<string, { open: string; close: string }>
          max_headcount: number | null
          absenteeism_rate: number
          notification_retention_days: number
        }
        is_active: boolean
        created_at: string
        updated_at: string
      }
    }),

  // -------------------------------------------------------------------------
  // updateSiteSettings
  // -------------------------------------------------------------------------
  updateSiteSettings: managerProcedure
    .input(
      z.object({
        site_id: z.string().uuid().describe('Site to update'),
        name: z.string().min(1).optional(),
        timezone: z.string().optional().describe('IANA timezone'),
        address: z.string().nullable().optional(),
        settings_json: SiteSettingsSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { site_id, ...rest } = input

      const { data, error } = await ctx.supabase
        .from('site')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', site_id)
        .select('id, name, timezone, settings_json, updated_at')
        .single()

      assertNoError(error, 'updateSiteSettings')

      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' })
      }

      return data as {
        id: string
        name: string
        timezone: string
        settings_json: Record<string, unknown>
        updated_at: string
      }
    }),

  // -------------------------------------------------------------------------
  // listDepartments
  // -------------------------------------------------------------------------
  listDepartments: viewerProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('department')
        .select('id, name, code, color, site_id')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)
        .eq('status', 'active')
        .order('name')
      assertNoError(error, 'listDepartments')
      const deptIds = (data ?? []).map((d) => (d as Record<string, unknown>).id as string)
      let processCounts: Record<string, number> = {}
      if (deptIds.length > 0) {
        const { data: counts, error: countErr } = await admin
          .from('process')
          .select('department_id')
          .eq('organization_id', ctx.organizationId)
          .eq('is_active', true)
          .in('department_id', deptIds)
        assertNoError(countErr, 'listDepartments:counts')
        processCounts = (counts ?? []).reduce((acc, row) => {
          const deptId = (row as Record<string, unknown>).department_id as string
          acc[deptId] = (acc[deptId] ?? 0) + 1
          return acc
        }, {} as Record<string, number>)
      }
      return (data ?? []).map((d) => {
        const dept = d as Record<string, unknown>
        return {
          id: dept.id as string,
          name: dept.name as string,
          code: dept.code as string,
          color: (dept.color as string) ?? 'indigo',
          site_id: dept.site_id as string,
          process_count: processCounts[dept.id as string] ?? 0,
        }
      })
    }),

  // -------------------------------------------------------------------------
  // upsertDepartment
  // -------------------------------------------------------------------------
  upsertDepartment: managerProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      site_id: z.string().uuid(),
      color: z.string().default('indigo'),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const baseCode = input.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 16)
      const code = input.id ? baseCode : `${baseCode}_${Date.now().toString(36).slice(-4)}`.substring(0, 20)
      const row = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name, code, site_id: input.site_id, color: input.color,
        organization_id: ctx.organizationId,
      }
      const { data, error } = await admin.from('department').upsert(row, { onConflict: 'id' }).select('id, name, code, color, site_id').single()
      assertNoError(error, 'upsertDepartment')
      if (!data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Department upsert returned no data' })
      return data as { id: string; name: string; code: string; color: string; site_id: string }
    }),

  // -------------------------------------------------------------------------
  // deleteDepartment
  // -------------------------------------------------------------------------
  deleteDepartment: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { count, error: countErr } = await admin.from('process').select('id', { count: 'exact', head: true }).eq('department_id', input.id).eq('is_active', true)
      assertNoError(countErr, 'deleteDepartment:checkProcesses')
      if (count && count > 0) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `Cannot delete: department has ${count} active process(es). Remove or reassign them first.` })
      const { error } = await admin.from('department').update({ status: 'inactive', updated_at: new Date().toISOString() }).eq('id', input.id).eq('organization_id', ctx.organizationId)
      assertNoError(error, 'deleteDepartment')
      return { deleted: true }
    }),

  // -------------------------------------------------------------------------
  // listProcesses
  // -------------------------------------------------------------------------
  listProcesses: viewerProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data: depts, error: deptErr } = await admin.from('department').select('id').eq('site_id', input.site_id).eq('organization_id', ctx.organizationId)
      assertNoError(deptErr, 'listProcesses:depts')
      const deptIds = (depts ?? []).map((d) => (d as Record<string, unknown>).id as string)
      if (deptIds.length === 0) return []
      const { data, error } = await admin
        .from('process')
        .select('id, name, code, unit_of_measure, norm_uph, department_id, process_type, support_type, parent_process_id, support_ratio_self, support_ratio_parent, fixed_headcount, priority, min_skill_level, certifications_required, conversion_input_uom, conversion_output_qty, restrict_to_trained, min_staffing, max_staffing, frequency_type, frequency_days, frequency_count, duration_type, duration_hours')
        .eq('organization_id', ctx.organizationId)
        .eq('is_active', true)
        .in('department_id', deptIds)
        .order('name')
      assertNoError(error, 'listProcesses')
      return (data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: p.name as string,
        code: p.code as string,
        unit_of_measure: (p.unit_of_measure as string) ?? '',
        norm_uph: (p.norm_uph as number) ?? 0,
        department_id: p.department_id as string,
        process_type: (p.process_type as string) ?? 'productive',
        support_type: (p.support_type as string) ?? null,
        parent_process_id: (p.parent_process_id as string) ?? null,
        support_ratio_self: (p.support_ratio_self as number) ?? 1,
        support_ratio_parent: (p.support_ratio_parent as number) ?? 1,
        fixed_headcount: (p.fixed_headcount as number) ?? null,
        priority: (p.priority as string) ?? 'important',
        min_skill_level: (p.min_skill_level as number) ?? 1,
        certifications_required: (p.certifications_required as string[]) ?? [],
        conversion_input_uom: (p.conversion_input_uom as string) ?? null,
        conversion_output_qty: (p.conversion_output_qty as number) ?? null,
        restrict_to_trained: (p.restrict_to_trained as boolean) ?? false,
        min_staffing: (p.min_staffing as number) ?? null,
        max_staffing: (p.max_staffing as number) ?? null,
        frequency_type: (p.frequency_type as string) ?? 'daily',
        frequency_days: (p.frequency_days as number[]) ?? null,
        frequency_count: (p.frequency_count as number) ?? null,
        duration_type: (p.duration_type as string) ?? 'full_shift',
        duration_hours: (p.duration_hours as number) ?? null,
      }))
    }),

  // -------------------------------------------------------------------------
  // upsertProcess
  // -------------------------------------------------------------------------
  upsertProcess: managerProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      department_id: z.string().uuid(),
      process_type: z.enum(['productive', 'supportive']).default('productive'),
      // Productive fields
      unit_of_measure: z.string().optional(),
      norm_uph: z.number().nonnegative().optional(),
      conversion_input_uom: z.string().nullable().optional(),
      conversion_output_qty: z.number().nullable().optional(),
      // Supportive fields
      support_type: z.enum(['linked', 'standalone']).nullable().optional(),
      parent_process_id: z.string().uuid().nullable().optional(),
      support_ratio_self: z.number().int().positive().optional(),
      support_ratio_parent: z.number().int().positive().optional(),
      fixed_headcount: z.number().int().positive().nullable().optional(),
      // Common fields
      priority: z.enum(['critical', 'important', 'flexible']).default('important'),
      min_skill_level: z.number().int().min(1).max(5).default(1),
      certifications_required: z.array(z.string()).default([]),
      restrict_to_trained: z.boolean().default(false),
      min_staffing: z.number().int().nonnegative().nullable().optional(),
      max_staffing: z.number().int().nonnegative().nullable().optional(),
      frequency_type: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).default('daily'),
      frequency_days: z.array(z.number()).nullable().optional(),
      frequency_count: z.number().int().positive().nullable().optional(),
      duration_type: z.enum(['full_shift', 'hours']).default('full_shift'),
      duration_hours: z.number().positive().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const code = input.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 30)
      const row = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        code,
        department_id: input.department_id,
        organization_id: ctx.organizationId,
        category: input.process_type === 'supportive' ? 'support' : 'inbound',
        applicable_site_types: ['warehouse'],
        process_type: input.process_type,
        unit_of_measure: input.unit_of_measure ?? 'units',
        norm_uph: input.norm_uph ?? 0,
        conversion_input_uom: input.conversion_input_uom ?? null,
        conversion_output_qty: input.conversion_output_qty ?? null,
        support_type: input.support_type ?? null,
        parent_process_id: input.parent_process_id ?? null,
        support_ratio_self: input.support_ratio_self ?? 1,
        support_ratio_parent: input.support_ratio_parent ?? 1,
        fixed_headcount: input.fixed_headcount ?? null,
        priority: input.priority,
        min_skill_level: input.min_skill_level,
        certifications_required: input.certifications_required,
        restrict_to_trained: input.restrict_to_trained,
        min_staffing: input.min_staffing ?? null,
        max_staffing: input.max_staffing ?? null,
        frequency_type: input.frequency_type,
        frequency_days: input.frequency_days ?? null,
        frequency_count: input.frequency_count ?? null,
        duration_type: input.duration_type,
        duration_hours: input.duration_hours ?? null,
      }
      const { data, error } = await admin.from('process').upsert(row, { onConflict: 'id' })
        .select('id, name, code, unit_of_measure, norm_uph, department_id, process_type, priority')
        .single()
      assertNoError(error, 'upsertProcess')
      if (!data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Process upsert returned no data' })
      return data as { id: string; name: string; code: string; unit_of_measure: string; norm_uph: number; department_id: string; process_type: string; priority: string }
    }),

  // -------------------------------------------------------------------------
  // deleteProcess
  // -------------------------------------------------------------------------
  deleteProcess: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { count: skillCount, error: skillErr } = await admin.from('employee_skill').select('id', { count: 'exact', head: true }).eq('process_id', input.id)
      assertNoError(skillErr, 'deleteProcess:checkSkills')
      const { count: assignCount, error: assignErr } = await admin.from('shift_assignment').select('id', { count: 'exact', head: true }).eq('process_id', input.id)
      assertNoError(assignErr, 'deleteProcess:checkAssignments')
      const total = (skillCount ?? 0) + (assignCount ?? 0)
      if (total > 0) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: `Cannot delete: ${skillCount ?? 0} employee skill(s) and ${assignCount ?? 0} shift assignment(s) reference this process.` })
      const { error } = await admin.from('process').delete().eq('id', input.id).eq('organization_id', ctx.organizationId)
      assertNoError(error, 'deleteProcess')
      return { deleted: true }
    }),

  // -------------------------------------------------------------------------
  // listShifts
  // -------------------------------------------------------------------------
  listShifts: viewerProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('shift_pattern')
        .select('id, name, code, start_time, end_time, duration_hours, days_of_week, break_rules_json, is_overnight, shift_type, color_hex')
        .eq('organization_id', ctx.organizationId)
        .or(`site_id.eq.${input.site_id},site_id.is.null`)
        .eq('is_active', true)
        .order('start_time')
      assertNoError(error, 'listShifts')
      return (data ?? []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        name: s.name as string,
        code: s.code as string,
        start_time: s.start_time as string,
        end_time: s.end_time as string,
        duration_hours: s.duration_hours as number,
        days_of_week: s.days_of_week as number[],
        break_rules_json: (s.break_rules_json ?? {}) as Record<string, unknown>,
        is_overnight: s.is_overnight as boolean,
        shift_type: s.shift_type as string,
        color_hex: (s.color_hex as string) ?? null,
      }))
    }),

  // -------------------------------------------------------------------------
  // upsertShift
  // -------------------------------------------------------------------------
  upsertShift: managerProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      site_id: z.string().uuid(),
      start_time: z.string(),
      end_time: z.string(),
      days_of_week: z.array(z.number()),
      break_rules_json: z.object({
        rules: z.array(z.object({
          start_time: z.string(),
          end_time: z.string(),
          include_ramp: z.boolean().optional(),
          ramp_down_minutes: z.number().optional(),
          ramp_up_minutes: z.number().optional(),
          staggered: z.boolean().optional(),
          stagger_groups: z.number().optional(),
        })),
      }),
      is_overnight: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const code = input.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 20)

      const [sh, sm] = input.start_time.split(':')
      const [eh, em] = input.end_time.split(':')
      const startHours = parseInt(sh ?? '0', 10) + parseInt(sm ?? '0', 10) / 60
      const endHours = parseInt(eh ?? '0', 10) + parseInt(em ?? '0', 10) / 60
      const isOvernight = input.is_overnight ?? endHours < startHours
      const duration_hours = isOvernight
        ? (24 - startHours) + endHours
        : endHours - startHours

      const row = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        code,
        site_id: input.site_id,
        start_time: input.start_time,
        end_time: input.end_time,
        days_of_week: input.days_of_week,
        break_rules_json: input.break_rules_json,
        is_overnight: isOvernight,
        duration_hours,
        paid_hours: duration_hours,
        shift_type: 'regular',
        organization_id: ctx.organizationId,
      }
      const { data, error } = await admin.from('shift_pattern').upsert(row, { onConflict: 'id' }).select().single()
      assertNoError(error, 'upsertShift')
      if (!data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Shift upsert returned no data' })
      return data as Record<string, unknown>
    }),

  // -------------------------------------------------------------------------
  // deleteShift
  // -------------------------------------------------------------------------
  deleteShift: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { count, error: countErr } = await admin
        .from('rotation_entry')
        .select('id', { count: 'exact', head: true })
        .eq('shift_pattern_id', input.id)
      assertNoError(countErr, 'deleteShift:checkRotation')
      if (count && count > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete: shift is referenced by ${count} rotation entry/entries. Remove them first.`,
        })
      }
      const { error } = await admin.from('shift_pattern').delete().eq('id', input.id).eq('organization_id', ctx.organizationId)
      assertNoError(error, 'deleteShift')
      return { deleted: true }
    }),

  // -------------------------------------------------------------------------
  // listCrews
  // -------------------------------------------------------------------------
  listCrews: viewerProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('crew')
        .select('id, name, code, color')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)
        .eq('is_active', true)
        .order('name')
      assertNoError(error, 'listCrews')
      const crewIds = (data ?? []).map((c: Record<string, unknown>) => c.id as string)
      let memberCounts: Record<string, number> = {}
      if (crewIds.length > 0) {
        const { data: empRows, error: empErr } = await admin
          .from('employee')
          .select('crew_id')
          .in('crew_id', crewIds)
        assertNoError(empErr, 'listCrews:memberCounts')
        memberCounts = (empRows ?? []).reduce((acc, row) => {
          const cid = (row as Record<string, unknown>).crew_id as string
          acc[cid] = (acc[cid] ?? 0) + 1
          return acc
        }, {} as Record<string, number>)
      }
      return (data ?? []).map((c: Record<string, unknown>) => ({
        id: c.id as string,
        name: c.name as string,
        code: c.code as string,
        color: (c.color as string) ?? 'indigo',
        member_count: memberCounts[c.id as string] ?? 0,
      }))
    }),

  // -------------------------------------------------------------------------
  // upsertCrew
  // -------------------------------------------------------------------------
  upsertCrew: managerProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      site_id: z.string().uuid(),
      color: z.string().default('indigo'),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const baseCode = input.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 16)
      const code = input.id ? baseCode : `${baseCode}_${Date.now().toString(36).slice(-4)}`.substring(0, 20)
      const row = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        code,
        site_id: input.site_id,
        color: input.color,
        organization_id: ctx.organizationId,
      }
      const { data, error } = await admin.from('crew').upsert(row, { onConflict: 'id' }).select('id, name, code, color, site_id').single()
      assertNoError(error, 'upsertCrew')
      if (!data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Crew upsert returned no data' })
      return data as { id: string; name: string; code: string; color: string; site_id: string }
    }),

  // -------------------------------------------------------------------------
  // deleteCrew
  // -------------------------------------------------------------------------
  deleteCrew: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const [empCount, rotCount] = await Promise.all([
        admin.from('employee').select('id', { count: 'exact', head: true }).eq('crew_id', input.id),
        admin.from('rotation_entry').select('id', { count: 'exact', head: true }).eq('crew_id', input.id),
      ])
      assertNoError(empCount.error, 'deleteCrew:checkEmployees')
      assertNoError(rotCount.error, 'deleteCrew:checkRotation')
      const empN = empCount.count ?? 0
      const rotN = rotCount.count ?? 0
      if (empN > 0 || rotN > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete: crew is referenced by ${empN} employee(s) and ${rotN} rotation entry/entries. Remove them first.`,
        })
      }
      const { error } = await admin.from('crew').delete().eq('id', input.id).eq('organization_id', ctx.organizationId)
      assertNoError(error, 'deleteCrew')
      return { deleted: true }
    }),

  // -------------------------------------------------------------------------
  // getRotation
  // -------------------------------------------------------------------------
  getRotation: viewerProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data: schedule, error: schedErr } = await admin
        .from('rotation_schedule')
        .select('id, cycle_weeks, rotation_start_date')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle()
      assertNoError(schedErr, 'getRotation:schedule')
      if (!schedule) {
        return { cycle_weeks: 2, rotation_start_date: null as string | null, entries: [] as { crew_id: string; shift_pattern_id: string; week_number: number }[] }
      }
      const { data: entries, error: entErr } = await admin
        .from('rotation_entry')
        .select('crew_id, shift_pattern_id, week_number')
        .eq('rotation_schedule_id', schedule.id as string)
      assertNoError(entErr, 'getRotation:entries')
      return {
        id: schedule.id as string,
        cycle_weeks: schedule.cycle_weeks as number,
        rotation_start_date: (schedule.rotation_start_date as string) ?? null,
        entries: (entries ?? []).map((e: Record<string, unknown>) => ({
          crew_id: e.crew_id as string,
          shift_pattern_id: e.shift_pattern_id as string,
          week_number: e.week_number as number,
        })),
      }
    }),

  // -------------------------------------------------------------------------
  // saveRotation
  // -------------------------------------------------------------------------
  saveRotation: managerProcedure
    .input(z.object({
      site_id: z.string().uuid(),
      cycle_weeks: z.number().int().min(1).max(12),
      rotation_start_date: z.string().nullable().optional(),
      entries: z.array(z.object({
        crew_id: z.string().uuid(),
        shift_pattern_id: z.string().uuid(),
        week_number: z.number().int(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Try to find existing schedule for this site
      const { data: existing, error: fetchErr } = await admin
        .from('rotation_schedule')
        .select('id')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle()
      assertNoError(fetchErr, 'saveRotation:fetch')

      let scheduleId: string

      if (existing) {
        // Update existing
        const { data: updated, error: updErr } = await admin
          .from('rotation_schedule')
          .update({ cycle_weeks: input.cycle_weeks, rotation_start_date: input.rotation_start_date ?? null, updated_at: new Date().toISOString() })
          .eq('id', existing.id as string)
          .select('id')
          .single()
        assertNoError(updErr, 'saveRotation:update')
        scheduleId = (updated as Record<string, unknown>).id as string
      } else {
        // Insert new
        const { data: inserted, error: insErr } = await admin
          .from('rotation_schedule')
          .insert({
            site_id: input.site_id,
            organization_id: ctx.organizationId,
            cycle_weeks: input.cycle_weeks,
            rotation_start_date: input.rotation_start_date ?? null,
          })
          .select('id')
          .single()
        assertNoError(insErr, 'saveRotation:insert')
        if (!inserted) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Rotation schedule insert returned no data' })
        scheduleId = (inserted as Record<string, unknown>).id as string
      }

      // Delete all existing entries for this schedule
      const { error: delErr } = await admin
        .from('rotation_entry')
        .delete()
        .eq('rotation_schedule_id', scheduleId)
      assertNoError(delErr, 'saveRotation:deleteEntries')

      // Insert new entries
      if (input.entries.length > 0) {
        const rows = input.entries.map((e) => ({
          rotation_schedule_id: scheduleId,
          crew_id: e.crew_id,
          shift_pattern_id: e.shift_pattern_id,
          week_number: e.week_number,
        }))
        const { error: insertErr } = await admin
          .from('rotation_entry')
          .insert(rows)
        assertNoError(insertErr, 'saveRotation:insertEntries')
      }

      return { saved: true }
    }),

  // -------------------------------------------------------------------------
  // listRoles
  // -------------------------------------------------------------------------
  listRoles: viewerProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('job_role')
        .select('id, name, code, parent_role_id, role_type, productive_pct, follows_shifts, custom_start_time, custom_end_time, custom_days, min_per_shift, department_id')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)
        .eq('is_active', true)
        .order('name')
      assertNoError(error, 'listRoles')
      const roleIds = (data ?? []).map((r: Record<string, unknown>) => r.id as string)
      let empCounts: Record<string, number> = {}
      if (roleIds.length > 0) {
        const { data: empRows, error: empErr } = await admin
          .from('employee')
          .select('job_role_id')
          .in('job_role_id', roleIds)
        assertNoError(empErr, 'listRoles:empCounts')
        empCounts = (empRows ?? []).reduce((acc, row) => {
          const rid = (row as Record<string, unknown>).job_role_id as string
          acc[rid] = (acc[rid] ?? 0) + 1
          return acc
        }, {} as Record<string, number>)
      }
      return (data ?? []).map((r: Record<string, unknown>) => ({
        id: r.id as string,
        name: r.name as string,
        code: r.code as string,
        parent_role_id: (r.parent_role_id as string) ?? null,
        role_type: r.role_type as string,
        productive_pct: r.productive_pct as number,
        follows_shifts: r.follows_shifts as boolean,
        custom_start_time: (r.custom_start_time as string) ?? null,
        custom_end_time: (r.custom_end_time as string) ?? null,
        custom_days: (r.custom_days as number[]) ?? null,
        min_per_shift: (r.min_per_shift as number) ?? null,
        department_id: (r.department_id as string) ?? null,
        employee_count: empCounts[r.id as string] ?? 0,
      }))
    }),

  // -------------------------------------------------------------------------
  // upsertRole
  // -------------------------------------------------------------------------
  upsertRole: managerProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      site_id: z.string().uuid(),
      parent_role_id: z.string().uuid().nullable().optional(),
      role_type: z.enum(['productive', 'leadership', 'overhead']),
      productive_pct: z.number().min(0).max(100),
      follows_shifts: z.boolean(),
      custom_start_time: z.string().nullable().optional(),
      custom_end_time: z.string().nullable().optional(),
      custom_days: z.array(z.number()).nullable().optional(),
      min_per_shift: z.number().nullable().optional(),
      department_id: z.string().uuid().nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const baseCode = input.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 16)
      const code = input.id ? baseCode : `${baseCode}_${Date.now().toString(36).slice(-4)}`.substring(0, 20)
      const row = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        code,
        site_id: input.site_id,
        organization_id: ctx.organizationId,
        parent_role_id: input.parent_role_id ?? null,
        role_type: input.role_type,
        productive_pct: input.productive_pct,
        follows_shifts: input.follows_shifts,
        custom_start_time: input.custom_start_time ?? null,
        custom_end_time: input.custom_end_time ?? null,
        custom_days: input.custom_days ?? null,
        min_per_shift: input.min_per_shift ?? null,
        department_id: input.department_id ?? null,
      }
      const { data, error } = await admin.from('job_role').upsert(row, { onConflict: 'id' })
        .select('id, name, code, role_type, productive_pct')
        .single()
      assertNoError(error, 'upsertRole')
      if (!data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Role upsert returned no data' })
      return data as { id: string; name: string; code: string; role_type: string; productive_pct: number }
    }),

  // -------------------------------------------------------------------------
  // deleteRole
  // -------------------------------------------------------------------------
  deleteRole: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { count, error: countErr } = await admin
        .from('employee')
        .select('id', { count: 'exact', head: true })
        .eq('job_role_id', input.id)
      assertNoError(countErr, 'deleteRole:checkEmployees')
      if (count && count > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete: ${count} employee(s) are assigned to this role. Reassign them first.`,
        })
      }
      const { error } = await admin.from('job_role').delete().eq('id', input.id).eq('organization_id', ctx.organizationId)
      assertNoError(error, 'deleteRole')
      return { deleted: true }
    }),

  // -------------------------------------------------------------------------
  // listEquipment
  // -------------------------------------------------------------------------
  listEquipment: viewerProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('equipment')
        .select('id, name, code, category, quantity, description')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)
        .eq('is_active', true)
        .order('name')
      assertNoError(error, 'listEquipment')
      return (data ?? []).map((e: Record<string, unknown>) => ({
        id: e.id as string,
        name: e.name as string,
        code: e.code as string,
        category: (e.category as string) ?? 'mhe',
        quantity: (e.quantity as number) ?? 0,
        description: (e.description as string) ?? null,
      }))
    }),

  // -------------------------------------------------------------------------
  // upsertEquipment
  // -------------------------------------------------------------------------
  upsertEquipment: managerProcedure
    .input(z.object({
      id: z.string().uuid().optional(),
      name: z.string().min(1),
      site_id: z.string().uuid(),
      category: z.string().default('mhe'),
      quantity: z.number().int().nonnegative(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const baseCode = input.name.toUpperCase().replace(/[^A-Z0-9\s]/g, '').replace(/\s+/g, '_').substring(0, 16)
      const code = input.id ? baseCode : `${baseCode}_${Date.now().toString(36).slice(-4)}`.substring(0, 20)
      const row = {
        ...(input.id ? { id: input.id } : {}),
        name: input.name,
        code,
        site_id: input.site_id,
        category: input.category,
        quantity: input.quantity,
        description: input.description ?? null,
        organization_id: ctx.organizationId,
      }
      const { data, error } = await admin.from('equipment').upsert(row, { onConflict: 'id' })
        .select('id, name, code, category, quantity, description')
        .single()
      assertNoError(error, 'upsertEquipment')
      if (!data) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Equipment upsert returned no data' })
      return data as { id: string; name: string; code: string; category: string; quantity: number; description: string | null }
    }),

  // -------------------------------------------------------------------------
  // deleteEquipment
  // -------------------------------------------------------------------------
  deleteEquipment: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { count, error: countErr } = await admin
        .from('process_equipment')
        .select('id', { count: 'exact', head: true })
        .eq('equipment_id', input.id)
      assertNoError(countErr, 'deleteEquipment:checkProcesses')
      if (count && count > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete: equipment is referenced by ${count} process(es). Remove the equipment from those processes first.`,
        })
      }
      const { error } = await admin.from('equipment').delete().eq('id', input.id).eq('organization_id', ctx.organizationId)
      assertNoError(error, 'deleteEquipment')
      return { deleted: true }
    }),

  // -------------------------------------------------------------------------
  // listProcessEquipment
  // -------------------------------------------------------------------------
  listProcessEquipment: viewerProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      // Get all department IDs for this site
      const { data: depts, error: deptErr } = await admin
        .from('department')
        .select('id')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)
      assertNoError(deptErr, 'listProcessEquipment:depts')
      const deptIds = (depts ?? []).map((d) => (d as Record<string, unknown>).id as string)
      if (deptIds.length === 0) return []
      // Get process IDs for this site
      const { data: procs, error: procErr } = await admin
        .from('process')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('is_active', true)
        .in('department_id', deptIds)
      assertNoError(procErr, 'listProcessEquipment:procs')
      const procIds = (procs ?? []).map((p) => (p as Record<string, unknown>).id as string)
      if (procIds.length === 0) return []
      // Get process_equipment records
      const { data, error } = await admin
        .from('process_equipment')
        .select('id, process_id, equipment_id, units_per_person')
        .in('process_id', procIds)
      assertNoError(error, 'listProcessEquipment')
      return (data ?? []).map((pe: Record<string, unknown>) => ({
        id: pe.id as string,
        process_id: pe.process_id as string,
        equipment_id: pe.equipment_id as string,
        units_per_person: (pe.units_per_person as number) ?? 1,
      }))
    }),

  // -------------------------------------------------------------------------
  // setProcessEquipment
  // -------------------------------------------------------------------------
  setProcessEquipment: managerProcedure
    .input(z.object({
      process_id: z.string().uuid(),
      equipment: z.array(z.object({
        equipment_id: z.string().uuid(),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { error: delErr } = await admin
        .from('process_equipment')
        .delete()
        .eq('process_id', input.process_id)
      assertNoError(delErr, 'setProcessEquipment:delete')
      if (input.equipment.length > 0) {
        const rows = input.equipment.map((e) => ({
          process_id: input.process_id,
          equipment_id: e.equipment_id,
          units_per_person: 1,
        }))
        const { error: insertErr } = await admin
          .from('process_equipment')
          .insert(rows)
        assertNoError(insertErr, 'setProcessEquipment:insert')
      }
      return { saved: true }
    }),
})
