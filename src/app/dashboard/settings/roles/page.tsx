'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Pencil, Trash2, X, Check,
  Shield, Briefcase, UserMinus, Clock, CalendarDays, Users,
} from 'lucide-react'
import { GlassDropdown } from '@/components/domain/glass-dropdown'
import { GlassSelect } from '@/components/domain/glass-select'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useToast } from '@/components/domain/toast'
import { bouncy, snappy, fadeInUp, containerStagger, scalePress } from '@/lib/motion'
import { getDeptColor } from '@/components/domain/process-card'
import { SmartIcon } from '@/components/domain/smart-icon'
import { sortByFlow } from '@/lib/warehouse-icons'

// ── Types ────────────────────────────────────────────────────────────────────

interface RoleData {
  id: string
  name: string
  code: string
  parent_role_id: string | null
  role_type: string
  productive_pct: number
  follows_shifts: boolean
  custom_start_time: string | null
  custom_end_time: string | null
  custom_days: number[] | null
  min_per_shift: number | null
  department_id: string | null
  employee_count: number
}

interface RoleFormState {
  id?: string
  name: string
  parent_role_id: string
  role_type: 'productive' | 'leadership' | 'overhead'
  productive_pct: number
  follows_shifts: boolean
  custom_start_time: string
  custom_end_time: string
  custom_days: number[]
  min_per_shift: number
  min_per_shift_enabled: boolean
  department_id: string
}

