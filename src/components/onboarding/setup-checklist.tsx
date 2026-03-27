'use client'

/**
 * SetupChecklist
 * Floating setup checklist pill / card for new organizations.
 * Collapsed: circular progress ring + "Setup X/Y" text pill.
 * Expanded: compact card with all 6 steps and a dismiss link.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check } from 'lucide-react'
import { useOnboarding } from '@/hooks/use-onboarding'
import { bouncy, snappy } from '@/lib/motion'

// ── Circular progress ring ───────────────────────────────────────────────────

interface ProgressRingProps {
  completed: number
  total: number
  size: number
  strokeWidth: number
}

function ProgressRing({ completed, total, size, strokeWidth }: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const progress = total > 0 ? completed / total : 0
  const dashOffset = circumference * (1 - progress)

  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(99,102,241,0.15)"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#6366F1"
        strokeWidth={strokeWidth}
        strokeDasharray={circumference}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.5s ease' }}
      />
    </svg>
  )
}

// ── Step item ────────────────────────────────────────────────────────────────

function StepItem({ label, completed }: { label: string; completed: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '5px 0',
      }}
    >
      {/* Check circle */}
      <div
        style={{
          width: '18px',
          height: '18px',
          borderRadius: '50%',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: completed ? '#10B981' : 'transparent',
          border: completed ? 'none' : '1.5px solid rgba(99,102,241,0.3)',
          transition: 'all 0.25s ease',
        }}
      >
        {completed && <Check size={11} color="#FFFFFF" strokeWidth={3} />}
      </div>
      {/* Label */}
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '13px',
          fontWeight: 500,
          color: completed ? 'var(--muted-foreground)' : 'var(--foreground)',
          textDecoration: completed ? 'line-through' : 'none',
          transition: 'all 0.25s ease',
        }}
      >
        {label}
      </span>
    </div>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export function SetupChecklist() {
  const { showChecklist, isLoading, steps, completedCount, totalCount, dismissChecklist } = useOnboarding()
  const [expanded, setExpanded] = useState(false)

  if (!showChecklist) return null

  // All done — hide automatically
  if (!isLoading && completedCount === totalCount) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...bouncy, delay: 0.5 }}
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 50,
      }}
    >
      <AnimatePresence mode="wait" initial={false}>
        {expanded ? (
          // ── Expanded card ──────────────────────────────────────────────
          <motion.div
            key="expanded"
            initial={{ opacity: 0, scale: 0.88, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 12 }}
            transition={bouncy}
            style={{
              width: '280px',
              background: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(99,102,241,0.18)',
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px 10px 16px',
                borderBottom: '1px solid rgba(99,102,241,0.1)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <ProgressRing completed={completedCount} total={totalCount} size={24} strokeWidth={2.5} />
                <span
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                  }}
                >
                  Setup
                </span>
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '12px',
                    fontWeight: 500,
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {completedCount}/{totalCount}
                </span>
              </div>
              <button
                onClick={() => setExpanded(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'var(--muted-foreground)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px',
                  borderRadius: '4px',
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Steps */}
            <div style={{ padding: '10px 16px 6px 16px' }}>
              {steps.map((step) => (
                <StepItem key={step.id} label={step.label} completed={step.completed} />
              ))}
            </div>

            {/* Dismiss footer */}
            <div
              style={{
                padding: '8px 16px 14px 16px',
                display: 'flex',
                justifyContent: 'center',
              }}
            >
              <button
                onClick={dismissChecklist}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: 'var(--muted-foreground)',
                  textDecoration: 'underline',
                  padding: '2px 4px',
                }}
              >
                Ik weet het al
              </button>
            </div>
          </motion.div>
        ) : (
          // ── Collapsed pill ─────────────────────────────────────────────
          <motion.button
            key="pill"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={snappy}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => setExpanded(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 14px 8px 10px',
              background: 'rgba(255,255,255,0.9)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(99,102,241,0.18)',
              borderRadius: '999px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <ProgressRing completed={completedCount} total={totalCount} size={28} strokeWidth={3} />
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                color: '#4F46E5',
                whiteSpace: 'nowrap',
              }}
            >
              Setup {completedCount}/{totalCount}
            </span>
          </motion.button>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
