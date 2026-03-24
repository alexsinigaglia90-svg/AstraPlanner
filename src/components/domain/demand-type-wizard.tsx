'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingUp, Link2, CheckCircle2 } from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { SmartIcon } from './smart-icon'

// -- Types -------------------------------------------------------------------

interface DemandTypeWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onSaved: () => void
  editId?: string
}

interface ProcessSelection {
  process_id: string
  conversion_ratio: number
}

// -- Constants ---------------------------------------------------------------

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

const TOTAL_STEPS = 3

// -- Component ---------------------------------------------------------------

export function DemandTypeWizard({ open, onClose, siteId, onSaved, editId }: DemandTypeWizardProps) {
  const utils = trpc.useUtils()
  const upsert = trpc.demand.upsertDemandType.useMutation()
  const processes = trpc.org.listProcesses.useQuery({ site_id: siteId }, { enabled: open && siteId.length > 0 })
  const existingTypes = trpc.demand.listDemandTypes.useQuery({}, { enabled: open && !!editId })

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [naam, setNaam] = useState('')
  const [eenheid, setEenheid] = useState('')
  const [selectedProcesses, setSelectedProcesses] = useState<Map<string, number>>(new Map())

  // Reset on open / populate on edit
  useEffect(() => {
    if (!open) return
    setStep(1)
    setDirection(1)
    setSaving(false)
    setError(null)

    if (editId && existingTypes.data) {
      const existing = existingTypes.data.find((dt) => dt.id === editId)
      if (existing) {
        setNaam(existing.name)
        setEenheid(existing.unit_of_measure)
        const map = new Map<string, number>()
        for (const pm of existing.process_mappings) {
          map.set(pm.process_id, pm.conversion_ratio)
        }
        setSelectedProcesses(map)
        return
      }
    }
    setNaam('')
    setEenheid('')
    setSelectedProcesses(new Map())
  }, [open, editId, existingTypes.data])

  // -- Derived ---------------------------------------------------------------

  const allProcesses = processes.data ?? []

  const canStep1 = naam.trim().length > 0 && eenheid.trim().length > 0
  const canStep2 = selectedProcesses.size > 0

  // -- Handlers --------------------------------------------------------------

  const toggleProcess = (id: string) => {
    setSelectedProcesses((prev) => {
      const next = new Map(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.set(id, 1.0)
      }
      return next
    })
  }

  const updateRatio = (id: string, ratio: number) => {
    setSelectedProcesses((prev) => {
      const next = new Map(prev)
      next.set(id, ratio)
      return next
    })
  }

  const goTo = (target: number) => {
    setDirection(target > step ? 1 : -1)
    setStep(target)
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const mappings: ProcessSelection[] = []
      selectedProcesses.forEach((ratio, pid) => {
        mappings.push({ process_id: pid, conversion_ratio: ratio })
      })

      await upsert.mutateAsync({
        ...(editId ? { id: editId } : {}),
        name: naam.trim(),
        unit_of_measure: eenheid.trim(),
        process_mappings: mappings,
      })

      await utils.demand.listDemandTypes.invalidate()
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
      setSaving(false)
    }
  }

  // -- Render ----------------------------------------------------------------

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="dt-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed', inset: 0, zIndex: 9998,
              backgroundColor: 'rgba(0,0,0,0.3)',
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
              key="dt-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={bouncy}
              style={{
                width: '100%', maxWidth: 520,
                backgroundColor: 'var(--card)',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                overflow: 'hidden',
                pointerEvents: 'auto',
              }}
            >
              {/* Header */}
              <div style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <h3 style={{
                    fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800,
                    color: 'var(--foreground)', margin: 0,
                  }}>
                    {editId ? 'Demand Type Bewerken' : 'Nieuw Demand Type'}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 12,
                    color: 'var(--muted-foreground)', margin: '2px 0 0',
                  }}>
                    {step === 1 ? 'Naam & Eenheid' : step === 2 ? 'Koppel Processen' : 'Review & Opslaan'}
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {/* Step dots */}
                  <div style={{ display: 'flex', gap: 6 }}>
                    {Array.from({ length: TOTAL_STEPS }, (_, i) => (
                      <div
                        key={i}
                        style={{
                          width: 24, height: 4, borderRadius: 2,
                          backgroundColor: step >= i + 1 ? 'var(--primary)' : 'var(--border)',
                          transition: 'background-color 200ms',
                        }}
                      />
                    ))}
                  </div>
                  <button onClick={onClose} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: 'var(--radius-sm)',
                    border: 'none', backgroundColor: 'var(--muted)',
                    color: 'var(--muted-foreground)', cursor: 'pointer', marginLeft: 8,
                  }}>
                    <X size={14} />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div style={{ padding: '24px', minHeight: 300, position: 'relative', overflow: 'hidden' }}>
                <AnimatePresence mode="wait" custom={direction}>

                  {/* ── Step 1: Naam & Eenheid ────────────────────────── */}
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      custom={direction}
                      initial={{ x: direction > 0 ? 40 : -40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: direction > 0 ? -40 : 40, opacity: 0 }}
                      transition={snappy}
                      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <TrendingUp size={18} style={{ color: 'var(--primary)' }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={labelStyle}>
                          Naam <span style={{ color: 'var(--destructive)' }}>*</span>
                        </label>
                        <input
                          autoFocus
                          style={inputStyle}
                          value={naam}
                          onChange={(e) => setNaam(e.target.value)}
                          placeholder="bijv. Outbound Orders, Inbound Pallets"
                        />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={labelStyle}>
                          Eenheid <span style={{ color: 'var(--destructive)' }}>*</span>
                        </label>
                        <input
                          style={inputStyle}
                          value={eenheid}
                          onChange={(e) => setEenheid(e.target.value)}
                          placeholder="bijv. orders, pallets, stuks"
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* ── Step 2: Koppel Processen ──────────────────────── */}
                  {step === 2 && (
                    <motion.div
                      key="step2"
                      custom={direction}
                      initial={{ x: direction > 0 ? 40 : -40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: direction > 0 ? -40 : 40, opacity: 0 }}
                      transition={snappy}
                      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Link2 size={18} style={{ color: '#10b981' }} />
                      </div>

                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: 13,
                        color: 'var(--muted-foreground)', margin: 0,
                      }}>
                        Selecteer processen en stel de conversieratio in.
                      </p>

                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 8,
                        maxHeight: 260, overflowY: 'auto',
                        paddingRight: 4,
                      }}>
                        {processes.isLoading && (
                          <div style={{
                            fontFamily: 'var(--font-body)', fontSize: 13,
                            color: 'var(--muted-foreground)', padding: 16, textAlign: 'center',
                          }}>
                            Laden...
                          </div>
                        )}

                        {allProcesses.length === 0 && !processes.isLoading && (
                          <div style={{
                            fontFamily: 'var(--font-body)', fontSize: 13,
                            color: 'var(--muted-foreground)', padding: 16, textAlign: 'center',
                          }}>
                            Geen processen gevonden voor deze site. Maak eerst processen aan via het Processen scherm.
                          </div>
                        )}

                        {allProcesses.map((proc) => {
                          const isSelected = selectedProcesses.has(proc.id)
                          const ratio = selectedProcesses.get(proc.id) ?? 1.0

                          return (
                            <motion.div
                              key={proc.id}
                              whileHover={{ y: -2, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                              transition={snappy}
                              onClick={() => toggleProcess(proc.id)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px',
                                borderRadius: 12,
                                border: isSelected
                                  ? '2px solid var(--primary)'
                                  : '1px solid var(--border)',
                                backgroundColor: isSelected
                                  ? 'rgba(99,102,241,0.06)'
                                  : 'var(--card)',
                                cursor: 'pointer',
                                userSelect: 'none',
                                transition: 'border-color 150ms, background-color 150ms',
                              }}
                            >
                              <SmartIcon name={proc.name} type="process" color="var(--primary)" size={18} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontFamily: 'var(--font-display)', fontSize: 13,
                                  fontWeight: 600, color: 'var(--foreground)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {proc.name}
                                </div>
                                {proc.code && (
                                  <div style={{
                                    fontFamily: 'var(--font-mono)', fontSize: 10,
                                    color: 'var(--muted-foreground)',
                                  }}>
                                    {proc.code}
                                  </div>
                                )}
                              </div>

                              {isSelected && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                                >
                                  <span style={{
                                    fontFamily: 'var(--font-body)', fontSize: 10,
                                    color: 'var(--muted-foreground)', whiteSpace: 'nowrap',
                                  }}>
                                    1 {eenheid || 'eenheid'} =
                                  </span>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min="0.01"
                                    value={ratio}
                                    onChange={(e) => updateRatio(proc.id, Number(e.target.value) || 1)}
                                    style={{
                                      width: 80,
                                      padding: '6px 8px',
                                      borderRadius: 'var(--radius-sm)',
                                      border: '1px solid var(--border)',
                                      backgroundColor: 'var(--card)',
                                      color: 'var(--foreground)',
                                      fontFamily: 'var(--font-mono)',
                                      fontSize: 13,
                                      textAlign: 'center',
                                      outline: 'none',
                                      boxSizing: 'border-box',
                                    }}
                                  />
                                </div>
                              )}
                            </motion.div>
                          )
                        })}
                      </div>

                      {!canStep2 && allProcesses.length > 0 && (
                        <div style={{
                          fontFamily: 'var(--font-body)', fontSize: 12,
                          color: 'var(--muted-foreground)', fontStyle: 'italic',
                        }}>
                          Selecteer minimaal 1 proces om verder te gaan.
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Step 3: Review & Opslaan ──────────────────────── */}
                  {step === 3 && (
                    <motion.div
                      key="step3"
                      custom={direction}
                      initial={{ x: direction > 0 ? 40 : -40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: direction > 0 ? -40 : 40, opacity: 0 }}
                      transition={snappy}
                      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <CheckCircle2 size={18} style={{ color: 'var(--primary)' }} />
                      </div>

                      {/* Summary card */}
                      <div style={{
                        borderRadius: 12, border: '1px solid var(--border)',
                        backgroundColor: 'rgba(99,102,241,0.02)', overflow: 'hidden',
                      }}>
                        {/* Name + unit row */}
                        <div style={{
                          padding: '14px 16px',
                          borderBottom: '1px solid var(--border)',
                          display: 'flex', alignItems: 'baseline', gap: 8,
                        }}>
                          <span style={{
                            fontFamily: 'var(--font-display)', fontSize: 16,
                            fontWeight: 700, color: 'var(--foreground)',
                          }}>
                            {naam}
                          </span>
                          <span style={{
                            fontFamily: 'var(--font-mono)', fontSize: 12,
                            color: 'var(--muted-foreground)',
                          }}>
                            ({eenheid})
                          </span>
                        </div>

                        {/* Linked processes */}
                        <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <span style={{
                            ...labelStyle,
                            fontSize: 10,
                          }}>
                            Gekoppelde Processen ({selectedProcesses.size})
                          </span>
                          {Array.from(selectedProcesses.entries()).map(([pid, ratio]) => {
                            const proc = allProcesses.find((p) => p.id === pid)
                            if (!proc) return null
                            return (
                              <div
                                key={pid}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8,
                                  padding: '8px 10px', borderRadius: 8,
                                  backgroundColor: 'var(--card)',
                                  border: '1px solid var(--border)',
                                }}
                              >
                                <SmartIcon name={proc.name} type="process" color="var(--primary)" size={16} />
                                <span style={{
                                  fontFamily: 'var(--font-body)', fontSize: 13,
                                  fontWeight: 500, color: 'var(--foreground)', flex: 1,
                                }}>
                                  {proc.name}
                                </span>
                                <span style={{
                                  fontFamily: 'var(--font-mono)', fontSize: 12,
                                  color: 'var(--muted-foreground)',
                                }}>
                                  1:{ratio}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {error && (
                        <div style={{
                          padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                          fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--destructive)',
                        }}>
                          {error}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                display: 'flex', justifyContent: 'space-between',
              }}>
                {step === 1 && (
                  <>
                    <button onClick={onClose} style={{
                      padding: '9px 16px', borderRadius: 8,
                      border: '1px solid var(--border)', backgroundColor: 'transparent',
                      color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)',
                      fontSize: 13, cursor: 'pointer',
                    }}>
                      Annuleren
                    </button>
                    <motion.button
                      variants={scalePress} whileTap="press"
                      onClick={() => goTo(2)}
                      disabled={!canStep1}
                      style={{
                        padding: '9px 20px', borderRadius: 8,
                        border: 'none',
                        background: canStep1 ? 'linear-gradient(135deg, var(--primary), #8B5CF6)' : 'var(--muted)',
                        color: canStep1 ? '#fff' : 'var(--muted-foreground)',
                        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                        cursor: canStep1 ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Volgende &rarr;
                    </motion.button>
                  </>
                )}

                {step === 2 && (
                  <>
                    <button onClick={() => goTo(1)} style={{
                      padding: '9px 16px', borderRadius: 8,
                      border: '1px solid var(--border)', backgroundColor: 'transparent',
                      color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)',
                      fontSize: 13, cursor: 'pointer',
                    }}>
                      &larr; Vorige
                    </button>
                    <motion.button
                      variants={scalePress} whileTap="press"
                      onClick={() => goTo(3)}
                      disabled={!canStep2}
                      style={{
                        padding: '9px 20px', borderRadius: 8,
                        border: 'none',
                        background: canStep2 ? 'linear-gradient(135deg, var(--primary), #8B5CF6)' : 'var(--muted)',
                        color: canStep2 ? '#fff' : 'var(--muted-foreground)',
                        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                        cursor: canStep2 ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Volgende &rarr;
                    </motion.button>
                  </>
                )}

                {step === 3 && (
                  <>
                    <button onClick={() => goTo(2)} style={{
                      padding: '9px 16px', borderRadius: 8,
                      border: '1px solid var(--border)', backgroundColor: 'transparent',
                      color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)',
                      fontSize: 13, cursor: 'pointer',
                    }}>
                      &larr; Vorige
                    </button>
                    <motion.button
                      variants={scalePress} whileTap="press"
                      onClick={handleSave}
                      disabled={saving}
                      style={{
                        padding: '11px 24px', borderRadius: 8,
                        border: 'none',
                        background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                        color: '#fff', fontFamily: 'var(--font-body)',
                        fontSize: 14, fontWeight: 700,
                        cursor: saving ? 'not-allowed' : 'pointer',
                        opacity: saving ? 0.7 : 1,
                        boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                      }}
                    >
                      {saving ? 'Opslaan...' : 'Opslaan'}
                    </motion.button>
                  </>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
