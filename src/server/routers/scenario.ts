/**
 * scenario router — What-if analysis: clone, run solver, compare, promote
 * Source of truth: docs/api-contracts.md §scenario
 */
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, plannerProcedure, viewerProcedure } from '../trpc'
import { createAdminClientForUser } from '../../lib/supabase/admin'
import { generateTimeSlots as generateTimeSlotsForWeek, buildProcessDemand, buildEmployeeRecords, buildConstraints } from '../../lib/solver/assemble-input'
import type { ShiftDef, RawEmployee, RawSkill, RotationSlot, WorkloadRow } from '../../lib/solver/assemble-input'
import { solveGreedy } from '../../lib/solver/greedy'
import { getLaborRules } from '../../lib/solver/nl-defaults'
import type { LaborRuleRow } from '../../lib/solver/nl-defaults'
import { validateSolverOutput } from '../../lib/solver/validate-output'
import type { ObjectiveConfig } from '../../types/solver'

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
// Helper: generate time slots across a multi-week period
// ---------------------------------------------------------------------------

function generateTimeSlotsForPeriod(
  periodStart: string,
  periodEnd: string,
  workDays: number[],
  shifts: ShiftDef[],
) {
  const allSlots = []
  let weekStart = periodStart

  while (weekStart <= periodEnd) {
    const weekSlots = generateTimeSlotsForWeek(weekStart, workDays, shifts)
    for (const slot of weekSlots) {
      const slotDate = slot.period_start.slice(0, 10)
      if (slotDate >= periodStart && slotDate <= periodEnd) {
        allSlots.push(slot)
      }
    }
    const d = new Date(weekStart + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + 7)
    weekStart = d.toISOString().slice(0, 10)
  }

  return allSlots
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const scenarioRouter = router({
  // -------------------------------------------------------------------------
  // create — Clone a plan into a what-if scenario
  // -------------------------------------------------------------------------
  create: plannerProcedure
    .input(
      z.object({
        base_plan_version_id: z.string().uuid(),
        name: z.string().min(1),
        description: z.string().optional(),
        modifications: z.object({
          demand_overrides: z
            .array(
              z.object({
                process_id: z.string().uuid(),
                time_slot_id: z.string().uuid(),
                new_required_fte: z.number().min(0),
              })
            )
            .optional(),
          employee_removals: z.array(z.string().uuid()).optional(),
          employee_additions: z.array(z.string().uuid()).optional(),
          constraint_changes: z
            .array(
              z.object({
                constraint_type: z.string().min(1),
                new_parameters: z.record(z.union([z.number(), z.string(), z.boolean()])),
              })
            )
            .optional(),
        }),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClientForUser(ctx.user.id)
      const orgId = ctx.organizationId

      // Verify the base plan version exists and belongs to this org
      const { data: basePlan, error: basePlanErr } = await admin
        .from('plan_version')
        .select('id')
        .eq('id', input.base_plan_version_id)
        .eq('organization_id', orgId)
        .single()

      assertNoError(basePlanErr, 'scenario.create:fetchBasePlan')

      if (!basePlan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Base plan version not found' })
      }

      // Insert scenario
      const { data: scenario, error: insertErr } = await admin
        .from('scenario')
        .insert({
          organization_id: orgId,
          name: input.name,
          description: input.description ?? null,
          parent_plan_version_id: input.base_plan_version_id,
          assumptions_json: input.modifications,
          status: 'draft',
          created_by: ctx.user.id,
        })
        .select('id, name, status, created_at')
        .single()

      assertNoError(insertErr, 'scenario.create:insert')

      if (!scenario) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Scenario insert returned no data' })
      }

      const row = scenario as Record<string, unknown>
      return {
        id: row.id as string,
        name: row.name as string,
        status: row.status as string,
        created_at: row.created_at as string,
      }
    }),

  // -------------------------------------------------------------------------
  // run — Solve a scenario using the greedy solver
  // -------------------------------------------------------------------------
  run: plannerProcedure
    .input(
      z.object({
        scenario_id: z.string().uuid(),
        solver_strategy: z.enum(['greedy', 'highs_mip']).optional(),
        time_budget_seconds: z.number().min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClientForUser(ctx.user.id)
      const orgId = ctx.organizationId
      const strategy = input.solver_strategy ?? 'greedy'

      if (strategy === 'highs_mip') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'MIP solver is not yet available. Use greedy strategy.',
        })
      }

      // a. Fetch scenario, verify draft/running status
      const { data: scenario, error: scenarioErr } = await admin
        .from('scenario')
        .select('id, parent_plan_version_id, assumptions_json, status')
        .eq('id', input.scenario_id)
        .eq('organization_id', orgId)
        .single()

      assertNoError(scenarioErr, 'scenario.run:fetchScenario')

      if (!scenario) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Scenario not found' })
      }

      const sc = scenario as Record<string, unknown>

      if (sc.status !== 'draft' && sc.status !== 'running') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Scenario must be in draft status to run. Current status: ${sc.status}`,
        })
      }

      const parentPlanVersionId = sc.parent_plan_version_id as string

      // b. Fetch parent plan_version to get site/period info
      const { data: parentPlan, error: parentErr } = await admin
        .from('plan_version')
        .select('id, site_id, plan_period_start, plan_period_end, version_number')
        .eq('id', parentPlanVersionId)
        .eq('organization_id', orgId)
        .single()

      assertNoError(parentErr, 'scenario.run:fetchParentPlan')

      if (!parentPlan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Parent plan version not found' })
      }

      const parent = parentPlan as Record<string, unknown>
      const siteId = parent.site_id as string
      const periodStart = parent.plan_period_start as string
      const periodEnd = parent.plan_period_end as string

      // c. Mark scenario as running
      const { error: runningErr } = await admin
        .from('scenario')
        .update({ status: 'running' })
        .eq('id', input.scenario_id)

      assertNoError(runningErr, 'scenario.run:markRunning')

      // d. Get next version number for the site
      const { data: maxRow, error: maxErr } = await admin
        .from('plan_version')
        .select('version_number')
        .eq('organization_id', orgId)
        .eq('site_id', siteId)
        .order('version_number', { ascending: false })
        .limit(1)

      assertNoError(maxErr, 'scenario.run:maxVersion')

      const nextVersion = ((maxRow?.[0] as Record<string, unknown> | undefined)?.version_number as number ?? 0) + 1

      // e. Create a new plan_version linked to this scenario
      const { data: newPlan, error: newPlanErr } = await admin
        .from('plan_version')
        .insert({
          organization_id: orgId,
          site_id: siteId,
          version_number: nextVersion,
          name: `Scenario: ${(sc as Record<string, unknown>).id}`,
          plan_period_start: periodStart,
          plan_period_end: periodEnd,
          scenario_id: input.scenario_id,
          generated_by: 'ai_optimizer',
          status: 'draft',
          created_by: ctx.user.id,
          parent_version_id: parentPlanVersionId,
        })
        .select('id')
        .single()

      assertNoError(newPlanErr, 'scenario.run:createPlanVersion')

      if (!newPlan) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Plan version insert returned no data' })
      }

      const newPlanVersionId = (newPlan as Record<string, unknown>).id as string

      // f. Use the planning router's runOptimizer via a direct tRPC call pattern.
      //    For simplicity, we delegate to the planning.runOptimizer procedure
      //    by calling it through the caller context. However, since the scenario
      //    plan_version is in 'draft' status, we can invoke the solver directly.
      //
      // g. Fetch all data needed for SolverInput (same queries as planning.runOptimizer)
      const assumptions = sc.assumptions_json as {
        demand_overrides?: Array<{ process_id: string; time_slot_id: string; new_required_fte: number }>
        employee_removals?: string[]
        employee_additions?: string[]
      } | null

      const [
        employeesResult,
        skillsResult,
        shiftsResult,
        workloadResult,
        laborRulesResult,
      ] = await Promise.all([
        admin
          .from('employee')
          .select('id, employee_number, contract_type, weekly_hours_contracted, hourly_rate, home_site_id, is_multi_site_eligible, crew_id, job_role:job_role_id(hourly_rate)')
          .eq('home_site_id', siteId)
          .eq('organization_id', orgId)
          .eq('status', 'active'),
        admin
          .from('employee_skill')
          .select('employee_id, process_id, proficiency_level, expiry_date')
          .eq('organization_id', orgId),
        admin
          .from('shift_pattern')
          .select('id, name, start_time, end_time, duration_hours, days_of_week, site_id')
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .or(`site_id.eq.${siteId},site_id.is.null`),
        admin
          .from('workload_plan')
          .select('process_id, fte_needed, period_start, period_end')
          .eq('plan_version_id', parentPlanVersionId)
          .eq('organization_id', orgId),
        admin
          .from('labor_rule')
          .select('rule_type, parameters_json, severity')
          .eq('organization_id', orgId)
          .eq('is_active', true),
      ])

      assertNoError(employeesResult.error, 'scenario.run:employees')
      assertNoError(skillsResult.error, 'scenario.run:skills')
      assertNoError(shiftsResult.error, 'scenario.run:shifts')
      assertNoError(workloadResult.error, 'scenario.run:workload')
      assertNoError(laborRulesResult.error, 'scenario.run:laborRules')

      // Build shift definitions
      const shiftsRaw = (shiftsResult.data ?? []) as Array<Record<string, unknown>>
      const shiftDefs: ShiftDef[] = shiftsRaw.map((s) => ({
        id: s.id as string,
        name: s.name as string,
        start_time: (s.start_time as string).slice(0, 5),
        end_time: (s.end_time as string).slice(0, 5),
        duration_hours: s.duration_hours as number,
      }))

      // Generate time slots
      const allWorkDays = new Set<number>()
      for (const s of shiftsRaw) {
        const days = s.days_of_week as number[] | null
        if (days) days.forEach((d) => allWorkDays.add(d))
      }
      const workDays = allWorkDays.size > 0 ? [...allWorkDays] : [1, 2, 3, 4, 5]
      const allTimeSlots = generateTimeSlotsForPeriod(periodStart, periodEnd, workDays, shiftDefs)

      // Build workload rows
      const workloadRows: WorkloadRow[] = ((workloadResult.data ?? []) as Array<Record<string, unknown>>).map((w) => ({
        process_id: w.process_id as string,
        fte_needed: w.fte_needed as number | null,
        period_start: w.period_start as string,
        period_end: w.period_end as string,
      }))

      const demand = buildProcessDemand(workloadRows, allTimeSlots)

      // Apply demand overrides from scenario assumptions
      if (assumptions?.demand_overrides) {
        for (const override of assumptions.demand_overrides) {
          const slot = demand.find(
            (d) => d.process_id === override.process_id && d.time_slot_id === override.time_slot_id
          )
          if (slot) {
            slot.required_fte = override.new_required_fte
          }
        }
      }

      // Build employee records
      let rawEmployees: RawEmployee[] = ((employeesResult.data ?? []) as Array<Record<string, unknown>>).map((e) => ({
        id: e.id as string,
        employee_number: e.employee_number as string,
        contract_type: e.contract_type as RawEmployee['contract_type'],
        weekly_hours_contracted: e.weekly_hours_contracted as number,
        hourly_rate: (e.hourly_rate as number | null),
        home_site_id: e.home_site_id as string,
        is_multi_site_eligible: e.is_multi_site_eligible as boolean,
        crew_id: null,
        job_role_hourly_rate: ((e.job_role as Record<string, unknown> | null)?.hourly_rate as number | null) ?? null,
      }))

      // Apply employee removals from scenario assumptions
      if (assumptions?.employee_removals && assumptions.employee_removals.length > 0) {
        const removals = new Set(assumptions.employee_removals)
        rawEmployees = rawEmployees.filter((e) => !removals.has(e.id))
      }

      // Apply employee additions — fetch extra employees not at this site
      if (assumptions?.employee_additions && assumptions.employee_additions.length > 0) {
        const { data: extraEmps, error: extraErr } = await admin
          .from('employee')
          .select('id, employee_number, contract_type, weekly_hours_contracted, hourly_rate, home_site_id, is_multi_site_eligible, crew_id, job_role:job_role_id(hourly_rate)')
          .in('id', assumptions.employee_additions)
          .eq('organization_id', orgId)
          .eq('status', 'active')

        assertNoError(extraErr, 'scenario.run:extraEmployees')

        const existingIds = new Set(rawEmployees.map((e) => e.id))
        for (const e of (extraEmps ?? []) as Array<Record<string, unknown>>) {
          if (!existingIds.has(e.id as string)) {
            rawEmployees.push({
              id: e.id as string,
              employee_number: e.employee_number as string,
              contract_type: e.contract_type as RawEmployee['contract_type'],
              weekly_hours_contracted: e.weekly_hours_contracted as number,
              hourly_rate: (e.hourly_rate as number | null),
              home_site_id: e.home_site_id as string,
              is_multi_site_eligible: e.is_multi_site_eligible as boolean,
              crew_id: null,
              job_role_hourly_rate: ((e.job_role as Record<string, unknown> | null)?.hourly_rate as number | null) ?? null,
            })
          }
        }
      }

      const rawSkills: RawSkill[] = ((skillsResult.data ?? []) as Array<Record<string, unknown>>).map((s) => ({
        employee_id: s.employee_id as string,
        process_id: s.process_id as string,
        proficiency_level: s.proficiency_level as number,
        has_active_certification: s.expiry_date
          ? new Date(s.expiry_date as string) > new Date()
          : false,
        certification_expiry: (s.expiry_date as string) ?? null,
      }))

      const rotationSlots: RotationSlot[] = []

      const employees = buildEmployeeRecords(
        rawEmployees,
        rawSkills,
        rotationSlots,
        [],
        new Map(),
        new Map(),
      )

      // Build constraints
      const laborRuleRows: LaborRuleRow[] = ((laborRulesResult.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        rule_type: r.rule_type as string,
        parameters_json: r.parameters_json as Record<string, unknown>,
        severity: (r.severity as string) === 'hard_constraint' ? 'hard' as const : 'soft' as const,
      }))

      const laborRules = getLaborRules(laborRuleRows)
      const { hard, soft } = buildConstraints(laborRules)

      const objective: ObjectiveConfig = {
        minimize_cost_weight: 0.3,
        maximize_coverage_weight: 0.4,
        maximize_skill_match_weight: 0.2,
        minimize_overtime_weight: 0.1,
      }

      const solverInput = {
        site_id: siteId,
        planning_horizon: { start: periodStart, end: periodEnd },
        time_slots: allTimeSlots,
        demand,
        employees,
        hard_constraints: hard,
        soft_constraints: soft,
        locked_assignments: [],
        objective,
        time_budget_seconds: input.time_budget_seconds ?? 30,
        solver_config: {
          mode: 'balanced' as const,
          departments: [],
          processes: [],
          training_slots: {},
        },
      }

      // h. Run solver
      const solverOutput = solveGreedy(solverInput, laborRules)

      const validation = validateSolverOutput(solverOutput)
      if (!validation.valid) {
        // Mark scenario as draft again on failure
        await admin
          .from('scenario')
          .update({ status: 'draft' })
          .eq('id', input.scenario_id)

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: `Solver output validation failed: ${validation.errors.map((e) => e.message).join('; ')}`,
        })
      }

      // i. Write assignments to staging for the new plan_version
      const newAssignments = solverOutput.assignments.filter((a) => a.assignment_source === 'optimizer')

      if (newAssignments.length > 0) {
        const stagingRows = newAssignments.map((a) => {
          const parts = a.time_slot_id.split('_')
          const assignmentDate = parts[0]
          const shiftPatId = parts.slice(1).join('_')
          const shift = shiftDefs.find((s) => s.id === (shiftPatId || a.shift_pattern_id))

          const startTime = shift
            ? `${assignmentDate}T${shift.start_time}:00Z`
            : `${assignmentDate}T00:00:00Z`
          const endTime = shift
            ? `${assignmentDate}T${shift.end_time}:00Z`
            : `${assignmentDate}T23:59:00Z`

          return {
            organization_id: orgId,
            employee_id: a.employee_id,
            shift_pattern_id: shiftPatId || a.shift_pattern_id,
            site_id: siteId,
            process_id: a.process_id,
            assignment_date: assignmentDate,
            plan_version_id: newPlanVersionId,
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

        assertNoError(insertErr, 'scenario.run:insertStaging')
      }

      // j. Update plan_version status and metrics
      const { error: updatePlanErr } = await admin
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
        .eq('id', newPlanVersionId)

      assertNoError(updatePlanErr, 'scenario.run:updatePlanVersion')

      // k. Update scenario status to completed
      const { error: completeErr } = await admin
        .from('scenario')
        .update({
          status: 'completed',
          comparison_metrics_json: solverOutput.metrics,
        })
        .eq('id', input.scenario_id)

      assertNoError(completeErr, 'scenario.run:markCompleted')

      return {
        plan_version_id: newPlanVersionId,
        status: 'completed' as const,
        metrics: solverOutput.metrics,
        assignment_count: solverOutput.assignments.length,
        unmet_demand_count: solverOutput.unmet_demand.length,
        validation_warnings: validation.warnings,
      }
    }),

  // -------------------------------------------------------------------------
  // list — List scenarios for a base plan version
  // -------------------------------------------------------------------------
  list: plannerProcedure
    .input(z.object({ base_plan_version_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClientForUser(ctx.user.id)

      const { data, error } = await admin
        .from('scenario')
        .select('id, name, description, status, created_at, assumptions_json')
        .eq('parent_plan_version_id', input.base_plan_version_id)
        .eq('organization_id', ctx.organizationId)
        .order('created_at', { ascending: false })

      assertNoError(error, 'scenario.list')

      return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: row.id as string,
        name: row.name as string,
        description: (row.description as string) ?? null,
        status: row.status as string,
        created_at: row.created_at as string,
        assumptions_json: (row.assumptions_json as Record<string, unknown>) ?? {},
      }))
    }),

  // -------------------------------------------------------------------------
  // compare — Side-by-side metrics for two plan versions
  // -------------------------------------------------------------------------
  compare: viewerProcedure
    .input(
      z.object({
        plan_version_id_a: z.string().uuid(),
        plan_version_id_b: z.string().uuid(),
      })
    )
    .query(async ({ ctx, input }) => {
      const admin = createAdminClientForUser(ctx.user.id)
      const orgId = ctx.organizationId

      const [resultA, resultB] = await Promise.all([
        admin
          .from('plan_version')
          .select('id, name, status, summary_metrics_json')
          .eq('id', input.plan_version_id_a)
          .eq('organization_id', orgId)
          .single(),
        admin
          .from('plan_version')
          .select('id, name, status, summary_metrics_json')
          .eq('id', input.plan_version_id_b)
          .eq('organization_id', orgId)
          .single(),
      ])

      assertNoError(resultA.error, 'scenario.compare:fetchA')
      assertNoError(resultB.error, 'scenario.compare:fetchB')

      if (!resultA.data || !resultB.data) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'One or both plan versions not found' })
      }

      const a = resultA.data as Record<string, unknown>
      const b = resultB.data as Record<string, unknown>

      const metricsA = (a.summary_metrics_json as Record<string, unknown>) ?? {}
      const metricsB = (b.summary_metrics_json as Record<string, unknown>) ?? {}

      const costA = (metricsA.total_cost as number) ?? 0
      const costB = (metricsB.total_cost as number) ?? 0
      const coverageA = (metricsA.coverage_percentage as number) ?? 0
      const coverageB = (metricsB.coverage_percentage as number) ?? 0
      const overtimeA = (metricsA.overtime_hours as number) ?? 0
      const overtimeB = (metricsB.overtime_hours as number) ?? 0

      return {
        a: {
          plan_version_id: a.id as string,
          name: (a.name as string) ?? null,
          status: a.status as string,
          metrics: metricsA,
        },
        b: {
          plan_version_id: b.id as string,
          name: (b.name as string) ?? null,
          status: b.status as string,
          metrics: metricsB,
        },
        delta: {
          cost_diff: costB - costA,
          coverage_diff: coverageB - coverageA,
          overtime_diff: overtimeB - overtimeA,
        },
      }
    }),

  // -------------------------------------------------------------------------
  // promote — Copy scenario assignments to parent plan version staging
  // -------------------------------------------------------------------------
  promote: plannerProcedure
    .input(z.object({ scenario_id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClientForUser(ctx.user.id)
      const orgId = ctx.organizationId

      // a. Fetch scenario, verify completed status
      const { data: scenario, error: scenarioErr } = await admin
        .from('scenario')
        .select('id, parent_plan_version_id, status')
        .eq('id', input.scenario_id)
        .eq('organization_id', orgId)
        .single()

      assertNoError(scenarioErr, 'scenario.promote:fetchScenario')

      if (!scenario) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Scenario not found' })
      }

      const sc = scenario as Record<string, unknown>

      if (sc.status !== 'completed') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Scenario must be in completed status to promote. Current status: ${sc.status}`,
        })
      }

      const parentPlanVersionId = sc.parent_plan_version_id as string

      // b. Find the plan_version created for this scenario
      const { data: scenarioPlan, error: scenarioPlanErr } = await admin
        .from('plan_version')
        .select('id')
        .eq('scenario_id', input.scenario_id)
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      assertNoError(scenarioPlanErr, 'scenario.promote:fetchScenarioPlan')

      if (!scenarioPlan) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'No plan version found for this scenario' })
      }

      const scenarioPlanVersionId = (scenarioPlan as Record<string, unknown>).id as string

      // c. Fetch scenario plan_version's staging assignments
      const { data: staging, error: stagingErr } = await admin
        .from('shift_assignment_staging')
        .select('employee_id, shift_pattern_id, site_id, process_id, assignment_date, start_time, end_time, scheduled_hours, assignment_source, cost_estimate')
        .eq('plan_version_id', scenarioPlanVersionId)

      assertNoError(stagingErr, 'scenario.promote:fetchStaging')

      const stagingRows = (staging ?? []) as Array<Record<string, unknown>>

      // d. Delete existing non-locked staging rows from parent plan version
      const { error: deleteErr } = await admin
        .from('shift_assignment_staging')
        .delete()
        .eq('plan_version_id', parentPlanVersionId)
        .neq('assignment_source', 'locked')

      assertNoError(deleteErr, 'scenario.promote:deleteOldStaging')

      // e. Copy scenario assignments to parent plan version staging
      if (stagingRows.length > 0) {
        const promotedRows = stagingRows.map((row) => ({
          organization_id: orgId,
          employee_id: row.employee_id as string,
          shift_pattern_id: row.shift_pattern_id as string,
          site_id: row.site_id as string,
          process_id: row.process_id as string,
          assignment_date: row.assignment_date as string,
          plan_version_id: parentPlanVersionId,
          start_time: row.start_time as string,
          end_time: row.end_time as string,
          scheduled_hours: row.scheduled_hours as number,
          assignment_source: (row.assignment_source as string) ?? 'optimizer',
          cost_estimate: (row.cost_estimate as number) ?? 0,
          status: 'draft',
        }))

        const { error: insertErr } = await admin
          .from('shift_assignment_staging')
          .insert(promotedRows)

        assertNoError(insertErr, 'scenario.promote:insertStaging')
      }

      // f. Update parent plan_version status back to optimized with scenario metrics
      const { data: scenarioPlanFull, error: scenarioPlanFullErr } = await admin
        .from('plan_version')
        .select('summary_metrics_json')
        .eq('id', scenarioPlanVersionId)
        .single()

      assertNoError(scenarioPlanFullErr, 'scenario.promote:fetchMetrics')

      const scenarioMetrics = (scenarioPlanFull as Record<string, unknown> | null)?.summary_metrics_json ?? null

      const { error: updateParentErr } = await admin
        .from('plan_version')
        .update({
          status: 'optimized',
          summary_metrics_json: scenarioMetrics,
          updated_at: new Date().toISOString(),
        })
        .eq('id', parentPlanVersionId)

      assertNoError(updateParentErr, 'scenario.promote:updateParent')

      // g. Mark scenario as promoted
      const { error: promoteErr } = await admin
        .from('scenario')
        .update({ status: 'approved' })
        .eq('id', input.scenario_id)

      assertNoError(promoteErr, 'scenario.promote:markPromoted')

      return {
        scenario_id: input.scenario_id,
        parent_plan_version_id: parentPlanVersionId,
        assignments_copied: stagingRows.length,
        status: 'promoted' as const,
      }
    }),
})
