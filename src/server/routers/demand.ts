import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, plannerProcedure, managerProcedure, viewerProcedure } from '../trpc'

const sourceEnum = z.enum(['wms_import', 'csv_upload', 'manual_entry', 'ai_forecast'])

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
          confidence,
          created_at,
          updated_at,
          demand_type:demand_type_id(name)
        `)
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
        confidence: f.confidence ?? null,
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
        confidence: z.number().min(0).max(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { data, error } = await ctx.supabase
        .from('demand_forecast')
        .upsert({
          ...(input.id ? { id: input.id } : {}),
          site_id: input.site_id,
          demand_type_id: input.demand_type_id,
          period_start: input.period_start,
          period_end: input.period_end,
          volume: input.volume,
          source: input.source,
          ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        })
        .select('id, site_id, demand_type_id, period_start, period_end, volume, source, updated_at')
        .single()

      if (error) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: error.message })
      }

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
})
