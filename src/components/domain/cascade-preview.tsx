'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { bouncy, gentle, snappy } from '@/lib/motion'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProcessChip {
  process_id: string
  process_name: string
  conversion_ratio: number
  calculated_volume: number
  override_volume: number | null
}

export interface CascadePreviewProps {
  demandTypeName: string
  volume: number
  processes: ProcessChip[]
  onOverrideChange: (process_id: string, volume: number | null) => void
  isExpanded: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

export function CascadePreview({
  demandTypeName,
  volume,
  processes,
  onOverrideChange,
  isExpanded,
}: CascadePreviewProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleChipClick = (chip: ProcessChip) => {
    setEditingId(chip.process_id)
    const current = chip.override_volume ?? chip.calculated_volume
    setEditValue(String(Math.round(current)))
  }

  const handleConfirm = (processId: string) => {
    const parsed = parseFloat(editValue)
    if (!isNaN(parsed) && parsed >= 0) {
      onOverrideChange(processId, parsed)
    }
    setEditingId(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent, processId: string) => {
    if (e.key === 'Enter') handleConfirm(processId)
    if (e.key === 'Escape') setEditingId(null)
  }

  const handleClearOverride = (e: React.MouseEvent, processId: string) => {
    e.stopPropagation()
    onOverrideChange(processId, null)
    setEditingId(null)
  }

  return (
    <AnimatePresence>
      {isExpanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={gentle}
          style={{ overflow: 'hidden' }}
        >
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: 'rgba(99,102,241,0.02)',
              borderTop: '1px solid var(--border)',
            }}
          >
            {/* Header */}
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--muted-foreground)',
                marginBottom: 8,
              }}
            >
              Cascade: {demandTypeName}{' '}
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500 }}>
                ({volume})
              </span>
            </div>

            {/* Chips row */}
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {processes.map((chip, idx) => {
                const isOverridden = chip.override_volume !== null
                const displayVolume = isOverridden
                  ? chip.override_volume!
                  : chip.calculated_volume
                const isEditing = editingId === chip.process_id

                return (
                  <motion.div
                    key={chip.process_id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{
                      ...bouncy,
                      delay: idx * 0.03,
                    }}
                    onClick={() => !isEditing && handleChipClick(chip)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 10px',
                      borderRadius: 8,
                      border: isOverridden
                        ? '1px solid rgba(249,115,22,0.3)'
                        : '1px solid transparent',
                      backgroundColor: isOverridden
                        ? 'rgba(249,115,22,0.06)'
                        : 'rgba(99,102,241,0.08)',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--foreground)',
                      userSelect: 'none',
                    }}
                  >
                    {/* Process name */}
                    <span style={{ fontWeight: 500 }}>{chip.process_name}:</span>

                    {isEditing ? (
                      <input
                        autoFocus
                        type="number"
                        min={0}
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => handleConfirm(chip.process_id)}
                        onKeyDown={(e) => handleKeyDown(e, chip.process_id)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: 56,
                          padding: '2px 4px',
                          borderRadius: 4,
                          border: '1px solid var(--primary)',
                          backgroundColor: 'var(--card)',
                          fontFamily: 'var(--font-mono)',
                          fontSize: 12,
                          color: 'var(--foreground)',
                          outline: 'none',
                          textAlign: 'right',
                        }}
                      />
                    ) : (
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                        {volume} × {chip.conversion_ratio} ={' '}
                        <span style={{ fontWeight: 600 }}>
                          {Math.round(displayVolume)}
                        </span>
                      </span>
                    )}

                    {/* Clear override button */}
                    {isOverridden && !isEditing && (
                      <motion.button
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={snappy}
                        onClick={(e) => handleClearOverride(e, chip.process_id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 16,
                          height: 16,
                          borderRadius: 8,
                          border: 'none',
                          backgroundColor: 'rgba(249,115,22,0.15)',
                          color: 'rgb(249,115,22)',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 10,
                          fontWeight: 700,
                          lineHeight: 1,
                        }}
                        aria-label={`Clear override for ${chip.process_name}`}
                      >
                        ×
                      </motion.button>
                    )}
                  </motion.div>
                )
              })}

              {processes.length === 0 && (
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--muted-foreground)',
                    fontStyle: 'italic',
                  }}
                >
                  Geen processen gekoppeld
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
