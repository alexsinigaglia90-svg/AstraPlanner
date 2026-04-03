'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Building2, Globe, CreditCard, Clock, DollarSign,
  MapPin, Users, GitBranch, Check, X, Pencil, Presentation,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { createClient } from '@/lib/supabase/client'
import { fadeInUp, containerStagger, scalePress } from '@/lib/motion'
import { AnimatedCounter } from '@/components/domain/animated-counter'
import { SlideOver } from '@/components/domain/slide-over'
import { useToast } from '@/components/domain/toast'
import { useDemoStore } from '@/hooks/use-demo'
import { demoOrganization, demoSites, demoEmployees, demoProcesses } from '@/components/onboarding/demo-seed'

// ── Hardcoded counts (wire to real data later) ──────────────────────────────
const STAT_SITES = 2
const STAT_EMPLOYEES = 20
const STAT_PROCESSES = 5

// ── Tier badge config ────────────────────────────────────────────────────────
const TIER_GRADIENT: Record<string, string> = {
  trial: 'linear-gradient(135deg, #F59E0B, #FB923C)',
  starter: 'linear-gradient(135deg, #818CF8, #6366F1)',
  professional: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
  enterprise: 'linear-gradient(135deg, #10B981, #059669)',
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span
      style={{
        background: TIER_GRADIENT[tier] ?? TIER_GRADIENT.trial,
        color: '#FFFFFF',
        fontFamily: 'var(--font-body)',
        fontWeight: 600,
        fontSize: '11px',
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
        padding: '3px 10px',
        borderRadius: 'var(--radius-full)',
      }}
    >
      {tier}
    </span>
  )
}

function SkeletonField() {
  return (
    <div
      className="animate-pulse h-5 rounded"
      style={{ backgroundColor: 'var(--muted)', width: '60%' }}
    />
  )
}

// ── Mini stat card ────────────────────────────────────────────────────────────
interface StatCardProps {
  icon: React.ReactNode
  label: string
  value: number
}

function MiniStatCard({ icon, label, value }: StatCardProps) {
  return (
    <motion.div
      variants={fadeInUp}
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--elevation-1)',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '8px',
      }}
    >
      <div
        style={{
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(99,102,241,0.10)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {icon}
      </div>
      <AnimatedCounter
        value={value}
        style={{
          fontSize: '24px',
          fontWeight: 700,
          color: 'var(--foreground)',
          lineHeight: 1,
        }}
      />
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          color: 'var(--muted-foreground)',
        }}
      >
        {label}
      </span>
    </motion.div>
  )
}

// ── Field row ─────────────────────────────────────────────────────────────────
interface FieldRowProps {
  label: string
  value?: string | null
  mono?: boolean
  loading?: boolean
  children?: React.ReactNode
}

function FieldRow({ label, value, mono, loading, children }: FieldRowProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' as const, gap: '4px' }}>
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          fontWeight: 500,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          color: 'var(--muted-foreground)',
        }}
      >
        {label}
      </span>
      {loading ? (
        <SkeletonField />
      ) : children ? (
        children
      ) : (
        <span
          style={{
            fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
            fontSize: '14px',
            fontWeight: mono ? 400 : 500,
            color: 'var(--foreground)',
          }}
        >
          {value ?? '—'}
        </span>
      )}
    </div>
  )
}

// ── Plan features ─────────────────────────────────────────────────────────────
const PLAN_FEATURES: Record<string, string[]> = {
  trial: ['1 site', '5 employees', 'Basic scheduling'],
  starter: ['3 sites', '50 employees', 'Standard scheduling'],
  professional: ['Up to 10 sites', '500 employees', 'AI Optimizer'],
  enterprise: ['Unlimited sites', 'Unlimited employees', 'AI Optimizer', 'Priority support'],
}

// ── Main page ─────────────────────────────────────────────────────────────────
// ── Demo mode toggle card ────────────────────────────────────────────────────

