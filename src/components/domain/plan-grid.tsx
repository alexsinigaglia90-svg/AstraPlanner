'use client'

import { useMemo, useCallback } from 'react'
import { Lock, Plus } from 'lucide-react'
import { getDeptColor } from '@/components/domain/process-card'

// ── Day / month names (Dutch) ──────────────────────────────────────────────

const DAY_NAMES = ['', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo']
const MONTH_NAMES = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

// ── Helpers ────────────────────────────────────────────────────────────────

function addDays(date: string, n: number): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]!
}

function fmtHeader(dateStr: string): { label: string; dow: number } {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay() === 0 ? 7 : d.getDay() // ISO: 1=Ma … 7=Zo
  const dayName = DAY_NAMES[dow] ?? ''
  const dayNum = d.getDate()
  const monthName = MONTH_NAMES[d.getMonth()] ?? ''
  return { label: `${dayName} ${dayNum} ${monthName}`, dow }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!m) return null
  return { r: parseInt(m[1]!, 16), g: parseInt(m[2]!, 16), b: parseInt(m[3]!, 16) }
}

function rgbaBg(hex: string, alpha: number): string {
  const c = hexToRgb(hex)
  if (!c) return 'transparent'
  return `rgba(${c.r},${c.g},${c.b},${alpha})`
}

function fmtTime(t?: string): string {
  if (!t) return ''
  return t.slice(0, 5) // "HH:MM:SS" → "HH:MM"
}


