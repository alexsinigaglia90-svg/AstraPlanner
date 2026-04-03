import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { router, supervisorProcedure } from '../trpc'
import { createAdminClient } from '@/lib/supabase/admin'
import { calculateRiskRadar, generateStaticInsights } from '@/lib/insights/correlator'
import { fetchRivm } from '@/lib/insights/sources/rivm'
import { fetchKnmi } from '@/lib/insights/sources/knmi'
import { fetchPollen } from '@/lib/insights/sources/pollen'
import { fetchVakanties } from '@/lib/insights/sources/vakanties'
import { fetchCbs } from '@/lib/insights/sources/cbs'
import type { ExternalSignal } from '@/lib/insights/types'

function assertNoError(error: { message: string } | null, label: string): void {
  if (error) {
    throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: `${label}: ${error.message}` })
  }
}

export const insightsRouter = router({
  /** Get latest external signals from DB */
  getSignals: supervisorProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx }) => {
      const admin = createAdminClient()

      // Get signals for this org + landelijk (org_id IS NULL)
      const { data, error } = await admin
        .from('external_signal')
        .select('*')
        .or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`)
        .order('fetched_at', { ascending: false })
        .limit(50)

      assertNoError(error, 'getSignals')

      // Deduplicate: keep latest per source+signal_type+region
      const seen = new Map<string, ExternalSignal>()
      for (const row of data ?? []) {
        const key = `${row.source}:${row.signal_type}:${row.region ?? 'all'}`
        if (!seen.has(key)) {
          seen.set(key, row as unknown as ExternalSignal)
        }
      }

      return Array.from(seen.values())
    }),

  /** Get risk radar with 5 dimensions + overall score */
  getRiskRadar: supervisorProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx }) => {
      const admin = createAdminClient()

      // 1. Get latest signals
      const { data: signals, error: sigErr } = await admin
        .from('external_signal')
        .select('*')
        .or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`)
        .order('fetched_at', { ascending: false })
        .limit(50)

      assertNoError(sigErr, 'getRiskRadar:signals')

      // Deduplicate
      const seen = new Map<string, ExternalSignal>()
      for (const row of signals ?? []) {
        const key = `${row.source}:${row.signal_type}`
        if (!seen.has(key)) seen.set(key, row as unknown as ExternalSignal)
      }
      const latestSignals = Array.from(seen.values())

      // 2. Get current absence rate for this org
      const today = new Date().toISOString().slice(0, 10)
      const { count: activeAbsences } = await admin
        .from('employee_availability_override')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('override_type', 'absence')
        .neq('status', 'cancelled')
        .gte('end_date', today)

      const { count: totalEmployees } = await admin
        .from('employee')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)

      const currentPct = totalEmployees && totalEmployees > 0
        ? ((activeAbsences ?? 0) / totalEmployees) * 100
        : 0

      // 3. Get same-week-last-year rate (simplified: count absences from 52 weeks ago)
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)
      const oneYearAgoStr = oneYearAgo.toISOString().slice(0, 10)
      const weekLater = new Date(oneYearAgo)
      weekLater.setDate(weekLater.getDate() + 7)

      const { count: historicalAbsences } = await admin
        .from('employee_availability_override')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('override_type', 'absence')
        .neq('status', 'cancelled')
        .gte('end_date', oneYearAgoStr)
        .lte('start_date', weekLater.toISOString().slice(0, 10))

      const historicalPct = totalEmployees && totalEmployees > 0
        ? ((historicalAbsences ?? 0) / totalEmployees) * 100
        : null

      return calculateRiskRadar(latestSignals, currentPct, historicalPct)
    }),

  /** 12-month trend: internal absence vs national average */
  getTrend: supervisorProcedure
    .input(z.object({ site_id: z.string().uuid(), months: z.number().int().min(1).max(24).default(12) }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Calculate monthly absence rate for the org
      const internal: Array<{ month: string; value: number }> = []
      const now = new Date()

      for (let i = input.months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const monthStart = d.toISOString().slice(0, 10)
        const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10)
        const monthLabel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

        const { count: absences } = await admin
          .from('employee_availability_override')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', ctx.organizationId)
          .eq('override_type', 'absence')
          .neq('status', 'cancelled')
          .lte('start_date', monthEnd)
          .gte('end_date', monthStart)

        const { count: employees } = await admin
          .from('employee')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', ctx.organizationId)

        const pct = employees && employees > 0 ? ((absences ?? 0) / employees) * 100 : 0
        internal.push({ month: monthLabel, value: Math.round(pct * 10) / 10 })
      }

      // National trend: use CBS data from external_signal or fallback to seasonal estimates
      const { data: cbsSignals } = await admin
        .from('external_signal')
        .select('value, period_start')
        .eq('source', 'cbs')
        .eq('signal_type', 'sector_verzuim_pct')
        .order('period_start', { ascending: true })
        .limit(8)

      const national = internal.map((point) => {
        // Find closest CBS data point
        const cbs = cbsSignals?.find((s) => s.period_start?.startsWith(point.month.slice(0, 4)))
        return { month: point.month, value: cbs ? Number(cbs.value) : 4.8 }
      })

      return { internal, national }
    }),

  /** Department absence % vs sector benchmark */
  getBenchmark: supervisorProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()
      const today = new Date().toISOString().slice(0, 10)

      // Get departments for this site
      const { data: departments, error: deptErr } = await admin
        .from('department')
        .select('id, name')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)

      assertNoError(deptErr, 'getBenchmark:departments')

      // Get sector benchmark
      const { data: cbsData } = await admin
        .from('external_signal')
        .select('value')
        .eq('source', 'cbs')
        .eq('signal_type', 'sector_verzuim_pct')
        .order('fetched_at', { ascending: false })
        .limit(1)
        .single()

      const sectorAvg = cbsData ? Number(cbsData.value) : 4.8

      // Calculate per-department absence rate
      const deptBenchmarks = await Promise.all(
        (departments ?? []).map(async (dept: { id: string; name: string }) => {
          // Count employees in department
          const { count: deptEmployees } = await admin
            .from('employee')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', ctx.organizationId)
            .eq('department_id', dept.id)

          // Count active absences in department
          const { data: deptEmps } = await admin
            .from('employee')
            .select('id')
            .eq('organization_id', ctx.organizationId)
            .eq('department_id', dept.id)

          const empIds = (deptEmps ?? []).map((e: { id: string }) => e.id)

          let absenceCount = 0
          if (empIds.length > 0) {
            const { count } = await admin
              .from('employee_availability_override')
              .select('id', { count: 'exact', head: true })
              .eq('organization_id', ctx.organizationId)
              .eq('override_type', 'absence')
              .neq('status', 'cancelled')
              .gte('end_date', today)
              .in('employee_id', empIds)

            absenceCount = count ?? 0
          }

          const pct = deptEmployees && deptEmployees > 0
            ? Math.round(((absenceCount) / deptEmployees) * 1000) / 10
            : 0

          const diff = pct - sectorAvg
          const status = diff > 1.5 ? 'above' as const : diff > -0.5 ? 'within' as const : 'below' as const

          return {
            department_id: dept.id,
            department_name: dept.name,
            absence_pct: pct,
            status,
          }
        })
      )

      return { departments: deptBenchmarks, sectorAvg }
    }),

  /** Sankey flow data: external factors -> department impact */
  getImpactFlow: supervisorProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const admin = createAdminClient()

      // Get departments
      const { data: departments } = await admin
        .from('department')
        .select('id, name')
        .eq('site_id', input.site_id)
        .eq('organization_id', ctx.organizationId)

      const depts = departments ?? []

      // Source nodes: active risk factors
      const { data: signals } = await admin
        .from('external_signal')
        .select('*')
        .or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`)
        .order('fetched_at', { ascending: false })
        .limit(30)

      // Identify active sources (severity > low)
      const activeSources = new Map<string, number>()
      for (const s of signals ?? []) {
        if (s.severity && s.severity !== 'low' && !activeSources.has(s.source)) {
          activeSources.set(s.source, Number(s.value))
        }
      }

      const sourceLabels: Record<string, string> = {
        rivm: 'Griep',
        pollen: 'Pollen',
        knmi: 'Weer',
        vakanties: 'Vakantie',
        cbs: 'Benchmark',
      }

      const sourceNodes = Array.from(activeSources.keys()).map((src) => ({
        name: sourceLabels[src] ?? src,
        category: 'source' as const,
      }))

      const targetNodes = depts.map((d: { name: string }) => ({
        name: d.name,
        category: 'target' as const,
      }))

      const nodes = [...sourceNodes, ...targetNodes]

      // Generate links: each source impacts each department proportionally
      // In V1, distribute impact evenly across departments (V2: use historical correlation)
      const links: Array<{ source: number; target: number; value: number }> = []
      const sourceOffset = 0
      const targetOffset = sourceNodes.length

      const sourceKeys = Array.from(activeSources.keys())
      for (let si = 0; si < sourceNodes.length; si++) {
        const sourceKey = sourceKeys[si] as string
        const sourceValue = activeSources.get(sourceKey) ?? 50

        for (let ti = 0; ti < targetNodes.length; ti++) {
          // Distribute value across departments with slight variance for visual interest
          const base = sourceValue / targetNodes.length
          const variance = base * 0.3 * (Math.sin(si * 7 + ti * 13) + 0.5)
          const value = Math.max(1, Math.round(base + variance))
          links.push({ source: sourceOffset + si, target: targetOffset + ti, value })
        }
      }

      return { nodes, links }
    }),

  /** Pre-computed static insights */
  getStaticInsights: supervisorProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .query(async ({ ctx }) => {
      const admin = createAdminClient()
      const today = new Date().toISOString().slice(0, 10)

      // Get signals
      const { data: signals } = await admin
        .from('external_signal')
        .select('*')
        .or(`organization_id.eq.${ctx.organizationId},organization_id.is.null`)
        .order('fetched_at', { ascending: false })
        .limit(50)

      const seen = new Map<string, ExternalSignal>()
      for (const row of signals ?? []) {
        const key = `${row.source}:${row.signal_type}`
        if (!seen.has(key)) seen.set(key, row as unknown as ExternalSignal)
      }
      const latestSignals = Array.from(seen.values())

      // Get current absence rate
      const { count: activeAbsences } = await admin
        .from('employee_availability_override')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)
        .eq('override_type', 'absence')
        .neq('status', 'cancelled')
        .gte('end_date', today)

      const { count: totalEmployees } = await admin
        .from('employee')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', ctx.organizationId)

      const currentPct = totalEmployees && totalEmployees > 0
        ? ((activeAbsences ?? 0) / totalEmployees) * 100
        : 0

      // Get sector benchmark
      const cbsSignal = latestSignals.find((s) => s.source === 'cbs')
      const sectorPct = cbsSignal ? cbsSignal.value : 4.8

      const riskRadar = calculateRiskRadar(latestSignals, currentPct, null)
      return generateStaticInsights(latestSignals, riskRadar, currentPct, sectorPct)
    }),

  /** Trigger manual data refresh -- fetches all sources, writes to DB */
  refreshSignals: supervisorProcedure
    .input(z.object({ site_id: z.string().uuid() }))
    .mutation(async ({ ctx }) => {
      const admin = createAdminClient()
      const errors: string[] = []
      let refreshed = 0

      // Fetch all sources in parallel
      const [rivmData, knmiData, pollenData, vakantieData, cbsData] = await Promise.allSettled([
        fetchRivm(),
        fetchKnmi(),
        fetchPollen(),
        fetchVakanties(),
        fetchCbs(),
      ])

      const allSignals = [
        ...(rivmData.status === 'fulfilled' ? rivmData.value : (errors.push('RIVM fetch failed'), [])),
        ...(knmiData.status === 'fulfilled' ? knmiData.value : (errors.push('KNMI fetch failed'), [])),
        ...(pollenData.status === 'fulfilled' ? pollenData.value : (errors.push('Pollen fetch failed'), [])),
        ...(vakantieData.status === 'fulfilled' ? vakantieData.value : (errors.push('Vakanties fetch failed'), [])),
        ...(cbsData.status === 'fulfilled' ? cbsData.value : (errors.push('CBS fetch failed'), [])),
      ]

      // Insert into external_signal (old ones stay as history)
      for (const signal of allSignals) {
        const { error } = await admin
          .from('external_signal')
          .insert({
            source: signal.source,
            signal_type: signal.signal_type,
            value: signal.value,
            severity: signal.severity,
            region: signal.region,
            period_start: signal.period_start,
            period_end: signal.period_end,
            metadata: signal.metadata,
            organization_id: null, // landelijk data
          })

        if (error) {
          errors.push(`Insert ${signal.source}/${signal.signal_type}: ${error.message}`)
        } else {
          refreshed++
        }
      }

      return { refreshed, errors }
    }),
})
