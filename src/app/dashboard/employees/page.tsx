'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { fadeInUp, containerStagger, bouncy, scalePress } from '@/lib/motion'
import { AnimatedCounter } from '@/components/domain/animated-counter'
import { Avatar } from '@/components/domain/avatar'

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

function EmployeeCard({ employee, onClick }: { employee: Employee; onClick: () => void }) {
  const contractType = employee.contract_type as ContractType
  const status = employee.status as EmployeeStatus
  const contractColor = CONTRACT_COLOR[contractType] ?? { bg: 'var(--muted)', text: 'var(--muted-foreground)' }
  const statusColor = STATUS_DOT[status] ?? '#94A3B8'

  return (
    <motion.div
      variants={fadeInUp}
      whileHover={{ y: -2, boxShadow: 'var(--elevation-2)' }}
      transition={bouncy}
      onClick={onClick}
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--elevation-1)',
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        cursor: 'pointer',
      }}
    >
      {/* Avatar */}
      <Avatar firstName={employee.first_name} lastName={employee.last_name} size="md" />

      {/* Main info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 700,
              fontSize: '15px',
              color: 'var(--foreground)',
            }}
          >
            {employee.first_name} {employee.last_name}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--muted-foreground)',
              backgroundColor: 'var(--muted)',
              padding: '2px 7px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            {employee.employee_number}
          </span>
          {/* Status dot */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              fontFamily: 'var(--font-body)',
              fontSize: '12px',
              color: statusColor,
            }}
          >
            <span
              style={{
                width: '7px',
                height: '7px',
                borderRadius: '50%',
                backgroundColor: statusColor,
                display: 'inline-block',
              }}
            />
            {status === 'on_leave' ? 'On Leave' : status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
          {/* Contract type badge */}
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '11px',
              fontWeight: 600,
              color: contractColor.text,
              backgroundColor: contractColor.bg,
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {CONTRACT_LABEL[contractType] ?? contractType}
          </span>

          {/* Skill count */}
          {employee.skill_count > 0 && (
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                color: 'var(--muted-foreground)',
                backgroundColor: 'var(--muted)',
                padding: '2px 8px',
                borderRadius: 'var(--radius-full)',
              }}
            >
              {employee.skill_count} {employee.skill_count === 1 ? 'skill' : 'skills'}
            </span>
          )}
        </div>
      </div>

      {/* Hours */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            fontWeight: 600,
            color: 'var(--foreground)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {employee.weekly_hours_contracted}h
        </div>
        <div
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '11px',
            color: 'var(--muted-foreground)',
          }}
        >
          /week
        </div>
      </div>
    </motion.div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
  const router = useRouter()
  const { activeSiteId } = useSiteStore()

  const [rawSearch, setRawSearch] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<EmployeeStatus | undefined>()
  const [contractFilter, setContractFilter] = useState<ContractType | undefined>()
  const [cursor, setCursor] = useState<string | undefined>()
  const [allEmployees, setAllEmployees] = useState<Employee[]>([])

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
  }, [search, statusFilter, contractFilter, activeSiteId])

  const { data, isLoading, error } = trpc.workforce.listEmployees.useQuery(
    {
      site_id: activeSiteId!,
      search: search || undefined,
      status: statusFilter,
      limit: 50,
      cursor,
    },
    { enabled: !!activeSiteId },
  )

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
        {/* Search */}
        <div style={{ position: 'relative' }}>
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

        {/* Active filter pills */}
        {(statusFilter || contractFilter || search) && (
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
        <motion.div
          variants={containerStagger}
          initial="hidden"
          animate="show"
          style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}
        >
          {allEmployees.map((emp) => (
            <EmployeeCard
              key={emp.id}
              employee={emp}
              onClick={() => router.push(`/dashboard/employees/${emp.id}`)}
            />
          ))}
        </motion.div>
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
      {data?.next_cursor && (
        <motion.div variants={fadeInUp} style={{ display: 'flex', justifyContent: 'center' }}>
          <motion.button
            variants={scalePress}
            whileTap="press"
            onClick={() => setCursor(data.next_cursor ?? undefined)}
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
    </motion.div>
  )
}
