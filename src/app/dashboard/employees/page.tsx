'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, X, Upload, Plus, CheckSquare } from 'lucide-react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { fadeInUp, containerStagger, bouncy, scalePress } from '@/lib/motion'
import { AnimatedCounter } from '@/components/domain/animated-counter'
import { Avatar } from '@/components/domain/avatar'
import { AddEmployeeWizard } from '@/components/domain/add-employee-wizard'
import { ExpandingCard } from '@/components/domain/expanding-card'
import { useDemoStore } from '@/hooks/use-demo'
import { useToast } from '@/components/domain/toast'
import { demoEmployees, demoDepartments, demoRoles, demoProcesses } from '@/components/onboarding/demo-seed'
import { ContextualTooltip } from '@/components/onboarding/contextual-tooltip'

// ── Types ─────────────────────────────────────────────────────────────────────

type ContractType = 'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor'
type EmployeeStatus = 'active' | 'on_leave' | 'suspended' | 'terminated'

interface Employee {
  id: string
  employee_number: string
  first_name: string
  last_name: string
  contract_type: string
  weekly_hours_contracted: number
  home_site_id: string
  status: string
  is_multi_site_eligible: boolean
  skill_count: number
  department_id: string | null
  crew_id: string | null
  job_role_id: string | null
}

// ── Badge configs ─────────────────────────────────────────────────────────────

const CONTRACT_COLOR: Record<ContractType, { bg: string; text: string }> = {
  full_time:   { bg: 'rgba(99,102,241,0.12)',  text: '#4F46E5' },
  part_time:   { bg: 'rgba(59,130,246,0.12)',  text: '#2563EB' },
  temporary:   { bg: 'rgba(245,158,11,0.12)',  text: '#D97706' },
  seasonal:    { bg: 'rgba(16,185,129,0.12)',  text: '#059669' },
  contractor:  { bg: 'rgba(249,115,22,0.12)',  text: '#EA580C' },
}

const CONTRACT_LABEL: Record<ContractType, string> = {
  full_time:  'Full Time',
  part_time:  'Part Time',
  temporary:  'Temporary',
  seasonal:   'Seasonal',
  contractor: 'Contractor',
}

const STATUS_DOT: Record<EmployeeStatus, string> = {
  active:     '#10B981',
  on_leave:   '#F59E0B',
  suspended:  '#94A3B8',
  terminated: '#EF4444',
}

const CONTRACT_TYPES: ContractType[] = ['full_time', 'part_time', 'temporary', 'seasonal', 'contractor']
const STATUSES: EmployeeStatus[] = ['active', 'on_leave', 'suspended', 'terminated']

// ── Filter chip ────────────────────────────────────────────────────────────────

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      variants={scalePress}
      whileTap="press"
      onClick={onClick}
      style={{
        padding: '4px 12px',
        borderRadius: 'var(--radius-full)',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--border)'}`,
        backgroundColor: active ? 'rgba(99,102,241,0.1)' : 'var(--card)',
        color: active ? 'var(--primary)' : 'var(--muted-foreground)',
        fontFamily: 'var(--font-body)',
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        whiteSpace: 'nowrap' as const,
      }}
    >
      {label}
    </motion.button>
  )
}

// ── Employee card ─────────────────────────────────────────────────────────────

