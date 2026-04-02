'use client'

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Users, Boxes, BarChart3, CalendarCheck, TrendingUp, Clock } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { containerStagger, fadeInUp, bouncy, scalePress } from '@/lib/motion'
import { useDemoStore } from '@/hooks/use-demo'
import { useSiteStore } from '@/stores/site-store'
import { demoEmployees } from '@/components/onboarding/demo-seed-employees'
import { demoProcesses, demoDepartments, DEMO_SITE_AMS } from '@/components/onboarding/demo-seed-processes'
import { demoPlanVersions } from '@/components/onboarding/demo-seed-plans'

// ── Types ────────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string
  value: string | number
  detail?: string
  icon: React.ReactNode
  gradient: [string, string]
  delay: number
  onClick?: () => void
}

// ── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, detail, icon, gradient, delay, onClick }: StatCardProps) {
  return (
    <motion.div
      variants={fadeInUp}
      custom={delay}
      whileHover={onClick ? { y: -3, transition: bouncy } : undefined}
      onClick={onClick}
      style={{
        padding: '20px 24px',
        borderRadius: 20,
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.6)',
        boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}
        >
          {icon}
        </div>
      </div>
      <div>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--foreground)',
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          {value}
        </p>
        {detail && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'var(--muted-foreground)',
              margin: '4px 0 0',
            }}
          >
            {detail}
          </p>
        )}
      </div>
    </motion.div>
  )
}

// ── Plan summary card ────────────────────────────────────────────────────────

function PlanSummaryCard({
  name,
  coverage,
  cost,
  status,
  onClick,
}: {
  name: string
  coverage: number
  cost: number
  status: string
  onClick: () => void
}) {
  const coverageColor = coverage >= 90 ? '#059669' : coverage >= 70 ? '#D97706' : '#EF4444'

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -2, transition: bouncy }}
      onClick={onClick}
      style={{
        padding: '16px 20px',
        borderRadius: 14,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--foreground)',
            margin: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </p>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--muted-foreground)',
            margin: '2px 0 0',
            textTransform: 'capitalize',
          }}
        >
          {status === 'published' ? 'Gepubliceerd' : status === 'optimized' ? 'Geoptimaliseerd' : status}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 800, color: coverageColor, margin: 0 }}>
            {coverage}%
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)', margin: 0 }}>
            dekking
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            &euro;{cost.toLocaleString('nl-NL')}
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)', margin: 0 }}>
            kosten/wk
          </p>
        </div>
      </div>
    </motion.div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const router = useRouter()
  const isDemo = useDemoStore((s) => s.isDemo)
  const { activeSiteId } = useSiteStore()

  // ── Demo stats ──────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    if (!isDemo) return null

    const siteEmps = demoEmployees.filter((e) => e.home_site_id === DEMO_SITE_AMS)
    const siteDepts = demoDepartments.filter((d) => d.site_id === DEMO_SITE_AMS)
    const totalSkills = siteEmps.reduce((s, e) => s + e.skill_count, 0)
    const avgCoverage = Math.round(
      demoPlanVersions.reduce((s, p) => s + ((p.summary_metrics_json.coverage_percentage as number) ?? 0), 0) / demoPlanVersions.length,
    )

    return {
      employeeCount: siteEmps.length,
      processCount: demoProcesses.length,
      departmentCount: siteDepts.length,
      totalSkills,
      avgCoverage,
      planCount: demoPlanVersions.length,
    }
  }, [isDemo])

  // ── Non-demo fallback ──────────────────────────────────────────────────

  if (!isDemo) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold text-[var(--foreground)]">Dashboard</h1>
        <p className="mt-2 font-body text-[var(--muted-foreground)]">Welcome to AstraPlanner</p>
      </div>
    )
  }

  // ── Demo dashboard ─────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 28, maxWidth: 960 }}
    >
      {/* Header */}
      <motion.div variants={fadeInUp}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 28,
            fontWeight: 800,
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          Dashboard
        </h1>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 14,
            color: 'var(--muted-foreground)',
            margin: '6px 0 0',
          }}
        >
          AstraDemo BV — Amsterdam DC
        </p>
      </motion.div>

      {/* Stat cards row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: 16,
        }}
      >
        <StatCard
          label="Medewerkers"
          value={stats!.employeeCount}
          detail={`${stats!.totalSkills} vaardigheden`}
          icon={<Users size={18} />}
          gradient={['#6366F1', '#8B5CF6']}
          delay={0}
          onClick={() => router.push('/dashboard/employees')}
        />
        <StatCard
          label="Processen"
          value={stats!.processCount}
          detail={`${stats!.departmentCount} afdelingen`}
          icon={<Boxes size={18} />}
          gradient={['#10B981', '#059669']}
          delay={0.05}
          onClick={() => router.push('/dashboard/processes')}
        />
        <StatCard
          label="Gem. Dekking"
          value={`${stats!.avgCoverage}%`}
          detail="over alle scenario's"
          icon={<BarChart3 size={18} />}
          gradient={['#F59E0B', '#EA580C']}
          delay={0.1}
          onClick={() => router.push('/dashboard/demand')}
        />
        <StatCard
          label="Planningen"
          value={stats!.planCount}
          detail="scenario's beschikbaar"
          icon={<CalendarCheck size={18} />}
          gradient={['#EC4899', '#DB2777']}
          delay={0.15}
          onClick={() => router.push('/dashboard/planning')}
        />
      </div>

      {/* Plans section */}
      <motion.div variants={fadeInUp}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 700,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            Planningen
          </h2>
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => router.push('/dashboard/planning')}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--primary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '4px 8px',
            }}
          >
            Bekijk alles &rarr;
          </motion.button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {demoPlanVersions.map((plan) => (
            <PlanSummaryCard
              key={plan.id}
              name={plan.name}
              coverage={(plan.summary_metrics_json.coverage_percentage as number) ?? 0}
              cost={(plan.summary_metrics_json.total_cost as number) ?? 0}
              status={plan.status}
              onClick={() => router.push(`/dashboard/planning/${plan.id}`)}
            />
          ))}
        </div>
      </motion.div>
    </motion.div>
  )
}
