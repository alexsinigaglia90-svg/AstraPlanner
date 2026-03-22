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
        .select('id, name, code, unit_of_measure, norm_uph, department_id, process_type, support_type, parent_process_id, support_ratio_self, support_ratio_parent, fixed_headcount, priority, min_skill_level, certifications_required, conversion_input_uom, conversion_output_qty')
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
        category: 'support',
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
})
