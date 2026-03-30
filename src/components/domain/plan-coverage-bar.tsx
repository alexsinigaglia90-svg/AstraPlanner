'use client'

import { useMemo } from 'react'
import { getDeptColor } from '@/components/domain/process-card'

// ── Types ─────────────────────────────────────────────────────────────────────

interface PlanCoverageBarProps {
  assignments: Array<{ process_id: string }>
  processes: Array<{ id: string; name: string; department_id: string }>
  departments: Array<{ id: string; name: string; color: string }>
  /** Required FTE per process (from workload computation). If null, show message. */
  demandByProcess: Map<string, number> | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getCoverageColor(ratio: number): string {
  if (ratio >= 0.9) return '#10B981'
  if (ratio >= 0.7) return '#F59E0B'
  return '#EF4444'
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanCoverageBar({
  assignments,
  processes,
  departments,
  demandByProcess,
}: PlanCoverageBarProps) {
  const deptColorMap = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of departments) {
      map.set(d.id, d.color)
    }
    return map
  }, [departments])

  const rows = useMemo(() => {
    if (!demandByProcess) return []

    // Count assigned FTE per process
    const assignedCount = new Map<string, number>()
    for (const a of assignments) {
      assignedCount.set(a.process_id, (assignedCount.get(a.process_id) ?? 0) + 1)
    }

    // Build row data for each process that has a demand entry
    const result = processes
      .filter((p) => demandByProcess.has(p.id))
      .map((p) => {
        const required = demandByProcess.get(p.id) ?? 0
        const assigned = assignedCount.get(p.id) ?? 0
        const ratio = required > 0 ? assigned / required : assigned > 0 ? 1 : 0
        const cappedRatio = Math.min(ratio, 1)
        return { process: p, assigned, required, ratio, cappedRatio }
      })

    // Sort by coverage ascending (worst gaps first)
    result.sort((a, b) => a.ratio - b.ratio)

    return result
  }, [assignments, processes, demandByProcess])

  return (
    <div
      style={{
        backgroundColor: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '16px',
      }}
    >
      <h3
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 700,
          fontSize: '14px',
          color: 'var(--foreground)',
          margin: '0 0 14px 0',
        }}
      >
        Dekking per proces
      </h3>

      {demandByProcess === null ? (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--muted-foreground)',
            margin: 0,
          }}
        >
          Voer eerst de workload compute uit om dekking te berekenen.
        </p>
      ) : rows.length === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-body)',
            fontSize: '13px',
            color: 'var(--muted-foreground)',
            margin: 0,
          }}
        >
          Geen processen met werkbelastingdata gevonden.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(({ process, assigned, required, cappedRatio }) => {
            const deptColor = deptColorMap.get(process.department_id) ?? 'indigo'
            const c = getDeptColor(deptColor)
            const fillColor = getCoverageColor(cappedRatio)
            const fillPercent = Math.round(cappedRatio * 100)

            return (
              <div
                key={process.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                }}
              >
                {/* Process name */}
                <span
                  style={{
                    width: '160px',
                    flexShrink: 0,
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600,
                    fontSize: '13px',
                    color: 'var(--foreground)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={process.name}
                >
                  {process.name}
                </span>

                {/* Assigned / Required */}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    fontWeight: 600,
                    color: c.main,
                    whiteSpace: 'nowrap',
                    width: '80px',
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {assigned} / {required} FTE
                </span>

                {/* Progress bar */}
                <div
                  style={{
                    flex: 1,
                    height: '8px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--muted)',
                    overflow: 'hidden',
                    position: 'relative',
                  }}
                >
                  <div
                    style={{
                      width: `${fillPercent}%`,
                      height: '100%',
                      borderRadius: '4px',
                      backgroundColor: fillColor,
                      transition: 'width 0.4s ease',
                    }}
                  />
                </div>

                {/* Percentage label */}
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: fillColor,
                    width: '38px',
                    textAlign: 'right',
                    flexShrink: 0,
                  }}
                >
                  {fillPercent}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
