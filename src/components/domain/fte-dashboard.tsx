'use client'

import { useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { trpc } from '@/lib/trpc/client'
import { containerStagger, fadeInUp, bouncy } from '@/lib/motion'
import { useToast } from '@/components/domain/toast'
import { useDemoStore } from '@/hooks/use-demo'
import { KpiHeroCard } from '@/components/domain/kpi-hero-card'
import { CoverageHeatmap } from '@/components/domain/coverage-heatmap'
import { GapDrilldown } from '@/components/domain/gap-drilldown'

// ── Types ────────────────────────────────────────────────────────────────────

interface FteDashboardProps {
  siteId: string
  weekRange: { start: string; end: string }
}

interface HeatmapCell {
  process_id: string
  process_name: string
  period_start: string
  coverage_pct: number
  fte_needed: number | null
  fte_available: number
  status: 'computed' | 'no_norm'
}

interface SelectedCell {
  process_id: string
  period_start: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWeekNumber(iso: string): number {
  const d = new Date(iso)
  const dayOfYear =
    Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000,
    ) + 1
  return Math.ceil(dayOfYear / 7)
}

// ── Component ────────────────────────────────────────────────────────────────

export function FteDashboard({ siteId, weekRange }: FteDashboardProps) {
  const toast = useToast()
  const isDemo = useDemoStore((s) => s.isDemo)
  const utils = trpc.useUtils()

  const [selectedCell, setSelectedCell] = useState<SelectedCell | null>(null)

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: workloadData } = trpc.workload.getForPlan.useQuery({
    site_id: siteId,
    period_start: weekRange.start,
    period_end: weekRange.end,
  }, { enabled: !isDemo })

  const computeMutation = trpc.workload.compute.useMutation({
    onMutate: () => {
      toast.showSuccess('Herberekenen...')
    },
    onSuccess: () => {
      utils.workload.getForPlan.invalidate({
        site_id: siteId,
        period_start: weekRange.start,
        period_end: weekRange.end,
      })
      toast.showSuccess('Herberekening voltooid')
    },
    onError: (err) => {
      toast.showError(`Herberekening mislukt: ${err.message}`)
    },
  })

  // ── Recompute ────────────────────────────────────────────────────────────

  const recompute = useCallback(() => {
    if (isDemo) return
    computeMutation.mutate({
      site_id: siteId,
      plan_version_id: null,
      period_start: weekRange.start,
      period_end: weekRange.end,
    })
  }, [computeMutation, siteId, weekRange])

  // ── Derived: KPI values ──────────────────────────────────────────────────

  const kpis = useMemo(() => {
    const rows = workloadData ?? []

    const n = (v: unknown) => Number(v) || 0

    const totalDemand = rows.reduce(
      (sum, r) => sum + n(r.demand_volume),
      0,
    )

    const totalHoursNeeded = rows.reduce(
      (sum, r) => sum + n(r.hours_needed),
      0,
    )

    const totalHoursAvailable = rows.reduce(
      (sum, r) => sum + n(r.hours_assigned),
      0,
    )

    const totalFteAvailable = rows.reduce(
      (sum, r) => sum + n(r.fte_assigned),
      0,
    )

    // Max shortage across all rows (single worst week/process)
    let maxShortage = 0
    for (const r of rows) {
      const needed = n(r.fte_needed)
      const available = n(r.fte_assigned)
      const shortage = needed - available
      if (shortage > maxShortage) maxShortage = shortage
    }

    return {
      totalDemand,
      totalHoursNeeded,
      totalHoursAvailable,
      totalFteAvailable,
      maxShortage,
    }
  }, [workloadData])

  // ── Derived: Heatmap cells (aggregated day→week) ─────────────────────────

  const { heatmapCells, weeks } = useMemo(() => {
    const rows = workloadData ?? []

    // Helper: get Monday of the week for a given date
    function getMonday(dateStr: string): string {
      const d = new Date(dateStr)
      const day = d.getUTCDay() || 7 // Mon=1..Sun=7
      d.setUTCDate(d.getUTCDate() - day + 1)
      return d.toISOString().split('T')[0] ?? dateStr
    }

    // Group by (process_id, monday) and aggregate
    const grouped = new Map<string, {
      process_id: string
      process_name: string
      monday: string
      total_coverage: number
      total_fte_needed: number
      total_fte_available: number
      count: number
      has_computed: boolean
    }>()

    for (const r of rows) {
      const proc = r.process as unknown as {
        name: string
        category: string | null
        process_type: string | null
      } | null

      const monday = getMonday(r.period_start)
      const key = `${r.process_id}:${monday}`
      const existing = grouped.get(key)

      if (existing) {
        existing.total_coverage += Number(r.coverage_pct) || 0
        existing.total_fte_needed += Number(r.fte_needed) || 0
        existing.total_fte_available += Number(r.fte_assigned) || 0
        existing.count++
        if (r.status === 'computed') existing.has_computed = true
      } else {
        grouped.set(key, {
          process_id: r.process_id,
          process_name: proc?.name ?? r.process_id,
          monday,
          total_coverage: Number(r.coverage_pct) || 0,
          total_fte_needed: Number(r.fte_needed) || 0,
          total_fte_available: Number(r.fte_assigned) || 0,
          count: 1,
          has_computed: r.status === 'computed',
        })
      }
    }

    const weekSet = new Set<string>()
    const cells: HeatmapCell[] = []

    for (const g of grouped.values()) {
      weekSet.add(g.monday)
      cells.push({
        process_id: g.process_id,
        process_name: g.process_name,
        period_start: g.monday,
        coverage_pct: g.count > 0 ? Math.round(g.total_coverage / g.count) : 0,
        fte_needed: Math.round(g.total_fte_needed / g.count * 10) / 10,
        fte_available: Math.round(g.total_fte_available / g.count * 10) / 10,
        status: g.has_computed ? 'computed' : 'no_norm',
      })
    }

    const sortedWeeks = Array.from(weekSet).sort()
    return { heatmapCells: cells, weeks: sortedWeeks }
  }, [workloadData])

  // ── Derived: Drilldown data ──────────────────────────────────────────────

  const drilldownData = useMemo(() => {
    if (!selectedCell || !workloadData) return null

    const record = workloadData.find(
      (r) =>
        r.process_id === selectedCell.process_id &&
        r.period_start === selectedCell.period_start,
    )
    if (!record) return null

    const proc = record.process as unknown as {
      name: string
      category: string | null
      process_type: string | null
    } | null

    return {
      processName: proc?.name ?? record.process_id,
      processId: record.process_id,
      weekLabel: `Wk ${getWeekNumber(record.period_start)}`,
      periodStart: record.period_start,
      demandVolume: Number(record.demand_volume) || 0,
      hoursNeeded: Number(record.hours_needed) || 0,
      fteNeeded: Number(record.fte_needed) || 0,
      hoursAvailable: Number(record.hours_assigned) || 0,
      fteAvailable: record.fte_assigned ?? 0,
      weightedUph: record.weighted_uph,
      coveragePct: record.coverage_pct ?? 0,
      crossTrainedCount: 0, // Phase 5
      highProficiencyCount: 0, // Phase 5
    }
  }, [selectedCell, workloadData])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleCellClick = useCallback(
    (process_id: string, period_start: string) => {
      setSelectedCell((prev) =>
        prev?.process_id === process_id &&
        prev?.period_start === period_start
          ? null
          : { process_id, period_start },
      )
    },
    [],
  )

  const handleDrilldownClose = useCallback(() => {
    setSelectedCell(null)
  }, [])

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 24 }}
    >
      {/* ── KPI Hero Row ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}
      >
        <KpiHeroCard
          label="Totale Demand"
          value={kpis.totalDemand}
          detail={`${weeks.length} weken`}
          icon={<span style={{ fontSize: 18 }}>📊</span>}
          gradientColors={['var(--primary)', '#818CF8']}
          delay={0}
        />
        <KpiHeroCard
          label="Beschikbare FTE"
          value={Math.round(kpis.totalFteAvailable * 10) / 10}
          detail={`${Math.round(kpis.totalHoursAvailable)} uur beschikbaar`}
          icon={<span style={{ fontSize: 18 }}>👥</span>}
          gradientColors={['#10B981', '#34D399']}
          delay={0.05}
        />
        <KpiHeroCard
          label="FTE Tekort"
          value={Math.round(kpis.maxShortage * 10) / 10}
          detail="max tekort (enkel week)"
          icon={<span style={{ fontSize: 18 }}>⚠️</span>}
          gradientColors={['#EF4444', '#F87171']}
          delay={0.1}
        />
        <KpiHeroCard
          label="Uren Nodig"
          value={Math.round(kpis.totalHoursNeeded)}
          detail={`vs ${Math.round(kpis.totalHoursAvailable)} beschikbaar`}
          icon={<span style={{ fontSize: 18 }}>⏱️</span>}
          gradientColors={['#F59E0B', '#FBBF24']}
          delay={0.15}
          suffix=" u"
        />
      </div>

      {/* ── Heatmap Section Card ─────────────────────────────────────── */}
      <motion.div
        variants={fadeInUp}
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 24,
          padding: '24px 28px',
          boxShadow: 'var(--elevation-1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 20,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
              fontSize: 16,
              fontWeight: 600,
              color: 'var(--foreground)',
            }}
          >
            🗺️ Dekking Overzicht
          </span>

          {/* Recompute button */}
          <motion.button
            onClick={recompute}
            disabled={computeMutation.isPending}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            transition={bouncy}
            style={{
              fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
              fontSize: 12,
              fontWeight: 600,
              color: computeMutation.isPending
                ? 'var(--muted-foreground)'
                : 'var(--primary)',
              background: computeMutation.isPending
                ? 'rgba(99,102,241,0.04)'
                : 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.18)',
              borderRadius: 10,
              padding: '6px 14px',
              cursor: computeMutation.isPending
                ? 'not-allowed'
                : 'pointer',
              opacity: computeMutation.isPending ? 0.6 : 1,
            }}
          >
            {computeMutation.isPending ? 'Berekenen...' : '🔄 Herbereken'}
          </motion.button>
        </div>

        {/* Heatmap */}
        <CoverageHeatmap
          data={heatmapCells}
          weeks={weeks}
          onCellClick={handleCellClick}
          selectedCell={selectedCell}
        />
      </motion.div>

      {/* ── Gap Drilldown (conditional) ──────────────────────────────── */}
      {drilldownData && (
        <motion.div variants={fadeInUp}>
          <GapDrilldown
            {...drilldownData}
            onClose={handleDrilldownClose}
          />
        </motion.div>
      )}
    </motion.div>
  )
}
