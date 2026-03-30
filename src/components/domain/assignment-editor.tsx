'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Lock, Unlock, Trash2, CheckCircle } from 'lucide-react'
import { bouncy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useToast } from '@/components/domain/toast'

// ── Types ────────────────────────────────────────────────────────────────────

interface AssignmentEditorProps {
  open: boolean
  onClose: () => void
  planVersionId: string
  employeeId: string
  employeeName: string
  date: string            // "2026-04-07"
  shiftId: string         // shift pattern UUID
  shiftName: string       // "Ochtend"
  currentAssignment: {
    id: string
    process_id: string
    process_name: string
    assignment_source: 'optimizer' | 'locked'
  } | null
  processes: Array<{ id: string; name: string }>
  onSaved: () => void
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatDateNl(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  const day = d.getDate()
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const dayNames = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
  return `${dayNames[d.getDay()]} ${day} ${months[d.getMonth()]}`
}

// ── Component ────────────────────────────────────────────────────────────────

export function AssignmentEditor({
  open,
  onClose,
  planVersionId,
  employeeId,
  employeeName,
  date,
  shiftId,
  shiftName,
  currentAssignment,
  processes,
  onSaved,
}: AssignmentEditorProps) {
  const toast = useToast()
  const utils = trpc.useUtils()

  const [selectedProcessId, setSelectedProcessId] = useState('')
  const [busy, setBusy] = useState(false)

  const manualAssign = trpc.planning.manualAssign.useMutation()
  const removeAssignment = trpc.planning.removeAssignment.useMutation()
  const lockAssignment = trpc.planning.lockAssignment.useMutation()

  // Reset state on open
  useEffect(() => {
    if (open) {
      setSelectedProcessId('')
      setBusy(false)
    }
  }, [open])

  // ── Handlers ─────────────────────────────────────────────────────────────

  const invalidateAndClose = () => {
    utils.planning.getPlanVersion.invalidate({ id: planVersionId })
    onSaved()
    onClose()
  }

  const handleAssign = async () => {
    if (!selectedProcessId) return
    setBusy(true)
    try {
      await manualAssign.mutateAsync({
        plan_version_id: planVersionId,
        employee_id: employeeId,
        process_id: selectedProcessId,
        time_slot_id: shiftId,
        shift_pattern_id: shiftId,
      })
      invalidateAndClose()
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Toewijzing mislukt')
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!currentAssignment) return
    setBusy(true)
    try {
      await removeAssignment.mutateAsync({ assignment_id: currentAssignment.id })
      invalidateAndClose()
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Verwijderen mislukt')
      setBusy(false)
    }
  }

  const handleToggleLock = async () => {
    if (!currentAssignment) return
    setBusy(true)
    try {
      await lockAssignment.mutateAsync({ assignment_id: currentAssignment.id })
      invalidateAndClose()
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Vergrendeling mislukt')
      setBusy(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const isLocked = currentAssignment?.assignment_source === 'locked'

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="ae-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 9998,
              backgroundColor: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(6px)',
            }}
          />

          {/* Centering wrapper */}
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <motion.div
              key="ae-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={bouncy}
              style={{
                width: '100%', maxWidth: 380,
                backgroundColor: 'var(--card)',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                overflow: 'hidden',
                pointerEvents: 'auto',
              }}
            >
              {/* ── Header ─────────────────────────────────────────────── */}
              <div style={{
                padding: '18px 20px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <h3 style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 16,
                    fontWeight: 800,
                    color: 'var(--foreground)',
                    margin: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {employeeName}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--muted-foreground)',
                    margin: '2px 0 0',
                  }}>
                    {formatDateNl(date)} &middot; {shiftName}
                  </p>
                </div>
                <button onClick={onClose} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                  border: 'none', backgroundColor: 'var(--muted)',
                  color: 'var(--muted-foreground)', cursor: 'pointer', marginLeft: 12,
                  flexShrink: 0,
                }}>
                  <X size={14} />
                </button>
              </div>

              {/* ── Body ──────────────────────────────────────────────── */}
              <div style={{ padding: '20px' }}>

                {currentAssignment ? (
                  /* ── Editing existing assignment ────────────────────── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Current process info */}
                    <div style={{
                      padding: '12px 14px',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'rgba(99,102,241,0.06)',
                      border: '1px solid rgba(99,102,241,0.12)',
                    }}>
                      <div style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--muted-foreground)',
                        marginBottom: 4,
                      }}>
                        Huidig proces
                      </div>
                      <div style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 15,
                        fontWeight: 700,
                        color: 'var(--foreground)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        {currentAssignment.process_name}
                        {isLocked && (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-full)',
                            backgroundColor: 'rgba(245,158,11,0.12)',
                            color: '#D97706',
                            fontFamily: 'var(--font-body)',
                            fontSize: 10,
                            fontWeight: 700,
                            letterSpacing: '0.03em',
                          }}>
                            <Lock size={10} />
                            Vergrendeld
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 10 }}>
                      {/* Remove */}
                      <motion.button
                        variants={scalePress}
                        whileTap="press"
                        onClick={handleRemove}
                        disabled={busy}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: '1px solid rgba(239,68,68,0.4)',
                          backgroundColor: 'transparent',
                          color: '#EF4444',
                          fontFamily: 'var(--font-body)',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: busy ? 'not-allowed' : 'pointer',
                          opacity: busy ? 0.5 : 1,
                        }}
                      >
                        <Trash2 size={14} />
                        Verwijderen
                      </motion.button>

                      {/* Lock / Unlock toggle */}
                      <motion.button
                        variants={scalePress}
                        whileTap="press"
                        onClick={handleToggleLock}
                        disabled={busy}
                        style={{
                          flex: 1,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                          padding: '10px 14px',
                          borderRadius: 8,
                          border: 'none',
                          background: isLocked
                            ? 'linear-gradient(135deg, #F59E0B, #EA580C)'
                            : 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                          color: '#fff',
                          fontFamily: 'var(--font-body)',
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: busy ? 'not-allowed' : 'pointer',
                          opacity: busy ? 0.5 : 1,
                          boxShadow: isLocked
                            ? '0 4px 14px rgba(245,158,11,0.3)'
                            : '0 4px 14px rgba(99,102,241,0.3)',
                        }}
                      >
                        {isLocked ? <Unlock size={14} /> : <Lock size={14} />}
                        {isLocked ? 'Ontgrendelen' : 'Vergrendelen'}
                      </motion.button>
                    </div>
                  </div>
                ) : (
                  /* ── New assignment ─────────────────────────────────── */
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                    {/* Process select */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 11,
                        fontWeight: 600,
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--muted-foreground)',
                      }}>
                        Proces
                      </label>
                      <select
                        value={selectedProcessId}
                        onChange={(e) => setSelectedProcessId(e.target.value)}
                        style={{
                          width: '100%',
                          padding: '10px 12px',
                          borderRadius: 'var(--radius-sm)',
                          border: '1px solid var(--border)',
                          backgroundColor: 'var(--card)',
                          color: 'var(--foreground)',
                          fontFamily: 'var(--font-body)',
                          fontSize: 14,
                          outline: 'none',
                          boxSizing: 'border-box' as const,
                          cursor: 'pointer',
                        }}
                      >
                        <option value="">-- Selecteer proces --</option>
                        {processes.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    {/* Assign button */}
                    <motion.button
                      variants={scalePress}
                      whileTap="press"
                      onClick={handleAssign}
                      disabled={busy || !selectedProcessId}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 6,
                        width: '100%',
                        padding: '11px 20px',
                        borderRadius: 8,
                        border: 'none',
                        background: selectedProcessId
                          ? 'linear-gradient(135deg, #10b981, #059669)'
                          : 'var(--muted)',
                        color: selectedProcessId ? '#fff' : 'var(--muted-foreground)',
                        fontFamily: 'var(--font-body)',
                        fontSize: 14,
                        fontWeight: 700,
                        cursor: busy || !selectedProcessId ? 'not-allowed' : 'pointer',
                        opacity: busy ? 0.7 : 1,
                        boxShadow: selectedProcessId ? '0 4px 14px rgba(16,185,129,0.3)' : 'none',
                      }}
                    >
                      <CheckCircle size={15} />
                      {busy ? 'Toewijzen...' : 'Toewijzen'}
                    </motion.button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
