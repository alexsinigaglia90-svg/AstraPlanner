'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Users, Calendar, FileText, CheckCircle2 } from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useToast } from '@/components/domain/toast'
import { MiniCalendar } from './mini-calendar'
import { ImpactAlert } from './impact-alert'
import { ReplacementSuggestions } from './replacement-suggestions'

// -- Types -------------------------------------------------------------------

interface LeaveWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onSaved: () => void
  forSelf?: boolean
}

type LeaveType = 'vakantie' | 'bijzonder' | 'onbetaald'

// -- Constants ---------------------------------------------------------------

const TOTAL_STEPS = 4

const LEAVE_TYPES: Array<{ value: LeaveType; label: string; accent: string; bg: string; border: string }> = [
  { value: 'vakantie', label: 'Vakantie', accent: '#6366F1', bg: 'rgba(99,102,241,0.06)', border: 'rgba(99,102,241,0.2)' },
  { value: 'bijzonder', label: 'Bijzonder verlof', accent: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)' },
  { value: 'onbetaald', label: 'Onbetaald verlof', accent: '#64748B', bg: 'rgba(100,116,139,0.06)', border: 'rgba(100,116,139,0.2)' },
]

const stepLabels = ['Medewerker', 'Datum Range', 'Type + Notitie', 'Review']

// -- Helpers -----------------------------------------------------------------

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]!.charAt(0).toUpperCase()
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toUpperCase()
}

