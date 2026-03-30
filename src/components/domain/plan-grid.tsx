'use client'

import { useMemo, useCallback } from 'react'
import { Lock, Plus } from 'lucide-react'
import { Avatar } from '@/components/domain/avatar'
import { getDeptColor } from '@/components/domain/process-card'

// ── Day name mapping (1=Ma, 2=Di, ...) ─────────────────────────────────────

const DAY_NAMES = ['', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']

// ── Helpers ─────────────────────────────────────────────────────────────────

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]!
}

function abbrev(name: string, len = 4): string {
  return name.length > len ? name.slice(0, len) : name
}

// ── Types ───────────────────────────────────────────────────────────────────

interface Assignment {
  employee_id: string
  process_id: string
  shift_pattern_id: string
  assignment_date: string
  scheduled_hours: number
  assignment_source: string
  cost_estimate: number
}

interface PlanGridProps {
  assignments: Assignment[]
  employees: Array<{ id: string; first_name: string; last_name: string; department_id: string | null }>
  processes: Array<{ id: string; name: string; department_id: string }>
  departments: Array<{ id: string; name: string; color: string }>
  shifts: Array<{ id: string; name: string }>
  weekStart: string
  workDays: number[]
  isEditable: boolean
  onCellClick?: (employeeId: string, date: string, shiftId: string) => void
}

// ── Column type ─────────────────────────────────────────────────────────────

interface Column {
  date: string
  shift: { id: string; name: string }
  slotId: string
  dow: number
}

// ── Component ───────────────────────────────────────────────────────────────

export function PlanGrid({
  assignments,
  employees,
  processes,
  departments,
  shifts,
  weekStart,
  workDays,
  isEditable,
  onCellClick,
}: PlanGridProps) {
  // ── Column generation ───────────────────────────────────────────────────

  const columns = useMemo<Column[]>(() => {
    return workDays.flatMap((dow) => {
      const date = addDays(weekStart, dow - 1)
      return shifts.map((shift) => ({
        date,
        shift,
        slotId: `${date}_${shift.id}`,
        dow,
      }))
    })
  }, [weekStart, workDays, shifts])

  // ── Day groups for header colSpan ───────────────────────────────────────

  const dayGroups = useMemo(() => {
    const groups: Array<{ dow: number; date: string; count: number }> = []
    for (const col of columns) {
      const last = groups[groups.length - 1]
      if (last && last.date === col.date) {
        last.count++
      } else {
        groups.push({ dow: col.dow, date: col.date, count: 1 })
      }
    }
    return groups
  }, [columns])

  // ── Assignment lookup: "empId:date_shiftId" ─────────────────────────────

  const assignmentMap = useMemo(() => {
    const map = new Map<string, Assignment>()
    for (const a of assignments) {
      map.set(`${a.employee_id}:${a.assignment_date}_${a.shift_pattern_id}`, a)
    }
    return map
  }, [assignments])

  // ── Process + department lookups ────────────────────────────────────────

  const procMap = useMemo(() => new Map(processes.map((p) => [p.id, p])), [processes])
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])

  // ── Click handler ──────────────────────────────────────────────────────

  const handleClick = useCallback(
    (empId: string, date: string, shiftId: string) => {
      if (isEditable && onCellClick) {
        onCellClick(empId, date, shiftId)
      }
    },
    [isEditable, onCellClick],
  )

  // ── Empty state ────────────────────────────────────────────────────────

  if (employees.length === 0 || shifts.length === 0) {
    return (
      <div
        style={{
          padding: 48,
          textAlign: 'center',
          color: 'var(--muted-foreground)',
          fontFamily: 'var(--font-body)',
          fontSize: 14,
        }}
      >
        {employees.length === 0
          ? 'Geen medewerkers gevonden.'
          : 'Geen diensten geconfigureerd.'}
      </div>
    )
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        overflow: 'auto',
        maxHeight: 'calc(100vh - 400px)',
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
          {/* Row 1: Day names */}
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
            {dayGroups.map((g) => (
              <th
                key={g.date}
                colSpan={g.count}
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 3,
                  padding: '6px 2px',
                  backgroundColor: 'var(--card)',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.03em',
                }}
              >
                {DAY_NAMES[g.dow] ?? ''}
              </th>
            ))}
          </tr>

          {/* Row 2: Shift names */}
          <tr>
            {columns.map((col) => (
              <th
                key={col.slotId}
                style={{
                  position: 'sticky',
                  top: 28,
                  zIndex: 3,
                  width: 44,
                  minWidth: 44,
                  maxWidth: 44,
                  padding: '3px 2px',
                  backgroundColor: 'var(--card)',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--muted-foreground)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 9,
                  fontWeight: 500,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                title={col.shift.name}
              >
                {abbrev(col.shift.name, 3)}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {employees.map((emp) => (
            <tr key={emp.id}>
              {/* Sticky left: Avatar + name */}
              <td
                style={{
                  position: 'sticky',
                  left: 0,
                  zIndex: 2,
                  width: 140,
                  minWidth: 140,
                  maxWidth: 140,
                  padding: '4px 8px',
                  backgroundColor: 'var(--card)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid rgba(0,0,0,0.04)',
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

              {/* Assignment cells */}
              {columns.map((col) => {
                const assignment = assignmentMap.get(`${emp.id}:${col.slotId}`)
                const proc = assignment ? procMap.get(assignment.process_id) : null
                const dept = proc ? deptMap.get(proc.department_id) : null
                const dc = dept ? getDeptColor(dept.color) : null
                const isLocked = assignment?.assignment_source === 'locked'

                return (
                  <td
                    key={col.slotId}
                    onClick={() => handleClick(emp.id, col.date, col.shift.id)}
                    style={{
                      width: 44,
                      minWidth: 44,
                      maxWidth: 44,
                      height: 36,
                      padding: 0,
                      borderBottom: 'none',
                      borderRight: 'none',
                      cursor: isEditable ? 'pointer' : 'default',
                      textAlign: 'center',
                      verticalAlign: 'middle',
                      backgroundColor: dc ? dc.bg : 'transparent',
                      transition: 'filter 0.15s',
                      position: 'relative',
                    }}
                    title={
                      assignment && proc
                        ? `${emp.first_name} — ${proc.name} (${assignment.scheduled_hours}u)${isLocked ? ' [vergrendeld]' : ''}`
                        : `${emp.first_name} — ${DAY_NAMES[col.dow]} ${col.shift.name}`
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
                    {assignment && proc ? (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: dc?.main ?? 'var(--foreground)',
                          fontFamily: 'var(--font-mono)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 1,
                        }}
                      >
                        {abbrev(proc.name)}
                        {isLocked && (
                          <Lock
                            size={8}
                            style={{ opacity: 0.6, marginLeft: 1, flexShrink: 0 }}
                          />
                        )}
                      </span>
                    ) : isEditable ? (
                      <span
                        className="plan-cell-plus"
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
                    ) : null}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* CSS for hover "+" visibility */}
      <style>{`
        td:hover .plan-cell-plus {
          opacity: 0.4 !important;
        }
      `}</style>
    </div>
  )
}
