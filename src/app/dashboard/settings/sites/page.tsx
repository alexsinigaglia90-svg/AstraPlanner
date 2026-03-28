'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MapPin, Clock, Plus, Building2, Search,
  LayoutGrid, LayoutList, Users, GitBranch, Layers,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { fadeInUp, containerStagger, scalePress, bouncy } from '@/lib/motion'
import { AnimatedCounter } from '@/components/domain/animated-counter'
import { useDemoStore } from '@/hooks/use-demo'
import { useToast } from '@/components/domain/toast'
import { demoSites } from '@/components/onboarding/demo-seed'
import { ContextualTooltip } from '@/components/onboarding/contextual-tooltip'

// ── Placeholder site stats (wire later) ──────────────────────────────────────
const SITE_STATS: Record<string, { employees: number; processes: number; departments: number }> = {}

function getSiteStats(id: string) {
  return SITE_STATS[id] ?? { employees: 0, processes: 0, departments: 0 }
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function SiteCardSkeleton() {
  return (
    <div
      className="animate-pulse"
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        height: '180px',
      }}
    />
  )
}

// ── Site type badge ────────────────────────────────────────────────────────────
function SiteTypeBadge({ type }: { type?: string | null }) {
  if (!type) return null
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--muted-foreground)',
        backgroundColor: 'var(--muted)',
        borderRadius: 'var(--radius-full)',
        padding: '2px 8px',
      }}
    >
      {type}
    </span>
  )
}

// ── Site code badge ────────────────────────────────────────────────────────────
function SiteCodeBadge({ code }: { code?: string | null }) {
  if (!code) return null
  return (
    <span
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        fontWeight: 500,
        color: 'var(--primary)',
        backgroundColor: 'rgba(99,102,241,0.08)',
        borderRadius: 'var(--radius-sm)',
        padding: '2px 7px',
      }}
    >
      {code}
    </span>
  )
}

// ── Status dot ────────────────────────────────────────────────────────────────
function StatusDot({ active }: { active: boolean }) {
  return (
    <span
      title={active ? 'Active' : 'Inactive'}
      style={{
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        backgroundColor: active ? 'var(--success)' : 'var(--muted-foreground)',
        flexShrink: 0,
        boxShadow: active ? '0 0 0 3px rgba(16,185,129,0.15)' : 'none',
      }}
    />
  )
}

// ── Mini stat ─────────────────────────────────────────────────────────────────
interface MiniStatProps {
  icon: React.ReactNode
  value: number
  label: string
}

function MiniStat({ icon, value, label }: MiniStatProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
      {icon}
      <AnimatedCounter
        value={value}
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--foreground)',
        }}
      />
      <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)' }}>
        {label}
      </span>
    </div>
  )
}

// ── Site card (grid view) ─────────────────────────────────────────────────────
interface SiteCardProps {
  site: {
    id: string
    name: string
    code: string
    is_active: boolean
    address?: string | null
    timezone: string
    settings_json?: Record<string, unknown>
  }
  onClick: () => void
}

function SiteCard({ site, onClick }: SiteCardProps) {
  const stats = getSiteStats(site.id)
  const siteSettings = site.settings_json as Record<string, string> | undefined

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -4, boxShadow: 'var(--elevation-3)' }}
      whileTap={{ scale: 0.98 }}
      transition={bouncy}
      onClick={onClick}
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--elevation-1)',
        padding: '20px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle inner top glow on hover — CSS approach via gradient */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: site.is_active
            ? 'linear-gradient(90deg, var(--primary), #8B5CF6)'
            : 'var(--border)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
        }}
      />

      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <StatusDot active={site.is_active} />
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--foreground)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap' as const,
            }}
          >
            {site.name}
          </h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
          <SiteCodeBadge code={site.code} />
        </div>
      </div>

      {/* Type */}
      {Boolean(site.settings_json?.site_type) && (
        <SiteTypeBadge type={String(site.settings_json!.site_type)} />
      )}

      {/* Stats row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          paddingTop: '4px',
          borderTop: '1px solid var(--border)',
        }}
      >
        <MiniStat
          icon={<Users size={12} style={{ color: 'var(--muted-foreground)' }} />}
          value={stats.employees}
          label="emp"
        />
        <MiniStat
          icon={<GitBranch size={12} style={{ color: 'var(--muted-foreground)' }} />}
          value={stats.processes}
          label="proc"
        />
        <MiniStat
          icon={<Layers size={12} style={{ color: 'var(--muted-foreground)' }} />}
          value={stats.departments}
          label="dept"
        />
      </div>

      {/* Address + timezone */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        {site.address && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <MapPin size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '12px',
                color: 'var(--muted-foreground)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap' as const,
              }}
            >
              {site.address}
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Clock size={12} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--muted-foreground)',
            }}
          >
            {site.timezone}
          </span>
        </div>
      </div>
    </motion.div>
  )
}

