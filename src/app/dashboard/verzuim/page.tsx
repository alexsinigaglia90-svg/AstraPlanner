'use client'

import { useState, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HeartPulse, Plus, ChevronDown } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useDemoStore } from '@/hooks/use-demo'
import { useToast } from '@/components/domain/toast'
import { containerStagger, fadeInUp, bouncy } from '@/lib/motion'
import { KpiHeroCard } from '@/components/domain/kpi-hero-card'
import { AbsenceCard } from '@/components/domain/absence-card'
import { AbsenceWizard } from '@/components/domain/absence-wizard'

// ── Types ────────────────────────────────────────────────────────────────────

interface AbsenceRow {
  id: string
  employee_id: string
  start_date: string
  end_date: string
  override_type: 'absence' | 'leave'
  status: 'planned' | 'confirmed' | 'cancelled'
  employee_name: string | null
  department_id: string | null
  crew_id: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isThisWeek(dateStr: string): boolean {
  const d = new Date(dateStr)
  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)
  const endOfWeek = new Date(startOfWeek)
  endOfWeek.setDate(startOfWeek.getDate() + 7)
  return d >= startOfWeek && d < endOfWeek
}

function avgDurationDays(items: AbsenceRow[]): number {
  if (items.length === 0) return 0
  const total = items.reduce((sum, item) => {
    const s = new Date(item.start_date).getTime()
    const e = new Date(item.end_date).getTime()
    return sum + Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1)
  }, 0)
  return Math.round((total / items.length) * 10) / 10
}

// ── Shimmer Skeleton ─────────────────────────────────────────────────────────

function Shimmer({ width, height }: { width: string | number; height: number }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: 12,
        background:
          'linear-gradient(90deg, rgba(100,116,139,0.06) 25%, rgba(100,116,139,0.12) 50%, rgba(100,116,139,0.06) 75%)',
        backgroundSize: '200% 100%',
        animation: 'shimmer 1.5s ease-in-out infinite',
      }}
    />
  )
}

const SHIMMER_STYLE_ID = 'verzuim-shimmer'

function ensureShimmerKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SHIMMER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SHIMMER_STYLE_ID
  style.textContent = `
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`
  document.head.appendChild(style)
}

// ── Component ────────────────────────────────────────────────────────────────

