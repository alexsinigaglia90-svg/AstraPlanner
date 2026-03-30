'use client'

import { useMemo, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, BarChart3, Coins, Clock, Zap, Loader2 } from 'lucide-react'
import { useRouter, useParams } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { containerStagger, fadeInUp, bouncy, scalePress } from '@/lib/motion'
import { useToast } from '@/components/domain/toast'
import { KpiHeroCard } from '@/components/domain/kpi-hero-card'
import { PlanGrid } from '@/components/domain/plan-grid'
import { PlanCoverageBar } from '@/components/domain/plan-coverage-bar'
import { AssignmentEditor } from '@/components/domain/assignment-editor'
import { useSiteStore } from '@/stores/site-store'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getWeekNumber(iso: string): number {
  const d = new Date(iso)
  const dayOfYear =
    Math.floor(
      (d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000,
    ) + 1
  return Math.ceil(dayOfYear / 7)
}

// ── Status config ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  draft:     { label: 'Concept',          bg: 'rgba(148,163,184,0.15)', color: '#64748B' },
  optimized: { label: 'Geoptimaliseerd',  bg: 'rgba(99,102,241,0.12)',  color: '#6366F1' },
  proposed:  { label: 'Voorgesteld',      bg: 'rgba(245,158,11,0.12)',  color: '#D97706' },
  approved:  { label: 'Goedgekeurd',      bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  published: { label: 'Gepubliceerd',     bg: 'rgba(16,185,129,0.2)',   color: '#047857' },
  rejected:  { label: 'Afgewezen',        bg: 'rgba(239,68,68,0.12)',   color: '#DC2626' },
  stale:     { label: 'Verouderd',        bg: 'rgba(148,163,184,0.12)', color: '#94A3B8' },
}

// ── Action buttons per status ────────────────────────────────────────────────

interface ActionDef {
  label: string
  action: string
  variant: 'primary' | 'secondary' | 'danger'
}

const ACTIONS: Record<string, ActionDef[]> = {
  draft: [{ label: 'Solver starten', action: 'optimize', variant: 'primary' }],
  optimized: [
    { label: 'Voorstel indienen', action: 'propose', variant: 'primary' },
    { label: 'Opnieuw optimaliseren', action: 'reoptimize', variant: 'secondary' },
  ],
  proposed: [
    { label: 'Goedkeuren', action: 'approve', variant: 'primary' },
    { label: 'Afwijzen', action: 'reject', variant: 'danger' },
  ],
  approved: [{ label: 'Publiceren', action: 'publish', variant: 'primary' }],
  published: [],
}

// ── Button style helpers ─────────────────────────────────────────────────────

function getButtonStyle(variant: 'primary' | 'secondary' | 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: '9px 18px',
    borderRadius: 'var(--radius-sm)',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
  }

  switch (variant) {
    case 'primary':
      return {
        ...base,
        background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
        color: '#fff',
      }
    case 'secondary':
      return {
        ...base,
        border: '1px solid var(--border)',
        background: 'var(--card)',
        color: 'var(--foreground)',
      }
    case 'danger':
      return {
        ...base,
        border: '1px solid #EF4444',
        background: 'transparent',
        color: '#EF4444',
      }
  }
}

// ── Metrics type ─────────────────────────────────────────────────────────────

interface SummaryMetrics {
  total_cost?: number
  coverage_percentage?: number
  overtime_hours?: number
  solve_time_ms?: number
}

// ── Skeleton loader ──────────────────────────────────────────────────────────

