'use client'

import { motion } from 'framer-motion'
import { bouncy, containerStagger, fadeInUp } from '@/lib/motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface ReplacementSuggestionsProps {
  suggestions: Array<{
    employee_id: string
    employee_name: string
    score: number
    confidence: 'high' | 'medium' | 'low'
    breakdown: {
      skill_score: number
      availability_score: number
      proximity_score: number
      recency_score: number
    }
    matching_processes: string[]
  }>
  loading?: boolean
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
}

function confidenceConfig(c: 'high' | 'medium' | 'low') {
  switch (c) {
    case 'high': return { color: '#10B981', bg: 'rgba(16,185,129,0.06)', border: 'rgba(16,185,129,0.15)', label: 'Hoog' }
    case 'medium': return { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)', label: 'Midden' }
    case 'low': return { color: '#94A3B8', bg: 'rgba(100,116,139,0.05)', border: 'rgba(100,116,139,0.12)', label: 'Laag' }
  }
}

// ── Shimmer ──────────────────────────────────────────────────────────────────

const SHIMMER_STYLE_ID = 'replacement-shimmer'

function ensureShimmerKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(SHIMMER_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = SHIMMER_STYLE_ID
  style.textContent = `
@keyframes replacementShimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`
  document.head.appendChild(style)
}

function ShimmerBlock({ width, height, delay = 0 }: { width: string; height: number; delay?: number }) {
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
        animation: 'replacementShimmer 1.5s ease-in-out infinite',
      }}
    />
  )
}

// ── Mini Gauge ───────────────────────────────────────────────────────────────

function MiniGauge({ score, size = 44, stroke = 4 }: { score: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.max(0, Math.min(score, 100))
  const filledLength = circumference * (clamped / 100)

  const color =
    score >= 80 ? '#10B981'
    : score >= 60 ? '#F59E0B'
    : '#EF4444'

  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(100,116,139,0.08)"
          strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filledLength} ${circumference}`}
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${filledLength} ${circumference}` }}
          transition={{ duration: 1, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 11,
            fontWeight: 700,
            color,
            lineHeight: 1,
          }}
        >
          {Math.round(score)}
        </span>
      </div>
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function ReplacementSuggestions({ suggestions, loading = false }: ReplacementSuggestionsProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={bouncy}
      style={{
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(10px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.4)',
        border: '1px solid rgba(99,102,241,0.1)',
        borderRadius: 18,
        padding: '20px 24px',
        overflow: 'hidden',
        position: 'relative',
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
          background: 'linear-gradient(90deg, #6366F1, #818CF8)',
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
            background: 'linear-gradient(135deg, rgba(99,102,241,0.1), rgba(99,102,241,0.05))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.09 3.26L16.36 7.5 13.09 8.76 12 12l-1.09-3.24L7.64 7.5l3.27-1.24L12 3z" />
            <path d="M5 16l.55 1.64L7.18 18.2 5.55 18.76 5 20.4l-.55-1.64L2.82 18.2l1.63-.56L5 16z" />
            <path d="M19 11l.55 1.64 1.63.56-1.63.56L19 15.4l-.55-1.64-1.63-.56 1.63-.56L19 11z" />
          </svg>
        </motion.div>

        <span
          style={{
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontWeight: 600,
            fontSize: 14,
            color: 'var(--foreground)',
          }}
        >
          Vervangsuggesties
        </span>
      </div>

      {/* ── Loading state ─────────────────────────────── */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                background: 'rgba(100,116,139,0.02)',
                borderRadius: 12,
                border: '1px solid rgba(100,116,139,0.06)',
              }}
            >
              <ShimmerBlock width="36px" height={36} delay={i * 0.1} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <ShimmerBlock width="50%" height={12} delay={i * 0.1 + 0.05} />
                <ShimmerBlock width="30%" height={10} delay={i * 0.1 + 0.1} />
              </div>
              <ShimmerBlock width="44px" height={44} delay={i * 0.1 + 0.15} />
            </div>
          ))}
        </div>
      ) : suggestions.length === 0 ? (
        /* ── Empty state ──────────────────────────────── */
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          style={{
            textAlign: 'center',
            padding: '24px 16px',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: 'rgba(100,116,139,0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px',
              fontSize: 20,
            }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
              <line x1="8" y1="11" x2="14" y2="11" />
            </svg>
          </div>
          <span
            style={{
              fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
              fontSize: 13,
              color: 'var(--muted-foreground)',
              lineHeight: 1.5,
            }}
          >
            Geen geschikte vervangers gevonden
          </span>
        </motion.div>
      ) : (
        /* ── Suggestion cards ─────────────────────────── */
        <motion.div
          variants={containerStagger}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
        >
          {suggestions.map((s) => {
            const conf = confidenceConfig(s.confidence)
            return (
              <motion.div
                key={s.employee_id}
                variants={fadeInUp}
                whileHover={{
                  y: -1,
                  boxShadow: '0 4px 16px rgba(30,27,75,0.06)',
                  transition: { duration: 0.2 },
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  background: 'rgba(255,255,255,0.5)',
                  borderRadius: 12,
                  border: '1px solid rgba(100,116,139,0.08)',
                  cursor: 'default',
                }}
              >
                {/* Avatar */}
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: 'linear-gradient(135deg, #6366F1, #818CF8)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(99,102,241,0.15)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                      fontWeight: 700,
                      fontSize: 12,
                      color: '#fff',
                      lineHeight: 1,
                    }}
                  >
                    {getInitials(s.employee_name)}
                  </span>
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                        fontWeight: 600,
                        fontSize: 13,
                        color: 'var(--foreground)',
                        lineHeight: 1.2,
                      }}
                    >
                      {s.employee_name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                        fontSize: 9.5,
                        fontWeight: 600,
                        color: conf.color,
                        background: conf.bg,
                        border: `1px solid ${conf.border}`,
                        borderRadius: 5,
                        padding: '1px 6px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                      }}
                    >
                      {conf.label}
                    </span>
                  </div>

                  {/* Process badges */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {s.matching_processes.map((proc) => (
                      <span
                        key={proc}
                        style={{
                          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                          fontSize: 10,
                          fontWeight: 500,
                          color: '#6366F1',
                          background: 'rgba(99,102,241,0.06)',
                          border: '1px solid rgba(99,102,241,0.1)',
                          borderRadius: 5,
                          padding: '1px 6px',
                        }}
                      >
                        {proc}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Mini gauge */}
                <MiniGauge score={s.score} />
              </motion.div>
            )
          })}
        </motion.div>
      )}
    </motion.div>
  )
}
