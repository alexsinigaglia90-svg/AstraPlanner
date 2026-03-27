'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Clock, X, Pencil, Trash2, Check } from 'lucide-react'
import { GlassDropdown } from '@/components/domain/glass-dropdown'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { bouncy, fadeInUp, containerStagger, scalePress } from '@/lib/motion'
import { getDeptColor, DEPT_COLORS } from '@/components/domain/process-card'
import { useToast } from '@/components/domain/toast'
import { useDemoStore } from '@/hooks/use-demo'
import { demoShifts } from '@/components/onboarding/demo-seed'

// ── Types ────────────────────────────────────────────────────────────────────

interface ShiftData {
  id: string
  name: string
  code: string
  start_time: string
  end_time: string
  duration_hours: number
  days_of_week: number[]
  break_rules_json: Record<string, unknown>
  is_overnight: boolean
  shift_type: string
  color_hex: string | null
}

interface CrewData {
  id: string
  name: string
  code: string
  color: string
  member_count: number
}

interface BreakRule {
  start_time: string
  end_time: string
  include_ramp: boolean
  ramp_down_minutes: number
  ramp_up_minutes: number
  staggered: boolean
  stagger_groups: number
}

interface ShiftFormState {
  id?: string
  name: string
  start_time: string
  end_time: string
  days_of_week: number[]
  breaks: BreakRule[]
}

interface CrewFormState {
  id?: string
  name: string
  color: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function timeToHours(t: string): number {
  const [h, m] = t.split(':')
  return parseInt(h ?? '0', 10) + parseInt(m ?? '0', 10) / 60
}

function calcDuration(start: string, end: string): number {
  const s = timeToHours(start)
  const e = timeToHours(end)
  if (e <= s) return (24 - s) + e
  return e - s
}

function isOvernight(start: string, end: string): boolean {
  return timeToHours(end) <= timeToHours(start)
}

function formatTime(t: string): string {
  return t.substring(0, 5)
}

function parseBreakRules(json: Record<string, unknown>): BreakRule[] {
  const rules = json.rules
  if (Array.isArray(rules)) {
    return rules.map((r: Record<string, unknown>) => ({
      start_time: String(r.start_time ?? '08:30'),
      end_time: String(r.end_time ?? '08:45'),
      include_ramp: Boolean(r.include_ramp ?? false),
      ramp_down_minutes: Number(r.ramp_down_minutes ?? 3),
      ramp_up_minutes: Number(r.ramp_up_minutes ?? 3),
      staggered: Boolean(r.staggered ?? false),
      stagger_groups: Number(r.stagger_groups ?? 2),
    }))
  }
  return [{ start_time: '08:30', end_time: '08:45', include_ramp: false, ramp_down_minutes: 3, ramp_up_minutes: 3, staggered: false, stagger_groups: 2 }]
}

function breakRulesToJson(breaks: BreakRule[]) {
  return { rules: breaks }
}

function breakDuration(b: BreakRule): number {
  const s = timeToHours(b.start_time)
  const e = timeToHours(b.end_time)
  const base = Math.round((e - s) * 60)
  const ramp = b.include_ramp ? b.ramp_down_minutes + b.ramp_up_minutes : 0
  return base + ramp
}

function formatBreaks(json: Record<string, unknown>): string {
  const rules = parseBreakRules(json)
  if (rules.length === 0) return 'No breaks'
  return rules.map((r) => {
    const dur = breakDuration(r)
    const time = `${formatTime(r.start_time)}–${formatTime(r.end_time)}`
    const blockMin = Math.round((timeToHours(r.end_time) - timeToHours(r.start_time)) * 60)
    const staggerInfo = r.staggered ? ` ${r.stagger_groups}gr` : ''
    const perPerson = r.staggered ? Math.round(blockMin / r.stagger_groups) : blockMin
    return r.include_ramp
      ? `${time} (${dur}min eff.${staggerInfo})`
      : `${time} (${perPerson}min${r.staggered ? `/person, ${blockMin}min block` : ''})`
  }).join(', ')
}

const AVAILABLE_COLORS = Object.keys(DEPT_COLORS)

// ── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--card)',
  color: 'var(--foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  cursor: 'pointer',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: '32px',
}

