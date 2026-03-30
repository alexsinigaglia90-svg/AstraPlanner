'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Calendar } from 'lucide-react'
import { bouncy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'

// ── Types ────────────────────────────────────────────────────────────────────

interface CreatePlanWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onCreated: (planId: string) => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Returns the ISO date string (YYYY-MM-DD) of the coming Monday */
function nextMonday(): string {
  const d = new Date()
  const day = d.getDay() // 0=Sun, 1=Mon, …
  const daysUntilMonday = day === 0 ? 1 : 8 - day
  d.setDate(d.getDate() + daysUntilMonday)
  return d.toISOString().slice(0, 10)
}

/** Add `days` to an ISO date string, return ISO date string */
function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Returns ISO week number for a given date.
 * Uses the standard ISO 8601 algorithm.
 */
function isoWeek(isoDate: string): number {
  const d = new Date(isoDate)
  d.setHours(0, 0, 0, 0)
  // Thursday in the current week determines the year
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 -
        3 +
        ((week1.getDay() + 6) % 7)) /
        7,
    )
  )
}

/** Format a date as "d mmm yyyy" in Dutch locale */
function fmtDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString('nl-NL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** Build the preview label, e.g. "Week 14 t/m 17 (31 mrt – 27 apr 2026)" */
function buildPreview(startDate: string, weeks: number): string {
  const endDate = addDays(startDate, weeks * 7 - 1)
  const w1 = isoWeek(startDate)
  const w2 = isoWeek(endDate)
  const weekRange = w1 === w2 ? `Week ${w1}` : `Week ${w1} t/m ${w2}`
  return `${weekRange} (${fmtDate(startDate)} \u2013 ${fmtDate(endDate)})`
}

// ── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--card)',
  color: 'var(--foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--muted-foreground)',
}

// ── Component ────────────────────────────────────────────────────────────────

export function CreatePlanWizard({
  open,
  onClose,
  siteId,
  onCreated,
}: CreatePlanWizardProps) {
  const [startDate, setStartDate] = useState(nextMonday())
  const [weeks, setWeeks] = useState(4)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createDraft = trpc.planning.createDraft.useMutation()

  // Reset on open
  useEffect(() => {
    if (open) {
      setStartDate(nextMonday())
      setWeeks(4)
      setSaving(false)
      setError(null)
    }
  }, [open])

  const endDate = startDate ? addDays(startDate, weeks * 7 - 1) : ''
  const preview = startDate ? buildPreview(startDate, weeks) : ''

  const handleCreate = async () => {
    if (!startDate) return
    setSaving(true)
    setError(null)
    try {
      const data = await createDraft.mutateAsync({
        site_id: siteId,
        plan_period_start: startDate,
        plan_period_end: endDate,
      })
      onCreated(data.id)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Aanmaken mislukt')
      setSaving(false)
    }
  }

  const canCreate = !saving && Boolean(startDate)

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              backgroundColor: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(6px)',
            }}
          />

          {/* Modal — centering wrapper */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <motion.div
              key="modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={bouncy}
              style={{
                width: '100%',
                maxWidth: 440,
                backgroundColor: 'var(--card)',
                borderRadius: 16,
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                overflow: 'hidden',
                pointerEvents: 'auto',
              }}
            >
              {/* Header */}
              <div
                style={{
                  padding: '20px 24px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <h3
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 18,
                      fontWeight: 800,
                      color: 'var(--foreground)',
                      margin: 0,
                    }}
                  >
                    Nieuw plan
                  </h3>
                  <p
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--muted-foreground)',
                      margin: '2px 0 0',
                    }}
                  >
                    Planperiode instellen
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Header icon */}
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background:
                        'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Calendar size={16} style={{ color: 'var(--primary)' }} />
                  </div>

                  <button
                    onClick={onClose}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 28,
                      height: 28,
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      backgroundColor: 'var(--muted)',
                      color: 'var(--muted-foreground)',
                      cursor: 'pointer',
                    }}
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div
                style={{
                  padding: '24px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 18,
                }}
              >
                {/* Startweek */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>Startweek</label>
                  <input
                    autoFocus
                    type="date"
                    style={inputStyle}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>

                {/* Aantal weken */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={labelStyle}>Aantal weken</label>
                  <select
                    style={inputStyle}
                    value={weeks}
                    onChange={(e) => setWeeks(Number(e.target.value))}
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((w) => (
                      <option key={w} value={w}>
                        {w} {w === 1 ? 'week' : 'weken'}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Preview */}
                {preview && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(99,102,241,0.06)',
                      border: '1px solid rgba(99,102,241,0.15)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: 'var(--primary)',
                      fontWeight: 500,
                    }}
                  >
                    {preview}
                  </div>
                )}

                {/* Error */}
                {error && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(239,68,68,0.06)',
                      border: '1px solid rgba(239,68,68,0.15)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      color: 'var(--destructive)',
                    }}
                  >
                    {error}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: '16px 24px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <button
                  onClick={onClose}
                  style={{
                    padding: '9px 16px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Annuleren
                </button>

                <motion.button
                  variants={scalePress}
                  whileTap="press"
                  onClick={handleCreate}
                  disabled={!canCreate}
                  style={{
                    padding: '11px 24px',
                    borderRadius: 8,
                    border: 'none',
                    background: canCreate
                      ? 'linear-gradient(135deg, var(--primary), #8B5CF6)'
                      : 'var(--muted)',
                    color: canCreate ? '#fff' : 'var(--muted-foreground)',
                    fontFamily: 'var(--font-body)',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: canCreate ? 'pointer' : 'not-allowed',
                    opacity: saving ? 0.7 : 1,
                    boxShadow: canCreate
                      ? '0 4px 14px rgba(99,102,241,0.3)'
                      : 'none',
                  }}
                >
                  {saving ? 'Aanmaken...' : 'Aanmaken'}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
