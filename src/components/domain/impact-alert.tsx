'use client'

import { motion } from 'framer-motion'
import { bouncy, containerStagger, fadeInUp } from '@/lib/motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface ImpactAlertProps {
  impact: {
    affected_processes: Array<{
      process_id: string
      process_name: string
      coverage_before: number
      coverage_after: number
      fte_lost: number
    }>
    total_shifts_uncovered: number
    overall_coverage_drop: number
  }
  loading?: boolean
}

// ── Shimmer Placeholder ──────────────────────────────────────────────────────

const SHIMMER_STYLE_ID = 'impact-alert-shimmer'

function ensureShimmerKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SHIMMER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SHIMMER_STYLE_ID
  style.textContent = `
@keyframes impactShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`
  document.head.appendChild(style)
}

function ShimmerBar({ width, height = 14, delay = 0 }: { width: string; height?: number; delay?: number }) {
  ensureShimmerKeyframes()
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay }}
      style={{
        width,
        height,
        borderRadius: 6,
        background: 'linear-gradient(90deg, rgba(100,116,139,0.06) 25%, rgba(100,116,139,0.12) 50%, rgba(100,116,139,0.06) 75%)',
        backgroundSize: '200% 100%',
        animation: 'impactShimmer 1.5s ease-in-out infinite',
      }}
    />
  )
}

function LoadingSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <ShimmerBar width="40%" height={16} delay={0} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <ShimmerBar width="30%" height={12} delay={i * 0.1} />
            <ShimmerBar width="15%" height={12} delay={i * 0.1 + 0.05} />
          </div>
          <ShimmerBar width="100%" height={24} delay={i * 0.1 + 0.1} />
        </div>
      ))}
    </div>
  )
}

// ── Pulse Keyframes ──────────────────────────────────────────────────────────

const PULSE_STYLE_ID = 'impact-pulse'

function ensurePulseKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(PULSE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PULSE_STYLE_ID
  style.textContent = `
@keyframes impactPulseGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
  50% { box-shadow: 0 0 16px 2px rgba(239,68,68,0.1); }
}
`
  document.head.appendChild(style)
}

// ── Component ────────────────────────────────────────────────────────────────

export function ImpactAlert({ impact, loading = false }: ImpactAlertProps) {
  const isCritical = impact.overall_coverage_drop > 20
  if (isCritical) ensurePulseKeyframes()

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={bouncy}
      style={{
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(10px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.4)',
        border: `1px solid ${isCritical ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.15)'}`,
        borderRadius: 18,
        padding: '20px 24px',
        overflow: 'hidden',
        position: 'relative',
        animation: isCritical ? 'impactPulseGlow 3s ease-in-out infinite' : undefined,
      }}
    >
      {/* ── Accent strip ──────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          borderRadius: '18px 18px 0 0',
          background: isCritical
            ? 'linear-gradient(90deg, #EF4444, #F87171)'
            : 'linear-gradient(90deg, #F59E0B, #FBBF24)',
        }}
      />

      {/* ── Header ────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 18,
        }}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ ...bouncy, delay: 0.1 }}
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            background: isCritical
              ? 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.05))'
              : 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(245,158,11,0.05))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={isCritical ? '#EF4444' : '#F59E0B'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </motion.div>

        <span
          style={{
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--foreground)',
            flex: 1,
          }}
        >
          Impact op bezetting
        </span>

        {/* Overall coverage drop number */}
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...bouncy, delay: 0.2 }}
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 20,
            fontWeight: 700,
            color: isCritical ? '#EF4444' : '#F59E0B',
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          -{impact.overall_coverage_drop.toFixed(1)}%
        </motion.span>
      </div>

      {/* ── Loading / Content ─────────────────────────── */}
      {loading ? (
        <LoadingSkeleton />
      ) : impact.affected_processes.length === 0 ? (
        <div style={{
          padding: '12px 0',
          textAlign: 'center',
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          fontSize: 13,
          color: 'var(--muted-foreground)',
        }}>
          Geen directe impact — medewerker heeft nog geen skills toegewezen.
        </div>
      ) : (
        <motion.div
          variants={containerStagger}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {impact.affected_processes.map((proc) => {
            const beforePct = Math.min(proc.coverage_before, 100)
            const afterPct = Math.min(proc.coverage_after, 100)
            const lostWidth = beforePct - afterPct

            return (
              <motion.div key={proc.process_id} variants={fadeInUp}>
                {/* Process label row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 6,
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                      fontSize: 12,
                      fontWeight: 500,
                      color: 'var(--foreground)',
                    }}
                  >
                    {proc.process_name}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 11,
                        fontWeight: 600,
                        color: 'var(--muted-foreground)',
                        textDecoration: 'line-through',
                      }}
                    >
                      {proc.coverage_before.toFixed(0)}%
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 12,
                        fontWeight: 700,
                        color: proc.coverage_after < 80 ? '#EF4444' : '#F59E0B',
                      }}
                    >
                      {proc.coverage_after.toFixed(0)}%
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                        fontSize: 10,
                        fontWeight: 500,
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      (-{proc.fte_lost.toFixed(1)} FTE)
                    </span>
                  </div>
                </div>

                {/* Bar */}
                <div
                  style={{
                    position: 'relative',
                    height: 24,
                    borderRadius: 8,
                    background: 'rgba(100,116,139,0.04)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Remaining coverage */}
                  <motion.div
                    initial={{ width: `${beforePct}%` }}
                    animate={{ width: `${afterPct}%` }}
                    transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.4 }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      borderRadius: afterPct >= 100 ? 8 : '8px 0 0 8px',
                      background: afterPct >= 90
                        ? 'linear-gradient(90deg, #10B981, #34D399)'
                        : afterPct >= 70
                          ? 'linear-gradient(90deg, #F59E0B, #FBBF24)'
                          : 'linear-gradient(90deg, #EF4444, #F87171)',
                      zIndex: 1,
                    }}
                  />

                  {/* Lost zone (hatched red) */}
                  {lostWidth > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.5, delay: 1.4 }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: `${afterPct}%`,
                        width: `${lostWidth}%`,
                        height: '100%',
                        borderRadius: '0 8px 8px 0',
                        background:
                          'repeating-linear-gradient(-45deg, rgba(239,68,68,0.08), rgba(239,68,68,0.08) 3px, rgba(239,68,68,0.16) 3px, rgba(239,68,68,0.16) 6px)',
                        borderLeft: '2px dashed rgba(239,68,68,0.3)',
                      }}
                    />
                  )}
                </div>
              </motion.div>
            )
          })}

          {/* ── Summary row ───────────────────────────── */}
          <motion.div
            variants={fadeInUp}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 4,
              padding: '10px 14px',
              background: 'rgba(100,116,139,0.03)',
              borderRadius: 10,
              border: '1px solid rgba(100,116,139,0.06)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--muted-foreground)',
              }}
            >
              Niet-gedekte diensten
            </span>
            <span
              style={{
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontVariantNumeric: 'tabular-nums',
                fontSize: 14,
                fontWeight: 700,
                color: isCritical ? '#EF4444' : '#F59E0B',
              }}
            >
              {impact.total_shifts_uncovered}
            </span>
          </motion.div>
        </motion.div>
      )}
    </motion.div>
  )
}
