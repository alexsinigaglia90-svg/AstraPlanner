'use client'

import { motion } from 'framer-motion'
import { RefreshCw } from 'lucide-react'
import { bouncy, containerStagger, fadeInUp } from '@/lib/motion'
import { AnimatedCounter } from '@/components/domain/animated-counter'
import type { ExternalSignal, SignalSource } from '@/lib/insights/types'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SignalFeedProps {
  signals: ExternalSignal[]
  lastUpdated: string | null
  onRefresh: () => void
  isRefreshing: boolean
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SOURCE_COLORS: Record<SignalSource, string> = {
  rivm: '#EF4444',
  pollen: '#F59E0B',
  knmi: '#10B981',
  vakanties: '#3B82F6',
  cbs: '#8B5CF6',
}

const SOURCE_LABELS: Record<SignalSource, string> = {
  rivm: 'RIVM Griep',
  pollen: 'Pollen',
  knmi: 'KNMI',
  vakanties: 'Vakantie',
  cbs: 'CBS Sector',
}

/* ------------------------------------------------------------------ */
/*  Glass card style                                                   */
/* ------------------------------------------------------------------ */

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.6)',
  borderRadius: 20,
  padding: 20,
  boxShadow: 'var(--elevation-2)',
}

/* ------------------------------------------------------------------ */
/*  Value extraction helpers                                           */
/* ------------------------------------------------------------------ */

function extractRivm(signals: ExternalSignal[]): { display: number | null; trend: string } {
  const s = signals.find((sig) => sig.source === 'rivm')
  if (!s) return { display: null, trend: '—' }
  const v = s.value
  const trend = v > 5 ? '↑ Stijgend' : v > 2 ? '→ Stabiel' : '↓ Dalend'
  return { display: v, trend }
}

function extractPollen(signals: ExternalSignal[]): { display: string; trend: string } {
  const pollenSignals = signals.filter((sig) => sig.source === 'pollen')
  if (pollenSignals.length === 0) return { display: '—', trend: '—' }
  const max = pollenSignals.reduce((a, b) => (a.value > b.value ? a : b))
  const level = (max.metadata?.level as string) ?? ''
  return { display: level.charAt(0).toUpperCase() || '—', trend: level || '—' }
}

function extractKnmi(signals: ExternalSignal[]): { display: string; trend: string; numeric: number | null } {
  const knmiSignals = signals.filter((sig) => sig.source === 'knmi')
  const warning = knmiSignals.find((sig) => sig.signal_type === 'weather_warning')
  if (warning) return { display: '⚠', trend: 'Waarschuwing', numeric: null }
  const temp = knmiSignals.find((sig) => sig.signal_type === 'temperature')
  if (temp) return { display: `${Math.round(temp.value)}°`, trend: 'Temperatuur', numeric: Math.round(temp.value) }
  const first = knmiSignals[0]
  if (first) return { display: `${Math.round(first.value)}°`, trend: 'Weer', numeric: Math.round(first.value) }
  return { display: '—', trend: '—', numeric: null }
}

function extractVakanties(signals: ExternalSignal[]): { display: string; trend: string } {
  const s = signals.find((sig) => sig.source === 'vakanties')
  if (!s) return { display: '—', trend: 'Volg: Nd' }
  const active = s.value > 0
  const name = (s.metadata?.holiday_name as string) ?? ''
  return { display: active ? '✓' : '—', trend: name || 'Volg: Nd' }
}

function extractCbs(signals: ExternalSignal[]): { display: string; trend: string; numeric: number | null } {
  const s = signals.find((sig) => sig.source === 'cbs')
  if (!s) return { display: '—', trend: '—', numeric: null }
  return { display: `${Math.round(s.value)}%`, trend: 'Sector benchmark', numeric: Math.round(s.value) }
}

/* ------------------------------------------------------------------ */
/*  Tile sub-component                                                 */
/* ------------------------------------------------------------------ */

interface TileData {
  source: string
  label: string
  color: string
  displayText: string | null
  numericValue: number | null
  trend: string
  suffix?: string
}

function SignalTile({ source, label, color, displayText, numericValue, trend, suffix }: TileData) {
  return (
    <motion.div
      variants={fadeInUp}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: 12,
        borderRadius: 14,
        background: `${color}0A`,
        border: `1px solid ${color}20`,
        minWidth: 0,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color,
        }}
      >
        {label}
      </span>

      <span style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>
        {numericValue != null ? (
          <AnimatedCounter value={numericValue} suffix={suffix} style={{ color }} />
        ) : (
          displayText ?? '—'
        )}
      </span>

      <span style={{ fontSize: 12, color: '#64748B' }}>{trend}</span>
    </motion.div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function InsightsSignalFeed({ signals, lastUpdated, onRefresh, isRefreshing }: SignalFeedProps) {
  const rivm = extractRivm(signals)
  const pollen = extractPollen(signals)
  const knmi = extractKnmi(signals)
  const vakanties = extractVakanties(signals)
  const cbs = extractCbs(signals)

  const tiles: TileData[] = [
    {
      source: 'rivm',
      label: SOURCE_LABELS.rivm,
      color: SOURCE_COLORS.rivm,
      displayText: rivm.display != null ? String(rivm.display) : null,
      numericValue: rivm.display,
      trend: rivm.trend,
    },
    {
      source: 'pollen',
      label: SOURCE_LABELS.pollen,
      color: SOURCE_COLORS.pollen,
      displayText: pollen.display,
      numericValue: null,
      trend: pollen.trend,
    },
    {
      source: 'knmi',
      label: SOURCE_LABELS.knmi,
      color: SOURCE_COLORS.knmi,
      displayText: knmi.display,
      numericValue: knmi.numeric,
      trend: knmi.trend,
      suffix: '°',
    },
    {
      source: 'vakanties',
      label: SOURCE_LABELS.vakanties,
      color: SOURCE_COLORS.vakanties,
      displayText: vakanties.display,
      numericValue: null,
      trend: vakanties.trend,
    },
    {
      source: 'cbs',
      label: SOURCE_LABELS.cbs,
      color: SOURCE_COLORS.cbs,
      displayText: cbs.display,
      numericValue: cbs.numeric,
      trend: cbs.trend,
      suffix: '%',
    },
  ]

  return (
    <div style={glassCard}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
            Externe Signalen
          </span>
          {lastUpdated && (
            <span style={{ fontSize: 12, color: '#94A3B8' }}>
              Laatste update: {lastUpdated}
            </span>
          )}
        </div>

        <motion.button
          onClick={onRefresh}
          disabled={isRefreshing}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.92 }}
          transition={bouncy}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 10,
            border: '1px solid rgba(0,0,0,0.08)',
            background: 'rgba(255,255,255,0.8)',
            cursor: isRefreshing ? 'default' : 'pointer',
            fontSize: 13,
            fontWeight: 600,
            color: '#475569',
          }}
        >
          <motion.span
            animate={isRefreshing ? { rotate: 360 } : { rotate: 0 }}
            transition={
              isRefreshing
                ? { repeat: Infinity, duration: 0.8, ease: 'linear' }
                : { duration: 0 }
            }
            style={{ display: 'flex', alignItems: 'center' }}
          >
            <RefreshCw size={14} />
          </motion.span>
          Ververs
        </motion.button>
      </div>

      {/* Tiles grid */}
      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 12,
        }}
      >
        {tiles.map((tile) => (
          <SignalTile key={tile.source} {...tile} />
        ))}
      </motion.div>
    </div>
  )
}
