/**
 * planning router — Plan Version lifecycle, solver trigger, state machine
 * Source of truth: docs/api-contracts.md §planning
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, plannerProcedure, managerProcedure, viewerProcedure } from '../trpc'
import { createAdminClient } from '../../lib/supabase/admin'
import { solveGreedy } from '../../lib/solver/greedy'
import { generateTimeSlots, buildProcessDemand, buildEmployeeRecords, buildConstraints } from '../../lib/solver/assemble-input'
import type { ShiftDef, RawEmployee, RawSkill, RotationSlot, WorkloadRow } from '../../lib/solver/assemble-input'
import { getLaborRules } from '../../lib/solver/nl-defaults'
import type { LaborRuleRow } from '../../lib/solver/nl-defaults'
import { validateSolverOutput } from '../../lib/solver/validate-output'
import type { ObjectiveConfig, Assignment } from '../../types/solver'

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
// State machine transitions
// ---------------------------------------------------------------------------

const VALID_TRANSITIONS: Record<string, string[]> = {
  optimized: ['proposed'],
  proposed: ['approved', 'rejected'],
  approved: ['published'],
  rejected: ['draft'],
}

// ---------------------------------------------------------------------------
// Plan status Zod enum
// ---------------------------------------------------------------------------

const planStatusEnum = z.enum([
  'draft', 'optimized', 'proposed', 'approved', 'published', 'stale', 'superseded', 'rejected',
])

// ---------------------------------------------------------------------------
// Default objective weights
// ---------------------------------------------------------------------------

const DEFAULT_OBJECTIVE: ObjectiveConfig = {
  minimize_cost_weight: 0.3,
  maximize_coverage_weight: 0.4,
  maximize_skill_match_weight: 0.2,
  minimize_overtime_weight: 0.1,
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const planningRouter = router({
  // -------------------------------------------------------------------------
  // listPlanVersions  (viewer+)
  // -------------------------------------------------------------------------
  listPlanVersions: viewerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        status: planStatusEnum.optional(),
        plan_period_start: z.string().optional(),
        plan_period_end: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()

      let query = admin
        .from('plan_version')
        .select('id, version_number, plan_period_start, plan_period_end, status, created_at, name, summary_metrics_json')
        .eq('organization_id', ctx.organizationId)
        .eq('site_id', input.site_id)
        .order('version_number', { ascending: false })

      if (input.status) {
        query = query.eq('status', input.status)
      }
      if (input.plan_period_start) {
        query = query.gte('plan_period_start', input.plan_period_start)
      }
      if (input.plan_period_end) {
        query = query.lte('plan_period_end', input.plan_period_end)
      }

      const { data, error } = await query

      assertNoError(error, 'listPlanVersions')

      return (data ?? []).map((row: Record<string, unknown>) => ({
        id: row.id as string,
        version_number: row.version_number as number,
        plan_period_start: row.plan_period_start as string,
        plan_period_end: row.plan_period_end as string,
        status: row.status as string,
        name: row.name as string,
        created_at: row.created_at as string,
        summary_metrics_json: (row.summary_metrics_json as Record<string, unknown>) ?? null,
      }))
    }),

  // -------------------------------------------------------------------------
  // getPlanVersion  (viewer+)
  // -------------------------------------------------------------------------
  getPlanVersion: viewerProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()

      const [planResult, assignmentsResult] = await Promise.all([
        admin
          .from('plan_version')
          .select('id, version_number, name, plan_period_start, plan_period_end, status, site_id, created_at, updated_at, summary_metrics_json, optimizer_config_json, notes')
          .eq('id', input.id)
          .eq('organization_id', ctx.organizationId)
          .single(),
        admin
          .from('shift_assignment_staging')
          .select('id, employee_id, process_id, shift_pattern_id, site_id, assignment_date, start_time, end_time, scheduled_hours, assignment_source, cost_estimate')
          .eq('plan_version_id', input.id),
      ])

      assertNoError(planResult.error, 'getPlanVersion')

      if (!planResult.data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan version not found' })
      }

      const plan = planResult.data as Record<string, unknown>

      const assignments = ((assignmentsResult.data ?? []) as Array<Record<string, unknown>>).map((a) => ({
        id: a.id as string,
        employee_id: a.employee_id as string,
        process_id: a.process_id as string,
        shift_pattern_id: a.shift_pattern_id as string,
        site_id: a.site_id as string,
        assignment_date: a.assignment_date as string,
        start_time: a.start_time as string,
        end_time: a.end_time as string,
        scheduled_hours: a.scheduled_hours as number,
        assignment_source: a.assignment_source as string,
        cost_estimate: (a.cost_estimate as number) ?? 0,
      }))

      return {
        id: plan.id as string,
        version_number: plan.version_number as number,
        name: plan.name as string,
        plan_period_start: plan.plan_period_start as string,
        plan_period_end: plan.plan_period_end as string,
        status: plan.status as string,
        site_id: plan.site_id as string,
        created_at: plan.created_at as string,
        updated_at: plan.updated_at as string,
        summary_metrics_json: (plan.summary_metrics_json as Record<string, unknown>) ?? null,
        optimizer_config_json: (plan.optimizer_config_json as Record<string, unknown>) ?? null,
        notes: (plan.notes as string) ?? null,
        assignments,
      }
    }),

  // -------------------------------------------------------------------------
  // createDraft  (planner+)
  // -------------------------------------------------------------------------
  createDraft: plannerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        plan_period_start: z.string(),
        plan_period_end: z.string(),
        name: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const orgId = ctx.organizationId

      // Get next version number for this site
      const { data: maxRow, error: maxErr } = await admin
        .from('plan_version')
        .select('version_number')
        .eq('organization_id', orgId)
        .eq('site_id', input.site_id)
        .order('version_number', { ascending: false })
        .limit(1)

      assertNoError(maxErr, 'createDraft:maxVersion')

      const nextVersion = ((maxRow?.[0] as Record<string, unknown> | undefined)?.version_number as number ?? 0) + 1

      const planName = input.name ?? `Plan v${nextVersion} (${input.plan_period_start})`

      const { data, error } = await admin
        .from('plan_version')
        .insert({
          organization_id: orgId,
          site_id: input.site_id,
          version_number: nextVersion,
          name: planName,
          plan_period_start: input.plan_period_start,
          plan_period_end: input.plan_period_end,
          status: 'draft',
          generated_by: 'manual',
          created_by: ctx.user.id,
        })
        .select('id, version_number, name, plan_period_start, plan_period_end, status, created_at')
        .single()

      assertNoError(error, 'createDraft')

      if (!data) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Draft insert returned no data' })
      }

      return data as {
        id: string
        version_number: number
        name: string
        plan_period_start: string
        plan_period_end: string
        status: string
        created_at: string
      }
    }),

  // -------------------------------------------------------------------------
  // runOptimizer  (planner+)
  // -------------------------------------------------------------------------
  runOptimizer: plannerProcedure
    .input(
      z.object({
        plan_version_id: z.string().uuid(),
        solver_strategy: z.enum(['greedy', 'highs_mip']).optional(),
        time_budget_seconds: z.number().min(1).max(300).optional(),
        objective_overrides: z
          .object({
            minimize_cost_weight: z.number().optional(),
            maximize_coverage_weight: z.number().optional(),
            maximize_skill_match_weight: z.number().optional(),
            minimize_overtime_weight: z.number().optional(),
          })
          .optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const orgId = ctx.organizationId
      const strategy = input.solver_strategy ?? 'greedy'

      if (strategy === 'highs_mip') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'MIP solver is not yet available. Use greedy strategy.',
        })
      }

      // a. Fetch plan_version, verify draft status
      const { data: plan, error: planErr } = await admin
        .from('plan_version')
        .select('id, site_id, plan_period_start, plan_period_end, status')
        .eq('id', input.plan_version_id)
        .eq('organization_id', orgId)
        .single()

      assertNoError(planErr, 'runOptimizer:fetchPlan')

      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan version not found' })
      }

      const planRow = plan as Record<string, unknown>

      if (planRow.status !== 'draft') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Plan must be in draft status to run optimizer. Current status: ${planRow.status}`,
        })
      }

      const siteId = planRow.site_id as string
      const periodStart = planRow.plan_period_start as string
      const periodEnd = planRow.plan_period_end as string

      // b. Fetch all data needed for SolverInput
      const [
        employeesResult,
        skillsResult,
        shiftsResult,
        rotationResult,
        workloadResult,
        laborRulesResult,
        lockedResult,
      ] = await Promise.all([
        // Employees at this site
        admin
          .from('employee')
          .select('id, employee_number, contract_type, weekly_hours_contracted, hourly_rate, home_site_id, is_multi_site_eligible, crew_id, job_role:job_role_id(hourly_rate)')
          .eq('home_site_id', siteId)
          .eq('organization_id', orgId)
          .eq('status', 'active'),
        // All skills for org
        admin
          .from('employee_skill')
          .select('employee_id, process_id, proficiency_level, expiry_date')
          .eq('organization_id', orgId),
        // Shift patterns for site
        admin
          .from('shift_pattern')
          .select('id, name, start_time, end_time, duration_hours, days_of_week, site_id')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .or(`site_id.eq.${siteId},site_id.is.null`),
        // Rotation entries via schedule for this site
        admin
          .from('rotation_schedule')
          .select('id, rotation_entry(crew_id, shift_pattern_id, week_number)')
          .eq('site_id', siteId)
          .eq('organization_id', orgId)
          .limit(1)
          .single(),
        // Workload plan rows — try plan-specific first, fall back to site-wide (null plan_version_id)
        admin
          .from('workload_plan')
          .select('process_id, fte_needed, period_start, period_end, plan_version_id')
          .eq('site_id', siteId)
          .eq('organization_id', orgId)
          .gte('period_start', periodStart)
          .lte('period_start', periodEnd),
        // Labor rules
        admin
          .from('labor_rule')
          .select('rule_type, parameters_json, severity')
          .eq('organization_id', orgId)
          .eq('is_active', true),
        // Existing locked assignments in staging
        admin
          .from('shift_assignment_staging')
          .select('employee_id, process_id, shift_pattern_id, scheduled_hours, cost_estimate, assignment_source, start_time, end_time')
          .eq('plan_version_id', input.plan_version_id)
          .eq('assignment_source', 'manual'),
      ])

      assertNoError(employeesResult.error, 'runOptimizer:employees')
      assertNoError(skillsResult.error, 'runOptimizer:skills')
      assertNoError(shiftsResult.error, 'runOptimizer:shifts')
      // rotation may not exist — that's ok
      assertNoError(workloadResult.error, 'runOptimizer:workload')
      assertNoError(laborRulesResult.error, 'runOptimizer:laborRules')
      assertNoError(lockedResult.error, 'runOptimizer:locked')

      // c. Assemble SolverInput

      // Build shift definitions
      const shiftsRaw = (shiftsResult.data ?? []) as Array<Record<string, unknown>>
      const shiftDefs: ShiftDef[] = shiftsRaw.map((s) => ({
        id: s.id as string,
        name: s.name as string,
        start_time: (s.start_time as string).slice(0, 5), // TIME -> HH:MM
        end_time: (s.end_time as string).slice(0, 5),
        duration_hours: s.duration_hours as number,
      }))

      // Generate time slots: all days in period x shifts
      // Determine work days from shift patterns' days_of_week arrays
      const allWorkDays = new Set<number>()
      for (const s of shiftsRaw) {
        const days = s.days_of_week as number[] | null
        if (days) days.forEach((d) => allWorkDays.add(d))
      }
      const workDays = allWorkDays.size > 0 ? [...allWorkDays] : [1, 2, 3, 4, 5]

      // Generate time slots for each week in the period
      const allTimeSlots = generateTimeSlotsForPeriod(periodStart, periodEnd, workDays, shiftDefs)

      // Build workload rows — prefer plan-specific, fallback to site-wide (null plan_version_id)
      const allWorkloadRows = ((workloadResult.data ?? []) as Array<Record<string, unknown>>)
      const planSpecific = allWorkloadRows.filter((w) => w.plan_version_id === input.plan_version_id)
      const siteWide = allWorkloadRows.filter((w) => w.plan_version_id === null || w.plan_version_id === undefined)
      const workloadSource = planSpecific.length > 0 ? planSpecific : siteWide

      let workloadRows: WorkloadRow[] = workloadSource.map((w) => ({
        process_id: w.process_id as string,
        fte_needed: Number(w.fte_needed) || null,
        period_start: w.period_start as string,
        period_end: w.period_end as string,
      }))

      // Fallback: if workload_plan is empty, derive demand directly from demand_forecast
      if (workloadRows.length === 0) {
        const { data: forecastRows, error: forecastErr } = await admin
          .from('demand_forecast')
          .select('process_id, volume, period_start, period_end')
          .eq('site_id', siteId)
          .not('process_id', 'is', null)
          .gte('period_start', periodStart)
          .lte('period_start', periodEnd)

        if (!forecastErr && forecastRows && forecastRows.length > 0) {
          // Also fetch process UPH to convert volume → FTE
          const { data: ppsRows } = await admin
            .from('process_productivity_standard')
            .select('process_id, units_per_hour')
            .eq('organization_id', orgId)

          const uphMap = new Map<string, number>()
          for (const p of (ppsRows ?? []) as Array<Record<string, unknown>>) {
            uphMap.set(p.process_id as string, Number(p.units_per_hour) || 0)
          }

          // Standard hours per shift for FTE conversion
          const avgShiftHours = shiftDefs.length > 0
            ? shiftDefs.reduce((sum, s) => sum + s.duration_hours, 0) / shiftDefs.length
            : 8

          workloadRows = (forecastRows as Array<Record<string, unknown>>)
            .filter((f) => f.process_id)
            .map((f) => {
              const volume = Number(f.volume) || 0
              const uph = uphMap.get(f.process_id as string) || 0
              // If UPH is known, convert volume→hours→FTE; otherwise treat volume as direct FTE
              const fte = uph > 0 ? volume / uph / avgShiftHours : volume
              return {
                process_id: f.process_id as string,
                fte_needed: fte > 0 ? fte : null,
                period_start: f.period_start as string,
                period_end: f.period_end as string,
              }
            })

          console.log('[solver] Fallback: using demand_forecast directly', {
            forecastCount: forecastRows.length,
            workloadRowsGenerated: workloadRows.length,
          })
        }
      }

      const demand = buildProcessDemand(workloadRows, allTimeSlots)

      // Build employee records
      const rawEmployees: RawEmployee[] = ((employeesResult.data ?? []) as Array<Record<string, unknown>>).map((e) => ({
        id: e.id as string,
        employee_number: e.employee_number as string,
        contract_type: e.contract_type as RawEmployee['contract_type'],
        weekly_hours_contracted: e.weekly_hours_contracted as number,
        hourly_rate: (e.hourly_rate as number | null),
        home_site_id: e.home_site_id as string,
        is_multi_site_eligible: e.is_multi_site_eligible as boolean,
        crew_id: (e.crew_id as string | null) ?? null,
        job_role_hourly_rate: ((e.job_role as Record<string, unknown> | null)?.hourly_rate as number | null) ?? null,
      }))

      const rawSkills: RawSkill[] = ((skillsResult.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
        employee_id: s.employee_id as string,
        process_id: s.process_id as string,
        proficiency_level: s.proficiency_level as number,
        has_active_certification: s.expiry_date
          ? new Date(s.expiry_date as string) > new Date()
          : false,
        certification_expiry: (s.expiry_date as string) ?? null,
      }))

      // Build rotation-based availability
      const rotationSlots: RotationSlot[] = buildRotationSlots(
        rotationResult.data as Record<string, unknown> | null,
        rawEmployees,
        shiftDefs,
        periodStart,
        periodEnd,
      )

      const employees = buildEmployeeRecords(
        rawEmployees,
        rawSkills,
        rotationSlots,
        [], // overrides — we fetch them above but not yet integrated
        new Map(), // existing hours this week
        new Map(), // consecutive days worked
        allTimeSlots, // fallback availability when no rotation exists
      )

      // Build constraints from labor rules
      const laborRuleRows: LaborRuleRow[] = ((laborRulesResult.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        rule_type: r.rule_type as string,
        parameters_json: r.parameters_json as Record<string, unknown>,
        severity: (r.severity as string) === 'hard_constraint' ? 'hard' as const : 'soft' as const,
      }))

      const laborRules = getLaborRules(laborRuleRows)
      const { hard, soft } = buildConstraints(laborRules)

      // Build locked assignments for solver
      const lockedAssignments: Assignment[] = ((lockedResult.data ?? []) as Array<Record<string, unknown>>).map((a) => {
        // Map start_time to time_slot_id
        const startDate = (a.start_time as string).slice(0, 10)
        const shiftId = a.shift_pattern_id as string
        const timeSlotId = `${startDate}_${shiftId}`

        return {
          employee_id: a.employee_id as string,
          process_id: a.process_id as string,
          time_slot_id: timeSlotId,
          shift_pattern_id: a.shift_pattern_id as string,
          scheduled_hours: a.scheduled_hours as number,
          cost_estimate: (a.cost_estimate as number) ?? 0,
          assignment_source: 'manual' as const,
        }
      })

      // Build objective config
      const objective: ObjectiveConfig = {
        ...DEFAULT_OBJECTIVE,
        ...input.objective_overrides,
      }

      const solverInput = {
        site_id: siteId,
        planning_horizon: { start: periodStart, end: periodEnd },
        time_slots: allTimeSlots,
        demand,
        employees,
        hard_constraints: hard,
        soft_constraints: soft,
        locked_assignments: lockedAssignments,
        objective,
        time_budget_seconds: input.time_budget_seconds ?? 30,
      }

      // Debug: log solver input summary
      console.log('[solver] Input summary:', {
        timeSlots: allTimeSlots.length,
        demand: demand.length,
        demandSample: demand.slice(0, 3).map(d => ({ proc: d.process_id.slice(0, 8), slot: d.time_slot_id, fte: d.required_fte })),
        employees: employees.length,
        employeeSkillCounts: employees.slice(0, 3).map(e => ({ id: e.id.slice(0, 8), skills: e.skills.length, avail: e.availability.length })),
        workloadRowsTotal: workloadSource.length,
        workloadRowsSample: workloadSource.slice(0, 3).map(w => ({ proc: (w.process_id as string).slice(0, 8), fte: w.fte_needed, start: w.period_start })),
        lockedAssignments: lockedAssignments.length,
      })

      // d. Run solver
      const solverOutput = solveGreedy(solverInput, laborRules)

      console.log('[solver] Output:', {
        assignments: solverOutput.assignments.length,
        unmetDemand: solverOutput.unmet_demand.length,
        coverage: solverOutput.metrics.coverage_percentage,
        cost: solverOutput.metrics.total_cost,
        solveTime: solverOutput.metrics.solve_time_ms,
      })

      // Validate output
      const validation = validateSolverOutput(solverOutput)
      if (!validation.valid) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Solver output validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
        })
      }

      // e. Delete old staging rows (except locked), insert new assignments
      const { error: deleteErr } = await admin
        .from('shift_assignment_staging')
        .delete()
        .eq('plan_version_id', input.plan_version_id)
        .neq('assignment_source', 'manual')

      assertNoError(deleteErr, 'runOptimizer:deleteOldStaging')

      // Insert new optimizer assignments into staging
      const newAssignments = solverOutput.assignments.filter((a) => a.assignment_source === 'optimizer')

      if (newAssignments.length > 0) {
        // Map solver assignments to staging table rows
        const stagingRows = newAssignments.map((a) => {
          // Parse time_slot_id: "YYYY-MM-DD_shiftId"
          const [assignmentDate, shiftPatId] = splitTimeSlotId(a.time_slot_id)
          const shift = shiftDefs.find((s) => s.id === (shiftPatId ?? a.shift_pattern_id))

          const startTime = shift
            ? `${assignmentDate}T${shift.start_time}:00Z`
            : `${assignmentDate}T00:00:00Z`
          const endTime = shift
            ? `${assignmentDate}T${shift.end_time}:00Z`
            : `${assignmentDate}T23:59:00Z`

          return {
            organization_id: orgId,
            employee_id: a.employee_id,
            shift_pattern_id: shiftPatId ?? a.shift_pattern_id,
            site_id: siteId,
            process_id: a.process_id,
            assignment_date: assignmentDate,
            plan_version_id: input.plan_version_id,
            start_time: startTime,
            end_time: endTime,
            scheduled_hours: a.scheduled_hours,
            assignment_source: 'optimizer',
            cost_estimate: a.cost_estimate,
            status: 'draft',
          }
        })

        const { error: insertErr } = await admin
          .from('shift_assignment_staging')
          .insert(stagingRows)

        assertNoError(insertErr, 'runOptimizer:insertStaging')
      }

      // f. Update plan_version status and store metrics
      const { error: updateErr } = await admin
        .from('plan_version')
        .update({
          status: 'optimized',
          summary_metrics_json: solverOutput.metrics,
          optimizer_config_json: {
            solver_strategy: strategy,
            objective,
            time_budget_seconds: input.time_budget_seconds ?? 30,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.plan_version_id)

      assertNoError(updateErr, 'runOptimizer:updateStatus')

      // g. Return metrics
      return {
        plan_version_id: input.plan_version_id,
        status: 'optimized' as const,
        metrics: solverOutput.metrics,
        assignment_count: solverOutput.assignments.length,
        unmet_demand_count: solverOutput.unmet_demand.length,
        validation_warnings: validation.warnings,
      }
    }),

  // -------------------------------------------------------------------------
  // getOptimizerStatus  (planner+) — placeholder for async MIP
  // -------------------------------------------------------------------------
  getOptimizerStatus: plannerProcedure
    .input(z.object({ job_id: z.string() }))
    .query(async ({ input }) => {
      // Placeholder — greedy is synchronous, MIP will use this
      return {
        job_id: input.job_id,
        status: 'completed' as const,
        message: 'Greedy solver runs synchronously. This endpoint is reserved for async MIP jobs.',
      }
    }),

  // -------------------------------------------------------------------------
  // transitionState  (planner+)
  // -------------------------------------------------------------------------
  transitionState: plannerProcedure
    .input(
      z.object({
        plan_version_id: z.string().uuid(),
        target_state: z.enum(['proposed', 'approved', 'rejected', 'published']),
        reason: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const orgId = ctx.organizationId

      // Fetch current state
      const { data: plan, error: planErr } = await admin
        .from('plan_version')
        .select('id, status')
        .eq('id', input.plan_version_id)
        .eq('organization_id', orgId)
        .single()

      assertNoError(planErr, 'transitionState:fetchPlan')

      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan version not found' })
      }

      const currentStatus = (plan as Record<string, unknown>).status as string

      // Validate transition
      const allowed = VALID_TRANSITIONS[currentStatus]
      if (!allowed || !allowed.includes(input.target_state)) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot transition from '${currentStatus}' to '${input.target_state}'. Allowed transitions: ${(allowed ?? []).join(', ') || 'none'}`,
        })
      }

      // Build update payload
      const updatePayload: Record<string, unknown> = {
        status: input.target_state,
        updated_at: new Date().toISOString(),
      }

      if (input.target_state === 'approved') {
        updatePayload.approved_by = ctx.user.id
        updatePayload.approved_at = new Date().toISOString()
      }

      if (input.target_state === 'rejected') {
        // Reset to draft
        updatePayload.status = 'draft'
        updatePayload.notes = input.reason ?? 'Rejected — returned to draft'
      }

      if (input.target_state === 'published') {
        updatePayload.is_published = true
        updatePayload.is_locked = true
      }

      const { error: updateErr } = await admin
        .from('plan_version')
        .update(updatePayload)
        .eq('id', input.plan_version_id)

      assertNoError(updateErr, 'transitionState:update')

      // On publish: copy staging -> shift_assignment
      if (input.target_state === 'published') {
        const { data: staging, error: stagingErr } = await admin
          .from('shift_assignment_staging')
          .select('employee_id, shift_pattern_id, site_id, process_id, department_id, assignment_date, plan_version_id, start_time, end_time, scheduled_hours, overtime_hours, assignment_type, assignment_source, cost_estimate')
          .eq('plan_version_id', input.plan_version_id)

        assertNoError(stagingErr, 'transitionState:fetchStaging')

        const stagingRows = (staging ?? []) as Array<Record<string, unknown>>

        if (stagingRows.length > 0) {
          const publishRows = stagingRows.map((row) => ({
            organization_id: orgId,
            employee_id: row.employee_id as string,
            shift_pattern_id: row.shift_pattern_id as string,
            site_id: row.site_id as string,
            process_id: row.process_id as string,
            department_id: (row.department_id as string) ?? null,
            assignment_date: row.assignment_date as string,
            plan_version_id: row.plan_version_id as string,
            start_time: row.start_time as string,
            end_time: row.end_time as string,
            scheduled_hours: row.scheduled_hours as number,
            overtime_hours: (row.overtime_hours as number) ?? 0,
            assignment_type: (row.assignment_type as string) ?? 'scheduled',
            assignment_source: (row.assignment_source as string) ?? 'optimizer',
            cost_estimate: (row.cost_estimate as number) ?? 0,
            status: 'confirmed',
          }))

          const { error: insertErr } = await admin
            .from('shift_assignment')
            .insert(publishRows)

          assertNoError(insertErr, 'transitionState:publishAssignments')
        }
      }

      return {
        plan_version_id: input.plan_version_id,
        previous_status: currentStatus,
        new_status: updatePayload.status as string,
      }
    }),

  // -------------------------------------------------------------------------
  // manualAssign  (planner+)
  // -------------------------------------------------------------------------
  manualAssign: plannerProcedure
    .input(
      z.object({
        plan_version_id: z.string().uuid(),
        employee_id: z.string().uuid(),
        process_id: z.string().uuid(),
        time_slot_id: z.string().uuid(),
        shift_pattern_id: z.string().uuid(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const orgId = ctx.organizationId

      // Verify plan is in draft or optimized status
      const { data: plan, error: planErr } = await admin
        .from('plan_version')
        .select('id, status, site_id')
        .eq('id', input.plan_version_id)
        .eq('organization_id', orgId)
        .single()

      assertNoError(planErr, 'manualAssign:fetchPlan')

      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan version not found' })
      }

      const planRow = plan as Record<string, unknown>
      if (planRow.status !== 'draft' && planRow.status !== 'optimized') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Manual assignment only allowed in draft or optimized status. Current: ${planRow.status}`,
        })
      }

      // Get the shift pattern for timing info
      const { data: shift, error: shiftErr } = await admin
        .from('shift_pattern')
        .select('id, start_time, end_time, duration_hours')
        .eq('id', input.shift_pattern_id)
        .single()

      assertNoError(shiftErr, 'manualAssign:fetchShift')

      if (!shift) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Shift pattern not found' })
      }

      const shiftRow = shift as Record<string, unknown>
      // Use time_slot_id as assignment date reference — parse "YYYY-MM-DD_shiftId" format or use as-is
      const assignmentDate = new Date().toISOString().slice(0, 10)
      const startTime = `${assignmentDate}T${(shiftRow.start_time as string).slice(0, 5)}:00Z`
      const endTime = `${assignmentDate}T${(shiftRow.end_time as string).slice(0, 5)}:00Z`

      const { data, error } = await admin
        .from('shift_assignment_staging')
        .insert({
          organization_id: orgId,
          employee_id: input.employee_id,
          shift_pattern_id: input.shift_pattern_id,
          site_id: planRow.site_id as string,
          process_id: input.process_id,
          assignment_date: assignmentDate,
          plan_version_id: input.plan_version_id,
          start_time: startTime,
          end_time: endTime,
          scheduled_hours: shiftRow.duration_hours as number,
          assignment_source: 'manual',
          status: 'draft',
        })
        .select('id, employee_id, process_id, shift_pattern_id, assignment_date, scheduled_hours, assignment_source')
        .single()

      assertNoError(error, 'manualAssign:insert')

      if (!data) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Manual assignment insert returned no data' })
      }

      return data as {
        id: string
        employee_id: string
        process_id: string
        shift_pattern_id: string
        assignment_date: string
        scheduled_hours: number
        assignment_source: string
      }
    }),

  // -------------------------------------------------------------------------
  // removeAssignment  (planner+)
  // -------------------------------------------------------------------------
  removeAssignment: plannerProcedure
    .input(z.object({ assignment_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const orgId = ctx.organizationId

      // Fetch the assignment to get plan_version_id
      const { data: assignment, error: fetchErr } = await admin
        .from('shift_assignment_staging')
        .select('id, plan_version_id')
        .eq('id', input.assignment_id)
        .eq('organization_id', orgId)
        .single()

      assertNoError(fetchErr, 'removeAssignment:fetch')

      if (!assignment) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Assignment not found' })
      }

      const assignmentRow = assignment as Record<string, unknown>

      // Verify plan is draft or optimized
      const { data: plan, error: planErr } = await admin
        .from('plan_version')
        .select('id, status')
        .eq('id', assignmentRow.plan_version_id as string)
        .eq('organization_id', orgId)
        .single()

      assertNoError(planErr, 'removeAssignment:fetchPlan')

      if (!plan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Plan version not found' })
      }

      const planRow = plan as Record<string, unknown>
      if (planRow.status !== 'draft' && planRow.status !== 'optimized') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Assignment removal only allowed in draft or optimized status. Current: ${planRow.status}`,
        })
      }

      const { error: deleteErr } = await admin
        .from('shift_assignment_staging')
        .delete()
        .eq('id', input.assignment_id)

      assertNoError(deleteErr, 'removeAssignment:delete')

      return { deleted: true }
    }),

  // -------------------------------------------------------------------------
  // lockAssignment  (planner+)
  // -------------------------------------------------------------------------
  lockAssignment: plannerProcedure
    .input(z.object({ assignment_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()

      const { data, error } = await admin
        .from('shift_assignment_staging')
        .update({ assignment_source: 'manual', updated_at: new Date().toISOString() })
        .eq('id', input.assignment_id)
        .eq('organization_id', ctx.organizationId)
        .select('id, assignment_source')
        .single()

      assertNoError(error, 'lockAssignment')

      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Assignment not found' })
      }

      return data as { id: string; assignment_source: string }
    }),

  // -------------------------------------------------------------------------
  // overrideHardConstraint  (manager+)
  // -------------------------------------------------------------------------
  overrideHardConstraint: managerProcedure
    .input(
      z.object({
        plan_version_id: z.string().uuid(),
        assignment_id: z.string().uuid(),
        constraint_type: z.string().min(1),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Mark the assignment with override_reason
      const { data, error } = await admin
        .from('shift_assignment_staging')
        .update({
          override_reason: `[${input.constraint_type}] ${input.reason}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.assignment_id)
        .eq('plan_version_id', input.plan_version_id)
        .eq('organization_id', ctx.organizationId)
        .select('id, override_reason')
        .single()

      assertNoError(error, 'overrideHardConstraint')

      if (!data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Assignment not found in this plan' })
      }

      return data as { id: string; override_reason: string }
    }),
})

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

/**
 * Generate time slots for the entire planning period, week by week.
 */
