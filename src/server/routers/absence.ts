import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, supervisorProcedure, protectedProcedure, managerProcedure } from '../trpc'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateImpact } from '@/lib/absence/impact'
import { rankCandidates } from '@/lib/absence/scoring'
import type { AbsenceContext, ScoringCandidate } from '@/lib/absence/types'

function assertNoError(error: { message: string } | null, label: string): void {
  if (error) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `${label}: ${error.message}` })
  }
}

export const absenceRouter = router({
  /** Supervisor reports an employee sick */
  reportSick: supervisorProcedure
    .input(
      z.object({
        employee_id: z.string().uuid(),
        site_id: z.string().uuid(),
        start_date: z.string(),
        expected_duration: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.employee_id === ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Je kunt jezelf niet ziek- of betermelden',
        })
      }

      const admin = createAdminClient()
      const { data, error } = await admin
        .from('employee_availability_override')
        .insert({
          organization_id: ctx.organizationId,
          employee_id: input.employee_id,
          start_date: input.start_date,
          end_date: input.start_date, // placeholder — updated on recovery
          override_type: 'absence',
          status: 'confirmed',
          reason: null, // AVG compliance — never store absence reason
          created_by: ctx.user.id,
        })
        .select()
        .single()

      assertNoError(error, 'reportSick')
      return data
    }),

  /** Supervisor marks employee recovered */
  reportRecovered: supervisorProcedure
    .input(
      z.object({
        override_id: z.string().uuid(),
        recovery_date: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Fetch the override to validate ownership
      const { data: existing, error: fetchError } = await admin
        .from('employee_availability_override')
        .select('id, employee_id')
        .eq('id', input.override_id)
        .eq('organization_id', ctx.organizationId)
        .single()

      assertNoError(fetchError, 'reportRecovered:fetch')

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Override not found' })
      }

      if (existing.employee_id === ctx.user.id) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Je kunt jezelf niet ziek- of betermelden',
        })
      }

      const { data, error } = await admin
        .from('employee_availability_override')
        .update({ end_date: input.recovery_date })
        .eq('id', input.override_id)
        .eq('organization_id', ctx.organizationId)
        .select()
        .single()

      assertNoError(error, 'reportRecovered:update')
      return data
    }),

  /** Employee requests leave for themselves */
  requestLeave: protectedProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        start_date: z.string(),
        end_date: z.string(),
        leave_type: z.enum(['vakantie', 'bijzonder', 'onbetaald']),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('employee_availability_override')
        .insert({
          organization_id: ctx.organizationId,
          employee_id: ctx.user.id,
          start_date: input.start_date,
          end_date: input.end_date,
          override_type: 'leave',
          status: 'planned',
          reason: input.reason ?? null,
          created_by: ctx.user.id,
        })
        .select()
        .single()

      assertNoError(error, 'requestLeave')
      return data
    }),

  /** Supervisor requests leave on behalf of another employee */
  requestLeaveFor: supervisorProcedure
    .input(
      z.object({
        employee_id: z.string().uuid(),
        site_id: z.string().uuid(),
        start_date: z.string(),
        end_date: z.string(),
        leave_type: z.string(),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('employee_availability_override')
        .insert({
          organization_id: ctx.organizationId,
          employee_id: input.employee_id,
          start_date: input.start_date,
          end_date: input.end_date,
          override_type: 'leave',
          status: 'planned',
          reason: input.reason ?? null,
          created_by: ctx.user.id,
        })
        .select()
        .single()

      assertNoError(error, 'requestLeaveFor')
      return data
    }),

  /** Supervisor approves or rejects a leave request */
  approveLeave: supervisorProcedure
    .input(
      z.object({
        override_id: z.string().uuid(),
        approved: z.boolean(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('employee_availability_override')
        .update({ status: input.approved ? 'confirmed' : 'cancelled' })
        .eq('id', input.override_id)
        .eq('organization_id', ctx.organizationId)
        .select()
        .single()

      assertNoError(error, 'approveLeave')
      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Override not found' })
      }
      return data
    }),

  /** Supervisor lists active overrides for their crew */
  listActive: supervisorProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        type: z.enum(['absence', 'leave']).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const today = new Date().toISOString().slice(0, 10)

      // Get the supervisor's own crew_id (may not exist for admins/managers)
      const { data: supervisorRows } = await admin
        .from('employee')
        .select('crew_id')
        .eq('id', ctx.user.id)
        .eq('organization_id', ctx.organizationId)
        .limit(1)

      const supervisor = supervisorRows?.[0] ?? null

      let query = admin
        .from('employee_availability_override')
        .select(`
          id,
          employee_id,
          start_date,
          end_date,
          start_time,
          end_time,
          override_type,
          status,
          created_by,
          created_at,
          updated_at,
          employee:employee_id(first_name, last_name, department_id, crew_id)
        `)
        .eq('organization_id', ctx.organizationId)
        .neq('status', 'cancelled')
        .gte('end_date', today)

      if (input.type) {
        query = query.eq('override_type', input.type)
      }

      if (supervisor?.crew_id) {
        // Filter to own crew only
        const { data: crewMembers, error: crewError } = await admin
          .from('employee')
          .select('id')
          .eq('crew_id', supervisor.crew_id)
          .eq('organization_id', ctx.organizationId)

        assertNoError(crewError, 'listActive:crewMembers')

        const memberIds = (crewMembers ?? []).map((e: { id: string }) => e.id)
        query = query.in('employee_id', memberIds)
      }

      const { data, error } = await query.order('start_date', { ascending: true })
      assertNoError(error, 'listActive:query')

      return (data ?? []).map((row) => {
        const emp = (row.employee as unknown) as { first_name: string; last_name: string; department_id: string; crew_id: string | null } | null
        return {
          ...row,
          employee_name: emp ? `${emp.first_name} ${emp.last_name}` : null,
          department_id: emp?.department_id ?? null,
          crew_id: emp?.crew_id ?? null,
        }
      })
    }),

  /** Manager lists historical overrides */
  listHistory: managerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        type: z.enum(['absence', 'leave']).optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const today = new Date().toISOString().slice(0, 10)

      let query = admin
        .from('employee_availability_override')
        .select(`
          id,
          employee_id,
          start_date,
          end_date,
          start_time,
          end_time,
          override_type,
          status,
          created_by,
          created_at,
          updated_at,
          employee:employee_id(first_name, last_name, department_id, crew_id)
        `)
        .eq('organization_id', ctx.organizationId)
        .or(`end_date.lt.${today},status.eq.cancelled`)

      if (input.type) {
        query = query.eq('override_type', input.type)
      }

      const { data, error } = await query
        .order('start_date', { ascending: false })
        .limit(input.limit)

      assertNoError(error, 'listHistory')

      return (data ?? []).map((row) => {
        const emp = (row.employee as unknown) as { first_name: string; last_name: string; department_id: string; crew_id: string | null } | null
        return {
          ...row,
          employee_name: emp ? `${emp.first_name} ${emp.last_name}` : null,
          department_id: emp?.department_id ?? null,
          crew_id: emp?.crew_id ?? null,
        }
      })
    }),

  /** Any authenticated user can see their own leave requests */
  listMyLeave: protectedProcedure
    .input(z.object({ site_id: z.string().uuid().optional() }))
    .query(async ({ ctx }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('employee_availability_override')
        .select('id, employee_id, start_date, end_date, override_type, status, reason, created_at')
        .eq('organization_id', ctx.organizationId)
        .eq('employee_id', ctx.user.id)
        .eq('override_type', 'leave')
        .order('start_date', { ascending: false })
        .limit(50)

      assertNoError(error, 'listMyLeave')

      return (data ?? []).map((row) => ({
        ...row,
        employee_name: null,
        department_id: null,
        crew_id: null,
      }))
    }),

  /** Get the impact of an employee absence on process coverage */
  getImpact: supervisorProcedure
    .input(
      z.object({
        employee_id: z.string().uuid(),
        site_id: z.string().uuid(),
        period_start: z.string(),
        period_end: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Fetch the employee's skills (process IDs)
      const { data: skills, error: skillsError } = await admin
        .from('employee_process_skill')
        .select('process_id, proficiency_level')
        .eq('employee_id', input.employee_id)
        .eq('organization_id', ctx.organizationId)

      assertNoError(skillsError, 'getImpact:skills')

      const processIds = (skills ?? []).map((s: { process_id: string }) => s.process_id)

      if (processIds.length === 0) {
        return calculateImpact({ absentEmployeeId: input.employee_id, processes: [] })
      }

      // Fetch workload plan data for the affected processes in the period
      const { data: workload, error: workloadError } = await admin
        .from('workload_plan')
        .select('process_id, fte_needed, fte_available, process:process_id(name)')
        .eq('organization_id', ctx.organizationId)
        .in('process_id', processIds)
        .gte('week_start', input.period_start)
        .lte('week_start', input.period_end)

      assertNoError(workloadError, 'getImpact:workload')

      // Aggregate by process_id (average across weeks)
      const byProcess = new Map<string, { process_name: string; fte_needed: number[]; fte_available: number[] }>()
      for (const row of workload ?? []) {
        const proc = (row.process as unknown) as { name: string } | null
        if (!byProcess.has(row.process_id)) {
          byProcess.set(row.process_id, { process_name: proc?.name ?? '', fte_needed: [], fte_available: [] })
        }
        const entry = byProcess.get(row.process_id)!
        entry.fte_needed.push(Number(row.fte_needed ?? 0))
        entry.fte_available.push(Number(row.fte_available ?? 0))
      }

      const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0

      // Employee FTE contribution: assume 1 FTE per process they're skilled in
      const processes = Array.from(byProcess.entries()).map(([process_id, entry]) => ({
        process_id,
        process_name: entry.process_name,
        fte_needed: avg(entry.fte_needed),
        fte_available: avg(entry.fte_available),
        employee_fte_contribution: 1,
      }))

      return calculateImpact({ absentEmployeeId: input.employee_id, processes })
    }),

  /** Get replacement suggestions for an absent employee */
  getSuggestions: supervisorProcedure
    .input(
      z.object({
        employee_id: z.string().uuid(),
        site_id: z.string().uuid(),
        period_start: z.string(),
        period_end: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Fetch absent employee info
      const { data: absentEmployee, error: absentError } = await admin
        .from('employee')
        .select('id, first_name, last_name, crew_id, department_id')
        .eq('id', input.employee_id)
        .eq('organization_id', ctx.organizationId)
        .single()

      assertNoError(absentError, 'getSuggestions:absentEmployee')
      if (!absentEmployee) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Employee not found' })
      }

      // Fetch absent employee's skills
      const { data: absentSkills, error: absentSkillsError } = await admin
        .from('employee_process_skill')
        .select('process_id')
        .eq('employee_id', input.employee_id)
        .eq('organization_id', ctx.organizationId)

      assertNoError(absentSkillsError, 'getSuggestions:absentSkills')

      const affectedProcessIds = (absentSkills ?? []).map((s: { process_id: string }) => s.process_id)

      // Fetch all other employees on the same site
      const { data: candidates, error: candidatesError } = await admin
        .from('employee')
        .select('id, first_name, last_name, crew_id, department_id, weekly_hours_contracted')
        .eq('organization_id', ctx.organizationId)
        .eq('site_id', input.site_id)
        .neq('id', input.employee_id)

      assertNoError(candidatesError, 'getSuggestions:candidates')

      const candidateIds = (candidates ?? []).map((e: { id: string }) => e.id)

      // Fetch skills for all candidates
      const { data: allSkills, error: allSkillsError } = await admin
        .from('employee_process_skill')
        .select('employee_id, process_id, proficiency_level')
        .eq('organization_id', ctx.organizationId)
        .in('employee_id', candidateIds)

      assertNoError(allSkillsError, 'getSuggestions:allSkills')

      // Check for overlapping overrides to determine availability
      const { data: overlappingOverrides, error: overridesError } = await admin
        .from('employee_availability_override')
        .select('employee_id')
        .eq('organization_id', ctx.organizationId)
        .in('employee_id', candidateIds)
        .neq('status', 'cancelled')
        .lte('start_date', input.period_end)
        .gte('end_date', input.period_start)

      assertNoError(overridesError, 'getSuggestions:overlappingOverrides')

      const unavailableIds = new Set((overlappingOverrides ?? []).map((o: { employee_id: string }) => o.employee_id))

      // Group skills by employee
      const skillsByEmployee = new Map<string, Array<{ process_id: string; proficiency_level: number }>>()
      for (const skill of allSkills ?? []) {
        if (!skillsByEmployee.has(skill.employee_id)) {
          skillsByEmployee.set(skill.employee_id, [])
        }
        skillsByEmployee.get(skill.employee_id)!.push({
          process_id: skill.process_id,
          proficiency_level: Number(skill.proficiency_level),
        })
      }

      // Build scoring candidates
      const scoringCandidates: ScoringCandidate[] = (candidates ?? []).map((emp: {
        id: string
        first_name: string
        last_name: string
        crew_id: string | null
        department_id: string
        weekly_hours_contracted: number | null
      }) => ({
        employee_id: emp.id,
        employee_name: `${emp.first_name} ${emp.last_name}`,
        crew_id: emp.crew_id,
        department_id: emp.department_id,
        skills: skillsByEmployee.get(emp.id) ?? [],
        weekly_hours_contracted: Number(emp.weekly_hours_contracted ?? 0),
        is_available: !unavailableIds.has(emp.id),
        recent_process_ids: [], // not tracked at DB level currently
      }))

      const context: AbsenceContext = {
        employee_id: absentEmployee.id,
        employee_name: `${absentEmployee.first_name} ${absentEmployee.last_name}`,
        crew_id: absentEmployee.crew_id,
        department_id: absentEmployee.department_id,
        affected_process_ids: affectedProcessIds,
        period_start: input.period_start,
        period_end: input.period_end,
      }

      return rankCandidates(scoringCandidates, context)
    }),
})
