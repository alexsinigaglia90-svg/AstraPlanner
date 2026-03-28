'use client'

import { useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { bouncy, snappy, gentle } from '@/lib/motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface MiniCalendarProps {
  month: Date
  highlights?: Array<{
    start: string
    end: string
    type: 'absence' | 'leave'
  }>
  onDateClick?: (date: string) => void
  onRangeSelect?: (start: string, end: string) => void
  rangeMode?: boolean
  selectedRange?: { start: string; end: string } | null
  onMonthChange?: (month: Date) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

function toIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function isInRange(date: Date, start: string, end: string): boolean {
  const d = date.getTime()
  const s = parseIso(start).getTime()
  const e = parseIso(end).getTime()
  return d >= Math.min(s, e) && d <= Math.max(s, e)
}

function getMonthDays(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const firstDay = new Date(year, month, 1)
  // Monday-based: 0=Mon ... 6=Sun
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6

  const days: { date: Date; inMonth: boolean }[] = []

  // Previous month fill
  for (let i = startDow - 1; i >= 0; i--) {
    const d = new Date(year, month, -i)
    days.push({ date: d, inMonth: false })
  }

  // Current month
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ date: new Date(year, month, i), inMonth: true })
  }

  // Next month fill to complete 6 rows max (42 cells) or at least fill current row
  const remainder = days.length % 7
  if (remainder > 0) {
    const fill = 7 - remainder
    const lastDate = days[days.length - 1]!.date
    for (let i = 1; i <= fill; i++) {
      const d = new Date(lastDate.getFullYear(), lastDate.getMonth(), lastDate.getDate() + i)
      days.push({ date: d, inMonth: false })
    }
  }

  return days
}

// ── Component ────────────────────────────────────────────────────────────────

