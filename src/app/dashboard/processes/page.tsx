'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Shield, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { fadeInUp, containerStagger, scalePress, bouncy } from '@/lib/motion'
import { SlideOver } from '@/components/domain/slide-over'

// ── Types ──────────────────────────────────────────────────────────────────────

type Category = 'inbound' | 'outbound' | 'value_added' | 'support' | 'returns'
type HazardLevel = 'none' | 'low' | 'medium' | 'high'

interface ProductivityStandard {
  skill_level: number
  units_per_hour: number
  site_id: string | null
}

interface Process {
  id: string
  name: string
  code: string
  category: Category
  description: string | null
  unit_of_measure: string
  department_id: string | null
  min_skill_level: number
  hazard_level: HazardLevel
  requires_certification: boolean
  equipment_required: string[]
  is_active: boolean
  productivity_standards: ProductivityStandard[]
}

// ── Category config ────────────────────────────────────────────────────────────

const CATEGORY_COLOR: Record<Category, string> = {
  inbound:     '#3B82F6',
  outbound:    '#6366F1',
  support:     '#F59E0B',
  value_added: '#10B981',
  returns:     '#F97316',
}

const CATEGORY_BG: Record<Category, string> = {
  inbound:     'rgba(59,130,246,0.10)',
  outbound:    'rgba(99,102,241,0.10)',
  support:     'rgba(245,158,11,0.10)',
  value_added: 'rgba(16,185,129,0.10)',
  returns:     'rgba(249,115,22,0.10)',
}

const CATEGORY_LABEL: Record<Category, string> = {
  inbound:     'Inbound',
  outbound:    'Outbound',
  support:     'Support',
  value_added: 'Value Added',
  returns:     'Returns',
}

const LEVEL_NAMES = ['Trainee', 'Basic', 'Competent', 'Proficient', 'Expert']

// ── Skill dots ─────────────────────────────────────────────────────────────────

function SkillDots({ level }: { level: number }) {
  return (
    <span style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span
          key={i}
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            backgroundColor: i <= level ? 'var(--primary)' : 'var(--border)',
            display: 'inline-block',
          }}
        />
      ))}
    </span>
  )
}

// ── Hazard badge ───────────────────────────────────────────────────────────────

const HAZARD_COLOR: Record<HazardLevel, string> = {
  none:   'var(--muted-foreground)',
  low:    '#10B981',
  medium: '#F59E0B',
  high:   '#EF4444',
}

function HazardBadge({ level }: { level: HazardLevel }) {
  if (level === 'none') return null
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        backgroundColor: `${HAZARD_COLOR[level]}18`,
        color: HAZARD_COLOR[level],
        fontFamily: 'var(--font-body)',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.04em',
      }}
    >
      <AlertTriangle size={10} />
      {level}
    </span>
  )
}

// ── Productivity mini-table ────────────────────────────────────────────────────

function ProductivityMiniTable({ standards }: { standards: ProductivityStandard[] }) {
  const sorted = [...standards].sort((a, b) => a.skill_level - b.skill_level)
  if (sorted.length === 0) return null

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '2px',
        marginTop: '12px',
        borderTop: '1px solid var(--border)',
        paddingTop: '10px',
      }}
    >
      {sorted.map((s) => (
        <div key={s.skill_level} style={{ textAlign: 'center' }}>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '10px',
              color: 'var(--muted-foreground)',
              fontWeight: 500,
              marginBottom: '2px',
            }}
          >
            L{s.skill_level}
          </div>
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--foreground)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {s.units_per_hour}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Process card ───────────────────────────────────────────────────────────────

function ProcessCard({
  process,
  onClick,
}: {
  process: Process
  onClick: () => void
}) {
  const catColor = CATEGORY_COLOR[process.category] ?? 'var(--primary)'
  const catBg    = CATEGORY_BG[process.category]    ?? 'rgba(99,102,241,0.10)'

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -2, boxShadow: 'var(--elevation-2)' }}
      transition={bouncy}
      onClick={onClick}
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--elevation-1)',
        display: 'flex',
        cursor: 'pointer',
        overflow: 'hidden',
      }}
    >
      {/* Color bar */}
      <div style={{ width: '4px', backgroundColor: catColor, flexShrink: 0 }} />

      {/* Content */}
      <div style={{ flex: 1, padding: '16px 18px' }}>
        {/* Top row: name + code + category */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '15px',
              color: 'var(--foreground)',
            }}
          >
            {process.name}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--muted-foreground)',
              backgroundColor: 'var(--muted)',
              padding: '2px 7px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {process.code}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: 600,
              color: catColor,
              backgroundColor: catBg,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {CATEGORY_LABEL[process.category]}
          </span>
          {process.requires_certification && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                color: '#8B5CF6',
                backgroundColor: 'rgba(139,92,246,0.10)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              <Shield size={10} />
              Certified
            </span>
          )}
        </div>

        {/* Stats row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            marginTop: '10px',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--muted-foreground)',
            }}
          >
            UOM:{' '}
            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--foreground)' }}>
              {process.unit_of_measure}
            </span>
          </span>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            Min skill: <SkillDots level={process.min_skill_level} />
          </span>
          <HazardBadge level={process.hazard_level} />
        </div>

        {/* Productivity mini-table */}
        {process.productivity_standards.length > 0 && (
          <ProductivityMiniTable standards={process.productivity_standards} />
        )}
      </div>
    </motion.div>
  )
}

