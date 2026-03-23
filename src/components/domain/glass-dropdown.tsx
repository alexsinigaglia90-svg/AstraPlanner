'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MoreVertical } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GlassDropdownOption {
  label: string
  icon?: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'destructive'
  holdToConfirm?: boolean
  disabled?: boolean
  disabledReason?: string
}

interface GlassDropdownProps {
  options: GlassDropdownOption[]
  trigger?: React.ReactNode
}

const HOLD_DURATION = 1200

// ── Component ────────────────────────────────────────────────────────────────

export function GlassDropdown({ options, trigger }: GlassDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [holdIdx, setHoldIdx] = useState<number | null>(null)
  const [holdProgress, setHoldProgress] = useState(0)
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const clearHold = useCallback(() => {
    if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
    setHoldProgress(0)
    setHoldIdx(null)
  }, [])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
        clearHold()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen, clearHold])

  // Close on escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setIsOpen(false); clearHold() } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, clearHold])

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsOpen(!isOpen); clearHold() }}
        onMouseDown={(e) => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 28, height: 28, borderRadius: 'var(--radius-sm)',
          border: 'none', backgroundColor: 'transparent',
          color: 'var(--muted-foreground)', cursor: 'pointer', padding: 0,
        }}
      >
        {trigger ?? <MoreVertical size={15} />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.15, type: 'spring', stiffness: 400, damping: 30 }}
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              zIndex: 9999,
              minWidth: 160,
              padding: 4,
              borderRadius: 10,
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 6px rgba(0,0,0,0.06)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {options.map((opt, idx) => {
              const isDestructive = opt.variant === 'destructive'
              const isHolding = holdIdx === idx
              const isDisabled = opt.disabled

              return (
                <motion.button
                  key={opt.label}
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.12, delay: idx * 0.03 }}
                  whileHover={!isDisabled ? {
                    backgroundColor: isDestructive ? 'rgba(239,68,68,0.08)' : 'rgba(99,102,241,0.06)',
                  } : undefined}
                  whileTap={!isDisabled && !opt.holdToConfirm ? { scale: 0.97 } : undefined}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isDisabled || opt.holdToConfirm) return
                    setIsOpen(false)
                    clearHold()
                    opt.onClick()
                  }}
                  onMouseDown={(e) => {
                    e.stopPropagation()
                    if (isDisabled || !opt.holdToConfirm) return
                    setHoldIdx(idx)
                    setHoldProgress(0)
                    const start = Date.now()
                    holdTimerRef.current = setInterval(() => {
                      const pct = Math.min((Date.now() - start) / HOLD_DURATION, 1)
                      setHoldProgress(pct)
                      if (pct >= 1) {
                        clearHold()
                        setIsOpen(false)
                        opt.onClick()
                      }
                    }, 16)
                  }}
                  onMouseUp={clearHold}
                  onMouseLeave={clearHold}
                  title={isDisabled ? opt.disabledReason : undefined}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: 6,
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: isDisabled
                      ? 'var(--muted-foreground)'
                      : isDestructive
                        ? 'var(--destructive)'
                        : 'var(--foreground)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    textAlign: 'left',
                    position: 'relative',
                    overflow: 'hidden',
                    userSelect: 'none',
                    opacity: isDisabled ? 0.5 : 1,
                  }}
                >
                  {isHolding && holdProgress > 0 && (
                    <div style={{
                      position: 'absolute', left: 0, top: 0, bottom: 0,
                      width: `${holdProgress * 100}%`,
                      backgroundColor: 'rgba(239,68,68,0.1)',
                      borderRadius: 6,
                    }} />
                  )}
                  <span style={{ position: 'relative', zIndex: 1, display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                    {opt.icon && <span style={{ display: 'flex', flexShrink: 0 }}>{opt.icon}</span>}
                    {isHolding && holdProgress > 0 ? 'Hold...' : opt.label}
                  </span>
                </motion.button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
