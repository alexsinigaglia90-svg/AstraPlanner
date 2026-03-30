'use client'

import { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Plus } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { containerStagger, fadeInUp, bouncy, snappy, scalePress } from '@/lib/motion'
import { useDemoStore } from '@/hooks/use-demo'
import { demoEmployees, demoProcesses, demoDepartments } from '@/components/onboarding/demo-seed'
import { Avatar } from '@/components/domain/avatar'
import { AnimatedCounter } from '@/components/domain/animated-counter'
import { getDeptColor } from '@/components/domain/process-card'
import { useToast } from '@/components/domain/toast'
import { RadialSkillGrader } from '@/components/domain/radial-skill-grader'

// ── Proficiency config (for cell colors) ─────────────────────────────────────

const LEVELS: Record<number, { label: string; color: string }> = {
  0: { label: 'None',     color: 'transparent' },
  1: { label: 'Beginner', color: 'rgba(148,163,184,0.2)' },
  2: { label: 'Basic',    color: 'rgba(99,102,241,0.2)' },
  3: { label: 'Skilled',  color: 'rgba(99,102,241,0.4)' },
  4: { label: 'Advanced', color: 'rgba(16,185,129,0.45)' },
  5: { label: 'Expert',   color: 'rgba(245,158,11,0.5)' },
}

const DIAL_COLORS: Record<number, string> = {
  1: 'rgba(99,102,241,0.35)',
  2: 'rgba(99,102,241,0.50)',
  3: 'rgba(99,102,241,0.70)',
  4: 'rgba(16,185,129,0.65)',
  5: 'rgba(245,158,11,0.75)',
}

// ── Stat Card (compact) ─────────────────────────────────────────────────────

