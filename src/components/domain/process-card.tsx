'use client'

import { motion } from 'framer-motion'
import { Pencil, Trash2 } from 'lucide-react'
import { fadeInUp, bouncy } from '@/lib/motion'
import { SmartIcon } from '@/components/domain/smart-icon'
import { GlassDropdown } from '@/components/domain/glass-dropdown'

// ── Department color config ──────────────────────────────────────────────────

export const DEPT_COLORS: Record<string, { main: string; bg: string; border: string }> = {
  indigo:  { main: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.15)' },
  emerald: { main: '#10b981', bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.12)' },
  amber:   { main: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.12)' },
  pink:    { main: '#ec4899', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.12)' },
  cyan:    { main: '#06b6d4', bg: 'rgba(6,182,212,0.06)',  border: 'rgba(6,182,212,0.12)' },
  red:     { main: '#ef4444', bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.12)' },
  violet:  { main: '#8b5cf6', bg: 'rgba(139,92,246,0.06)', border: 'rgba(139,92,246,0.12)' },
  orange:  { main: '#f97316', bg: 'rgba(249,115,22,0.06)', border: 'rgba(249,115,22,0.12)' },
  teal:    { main: '#14b8a6', bg: 'rgba(20,184,166,0.06)', border: 'rgba(20,184,166,0.12)' },
  rose:    { main: '#f43f5e', bg: 'rgba(244,63,94,0.06)',  border: 'rgba(244,63,94,0.12)' },
  sky:     { main: '#0ea5e9', bg: 'rgba(14,165,233,0.06)', border: 'rgba(14,165,233,0.12)' },
  lime:    { main: '#84cc16', bg: 'rgba(132,204,22,0.06)', border: 'rgba(132,204,22,0.12)' },
  fuchsia: { main: '#d946ef', bg: 'rgba(217,70,239,0.06)', border: 'rgba(217,70,239,0.12)' },
  slate:   { main: '#64748b', bg: 'rgba(100,116,139,0.06)',border: 'rgba(100,116,139,0.12)' },
  yellow:  { main: '#eab308', bg: 'rgba(234,179,8,0.06)',  border: 'rgba(234,179,8,0.12)' },
  blue:    { main: '#3b82f6', bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.12)' },
}

export function getDeptColor(color: string): { main: string; bg: string; border: string } {
  return DEPT_COLORS[color] ?? DEPT_COLORS.indigo!
}

// ── Types ────────────────────────────────────────────────────────────────────

interface ProcessCardProps {
  process: { id: string; name: string; unit_of_measure: string; norm_uph: number; process_type?: string; priority?: string }
  color: string
  onEdit: () => void
  onDelete: () => void
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProcessCard({ process, color, onEdit, onDelete }: ProcessCardProps) {
  const c = getDeptColor(color)

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -2, boxShadow: 'var(--elevation-2)', zIndex: 50 }}
      transition={bouncy}
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--elevation-1)',
        padding: '12px 14px',
        position: 'relative',
        zIndex: 1,
      }}
    >
      {/* Top row: icon + name + priority dot + menu */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        {/* Priority dot */}
        {process.priority && (
          <div
            title={process.priority}
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              backgroundColor:
                process.priority === 'critical' ? '#ef4444' :
                process.priority === 'important' ? '#f59e0b' :
                '#10b981',
              flexShrink: 0,
            }}
          />
        )}
        <SmartIcon name={process.name} type="process" color={c.main} size={15} />
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '13px',
            color: 'var(--foreground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
          }}
        >
          {process.name}
        </span>

        {/* Menu button */}
        <GlassDropdown
          options={[
            { label: 'Edit', icon: <Pencil size={13} />, onClick: onEdit },
            { label: 'Delete', icon: <Trash2 size={13} />, onClick: onDelete, variant: 'destructive', holdToConfirm: true },
          ]}
        />
      </div>

      {/* Supportive badge */}
      {process.process_type === 'supportive' && (
        <span
          style={{
            display: 'inline-block',
            fontFamily: 'var(--font-body)',
            fontSize: '9px',
            fontWeight: 700,
            color: '#f59e0b',
            backgroundColor: 'rgba(245,158,11,0.1)',
            padding: '1px 7px',
            borderRadius: 'var(--radius-full)',
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            marginTop: '2px',
          }}
        >
          Support
        </span>
      )}

      {/* Norm number + UOM row */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '8px' }}>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '22px',
            fontWeight: 800,
            color: c.main,
            lineHeight: 1,
          }}
        >
          {process.norm_uph}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            fontWeight: 500,
            color: 'var(--muted-foreground)',
          }}
        >
          /hr
        </span>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '10px',
            fontWeight: 600,
            color: c.main,
            backgroundColor: c.bg,
            padding: '2px 7px',
            borderRadius: 'var(--radius-full)',
            marginLeft: 'auto',
          }}
        >
          {process.unit_of_measure}
        </span>
      </div>
    </motion.div>
  )
}
