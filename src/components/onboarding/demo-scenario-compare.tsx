'use client'

import { motion } from 'framer-motion'
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react'
import { containerStagger, fadeInUp, bouncy } from '@/lib/motion'
import { demoPlanNormal, demoPlanPeak, demoPlanAbsence } from './demo-seed-plans'
import type { DemoPlanVersion } from './demo-seed-plans'

// ── Types ────────────────────────────────────────────────────────────────────

interface ScenarioCompareProps {
  leftScenario?: 'normal' | 'peak' | 'absence'
  rightScenario?: 'normal' | 'peak' | 'absence'
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const PLANS: Record<string, DemoPlanVersion> = {
  normal: demoPlanNormal,
  peak: demoPlanPeak,
  absence: demoPlanAbsence,
}

const SCENARIO_LABELS: Record<string, string> = {
  normal: 'Normaal (Wk10)',
  peak: 'Piek (Wk12)',
  absence: 'Verzuim (Wk13)',
}

function getMetric(plan: DemoPlanVersion, key: string): number {
  return (plan.summary_metrics_json[key] as number) ?? 0
}

function formatCost(v: number): string {
  return `\u20AC${v.toLocaleString('nl-NL')}`
}

function DeltaBadge({ value, suffix, inverted }: { value: number; suffix?: string; inverted?: boolean }) {
  const isPositive = inverted ? value < 0 : value > 0
  const color = isPositive ? '#059669' : '#EF4444'
  const bg = isPositive ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'
  const Icon = isPositive ? TrendingUp : TrendingDown
  const sign = value > 0 ? '+' : ''

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 8px',
        borderRadius: 6,
        background: bg,
        color,
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <Icon size={10} />
      {sign}{Math.round(value)}{suffix ?? ''}
    </span>
  )
}

// ── Metric row ───────────────────────────────────────────────────────────────

function MetricRow({
  label,
  leftValue,
  rightValue,
  format,
  suffix,
  inverted,
}: {
  label: string
  leftValue: number
  rightValue: number
  format?: (v: number) => string
  suffix?: string
  inverted?: boolean
}) {
  const fmt = format ?? ((v: number) => `${Math.round(v)}${suffix ?? ''}`)
  const delta = rightValue - leftValue

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr auto',
        alignItems: 'center',
        gap: 12,
        padding: '10px 0',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: 'var(--foreground)' }}>
          {fmt(leftValue)}
        </span>
      </div>
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, color: 'var(--muted-foreground)', textAlign: 'center', minWidth: 80 }}>
        {label}
      </span>
      <div>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: 'var(--foreground)' }}>
          {fmt(rightValue)}
        </span>
      </div>
      <div style={{ minWidth: 70 }}>
        <DeltaBadge value={delta} suffix={suffix} inverted={inverted} />
      </div>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function DemoScenarioCompare({
  leftScenario = 'normal',
  rightScenario = 'absence',
}: ScenarioCompareProps) {
  const left = PLANS[leftScenario]!
  const right = PLANS[rightScenario]!

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{
        padding: '24px 28px',
        borderRadius: 20,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
      }}
    >
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            fontWeight: 700,
            color: 'var(--primary)',
            padding: '4px 14px',
            borderRadius: 8,
            background: 'rgba(99,102,241,0.08)',
          }}
        >
          {SCENARIO_LABELS[leftScenario]}
        </span>
        <ArrowRight size={16} style={{ color: 'var(--muted-foreground)' }} />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 15,
            fontWeight: 700,
            color: '#D97706',
            padding: '4px 14px',
            borderRadius: 8,
            background: 'rgba(245,158,11,0.08)',
          }}
        >
          {SCENARIO_LABELS[rightScenario]}
        </span>
      </motion.div>

      {/* Metrics comparison */}
      <motion.div variants={fadeInUp}>
        <MetricRow
          label="Dekking"
          leftValue={getMetric(left, 'coverage_percentage')}
          rightValue={getMetric(right, 'coverage_percentage')}
          suffix="%"
        />
        <MetricRow
          label="Kosten/wk"
          leftValue={getMetric(left, 'total_cost')}
          rightValue={getMetric(right, 'total_cost')}
          format={formatCost}
          inverted
        />
        <MetricRow
          label="Overwerk"
          leftValue={getMetric(left, 'overtime_hours')}
          rightValue={getMetric(right, 'overtime_hours')}
          suffix="u"
          inverted
        />
      </motion.div>
    </motion.div>
  )
}
