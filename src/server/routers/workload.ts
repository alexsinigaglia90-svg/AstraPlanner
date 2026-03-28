import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, plannerProcedure, viewerProcedure } from '../trpc'
import { computeWorkload } from '@/lib/workload/compute'
import { computeSupportFTE } from '@/lib/workload/support'
import { DEFAULT_WEEKLY_HOURS, PROFICIENCY_MULTIPLIERS } from '@/lib/workload/constants'
import { createAdminClient } from '@/lib/supabase/admin'
import type {
  DemandRow,
  ProcessOverride,
  EmployeeAvailability,
  ProcessProductivityStandard,
  SupportConfig,
  WorkloadResult,
} from '@/lib/workload/types'

export const workloadRouter = router({
  compute: plannerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        plan_version_id: z.string().uuid().nullable().default(null),
        period_start: z.string(),
        period_end: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // ── 1a. Fetch legacy demand (demand_type_id based) ─────────────────
      const { data: legacyForecasts, error: fErr } = await admin
        .from('demand_forecast')
        .select(`
          id, demand_type_id, volume, period_start, period_end,
          demand_type:demand_type_id(
            name,
            process_mappings:demand_type_process_mapping(process_id, conversion_ratio, process:process_id(name))
          )
        `)
        .eq('site_id', input.site_id)
        .not('demand_type_id', 'is', null)
        .gte('period_start', input.period_start)
        .lte('period_end', input.period_end)

      if (fErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fErr.message })

      // ── 1b. Fetch process-based demand (process_id, no demand_type) ────
      const { data: processForecasts, error: pfErr } = await admin
        .from('demand_forecast')
        .select('id, process_id, volume, period_start, period_end')
        .eq('site_id', input.site_id)
        .not('process_id', 'is', null)
        .is('demand_type_id', null)
        .gte('period_start', input.period_start)
        .lte('period_end', input.period_end)

      if (pfErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: pfErr.message })

      // ── 1c. Fetch process names for process-based demand ───────────────
      const processIds = [...new Set((processForecasts ?? []).map(f => f.process_id as string))]
      let processNameMap: Record<string, string> = {}
      if (processIds.length > 0) {
        const { data: processes } = await admin
          .from('process')
          .select('id, name')
          .in('id', processIds)
        for (const p of processes ?? []) {
          processNameMap[p.id as string] = p.name as string
        }
      }

      // ── 2. Build demands array from both paths ─────────────────────────
      const legacyDemands: DemandRow[] = (legacyForecasts ?? []).map(f => {
        const dt = f.demand_type as unknown as { name: string; process_mappings: unknown[] }
        return {
          demand_forecast_id: f.id,
          demand_type_id: f.demand_type_id,
          demand_type_name: dt?.name ?? '',
          volume: Number(f.volume) || 0,
          period_start: f.period_start,
          period_end: f.period_end,
          process_mappings: ((dt?.process_mappings ?? []) as unknown[]).map((pm: unknown) => {
            const m = pm as { process_id: string; conversion_ratio: number; process: { name: string } | null }
            return {
              process_id: m.process_id,
              process_name: m.process?.name ?? '',
              conversion_ratio: m.conversion_ratio,
            }
          }),
        }
      })

      const processDemands: DemandRow[] = (processForecasts ?? []).map(f => {
        const pid = f.process_id as string
        return {
          demand_forecast_id: f.id,
          demand_type_id: null,
          demand_type_name: processNameMap[pid] ?? pid,
          volume: Number(f.volume) || 0,
          period_start: f.period_start,
          period_end: f.period_end,
          process_mappings: [{
            process_id: pid,
            process_name: processNameMap[pid] ?? pid,
            conversion_ratio: 1.0,
          }],
        }
      })

      const demands: DemandRow[] = [...legacyDemands, ...processDemands]

      // ── 3. Fetch overrides (legacy path only) ──────────────────────────
      const legacyIds = legacyDemands.map(f => f.demand_forecast_id)
      const { data: overridesRaw } = legacyIds.length > 0
        ? await admin
            .from('demand_process_override')
            .select('demand_forecast_id, process_id, override_volume')
            .in('demand_forecast_id', legacyIds)
        : { data: [] }

      // ── 4. Fetch productivity standards for site ───────────────────────
      const { data: standards } = await admin
        .from('process_productivity_standard')
        .select('process_id, site_id, skill_level, units_per_hour')
        .eq('site_id', input.site_id)

      // ── A5: Auto-seed PPS from process.norm_uph ───────────────────────
      // Collect all process IDs from demands
      const allProcessIds = [...new Set(demands.flatMap(d => d.process_mappings.map(pm => pm.process_id)))]
      const existingPpsProcessIds = new Set((standards ?? []).map(s => s.process_id))
      const missingPpsProcessIds = allProcessIds.filter(pid => !existingPpsProcessIds.has(pid))

      let seededStandards: ProcessProductivityStandard[] = []

      if (missingPpsProcessIds.length > 0) {
        // Fetch norm_uph for processes missing PPS
        const { data: processNorms } = await admin
          .from('process')
          .select('id, norm_uph')
          .in('id', missingPpsProcessIds)

        const seedRows: Array<{
          organization_id: string
          process_id: string
          site_id: string
          skill_level: number
          units_per_hour: number
          unit_of_measure: string
          effective_date: string
          source: string
          created_by: string
        }> = []

        for (const proc of processNorms ?? []) {
          const normUph = proc.norm_uph as number
          if (!normUph || normUph <= 0) continue

          for (const [levelStr, multiplier] of Object.entries(PROFICIENCY_MULTIPLIERS)) {
            const level = Number(levelStr)
            const uph = Math.round(normUph * multiplier * 100) / 100
            seedRows.push({
              organization_id: ctx.organizationId,
              process_id: proc.id as string,
              site_id: input.site_id,
              skill_level: level,
              units_per_hour: uph,
              unit_of_measure: 'units',
              effective_date: new Date().toISOString().split('T')[0] ?? '',
              source: 'auto_seeded',
              created_by: ctx.user?.id ?? '',
            })
            seededStandards.push({
              process_id: proc.id as string,
              site_id: input.site_id,
              skill_level: level,
              units_per_hour: uph,
            })
          }
        }

        if (seedRows.length > 0) {
          await admin
            .from('process_productivity_standard')
            .upsert(seedRows, { onConflict: 'organization_id,process_id,site_id,skill_level,effective_date' })
        }
      }

      // Merge existing + seeded standards
      const allStandards: ProcessProductivityStandard[] = [
        ...(standards ?? []).map(s => ({
          process_id: s.process_id,
          site_id: s.site_id,
          skill_level: s.skill_level,
          units_per_hour: s.units_per_hour,
        })),
        ...seededStandards,
      ]

      // ── 5. Fetch employee skills + job role productive_pct ─────────────
      const { data: empSkills } = await admin
        .from('employee_skill')
        .select(`
          employee_id, process_id, proficiency_level,
          employee:employee_id(
            id, crew_id, weekly_hours_contracted,
            job_role:job_role_id(productive_pct)
          )
        `)
        .eq('status', 'active')

      // ── A7: Employee availability (fallback to contracted hours) ───────
      // Full rotation-based availability is deferred to Phase 5.
      // For now, use weekly_hours_contracted as available_hours.
      const employeeAvail: EmployeeAvailability[] = (empSkills ?? []).map(es => {
        const emp = es.employee as unknown as {
          id: string
          weekly_hours_contracted: number
          job_role: { productive_pct: number } | null
        }
        return {
          employee_id: es.employee_id,
          process_id: es.process_id,
          proficiency_level: es.proficiency_level,
          available_hours: emp?.weekly_hours_contracted ?? DEFAULT_WEEKLY_HOURS,
          productive_pct: emp?.job_role?.productive_pct ?? 0.95,
        }
      })

      // ── 6. Build typed inputs and call pure compute function ───────────
      const overrides: ProcessOverride[] = (overridesRaw ?? []).map(o => ({
        demand_forecast_id: o.demand_forecast_id,
        process_id: o.process_id,
        override_volume: Number(o.override_volume),
      }))

      const results = computeWorkload(demands, overrides, allStandards, employeeAvail, DEFAULT_WEEKLY_HOURS)

      // ── A6: Wire support FTE ───────────────────────────────────────────
      // Fetch supportive processes for this site's org
      const { data: supportProcesses } = await admin
        .from('process')
        .select('id, name, process_type, support_method, fixed_headcount, support_ratio_self, support_config_json')
        .eq('organization_id', ctx.organizationId)
        .eq('process_type', 'supportive')
        .eq('is_active', true)

      const supportResults: WorkloadResult[] = []

      if (supportProcesses && supportProcesses.length > 0) {
        // Build linked FTE map from productive results
        const linkedFteMap: Record<string, number> = {}
        for (const r of results) {
          linkedFteMap[r.process_id] = (linkedFteMap[r.process_id] ?? 0) + (r.fte_needed ?? 0)
        }

        // Unique periods from demands
        const periods = [...new Set(demands.map(d => `${d.period_start}|${d.period_end}`))]

        for (const proc of supportProcesses) {
          const configJson = proc.support_config_json as Record<string, unknown> | null
          const method = (proc.support_method as string) ?? (configJson?.method as string) ?? 'fixed_headcount'

          const config: SupportConfig = {
            method: method as SupportConfig['method'],
            fixed_count: (proc.fixed_headcount as number) ?? (configJson?.fixed_count as number) ?? 0,
            linked_process_ids: (configJson?.linked_process_ids as string[]) ?? [],
            ratio: (proc.support_ratio_self as number) ?? (configJson?.ratio as number) ?? 1,
            duration_hours: (configJson?.duration_hours as number) ?? 0,
            frequency_per_week: (configJson?.frequency_per_week as number) ?? 0,
          }

          const supportResult = computeSupportFTE(config, DEFAULT_WEEKLY_HOURS, linkedFteMap)

          for (const periodKey of periods) {
            const [pStart, pEnd] = periodKey.split('|')
            supportResults.push({
              process_id: proc.id as string,
              process_name: proc.name as string,
              period_start: pStart!,
              period_end: pEnd!,
              demand_volume: 0,
              conversion_ratio: 1,
              process_volume: 0,
              weighted_uph: null,
              hours_needed: supportResult.hours_needed,
              fte_needed: supportResult.fte_needed,
              hours_available: 0,
              fte_available: 0,
              coverage_pct: supportResult.fte_needed > 0 ? 0 : 100,
              status: 'computed',
            })
          }
        }
      }

      const allResults = [...results, ...supportResults]

      // ── 7. Write results into workload_plan ───────────────────────────
      // Delete old computed results for this site/period, then insert new
      if (allResults.length > 0) {
        const rows = allResults
          .filter(r => r.hours_needed !== null)
          .map(r => ({
            organization_id: ctx.organizationId,
            site_id: input.site_id,
            process_id: r.process_id,
            period_start: r.period_start,
            period_end: r.period_end,
            demand_volume: r.demand_volume,
            conversion_ratio: r.conversion_ratio,
            process_volume: r.process_volume,
            weighted_uph: r.weighted_uph,
            hours_needed: r.hours_needed,
            fte_needed: r.fte_needed,
            hours_assigned: r.hours_available ?? 0,
            fte_assigned: r.fte_available ?? 0,
            coverage_pct: r.coverage_pct,
            plan_version_id: input.plan_version_id,
            status: 'computed',
            computed_at: new Date().toISOString(),
          }))

        if (rows.length > 0) {
          // Delete existing results for this site/period range
          await admin
            .from('workload_plan')
            .delete()
            .eq('organization_id', ctx.organizationId)
            .eq('site_id', input.site_id)
            .gte('period_start', input.period_start)
            .lte('period_start', input.period_end)
            .is('plan_version_id', input.plan_version_id)

          // Insert fresh results
          const { error: insertErr } = await admin
            .from('workload_plan')
            .insert(rows)

          if (insertErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: insertErr.message })
        }
      }

      return allResults
    }),

  getForPlan: viewerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        period_start: z.string(),
        period_end: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('workload_plan')
        .select(`
          id, process_id, period_start, period_end,
          demand_volume, conversion_ratio, process_volume,
          weighted_uph, hours_needed, fte_needed,
          hours_assigned, fte_assigned, coverage_pct, status,
          process:process_id(name, category, type)
        `)
        .eq('site_id', input.site_id)
        .gte('period_start', input.period_start)
        .lte('period_end', input.period_end)
        .order('process_id')
        .order('period_start')

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data ?? []
    }),
})