// ── Site row (list view) ───────────────────────────────────────────────────────
function SiteRow({ site, onClick }: SiteCardProps) {
  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ backgroundColor: 'var(--muted)' }}
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '24px 1fr auto auto auto',
        alignItems: 'center',
        gap: '16px',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        transition: 'background-color 0.15s',
      }}
    >
      <StatusDot active={site.is_active} />
      <div style={{ minWidth: 0 }}>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--foreground)',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap' as const,
          }}
        >
          {site.name}
        </span>
        {site.address && (
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--muted-foreground)',
            }}
          >
            {site.address}
          </span>
        )}
      </div>
      <SiteCodeBadge code={site.code} />
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          color: 'var(--muted-foreground)',
        }}
      >
        {site.timezone}
      </span>
    </motion.div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <motion.div
      variants={fadeInUp}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        borderRadius: 'var(--radius-lg)',
        border: '1.5px dashed var(--border)',
        backgroundColor: 'var(--card)',
        gap: '12px',
        textAlign: 'center' as const,
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: 'var(--radius-md)',
          backgroundColor: 'rgba(99,102,241,0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Building2 size={26} style={{ color: 'var(--primary)' }} />
      </div>
      <div>
        <p
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--foreground)',
            margin: '0 0 4px 0',
          }}
        >
          No sites yet
        </p>
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--muted-foreground)',
            margin: 0,
          }}
        >
          Add your first site to get started
        </p>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
type ViewMode = 'grid' | 'list'