// ── SlideOver detail ───────────────────────────────────────────────────────────

function ProcessDetail({ process }: { process: Process }) {
  const catColor = CATEGORY_COLOR[process.category] ?? 'var(--primary)'
  const sorted = [...process.productivity_standards].sort((a, b) => a.skill_level - b.skill_level)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Category pill + code */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            fontWeight: 600,
            color: catColor,
            backgroundColor: CATEGORY_BG[process.category],
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
          }}
        >
          {CATEGORY_LABEL[process.category]}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12px',
            color: 'var(--muted-foreground)',
            backgroundColor: 'var(--muted)',
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {process.code}
        </span>
      </div>

      {/* Description */}
      {process.description && (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
            color: 'var(--muted-foreground)',
            lineHeight: 1.6,
            margin: 0,
          }}
        >
          {process.description}
        </p>
      )}

      {/* Key info */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '16px',
          padding: '16px',
          backgroundColor: 'var(--muted)',
          borderRadius: 'var(--radius-md)',
        }}
      >
        {[
          { label: 'Unit of Measure', value: process.unit_of_measure, mono: true },
          { label: 'Min Skill Level', value: null },
          { label: 'Hazard Level', value: process.hazard_level },
          { label: 'Certification Required', value: process.requires_certification ? 'Yes' : 'No' },
        ].map(({ label, value, mono }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '10px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--muted-foreground)',
              }}
            >
              {label}
            </span>
            {label === 'Min Skill Level' ? (
              <SkillDots level={process.min_skill_level} />
            ) : (
              <span
                style={{
                  fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: 'var(--foreground)',
                }}
              >
                {value}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Equipment required */}
      {process.equipment_required.length > 0 && (
        <div>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--muted-foreground)',
            }}
          >
            Equipment Required
          </span>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '8px' }}>
            {process.equipment_required.map((eq) => (
              <span
                key={eq}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  backgroundColor: 'var(--muted)',
                  color: 'var(--foreground)',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                {eq.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Productivity standards table */}
      {sorted.length > 0 && (
        <div>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--muted-foreground)',
            }}
          >
            Productivity Standards
          </span>
          <table
            style={{
              width: '100%',
              marginTop: '10px',
              borderCollapse: 'collapse',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--muted-foreground)',
                  fontSize: '11px',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Level</th>
                <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Name</th>
                <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600 }}>UPH</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((s, idx) => (
                <tr
                  key={s.skill_level}
                  style={{
                    backgroundColor: idx % 2 === 0 ? 'transparent' : 'var(--muted)',
                  }}
                >
                  <td style={{ padding: '8px 8px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
                    L{s.skill_level}
                  </td>
                  <td style={{ padding: '8px 8px', color: 'var(--foreground)' }}>
                    {LEVEL_NAMES[s.skill_level - 1]}
                  </td>
                  <td
                    style={{
                      padding: '8px 8px',
                      textAlign: 'right',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 700,
                      color: 'var(--foreground)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {s.units_per_hour}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ProcessesPage() {
  const { activeSiteId } = useSiteStore()
  const [selectedProcess, setSelectedProcess] = useState<Process | null>(null)

  const { data: processes, isLoading, error } = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId },
  )

  if (!activeSiteId) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '300px',
          gap: '12px',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '15px',
            color: 'var(--muted-foreground)',
          }}
        >
          Select a site to view processes.
        </p>
      </div>
    )
  }

  return (
    <>
      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '860px' }}
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
              Processes
            </h1>
            {isLoading ? (
              <div
                className="animate-pulse"
                style={{ height: '16px', width: '140px', borderRadius: '4px', backgroundColor: 'var(--muted)', marginTop: '6px' }}
              />
            ) : (
              <p
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--muted-foreground)',
                  margin: '4px 0 0',
                }}
              >
                {processes?.length ?? 0} active processes
              </p>
            )}
          </div>

          <motion.button
            variants={scalePress}
            whileTap="press"
            disabled
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
              cursor: 'not-allowed',
              opacity: 0.5,
            }}
          >
            <Plus size={15} />
            Add Process
          </motion.button>
        </motion.div>

        {/* Error state */}
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
            Failed to load processes: {error.message}
          </motion.div>
        )}

        {/* Loading skeletons */}
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse"
                style={{
                  height: '120px',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                }}
              />
            ))}
          </div>
        )}

        {/* Process list */}
        {!isLoading && processes && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {processes.length === 0 ? (
              <motion.p
                variants={fadeInUp}
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '14px',
                  color: 'var(--muted-foreground)',
                }}
              >
                No processes found for this site.
              </motion.p>
            ) : (
              processes.map((p) => (
                <ProcessCard
                  key={p.id as string}
                  process={p as Process}
                  onClick={() => setSelectedProcess(p as Process)}
                />
              ))
            )}
          </div>
        )}
      </motion.div>

      {/* SlideOver detail */}
      <SlideOver
        open={!!selectedProcess}
        onClose={() => setSelectedProcess(null)}
        title={selectedProcess?.name ?? ''}
      >
        {selectedProcess && <ProcessDetail process={selectedProcess} />}
      </SlideOver>
    </>
  )
}
