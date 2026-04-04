'use client'

import { motion } from 'framer-motion'
import { bouncy, containerStagger, fadeInUp } from '@/lib/motion'
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

  const isLoading = !isDemo && (riskRadar.isLoading || staticInsights.isLoading)

  if (!activeSiteId) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)' }}>Selecteer een locatie om insights te bekijken.</p>
      </div>
    )
  }

  if (isLoading) {
    return <InsightsSkeleton />
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

// ── Premium Loading Skeleton ────────────────────────────────────────────────

function Pulse({ width = '100%', height = 10, radius = 6, delay = 0 }: {
  width?: string | number; height?: number; radius?: number; delay?: number
}) {
  return (
    <motion.div
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay }}
      style={{
        width, height, borderRadius: radius,
        background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.15) 50%, rgba(99,102,241,0.08) 100%)',
      }}
    />
  )
}

function GlassCard({ children, h }: { children: React.ReactNode; h: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...bouncy }}
      style={{
        background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.6)', borderRadius: 20,
        padding: 20, minHeight: h, overflow: 'hidden',
      }}
    >
      {children}
    </motion.div>
  )
}

function InsightsSkeleton() {
  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      {/* Row 1: Risk Radar + AI Panel */}
      <motion.div variants={fadeInUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <GlassCard h={240}>
          <Pulse width="35%" height={14} />
          <Pulse width="55%" height={10} delay={0.1} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 20 }}>
            <motion.div
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                width: 140, height: 140, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(99,102,241,0.12))',
              }}
            />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Pulse width="70%" delay={0.15} />
              <Pulse width="85%" delay={0.2} />
              <Pulse width="60%" delay={0.25} />
              <Pulse width="75%" delay={0.3} />
              <Pulse width="50%" delay={0.35} />
            </div>
          </div>
        </GlassCard>
        <GlassCard h={240}>
          <Pulse width="30%" height={14} />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Pulse width="100%" height={52} radius={10} delay={0.1} />
            <Pulse width="100%" height={52} radius={10} delay={0.2} />
            <Pulse width="100%" height={40} radius={10} delay={0.3} />
          </div>
        </GlassCard>
      </motion.div>

      {/* Row 2: 3 charts */}
      <motion.div variants={fadeInUp} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {[0, 1, 2].map((i) => (
          <GlassCard key={i} h={190}>
            <Pulse width="40%" height={12} delay={i * 0.1} />
            <Pulse width="25%" height={9} delay={i * 0.1 + 0.05} />
            <div style={{ marginTop: 14 }}>
              <Pulse width="100%" height={120} radius={12} delay={i * 0.1 + 0.1} />
            </div>
          </GlassCard>
        ))}
      </motion.div>

      {/* Row 3: Signal feed */}
      <motion.div variants={fadeInUp}>
        <GlassCard h={100}>
          <Pulse width="22%" height={12} />
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
            {[0, 1, 2, 3, 4].map((i) => (
              <Pulse key={i} width="100%" height={56} radius={12} delay={i * 0.08} />
            ))}
          </div>
        </GlassCard>
      </motion.div>
    </motion.div>
  )
}