function EmployeeCard({
  employee, onClick, onHoldEdit, deptName, roleName, skillNames,
}: {
  employee: Employee
  onClick: () => void
  onHoldEdit: () => void
  deptName?: string | null
  roleName?: string | null
  skillNames?: string[]
}) {
  const contractType = employee.contract_type as ContractType
  const status = employee.status as EmployeeStatus
  const statusColor = STATUS_DOT[status] ?? '#94A3B8'
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const didHold = useRef(false)

  const isTemp = contractType === 'temporary' || contractType === 'seasonal' || contractType === 'contractor'

  const startHold = () => {
    didHold.current = false
    holdRef.current = setTimeout(() => {
      didHold.current = true
      onHoldEdit()
    }, 400)
  }
  const cancelHold = () => {
    if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
  }
  const handleClick = () => {
    if (didHold.current) { didHold.current = false; return }
    onClick()
  }

  // Status label + micro badge config
  const statusLabel = status === 'on_leave' ? 'Leave' : status === 'suspended' ? 'Absent' : status === 'active' ? 'Available' : 'Inactive'

  return (
    <motion.div
      variants={fadeInUp}
      transition={bouncy}
      onMouseDown={startHold}
      onMouseUp={cancelHold}
      onMouseLeave={cancelHold}
      onClick={handleClick}
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--elevation-1)',
        padding: '14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        cursor: 'pointer',
        userSelect: 'none',
      }}
    >
      {/* Avatar */}
      <Avatar firstName={employee.first_name} lastName={employee.last_name} size="md" />

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Row 1: Name + Temp/Internal badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '14px',
            color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {employee.first_name} {employee.last_name}
          </span>
          {/* Temp vs Internal badge */}
          <span style={{
            fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 700,
            padding: '1px 6px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: '0.04em',
            color: isTemp ? '#D97706' : '#059669',
            backgroundColor: isTemp ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.1)',
          }}>
            {isTemp ? 'Temp' : 'Internal'}
          </span>
        </div>

        {/* Row 2: Department + Role */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '3px' }}>
          {deptName && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500,
              color: 'var(--muted-foreground)',
            }}>
              {deptName}
            </span>
          )}
          {deptName && roleName && (
            <span style={{ color: 'var(--border)', fontSize: '10px' }}>&middot;</span>
          )}
          {roleName && (
            <span style={{
              fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 500,
              color: 'var(--primary)',
            }}>
              {roleName}
            </span>
          )}
        </div>

        {/* Row 3: Micro badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '6px', flexWrap: 'wrap' }}>
          {/* Status micro badge */}
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            fontFamily: 'var(--font-body)', fontSize: '10px', fontWeight: 600,
            padding: '1px 7px', borderRadius: 999,
            color: statusColor,
            backgroundColor: `${statusColor}18`,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: statusColor }} />
            {statusLabel}
          </span>

          {/* Skill name badges */}
          {(skillNames ?? []).map((name) => (
            <span key={name} style={{
              fontFamily: 'var(--font-body)', fontSize: '9px', fontWeight: 600,
              padding: '1px 6px', borderRadius: 999,
              color: 'var(--primary)', backgroundColor: 'rgba(99,102,241,0.08)',
            }}>
              {name}
            </span>
          ))}
        </div>
      </div>

      {/* Hours */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: '14px', fontWeight: 600,
          color: 'var(--foreground)', fontVariantNumeric: 'tabular-nums',
        }}>
          {employee.weekly_hours_contracted}h
        </div>
        <div style={{
          fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)',
        }}>
          /week
        </div>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Floating interaction hint ─────────────────────────────────────────────────