const btnPrimary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '9px 18px',
  borderRadius: 'var(--radius-sm)',
  border: 'none',
  background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
  color: '#fff',
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  fontWeight: 600,
  cursor: 'pointer',
}

const btnSecondary: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '9px 18px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--card)',
  color: 'var(--foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
}


// ── Modal Wrapper ────────────────────────────────────────────────────────────

function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 100,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 16 }}
          transition={bouncy}
          onClick={(e) => e.stopPropagation()}
          style={{
            backgroundColor: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)', boxShadow: 'var(--elevation-3)',
            padding: '28px', width: '100%', maxWidth: 520, maxHeight: '90vh',
            overflowY: 'auto',
          }}
        >
          {children}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

// ── Shift Card ───────────────────────────────────────────────────────────────

function ShiftCard({
  shift,
  onEdit,
  onDelete,
}: {
  shift: ShiftData
  onEdit: () => void
  onDelete: () => void
}) {
  const startH = timeToHours(shift.start_time)
  const endH = timeToHours(shift.end_time)
  const barColor = shift.color_hex || 'var(--primary)'

  // Two-segment rendering for overnight shifts
  const segments: { left: string; width: string }[] = []
  if (shift.is_overnight) {
    segments.push({ left: `${(startH / 24) * 100}%`, width: `${((24 - startH) / 24) * 100}%` })
    segments.push({ left: '0%', width: `${(endH / 24) * 100}%` })
  } else {
    segments.push({
      left: `${(startH / 24) * 100}%`,
      width: `${(shift.duration_hours / 24) * 100}%`,
    })
  }

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -2, boxShadow: 'var(--elevation-2)' }}
      transition={bouncy}
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--elevation-1)',
        padding: '16px',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Header: name + menu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 700, color: 'var(--foreground)' }}>
          {shift.name}
        </span>
        <GlassDropdown
          options={[
            { label: 'Edit', icon: <Pencil size={13} />, onClick: onEdit },
            { label: 'Delete', icon: <Trash2 size={13} />, onClick: onDelete, variant: 'destructive', holdToConfirm: true },
          ]}
        />
      </div>

      {/* Time bar (24h axis) */}
      <div style={{ position: 'relative', height: 8, backgroundColor: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
        {segments.map((seg, i) => (
          <div
            key={i}
            style={{
              position: 'absolute', top: 0, bottom: 0,
              left: seg.left, width: seg.width,
              backgroundColor: barColor, borderRadius: 4, opacity: 0.85,
            }}
          />
        ))}
      </div>

      {/* Time text + duration */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--foreground)' }}>
          {formatTime(shift.start_time)} &mdash; {formatTime(shift.end_time)}
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted-foreground)' }}>
          {shift.duration_hours.toFixed(1)} hrs
        </span>
        {shift.is_overnight && (
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700, color: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.1)', padding: '1px 7px',
            borderRadius: 'var(--radius-full)', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            Overnight
          </span>
        )}
      </div>

      {/* Days of week */}
      <div style={{ display: 'flex', gap: 4 }}>
        {DAY_LABELS.map((label, i) => {
          const dayNum = i + 1
          const active = shift.days_of_week.includes(dayNum)
          return (
            <div
              key={dayNum}
              style={{
                width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 700, fontFamily: 'var(--font-body)',
                backgroundColor: active ? 'var(--primary)' : 'var(--border)',
                color: active ? '#fff' : 'var(--muted-foreground)',
                letterSpacing: '0.02em',
              }}
            >
              {label}
            </div>
          )
        })}
      </div>

      {/* Breaks */}
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted-foreground)' }}>
        {formatBreaks(shift.break_rules_json)}
      </span>
    </motion.div>
  )
}

// ── Shift Modal ──────────────────────────────────────────────────────────────

