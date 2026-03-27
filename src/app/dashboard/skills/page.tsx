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

// ── Proficiency config ───────────────────────────────────────────────────────

const LEVELS: Record<number, { label: string; color: string }> = {
  0: { label: 'None',     color: 'transparent' },
  1: { label: 'Beginner', color: 'rgba(148,163,184,0.2)' },
  2: { label: 'Basic',    color: 'rgba(99,102,241,0.2)' },
  3: { label: 'Skilled',  color: 'rgba(99,102,241,0.4)' },
  4: { label: 'Advanced', color: 'rgba(16,185,129,0.45)' },
  5: { label: 'Expert',   color: 'rgba(245,158,11,0.5)' },
}

const ARC_COLORS: Record<number, string> = {
  1: 'rgba(148,163,184,0.5)',
  2: 'rgba(99,102,241,0.45)',
  3: 'rgba(99,102,241,0.65)',
  4: 'rgba(16,185,129,0.6)',
  5: 'rgba(245,158,11,0.7)',
}

const ARC_GLOW: Record<number, string> = {
  1: 'rgba(148,163,184,0.4)',
  2: 'rgba(99,102,241,0.4)',
  3: 'rgba(99,102,241,0.5)',
  4: 'rgba(16,185,129,0.5)',
  5: 'rgba(245,158,11,0.5)',
}

const DIAL_COLORS: Record<number, string> = {
  1: 'rgba(99,102,241,0.35)',
  2: 'rgba(99,102,241,0.50)',
  3: 'rgba(99,102,241,0.70)',
  4: 'rgba(16,185,129,0.65)',
  5: 'rgba(245,158,11,0.75)',
}