function generateTimeSlotsForPeriod(
  periodStart: string,
  periodEnd: string,
  workDays: number[],
  shifts: ShiftDef[],
) {
  const allSlots = []
  let weekStart = periodStart

  while (weekStart <= periodEnd) {
    const weekSlots = generateTimeSlots(weekStart, workDays, shifts)
    // Only include slots that fall within the planning period
    for (const slot of weekSlots) {
      const slotDate = slot.period_start.slice(0, 10)
      if (slotDate >= periodStart && slotDate <= periodEnd) {
        allSlots.push(slot)
      }
    }

    // Move to next week
    const d = new Date(weekStart + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 7)
    weekStart = d.toISOString().slice(0, 10)
  }

  return allSlots
}

/**
 * Split a time_slot_id like "2025-01-06_shift-uuid" into [date, shiftId].
 */
function splitTimeSlotId(timeSlotId: string): [string, string] {
  // Format: "YYYY-MM-DD_shiftId"
  const underscoreIdx = timeSlotId.indexOf('_')
  if (underscoreIdx === -1) {
    return [timeSlotId, '']
  }
  return [
    timeSlotId.slice(0, underscoreIdx),
    timeSlotId.slice(underscoreIdx + 1),
  ]
}

/**
 * Build rotation-based availability slots for employees from rotation_entry data.
 * Maps crew-based rotation entries to individual employee availability windows.
 */
