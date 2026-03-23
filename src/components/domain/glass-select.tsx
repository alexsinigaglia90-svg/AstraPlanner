'use client'

import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GlassSelectOption {
  value: string
  label: string
  icon?: React.ReactNode
}

interface GlassSelectProps {
  value: string
  onChange: (value: string) => void
  options: GlassSelectOption[]
  placeholder?: string
  /** Label shown above the select */
  label?: string
  required?: boolean
}

// ── Component ────────────────────────────────────────────────────────────────

export function GlassSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  label,
  required,
}: GlassSelectProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => o.value === value)

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: MouseEvent) => {
      if (triggerRef.current && triggerRef.current.contains(e.target as Node)) return
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  // Close on escape
  useEffect(() => {
    if (!isOpen) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen])

  const handleToggle = () => {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setMenuPos({ top: rect.bottom + 4, left: rect.left, width: rect.width })
    }
    setIsOpen(!isOpen)
  }

  const handleSelect = (val: string) => {
    onChange(val)
    setIsOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
        }}>
          {label}
          {required && <span style={{ color: 'var(--destructive)', marginLeft: 2 }}>*</span>}
        </label>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={handleToggle}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 'var(--radius-sm)',
          border: `1px solid ${isOpen ? 'var(--primary)' : 'var(--border)'}`,
          backgroundColor: 'var(--card)',
          color: selectedOption ? 'var(--foreground)' : 'var(--muted-foreground)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          outline: 'none',
          transition: 'border-color 0.15s',
          boxSizing: 'border-box',
        }}
      >
        {selectedOption?.icon && <span style={{ display: 'flex', flexShrink: 0 }}>{selectedOption.icon}</span>}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {selectedOption?.label ?? placeholder}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.25, type: 'spring', stiffness: 400, damping: 25 }}
          style={{ display: 'flex', flexShrink: 0, color: 'var(--muted-foreground)' }}
        >
          <ChevronDown size={14} />
        </motion.span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ y: -5, scale: 0.97, opacity: 0, filter: 'blur(8px)' }}
            animate={{ y: 0, scale: 1, opacity: 1, filter: 'blur(0px)' }}
            exit={{ y: -5, scale: 0.97, opacity: 0, filter: 'blur(8px)' }}
            transition={{ duration: 0.2, type: 'spring', stiffness: 350, damping: 28 }}
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              zIndex: 9999,
              maxHeight: 240,
              overflowY: 'auto',
              padding: 4,
              borderRadius: 12,
              backgroundColor: 'var(--card)',
              border: '1px solid var(--border)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
              display: 'flex',
              flexDirection: 'column',
              gap: 1,
            }}
          >
            {options.map((opt, idx) => {
              const isSelected = opt.value === value
              return (
                <motion.button
                  key={opt.value}
                  initial={{ opacity: 0, x: 6, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                  transition={{
                    duration: 0.15,
                    delay: idx * 0.02,
                    type: 'spring',
                    stiffness: 400,
                    damping: 30,
                  }}
                  whileHover={{ backgroundColor: 'rgba(99,102,241,0.06)' }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleSelect(opt.value)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: isSelected ? 'rgba(99,102,241,0.08)' : 'transparent',
                    color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    fontWeight: isSelected ? 600 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {opt.icon && <span style={{ display: 'flex', flexShrink: 0 }}>{opt.icon}</span>}
                  <span style={{ flex: 1 }}>{opt.label}</span>
                  {isSelected && <Check size={13} style={{ color: 'var(--primary)', flexShrink: 0 }} />}
                </motion.button>
              )
            })}
            {options.length === 0 && (
              <div style={{ padding: '8px 12px', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--muted-foreground)' }}>
                No options
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
