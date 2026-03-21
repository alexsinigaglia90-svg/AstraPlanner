'use client'

import React, { useEffect, useRef, useState } from 'react'

interface AnimatedCounterProps {
  value: number
  duration?: number
  prefix?: string
  suffix?: string
  className?: string
  style?: React.CSSProperties
}

export function AnimatedCounter({
  value,
  duration = 600,
  prefix = '',
  suffix = '',
  className = '',
  style,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0)
  const frameRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)

  useEffect(() => {
    const startValue = 0

    function easeOut(t: number): number {
      return 1 - Math.pow(1 - t, 3)
    }

    function tick(now: number) {
      if (startTimeRef.current === null) startTimeRef.current = now
      const elapsed = now - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)
      const easedProgress = easeOut(progress)
      setDisplay(Math.round(startValue + (value - startValue) * easedProgress))

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }

    startTimeRef.current = null
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return (
    <span
      className={className}
      style={{ fontFamily: 'var(--font-mono)', fontVariantNumeric: 'tabular-nums', ...style }}
    >
      {prefix}{display}{suffix}
    </span>
  )
}
