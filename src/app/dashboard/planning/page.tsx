'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, Plus } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useDemoStore } from '@/hooks/use-demo'
import { useDemoGuard } from '@/hooks/use-demo-guard'
import { useDemoPlanList } from '@/hooks/use-demo-plan-data'
import { fadeInUp, containerStagger, scalePress, bouncy } from '@/lib/motion'
import { CreatePlanWizard } from '@/components/domain/create-plan-wizard'

// ── Types ─────────────────────────────────────────────────────────────────────

type PlanStatus = 'draft' | 'optimized' | 'proposed' | 'approved' | 'published'

interface PlanVersion {
  id: string
  version_number: number
  plan_period_start: string
  plan_period_end: string
  status: string
  name: string
  created_at: string
  summary_metrics_json: Record<string, unknown> | null
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  draft:      { label: 'Concept',          bg: 'rgba(148,163,184,0.15)', color: '#64748B' },
  optimized:  { label: 'Geoptimaliseerd',  bg: 'rgba(99,102,241,0.12)',  color: '#6366F1' },
  proposed:   { label: 'Voorgesteld',      bg: 'rgba(245,158,11,0.12)',  color: '#D97706' },
  approved:   { label: 'Goedgekeurd',      bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  published:  { label: 'Gepubliceerd',     bg: 'rgba(16,185,129,0.2)',   color: '#047857' },
}

const FILTER_OPTIONS: Array<{ key: PlanStatus | 'all'; label: string }> = [
  { key: 'all',        label: 'Alles' },
  { key: 'draft',      label: 'Concept' },
  { key: 'optimized',  label: 'Geoptimaliseerd' },
  { key: 'proposed',   label: 'Voorgesteld' },
  { key: 'approved',   label: 'Goedgekeurd' },
  { key: 'published',  label: 'Gepubliceerd' },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatPeriod = (start: string, end: string): string => {
  const s = new Date(start)
  const e = new Date(end)
  const weekNum = Math.ceil(
    (s.getTime() - new Date(s.getFullYear(), 0, 1).getTime()) / (7 * 86400000)
  )
  const endWeek = Math.ceil(
    (e.getTime() - new Date(e.getFullYear(), 0, 1).getTime()) / (7 * 86400000)
  )
  return `Week ${weekNum}–${endWeek}`
}

const formatDate = (iso: string): string => {
  return new Date(iso).toLocaleDateString('nl-NL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      variants={scalePress}
      whileTap="press"
      onClick={onClick}
      style={{
        padding: '5px 14px',
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        backgroundColor: active ? 'rgba(99,102,241,0.1)' : 'var(--card)',
        color: active ? 'var(--primary)' : 'var(--muted-foreground)',
        fontFamily: 'var(--font-body)',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label}
    </motion.button>
  )
}

function CoverageDisplay({ value }: { value: number | null | undefined }) {
  if (value == null) {
    return (
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '13px',
          color: 'var(--muted-foreground)',
        }}
      >
        —
      </span>
    )
  }

  const color =
    value >= 90 ? '#059669' :
    value >= 70 ? '#D97706' :
    '#EF4444'

  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '13px',
        fontWeight: 700,
        color,
      }}
    >
      {Math.round(value)}%
    </span>
  )
}

