'use client'

import { motion } from 'framer-motion'
import { bouncy, fadeInUp } from '@/lib/motion'
import { AnimatedCounter } from '@/components/domain/animated-counter'
import type { RiskRadarResult } from '@/lib/insights/types'

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface RiskRadarProps {
  data: RiskRadarResult
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const SEVERITY_COLORS: Record<RiskRadarResult['severity'], string> = {
  Laag: '#10B981',
  Normaal: '#3B82F6',
  Verhoogd: '#F59E0B',
  Hoog: '#EF4444',
}

const RADAR_CX = 80
const RADAR_CY = 80
const RADAR_MAX_R = 65
const RING_R = 40
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R

/* ------------------------------------------------------------------ */
/*  Geometry helpers                                                    */
/* ------------------------------------------------------------------ */

function getPoint(
  index: number,
  value: number,
  count: number,
): [number, number] {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  const r = (value / 100) * RADAR_MAX_R
  return [RADAR_CX + r * Math.cos(angle), RADAR_CY + r * Math.sin(angle)]
}

function polygonPoints(
  count: number,
  valueFn: (i: number) => number,
): string {
  return Array.from({ length: count }, (_, i) =>
    getPoint(i, valueFn(i), count).join(','),
  ).join(' ')
}

/** Safe dimension value accessor */
function dimValue(dims: RiskRadarResult['dimensions'], i: number): number {
  return dims[i]?.value ?? 0
}

/** Position labels around the pentagon with a bit of extra offset. */
function labelPosition(
  index: number,
  count: number,
): { x: number; y: number; anchor: 'start' | 'middle' | 'end' } {
  const angle = (Math.PI * 2 * index) / count - Math.PI / 2
  const r = RADAR_MAX_R + 18
  const x = RADAR_CX + r * Math.cos(angle)
  const y = RADAR_CY + r * Math.sin(angle)
  const anchor =
    Math.abs(Math.cos(angle)) < 0.3
      ? 'middle'
      : Math.cos(angle) > 0
        ? 'start'
        : 'end'
  return { x, y, anchor }
}

/* ------------------------------------------------------------------ */
/*  Glass card style                                                    */
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
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function InsightsRiskRadar({ data }: RiskRadarProps) {
  const { dimensions, overallScore, severity } = data
  const count = dimensions.length
  const sevColor = SEVERITY_COLORS[severity]
  const dashLength = (overallScore / 100) * RING_CIRCUMFERENCE

  /* ------ grid rings for 33 / 66 / 100 % ------ */
  const gridLevels = [33, 66, 100]

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      style={glassCard}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: 16,
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 17,
              fontWeight: 700,
              color: 'var(--gray-900, #111)',
            }}
          >
            Risico Radar
          </h3>
          <p
            style={{
              margin: '2px 0 0',
              fontSize: 13,
              color: 'var(--gray-500, #6b7280)',
            }}
          >
            Komende 2 weken &mdash; alle factoren
          </p>
        </div>

        {/* Severity badge */}
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: sevColor,
            background: `${sevColor}18`,
            borderRadius: 999,
            padding: '3px 10px',
            lineHeight: '18px',
          }}
        >
          {severity.toUpperCase()}
        </span>
      </div>

      {/* 3-column body */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '160px 120px 1fr',
          gap: 16,
          alignItems: 'center',
        }}
      >
        {/* ---- LEFT: SVG Radar ---- */}
        <svg viewBox="0 0 160 160" width={160} height={160}>
          {/* Grid rings */}
          {gridLevels.map((lvl) => (
            <polygon
              key={lvl}
              points={polygonPoints(count, () => lvl)}
              fill="none"
              stroke="var(--gray-200, #e5e7eb)"
              strokeWidth={0.8}
            />
          ))}

          {/* Axis lines */}
          {dimensions.map((_, i) => {
            const [px, py] = getPoint(i, 100, count)
            return (
              <line
                key={i}
                x1={RADAR_CX}
                y1={RADAR_CY}
                x2={px}
                y2={py}
                stroke="var(--gray-200, #e5e7eb)"
                strokeWidth={0.8}
              />
            )
          })}

          {/* Animated data polygon */}
          <motion.polygon
            points={polygonPoints(count, (i) => dimValue(dimensions, i))}
            fill="rgba(99,102,241,0.18)"
            stroke="rgba(99,102,241,0.7)"
            strokeWidth={1.5}
            strokeLinejoin="round"
            initial={{
              points: polygonPoints(count, () => 0),
              opacity: 0,
            }}
            animate={{
              points: polygonPoints(count, (i) => dimValue(dimensions, i)),
              opacity: 1,
            }}
            transition={{ ...bouncy, delay: 0.15 }}
          />

          {/* Data points */}
          {dimensions.map((d, i) => {
            const [px, py] = getPoint(i, d.value, count)
            return (
              <motion.circle
                key={d.key}
                cx={px}
                cy={py}
                r={3.5}
                fill={d.color}
                stroke="#fff"
                strokeWidth={1.5}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...bouncy, delay: 0.25 + i * 0.06 }}
              />
            )
          })}

          {/* Labels */}
          {dimensions.map((d, i) => {
            const { x, y, anchor } = labelPosition(i, count)
            return (
              <text
                key={d.key}
                x={x}
                y={y}
                textAnchor={anchor}
                dominantBaseline="central"
                style={{
                  fontSize: 9,
                  fill: 'var(--gray-600, #4b5563)',
                  fontWeight: 500,
                }}
              >
                {d.label}
              </text>
            )
          })}
        </svg>

        {/* ---- CENTER: Ring Chart ---- */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg viewBox="0 0 100 100" width={100} height={100}>
            {/* Background ring */}
            <circle
              cx={50}
              cy={50}
              r={RING_R}
              fill="none"
              stroke="var(--gray-100, #f3f4f6)"
              strokeWidth={8}
            />
            {/* Progress arc */}
            <motion.circle
              cx={50}
              cy={50}
              r={RING_R}
              fill="none"
              stroke={sevColor}
              strokeWidth={8}
              strokeLinecap="round"
              strokeDasharray={RING_CIRCUMFERENCE}
              transform="rotate(-90 50 50)"
              initial={{ strokeDashoffset: RING_CIRCUMFERENCE }}
              animate={{
                strokeDashoffset: RING_CIRCUMFERENCE - dashLength,
              }}
              transition={{ ...bouncy, delay: 0.2 }}
            />
            {/* Center text */}
            <foreignObject x={15} y={28} width={70} height={44}>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '100%',
                }}
              >
                <AnimatedCounter
                  value={overallScore}
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    color: sevColor,
                    lineHeight: 1,
                  }}
                />
                <span
                  style={{
                    fontSize: 10,
                    color: 'var(--gray-400, #9ca3af)',
                    marginTop: 1,
                  }}
                >
                  / 100
                </span>
              </div>
            </foreignObject>
          </svg>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--gray-500, #6b7280)',
              letterSpacing: '0.03em',
            }}
          >
            Risk Score
          </span>
        </div>

        {/* ---- RIGHT: Factor List ---- */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dimensions.map((d, i) => (
            <motion.div
              key={d.key}
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ ...bouncy, delay: 0.2 + i * 0.06 }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {/* Colored dot */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: d.color,
                  flexShrink: 0,
                }}
              />
              {/* Label */}
              <span
                style={{
                  fontSize: 13,
                  color: 'var(--gray-700, #374151)',
                  flex: 1,
                }}
              >
                {d.label}
              </span>
              {/* Raw value */}
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: d.color,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {d.rawValue}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </motion.div>
  )
}
