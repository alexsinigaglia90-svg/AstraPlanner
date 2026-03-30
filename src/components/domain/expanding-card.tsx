'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { bouncy, snappy, gentle, containerStagger, fadeInUp } from '@/lib/motion'
import { useToast } from '@/components/domain/toast'
// GlassSelect replaced with native <select> to fix positioning in fixed overlay
import { RadialSkillGrader } from '@/components/domain/radial-skill-grader'

// ── Types ────────────────────────────────────────────────────────────────────

interface ExpandingCardProps {
  employee: {
    id: string
    first_name: string
    last_name: string
    employee_number: string
    contract_type: string
    weekly_hours_contracted: number
    home_site_id: string
    department_id: string | null
    crew_id: string | null
    job_role_id: string | null
    status: string
    is_multi_site_eligible: boolean
  }
  deptMap: Map<string, string>
  roleMap: Map<string, string>
  crewMap?: Map<string, string>
  departments: Array<{ id: string; name: string }>
  roles: Array<{ id: string; name: string }>
  crews: Array<{ id: string; name: string }>
  processes: Array<{ id: string; name: string }>
  siteId: string
  onClose: () => void
  onDeleted?: () => void
}

type TabKey = 'profiel' | 'skills' | 'status'

// ── Constants ────────────────────────────────────────────────────────────────

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'profiel', label: 'Profiel' },
  { key: 'skills', label: 'Skills' },
  { key: 'status', label: 'Status' },
]

const CONTRACT_OPTIONS = [
  { value: 'full_time', label: 'Full Time' },
  { value: 'part_time', label: 'Part Time' },
  { value: 'temporary', label: 'Tijdelijk' },
  { value: 'seasonal', label: 'Seizoen' },
  { value: 'contractor', label: 'Contractor' },
]

const CONTRACT_LABEL: Record<string, string> = {
  full_time: 'Full Time',
  part_time: 'Part Time',
  temporary: 'Tijdelijk',
  seasonal: 'Seizoen',
  contractor: 'Contractor',
}

const STATUS_DOT_COLOR: Record<string, string> = {
  active: '#10B981',
  on_leave: '#F59E0B',
  suspended: '#EF4444',
  terminated: '#94A3B8',
}

const STATUS_LABEL: Record<string, string> = {
  active: 'Beschikbaar',
  on_leave: 'Verlof',
  suspended: 'Geschorst',
  terminated: 'Beëindigd',
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Actief' },
  { value: 'on_leave', label: 'Verlof' },
  { value: 'suspended', label: 'Geschorst' },
  { value: 'terminated', label: 'Beëindigd' },
]

const DAY_LABELS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

// ── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(first: string, last: string) {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
}

function avatarGradient(name: string): string {
  const gradients: Record<string, string> = {
    A: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
    B: 'linear-gradient(135deg, #3B82F6, #6366F1)',
    C: 'linear-gradient(135deg, #10B981, #059669)',
    D: 'linear-gradient(135deg, #F59E0B, #EA580C)',
    E: 'linear-gradient(135deg, #EF4444, #DC2626)',
    F: 'linear-gradient(135deg, #8B5CF6, #A855F7)',
    G: 'linear-gradient(135deg, #14B8A6, #10B981)',
    H: 'linear-gradient(135deg, #F97316, #F59E0B)',
    I: 'linear-gradient(135deg, #6366F1, #3B82F6)',
    J: 'linear-gradient(135deg, #EC4899, #F43F5E)',
  }
  const letter = name.charAt(0).toUpperCase()
  return gradients[letter] ?? 'linear-gradient(135deg, #6366F1, #8B5CF6)'
}

// ── Sub-components ───────────────────────────────────────────────────────────

function ValueChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.5)',
        borderRadius: 12,
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          fontSize: 10,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--muted-foreground, #64748B)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--foreground, #1E1B4B)',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function StarRating({ level }: { level: number }) {
  return (
    <span style={{ fontSize: 12, letterSpacing: 1 }}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} style={{ color: i < level ? '#F59E0B' : '#CBD5E1' }}>
          {i < level ? '\u2605' : '\u2606'}
        </span>
      ))}
    </span>
  )
}

