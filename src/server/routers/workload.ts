import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, plannerProcedure, viewerProcedure } from '../trpc'
import { computeWorkload } from '@/lib/workload/compute'
import { DEFAULT_WEEKLY_HOURS } from '@/lib/workload/constants'
import type { DemandRow, ProcessOverride, EmployeeAvailability, ProcessProductivityStandard } from '@/lib/workload/types'

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
      // 1. Fetch demand forecasts for period
      const { data: forecasts, error: fErr } = await ctx.supabase
        .from('demand_forecast')
        .select(`
          id, demand_type_id, volume, period_start, period_end,
          demand_type:demand_type_id(
            name,
            process_mappings:demand_type_process_mapping(process_id, conversion_ratio, process:process_id(name))
          )
        `)
        .eq('site_id', input.site_id)
        .gte('period_start', input.period_start)
        .lte('period_end', input.period_end)

      if (fErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: fErr.message })

      // 2. Fetch overrides
      const forecastIds = (forecasts ?? []).map(f => f.id)
      const { data: overridesRaw } = forecastIds.length > 0
        ? await ctx.supabase
            .from('demand_process_override')
            .select('demand_forecast_id, process_id, override_volume')
            .in('demand_forecast_id', forecastIds)
        : { data: [] }

      // 3. Fetch productivity standards for site
      const { data: standards } = await ctx.supabase
        .from('process_productivity_standard')
        .select('process_id, site_id, skill_level, units_per_hour')
        .eq('site_id', input.site_id)

      // 4. Fetch employee skills + job role productive_pct
      const { data: empSkills } = await ctx.supabase
        .from('employee_skill')
        .select(`
          employee_id, process_id, proficiency_level,
          employee:employee_id(
            id, crew_id, weekly_hours_contracted,
            job_role:job_role_id(productive_pct)
          )
        `)
        .eq('status', 'active')

      // 5. Build typed inputs and call pure compute function
      const demands: DemandRow[] = (forecasts ?? []).map(f => {
        const dt = f.demand_type as unknown as { name: string; process_mappings: unknown[] }
        return {
          demand_forecast_id: f.id,
          demand_type_id: f.demand_type_id,
          demand_type_name: dt?.name ?? '',
          volume: f.volume,
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

      const overrides: ProcessOverride[] = (overridesRaw ?? []).map(o => ({
        demand_forecast_id: o.demand_forecast_id,
        process_id: o.process_id,
        override_volume: Number(o.override_volume),
      }))

      const employeeAvail: EmployeeAvailability[] = (empSkills ?? []).map(es => {
        const emp = es.employee as unknown as { id: string; weekly_hours_contracted: number; job_role: { productive_pct: number } | null }
        return {
          employee_id: es.employee_id,
          process_id: es.process_id,
          proficiency_level: es.proficiency_level,
          available_hours: emp?.weekly_hours_contracted ?? DEFAULT_WEEKLY_HOURS,
          productive_pct: emp?.job_role?.productive_pct ?? 0.95,
        }
      })

      const pps: ProcessProductivityStandard[] = (standards ?? []).map(s => ({
        process_id: s.process_id,
        site_id: s.site_id,
        skill_level: s.skill_level,
        units_per_hour: s.units_per_hour,
      }))

      const results = computeWorkload(demands, overrides, pps, employeeAvail, DEFAULT_WEEKLY_HOURS)

      // 6. Upsert results into workload_plan
      if (results.length > 0) {
        const rows = results
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
            hours_assigned: 0,
            fte_assigned: 0,
            coverage_pct: r.coverage_pct,
            plan_version_id: input.plan_version_id,
            status: 'computed',
            computed_at: new Date().toISOString(),
          }))

        if (rows.length > 0) {
          const { error: upsertErr } = await ctx.supabase
            .from('workload_plan')
            .upsert(rows, { onConflict: 'organization_id,site_id,process_id,period_start,period_end,plan_version_id' })

          if (upsertErr) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: upsertErr.message })
        }
      }

      return results
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