function buildRotationSlots(
  rotationData: Record<string, unknown> | null,
  employees: RawEmployee[],
  shifts: ShiftDef[],
  periodStart: string,
  periodEnd: string,
): RotationSlot[] {
  if (!rotationData) return []

  const entries = (rotationData.rotation_entry ?? []) as Array<Record<string, unknown>>
  if (entries.length === 0) return []

  // Build crew -> employee mapping
  const crewEmployees = new Map<string, string[]>()
  for (const emp of employees) {
    if (emp.crew_id) {
      const arr = crewEmployees.get(emp.crew_id)
      if (arr) arr.push(emp.id)
      else crewEmployees.set(emp.crew_id, [emp.id])
    }
  }

  // Build shift lookup
  const shiftMap = new Map<string, ShiftDef>()
  for (const s of shifts) shiftMap.set(s.id, s)

  const slots: RotationSlot[] = []

  // Iterate days in the period and assign based on rotation entries
  let currentDate = periodStart
  while (currentDate <= periodEnd) {
    for (const entry of entries) {
      const crewId = entry.crew_id as string
      const shiftPatternId = entry.shift_pattern_id as string
      const shift = shiftMap.get(shiftPatternId)
      if (!shift) continue

      const empIds = crewEmployees.get(crewId) ?? []
      for (const empId of empIds) {
        slots.push({
          employee_id: empId,
          date: currentDate,
          start_time: shift.start_time,
          end_time: shift.end_time,
        })
      }
    }

    // Next day
    const d = new Date(currentDate + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 1)
    currentDate = d.toISOString().slice(0, 10)
  }

  return slots
}