// ── Profile Tab ──────────────────────────────────────────────────────────────

function ProfileTab({
  employee,
  deptMap,
  roleMap,
  crewMap,
  departments,
  roles,
  crews,
  siteId,
  editing,
  onSaved,
}: {
  employee: ExpandingCardProps['employee']
  deptMap: Map<string, string>
  roleMap: Map<string, string>
  crewMap?: Map<string, string>
  departments: Array<{ id: string; name: string }>
  roles: Array<{ id: string; name: string }>
  crews: Array<{ id: string; name: string }>
  siteId: string
  editing: boolean
  onSaved: () => void
}) {
  const toast = useToast()
  const utils = trpc.useUtils()

  const [deptId, setDeptId] = useState(employee.department_id ?? '')
  const [crewId, setCrewId] = useState(employee.crew_id ?? '')
  const [roleId, setRoleId] = useState(employee.job_role_id ?? '')
  const [contract, setContract] = useState(employee.contract_type)
  const [hours, setHours] = useState(String(employee.weekly_hours_contracted))
  const [status, setStatus] = useState(employee.status)
  const [flashGreen, setFlashGreen] = useState(false)

  const upsert = trpc.workforce.upsertEmployee.useMutation({
    onSuccess: () => {
      utils.workforce.listEmployees.invalidate()
      toast.showSuccess('Medewerker opgeslagen')
      setFlashGreen(true)
      setTimeout(() => setFlashGreen(false), 600)
      onSaved()
    },
    onError: (err) => {
      toast.showError(err.message)
    },
  })

  const handleSave = useCallback(() => {
    upsert.mutate({
      id: employee.id,
      employee_number: employee.employee_number,
      first_name: employee.first_name,
      last_name: employee.last_name,
      contract_type: contract as 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor',
      weekly_hours_contracted: parseFloat(hours) || employee.weekly_hours_contracted,
      hourly_rate: (employee as Record<string, unknown>).hourly_rate as number ?? 0,
      home_site_id: siteId,
      department_id: deptId || null,
      crew_id: crewId || null,
      job_role_id: roleId || null,
      status: status as 'active' | 'on_leave' | 'suspended' | 'terminated',
      is_multi_site_eligible: employee.is_multi_site_eligible,
    })
  }, [upsert, employee, contract, hours, siteId, deptId, crewId, roleId, status])

  // Sync local state when employee prop changes
  useEffect(() => {
    setDeptId(employee.department_id ?? '')
    setCrewId(employee.crew_id ?? '')
    setRoleId(employee.job_role_id ?? '')
    setContract(employee.contract_type)
    setHours(String(employee.weekly_hours_contracted))
    setStatus(employee.status)
  }, [employee])

  if (!editing) {
    return (
      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="show"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 10,
        }}
      >
        <motion.div variants={fadeInUp}>
          <ValueChip label="Afdeling" value={employee.department_id ? (deptMap.get(employee.department_id) ?? '—') : '—'} />
        </motion.div>
        <motion.div variants={fadeInUp}>
          <ValueChip label="Crew" value={employee.crew_id ? (crewMap?.get(employee.crew_id) ?? '—') : '—'} />
        </motion.div>
        <motion.div variants={fadeInUp}>
          <ValueChip label="Role" value={employee.job_role_id ? (roleMap.get(employee.job_role_id) ?? '—') : '—'} />
        </motion.div>
        <motion.div variants={fadeInUp}>
          <ValueChip label="Contract" value={CONTRACT_LABEL[employee.contract_type] ?? employee.contract_type} />
        </motion.div>
        <motion.div variants={fadeInUp}>
          <ValueChip label="Uren/week" value={String(employee.weekly_hours_contracted)} />
        </motion.div>
        <motion.div variants={fadeInUp}>
          <ValueChip label="Status" value={STATUS_LABEL[employee.status] ?? employee.status} />
        </motion.div>
      </motion.div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={snappy}
      style={{ position: 'relative' }}
    >
      {flashGreen && (
        <motion.div
          initial={{ opacity: 0.5 }}
          animate={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 12,
            background: 'rgba(16,185,129,0.15)',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        />
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {/* Afdeling */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Afdeling
          </label>
          <select
            value={deptId}
            onChange={(e) => setDeptId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--foreground)', outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
          >
            <option value="">Kies afdeling...</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        {/* Crew */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Crew
          </label>
          <select
            value={crewId}
            onChange={(e) => setCrewId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--foreground)', outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
          >
            <option value="">Kies crew...</option>
            {crews.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        {/* Role */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Role
          </label>
          <select
            value={roleId}
            onChange={(e) => setRoleId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--foreground)', outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
          >
            <option value="">Kies rol...</option>
            {roles.filter((r, i, arr) => arr.findIndex((x) => x.name === r.name) === i).map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </div>
        {/* Contract */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Contract
          </label>
          <select
            value={contract}
            onChange={(e) => setContract(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--foreground)', outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
          >
            <option value="">Kies...</option>
            {CONTRACT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--muted-foreground)',
            }}
          >
            Uren/week
          </label>
          <input
            type="number"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px',
              borderRadius: 'var(--radius-sm, 8px)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              fontFamily: 'var(--font-body)',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
        {/* Status */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)' }}>
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--foreground)', outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none' }}
          >
            <option value="">Kies...</option>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        transition={snappy}
        onClick={handleSave}
        disabled={upsert.isPending}
        style={{
          marginTop: 14,
          width: '100%',
          padding: '10px 0',
          borderRadius: 10,
          border: 'none',
          background: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
          color: '#fff',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 600,
          cursor: upsert.isPending ? 'wait' : 'pointer',
          opacity: upsert.isPending ? 0.7 : 1,
        }}
      >
        {upsert.isPending ? 'Opslaan...' : 'Opslaan'}
      </motion.button>
    </motion.div>
  )
}

// ── Skills Tab ───────────────────────────────────────────────────────────────

function SkillsTab({
  employeeId,
  processes,
}: {
  employeeId: string
  processes: Array<{ id: string; name: string }>
}) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const [activeGrader, setActiveGrader] = useState<string | null>(null)
  const [addingSkill, setAddingSkill] = useState(false)
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [holdingId, setHoldingId] = useState<string | null>(null)

  const empQuery = trpc.workforce.getEmployee.useQuery({ id: employeeId })
  const isLoading = empQuery.isLoading
  const serverSkills = empQuery.data?.skills ?? []

  // Local state for instant display — initialized from server data
  const [localSkills, setLocalSkills] = useState<Array<{ process_id: string; proficiency_level: number }>>(
    serverSkills.map((s) => ({ process_id: s.process_id, proficiency_level: Number(s.proficiency_level) }))
  )

  // Sync local state when server data arrives/changes (but don't overwrite pending changes)
  const pendingRef = useRef<Map<string, number>>(new Map())
  const newSkillsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (serverSkills.length > 0) {
      setLocalSkills((prev) => {
        const merged = serverSkills.map((s) => {
          const pendingLevel = pendingRef.current.get(s.process_id)
          return {
            process_id: s.process_id,
            proficiency_level: pendingLevel ?? Number(s.proficiency_level),
          }
        })
        // Also include locally-added skills not yet in server data
        const serverIds = new Set(serverSkills.map((s) => s.process_id))
        const localOnly = prev.filter((s) => !serverIds.has(s.process_id) && newSkillsRef.current.has(s.process_id))
        return [...merged, ...localOnly]
      })
    }
  }, [serverSkills])

  const updateSkill = trpc.workforce.updateSkill.useMutation({
    onError: (err) => toast.showError(`Fout: ${err.message}`),
  })

  const deleteSkill = trpc.workforce.deleteSkill.useMutation({
    onSuccess: () => {
      void empQuery.refetch()
      void utils.workforce.listSkillMatrix.invalidate()
      toast.showSuccess('Skill verwijderd')
    },
    onError: (err) => toast.showError(`Fout: ${err.message}`),
  })

  // Batch save all pending changes on unmount
  useEffect(() => {
    const pendingChanges = pendingRef.current
    const newSkills = newSkillsRef.current
    const empId = employeeId
    const mutate = updateSkill.mutate
    const refetch = empQuery.refetch
    const invalidate = utils.workforce.listSkillMatrix.invalidate

    return () => {
      const hasChanges = pendingChanges.size > 0 || newSkills.size > 0
      if (hasChanges) {
        let count = 0
        const total = pendingChanges.size + newSkills.size
        const onDone = () => {
          count++
          if (count >= total) {
            void refetch()
            void invalidate()
          }
        }

        pendingChanges.forEach((level, processId) => {
          mutate(
            { employee_id: empId, process_id: processId, proficiency_level: level },
            { onSuccess: onDone, onError: onDone },
          )
        })
        newSkills.forEach((processId) => {
          if (!pendingChanges.has(processId)) {
            mutate(
              { employee_id: empId, process_id: processId, proficiency_level: 1 },
              { onSuccess: onDone, onError: onDone },
            )
          }
        })
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const processMap = new Map(processes.map((p) => [p.id, p.name]))
  const assignedIds = new Set(localSkills.map((s) => s.process_id))
  const available = processes.filter((p) => !assignedIds.has(p.id))

  const handleLevelChange = useCallback(
    (processId: string, newLevel: number) => {
      pendingRef.current.set(processId, newLevel)
      setLocalSkills((prev) =>
        prev.map((s) =>
          s.process_id === processId ? { ...s, proficiency_level: newLevel } : s
        )
      )
    },
    [],
  )

  const handleAddSkill = useCallback(
    (processId: string) => {
      setAddingSkill(false)
      newSkillsRef.current.add(processId)
      pendingRef.current.set(processId, 1)
      setLocalSkills((prev) => [...prev, { process_id: processId, proficiency_level: 1 }])
    },
    [],
  )

  const handleHoldStart = useCallback(
    (processId: string) => {
      setHoldingId(processId)
      holdTimerRef.current = setTimeout(() => {
        deleteSkill.mutate({ employee_id: employeeId, process_id: processId })
        // Also remove from local state and pending
        pendingRef.current.delete(processId)
        newSkillsRef.current.delete(processId)
        setLocalSkills((prev) => prev.filter((s) => s.process_id !== processId))
        setHoldingId(null)
      }, 1200)
    },
    [deleteSkill, employeeId],
  )

  const handleHoldEnd = useCallback(() => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
    setHoldingId(null)
  }, [])

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted-foreground)', fontSize: 13 }}>
        Laden...
      </div>
    )
  }

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
    >
      {localSkills.length === 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: 20,
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
          }}
        >
          Geen skills toegewezen
        </div>
      )}

      {localSkills.map((skill, idx) => {
        const name = processMap.get(skill.process_id) ?? 'Onbekend'
        const isHolding = holdingId === skill.process_id
        const isActive = activeGrader === skill.process_id
        const level = skill.proficiency_level
        const levelLabels = ['', 'Beginner', 'Basis', 'Competent', 'Gevorderd', 'Expert']
        const levelColors = ['', '#94A3B8', '#F59E0B', '#6366F1', '#8B5CF6', '#10B981']

        return (
          <motion.div
            key={skill.process_id}
            variants={fadeInUp}
            style={{ position: 'relative' }}
          >
            {/* Hold-to-delete progress overlay */}
            {isHolding && (
              <motion.div
                initial={{ width: '0%' }}
                animate={{ width: '100%' }}
                transition={{ duration: 1.2, ease: 'linear' }}
                style={{
                  position: 'absolute', top: 0, left: 0, bottom: 0,
                  borderRadius: 16, background: 'rgba(239,68,68,0.12)',
                  pointerEvents: 'none', zIndex: 1,
                }}
              />
            )}
            <motion.div
              whileHover={{ y: -2, boxShadow: '0 6px 20px rgba(99,102,241,0.12)' }}
              whileTap={{ scale: 0.97 }}
              onMouseDown={() => handleHoldStart(skill.process_id)}
              onMouseUp={handleHoldEnd}
              onMouseLeave={handleHoldEnd}
              onTouchStart={() => handleHoldStart(skill.process_id)}
              onTouchEnd={handleHoldEnd}
              onClick={() => setActiveGrader(isActive ? null : skill.process_id)}
              transition={bouncy}
              style={{
                position: 'relative',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.04))'
                  : 'rgba(255,255,255,0.7)',
                backdropFilter: 'blur(8px)',
                border: isActive
                  ? '2px solid rgba(99,102,241,0.3)'
                  : '1px solid rgba(255,255,255,0.5)',
                borderRadius: 16,
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                cursor: 'pointer',
                userSelect: 'none',
                zIndex: 2,
              }}
            >
              {/* Mini proficiency ring */}
              <div style={{ position: 'relative', width: 36, height: 36, flexShrink: 0 }}>
                <svg width="36" height="36" viewBox="0 0 36 36">
                  <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(100,116,139,0.1)" strokeWidth="3" />
                  <motion.circle
                    cx="18" cy="18" r="14"
                    fill="none"
                    stroke={levelColors[level] ?? '#6366F1'}
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeDasharray={`${(level / 5) * 88} 88`}
                    transform="rotate(-90 18 18)"
                    initial={{ strokeDasharray: '0 88' }}
                    animate={{ strokeDasharray: `${(level / 5) * 88} 88` }}
                    transition={{ duration: 0.8, delay: idx * 0.1, ease: [0.22, 1, 0.36, 1] }}
                  />
                </svg>
                <div style={{
                  position: 'absolute', inset: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700,
                  color: levelColors[level] ?? 'var(--foreground)',
                }}>
                  {level}
                </div>
              </div>

              {/* Name + level label */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
                  color: 'var(--foreground)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {name}
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)', fontSize: 10, fontWeight: 500,
                  color: levelColors[level] ?? 'var(--muted-foreground)',
                  marginTop: 1,
                }}>
                  {levelLabels[level] ?? `Level ${level}`}
                </div>
              </div>

              {/* Tap hint */}
              <motion.div
                animate={{ x: isActive ? 0 : [0, 3, 0] }}
                transition={{ repeat: isActive ? 0 : Infinity, repeatDelay: 3, duration: 0.4 }}
                style={{
                  fontSize: 11, color: 'var(--muted-foreground)', opacity: 0.5,
                  fontFamily: 'var(--font-body)',
                }}
              >
                {isActive ? '✕' : 'Tap →'}
              </motion.div>
            </motion.div>

            {/* Radial grader popover */}
            <AnimatePresence>
              {isActive && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 8 }}
                  transition={bouncy}
                  style={{
                    position: 'absolute',
                    top: -200,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 60,
                  }}
                >
                  <RadialSkillGrader
                    processName={name}
                    level={level}
                    onChange={(lvl) => handleLevelChange(skill.process_id, lvl)}
                    onClose={() => setActiveGrader(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )
      })}

      {/* Add skill */}
      <div style={{ position: 'relative' }}>
        <AnimatePresence>
          {addingSkill && (
            <motion.div
              initial={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: 10, filter: 'blur(8px)' }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              style={{
                position: 'absolute',
                bottom: '100%',
                left: 0,
                right: 0,
                marginBottom: 6,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                maxHeight: 200,
                overflowY: 'auto',
                padding: 6,
                borderRadius: 14,
                background: 'rgba(15,23,42,0.85)',
                backdropFilter: 'blur(12px)',
                boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
                zIndex: 50,
              }}
            >
              {available.length === 0 ? (
                <div style={{ padding: '12px 14px', fontSize: 12, color: '#94A3B8', textAlign: 'center' }}>
                  Alle processen zijn al toegewezen
                </div>
              ) : (
                available.map((p, i) => (
                  <motion.button
                    key={p.id}
                    initial={{ opacity: 0, x: 12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => handleAddSkill(p.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: 'transparent',
                      color: '#f8fafc',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                      textAlign: 'left',
                      width: '100%',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#818CF8', flexShrink: 0 }} />
                    {p.name}
                  </motion.button>
                ))
              )}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => setAddingSkill(false)}
                style={{
                  padding: '6px 12px', borderRadius: 8, border: 'none',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: 11, color: '#94A3B8',
                }}
              >
                Annuleren
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      {!addingSkill ? (
        <motion.button
          variants={fadeInUp}
          whileTap={{ scale: 0.97 }}
          onClick={() => setAddingSkill(true)}
          style={{
            padding: '10px 0',
            borderRadius: 10,
            border: '1px dashed var(--border)',
            background: 'transparent',
            color: 'var(--primary, #6366F1)',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Skill toevoegen
        </motion.button>
      ) : null}
      </div>
    </motion.div>
  )
}

// ── Status Tab ───────────────────────────────────────────────────────────────

function StatusTab({ employee }: { employee: ExpandingCardProps['employee'] }) {
  const router = useRouter()
  const dotColor = STATUS_DOT_COLOR[employee.status] ?? '#94A3B8'
  const statusLabel = STATUS_LABEL[employee.status] ?? employee.status

  // Try loading absence data — fail silently
  const { data: absences, isError } = trpc.absence.listActive.useQuery(undefined as never, {
    retry: false,
  })

  // Simple week availability (Mon-Sun) — default all weekdays available
  const weekDays = DAY_LABELS.map((label, i) => {
    const isWeekend = i >= 5
    const isAbsent = employee.status === 'on_leave' || employee.status === 'suspended'
    return {
      label,
      color: isWeekend ? '#E2E8F0' : isAbsent ? '#FCA5A5' : '#86EFAC',
    }
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={bouncy}
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      {/* Current status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: dotColor,
            boxShadow: `0 0 8px ${dotColor}66`,
          }}
        />
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 16,
            fontWeight: 700,
            color: 'var(--foreground)',
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Week availability */}
      <div>
        <span
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--muted-foreground)',
            marginBottom: 8,
            display: 'block',
          }}
        >
          Week beschikbaarheid
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {weekDays.map((day) => (
            <div
              key={day.label}
              style={{
                flex: 1,
                textAlign: 'center',
                borderRadius: 8,
                padding: '8px 0',
                background: day.color,
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                fontWeight: 600,
                color: '#334155',
              }}
            >
              {day.label}
            </div>
          ))}
        </div>
      </div>

      {/* Absence info */}
      {isError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(245,158,11,0.08)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
          }}
        >
          Verzuimdata niet beschikbaar
        </div>
      )}

      {/* Navigation links */}
      <div style={{ display: 'flex', gap: 10 }}>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/dashboard/absence')}
          style={{
            flex: 1,
            padding: '9px 0',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--primary, #6366F1)',
            cursor: 'pointer',
          }}
        >
          Ga naar Verzuim
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => router.push('/dashboard/leave')}
          style={{
            flex: 1,
            padding: '9px 0',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'transparent',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--primary, #6366F1)',
            cursor: 'pointer',
          }}
        >
          Ga naar Verlof
        </motion.button>
      </div>
    </motion.div>
  )
}

