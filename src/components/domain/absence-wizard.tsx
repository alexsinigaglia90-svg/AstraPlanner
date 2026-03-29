'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users, Calendar, CheckCircle2 } from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useToast } from '@/components/domain/toast'
import { useDemoStore } from '@/hooks/use-demo'
import { ImpactAlert } from './impact-alert'
import { ReplacementSuggestions } from './replacement-suggestions'

// -- Types -------------------------------------------------------------------

interface AbsenceWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onSaved: () => void
}

interface Employee {
  id: string
  first_name: string
  last_name: string
  department_id: string
  crew_id: string | null
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

const DURATION_OPTIONS = [
  { value: '1d', label: '1 dag', days: 1 },
  { value: 'few', label: 'Paar dagen', days: 3 },
  { value: '1w', label: '1 week', days: 7 },
  { value: 'unknown', label: 'Onbekend', days: 7 },
] as const

type DurationValue = (typeof DURATION_OPTIONS)[number]['value']

function getInitials(first: string, last: string): string {
  return ((first.charAt(0) || '') + (last.charAt(0) || '')).toUpperCase()
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// -- Component ---------------------------------------------------------------

export function AbsenceWizard({ open, onClose, siteId, onSaved }: AbsenceWizardProps) {
  const { showSuccess, showError } = useToast()
  const isDemo = useDemoStore((s) => s.isDemo)

  const employees = trpc.workforce.listEmployees.useQuery(
    { site_id: siteId, limit: 200 },
    { enabled: open && siteId.length > 0 },
  )
  const reportSick = trpc.absence.reportSick.useMutation()

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [search, setSearch] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null)
  const [startDate, setStartDate] = useState(todayISO())
  const [duration, setDuration] = useState<DurationValue>('unknown')

  // Reset on open
  useEffect(() => {
    if (!open) return
    setStep(1)
    setDirection(1)
    setSaving(false)
    setSaved(false)
    setSearch('')
    setSelectedEmployee(null)
    setStartDate(todayISO())
    setDuration('unknown')
  }, [open])

  // -- Derived ---------------------------------------------------------------

  const allEmployees = (employees.data?.items ?? []) as Employee[]

  const filteredEmployees = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return allEmployees
    return allEmployees.filter((e) => {
      const full = `${e.first_name} ${e.last_name}`.toLowerCase()
      return full.includes(q)
    })
  }, [allEmployees, search])

  const durationDays = DURATION_OPTIONS.find((d) => d.value === duration)?.days ?? 7
  const periodEnd = addDays(startDate, durationDays)

  const canStep1 = !!selectedEmployee
  const canStep2 = !!startDate

  // -- tRPC for step 3 -------------------------------------------------------

  const impact = trpc.absence.getImpact.useQuery(
    {
      employee_id: selectedEmployee?.id ?? '',
      site_id: siteId,
      period_start: startDate,
      period_end: periodEnd,
    },
    { enabled: step === 3 && !!selectedEmployee },
  )

  const suggestions = trpc.absence.getSuggestions.useQuery(
    {
      employee_id: selectedEmployee?.id ?? '',
      site_id: siteId,
      period_start: startDate,
      period_end: periodEnd,
    },
    { enabled: step === 3 && !!selectedEmployee },
  )

  // -- Handlers --------------------------------------------------------------

  const goTo = (target: number) => {
    setDirection(target > step ? 1 : -1)
    setStep(target)
  }

  const handleConfirm = async () => {
    if (!selectedEmployee) return

    if (isDemo) {
      showError('Demo modus — ziekmeldingen worden niet opgeslagen')
      return
    }

    setSaving(true)
    try {
      await reportSick.mutateAsync({
        employee_id: selectedEmployee.id,
        site_id: siteId,
        start_date: startDate,
      })
      setSaved(true)
      showSuccess('Ziekmelding opgeslagen')
      setTimeout(() => {
        onSaved()
        onClose()
      }, 1500)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Ziekmelding mislukt')
      setSaving(false)
    }
  }

  // -- Step subtitles --------------------------------------------------------

  const stepLabels = ['Zoek Medewerker', 'Datum', 'Bevestiging']

  // -- Render ----------------------------------------------------------------

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="abs-backdrop"
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
              key="abs-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={bouncy}
              style={{
                width: '100%', maxWidth: 560,
                maxHeight: '90vh',
                display: 'flex', flexDirection: 'column',
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
                    Ziekmelding
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 12,
                    color: 'var(--muted-foreground)', margin: '2px 0 0',
                  }}>
                    {stepLabels[step - 1]}
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
              <div style={{ padding: '24px', minHeight: 300, flex: 1, position: 'relative', overflowY: 'auto', overflowX: 'hidden' }}>
                <AnimatePresence mode="wait" custom={direction}>

                  {/* -- Step 1: Zoek Medewerker -- */}
                  {step === 1 && (
                    <motion.div
                      key="step1"
                      custom={direction}
                      initial={{ x: direction > 0 ? 40 : -40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: direction > 0 ? -40 : 40, opacity: 0 }}
                      transition={snappy}
                      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Users size={18} style={{ color: 'var(--primary)' }} />
                      </div>

                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: 13,
                        color: 'var(--muted-foreground)', margin: 0,
                      }}>
                        Selecteer de medewerker die ziek is.
                      </p>

                      {/* Search input */}
                      <input
                        autoFocus
                        style={inputStyle}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Zoek op naam..."
                      />

                      {/* Employee list */}
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 6,
                        maxHeight: 280, overflowY: 'auto',
                        paddingRight: 4,
                      }}>
                        {employees.isLoading && (
                          <div style={{
                            fontFamily: 'var(--font-body)', fontSize: 13,
                            color: 'var(--muted-foreground)', padding: 16, textAlign: 'center',
                          }}>
                            Laden...
                          </div>
                        )}

                        {filteredEmployees.length === 0 && !employees.isLoading && (
                          <div style={{
                            fontFamily: 'var(--font-body)', fontSize: 13,
                            color: 'var(--muted-foreground)', padding: 16, textAlign: 'center',
                          }}>
                            Geen medewerkers gevonden.
                          </div>
                        )}

                        {filteredEmployees.map((emp) => {
                          const isSelected = selectedEmployee?.id === emp.id
                          const initials = getInitials(emp.first_name, emp.last_name)

                          return (
                            <motion.div
                              key={emp.id}
                              whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                              transition={snappy}
                              onClick={() => setSelectedEmployee(emp)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 10,
                                padding: '10px 12px',
                                borderRadius: 10,
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
                              {/* Avatar initials */}
                              <div style={{
                                width: 34, height: 34, borderRadius: 9,
                                background: 'linear-gradient(135deg, #6366F1, #818CF8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: '0 2px 8px rgba(99,102,241,0.15)',
                              }}>
                                <span style={{
                                  fontFamily: 'var(--font-body)', fontWeight: 700,
                                  fontSize: 12, color: '#fff', lineHeight: 1,
                                }}>
                                  {initials}
                                </span>
                              </div>

                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  fontFamily: 'var(--font-display)', fontSize: 13,
                                  fontWeight: 600, color: 'var(--foreground)',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}>
                                  {emp.first_name} {emp.last_name}
                                </div>
                                <div style={{
                                  fontFamily: 'var(--font-mono)', fontSize: 10,
                                  color: 'var(--muted-foreground)',
                                }}>
                                  {emp.department_id ? `Dept ${emp.department_id.slice(0, 8)}` : 'Geen afdeling'}
                                </div>
                              </div>

                              {/* Check indicator */}
                              {isSelected && (
                                <div style={{
                                  width: 20, height: 20, borderRadius: 6,
                                  backgroundColor: 'var(--primary)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexShrink: 0,
                                }}>
                                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                    <path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                </div>
                              )}
                            </motion.div>
                          )
                        })}
                      </div>

                      {selectedEmployee && (
                        <div style={{
                          fontFamily: 'var(--font-body)', fontSize: 12,
                          color: 'var(--primary)', fontWeight: 600,
                        }}>
                          {selectedEmployee.first_name} {selectedEmployee.last_name} geselecteerd
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* -- Step 2: Datum -- */}
                  {step === 2 && (
                    <motion.div
                      key="step2"
                      custom={direction}
                      initial={{ x: direction > 0 ? 40 : -40, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: direction > 0 ? -40 : 40, opacity: 0 }}
                      transition={snappy}
                      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(234,88,12,0.08))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Calendar size={18} style={{ color: '#F59E0B' }} />
                      </div>

                      {/* Start date */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={labelStyle}>
                          Eerste ziektedag <span style={{ color: 'var(--destructive)' }}>*</span>
                        </label>
                        <input
                          type="date"
                          autoFocus
                          style={inputStyle}
                          value={startDate}
                          onChange={(e) => setStartDate(e.target.value)}
                        />
                      </div>

                      {/* Expected duration */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={labelStyle}>Verwachte duur</label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                          {DURATION_OPTIONS.map((opt) => {
                            const isActive = duration === opt.value
                            return (
                              <motion.div
                                key={opt.value}
                                whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                                transition={snappy}
                                onClick={() => setDuration(opt.value)}
                                style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  padding: '12px 14px',
                                  borderRadius: 10,
                                  border: isActive
                                    ? '2px solid var(--primary)'
                                    : '1px solid var(--border)',
                                  backgroundColor: isActive
                                    ? 'rgba(99,102,241,0.06)'
                                    : 'var(--card)',
                                  cursor: 'pointer',
                                  userSelect: 'none',
                                  transition: 'border-color 150ms, background-color 150ms',
                                }}
                              >
                                <span style={{
                                  fontFamily: 'var(--font-body)', fontSize: 13,
                                  fontWeight: isActive ? 600 : 500,
                                  color: isActive ? 'var(--primary)' : 'var(--foreground)',
                                }}>
                                  {opt.label}
                                </span>
                              </motion.div>
                            )
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}

                  {/* -- Step 3: Bevestiging -- */}
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

                      {/* Success animation */}
                      {saved ? (
                        <motion.div
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={bouncy}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            justifyContent: 'center', padding: '32px 0', gap: 12,
                          }}
                        >
                          <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                            <motion.circle
                              cx="32" cy="32" r="28"
                              stroke="#10B981"
                              strokeWidth="3"
                              fill="rgba(16,185,129,0.06)"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 0.6, ease: 'easeOut' }}
                            />
                            <motion.path
                              d="M20 33L28 41L44 25"
                              stroke="#10B981"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              fill="none"
                              initial={{ pathLength: 0 }}
                              animate={{ pathLength: 1 }}
                              transition={{ duration: 0.4, delay: 0.4, ease: 'easeOut' }}
                            />
                          </svg>
                          <span style={{
                            fontFamily: 'var(--font-display)', fontSize: 16,
                            fontWeight: 700, color: '#10B981',
                          }}>
                            Ziekmelding opgeslagen
                          </span>
                        </motion.div>
                      ) : (
                        <>
                          {/* Summary card */}
                          <div style={{
                            borderRadius: 12, border: '1px solid var(--border)',
                            backgroundColor: 'rgba(99,102,241,0.02)', overflow: 'hidden',
                          }}>
                            <div style={{
                              padding: '14px 16px',
                              display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                              {/* Avatar */}
                              <div style={{
                                width: 34, height: 34, borderRadius: 9,
                                background: 'linear-gradient(135deg, #6366F1, #818CF8)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0,
                              }}>
                                <span style={{
                                  fontFamily: 'var(--font-body)', fontWeight: 700,
                                  fontSize: 12, color: '#fff',
                                }}>
                                  {selectedEmployee
                                    ? getInitials(selectedEmployee.first_name, selectedEmployee.last_name)
                                    : '??'}
                                </span>
                              </div>
                              <div>
                                <div style={{
                                  fontFamily: 'var(--font-display)', fontSize: 15,
                                  fontWeight: 700, color: 'var(--foreground)',
                                }}>
                                  {selectedEmployee
                                    ? `${selectedEmployee.first_name} ${selectedEmployee.last_name}`
                                    : ''}
                                </div>
                                <div style={{
                                  fontFamily: 'var(--font-mono)', fontSize: 12,
                                  color: 'var(--muted-foreground)',
                                }}>
                                  Vanaf {startDate} &middot; {DURATION_OPTIONS.find((d) => d.value === duration)?.label}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Impact alert */}
                          {impact.data && (
                            <ImpactAlert
                              impact={impact.data}
                              loading={impact.isLoading}
                            />
                          )}
                          {impact.isLoading && !impact.data && (
                            <ImpactAlert
                              impact={{
                                affected_processes: [],
                                total_shifts_uncovered: 0,
                                overall_coverage_drop: 0,
                              }}
                              loading
                            />
                          )}

                          {/* Replacement suggestions */}
                          {suggestions.data && (
                            <ReplacementSuggestions
                              suggestions={suggestions.data}
                              loading={suggestions.isLoading}
                            />
                          )}
                          {suggestions.isLoading && !suggestions.data && (
                            <ReplacementSuggestions
                              suggestions={[]}
                              loading
                            />
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Footer */}
              {!saved && (
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
                        onClick={handleConfirm}
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
                        {saving ? 'Bevestigen...' : 'Bevestig'}
                      </motion.button>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
