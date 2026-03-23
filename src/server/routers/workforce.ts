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
import { createAdminClient } from '../../lib/supabase/admin'
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
        contract_type: ContractTypeSchema.optional(),
        department_id: z.string().uuid().optional(),
        process_id: z
          .string()
          .uuid()
          .optional()
          .describe('Filter to employees skilled in this process'),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { site_id, status, search, contract_type, department_id, process_id, cursor, limit } =
        input

      // Base query — fetch one extra to detect next page
      let query = ctx.supabase
        .from('employee')
        .select(
          `id, employee_number, first_name, last_name, contract_type,
           weekly_hours_contracted, home_site_id, department_id, crew_id, job_role_id, hourly_rate, status,
           is_multi_site_eligible,
           employee_skill!employee_skill_employee_id_fkey(id)`,
          { count: 'exact' },
        )
        .eq('home_site_id', site_id)
        .order('id')
        .limit(limit + 1)

      if (status) query = query.eq('status', status)
      if (contract_type) query = query.eq('contract_type', contract_type)
      if (department_id) query = query.eq('department_id', department_id)
      if (cursor) query = query.gt('id', cursor)

      // Search across three fields
      if (search) {
        const term = `%${search}%`
        query = query.or(
          `employee_number.ilike.${term},first_name.ilike.${term},last_name.ilike.${term}`,
        )
      }

      // Filter by process skill — not supported without join, skip for now
      // TODO: implement via RPC or separate query if needed

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
        department_id: (e.department_id as string) ?? null,
        crew_id: (e.crew_id as string) ?? null,
        job_role_id: (e.job_role_id as string) ?? null,
        hourly_rate: e.hourly_rate as number,
        skill_count: Array.isArray(e.employee_skill)
          ? (e.employee_skill as Array<{ id: string | null }>).filter(
              (s) => s.id != null,
            ).length
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
      const admin = createAdminClient()

      // Fetch employee, skills, and overrides in parallel
      const [empResult, skillsResult, overridesResult] = await Promise.all([
        admin
          .from('employee')
          .select(
            `id, employee_number, first_name, last_name, email, contract_type,
             weekly_hours_contracted, hourly_rate, home_site_id, department_id, crew_id, job_role_id,
             is_multi_site_eligible, status, preferences_json`,
          )
          .eq('id', input.id)
          .eq('organization_id', ctx.organizationId)
          .single(),
        admin
          .from('employee_skill')
          .select('id, process_id, proficiency_level, certification_date, expiry_date, last_practiced_date, is_primary_skill')
          .eq('employee_id', input.id),
        admin
          .from('employee_availability_override')
          .select('id, start_date, end_date, start_time, end_time, override_type, status, reason')
          .eq('employee_id', input.id),
      ])

      assertNoError(empResult.error, 'getEmployee')

      if (!empResult.data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' })
      }

      const employee = empResult.data as Record<string, unknown>

      const skills = ((skillsResult.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
        id: s.id as string,
        process_id: s.process_id as string,
        process_name: '',
        proficiency_level: s.proficiency_level as number,
        certification_date: (s.certification_date as string) ?? null,
        expiry_date: (s.expiry_date as string) ?? null,
        last_practiced_date: (s.last_practiced_date as string) ?? null,
      }))

      const availability_overrides = ((overridesResult.data ?? []) as Array<Record<string, unknown>>).map((o) => ({
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
        crew_id: (employee.crew_id as string) ?? null,
        job_role_id: (employee.job_role_id as string) ?? null,
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
        crew_id: z.string().uuid().nullable().optional(),
        job_role_id: z.string().uuid().nullable().optional(),
        is_multi_site_eligible: z.boolean().default(false),
        status: EmployeeStatusSchema.default('active'),
        preferences_json: z.record(z.unknown()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Check for duplicate employee_number on create
      if (!input.id) {
        const { count, error: dupErr } = await admin
          .from('employee')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', ctx.organizationId)
          .eq('employee_number', input.employee_number)

        assertNoError(dupErr, 'upsertEmployee:dupCheck')

        if (count && count > 0) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Employee number "${input.employee_number}" already exists`,
          })
        }
      }

      const row = {
        ...input,
        organization_id: ctx.organizationId,
        hire_date: input.id ? undefined : new Date().toISOString().split('T')[0],
      }
      // Remove undefined keys
      const cleanRow = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined))

      const { data, error } = await admin
        .from('employee')
        .upsert(cleanRow)
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
  // bulkImportEmployees  (manager+)
  // -------------------------------------------------------------------------
  bulkImportEmployees: managerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        employees: z
          .array(
            z.object({
              employee_number: z.string().min(1),
              first_name: z.string().min(1),
              last_name: z.string().min(1),
              department: z.string().optional(),
              contract_type: ContractTypeSchema,
              weekly_hours_contracted: z.number().positive(),
              hourly_rate: z.number().nonnegative(),
              shift_id: z.string().uuid().optional(),
              crew_id: z.string().uuid().optional(),
            }),
          )
          .min(1)
          .max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { site_id, employees } = input
      const orgId = ctx.organizationId

      if (!orgId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No organization found for current user',
        })
      }

      // Use admin client to bypass RLS for bulk operations
      // Auth is already verified by managerProcedure
      const admin = createAdminClient()

      // Look up or create departments by name
      const deptNames = [
        ...new Set(
          employees
            .map((e) => e.department?.trim())
            .filter((d): d is string => !!d),
        ),
      ]

      const deptMap = new Map<string, string>()

      if (deptNames.length > 0) {
        const { data: existing, error: deptErr } = await admin
          .from('department')
          .select('id, name')
          .eq('site_id', site_id)
          .eq('organization_id', orgId)

        assertNoError(deptErr, 'bulkImport:fetchDepartments')

        for (const dept of existing ?? []) {
          deptMap.set((dept.name as string).toLowerCase(), dept.id as string)
        }

        const missing = deptNames.filter(
          (n) => !deptMap.has(n.toLowerCase()),
        )
        if (missing.length > 0) {
          const { data: created, error: createErr } = await admin
            .from('department')
            .insert(
              missing.map((name) => ({
                name,
                code: name.substring(0, 20).toUpperCase().replace(/\s+/g, '_'),
                site_id,
                organization_id: orgId,
              })),
            )
            .select('id, name')

          assertNoError(createErr, 'bulkImport:createDepartments')

          for (const dept of created ?? []) {
            deptMap.set((dept.name as string).toLowerCase(), dept.id as string)
          }
        }
      }

      // Build employee rows
      const today = new Date().toISOString().split('T')[0]
      const rows = employees.map((e) => ({
        organization_id: orgId,
        employee_number: e.employee_number,
        first_name: e.first_name,
        last_name: e.last_name,
        contract_type: e.contract_type,
        weekly_hours_contracted: e.weekly_hours_contracted,
        hourly_rate: e.hourly_rate,
        home_site_id: site_id,
        hire_date: today,
        department_id: e.department
          ? deptMap.get(e.department.trim().toLowerCase()) ?? null
          : null,
        crew_id: e.crew_id ?? null,
        status: 'active' as const,
      }))

      const { data, error } = await admin
        .from('employee')
        .upsert(rows, { onConflict: 'organization_id,employee_number' })
        .select('id, employee_number')

      assertNoError(error, 'bulkImportEmployees')

      return {
        imported: (data ?? []).length,
        total: employees.length,
      }
    }),

  // -------------------------------------------------------------------------
  // updateSkill  (manager+, supervisor)
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // listSkillMatrix  (planner+) — all skills for a site
  // -------------------------------------------------------------------------
  listSkillMatrix: plannerProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Get all department IDs for this site
      const { data: depts } = await admin
        .from('department')
        .select('id')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)

      const deptIds = (depts ?? []).map((d) => (d as Record<string, unknown>).id as string)
      if (deptIds.length === 0) return []

      // Get all employee_skill records for employees at this site
      const { data, error } = await admin
        .from('employee_skill')
        .select('id, employee_id, process_id, proficiency_level')
        .eq('organization_id', ctx.organizationId)

      assertNoError(error, 'listSkillMatrix')

      return (data ?? []).map((s: Record<string, unknown>) => ({
        id: s.id as string,
        employee_id: s.employee_id as string,
        process_id: s.process_id as string,
        proficiency_level: s.proficiency_level as number,
      }))
    }),

  // -------------------------------------------------------------------------
  // deleteSkill  (manager+)
  // -------------------------------------------------------------------------
  deleteSkill: managerProcedure
    .input(z.object({ employee_id: z.string().uuid(), process_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { error } = await admin
        .from('employee_skill')
        .delete()
        .eq('employee_id', input.employee_id)
        .eq('process_id', input.process_id)
      assertNoError(error, 'deleteSkill')
      return { deleted: true }
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
          .max(5),
        certification_date: z.string().nullable().optional(),
        expiry_date: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('employee_skill')
        .upsert(
          {
            ...input,
            organization_id: ctx.organizationId,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'organization_id,employee_id,process_id' },
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
  // bulkImportSkills  (manager+)
  // -------------------------------------------------------------------------
  bulkImportSkills: managerProcedure
    .input(
      z.object({
        skills: z
          .array(
            z.object({
              employee_id: z.string().uuid(),
              process_id: z.string().uuid(),
              proficiency_level: z.number().int().min(1).max(5),
            }),
          )
          .min(1)
          .max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const orgId = ctx.organizationId

      const rows = input.skills.map((s) => ({
        organization_id: orgId,
        employee_id: s.employee_id,
        process_id: s.process_id,
        proficiency_level: s.proficiency_level,
        updated_at: new Date().toISOString(),
      }))

      const { error } = await admin
        .from('employee_skill')
        .upsert(rows, { onConflict: 'organization_id,employee_id,process_id' })

      assertNoError(error, 'bulkImportSkills')

      return { imported: rows.length }
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

  // -------------------------------------------------------------------------
  // deleteEmployee  (manager+)
  // -------------------------------------------------------------------------
  deleteEmployee: managerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Check for planning history (shift_assignment records)
      const { count, error: countErr } = await admin
        .from('shift_assignment')
        .select('id', { count: 'exact', head: true })
        .eq('employee_id', input.id)

      assertNoError(countErr, 'deleteEmployee:checkHistory')

      if (count && count > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete: this employee has ${count} shift assignment(s) in planning history. Change their status to "Terminated" instead.`,
        })
      }

      // Safe to delete — no plan history
      const { error } = await admin
        .from('employee')
        .delete()
        .eq('id', input.id)

      assertNoError(error, 'deleteEmployee')

      return { deleted: true }
    }),
})