function InteractionHint() {
  const [visible, setVisible] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => setVisible(false), 8000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [])

  useEffect(() => {
    if (dismissed) return
    let scrollTimeout: ReturnType<typeof setTimeout>
    const handleScroll = () => {
      setVisible(true)
      clearTimeout(scrollTimeout)
      scrollTimeout = setTimeout(() => setVisible(false), 4000)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => { window.removeEventListener('scroll', handleScroll); clearTimeout(scrollTimeout) }
  }, [dismissed])

  if (dismissed) return null

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 5, scale: 0.95 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onClick={() => setDismissed(true)}
          style={{
            position: 'absolute',
            left: '100%',
            top: '50%',
            transform: 'translateY(-50%)',
            marginLeft: 16,
            pointerEvents: 'auto',
            zIndex: 10,
          }}
        >
          {/* Shine border wrapper */}
          <div style={{
            position: 'relative',
            borderRadius: 12,
            padding: 1.5,
            cursor: 'pointer',
            overflow: 'hidden',
          }}>
            {/* Animated gradient border */}
            <div style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 12,
              background: 'conic-gradient(from var(--shine-angle, 0deg), transparent 40%, #6366f1 50%, #ec4899 55%, #f59e0b 60%, transparent 70%)',
              animation: 'shine-rotate 4s linear infinite',
            }} />
            {/* Inner content */}
            <div style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
              padding: '8px 12px',
              borderRadius: 11,
              backgroundColor: 'var(--card)',
              whiteSpace: 'nowrap',
            }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9 }}>👆</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 500 }}>
                  tap to view
                </span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: 9 }}>✏️</span>
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 10, color: 'var(--muted-foreground)', fontWeight: 500 }}>
                  hold to edit
                </span>
              </span>
            </div>
          </div>
          {/* CSS animation for the shine rotation */}
          <style>{`
            @property --shine-angle {
              syntax: '<angle>';
              initial-value: 0deg;
              inherits: false;
            }
            @keyframes shine-rotate {
              to { --shine-angle: 360deg; }
            }
          `}</style>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const router = useRouter()
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const toast = useToast()
  const DEMO_MSG = 'Dit is een demo — start je eigen omgeving om wijzigingen te maken'

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | undefined>()
  const [contractFilter, setContractFilter] = useState<ContractType | undefined>()
  const [deptFilter, setDeptFilter] = useState<string | undefined>()
  const [cursor, setCursor] = useState<string | undefined>()
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])
  const [addOpen, setAddOpen] = useState(false)
  const [quickEditEmployee, setQuickEditEmployee] = useState<Employee | null>(null)
  const utils = trpc.useUtils()
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)



  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const exitSelectionMode = () => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === allEmployees.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(allEmployees.map((e) => e.id)))
    }
  }

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showArchivePrompt, setShowArchivePrompt] = useState(false)
  const [blockedIds, setBlockedIds] = useState<string[]>([])

  const handleBulkDeleteRequest = () => {
    if (isDemo) { toast.showError(DEMO_MSG); return }
    if (selectedIds.size === 0) return
    setShowDeleteConfirm(true)
  }

  const bulkDelete = trpc.workforce.bulkDeleteEmployees.useMutation()
  const bulkArchive = trpc.workforce.bulkArchiveEmployees.useMutation()

  const handleBulkDelete = async () => {
    setShowDeleteConfirm(false)
    const ids = [...selectedIds]

    // Optimistic UI: immediately remove cards
    setAllEmployees((prev) => prev.filter((e) => !selectedIds.has(e.id)))
    setBulkDeleting(true)
    exitSelectionMode()

    try {
      const result = await bulkDelete.mutateAsync({ ids })

      if (result.blocked.length > 0) {
        // Some employees have planning history — prompt to archive
        setBlockedIds(result.blocked)
        setShowArchivePrompt(true)
        if (result.deleted > 0) {
          toast.showSuccess(`${result.deleted} medewerker${result.deleted !== 1 ? 's' : ''} verwijderd`)
        }
        // Refetch to restore blocked employees in the list
        setAllEmployees([])
        setCursor(undefined)
        utils.workforce.listEmployees.invalidate()
      } else {
        toast.showSuccess(`${result.deleted} medewerker${result.deleted !== 1 ? 's' : ''} verwijderd`)
        utils.workforce.listEmployees.invalidate()
      }
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Verwijderen mislukt')
      setAllEmployees([])
      setCursor(undefined)
    } finally {
      setBulkDeleting(false)
    }
  }

  const handleBulkArchive = async () => {
    setShowArchivePrompt(false)
    try {
      const result = await bulkArchive.mutateAsync({ ids: blockedIds })
      toast.showSuccess(`${result.archived} medewerker${result.archived !== 1 ? 's' : ''} gearchiveerd`)
      setAllEmployees([])
      setCursor(undefined)
      utils.workforce.listEmployees.invalidate()
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Archiveren mislukt')
    }
    setBlockedIds([])
  }

  const deptsQuery = trpc.org.listDepartments.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )
  const rolesQuery = trpc.org.listRoles.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )

  const processesQuery = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )
  const crewsQuery = trpc.org.listCrews.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )
  const skillsQuery = trpc.workforce.listSkillMatrix.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )

  // Lookup maps for card display
  const deptMapData = isDemo ? demoDepartments : (deptsQuery.data ?? [])
  const roleMapData = isDemo ? demoRoles : (rolesQuery.data ?? [])
  const procMapData = isDemo ? demoProcesses : (processesQuery.data ?? [])
  const deptMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of deptMapData) m.set(d.id, d.name)
    return m
  }, [deptMapData])
  const roleMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of roleMapData) m.set(r.id, r.name)
    return m
  }, [roleMapData])
  const procNameMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const p of procMapData) m.set(p.id, p.name)
    return m
  }, [procMapData])
  const crewMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of crewsQuery.data ?? []) m.set(c.id, c.name)
    return m
  }, [crewsQuery.data])
  // Map employee_id → list of process names
  const employeeSkillNames = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const s of skillsQuery.data ?? []) {
      const name = procNameMap.get(s.process_id)
      if (!name) continue
      const arr = m.get(s.employee_id) ?? []
      arr.push(name)
      m.set(s.employee_id, arr)
    }
    return m
  }, [skillsQuery.data, procNameMap])

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search input 200ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setSearch(rawSearch), 200)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [rawSearch])

  // Reset pagination when filters change
  useEffect(() => {
    setCursor(undefined)
    setAllEmployees([])
  }, [search, statusFilter, contractFilter, deptFilter, activeSiteId])

  const { data: liveData, isLoading: liveLoading, error } = trpc.workforce.listEmployees.useQuery(
    {
      site_id: activeSiteId!,
      search: search || undefined,
      status: statusFilter,
      contract_type: contractFilter,
      department_id: deptFilter,
      limit: 50,
      cursor,
    },
    { enabled: !!activeSiteId && !isDemo },
  )
  const demoEmpFiltered = isDemo
    ? demoEmployees.filter((e) => e.home_site_id === activeSiteId)
    : []
  const data = isDemo ? { items: demoEmpFiltered, nextCursor: null } : liveData
  const isLoading = isDemo ? false : liveLoading

  useEffect(() => {
    if (data?.items) {
      if (!cursor) {
        setAllEmployees(data.items as Employee[])
      } else {
        setAllEmployees((prev) => [...prev, ...(data.items as Employee[])])
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const totalCount = allEmployees.length

  if (!activeSiteId) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px' }}>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: '15px', color: 'var(--muted-foreground)' }}>
          Select a site to view employees.
        </p>
      </div>
    )
  }

  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="show"
      style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '860px' }}
    >
      {/* Header */}
      <motion.div variants={fadeInUp}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '12px' }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: '26px',
              fontWeight: 800,
              color: 'var(--foreground)',
              margin: 0,
            }}
          >
            Employees
          </h1>
          {!isLoading && (
            <AnimatedCounter
              value={totalCount}
              style={{
                fontSize: '15px',
                color: 'var(--muted-foreground)',
              }}
              suffix=" total"
            />
          )}
        </div>
      </motion.div>

      {/* Search + filters */}
      <motion.div variants={fadeInUp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Search + Import button row */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <Search
            size={16}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--muted-foreground)',
              pointerEvents: 'none',
            }}
          />
          <input
            type="text"
            placeholder="Search by name or employee number..."
            value={rawSearch}
            onChange={(e) => setRawSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 38px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              fontFamily: 'var(--font-body)',
              fontSize: '14px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {rawSearch && (
            <button
              onClick={() => setRawSearch('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
                padding: '2px',
                display: 'flex',
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>

          {/* Add Employee button */}
          <ContextualTooltip id="employees-add" text="Voeg je team toe aan AstraPlanner" anchor="top">
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => { if (isDemo) { return } setAddOpen(true) }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '9px 16px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
              color: '#FFFFFF',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={14} />
            Add
          </motion.button>
          </ContextualTooltip>

          {/* Select mode toggle */}
          {!selectionMode && allEmployees.length > 0 && (
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={() => setSelectionMode(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '9px 14px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)', backgroundColor: 'var(--card)',
                color: 'var(--muted-foreground)', fontFamily: 'var(--font-body)',
                fontSize: '13px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              <CheckSquare size={14} />
            </motion.button>
          )}

          {/* Import button */}
          <Link href="/dashboard/employees/import" style={{ textDecoration: 'none' }}>
            <motion.button
              variants={scalePress}
              whileTap="press"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '9px 16px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                backgroundColor: 'var(--card)',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Upload size={14} />
              Import
            </motion.button>
          </Link>
        </div>

        {/* Filter chips */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
            Contract:
          </span>
          {CONTRACT_TYPES.map((ct) => (
            <FilterChip
              key={ct}
              label={CONTRACT_LABEL[ct]}
              active={contractFilter === ct}
              onClick={() => setContractFilter(contractFilter === ct ? undefined : ct)}
            />
          ))}
          <span style={{ width: '1px', height: '20px', backgroundColor: 'var(--border)', margin: '0 4px' }} />
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
            Status:
          </span>
          {STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={s === 'on_leave' ? 'On Leave' : s.charAt(0).toUpperCase() + s.slice(1)}
              active={statusFilter === s}
              onClick={() => setStatusFilter(statusFilter === s ? undefined : s)}
            />
          ))}
        </div>

        {/* Department filter */}
        {(deptsQuery.data ?? []).length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', fontWeight: 600 }}>
              Department:
            </span>
            {(deptsQuery.data ?? []).map((dept) => (
              <FilterChip
                key={dept.id}
                label={dept.name}
                active={deptFilter === dept.id}
                onClick={() => setDeptFilter(deptFilter === dept.id ? undefined : dept.id)}
              />
            ))}
          </div>
        )}

        {/* Active filter pills */}
        {(statusFilter || contractFilter || deptFilter || search) && (
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {search && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'rgba(99,102,241,0.1)',
                  color: 'var(--primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                &ldquo;{search}&rdquo;
                <button onClick={() => { setRawSearch(''); setSearch('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}>
                  <X size={12} />
                </button>
              </span>
            )}
            {contractFilter && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'rgba(99,102,241,0.1)',
                  color: 'var(--primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {CONTRACT_LABEL[contractFilter]}
                <button onClick={() => setContractFilter(undefined)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}>
                  <X size={12} />
                </button>
              </span>
            )}
            {statusFilter && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'rgba(99,102,241,0.1)',
                  color: 'var(--primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {statusFilter === 'on_leave' ? 'On Leave' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
                <button onClick={() => setStatusFilter(undefined)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}>
                  <X size={12} />
                </button>
              </span>
            )}
            {deptFilter && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-full)',
                  backgroundColor: 'rgba(99,102,241,0.1)',
                  color: 'var(--primary)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                {(deptsQuery.data ?? []).find((d) => d.id === deptFilter)?.name ?? 'Department'}
                <button onClick={() => setDeptFilter(undefined)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', padding: 0, display: 'flex' }}>
                  <X size={12} />
                </button>
              </span>
            )}
          </div>
        )}
      </motion.div>

      {/* Error */}
      {error && (
        <motion.div
          variants={fadeInUp}
          style={{
            padding: '14px 18px',
            borderRadius: 'var(--radius-md)',
            backgroundColor: 'var(--card)',
            border: '1px solid var(--destructive)',
            color: 'var(--destructive)',
            fontFamily: 'var(--font-body)',
            fontSize: '14px',
          }}
        >
          Failed to load employees: {error.message}
        </motion.div>
      )}

      {/* Loading skeletons */}
      {isLoading && allEmployees.length === 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="animate-pulse"
              style={{
                height: '80px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
              }}
            />
          ))}
        </div>
      )}

      {/* Employee list */}
      {allEmployees.length > 0 && (
        <>
        <motion.div
          variants={containerStagger}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          {allEmployees.map((emp, idx) => {
            const isSelected = selectedIds.has(emp.id)
            return (
              <motion.div
                key={emp.id}
                style={{ position: 'relative', display: 'flex', alignItems: 'stretch', gap: 0 }}
                animate={selectionMode ? { x: 0 } : { x: 0 }}
              >
                {/* Selection indicator — only in selection mode */}
                <AnimatePresence>
                  {selectionMode && (
                    <motion.div
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: 36, opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      onClick={() => toggleSelect(emp.id)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0, cursor: 'pointer', overflow: 'hidden',
                      }}
                    >
                      <motion.div
                        animate={{
                          backgroundColor: isSelected ? '#6366F1' : 'transparent',
                          borderColor: isSelected ? '#6366F1' : 'rgba(99,102,241,0.3)',
                        }}
                        transition={{ duration: 0.15 }}
                        style={{
                          width: 22, height: 22, borderRadius: '50%',
                          border: '2px solid rgba(99,102,241,0.3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {isSelected && (
                          <motion.svg
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                            width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                          >
                            <path d="M20 6L9 17l-5-5" />
                          </motion.svg>
                        )}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div style={{ flex: 1 }}>
                  <EmployeeCard
                    employee={emp}
                    onClick={() => {
                      if (selectionMode) { toggleSelect(emp.id); return }
                      router.push(`/dashboard/employees/${emp.id}`)
                    }}
                    onHoldEdit={() => { if (!selectionMode) setQuickEditEmployee(emp) }}
                    deptName={emp.department_id ? deptMap.get(emp.department_id) : null}
                    roleName={emp.job_role_id ? roleMap.get(emp.job_role_id) : null}
                    skillNames={employeeSkillNames.get(emp.id) ?? []}
                  />
                </div>
                {idx === 0 && !selectionMode && <InteractionHint />}
              </motion.div>
            )
          })}
        </motion.div>

        {/* Floating bulk action bar — slides up from bottom */}
        <AnimatePresence>
          {selectionMode && (
            <motion.div
              initial={{ y: 80, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 80, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{
                position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
                zIndex: 50, display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 20px', borderRadius: 'var(--radius-lg)',
                background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                border: '1px solid rgba(99,102,241,0.2)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 2px 8px rgba(99,102,241,0.1)',
              }}
            >
              <button
                onClick={toggleSelectAll}
                style={{
                  padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: 'var(--card)',
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                  color: 'var(--foreground)', cursor: 'pointer',
                }}
              >
                {selectedIds.size === allEmployees.length ? 'Deselecteer' : 'Selecteer alles'}
              </button>

              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--primary)', minWidth: 80, textAlign: 'center' }}>
                {selectedIds.size} geselecteerd
              </span>

              <button
                onClick={handleBulkDeleteRequest}
                disabled={bulkDeleting || selectedIds.size === 0}
                style={{
                  padding: '6px 16px', borderRadius: 'var(--radius-sm)',
                  border: 'none', background: selectedIds.size > 0 ? 'linear-gradient(135deg, #EF4444, #DC2626)' : 'rgba(239,68,68,0.2)',
                  color: '#fff', fontFamily: 'var(--font-body)', fontSize: 12,
                  fontWeight: 600, cursor: selectedIds.size > 0 ? 'pointer' : 'not-allowed',
                  boxShadow: selectedIds.size > 0 ? '0 2px 8px rgba(239,68,68,0.3)' : 'none',
                }}
              >
                {bulkDeleting ? 'Verwijderen...' : 'Verwijder'}
              </button>

              <button
                onClick={exitSelectionMode}
                style={{
                  padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: 'var(--card)',
                  fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
                  color: 'var(--muted-foreground)', cursor: 'pointer',
                }}
              >
                Annuleren
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        </>
      )}

      {/* Empty state */}
      {!isLoading && allEmployees.length === 0 && !error && (
        <motion.p
          variants={fadeInUp}
          style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--muted-foreground)' }}
        >
          No employees found.
        </motion.p>
      )}

      {/* Load more */}
      {((data as { next_cursor?: string | null; nextCursor?: string | null } | undefined)?.next_cursor ?? (data as { next_cursor?: string | null; nextCursor?: string | null } | undefined)?.nextCursor) && (
        <motion.div variants={fadeInUp} style={{ display: 'flex', justifyContent: 'center' }}>
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => setCursor((data as { next_cursor?: string | null } | undefined)?.next_cursor ?? undefined)}
            disabled={isLoading}
            style={{
              padding: '9px 24px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              backgroundColor: 'var(--card)',
              color: 'var(--foreground)',
              fontFamily: 'var(--font-body)',
              fontSize: '13px',
              fontWeight: 600,
              cursor: isLoading ? 'wait' : 'pointer',
            }}
          >
            {isLoading ? 'Loading...' : 'Load more'}
          </motion.button>
        </motion.div>
      )}

      {/* Quick Edit ExpandingCard */}
      {quickEditEmployee && (
        <ExpandingCard
          employee={quickEditEmployee}
          deptMap={deptMap}
          roleMap={roleMap}
          crewMap={crewMap}
          departments={deptMapData.map((d: { id: string; name: string }) => ({ id: d.id, name: d.name }))}
          roles={roleMapData.map((r: { id: string; name: string }) => ({ id: r.id, name: r.name }))}
          crews={crewsQuery.data?.map((c) => ({ id: c.id, name: c.name })) ?? []}
          processes={procMapData.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))}
          siteId={activeSiteId!}
          onClose={() => setQuickEditEmployee(null)}
          onDeleted={() => { setQuickEditEmployee(null); setAllEmployees([]); setCursor(undefined) }}
        />
      )}

      {/* Add Employee Wizard */}
      {activeSiteId && (
        <AddEmployeeWizard
          open={addOpen}
          onClose={() => setAddOpen(false)}
          siteId={activeSiteId}
          onSaved={() => {
            setCursor(undefined)
          }}
        />
      )}

      {/* Delete confirmation modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDeleteConfirm(false)}
            style={{
              position: 'fixed', inset: 0, zIndex: 60,
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 380, background: 'var(--card)', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)', boxShadow: 'var(--elevation-4)',
                padding: '28px', textAlign: 'center',
              }}
            >
              {/* Warning icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.05 }}
                style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                  background: 'rgba(239,68,68,0.08)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </motion.div>

              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 6px' }}>
                {selectedIds.size} medewerker{selectedIds.size !== 1 ? 's' : ''} verwijderen?
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 24px', lineHeight: 1.5 }}>
                Dit kan niet ongedaan worden gemaakt. Alle gekoppelde data (skills, beschikbaarheid) wordt ook verwijderd.
              </p>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowDeleteConfirm(false)}
                  style={{
                    padding: '10px 24px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)', background: 'var(--card)',
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                    color: 'var(--foreground)', cursor: 'pointer',
                  }}
                >
                  Annuleren
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleBulkDelete}
                  style={{
                    padding: '10px 24px', borderRadius: 'var(--radius-md)',
                    border: 'none', background: 'linear-gradient(135deg, #EF4444, #DC2626)',
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                    color: '#fff', cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(239,68,68,0.3)',
                  }}
                >
                  Verwijder definitief
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Archive prompt modal — shown when blocked employees have planning history */}
      <AnimatePresence>
        {showArchivePrompt && blockedIds.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => { setShowArchivePrompt(false); setBlockedIds([]) }}
            style={{
              position: 'fixed', inset: 0, zIndex: 60,
              background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 12 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: 400, background: 'var(--card)', borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)', boxShadow: 'var(--elevation-4)',
                padding: '28px', textAlign: 'center',
              }}
            >
              {/* Archive icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20, delay: 0.05 }}
                style={{
                  width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
                  background: 'rgba(245,158,11,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="5" rx="1" />
                  <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
                  <path d="M10 12h4" />
                </svg>
              </motion.div>

              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, color: 'var(--foreground)', margin: '0 0 6px' }}>
                {blockedIds.length} medewerker{blockedIds.length !== 1 ? 's' : ''} met planhistorie
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--muted-foreground)', margin: '0 0 8px', lineHeight: 1.5 }}>
                Deze medewerkers hebben inplanningen in het verleden en kunnen niet verwijderd worden.
              </p>

              {/* Show blocked employee names */}
              <div style={{
                margin: '0 0 20px', padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)',
                maxHeight: 120, overflowY: 'auto', textAlign: 'left',
              }}>
                {blockedIds.map((id) => {
                  const emp = allEmployees.find((e) => e.id === id)
                  return (
                    <div key={id} style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--foreground)', padding: '2px 0' }}>
                      {emp ? `${emp.first_name} ${emp.last_name}` : id}
                    </div>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setShowArchivePrompt(false); setBlockedIds([]) }}
                  style={{
                    padding: '10px 24px', borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border)', background: 'var(--card)',
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 500,
                    color: 'var(--foreground)', cursor: 'pointer',
                  }}
                >
                  Overslaan
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleBulkArchive}
                  style={{
                    padding: '10px 24px', borderRadius: 'var(--radius-md)',
                    border: 'none', background: 'linear-gradient(135deg, #F59E0B, #EA580C)',
                    fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
                    color: '#fff', cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(245,158,11,0.3)',
                  }}
                >
                  Archiveer
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
