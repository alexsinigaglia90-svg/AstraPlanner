'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { bouncy, snappy, fadeInUp } from '@/lib/motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface AbsenceCardProps {
  employeeName: string
  departmentName: string | null
  startDate: string
  endDate: string
  status: 'planned' | 'confirmed' | 'cancelled'
  overrideType: 'absence' | 'leave'
  leaveType?: string
  delay?: number
  onRecover?: () => void
  onApprove?: () => void
  onReject?: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
}

function getDurationDays(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1)
}

function formatDateRange(start: string, end: string): string {
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const s = new Date(start).toLocaleDateString('nl-NL', opts)
  const e = new Date(end).toLocaleDateString('nl-NL', opts)
  return s === e ? s : `${s} - ${e}`
}

function statusDot(status: string, overrideType: string): { color: string; label: string } {
  if (status === 'cancelled') return { color: '#94A3B8', label: 'Geannuleerd' }
  if (overrideType === 'absence') return { color: '#EF4444', label: 'Ziekmelding' }
  if (status === 'confirmed') return { color: '#10B981', label: 'Bevestigd' }
  return { color: '#F59E0B', label: 'Gepland' }
}

function leaveLabel(leaveType?: string): string {
  switch (leaveType) {
    case 'vakantie': return 'Vakantie'
    case 'bijzonder': return 'Bijzonder verlof'
    case 'onbetaald': return 'Onbetaald verlof'
    default: return 'Verlof'
  }
}

// ── Component ────────────────────────────────────────────────────────────────

export function AbsenceCard({
  employeeName,
  departmentName,
  startDate,
  endDate,
  status,
  overrideType,
  leaveType,
  delay = 0,
  onRecover,
  onApprove,
  onReject,
}: AbsenceCardProps) {
  const [isHovered, setIsHovered] = useState(false)
  const days = getDurationDays(startDate, endDate)
  const dot = statusDot(status, overrideType)
  const isAbsence = overrideType === 'absence'
  const isCancelled = status === 'cancelled'

  const avatarGradient = isAbsence
    ? 'linear-gradient(135deg, #EF4444, #F87171)'
    : 'linear-gradient(135deg, #6366F1, #818CF8)'

  const borderColor = isAbsence
    ? 'rgba(239,68,68,0.12)'
    : 'rgba(99,102,241,0.12)'

  return (
    <motion.div
      variants={fadeInUp}
      initial="hidden"
      animate="show"
      transition={{ ...bouncy, delay }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      whileHover={{
        y: -2,
        boxShadow: '0 8px 24px rgba(30,27,75,0.07)',
        transition: { duration: 0.2 },
      }}
      style={{
        position: 'relative',
        background: 'rgba(255,255,255,0.65)',
        backdropFilter: 'blur(10px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(10px) saturate(1.4)',
        border: `1px solid ${borderColor}`,
        borderRadius: 16,
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        overflow: 'hidden',
        opacity: isCancelled ? 0.55 : 1,
        boxShadow: '0 2px 8px rgba(30,27,75,0.03)',
      }}
    >
      {/* ── Type accent strip (left) ────────────────────── */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          bottom: 0,
          width: 3,
          borderRadius: '16px 0 0 16px',
          background: isAbsence
            ? 'linear-gradient(180deg, #EF4444, #F87171)'
            : 'linear-gradient(180deg, #6366F1, #818CF8)',
        }}
      />

      {/* ── Avatar ──────────────────────────────────────── */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...bouncy, delay: delay + 0.1 }}
        style={{
          width: 40,
          height: 40,
          borderRadius: 12,
          background: avatarGradient,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: isAbsence
            ? '0 4px 12px rgba(239,68,68,0.2)'
            : '0 4px 12px rgba(99,102,241,0.2)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontWeight: 700,
            fontSize: 14,
            color: '#fff',
            lineHeight: 1,
          }}
        >
          {getInitials(employeeName)}
        </span>
      </motion.div>

      {/* ── Info column ─────────────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 2,
          }}
        >
          {/* Status dot */}
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: dot.color,
              flexShrink: 0,
              boxShadow: `0 0 6px ${dot.color}44`,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
              fontWeight: 600,
              fontSize: 14,
              color: 'var(--foreground)',
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textDecoration: isCancelled ? 'line-through' : undefined,
            }}
          >
            {employeeName}
          </span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {departmentName && (
            <span
              style={{
                fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                fontSize: 11,
                color: 'var(--muted-foreground)',
                lineHeight: 1.3,
              }}
            >
              {departmentName}
            </span>
          )}
          {departmentName && (
            <span style={{ color: 'var(--muted-foreground)', fontSize: 9, opacity: 0.4 }}>
              |
            </span>
          )}
          <span
            style={{
              fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
              fontSize: 11,
              color: 'var(--muted-foreground)',
              lineHeight: 1.3,
            }}
          >
            {formatDateRange(startDate, endDate)}
          </span>
        </div>
      </div>

      {/* ── Type badge ──────────────────────────────────── */}
      <span
        style={{
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          fontSize: 10,
          fontWeight: 600,
          color: isAbsence ? '#EF4444' : '#6366F1',
          background: isAbsence ? 'rgba(239,68,68,0.06)' : 'rgba(99,102,241,0.06)',
          border: `1px solid ${isAbsence ? 'rgba(239,68,68,0.12)' : 'rgba(99,102,241,0.12)'}`,
          borderRadius: 7,
          padding: '2px 8px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {isAbsence ? 'Ziek' : leaveLabel(leaveType)}
      </span>

      {/* ── Duration badge ──────────────────────────────── */}
      <span
        style={{
          fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 12,
          fontWeight: 600,
          color: 'var(--foreground)',
          background: 'rgba(100,116,139,0.05)',
          borderRadius: 7,
          padding: '3px 9px',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}
      >
        {isCancelled ? 'Hersteld' : `${days} ${days === 1 ? 'dag' : 'dagen'}`}
      </span>

      {/* ── Action buttons ──────────────────────────────── */}
      {onRecover && !isCancelled && (
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: isHovered ? 1 : 0, scale: isHovered ? 1 : 0.9 }}
          whileHover={{ scale: 1.05, background: 'rgba(16,185,129,0.12)' }}
          whileTap={{ scale: 0.95 }}
          transition={snappy}
          onClick={onRecover}
          style={{
            fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
            fontSize: 11,
            fontWeight: 600,
            color: '#10B981',
            background: 'rgba(16,185,129,0.06)',
            border: '1px solid rgba(16,185,129,0.15)',
            borderRadius: 8,
            padding: '4px 10px',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
            flexShrink: 0,
            pointerEvents: isHovered ? 'auto' : 'none',
          }}
        >
          Herstelmelding
        </motion.button>
      )}

      {onApprove && status === 'planned' && (
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <motion.button
            whileHover={{ scale: 1.12, background: 'rgba(16,185,129,0.12)' }}
            whileTap={{ scale: 0.92 }}
            transition={snappy}
            onClick={onApprove}
            style={{
              width: 30,
              height: 30,
              borderRadius: 8,
              border: '1px solid rgba(16,185,129,0.2)',
              background: 'rgba(16,185,129,0.06)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#10B981',
              fontSize: 14,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </motion.button>
          {onReject && (
            <motion.button
              whileHover={{ scale: 1.12, background: 'rgba(239,68,68,0.12)' }}
              whileTap={{ scale: 0.92 }}
              transition={snappy}
              onClick={onReject}
              style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.2)',
                background: 'rgba(239,68,68,0.06)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#EF4444',
                fontSize: 14,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </motion.button>
          )}
        </div>
      )}
    </motion.div>
  )
}
