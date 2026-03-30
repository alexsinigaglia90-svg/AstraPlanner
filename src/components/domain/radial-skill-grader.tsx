'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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
const LEVEL_COLORS = ['#94A3B8', '#F59E0B', '#6366F1', '#8B5CF6', '#10B981']
const PARTICLE_COUNT = 8
const RING_DIAMETER = 140
const RING_RADIUS = RING_DIAMETER / 2
const STROKE_WIDTH = 14
const STROKE_WIDTH_HOVER = 18
const CENTER_RADIUS = RING_RADIUS - STROKE_WIDTH / 2
const GAP_DEG = 4
const SEGMENT_DEG = 68 // 72 - 4 gap
const LABEL_RADIUS = RING_RADIUS + 24
const SVG_SIZE = RING_DIAMETER + 80 // extra space for labels
const CENTER = SVG_SIZE / 2

// Start from bottom-left (~216 degrees) going clockwise
const START_ANGLE = 216

// ── Helpers ──────────────────────────────────────────────────────────────────

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180
}

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  // 0 degrees = top, clockwise
  const rad = degToRad(angleDeg - 90)
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, startAngle)
  const end = polarToCartesian(cx, cy, r, endAngle)
  const largeArc = endAngle - startAngle > 180 ? 1 : 0
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

function getSegmentAngles(index: number): { start: number; end: number; mid: number } {
  const start = START_ANGLE + index * (SEGMENT_DEG + GAP_DEG)
  const end = start + SEGMENT_DEG
  const mid = start + SEGMENT_DEG / 2
  return { start: start % 360, end: end % 360, mid: mid % 360 }
}

// ── Particle Burst ───────────────────────────────────────────────────────────

interface Particle {
  id: number
  angle: number
  distance: number
  color: string
  delay: number
  size: number
}

