'use client'

import { motion } from 'framer-motion'
import { bouncy, fadeInUp } from '@/lib/motion'
import type { TrendPoint } from '@/lib/insights/types'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface InsightsTrendChartProps {
  internal: TrendPoint[]
  national: TrendPoint[]
}

/* ------------------------------------------------------------------ */
/*  Glass card style                                                    */
/* ------------------------------------------------------------------ */

const glassCard: React.CSSProperties = {
  background: 'rgba(255,255,255,0.72)',
  backdropFilter: 'blur(16px)',
  border: '1px solid rgba(255,255,255,0.6)',
  borderRadius: 20,
  padding: 16,
  boxShadow: 'var(--elevation-2)',
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

const DUTCH_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

const CHART_W = 300
const CHART_H = 140
const PAD_L = 28
const PAD_R = 8
const PAD_T = 12
const PAD_B = 24

function toCoords(
  points: TrendPoint[],
  min: number,
  max: number,
): { x: number; y: number }[] {
  const plotW = CHART_W - PAD_L - PAD_R
  const plotH = CHART_H - PAD_T - PAD_B
  const range = max - min || 1

  return points.map((p, i) => ({
    x: PAD_L + (points.length > 1 ? (i / (points.length - 1)) * plotW : plotW / 2),
    y: PAD_T + plotH - ((p.value - min) / range) * plotH,
  }))
}

function toPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return ''
  return coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
}

function toAreaPath(coords: { x: number; y: number }[]): string {
  if (coords.length === 0) return ''
  const bottom = CHART_H - PAD_B
  const line = toPath(coords)
  const last = coords[coords.length - 1]!
  const first = coords[0]!
  return `${line} L${last.x.toFixed(1)},${bottom} L${first.x.toFixed(1)},${bottom} Z`
}

function labelIndices(points: TrendPoint[]): number[] {
  // Show every 3rd point (quarterly) or every point if fewer than 6
  if (points.length <= 6) return points.map((_, i) => i)
  const indices: number[] = []
  for (let i = 0; i < points.length; i += 3) indices.push(i)
  if (indices[indices.length - 1] !== points.length - 1) indices.push(points.length - 1)
  return indices
}

function monthLabel(month: string): string {
  const parts = month.split('-')
  const m = parseInt(parts[1] ?? '0', 10)
  return DUTCH_MONTHS[m - 1] ?? month
}

/* ------------------------------------------------------------------ */
/*  Component                                                           */
/* ------------------------------------------------------------------ */

export function InsightsTrendChart({ internal, national }: InsightsTrendChartProps) {
  const allValues = [...internal, ...national].map(p => p.value)
  const min = Math.floor(Math.min(...allValues) * 0.9)
  const max = Math.ceil(Math.max(...allValues) * 1.1)

  const intCoords = toCoords(internal, min, max)
  const natCoords = toCoords(national, min, max)

  const intLine = toPath(intCoords)
  const natLine = toPath(natCoords)
  const intArea = toAreaPath(intCoords)
  const natArea = toAreaPath(natCoords)

  // Grid lines (3 horizontal)
  const plotH = CHART_H - PAD_T - PAD_B
  const gridYs = [0, 0.5, 1].map(f => PAD_T + plotH * (1 - f))
  const gridVals = [0, 0.5, 1].map(f => (min + f * (max - min)).toFixed(1))

  const labels = labelIndices(internal)

  return (
    <motion.div
      style={glassCard}
      variants={fadeInUp}
      initial="hidden"
      animate="show"
    >
      <h3
        style={{
          margin: '0 0 8px',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: 'var(--font-display)',
          color: '#1E1B4B',
        }}
      >
        Verzuimtrend
      </h3>

      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        style={{ width: '100%', height: 'auto' }}
      >
        {/* Grid lines */}
        {gridYs.map((y, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              x2={CHART_W - PAD_R}
              y1={y}
              y2={y}
              stroke="#E2E8F0"
              strokeWidth={0.5}
            />
            <text
              x={PAD_L - 4}
              y={y + 3}
              textAnchor="end"
              fontSize={8}
              fill="#94A3B8"
              fontFamily="var(--font-mono)"
            >
              {gridVals[i]}
            </text>
          </g>
        ))}

        {/* National area + line */}
        <path d={natArea} fill="#94A3B8" opacity={0.08} />
        <motion.path
          d={natLine}
          fill="none"
          stroke="#94A3B8"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: 'easeOut', delay: 0.3 }}
        />

        {/* Internal area + line */}
        <path d={intArea} fill="#6366F1" opacity={0.1} />
        <motion.path
          d={intLine}
          fill="none"
          stroke="#6366F1"
          strokeWidth={2}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1, ease: 'easeOut', delay: 0.1 }}
        />

        {/* X-axis labels */}
        {labels.map(i => {
          const c = intCoords[i]
          if (!c || !internal[i]) return null
          return (
            <text
              key={i}
              x={c.x}
              y={CHART_H - 4}
              textAnchor="middle"
              fontSize={8}
              fill="#94A3B8"
              fontFamily="var(--font-body)"
            >
              {monthLabel(internal[i].month)}
            </text>
          )
        })}
      </svg>

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          gap: 16,
          marginTop: 8,
          justifyContent: 'center',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569', fontFamily: 'var(--font-body)' }}>
          <span style={{ width: 16, height: 2, background: '#6366F1', borderRadius: 1, display: 'inline-block' }} />
          Intern
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#475569', fontFamily: 'var(--font-body)' }}>
          <span
            style={{
              width: 16,
              height: 0,
              borderTop: '1.5px dashed #94A3B8',
              display: 'inline-block',
            }}
          />
          Landelijk
        </span>
      </div>
    </motion.div>
  )
}
