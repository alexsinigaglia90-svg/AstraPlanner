'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { bouncy } from '@/lib/motion'

// ── Types ────────────────────────────────────────────────────────────────────

interface PastePreviewCell {
  row: number
  col: number
  value: number
  demandTypeName: string
  weekLabel: string
  isNew: boolean
  isChanged: boolean
}

interface PasteHandlerProps {
  demandTypes: Array<{ id: string; name: string }>
  weeks: string[]
  existingData: Map<string, number>
  onConfirm: (cells: Array<{ demand_type_id: string; period_start: string; volume: number }>) => void
  onCancel: () => void
  children: React.ReactNode
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseTsv(text: string): string[][] {
  return text
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split('\t'))
}

/** Fuzzy-match a pasted row header to a demand type name (case-insensitive includes). */
function matchDemandType(
  header: string,
  demandTypes: Array<{ id: string; name: string }>,
): { id: string; name: string } | null {
  const needle = header.trim().toLowerCase()
  if (!needle) return null

  // Exact match first
  const exact = demandTypes.find((dt) => dt.name.toLowerCase() === needle)
  if (exact) return exact

  // Includes match
  const partial = demandTypes.find(
    (dt) =>
      dt.name.toLowerCase().includes(needle) ||
      needle.includes(dt.name.toLowerCase()),
  )
  return partial ?? null
}

function formatWeekLabel(isoDate: string): string {
  try {
    const d = new Date(isoDate)
    return `W${getIsoWeek(d)}`
  } catch {
    return isoDate
  }
}

function getIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// ── Component ────────────────────────────────────────────────────────────────