function ParticleBurst({ active, level }: { active: boolean; level: number }) {
  const [particles, setParticles] = useState<Particle[]>([])

  useEffect(() => {
    if (!active) return
    const color = LEVEL_COLORS[level - 1] ?? '#6366F1'
    const newParticles: Particle[] = Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      id: Date.now() + i,
      angle: (360 / PARTICLE_COUNT) * i + Math.random() * 20,
      distance: 35 + Math.random() * 30,
      color,
      delay: Math.random() * 0.08,
      size: 4 + Math.random() * 3,
    }))
    setParticles(newParticles)
    const timer = setTimeout(() => setParticles([]), 700)
    return () => clearTimeout(timer)
  }, [active, level])

  return (
    <>
      {particles.map((p) => {
        const rad = degToRad(p.angle)
        const startR = CENTER_RADIUS
        const endR = CENTER_RADIUS + p.distance
        return (
          <motion.circle
            key={p.id}
            cx={CENTER + startR * Math.cos(rad)}
            cy={CENTER + startR * Math.sin(rad)}
            r={p.size / 2}
            fill={p.color}
            initial={{ opacity: 1, r: p.size / 2 }}
            animate={{
              cx: CENTER + endR * Math.cos(rad),
              cy: CENTER + endR * Math.sin(rad),
              opacity: 0,
              r: 0,
            }}
            transition={{
              duration: 0.5,
              delay: p.delay,
              ease: [0.22, 1, 0.36, 1],
            }}
            style={{ pointerEvents: 'none' }}
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
  const [ringScale, setRingScale] = useState(1)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on outside click / Escape
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
      if (segLevel !== level) {
        // Haptic pulse
        setRingScale(1.06)
        setTimeout(() => setRingScale(1), 150)

        if (segLevel > level) {
          setBurstActive(true)
          setBurstKey((k) => k + 1)
          setTimeout(() => setBurstActive(false), 600)
        }
      }
      onChange(segLevel)
    },
    [level, onChange],
  )

  // Build segment data
  const segments = Array.from({ length: 5 }, (_, i) => {
    const segLevel = i + 1
    const angles = getSegmentAngles(i)
    const filled = segLevel <= level
    const hovered = hoveredSegment === i
    const path = describeArc(CENTER, CENTER, CENTER_RADIUS, angles.start, angles.end > angles.start ? angles.end : angles.end + 360)
    const labelPos = polarToCartesian(CENTER, CENTER, LABEL_RADIUS, angles.mid > angles.start ? angles.mid : angles.mid + 360)
    const color = LEVEL_COLORS[i]!

    return { segLevel, angles, filled, hovered, path, labelPos, color }
  })

  const currentColor = LEVEL_COLORS[level - 1] ?? '#6366F1'

  return (
    <motion.div
      ref={containerRef}
      initial={{ opacity: 0, scale: 0.9, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.92, y: 6 }}
      transition={bouncy}
      style={{
        position: 'relative',
        width: 240,
        background: 'rgba(255,255,255,0.95)',
        backdropFilter: 'blur(20px) saturate(1.8)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
        border: '1px solid rgba(255,255,255,0.7)',
        borderRadius: 22,
        boxShadow: '0 24px 80px rgba(30,27,75,0.18)',
        padding: '16px 10px 14px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        zIndex: 50,
        overflow: 'visible',
      }}
    >
      {/* Process name */}
      <motion.span
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...snappy, delay: 0.05 }}
        style={{
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--foreground, #1E1B4B)',
          marginBottom: 6,
          textAlign: 'center',
          maxWidth: '100%',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {processName}
      </motion.span>

      {/* Ring + labels SVG */}
      <motion.div
        animate={{ scale: ringScale }}
        transition={{ type: 'spring', stiffness: 600, damping: 15 }}
        style={{ position: 'relative', width: SVG_SIZE, height: SVG_SIZE }}
      >
        <svg
          width={SVG_SIZE}
          height={SVG_SIZE}
          viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
          style={{ overflow: 'visible' }}
        >
          {/* Segments */}
          {segments.map((seg) => (
            <motion.path
              key={seg.segLevel}
              d={seg.path}
              fill="none"
              stroke={seg.filled ? seg.color : 'rgba(100,116,139,0.08)'}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={seg.filled ? 'none' : '4 3'}
              initial={{ opacity: 0 }}
              animate={{
                opacity: 1,
                strokeWidth: seg.hovered ? STROKE_WIDTH_HOVER : STROKE_WIDTH,
                filter: seg.hovered ? 'brightness(1.2)' : 'brightness(1)',
              }}
              transition={snappy}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredSegment(seg.segLevel - 1)}
              onMouseLeave={() => setHoveredSegment(null)}
              onClick={() => handleSegmentClick(seg.segLevel)}
            />
          ))}

          {/* Particle burst inside SVG */}
          <ParticleBurst key={burstKey} active={burstActive} level={level} />

          {/* Labels outside ring */}
          {segments.map((seg) => {
            const isActive = seg.segLevel <= level
            const isExact = seg.segLevel === level
            return (
              <text
                key={`label-${seg.segLevel}`}
                x={seg.labelPos.x}
                y={seg.labelPos.y}
                textAnchor="middle"
                dominantBaseline="central"
                style={{
                  fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                  fontSize: 9,
                  fontWeight: isExact ? 700 : 600,
                  fill: isActive ? seg.color : '#94A3B8',
                  cursor: 'pointer',
                  userSelect: 'none',
                }}
                onClick={() => handleSegmentClick(seg.segLevel)}
                onMouseEnter={() => setHoveredSegment(seg.segLevel - 1)}
                onMouseLeave={() => setHoveredSegment(null)}
              >
                {seg.segLevel} {LABELS[seg.segLevel - 1]}
              </text>
            )
          })}
        </svg>

        {/* Center content */}
        <div
          style={{
            position: 'absolute',
            top: (SVG_SIZE - RING_DIAMETER) / 2,
            left: (SVG_SIZE - RING_DIAMETER) / 2,
            width: RING_DIAMETER,
            height: RING_DIAMETER,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
          }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={level}
              initial={{ scale: 1.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={wobbly}
              style={{
                fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                fontSize: 40,
                fontWeight: 700,
                color: currentColor,
                lineHeight: 1,
                letterSpacing: '-0.02em',
              }}
            >
              {level}
            </motion.span>
          </AnimatePresence>
          <AnimatePresence mode="wait">
            <motion.span
              key={`label-${level}`}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ ...bouncy, delay: 0.06 }}
              style={{
                fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                fontSize: 11,
                fontWeight: 500,
                color: currentColor,
                marginTop: 2,
                letterSpacing: '0.01em',
              }}
            >
              {LABELS[level - 1]}
            </motion.span>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Remove button — only shown when a level is set */}
      {level > 0 && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          onClick={() => onChange(0)}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(239,68,68,0.7)',
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '2px 8px',
            borderRadius: 6,
            marginTop: -2,
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.color = '#EF4444' }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'rgba(239,68,68,0.7)' }}
        >
          Verwijder
        </motion.button>
      )}
    </motion.div>
  )
}
