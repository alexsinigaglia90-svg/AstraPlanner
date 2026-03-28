'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CalendarOff, Plus, Clock, CheckCircle2, CalendarDays } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useDemoStore } from '@/hooks/use-demo'
import { useToast } from '@/components/domain/toast'
import { containerStagger, fadeInUp, bouncy } from '@/lib/motion'
import { KpiHeroCard } from '@/components/domain/kpi-hero-card'
import { AbsenceCard } from '@/components/domain/absence-card'
import { LeaveWizard } from '@/components/domain/leave-wizard'
import { MiniCalendar } from '@/components/domain/mini-calendar'

// ── Helpers ─────────────────────────────────────────────────────────────────

function isWithinNextDays(dateStr: string, days: number): boolean {
  const now = new Date()
  const target = new Date(dateStr)
  const diff = target.getTime() - now.getTime()
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000
}

// ── Demo Data ───────────────────────────────────────────────────────────────

const DEMO_LEAVE: Array<{
  id: string
  employee_id: string
  start_date: string
  end_date: string
  status: 'planned' | 'confirmed' | 'cancelled'
  override_type: 'leave'
  employee_name: string
  department_id: string | null
  crew_id: string | null
}> = [
  {
    id: 'demo-leave-1',
    employee_id: 'demo-emp-1',
    start_date: new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10),
    status: 'planned',
    override_type: 'leave',
    employee_name: 'Jan de Vries',
    department_id: null,
    crew_id: null,
  },
  {
    id: 'demo-leave-2',
    employee_id: 'demo-emp-2',
    start_date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    status: 'confirmed',
    override_type: 'leave',
    employee_name: 'Maria Jansen',
    department_id: null,
    crew_id: null,
  },
  {
    id: 'demo-leave-3',
    employee_id: 'demo-emp-3',
    start_date: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    end_date: new Date(Date.now() + 18 * 86400000).toISOString().slice(0, 10),
    status: 'planned',
    override_type: 'leave',
    employee_name: 'Pieter Bakker',
    department_id: null,
    crew_id: null,
  },
]

// ── Page Component ──────────────────────────────────────────────────────────

