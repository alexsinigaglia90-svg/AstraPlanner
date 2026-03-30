import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, plannerProcedure, managerProcedure, viewerProcedure } from '../trpc'
import { createAdminClient } from '@/lib/supabase/admin'

function assertNoError(error: { message: string } | null, label: string): void {
  if (error) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `${label}: ${error.message}` })
  }
}

const sourceEnum = z.enum(['wms_import', 'oms_import', 'csv_upload', 'manual_entry', 'ai_forecast'])

export const demandRouter = router({
  listDemandTypes: viewerProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const { data, error } = await ctx.supabase
        .from('demand_type')
        .select(`
          id,
          name,
          unit_of_measure,
          process_mappings:demand_type_process_mapping(
            process_id,
            conversion_ratio,
            process:process_id(name)
          )
        `)

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return (data ?? []).map((dt) => ({
        id: dt.id,
        name: dt.name,
        unit_of_measure: dt.unit_of_measure,
        process_mappings: ((dt.process_mappings as unknown[]) ?? []).map((pm: unknown) => {
          const m = pm as { process_id: string; conversion_ratio: number; process: { name: string } | null }
          return {
            process_id: m.process_id,
            process_name: m.process?.name ?? '',
            conversion_ratio: m.conversion_ratio,
          }
        }),
      }))
    }),

  upsertDemandType: managerProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        name: z.string().min(1),
        unit_of_measure: z.string().min(1),
        process_mappings: z.array(
          z.object({
            process_id: z.string().uuid(),
            conversion_ratio: z.number().positive(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('demand_type')
        .upsert({
          ...(input.id ? { id: input.id } : {}),
          organization_id: ctx.organizationId,
          name: input.name,
          unit_of_measure: input.unit_of_measure,
        })
        .select('id, name, unit_of_measure, updated_at')
        .single()

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      if (input.process_mappings.length > 0) {
        if (input.id) {
          await ctx.supabase
            .from('demand_type_process_mapping')
            .delete()
            .eq('demand_type_id', data.id)
        }

        const { error: mappingError } = await ctx.supabase
          .from('demand_type_process_mapping')
          .insert(
            input.process_mappings.map((pm) => ({
              demand_type_id: data.id,
              process_id: pm.process_id,
              conversion_ratio: pm.conversion_ratio,
              organization_id: ctx.organizationId,
            }))
          )

        if (mappingError) {
          throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: mappingError.message })
        }
      }

      return data
    }),

  listForecasts: plannerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        period_start: z.string(),
        period_end: z.string(),
        demand_type_id: z.string().uuid().optional(),
        source: sourceEnum.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      let query = ctx.supabase
        .from('demand_forecast')
        .select(`
          id,
          site_id,
          demand_type_id,
          period_start,
          period_end,
          volume,
          unit_of_measure,
          source,
          confidence_interval,
          created_at,
          updated_at,
          demand_type:demand_type_id(name)
        `)
        .eq('organization_id', ctx.organizationId)
        .eq('site_id', input.site_id)
        .gte('period_start', input.period_start)
        .lte('period_end', input.period_end)

      if (input.demand_type_id) query = query.eq('demand_type_id', input.demand_type_id)
      if (input.source) query = query.eq('source', input.source)

      const { data, error } = await query

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return (data ?? []).map((f) => ({
        id: f.id,
        site_id: f.site_id,
        demand_type_id: f.demand_type_id,
        demand_type_name: (f.demand_type as unknown as { name: string } | null)?.name ?? '',
        period_start: f.period_start,
        period_end: f.period_end,
        volume: f.volume,
        unit_of_measure: f.unit_of_measure,
        source: f.source,
        confidence_interval: f.confidence_interval ?? null,
        created_at: f.created_at,
        updated_at: f.updated_at,
      }))
    }),

  upsertForecast: plannerProcedure
    .input(
      z.object({
        id: z.string().uuid().optional(),
        site_id: z.string().uuid(),
        demand_type_id: z.string().uuid(),
        period_start: z.string(),
        period_end: z.string(),
        volume: z.number().min(0),
        source: sourceEnum,
        confidence_interval: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('demand_forecast')
        .upsert({
          ...(input.id ? { id: input.id } : {}),
          organization_id: ctx.organizationId,
          site_id: input.site_id,
          demand_type_id: input.demand_type_id,
          period_start: input.period_start,
          period_end: input.period_end,
          volume: input.volume,
          source: input.source,
          ...(input.confidence_interval !== undefined ? { confidence_interval: input.confidence_interval } : {}),
        })
        .select('id, site_id, demand_type_id, period_start, period_end, volume, source, updated_at')
        .single()

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return data
    }),

  bulkUpsert: plannerProcedure
    .input(
      z.object({
        forecasts: z.array(
          z.object({
            id: z.string().uuid().optional(),
            site_id: z.string().uuid(),
            demand_type_id: z.string().uuid(),
            period_start: z.string(),
            period_end: z.string(),
            volume: z.number().min(0).max(999999),
            source: sourceEnum,
          })
        ).min(1).max(500),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('demand_forecast')
        .upsert(
          input.forecasts.map((f) => ({
            ...(f.id ? { id: f.id } : {}),
            site_id: f.site_id,
            demand_type_id: f.demand_type_id,
            period_start: f.period_start,
            period_end: f.period_end,
            volume: f.volume,
            source: f.source,
            organization_id: ctx.organizationId,
          })),
          { onConflict: 'organization_id,site_id,demand_type_id,period_start,period_end,plan_version_id' }
        )
        .select('id, demand_type_id, period_start, volume')

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return { upserted: data?.length ?? 0 }
    }),

  upsertOverride: plannerProcedure
    .input(
      z.object({
        demand_forecast_id: z.string().uuid(),
        process_id: z.string().uuid(),
        override_volume: z.number().min(0).max(999999).nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.override_volume === null) {
        const { error } = await ctx.supabase
          .from('demand_process_override')
          .delete()
          .eq('demand_forecast_id', input.demand_forecast_id)
          .eq('process_id', input.process_id)

        if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
        return { deleted: true }
      }

      const { data, error } = await ctx.supabase
        .from('demand_process_override')
        .upsert({
          demand_forecast_id: input.demand_forecast_id,
          process_id: input.process_id,
          override_volume: input.override_volume,
          organization_id: ctx.organizationId,
        }, { onConflict: 'demand_forecast_id,process_id' })
        .select('id')
        .single()

      if (error) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      return data
    }),

  importCSV: plannerProcedure
    .input(
      z.object({
        site_id: z.string().uuid(),
        file_url: z.string().url(),
        column_mapping: z.record(z.string()).optional(),
        dry_run: z.boolean().optional().default(false),
      })
    )
    .mutation(async ({ input }) => {
      // TODO: Phase 2 — fetch file from Supabase Storage, parse CSV, apply column_mapping, validate rows, upsert via demand.upsertForecast
      void input
      return {
        imported: 0,
        updated: 0,
        errors: [] as Array<{ row: number; field: string; message: string }>,
        dry_run: input.dry_run,
      }
    }),

  deleteForecasts: managerProcedure
    .input(
      z.object({
        ids: z.array(z.string().uuid()).min(1).max(100),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { error, count } = await ctx.supabase
        .from('demand_forecast')
        .delete({ count: 'exact' })
        .in('id', input.ids)

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

      return { deleted: count ?? 0 }
    }),

  // ── Process-based demand (direct entry, no demand types) ──────────────

  listProcessDemand: plannerProcedure
    .input(z.object({
      site_id: z.string().uuid(),
      period_start: z.string(),
      period_end: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const { data, error } = await admin
        .from('demand_forecast')
        .select('id, process_id, period_start, period_end, volume, unit_of_measure, source')
        .eq('organization_id', ctx.organizationId)
        .eq('site_id', input.site_id)
        .not('process_id', 'is', null)
        .gte('period_start', input.period_start)
        .lte('period_start', input.period_end)
        .order('period_start')
      assertNoError(error, 'listProcessDemand')
      return data ?? []
    }),

  /** Upsert a single day forecast */
  upsertProcessForecast: plannerProcedure
    .input(z.object({
      site_id: z.string().uuid(),
      process_id: z.string().uuid(),
      date: z.string(),
      volume: z.number().min(0).max(999999),
      unit_of_measure: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Check if record exists
      const { data: existing } = await admin
        .from('demand_forecast')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .eq('site_id', input.site_id)
        .eq('process_id', input.process_id)
        .eq('period_start', input.date)
        .is('plan_version_id', null)
        .maybeSingle()

      if (existing) {
        // Update
        const { data, error } = await admin
          .from('demand_forecast')
          .update({ volume: input.volume, unit_of_measure: input.unit_of_measure, source: 'manual_entry' })
          .eq('id', existing.id)
          .select('id')
          .single()
        assertNoError(error, 'upsertProcessForecast:update')
        return data!
      } else {
        // Insert
        const { data, error } = await admin
          .from('demand_forecast')
          .insert({
            organization_id: ctx.organizationId,
            site_id: input.site_id,
            process_id: input.process_id,
            demand_type_id: null,
            period_start: input.date,
            period_end: (() => { const d = new Date(input.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().split('T')[0]!; })(),
            volume: input.volume,
            unit_of_measure: input.unit_of_measure,
            source: 'manual_entry',
            plan_version_id: null,
          })
          .select('id')
          .single()
        assertNoError(error, 'upsertProcessForecast:insert')
        return data!
      }
    }),

  /** Upsert a week forecast — smart distributes over 7 days */
  upsertWeekForecast: plannerProcedure
    .input(z.object({
      site_id: z.string().uuid(),
      process_id: z.string().uuid(),
      week_start: z.string(), // Monday ISO date
      volume: z.number().min(0).max(9999999),
      unit_of_measure: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const monday = new Date(input.week_start + 'T00:00:00Z')

      // Look for previous week pattern for smart distribute
      const prevMonday = new Date(monday)
      prevMonday.setUTCDate(prevMonday.getUTCDate() - 7)

      const { data: prevWeek } = await admin
        .from('demand_forecast')
        .select('period_start, volume')
        .eq('organization_id', ctx.organizationId)
        .eq('site_id', input.site_id)
        .eq('process_id', input.process_id)
        .gte('period_start', prevMonday.toISOString().split('T')[0]!)
        .lt('period_start', input.week_start)
        .order('period_start')

      // Calculate distribution ratios
      let ratios: number[]
      const prevTotal = (prevWeek ?? []).reduce((s, r) => s + Number(r.volume), 0)

      if (prevWeek && prevWeek.length === 7 && prevTotal > 0) {
        // Smart distribute: use previous week's pattern
        ratios = prevWeek.map((r) => Number(r.volume) / prevTotal)
      } else {
        // Default: even over Mon-Fri, 0 on Sat/Sun
        ratios = [0.2, 0.2, 0.2, 0.2, 0.2, 0, 0]
      }

      // Upsert 7 day records (select + update/insert pattern for NULL plan_version_id)
      for (let i = 0; i < 7; i++) {
        const date = new Date(monday)
        date.setUTCDate(date.getUTCDate() + i)
        const dateStr = date.toISOString().split('T')[0]!
        const dayVolume = Math.round(input.volume * ratios[i]!)

        const { data: existing } = await admin
          .from('demand_forecast')
          .select('id')
          .eq('organization_id', ctx.organizationId)
          .eq('site_id', input.site_id)
          .eq('process_id', input.process_id)
          .eq('period_start', dateStr)
          .is('plan_version_id', null)
          .maybeSingle()

        if (existing) {
          const { error } = await admin
            .from('demand_forecast')
            .update({ volume: dayVolume, unit_of_measure: input.unit_of_measure, source: 'manual_entry' })
            .eq('id', existing.id)
          assertNoError(error, `upsertWeekForecast:update:${dateStr}`)
        } else {
          const { error } = await admin
            .from('demand_forecast')
            .insert({
              organization_id: ctx.organizationId,
              site_id: input.site_id,
              process_id: input.process_id,
              demand_type_id: null,
              period_start: dateStr,
              period_end: (() => { const dd = new Date(dateStr + 'T00:00:00Z'); dd.setUTCDate(dd.getUTCDate() + 1); return dd.toISOString().split('T')[0]!; })(),
              volume: dayVolume,
              unit_of_measure: input.unit_of_measure,
              source: 'manual_entry',
              plan_version_id: null,
            })
          assertNoError(error, `upsertWeekForecast:insert:${dateStr}`)
        }
      }

      return { distributed: 7, total: input.volume }
    }),
})
