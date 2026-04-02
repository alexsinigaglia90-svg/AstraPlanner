'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, CheckCircle2 } from 'lucide-react'
import { bouncy } from '@/lib/motion'

interface DemoSolverAnimationProps {
  /** Whether to start the animation */
  active: boolean
  /** Solve time to display (ms) */
  solveTimeMs?: number
  /** Coverage result to show after completion */
  coveragePct?: number
  /** Called when animation completes */
  onComplete?: () => void
}

export function DemoSolverAnimation({
  active,
  solveTimeMs = 1247,
  coveragePct = 96,
  onComplete,
}: DemoSolverAnimationProps) {
  const [phase, setPhase] = useState<'idle' | 'solving' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [displayTime, setDisplayTime] = useState(0)

  // Reset when active changes
  useEffect(() => {
    if (active) {
      setPhase('solving')
      setProgress(0)
      setDisplayTime(0)
    } else {
      setPhase('idle')
    }
  }, [active])

  // Animate progress
  useEffect(() => {
    if (phase !== 'solving') return

    const duration = 2800 // 2.8 seconds
    const start = performance.now()

    const tick = (now: number) => {
      const elapsed = now - start
      const ratio = Math.min(elapsed / duration, 1)

      // Ease-out curve for natural feel
      const eased = 1 - Math.pow(1 - ratio, 3)
      setProgress(eased * 100)
      setDisplayTime(Math.round(eased * solveTimeMs))

      if (ratio < 1) {
        requestAnimationFrame(tick)
      } else {
        setPhase('done')
        setTimeout(() => onComplete?.(), 800)
      }
    }

    requestAnimationFrame(tick)
  }, [phase, solveTimeMs, onComplete])

  if (phase === 'idle') return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={bouncy}
        style={{
          padding: '32px 40px',
          borderRadius: 24,
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        {/* Icon */}
        <motion.div
          animate={phase === 'solving' ? { rotate: [0, 360] } : { rotate: 0 }}
          transition={phase === 'solving' ? { duration: 2, repeat: Infinity, ease: 'linear' } : undefined}
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            background: phase === 'done'
              ? 'linear-gradient(135deg, #10B981, #059669)'
              : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: phase === 'done'
              ? '0 4px 16px rgba(16,185,129,0.3)'
              : '0 4px 16px rgba(99,102,241,0.3)',
          }}
        >
          {phase === 'done' ? (
            <CheckCircle2 size={28} color="#fff" />
          ) : (
            <Zap size={28} color="#fff" />
          )}
        </motion.div>

        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <p
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 18,
              fontWeight: 800,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            {phase === 'done' ? 'Optimalisatie voltooid' : 'Solver draait...'}
          </p>
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 13,
              color: 'var(--muted-foreground)',
              margin: '6px 0 0',
            }}
          >
            {phase === 'done'
              ? `${coveragePct}% dekking bereikt in ${(solveTimeMs / 1000).toFixed(1)}s`
              : 'Bezig met optimaliseren van het rooster...'}
          </p>
        </div>

        {/* Progress bar */}
        <div
          style={{
            width: '100%',
            maxWidth: 320,
            height: 8,
            borderRadius: 4,
            background: 'var(--muted)',
            overflow: 'hidden',
          }}
        >
          <motion.div
            style={{
              height: '100%',
              borderRadius: 4,
              background: phase === 'done'
                ? 'linear-gradient(90deg, #10B981, #059669)'
                : 'linear-gradient(90deg, #6366F1, #8B5CF6)',
              width: `${progress}%`,
            }}
          />
        </div>

        {/* Timer */}
        <span
          style={{
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayTime}ms
        </span>
      </motion.div>
    </AnimatePresence>
  )
}
