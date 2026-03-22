'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { bouncy, scalePress } from '@/lib/motion'
import { getDeptColor, DEPT_COLORS } from '@/components/domain/process-card'

// ── Types ────────────────────────────────────────────────────────────────────

interface DepartmentCreateFormProps {
  onSave: (data: { name: string; color: string }) => void
  onCancel: () => void
  usedColors?: string[]
}

// ── Component ────────────────────────────────────────────────────────────────

export function DepartmentCreateForm({ onSave, onCancel, usedColors = [] }: DepartmentCreateFormProps) {
  const allColorKeys = Object.keys(DEPT_COLORS)
  const availableColors = allColorKeys.filter((k) => !usedColors.includes(k))
  const [name, setName] = useState('')
  const [color, setColor] = useState(availableColors[0] ?? allColorKeys[0] ?? 'indigo')
  const c = getDeptColor(color)
  const canSave = name.trim().length > 0

  const handleSubmit = () => {
    if (!canSave) return
    onSave({ name: name.trim(), color })
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.95 }}
      transition={bouncy}
      style={{
        width: '100%',
        backgroundColor: c.bg,
        border: `2px solid ${c.main}`,
        borderRadius: '14px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        alignSelf: 'flex-start',
      }}
    >
      {/* Color picker */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--muted-foreground)',
          }}
        >
          Color
        </span>
        <div style={{ display: 'flex', gap: '8px' }}>
          {availableColors.map((key) => {
            const val = DEPT_COLORS[key]!
            return (
              <button
                key={key}
                onClick={() => setColor(key)}
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: val.main,
                  border: color === key ? `2.5px solid var(--foreground)` : '2.5px solid transparent',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'border-color 0.15s',
                  outline: color === key ? `2px solid ${val.main}40` : 'none',
                  outlineOffset: '2px',
                }}
              />
            )
          })}
          {availableColors.length === 0 && (
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)' }}>
              All colors in use
            </span>
          )}
        </div>
      </div>

      {/* Name input */}
      <input
        autoFocus
        type="text"
        placeholder="Department name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel() }}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${c.border}`,
          backgroundColor: 'var(--card)',
          color: 'var(--foreground)',
          fontFamily: 'var(--font-display)',
          fontSize: '13px',
          fontWeight: 700,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {/* Create + Cancel buttons */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={handleSubmit}
          disabled={!canSave}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            padding: '9px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: `linear-gradient(135deg, ${c.main}, ${c.main}dd)`,
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.5,
          }}
        >
          Create
        </motion.button>

        <button
          onClick={onCancel}
          style={{
            padding: '9px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>

      {/* Placeholder add process button (visual only) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '10px',
          borderRadius: 'var(--radius-md)',
          border: `1.5px dashed ${c.border}`,
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          fontWeight: 600,
          opacity: 0.4,
        }}
      >
        <Plus size={14} />
        Add Process
      </div>
    </motion.div>
  )
}
