'use client'

/**
 * AvailabilityCalendar — read-only weekly view of availability overrides.
 * Shows Mon–Sun columns with colour blocks for overrides in that week.
 * Hour rows span 06:00–22:00 (16 hours visible).
 */

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { scalePress } from '@/lib/motion'

// ── Types ─────────────────────────────────────────────────────────────────────

type OverrideType = 'leave' | 'absence' | 'training' | 'unavailable' | 'extra_availability'

interface AvailabilityOverride {
  id: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  override_type: string
  status: string
  reason: string | null
}

interface AvailabilityCalendarProps {
  overrides: AvailabilityOverride[]
}

// ── Constants ─────────────────────────────────────────────────────────────────

const HOUR_START = 6
const HOUR_END   = 22
const HOURS      = Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i)

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const OVERRIDE_COLOR: Record<OverrideType, { bg: string; text: string; border: string }> = {
  leave:               { bg: 'rgba(59,130,246,0.15)',  text: '#2563EB', border: 'rgba(59,130,246,0.4)'  },
  absence:             { bg: 'rgba(239,68,68,0.15)',   text: '#DC2626', border: 'rgba(239,68,68,0.4)'   },
  training:            { bg: 'rgba(16,185,129,0.15)',  text: '#059669', border: 'rgba(16,185,129,0.4)'  },
  unavailable:         { bg: 'rgba(148,163,184,0.15)', text: '#64748B', border: 'rgba(148,163,184,0.4)' },
  extra_availability:  { bg: 'rgba(99,102,241,0.15)',  text: '#4F46E5', border: 'rgba(99,102,241,0.4)'  },
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns the Monday of the week containing the given date */
function weekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - (day - 1))
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number)
  const h = parts[0] ?? 0
  const m = parts[1] ?? 0
  return h * 60 + m
}

// ── Calendar ──────────────────────────────────────────────────────────────────

