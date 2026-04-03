'use client'

import { motion } from 'framer-motion'
import { containerStagger, fadeInUp } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useDemoStore } from '@/hooks/use-demo'
import { InsightsRiskRadar } from './insights-risk-radar'
import { InsightsAiPanel } from './insights-ai-panel'
import { InsightsTrendChart } from './insights-trend-chart'
import { InsightsBenchmark } from './insights-benchmark'
import { InsightsImpactFlow } from './insights-impact-flow'
import { InsightsSignalFeed } from './insights-signal-feed'
import {
  DEMO_SIGNALS, DEMO_RISK_RADAR, DEMO_INSIGHTS,
  DEMO_TREND, DEMO_BENCHMARK, DEMO_IMPACT_FLOW,
} from '@/hooks/use-demo-insights'

export function InsightsTab() {
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const siteId = activeSiteId ?? ''

  const queryOpts = { enabled: !!activeSiteId && !isDemo, staleTime: 15 * 60 * 1000 }

  const signals = trpc.insights.getSignals.useQuery({ site_id: siteId }, queryOpts)
  const riskRadar = trpc.insights.getRiskRadar.useQuery({ site_id: siteId }, queryOpts)
  const trend = trpc.insights.getTrend.useQuery({ site_id: siteId }, queryOpts)
  const benchmark = trpc.insights.getBenchmark.useQuery({ site_id: siteId }, queryOpts)
  const impactFlow = trpc.insights.getImpactFlow.useQuery({ site_id: siteId }, queryOpts)
  const staticInsights = trpc.insights.getStaticInsights.useQuery({ site_id: siteId }, queryOpts)

  const refreshMutation = trpc.insights.refreshSignals.useMutation({
    onSuccess: () => {
      void signals.refetch()
      void riskRadar.refetch()
      void trend.refetch()
      void benchmark.refetch()
      void impactFlow.refetch()
      void staticInsights.refetch()
    },
  })

  // Use demo data or live data
  const signalData = isDemo ? DEMO_SIGNALS : (signals.data ?? [])
  const radarData = isDemo ? DEMO_RISK_RADAR : riskRadar.data
  const trendData = isDemo ? DEMO_TREND : trend.data
  const benchmarkData = isDemo ? DEMO_BENCHMARK : benchmark.data
  const flowData = isDemo ? DEMO_IMPACT_FLOW : impactFlow.data
  const insightData = isDemo ? DEMO_INSIGHTS : (staticInsights.data ?? [])
  const lastUpdated = signalData[0]?.fetched_at ?? null

  if (!activeSiteId) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Selecteer een locatie om insights te bekijken.</p>
      </div>
    )
  }

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* Row 1: Risk Radar + AI Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {radarData && <InsightsRiskRadar data={radarData} />}
        <InsightsAiPanel insights={insightData} siteId={siteId} isDemo={isDemo} />
      </div>

      {/* Row 2: Trend + Benchmark + Impact Flow */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {trendData && <InsightsTrendChart internal={trendData.internal} national={trendData.national} />}
        {benchmarkData && <InsightsBenchmark departments={benchmarkData.departments} sectorAvg={benchmarkData.sectorAvg} />}
        {flowData && <InsightsImpactFlow data={flowData} />}
      </div>

      {/* Row 3: External Signal Feed */}
      <InsightsSignalFeed
        signals={signalData}
        lastUpdated={lastUpdated}
        onRefresh={() => refreshMutation.mutate({ site_id: siteId })}
        isRefreshing={refreshMutation.isPending}
      />
    </motion.div>
  )
}
