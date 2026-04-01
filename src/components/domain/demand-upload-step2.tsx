'use client'

import type { ParsedDemand } from './demand-upload-wizard'

const NL_DAYS_CAP = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'] as const
const NL_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

// ── Props ─────────────────────────────────────────────────────────────────────

export interface Step2Props {
  entries: ParsedDemand[]
  uniquePeriods: string[]
  uniqueProcesses: string[]
  isDayMode: boolean
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Step2({ entries, uniquePeriods, uniqueProcesses, isDayMode }: Step2Props) {
  const lookup = new Map<string, Map<string, number>>()
  for (const e of entries) {
    if (!lookup.has(e.demandTypeName)) lookup.set(e.demandTypeName, new Map())
    lookup.get(e.demandTypeName)!.set(e.periodStart, e.volume)
  }

  const periodLabel = (iso: string) => {
    const d = new Date(iso)
    if (isDayMode) {
      return NL_DAYS_CAP[d.getDay()]!
    }
    const wk = Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)
    return `Wk${wk}`
  }
  const periodSub = (iso: string) => {
    const d = new Date(iso)
    return `${d.getDate()} ${NL_MONTHS[d.getMonth()]}`
  }

  const periodTypeLabel = isDayMode ? 'dagen' : 'weken'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Summary banner */}
      <div style={{
        padding: '12px 16px',
        borderRadius: 10,
        background: 'rgba(99,102,241,0.08)',
        border: '1px solid rgba(99,102,241,0.2)',
        fontFamily: 'var(--font-body)',
        fontSize: 13,
        color: 'var(--foreground)',
      }}>
        <strong>{entries.length}</strong> demand entries over{' '}
        <strong>{uniquePeriods.length}</strong> {periodTypeLabel} voor{' '}
        <strong>{uniqueProcesses.length}</strong> processen
      </div>

      {/* Preview table */}
      <div style={{
        overflowX: 'auto',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontFamily: 'var(--font-body)',
          fontSize: 12,
        }}>
          <thead>
            <tr style={{ background: 'var(--muted)' }}>
              <th style={{
                padding: '8px 12px',
                textAlign: 'left',
                fontWeight: 700,
                color: 'var(--muted-foreground)',
                borderBottom: '1px solid var(--border)',
                whiteSpace: 'nowrap',
                minWidth: 130,
                maxWidth: 130,
                position: 'sticky',
                left: 0,
                background: 'var(--muted)',
                zIndex: 2,
                boxShadow: '4px 0 8px rgba(0,0,0,0.04)',
              }}>
                Proces
              </th>
              {uniquePeriods.map((w) => (
                <th key={w} style={{
                  padding: '8px 12px',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: 'var(--muted-foreground)',
                  borderBottom: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                  minWidth: isDayMode ? 60 : 80,
                }}>
                  <div>{periodLabel(w)}</div>
                  <div style={{ fontSize: 10, fontWeight: 400 }}>{periodSub(w)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {uniqueProcesses.map((proc, idx) => {
              const procMap = lookup.get(proc)
              return (
                <tr
                  key={proc}
                  style={{
                    background: idx % 2 === 0 ? 'transparent' : 'rgba(99,102,241,0.02)',
                  }}
                >
                  <td style={{
                    padding: '7px 12px',
                    color: 'var(--foreground)',
                    fontWeight: 600,
                    borderBottom: idx < uniqueProcesses.length - 1 ? '1px solid var(--border)' : 'none',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    minWidth: 130,
                    maxWidth: 130,
                    position: 'sticky',
                    left: 0,
                    background: idx % 2 === 0 ? '#ffffff' : '#f9f8ff',
                    zIndex: 2,
                    boxShadow: '4px 0 8px rgba(0,0,0,0.04)',
                  }}>
                    {proc}
                  </td>
                  {uniquePeriods.map((w) => {
                    const val = procMap?.get(w)
                    return (
                      <td key={w} style={{
                        padding: '7px 12px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: val != null ? 'var(--foreground)' : 'var(--muted-foreground)',
                        borderBottom: idx < uniqueProcesses.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        {val != null ? val.toLocaleString('nl-NL') : '\u2014'}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