function ShiftModal({
  open,
  onClose,
  onSave,
  saving,
  initial,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: ShiftFormState) => void
  saving: boolean
  initial?: ShiftData | null
}) {
  const [form, setForm] = useState<ShiftFormState>({
    name: '',
    start_time: '06:00',
    end_time: '14:00',
    days_of_week: [1, 2, 3, 4, 5],
    breaks: [{ start_time: '08:30', end_time: '08:45', include_ramp: false, ramp_down_minutes: 3, ramp_up_minutes: 3, staggered: false, stagger_groups: 2 }],
  })

  useEffect(() => {
    if (initial) {
      setForm({
        id: initial.id,
        name: initial.name,
        start_time: formatTime(initial.start_time),
        end_time: formatTime(initial.end_time),
        days_of_week: [...initial.days_of_week],
        breaks: parseBreakRules(initial.break_rules_json),
      })
    } else {
      setForm({
        name: '',
        start_time: '06:00',
        end_time: '14:00',
        days_of_week: [1, 2, 3, 4, 5],
        breaks: [{ start_time: '08:30', end_time: '08:45', include_ramp: false, ramp_down_minutes: 3, ramp_up_minutes: 3, staggered: false, stagger_groups: 2 }],
      })
    }
  }, [initial, open])

  const duration = calcDuration(form.start_time, form.end_time)
  const overnight = isOvernight(form.start_time, form.end_time)

  const toggleDay = (d: number) => {
    setForm((prev) => ({
      ...prev,
      days_of_week: prev.days_of_week.includes(d)
        ? prev.days_of_week.filter((x) => x !== d)
        : [...prev.days_of_week, d].sort(),
    }))
  }

  const updateBreak = (idx: number, field: keyof BreakRule, value: unknown) => {
    setForm((prev) => {
      const next = [...prev.breaks]
      next[idx] = { ...next[idx]!, [field]: value }
      return { ...prev, breaks: next }
    })
  }

  const removeBreak = (idx: number) => {
    setForm((prev) => ({ ...prev, breaks: prev.breaks.filter((_, i) => i !== idx) }))
  }

  const addBreak = () => {
    setForm((prev) => ({ ...prev, breaks: [...prev.breaks, { start_time: '12:00', end_time: '12:30', include_ramp: false, ramp_down_minutes: 3, ramp_up_minutes: 3, staggered: false, stagger_groups: 2 }] }))
  }

  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
          {initial ? 'Edit Shift' : 'Add Shift'}
        </h3>

        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Name <span style={{ color: 'var(--destructive)' }}>*</span>
          </label>
          <input
            autoFocus
            style={inputStyle}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Morning Shift"
          />
        </div>

        {/* Time row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
              Start Time
            </label>
            <input
              type="time"
              style={inputStyle}
              value={form.start_time}
              onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
              End Time
            </label>
            <input
              type="time"
              style={inputStyle}
              value={form.end_time}
              onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
              Duration
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14, fontWeight: 600, color: 'var(--foreground)' }}>
                {duration.toFixed(1)} hrs
              </span>
              {overnight && (
                <span style={{
                  fontFamily: 'var(--font-body)', fontSize: 9, fontWeight: 700, color: '#f59e0b',
                  backgroundColor: 'rgba(245,158,11,0.1)', padding: '2px 7px',
                  borderRadius: 'var(--radius-full)', textTransform: 'uppercase',
                }}>
                  Overnight
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Days of week */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Days of Week
          </label>
          <div style={{ display: 'flex', gap: 6 }}>
            {DAY_LABELS.map((label, i) => {
              const dayNum = i + 1
              const active = form.days_of_week.includes(dayNum)
              return (
                <button
                  key={dayNum}
                  type="button"
                  onClick={() => toggleDay(dayNum)}
                  style={{
                    width: 34, height: 34, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-body)',
                    backgroundColor: active ? 'var(--primary)' : 'transparent',
                    color: active ? '#fff' : 'var(--muted-foreground)',
                    border: active ? 'none' : '1px solid var(--border)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* Breaks */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Breaks
          </label>
          {form.breaks.map((b, idx) => (
            <div key={idx} style={{
              display: 'flex', flexDirection: 'column', gap: 8,
              padding: '12px 14px', borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)', backgroundColor: 'var(--card)',
            }}>
              {/* Time row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="time"
                  style={{ ...inputStyle, width: 110 }}
                  value={b.start_time}
                  onChange={(e) => updateBreak(idx, 'start_time', e.target.value)}
                />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--muted-foreground)' }}>—</span>
                <input
                  type="time"
                  style={{ ...inputStyle, width: 110 }}
                  value={b.end_time}
                  onChange={(e) => updateBreak(idx, 'end_time', e.target.value)}
                />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--foreground)', fontWeight: 600, marginLeft: 'auto' }}>
                  {Math.round((timeToHours(b.end_time) - timeToHours(b.start_time)) * 60)} min
                </span>
                <button
                  type="button"
                  onClick={() => removeBreak(idx)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 24, height: 24, borderRadius: '50%',
                    border: 'none', backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)', cursor: 'pointer',
                  }}
                >
                  <X size={14} />
                </button>
              </div>

              {/* Ramp time toggle + inputs */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => updateBreak(idx, 'include_ramp', !b.include_ramp)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${b.include_ramp ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                    backgroundColor: b.include_ramp ? 'rgba(99,102,241,0.06)' : 'transparent',
                    color: b.include_ramp ? 'var(--primary)' : 'var(--muted-foreground)',
                    fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 26, height: 14, borderRadius: 7,
                    backgroundColor: b.include_ramp ? 'var(--primary)' : 'var(--border)',
                    position: 'relative', transition: 'background-color 0.15s',
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', backgroundColor: '#fff',
                      position: 'absolute', top: 2,
                      left: b.include_ramp ? 14 : 2,
                      transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                    }} />
                  </div>
                  Include ramp time
                </button>

                {b.include_ramp && (
                  <>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted-foreground)' }}>↓</span>
                    <input
                      type="number"
                      min="0"
                      max="15"
                      style={{ ...inputStyle, width: 50, textAlign: 'center', fontSize: 12 }}
                      value={b.ramp_down_minutes}
                      onChange={(e) => updateBreak(idx, 'ramp_down_minutes', Number(e.target.value))}
                    />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)' }}>min voor</span>
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted-foreground)' }}>↑</span>
                    <input
                      type="number"
                      min="0"
                      max="15"
                      style={{ ...inputStyle, width: 50, textAlign: 'center', fontSize: 12 }}
                      value={b.ramp_up_minutes}
                      onChange={(e) => updateBreak(idx, 'ramp_up_minutes', Number(e.target.value))}
                    />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)' }}>min na</span>
                  </>
                )}
              </div>

              {b.include_ramp && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--primary)', paddingLeft: 2 }}>
                  Effectief verlies: {breakDuration(b)} min ({Math.round((timeToHours(b.end_time) - timeToHours(b.start_time)) * 60)} pauze + {b.ramp_down_minutes} aanloop + {b.ramp_up_minutes} afloop)
                </div>
              )}

              {/* Staggered break toggle */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => updateBreak(idx, 'staggered', !b.staggered)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '4px 10px', borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${b.staggered ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                    backgroundColor: b.staggered ? 'rgba(245,158,11,0.06)' : 'transparent',
                    color: b.staggered ? '#d97706' : 'var(--muted-foreground)',
                    fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 26, height: 14, borderRadius: 7,
                    backgroundColor: b.staggered ? '#f59e0b' : 'var(--border)',
                    position: 'relative', transition: 'background-color 0.15s',
                  }}>
                    <div style={{
                      width: 10, height: 10, borderRadius: '50%', backgroundColor: '#fff',
                      position: 'absolute', top: 2,
                      left: b.staggered ? 14 : 2,
                      transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                    }} />
                  </div>
                  Staggered break
                </button>

                {b.staggered && (
                  <>
                    <input
                      type="number"
                      min="2"
                      max="6"
                      style={{ ...inputStyle, width: 50, textAlign: 'center', fontSize: 12 }}
                      value={b.stagger_groups}
                      onChange={(e) => updateBreak(idx, 'stagger_groups', Math.max(2, Number(e.target.value)))}
                    />
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)' }}>groups</span>
                  </>
                )}
              </div>

              {b.staggered && (() => {
                const blockMin = Math.round((timeToHours(b.end_time) - timeToHours(b.start_time)) * 60)
                const perPerson = Math.round(blockMin / b.stagger_groups)
                const capacityPct = Math.round((1 - 1 / b.stagger_groups) * 100)
                return (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: '#d97706', paddingLeft: 2, lineHeight: 1.5 }}>
                    Block: {blockMin} min total &middot; {perPerson} min per person &middot; {b.stagger_groups} groups
                    <br />
                    Capacity during break: {capacityPct}% ({b.stagger_groups - 1}/{b.stagger_groups} crew working at any time)
                  </div>
                )
              })()}
            </div>
          ))}
          <button
            type="button"
            onClick={addBreak}
            style={{
              ...btnSecondary, alignSelf: 'flex-start', padding: '5px 12px', fontSize: 11,
            }}
          >
            <Plus size={12} /> Add Break
          </button>
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <motion.button
            variants={scalePress}
            whileTap="press"
            disabled={saving || !form.name.trim()}
            onClick={() => onSave(form)}
            style={{ ...btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </motion.button>
        </div>
      </div>
    </Modal>
  )
}

