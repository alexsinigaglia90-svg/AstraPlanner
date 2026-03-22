'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, X } from 'lucide-react'
import { bouncy, scalePress } from '@/lib/motion'
import { getDeptColor } from '@/components/domain/process-card'

// ── Types ────────────────────────────────────────────────────────────────────

interface ProcessCardFormProps {
  initialValues?: { name: string; unit_of_measure: string; norm_uph: number }
  departmentColor: string
  onSave: (data: { name: string; unit_of_measure: string; norm_uph: number }) => void
  onCancel: () => void
}

const UOM_OPTIONS = [
  'orders',
  'order lines',
  'pallets',
  'cartons',
  'pieces',
  'units',
]

// ── Component ────────────────────────────────────────────────────────────────

export function ProcessCardForm({ initialValues, departmentColor, onSave, onCancel }: ProcessCardFormProps) {
  const c = getDeptColor(departmentColor)
  const [name, setName] = useState(initialValues?.name ?? '')
  const [uom, setUom] = useState(initialValues?.unit_of_measure ?? 'orders')
  const [normUph, setNormUph] = useState(initialValues?.norm_uph ?? 0)

  const canSave = name.trim().length > 0 && normUph > 0

  const handleSubmit = () => {
    if (!canSave) return
    onSave({ name: name.trim(), unit_of_measure: uom, norm_uph: normUph })
  }

  const selectStyle: React.CSSProperties = {
    flex: 1,
    padding: '8px 28px 8px 10px',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--card)',
    color: 'var(--foreground)',
    fontFamily: 'var(--font-body)',
    fontSize: '12px',
    outline: 'none',
    boxSizing: 'border-box',
    appearance: 'none' as const,
    cursor: 'pointer',
    backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 8px center',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.97 }}
      transition={bouncy}
      style={{
        backgroundColor: 'var(--card)',
        border: `2px solid ${c.main}`,
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--elevation-1)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
      }}
    >
      {/* Name input */}
      <input
        autoFocus
        type="text"
        placeholder="Process name..."
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel() }}
        style={{
          width: '100%',
          padding: '8px 10px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          backgroundColor: 'var(--card)',
          color: 'var(--foreground)',
          fontFamily: 'var(--font-display)',
          fontSize: '13px',
          fontWeight: 700,
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />

      {/* UOM select + norm input row */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <select
          value={uom}
          onChange={(e) => setUom(e.target.value)}
          style={selectStyle}
        >
          {UOM_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        <input
          type="number"
          min={0}
          value={normUph || ''}
          onChange={(e) => setNormUph(Number(e.target.value))}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel() }}
          placeholder="UPH"
          style={{
            width: '80px',
            padding: '8px 10px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--foreground)',
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            fontWeight: 700,
            textAlign: 'center',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Save + Cancel buttons */}
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
            padding: '8px 14px',
            borderRadius: 'var(--radius-sm)',
            border: 'none',
            background: `linear-gradient(135deg, ${c.main}, ${c.main}dd)`,
            color: '#fff',
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            fontWeight: 600,
            cursor: canSave ? 'pointer' : 'not-allowed',
            opacity: canSave ? 1 : 0.5,
          }}
        >
          <Save size={12} />
          Save
        </motion.button>

        <button
          onClick={onCancel}
          style={{
            padding: '8px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    </motion.div>
  )
}
