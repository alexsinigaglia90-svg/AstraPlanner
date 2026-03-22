'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MoreVertical, Pencil, Trash2 } from 'lucide-react'
import { fadeInUp, bouncy, scalePress } from '@/lib/motion'
import { SmartIcon } from '@/components/domain/smart-icon'

// ── Department color config ──────────────────────────────────────────────────

export const DEPT_COLORS: Record<string, { main: string; bg: string; border: string }> = {
  indigo:  { main: '#6366f1', bg: 'rgba(99,102,241,0.08)',  border: 'rgba(99,102,241,0.15)' },
  emerald: { main: '#10b981', bg: 'rgba(16,185,129,0.06)',  border: 'rgba(16,185,129,0.12)' },
  amber:   { main: '#f59e0b', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.12)' },
  pink:    { main: '#ec4899', bg: 'rgba(236,72,153,0.06)', border: 'rgba(236,72,153,0.12)' },
  cyan:    { main: '#06b6d4', bg: 'rgba(6,182,212,0.06)',  border: 'rgba(6,182,212,0.12)' },
  red:     { main: '#ef4444', bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.12)' },
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
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
        setConfirmDelete(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

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
        padding: '12px 14px',
        position: 'relative',
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
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); setConfirmDelete(false) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '24px',
              height: '24px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              backgroundColor: 'transparent',
              color: 'var(--muted-foreground)',
              cursor: 'pointer',
              padding: 0,
              flexShrink: 0,
            }}
          >
            <MoreVertical size={14} />
          </button>

          {/* Dropdown menu */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: '4px',
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--elevation-2)',
                  minWidth: '120px',
                  zIndex: 50,
                  overflow: 'hidden',
                }}
              >
                {!confirmDelete ? (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); setMenuOpen(false); onEdit() }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: 'var(--foreground)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <Pencil size={12} />
                      Edit
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(true) }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        width: '100%',
                        padding: '8px 12px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: 'var(--destructive)',
                        fontFamily: 'var(--font-body)',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                  </>
                ) : (
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '11px',
                        color: 'var(--destructive)',
                        fontWeight: 600,
                      }}
                    >
                      Delete this process?
                    </span>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(false); setMenuOpen(false) }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--card)',
                          color: 'var(--foreground)',
                          fontFamily: 'var(--font-body)',
                          fontSize: '11px',
                          fontWeight: 500,
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setMenuOpen(false); setConfirmDelete(false); onDelete() }}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 'var(--radius-sm)',
                          border: 'none',
                          backgroundColor: 'var(--destructive)',
                          color: '#fff',
                          fontFamily: 'var(--font-body)',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Yes, Delete
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
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
