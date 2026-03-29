'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import { bouncy, wobbly, snappy } from '@/lib/motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface RadialSkillGraderProps {
  processName: string
  level: number // current 1-5
  onChange: (level: number) => void
  onClose: () => void
}

// ── Constants ────────────────────────────────────────────────────────────────

const LABELS = ['Beginner', 'Basis', 'Competent', 'Gevorderd', 'Expert'] as const
const PARTICLE_COUNT = 10
const PARTICLE_COLORS = ['#6366F1', '#8B5CF6', '#10B981']
const RING_DIAMETER = 120
const RING_RADIUS = RING_DIAMETER / 2
const STROKE_WIDTH = 14
const INNER_RADIUS = RING_RADIUS - STROKE_WIDTH / 2
const GAP_DEG = 3 // degrees of gap between segments
const SEGMENT_DEG = (360 - GAP_DEG * 5) / 5

// ── Helpers ──────────────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
) {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

// ── Particle Burst ───────────────────────────────────────────────────────────

interface Particle {
  id: number
  angle: number
  distance: number
  color: string
  delay: number
}

function ParticleBurst({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!active) return
    const newParticles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: Date.now() + i,
      angle: Math.random() * 360,
      distance: 40 + Math.random() * 40,
      color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)]!,
      delay: Math.random() * 0.1,
    }))
    setParticles(newParticles)
    const timer = setTimeout(() => setParticles([]), 800)
    return () => clearTimeout(timer)
  }, [active])

  const cx = RING_DIAMETER / 2 + 40 // offset for container padding
  const cy = RING_DIAMETER / 2 + 10

  return (
    <>
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180
        const startX = cx + INNER_RADIUS * Math.cos(rad)
        const startY = cy + INNER_RADIUS * Math.sin(rad)
        const endX = cx + (INNER_RADIUS + p.distance) * Math.cos(rad)
        const endY = cy + (INNER_RADIUS + p.distance) * Math.sin(rad)

        return (
          <motion.div
            key={p.id}
            initial={{
              position: 'absolute',
              left: startX,
              top: startY,
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: p.color,
              opacity: 1,
              scale: 1,
            }}
            animate={{
              left: endX,
              top: endY,
              opacity: 0,
              scale: 0,
            }}
            transition={{
              duration: 0.6,
              delay: p.delay,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{
              position: 'absolute',
              width: 6,
              height: 6,
              borderRadius: '50%',
              backgroundColor: p.color,
              pointerEvents: 'none',
            }}
          />
        )
      })}
    </>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function RadialSkillGrader({
  processName,
  level,
  onChange,
  onClose,
}: RadialSkillGraderProps) {
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)
  const [burstKey, setBurstKey] = useState(0)
  const [burstActive, setBurstActive] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const prevLevel = useRef(level)

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const handleSegmentClick = useCallback(
    (segLevel: number) => {
      if (segLevel > level) {
        setBurstActive(true)
        setBurstKey((k) => k + 1)
        setTimeout(() => setBurstActive(false), 700)
      }
      onChange(segLevel)
    },
    [level, onChange],
  )

  // Track previous level for burst detection
  useEffect(() => {
    prevLevel.current = level
  }, [level])

  // SVG setup
  const svgSize = RING_DIAMETER + 8
  const center = svgSize / 2

  const segments = Array.from({ length: 5 }, (_, i) => {
    const segIndex = i
    const startAngle = segIndex * (SEGMENT_DEG + GAP_DEG)
    const endAngle = startAngle + SEGMENT_DEG
    const filled = segIndex < level
    const hovered = hoveredSegment === segIndex
    const segLevel = segIndex + 1

    const path = describeArc(center, center, INNER_RADIUS, startAngle, endAngle)

    return { segIndex, startAngle, endAngle, filled, hovered, segLevel, path }
  })

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 6 }}
      transition={bouncy}
      style={{
        position: 'relative',
        width: 200,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
        border: '1px solid rgba(255,255,255,0.7)',
        borderRadius: 20,
        boxShadow: '0 20px 60px rgba(30,27,75,0.15)',
        padding: 20,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 50,
        overflow: 'visible',
      }}
    >
      {/* Particle burst layer */}
      <ParticleBurst key={burstKey} active={burstActive} />

      {/* Process name */}
      <motion.span
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...snappy, delay: 0.05 }}
        style={{
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--muted-foreground, #64748B)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: 14,
          textAlign: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {processName}
      </motion.span>

      {/* Ring container */}
      <div style={{ position: 'relative', width: svgSize, height: svgSize }}>
        <svg
          width={svgSize}
          height={svgSize}
          viewBox={`0 0 ${svgSize} ${svgSize}`}
          style={{ overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="rsg-filled-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#6366F1" />
              <stop offset="100%" stopColor="#8B5CF6" />
            </linearGradient>
          </defs>

          {segments.map((seg) => (
            <motion.path
              key={seg.segIndex}
              d={seg.path}
              fill="none"
              stroke={seg.filled ? 'url(#rsg-filled-grad)' : 'rgba(100,116,139,0.08)'}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                strokeWidth: seg.hovered ? STROKE_WIDTH + 3 : STROKE_WIDTH,
                filter: seg.hovered && !seg.filled
                  ? 'brightness(1.3)'
                  : seg.hovered
                    ? 'brightness(1.15)'
                    : 'brightness(1)',
              }}
              transition={snappy}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredSegment(seg.segIndex)}
              onMouseLeave={() => setHoveredSegment(null)}
              onClick={() => handleSegmentClick(seg.segLevel)}
            />
          ))}
        </svg>

        {/* Center content */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <motion.span
            key={level}
            initial={{ scale: 1.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={wobbly}
            style={{
              fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
              fontSize: 36,
              fontWeight: 700,
              color: 'var(--foreground, #1E1B4B)',
              lineHeight: 1,
              letterSpacing: '-0.02em',
            }}
          >
            {level}
          </motion.span>
          <motion.span
            key={`label-${level}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ ...bouncy, delay: 0.08 }}
            style={{
              fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
              fontSize: 11,
              fontWeight: 500,
              color: '#8B5CF6',
              marginTop: 2,
              letterSpacing: '0.01em',
            }}
          >
            {LABELS[level - 1]}
          </motion.span>
        </div>
      </div>
    </motion.div>
  )
}
