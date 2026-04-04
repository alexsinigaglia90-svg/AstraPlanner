'use client'

import { useRef, useEffect, useCallback } from 'react'
import { X, Pencil, Trash2 } from 'lucide-react'

const SKILL_LABELS: Record<number, string> = {
  1: 'Beginner',
  2: 'Basis',
  3: 'Competent',
  4: 'Gevorderd',
  5: 'Expert',
}

const SKILL_COLORS: Record<number, { color: string; bg: string }> = {
  1: { color: '#dc2626', bg: 'rgba(239,68,68,0.08)' },
  2: { color: '#b45309', bg: 'rgba(245,158,11,0.1)' },
  3: { color: '#059669', bg: 'rgba(16,185,129,0.1)' },
  4: { color: '#059669', bg: 'rgba(16,185,129,0.1)' },
  5: { color: '#059669', bg: 'rgba(16,185,129,0.1)' },
}

interface AssignmentPopoverProps {
  assignment: {
    process_name: string
    proficiency_level: number
    shift_name: string
    start_time: string
    end_time: string
    scheduled_hours: number
    cost_estimate: number
    assignment_source: string
  }
  anchorRect: DOMRect
  isEditable: boolean
  onEdit: () => void
  onDelete: () => void
  onClose: () => void
}

export function AssignmentPopover({
  assignment,
  anchorRect,
  isEditable,
  onEdit,
  onDelete,
  onClose,
}: AssignmentPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    },
    [onClose],
  )

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    },
    [onClose],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [handleKeyDown, handleClickOutside])

  const popoverWidth = 280
  const gap = 8
  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080

  const placeRight = viewportWidth - anchorRect.right > popoverWidth + gap + 32
  const left = placeRight
    ? anchorRect.right + gap
    : anchorRect.left - popoverWidth - gap

  const anchorCenterY = anchorRect.top + anchorRect.height / 2
  let top = anchorCenterY - 120
  if (top < 8) top = 8
  if (top + 280 > viewportHeight) top = viewportHeight - 288

  const skillLevel = assignment.proficiency_level
  const skillColor = SKILL_COLORS[skillLevel] ?? { color: '#059669', bg: 'rgba(16,185,129,0.1)' }
  const skillLabel = SKILL_LABELS[skillLevel] ?? 'Onbekend'
  const sourceBadge =
    assignment.assignment_source === 'solver' ? 'Solver' : 'Handmatig'

  const font = 'var(--font-body)'

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top,
        left,
        maxWidth: popoverWidth,
        width: popoverWidth,
        padding: 16,
        background: '#fff',
        border: '1px solid #e2e8f0',
        boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        borderRadius: 12,
        zIndex: 50,
        fontFamily: font,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#1e293b',
            lineHeight: '20px',
            flex: 1,
            marginRight: 8,
          }}
        >
          {assignment.process_name}
        </span>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 2,
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            flexShrink: 0,
          }}
          aria-label="Sluiten"
        >
          <X size={16} />
        </button>
      </div>

      {/* Skill row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 8,
        }}
      >
        <span
          style={{
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: skillColor.bg,
            color: skillColor.color,
            fontSize: 10,
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {skillLevel}
        </span>
        <span style={{ fontSize: 13, color: '#1e293b', fontFamily: font }}>
          Level {skillLevel} — {skillLabel}
        </span>
      </div>

      {/* Shift row */}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6, fontFamily: font }}>
        {assignment.shift_name} · {assignment.start_time} – {assignment.end_time}
      </div>

      {/* Hours row */}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 6, fontFamily: font }}>
        <span style={{ color: '#1e293b', fontWeight: 600 }}>
          {assignment.scheduled_hours}
        </span>{' '}
        uur
      </div>

      {/* Cost row */}
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 10, fontFamily: font }}>
        €{' '}
        <span style={{ color: '#1e293b', fontWeight: 600 }}>
          {assignment.cost_estimate.toFixed(2)}
        </span>
      </div>

      {/* Source badge */}
      <div style={{ marginBottom: isEditable ? 12 : 0 }}>
        <span
          style={{
            display: 'inline-block',
            fontSize: 11,
            fontWeight: 600,
            color: assignment.assignment_source === 'solver' ? '#6366f1' : '#64748b',
            background:
              assignment.assignment_source === 'solver'
                ? 'rgba(99,102,241,0.08)'
                : 'rgba(100,116,139,0.08)',
            padding: '2px 8px',
            borderRadius: 999,
            fontFamily: font,
          }}
        >
          {sourceBadge}
        </span>
      </div>

      {/* Action buttons */}
      {isEditable && (
        <>
          <div style={{ borderTop: '1px solid #f1f5f9', margin: '0 -16px', padding: '0 16px' }} />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              paddingTop: 12,
            }}
          >
            <button
              onClick={onEdit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                color: '#475569',
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: font,
              }}
            >
              <Pencil size={12} />
              Wijzig
            </button>
            <button
              onClick={onDelete}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12,
                fontWeight: 600,
                color: '#dc2626',
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.15)',
                borderRadius: 6,
                padding: '4px 10px',
                cursor: 'pointer',
                fontFamily: font,
              }}
            >
              <Trash2 size={12} />
              Verwijder
            </button>
          </div>
        </>
      )}
    </div>
  )
}
