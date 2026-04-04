'use client'

import { useState, useRef, lazy, Suspense } from 'react'
import { motion } from 'framer-motion'
import { HeartPulse, Plus } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useDemoStore } from '@/hooks/use-demo'
import { useToast } from '@/components/domain/toast'
import { bouncy } from '@/lib/motion'
import { AbsenceWizard } from '@/components/domain/absence-wizard'

const InsightsTab = lazy(() => import('@/components/domain/insights-tab').then(m => ({ default: m.InsightsTab })))

// ── Hold-to-Confirm Button ───────────────────────────────────────────────────

function HoldToConfirmButton({
  label,
  holdDuration = 1200,
  onConfirm,
}: {
  label: string
  holdDuration?: number
  onConfirm: () => void
}) {
  const [progress, setProgress] = useState(0)
  const [holding, setHolding] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const confirmedRef = useRef(false)

  const startHold = () => {
    confirmedRef.current = false
    setHolding(true)
    setProgress(0)
    const step = 16 // ~60fps
    let elapsed = 0
    intervalRef.current = setInterval(() => {
      elapsed += step
      const pct = Math.min(elapsed / holdDuration, 1)
      setProgress(pct)
      if (pct >= 1 && !confirmedRef.current) {
        confirmedRef.current = true
        clearInterval(intervalRef.current!)
        setHolding(false)
        setProgress(0)
        onConfirm()
      }
    }, step)
  }

  const cancelHold = () => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    setHolding(false)
    setProgress(0)
  }

  return (
    <motion.button
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onTouchStart={startHold}
      onTouchEnd={cancelHold}
      whileHover={{ scale: 1.03 }}
      style={{
        position: 'relative',
        padding: '6px 14px',
        borderRadius: 8,
        border: '1px solid rgba(16,185,129,0.2)',
        background: 'rgba(16,185,129,0.08)',
        color: '#10B981',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* Progress fill */}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: `${progress * 100}%`,
          background: 'rgba(16,185,129,0.15)',
          borderRadius: 8,
          transition: holding ? 'none' : 'width 0.2s ease',
        }}
      />
      <span style={{ position: 'relative', zIndex: 1 }}>
        {holding ? 'Houd vast...' : label}
      </span>
    </motion.button>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export default function VerzuimPage() {
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const toast = useToast()
  const utils = trpc.useUtils()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'overzicht' | 'insights'>('overzicht')

  // Fetch active absences — wrapped in try-safe query
  const activeQuery = trpc.absence.listActive.useQuery(
    { site_id: activeSiteId ?? '', type: 'absence' as const },
    { enabled: !!activeSiteId && !isDemo, retry: false },
  )

  const invalidateInsights = () => void utils.insights.invalidate()

  const recover = trpc.absence.reportRecovered.useMutation({
    onSuccess: () => {
      toast.showSuccess('Herstelmelding verwerkt')
      void activeQuery.refetch()
      invalidateInsights()
    },
    onError: (err: { message: string }) => toast.showError(err.message),
  })

  // Safe array access
  const items = Array.isArray(activeQuery.data) ? activeQuery.data : []
  const sickCount = items.length

  // Error state (role too low)
  if (activeQuery.error) {
    return (
      <div style={{ padding: '80px 40px', textAlign: 'center', fontFamily: 'var(--font-body)' }}>
        <HeartPulse size={40} style={{ color: 'var(--muted-foreground)', opacity: 0.3, marginBottom: 12 }} />
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 8px' }}>
          Geen toegang
        </h2>
        <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0 }}>
          Je hebt minimaal de rol &apos;supervisor&apos; nodig om verzuim te beheren.
        </p>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 40px', maxWidth: 1100, margin: '0 auto', fontFamily: 'var(--font-body, "DM Sans", sans-serif)' }}>
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={bouncy}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}
      >
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
            Verzuim
          </h1>
          <p style={{ fontSize: 13, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
            Overzicht ziekmeldingen en herstelmeldingen
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.96 }}
          transition={bouncy}
          onClick={() => setWizardOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 20px', borderRadius: 12, border: 'none',
            background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            color: '#fff', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          Nieuwe Ziekmelding
        </motion.button>
      </motion.div>

      {/* Tab Bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '2px solid #E5E7EB', position: 'relative' }}>
        {(['overzicht', 'insights'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: '10px 24px',
              fontSize: 13,
              fontWeight: activeTab === tab ? 700 : 500,
              color: activeTab === tab ? '#6366F1' : '#9CA3AF',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              position: 'relative',
              transition: 'color 0.2s',
            }}
          >
            {tab === 'overzicht' ? 'Overzicht' : 'Insights'}
            {activeTab === tab && (
              <motion.div
                layoutId="verzuim-tab-indicator"
                style={{
                  position: 'absolute',
                  bottom: -2,
                  left: 0,
                  right: 0,
                  height: 2,
                  background: '#6366F1',
                  borderRadius: 1,
                }}
                transition={bouncy}
              />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'overzicht' && (
      <>
      {/* KPI */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 32,
      }}>
        {[
          { label: 'Ziek vandaag', value: sickCount, color: '#EF4444' },
          { label: 'Actief', value: items.filter((i: { status: string }) => i.status === 'confirmed').length, color: '#F59E0B' },
          { label: 'Totaal meldingen', value: items.length, color: '#6366F1' },
        ].map((kpi) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={bouncy}
            style={{
              background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255,255,255,0.6)', borderRadius: 20,
              padding: '20px 24px', position: 'relative', overflow: 'hidden',
            }}
          >
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: kpi.color }} />
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)', marginBottom: 6 }}>
              {kpi.label}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 700, color: 'var(--foreground)' }}>
              {kpi.value}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Timeline */}
      <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 14px' }}>
        Actieve ziekmeldingen
      </h2>

      {activeQuery.isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{ height: 72, borderRadius: 12, background: 'rgba(100,116,139,0.06)' }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', borderRadius: 16, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(100,116,139,0.08)' }}>
          <HeartPulse size={32} style={{ color: 'var(--muted-foreground)', opacity: 0.3, marginBottom: 8 }} />
          <p style={{ fontSize: 14, color: 'var(--muted-foreground)', margin: 0, fontWeight: 500 }}>
            Geen actieve ziekmeldingen
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.map((item: { id: string; employee_name: string | null; start_date: string; end_date: string; status: string; department_id: string | null }) => {
            const days = Math.max(1, Math.round((new Date(item.end_date).getTime() - new Date(item.start_date).getTime()) / 86400000) + 1)
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={bouncy}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px', borderRadius: 14,
                  background: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(239,68,68,0.12)',
                }}
              >
                {/* Avatar */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #EF4444, #F87171)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#fff', fontSize: 12, fontWeight: 700,
                }}>
                  {(item.employee_name ?? 'O')[0]?.toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>
                    {item.employee_name ?? 'Onbekend'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
                    Ziek sinds {item.start_date}
                  </div>
                </div>
                <div style={{
                  fontSize: 11, fontWeight: 600, color: '#EF4444',
                  background: 'rgba(239,68,68,0.08)', padding: '3px 10px', borderRadius: 6,
                  fontFamily: 'var(--font-mono)',
                }}>
                  {days} {days === 1 ? 'dag' : 'dagen'}
                </div>
                <HoldToConfirmButton
                  label="Hersteld"
                  holdDuration={1200}
                  onConfirm={() => recover.mutate({ override_id: item.id, recovery_date: new Date().toISOString().slice(0, 10) })}
                />
              </motion.div>
            )
          })}
        </div>
      )}

      </>
      )}

      {activeTab === 'insights' && (
        <Suspense fallback={<InsightsSkeleton />}>
          <InsightsTab />
        </Suspense>
      )}

      {/* Wizard — always rendered so it works on both tabs */}
      {activeSiteId && (
        <AbsenceWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          siteId={activeSiteId}
          onSaved={() => { void activeQuery.refetch(); invalidateInsights() }}
        />
      )}
    </div>
  )
}

