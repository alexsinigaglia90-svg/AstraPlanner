'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Save, Trash2, AlertTriangle } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { scalePress, bouncy } from '@/lib/motion'

interface EditEmployeeFormProps {
  employee: {
    id: string
    employee_number: string
    first_name: string
    last_name: string
    email: string | null
    contract_type: string
    weekly_hours_contracted: number
    hourly_rate: number
    home_site_id: string
    department_id: string | null
    is_multi_site_eligible: boolean
    status: string
  }
  onClose: () => void
  onDeleted?: () => void
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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  appearance: 'none' as const,
  cursor: 'pointer',
  backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: '32px',
}

export function EditEmployeeForm({ employee, onClose, onDeleted }: EditEmployeeFormProps) {
  const utils = trpc.useUtils()
  const upsert = trpc.workforce.upsertEmployee.useMutation()
  const deleteMut = trpc.workforce.deleteEmployee.useMutation()

  const [form, setForm] = useState({
    first_name: employee.first_name,
    last_name: employee.last_name,
    employee_number: employee.employee_number,
    email: employee.email ?? '',
    contract_type: employee.contract_type,
    weekly_hours_contracted: employee.weekly_hours_contracted,
    hourly_rate: employee.hourly_rate,
    is_multi_site_eligible: employee.is_multi_site_eligible,
    status: employee.status,
  })

  const [error, setError] = useState<string | null>(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const update = (key: string, value: unknown) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setError(null)
    try {
      await upsert.mutateAsync({
        id: employee.id,
        employee_number: form.employee_number,
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email || null,
        contract_type: form.contract_type as 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor',
        weekly_hours_contracted: form.weekly_hours_contracted,
        hourly_rate: form.hourly_rate,
        home_site_id: employee.home_site_id,
        department_id: employee.department_id,
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
        <Field label="Contract Type" required>
          <select
            style={selectStyle}
            value={form.contract_type}
            onChange={(e) => update('contract_type', e.target.value)}
          >
            {CONTRACT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="Status" required>
          <select
            style={selectStyle}
            value={form.status}
            onChange={(e) => update('status', e.target.value)}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>

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
            Save Changes
          </>
        )}
      </motion.button>

      {/* Divider */}
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
    </div>
  )
}