function KpiSkeletonRow() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
      }}
    >
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="animate-pulse"
          style={{
            height: 140,
            borderRadius: 20,
            background: 'rgba(255,255,255,0.72)',
            border: '1px solid rgba(255,255,255,0.6)',
            boxShadow: 'var(--elevation-1)',
          }}
        />
      ))}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PlanDetailPage() {
  const router = useRouter()
  const params = useParams()
  const planId = params.planId as string
  const toast = useToast()
  const utils = trpc.useUtils()

  const { activeSiteId } = useSiteStore()
  const [pendingAction, setPendingAction] = useState<string | null>(null)
  const [selectedCell, setSelectedCell] = useState<{
    empId: string; empName: string; date: string; shiftId: string; shiftName: string
  } | null>(null)

  // ── Data query ───────────────────────────────────────────────────────────

  const {
    data: plan,
    isLoading,
    error,
  } = trpc.planning.getPlanVersion.useQuery(
    { id: planId },
    { enabled: !!planId },
  )

  // ── Grid data queries ───────────────────────────────────────────────────

  const employeesQ = trpc.workforce.listEmployees.useQuery(
    { site_id: activeSiteId!, limit: 999 },
    { enabled: !!activeSiteId },
  )
  const processesQ = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId },
  )
  const departmentsQ = trpc.org.listDepartments.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId },
  )
  const shiftsQ = trpc.org.listShifts.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId },
  )

  // ── Mutations ────────────────────────────────────────────────────────────

  const optimizeMutation = trpc.planning.runOptimizer.useMutation({
    onSuccess: () => {
      toast.showSuccess('Optimalisatie voltooid')
      utils.planning.getPlanVersion.invalidate({ id: planId })
      setPendingAction(null)
    },
    onError: (err) => {
      toast.showError(`Optimalisatie mislukt: ${err.message}`)
      setPendingAction(null)
    },
  })

  const transitionMutation = trpc.planning.transitionState.useMutation({
    onSuccess: (_data, variables) => {
      if (variables.target_state === 'rejected') {
        toast.showSuccess('Plan afgewezen')
        router.push('/dashboard/planning')
      } else {
        const label = STATUS_CONFIG[variables.target_state]?.label ?? variables.target_state
        toast.showSuccess(`Status gewijzigd naar ${label}`)
        utils.planning.getPlanVersion.invalidate({ id: planId })
      }
      setPendingAction(null)
    },
    onError: (err) => {
      toast.showError(`Statuswijziging mislukt: ${err.message}`)
      setPendingAction(null)
    },
  })

  // ── Action handler ───────────────────────────────────────────────────────

  const handleAction = useCallback(
    (action: string) => {
      setPendingAction(action)

      switch (action) {
        case 'optimize':
        case 'reoptimize':
          optimizeMutation.mutate({
            plan_version_id: planId,
            solver_strategy: 'greedy',
          })
          break
        case 'propose':
          transitionMutation.mutate({
            plan_version_id: planId,
            target_state: 'proposed',
          })
          break
        case 'approve':
          transitionMutation.mutate({
            plan_version_id: planId,
            target_state: 'approved',
          })
          break
        case 'reject':
          transitionMutation.mutate({
            plan_version_id: planId,
            target_state: 'rejected',
          })
          break
        case 'publish':
          transitionMutation.mutate({
            plan_version_id: planId,
            target_state: 'published',
          })
          break
      }
    },
    [planId, optimizeMutation, transitionMutation],
  )

  // ── Derived: metrics ─────────────────────────────────────────────────────

  const metrics = useMemo<SummaryMetrics | null>(() => {
    if (!plan?.summary_metrics_json) return null
    return plan.summary_metrics_json as SummaryMetrics
  }, [plan?.summary_metrics_json])

  const weekNum = useMemo(() => {
    if (!plan?.plan_period_start) return '—'
    return getWeekNumber(plan.plan_period_start)
  }, [plan?.plan_period_start])

  // ── Cell click handler ──────────────────────────────────────────────────

  const handleCellClick = useCallback(
    (empId: string, date: string, shiftId: string) => {
      const emp = (employeesQ.data?.items ?? []).find((e) => e.id === empId)
      const shift = (shiftsQ.data ?? []).find((s) => s.id === shiftId)
      if (!emp || !shift) return
      setSelectedCell({
        empId,
        empName: `${emp.first_name} ${emp.last_name}`,
        date,
        shiftId,
        shiftName: shift.name,
      })
    },
    [employeesQ.data, shiftsQ.data],
  )

  const selectedAssignment = useMemo(() => {
    if (!selectedCell || !plan) return null
    const match = plan.assignments.find(
      (a) =>
        a.employee_id === selectedCell.empId &&
        a.assignment_date === selectedCell.date &&
        a.shift_pattern_id === selectedCell.shiftId,
    )
    if (!match) return null
    const proc = (processesQ.data ?? []).find((p) => p.id === match.process_id)
    return {
      id: match.id,
      process_id: match.process_id,
      process_name: proc?.name ?? 'Onbekend',
      assignment_source: match.assignment_source as 'optimizer' | 'locked',
    }
  }, [selectedCell, plan, processesQ.data])

  // ── Derived: status config ───────────────────────────────────────────────

  const status = plan?.status ?? 'draft'
  const statusCfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.draft!
  const actions = ACTIONS[status] ?? []

  // ── Loading state ────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1080 }}>
        {/* Skeleton top bar */}
        <div
          className="animate-pulse"
          style={{ height: 48, borderRadius: 'var(--radius-md)', background: 'var(--card)' }}
        />
        <KpiSkeletonRow />
        <div
          className="animate-pulse"
          style={{ height: 300, borderRadius: 'var(--radius-lg)', background: 'var(--card)', border: '1px solid var(--border)' }}
        />
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────

  if (error || !plan) {
    return (
      <div
        style={{
          padding: 20,
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'var(--card)',
          border: '1px solid var(--destructive)',
          color: 'var(--destructive)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          maxWidth: 1080,
        }}
      >
        {error?.message ?? 'Plan niet gevonden.'}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1080 }}
    >
      {/* ── Top bar ────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeInUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {/* Back link */}
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => router.push('/dashboard/planning')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px 6px 8px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          <ArrowLeft size={15} />
          Planningen
        </motion.button>

        {/* Title */}
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            fontSize: 22,
            color: 'var(--foreground)',
            margin: 0,
            flex: 1,
            minWidth: 0,
          }}
        >
          Plan v{plan.version_number} — Week {weekNum}
        </h1>

        {/* Status badge */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '5px 14px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: statusCfg.bg,
            color: statusCfg.color,
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '-0.01em',
          }}
        >
          {statusCfg.label}
        </span>

        {/* Action buttons */}
        {actions.map((act) => {
          const isLoading = pendingAction === act.action
          return (
            <motion.button
              key={act.action}
              variants={scalePress}
              whileTap="press"
              disabled={pendingAction !== null}
              onClick={() => handleAction(act.action)}
              style={{
                ...getButtonStyle(act.variant),
                opacity: pendingAction !== null && !isLoading ? 0.5 : 1,
                cursor: pendingAction !== null ? 'not-allowed' : 'pointer',
              }}
            >
              {isLoading && (
                <motion.span
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  style={{ display: 'inline-flex' }}
                >
                  <Loader2 size={14} />
                </motion.span>
              )}
              {act.label}
            </motion.button>
          )
        })}
      </motion.div>

      {/* ── KPI Hero Cards row ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16,
        }}
      >
        <KpiHeroCard
          label="Dekking"
          value={metrics?.coverage_percentage ?? 0}
          detail="Dekkingspercentage"
          icon={<BarChart3 size={16} />}
          gradientColors={['#6366F1', '#8B5CF6']}
          delay={0}
          suffix="%"
          pulse={(metrics?.coverage_percentage ?? 100) < 70}
        />
        <KpiHeroCard
          label="Totale Kosten"
          value={metrics?.total_cost ?? 0}
          detail="Berekende loonkosten"
          icon={<Coins size={16} />}
          gradientColors={['#10B981', '#059669']}
          delay={0.05}
          prefix="\u20AC"
        />
        <KpiHeroCard
          label="Overuren"
          value={metrics?.overtime_hours ?? 0}
          detail="Extra uren boven contract"
          icon={<Clock size={16} />}
          gradientColors={['#F59E0B', '#EA580C']}
          delay={0.1}
          suffix="u"
          pulse={(metrics?.overtime_hours ?? 0) > 0}
        />
        <KpiHeroCard
          label="Oplostijd"
          value={metrics?.solve_time_ms ? Math.round(metrics.solve_time_ms / 1000 * 10) / 10 : 0}
          detail="Solver verwerkingstijd"
          icon={<Zap size={16} />}
          gradientColors={['#64748B', '#475569']}
          delay={0.15}
          suffix="s"
        />
      </div>

      {/* ── Assignment Heatmap Grid ────────────────────────────────────── */}
      <motion.div variants={fadeInUp}>
        <PlanGrid
          assignments={plan.assignments}
          employees={(employeesQ.data?.items ?? []) as Array<{ id: string; first_name: string; last_name: string; department_id: string | null }>}
          processes={(processesQ.data ?? []) as Array<{ id: string; name: string; department_id: string }>}
          departments={(departmentsQ.data ?? []) as Array<{ id: string; name: string; color: string }>}
          shifts={(shiftsQ.data ?? []) as Array<{ id: string; name: string }>}
          weekStart={plan.plan_period_start}
          workDays={[1, 2, 3, 4, 5]}
          isEditable={status === 'draft' || status === 'optimized'}
          onCellClick={handleCellClick}
        />
      </motion.div>

      {/* ── Coverage summary bar ────────────────────────────────────────── */}
      <motion.div variants={fadeInUp}>
        <PlanCoverageBar
          assignments={plan.assignments}
          processes={(processesQ.data ?? []) as Array<{ id: string; name: string; department_id: string }>}
          departments={(departmentsQ.data ?? []) as Array<{ id: string; name: string; color: string }>}
          demandByProcess={null}
        />
      </motion.div>
    </motion.div>
  )
}