function StatCard({ label, value, suffix }: { label: string; value: number; suffix?: string }) {
  return (
    <motion.div
      variants={fadeInUp}
      style={{
        flex: '1 1 140px',
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '10px 14px',
        boxShadow: 'var(--elevation-1)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 10,
          fontWeight: 500,
          color: 'var(--muted-foreground)',
          marginBottom: 2,
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </div>
      <AnimatedCounter
        value={value}
        suffix={suffix ?? ''}
        style={{ fontSize: 22, fontWeight: 800, color: 'var(--foreground)' }}
      />
    </motion.div>
  )
}

// ── Skeleton Loader ─────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div style={{ padding: 32 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              flex: '1 1 140px',
              height: 60,
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--muted)',
              opacity: 0.5,
              animation: 'pulse 1.5s ease-in-out infinite',
            }}
          />
        ))}
      </div>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          style={{
            height: 36,
            borderRadius: 'var(--radius-sm)',
            backgroundColor: 'var(--muted)',
            opacity: 0.3 + (i % 3) * 0.15,
            marginBottom: 1,
          }}
        />
      ))}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
      `}</style>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function SkillMatrixPage() {
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const DEMO_MSG = 'Dit is een demo — start je eigen omgeving om wijzigingen te maken'
  const { showError, showSuccess } = useToast()
  const utils = trpc.useUtils()
  const containerRef = useRef<HTMLDivElement>(null)

  const [search, setSearch] = useState('')
  const [activeDept, setActiveDept] = useState<string | null>(null)
  const [dialCell, setDialCell] = useState<{ empId: string; procId: string; rect: DOMRect } | null>(null)
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)

  // ── Queries ──────────────────────────────────────────────────────────────

  const employees = trpc.workforce.listEmployees.useQuery(
    { site_id: activeSiteId!, limit: 200 },
    { enabled: !!activeSiteId && !isDemo },
  )
  const processes = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )
  const skills = trpc.workforce.listSkillMatrix.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )
  const departments = trpc.org.listDepartments.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )

  // ── Mutations ──────────────────────────────────────────────────────────

  const updateSkill = trpc.workforce.updateSkill.useMutation()
  const deleteSkill = trpc.workforce.deleteSkill.useMutation()

  // ── Derived data ───────────────────────────────────────────────────────

  // Build demo skill matrix from embedded employee skills
  const demoSkillEntries = isDemo
    ? demoEmployees.flatMap((e) =>
        e.skills.map((s) => ({ employee_id: e.id, process_id: s.process_id, proficiency_level: s.proficiency_level }))
      )
    : []

  const empData = isDemo ? { items: demoEmployees.filter((e) => e.home_site_id === activeSiteId) as unknown as NonNullable<typeof employees.data>['items'] } : employees.data
  const procData = isDemo ? (demoProcesses as unknown as typeof processes.data & NonNullable<typeof processes.data>) : (processes.data ?? [])
  const skillData = isDemo ? demoSkillEntries : (skills.data ?? [])
  const deptData = isDemo ? demoDepartments.filter((d) => d.site_id === activeSiteId) : (departments.data ?? [])

  // Base skill map from server data
  const serverSkillMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of skillData) {
      map.set(`${s.employee_id}:${s.process_id}`, s.proficiency_level)
    }
    return map
  }, [skillData])

  // Local optimistic overrides layered on top of server data
  const [optimisticOverrides, setOptimisticOverrides] = useState<Map<string, number>>(new Map())

  // Merged skill map: optimistic overrides take precedence
  const skillMap = useMemo(() => {
    const map = new Map(serverSkillMap)
    for (const [key, val] of optimisticOverrides) {
      if (val === 0) map.delete(key)
      else map.set(key, val)
    }
    return map
  }, [serverSkillMap, optimisticOverrides])

  // Clear optimistic overrides when server data refreshes
  useEffect(() => {
    setOptimisticOverrides(new Map())
  }, [skillData])

  const deptMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; color: string }>()
    for (const d of deptData) {
      map.set(d.id, d)
    }
    return map
  }, [deptData])

  const groupedProcesses = useMemo(() => {
    const procs = procData
    const groups = new Map<string, typeof procs>()
    for (const p of procs) {
      const list = groups.get(p.department_id) ?? []
      list.push(p)
      groups.set(p.department_id, list)
    }
    return Array.from(groups.entries()).sort((a, b) => {
      const na = deptMap.get(a[0])?.name ?? ''
      const nb = deptMap.get(b[0])?.name ?? ''
      return na.localeCompare(nb)
    })
  }, [procData, deptMap])

  const orderedProcesses = useMemo(
    () => groupedProcesses.flatMap(([, procs]) => procs),
    [groupedProcesses],
  )

  const filteredEmployees = useMemo(() => {
    let list = empData?.items ?? []
    if (activeDept) {
      list = list.filter((e: { department_id: string | null }) => e.department_id === activeDept)
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (e: { first_name: string; last_name: string }) =>
          `${e.first_name} ${e.last_name}`.toLowerCase().includes(q),
      )
    }
    return list
  }, [empData, activeDept, search])

  // ── Statistics ─────────────────────────────────────────────────────────

  const stats = useMemo(() => {
    const empList = filteredEmployees as { id: string }[]
    const procList = orderedProcesses
    const totalSkills = skillData.length
    const totalCells = empList.length * procList.length
    const filledCells = empList.reduce((acc, emp) => {
      return acc + procList.filter((proc) => (skillMap.get(`${emp.id}:${proc.id}`) ?? 0) > 0).length
    }, 0)
    const avgCoverage = empList.length > 0 && procList.length > 0
      ? Math.round((filledCells / totalCells) * 100)
      : 0
    const skillGaps = totalCells - filledCells
    return { totalSkills, avgCoverage, skillGaps }
  }, [filteredEmployees, orderedProcesses, skillMap, skillData])

  // ── Coverage per employee ──────────────────────────────────────────────

  const employeeCoverage = useCallback(
    (empId: string): number => {
      const total = orderedProcesses.length
      if (total === 0) return 0
      const filled = orderedProcesses.filter(
        (proc) => (skillMap.get(`${empId}:${proc.id}`) ?? 0) > 0,
      ).length
      return Math.round((filled / total) * 100)
    },
    [orderedProcesses, skillMap],
  )

  // ── Handlers ───────────────────────────────────────────────────────────

  const handleCellClick = useCallback(
    (empId: string, procId: string, e: React.MouseEvent<HTMLTableCellElement>) => {
      if (selectedEmployee) return
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setDialCell({ empId, procId, rect })
    },
    [selectedEmployee],
  )

  const handleDialSelect = useCallback(
    (level: number) => {
      if (!dialCell) return
      if (isDemo) { showError(DEMO_MSG); setDialCell(null); return }
      const key = `${dialCell.empId}:${dialCell.procId}`

      // Optimistic: update UI instantly
      setOptimisticOverrides((prev) => new Map(prev).set(key, level))
      setDialCell(null)

      // Fire-and-forget: server call in background
      updateSkill.mutate(
        { employee_id: dialCell.empId, process_id: dialCell.procId, proficiency_level: level },
        {
          onSuccess: () => utils.workforce.listSkillMatrix.invalidate(),
          onError: (err) => {
            setOptimisticOverrides((prev) => { const next = new Map(prev); next.delete(key); return next })
            showError(err instanceof Error ? err.message : 'Failed to update skill')
          },
        },
      )
    },
    [dialCell, updateSkill, utils, showError, isDemo],
  )

  const handleDialRemove = useCallback(() => {
    if (!dialCell) return
    if (isDemo) { showError(DEMO_MSG); setDialCell(null); return }
    const key = `${dialCell.empId}:${dialCell.procId}`

    // Optimistic: remove from UI instantly
    setOptimisticOverrides((prev) => new Map(prev).set(key, 0))
    setDialCell(null)

    deleteSkill.mutate(
      { employee_id: dialCell.empId, process_id: dialCell.procId },
      {
        onSuccess: () => utils.workforce.listSkillMatrix.invalidate(),
        onError: (err) => {
          setOptimisticOverrides((prev) => { const next = new Map(prev); next.delete(key); return next })
          showError(err instanceof Error ? err.message : 'Failed to remove skill')
        },
      },
    )
  }, [dialCell, deleteSkill, utils, showError, isDemo])

  const bulkImportSkillsMutation = trpc.workforce.bulkImportSkills.useMutation()

  const handleBulkSet = useCallback(
    (level: number | 'clear') => {
      if (!selectedEmployee) return
      if (isDemo) { showError(DEMO_MSG); return }

      // Optimistic: update all cells instantly
      setOptimisticOverrides((prev) => {
        const next = new Map(prev)
        for (const proc of orderedProcesses) {
          next.set(`${selectedEmployee}:${proc.id}`, level === 'clear' ? 0 : level)
        }
        return next
      })

      const empId = selectedEmployee
      setSelectedEmployee(null)

      if (level === 'clear') {
        // Batch delete: fire individual deletes but don't await them sequentially
        const toDelete = orderedProcesses.filter((proc) => (serverSkillMap.get(`${empId}:${proc.id}`) ?? 0) > 0)
        Promise.all(toDelete.map((proc) => deleteSkill.mutateAsync({ employee_id: empId, process_id: proc.id })))
          .then(() => utils.workforce.listSkillMatrix.invalidate())
          .catch((err) => showError(err instanceof Error ? err.message : 'Failed to clear skills'))
      } else {
        // Batch set: use bulkImportSkills for one server call
        const skills = orderedProcesses.map((proc) => ({ employee_id: empId, process_id: proc.id, proficiency_level: level }))
        bulkImportSkillsMutation.mutate(
          { skills },
          {
            onSuccess: () => { utils.workforce.listSkillMatrix.invalidate(); showSuccess(`All skills set to level ${level}`) },
            onError: (err) => showError(err instanceof Error ? err.message : 'Failed to update skills'),
          },
        )
      }
    },
    [selectedEmployee, orderedProcesses, serverSkillMap, deleteSkill, bulkImportSkillsMutation, utils, showError, showSuccess, isDemo],
  )

  const handleEmployeeNameClick = useCallback(
    (empId: string) => {
      setDialCell(null)
      setSelectedEmployee((prev) => (prev === empId ? null : empId))
    },
    [],
  )

  // ── Guards ─────────────────────────────────────────────────────────────

  if (!activeSiteId) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted-foreground)' }}>
        Select a site to view the skill matrix.
      </div>
    )
  }

  const isLoading =
    employees.isLoading || processes.isLoading || skills.isLoading || departments.isLoading

  if (isLoading) return <SkeletonGrid />

  const hasData = filteredEmployees.length > 0 && orderedProcesses.length > 0

  const selectedEmpData = selectedEmployee
    ? (filteredEmployees as { id: string; first_name: string; last_name: string }[]).find(
        (e) => e.id === selectedEmployee,
      )
    : null

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ padding: '24px 32px', maxWidth: '100%', overflow: 'hidden' }}
    >
      {/* Header */}
      <motion.div variants={fadeInUp} style={{ marginBottom: 16 }}>
        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 24,
            fontWeight: 800,
            color: 'var(--foreground)',
            margin: 0,
          }}
        >
          Skill Matrix
        </h1>
      </motion.div>

      {/* Stat Cards + Filters — single compact row */}
      {hasData && (
        <motion.div
          variants={fadeInUp}
          style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'stretch' }}
        >
          <StatCard label="Skills" value={stats.totalSkills} />
          <StatCard label="Coverage" value={stats.avgCoverage} suffix="%" />
          <StatCard label="Gaps" value={stats.skillGaps} />
        </motion.div>
      )}

      {/* Filters — inline row */}
      <motion.div
        variants={fadeInUp}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        {/* Department chips */}
        <button
          onClick={() => setActiveDept(null)}
          style={{
            padding: '4px 12px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid',
            borderColor: !activeDept ? 'var(--primary)' : 'var(--border)',
            backgroundColor: !activeDept ? 'rgba(99,102,241,0.08)' : 'transparent',
            color: !activeDept ? 'var(--primary)' : 'var(--muted-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          All
        </button>
        {deptData.map((dept) => {
          const active = activeDept === dept.id
          const dc = getDeptColor(dept.color)
          return (
            <button
              key={dept.id}
              onClick={() => setActiveDept(active ? null : dept.id)}
              style={{
                padding: '4px 12px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid',
                borderColor: active ? dc.main : 'var(--border)',
                backgroundColor: active ? dc.bg : 'transparent',
                color: active ? dc.main : 'var(--muted-foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {dept.name}
            </button>
          )
        })}

        {/* Search */}
        <div style={{ position: 'relative', marginLeft: 'auto', width: 180 }}>
          <Search
            size={12}
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted-foreground)',
              pointerEvents: 'none',
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            style={{
              width: '100%',
              padding: '5px 26px 5px 26px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              outline: 'none',
            }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: 6,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
                padding: 0,
                display: 'flex',
              }}
            >
              <X size={12} />
            </button>
          )}
        </div>
      </motion.div>

      {/* Bulk Action Bar */}
      <AnimatePresence>
        {selectedEmpData && (
          <motion.div
            initial={{ opacity: 0, y: -12, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: -12, height: 0 }}
            transition={bouncy}
            style={{
              marginBottom: 10,
              padding: '8px 14px',
              backgroundColor: 'rgba(99,102,241,0.06)',
              border: '1px solid rgba(99,102,241,0.15)',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--foreground)',
              }}
            >
              Set all for {selectedEmpData.first_name}:
            </span>
            {[1, 2, 3, 4, 5].map((lvl) => (
              <motion.button
                key={lvl}
                variants={scalePress}
                whileTap="press"
                onClick={() => handleBulkSet(lvl)}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: '50%',
                  border: '1.5px solid var(--border)',
                  backgroundColor: DIAL_COLORS[lvl],
                  color: '#fff',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 800,
                  fontSize: 11,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {lvl}
              </motion.button>
            ))}
            <button
              onClick={() => handleBulkSet('clear')}
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--destructive)',
                backgroundColor: 'transparent',
                color: 'var(--destructive)',
                fontFamily: 'var(--font-body)',
                fontSize: 11,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
            <button
              onClick={() => setSelectedEmployee(null)}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
                padding: 2,
                display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Matrix */}
      {!hasData ? (
        <motion.div
          variants={fadeInUp}
          style={{
            padding: 60,
            textAlign: 'center',
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-body)',
            fontSize: 14,
          }}
        >
          Set up departments and processes first.
        </motion.div>
      ) : (
        <motion.div
          ref={containerRef}
          variants={fadeInUp}
          style={{
            overflow: 'auto',
            maxHeight: 'calc(100vh - 300px)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--card)',
            position: 'relative',
          }}
        >
          <table
            style={{
              borderCollapse: 'collapse',
              borderSpacing: 0,
              minWidth: '100%',
            }}
          >
            <thead>
              {/* Department grouping row */}
              <tr>
                <th
                  style={{
                    position: 'sticky',
                    left: 0,
                    top: 0,
                    zIndex: 4,
                    width: 140,
                    minWidth: 140,
                    maxWidth: 140,
                    backgroundColor: 'var(--card)',
                    borderBottom: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                  }}
                  rowSpan={2}
                />
                {groupedProcesses.map(([deptId, procs]) => {
                  const dept = deptMap.get(deptId)
                  const dc = getDeptColor(dept?.color ?? 'indigo')
                  return (
                    <th
                      key={deptId}
                      colSpan={procs.length}
                      style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 3,
                        padding: '4px 2px',
                        backgroundColor: 'var(--card)',
                        borderBottom: `2px solid ${dc.main}`,
                        color: dc.main,
                        fontFamily: 'var(--font-display)',
                        fontSize: 9,
                        fontWeight: 700,
                        textAlign: 'center',
                        whiteSpace: 'nowrap',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                      }}
                    >
                      {dept?.name ?? 'Unknown'}
                    </th>
                  )
                })}
              </tr>

              {/* Process name row — rotated headers */}
              <tr>
                {orderedProcesses.map((proc) => {
                  const dept = deptMap.get(proc.department_id)
                  const dc = getDeptColor(dept?.color ?? 'indigo')
                  return (
                    <th
                      key={proc.id}
                      style={{
                        position: 'sticky',
                        top: 28,
                        zIndex: 3,
                        width: 44,
                        minWidth: 44,
                        maxWidth: 44,
                        height: 90,
                        padding: 0,
                        backgroundColor: 'var(--card)',
                        borderBottom: '1px solid var(--border)',
                        verticalAlign: 'bottom',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'flex-end',
                          justifyContent: 'center',
                          height: '100%',
                          paddingBottom: 6,
                        }}
                      >
                        <span
                          title={proc.name}
                          style={{
                            transform: 'rotate(-55deg)',
                            transformOrigin: 'center center',
                            fontFamily: 'var(--font-body)',
                            fontSize: 10,
                            fontWeight: 500,
                            color: dc.main,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: 72,
                            display: 'block',
                          }}
                        >
                          {proc.name}
                        </span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            <tbody>
              {(
                filteredEmployees as {
                  id: string
                  first_name: string
                  last_name: string
                  department_id: string | null
                }[]
              ).map((emp) => {
                const covPct = employeeCoverage(emp.id)
                const isSelected = selectedEmployee === emp.id
                // Subtle row bg opacity based on coverage
                const rowBgOpacity = covPct > 0 ? Math.min(covPct / 300, 0.08) : 0
                return (
                  <tr
                    key={emp.id}
                    style={{
                      backgroundColor: isSelected
                        ? 'rgba(99,102,241,0.06)'
                        : `rgba(99,102,241,${rowBgOpacity})`,
                      outline: isSelected ? '1px solid rgba(99,102,241,0.25)' : 'none',
                      outlineOffset: -1,
                    }}
                  >
                    {/* Employee name — sticky left, compact */}
                    <td
                      onClick={() => handleEmployeeNameClick(emp.id)}
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 2,
                        width: 140,
                        minWidth: 140,
                        maxWidth: 140,
                        padding: '4px 8px',
                        backgroundColor: isSelected ? 'rgba(99,102,241,0.06)' : 'var(--card)',
                        borderRight: '1px solid var(--border)',
                        borderBottom: '1px solid rgba(0,0,0,0.04)',
                        cursor: 'pointer',
                        userSelect: 'none',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                        <Avatar firstName={emp.first_name} lastName={emp.last_name} size="sm" />
                        <span
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 11,
                            fontWeight: 600,
                            color: 'var(--foreground)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: 1.2,
                          }}
                        >
                          {emp.first_name}
                        </span>
                      </div>
                    </td>

                    {/* Skill cells — touching grid */}
                    {orderedProcesses.map((proc) => {
                      const level = skillMap.get(`${emp.id}:${proc.id}`) ?? 0
                      const cfg = LEVELS[level]!
                      const isMutating =
                        ((updateSkill.isPending &&
                          updateSkill.variables?.employee_id === emp.id &&
                          updateSkill.variables?.process_id === proc.id) ||
                         (deleteSkill.isPending &&
                          deleteSkill.variables?.employee_id === emp.id &&
                          deleteSkill.variables?.process_id === proc.id))
                      return (
                        <td
                          key={proc.id}
                          onClick={(e) => handleCellClick(emp.id, proc.id, e)}
                          style={{
                            width: 44,
                            minWidth: 44,
                            maxWidth: 44,
                            height: 36,
                            padding: 0,
                            borderBottom: 'none',
                            borderRight: 'none',
                            cursor: 'pointer',
                            textAlign: 'center',
                            verticalAlign: 'middle',
                            backgroundColor: cfg.color,
                            opacity: isMutating ? 0.4 : 1,
                            transition: 'filter 0.15s, opacity 0.15s',
                            position: 'relative',
                          }}
                          title={
                            level > 0
                              ? `${emp.first_name} — ${proc.name}: ${cfg.label} (${level}/5)`
                              : `${emp.first_name} — ${proc.name}: No skill`
                          }
                          onMouseEnter={(e) => {
                            const el = e.currentTarget as HTMLElement
                            el.style.filter = 'brightness(1.2)'
                            el.style.outline = '1px solid rgba(255,255,255,0.15)'
                            el.style.outlineOffset = '-1px'
                            el.style.zIndex = '5'
                            el.style.position = 'relative'
                          }}
                          onMouseLeave={(e) => {
                            const el = e.currentTarget as HTMLElement
                            el.style.filter = 'none'
                            el.style.outline = 'none'
                            el.style.zIndex = 'auto'
                          }}
                        >
                          {level > 0 ? (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: 'var(--foreground)',
                                opacity: 0.5,
                                fontFamily: 'var(--font-mono)',
                              }}
                            >
                              {level}
                            </span>
                          ) : (
                            <span
                              className="cell-plus"
                              style={{
                                color: 'var(--muted-foreground)',
                                opacity: 0,
                                fontSize: 14,
                                fontWeight: 300,
                                transition: 'opacity 0.15s',
                              }}
                            >
                              <Plus size={12} />
                            </span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Radial Skill Grader Overlay */}
          <AnimatePresence>
            {dialCell && containerRef.current && (() => {
              const containerRect = containerRef.current!.getBoundingClientRect()
              const cellCenterX = dialCell.rect.left - containerRect.left + dialCell.rect.width / 2
              const cellTop = dialCell.rect.top - containerRect.top
              const cellBottom = dialCell.rect.bottom - containerRect.top
              const dialHeight = 280
              const positionAbove = cellTop > dialHeight + 8
              const top = positionAbove ? cellTop - dialHeight - 6 : cellBottom + 6
              const left = Math.max(4, Math.min(cellCenterX - 130, containerRect.width - 270))
              const currentLevel = skillMap.get(`${dialCell.empId}:${dialCell.procId}`) ?? 0
              const proc = orderedProcesses.find((p) => p.id === dialCell.procId)

              return (
                <div style={{ position: 'absolute', top, left, zIndex: 50 }}>
                  <RadialSkillGrader
                    processName={proc?.name ?? ''}
                    level={currentLevel}
                    onChange={(lvl) => {
                      if (lvl === 0) {
                        handleDialRemove()
                      } else {
                        handleDialSelect(lvl)
                      }
                    }}
                    onClose={() => setDialCell(null)}
                  />
                </div>
              )
            })()}
          </AnimatePresence>

          {/* CSS for hover "+" visibility */}
          <style>{`
            td:hover .cell-plus {
              opacity: 0.4 !important;
            }
          `}</style>
        </motion.div>
      )}
    </motion.div>
  )
}
