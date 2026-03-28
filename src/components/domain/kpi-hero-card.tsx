'use client'

import { useRef, useCallback, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { bouncy } from '@/lib/motion'
import { AnimatedCounter } from '@/components/domain/animated-counter'

// ── Types ────────────────────────────────────────────────────────────────────

interface KpiHeroCardProps {
  label: string
  value: number
  detail: string
  icon: React.ReactNode
  gradientColors: [string, string]
  delay?: number
  prefix?: string
  suffix?: string
  /** Optional sparkline data points (0-1 normalized) */
  sparkline?: number[]
  /** Optional trend percentage (+5.2, -2.1) */
  trend?: number
  /** Pulsing glow for warning/shortage states */
  pulse?: boolean
}

// ── Sparkline SVG ────────────────────────────────────────────────────────────

function MicroSparkline({
  data,
  color,
  width = 100,
  height = 32,
}: {
  data: number[]
  color: string
  width?: number
  height?: number
}) {
  if (data.length < 2) return null

  const padding = 2
  const w = width - padding * 2
  const h = height - padding * 2

  // Normalize data to 0-1 range
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const normalized = data.map((v) => (v - min) / range)

  // Build smooth SVG path using monotone cubic interpolation
  const points = normalized.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * w,
    y: padding + (1 - v) * h,
  }))

  let pathD = `M ${points[0]!.x} ${points[0]!.y}`
  for (let i = 0; i < points.length - 1; i++) {
    const current = points[i]!
    const next = points[i + 1]!
    const cpx = (current.x + next.x) / 2
    pathD += ` C ${cpx} ${current.y}, ${cpx} ${next.y}, ${next.x} ${next.y}`
  }

  // Gradient area path (closed)
  const lastPt = points[points.length - 1]!
  const firstPt = points[0]!
  const areaD = `${pathD} L ${lastPt.x} ${height} L ${firstPt.x} ${height} Z`

  const gradientId = `sparkline-grad-${Math.random().toString(36).slice(2, 8)}`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {/* Area fill */}
      <motion.path
        d={areaD}
        fill={`url(#${gradientId})`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4 }}
      />
      {/* Line */}
      <motion.path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1], delay: 0.3 }}
      />
      {/* End dot */}
      <motion.circle
        cx={lastPt.x}
        cy={lastPt.y}
        r={2.5}
        fill={color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...bouncy, delay: 1.2 }}
      />
    </svg>
  )
}

// ── Trend Badge ──────────────────────────────────────────────────────────────

function TrendBadge({ trend }: { trend: number }) {
  const isUp = trend > 0
  const isDown = trend < 0
  const color = isUp ? '#10B981' : isDown ? '#EF4444' : 'var(--muted-foreground)'
  const bg = isUp
    ? 'rgba(16,185,129,0.08)'
    : isDown
      ? 'rgba(239,68,68,0.08)'
      : 'rgba(100,116,139,0.06)'
  const arrow = isUp ? '\u2191' : isDown ? '\u2193' : '\u2192'

  return (
    <motion.span
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ ...bouncy, delay: 0.6 }}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 2,
        fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 11,
        fontWeight: 600,
        color,
        background: bg,
        borderRadius: 6,
        padding: '2px 7px',
        lineHeight: 1.4,
        letterSpacing: '-0.01em',
      }}
    >
      {arrow} {Math.abs(trend).toFixed(1)}%
    </motion.span>
  )
}

// ── Pulse Keyframes ──────────────────────────────────────────────────────────

const PULSE_STYLE_ID = 'kpi-hero-pulse'

function ensurePulseKeyframes() {
  if (typeof document === 'undefined') return
  if (document.getElementById(PULSE_STYLE_ID)) return
  const style = document.createElement('style')
  style.id = PULSE_STYLE_ID
  style.textContent = `
@keyframes kpiPulseGlow {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0), var(--elevation-1); }
  50% { box-shadow: 0 0 20px 4px rgba(239,68,68,0.12), var(--elevation-1); }
}
`
  document.head.appendChild(style)
}

// ── Component ────────────────────────────────────────────────────────────────