export default function VerlofPage() {
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const toast = useToast()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(() => new Date())

  // ── Data fetching ───────────────────────────────────────────────────────
  // Supervisors+ see all leave; employees see only their own
  const activeQuery = trpc.absence.listActive.useQuery(
    { site_id: activeSiteId!, type: 'leave' },
    { enabled: !!activeSiteId && !isDemo, retry: false },
  )
  const myLeaveQuery = trpc.absence.listMyLeave.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo && !!activeQuery.error },
  )
  // Use team data if available, otherwise fall back to own data
  const leaveData = activeQuery.data ?? myLeaveQuery.data ?? []

  const approve = trpc.absence.approveLeave.useMutation({
    onSuccess: () => {
      toast.showSuccess('Verlof goedgekeurd')
      activeQuery.refetch()
    },
  })

  const reject = trpc.absence.approveLeave.useMutation({
    onSuccess: () => {
      toast.showSuccess('Verlof afgewezen')
      activeQuery.refetch()
    },
  })

  const items = isDemo ? DEMO_LEAVE : leaveData

  // ── KPI calculations ───────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const komend = items.filter(
      (r) => r.status === 'confirmed' && isWithinNextDays(r.start_date, 7),
    ).length
    const pending = items.filter((r) => r.status === 'planned').length
    const approved = items.filter((r) => r.status === 'confirmed').length
    return { komend, pending, approved }
  }, [items])

  // ── Calendar highlights ────────────────────────────────────────────────
  const highlights = useMemo(
    () =>
      items.map((item) => ({
        start: item.start_date,
        end: item.end_date,
        type: 'leave' as const,
      })),
    [items],
  )

  // ── Loading / empty states ─────────────────────────────────────────────
  const isLoading = !isDemo && activeQuery.isLoading

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1280, margin: '0 auto' }}>
      {/* ── Header ───────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}
      >
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={bouncy}
          style={{ display: 'flex', alignItems: 'center', gap: 12 }}
        >
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              background: 'linear-gradient(135deg, #6366F1, #818CF8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
            }}
          >
            <CalendarOff size={22} color="#fff" />
          </div>
          <div>
            <h1
              style={{
                fontFamily: 'var(--font-heading, "Sora", sans-serif)',
                fontSize: 24,
                fontWeight: 700,
                color: 'var(--foreground)',
                lineHeight: 1.2,
                margin: 0,
              }}
            >
              Verlof
            </h1>
            <span
              style={{
                fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                fontSize: 13,
                color: 'var(--muted-foreground)',
              }}
            >
              Aanvragen, goedkeuringen &amp; planning
            </span>
          </div>
        </motion.div>

        {/* FAB button */}
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...bouncy, delay: 0.15 }}
          whileHover={{ scale: 1.04, boxShadow: '0 6px 20px rgba(99,102,241,0.3)' }}
          whileTap={{ scale: 0.96 }}
          onClick={() => setWizardOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 13,
            fontWeight: 600,
            color: '#fff',
            background: 'linear-gradient(135deg, #6366F1, #818CF8)',
            border: 'none',
            borderRadius: 12,
            padding: '10px 20px',
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(99,102,241,0.25)',
          }}
        >
          <Plus size={16} />
          Verlof aanvragen
        </motion.button>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
        {/* ── Main content column ──────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* KPI Strip */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
              marginBottom: 28,
            }}
          >
            <KpiHeroCard
              label="Verlof komende week"
              value={kpis.komend}
              detail="bevestigd in komende 7 dagen"
              icon={<CalendarDays size={18} />}
              gradientColors={['var(--primary)', '#818CF8']}
              delay={0.05}
            />
            <KpiHeroCard
              label="In behandeling"
              value={kpis.pending}
              detail="wachtend op goedkeuring"
              icon={<Clock size={18} />}
              gradientColors={['#F59E0B', '#FBBF24']}
              delay={0.1}
              pulse={kpis.pending > 0}
            />
            <KpiHeroCard
              label="Goedgekeurd"
              value={kpis.approved}
              detail="bevestigde verlofaanvragen"
              icon={<CheckCircle2 size={18} />}
              gradientColors={['#10B981', '#34D399']}
              delay={0.15}
            />
          </div>

          {/* ── Timeline ─────────────────────────────────────────── */}
          <motion.div
            variants={containerStagger}
            initial="hidden"
            animate="show"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                  textAlign: 'center',
                  padding: '48px 0',
                  fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                  fontSize: 14,
                  color: 'var(--muted-foreground)',
                }}
              >
                Laden...
              </motion.div>
            )}

            {!isLoading && items.length === 0 && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={bouncy}
                style={{
                  textAlign: 'center',
                  padding: '56px 24px',
                  background: 'rgba(255,255,255,0.5)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 18,
                  border: '1px solid rgba(255,255,255,0.5)',
                }}
              >
                <CalendarOff
                  size={40}
                  style={{ color: 'var(--muted-foreground)', opacity: 0.4, marginBottom: 12 }}
                />
                <p
                  style={{
                    fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                    fontSize: 15,
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    margin: '0 0 4px',
                  }}
                >
                  Geen verlofaanvragen
                </p>
                <p
                  style={{
                    fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                    fontSize: 13,
                    color: 'var(--muted-foreground)',
                    margin: 0,
                  }}
                >
                  Gebruik de knop &ldquo;Verlof aanvragen&rdquo; om te starten
                </p>
              </motion.div>
            )}

            <AnimatePresence mode="popLayout">
              {items.map((item, idx) => (
                <AbsenceCard
                  key={item.id}
                  employeeName={item.employee_name ?? 'Onbekend'}
                  departmentName={null}
                  startDate={item.start_date}
                  endDate={item.end_date}
                  status={item.status as 'planned' | 'confirmed' | 'cancelled'}
                  overrideType={item.override_type as 'absence' | 'leave'}
                  delay={idx * 0.04}
                  onApprove={
                    item.status === 'planned'
                      ? () => approve.mutate({ override_id: item.id, approved: true })
                      : undefined
                  }
                  onReject={
                    item.status === 'planned'
                      ? () => reject.mutate({ override_id: item.id, approved: false })
                      : undefined
                  }
                />
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* ── Calendar sidebar ─────────────────────────────────────── */}
        <div style={{ width: 280, flexShrink: 0 }}>
          <MiniCalendar
            month={calMonth}
            highlights={highlights}
            onMonthChange={setCalMonth}
          />
        </div>
      </div>

      {/* ── Leave Wizard ─────────────────────────────────────────────── */}
      <LeaveWizard
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        siteId={activeSiteId ?? ''}
        onSaved={() => {
          setWizardOpen(false)
          activeQuery.refetch()
          toast.showSuccess('Verlofaanvraag ingediend')
        }}
      />
    </div>
  )
}