// ── Main Component ───────────────────────────────────────────────────────────

export function ExpandingCard({
  employee,
  deptMap,
  roleMap,
  crewMap,
  departments,
  roles,
  crews,
  processes,
  siteId,
  onClose,
}: ExpandingCardProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('profiel')
  const [editing, setEditing] = useState(false)

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [onClose])

  const initials = getInitials(employee.first_name, employee.last_name)
  const deptName = employee.department_id ? (deptMap.get(employee.department_id) ?? '') : ''
  const crewName = employee.crew_id ? (crewMap?.get(employee.crew_id) ?? '') : ''
  const contractLabel = CONTRACT_LABEL[employee.contract_type] ?? employee.contract_type
  const subtitle = [deptName, crewName, contractLabel].filter(Boolean).join(' \u00B7 ')
  const statusColor = STATUS_DOT_COLOR[employee.status] ?? '#94A3B8'

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(15,23,42,0.4)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 9990,
        }}
      />

      {/* Centering wrapper */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9991,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
      {/* Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        transition={bouncy}
        style={{
          width: 440,
          maxWidth: 'calc(100vw - 32px)',
          maxHeight: 'calc(100vh - 64px)',
          overflow: 'visible',
          pointerEvents: 'auto',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(20px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.8)',
          border: '1px solid rgba(255,255,255,0.7)',
          borderRadius: 24,
          boxShadow: '0 24px 80px rgba(30,27,75,0.18), 0 4px 16px rgba(30,27,75,0.06)',
          padding: '24px 24px 20px',
        }}
      >
        {/* ── Header ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 18 }}>
          {/* Avatar */}
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 14,
              background: avatarGradient(employee.first_name),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--font-display, "Cal Sans", sans-serif)',
              fontSize: 18,
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                style={{
                  fontFamily: 'var(--font-display, "Cal Sans", sans-serif)',
                  fontSize: 18,
                  fontWeight: 700,
                  color: 'var(--foreground, #1E1B4B)',
                  lineHeight: 1.2,
                }}
              >
                {employee.first_name} {employee.last_name}
              </span>
              <div
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: statusColor,
                  flexShrink: 0,
                }}
              />
            </div>
            <span
              style={{
                fontFamily: 'var(--font-body, "DM Sans", sans-serif)',
                fontSize: 12,
                color: 'var(--muted-foreground, #64748B)',
                lineHeight: 1.4,
              }}
            >
              {subtitle}
            </span>
          </div>

          {/* Edit / Save toggle — profile tab only */}
          {activeTab === 'profiel' && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              transition={snappy}
              onClick={() => setEditing(!editing)}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                border: 'none',
                background: editing ? 'rgba(16,185,129,0.12)' : 'rgba(99,102,241,0.08)',
                color: editing ? '#059669' : '#6366F1',
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              {editing ? 'Annuleren' : 'Bewerken'}
            </motion.button>
          )}

          {/* Close button */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            transition={snappy}
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: 'none',
              background: 'rgba(100,116,139,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
              color: 'var(--muted-foreground)',
            }}
          >
            <X size={16} />
          </motion.button>
        </div>

        {/* ── Tab Bar ────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            marginBottom: 18,
            background: 'rgba(100,116,139,0.06)',
            borderRadius: 10,
            padding: 3,
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <motion.button
                key={tab.key}
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  setActiveTab(tab.key)
                  if (tab.key !== 'profiel') setEditing(false)
                }}
                style={{
                  flex: 1,
                  position: 'relative',
                  padding: '7px 0',
                  borderRadius: 8,
                  border: 'none',
                  background: 'transparent',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: 600,
                  color: isActive ? '#fff' : 'var(--muted-foreground)',
                  cursor: 'pointer',
                  zIndex: 1,
                }}
              >
                {isActive && (
                  <motion.div
                    layoutId="expanding-card-tab-pill"
                    transition={snappy}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      borderRadius: 8,
                      background: '#6366F1',
                      zIndex: -1,
                    }}
                  />
                )}
                {tab.label}
              </motion.button>
            )
          })}
        </div>

        {/* ── Tab Content ────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={snappy}
          >
            {activeTab === 'profiel' && (
              <ProfileTab
                employee={employee}
                deptMap={deptMap}
                roleMap={roleMap}
                crewMap={crewMap}
                departments={departments}
                roles={roles}
                crews={crews}
                siteId={siteId}
                editing={editing}
                onSaved={() => setEditing(false)}
              />
            )}
            {activeTab === 'skills' && (
              <SkillsTab employeeId={employee.id} processes={processes} />
            )}
            {activeTab === 'status' && <StatusTab employee={employee} />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
      </div>
    </AnimatePresence>
  )
}
