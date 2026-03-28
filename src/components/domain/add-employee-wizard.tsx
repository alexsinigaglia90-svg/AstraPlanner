'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, User, Building2 } from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { GlassSelect } from '@/components/domain/glass-select'

// ── Types ────────────────────────────────────────────────────────────────────

interface AddEmployeeWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onSaved: () => void
}

interface EmployeeFormData {
  employee_number: string
  first_name: string
  last_name: string
  email: string
  contract_type: string
  weekly_hours_contracted: number
  hourly_rate: number
  department_id: string
  crew_id: string
  job_role_id: string
  status: string
}

// ── Constants ────────────────────────────────────────────────────────────────

const CONTRACT_OPTIONS = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'temporary', label: 'Temporary' },
  { value: 'seasonal', label: 'Seasonal' },
  { value: 'contractor', label: 'Contractor' },
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'on_leave', label: 'On Leave' },
  { value: 'suspended', label: 'Suspended' },
]

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


// ── Component ────────────────────────────────────────────────────────────────

export function AddEmployeeWizard({ open, onClose, siteId, onSaved }: AddEmployeeWizardProps) {
  const utils = trpc.useUtils()
  const upsert = trpc.workforce.upsertEmployee.useMutation()
  const depts = trpc.org.listDepartments.useQuery({ site_id: siteId }, { enabled: open })
  const crews = trpc.org.listCrews.useQuery({ site_id: siteId }, { enabled: open })
  const roles = trpc.org.listRoles.useQuery({ site_id: siteId }, { enabled: open })

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState<EmployeeFormData>({
    employee_number: '',
    first_name: '',
    last_name: '',
    email: '',
    contract_type: 'full_time',
    weekly_hours_contracted: 40,
    hourly_rate: 0,
    department_id: '',
    crew_id: '',
    job_role_id: '',
    status: 'active',
  })

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1)
      setDirection(1)
      setSaving(false)
      setError(null)
      setForm({
        employee_number: '',
        first_name: '',
        last_name: '',
        email: '',
        contract_type: 'full_time',
        weekly_hours_contracted: 40,
        hourly_rate: 0,
        department_id: '',
        crew_id: '',
        job_role_id: '',
        status: 'active',
      })
    }
  }, [open])

  const update = (key: keyof EmployeeFormData, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const canStep1 = form.first_name.trim() && form.last_name.trim() && form.employee_number.trim()

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await upsert.mutateAsync({
        employee_number: form.employee_number.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        contract_type: form.contract_type as 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor',
        weekly_hours_contracted: form.weekly_hours_contracted,
        hourly_rate: form.hourly_rate,
        home_site_id: siteId,
        department_id: form.department_id || null,
        crew_id: form.crew_id || null,
        job_role_id: form.job_role_id || null,
        status: form.status as 'active' | 'on_leave' | 'suspended' | 'terminated',
      })
      await utils.workforce.listEmployees.invalidate()
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create employee')
      setSaving(false)
    }
  }

  const goNext = () => { setDirection(1); setStep(2) }
  const goBack = () => { setDirection(-1); setStep(1) }

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
              position: 'fixed', inset: 0, zIndex: 9998,
              backgroundColor: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(6px)',
            }}
          />

          {/* Modal — centering wrapper */}
          <div
            style={{
              position: 'fixed', inset: 0, zIndex: 9999,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
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
              width: '100%', maxWidth: 480,
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
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
                  Nieuwe medewerker
                </h3>
                <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                  {step === 1 ? 'Persoonlijke gegevens' : 'Toewijzing'}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Step indicator */}
                <div style={{ display: 'flex', gap: 6 }}>
                  <div style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: 'var(--primary)' }} />
                  <div style={{ width: 24, height: 4, borderRadius: 2, backgroundColor: step >= 2 ? 'var(--primary)' : 'var(--border)' }} />
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
            <div style={{ padding: '24px', minHeight: 280, position: 'relative', overflow: 'hidden' }}>
              <AnimatePresence mode="wait" custom={direction}>
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
                    {/* Step icon */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <User size={18} style={{ color: 'var(--primary)' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
                          Voornaam <span style={{ color: 'var(--destructive)' }}>*</span>
                        </label>
                        <input autoFocus style={inputStyle} value={form.first_name} onChange={(e) => update('first_name', e.target.value)} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
                          Achternaam <span style={{ color: 'var(--destructive)' }}>*</span>
                        </label>
                        <input style={inputStyle} value={form.last_name} onChange={(e) => update('last_name', e.target.value)} />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
                          Personeelsnr. <span style={{ color: 'var(--destructive)' }}>*</span>
                        </label>
                        <input style={inputStyle} value={form.employee_number} onChange={(e) => update('employee_number', e.target.value)} placeholder="EMP-001" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
                          Email
                        </label>
                        <input style={inputStyle} type="email" value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="optional" />
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                      <GlassSelect
                        label="Contract"
                        value={form.contract_type}
                        onChange={(val) => update('contract_type', val)}
                        options={CONTRACT_OPTIONS}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
                          Hours/week
                        </label>
                        <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="text" inputMode="decimal" value={form.weekly_hours_contracted || ''} onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*[.,]?\d?$/.test(v)) update('weekly_hours_contracted', v === '' ? 0 : Number(v.replace(',', '.'))) }} placeholder="40" />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
                          Rate (€/hr)
                        </label>
                        <input style={{ ...inputStyle, fontFamily: 'var(--font-mono)' }} type="text" inputMode="decimal" value={form.hourly_rate || ''} onChange={(e) => { const v = e.target.value; if (v === '' || /^\d*[.,]?\d{0,2}$/.test(v)) update('hourly_rate', v === '' ? 0 : Number(v.replace(',', '.'))) }} placeholder="0.00" />
                      </div>
                    </div>
                  </motion.div>
                )}

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
                    {/* Step icon */}
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08))',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Building2 size={18} style={{ color: '#10b981' }} />
                    </div>

                    <GlassSelect
                      label="Afdeling"
                      value={form.department_id}
                      onChange={(val) => { update('department_id', val); update('job_role_id', '') }}
                      placeholder="\u2014 Geen afdeling \u2014"
                      options={[
                        { value: '', label: '\u2014 Geen afdeling \u2014' },
                        ...(depts.data ?? []).map((d) => ({ value: d.id, label: d.name })),
                      ]}
                    />

                    <GlassSelect
                      label="Ploeg"
                      value={form.crew_id}
                      onChange={(val) => update('crew_id', val)}
                      placeholder="\u2014 Geen ploeg \u2014"
                      options={[
                        { value: '', label: '\u2014 Geen ploeg \u2014' },
                        ...(crews.data ?? []).map((c) => ({ value: c.id, label: c.name })),
                      ]}
                    />

                    <GlassSelect
                      label="Rol"
                      value={form.job_role_id}
                      onChange={(val) => update('job_role_id', val)}
                      placeholder="\u2014 Geen rol \u2014"
                      options={[
                        { value: '', label: '\u2014 Geen rol \u2014' },
                        ...(() => {
                          const allRoles = roles.data ?? []
                          const seen = new Set<string>()
                          return allRoles.filter((r) => {
                            if (seen.has(r.name)) return false
                            seen.add(r.name)
                            return true
                          }).map((r) => ({ value: r.id, label: r.name }))
                        })(),
                      ]}
                    />

                    <GlassSelect
                      label="Status"
                      value={form.status}
                      onChange={(val) => update('status', val)}
                      options={STATUS_OPTIONS}
                    />

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
              {step === 1 ? (
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
                    onClick={goNext}
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
                    Volgende →
                  </motion.button>
                </>
              ) : (
                <>
                  <button onClick={goBack} style={{
                    padding: '9px 16px', borderRadius: 8,
                    border: '1px solid var(--border)', backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)',
                    fontSize: 13, cursor: 'pointer',
                  }}>
                    ← Terug
                  </button>
                  <motion.button
                    variants={scalePress} whileTap="press"
                    onClick={handleSave}
                    disabled={saving}
                    style={{
                      padding: '11px 24px', borderRadius: 8,
                      border: 'none',
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                      color: '#fff', fontFamily: 'var(--font-body)',
                      fontSize: 14, fontWeight: 700,
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.7 : 1,
                      boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                    }}
                  >
                    {saving ? 'Opslaan...' : 'Medewerker aanmaken ✓'}
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
