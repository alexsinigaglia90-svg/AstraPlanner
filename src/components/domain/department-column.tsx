'use client'

import { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Plus, Pencil, Palette, Trash2 } from 'lucide-react'
import { containerStagger, fadeInUp, bouncy } from '@/lib/motion'
import { ProcessCard, getDeptColor, DEPT_COLORS } from '@/components/domain/process-card'
import { ProcessCardForm } from '@/components/domain/process-card-form'
import { SmartIcon } from '@/components/domain/smart-icon'
import { GlassDropdown, type GlassDropdownOption } from '@/components/domain/glass-dropdown'

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
  const [renaming, setRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(department.name)

  const renameRef = useRef<HTMLInputElement>(null)

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
        <GlassDropdown
          options={[
            { label: 'Rename', icon: <Pencil size={13} />, onClick: () => { setRenaming(true); setRenameValue(department.name) } },
            ...Object.keys(DEPT_COLORS)
              .filter((key) => key === department.color || !usedColors.includes(key))
              .map((key): GlassDropdownOption => ({
                label: key.charAt(0).toUpperCase() + key.slice(1),
                icon: <div style={{ width: 13, height: 13, borderRadius: '50%', backgroundColor: DEPT_COLORS[key]!.main, border: department.color === key ? '2px solid var(--foreground)' : '2px solid transparent' }} />,
                onClick: () => onChangeColor(department.id, department.name, key),
              })),
            { label: 'Delete', icon: <Trash2 size={13} />, onClick: () => onDeleteDepartment(department.id), variant: 'destructive', holdToConfirm: true },
          ]}
        />
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
