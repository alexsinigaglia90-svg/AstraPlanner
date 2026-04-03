'use client'

import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronLeft, ChevronRight, X, Presentation } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useDemoStore } from '@/hooks/use-demo'
import { useDemoScenarioStore, TOTAL_STEPS } from '@/stores/demo-scenario-store'
import { DEMO_STEPS } from './demo-step-config'
import { bouncy } from '@/lib/motion'

// ── Sub-components ───────────────────────────────────────────────────────────

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? 18 : 6,
            height: 6,
            borderRadius: 3,
            background: i === current
              ? '#fff'
              : i < current
                ? 'rgba(255,255,255,0.5)'
                : 'rgba(255,255,255,0.2)',
            transition: 'all 0.3s ease',
          }}
        />
      ))}
    </div>
  )
}

// ── Navigate to a step (imperative) ──────────────────────────────────────────

function navigateToStep(stepIndex: number) {
  const step = DEMO_STEPS[stepIndex]
  if (!step) return

  // Set scenario in store
  const store = useDemoScenarioStore.getState()
  if (step.scenario) {
    store.setScenario(step.scenario)
  }

  // Use window.location for reliable navigation
  const currentPath = window.location.pathname
  if (currentPath !== step.route) {
    window.location.href = step.route
  }
}

// ── Start button (shown when not presenting) ─────────────────────────────────

export function DemoPresenterStartButton() {
  const isDemo = useDemoStore((s) => s.isDemo)
  const isPresenting = useDemoScenarioStore((s) => s.isPresenting)
  const router = useRouter()

  if (!isDemo || isPresenting) return null

  function handleStart() {
    const store = useDemoScenarioStore.getState()
    store.startPresentation()
    // Navigate to first step
    const firstStep = DEMO_STEPS[0]
    if (firstStep && window.location.pathname !== firstStep.route) {
      router.push(firstStep.route)
    }
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ ...bouncy, delay: 0.5 }}
      onClick={handleStart}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      style={{
        position: 'fixed',
        bottom: 28,
        right: 28,
        zIndex: 9998,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 20px',
        borderRadius: 9999,
        border: 'none',
        background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
        color: '#fff',
        fontFamily: 'var(--font-display)',
        fontSize: 13,
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 4px 20px rgba(99,102,241,0.4)',
      }}
    >
      <Presentation size={15} />
      Presentatie
    </motion.button>
  )
}

// ── Main presenter bar ───────────────────────────────────────────────────────

export function DemoPresenterBar() {
  const isDemo = useDemoStore((s) => s.isDemo)
  const isPresenting = useDemoScenarioStore((s) => s.isPresenting)
  const currentStep = useDemoScenarioStore((s) => s.currentStep)
  const stopPresentation = useDemoScenarioStore((s) => s.stopPresentation)

  const step = DEMO_STEPS[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === TOTAL_STEPS - 1

  // ── Step navigation (imperative, no useEffect) ────────────────────────

  const goNext = useCallback(() => {
    if (currentStep >= TOTAL_STEPS - 1) return
    const next = currentStep + 1
    useDemoScenarioStore.getState().goToStep(next)
    navigateToStep(next)
  }, [currentStep])

  const goPrev = useCallback(() => {
    if (currentStep <= 0) return
    const prev = currentStep - 1
    useDemoScenarioStore.getState().goToStep(prev)
    navigateToStep(prev)
  }, [currentStep])

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    if (!isPresenting) return

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault()
        const cur = useDemoScenarioStore.getState().currentStep
        if (cur < TOTAL_STEPS - 1) {
          const next = cur + 1
          useDemoScenarioStore.getState().goToStep(next)
          navigateToStep(next)
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        const cur = useDemoScenarioStore.getState().currentStep
        if (cur > 0) {
          const prev = cur - 1
          useDemoScenarioStore.getState().goToStep(prev)
          navigateToStep(prev)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        useDemoScenarioStore.getState().stopPresentation()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPresenting])

  // ── Render ────────────────────────────────────────────────────────────

  if (!isDemo || !isPresenting) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 60 }}
        transition={bouncy}
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10000,
          pointerEvents: 'auto',
        }}
      >
        {/* Glass bar */}
        <div
          style={{
            margin: '0 auto 20px',
            maxWidth: 720,
            padding: '14px 20px',
            borderRadius: 20,
            background: 'rgba(15, 15, 25, 0.85)',
            backdropFilter: 'blur(24px)',
            WebkitBackdropFilter: 'blur(24px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05) inset',
            display: 'flex',
            alignItems: 'center',
            gap: 16,
          }}
        >
          {/* Close button */}
          <motion.button
            onClick={stopPresentation}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.5)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
            title="Stop presentatie (Esc)"
          >
            <X size={14} />
          </motion.button>

          {/* Step info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#fff',
                  whiteSpace: 'nowrap',
                }}
              >
                {step?.title ?? ''}
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  fontWeight: 500,
                  color: 'rgba(255,255,255,0.35)',
                  whiteSpace: 'nowrap',
                }}
              >
                {currentStep + 1}/{TOTAL_STEPS}
              </span>
            </div>
            <StepDots current={currentStep} total={TOTAL_STEPS} />
          </div>

          {/* Talking point */}
          <div
            style={{
              flex: 1.5,
              minWidth: 0,
              padding: '6px 12px',
              borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <p
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                fontWeight: 500,
                color: 'rgba(255,255,255,0.6)',
                margin: 0,
                lineHeight: 1.4,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                display: '-webkit-box',
                WebkitLineClamp: 2,
                WebkitBoxOrient: 'vertical',
              }}
            >
              {step?.note ?? ''}
            </p>
          </div>

          {/* Navigation buttons */}
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <motion.button
              onClick={goPrev}
              disabled={isFirst}
              whileHover={isFirst ? undefined : { scale: 1.08 }}
              whileTap={isFirst ? undefined : { scale: 0.92 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: 'none',
                background: isFirst ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.1)',
                color: isFirst ? 'rgba(255,255,255,0.2)' : '#fff',
                cursor: isFirst ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              title="Vorige (←)"
            >
              <ChevronLeft size={16} />
            </motion.button>
            <motion.button
              onClick={goNext}
              disabled={isLast}
              whileHover={isLast ? undefined : { scale: 1.08 }}
              whileTap={isLast ? undefined : { scale: 0.92 }}
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                border: 'none',
                background: isLast
                  ? 'rgba(255,255,255,0.04)'
                  : 'linear-gradient(135deg, #6366F1, #8B5CF6)',
                color: isLast ? 'rgba(255,255,255,0.2)' : '#fff',
                cursor: isLast ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isLast ? 'none' : '0 2px 8px rgba(99,102,241,0.3)',
              }}
              title="Volgende (→)"
            >
              <ChevronRight size={16} />
            </motion.button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}