export function AvailabilityCalendar({ overrides }: AvailabilityCalendarProps) {
  const [weekOffset, setWeekOffset] = useState(0)

  const monday = useMemo(() => addDays(weekStart(new Date()), weekOffset * 7), [weekOffset])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
    [monday],
  )

  // For each day, collect overrides that overlap
  const dayOverrides = useMemo(() => {
    return weekDays.map((day) => {
      const dateStr = toDateStr(day)
      return overrides.filter(
        (o) => o.start_date <= dateStr && o.end_date >= dateStr,
      )
    })
  }, [weekDays, overrides])

  const CELL_HEIGHT = 16 // px per hour slot
  const TOTAL_HOURS = HOUR_END - HOUR_START

  return (
    <div>
      {/* Week navigator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <motion.button
          variants={scalePress}
          whileTap="press"
          type="button"
          onClick={() => setWeekOffset((w) => w - 1)}
          style={navBtnStyle}
          aria-label="Previous week"
        >
          <ChevronLeft size={14} />
        </motion.button>

        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--foreground)',
            flex: 1,
            textAlign: 'center',
          }}
        >
          {monday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          {' – '}
          {addDays(monday, 6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>

        <motion.button
          variants={scalePress}
          whileTap="press"
          type="button"
          onClick={() => setWeekOffset((w) => w + 1)}
          style={navBtnStyle}
          aria-label="Next week"
        >
          <ChevronRight size={14} />
        </motion.button>

        {weekOffset !== 0 && (
          <motion.button
            variants={scalePress}
            whileTap="press"
            type="button"
            onClick={() => setWeekOffset(0)}
            style={{ ...navBtnStyle, padding: '4px 10px', fontSize: '11px', fontFamily: 'var(--font-body)' }}
          >
            Today
          </motion.button>
        )}
      </div>

      {/* Grid */}
      <div style={{ overflowX: 'auto' }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '36px repeat(7, 1fr)',
            minWidth: '480px',
          }}
        >
          {/* Hour axis header spacer */}
          <div />

          {/* Day headers */}
          {weekDays.map((day, i) => {
            const isToday = toDateStr(day) === toDateStr(new Date())
            return (
              <div
                key={i}
                style={{
                  textAlign: 'center',
                  padding: '4px 2px 8px',
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  fontWeight: 600,
                  color: isToday ? 'var(--primary)' : 'var(--muted-foreground)',
                }}
              >
                <div>{DAY_LABELS[i]}</div>
                <div
                  style={{
                    width: '22px',
                    height: '22px',
                    borderRadius: '50%',
                    backgroundColor: isToday ? 'var(--primary)' : 'transparent',
                    color: isToday ? '#fff' : 'var(--foreground)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: 700,
                    marginTop: '2px',
                  }}
                >
                  {day.getDate()}
                </div>
              </div>
            )
          })}

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <>
              {/* Hour label */}
              <div
                key={`lbl-${hour}`}
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: '9px',
                  color: 'var(--muted-foreground)',
                  paddingRight: '6px',
                  textAlign: 'right',
                  height: `${CELL_HEIGHT}px`,
                  lineHeight: `${CELL_HEIGHT}px`,
                  userSelect: 'none',
                }}
              >
                {String(hour).padStart(2, '0')}
              </div>

              {/* Day cells */}
              {weekDays.map((day, di) => {
                const dateStr = toDateStr(day)
                const cellOverrides = (dayOverrides[di] ?? []).filter((o) => {
                  // Check if this hour falls inside the override's time range
                  if (!o.start_time && !o.end_time) return true // full day
                  const cellStart = hour * 60
                  const cellEnd   = cellStart + 60
                  const oStart = o.start_time ? timeToMinutes(o.start_time) : 0
                  const oEnd   = o.end_time   ? timeToMinutes(o.end_time)   : 24 * 60
                  return cellStart < oEnd && cellEnd > oStart
                })

                const isToday = dateStr === toDateStr(new Date())
                const isWeekend = di >= 5

                return (
                  <div
                    key={`${hour}-${di}`}
                    style={{
                      height: `${CELL_HEIGHT}px`,
                      borderTop: hour === HOUR_START ? '1px solid var(--border)' : '1px solid var(--border)',
                      borderLeft: '1px solid var(--border)',
                      borderRight: di === 6 ? '1px solid var(--border)' : undefined,
                      borderBottom: hour === HOUR_END - 1 ? '1px solid var(--border)' : undefined,
                      backgroundColor: isToday
                        ? 'rgba(99,102,241,0.04)'
                        : isWeekend
                          ? 'rgba(0,0,0,0.02)'
                          : 'transparent',
                      position: 'relative',
                      overflow: 'hidden',
                    }}
                  >
                    {cellOverrides.map((o) => {
                      const type = o.override_type as OverrideType
                      const colors = OVERRIDE_COLOR[type] ?? OVERRIDE_COLOR.unavailable
                      return (
                        <div
                          key={o.id}
                          title={`${type.replace(/_/g, ' ')}${o.reason ? ` — ${o.reason}` : ''}`}
                          style={{
                            position: 'absolute',
                            inset: '1px',
                            backgroundColor: colors.bg,
                            borderLeft: `2px solid ${colors.border}`,
                            borderRadius: '2px',
                          }}
                        />
                      )
                    })}
                  </div>
                )
              })}
            </>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginTop: '14px' }}>
        {(Object.keys(OVERRIDE_COLOR) as OverrideType[]).map((type) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div
              style={{
                width: '10px',
                height: '10px',
                borderRadius: '2px',
                backgroundColor: OVERRIDE_COLOR[type].bg,
                borderLeft: `2px solid ${OVERRIDE_COLOR[type].border}`,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                color: 'var(--muted-foreground)',
                textTransform: 'capitalize',
              }}
            >
              {type.replace(/_/g, ' ')}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Shared style ──────────────────────────────────────────────────────────────

const navBtnStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '28px',
  height: '28px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--muted)',
  color: 'var(--muted-foreground)',
  cursor: 'pointer',
  flexShrink: 0,
}