export function PasteHandler({
  demandTypes,
  weeks,
  existingData,
  onConfirm,
  onCancel,
  children,
}: PasteHandlerProps) {
  const [previewCells, setPreviewCells] = useState<PastePreviewCell[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Build preview from parsed TSV
  const buildPreview = useCallback(
    (rows: string[][]) => {
      const cells: PastePreviewCell[] = []

      for (let r = 0; r < rows.length; r++) {
        const row = rows[r]
        if (!row || row.length < 2) continue

        // First column is the demand type header
        const header = row[0] ?? ''
        const matched = matchDemandType(header, demandTypes)
        if (!matched) continue

        // Remaining columns map to weeks
        for (let c = 1; c < row.length; c++) {
          const weekIdx = c - 1
          if (weekIdx >= weeks.length) break

          const raw = row[c]?.trim().replace(/[^0-9.,\-]/g, '').replace(',', '.')
          const value = Number(raw)
          if (isNaN(value) || raw === '') continue

          const key = `${matched.id}:${weeks[weekIdx]}`
          const existing = existingData.get(key)
          const isNew = existing === undefined
          const isChanged = !isNew && existing !== value

          cells.push({
            row: r,
            col: weekIdx,
            value,
            demandTypeName: matched.name,
            weekLabel: formatWeekLabel(weeks[weekIdx]),
            isNew,
            isChanged,
          })
        }
      }

      return cells
    },
    [demandTypes, weeks, existingData],
  )

  // Listen for paste events
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handler = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain')
      if (!text || !text.includes('\t')) return // Not TSV, ignore

      e.preventDefault()
      const rows = parseTsv(text)
      const cells = buildPreview(rows)

      if (cells.length > 0) {
        setPreviewCells(cells)
        setShowPreview(true)
      }
    }

    el.addEventListener('paste', handler)
    return () => el.removeEventListener('paste', handler)
  }, [buildPreview])

  // Close on Escape
  useEffect(() => {
    if (!showPreview) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowPreview(false)
        onCancel()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [showPreview, onCancel])

  // Confirm handler
  const handleConfirm = useCallback(() => {
    const payload = previewCells
      .filter((c) => c.isNew || c.isChanged)
      .map((c) => {
        const matched = demandTypes.find((dt) => dt.name === c.demandTypeName)
        return {
          demand_type_id: matched?.id ?? '',
          period_start: weeks[c.col],
          volume: c.value,
        }
      })
      .filter((c) => c.demand_type_id !== '')

    onConfirm(payload)
    setShowPreview(false)
  }, [previewCells, demandTypes, weeks, onConfirm])

  const handleCancel = useCallback(() => {
    setShowPreview(false)
    onCancel()
  }, [onCancel])

  const newCount = previewCells.filter((c) => c.isNew).length
  const changedCount = previewCells.filter((c) => c.isChanged).length

  // Group cells by demand type for preview grid
  const groupedByType = previewCells.reduce<Record<string, PastePreviewCell[]>>(
    (acc, cell) => {
      if (!acc[cell.demandTypeName]) acc[cell.demandTypeName] = []
      acc[cell.demandTypeName].push(cell)
      return acc
    },
    {},
  )

  // Collect unique week labels in order
  const weekLabels = [...new Set(previewCells.map((c) => c.weekLabel))]

  // ── Styles ───────────────────────────────────────────────────────────────

  const backdropStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    background: 'rgba(0,0,0,0.3)',
    backdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }

  const panelStyle: React.CSSProperties = {
    background: 'var(--card, #FFFFFF)',
    borderRadius: 16,
    border: '1px solid var(--border, #E0E7FF)',
    boxShadow: '0 24px 48px rgba(0,0,0,0.12)',
    padding: 24,
    maxWidth: 720,
    width: '90vw',
    maxHeight: '80vh',
    overflow: 'auto',
  }

  const cellBaseStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
    fontVariantNumeric: 'tabular-nums',
    fontSize: 13,
    fontWeight: 500,
    textAlign: 'right',
    padding: '4px 8px',
    borderRadius: 8,
    minWidth: 64,
  }

  const headerCellStyle: React.CSSProperties = {
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--muted-foreground, #64748B)',
    padding: '4px 8px',
    textAlign: 'center',
  }

  const rowHeaderStyle: React.CSSProperties = {
    fontSize: 12,
    fontWeight: 600,
    color: 'var(--foreground, #1E1B4B)',
    padding: '4px 8px',
    textAlign: 'left',
    whiteSpace: 'nowrap',
  }

  const confirmBtnStyle: React.CSSProperties = {
    background: 'linear-gradient(135deg, #6366F1 0%, #818CF8 100%)',
    color: '#FFFFFF',
    border: 'none',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  const cancelBtnStyle: React.CSSProperties = {
    background: 'transparent',
    color: 'var(--muted-foreground, #64748B)',
    border: '1px solid var(--border, #E0E7FF)',
    borderRadius: 8,
    padding: '8px 20px',
    fontSize: 13,
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {children}

      <AnimatePresence>
        {showPreview && (
          <motion.div
            key="paste-backdrop"
            style={backdropStyle}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <motion.div
              style={panelStyle}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={bouncy}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div style={{ marginBottom: 16 }}>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--foreground, #1E1B4B)',
                    margin: 0,
                  }}
                >
                  Plakvoorbeeld
                </h3>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--muted-foreground, #64748B)',
                    margin: '4px 0 0',
                  }}
                >
                  {newCount} nieuwe, {changedCount} gewijzigd
                </p>
              </div>

              {/* Preview grid */}
              <div style={{ overflowX: 'auto', marginBottom: 20 }}>
                <table
                  style={{
                    borderCollapse: 'separate',
                    borderSpacing: 4,
                    width: '100%',
                  }}
                >
                  <thead>
                    <tr>
                      <th style={headerCellStyle} />
                      {weekLabels.map((wl) => (
                        <th key={wl} style={headerCellStyle}>
                          {wl}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedByType).map(([typeName, cells]) => (
                      <tr key={typeName}>
                        <td style={rowHeaderStyle}>{typeName}</td>
                        {weekLabels.map((wl) => {
                          const cell = cells.find((c) => c.weekLabel === wl)
                          if (!cell) {
                            return <td key={wl} style={cellBaseStyle} />
                          }

                          const bg = cell.isNew
                            ? 'rgba(34,197,94,0.12)'
                            : cell.isChanged
                              ? 'rgba(249,115,22,0.12)'
                              : 'rgba(99,102,241,0.06)'
                          const borderColor = cell.isNew
                            ? 'rgba(34,197,94,0.3)'
                            : cell.isChanged
                              ? 'rgba(249,115,22,0.3)'
                              : 'transparent'

                          return (
                            <td
                              key={wl}
                              style={{
                                ...cellBaseStyle,
                                background: bg,
                                border: `1px solid ${borderColor}`,
                                color: 'var(--foreground, #1E1B4B)',
                              }}
                            >
                              {cell.value.toLocaleString('nl-NL')}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: 'flex',
                  gap: 8,
                  justifyContent: 'flex-end',
                }}
              >
                <motion.button
                  style={cancelBtnStyle}
                  onClick={handleCancel}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  Annuleren
                </motion.button>
                <motion.button
                  style={confirmBtnStyle}
                  onClick={handleConfirm}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  disabled={newCount + changedCount === 0}
                >
                  Bevestigen ({newCount + changedCount})
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