export default function VerzuimPage() {
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const toast = useToast()

  const [wizardOpen, setWizardOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

  ensureShimmerKeyframes()

  // ── Data fetching ────────────────────────────────────────────────────────

  const activeQuery = trpc.absence.listActive.useQuery(
    { site_id: activeSiteId!, type: 'absence' },
    { enabled: !!activeSiteId && !isDemo, retry: false },
  )

  const historyQuery = trpc.absence.listHistory.useQuery(
    { site_id: activeSiteId!, type: 'absence', limit: 20 },
    { enabled: !!activeSiteId && !isDemo, retry: false },
  )

  const recover = trpc.absence.reportRecovered.useMutation({
    onSuccess: () => {
      toast.showSuccess('Herstelmelding verwerkt')
      activeQuery.refetch()
    },
    onError: (err) => toast.showError(err.message),
  })

  // ── Derived data ─────────────────────────────────────────────────────────

  const activeItems = (activeQuery.data ?? []) as AbsenceRow[]
  const historyItems = (!historyQuery.error ? (historyQuery.data ?? []) : []) as AbsenceRow[]

  // If listActive fails (e.g., role too low), show access denied
  if (activeQuery.error) {
    return (
      <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
        <HeartPulse size={40} style={{ color: 'var(--muted-foreground)', opacity: 0.3, marginBottom: 12 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 8px' }}>
          Geen toegang
        </h2>
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
          Je hebt minimaal de rol &lsquo;supervisor&rsquo; nodig om verzuim te beheren.
        </p>
      </div>
    )
  }

  const sickToday = activeItems.length

  const recoveredThisWeek = useMemo(
    () => historyItems.filter((h) => h.status === 'cancelled' && isThisWeek(h.end_date)).length,
    [historyItems],
  )

  const avgDuration = useMemo(() => avgDurationDays(activeItems), [activeItems])

  const isLoading = activeQuery.isLoading || historyQuery.isLoading

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleRecover = useCallback(
    (overrideId: string) => {
      recover.mutate({
        override_id: overrideId,
        recovery_date: new Date().toISOString().slice(0, 10),
      })
    },
    [recover],
  )

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        padding: '32px 40px',
        maxWidth: 1100,
        margin: '0 auto',
        fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
      }}
    >
      {/* ── Header ──────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={bouncy}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 28,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display, "Cal Sans", sans-serif)',
              fontSize: 28,
              fontWeight: 800,
              color: 'var(--foreground)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Verzuim
          </h1>
          <p
            style={{
              fontSize: 13,
              color: 'var(--muted-foreground)',
              margin: '4px 0 0',
            }}
          >
            Overzicht ziekmeldingen en herstelmeldingen
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.04, boxShadow: '0 8px 24px rgba(99,102,241,0.25)' }}
          whileTap={{ scale: 0.96 }}
          transition={bouncy}
          onClick={() => setWizardOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
            borderRadius: 12,
            border: 'none',
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            backdropFilter: 'blur(8px)',
            color: '#fff',
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(99,102,241,0.2)',
          }}
        >
          <Plus size={16} />
          Nieuwe Ziekmelding
        </motion.button>
      </motion.div>

      {/* ── KPI Strip ───────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 16,
          marginBottom: 32,
        }}
      >
        <KpiHeroCard
          label="Ziek vandaag"
          value={sickToday}
          detail={`${sickToday === 1 ? '1 medewerker' : `${sickToday} medewerkers`} afwezig`}
          icon={<HeartPulse size={18} />}
          gradientColors={['#EF4444', '#F87171']}
          delay={0}
          pulse={sickToday > 0}
        />
        <KpiHeroCard
          label="Hersteld deze week"
          value={recoveredThisWeek}
          detail="terug op de werkvloer"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          }
          gradientColors={['#10B981', '#34D399']}
          delay={0.06}
        />
        <KpiHeroCard
          label="Gem. verzuimduur"
          value={avgDuration}
          detail="dagen per ziekmelding"
          icon={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          }
          gradientColors={['#F59E0B', '#FBBF24']}
          delay={0.12}
          suffix=" d"
        />
      </div>

      {/* ── Active Absences Timeline ────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...bouncy, delay: 0.15 }}
        style={{ marginBottom: 32 }}
      >
        <h2
          style={{
            fontFamily: 'var(--font-display, "Cal Sans", sans-serif)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--foreground)',
            margin: '0 0 14px',
          }}
        >
          Actieve ziekmeldingen
        </h2>

        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Shimmer width="100%" height={72} />
            <Shimmer width="100%" height={72} />
            <Shimmer width="100%" height={72} />
          </div>
        ) : activeItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={bouncy}
            style={{
              padding: '40px 24px',
              textAlign: 'center',
              borderRadius: 16,
              background: 'rgba(255,255,255,0.5)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(100,116,139,0.08)',
            }}
          >
            <HeartPulse
              size={32}
              style={{ color: 'var(--muted-foreground)', opacity: 0.3, marginBottom: 8 }}
            />
            <p
              style={{
                fontSize: 14,
                color: 'var(--muted-foreground)',
                margin: 0,
                fontWeight: 500,
              }}
            >
              Geen actieve ziekmeldingen
            </p>
          </motion.div>
        ) : (
          <motion.div
            variants={containerStagger}
            initial="hidden"
            animate="show"
            style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          >
            {activeItems.map((item, i) => (
              <AbsenceCard
                key={item.id}
                employeeName={item.employee_name ?? 'Onbekend'}
                departmentName={item.department_id}
                startDate={item.start_date}
                endDate={item.end_date}
                status={item.status}
                overrideType={item.override_type}
                delay={i * 0.04}
                onRecover={() => handleRecover(item.id)}
              />
            ))}
          </motion.div>
        )}
      </motion.div>

      {/* ── Historie Accordion ──────────────────────────────────────── */}
      {historyItems.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...bouncy, delay: 0.2 }}
        >
          <motion.button
            onClick={() => setHistoryOpen((prev) => !prev)}
            whileHover={{ background: 'rgba(100,116,139,0.04)' }}
            transition={bouncy}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid rgba(100,116,139,0.08)',
              background: 'rgba(255,255,255,0.5)',
              backdropFilter: 'blur(8px)',
              cursor: 'pointer',
              marginBottom: historyOpen ? 14 : 0,
            }}
          >
            <motion.div
              animate={{ rotate: historyOpen ? 180 : 0 }}
              transition={bouncy}
            >
              <ChevronDown
                size={16}
                style={{ color: 'var(--muted-foreground)' }}
              />
            </motion.div>
            <span
              style={{
                fontFamily: 'var(--font-display, "Cal Sans", sans-serif)',
                fontSize: 15,
                fontWeight: 700,
                color: 'var(--foreground)',
              }}
            >
              Historie
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--muted-foreground)',
                background: 'rgba(100,116,139,0.06)',
                borderRadius: 6,
                padding: '2px 7px',
              }}
            >
              {historyItems.length}
            </span>
          </motion.button>

          <AnimatePresence>
            {historyOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={bouncy}
                style={{ overflow: 'hidden' }}
              >
                <motion.div
                  variants={containerStagger}
                  initial="hidden"
                  animate="show"
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  {historyItems.map((item, i) => (
                    <AbsenceCard
                      key={item.id}
                      employeeName={item.employee_name ?? 'Onbekend'}
                      departmentName={item.department_id}
                      startDate={item.start_date}
                      endDate={item.end_date}
                      status={item.status}
                      overrideType={item.override_type}
                      delay={i * 0.04}
                    />
                  ))}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}

      {/* ── Absence Wizard ──────────────────────────────────────────── */}
      {activeSiteId && (
        <AbsenceWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          siteId={activeSiteId}
          onSaved={() => activeQuery.refetch()}
        />
      )}
    </div>
  )
}
