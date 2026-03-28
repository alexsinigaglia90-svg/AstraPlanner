'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { bouncy, gentle } from '@/lib/motion'
import { SmartIcon } from './smart-icon'
import { X } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface GapDrilldownProps {
  processName: string
  processId: string
  weekLabel: string
  periodStart: string
  demandVolume: number
  hoursNeeded: number | null
  fteNeeded: number | null
  hoursAvailable: number
  fteAvailable: number
  weightedUph: number | null
  coveragePct: number
  crossTrainedCount: number
  highProficiencyCount: number
  onClose: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number | null, decimals = 1): string =>
  n === null
    ? '\u2014'
    : n.toLocaleString('nl-NL', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })

const fmtInt = (n: number): string => n.toLocaleString('nl-NL')

// ── Radial Gauge (Bklit ring-chart inspired) ─────────────────────────────────

function RadialGauge({
  pct,
  size = 120,
  stroke = 10,
}: {
  pct: number
  size?: number
  stroke?: number
}) {
  const clamped = Math.max(0, Math.min(pct, 150))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  // Three-quarter arc (270 degrees)
  const arcLength = circumference * 0.75
  const filledLength = arcLength * Math.min(clamped / 100, 1.5)

  const color =
    pct > 110
      ? '#3B82F6'
      : pct >= 90
        ? '#10B981'
        : pct >= 70
          ? '#F59E0B'
          : '#EF4444'

  const bgColor =
    pct > 110
      ? 'rgba(59,130,246,0.08)'
      : pct >= 90
        ? 'rgba(16,185,129,0.08)'
        : pct >= 70
          ? 'rgba(245,158,11,0.08)'
          : 'rgba(239,68,68,0.08)'

  // Rotate so arc starts at bottom-left (225deg from top = -135deg)
  const startAngle = 135

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ transform: `rotate(${startAngle}deg)` }}
      >
        {/* Background arc */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(100,116,139,0.08)"
          strokeWidth={stroke}
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeLinecap="round"
        />
        {/* Filled arc */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={`${filledLength} ${circumference}`}
          strokeLinecap="round"
          initial={{ strokeDasharray: `0 ${circumference}` }}
          animate={{ strokeDasharray: `${filledLength} ${circumference}` }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
        />
      </svg>
      {/* Center label */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingBottom: 6,
        }}
      >
        <motion.span
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...bouncy, delay: 0.8 }}
          style={{
            fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 26,
            fontWeight: 700,
            color,
            lineHeight: 1,
            letterSpacing: '-0.02em',
          }}
        >
          {Math.round(pct)}%
        </motion.span>
        <span
          style={{
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 9.5,
            fontWeight: 500,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginTop: 2,
          }}
        >
          dekking
        </span>
      </div>
    </div>
  )
}

