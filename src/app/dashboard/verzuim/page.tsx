'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { HeartPulse, Plus } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useDemoStore } from '@/hooks/use-demo'
import { useToast } from '@/components/domain/toast'
import { bouncy } from '@/lib/motion'
import { AbsenceWizard } from '@/components/domain/absence-wizard'

export default function VerzuimPage() {
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const toast = useToast()
  const [wizardOpen, setWizardOpen] = useState(false)

  // Fetch active absences — wrapped in try-safe query
  const activeQuery = trpc.absence.listActive.useQuery(
    { site_id: activeSiteId ?? '', type: 'absence' as const },
    { enabled: !!activeSiteId && !isDemo, retry: false },
  )

  const recover = trpc.absence.reportRecovered.useMutation({
    onSuccess: () => {
      toast.showSuccess('Herstelmelding verwerkt')
      void activeQuery.refetch()
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
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => recover.mutate({ override_id: item.id, recovery_date: new Date().toISOString().slice(0, 10) })}
                  style={{
                    padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(16,185,129,0.2)',
                    background: 'rgba(16,185,129,0.08)', color: '#10B981',
                    fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}
                >
                  Hersteld
                </motion.button>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* Wizard */}
      {activeSiteId && (
        <AbsenceWizard
          open={wizardOpen}
          onClose={() => setWizardOpen(false)}
          siteId={activeSiteId}
          onSaved={() => void activeQuery.refetch()}
        />
      )}
    </div>
  )
}