interface DeptData {
  id: string
  name: string
  color: string
  code: string
  site_id: string
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

function defaultForm(departmentId?: string): RoleFormState {
  return {
    name: '',
    parent_role_id: '',
    role_type: 'productive',
    productive_pct: 100,
    follows_shifts: true,
    custom_start_time: '08:00',
    custom_end_time: '17:00',
    custom_days: [1, 2, 3, 4, 5],
    min_per_shift: 1,
    min_per_shift_enabled: false,
    department_id: departmentId ?? '',
  }
}

const TYPE_CONFIG = {
  productive: { color: '#10b981', bg: 'rgba(16,185,129,0.08)', label: 'Productive', badge: 'rgba(16,185,129,0.12)' },
  leadership: { color: 'var(--primary)', bg: 'rgba(99,102,241,0.08)', label: 'Leadership', badge: 'rgba(99,102,241,0.12)' },
  overhead: { color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', label: 'Overhead', badge: 'rgba(148,163,184,0.12)' },
} as const

// ── Styles ───────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--card)',
  color: 'var(--foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
}

// ── Adaptive Grid ────────────────────────────────────────────────────────────

function getGridColumns(count: number): number {
  if (count <= 4) return count
  if (count <= 6) return 3
  if (count <= 8) return 4
  return Math.ceil(count / Math.ceil(count / 4))
}


// ── Role Card ────────────────────────────────────────────────────────────────

function RoleCard({
  role,
  isChild,
  onEdit,
  onDelete,
}: {
  role: RoleData
  isChild: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  const tc = TYPE_CONFIG[role.role_type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.productive

  return (
    <motion.div
      variants={fadeInUp}
      transition={bouncy}
      style={{
        padding: '12px 14px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border)',
        backgroundColor: 'var(--card)',
        boxShadow: 'var(--elevation-1)',
        marginLeft: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      {/* Left accent */}
      <div style={{
        width: 3, height: 32, borderRadius: 2,
        backgroundColor: tc.color,
        flexShrink: 0,
      }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700,
            color: 'var(--foreground)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {role.name}
          </span>
          {/* Type badge with % */}
          <span style={{
            padding: '1px 7px', borderRadius: 999, fontSize: 9, fontWeight: 600,
            fontFamily: 'var(--font-body)', color: tc.color,
            backgroundColor: tc.badge, textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {tc.label}{role.role_type !== 'overhead' ? ` ${role.productive_pct}%` : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' }}>
          {role.min_per_shift != null && role.min_per_shift > 0 && (
            <span style={{
              padding: '1px 7px', borderRadius: 999, fontSize: 9, fontWeight: 600,
              fontFamily: 'var(--font-body)',
              color: 'var(--primary)', backgroundColor: 'rgba(99,102,241,0.08)',
            }}>
              Min {role.min_per_shift}/shift
            </span>
          )}
          {!role.follows_shifts && role.custom_start_time && role.custom_end_time && (
            <span style={{
              padding: '1px 7px', borderRadius: 999, fontSize: 9, fontWeight: 500,
              fontFamily: 'var(--font-mono)',
              color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)',
              display: 'flex', alignItems: 'center', gap: 3,
            }}>
              <Clock size={9} />
              {role.custom_start_time.substring(0, 5)}-{role.custom_end_time.substring(0, 5)}
            </span>
          )}
          <span style={{
            padding: '1px 7px', borderRadius: 999, fontSize: 9, fontWeight: 500,
            fontFamily: 'var(--font-body)',
            color: 'var(--muted-foreground)', backgroundColor: 'var(--muted)',
            display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <Users size={9} />
            {role.employee_count}
          </span>
        </div>
      </div>

      {/* Menu */}
      <GlassDropdown
        options={[
          { label: 'Edit', icon: <Pencil size={13} />, onClick: onEdit },
          { label: 'Delete', icon: <Trash2 size={13} />, onClick: onDelete, variant: 'destructive', holdToConfirm: true, disabled: role.employee_count > 0, disabledReason: `Cannot delete: ${role.employee_count} employee(s) assigned` },
        ]}
      />
    </motion.div>
  )
}

// ── Department Role Column ───────────────────────────────────────────────────

function DeptRoleColumn({
  department,
  roles,
  allRoles,
  onAddRole,
  onEditRole,
  onDeleteRole,
}: {
  department: DeptData
  roles: RoleData[]
  allRoles: RoleData[]
  onAddRole: (deptId: string) => void
  onEditRole: (role: RoleData) => void
  onDeleteRole: (roleId: string) => void
}) {
  const c = getDeptColor(department.color)

  // Build parent/child structure within this column
  const childMap = new Map<string, RoleData[]>()
  for (const role of roles) {
    if (role.parent_role_id && roles.some((r) => r.id === role.parent_role_id)) {
      const arr = childMap.get(role.parent_role_id) ?? []
      arr.push(role)
      childMap.set(role.parent_role_id, arr)
    }
  }
  const rootRoles = roles.filter((r) => !r.parent_role_id || !roles.some((p) => p.id === r.parent_role_id))

  function renderTree(role: RoleData, depth: number): React.ReactNode {
    const children = childMap.get(role.id) ?? []
    return (
      <div key={role.id}>
        <div style={{ marginLeft: depth * 20 }}>
          <RoleCard
            role={role}
            isChild={depth > 0}
            onEdit={() => onEditRole(role)}
            onDelete={() => onDeleteRole(role.id)}
          />
        </div>
        {children.map((child) => renderTree(child, depth + 1))}
      </div>
    )
  }

  return (
    <div
      style={{
        width: '100%',
        backgroundColor: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: '14px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        alignSelf: 'flex-start',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: `${c.main}18`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <SmartIcon name={department.name} type="department" color={c.main} size={14} />
        </div>
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '12px',
            fontWeight: 800,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--foreground)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {department.name}
        </span>
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            color: c.main,
            backgroundColor: `${c.main}18`,
            padding: '1px 7px',
            borderRadius: 'var(--radius-full)',
            flexShrink: 0,
          }}
        >
          {roles.length}
        </span>
      </div>

      {/* Role cards */}
      {roles.length > 0 && (
        <motion.div
          variants={containerStagger}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          {rootRoles.map((role) => renderTree(role, 0))}
        </motion.div>
      )}

      {/* Add Role button */}
      <motion.button
        onClick={() => onAddRole(department.id)}
        whileHover={{ backgroundColor: `${c.main}10` }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
          padding: '10px',
          borderRadius: 'var(--radius-md)',
          border: `1.5px dashed ${c.border}`,
          backgroundColor: 'transparent',
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-body)',
          fontSize: '12px',
          fontWeight: 600,
          cursor: 'pointer',
          transition: 'all 0.15s',
        }}
      >
        <Plus size={14} />
        Add Role
      </motion.button>
    </div>
  )
}

// ── Role Wizard ──────────────────────────────────────────────────────────────

function RoleWizard({
  open,
  onClose,
  siteId,
  existingRoles,
  departments,
  initialValues,
  departmentId,
}: {
  open: boolean
  onClose: () => void
  siteId: string
  existingRoles: RoleData[]
  departments: { id: string; name: string }[]
  initialValues?: RoleFormState & { id?: string }
  departmentId?: string
}) {
  const utils = trpc.useUtils()
  const upsert = trpc.org.upsertRole.useMutation()

  const [step, setStep] = useState(1)
  const [direction, setDirection] = useState(1)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<RoleFormState>(() => initialValues ?? defaultForm(departmentId))
  const [applyToOthers, setApplyToOthers] = useState(false)
  const [selectedDepts, setSelectedDepts] = useState<Set<string>>(new Set())

  const isEdit = !!initialValues?.id

  // Find the department name for the subtitle
  const presetDeptName = departmentId ? departments.find((d) => d.id === departmentId)?.name : undefined

  useEffect(() => {
    if (open) {
      setStep(1)
      setDirection(1)
      setSaving(false)
      setError(null)
      setForm(initialValues ?? defaultForm(departmentId))
      setApplyToOthers(false)
      setSelectedDepts(new Set())
    }
  }, [open, initialValues, departmentId])

  const update = useCallback(<K extends keyof RoleFormState>(key: K, value: RoleFormState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }))
  }, [])

  const goNext = () => { setDirection(1); setStep((s) => Math.min(s + 1, 3)) }
  const goBack = () => { setDirection(-1); setStep((s) => Math.max(s - 1, 1)) }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      const basePayload = {
        name: form.name.trim(),
        site_id: siteId,
        parent_role_id: form.parent_role_id || null,
        role_type: form.role_type,
        productive_pct: form.role_type === 'overhead' ? 0 : form.productive_pct,
        follows_shifts: form.follows_shifts,
        custom_start_time: !form.follows_shifts ? form.custom_start_time : null,
        custom_end_time: !form.follows_shifts ? form.custom_end_time : null,
        custom_days: !form.follows_shifts ? form.custom_days : null,
        min_per_shift: form.role_type === 'leadership' && form.min_per_shift_enabled ? form.min_per_shift : null,
        department_id: form.department_id || null,
      }

      // Create for the primary department
      await upsert.mutateAsync({
        ...(initialValues?.id ? { id: initialValues.id } : {}),
        ...basePayload,
      })

      // Create for additional selected departments — resolve parent role per department
      if (!isEdit && applyToOthers && selectedDepts.size > 0) {
        // If this role has a parent, find the parent's name so we can match it in other depts
        const parentRoleName = form.parent_role_id
          ? existingRoles.find((r) => r.id === form.parent_role_id)?.name ?? null
          : null

        for (const deptId of selectedDepts) {
          // Fetch fresh roles each iteration so we find parents created in previous iterations
          await utils.org.listRoles.invalidate()
          const freshRoles = await utils.org.listRoles.fetch({ site_id: siteId })

          // Find the matching parent role in this target department (by name)
          let targetParentId: string | null = null
          if (parentRoleName) {
            const match = (freshRoles ?? []).find(
              (r) => r.name === parentRoleName && r.department_id === deptId
            )
            targetParentId = match?.id ?? null
          }

          await upsert.mutateAsync({
            ...basePayload,
            department_id: deptId,
            parent_role_id: targetParentId,
          })
        }
      }

      await utils.org.listRoles.invalidate()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save role')
    } finally {
      setSaving(false)
    }
  }

  const canStep1 = form.name.trim().length > 0

  const toggleDay = (day: number) => {
    setForm((prev) => {
      const days = prev.custom_days.includes(day)
        ? prev.custom_days.filter((d) => d !== day)
        : [...prev.custom_days, day].sort()
      return { ...prev, custom_days: days }
    })
  }

  const totalSteps = 3
  const isLastStep = step === totalSteps

  return (
    <AnimatePresence>
      {open && (
        <>
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

          <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none',
          }}>
            <motion.div
              key="modal"
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
                    {isEdit ? 'Edit Role' : 'New Role'}
                  </h3>
                  <p style={{
                    fontFamily: 'var(--font-body)', fontSize: 12,
                    color: 'var(--muted-foreground)', margin: '2px 0 0',
                  }}>
                    {presetDeptName
                      ? `${presetDeptName} — ${step === 1 ? 'Identity' : step === 2 ? 'Solver configuration' : 'Work schedule'}`
                      : (step === 1 ? 'Identity' : step === 2 ? 'Solver configuration' : 'Work schedule')
                    }
                  </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3].map((s) => (
                      <div key={s} style={{
                        width: 24, height: 4, borderRadius: 2,
                        backgroundColor: step >= s ? 'var(--primary)' : 'var(--border)',
                      }} />
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
                  {/* Step 1 — Identity */}
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
                        <Briefcase size={18} style={{ color: 'var(--primary)' }} />
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{
                          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
                        }}>
                          Role Name <span style={{ color: 'var(--destructive)' }}>*</span>
                        </label>
                        <input
                          autoFocus
                          style={inputStyle}
                          value={form.name}
                          onChange={(e) => update('name', e.target.value)}
                          placeholder="e.g. Team Lead, Picker, Forklift Driver..."
                        />
                      </div>

                      <GlassSelect
                        label="Parent Role"
                        value={form.parent_role_id}
                        onChange={(val) => update('parent_role_id', val)}
                        placeholder="\u2014 Top level \u2014"
                        options={[
                          { value: '', label: '\u2014 Top level \u2014' },
                          ...existingRoles
                            .filter((r) => r.id !== initialValues?.id && r.department_id === form.department_id)
                            .map((r) => ({ value: r.id, label: r.name })),
                        ]}
                      />
                    </motion.div>
                  )}

                  {/* Step 2 — Solver Configuration */}
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
                      {/* Type cards */}
                      <div style={{ display: 'flex', gap: 10 }}>
                        {/* Productive */}
                        <motion.button
                          variants={scalePress} whileTap="press"
                          onClick={() => { update('role_type', 'productive'); update('productive_pct', 100) }}
                          style={{
                            flex: 1, padding: 14, borderRadius: 'var(--radius-md)',
                            border: `2px solid ${form.role_type === 'productive' ? '#10b981' : 'var(--border)'}`,
                            backgroundColor: form.role_type === 'productive' ? 'rgba(16,185,129,0.06)' : 'var(--card)',
                            cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden',
                          }}
                        >
                          {form.role_type === 'productive' && (
                            <div style={{
                              position: 'absolute', top: 8, right: 8, width: 18, height: 18,
                              borderRadius: '50%', backgroundColor: '#10b981',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Check size={11} style={{ color: '#fff' }} />
                            </div>
                          )}
                          <Briefcase size={18} style={{ color: '#10b981', marginBottom: 8 }} />
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
                            Productive
                          </div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                            Fully productive. Counted as direct capacity.
                          </div>
                        </motion.button>

                        {/* Leadership */}
                        <motion.button
                          variants={scalePress} whileTap="press"
                          onClick={() => { update('role_type', 'leadership'); update('productive_pct', 30) }}
                          style={{
                            flex: 1, padding: 14, borderRadius: 'var(--radius-md)',
                            border: `2px solid ${form.role_type === 'leadership' ? 'var(--primary)' : 'var(--border)'}`,
                            backgroundColor: form.role_type === 'leadership' ? 'rgba(99,102,241,0.06)' : 'var(--card)',
                            cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden',
                          }}
                        >
                          {form.role_type === 'leadership' && (
                            <div style={{
                              position: 'absolute', top: 8, right: 8, width: 18, height: 18,
                              borderRadius: '50%', backgroundColor: 'var(--primary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Check size={11} style={{ color: '#fff' }} />
                            </div>
                          )}
                          <Shield size={18} style={{ color: 'var(--primary)', marginBottom: 8 }} />
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
                            Leadership
                          </div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                            Partially productive. Splits time between leading and doing.
                          </div>
                        </motion.button>

                        {/* Overhead */}
                        <motion.button
                          variants={scalePress} whileTap="press"
                          onClick={() => { update('role_type', 'overhead'); update('productive_pct', 0) }}
                          style={{
                            flex: 1, padding: 14, borderRadius: 'var(--radius-md)',
                            border: `2px solid ${form.role_type === 'overhead' ? '#94a3b8' : 'var(--border)'}`,
                            backgroundColor: form.role_type === 'overhead' ? 'rgba(148,163,184,0.06)' : 'var(--card)',
                            cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden',
                          }}
                        >
                          {form.role_type === 'overhead' && (
                            <div style={{
                              position: 'absolute', top: 8, right: 8, width: 18, height: 18,
                              borderRadius: '50%', backgroundColor: '#94a3b8',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Check size={11} style={{ color: '#fff' }} />
                            </div>
                          )}
                          <UserMinus size={18} style={{ color: '#94a3b8', marginBottom: 8 }} />
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
                            Overhead
                          </div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                            Not counted as productive capacity.
                          </div>
                        </motion.button>
                      </div>

                      {/* Productive % */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{
                          fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                          textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
                        }}>
                          Productive %
                        </label>
                        <input
                          type="number"
                          min={0} max={100}
                          disabled={form.role_type === 'overhead'}
                          value={form.productive_pct}
                          onChange={(e) => update('productive_pct', Math.min(100, Math.max(0, Number(e.target.value))))}
                          style={{
                            ...inputStyle,
                            fontFamily: 'var(--font-mono)',
                            opacity: form.role_type === 'overhead' ? 0.5 : 1,
                            cursor: form.role_type === 'overhead' ? 'not-allowed' : undefined,
                          }}
                        />
                      </div>

                      {/* Leadership: min per shift */}
                      {form.role_type === 'leadership' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <button
                            type="button"
                            onClick={() => update('min_per_shift_enabled', !form.min_per_shift_enabled)}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 8,
                              padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                              border: `1px solid ${form.min_per_shift_enabled ? 'rgba(99,102,241,0.3)' : 'var(--border)'}`,
                              backgroundColor: form.min_per_shift_enabled ? 'rgba(99,102,241,0.06)' : 'var(--card)',
                              color: form.min_per_shift_enabled ? 'var(--primary)' : 'var(--muted-foreground)',
                              fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                              cursor: 'pointer', transition: 'all 0.15s',
                            }}
                          >
                            <div style={{
                              width: 32, height: 18, borderRadius: 9,
                              backgroundColor: form.min_per_shift_enabled ? 'var(--primary)' : 'var(--border)',
                              position: 'relative', transition: 'background-color 0.15s',
                            }}>
                              <div style={{
                                width: 14, height: 14, borderRadius: '50%', backgroundColor: '#fff',
                                position: 'absolute', top: 2,
                                left: form.min_per_shift_enabled ? 16 : 2,
                                transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                              }} />
                            </div>
                            Minimum per shift
                          </button>
                          {form.min_per_shift_enabled && (
                            <input
                              type="number" min={1}
                              value={form.min_per_shift}
                              onChange={(e) => update('min_per_shift', Math.max(1, Number(e.target.value)))}
                              style={{ ...inputStyle, fontFamily: 'var(--font-mono)', width: 120 }}
                            />
                          )}
                        </div>
                      )}

                      {/* Department dropdown — hidden when departmentId is pre-set */}
                      {!departmentId && form.role_type !== 'productive' && (
                        <GlassSelect
                          label="Department (optional)"
                          value={form.department_id}
                          onChange={(val) => update('department_id', val)}
                          placeholder="\u2014 No department \u2014"
                          options={[
                            { value: '', label: '\u2014 No department \u2014' },
                            ...departments.map((d) => ({ value: d.id, label: d.name })),
                          ]}
                        />
                      )}
                    </motion.div>
                  )}

                  {/* Step 3 — Work Schedule */}
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
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.12), rgba(5,150,105,0.08))',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <CalendarDays size={18} style={{ color: '#10b981' }} />
                      </div>

