'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MoreVertical, Plus } from 'lucide-react'
import { containerStagger, fadeInUp, bouncy } from '@/lib/motion'
import { ProcessCard, getDeptColor, DEPT_COLORS } from '@/components/domain/process-card'
import { ProcessCardForm } from '@/components/domain/process-card-form'
import { SmartIcon } from '@/components/domain/smart-icon'

// ── Types ────────────────────────────────────────────────────────────────────

interface Process {
  id: string
  name: string
  unit_of_measure: string
  norm_uph: number
}

interface DepartmentColumnProps {
  department: { id: string; name: string; color: string }
  processes: Process[]
  onAddProcess: (data: { name: string; unit_of_measure: string; norm_uph: number }) => void
  onEditProcess: (id: string, data: { name: string; unit_of_measure: string; norm_uph: number }) => void
  onDeleteProcess: (id: string) => void
  onRenameDepartment: (id: string, name: string, color: string) => void
  onChangeColor: (id: string, name: string, color: string) => void
  onDeleteDepartment: (id: string) => void
  onOpenWizard?: (processId?: string) => void
  usedColors?: string[]
}

// ── Component ────────────────────────────────────────────────────────────────

export function DepartmentColumn({
  department,
  processes,
  onAddProcess,
  onEditProcess,
  onDeleteProcess,
  onRenameDepartment,
  onChangeColor,
  onDeleteDepartment,
  onOpenWizard,
  usedColors = [],
}: DepartmentColumnProps) {
  const c = getDeptColor(department.color)

  const [addingMode, setAddingMode] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; right: number }>({ top: 0, right: 0 })
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(department.name)
  const [holdProgress, setHoldProgress] = useState(0)
  const holdTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const HOLD_DURATION = 1200 // ms

  const menuRef = useRef<HTMLDivElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // Focus rename input
  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus()
      renameRef.current.select()
    }
  }, [renaming])

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim()
    if (trimmed && trimmed !== department.name) {
      onRenameDepartment(department.id, trimmed, department.color)
    }
    setRenaming(false)
  }

  return (
    <div
      style={{
        width: '100%',
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '14px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        alignSelf: 'flex-start',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Department icon */}
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: `${c.main}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <SmartIcon name={department.name} type="department" color={c.main} size={14} />
        </div>

        {/* Name or rename input */}
        {renaming ? (
          <input
            ref={renameRef}
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') { setRenaming(false); setRenameValue(department.name) } }}
            onBlur={handleRenameSubmit}
            style={{
              flex: 1,
              padding: '2px 6px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${c.main}`,
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              fontFamily: 'var(--font-display)',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        ) : (
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '12px',
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--foreground)',
              flex: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {department.name}
          </span>
        )}

        {/* Process count badge */}
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            color: c.main,
            backgroundColor: `${c.main}18`,
            padding: '1px 7px',
            borderRadius: 'var(--radius-full)',
            flexShrink: 0,
          }}
        >
          {processes.length}
        </span>

        {/* Menu button */}
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={(e) => {
              if (!menuOpen) {
                const rect = e.currentTarget.getBoundingClientRect()
                setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
              }
              setMenuOpen(!menuOpen)
            }}
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

          {/* Dropdown — fixed position to escape column overflow */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                style={{
                  position: 'fixed',
                  top: menuPos.top,
                  right: menuPos.right,
                  backgroundColor: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  boxShadow: 'var(--elevation-4, 0 8px 30px rgba(0,0,0,0.12))',
                  minWidth: '160px',
                  zIndex: 9999,
                }}
              >
                {/* Rename */}
                <button
                  onClick={() => { setMenuOpen(false); setRenaming(true); setRenameValue(department.name) }}
                  style={{
                    display: 'block',
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
                  Rename
                </button>

                {/* Change Color */}
                <div style={{ padding: '6px 12px', borderTop: '1px solid var(--border)' }}>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '11px',
                      fontWeight: 600,
                      color: 'var(--muted-foreground)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.06em',
                    }}
                  >
                    Color
                  </span>
                  <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                    {Object.keys(DEPT_COLORS)
                      .filter((key) => key === department.color || !usedColors.includes(key))
                      .map((key) => {
                        const val = DEPT_COLORS[key]!
                        return (
                          <button
                            key={key}
                            onClick={() => { setMenuOpen(false); onChangeColor(department.id, department.name, key) }}
                            style={{
                              width: '18px',
                              height: '18px',
                              borderRadius: '50%',
                              backgroundColor: val.main,
                              border: department.color === key ? '2px solid var(--foreground)' : '2px solid transparent',
                              cursor: 'pointer',
                              padding: 0,
                              transition: 'border-color 0.15s',
                            }}
                          />
                        )
                      })}
                  </div>
                </div>

                {/* Hold to Delete */}
                <button
                  onMouseDown={() => {
                    setHoldProgress(0)
                    const start = Date.now()
                    holdTimerRef.current = setInterval(() => {
                      const elapsed = Date.now() - start
                      const pct = Math.min(elapsed / HOLD_DURATION, 1)
                      setHoldProgress(pct)
                      if (pct >= 1) {
                        if (holdTimerRef.current) clearInterval(holdTimerRef.current)
                        holdTimerRef.current = null
                        setMenuOpen(false)
                        setHoldProgress(0)
                        onDeleteDepartment(department.id)
                      }
                    }, 16)
                  }}
                  onMouseUp={() => {
                    if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
                    setHoldProgress(0)
                  }}
                  onMouseLeave={() => {
                    if (holdTimerRef.current) { clearInterval(holdTimerRef.current); holdTimerRef.current = null }
                    setHoldProgress(0)
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    borderTop: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: 'var(--destructive)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    position: 'relative',
                    overflow: 'hidden',
                    userSelect: 'none',
                  }}
                >
                  {/* Progress fill */}
                  {holdProgress > 0 && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: 0,
                        bottom: 0,
                        width: `${holdProgress * 100}%`,
                        backgroundColor: 'rgba(239,68,68,0.12)',
                        transition: 'none',
                      }}
                    />
                  )}
                  <span style={{ position: 'relative', zIndex: 1 }}>
                    {holdProgress > 0 ? 'Hold to delete...' : 'Delete'}
                  </span>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Process cards */}
      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        {processes.map((proc) => (
          <ProcessCard
            key={proc.id}
            process={proc}
            color={department.color}
            onEdit={() => onOpenWizard ? onOpenWizard(proc.id) : setEditingId(proc.id)}
            onDelete={() => onDeleteProcess(proc.id)}
          />
        ))}
      </motion.div>

      {/* Add process button */}
      <motion.button
        onClick={() => onOpenWizard ? onOpenWizard() : setAddingMode(true)}
        whileHover={{ backgroundColor: `${c.main}10` }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '10px',
          borderRadius: 'var(--radius-md)',
          border: `1.5px dashed ${c.border}`,
          backgroundColor: 'transparent',
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <Plus size={14} />
        Add Process
      </motion.button>
    </div>
  )
}