// ── Premium Skeleton ────────────────────────────────────────────────────────

function InsightsSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Row 1: two hero cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <SkeletonCard height={260}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <SkeletonCircle size={140} />
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <SkeletonLine width="60%" />
              <SkeletonLine width="80%" />
              <SkeletonLine width="70%" />
              <SkeletonLine width="50%" />
              <SkeletonLine width="65%" />
            </div>
          </div>
        </SkeletonCard>
        <SkeletonCard height={260}>
          <SkeletonLine width="40%" height={14} />
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <SkeletonBlock height={56} />
            <SkeletonBlock height={56} />
            <SkeletonBlock height={44} />
          </div>
        </SkeletonCard>
      </div>
      {/* Row 2: three charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        <SkeletonCard height={200}>
          <SkeletonLine width="35%" height={12} />
          <div style={{ marginTop: 12 }}>
            <SkeletonBlock height={130} />
          </div>
        </SkeletonCard>
        <SkeletonCard height={200}>
          <SkeletonLine width="45%" height={12} />
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <SkeletonLine width="85%" height={14} />
            <SkeletonLine width="60%" height={14} />
            <SkeletonLine width="70%" height={14} />
          </div>
        </SkeletonCard>
        <SkeletonCard height={200}>
          <SkeletonLine width="30%" height={12} />
          <div style={{ marginTop: 12 }}>
            <SkeletonBlock height={130} />
          </div>
        </SkeletonCard>
      </div>
      {/* Row 3: signal feed */}
      <SkeletonCard height={110}>
        <SkeletonLine width="25%" height={12} />
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <SkeletonBlock key={i} height={60} />
          ))}
        </div>
      </SkeletonCard>
    </div>
  )
}

function SkeletonCard({ height, children }: { height: number; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.6)',
        borderRadius: 20,
        padding: 20,
        minHeight: height,
        overflow: 'hidden',
      }}
    >
      {children}
    </motion.div>
  )
}

function SkeletonLine({ width = '100%', height = 10 }: { width?: string; height?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width,
        height,
        borderRadius: 6,
        background: 'linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(99,102,241,0.15) 50%, rgba(99,102,241,0.08) 100%)',
      }}
    />
  )
}

function SkeletonBlock({ height }: { height: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut', delay: Math.random() * 0.5 }}
      style={{
        width: '100%',
        height,
        borderRadius: 12,
        background: 'linear-gradient(90deg, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.12) 50%, rgba(99,102,241,0.06) 100%)',
      }}
    />
  )
}

function SkeletonCircle({ size }: { size: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.3, 0.6, 0.3] }}
      transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, rgba(99,102,241,0.12) 50%, rgba(99,102,241,0.06) 100%)',
        flexShrink: 0,
      }}
    />
  )
}