                      {/* Schedule type cards */}
                      <div style={{ display: 'flex', gap: 10 }}>
                        <motion.button
                          variants={scalePress} whileTap="press"
                          onClick={() => update('follows_shifts', true)}
                          style={{
                            flex: 1, padding: 14, borderRadius: 'var(--radius-md)',
                            border: `2px solid ${form.follows_shifts ? '#10b981' : 'var(--border)'}`,
                            backgroundColor: form.follows_shifts ? 'rgba(16,185,129,0.06)' : 'var(--card)',
                            cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden',
                          }}
                        >
                          {form.follows_shifts && (
                            <div style={{
                              position: 'absolute', top: 8, right: 8, width: 18, height: 18,
                              borderRadius: '50%', backgroundColor: '#10b981',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Check size={11} style={{ color: '#fff' }} />
                            </div>
                          )}
                          <Clock size={18} style={{ color: '#10b981', marginBottom: 8 }} />
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
                            Follows shift rotation
                          </div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                            Uses the employee{"'"}s crew and shift assignment
                          </div>
                        </motion.button>

                        <motion.button
                          variants={scalePress} whileTap="press"
                          onClick={() => update('follows_shifts', false)}
                          style={{
                            flex: 1, padding: 14, borderRadius: 'var(--radius-md)',
                            border: `2px solid ${!form.follows_shifts ? 'var(--primary)' : 'var(--border)'}`,
                            backgroundColor: !form.follows_shifts ? 'rgba(99,102,241,0.06)' : 'var(--card)',
                            cursor: 'pointer', textAlign: 'left', position: 'relative', overflow: 'hidden',
                          }}
                        >
                          {!form.follows_shifts && (
                            <div style={{
                              position: 'absolute', top: 8, right: 8, width: 18, height: 18,
                              borderRadius: '50%', backgroundColor: 'var(--primary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                              <Check size={11} style={{ color: '#fff' }} />
                            </div>
                          )}
                          <CalendarDays size={18} style={{ color: 'var(--primary)', marginBottom: 8 }} />
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: 'var(--foreground)', marginBottom: 4 }}>
                            Custom schedule
                          </div>
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--muted-foreground)', lineHeight: 1.4 }}>
                            Fixed working hours, independent of shifts
                          </div>
                        </motion.button>
                      </div>

                      {/* Custom schedule fields */}
                      {!form.follows_shifts && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={bouncy}
                          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                        >
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <label style={{
                                fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                                textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
                              }}>
                                Start Time
                              </label>
                              <input
                                type="time"
                                value={form.custom_start_time}
                                onChange={(e) => update('custom_start_time', e.target.value)}
                                style={inputStyle}
                              />
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <label style={{
                                fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                                textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
                              }}>
                                End Time
                              </label>
                              <input
                                type="time"
                                value={form.custom_end_time}
                                onChange={(e) => update('custom_end_time', e.target.value)}
                                style={inputStyle}
                              />
                            </div>
                          </div>

                          {/* Day-of-week circles */}
                          <div>
                            <label style={{
                              fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                              textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
                              display: 'block', marginBottom: 8,
                            }}>
                              Working Days
                            </label>
                            <div style={{ display: 'flex', gap: 6 }}>
                              {DAY_LABELS.map((label, idx) => {
                                const day = idx + 1
                                const active = form.custom_days.includes(day)
                                return (
                                  <button
                                    key={day}
                                    onClick={() => toggleDay(day)}
                                    style={{
                                      width: 36, height: 36, borderRadius: '50%',
                                      border: `2px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
                                      backgroundColor: active ? 'var(--primary)' : 'transparent',
                                      color: active ? '#fff' : 'var(--muted-foreground)',
                                      fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700,
                                      cursor: 'pointer', transition: 'all 0.15s',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}
                                  >
                                    {label}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {/* Apply to other departments — only on create, when departmentId is set */}
                      {!isEdit && departmentId && departments.length > 1 && (
                        <div style={{
                          padding: '14px 16px', borderRadius: 'var(--radius-md)',
                          border: `1px solid ${applyToOthers ? 'rgba(99,102,241,0.2)' : 'var(--border)'}`,
                          backgroundColor: applyToOthers ? 'rgba(99,102,241,0.04)' : 'transparent',
                          display: 'flex', flexDirection: 'column', gap: 10,
                        }}>
                          <button
                            type="button"
                            onClick={() => setApplyToOthers(!applyToOthers)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              background: 'none', border: 'none', padding: 0,
                              cursor: 'pointer', fontFamily: 'var(--font-body)',
                              fontSize: 12, fontWeight: 600, color: 'var(--foreground)',
                            }}
                          >
                            <div style={{
                              width: 30, height: 16, borderRadius: 8,
                              backgroundColor: applyToOthers ? 'var(--primary)' : 'var(--border)',
                              position: 'relative', transition: 'background-color 0.15s',
                            }}>
                              <div style={{
                                width: 12, height: 12, borderRadius: '50%', backgroundColor: '#fff',
                                position: 'absolute', top: 2,
                                left: applyToOthers ? 16 : 2,
                                transition: 'left 0.15s',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                              }} />
                            </div>
                            Also create this role for other departments
                          </button>

                          {applyToOthers && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingLeft: 38 }}>
                              {departments
                                .filter((d) => d.id !== departmentId)
                                .map((d) => {
                                  const sel = selectedDepts.has(d.id)
                                  return (
                                    <button
                                      key={d.id}
                                      type="button"
                                      onClick={() => {
                                        setSelectedDepts((prev) => {
                                          const next = new Set(prev)
                                          if (next.has(d.id)) next.delete(d.id)
                                          else next.add(d.id)
                                          return next
                                        })
                                      }}
                                      style={{
                                        padding: '5px 12px', borderRadius: 'var(--radius-full)',
                                        border: `1.5px solid ${sel ? 'var(--primary)' : 'var(--border)'}`,
                                        backgroundColor: sel ? 'rgba(99,102,241,0.08)' : 'transparent',
                                        color: sel ? 'var(--primary)' : 'var(--muted-foreground)',
                                        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600,
                                        cursor: 'pointer', transition: 'all 0.15s',
                                      }}
                                    >
                                      {sel ? '✓ ' : ''}{d.name}
                                    </button>
                                  )
                                })}
                            </div>
                          )}
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
                      Cancel
                    </button>
                    <motion.button
                      variants={scalePress} whileTap="press"
                      onClick={goNext}
                      disabled={!canStep1}
                      style={{
                        padding: '9px 20px', borderRadius: 8, border: 'none',
                        background: canStep1 ? 'linear-gradient(135deg, var(--primary), #8B5CF6)' : 'var(--muted)',
                        color: canStep1 ? '#fff' : 'var(--muted-foreground)',
                        fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                        cursor: canStep1 ? 'pointer' : 'not-allowed',
                      }}
                    >
                      Next
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
                      Back
                    </button>
                    {isLastStep ? (
                      <motion.button
                        variants={scalePress} whileTap="press"
                        onClick={handleSave}
                        disabled={saving}
                        style={{
                          padding: '11px 24px', borderRadius: 8, border: 'none',
                          background: 'linear-gradient(135deg, #10b981, #059669)',
                          color: '#fff', fontFamily: 'var(--font-body)',
                          fontSize: 14, fontWeight: 700,
                          cursor: saving ? 'not-allowed' : 'pointer',
                          opacity: saving ? 0.7 : 1,
                          boxShadow: '0 4px 14px rgba(16,185,129,0.3)',
                        }}
                      >
                        {saving ? 'Saving...' : isEdit ? 'Save Role \u2713' : applyToOthers && selectedDepts.size > 0 ? `Create for ${1 + selectedDepts.size} departments \u2713` : 'Create Role \u2713'}
                      </motion.button>
                    ) : (
                      <motion.button
                        variants={scalePress} whileTap="press"
                        onClick={goNext}
                        style={{
                          padding: '9px 20px', borderRadius: 8, border: 'none',
                          background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                          color: '#fff', fontFamily: 'var(--font-body)',
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        Next
                      </motion.button>
                    )}
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

// ── Adaptive Grid for Department Columns ─────────────────────────────────────

function RolesAdaptiveGrid({
  departments,
  rolesByDept,
  allRoles,
  onAddRole,
  onEditRole,
  onDeleteRole,
}: {
  departments: DeptData[]
  rolesByDept: Record<string, RoleData[]>
  allRoles: RoleData[]
  onAddRole: (deptId: string) => void
  onEditRole: (role: RoleData) => void
  onDeleteRole: (roleId: string) => void
}) {
  const totalItems = departments.length
  const cols = getGridColumns(totalItems)

  const sortedDepts = sortByFlow(departments)

  const rows: Array<DeptData[]> = []
  for (let i = 0; i < sortedDepts.length; i += cols) {
    rows.push(sortedDepts.slice(i, i + cols))
  }

  return (
    <motion.div variants={fadeInUp} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {rows.map((row, rowIdx) => {
        const isLastRow = rowIdx === rows.length - 1
        const needsCentering = isLastRow && row.length < cols

        return (
          <div
            key={rowIdx}
            style={{
              display: 'flex',
              gap: '16px',
              justifyContent: needsCentering ? 'center' : 'flex-start',
            }}
          >
            {row.map((dept) => (
              <div
                key={dept.id}
                style={{
                  flex: needsCentering ? undefined : 1,
                  width: needsCentering ? `calc(${100 / cols}% - ${16 * (cols - 1) / cols}px)` : undefined,
                  minWidth: 0,
                }}
              >
                <DeptRoleColumn
                  department={dept}
                  roles={rolesByDept[dept.id] ?? []}
                  allRoles={allRoles}
                  onAddRole={onAddRole}
                  onEditRole={onEditRole}
                  onDeleteRole={onDeleteRole}
                />
              </div>
            ))}
          </div>
        )
      })}
    </motion.div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function RolesSettingsPage() {
  const { activeSiteId: siteId } = useSiteStore()

  const deptsQuery = trpc.org.listDepartments.useQuery(
    { site_id: siteId! },
    { enabled: !!siteId },
  )
  const rolesQuery = trpc.org.listRoles.useQuery(
    { site_id: siteId! },
    { enabled: !!siteId },
  )
  const deleteMut = trpc.org.deleteRole.useMutation()
  const utils = trpc.useUtils()

  const toast = useToast()
  const [wizardOpen, setWizardOpen] = useState(false)
  const [wizardDeptId, setWizardDeptId] = useState<string | undefined>(undefined)
  const [editValues, setEditValues] = useState<(RoleFormState & { id: string }) | undefined>(undefined)

  const roles = rolesQuery.data ?? []
  const departments = (deptsQuery.data ?? []) as DeptData[]

  // Group roles by department
  const rolesByDept = useMemo(() => {
    const map: Record<string, RoleData[]> = {}
    for (const r of roles) {
      const key = r.department_id ?? '__none__'
      if (!map[key]) map[key] = []
      map[key]!.push(r)
    }
    return map
  }, [roles])

  const isLoading = deptsQuery.isLoading || rolesQuery.isLoading
  const error = deptsQuery.error || rolesQuery.error

  const handleAddRole = useCallback((deptId: string) => {
    setEditValues(undefined)
    setWizardDeptId(deptId)
    setWizardOpen(true)
  }, [])

  const handleEditRole = useCallback((role: RoleData) => {
    setEditValues({
      id: role.id,
      name: role.name,
      parent_role_id: role.parent_role_id ?? '',
      role_type: role.role_type as 'productive' | 'leadership' | 'overhead',
      productive_pct: role.productive_pct,
      follows_shifts: role.follows_shifts,
      custom_start_time: role.custom_start_time ?? '08:00',
      custom_end_time: role.custom_end_time ?? '17:00',
      custom_days: role.custom_days ?? [1, 2, 3, 4, 5],
      min_per_shift: role.min_per_shift ?? 1,
      min_per_shift_enabled: role.min_per_shift != null && role.min_per_shift > 0,
      department_id: role.department_id ?? '',
    })
    setWizardDeptId(role.department_id ?? undefined)
    setWizardOpen(true)
  }, [])

  const handleDeleteRole = useCallback(async (roleId: string) => {
    try {
      await deleteMut.mutateAsync({ id: roleId })
      await utils.org.listRoles.invalidate()
      toast.showSuccess('Role deleted')
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Failed to delete role')
    }
  }, [deleteMut, utils, toast])

  // ── No site ────────────────────────────────────────────────────────────────

  if (!siteId) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', minHeight: '300px', gap: '12px',
      }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: '15px',
          color: 'var(--muted-foreground)',
        }}>
          Select a site to manage roles.
        </p>
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
    >
      {/* Header */}
      <motion.div
        variants={fadeInUp}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div>
          <h2 style={{
            fontFamily: 'var(--font-display)', fontSize: '26px', fontWeight: 800,
            color: 'var(--foreground)', margin: 0,
          }}>
            Job Roles
          </h2>
          {isLoading ? (
            <div
              className="animate-pulse"
              style={{
                height: '16px', width: '200px', borderRadius: '4px',
                backgroundColor: 'var(--muted)', marginTop: '6px',
              }}
            />
          ) : (
            <p style={{
              fontFamily: 'var(--font-body)', fontSize: '14px',
              color: 'var(--muted-foreground)', margin: '4px 0 0',
            }}>
              Define roles per department and how the solver counts them
            </p>
          )}
        </div>
      </motion.div>

      {/* Error state */}
      {error && (
        <motion.div
          variants={fadeInUp}
          style={{
            padding: '14px 18px', borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--card)', border: '1px solid var(--destructive)',
            color: 'var(--destructive)', fontFamily: 'var(--font-body)', fontSize: '14px',
          }}
        >
          Failed to load: {error.message}
        </motion.div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div style={{ display: 'flex', gap: '16px' }}>
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                minWidth: '260px', flex: 1, maxWidth: '340px',
                height: '300px', borderRadius: '14px',
                backgroundColor: 'var(--card)', border: '1px solid var(--border)',
              }}
            />
          ))}
        </div>
      )}

      {/* Kanban grid */}
      {!isLoading && departments.length === 0 && (
        <motion.div
          variants={fadeInUp}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            justifyContent: 'center', padding: '60px 24px', gap: '16px',
          }}
        >
          <p style={{
            fontFamily: 'var(--font-body)', fontSize: '15px',
            color: 'var(--muted-foreground)',
          }}>
            No departments yet. Create departments on the Processes page first.
          </p>
        </motion.div>
      )}

      {!isLoading && departments.length > 0 && (
        <RolesAdaptiveGrid
          departments={departments}
          rolesByDept={rolesByDept}
          allRoles={roles}
          onAddRole={handleAddRole}
          onEditRole={handleEditRole}
          onDeleteRole={handleDeleteRole}
        />
      )}

      {/* Wizard */}
      <RoleWizard
        open={wizardOpen}
        onClose={() => { setWizardOpen(false); setWizardDeptId(undefined); setEditValues(undefined) }}
        siteId={siteId}
        existingRoles={roles}
        departments={departments}
        initialValues={editValues}
        departmentId={wizardDeptId}
      />
    </motion.div>
  )
}
