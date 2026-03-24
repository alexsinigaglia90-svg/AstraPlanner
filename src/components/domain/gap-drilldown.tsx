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
  n === null ? '—' : n.toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

const fmtInt = (n: number): string => n.toLocaleString('nl-NL')

// ── Component ────────────────────────────────────────────────────────────────

export function GapDrilldown({
  processName,
  processId,
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
  const barRatio = fteNeeded && fteNeeded > 0 ? Math.min(fteAvailable / fteNeeded, 1) : 1

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
            background: 'var(--card)',
            border: '1px solid var(--border)',
            borderRadius: 20,
            padding: '24px 28px',
            margin: '8px 0 16px',
            boxShadow: 'var(--elevation-1)',
          }}
        >
          {/* ── Header ────────────────────────────────────────── */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 24,
            }}
          >
            <SmartIcon name={processName} type="process" color="var(--primary)" size={20} />
            <span
              style={{
                fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                fontWeight: 600,
                fontSize: 16,
                color: 'var(--foreground)',
              }}
            >
              {processName}
            </span>

            {/* Week badge */}
            <span
              style={{
                fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                fontSize: 12,
                fontWeight: 500,
                color: 'var(--primary)',
                background: 'rgba(99,102,241,0.08)',
                border: '1px solid rgba(99,102,241,0.18)',
                borderRadius: 8,
                padding: '3px 10px',
              }}
            >
              {weekLabel}
            </span>

            {/* Shortage badge */}
            {hasShortage && (
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)',
                  fontSize: 12,
                  fontWeight: 600,
                  color: '#EF4444',
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.18)',
                  borderRadius: 8,
                  padding: '3px 10px',
                }}
              >
                -{fmt(shortage)} FTE
              </span>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Close button */}
            <motion.button
              onClick={onClose}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.92 }}
              transition={bouncy}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'transparent',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
              }}
            >
              <X size={16} />
            </motion.button>
          </div>

          {/* ── FTE Bars ──────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
            {/* Nodig bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  width: 90,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                Nodig
              </span>
              <div style={{ flex: 1, position: 'relative', height: 36, borderRadius: 12, background: 'rgba(99,102,241,0.06)' }}>
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    height: '100%',
                    borderRadius: 12,
                    background: 'linear-gradient(90deg, var(--primary), #818CF8)',
                  }}
                />
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'var(--foreground)',
                  width: 100,
                  flexShrink: 0,
                }}
              >
                {fmt(fteNeeded)} FTE
              </span>
            </div>

            {/* Beschikbaar bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 13,
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  width: 90,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                Beschikbaar
              </span>
              <div style={{ flex: 1, position: 'relative', height: 36, borderRadius: 12, background: 'rgba(99,102,241,0.06)' }}>
                {/* Filled portion */}
                <motion.div
                  initial={{ width: '0%' }}
                  animate={{ width: `${barRatio * 100}%` }}
                  transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.7 }}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    height: '100%',
                    borderRadius: barRatio >= 1 ? 12 : '12px 0 0 12px',
                    background: 'linear-gradient(90deg, #10B981, #34D399)',
                    zIndex: 1,
                  }}
                />
                {/* Gap zone */}
                {hasShortage && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.4, delay: 1.9 }}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: `${barRatio * 100}%`,
                      width: `${(1 - barRatio) * 100}%`,
                      height: '100%',
                      borderRadius: '0 12px 12px 0',
                      borderLeft: '2px dashed #EF4444',
                      background:
                        'repeating-linear-gradient(-45deg, rgba(239,68,68,0.08), rgba(239,68,68,0.08) 4px, rgba(239,68,68,0.15) 4px, rgba(239,68,68,0.15) 8px)',
                    }}
                  />
                )}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)',
                  fontSize: 14,
                  fontWeight: 600,
                  color: hasShortage ? '#EF4444' : 'var(--foreground)',
                  width: 100,
                  flexShrink: 0,
                }}
              >
                {fmt(fteAvailable)}{hasShortage ? ` / -${fmt(shortage)}` : ''} FTE
              </span>
            </div>
          </div>

          {/* ── Detail Cards (3-column grid) ──────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 24 }}>
            {/* Demand Volume */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...bouncy, delay: 0.3 }}
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(139,92,246,0.02))',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '16px 20px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--muted-foreground)',
                }}
              >
                Demand Volume
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)',
                  fontSize: 28,
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  marginTop: 4,
                }}
              >
                {fmtInt(demandVolume)}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                }}
              >
                stuks / eenheden
              </span>
            </motion.div>

            {/* Uren Nodig */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...bouncy, delay: 0.4 }}
              style={{
                background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(139,92,246,0.02))',
                border: '1px solid var(--border)',
                borderRadius: 16,
                padding: '16px 20px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--muted-foreground)',
                }}
              >
                Uren Nodig
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)',
                  fontSize: 28,
                  fontWeight: 700,
                  color: 'var(--foreground)',
                  marginTop: 4,
                }}
              >
                {fmt(hoursNeeded, 0)}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                }}
              >
                uur ({fmt(fteNeeded)} FTE)
              </span>
            </motion.div>

            {/* Tekort */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ ...bouncy, delay: 0.5 }}
              style={{
                background: hasShortage
                  ? 'linear-gradient(135deg, rgba(239,68,68,0.06), rgba(239,68,68,0.02))'
                  : 'linear-gradient(135deg, rgba(16,185,129,0.06), rgba(16,185,129,0.02))',
                border: hasShortage
                  ? '1px solid rgba(239,68,68,0.2)'
                  : '1px solid rgba(16,185,129,0.2)',
                borderRadius: 16,
                padding: '16px 20px',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--muted-foreground)',
                }}
              >
                Tekort
              </span>
              <div
                style={{
                  fontFamily: 'var(--font-jetbrains, "JetBrains Mono", monospace)',
                  fontSize: 28,
                  fontWeight: 700,
                  color: hasShortage ? '#EF4444' : '#10B981',
                  marginTop: 4,
                }}
              >
                {hasShortage ? `-${fmt(shortage)}` : '0'}
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                }}
              >
                {hasShortage ? `${fmt(shortageHours, 0)} uur tekort` : 'volledig gedekt'}
              </span>
            </motion.div>
          </div>

          {/* ── Insight Banner ────────────────────────────────── */}
          {crossTrainedCount > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...bouncy, delay: 0.6 }}
              whileHover={{
                y: -2,
                boxShadow: '0 4px 16px rgba(245,158,11,0.1)',
                transition: bouncy,
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                background: 'linear-gradient(135deg, rgba(245,158,11,0.06), rgba(245,158,11,0.02))',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: 14,
                padding: '14px 18px',
              }}
            >
              {/* Bulb icon container */}
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  background: 'rgba(245,158,11,0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 16,
                }}
              >
                💡
              </div>

              {/* Text */}
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 13,
                  color: 'var(--foreground)',
                  flex: 1,
                  lineHeight: 1.5,
                }}
              >
                <strong>{crossTrainedCount}</strong> medewerkers met{' '}
                <strong>{processName}</strong> skill beschikbaar in andere processen
                {highProficiencyCount > 0 && (
                  <> — <strong>{highProficiencyCount}</strong> op proficiency 4+</>
                )}
              </span>

              {/* Phase 5 placeholder */}
              <span
                style={{
                  fontFamily: 'var(--font-dm-sans, "DM Sans", sans-serif)',
                  fontSize: 12,
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