// ── SVG Arc Helpers ──────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle)
  const end = polarToCartesian(cx, cy, r, startAngle)
  const largeArc = endAngle - startAngle <= 180 ? '0' : '1'
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`
}

function arcMidpoint(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const mid = (startAngle + endAngle) / 2
  return polarToCartesian(cx, cy, r, mid)
}

// ── Animated Radial Skill Grader ─────────────────────────────────────────────

interface RadialDialProps {
  currentLevel: number
  onSelect: (level: number) => void
  onRemove: () => void
  onClose: () => void
  cellRect: DOMRect
  containerRect: DOMRect
}

function RadialDial({ currentLevel, onSelect, onRemove, onClose, cellRect, containerRect }: RadialDialProps) {
  const dialRef = useRef<HTMLDivElement>(null)
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null)

  // Position: center horizontally on cell, above or below depending on space
  const cellCenterX = cellRect.left - containerRect.left + cellRect.width / 2
  const cellTop = cellRect.top - containerRect.top
  const cellBottom = cellRect.bottom - containerRect.top
  const spaceAbove = cellTop
  const dialHeight = 120

  const positionAbove = spaceAbove > dialHeight + 8
  const top = positionAbove ? cellTop - dialHeight - 6 : cellBottom + 6
  const left = Math.max(4, cellCenterX - 90)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dialRef.current && !dialRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  // Arc config
  const svgW = 160
  const svgH = 90
  const cx = svgW / 2
  const cy = svgH - 6
  const radius = 64
  const strokeW = 14

  // 5 segments: 180deg to 360deg
  const segments = [1, 2, 3, 4, 5].map((lvl, i) => {
    const startAngle = 180 + i * 36
    const endAngle = 180 + (i + 1) * 36
    return { lvl, startAngle, endAngle }
  })

  // Indicator position for current level
  const indicatorPos = currentLevel > 0
    ? arcMidpoint(cx, cy, radius, segments[currentLevel - 1]!.startAngle, segments[currentLevel - 1]!.endAngle)
    : null

  const displayLevel = hoveredSegment ?? currentLevel

  return (
    <motion.div
      ref={dialRef}
      initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)', y: positionAbove ? 10 : -10 }}
      animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', y: 0 }}
      exit={{ opacity: 0, scale: 0.9, filter: 'blur(2px)' }}
      transition={bouncy}
      style={{
        position: 'absolute',
        top,
        left,
        width: 180,
        zIndex: 50,
        backgroundColor: 'rgba(15,10,30,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: 16,
        boxShadow: '0 16px 48px rgba(0,0,0,0.35), 0 2px 12px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
        padding: '14px 10px 10px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* SVG Arc */}
      <svg width={svgW} height={svgH} style={{ overflow: 'visible' }}>
        {/* Background arc track */}
        <path
          d={describeArc(cx, cy, radius, 180, 360)}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeW + 4}
          strokeLinecap="round"
        />

        {/* Segments */}
        {segments.map(({ lvl, startAngle, endAngle }) => {
          const isActive = lvl === currentLevel
          const isHovered = lvl === hoveredSegment
          return (
            <path
              key={lvl}
              d={describeArc(cx, cy, radius, startAngle + 1, endAngle - 1)}
              fill="none"
              stroke={ARC_COLORS[lvl]}
              strokeWidth={isActive ? strokeW + 2 : isHovered ? strokeW + 1 : strokeW}
              strokeLinecap="round"
              style={{
                cursor: 'pointer',
                filter: isActive ? `drop-shadow(0 0 6px ${ARC_GLOW[lvl]})` : isHovered ? `drop-shadow(0 0 4px ${ARC_GLOW[lvl]})` : 'none',
                transition: 'stroke-width 0.2s, filter 0.2s',
              }}
              onMouseEnter={() => setHoveredSegment(lvl)}
              onMouseLeave={() => setHoveredSegment(null)}
              onClick={() => onSelect(lvl)}
            />
          )
        })}

        {/* Indicator dot */}
        {indicatorPos && (
          <motion.circle
            animate={{ cx: indicatorPos.x, cy: indicatorPos.y }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, mass: 0.8 }}
            r={5}
            fill="#fff"
            style={{
              filter: `drop-shadow(0 0 6px ${ARC_GLOW[currentLevel] ?? 'rgba(255,255,255,0.5)'})`,
            }}
          />
        )}

        {/* Level numbers on each segment */}
        {segments.map(({ lvl, startAngle, endAngle }) => {
          const pos = arcMidpoint(cx, cy, radius, startAngle, endAngle)
          const isActive = lvl === currentLevel
          return (
            <text
              key={`label-${lvl}`}
              x={pos.x}
              y={pos.y + (lvl === currentLevel ? 0 : 0)}
              textAnchor="middle"
              dominantBaseline="central"
              style={{
                fontSize: 9,
                fontWeight: 700,
                fontFamily: 'var(--font-mono)',
                fill: isActive ? '#fff' : 'rgba(255,255,255,0.4)',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {lvl}
            </text>
          )
        })}
      </svg>

      {/* Level label */}
      <AnimatePresence mode="wait">
        <motion.span
          key={displayLevel}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 12,
            fontWeight: 700,
            color: displayLevel > 0 ? '#fff' : 'rgba(255,255,255,0.4)',
            letterSpacing: '0.03em',
            minHeight: 16,
          }}
        >
          {displayLevel > 0 ? LEVELS[displayLevel]!.label : 'Select level'}
        </motion.span>
      </AnimatePresence>

      {/* Remove link */}
      {currentLevel > 0 && (
        <button
          onClick={onRemove}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(239,68,68,0.7)',
            fontFamily: 'var(--font-body)',
            fontSize: 10,
            fontWeight: 500,
            cursor: 'pointer',
            padding: '1px 6px',
            borderRadius: 4,
            marginTop: 0,
          }}
        >
          Remove
        </button>
      )}
    </motion.div>
  )
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

  const skillMap = useMemo(() => {
    const map = new Map<string, number>()
    for (const s of skillData) {
      map.set(`${s.employee_id}:${s.process_id}`, s.proficiency_level)
    }
    return map
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
    async (level: number) => {
      if (!dialCell) return
      if (isDemo) { showError(DEMO_MSG); setDialCell(null); return }
      try {
        await updateSkill.mutateAsync({
          employee_id: dialCell.empId,
          process_id: dialCell.procId,
          proficiency_level: level,
        })
        await utils.workforce.listSkillMatrix.invalidate()
        setDialCell(null)
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to update skill')
      }
    },
    [dialCell, updateSkill, utils, showError],
  )

  const handleDialRemove = useCallback(async () => {
    if (!dialCell) return
    if (isDemo) { showError(DEMO_MSG); setDialCell(null); return }
    try {
      await deleteSkill.mutateAsync({
        employee_id: dialCell.empId,
        process_id: dialCell.procId,
      })
      await utils.workforce.listSkillMatrix.invalidate()
      setDialCell(null)
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to remove skill')
    }
  }, [dialCell, deleteSkill, utils, showError])

  const handleBulkSet = useCallback(
    async (level: number | 'clear') => {
      if (!selectedEmployee) return
      if (isDemo) { showError(DEMO_MSG); return }
      try {
        if (level === 'clear') {
          for (const proc of orderedProcesses) {
            const existing = skillMap.get(`${selectedEmployee}:${proc.id}`) ?? 0
            if (existing > 0) {
              await deleteSkill.mutateAsync({
                employee_id: selectedEmployee,
                process_id: proc.id,
              })
            }
          }
        } else {
          for (const proc of orderedProcesses) {
            await updateSkill.mutateAsync({
              employee_id: selectedEmployee,
              process_id: proc.id,
              proficiency_level: level,
            })
          }
        }
        await utils.workforce.listSkillMatrix.invalidate()
        showSuccess(level === 'clear' ? 'All skills cleared' : `All skills set to level ${level}`)
        setSelectedEmployee(null)
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Failed to update skills')
      }
    },
    [selectedEmployee, orderedProcesses, skillMap, updateSkill, deleteSkill, utils, showError, showSuccess],
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

          {/* Radial Dial Overlay */}
          <AnimatePresence>
            {dialCell && containerRef.current && (
              <RadialDial
                currentLevel={skillMap.get(`${dialCell.empId}:${dialCell.procId}`) ?? 0}
                onSelect={handleDialSelect}
                onRemove={handleDialRemove}
                onClose={() => setDialCell(null)}
                cellRect={dialCell.rect}
                containerRect={containerRef.current.getBoundingClientRect()}
              />
            )}
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
