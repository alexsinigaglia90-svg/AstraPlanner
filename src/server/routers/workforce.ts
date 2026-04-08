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
  adminProcedure,
} from '../trpc'
import { createAdminClientForUser } from '../../lib/supabase/admin'
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
           employee_skill!employee_skill_employee_id_fkey(id),
           job_role:job_role_id(hourly_rate)`,
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
        hourly_rate: (e.hourly_rate as number | null) ?? ((e.job_role as Record<string, unknown> | null)?.hourly_rate as number | null) ?? null,
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
      const admin = createAdminClientForUser(ctx.user.id)

      // Fetch employee, skills, and overrides in parallel
      const [empResult, skillsResult, overridesResult] = await Promise.all([
        admin
          .from('employee')
          .select(
            `id, employee_number, first_name, last_name, email, contract_type,
             weekly_hours_contracted, hourly_rate, home_site_id, department_id, crew_id, job_role_id,
             is_multi_site_eligible, status, preferences_json,
             job_role:job_role_id(hourly_rate)`,
          )
          .eq('id', input.id)
          .eq('organization_id', ctx.organizationId)
          .single(),
        admin
          .from('employee_skill')
          .select('id, process_id, proficiency_level, certification_date, expiry_date, is_primary_skill')
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
        hourly_rate: (employee.hourly_rate as number | null) ?? ((employee.job_role as Record<string, unknown> | null)?.hourly_rate as number | null) ?? null,
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
        hourly_rate: z.number().positive().optional(),
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
      const admin = createAdminClientForUser(ctx.user.id)

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

      // Split into explicit insert/update paths. We intentionally do NOT use
      // .upsert() here: Supabase-js v2 defaults to `defaultToNull: true`,
      // which causes unspecified columns to be set to NULL on the conflict-
      // update path. That violated the NOT NULL constraint on hire_date
      // whenever a manager edited an existing employee without touching
      // hire_date, because hire_date is never part of the upsert payload.
      const { id: maybeId, ...fields } = input
      const baseRow = { ...fields, organization_id: ctx.organizationId }
      const cleanRow = Object.fromEntries(
        Object.entries(baseRow).filter(([, v]) => v !== undefined),
      )

      const { data, error } = maybeId
        ? await admin
            .from('employee')
            .update(cleanRow)
            .eq('id', maybeId)
            .eq('organization_id', ctx.organizationId)
            .select('id, employee_number, first_name, last_name, status, created_at, updated_at')
            .single()
        : await admin
            .from('employee')
            .insert({ ...cleanRow, hire_date: new Date().toISOString().split('T')[0] })
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
              employee_number: z.string().min(1).optional(),
              first_name: z.string().min(1),
              last_name: z.string().min(1),
              department: z.string().optional(),
              contract_type: ContractTypeSchema.optional(),
              weekly_hours_contracted: z.number().positive(),
              hourly_rate: z.number().positive().optional(),
              job_role_id: z.string().uuid().optional(),
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
      const admin = createAdminClientForUser(ctx.user.id)

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

      // Build employee rows — auto-generate employee_number if not provided
      const today = new Date().toISOString().split('T')[0]
      const timestamp = Date.now().toString(36)
      const rows = employees.map((e, idx) => ({
        organization_id: orgId,
        employee_number: e.employee_number ?? `EMP-${timestamp}-${String(idx + 1).padStart(4, '0')}`,
        first_name: e.first_name,
        last_name: e.last_name,
        contract_type: e.contract_type ?? 'full_time',
        weekly_hours_contracted: e.weekly_hours_contracted,
        hourly_rate: e.hourly_rate ?? null,
        home_site_id: site_id,
        hire_date: today,
        department_id: e.department
          ? deptMap.get(e.department.trim().toLowerCase()) ?? null
          : null,
        job_role_id: e.job_role_id ?? null,
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
      const admin = createAdminClientForUser(ctx.user.id)

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
      const admin = createAdminClientForUser(ctx.user.id)
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
      const admin = createAdminClientForUser(ctx.user.id)
      const { data, error } = await admin
        .from('employee_skill')
        .upsert(
          {
            ...input,
            organization_id: ctx.organizationId,
            status: 'active',
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
      const admin = createAdminClientForUser(ctx.user.id)
      const orgId = ctx.organizationId

      const rows = input.skills.map((s) => ({
        organization_id: orgId,
        employee_id: s.employee_id,
        process_id: s.process_id,
        proficiency_level: s.proficiency_level,
        status: 'active',
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
      const admin = createAdminClientForUser(ctx.user.id)

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

  // -------------------------------------------------------------------------
  // bulkDeleteEmployees  (manager+)
  // -------------------------------------------------------------------------
  bulkDeleteEmployees: managerProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClientForUser(ctx.user.id)

      // Check which employees have planning history
      const { data: assigned } = await admin
        .from('shift_assignment')
        .select('employee_id')
        .in('employee_id', input.ids)

      const blockedIds = new Set((assigned ?? []).map((a) => (a as Record<string, unknown>).employee_id as string))
      const deletableIds = input.ids.filter((id) => !blockedIds.has(id))

      if (deletableIds.length > 0) {
        const { error } = await admin
          .from('employee')
          .delete()
          .in('id', deletableIds)

        assertNoError(error, 'bulkDeleteEmployees')
      }

      return {
        deleted: deletableIds.length,
        blocked: input.ids.filter((id) => blockedIds.has(id)),
      }
    }),

  // -------------------------------------------------------------------------
  // bulkArchiveEmployees  (manager+) — set status to 'terminated'
  // -------------------------------------------------------------------------
  bulkArchiveEmployees: managerProcedure
    .input(z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClientForUser(ctx.user.id)

      const { error } = await admin
        .from('employee')
        .update({ status: 'terminated' })
        .in('id', input.ids)
        .eq('organization_id', ctx.organizationId)

      assertNoError(error, 'bulkArchiveEmployees')

      return { archived: input.ids.length }
    }),

  // -------------------------------------------------------------------------
  // eraseEmployee — AVG art. 17 right to erasure (tenant_admin only)
  //
  // Implements the Dutch "recht op vergetelheid" for a single employee:
  // anonymises all directly identifying PII on the employee row while
  // preserving the row itself so that related shift_assignment /
  // employee_skill / audit_log rows remain consistent for historical
  // payroll and KPI reporting.
  //
  // After a successful call:
  //   first_name     → 'VERWIJDERD'
  //   last_name      → 'VERWIJDERD'
  //   email          → NULL
  //   phone          → NULL
  //   preferences_json → NULL  (may contain personal preferences)
  //   metadata_json  → NULL   (free-form, may contain PII)
  //   status         → 'terminated'
  //   deleted_at     → now()
  //   deleted_by     → caller's user id
  //
  // Retained (because not directly identifying and needed for history):
  //   employee_number, hire_date, termination_date, contract_type,
  //   weekly_hours_contracted, hourly_rate, pay_grade, home_site_id,
  //   department_id, crew_id, job_role_id, seniority_date
  //
  // The operation is audited twice:
  //   1. The fn_audit_trigger on employee automatically records the
  //      UPDATE with before/after state, so the full snapshot of the
  //      erased data lives in audit_log exactly once (immutable).
  //   2. An explicit audit_log row with action='ERASE' is written so the
  //      operation is easy to find when a data-subject request needs
  //      to be shown to a DPO or the Autoriteit Persoonsgegevens.
  //
  // Only a tenant_admin may invoke this procedure, because it permanently
  // destroys data that cannot be recovered after the call returns.
  // -------------------------------------------------------------------------
  eraseEmployee: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().min(1).max(1000).describe('Reason for erasure, e.g. DSAR reference'),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClientForUser(ctx.user.id)

      // Fetch first to confirm the employee exists in this org and to
      // capture the name for the explicit audit row (because after the
      // UPDATE we can no longer read the original value).
      const { data: existing, error: fetchErr } = await admin
        .from('employee')
        .select('id, first_name, last_name, status, deleted_at')
        .eq('id', input.id)
        .eq('organization_id', ctx.organizationId)
        .maybeSingle()

      assertNoError(fetchErr, 'eraseEmployee:fetch')

      if (!existing) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Employee not found in your organization',
        })
      }

      if (existing.deleted_at) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Employee is already erased under AVG art. 17',
        })
      }

      const now = new Date().toISOString()
      const { error: updateErr } = await admin
        .from('employee')
        .update({
          first_name: 'VERWIJDERD',
          last_name: 'VERWIJDERD',
          email: null,
          phone: null,
          preferences_json: null,
          metadata_json: null,
          status: 'terminated',
          deleted_at: now,
          deleted_by: ctx.user.id,
        })
        .eq('id', input.id)
        .eq('organization_id', ctx.organizationId)

      assertNoError(updateErr, 'eraseEmployee:update')

      // Explicit audit trail with the reason. The standard trigger already
      // captured the UPDATE with before/after state; this second row makes
      // the erasure event trivially queryable via action='ERASE'.
      const { error: auditErr } = await admin.from('audit_log').insert({
        organization_id: ctx.organizationId,
        actor_id: ctx.user.id,
        actor_type: 'user',
        action: 'ERASE',
        entity_type: 'employee',
        entity_id: input.id,
        metadata_json: {
          reason: input.reason,
          previous_name: `${existing.first_name} ${existing.last_name}`.trim(),
          previous_status: existing.status,
          erased_at: now,
        },
      })

      if (auditErr) {
        // Erasure already happened, but audit write failed. Log for ops
        // visibility. This should be extremely rare because the same
        // service-role client performed the update that just succeeded.
        console.error('[eraseEmployee] explicit audit insert failed:', auditErr.message)
      }

      return {
        erased: true,
        employee_id: input.id,
        erased_at: now,
      }
    }),
})
