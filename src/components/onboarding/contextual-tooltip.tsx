'use client'

/**
 * ContextualTooltip
 * Shows a one-time tooltip anchored to a child element.
 * Dismissed after 8 seconds or on click. Never shown in demo mode.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useDemoStore } from '@/hooks/use-demo'

const TOOLTIP_KEY_PREFIX = 'astra_tooltip_seen_'

interface ContextualTooltipProps {
  id: string
  text: string
  anchor?: 'top' | 'bottom' | 'left' | 'right'
  children: React.ReactNode
}

export function ContextualTooltip({
  id,
  text,
  anchor = 'top',
  children,
}: ContextualTooltipProps) {
  const isDemo = useDemoStore((s) => s.isDemo)
  const storageKey = `${TOOLTIP_KEY_PREFIX}${id}`

  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isDemo) return
    const seen = localStorage.getItem(storageKey) === 'true'
    if (seen) return
    // Small delay before showing
    timerRef.current = setTimeout(() => setVisible(true), 600)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [isDemo, storageKey])

  useEffect(() => {
    if (!visible) return
    timerRef.current = setTimeout(() => dismiss(), 8000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  const dismiss = useCallback(() => {
    setVisible(false)
    localStorage.setItem(storageKey, 'true')
  }, [storageKey])

  // Arrow + tooltip positioning per anchor
  const tooltipStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      position: 'absolute',
      zIndex: 100,
      pointerEvents: 'auto',
    }
    switch (anchor) {
      case 'top':
        return { ...base, bottom: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)' }
      case 'bottom':
        return { ...base, top: 'calc(100% + 10px)', left: '50%', transform: 'translateX(-50%)' }
      case 'left':
        return { ...base, right: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)' }
      case 'right':
        return { ...base, left: 'calc(100% + 10px)', top: '50%', transform: 'translateY(-50%)' }
    }
  })()

  const arrowStyle: React.CSSProperties = (() => {
    const arrow: React.CSSProperties = {
      position: 'absolute',
      width: 0,
      height: 0,
    }
    switch (anchor) {
      case 'top':
        return {
          ...arrow,
          bottom: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid rgba(255,255,255,0.95)',
        }
      case 'bottom':
        return {
          ...arrow,
          top: -6,
          left: '50%',
          transform: 'translateX(-50%)',
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderBottom: '6px solid rgba(255,255,255,0.95)',
        }
      case 'left':
        return {
          ...arrow,
          right: -6,
          top: '50%',
          transform: 'translateY(-50%)',
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
          borderLeft: '6px solid rgba(255,255,255,0.95)',
        }
      case 'right':
        return {
          ...arrow,
          left: -6,
          top: '50%',
          transform: 'translateY(-50%)',
          borderTop: '6px solid transparent',
          borderBottom: '6px solid transparent',
          borderRight: '6px solid rgba(255,255,255,0.95)',
        }
    }
  })()

  if (isDemo) return <>{children}</>

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }} onClick={dismiss}>
      {children}
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 340, damping: 24 }}
            style={tooltipStyle}
          >
            <div
              style={{
                background: 'rgba(255,255,255,0.95)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                border: '1px solid rgba(99,102,241,0.2)',
                borderRadius: '8px',
                padding: '8px 12px',
                boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
                whiteSpace: 'nowrap',
                position: 'relative',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 500,
                  color: '#4F46E5',
                }}
              >
                {text}
              </span>
              <div style={arrowStyle} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
