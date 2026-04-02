'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { scalePress, snappy, bouncy } from '@/lib/motion'
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react'

interface WeekRangePickerProps {
  value: { start: string; end: string }
  onChange: (range: { start: string; end: string }) => void
}

const RANGE_WEEKS = 7

/** Returns the ISO week number for a given date. */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Returns a Date (Monday) for a given ISO year + week number. */
function getMondayOfWeek(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const dayOfWeek = jan4.getUTCDay() || 7
  const monday = new Date(jan4)
  monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1 + (week - 1) * 7)
  return monday
}

/** Returns the Monday of the current ISO week. */
function getISOWeekStart(): Date {
  const now = new Date()
  // Use UTC to avoid timezone offset issues
  const utcNow = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  const day = utcNow.getUTCDay() || 7
  utcNow.setUTCDate(utcNow.getUTCDate() - day + 1)
  return utcNow
}

function toISO(date: Date): string {
  // Always use UTC components to avoid timezone shift
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  const d = String(date.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date)
  d.setUTCDate(d.getUTCDate() + weeks * 7)
  return d
}

/** Returns default value: current week start + 6 weeks end (7 weeks total). */
export function getDefaultWeekRange(): { start: string; end: string } {
  const start = getISOWeekStart()
  const end = addWeeks(start, RANGE_WEEKS - 1)
  return { start: toISO(start), end: toISO(end) }
}

export function WeekRangePicker({ value, onChange }: WeekRangePickerProps) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const startDate = new Date(value.start + 'T00:00:00Z')
  const endDate = new Date(value.end + 'T00:00:00Z')
  const startWeek = getISOWeekNumber(startDate)
  const endWeek = getISOWeekNumber(endDate)

  const shiftRange = useCallback(
    (direction: -1 | 1) => {
      const newStart = addWeeks(new Date(value.start + 'T00:00:00'), direction)
      const newEnd = addWeeks(new Date(value.end + 'T00:00:00'), direction)
      onChange({ start: toISO(newStart), end: toISO(newEnd) })
    },
    [value, onChange],
  )

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Build week options for the dropdown (current year, weeks 1-52)
  const year = startDate.getFullYear()
  const weekOptions = Array.from({ length: 52 }, (_, i) => i + 1)

  function handleWeekSelect(type: 'start' | 'end', week: number) {
    const monday = getMondayOfWeek(year, week)
    if (type === 'start') {
      const newEnd = addWeeks(monday, RANGE_WEEKS - 1)
      onChange({ start: toISO(monday), end: toISO(newEnd) })
    } else {
      const newStart = addWeeks(monday, -(RANGE_WEEKS - 1))
      onChange({ start: toISO(newStart), end: toISO(monday) })
    }
    setOpen(false)
  }

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'rgba(99,102,241,0.08)',
          borderRadius: 12,
          padding: '6px 8px',
          border: '1px solid var(--border)',
        }}
      >
        {/* Left arrow */}
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => shiftRange(-1)}
          aria-label="Vorige week"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 8,
            padding: 4,
            color: 'var(--primary)',
          }}
        >
          <ChevronLeft size={18} />
        </motion.button>

        {/* Label — clickable to open dropdown */}
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--primary)',
            padding: '2px 6px',
            borderRadius: 8,
            whiteSpace: 'nowrap',
          }}
        >
          <Calendar size={14} />
          Wk {startWeek} &mdash; Wk {endWeek}
        </motion.button>

        {/* Right arrow */}
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => shiftRange(1)}
          aria-label="Volgende week"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            borderRadius: 8,
            padding: 4,
            color: 'var(--primary)',
          }}
        >
          <ChevronRight size={18} />
        </motion.button>
      </div>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={snappy}
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              zIndex: 50,
              background: 'var(--card)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              boxShadow: 'var(--elevation-2)',
              padding: 16,
              minWidth: 220,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Start week selector */}
              <div>
                <label
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--muted-foreground)',
                    marginBottom: 4,
                    display: 'block',
                  }}
                >
                  Startweek
                </label>
                <select
                  value={startWeek}
                  onChange={(e) => handleWeekSelect('start', Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'rgba(99,102,241,0.04)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  {weekOptions.map((w) => (
                    <option key={w} value={w}>
                      Wk {w}
                    </option>
                  ))}
                </select>
              </div>

              {/* End week selector */}
              <div>
                <label
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 11,
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.05em',
                    color: 'var(--muted-foreground)',
                    marginBottom: 4,
                    display: 'block',
                  }}
                >
                  Eindweek
                </label>
                <select
                  value={endWeek}
                  onChange={(e) => handleWeekSelect('end', Number(e.target.value))}
                  style={{
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    background: 'rgba(99,102,241,0.04)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: 13,
                    color: 'var(--foreground)',
                    cursor: 'pointer',
                    outline: 'none',
                  }}
                >
                  {weekOptions.map((w) => (
                    <option key={w} value={w}>
                      Wk {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
