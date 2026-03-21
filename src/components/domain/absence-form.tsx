'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { trpc } from '@/lib/trpc/client'
import { scalePress } from '@/lib/motion'

// ── Types ─────────────────────────────────────────────────────────────────────

type OverrideType = 'leave' | 'absence' | 'training' | 'unavailable' | 'extra_availability'

interface AbsenceFormProps {
  employeeId: string
  onClose: () => void
  onSuccess?: () => void
}

const OVERRIDE_OPTIONS: { value: OverrideType; label: string }[] = [
  { value: 'leave',              label: 'Leave' },
  { value: 'absence',           label: 'Absence' },
  { value: 'training',          label: 'Training' },
  { value: 'unavailable',       label: 'Unavailable' },
  { value: 'extra_availability', label: 'Extra Availability' },
]

// ── Field label ───────────────────────────────────────────────────────────────

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--muted-foreground)',
        display: 'block',
        marginBottom: '6px',
      }}
    >
      {children}
      {required && <span style={{ color: 'var(--destructive)', marginLeft: '3px' }}>*</span>}
    </span>
  )
}

// ── Input style ───────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '48px',
  padding: '0 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--muted)',
  color: 'var(--foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
}

const textAreaStyle: React.CSSProperties = {
  ...inputStyle,
  height: 'auto',
  minHeight: '88px',
  padding: '12px',
  resize: 'vertical',
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function AbsenceForm({ employeeId, onClose, onSuccess }: AbsenceFormProps) {
  const [overrideType, setOverrideType] = useState<OverrideType>('leave')
  const [startDate, setStartDate]       = useState('')
  const [endDate, setEndDate]           = useState('')
  const [startTime, setStartTime]       = useState('')
  const [endTime, setEndTime]           = useState('')
  const [reason, setReason]             = useState('')

  const utils = trpc.useUtils()

  const { mutate: createOverride, isPending, error } = trpc.workforce.createAvailabilityOverride.useMutation({
    onSuccess: () => {
      utils.workforce.getEmployee.invalidate({ id: employeeId })
      onSuccess?.()
      onClose()
    },
  })

  const isValid = !!startDate && !!endDate && endDate >= startDate

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    createOverride({
      employee_id:   employeeId,
      start_date:    startDate,
      end_date:      endDate,
      start_time:    startTime || null,
      end_time:      endTime   || null,
      override_type: overrideType,
      reason:        reason    || undefined,
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Override type */}
      <div>
        <FieldLabel required>Type</FieldLabel>
        <select
          value={overrideType}
          onChange={(e) => setOverrideType(e.target.value as OverrideType)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {OVERRIDE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Date range */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <FieldLabel required>Start Date</FieldLabel>
          <input
            type="date"
            required
            value={startDate}
            onChange={(e) => {
              setStartDate(e.target.value)
              if (endDate && e.target.value > endDate) setEndDate(e.target.value)
            }}
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel required>End Date</FieldLabel>
          <input
            type="date"
            required
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Time range (partial day) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div>
          <FieldLabel>Start Time (optional)</FieldLabel>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            style={inputStyle}
          />
        </div>
        <div>
          <FieldLabel>End Time (optional)</FieldLabel>
          <input
            type="time"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Reason */}
      <div>
        <FieldLabel>Reason (optional)</FieldLabel>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Add a note…"
          style={textAreaStyle}
        />
      </div>

      {/* End date error hint */}
      {startDate && endDate && endDate < startDate && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--destructive)', margin: 0 }}>
          End date must be on or after start date.
        </p>
      )}

      {/* Server error */}
      {error && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--destructive)', margin: 0 }}>
          {error.message}
        </p>
      )}

      {/* Submit */}
      <motion.button
        type="submit"
        variants={scalePress}
        whileTap="press"
        disabled={isPending || !isValid}
        style={{
          padding: '12px 20px',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
          color: '#FFFFFF',
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          fontWeight: 600,
          cursor: isPending || !isValid ? 'not-allowed' : 'pointer',
          opacity: isPending || !isValid ? 0.6 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {isPending ? 'Submitting…' : 'Submit'}
      </motion.button>
    </form>
  )
}