function PlanCard({
  plan,
  onClick,
}: {
  plan: PlanVersion
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const statusCfg = STATUS_CONFIG[plan.status] ?? STATUS_CONFIG.draft!
  const coverage =
    typeof plan.summary_metrics_json?.coverage_percentage === 'number'
      ? (plan.summary_metrics_json.coverage_percentage as number)
      : null

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -2, transition: bouncy }}
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      style={{
        padding: '20px',
        borderRadius: '14px',
        border: `1px solid ${hovered ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
        backgroundColor: 'var(--card)',
        boxShadow: hovered
          ? '0 8px 24px rgba(0,0,0,0.08)'
          : '0 1px 4px rgba(0,0,0,0.04)',
        cursor: 'pointer',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      {/* Top row: period + version */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontWeight: 800,
              color: 'var(--foreground)',
              margin: 0,
              lineHeight: 1.2,
            }}
          >
            {plan.name ?? formatPeriod(plan.plan_period_start, plan.plan_period_end)}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              margin: '3px 0 0',
            }}
          >
            {formatPeriod(plan.plan_period_start, plan.plan_period_end)}
          </p>
        </div>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            backgroundColor: 'var(--muted)',
            padding: '2px 8px',
            borderRadius: 'var(--radius-full)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          v{plan.version_number}
        </span>
      </div>

      {/* Divider */}
      <div style={{ height: '1px', backgroundColor: 'var(--border)' }} />

      {/* Bottom row: status badge + coverage + date */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        {/* Status badge */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            backgroundColor: statusCfg.bg,
            color: statusCfg.color,
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.02em',
          }}
        >
          {statusCfg.label}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Coverage */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                color: 'var(--muted-foreground)',
              }}
            >
              Dekking:
            </span>
            <CoverageDisplay value={coverage} />
          </div>

          {/* Date */}
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              color: 'var(--muted-foreground)',
            }}
          >
            {formatDate(plan.created_at)}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PlanningPage() {
  const router = useRouter()
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const { demoToast } = useDemoGuard()
  const demoPlans = useDemoPlanList()
  const [statusFilter, setStatusFilter] = useState<PlanStatus | 'all'>('all')
  const [wizardOpen, setWizardOpen] = useState(false)

  const plansQuery = trpc.planning.listPlanVersions.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo }
  )

  const plans = isDemo ? demoPlans : (plansQuery.data ?? [])
  const isLoading = isDemo ? false : plansQuery.isLoading
  const error = isDemo ? null : plansQuery.error

  const filteredPlans =
    statusFilter === 'all'
      ? plans
      : plans.filter((p) => p.status === statusFilter)

  // ── No site ──────────────────────────────────────────────────────────────

  if (!activeSiteId) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '15px',
            color: 'var(--muted-foreground)',
          }}
        >
          Selecteer een locatie om planningen te bekijken.
        </p>
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '920px' }}
    >
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '26px',
              fontWeight: 800,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            Planning
          </h1>
          {!isLoading && (
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--muted-foreground)',
                margin: '4px 0 0',
              }}
            >
              {plans.length} {plans.length === 1 ? 'plan' : 'plannen'}
            </p>
          )}
        </div>

        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => isDemo ? demoToast() : setWizardOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '9px 16px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
            color: '#FFFFFF',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={15} />
          Nieuw plan
        </motion.button>
      </motion.div>

      {/* Filter chips */}
      <motion.div
        variants={fadeInUp}
        style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}
      >
        {FILTER_OPTIONS.map((opt) => (
          <FilterChip
            key={opt.key}
            label={opt.label}
            active={statusFilter === opt.key}
            onClick={() => setStatusFilter(opt.key)}
          />
        ))}
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          variants={fadeInUp}
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--destructive)',
            color: 'var(--destructive)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
          }}
        >
          Fout bij laden: {error.message}
        </motion.div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <motion.div
          variants={fadeInUp}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}
        >
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                height: '130px',
                borderRadius: '14px',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
              }}
            />
          ))}
        </motion.div>
      )}

      {/* Plan cards grid */}
      {!isLoading && !error && (
        <AnimatePresence mode="wait">
          {filteredPlans.length === 0 ? (
            /* Empty state */
            <motion.div
              key="empty"
              variants={fadeInUp}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '64px 24px',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: '14px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                gap: '16px',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 'var(--radius-md)',
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(139,92,246,0.05))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Calendar size={24} style={{ color: 'var(--primary)' }} />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '17px',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                    margin: 0,
                  }}
                >
                  Nog geen plannen
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    color: 'var(--muted-foreground)',
                    margin: '6px 0 0',
                  }}
                >
                  {statusFilter === 'all'
                    ? 'Maak je eerste plan aan om te beginnen met optimaliseren.'
                    : `Geen plannen met status "${STATUS_CONFIG[statusFilter]?.label ?? statusFilter}".`}
                </p>
              </div>
              {statusFilter === 'all' && (
                <motion.button
                  variants={scalePress}
                  whileTap="press"
                  onClick={() => setWizardOpen(true)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 20px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                    color: '#FFFFFF',
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: '4px',
                  }}
                >
                  <Plus size={15} />
                  Maak je eerste plan aan
                </motion.button>
              )}
            </motion.div>
          ) : (
            /* Cards grid */
            <motion.div
              key="grid"
              variants={containerStagger}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0, transition: { duration: 0.15 } }}
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '16px',
              }}
            >
              {filteredPlans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  plan={plan}
                  onClick={() => router.push(`/dashboard/planning/${plan.id}`)}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}

      {/* Create Plan Wizard */}
      <CreatePlanWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        siteId={activeSiteId}
        onCreated={(planId) => {
          setWizardOpen(false)
          router.push(`/dashboard/planning/${planId}`)
        }}
      />
    </motion.div>
  )
}
