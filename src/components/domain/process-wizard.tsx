'use client'

import { useState, useCallback, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Clock,
  Users,
  Check,
  AlertTriangle,
  Star,
  Zap,
  Link,
  UserCheck,
  Plus,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Package,
} from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { bouncy, snappy, wobbly, scalePress } from '@/lib/motion'
import { SmartIcon } from '@/components/domain/smart-icon'
import { getDeptColor } from '@/components/domain/process-card'

// ── Types ────────────────────────────────────────────────────────────────────

export interface ProcessFormData {
  id?: string
  name: string
  process_type: 'productive' | 'supportive'
  unit_of_measure?: string
  norm_uph?: number
  conversion_input_uom?: string | null
  conversion_output_qty?: number | null
  support_type?: 'linked' | 'standalone' | null
  parent_process_id?: string | null
  support_ratio_self?: number
  support_ratio_parent?: number
  fixed_headcount?: number | null
  priority: 'critical' | 'important' | 'flexible'
  min_skill_level: number
  certifications_required: string[]
  restrict_to_trained: boolean
  min_staffing?: number | null
  max_staffing?: number | null
  frequency_type: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly'
  frequency_days?: number[] | null
  frequency_count?: number | null
  duration_type: 'full_shift' | 'hours'
  duration_hours?: number | null
  equipment?: { equipment_id: string }[]
}

interface ProcessWizardProps {
  open: boolean
  onClose: () => void
  departmentId: string
  departmentName: string
  departmentColor: string
  siteId: string
  existingProcesses: { id: string; name: string; unit_of_measure: string; norm_uph: number }[]
  initialValues?: ProcessFormData
  onSave: (data: ProcessFormData) => Promise<void>
}

// ── Constants ────────────────────────────────────────────────────────────────

const UOM_OPTIONS = ['orders', 'order lines', 'pallets', 'cartons', 'pieces', 'totes', 'units']
const PRESET_CERTS = ['Forklift', 'Reach Truck', 'ADR', 'BHV', 'EPT']
const SKILL_LABELS = ['Beginner', 'Basic', 'Skilled', 'Advanced', 'Expert']

const PRIORITY_CONFIG = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.08)', label: 'Critical', desc: 'Must always be staffed. Solver plans this first.' },
  important: { color: '#f59e0b', bg: 'rgba(245,158,11,0.08)', label: 'Important', desc: 'Should be staffed. Solver can adjust under pressure.' },
  flexible: { color: '#10b981', bg: 'rgba(16,185,129,0.08)', label: 'Flexible', desc: 'Nice to have. Filled when capacity is available.' },
} as const

function defaultFormData(): ProcessFormData {
  return {
    name: '',
    process_type: 'productive' as const,
    unit_of_measure: '',
    norm_uph: 0,
    conversion_input_uom: null,
    conversion_output_qty: null,
    support_type: null,
    parent_process_id: null,
    support_ratio_self: 1,
    support_ratio_parent: 1,
    fixed_headcount: null,
    priority: 'important' as const,
    min_skill_level: 1,
    certifications_required: [],
    restrict_to_trained: false,
    min_staffing: null,
    max_staffing: null,
    frequency_type: 'daily' as const,
    frequency_days: null,
    frequency_count: null,
    duration_type: 'full_shift' as const,
    duration_hours: null,
  }
}

// ── Slide variants ───────────────────────────────────────────────────────────

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 280 : -280,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -280 : 280,
    opacity: 0,
  }),
}

// ── Component ────────────────────────────────────────────────────────────────