/** Background opacity per shift — scales with start hour for continuous differentiation */
function shiftBgAlpha(startTime?: string): number {
  if (!startTime) return 0.045
  const hour = parseInt(startTime.slice(0, 2), 10)
  // Map hour to alpha: 05:00→0.03, 08:00→0.05, 11:00→0.08, 14:00→0.10, 22:00→0.12
  return 0.03 + (hour / 24) * 0.10
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Assignment {
  id: string
  employee_id: string
  process_id: string
  shift_pattern_id: string
  assignment_date: string
  scheduled_hours: number
  assignment_source: string
  cost_estimate: number
  proficiency_level?: number
}

interface ShiftDef {
  id: string
  name: string
  start_time?: string
  end_time?: string
}

interface DemandEntry {
  process_id: string
  date: string
  required_fte: number
}

interface PlanGridProps {
  assignments: Assignment[]
  employees: Array<{
    id: string
    first_name: string
    last_name: string
    department_id: string | null
    crew_name?: string | null
  }>
  processes: Array<{ id: string; name: string; department_id: string }>
  departments: Array<{ id: string; name: string; color: string }>
  shifts: ShiftDef[]
  weekStart: string
  workDays: number[]
  isEditable: boolean
  demand?: DemandEntry[]
  onCellClick?: (employeeId: string, date: string, shiftId: string, assignment: Assignment | null) => void
}

// ── Day column type ────────────────────────────────────────────────────────

interface DayCol {
  date: string
  label: string
  dow: number
}

// ── Skill badge colors ─────────────────────────────────────────────────────

function skillBadgeStyle(level?: number): { color: string; bg: string } | null {
  if (level == null) return null
  if (level >= 3) return { color: '#059669', bg: 'rgba(16,185,129,0.1)' }
  if (level === 2) return { color: '#b45309', bg: 'rgba(245,158,11,0.1)' }
  return { color: '#dc2626', bg: 'rgba(239,68,68,0.08)' }
}

// ── Coverage color ─────────────────────────────────────────────────────────

function coverageColor(pct: number): string {
  if (pct >= 90) return '#059669'
  if (pct >= 70) return '#b45309'
  return '#dc2626'
}

// ── Component ──────────────────────────────────────────────────────────────

export function PlanGrid({
  assignments,
  employees,
  processes,
  departments,
  shifts,
  weekStart,
  workDays,
  isEditable,
  demand,
  onCellClick,
}: PlanGridProps) {
  // ── Day columns ────────────────────────────────────────────────────────

  const dayCols = useMemo<DayCol[]>(() => {
    return workDays.map((dow) => {
      const date = addDays(weekStart, dow - 1)
      const hdr = fmtHeader(date)
      return { date, label: hdr.label, dow: hdr.dow }
    })
  }, [weekStart, workDays])

  // ── Assignment lookup: "empId:date" → first assignment ─────────────────

  const assignmentMap = useMemo(() => {
    const map = new Map<string, Assignment>()
    for (const a of assignments) {
      const key = `${a.employee_id}:${a.assignment_date}`
      if (!map.has(key)) map.set(key, a)
    }
    return map
  }, [assignments])

  // ── Process + department + shift lookups ────────────────────────────────

  const procMap = useMemo(() => new Map(processes.map((p) => [p.id, p])), [processes])
  const deptMap = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])
  const shiftMap = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts])

  // ── Dominant shift per employee (for sorting) ──────────────────────────

  const empShiftOrder = useMemo(() => {
    const order = new Map<string, number>()
    for (const emp of employees) {
      // Find all assignments for this employee and their shift start times
      const empAssignments = assignments.filter((a) => a.employee_id === emp.id)
      if (empAssignments.length === 0) {
        order.set(emp.id, 99) // no assignments → sort last
        continue
      }
      // Count shift occurrences by start hour
      const hourCounts = new Map<number, number>()
      for (const a of empAssignments) {
        const shift = shiftMap.get(a.shift_pattern_id)
        const hour = shift?.start_time ? parseInt(shift.start_time.slice(0, 2), 10) : 12
        hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1)
      }
      // Pick the most frequent start hour as the sort key
      let maxCount = 0
      let dominantHour = 12
      for (const [hour, count] of hourCounts) {
        if (count > maxCount) {
          maxCount = count
          dominantHour = hour
        }
      }
      order.set(emp.id, dominantHour)
    }
    return order
  }, [employees, assignments, shiftMap])

  // ── Employee grouping by department ────────────────────────────────────

  const groupedEmployees = useMemo(() => {
    const groups: Array<{
      deptId: string | null
      deptName: string
      deptColor: string
      employees: typeof employees
    }> = []

    const byDept = new Map<string | null, typeof employees>()
    for (const emp of employees) {
      const key = emp.department_id
      if (!byDept.has(key)) byDept.set(key, [])
      byDept.get(key)!.push(emp)
    }

    // Sort employees within each group by dominant shift time
    const sortEmps = (emps: typeof employees) =>
      [...emps].sort((a, b) => (empShiftOrder.get(a.id) ?? 99) - (empShiftOrder.get(b.id) ?? 99))

    // Department groups first (sorted by name)
    const sortedDepts = [...departments].sort((a, b) => a.name.localeCompare(b.name))
    for (const dept of sortedDepts) {
      const emps = byDept.get(dept.id)
      if (emps && emps.length > 0) {
        groups.push({
          deptId: dept.id,
          deptName: dept.name,
          deptColor: dept.color,
          employees: sortEmps(emps),
        })
      }
    }

    // "Overig" group for employees without department
    const noDepEmps = byDept.get(null)
    if (noDepEmps && noDepEmps.length > 0) {
      groups.push({
        deptId: null,
        deptName: 'Overig',
        deptColor: 'slate',
        employees: sortEmps(noDepEmps),
      })
    }

    return groups
  }, [employees, departments])

  // ── Demand lookup: "processId:date" → required_fte ─────────────────────

  const demandMap = useMemo(() => {
    const map = new Map<string, number>()
    if (!demand) return map
    for (const d of demand) {
      map.set(`${d.process_id}:${d.date}`, d.required_fte)
    }
    return map
  }, [demand])

  // ── Subtotal computation helper ────────────────────────────────────────

  const computeSubtotals = useCallback(
    (deptId: string | null) => {
      const deptProcesses = processes.filter((p) => p.department_id === deptId)
      if (deptProcesses.length === 0) return null

      // Per-day totals for the entire department
      const dayTotals = dayCols.map((col) => {
        let assigned = 0
        let required = 0
        for (const proc of deptProcesses) {
          const req = demandMap.get(`${proc.id}:${col.date}`) ?? 0
          required += req
          // Count assignments for this process on this date
          for (const a of assignments) {
            if (a.process_id === proc.id && a.assignment_date === col.date) {
              assigned++
            }
          }
        }
        return { assigned, required }
      })

      // Per-process per-day
      const processTotals = deptProcesses
        .filter((proc) => dayCols.some((col) => demandMap.has(`${proc.id}:${col.date}`)))
        .map((proc) => ({
          process: proc,
          days: dayCols.map((col) => {
            const req = demandMap.get(`${proc.id}:${col.date}`) ?? 0
            let assigned = 0
            for (const a of assignments) {
              if (a.process_id === proc.id && a.assignment_date === col.date) {
                assigned++
              }
            }
            return { assigned, required: req }
          }),
        }))

      return { dayTotals, processTotals }
    },
    [processes, dayCols, demandMap, assignments],
  )

  // ── Click handler ──────────────────────────────────────────────────────

  const handleClick = useCallback(
    (empId: string, date: string, assignment: Assignment | null) => {
      if (!isEditable || !onCellClick) return
      // Use the assignment's shift, or first available shift
      const shiftId = assignment?.shift_pattern_id ?? shifts[0]?.id ?? ''
      onCellClick(empId, date, shiftId, assignment)
    },
    [isEditable, onCellClick, shifts],
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

  // ── Has demand data? ───────────────────────────────────────────────────

  const hasDemand = demand && demand.length > 0

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        overflow: 'auto',
        maxHeight: 'calc(100vh - 220px)',
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
          tableLayout: 'fixed',
          minWidth: 160 + dayCols.length * 120,
        }}
      >
        <colgroup>
          <col style={{ width: 160, minWidth: 160 }} />
          {dayCols.map((col) => (
            <col key={col.date} style={{ width: 120, minWidth: 120 }} />
          ))}
        </colgroup>

        <thead>
          <tr>
            <th
              style={{
                position: 'sticky',
                left: 0,
                top: 0,
                zIndex: 4,
                backgroundColor: '#f8fafc',
                borderBottom: '2px solid #e2e8f0',
                borderRight: '1px solid #e2e8f0',
                padding: '8px 12px',
                fontFamily: 'var(--font-display)',
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--muted-foreground)',
                textAlign: 'left',
                letterSpacing: '0.05em',
                textTransform: 'uppercase',
              }}
            >
              Medewerker
            </th>
            {dayCols.map((col) => (
              <th
                key={col.date}
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 3,
                  padding: '6px 4px',
                  backgroundColor: '#f8fafc',
                  borderBottom: '2px solid #e2e8f0',
                  color: 'var(--foreground)',
                  fontFamily: 'var(--font-display)',
                  fontSize: 11,
                  fontWeight: 700,
                  textAlign: 'center',
                  whiteSpace: 'nowrap',
                  letterSpacing: '0.02em',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {groupedEmployees.map((group) => {
            const dc = getDeptColor(group.deptColor)
            const subtotals = hasDemand ? computeSubtotals(group.deptId) : null

            return [
              // ── Department header row ──────────────────────────────
              <tr key={`dept-hdr-${group.deptId ?? 'overig'}`}>
                <td
                  colSpan={1 + dayCols.length}
                  style={{
                    padding: '6px 12px',
                    backgroundColor: dc.bg,
                    borderLeft: `3px solid ${dc.main}`,
                    borderBottom: '1px solid #e2e8f0',
                    fontFamily: 'var(--font-display)',
                    fontSize: 11,
                    fontWeight: 700,
                    color: dc.main,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    position: 'sticky',
                    left: 0,
                  }}
                >
                  {group.deptName}
                </td>
              </tr>,

              // ── Employee rows ──────────────────────────────────────
              ...group.employees.map((emp) => (
                <tr key={emp.id}>
                  {/* Sticky left: Avatar + name + crew */}
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      zIndex: 2,
                      padding: '4px 10px',
                      backgroundColor: '#fff',
                      borderRight: '1px solid #e2e8f0',
                      borderBottom: '1px solid rgba(0,0,0,0.04)',
                      height: 40,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
                      {/* Initials avatar */}
                      <div
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: '50%',
                          background: `linear-gradient(135deg, ${dc.main}, ${rgbaBg(dc.main, 0.7)})`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        <span
                          style={{
                            color: '#fff',
                            fontSize: 9,
                            fontWeight: 700,
                            fontFamily: 'var(--font-display)',
                            lineHeight: 1,
                          }}
                        >
                          {(emp.first_name?.[0] ?? '').toUpperCase()}
                          {(emp.last_name?.[0] ?? '').toUpperCase()}
                        </span>
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            color: '#1e293b',
                            fontSize: 12,
                            fontWeight: 700,
                            fontFamily: 'var(--font-body)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            lineHeight: 1.3,
                          }}
                        >
                          {emp.first_name} {emp.last_name}
                        </div>
                        {emp.crew_name && (
                          <div
                            style={{
                              display: 'inline-block',
                              padding: '1px 6px',
                              borderRadius: 8,
                              backgroundColor: 'rgba(245,158,11,0.12)',
                              color: '#b45309',
                              fontSize: 9,
                              fontWeight: 600,
                              fontFamily: 'var(--font-body)',
                              lineHeight: 1.4,
                              marginTop: 1,
                            }}
                          >
                            {emp.crew_name}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Assignment cells */}
                  {dayCols.map((col) => {
                    const assignment = assignmentMap.get(`${emp.id}:${col.date}`)
                    const proc = assignment ? procMap.get(assignment.process_id) : null
                    const procDept = proc ? deptMap.get(proc.department_id) : null
                    const procDc = procDept ? getDeptColor(procDept.color) : null
                    const shift = assignment ? shiftMap.get(assignment.shift_pattern_id) : null
                    const isLocked = assignment?.assignment_source === 'locked'
                    const profLevel = assignment?.proficiency_level
                    const badge = skillBadgeStyle(profLevel)
                    const isLowSkill = profLevel === 1

                    const cellBg = procDc
                      ? rgbaBg(procDc.main, shiftBgAlpha(shift?.start_time))
                      : 'transparent'

                    return (
                      <td
                        key={col.date}
                        onClick={() => handleClick(emp.id, col.date, assignment ?? null)}
                        style={{
                          height: 40,
                          padding: '4px 6px',
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                          borderRight: '1px solid rgba(0,0,0,0.03)',
                          cursor: isEditable ? 'pointer' : 'default',
                          verticalAlign: 'middle',
                          backgroundColor: cellBg,
                          transition: 'filter 0.15s',
                          position: 'relative',
                          ...(isLowSkill
                            ? { border: '1px solid rgba(239,68,68,0.2)' }
                            : {}),
                        }}
                        title={
                          assignment && proc
                            ? `${emp.first_name} ${emp.last_name} — ${proc.name} (${assignment.scheduled_hours}u)${isLocked ? ' [vergrendeld]' : ''}`
                            : `${emp.first_name} ${emp.last_name} — ${col.label}`
                        }
                        onMouseEnter={(e) => {
                          const el = e.currentTarget
                          el.style.filter = 'brightness(0.97)'
                          el.style.outline = '1px solid rgba(0,0,0,0.08)'
                          el.style.outlineOffset = '-1px'
                          el.style.zIndex = '5'
                        }}
                        onMouseLeave={(e) => {
                          const el = e.currentTarget
                          el.style.filter = 'none'
                          el.style.outline = 'none'
                          el.style.zIndex = 'auto'
                        }}
                      >
                        {assignment && proc ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                            {/* Line 1: process name + skill badge + shift badge */}
                            <div
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 3,
                              }}
                            >
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: procDc?.main ?? 'var(--foreground)',
                                  fontFamily: 'var(--font-body)',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  minWidth: 0,
                                  flex: 1,
                                }}
                              >
                                {proc.name}
                                {isLocked && (
                                  <Lock
                                    size={9}
                                    style={{ opacity: 0.5, marginLeft: 2, verticalAlign: 'middle' }}
                                  />
                                )}
                              </span>
                              {badge && (
                                <span
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    width: 14,
                                    height: 14,
                                    borderRadius: '50%',
                                    backgroundColor: badge.bg,
                                    color: badge.color,
                                    fontSize: 9,
                                    fontWeight: 700,
                                    fontFamily: 'var(--font-mono)',
                                    flexShrink: 0,
                                  }}
                                >
                                  {profLevel}
                                </span>
                              )}
                            </div>
                            {/* Line 2: times + hours */}
                            <div
                              style={{
                                fontSize: 10,
                                color: 'var(--muted-foreground)',
                                fontFamily: 'var(--font-mono)',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {shift?.start_time && shift?.end_time
                                ? `${fmtTime(shift.start_time).slice(0, 2)}-${fmtTime(shift.end_time).slice(0, 2)} · ${assignment.scheduled_hours}u`
                                : `${assignment.scheduled_hours}u`}
                            </div>
                          </div>
                        ) : (
                          <div
                            className="plan-cell-empty"
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              height: '100%',
                            }}
                          >
                            <span
                              className="plan-cell-dash"
                              style={{
                                color: '#cbd5e1',
                                fontSize: 13,
                              }}
                            >
                              —
                            </span>
                            {isEditable && (
                              <span
                                className="plan-cell-plus"
                                style={{
                                  color: 'var(--muted-foreground)',
                                  opacity: 0,
                                  fontSize: 14,
                                  fontWeight: 300,
                                  transition: 'opacity 0.15s',
                                  position: 'absolute',
                                }}
                              >
                                <Plus size={14} />
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              )),

              // ── Department subtotal row ────────────────────────────
              ...(subtotals
                ? [
                    <tr key={`dept-sub-${group.deptId ?? 'overig'}`}>
                      <td
                        style={{
                          position: 'sticky',
                          left: 0,
                          zIndex: 2,
                          padding: '3px 10px',
                          backgroundColor: rgbaBg(dc.main, 0.06),
                          borderRight: '1px solid #e2e8f0',
                          borderBottom: '1px solid #e2e8f0',
                          fontFamily: 'var(--font-display)',
                          fontSize: 10,
                          fontWeight: 700,
                          color: dc.main,
                        }}
                      >
                        Subtotaal
                      </td>
                      {subtotals.dayTotals.map((dt, i) => {
                        const pct = dt.required > 0 ? (dt.assigned / dt.required) * 100 : 100
                        return (
                          <td
                            key={dayCols[i]!.date}
                            style={{
                              padding: '3px 6px',
                              backgroundColor: rgbaBg(dc.main, 0.06),
                              borderBottom: '1px solid #e2e8f0',
                              textAlign: 'center',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 10,
                              fontWeight: 700,
                              color: coverageColor(pct),
                            }}
                          >
                            {dt.assigned}/{dt.required % 1 === 0 ? dt.required : dt.required.toFixed(1)}
                            {dt.required > 0 && (
                              <span style={{ marginLeft: 3, opacity: 0.7, fontSize: 9 }}>
                                {Math.round(pct)}%
                              </span>
                            )}
                          </td>
                        )
                      })}
                    </tr>,

                    // ── Process subtotal rows ────────────────────────
                    ...subtotals.processTotals.map((pt) => {
                      const ptDc = getDeptColor(group.deptColor)
                      return (
                        <tr key={`proc-sub-${pt.process.id}`}>
                          <td
                            style={{
                              position: 'sticky',
                              left: 0,
                              zIndex: 2,
                              padding: '2px 10px 2px 26px',
                              backgroundColor: rgbaBg(dc.main, 0.03),
                              borderRight: '1px solid #e2e8f0',
                              borderBottom: '1px solid rgba(0,0,0,0.03)',
                              fontFamily: 'var(--font-body)',
                              fontSize: 10,
                              fontWeight: 600,
                              color: ptDc.main,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {pt.process.name}
                          </td>
                          {pt.days.map((d, i) => (
                            <td
                              key={dayCols[i]!.date}
                              style={{
                                padding: '2px 6px',
                                backgroundColor: rgbaBg(dc.main, 0.03),
                                borderBottom: '1px solid rgba(0,0,0,0.03)',
                                textAlign: 'center',
                                fontFamily: 'var(--font-mono)',
                                fontSize: 10,
                                color: 'var(--muted-foreground)',
                              }}
                            >
                              {d.assigned}/{d.required % 1 === 0 ? d.required : d.required.toFixed(1)}
                            </td>
                          ))}
                        </tr>
                      )
                    }),
                  ]
                : []),
            ]
          })}
        </tbody>
      </table>

      {/* CSS for hover effects on empty cells */}
      <style>{`
        td:hover .plan-cell-plus {
          opacity: 0.5 !important;
        }
        td:hover .plan-cell-dash {
          opacity: 0 !important;
        }
      `}</style>
    </div>
  )
}