export function KpiHeroCard({
  label,
  value,
  detail,
  icon,
  gradientColors,
  delay = 0,
  prefix,
  suffix,
  sparkline,
  trend,
  pulse = false,
}: KpiHeroCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  // 3D perspective tracking
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  const rotateX = useSpring(useTransform(mouseY, [-0.5, 0.5], [4, -4]), {
    stiffness: 300,
    damping: 30,
  })
  const rotateY = useSpring(useTransform(mouseX, [-0.5, 0.5], [-4, 4]), {
    stiffness: 300,
    damping: 30,
  })

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = cardRef.current?.getBoundingClientRect()
      if (!rect) return
      mouseX.set((e.clientX - rect.left) / rect.width - 0.5)
      mouseY.set((e.clientY - rect.top) / rect.height - 0.5)
    },
    [mouseX, mouseY],
  )

  const handleMouseLeave = useCallback(() => {
    mouseX.set(0)
    mouseY.set(0)
    setIsHovered(false)
  }, [mouseX, mouseY])

  // Inject pulse CSS
  if (pulse) ensurePulseKeyframes()

  return (
    <motion.div
      ref={cardRef}
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ ...bouncy, delay }}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        perspective: 800,
        cursor: 'default',
      }}
    >
      <motion.div
        style={{
          position: 'relative',
          // Glassmorphism
          background: 'rgba(255,255,255,0.72)',
          backdropFilter: 'blur(16px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
          border: '1px solid rgba(255,255,255,0.6)',
          borderRadius: 20,
          padding: '22px 24px 18px',
          overflow: 'hidden',
          boxShadow: 'var(--elevation-1)',
          transformStyle: 'preserve-3d',
          // 3D tilt
          rotateX,
          rotateY,
          // Pulse glow
          animation: pulse ? 'kpiPulseGlow 3s ease-in-out infinite' : undefined,
        }}
      >
        {/* ── Gradient accent strip (top) ──────────────────────── */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            borderRadius: '20px 20px 0 0',
            background: `linear-gradient(90deg, ${gradientColors[0]}, ${gradientColors[1]})`,
          }}
        />

        {/* ── Subtle gradient mesh background ─────────────────── */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            opacity: isHovered ? 0.08 : 0.04,
            transition: 'opacity 0.4s ease',
            background: `radial-gradient(ellipse at 20% 0%, ${gradientColors[0]}, transparent 60%),
                         radial-gradient(ellipse at 80% 100%, ${gradientColors[1]}, transparent 50%)`,
            pointerEvents: 'none',
            borderRadius: 20,
          }}
        />

        {/* ── Icon badge (top-right) ──────────────────────────── */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ ...bouncy, delay: delay + 0.15 }}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            width: 38,
            height: 38,
            borderRadius: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: `linear-gradient(135deg, ${gradientColors[0]}, ${gradientColors[1]})`,
            color: '#fff',
            boxShadow: `0 4px 12px ${gradientColors[0]}33`,
            transform: 'translateZ(8px)',
          }}
        >
          {icon}
        </motion.div>

        {/* ── Label + Trend ───────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--muted-foreground)',
            }}
          >
            {label}
          </span>
          {trend !== undefined && <TrendBadge trend={trend} />}
        </div>

        {/* ── Value ───────────────────────────────────────────── */}
        <AnimatedCounter
          value={value}
          prefix={prefix}
          suffix={suffix}
          style={{
            fontSize: 34,
            fontWeight: 700,
            lineHeight: 1.1,
            color: 'var(--foreground)',
            display: 'block',
            marginBottom: 4,
            letterSpacing: '-0.02em',
            transform: 'translateZ(4px)',
          }}
        />

        {/* ── Detail text ─────────────────────────────────────── */}
        <span
          style={{
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
            lineHeight: 1.4,
          }}
        >
          {detail}
        </span>

        {/* ── Micro Sparkline (bottom-right) ──────────────────── */}
        {sparkline && sparkline.length >= 2 && (
          <div
            style={{
              position: 'absolute',
              bottom: 12,
              right: 14,
              opacity: 0.7,
              transform: 'translateZ(2px)',
            }}
          >
            <MicroSparkline
              data={sparkline}
              color={gradientColors[0]}
              width={80}
              height={28}
            />
          </div>
        )}

        {/* ── Hover shine effect ──────────────────────────────── */}
        <motion.div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: 20,
            background:
              'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.5) 45%, rgba(255,255,255,0.8) 50%, rgba(255,255,255,0.5) 55%, transparent 60%)',
            opacity: isHovered ? 0.6 : 0,
            transition: 'opacity 0.4s ease',
            pointerEvents: 'none',
            transform: 'translateZ(12px)',
          }}
        />
      </motion.div>
    </motion.div>
  )
}