function countBusinessDays(start: string, end: string): number {
  const s = new Date(start)
  const e = new Date(end)
  let count = 0
  const current = new Date(s)
  while (current <= e) {
    const day = current.getDay()
    if (day !== 0 && day !== 6) count++
    current.setDate(current.getDate() + 1)
  }
  return count
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}-${m}-${y}`
}

// -- Component ---------------------------------------------------------------

export function LeaveWizard({ open, onClose, siteId, onSaved, forSelf = false }: LeaveWizardProps) {
  const utils = trpc.useUtils()
  const { showSuccess, showError } = useToast()
  const requestLeave = trpc.absence.requestLeave.useMutation()
  const requestLeaveFor = trpc.absence.requestLeaveFor.useMutation()

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Step 1
  const [voorMezelf, setVoorMezelf] = useState(forSelf)
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Step 2
  const [currentMonth, setCurrentMonth] = useState(() => new Date())
  const [selectedRange, setSelectedRange] = useState<{ start: string; end: string } | null>(null)

  // Step 3
  const [leaveType, setLeaveType] = useState<LeaveType>('vakantie')
  const [notes, setNotes] = useState('')

  // Fetch employees when not for self
  const employees = trpc.workforce.listEmployees.useQuery(
    { site_id: siteId, limit: 200 },
    { enabled: open && !voorMezelf && siteId.length > 0 },
  )

  // Step 4: impact + suggestions
  // For "voor mezelf": skip impact/suggestions (no employee_id available client-side)
  const employeeId = voorMezelf ? null : selectedEmployee?.id ?? null
  const hasImpactContext = !!employeeId && !!selectedRange
  const impactQuery = trpc.absence.getImpact.useQuery(
    { employee_id: employeeId ?? '', site_id: siteId, period_start: selectedRange?.start ?? '', period_end: selectedRange?.end ?? '' },
    { enabled: step === 4 && hasImpactContext },
  )
  const suggestionsQuery = trpc.absence.getSuggestions.useQuery(
    { employee_id: employeeId ?? '', site_id: siteId, period_start: selectedRange?.start ?? '', period_end: selectedRange?.end ?? '' },
    { enabled: step === 4 && hasImpactContext },
  )

  // Reset on open
  useEffect(() => {
    if (!open) return
    setStep(1)
    setDirection(1)
    setSaving(false)
    setSaved(false)
    setError(null)
    setVoorMezelf(forSelf)
    setSelectedEmployee(null)
    setSearchTerm('')
    setCurrentMonth(new Date())
    setSelectedRange(null)
    setLeaveType('vakantie')
    setNotes('')
  }, [open, forSelf])

  // Derived
  const allEmployees = employees.data?.items ?? []
  const filteredEmployees = useMemo(() => {
    if (!searchTerm.trim()) return allEmployees
    const q = searchTerm.toLowerCase()
    return allEmployees.filter(
      (e) =>
        e.first_name.toLowerCase().includes(q) ||
        e.last_name.toLowerCase().includes(q) ||
        e.employee_number.toLowerCase().includes(q),
    )
  }, [allEmployees, searchTerm])

  const businessDays = selectedRange ? countBusinessDays(selectedRange.start, selectedRange.end) : 0

  const canStep1 = voorMezelf || !!selectedEmployee
  const canStep2 = !!selectedRange
  const canStep3 = !!leaveType

  const employeeName = voorMezelf ? 'Jezelf' : selectedEmployee?.name ?? ''

  // Handlers
  const goTo = (target: number) => {
    setDirection(target > step ? 1 : -1)
    setStep(target)
  }

  const handleSave = async () => {
    if (!selectedRange) return
    setSaving(true)
    setError(null)
    try {
      if (voorMezelf) {
        await requestLeave.mutateAsync({
          site_id: siteId,
          start_date: selectedRange.start,
          end_date: selectedRange.end,
          leave_type: leaveType,
          reason: notes.trim() || undefined,
        })
      } else {
        if (!selectedEmployee) return
        await requestLeaveFor.mutateAsync({
          employee_id: selectedEmployee.id,
          site_id: siteId,
          start_date: selectedRange.start,
          end_date: selectedRange.end,
          leave_type: leaveType,
          reason: notes.trim() || undefined,
        })
      }

      await utils.absence.listActive.invalidate()
      setSaved(true)
      showSuccess('Verlof aangevraagd')
      setTimeout(() => {
        onSaved()
        onClose()
      }, 1200)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Opslaan mislukt')
      setSaving(false)
    }
  }

  // Render
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="lw-backdrop"
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
              key="lw-modal"
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
                    Verlof Aanvragen
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

                  {/* ── Step 1: Medewerker ──────────────────────── */}
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
                        <Users size={18} style={{ color: '#6366F1' }} />
                      </div>

                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: 13,
                        color: 'var(--muted-foreground)', margin: 0,
                      }}>
                        Voor wie is het verlof?
                      </p>

                      {/* Toggle voor mezelf */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '12px 14px', borderRadius: 10,
                        border: '1px solid var(--border)',
                        backgroundColor: voorMezelf ? 'rgba(99,102,241,0.06)' : 'var(--card)',
                        cursor: 'pointer', userSelect: 'none',
                        transition: 'background-color 150ms',
                      }} onClick={() => { setVoorMezelf(!voorMezelf); setSelectedEmployee(null) }}>
                        {/* Toggle switch */}
                        <div style={{
                          width: 38, height: 22, borderRadius: 11,
                          backgroundColor: voorMezelf ? '#6366F1' : 'var(--border)',
                          position: 'relative', transition: 'background-color 200ms',
                          flexShrink: 0,
                        }}>
                          <motion.div
                            animate={{ x: voorMezelf ? 18 : 2 }}
                            transition={snappy}
                            style={{
                              width: 18, height: 18, borderRadius: '50%',
                              backgroundColor: '#fff',
                              position: 'absolute', top: 2,
                              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                            }}
                          />
                        </div>
                        <span style={{
                          fontFamily: 'var(--font-display)', fontSize: 14,
                          fontWeight: 600, color: 'var(--foreground)',
                        }}>
                          Voor mezelf
                        </span>
                      </div>

                      {voorMezelf && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={snappy}
                          style={{
                            padding: '14px 16px', borderRadius: 10,
                            border: '1px solid rgba(99,102,241,0.15)',
                            backgroundColor: 'rgba(99,102,241,0.04)',
                          }}
                        >
                          <span style={{
                            fontFamily: 'var(--font-body)', fontSize: 13,
                            color: 'var(--foreground)',
                          }}>
                            Verlof voor jezelf aanvragen
                          </span>
                        </motion.div>
                      )}

                      {/* Employee search list */}
                      {!voorMezelf && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={snappy}
                          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                        >
                          <input
                            autoFocus
                            placeholder="Zoek medewerker..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                              width: '100%', padding: '10px 12px',
                              borderRadius: 'var(--radius-sm)',
                              border: '1px solid var(--border)',
                              backgroundColor: 'var(--card)',
                              color: 'var(--foreground)',
                              fontFamily: 'var(--font-body)', fontSize: 14,
                              outline: 'none', boxSizing: 'border-box',
                            }}
                          />

                          <div style={{
                            display: 'flex', flexDirection: 'column', gap: 4,
                            maxHeight: 220, overflowY: 'auto', paddingRight: 4,
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
                                Geen medewerkers gevonden
                              </div>
                            )}

                            {filteredEmployees.map((emp) => {
                              const name = `${emp.first_name} ${emp.last_name}`
                              const isSelected = selectedEmployee?.id === emp.id
                              return (
                                <motion.div
                                  key={emp.id}
                                  whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                                  transition={snappy}
                                  onClick={() => setSelectedEmployee({ id: emp.id, name })}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 10,
                                    padding: '10px 12px', borderRadius: 10,
                                    border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                                    backgroundColor: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--card)',
                                    cursor: 'pointer', userSelect: 'none',
                                    transition: 'border-color 150ms, background-color 150ms',
                                  }}
                                >
                                  {/* Avatar */}
                                  <div style={{
                                    width: 32, height: 32, borderRadius: 8,
                                    background: 'linear-gradient(135deg, #6366F1, #818CF8)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    flexShrink: 0,
                                  }}>
                                    <span style={{
                                      fontFamily: 'var(--font-body)', fontWeight: 700,
                                      fontSize: 11, color: '#fff', lineHeight: 1,
                                    }}>
                                      {getInitials(name)}
                                    </span>
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                      fontFamily: 'var(--font-display)', fontSize: 13,
                                      fontWeight: 600, color: 'var(--foreground)',
                                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    }}>
                                      {name}
                                    </div>
                                    <div style={{
                                      fontFamily: 'var(--font-mono)', fontSize: 10,
                                      color: 'var(--muted-foreground)',
                                    }}>
                                      {emp.employee_number}
                                    </div>
                                  </div>
                                </motion.div>
                              )
                            })}
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Step 2: Datum Range ─────────────────────── */}
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
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Calendar size={18} style={{ color: '#6366F1' }} />
                      </div>

                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: 13,
                        color: 'var(--muted-foreground)', margin: 0,
                      }}>
                        Selecteer de verlofperiode
                      </p>

                      <MiniCalendar
                        month={currentMonth}
                        rangeMode={true}
                        selectedRange={selectedRange}
                        onRangeSelect={(start, end) => setSelectedRange({ start, end })}
                        onMonthChange={setCurrentMonth}
                      />

                      {/* Date summary */}
                      {selectedRange && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={snappy}
                          style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '12px 16px', borderRadius: 10,
                            border: '1px solid rgba(99,102,241,0.15)',
                            backgroundColor: 'rgba(99,102,241,0.04)',
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <span style={{
                              fontFamily: 'var(--font-body)', fontSize: 12,
                              color: 'var(--muted-foreground)',
                            }}>
                              Van: <strong style={{ color: 'var(--foreground)' }}>{formatDate(selectedRange.start)}</strong>
                            </span>
                            <span style={{
                              fontFamily: 'var(--font-body)', fontSize: 12,
                              color: 'var(--muted-foreground)',
                            }}>
                              Tot: <strong style={{ color: 'var(--foreground)' }}>{formatDate(selectedRange.end)}</strong>
                            </span>
                          </div>
                          <div style={{
                            padding: '6px 12px', borderRadius: 8,
                            backgroundColor: 'rgba(99,102,241,0.08)',
                          }}>
                            <span style={{
                              fontFamily: 'var(--font-mono)', fontSize: 14,
                              fontWeight: 700, color: '#6366F1',
                            }}>
                              {businessDays}
                            </span>
                            <span style={{
                              fontFamily: 'var(--font-body)', fontSize: 11,
                              color: 'var(--muted-foreground)', marginLeft: 4,
                            }}>
                              werkdagen
                            </span>
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Step 3: Type + Notitie ──────────────────── */}
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
                        <FileText size={18} style={{ color: '#6366F1' }} />
                      </div>

                      <p style={{
                        fontFamily: 'var(--font-body)', fontSize: 13,
                        color: 'var(--muted-foreground)', margin: 0,
                      }}>
                        Kies het type verlof
                      </p>

                      {/* Leave type radio cards */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {LEAVE_TYPES.map((lt) => {
                          const isSelected = leaveType === lt.value
                          return (
                            <motion.div
                              key={lt.value}
                              whileHover={{ y: -1, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                              transition={snappy}
                              onClick={() => setLeaveType(lt.value)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '14px 16px', borderRadius: 12,
                                border: isSelected ? `2px solid ${lt.accent}` : '1px solid var(--border)',
                                backgroundColor: isSelected ? lt.bg : 'var(--card)',
                                cursor: 'pointer', userSelect: 'none',
                                transition: 'border-color 150ms, background-color 150ms',
                                backdropFilter: 'blur(8px)',
                              }}
                            >
                              {/* Radio indicator */}
                              <div style={{
                                width: 18, height: 18, borderRadius: '50%',
                                border: isSelected ? `2px solid ${lt.accent}` : '2px solid var(--border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                flexShrink: 0, transition: 'all 150ms',
                              }}>
                                {isSelected && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={snappy}
                                    style={{
                                      width: 10, height: 10, borderRadius: '50%',
                                      backgroundColor: lt.accent,
                                    }}
                                  />
                                )}
                              </div>
                              <span style={{
                                fontFamily: 'var(--font-display)', fontSize: 14,
                                fontWeight: 600, color: isSelected ? lt.accent : 'var(--foreground)',
                              }}>
                                {lt.label}
                              </span>
                            </motion.div>
                          )
                        })}
                      </div>

                      {/* Notes textarea */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{
                          fontFamily: 'var(--font-body)', fontSize: 11,
                          fontWeight: 600, textTransform: 'uppercase',
                          letterSpacing: '0.06em', color: 'var(--muted-foreground)',
                        }}>
                          Notitie (optioneel)
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Eventuele toelichting..."
                          rows={3}
                          style={{
                            width: '100%', padding: '10px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border)',
                            backgroundColor: 'var(--card)',
                            color: 'var(--foreground)',
                            fontFamily: 'var(--font-body)', fontSize: 14,
                            outline: 'none', boxSizing: 'border-box',
                            resize: 'vertical',
                          }}
                        />
                      </div>
                    </motion.div>
                  )}

                  {/* ── Step 4: Review ──────────────────────────── */}
                  {step === 4 && (
                    <motion.div
                      key="step4"
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
                        <CheckCircle2 size={18} style={{ color: '#6366F1' }} />
                      </div>

                      {/* Success animation */}
                      {saved ? (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={bouncy}
                          style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center',
                            gap: 12, padding: '24px 0',
                          }}
                        >
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ ...bouncy, delay: 0.1 }}
                            style={{
                              width: 56, height: 56, borderRadius: '50%',
                              backgroundColor: 'rgba(16,185,129,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >
                            <CheckCircle2 size={28} style={{ color: '#10B981' }} />
                          </motion.div>
                          <span style={{
                            fontFamily: 'var(--font-display)', fontSize: 16,
                            fontWeight: 700, color: 'var(--foreground)',
                          }}>
                            Verlof aangevraagd!
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
                              borderBottom: '1px solid var(--border)',
                              display: 'flex', alignItems: 'center', gap: 10,
                            }}>
                              {!voorMezelf && selectedEmployee && (
                                <div style={{
                                  width: 32, height: 32, borderRadius: 8,
                                  background: 'linear-gradient(135deg, #6366F1, #818CF8)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  flexShrink: 0,
                                }}>
                                  <span style={{
                                    fontFamily: 'var(--font-body)', fontWeight: 700,
                                    fontSize: 11, color: '#fff', lineHeight: 1,
                                  }}>
                                    {getInitials(selectedEmployee.name)}
                                  </span>
                                </div>
                              )}
                              <span style={{
                                fontFamily: 'var(--font-display)', fontSize: 16,
                                fontWeight: 700, color: 'var(--foreground)',
                              }}>
                                {employeeName}
                              </span>
                            </div>

                            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {/* Dates */}
                              {selectedRange && (
                                <div style={{
                                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                }}>
                                  <span style={{
                                    fontFamily: 'var(--font-body)', fontSize: 13,
                                    color: 'var(--muted-foreground)',
                                  }}>
                                    {formatDate(selectedRange.start)} - {formatDate(selectedRange.end)}
                                  </span>
                                  <span style={{
                                    fontFamily: 'var(--font-mono)', fontSize: 13,
                                    fontWeight: 700, color: '#6366F1',
                                  }}>
                                    {businessDays} werkdagen
                                  </span>
                                </div>
                              )}

                              {/* Leave type */}
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                              }}>
                                {(() => {
                                  const lt = LEAVE_TYPES.find((t) => t.value === leaveType)!
                                  return (
                                    <span style={{
                                      fontFamily: 'var(--font-body)', fontSize: 12,
                                      fontWeight: 600, color: lt.accent,
                                      backgroundColor: lt.bg, border: `1px solid ${lt.border}`,
                                      padding: '3px 10px', borderRadius: 6,
                                    }}>
                                      {lt.label}
                                    </span>
                                  )
                                })()}
                                {notes.trim() && (
                                  <span style={{
                                    fontFamily: 'var(--font-body)', fontSize: 12,
                                    color: 'var(--muted-foreground)', fontStyle: 'italic',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    &ldquo;{notes.trim()}&rdquo;
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Impact + Suggestions (only for non-self requests) */}
                          {hasImpactContext && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 260, overflowY: 'auto' }}>
                              <ImpactAlert
                                impact={impactQuery.data ?? {
                                  affected_processes: [],
                                  total_shifts_uncovered: 0,
                                  overall_coverage_drop: 0,
                                }}
                                loading={impactQuery.isLoading}
                              />
                              <ReplacementSuggestions
                                suggestions={suggestionsQuery.data ?? []}
                                loading={suggestionsQuery.isLoading}
                              />
                            </div>
                          )}

                          {error && (
                            <div style={{
                              padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                              backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                              fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--destructive)',
                            }}>
                              {error}
                            </div>
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
                        onClick={() => goTo(4)}
                        disabled={!canStep3}
                        style={{
                          padding: '9px 20px', borderRadius: 8,
                          border: 'none',
                          background: canStep3 ? 'linear-gradient(135deg, var(--primary), #8B5CF6)' : 'var(--muted)',
                          color: canStep3 ? '#fff' : 'var(--muted-foreground)',
                          fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                          cursor: canStep3 ? 'pointer' : 'not-allowed',
                        }}
                      >
                        Volgende &rarr;
                      </motion.button>
                    </>
                  )}

                  {step === 4 && (
                    <>
                      <button onClick={() => goTo(3)} style={{
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
                        {saving ? 'Verzenden...' : 'Verlof Aanvragen'}
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