// ── Crew Modal ───────────────────────────────────────────────────────────────

function CrewModal({
  open,
  onClose,
  onSave,
  saving,
  initial,
  usedColors,
}: {
  open: boolean
  onClose: () => void
  onSave: (data: CrewFormState) => void
  saving: boolean
  initial?: CrewData | null
  usedColors: string[]
}) {
  const [form, setForm] = useState<CrewFormState>({ name: '', color: 'indigo' })

  useEffect(() => {
    if (initial) {
      setForm({ id: initial.id, name: initial.name, color: initial.color })
    } else {
      const unused = AVAILABLE_COLORS.filter((c) => !usedColors.includes(c))
      setForm({ name: '', color: unused[0] ?? 'indigo' })
    }
  }, [initial, open, usedColors])

  const availableForPicker = initial
    ? AVAILABLE_COLORS
    : AVAILABLE_COLORS.filter((c) => !usedColors.includes(c) || c === form.color)

  return (
    <Modal open={open} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
          {initial ? 'Edit Crew' : 'Add Crew'}
        </h3>

        {/* Color picker */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Color
          </label>
          <div style={{ display: 'flex', gap: 8 }}>
            {availableForPicker.map((colorKey) => {
              const c = getDeptColor(colorKey)
              const active = form.color === colorKey
              return (
                <button
                  key={colorKey}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, color: colorKey }))}
                  style={{
                    width: 32, height: 32, borderRadius: '50%',
                    backgroundColor: c.main, border: active ? '3px solid var(--foreground)' : '3px solid transparent',
                    cursor: 'pointer', transition: 'border 0.15s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {active && <Check size={14} color="#fff" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Name */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Name <span style={{ color: 'var(--destructive)' }}>*</span>
          </label>
          <input
            autoFocus
            style={inputStyle}
            value={form.name}
            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Crew Alpha"
          />
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 8 }}>
          <button type="button" onClick={onClose} style={btnSecondary}>Cancel</button>
          <motion.button
            variants={scalePress}
            whileTap="press"
            disabled={saving || !form.name.trim()}
            onClick={() => onSave(form)}
            style={{ ...btnPrimary, opacity: saving ? 0.7 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Saving...' : 'Save'}
          </motion.button>
        </div>
      </div>
    </Modal>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ShiftsSettingsPage() {
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const utils = trpc.useUtils()
  const toast = useToast()

  const DEMO_MSG = 'Dit is een demo — start je eigen omgeving om wijzigingen te maken'

  // Queries
  const shifts = trpc.org.listShifts.useQuery({ site_id: activeSiteId! }, { enabled: !!activeSiteId && !isDemo })
  const crews = trpc.org.listCrews.useQuery({ site_id: activeSiteId! }, { enabled: !!activeSiteId && !isDemo })
  const rotation = trpc.org.getRotation.useQuery({ site_id: activeSiteId! }, { enabled: !!activeSiteId && !isDemo })

  // Mutations
  const upsertShift = trpc.org.upsertShift.useMutation({
    onSuccess: () => { utils.org.listShifts.invalidate(); utils.org.getRotation.invalidate() },
  })
  const deleteShift = trpc.org.deleteShift.useMutation({
    onSuccess: () => { utils.org.listShifts.invalidate() },
  })
  const upsertCrew = trpc.org.upsertCrew.useMutation({
    onSuccess: () => { utils.org.listCrews.invalidate() },
  })
  const deleteCrew = trpc.org.deleteCrew.useMutation({
    onSuccess: () => { utils.org.listCrews.invalidate() },
  })
  const saveRotation = trpc.org.saveRotation.useMutation({
    onSuccess: () => { utils.org.getRotation.invalidate() },
  })

  // Shift modal
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const [editingShift, setEditingShift] = useState<ShiftData | null>(null)

  // Crew modal
  const [crewModalOpen, setCrewModalOpen] = useState(false)
  const [editingCrew, setEditingCrew] = useState<CrewData | null>(null)

  // Rotation state
  const [cycleWeeks, setCycleWeeks] = useState(2)
  const [rotationMatrix, setRotationMatrix] = useState<Record<string, Record<number, string>>>({})
  const [rotationDirty, setRotationDirty] = useState(false)

  // Sync rotation data from server
  useEffect(() => {
    if (rotation.data) {
      setCycleWeeks(rotation.data.cycle_weeks)
      const matrix: Record<string, Record<number, string>> = {}
      for (const entry of rotation.data.entries) {
        if (!matrix[entry.crew_id]) matrix[entry.crew_id] = {}
        matrix[entry.crew_id]![entry.week_number] = entry.shift_pattern_id
      }
      setRotationMatrix(matrix)
      setRotationDirty(false)
    }
  }, [rotation.data])

  const handleSaveShift = useCallback(async (data: ShiftFormState) => {
    if (!activeSiteId) return
    if (isDemo) { toast.showError(DEMO_MSG); return }
    await upsertShift.mutateAsync({
      id: data.id,
      name: data.name,
      site_id: activeSiteId,
      start_time: data.start_time,
      end_time: data.end_time,
      days_of_week: data.days_of_week,
      break_rules_json: breakRulesToJson(data.breaks),
    })
    setShiftModalOpen(false)
    setEditingShift(null)
  }, [activeSiteId, upsertShift])

  const handleDeleteShift = useCallback(async (id: string) => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    try {
      await deleteShift.mutateAsync({ id })
      toast.showSuccess('Shift deleted')
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Failed to delete shift')
    }
  }, [deleteShift, toast])

  const handleSaveCrew = useCallback(async (data: CrewFormState) => {
    if (!activeSiteId) return
    if (isDemo) { toast.showError(DEMO_MSG); return }
    await upsertCrew.mutateAsync({
      id: data.id,
      name: data.name,
      site_id: activeSiteId,
      color: data.color,
    })
    setCrewModalOpen(false)
    setEditingCrew(null)
  }, [activeSiteId, upsertCrew])

  const handleDeleteCrew = useCallback(async (id: string) => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    try {
      await deleteCrew.mutateAsync({ id })
      toast.showSuccess('Crew deleted')
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Failed to delete crew')
    }
  }, [deleteCrew, toast])

  const handleRotationCellChange = (crewId: string, weekNum: number, shiftId: string) => {
    setRotationMatrix((prev) => {
      const next = { ...prev }
      if (!next[crewId]) next[crewId] = {}
      next[crewId] = { ...next[crewId] }
      if (shiftId) {
        next[crewId]![weekNum] = shiftId
      } else {
        delete next[crewId]![weekNum]
      }
      return next
    })
    setRotationDirty(true)
  }

  const handleSaveRotation = async () => {
    if (!activeSiteId) return
    if (isDemo) { toast.showError(DEMO_MSG); return }
    const entries: { crew_id: string; shift_pattern_id: string; week_number: number }[] = []
    for (const [crewId, weeks] of Object.entries(rotationMatrix)) {
      for (const [weekStr, shiftId] of Object.entries(weeks)) {
        if (shiftId) {
          entries.push({ crew_id: crewId, shift_pattern_id: shiftId, week_number: Number(weekStr) })
        }
      }
    }
    await saveRotation.mutateAsync({ site_id: activeSiteId, cycle_weeks: cycleWeeks, entries })
    setRotationDirty(false)
  }

  if (!activeSiteId) {
    return (
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--muted-foreground)', padding: 32 }}>
        Select a site to manage shifts.
      </div>
    )
  }

  const demoShiftData = isDemo ? demoShifts.filter((s) => s.site_id === activeSiteId) : []
  const shiftList = isDemo ? demoShiftData : (shifts.data ?? [])
  const crewList = isDemo ? [] as typeof crews.data & unknown[] : (crews.data ?? [])
  const usedColors = crewList.map((c) => c.color)
  const showRotation = shiftList.length > 0 && crewList.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40, maxWidth: 1000 }}>
      {/* ── Section 1: Shifts ─────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Shifts
          </h2>
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => { setEditingShift(null); setShiftModalOpen(true) }}
            style={btnPrimary}
          >
            <Plus size={14} /> Add Shift
          </motion.button>
        </div>

        {shifts.isLoading ? (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--muted-foreground)' }}>Loading shifts...</div>
        ) : shiftList.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)',
            fontSize: 14, color: 'var(--muted-foreground)',
            backgroundColor: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}>
            No shifts configured yet. Click &quot;+ Add Shift&quot; to create one.
          </div>
        ) : (
          <motion.div
            variants={containerStagger}
            initial="hidden"
            animate="show"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 12,
            }}
          >
            {shiftList.map((shift) => (
              <ShiftCard
                key={shift.id}
                shift={shift}
                onEdit={() => { setEditingShift(shift); setShiftModalOpen(true) }}
                onDelete={() => handleDeleteShift(shift.id)}
              />
            ))}
          </motion.div>
        )}
      </section>

      {/* ── Section 2: Crews ──────────────────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Crews
          </h2>
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => { setEditingCrew(null); setCrewModalOpen(true) }}
            style={btnPrimary}
          >
            <Plus size={14} /> Add Crew
          </motion.button>
        </div>

        {crews.isLoading ? (
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--muted-foreground)' }}>Loading crews...</div>
        ) : crewList.length === 0 ? (
          <div style={{
            padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)',
            fontSize: 14, color: 'var(--muted-foreground)',
            backgroundColor: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}>
            No crews configured yet. Click &quot;+ Add Crew&quot; to create one.
          </div>
        ) : (
          <motion.div
            variants={containerStagger}
            initial="hidden"
            animate="show"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}
          >
            {crewList.map((crew) => {
              const c = getDeptColor(crew.color)
              const blocked = crew.member_count > 0
              return (
                <motion.div
                  key={crew.id}
                  variants={fadeInUp}
                  whileHover={{ y: -2, boxShadow: 'var(--elevation-2)' }}
                  transition={bouncy}
                  style={{
                    backgroundColor: 'var(--card)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)', boxShadow: 'var(--elevation-1)',
                    padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 10,
                    minWidth: 180,
                  }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: c.main, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--foreground)' }}>
                    {crew.name}
                  </span>
                  <span style={{
                    fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 600,
                    backgroundColor: c.bg, color: c.main, padding: '2px 8px',
                    borderRadius: 'var(--radius-full)', marginLeft: 'auto', whiteSpace: 'nowrap',
                  }}>
                    {crew.member_count} member{crew.member_count !== 1 ? 's' : ''}
                  </span>
                  <GlassDropdown
                    options={[
                      { label: 'Edit', icon: <Pencil size={13} />, onClick: () => { setEditingCrew(crew); setCrewModalOpen(true) } },
                      { label: 'Delete', icon: <Trash2 size={13} />, onClick: () => handleDeleteCrew(crew.id), variant: 'destructive', holdToConfirm: true, disabled: blocked, disabledReason: 'Cannot delete crew with members' },
                    ]}
                  />
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </section>

      {/* ── Section 3: Rotation Schedule ──────────────────────────────────── */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
            Rotation Schedule
          </h2>
          {showRotation && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--muted-foreground)' }}>
                Cycle weeks:
              </label>
              <input
                type="number"
                min={1}
                max={12}
                value={cycleWeeks}
                onChange={(e) => { setCycleWeeks(Math.max(1, Math.min(12, Number(e.target.value)))); setRotationDirty(true) }}
                style={{ ...inputStyle, width: 64, textAlign: 'center' }}
              />
            </div>
          )}
        </div>

        {!showRotation ? (
          <div style={{
            padding: 32, textAlign: 'center', fontFamily: 'var(--font-body)',
            fontSize: 14, color: 'var(--muted-foreground)',
            backgroundColor: 'var(--card)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
          }}>
            Add shifts and crews above to configure the rotation schedule.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Matrix */}
            <div style={{
              overflowX: 'auto', backgroundColor: 'var(--card)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
              boxShadow: 'var(--elevation-1)',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-body)', fontSize: 13 }}>
                <thead>
                  <tr>
                    <th style={{
                      padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600,
                      textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)',
                    }}>
                      Crew
                    </th>
                    {Array.from({ length: cycleWeeks }, (_, i) => (
                      <th key={i} style={{
                        padding: '10px 14px', textAlign: 'center', fontSize: 11, fontWeight: 600,
                        textTransform: 'uppercase', letterSpacing: '0.06em',
                        color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)',
                      }}>
                        Week {i + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {crewList.map((crew) => {
                    const c = getDeptColor(crew.color)
                    return (
                      <tr key={crew.id}>
                        <td style={{
                          padding: '10px 14px', borderBottom: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
                        }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: c.main }} />
                          <span style={{ fontWeight: 600 }}>{crew.name}</span>
                        </td>
                        {Array.from({ length: cycleWeeks }, (_, weekIdx) => {
                          const weekNum = weekIdx + 1
                          const selectedShiftId = rotationMatrix[crew.id]?.[weekNum] ?? ''
                          const selectedShift = shiftList.find((s) => s.id === selectedShiftId)
                          return (
                            <td key={weekIdx} style={{
                              padding: '8px 10px', borderBottom: '1px solid var(--border)', textAlign: 'center',
                            }}>
                              <select
                                style={{
                                  ...selectStyle,
                                  width: '100%',
                                  fontSize: 12,
                                  padding: '6px 28px 6px 10px',
                                  backgroundColor: selectedShift
                                    ? (selectedShift.color_hex ? `${selectedShift.color_hex}18` : 'rgba(99,102,241,0.08)')
                                    : 'var(--card)',
                                  color: selectedShift ? 'var(--foreground)' : 'var(--muted-foreground)',
                                  fontWeight: selectedShift ? 600 : 400,
                                }}
                                value={selectedShiftId}
                                onChange={(e) => handleRotationCellChange(crew.id, weekNum, e.target.value)}
                              >
                                <option value="">—</option>
                                {shiftList.map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Save button */}
            <motion.button
              variants={scalePress}
              whileTap="press"
              disabled={saveRotation.isPending || !rotationDirty}
              onClick={handleSaveRotation}
              style={{
                ...btnPrimary,
                alignSelf: 'flex-start',
                opacity: saveRotation.isPending || !rotationDirty ? 0.6 : 1,
                cursor: saveRotation.isPending || !rotationDirty ? 'not-allowed' : 'pointer',
              }}
            >
              {saveRotation.isPending ? 'Saving...' : 'Save Rotation'}
            </motion.button>
          </div>
        )}
      </section>

      {/* ── Modals ────────────────────────────────────────────────────────── */}
      <ShiftModal
        open={shiftModalOpen}
        onClose={() => { setShiftModalOpen(false); setEditingShift(null) }}
        onSave={handleSaveShift}
        saving={upsertShift.isPending}
        initial={editingShift}
      />
      <CrewModal
        open={crewModalOpen}
        onClose={() => { setCrewModalOpen(false); setEditingCrew(null) }}
        onSave={handleSaveCrew}
        saving={upsertCrew.isPending}
        initial={editingCrew}
        usedColors={usedColors}
      />
    </div>
  )
}