// ── Glassmorphism Stat Card ──────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  accentColor,
  delay = 0,
}: {
  label: string
  value: string
  sub: string
  accentColor?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...bouncy, delay }}
      whileHover={{
        y: -2,
        boxShadow: '0 6px 20px rgba(30,27,75,0.06)',
        transition: { duration: 0.2 },
      }}
      style={{
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(10px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.4)',
        border: '1px solid rgba(255,255,255,0.5)',
        borderRadius: 14,
        padding: '14px 18px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle top accent */}
      {accentColor && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: accentColor,
            borderRadius: '14px 14px 0 0',
            opacity: 0.6,
          }}
        />
      )}
      <span
        style={{
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--muted-foreground)',
        }}
      >
        {label}
      </span>
      <div
        style={{
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 24,
          fontWeight: 700,
          color: accentColor ?? 'var(--foreground)',
          marginTop: 3,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
      <span
        style={{
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          fontSize: 11,
          color: 'var(--muted-foreground)',
          lineHeight: 1.4,
        }}
      >
        {sub}
      </span>
    </motion.div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function GapDrilldown({
  processName,
  weekLabel,
  demandVolume,
  hoursNeeded,
  fteNeeded,
  hoursAvailable,
  fteAvailable,
  coveragePct,
  crossTrainedCount,
  highProficiencyCount,
  onClose,
}: GapDrilldownProps) {
  const shortage = (fteNeeded ?? 0) - fteAvailable
  const shortageHours = (hoursNeeded ?? 0) - hoursAvailable
  const hasShortage = shortage > 0
  const barRatio =
    fteNeeded && fteNeeded > 0 ? Math.min(fteAvailable / fteNeeded, 1) : 1

  return (
    <AnimatePresence>
      <motion.div
        key="gap-drilldown"
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        transition={gentle}
        style={{ overflow: 'hidden' }}
      >
        <div
          style={{
            // Glassmorphism container
            background: 'rgba(255,255,255,0.6)',
            backdropFilter: 'blur(16px) saturate(1.6)',
            WebkitBackdropFilter: 'blur(16px) saturate(1.6)',
            border: '1px solid rgba(255,255,255,0.5)',
            borderRadius: 22,
            padding: '24px 28px',
            margin: '8px 0 16px',
            boxShadow:
              '0 8px 32px rgba(30,27,75,0.06), 0 2px 8px rgba(30,27,75,0.03)',
          }}
        >
          {/* ── Header ──────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginBottom: 22,
            }}
          >
            <SmartIcon
              name={processName}
              type="process"
              color="var(--primary)"
              size={18}
            />
            <span
              style={{
                fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                fontWeight: 600,
                fontSize: 15,
                color: 'var(--foreground)',
              }}
            >
              {processName}
            </span>

            {/* Week badge */}
            <span
              style={{
                fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                fontSize: 11,
                fontWeight: 500,
                color: 'var(--primary)',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.15)',
                borderRadius: 7,
                padding: '2px 9px',
              }}
            >
              {weekLabel}
            </span>

            {/* Shortage badge */}
            {hasShortage && (
              <motion.span
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={bouncy}
                style={{
                  fontFamily:
                    'var(--font-mono, "JetBrains Mono", monospace)',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#EF4444',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.15)',
                  borderRadius: 7,
                  padding: '2px 9px',
                }}
              >
                -{fmt(shortage)} FTE
              </motion.span>
            )}

            <div style={{ flex: 1 }} />

            {/* Close */}
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.1, background: 'rgba(100,116,139,0.06)' }}
              whileTap={{ scale: 0.92 }}
              transition={bouncy}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 30,
                height: 30,
                borderRadius: 9,
                border: '1px solid rgba(100,116,139,0.12)',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
              }}
            >
              <X size={14} />
            </motion.button>
          </div>

          {/* ── Main Content: Gauge + Bars ──────────────────── */}
          <div
            style={{
              display: 'flex',
              gap: 28,
              alignItems: 'center',
              marginBottom: 22,
            }}
          >
            {/* Radial Gauge */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...bouncy, delay: 0.1 }}
              style={{ flexShrink: 0 }}
            >
              <RadialGauge pct={Number(coveragePct) || 0} />
            </motion.div>

            {/* FTE Bars */}
            <div
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {/* Nodig bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--muted-foreground)',
                    width: 80,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  Nodig
                </span>
                <div
                  style={{
                    flex: 1,
                    position: 'relative',
                    height: 32,
                    borderRadius: 10,
                    background: 'rgba(99,102,241,0.04)',
                    overflow: 'hidden',
                  }}
                >
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{
                      duration: 1,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                    style={{
                      height: '100%',
                      borderRadius: 10,
                      background:
                        'linear-gradient(90deg, var(--primary, #6366F1), #818CF8)',
                    }}
                  />
                </div>
                <span
                  style={{
                    fontFamily:
                      'var(--font-mono, "JetBrains Mono", monospace)',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 13,
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    width: 90,
                    flexShrink: 0,
                  }}
                >
                  {fmt(fteNeeded)} FTE
                </span>
              </div>

              {/* Beschikbaar bar */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--muted-foreground)',
                    width: 80,
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  Beschikbaar
                </span>
                <div
                  style={{
                    flex: 1,
                    position: 'relative',
                    height: 32,
                    borderRadius: 10,
                    background: 'rgba(99,102,241,0.04)',
                    overflow: 'hidden',
                  }}
                >
                  {/* Filled portion */}
                  <motion.div
                    initial={{ width: '0%' }}
                    animate={{ width: `${barRatio * 100}%` }}
                    transition={{
                      duration: 1,
                      ease: [0.22, 1, 0.36, 1],
                      delay: 0.5,
                    }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      height: '100%',
                      borderRadius:
                        barRatio >= 1 ? 10 : '10px 0 0 10px',
                      background:
                        'linear-gradient(90deg, #10B981, #34D399)',
                      zIndex: 1,
                    }}
                  />
                  {/* Gap zone (hatched) */}
                  {hasShortage && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.4, delay: 1.5 }}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: `${barRatio * 100}%`,
                        width: `${(1 - barRatio) * 100}%`,
                        height: '100%',
                        borderRadius: '0 10px 10px 0',
                        borderLeft: '2px dashed #EF4444',
                        background:
                          'repeating-linear-gradient(-45deg, rgba(239,68,68,0.06), rgba(239,68,68,0.06) 3px, rgba(239,68,68,0.12) 3px, rgba(239,68,68,0.12) 6px)',
                      }}
                    />
                  )}
                </div>
                <span
                  style={{
                    fontFamily:
                      'var(--font-mono, "JetBrains Mono", monospace)',
                    fontVariantNumeric: 'tabular-nums',
                    fontSize: 13,
                    fontWeight: 600,
                    color: hasShortage ? '#EF4444' : 'var(--foreground)',
                    width: 90,
                    flexShrink: 0,
                  }}
                >
                  {fmt(fteAvailable)}
                  {hasShortage ? ` (-${fmt(shortage)})` : ''} FTE
                </span>
              </div>
            </div>
          </div>

          {/* ── Stat Cards (3-column) ───────────────────────── */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 12,
              marginBottom: crossTrainedCount > 0 ? 18 : 0,
            }}
          >
            <StatCard
              label="Demand Volume"
              value={fmtInt(demandVolume)}
              sub="stuks / eenheden"
              accentColor="var(--primary, #6366F1)"
              delay={0.3}
            />
            <StatCard
              label="Uren Nodig"
              value={fmt(hoursNeeded, 0)}
              sub={`uur (${fmt(fteNeeded)} FTE)`}
              accentColor="#818CF8"
              delay={0.4}
            />
            <StatCard
              label="Tekort"
              value={hasShortage ? `-${fmt(shortage)}` : '0'}
              sub={
                hasShortage
                  ? `${fmt(shortageHours, 0)} uur tekort`
                  : 'volledig gedekt'
              }
              accentColor={hasShortage ? '#EF4444' : '#10B981'}
              delay={0.5}
            />
          </div>

          {/* ── Insight Banner ───────────────────────────────── */}
          {crossTrainedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...bouncy, delay: 0.6 }}
              whileHover={{
                y: -2,
                boxShadow: '0 4px 16px rgba(245,158,11,0.08)',
                transition: { duration: 0.2 },
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                background: 'rgba(255,255,255,0.5)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                border: '1px solid rgba(245,158,11,0.15)',
                borderRadius: 12,
                padding: '12px 16px',
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background:
                    'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.06))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 14,
                }}
              >
                💡
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                  fontSize: 12.5,
                  color: 'var(--foreground)',
                  flex: 1,
                  lineHeight: 1.5,
                }}
              >
                <strong>{crossTrainedCount}</strong> medewerkers met{' '}
                <strong>{processName}</strong> skill beschikbaar in
                andere processen
                {highProficiencyCount > 0 && (
                  <>
                    {' '}
                    — <strong>{highProficiencyCount}</strong> op
                    proficiency 4+
                  </>
                )}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  opacity: 0.5,
                  cursor: 'not-allowed',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                }}
              >
                Bekijk suggesties →
              </span>
            </motion.div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