export function ProcessWizard({
  open,
  onClose,
  departmentId,
  departmentName,
  departmentColor,
  siteId,
  existingProcesses,
  initialValues,
  onSave,
}: ProcessWizardProps) {
  const c = getDeptColor(departmentColor)
  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [form, setForm] = useState<ProcessFormData>(() => initialValues ?? defaultFormData())
  const [saving, setSaving] = useState(false)
  const [customUom, setCustomUom] = useState('')
  const [showCustomUom, setShowCustomUom] = useState(false)
  const [showConversion, setShowConversion] = useState(false)
  const [customCert, setCustomCert] = useState('')
  const [showCustomCert, setShowCustomCert] = useState(false)
  const [equipmentEnabled, setEquipmentEnabled] = useState(false)
  const [selectedEquipment, setSelectedEquipment] = useState<Set<string>>(new Set())

  // Equipment queries
  const equipmentQuery = trpc.org.listEquipment.useQuery(
    { site_id: siteId },
    { enabled: !!siteId },
  )
  const processEquipmentQuery = trpc.org.listProcessEquipment.useQuery(
    { site_id: siteId },
    { enabled: !!siteId },
  )

  // Initialize equipment state from initialValues
  useEffect(() => {
    if (initialValues?.equipment && initialValues.equipment.length > 0) {
      setEquipmentEnabled(true)
      setSelectedEquipment(new Set(initialValues.equipment.map((eq) => eq.equipment_id)))
    } else {
      setEquipmentEnabled(false)
      setSelectedEquipment(new Set())
    }
  }, [initialValues])

  const isEdit = !!initialValues?.id

  const update = useCallback(<K extends keyof ProcessFormData>(key: K, value: ProcessFormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const goNext = () => {
    setDirection(1)
    setStep((s) => Math.min(s + 1, 3))
  }

  const goBack = () => {
    setDirection(-1)
    setStep((s) => Math.max(s - 1, 1))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const equipmentData = equipmentEnabled && selectedEquipment.size > 0
        ? Array.from(selectedEquipment).map((equipment_id) => ({ equipment_id }))
        : undefined
      await onSave({ ...form, id: initialValues?.id, equipment: equipmentData })
      onClose()
    } catch {
      // parent handles error
    } finally {
      setSaving(false)
    }
  }

  // Reset state when modal opens/closes
  const handleClose = () => {
    if (saving) return
    setStep(1)
    setDirection(1)
    setForm(initialValues ?? defaultFormData())
    setSaving(false)
    setShowCustomUom(false)
    setCustomUom('')
    setShowConversion(false)
    setShowCustomCert(false)
    setCustomCert('')
    setEquipmentEnabled(false)
    setSelectedEquipment(new Set())
    onClose()
  }

  // Can advance from step 1?
  const step1Valid = form.name.trim().length > 0 && !!form.process_type

  // Can advance from step 2?
  const step2Valid = useMemo(() => {
    if (form.process_type === 'productive') {
      return !!form.unit_of_measure && (form.norm_uph ?? 0) > 0
    }
    if (form.support_type === 'linked') {
      return !!form.parent_process_id
    }
    if (form.support_type === 'standalone') {
      return true  // headcount is optional — min/max staffing in step 3 covers this
    }
    return !!form.support_type
  }, [form])

  const totalSteps = 3
  const isLastStep = step === totalSteps

  // Productive processes for linking
  const productiveProcesses = existingProcesses.filter((p) => {
    // In a real scenario we'd check process_type, but for now show all existing
    return true
  })

  // ── Singular UOM helper ────────────────────────────────────────────────────
  const singularUom = (uom: string) => {
    if (uom.endsWith('es') && uom !== 'pieces') return uom.slice(0, -2)
    if (uom.endsWith('s')) return uom.slice(0, -1)
    return uom
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const renderStep1 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Name input with SmartIcon */}
      <div>
        <label
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '8px',
            display: 'block',
          }}
        >
          Process Name
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              backgroundColor: `${c.main}14`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <SmartIcon name={form.name || 'process'} type="process" color={c.main} size={20} />
          </div>
          <input
            type="text"
            placeholder="e.g. Picking, Packing, Receiving..."
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            autoFocus
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              fontFamily: 'var(--font-display)',
              fontSize: '16px',
              fontWeight: 700,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Process Type */}
      <div>
        <label
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '10px',
            display: 'block',
          }}
        >
          Process Type
        </label>
        <div style={{ display: 'flex', gap: '10px' }}>
          {/* Productive card */}
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => update('process_type', 'productive')}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              border: `2px solid ${form.process_type === 'productive' ? '#10b981' : 'var(--border)'}`,
              backgroundColor: form.process_type === 'productive' ? 'rgba(16,185,129,0.06)' : 'var(--card)',
              cursor: 'pointer',
              textAlign: 'left',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {form.process_type === 'productive' && (
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: '#10b981',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={11} style={{ color: '#fff' }} />
              </div>
            )}
            <Clock size={18} style={{ color: '#10b981', marginBottom: '8px' }} />
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--foreground)',
                marginBottom: '4px',
              }}
            >
              Productive
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                color: 'var(--muted-foreground)',
                lineHeight: 1.4,
              }}
            >
              Measurable output. Has a norm (units/hr) that drives FTE calculation.
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '10px',
                color: 'var(--muted-foreground)',
                marginTop: '6px',
                fontStyle: 'italic',
              }}
            >
              Picking, Packing, Receiving
            </div>
          </motion.button>

          {/* Supportive card */}
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => update('process_type', 'supportive')}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: 'var(--radius-md)',
              border: `2px solid ${form.process_type === 'supportive' ? '#f59e0b' : 'var(--border)'}`,
              backgroundColor: form.process_type === 'supportive' ? 'rgba(245,158,11,0.06)' : 'var(--card)',
              cursor: 'pointer',
              textAlign: 'left',
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            {form.process_type === 'supportive' && (
              <div
                style={{
                  position: 'absolute',
                  top: '8px',
                  right: '8px',
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  backgroundColor: '#f59e0b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Check size={11} style={{ color: '#fff' }} />
              </div>
            )}
            <Users size={18} style={{ color: '#f59e0b', marginBottom: '8px' }} />
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--foreground)',
                marginBottom: '4px',
              }}
            >
              Supportive
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                color: 'var(--muted-foreground)',
                lineHeight: 1.4,
              }}
            >
              No direct output. Enables other processes.
            </div>
            <div
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '10px',
                color: 'var(--muted-foreground)',
                marginTop: '6px',
                fontStyle: 'italic',
              }}
            >
              Jam Busting, Cleaning, Water Spider
            </div>
          </motion.button>
        </div>
      </div>
    </div>
  )

  const renderStep2Productive = () => {
    const norm = form.norm_uph ?? 0
    const uom = form.unit_of_measure ?? ''
    const shiftOutput = norm * 8
    const secsPerUnit = norm > 0 ? 3600 / norm : 0
    const minsWhole = Math.floor(secsPerUnit / 60)
    const secsRemainder = Math.round(secsPerUnit % 60)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* UOM selection */}
        <div>
          <label
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '10px',
              display: 'block',
            }}
          >
            Unit of Measure
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {UOM_OPTIONS.map((opt) => (
              <motion.button
                key={opt}
                variants={scalePress}
                whileTap="press"
                onClick={() => update('unit_of_measure', opt)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  border: `1.5px solid ${uom === opt ? c.main : 'var(--border)'}`,
                  backgroundColor: uom === opt ? `${c.main}14` : 'var(--card)',
                  color: uom === opt ? c.main : 'var(--foreground)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {opt}
              </motion.button>
            ))}
            {!showCustomUom ? (
              <motion.button
                variants={scalePress}
                whileTap="press"
                onClick={() => setShowCustomUom(true)}
                style={{
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  border: '1.5px dashed var(--border)',
                  backgroundColor: 'transparent',
                  color: 'var(--muted-foreground)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Plus size={12} />
                custom
              </motion.button>
            ) : (
              <input
                type="text"
                placeholder="Custom UOM..."
                value={customUom}
                onChange={(e) => setCustomUom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && customUom.trim()) {
                    update('unit_of_measure', customUom.trim())
                    setShowCustomUom(false)
                  }
                  if (e.key === 'Escape') setShowCustomUom(false)
                }}
                autoFocus
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: `1.5px solid ${c.main}`,
                  backgroundColor: 'var(--card)',
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                  outline: 'none',
                  width: '120px',
                }}
              />
            )}
          </div>
        </div>

        {/* Norm UPH */}
        <div>
          <label
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '10px',
              display: 'block',
            }}
          >
            Norm (units per hour)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <input
              type="number"
              min={0}
              value={norm || ''}
              onChange={(e) => update('norm_uph', Number(e.target.value))}
              placeholder="0"
              style={{
                width: '120px',
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
                color: c.main,
                fontFamily: 'var(--font-mono)',
                fontSize: '28px',
                fontWeight: 800,
                outline: 'none',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {norm > 0 && uom && (
                <>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    {shiftOutput.toLocaleString()} {uom} per 8hr shift
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '11px',
                      fontWeight: 500,
                      color: 'var(--muted-foreground)',
                      opacity: 0.7,
                    }}
                  >
                    {'\u2248'} 1 {singularUom(uom)} every {minsWhole}m {secsRemainder}s
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Conversion ratio (optional) */}
        {!showConversion ? (
          <button
            onClick={() => setShowConversion(true)}
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              fontWeight: 500,
              color: c.main,
              backgroundColor: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textAlign: 'left',
              padding: 0,
              opacity: 0.8,
            }}
          >
            + Add conversion ratio
          </button>
        ) : (
          <div>
            <label
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                display: 'block',
              }}
            >
              Conversion Ratio
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--foreground)' }}>1</span>
              <input
                type="text"
                placeholder="input UOM"
                value={form.conversion_input_uom ?? ''}
                onChange={(e) => update('conversion_input_uom', e.target.value || null)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  outline: 'none',
                  width: '100px',
                }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--muted-foreground)' }}>{'\u2192'}</span>
              <input
                type="number"
                min={0}
                placeholder="qty"
                value={form.conversion_output_qty ?? ''}
                onChange={(e) => update('conversion_output_qty', e.target.value ? Number(e.target.value) : null)}
                style={{
                  padding: '6px 10px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  outline: 'none',
                  width: '70px',
                }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)' }}>{uom || 'output'}</span>
            </div>
          </div>
        )}

        {renderEquipmentSection()}

        {renderScheduleSection()}
      </div>
    )
  }

  // Shared equipment section used by both productive and supportive
  const renderEquipmentSection = () => {
    return (() => {
          const allEquipment = equipmentQuery.data ?? []
          const allProcessEquipment = processEquipmentQuery.data ?? []
          // Calculate allocations per equipment (excluding current process)
          const allocatedMap: Record<string, number> = {}
          for (const pe of allProcessEquipment) {
            if (pe.process_id !== initialValues?.id) {
              allocatedMap[pe.equipment_id] = (allocatedMap[pe.equipment_id] ?? 0) + pe.units_per_person
            }
          }
          if (allEquipment.length === 0) return null
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  setEquipmentEnabled(!equipmentEnabled)
                  if (equipmentEnabled) setSelectedEquipment(new Set())
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 14px', borderRadius: 'var(--radius-md)',
                  border: `1.5px solid ${equipmentEnabled ? `${c.main}40` : 'var(--border)'}`,
                  backgroundColor: equipmentEnabled ? `${c.main}08` : 'transparent',
                  cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                }}
              >
                <div style={{
                  width: 30, height: 16, borderRadius: 8,
                  backgroundColor: equipmentEnabled ? c.main : 'var(--border)',
                  position: 'relative', transition: 'background-color 0.15s', flexShrink: 0,
                }}>
                  <div style={{
                    width: 12, height: 12, borderRadius: '50%', backgroundColor: '#fff',
                    position: 'absolute', top: 2,
                    left: equipmentEnabled ? 16 : 2,
                    transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                  }} />
                </div>
                <div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
                    This process requires equipment
                  </div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1 }}>
                    Assign MHE, tools, or stations needed for this process
                  </div>
                </div>
              </button>
              {equipmentEnabled && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 6,
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--background)',
                }}>
                  {allEquipment.map((eq) => {
                    const isSelected = selectedEquipment.has(eq.id)
                    return (
                      <div key={eq.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedEquipment((prev) => {
                              const next = new Set(prev)
                              if (isSelected) next.delete(eq.id)
                              else next.add(eq.id)
                              return next
                            })
                          }}
                          style={{
                            width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                            border: `1.5px solid ${isSelected ? c.main : 'var(--border)'}`,
                            backgroundColor: isSelected ? c.main : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', padding: 0,
                          }}
                        >
                          {isSelected && (
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                              <path d="M2 5L4 7L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          )}
                        </button>
                        <Package size={14} style={{ color: 'var(--muted-foreground)', flexShrink: 0 }} />
                        <span style={{
                          flex: 1, fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                          color: isSelected ? 'var(--foreground)' : 'var(--muted-foreground)',
                        }}>
                          {eq.name}
                        </span>
                        <span style={{
                          fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 600,
                          color: 'var(--muted-foreground)', whiteSpace: 'nowrap',
                          padding: '1px 6px', borderRadius: 999,
                          backgroundColor: 'var(--muted)',
                        }}>
                          {eq.quantity} available
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })()
  }

  // Shared schedule section (frequency + duration) used by both productive and supportive step 2
  const renderScheduleSection = () => (
    <>
      {/* Frequency */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
        }}>
          Frequency
        </label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] as const).map((freq) => {
            const labels: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly', quarterly: 'Quarterly', yearly: 'Yearly' }
            const sel = form.frequency_type === freq
            return (
              <button
                key={freq}
                type="button"
                onClick={() => update('frequency_type', freq)}
                style={{
                  padding: '6px 12px', borderRadius: 'var(--radius-full)',
                  border: `1.5px solid ${sel ? c.main : 'var(--border)'}`,
                  backgroundColor: sel ? `${c.main}10` : 'transparent',
                  color: sel ? c.main : 'var(--muted-foreground)',
                  fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
              >
                {labels[freq]}
              </button>
            )
          })}
        </div>
        {form.frequency_type === 'weekly' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            <div style={{ display: 'flex', gap: 6 }}>
              {['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'].map((label, idx) => {
                const day = idx + 1
                const active = (form.frequency_days ?? []).includes(day)
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      const days = form.frequency_days ?? []
                      const next = active ? days.filter((d) => d !== day) : [...days, day].sort()
                      update('frequency_days', next)
                    }}
                    style={{
                      width: 32, height: 32, borderRadius: '50%',
                      border: `2px solid ${active ? c.main : 'var(--border)'}`,
                      backgroundColor: active ? c.main : 'transparent',
                      color: active ? '#fff' : 'var(--muted-foreground)',
                      fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 700,
                      cursor: 'pointer', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {label}
                  </button>
                )
              })}
            </div>
            {(form.frequency_days ?? []).length === 0 && (
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: c.main, margin: 0, fontStyle: 'italic' }}>
                No days selected — the solver will choose the optimal day(s) each week
              </p>
            )}
          </div>
        )}
        {(form.frequency_type === 'monthly' || form.frequency_type === 'quarterly' || form.frequency_type === 'yearly') && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <input
              type="number"
              min={1}
              value={form.frequency_count ?? 1}
              onChange={(e) => update('frequency_count', Number(e.target.value) || 1)}
              style={{
                width: 60, padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', backgroundColor: 'var(--card)',
                color: c.main, fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700,
                textAlign: 'center', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--muted-foreground)' }}>
              times per {form.frequency_type === 'monthly' ? 'month' : form.frequency_type === 'quarterly' ? 'quarter' : 'year'}
            </span>
          </div>
        )}
      </div>

      {/* Duration */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <label style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
        }}>
          Duration
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={() => update('duration_type', 'full_shift')}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${form.duration_type === 'full_shift' ? c.main : 'var(--border)'}`,
              backgroundColor: form.duration_type === 'full_shift' ? `${c.main}08` : 'transparent',
              color: form.duration_type === 'full_shift' ? c.main : 'var(--muted-foreground)',
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Full shift</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>Takes the entire shift duration</div>
          </button>
          <button
            type="button"
            onClick={() => update('duration_type', 'hours')}
            style={{
              flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-md)',
              border: `1.5px solid ${form.duration_type === 'hours' ? c.main : 'var(--border)'}`,
              backgroundColor: form.duration_type === 'hours' ? `${c.main}08` : 'transparent',
              color: form.duration_type === 'hours' ? c.main : 'var(--muted-foreground)',
              fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2 }}>Specific hours</div>
            <div style={{ fontSize: 10, opacity: 0.7 }}>Partial shift — set hours needed</div>
          </button>
        </div>
        {form.duration_type === 'hours' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              min={0.5}
              step={0.5}
              value={form.duration_hours ?? 2}
              onChange={(e) => update('duration_hours', Number(e.target.value) || null)}
              style={{
                width: 70, padding: '6px 8px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', backgroundColor: 'var(--card)',
                color: c.main, fontFamily: 'var(--font-mono)', fontSize: 18, fontWeight: 700,
                textAlign: 'center', outline: 'none', boxSizing: 'border-box',
              }}
            />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--muted-foreground)' }}>
              hours per occurrence
            </span>
          </div>
        )}
      </div>
    </>
  )

  const renderStep2Supportive = () => {
    const parentProc = productiveProcesses.find((p) => p.id === form.parent_process_id)

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Sub-type choice */}
        <div>
          <label
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              marginBottom: '10px',
              display: 'block',
            }}
          >
            Support Type
          </label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={() => update('support_type', 'linked')}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                border: `2px solid ${form.support_type === 'linked' ? c.main : 'var(--border)'}`,
                backgroundColor: form.support_type === 'linked' ? `${c.main}0a` : 'var(--card)',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
              }}
            >
              {form.support_type === 'linked' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: c.main,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={11} style={{ color: '#fff' }} />
                </div>
              )}
              <Link size={16} style={{ color: c.main, marginBottom: '6px' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>
                Linked to a process
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                Scales with another process
              </div>
            </motion.button>

            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={() => update('support_type', 'standalone')}
              style={{
                flex: 1,
                padding: '14px',
                borderRadius: 'var(--radius-md)',
                border: `2px solid ${form.support_type === 'standalone' ? c.main : 'var(--border)'}`,
                backgroundColor: form.support_type === 'standalone' ? `${c.main}0a` : 'var(--card)',
                cursor: 'pointer',
                textAlign: 'left',
                position: 'relative',
              }}
            >
              {form.support_type === 'standalone' && (
                <div
                  style={{
                    position: 'absolute',
                    top: '8px',
                    right: '8px',
                    width: '18px',
                    height: '18px',
                    borderRadius: '50%',
                    backgroundColor: c.main,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Check size={11} style={{ color: '#fff' }} />
                </div>
              )}
              <UserCheck size={16} style={{ color: c.main, marginBottom: '6px' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700, color: 'var(--foreground)' }}>
                Standalone
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)', marginTop: '4px' }}>
                Fixed headcount per shift
              </div>
            </motion.button>
          </div>
        </div>

        {/* Linked: process selector + ratio */}
        {form.support_type === 'linked' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <label
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Parent Process
            </label>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                maxHeight: '140px',
                overflowY: 'auto',
              }}
            >
              {productiveProcesses.length === 0 ? (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', padding: '12px', textAlign: 'center' }}>
                  No existing processes to link to.
                </div>
              ) : (
                productiveProcesses.map((proc) => (
                  <motion.button
                    key={proc.id}
                    variants={scalePress}
                    whileTap="press"
                    onClick={() => update('parent_process_id', proc.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: `1.5px solid ${form.parent_process_id === proc.id ? c.main : 'var(--border)'}`,
                      backgroundColor: form.parent_process_id === proc.id ? `${c.main}0a` : 'var(--card)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>
                      {proc.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '11px',
                        fontWeight: 600,
                        color: c.main,
                        backgroundColor: `${c.main}14`,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-full)',
                      }}
                    >
                      {proc.norm_uph}/hr
                    </span>
                  </motion.button>
                ))
              )}
            </div>

            {/* Ratio inputs */}
            {form.parent_process_id && parentProc && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <input
                  type="number"
                  min={1}
                  value={form.support_ratio_self ?? 1}
                  onChange={(e) => update('support_ratio_self', Math.max(1, Number(e.target.value)))}
                  style={{
                    width: '50px',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    fontWeight: 700,
                    outline: 'none',
                    textAlign: 'center',
                  }}
                />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--foreground)', fontWeight: 600 }}>
                  {form.name || 'this process'}
                </span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)' }}>per</span>
                <input
                  type="number"
                  min={1}
                  value={form.support_ratio_parent ?? 1}
                  onChange={(e) => update('support_ratio_parent', Math.max(1, Number(e.target.value)))}
                  style={{
                    width: '50px',
                    padding: '6px 8px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '13px',
                    fontWeight: 700,
                    outline: 'none',
                    textAlign: 'center',
                  }}
                />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--foreground)', fontWeight: 600 }}>
                  {parentProc.name}s
                </span>
              </div>
            )}
          </div>
        )}

        {/* Standalone: fixed headcount */}
        {form.support_type === 'standalone' && (
          <div>
            <label
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                marginBottom: '8px',
                display: 'block',
              }}
            >
              Fixed Headcount
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <input
                type="number"
                min={1}
                value={form.fixed_headcount ?? ''}
                onChange={(e) => update('fixed_headcount', e.target.value ? Number(e.target.value) : null)}
                placeholder="0"
                style={{
                  width: '90px',
                  padding: '8px 12px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)',
                  backgroundColor: 'var(--card)',
                  color: c.main,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '28px',
                  fontWeight: 800,
                  outline: 'none',
                  textAlign: 'center',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--muted-foreground)', fontWeight: 500 }}>
                per shift
              </span>
            </div>
          </div>
        )}
        {renderEquipmentSection()}
        {renderScheduleSection()}
      </div>
    )
  }

  const renderStep3 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Priority */}
      <div>
        <label
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '10px',
            display: 'block',
          }}
        >
          Priority
        </label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(Object.keys(PRIORITY_CONFIG) as Array<keyof typeof PRIORITY_CONFIG>).map((key) => {
            const cfg = PRIORITY_CONFIG[key]
            const selected = form.priority === key
            return (
              <motion.button
                key={key}
                variants={scalePress}
                whileTap="press"
                onClick={() => update('priority', key)}
                style={{
                  flex: 1,
                  padding: '12px 10px',
                  borderRadius: 'var(--radius-md)',
                  border: `2px solid ${selected ? cfg.color : 'var(--border)'}`,
                  backgroundColor: selected ? cfg.bg : 'var(--card)',
                  cursor: 'pointer',
                  textAlign: 'left',
                  position: 'relative',
                }}
              >
                {selected && (
                  <div
                    style={{
                      position: 'absolute',
                      top: '6px',
                      right: '6px',
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      backgroundColor: cfg.color,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Check size={10} style={{ color: '#fff' }} />
                  </div>
                )}
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '12px',
                    fontWeight: 700,
                    color: cfg.color,
                    marginBottom: '4px',
                  }}
                >
                  {cfg.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '10px',
                    color: 'var(--muted-foreground)',
                    lineHeight: 1.35,
                  }}
                >
                  {cfg.desc}
                </div>
              </motion.button>
            )
          })}
        </div>
      </div>

      {/* Certifications */}
      <div>
        <label
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: '10px',
            display: 'block',
          }}
        >
          Required Certifications
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {[...PRESET_CERTS, ...form.certifications_required.filter((c) => !PRESET_CERTS.includes(c))].map((cert) => {
            const selected = form.certifications_required.includes(cert)
            return (
              <motion.button
                key={cert}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  if (selected) {
                    update('certifications_required', form.certifications_required.filter((c) => c !== cert))
                  } else {
                    update('certifications_required', [...form.certifications_required, cert])
                  }
                }}
                style={{
                  padding: '5px 12px',
                  borderRadius: 'var(--radius-full)',
                  border: `1.5px solid ${selected ? c.main : 'var(--border)'}`,
                  backgroundColor: selected ? `${c.main}14` : 'var(--card)',
                  color: selected ? c.main : 'var(--foreground)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '11px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {cert}
              </motion.button>
            )
          })}
          {!showCustomCert ? (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowCustomCert(true)}
              style={{
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                border: '1.5px dashed var(--border)',
                backgroundColor: 'transparent',
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <Plus size={10} />
              Add
            </motion.button>
          ) : (
            <input
              type="text"
              placeholder="Certification name..."
              value={customCert}
              onChange={(e) => setCustomCert(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && customCert.trim()) {
                  const cert = customCert.trim()
                  if (!form.certifications_required.includes(cert)) {
                    update('certifications_required', [...form.certifications_required, cert])
                  }
                  setCustomCert('')
                  setShowCustomCert(false)
                }
                if (e.key === 'Escape') { setShowCustomCert(false); setCustomCert('') }
              }}
              autoFocus
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-full)',
                border: `1.5px solid ${c.main}`,
                backgroundColor: 'var(--card)',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                outline: 'none',
                width: '130px',
              }}
            />
          )}
        </div>
      </div>

      {/* Restrict to trained employees */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button
          type="button"
          onClick={() => update('restrict_to_trained', !form.restrict_to_trained)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 'var(--radius-md)',
            border: `1.5px solid ${form.restrict_to_trained ? `${c.main}40` : 'var(--border)'}`,
            backgroundColor: form.restrict_to_trained ? `${c.main}08` : 'transparent',
            cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
          }}
        >
          <div style={{
            width: 30, height: 16, borderRadius: 8,
            backgroundColor: form.restrict_to_trained ? c.main : 'var(--border)',
            position: 'relative', transition: 'background-color 0.15s', flexShrink: 0,
          }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%', backgroundColor: '#fff',
              position: 'absolute', top: 2,
              left: form.restrict_to_trained ? 16 : 2,
              transition: 'left 0.15s', boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--foreground)' }}>
              Restrict to trained employees only
            </div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)', marginTop: 1 }}>
              Only employees with a skill record for this process can be assigned
            </div>
          </div>
        </button>
      </div>

      {/* Min / Max staffing — hidden when fixed headcount is set (to avoid conflicting params) */}
      {!((form.fixed_headcount ?? 0) > 0) && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <label style={{
          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
        }}>
          Staffing Constraints
        </label>
        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)' }}>Min people</span>
            <input
              type="number"
              min="0"
              placeholder="No min"
              value={form.min_staffing ?? ''}
              onChange={(e) => update('min_staffing', e.target.value ? Number(e.target.value) : null)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', backgroundColor: 'var(--card)',
                color: 'var(--foreground)', fontFamily: 'var(--font-mono)', fontSize: 13,
                textAlign: 'center', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)' }}>Max people</span>
            <input
              type="number"
              min="0"
              placeholder="No max"
              value={form.max_staffing ?? ''}
              onChange={(e) => update('max_staffing', e.target.value ? Number(e.target.value) : null)}
              style={{
                width: '100%', padding: '8px 10px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', backgroundColor: 'var(--card)',
                color: 'var(--foreground)', fontFamily: 'var(--font-mono)', fontSize: 13,
                textAlign: 'center', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        {form.max_staffing != null && form.max_staffing > 0 && (
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: c.main }}>
            Hard cap: solver will not assign more than {form.max_staffing} people
          </span>
        )}
      </div>
      )}
    </div>
  )

  // ── Main render ────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={handleClose}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: '24px',
          }}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={bouncy}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: '520px',
              backgroundColor: 'var(--card)',
              borderRadius: '16px',
              boxShadow: 'var(--elevation-4, 0 8px 30px rgba(0,0,0,0.12))',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <h2
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: '18px',
                      fontWeight: 800,
                      color: 'var(--foreground)',
                      margin: 0,
                    }}
                  >
                    {form.name.trim() || (isEdit ? 'Edit Process' : 'New Process')}
                  </h2>
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '12px',
                      color: 'var(--muted-foreground)',
                    }}
                  >
                    {departmentName}
                  </span>
                </div>
                <button
                  onClick={handleClose}
                  style={{
                    width: '28px',
                    height: '28px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Step indicator */}
              <div style={{ display: 'flex', gap: '4px' }}>
                {[1, 2, 3].map((s) => (
                  <div
                    key={s}
                    style={{
                      flex: 1,
                      height: '3px',
                      borderRadius: '2px',
                      backgroundColor: s <= step ? c.main : 'var(--border)',
                      transition: 'background-color 0.2s',
                    }}
                  />
                ))}
              </div>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 24px', minHeight: '280px', position: 'relative', overflow: 'hidden' }}>
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={slideVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={snappy}
                >
                  {step === 1 && renderStep1()}
                  {step === 2 && form.process_type === 'productive' && renderStep2Productive()}
                  {step === 2 && form.process_type === 'supportive' && renderStep2Supportive()}
                  {step === 3 && renderStep3()}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              {step > 1 ? (
                <motion.button
                  variants={scalePress}
                  whileTap="press"
                  onClick={goBack}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '8px 14px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                    color: 'var(--foreground)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <ChevronLeft size={14} />
                  Back
                </motion.button>
              ) : (
                <div />
              )}

              <motion.button
                variants={scalePress}
                whileTap="press"
                disabled={
                  saving ||
                  (step === 1 && !step1Valid) ||
                  (step === 2 && !step2Valid)
                }
                onClick={isLastStep ? handleSave : goNext}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '9px 20px',
                  borderRadius: 'var(--radius-sm)',
                  border: 'none',
                  background: isLastStep
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                  color: '#FFFFFF',
                  fontFamily: 'var(--font-body)',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor:
                    saving || (step === 1 && !step1Valid) || (step === 2 && !step2Valid)
                      ? 'not-allowed'
                      : 'pointer',
                  opacity:
                    saving || (step === 1 && !step1Valid) || (step === 2 && !step2Valid)
                      ? 0.5
                      : 1,
                }}
              >
                {saving ? (
                  <>
                    <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                    Saving...
                  </>
                ) : isLastStep ? (
                  <>
                    <Check size={14} />
                    {isEdit ? 'Update Process' : 'Create Process'}
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight size={14} />
                  </>
                )}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
