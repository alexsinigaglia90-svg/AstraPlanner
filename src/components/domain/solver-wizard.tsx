'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  Zap,
  Scale,
  GraduationCap,
  ChevronRight,
  ChevronLeft,
  Play,
  Check,
} from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { getDeptColor } from '@/components/domain/process-card'

// ── Types ────────────────────────────────────────────────────────────────────

interface Department {
  id: string
  name: string
  color: string
  employee_count: number
  process_count: number
}

interface Process {
  id: string
  name: string
  department_id: string | null
  max_capacity: number | null
  uph: number
  day_volumes: number[]
  available_fte: number
}

type SolverMode = 'performance' | 'balanced' | 'training'

export interface SolverWizardConfig {
  departments: string[]
  processes: string[]
  solver_mode: SolverMode
  training_slots: Record<string, number>
}

export interface SolverWizardProps {
  planVersionId: string
  departments: Department[]
  processes: Process[]
  onStart: (config: SolverWizardConfig) => void
  onClose: () => void
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

// ── Mode configuration ──────────────────────────────────────────────────────

const MODE_CONFIG: Record<SolverMode, {
  icon: typeof Zap
  label: string
  description: string
  gradient: string
  gradientBg: string
}> = {
  performance: {
    icon: Zap,
    label: 'Performance',
    description: 'Maximaliseer output — de beste medewerkers op de juiste plekken. Minste FTE nodig, hogere kosten.',
    gradient: 'linear-gradient(135deg, #8B5CF6, #7C3AED)',
    gradientBg: 'rgba(139,92,246,0.08)',
  },
  balanced: {
    icon: Scale,
    label: 'Balanced',
    description: 'Goede output tegen redelijke kosten. Weegt proficiency, kosten en eerlijke uurverdeling.',
    gradient: 'linear-gradient(135deg, #06B6D4, #10B981)',
    gradientBg: 'rgba(6,182,212,0.08)',
  },
  training: {
    icon: GraduationCap,
    label: 'Training',
    description: 'Plan trainees in waar ruimte is. Stel per proces in hoeveel trainees je wilt opleiden.',
    gradient: 'linear-gradient(135deg, #F59E0B, #D97706)',
    gradientBg: 'rgba(245,158,11,0.08)',
  },
}

// ── Styles ───────────────────────────────────────────────────────────────────

const LABEL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: '11px',
  fontWeight: 600,
  color: 'var(--muted-foreground)',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '8px',
  display: 'block',
}

const CHECKBOX_SIZE = 18

