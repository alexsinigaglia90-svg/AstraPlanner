'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import { snappy } from '@/lib/motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface DemandGridCellProps {
  value: number | null
  computedHours: number | null
  onChange: (value: number) => void
  isLoading?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

export function DemandGridCell({
  value,
  computedHours,
  onChange,
  isLoading = false,
}: DemandGridCellProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const isEmpty = value === null || value === undefined

  // Format number with locale
  const formatted = isEmpty ? '—' : value.toLocaleString('nl-NL')
  const hoursText = computedHours !== null && computedHours !== undefined
    ? `\u2192 ${computedHours.toLocaleString('nl-NL')}h`
    : null

  // Enter edit mode
  const handleClick = useCallback(() => {
    if (isLoading) return
    setDraft(isEmpty ? '' : String(value))
    setIsEditing(true)
  }, [isEmpty, value, isLoading])

  // Focus & select all on edit start
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Debounced onChange
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value
      setDraft(raw)

      if (debounceRef.current) clearTimeout(debounceRef.current)

      debounceRef.current = setTimeout(() => {
        const parsed = Number(raw.replace(/[^0-9.,\-]/g, '').replace(',', '.'))
        if (!isNaN(parsed) && raw.trim() !== '') {
          onChange(parsed)
        }
      }, 500)
    },
    [onChange],
  )

  // Commit on blur / Enter
  const commitAndClose = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const parsed = Number(draft.replace(/[^0-9.,\-]/g, '').replace(',', '.'))
    if (!isNaN(parsed) && draft.trim() !== '') {
      onChange(parsed)
    }
    setIsEditing(false)
  }, [draft, onChange])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commitAndClose()
      if (e.key === 'Escape') {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        setIsEditing(false)
      }
    },
    [commitAndClose],
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [])

  // ── Styles ───────────────────────────────────────────────────────────────

  const cellStyle: React.CSSProperties = {
    position: 'relative',
    background: isEmpty ? 'transparent' : 'rgba(99,102,241,0.06)',
    border: isEmpty
      ? '1.5px dashed rgba(249,115,22,0.3)'
      : '1px solid var(--border, #E0E7FF)',
    borderRadius: 8,
    padding: '4px 8px',
    minWidth: 80,
    cursor: isLoading ? 'wait' : 'pointer',
    opacity: isLoading ? 0.5 : 1,
    transition: 'border-color 150ms, box-shadow 150ms',
  }

  const valueStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'right' as const,
    color: isEmpty
      ? 'var(--muted-foreground, #64748B)'
      : 'var(--foreground, #1E1B4B)',
    lineHeight: 1.4,
  }

  const hoursStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 9,
    color: 'var(--muted-foreground, #64748B)',
    textAlign: 'right' as const,
    lineHeight: 1.2,
    marginTop: 1,
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 14,
    fontWeight: 500,
    textAlign: 'right' as const,
    color: 'var(--foreground, #1E1B4B)',
    background: 'transparent',
    border: 'none',
    outline: 'none',
    width: '100%',
    padding: 0,
    lineHeight: 1.4,
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (isEditing) {
    return (
      <motion.div
        style={{
          ...cellStyle,
          background: 'rgba(99,102,241,0.06)',
          border: '2px solid var(--ring, #6366F1)',
          boxShadow: '0 0 0 2px rgba(99,102,241,0.15)',
        }}
        initial={{ scale: 1 }}
        animate={{ scale: 1.02 }}
        transition={snappy}
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={handleChange}
          onBlur={commitAndClose}
          onKeyDown={handleKeyDown}
          style={inputStyle}
          aria-label="Demand volume"
        />
        {hoursText && <div style={hoursStyle}>{hoursText}</div>}
      </motion.div>
    )
  }

  return (
    <motion.div
      style={cellStyle}
      onClick={handleClick}
      whileHover={isLoading ? undefined : { scale: 1.02 }}
      whileTap={isLoading ? undefined : { scale: 0.98 }}
      transition={snappy}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
      aria-label={isEmpty ? 'Empty demand cell, click to edit' : `Demand: ${formatted}, click to edit`}
    >
      <div style={valueStyle}>{formatted}</div>
      {hoursText && <div style={hoursStyle}>{hoursText}</div>}
      {isLoading && (
        <motion.div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 8,
            background: 'linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.1) 50%, transparent 100%)',
          }}
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        />
      )}
    </motion.div>
  )
}
