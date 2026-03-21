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
        'id, name, slug, subscription_tier, settings_json, created_at, updated_at',
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
      .select('id, name, timezone, address, settings_json, is_active, created_at')
      .order('name')

    assertNoError(error, 'listSites')

    return (data ?? []) as Array<{
      id: string
      name: string
      timezone: string
      address: string | null
      settings_json: Record<string, unknown>
      is_active: boolean
      created_at: string
    }>
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
          'id, name, timezone, address, settings_json, is_active, created_at, updated_at',
        )
        .eq('id', input.id)
        .single()

      assertNoError(error, 'getSite')

      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Site not found' })
      }

      return data as {
        id: string
        name: string
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
    .input(
      z.object({
        site_id: z.string().uuid().describe('Site to list departments for'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('department')
        .select('id, name, parent_department_id, site_id')
        .eq('site_id', input.site_id)
        .order('name')

      assertNoError(error, 'listDepartments')

      return (data ?? []) as Array<{
        id: string
        name: string
        parent_department_id: string | null
        site_id: string
      }>
    }),

  // -------------------------------------------------------------------------
  // listProcesses
  // -------------------------------------------------------------------------
  listProcesses: viewerProcedure
    .input(
      z.object({
        site_id: z.string().uuid().describe('Site context (required by caller)'),
        department_id: z.string().uuid().optional().describe('Filter by department'),
      }),
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('process')
        .select(
          `id, name, unit_of_measure, department_id, min_skill_level, hazard_level,
           requires_certification, is_active,
           productivity_standard(skill_level, units_per_hour, site_id)`,
        )
        .eq('is_active', true)

      if (input.department_id) {
        query = query.eq('department_id', input.department_id)
      }

      const { data, error } = await query.order('name')

      assertNoError(error, 'listProcesses')

      return (data ?? []).map((p: Record<string, unknown>) => ({
        id: p.id,
        name: p.name,
        unit_of_measure: p.unit_of_measure,
        department_id: p.department_id ?? null,
        min_skill_level: p.min_skill_level,
        hazard_level: p.hazard_level,
        requires_certification: p.requires_certification,
        is_active: p.is_active,
        productivity_standards: (
          (p.productivity_standard as Array<{
            skill_level: number
            units_per_hour: number
            site_id: string | null
          }>) ?? []
        ),
      }))
    }),

  // -------------------------------------------------------------------------
  // upsertProcess
  // -------------------------------------------------------------------------
  upsertProcess: managerProcedure
    .input(
      z
        .object({
          id: z.string().uuid().optional().describe('Omit to create'),
          name: z.string().min(1),
          unit_of_measure: z.string().min(1),
          department_id: z.string().uuid().nullable().optional(),
          min_skill_level: z.number().int().min(1).max(5).default(1),
          hazard_level: z.number().int().min(0).default(0),
          requires_certification: z.boolean().optional(),
          productivity_standards: z
            .array(
              z.object({
                skill_level: z.number().int().min(1).max(5),
                units_per_hour: z.number().positive(),
                site_id: z.string().uuid().nullable().optional(),
              }),
            )
            .length(5, 'Must include all 5 proficiency levels')
            .describe('Productivity standards for all 5 skill levels'),
        })
        .refine(
          (v) =>
            v.productivity_standards.every((s) => s.units_per_hour > 0),
          { message: 'units_per_hour must be > 0 for each standard' },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const { productivity_standards, ...processData } = input

      // Upsert the process record
      const { data: process, error: processError } = await ctx.supabase
        .from('process')
        .upsert(processData)
        .select('id, name, updated_at')
        .single()

      assertNoError(processError, 'upsertProcess')

      if (!process) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Process upsert returned no data',
        })
      }

      // Replace productivity standards
      if (productivity_standards.length > 0) {
        const standards = productivity_standards.map((s) => ({
          ...s,
          process_id: process.id,
        }))

        const { error: stdError } = await ctx.supabase
          .from('productivity_standard')
          .upsert(standards, { onConflict: 'process_id,skill_level,site_id' })

        assertNoError(stdError, 'upsertProcess.productivity_standards')
      }

      return process as { id: string; name: string; updated_at: string }
    }),
})