export default function SiteListPage() {
  const router = useRouter()
  const isDemo = useDemoStore((s) => s.isDemo)
  const toast = useToast()
  const { data: liveSites, isLoading: liveLoading, error } = trpc.org.listSites.useQuery(
    undefined,
    { enabled: !isDemo },
  )
  const sites = isDemo ? (demoSites as typeof liveSites) : liveSites
  const isLoading = isDemo ? false : liveLoading
  const [view, setView] = useState<ViewMode>('grid')
  const [search, setSearch] = useState('')
  const [showAddSite, setShowAddSite] = useState(false)
  const [newSiteName, setNewSiteName] = useState('')
  const [newSiteCode, setNewSiteCode] = useState('')
  const [newSiteCity, setNewSiteCity] = useState('')
  const utils = trpc.useUtils()
  const createSite = trpc.org.createSite.useMutation({
    onSuccess: () => {
      utils.org.listSites.invalidate()
      setShowAddSite(false)
      setNewSiteName('')
      setNewSiteCode('')
      setNewSiteCity('')
    },
  })

  const filtered = (sites ?? []).filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.code.toLowerCase().includes(search.toLowerCase())
  )

  if (error && !isDemo) {
    return (
      <div
        style={{
          borderRadius: 'var(--radius-md)',
          padding: '24px',
          fontSize: '13px',
          backgroundColor: 'var(--card)',
          border: '1px solid var(--destructive)',
          color: 'var(--destructive)',
          fontFamily: 'var(--font-body)',
        }}
      >
        Failed to load sites: {error.message}
      </div>
    )
  }

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '960px' }}
    >
      {/* ── Header row ────────────────────────────────────────────────────── */}
      <motion.div
        variants={fadeInUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap' as const,
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--foreground)',
              margin: '0 0 2px 0',
            }}
          >
            Sites
          </h1>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--muted-foreground)',
              margin: 0,
            }}
          >
            Manage locations and their operational settings
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Search */}
          <div
            style={{
              position: 'relative',
              width: '200px',
            }}
          >
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--muted-foreground)',
                pointerEvents: 'none',
              }}
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search sites…"
              style={{
                width: '100%',
                paddingLeft: '32px',
                paddingRight: '12px',
                paddingTop: '8px',
                paddingBottom: '8px',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--foreground)',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                outline: 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s',
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

          {/* View toggle */}
          <div
            style={{
              display: 'flex',
              backgroundColor: 'var(--muted)',
              borderRadius: 'var(--radius-sm)',
              padding: '2px',
              gap: '2px',
            }}
          >
            {(['grid', 'list'] as ViewMode[]).map((v) => (
              <motion.button
                key={v}
                variants={scalePress}
                whileTap="press"
                onClick={() => setView(v)}
                title={v === 'grid' ? 'Grid view' : 'List view'}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '30px',
                  height: '30px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  cursor: 'pointer',
                  backgroundColor: view === v ? 'var(--card)' : 'transparent',
                  color: view === v ? 'var(--primary)' : 'var(--muted-foreground)',
                  boxShadow: view === v ? 'var(--elevation-1)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {v === 'grid' ? <LayoutGrid size={15} /> : <LayoutList size={15} />}
              </motion.button>
            ))}
          </div>

          {/* Add site button */}
          <ContextualTooltip id="sites-add" text="Voeg je eerste site toe om te beginnen" anchor="top">
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => {
              if (isDemo) { toast.showError('Dit is een demo — start je eigen omgeving om wijzigingen te maken'); return }
              setShowAddSite(true)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
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
            Add Site
          </motion.button>
          </ContextualTooltip>
        </div>
      </motion.div>

      {/* ── Content ────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {Array.from({ length: 4 }).map((_, i) => <SiteCardSkeleton key={i} />)}
          </motion.div>
        ) : filtered.length === 0 ? (
          <motion.div key="empty" variants={containerStagger} initial="hidden" animate="show">
            <EmptyState />
          </motion.div>
        ) : view === 'grid' ? (
          <motion.div
            key="grid"
            variants={containerStagger}
            initial="hidden"
            animate="show"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '16px',
            }}
          >
            {filtered.map((site) => (
              <SiteCard
                key={site.id}
                site={site}
                onClick={() => router.push(`/dashboard/settings/sites/${site.id}`)}
              />
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="list"
            variants={containerStagger}
            initial="hidden"
            animate="show"
            style={{
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--elevation-1)',
              overflow: 'hidden',
              padding: '8px',
            }}
          >
            {filtered.map((site) => (
              <SiteRow
                key={site.id}
                site={site}
                onClick={() => router.push(`/dashboard/settings/sites/${site.id}`)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add Site Dialog ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAddSite && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAddSite(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 40,
              background: 'rgba(0,0,0,0.3)',
              backdropFilter: 'blur(4px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '400px',
                background: 'var(--card)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                boxShadow: 'var(--elevation-4)',
                padding: '28px',
              }}
            >
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', marginBottom: '4px' }}>
                Nieuwe site
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--muted-foreground)', marginBottom: '20px' }}>
                Voeg een nieuwe locatie toe aan je organisatie
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!newSiteName.trim() || !newSiteCode.trim() || !newSiteCity.trim()) return
                  createSite.mutate({ name: newSiteName.trim(), code: newSiteCode.trim().toUpperCase(), city: newSiteCity.trim() })
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
              >
                <div>
                  <label style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>
                    Naam
                  </label>
                  <input
                    value={newSiteName}
                    onChange={(e) => setNewSiteName(e.target.value)}
                    placeholder="Bijv. Amsterdam DC"
                    autoFocus
                    style={{
                      width: '100%', height: '40px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)', padding: '0 12px',
                      fontSize: '14px', fontFamily: 'var(--font-body)',
                      color: 'var(--foreground)', background: 'var(--background)',
                      outline: 'none', boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>
                      Code
                    </label>
                    <input
                      value={newSiteCode}
                      onChange={(e) => setNewSiteCode(e.target.value)}
                      placeholder="AMS"
                      maxLength={20}
                      style={{
                        width: '100%', height: '40px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)', padding: '0 12px',
                        fontSize: '14px', fontFamily: 'var(--font-mono)',
                        color: 'var(--foreground)', background: 'var(--background)',
                        outline: 'none', boxSizing: 'border-box', textTransform: 'uppercase',
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontFamily: 'var(--font-body)', fontSize: '12px', fontWeight: 600, color: 'var(--muted-foreground)', display: 'block', marginBottom: '4px' }}>
                      Stad
                    </label>
                    <input
                      value={newSiteCity}
                      onChange={(e) => setNewSiteCity(e.target.value)}
                      placeholder="Amsterdam"
                      style={{
                        width: '100%', height: '40px', borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)', padding: '0 12px',
                        fontSize: '14px', fontFamily: 'var(--font-body)',
                        color: 'var(--foreground)', background: 'var(--background)',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                </div>

                {createSite.isError && (
                  <div style={{ fontSize: '12px', color: 'var(--destructive)', fontFamily: 'var(--font-body)' }}>
                    {createSite.error?.message ?? 'Er is iets misgegaan'}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                  <button
                    type="button"
                    onClick={() => setShowAddSite(false)}
                    style={{
                      padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)', background: 'var(--card)',
                      fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 500,
                      color: 'var(--foreground)', cursor: 'pointer',
                    }}
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    disabled={!newSiteName.trim() || !newSiteCode.trim() || !newSiteCity.trim() || createSite.isPending}
                    style={{
                      padding: '8px 16px', borderRadius: 'var(--radius-sm)',
                      border: 'none', background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                      fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600,
                      color: '#FFFFFF', cursor: createSite.isPending ? 'not-allowed' : 'pointer',
                      opacity: (!newSiteName.trim() || !newSiteCode.trim() || !newSiteCity.trim()) ? 0.5 : 1,
                    }}
                  >
                    {createSite.isPending ? 'Aanmaken...' : 'Site aanmaken'}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
