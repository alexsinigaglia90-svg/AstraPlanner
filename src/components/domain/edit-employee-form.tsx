'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Trash2, AlertTriangle, ShieldAlert } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { scalePress, bouncy } from '@/lib/motion'
import { GlassSelect } from '@/components/domain/glass-select'

interface EditEmployeeFormProps {
  employee: {
    id: string
    employee_number: string
    first_name: string
    last_name: string
    email: string | null
    contract_type: string
    weekly_hours_contracted: number
    hourly_rate: number | null
    home_site_id: string
    department_id: string | null
    is_multi_site_eligible: boolean
    status: string
    crew_id?: string | null
    job_role_id?: string | null
  }
  onClose: () => void
  onDeleted?: () => void
  isNew?: boolean
}

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
  { value: 'terminated', label: 'Terminated' },
]

function Field({
  label,
  children,
  required,
}: {
  label: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase' as const,
          letterSpacing: '0.06em',
          color: 'var(--muted-foreground)',
        }}
      >
        {label}
        {required && <span style={{ color: 'var(--destructive)', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

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


export function EditEmployeeForm({ employee, onClose, onDeleted, isNew }: EditEmployeeFormProps) {
  const utils = trpc.useUtils()
  const upsert = trpc.workforce.upsertEmployee.useMutation()
  const deleteMut = trpc.workforce.deleteEmployee.useMutation()
  const eraseMut = trpc.workforce.eraseEmployee.useMutation()
  const crewsQuery = trpc.org.listCrews.useQuery({ site_id: employee.home_site_id })
  const rolesQuery = trpc.org.listRoles.useQuery({ site_id: employee.home_site_id })

  const [form, setForm] = useState({
    first_name: employee.first_name,
    last_name: employee.last_name,
    employee_number: employee.employee_number,
    email: employee.email ?? '',
    contract_type: employee.contract_type,
    weekly_hours_contracted: employee.weekly_hours_contracted,
    hourly_rate: employee.hourly_rate ?? 0,
    is_multi_site_eligible: employee.is_multi_site_eligible,
    status: employee.status,
    crew_id: employee.crew_id ?? '',
    job_role_id: employee.job_role_id ?? '',
  })

  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [showEraseConfirm, setShowEraseConfirm] = useState(false)
  const [eraseReason, setEraseReason] = useState('')
  const [eraseAck, setEraseAck] = useState(false)
  const [eraseError, setEraseError] = useState<string | null>(null)

  const update = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setError(null)
    try {
      await upsert.mutateAsync({
        ...(isNew ? {} : { id: employee.id }),
        employee_number: form.employee_number,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        contract_type: form.contract_type as 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor',
        weekly_hours_contracted: form.weekly_hours_contracted,
        hourly_rate: form.hourly_rate > 0 ? form.hourly_rate : undefined,
        home_site_id: employee.home_site_id,
        department_id: employee.department_id,
        crew_id: form.crew_id || null,
        job_role_id: form.job_role_id || null,
        is_multi_site_eligible: form.is_multi_site_eligible,
        status: form.status as 'active' | 'on_leave' | 'suspended' | 'terminated',
      })
      await utils.workforce.getEmployee.invalidate({ id: employee.id })
      await utils.workforce.listEmployees.invalidate()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    }
  }

  const handleDelete = async () => {
    setDeleteError(null)
    try {
      await deleteMut.mutateAsync({ id: employee.id })
      await utils.workforce.listEmployees.invalidate()
      onDeleted?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete'
      setDeleteError(msg)
    }
  }

  const handleErase = async () => {
    setEraseError(null)
    try {
      await eraseMut.mutateAsync({
        id: employee.id,
        reason: eraseReason.trim(),
      })
      await utils.workforce.listEmployees.invalidate()
      onDeleted?.()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erasure failed'
      setEraseError(msg)
    }
  }

  const canErase = eraseReason.trim().length >= 3 && eraseAck && !eraseMut.isPending

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Name row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="First Name" required>
          <input
            style={inputStyle}
            value={form.first_name}
            onChange={(e) => update('first_name', e.target.value)}
          />
        </Field>
        <Field label="Last Name" required>
          <input
            style={inputStyle}
            value={form.last_name}
            onChange={(e) => update('last_name', e.target.value)}
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Employee Number" required>
          <input
            style={inputStyle}
            value={form.employee_number}
            onChange={(e) => update('employee_number', e.target.value)}
          />
        </Field>
        <Field label="Email">
          <input
            style={inputStyle}
            type="email"
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
            placeholder="optional"
          />
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <GlassSelect
          label="Contract Type"
          required
          value={form.contract_type}
          onChange={(val) => update('contract_type', val)}
          options={CONTRACT_OPTIONS}
        />
        <GlassSelect
          label="Status"
          required
          value={form.status}
          onChange={(val) => update('status', val)}
          options={STATUS_OPTIONS}
        />
      </div>

      <GlassSelect
        label="Crew"
        value={form.crew_id}
        onChange={(val) => update('crew_id', val)}
        placeholder="\u2014 No crew \u2014"
        options={[
          { value: '', label: '\u2014 No crew \u2014' },
          ...(crewsQuery.data ?? []).map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      <GlassSelect
        label="Role"
        value={form.job_role_id}
        onChange={(val) => update('job_role_id', val)}
        placeholder="\u2014 No role \u2014"
        options={[
          { value: '', label: '\u2014 No role \u2014' },
          ...(() => {
            const roles = rolesQuery.data ?? []
            const seen = new Set<string>()
            return roles
              .filter((r) => {
                if (seen.has(r.name)) return false
                seen.add(r.name)
                return true
              })
              .map((r) => ({ value: r.id, label: r.name }))
          })(),
        ]}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <Field label="Weekly Hours" required>
          <input
            style={inputStyle}
            type="number"
            step="0.5"
            min="0"
            value={form.weekly_hours_contracted}
            onChange={(e) => update('weekly_hours_contracted', Number(e.target.value))}
          />
        </Field>
        <Field label="Hourly Rate (€)" required>
          <input
            style={inputStyle}
            type="number"
            step="0.01"
            min="0"
            value={form.hourly_rate}
            onChange={(e) => update('hourly_rate', Number(e.target.value))}
          />
        </Field>
      </div>

      {/* Multi-site toggle */}
      <Field label="Multi-Site Eligible">
        <button
          type="button"
          onClick={() => update('is_multi_site_eligible', !form.is_multi_site_eligible)}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 14px',
            borderRadius: 'var(--radius-sm)',
            border: `1px solid ${form.is_multi_site_eligible ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
            backgroundColor: form.is_multi_site_eligible ? 'rgba(16,185,129,0.08)' : 'var(--card)',
            color: form.is_multi_site_eligible ? '#059669' : 'var(--muted-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          <div
            style={{
              width: 32,
              height: 18,
              borderRadius: 9,
              backgroundColor: form.is_multi_site_eligible ? '#10B981' : 'var(--border)',
              position: 'relative',
              transition: 'background-color 0.15s',
            }}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                backgroundColor: '#fff',
                position: 'absolute',
                top: 2,
                left: form.is_multi_site_eligible ? 16 : 2,
                transition: 'left 0.15s',
                boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              }}
            />
          </div>
          {form.is_multi_site_eligible ? 'Yes' : 'No'}
        </button>
      </Field>

      {/* Error */}
      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(239,68,68,0.06)',
            border: '1px solid rgba(239,68,68,0.15)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--destructive)',
          }}
        >
          {error}
        </div>
      )}

      {/* Save button */}
      <motion.button
        variants={scalePress}
        whileTap="press"
        onClick={handleSave}
        disabled={upsert.isPending || !form.first_name || !form.last_name || !form.employee_number}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          padding: '11px 20px',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
          color: '#fff',
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          fontWeight: 600,
          cursor: upsert.isPending ? 'not-allowed' : 'pointer',
          opacity: upsert.isPending ? 0.7 : 1,
          width: '100%',
        }}
      >
        {upsert.isPending ? (
          'Saving...'
        ) : (
          <>
            <Save size={15} />
            {isNew ? 'Create Employee' : 'Save Changes'}
          </>
        )}
      </motion.button>

      {/* Divider + Delete (only in edit mode) */}
      {!isNew && <>
      <div style={{ height: 1, backgroundColor: 'var(--border)' }} />

      {/* Delete section */}
      {!showDeleteConfirm ? (
        <button
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(239,68,68,0.15)',
            backgroundColor: 'transparent',
            color: 'var(--destructive)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          <Trash2 size={14} />
          Delete Employee
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={bouncy}
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'rgba(239,68,68,0.04)',
            border: '1px solid rgba(239,68,68,0.15)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <AlertTriangle size={18} style={{ color: 'var(--destructive)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
                Delete {employee.first_name} {employee.last_name}?
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
                This permanently removes the employee. Employees with planning history cannot be deleted.
              </p>
            </div>
          </div>

          {deleteError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(239,68,68,0.08)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--destructive)',
              }}
            >
              {deleteError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => { setShowDeleteConfirm(false); setDeleteError(null) }}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMut.isPending}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                backgroundColor: 'var(--destructive)',
                color: '#fff',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: deleteMut.isPending ? 'not-allowed' : 'pointer',
                opacity: deleteMut.isPending ? 0.7 : 1,
              }}
            >
              {deleteMut.isPending ? 'Deleting...' : 'Yes, Delete'}
            </button>
          </div>
        </motion.div>
      )}

      {/* AVG art. 17 — Right to be forgotten (erasure)
          Distinct from Delete: this anonymises the row instead of removing
          it, so historical shift_assignment / payroll rows remain consistent.
          Always visible because it must work even for employees with
          planning history (that is the entire point — terminated employees
          keep a planning history that can only be broken by AVG erasure). */}
      {!showEraseConfirm ? (
        <button
          onClick={() => setShowEraseConfirm(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid rgba(168,85,247,0.25)',
            backgroundColor: 'transparent',
            color: 'rgb(147,51,234)',
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          <ShieldAlert size={14} />
          AVG-recht op vergetelheid (art. 17)
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={bouncy}
          style={{
            padding: '16px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(168,85,247,0.06), rgba(236,72,153,0.04))',
            border: '1px solid rgba(168,85,247,0.2)',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <ShieldAlert size={18} style={{ color: 'rgb(147,51,234)', flexShrink: 0, marginTop: 1 }} />
            <div>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
                {employee.first_name} {employee.last_name} definitief anonimiseren?
              </p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--muted-foreground)', margin: '4px 0 0', lineHeight: 1.5 }}>
                Deze actie is onder de AVG (art. 17 — recht op vergetelheid) en is <strong>onomkeerbaar</strong>. Naam, e-mailadres,
                telefoonnummer en voorkeuren worden permanent verwijderd. Historische dienstroosters, loonkosten en audit-trail
                blijven intact onder een geanonimiseerde verwijzing. Gebruik dit uitsluitend bij een expliciet verzoek van de betrokkene.
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.06em',
                color: 'var(--muted-foreground)',
              }}
            >
              Reden (bv. DSAR ticket #) <span style={{ color: 'var(--destructive)' }}>*</span>
            </label>
            <input
              style={inputStyle}
              value={eraseReason}
              onChange={(e) => setEraseReason(e.target.value)}
              placeholder="bijv. DSAR-2026-042 — schriftelijk verzoek d.d. ..."
              maxLength={1000}
              autoFocus
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '8px',
              cursor: 'pointer',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              color: 'var(--foreground)',
              lineHeight: 1.4,
            }}
          >
            <input
              type="checkbox"
              checked={eraseAck}
              onChange={(e) => setEraseAck(e.target.checked)}
              style={{ marginTop: 3, flexShrink: 0 }}
            />
            <span>
              Ik bevestig dat dit een juridisch geldig verzoek om vergetelheid is, en dat deze actie niet ongedaan
              kan worden gemaakt nadat ik op <em>Definitief anonimiseren</em> klik.
            </span>
          </label>

          {eraseError && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                backgroundColor: 'rgba(239,68,68,0.08)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                color: 'var(--destructive)',
              }}
            >
              {eraseError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                setShowEraseConfirm(false)
                setEraseError(null)
                setEraseReason('')
                setEraseAck(false)
              }}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Annuleer
            </button>
            <button
              onClick={handleErase}
              disabled={!canErase}
              style={{
                padding: '8px 16px',
                borderRadius: 'var(--radius-sm)',
                border: 'none',
                background: canErase
                  ? 'linear-gradient(135deg, rgb(147,51,234), rgb(219,39,119))'
                  : 'rgba(147,51,234,0.3)',
                color: '#fff',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: canErase ? 'pointer' : 'not-allowed',
                opacity: eraseMut.isPending ? 0.7 : 1,
              }}
            >
              {eraseMut.isPending ? 'Bezig met anonimiseren...' : 'Definitief anonimiseren'}
            </button>
          </div>
        </motion.div>
      )}
      </>}
    </div>
  )
}