function CheckboxIcon({ checked, color }: { checked: boolean; color?: string }) {
  return (
    <div
      style={{
        width: CHECKBOX_SIZE,
        height: CHECKBOX_SIZE,
        borderRadius: CHECKBOX_SIZE / 2,
        border: checked ? 'none' : '2px solid var(--border)',
        background: checked ? (color ?? 'var(--primary)') : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'all 0.15s ease',
        flexShrink: 0,
      }}
    >
      {checked && <Check size={11} color="#fff" strokeWidth={3} />}
    </div>
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function SolverWizard({
  planVersionId: _planVersionId,
  departments,
  processes,
  onStart,
  onClose,
}: SolverWizardProps) {
  const TOTAL_STEPS = 4
  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(
    () => new Set(departments.map((d) => d.id)),
  )
  const [selectedProcs, setSelectedProcs] = useState<Set<string>>(
    () => new Set(processes.map((p) => p.id)),
  )
  const [mode, setMode] = useState<SolverMode>('balanced')
  const [trainingSlots, setTrainingSlots] = useState<Record<string, number>>({})

  // ── Navigation ──────────────────────────────────────────────────────────

  const goNext = () => {
    setDirection(1)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS))
  }

  const goBack = () => {
    setDirection(-1)
    setStep((s) => Math.max(s - 1, 1))
  }

  // ── Derived data ────────────────────────────────────────────────────────

  const filteredProcesses = useMemo(
    () => processes.filter((p) =>
      (p.department_id && selectedDepts.has(p.department_id)) || !p.department_id
    ),
    [processes, selectedDepts],
  )

  const processesByDept = useMemo(() => {
    const map = new Map<string, Process[]>()
    for (const p of filteredProcesses) {
      // Group by department_id, or under first selected department if unassigned
      const key = p.department_id ?? [...selectedDepts][0] ?? '__site__'
      const list = map.get(key) ?? []
      list.push(p)
      map.set(key, list)
    }
    return map
  }, [filteredProcesses, selectedDepts])

  // When departments change, prune processes
  const activeProcIds = useMemo(() => {
    const valid = new Set(filteredProcesses.map((p) => p.id))
    return new Set([...selectedProcs].filter((id) => valid.has(id)))
  }, [filteredProcesses, selectedProcs])

  // Training: processes with spare capacity
  const trainableProcesses = useMemo(() => {
    return filteredProcesses
      .filter((p) => activeProcIds.has(p.id))
      .map((p) => {
        const totalDemand = p.day_volumes.reduce((a, b) => a + b, 0)
        const maxCap = p.max_capacity
        const hasRoom = maxCap != null ? totalDemand < maxCap : true
        const availableSlots = maxCap != null ? Math.max(0, maxCap - totalDemand) : 99
        return { ...p, totalDemand, hasRoom, availableSlots }
      })
  }, [filteredProcesses, activeProcIds])

  // ── Validation ──────────────────────────────────────────────────────────

  const step1Valid = selectedDepts.size > 0
  const step2Valid = activeProcIds.size > 0

  const canAdvance = (s: number) => {
    if (s === 1) return step1Valid
    if (s === 2) return step2Valid
    return true
  }

  // ── Handlers ────────────────────────────────────────────────────────────

  const toggleDept = (id: string) => {
    setSelectedDepts((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllDepts = () => {
    if (selectedDepts.size === departments.length) {
      setSelectedDepts(new Set())
    } else {
      setSelectedDepts(new Set(departments.map((d) => d.id)))
    }
  }

  const toggleProc = (id: string) => {
    setSelectedProcs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleStart = () => {
    onStart({
      departments: [...selectedDepts],
      processes: [...activeProcIds],
      solver_mode: mode,
      training_slots: mode === 'training' ? trainingSlots : {},
    })
  }

  // ── Step 1: Department Selection ────────────────────────────────────────

  const renderStep1 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Select all toggle */}
      <button
        onClick={toggleAllDepts}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border)',
          backgroundColor: selectedDepts.size === departments.length ? 'rgba(var(--primary-rgb, 99,102,241), 0.06)' : 'var(--card)',
          cursor: 'pointer',
          fontFamily: 'var(--font-body)',
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--foreground)',
        }}
      >
        <CheckboxIcon checked={selectedDepts.size === departments.length} />
        Selecteer alles
      </button>

      {/* Department list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {departments.map((dept) => {
          const c = getDeptColor(dept.color)
          const checked = selectedDepts.has(dept.id)
          return (
            <motion.button
              key={dept.id}
              variants={scalePress}
              whileTap="press"
              onClick={() => toggleDept(dept.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${checked ? c.border : 'var(--border)'}`,
                borderLeft: `3px solid ${c.main}`,
                backgroundColor: checked ? c.bg : 'var(--card)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.15s ease',
              }}
            >
              <CheckboxIcon checked={checked} color={c.main} />
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                  }}
                >
                  {dept.name}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '12px',
                    color: 'var(--muted-foreground)',
                    marginTop: '2px',
                  }}
                >
                  {dept.employee_count} medewerkers &middot; {dept.process_count} processen
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>
    </div>
  )

  // ── Step 2: Process Selection ───────────────────────────────────────────

  const renderStep2 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {departments
        .filter((d) => selectedDepts.has(d.id))
        .map((dept) => {
          const c = getDeptColor(dept.color)
          const deptProcesses = processesByDept.get(dept.id) ?? []
          if (deptProcesses.length === 0) return null
          return (
            <div key={dept.id}>
              <div
                style={{
                  ...LABEL_STYLE,
                  color: c.main,
                  marginBottom: '10px',
                }}
              >
                {dept.name}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {deptProcesses.map((proc) => {
                  const checked = selectedProcs.has(proc.id)
                  const totalVol = proc.day_volumes.reduce((a, b) => a + b, 0)
                  const hasVolume = totalVol > 0
                  return (
                    <motion.button
                      key={proc.id}
                      variants={scalePress}
                      whileTap="press"
                      onClick={() => toggleProc(proc.id)}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '10px',
                        padding: '10px 12px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${checked ? c.border : 'var(--border)'}`,
                        backgroundColor: checked ? c.bg : 'var(--card)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        width: '100%',
                        opacity: hasVolume ? 1 : 0.5,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div style={{ marginTop: '2px' }}>
                        <CheckboxIcon checked={checked} color={c.main} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontFamily: 'var(--font-display)',
                            fontSize: '13px',
                            fontWeight: 700,
                            color: 'var(--foreground)',
                          }}
                        >
                          {proc.name}
                        </div>
                        <div
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: '11px',
                            color: 'var(--muted-foreground)',
                            marginTop: '2px',
                          }}
                        >
                          {totalVol.toLocaleString('nl-NL')} vol &middot; max{' '}
                          {proc.max_capacity ?? '\u221E'} &middot; {proc.available_fte} FTE
                        </div>
                      </div>
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )
        })}
    </div>
  )

  // ── Step 3: Solver Mode ─────────────────────────────────────────────────

  const renderStep3 = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Mode cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {(Object.keys(MODE_CONFIG) as SolverMode[]).map((key) => {
          const cfg = MODE_CONFIG[key]
          const Icon = cfg.icon
          const selected = mode === key
          return (
            <motion.button
              key={key}
              variants={scalePress}
              whileTap="press"
              onClick={() => setMode(key)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                border: selected ? '2px solid transparent' : '1px solid var(--border)',
                borderImage: selected ? `${cfg.gradient} 1` : undefined,
                backgroundColor: selected ? cfg.gradientBg : 'var(--card)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
                transition: 'all 0.15s ease',
                outline: selected ? `2px solid transparent` : 'none',
                boxShadow: selected ? `inset 0 0 0 2px ${cfg.gradient.includes('#8B5CF6') ? '#8B5CF6' : cfg.gradient.includes('#06B6D4') ? '#06B6D4' : '#F59E0B'}` : 'none',
              }}
            >
              <div
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '10px',
                  background: cfg.gradient,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon size={18} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--foreground)',
                  }}
                >
                  {cfg.label}
                </div>
                <div
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '12px',
                    color: 'var(--muted-foreground)',
                    marginTop: '4px',
                    lineHeight: '1.4',
                  }}
                >
                  {cfg.description}
                </div>
              </div>
            </motion.button>
          )
        })}
      </div>

      {/* Training slots (only if training mode) */}
      {mode === 'training' && (
        <div style={{ marginTop: '8px' }}>
          <div style={LABEL_STYLE}>Trainingsplekken per proces</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {trainableProcesses.map((proc) => {
              if (!proc.hasRoom) {
                return (
                  <div
                    key={proc.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--card)',
                      opacity: 0.5,
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '13px',
                        color: 'var(--foreground)',
                      }}
                    >
                      {proc.name}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: '11px',
                        color: 'var(--muted-foreground)',
                      }}
                    >
                      Demand te hoog — geen trainingsruimte
                    </span>
                  </div>
                )
              }
              return (
                <div
                  key={proc.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)',
                    backgroundColor: 'var(--card)',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      color: 'var(--foreground)',
                    }}
                  >
                    {proc.name}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={proc.availableSlots}
                    value={trainingSlots[proc.id] ?? 0}
                    onChange={(e) =>
                      setTrainingSlots((prev) => ({
                        ...prev,
                        [proc.id]: Math.max(0, Math.min(proc.availableSlots, parseInt(e.target.value) || 0)),
                      }))
                    }
                    style={{
                      width: '60px',
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--card)',
                      color: 'var(--foreground)',
                      fontFamily: 'var(--font-body)',
                      fontSize: '13px',
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )

  // ── Step 4: Summary ─────────────────────────────────────────────────────

  const selectedDeptNames = departments
    .filter((d) => selectedDepts.has(d.id))
    .map((d) => d.name)

  const totalTrainees = Object.values(trainingSlots).reduce((a, b) => a + b, 0)

  const renderStep4 = () => {
    const ModeIcon = MODE_CONFIG[mode].icon
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Departments */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
          }}
        >
          <div style={LABEL_STYLE}>Afdelingen</div>
          <div
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              color: 'var(--foreground)',
              lineHeight: '1.5',
            }}
          >
            {selectedDeptNames.join(', ')}
          </div>
        </div>

        {/* Processes count */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            backgroundColor: 'var(--card)',
          }}
        >
          <div style={LABEL_STYLE}>Processen</div>
          <div
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '20px',
              fontWeight: 800,
              color: 'var(--foreground)',
            }}
          >
            {activeProcIds.size}
          </div>
        </div>

        {/* Mode */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            backgroundColor: MODE_CONFIG[mode].gradientBg,
          }}
        >
          <div style={LABEL_STYLE}>Modus</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ModeIcon size={16} />
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '14px',
                fontWeight: 700,
                color: 'var(--foreground)',
              }}
            >
              {MODE_CONFIG[mode].label}
            </span>
          </div>
        </div>

        {/* Training trainees */}
        {mode === 'training' && totalTrainees > 0 && (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border)',
              backgroundColor: 'rgba(245,158,11,0.06)',
            }}
          >
            <div style={LABEL_STYLE}>Training</div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: '20px',
                fontWeight: 800,
                color: 'var(--foreground)',
              }}
            >
              {totalTrainees} trainees
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Step titles ─────────────────────────────────────────────────────────

  const STEP_TITLES: Record<number, { title: string; subtitle: string }> = {
    1: {
      title: 'Kies afdelingen',
      subtitle: 'Selecteer de afdelingen waarvoor je wilt plannen',
    },
    2: {
      title: 'Kies processen',
      subtitle: 'Selecteer de processen per afdeling',
    },
    3: {
      title: 'Kies optimalisatiemodus',
      subtitle: 'Hoe moet de solver plannen?',
    },
    4: {
      title: 'Overzicht',
      subtitle: 'Controleer de instellingen en start de solver',
    },
  }

  const stepInfo = STEP_TITLES[step] ?? STEP_TITLES[1]!
  const title = stepInfo.title
  const subtitle = stepInfo.subtitle

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
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
          maxWidth: '640px',
          backgroundColor: 'var(--card)',
          borderRadius: '20px',
          boxShadow: 'var(--elevation-4, 0 8px 30px rgba(0,0,0,0.12))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          maxHeight: 'calc(100vh - 48px)',
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
                {title}
              </h2>
              <span
                style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  color: 'var(--muted-foreground)',
                }}
              >
                {subtitle}
              </span>
            </div>
            <button
              onClick={onClose}
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

          {/* Step indicator — 4 dots */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
              <div
                key={s}
                style={{
                  flex: 1,
                  height: '3px',
                  borderRadius: '2px',
                  backgroundColor: s <= step ? 'var(--primary)' : 'var(--border)',
                  transition: 'background-color 0.2s',
                }}
              />
            ))}
          </div>
        </div>

        {/* Body */}
        <div
          style={{
            padding: '20px 24px',
            minHeight: '280px',
            maxHeight: '420px',
            overflowY: 'auto',
            position: 'relative',
          }}
        >
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
              {step === 2 && renderStep2()}
              {step === 3 && renderStep3()}
              {step === 4 && renderStep4()}
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
              Terug
            </motion.button>
          ) : (
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={onClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '8px 14px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Annuleren
            </motion.button>
          )}

          {step === TOTAL_STEPS ? (
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={handleStart}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 24px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                color: '#FFFFFF',
                fontFamily: 'var(--font-body)',
                fontSize: '14px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              <Play size={14} />
              Start solver
            </motion.button>
          ) : (
            <motion.button
              variants={scalePress}
              whileTap="press"
              disabled={!canAdvance(step)}
              onClick={goNext}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 20px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                color: '#FFFFFF',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: canAdvance(step) ? 'pointer' : 'not-allowed',
                opacity: canAdvance(step) ? 1 : 0.5,
              }}
            >
              Volgende
              <ChevronRight size={14} />
            </motion.button>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}