function DemoModeCard({
  isDemo,
  setDemo,
  showSuccess,
  showError,
}: {
  isDemo: boolean
  setDemo: (val: boolean) => void
  showSuccess: (msg: string) => void
  showError: (msg: string) => void
}) {
  const toggleMutation = trpc.onboarding.toggleDemoMode.useMutation({
    onSuccess: async (data) => {
      const supabase = createClient()
      await supabase.auth.refreshSession()
      const entering = data.mode === 'demo'
      setDemo(entering)
      // Always reload to reset all cached queries, site store, and component state
      window.location.href = entering ? '/dashboard' : '/dashboard/settings'
    },
    onError: (err) => {
      showError(`Demo toggle mislukt: ${err.message}`)
    },
  })

  return (
    <motion.div
      variants={fadeInUp}
      style={{
        backgroundColor: 'var(--card)',
        border: `1px solid ${isDemo ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--elevation-1)',
        padding: '24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: isDemo ? 'rgba(99,102,241,0.12)' : 'rgba(148,163,184,0.10)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Presentation size={17} style={{ color: isDemo ? 'var(--primary)' : 'var(--muted-foreground)' }} />
        </div>
        <div>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '16px',
              fontWeight: 700,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            Demo Modus
          </h2>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              margin: '2px 0 0',
            }}
          >
            {isDemo
              ? 'Actief — je ziet demodata met 28 medewerkers en 3 planscenario\u2019s'
              : 'Schakel in om de demo met voorbeelddata te bekijken'}
          </p>
        </div>
      </div>

      <motion.button
        variants={scalePress}
        whileTap="press"
        onClick={() => toggleMutation.mutate()}
        disabled={toggleMutation.isPending}
        style={{
          padding: '8px 18px',
          borderRadius: 'var(--radius-sm)',
          border: isDemo ? '1px solid var(--border)' : 'none',
          background: isDemo
            ? 'transparent'
            : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
          color: isDemo ? 'var(--muted-foreground)' : '#fff',
          fontFamily: 'var(--font-body)',
          fontSize: '13px',
          fontWeight: 600,
          cursor: toggleMutation.isPending ? 'not-allowed' : 'pointer',
          opacity: toggleMutation.isPending ? 0.6 : 1,
          whiteSpace: 'nowrap' as const,
        }}
      >
        {toggleMutation.isPending
          ? 'Even geduld...'
          : isDemo
            ? 'Uitschakelen'
            : 'Demo starten'}
      </motion.button>
    </motion.div>
  )
}

export default function OrgSettingsPage() {
  const isDemo = useDemoStore((s) => s.isDemo)
  const setDemo = useDemoStore((s) => s.setDemo)
  const { showError, showSuccess } = useToast()

  const { data: liveData, isLoading: liveLoading, error } = trpc.org.getOrganization.useQuery(
    undefined,
    { enabled: !isDemo },
  )
  const utils = trpc.useUtils()
  const mutation = trpc.org.updateOrganization.useMutation({
    onSuccess: () => {
      utils.org.getOrganization.invalidate()
      setSlideOpen(false)
    },
  })

  // In demo mode use seed data; otherwise use live data
  const data = isDemo
    ? (demoOrganization as typeof liveData)
    : liveData
  const isLoading = isDemo ? false : liveLoading

  const [slideOpen, setSlideOpen] = useState(false)
  const [formName, setFormName] = useState('')
  const [formEmail, setFormEmail] = useState('')

  function openEdit() {
    if (isDemo) {
      showError('Dit is een demo — start je eigen omgeving om wijzigingen te maken')
      return
    }
    setFormName(data?.name ?? '')
    setFormEmail((data as Record<string, string> | undefined)?.billing_email ?? '')
    setSlideOpen(true)
  }

  function handleSave() {
    if (isDemo) {
      showError('Dit is een demo — start je eigen omgeving om wijzigingen te maken')
      return
    }
    mutation.mutate({ name: formName })
  }

  const demoStatSites = isDemo ? demoSites.length : STAT_SITES
  const demoStatEmployees = isDemo ? demoEmployees.length : STAT_EMPLOYEES
  const demoStatProcesses = isDemo ? demoProcesses.length : STAT_PROCESSES

  const settings = data?.settings_json as Record<string, string> | undefined
  const tier = isDemo ? 'professional' : (data?.subscription_tier ?? 'trial')
  const features: string[] = PLAN_FEATURES[tier] ?? ['Basic access']

  if (error && !isDemo) {
    return (
      <div
        className="rounded-[var(--radius-md)] p-6 text-sm"
        style={{
          backgroundColor: 'var(--card)',
          border: '1px solid var(--destructive)',
          color: 'var(--destructive)',
        }}
      >
        Failed to load organization: {error.message}
      </div>
    )
  }

  return (
    <>
      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: '28px', maxWidth: '900px' }}
      >
        {/* ── Hero section ──────────────────────────────────────────────────── */}
        <motion.div variants={fadeInUp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.12))',
                border: '1px solid rgba(99,102,241,0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Building2 size={22} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              {isLoading ? (
                <div className="animate-pulse h-7 w-48 rounded" style={{ backgroundColor: 'var(--muted)' }} />
              ) : (
                <h1
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '26px',
                    fontWeight: 800,
                    color: 'var(--foreground)',
                    lineHeight: 1.2,
                    margin: 0,
                  }}
                >
                  {data?.name}
                </h1>
              )}
              <div style={{ marginTop: '6px' }}>
                <TierBadge tier={tier} />
              </div>
            </div>
          </div>

          {/* Stat cards row */}
          <motion.div
            variants={containerStagger}
            style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}
          >
            <MiniStatCard
              icon={<MapPin size={16} style={{ color: 'var(--primary)' }} />}
              label="Sites"
              value={demoStatSites}
            />
            <MiniStatCard
              icon={<Users size={16} style={{ color: 'var(--primary)' }} />}
              label="Employees"
              value={demoStatEmployees}
            />
            <MiniStatCard
              icon={<GitBranch size={16} style={{ color: 'var(--primary)' }} />}
              label="Processes"
              value={demoStatProcesses}
            />
          </motion.div>
        </motion.div>

        {/* ── Bento grid ────────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gridTemplateRows: 'auto auto',
            gap: '16px',
          }}
        >
          {/* Card 1 — Organization Details (tall, spans 2 rows on left) */}
          <motion.div
            variants={fadeInUp}
            style={{
              gridRow: '1 / 3',
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--elevation-1)',
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'rgba(99,102,241,0.10)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Building2 size={17} style={{ color: 'var(--primary)' }} />
                </div>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '16px',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                    margin: 0,
                  }}
                >
                  Organization Details
                </h2>
              </div>
              <motion.button
                variants={scalePress}
                whileTap="press"
                onClick={openEdit}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  backgroundColor: 'rgba(99,102,241,0.08)',
                  color: 'var(--primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <Pencil size={13} />
                Edit
              </motion.button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <FieldRow label="Company Name" value={data?.name} loading={isLoading} />
              <FieldRow label="Slug" value={data?.slug} loading={isLoading} mono />
              <FieldRow label="Billing Email" loading={isLoading}>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '14px',
                    fontWeight: 500,
                    color: 'var(--foreground)',
                  }}
                >
                  {(data as Record<string, string> | undefined)?.billing_email ?? 'Not set'}
                </span>
              </FieldRow>
              <FieldRow label="Subscription Tier" loading={isLoading}>
                <TierBadge tier={tier} />
              </FieldRow>
            </div>
          </motion.div>

          {/* Card 2 — Locale & Regional */}
          <motion.div
            variants={fadeInUp}
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--elevation-1)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(99,102,241,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Globe size={17} style={{ color: 'var(--primary)' }} />
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  margin: 0,
                }}
              >
                Locale &amp; Regional
              </h2>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
              {([
                { key: 'default_timezone', label: 'Timezone', Icon: Clock },
                { key: 'default_locale', label: 'Locale', Icon: Globe },
                { key: 'default_currency', label: 'Currency', Icon: DollarSign },
              ] as const).map(({ key, label, Icon }) => (
                <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Icon size={13} style={{ color: 'var(--muted-foreground)' }} />
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '11px',
                        fontWeight: 500,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.06em',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      {label}
                    </span>
                  </div>
                  {isLoading ? (
                    <SkeletonField />
                  ) : (
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        fontWeight: 500,
                        color: 'var(--foreground)',
                      }}
                    >
                      {(data as Record<string, string> | undefined)?.[key] ?? '—'}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Card 3 — Plan & Billing */}
          <motion.div
            variants={fadeInUp}
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--elevation-1)',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: 'var(--radius-sm)',
                  backgroundColor: 'rgba(99,102,241,0.10)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <CreditCard size={17} style={{ color: 'var(--primary)' }} />
              </div>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: '16px',
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  margin: 0,
                }}
              >
                Plan &amp; Billing
              </h2>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <TierBadge tier={tier} />
                <a
                  href="#"
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    fontWeight: 500,
                    color: 'var(--primary)',
                    textDecoration: 'none',
                  }}
                >
                  Manage subscription →
                </a>
              </div>

              <div
                style={{
                  borderTop: '1px solid var(--border)',
                  paddingTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                }}
              >
                {features.map((feature) => (
                  <div key={feature} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: 'var(--radius-full)',
                        backgroundColor: 'rgba(16,185,129,0.12)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Check size={10} style={{ color: 'var(--success)' }} />
                    </div>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        color: 'var(--foreground)',
                      }}
                    >
                      {feature}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* ── Demo mode toggle ─────────────────────────────────────────── */}
        <DemoModeCard isDemo={isDemo} setDemo={setDemo} showSuccess={showSuccess} showError={showError} />

        {/* Mutation error */}
        {mutation.error && (
          <motion.p
            variants={fadeInUp}
            style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--destructive)' }}
          >
            {mutation.error.message}
          </motion.p>
        )}
      </motion.div>

      {/* ── Edit slide-over ────────────────────────────────────────────────── */}
      <SlideOver open={slideOpen} onClose={() => setSlideOpen(false)} title="Edit Organization">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Name field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--foreground)',
              }}
            >
              Organization Name
            </label>
            <input
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="Acme Corporation"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--foreground)',
                backgroundColor: 'var(--background)',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                width: '100%',
                boxSizing: 'border-box' as const,
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--primary)'
                e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Billing email field */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <label
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 500,
                color: 'var(--foreground)',
              }}
            >
              Billing Email
            </label>
            <input
              type="email"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              placeholder="billing@company.com"
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                color: 'var(--foreground)',
                backgroundColor: 'var(--background)',
                border: '1.5px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '10px 14px',
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
                width: '100%',
                boxSizing: 'border-box' as const,
              }}
              onFocus={(e) => {
                e.target.style.borderColor = 'var(--primary)'
                e.target.style.boxShadow = '0 0 0 3px rgba(99,102,241,0.12)'
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'var(--border)'
                e.target.style.boxShadow = 'none'
              }}
            />
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={handleSave}
              disabled={mutation.isPending}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 20px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                color: '#FFFFFF',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 600,
                cursor: mutation.isPending ? 'not-allowed' : 'pointer',
                opacity: mutation.isPending ? 0.6 : 1,
              }}
            >
              <Check size={15} />
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </motion.button>
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={() => setSlideOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                backgroundColor: 'transparent',
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <X size={15} />
              Cancel
            </motion.button>
          </div>
        </div>
      </SlideOver>
    </>
  )
}