export function MiniCalendar({
  month,
  highlights = [],
  onDateClick,
  onRangeSelect,
  rangeMode = false,
  selectedRange = null,
  onMonthChange,
}: MiniCalendarProps) {
  const [rangeStart, setRangeStart] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const [direction, setDirection] = useState(0) // -1 = prev, 1 = next

  const year = month.getFullYear()
  const monthIdx = month.getMonth()
  const today = useMemo(() => new Date(), [])
  const days = useMemo(() => getMonthDays(year, monthIdx), [year, monthIdx])

  const navigateMonth = useCallback(
    (delta: number) => {
      setDirection(delta)
      const next = new Date(year, monthIdx + delta, 1)
      onMonthChange?.(next)
    },
    [year, monthIdx, onMonthChange],
  )

  const handleDayClick = useCallback(
    (iso: string) => {
      if (rangeMode && onRangeSelect) {
        if (!rangeStart) {
          setRangeStart(iso)
        } else {
          const start = rangeStart < iso ? rangeStart : iso
          const end = rangeStart < iso ? iso : rangeStart
          onRangeSelect(start, end)
          setRangeStart(null)
        }
      } else {
        onDateClick?.(iso)
      }
    },
    [rangeMode, rangeStart, onDateClick, onRangeSelect],
  )

  // Determine highlight for a date
  function getHighlight(date: Date): 'absence' | 'leave' | null {
    for (const h of highlights) {
      if (isInRange(date, h.start, h.end)) return h.type
    }
    return null
  }

  // Determine selection state for range mode
  function isInSelection(date: Date): boolean {
    if (selectedRange) {
      return isInRange(date, selectedRange.start, selectedRange.end)
    }
    if (rangeStart && hoverDate) {
      const start = rangeStart < hoverDate ? rangeStart : hoverDate
      const end = rangeStart < hoverDate ? hoverDate : rangeStart
      return isInRange(date, start, end)
    }
    return false
  }

  const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={bouncy}
      style={{
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(10px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.4)',
        border: '1px solid rgba(255,255,255,0.5)',
        borderRadius: 18,
        padding: '18px 20px',
        overflow: 'hidden',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* ── Accent strip ──────────────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 3,
          borderRadius: '18px 18px 0 0',
          background: 'linear-gradient(90deg, #6366F1, #818CF8)',
        }}
      />

      {/* ── Month navigation ──────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 14,
        }}
      >
        <motion.button
          whileHover={{ scale: 1.15, background: 'rgba(100,116,139,0.08)' }}
          whileTap={{ scale: 0.9 }}
          transition={snappy}
          onClick={() => navigateMonth(-1)}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: '1px solid rgba(100,116,139,0.1)',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted-foreground)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </motion.button>

        <div style={{ position: 'relative', overflow: 'hidden', height: 22, flex: 1, textAlign: 'center' }}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.span
              key={`${year}-${monthIdx}`}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={gentle}
              style={{
                fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                fontWeight: 600,
                fontSize: 14,
                color: 'var(--foreground)',
                display: 'block',
                textTransform: 'capitalize',
              }}
            >
              {MONTH_NAMES[monthIdx]} {year}
            </motion.span>
          </AnimatePresence>
        </div>

        <motion.button
          whileHover={{ scale: 1.15, background: 'rgba(100,116,139,0.08)' }}
          whileTap={{ scale: 0.9 }}
          transition={snappy}
          onClick={() => navigateMonth(1)}
          style={{
            width: 30,
            height: 30,
            borderRadius: 8,
            border: '1px solid rgba(100,116,139,0.1)',
            background: 'transparent',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--muted-foreground)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </motion.button>
      </div>

      {/* ── Day headers ───────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          gap: 2,
          marginBottom: 4,
        }}
      >
        {DAY_LABELS.map((d) => (
          <div
            key={d}
            style={{
              fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
              fontSize: 10,
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              textAlign: 'center',
              padding: '4px 0',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      {/* ── Day grid ──────────────────────────────────── */}
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={`grid-${year}-${monthIdx}`}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={gentle}
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(7, 1fr)',
            gap: 2,
          }}
        >
          {days.map(({ date, inMonth }, idx) => {
            const iso = toIso(date)
            const isToday = isSameDay(date, today)
            const highlight = inMonth ? getHighlight(date) : null
            const inSelection = inMonth && isInSelection(date)
            const isRangeStartDay = rangeStart === iso

            let bg = 'transparent'
            let color = inMonth ? 'var(--foreground)' : 'var(--muted-foreground)'
            let fontWeight = 400
            let border = 'none'
            let opacity = inMonth ? 1 : 0.35

            if (highlight === 'absence') {
              bg = 'rgba(239,68,68,0.12)'
              color = '#EF4444'
              fontWeight = 600
            } else if (highlight === 'leave') {
              bg = 'rgba(99,102,241,0.12)'
              color = '#6366F1'
              fontWeight = 600
            }

            if (inSelection) {
              bg = 'rgba(99,102,241,0.15)'
              color = '#6366F1'
              fontWeight = 600
            }

            if (isRangeStartDay) {
              bg = '#6366F1'
              color = '#fff'
              fontWeight = 700
            }

            if (isToday && inMonth) {
              border = '2px solid #6366F1'
              fontWeight = 700
            }

            return (
              <motion.button
                key={`${iso}-${idx}`}
                whileHover={inMonth ? { scale: 1.15, background: highlight || inSelection ? bg : 'rgba(99,102,241,0.06)' } : undefined}
                whileTap={inMonth ? { scale: 0.9 } : undefined}
                transition={snappy}
                onClick={() => inMonth && handleDayClick(iso)}
                onMouseEnter={() => rangeMode && inMonth && setHoverDate(iso)}
                onMouseLeave={() => rangeMode && setHoverDate(null)}
                style={{
                  width: '100%',
                  aspectRatio: '1',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
                  fontVariantNumeric: 'tabular-nums',
                  fontSize: 11,
                  fontWeight,
                  color,
                  background: bg,
                  border,
                  borderRadius: 8,
                  cursor: inMonth ? 'pointer' : 'default',
                  opacity,
                  padding: 0,
                  lineHeight: 1,
                  position: 'relative',
                }}
              >
                {date.getDate()}
                {/* Today dot */}
                {isToday && inMonth && (
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 2,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 3,
                      height: 3,
                      borderRadius: '50%',
                      background: '#6366F1',
                    }}
                  />
                )}
              </motion.button>
            )
          })}
        </motion.div>
      </AnimatePresence>

      {/* ── Range selection hint ───────────────────────── */}
      {rangeMode && rangeStart && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={bouncy}
          style={{
            marginTop: 10,
            textAlign: 'center',
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 11,
            color: '#6366F1',
            fontWeight: 500,
          }}
        >
          Selecteer einddatum
        </motion.div>
      )}
    </motion.div>
  )
}
