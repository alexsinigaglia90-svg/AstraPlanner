/**
 * workforce router — Employee Management
 * Source of truth: docs/api-contracts.md §workforce
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import {
  router,
  viewerProcedure,
  managerProcedure,
  plannerProcedure,
} from '../trpc'
import {
  PaginationInput,
  buildPaginatedResult,
  ContractTypeSchema,
  EmployeeStatusSchema,
  OverrideTypeSchema,
  OverrideStatusSchema,
} from '../../types/api'

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

export const workforceRouter = router({
  // -------------------------------------------------------------------------
  // listEmployees  (planner+)
  // -------------------------------------------------------------------------
  listEmployees: plannerProcedure
    .input(
      PaginationInput.extend({
        site_id: z.string().uuid().describe('Home site to filter by'),
        status: EmployeeStatusSchema.optional(),
        search: z
          .string()
          .optional()
          .describe('Searches employee_number, first_name, last_name'),
        department_id: z.string().uuid().optional(),
        process_id: z
          .string()
          .uuid()
          .optional()
          .describe('Filter to employees skilled in this process'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { site_id, status, search, department_id, process_id, cursor, limit } =
        input

      // Base query — fetch one extra to detect next page
      let query = ctx.supabase
        .from('employee')
        .select(
          `id, employee_number, first_name, last_name, contract_type,
           weekly_hours_contracted, home_site_id, status,
           is_multi_site_eligible,
           employee_skill(count)`,
          { count: 'exact' },
        )
        .eq('home_site_id', site_id)
        .order('id')
        .limit(limit + 1)

      if (status) query = query.eq('status', status)
      if (department_id) query = query.eq('department_id', department_id)
      if (cursor) query = query.gt('id', cursor)

      // Search across three fields
      if (search) {
        const term = `%${search}%`
        query = query.or(
          `employee_number.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`,
        )
      }

      // Filter by process skill if requested
      if (process_id) {
        // Use a subquery via RPC or filter with inner join through employee_skill
        query = query.eq('employee_skill.process_id', process_id)
      }

      const { data, error } = await query

      assertNoError(error, 'listEmployees')

      const rows = (data ?? []).map((e: Record<string, unknown>) => ({
        id: e.id as string,
        employee_number: e.employee_number as string,
        first_name: e.first_name as string,
        last_name: e.last_name as string,
        contract_type: e.contract_type as string,
        weekly_hours_contracted: e.weekly_hours_contracted as number,
        home_site_id: e.home_site_id as string,
        status: e.status as string,
        is_multi_site_eligible: e.is_multi_site_eligible as boolean,
        skill_count: Array.isArray(e.employee_skill)
          ? (e.employee_skill as unknown[]).length
          : 0,
      }))

      return buildPaginatedResult(rows, limit, (r) => r.id)
    }),

  // -------------------------------------------------------------------------
  // getEmployee  (viewer+, employee self)
  // -------------------------------------------------------------------------
  getEmployee: viewerProcedure
    .input(z.object({ id: z.string().uuid().describe('Employee ID') }))
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('employee')
        .select(
          `id, employee_number, first_name, last_name, email, contract_type,
           weekly_hours_contracted, hourly_rate, home_site_id, department_id,
           is_multi_site_eligible, status, preferences_json,
           employee_skill(
             id, process_id, proficiency_level,
             certification_date, expiry_date, last_practiced_date,
             process(name)
           ),
           employee_availability_override(
             id, start_date, end_date, start_time, end_time,
             override_type, status, reason
           )`,
        )
        .eq('id', input.id)
        .single()

      assertNoError(error, 'getEmployee')

      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' })
      }

      const employee = data as Record<string, unknown>

      // Normalise skill join
      const skills = (
        (employee.employee_skill as Array<Record<string, unknown>>) ?? []
      ).map((s) => ({
        id: s.id as string,
        process_id: s.process_id as string,
        process_name: (s.process as Record<string, unknown> | null)?.name as string ?? '',
        proficiency_level: s.proficiency_level as number,
        certification_date: (s.certification_date as string) ?? null,
        expiry_date: (s.expiry_date as string) ?? null,
        last_practiced_date: (s.last_practiced_date as string) ?? null,
      }))

      const availability_overrides = (
        (employee.employee_availability_override as Array<Record<string, unknown>>) ?? []
      ).map((o) => ({
        id: o.id as string,
        start_date: o.start_date as string,
        end_date: o.end_date as string,
        start_time: (o.start_time as string) ?? null,
        end_time: (o.end_time as string) ?? null,
        override_type: o.override_type as string,
        status: o.status as string,
        reason: (o.reason as string) ?? null,
      }))

      return {
        id: employee.id as string,
        employee_number: employee.employee_number as string,
        first_name: employee.first_name as string,
        last_name: employee.last_name as string,
        email: (employee.email as string) ?? null,
        contract_type: employee.contract_type as string,
        weekly_hours_contracted: employee.weekly_hours_contracted as number,
        hourly_rate: employee.hourly_rate as number,
        home_site_id: employee.home_site_id as string,
        department_id: (employee.department_id as string) ?? null,
        is_multi_site_eligible: employee.is_multi_site_eligible as boolean,
        status: employee.status as string,
        preferences_json: (employee.preferences_json as Record<string, unknown>) ?? {},
        skills,
        availability_overrides,
      }
    }),

  // -------------------------------------------------------------------------
  // upsertEmployee  (manager+)
  // -------------------------------------------------------------------------
  upsertEmployee: managerProcedure
    .input(
      z.object({
        id: z.string().uuid().optional().describe('Omit for create'),
        employee_number: z.string().min(1),
        first_name: z.string().min(1),
        last_name: z.string().min(1),
        email: z.string().email().nullable().optional(),
        contract_type: ContractTypeSchema,
        weekly_hours_contracted: z.number().positive(),
        hourly_rate: z.number().nonnegative(),
        home_site_id: z.string().uuid(),
        department_id: z.string().uuid().nullable().optional(),
        is_multi_site_eligible: z.boolean().default(false),
        status: EmployeeStatusSchema.default('active'),
        preferences_json: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('employee')
        .upsert(input)
        .select('id, employee_number, first_name, last_name, status, created_at, updated_at')
        .single()

      assertNoError(error, 'upsertEmployee')

      if (!data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Employee upsert returned no data',
        })
      }

      return data as {
        id: string
        employee_number: string
        first_name: string
        last_name: string
        status: string
        created_at: string
        updated_at: string
      }
    }),

  // -------------------------------------------------------------------------
  // updateSkill  (manager+, supervisor)
  // -------------------------------------------------------------------------
  updateSkill: managerProcedure
    .input(
      z.object({
        employee_id: z.string().uuid(),
        process_id: z.string().uuid(),
        proficiency_level: z
          .number()
          .int()
          .min(1)
          .max(5)
          .describe('Skill proficiency level 1-5 per D-03'),
        certification_date: z.string().nullable().optional(),
        expiry_date: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('employee_skill')
        .upsert(
          {
            ...input,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'employee_id,process_id' },
        )
        .select(
          'id, employee_id, process_id, proficiency_level, certification_date, expiry_date, updated_at',
        )
        .single()

      assertNoError(error, 'updateSkill')

      if (!data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Skill upsert returned no data',
        })
      }

      return data as {
        id: string
        employee_id: string
        process_id: string
        proficiency_level: number
        certification_date: string | null
        expiry_date: string | null
        updated_at: string
      }
    }),

  // -------------------------------------------------------------------------
  // createAvailabilityOverride  (planner+)
  // -------------------------------------------------------------------------
  createAvailabilityOverride: plannerProcedure
    .input(
      z
        .object({
          employee_id: z.string().uuid(),
          start_date: z.string().describe('ISO 8601 date'),
          end_date: z.string().describe('ISO 8601 date, >= start_date'),
          start_time: z.string().nullable().optional().describe('TIME, null = full day'),
          end_time: z.string().nullable().optional().describe('TIME, null = full day'),
          override_type: OverrideTypeSchema,
          reason: z.string().optional(),
        })
        .refine((v) => v.end_date >= v.start_date, {
          message: 'end_date must be >= start_date',
          path: ['end_date'],
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('employee_availability_override')
        .insert({
          ...input,
          status: 'planned',
        })
        .select('id, employee_id, start_date, end_date, override_type, status, created_at')
        .single()

      assertNoError(error, 'createAvailabilityOverride')

      if (!data) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Availability override insert returned no data',
        })
      }

      return data as {
        id: string
        employee_id: string
        start_date: string
        end_date: string
        override_type: string
        status: 'planned'
        created_at: string
      }
    }),

  // -------------------------------------------------------------------------
  // updateAvailabilityOverride  (manager+, supervisor)
  // -------------------------------------------------------------------------
  updateAvailabilityOverride: managerProcedure
    .input(
      z
        .object({
          id: z.string().uuid(),
          status: OverrideStatusSchema.optional(),
          start_date: z.string().optional(),
          end_date: z.string().optional(),
          reason: z.string().optional(),
        })
        .refine(
          (v) =>
            !(v.start_date && v.end_date) || v.end_date >= v.start_date,
          {
            message: 'end_date must be >= start_date',
            path: ['end_date'],
          },
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updates } = input

      const { data, error } = await ctx.supabase
        .from('employee_availability_override')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, status, updated_at')
        .single()

      assertNoError(error, 'updateAvailabilityOverride')

      if (!data) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Availability override not found',
        })
      }

      return data as { id: string; status: string; updated_at: string }
    }),
})
