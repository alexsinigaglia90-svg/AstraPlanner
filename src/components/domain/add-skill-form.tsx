'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { scalePress, snappy } from '@/lib/motion'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AddSkillFormProps {
  employeeId: string
  onClose: () => void
}

const LEVEL_META: Record<number, { label: string; multiplier: string }> = {
  1: { label: 'Trainee',    multiplier: '0.60×' },
  2: { label: 'Basic',      multiplier: '0.75×' },
  3: { label: 'Competent',  multiplier: '0.90×' },
  4: { label: 'Proficient', multiplier: '1.00×' },
  5: { label: 'Expert',     multiplier: '1.10×' },
}

// ── Label ─────────────────────────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-body)',
        fontSize: '11px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: 'var(--muted-foreground)',
        display: 'block',
        marginBottom: '6px',
      }}
    >
      {children}
    </span>
  )
}

// ── Input style ───────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: '100%',
  height: '48px',
  padding: '0 12px',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--muted)',
  color: 'var(--foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: '14px',
  outline: 'none',
  boxSizing: 'border-box',
}

// ── Main form ─────────────────────────────────────────────────────────────────

export function AddSkillForm({ employeeId, onClose }: AddSkillFormProps) {
  const activeSiteId = useSiteStore((s) => s.activeSiteId)

  const [processId, setProcessId]           = useState('')
  const [level, setLevel]                   = useState(3)
  const [certDate, setCertDate]             = useState('')
  const [expiryDate, setExpiryDate]         = useState('')

  const { data: processes = [], isLoading: loadingProcesses } = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId },
  )

  const utils = trpc.useUtils()

  const { mutate: saveSkill, isPending, error } = trpc.workforce.updateSkill.useMutation({
    onSuccess: () => {
      utils.workforce.getEmployee.invalidate({ id: employeeId })
      onClose()
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!processId) return
    saveSkill({
      employee_id:       employeeId,
      process_id:        processId,
      proficiency_level: level,
      certification_date: certDate || null,
      expiry_date:       (certDate && expiryDate) ? expiryDate : null,
    })
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

      {/* Process */}
      <div>
        <FieldLabel>Process</FieldLabel>
        <select
          required
          value={processId}
          onChange={(e) => setProcessId(e.target.value)}
          disabled={loadingProcesses}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">
            {loadingProcesses ? 'Loading…' : 'Select a process'}
          </option>
          {processes.map((p) => (
            <option key={p.id as string} value={p.id as string}>
              {p.name as string}
            </option>
          ))}
        </select>
      </div>

      {/* Proficiency level */}
      <div>
        <FieldLabel>Proficiency Level</FieldLabel>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <motion.button
              key={i}
              type="button"
              variants={scalePress}
              whileTap="press"
              onClick={() => setLevel(i)}
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                border: '2px solid',
                borderColor: i <= level ? 'var(--primary)' : 'var(--border)',
                backgroundColor: i <= level ? 'var(--primary)' : 'var(--muted)',
                cursor: 'pointer',
                transition: 'background-color 0.15s, border-color 0.15s',
              }}
            />
          ))}
        </div>
        <motion.div
          key={level}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={snappy}
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--foreground)',
            fontWeight: 600,
          }}
        >
          {LEVEL_META[level]?.label}
          <span
            style={{
              marginLeft: '8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '12px',
              color: 'var(--muted-foreground)',
              fontWeight: 400,
            }}
          >
            {LEVEL_META[level]?.multiplier} productivity
          </span>
        </motion.div>
      </div>

      {/* Certification date */}
      <div>
        <FieldLabel>Certification Date (optional)</FieldLabel>
        <input
          type="date"
          value={certDate}
          onChange={(e) => {
            setCertDate(e.target.value)
            if (!e.target.value) setExpiryDate('')
          }}
          style={inputStyle}
        />
      </div>

      {/* Expiry date — only when cert date set */}
      {certDate && (
        <div>
          <FieldLabel>Expiry Date (optional)</FieldLabel>
          <input
            type="date"
            value={expiryDate}
            min={certDate}
            onChange={(e) => setExpiryDate(e.target.value)}
            style={inputStyle}
          />
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--destructive)', margin: 0 }}>
          {error.message}
        </p>
      )}

      {/* Submit */}
      <motion.button
        type="submit"
        variants={scalePress}
        whileTap="press"
        disabled={isPending || !processId}
        style={{
          padding: '12px 20px',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
          color: '#FFFFFF',
          fontFamily: 'var(--font-body)',
          fontSize: '14px',
          fontWeight: 600,
          cursor: isPending || !processId ? 'not-allowed' : 'pointer',
          opacity: isPending || !processId ? 0.6 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {isPending ? 'Saving…' : 'Save Skill'}
      </motion.button>
    </form>
  )
}
