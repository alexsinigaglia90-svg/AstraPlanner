'use client'

import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { bouncy, snappy } from '@/lib/motion'
import { Upload, FileSpreadsheet, Check, X } from 'lucide-react'
import ExcelJS from 'exceljs'

// ── Types ────────────────────────────────────────────────────────────────────

interface DemandTypeOption {
  id: string
  name: string
}

export interface ImportRow {
  demand_type_id: string
  period_start: string
  volume: number
}

export interface ExcelDropZoneProps {
  demandTypes: DemandTypeOption[]
  onImport: (data: ImportRow[]) => void
  children: React.ReactNode
}

interface ParsedPreview {
  fileName: string
  columns: string[]
  demandTypeColumn: string | null
  weekColumns: Array<{ header: string; isoWeek: string }>
  matchedRows: Array<{
    demandTypeName: string
    demandTypeId: string | null
    volumes: Record<string, number>
  }>
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const WEEK_PATTERNS = [
  /^week\s*(\d{1,2})$/i,
  /^wk\s*(\d{1,2})$/i,
  /^w(\d{1,2})$/i,
  /^(\d{4})-w(\d{1,2})$/i,
]

function parseWeekHeader(header: string): string | null {
  const trimmed = header.trim()
  for (const pattern of WEEK_PATTERNS) {
    const m = trimmed.match(pattern)
    if (m) {
      const weekNum = m[2] ?? m[1] ?? ''
      const year = m[2] ? m[0].slice(0, 4) : String(new Date().getFullYear())
      return `${year}-W${weekNum.padStart(2, '0')}`
    }
  }
  return null
}

function fuzzyMatchDemandType(
  name: string,
  types: DemandTypeOption[],
): DemandTypeOption | null {
  const lower = name.toLowerCase().trim()
  return (
    types.find((t) => t.name.toLowerCase() === lower) ??
    types.find((t) => t.name.toLowerCase().includes(lower)) ??
    types.find((t) => lower.includes(t.name.toLowerCase())) ??
    null
  )
}

/**
 * Convert an ExcelJS cell value to a plain string. ExcelJS returns rich
 * objects for formulas, rich text, and hyperlinks — we unwrap them so the
 * downstream matching logic can work with plain strings.
 */
function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object') {
    const obj = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }>; hyperlink?: string }
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((r) => r.text).join('')
    }
    if ('result' in obj && obj.result !== undefined) return String(obj.result)
    if ('text' in obj && obj.text !== undefined) return String(obj.text)
    if ('hyperlink' in obj && obj.hyperlink) return String(obj.hyperlink)
  }
  return String(value)
}

function isDemandTypeColumn(header: string): boolean {
  const lower = header.toLowerCase().trim()
  return (
    lower.includes('type') ||
    lower.includes('naam') ||
    lower.includes('name') ||
    lower.includes('demand') ||
    lower.includes('product') ||
    lower.includes('vraag')
  )
}

// ── Component ────────────────────────────────────────────────────────────────

export function ExcelDropZone({
  demandTypes,
  onImport,
  children,
}: ExcelDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [preview, setPreview] = useState<ParsedPreview | null>(null)
  const dragCounter = useRef(0)

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current++
    if (dragCounter.current === 1) setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragCounter.current--
    if (dragCounter.current === 0) setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const parseFile = useCallback(
    async (file: File) => {
      try {
        const buffer = await file.arrayBuffer()
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(buffer)

        const sheet = workbook.worksheets[0]
        if (!sheet) return

        // Header row = first non-empty row. We treat row 1 as the header
        // unless it's empty, in which case we scan down for the first
        // populated row.
        let headerRowNumber = 1
        while (headerRowNumber <= sheet.rowCount) {
          const row = sheet.getRow(headerRowNumber)
          if (row.values && (row.values as unknown[]).some((v) => v !== null && v !== undefined && v !== '')) {
            break
          }
          headerRowNumber++
        }
        if (headerRowNumber > sheet.rowCount) return

        // Extract column headers. ExcelJS row.values is 1-indexed (index 0 is always null).
        const headerRow = sheet.getRow(headerRowNumber)
        const columns: string[] = []
        for (let c = 1; c <= sheet.columnCount; c++) {
          const v = headerRow.getCell(c).value
          columns.push(cellText(v))
        }

        // Build a JSON-like representation for the remaining rows.
        const json: Record<string, unknown>[] = []
        for (let r = headerRowNumber + 1; r <= sheet.rowCount; r++) {
          const row = sheet.getRow(r)
          const record: Record<string, unknown> = {}
          let hasAnyValue = false
          for (let c = 1; c <= columns.length; c++) {
            const header = columns[c - 1]
            if (!header) continue
            const v = row.getCell(c).value
            const text = cellText(v)
            record[header] = text
            if (text !== '') hasAnyValue = true
          }
          if (hasAnyValue) json.push(record)
        }

        if (json.length === 0) return

        // Detect demand type column
        const demandTypeCol: string = columns.find(isDemandTypeColumn) ?? columns[0] ?? ''

        // Detect week columns
        const weekColumns: ParsedPreview['weekColumns'] = []
        for (const col of columns) {
          const iso = parseWeekHeader(col)
          if (iso) weekColumns.push({ header: col, isoWeek: iso })
        }

        // Match rows
        const matchedRows: ParsedPreview['matchedRows'] = json.map((row) => {
          const name = String(row[demandTypeCol] ?? '').trim()
          const matched = fuzzyMatchDemandType(name, demandTypes)
          const volumes: Record<string, number> = {}
          for (const wc of weekColumns) {
            const val = Number(row[wc.header])
            if (!isNaN(val)) volumes[wc.isoWeek] = val
          }
          return {
            demandTypeName: name,
            demandTypeId: matched?.id ?? null,
            volumes,
          }
        })

        setPreview({
          fileName: file.name,
          columns,
          demandTypeColumn: demandTypeCol || null,
          weekColumns,
          matchedRows,
        })
      } catch (err) {
        console.error('[excel-drop-zone] parse error:', err)
      }
    },
    [demandTypes],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragCounter.current = 0
      setIsDragging(false)

      const file = e.dataTransfer.files[0]
      if (!file) return
      if (
        !file.name.endsWith('.xlsx') &&
        !file.name.endsWith('.xls')
      ) {
        return
      }
      parseFile(file)
    },
    [parseFile],
  )

  const handleConfirmImport = () => {
    if (!preview) return
    const rows: ImportRow[] = []
    for (const row of preview.matchedRows) {
      if (!row.demandTypeId) continue
      for (const [isoWeek, vol] of Object.entries(row.volumes)) {
        rows.push({
          demand_type_id: row.demandTypeId,
          period_start: isoWeek,
          volume: vol,
        })
      }
    }
    onImport(rows)
    setPreview(null)
  }

  const matchedCount = preview
    ? preview.matchedRows.filter((r) => r.demandTypeId !== null).length
    : 0
  const totalImportRows = preview
    ? preview.matchedRows
        .filter((r) => r.demandTypeId !== null)
        .reduce((sum, r) => sum + Object.keys(r.volumes).length, 0)
    : 0

  return (
    <div
      style={{ position: 'relative' }}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {children}

      {/* Drag overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={bouncy}
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 50,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 12,
              borderRadius: 12,
              border: '2px dashed var(--primary)',
              backgroundColor: 'rgba(99,102,241,0.06)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ scale: 0.8, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              transition={bouncy}
            >
              <Upload
                size={40}
                style={{ color: 'var(--primary)', opacity: 0.7 }}
              />
            </motion.div>
            <span
              style={{
                fontFamily: 'var(--font-body)',
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--primary)',
              }}
            >
              Sleep je Excel bestand hier
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Preview modal */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
            }}
            onClick={() => setPreview(null)}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              transition={bouncy}
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '90%',
                maxWidth: 720,
                maxHeight: '80vh',
                borderRadius: 16,
                backgroundColor: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow:
                  '0 24px 48px rgba(0,0,0,0.12), 0 8px 16px rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              {/* Modal header */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}
              >
                <FileSpreadsheet
                  size={20}
                  style={{ color: 'var(--primary)', flexShrink: 0 }}
                />
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 15,
                      fontWeight: 600,
                      color: 'var(--foreground)',
                    }}
                  >
                    {preview.fileName}
                  </div>
                  <div
                    style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: 12,
                      color: 'var(--muted-foreground)',
                      marginTop: 2,
                    }}
                  >
                    {preview.columns.length} kolommen &middot;{' '}
                    {preview.matchedRows.length} rijen &middot;{' '}
                    {preview.weekColumns.length} weken gedetecteerd
                  </div>
                </div>
                <button
                  onClick={() => setPreview(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    border: 'none',
                    backgroundColor: 'transparent',
                    color: 'var(--muted-foreground)',
                    cursor: 'pointer',
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              {/* Detected columns */}
              <div
                style={{
                  padding: '12px 20px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                {preview.columns.map((col) => {
                  const isWeek = preview.weekColumns.some(
                    (w) => w.header === col,
                  )
                  const isDemand = col === preview.demandTypeColumn
                  return (
                    <span
                      key={col}
                      style={{
                        padding: '3px 8px',
                        borderRadius: 6,
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        backgroundColor: isDemand
                          ? 'rgba(99,102,241,0.12)'
                          : isWeek
                            ? 'rgba(34,197,94,0.1)'
                            : 'rgba(0,0,0,0.04)',
                        color: isDemand
                          ? 'var(--primary)'
                          : isWeek
                            ? 'rgb(22,163,74)'
                            : 'var(--muted-foreground)',
                        fontWeight: isDemand || isWeek ? 600 : 400,
                      }}
                    >
                      {col}
                    </span>
                  )
                })}
              </div>

              {/* Preview table */}
              <div
                style={{
                  flex: 1,
                  overflowY: 'auto',
                  padding: '0 20px',
                }}
              >
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontFamily: 'var(--font-body)',
                    fontSize: 13,
                  }}
                >
                  <thead>
                    <tr>
                      <th
                        style={{
                          position: 'sticky',
                          top: 0,
                          backgroundColor: 'var(--card)',
                          textAlign: 'left',
                          padding: '10px 8px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 600,
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--muted-foreground)',
                        }}
                      >
                        Type
                      </th>
                      <th
                        style={{
                          position: 'sticky',
                          top: 0,
                          backgroundColor: 'var(--card)',
                          textAlign: 'center',
                          padding: '10px 8px',
                          borderBottom: '1px solid var(--border)',
                          fontWeight: 600,
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--muted-foreground)',
                          width: 60,
                        }}
                      >
                        Match
                      </th>
                      {preview.weekColumns.map((wc) => (
                        <th
                          key={wc.isoWeek}
                          style={{
                            position: 'sticky',
                            top: 0,
                            backgroundColor: 'var(--card)',
                            textAlign: 'right',
                            padding: '10px 8px',
                            borderBottom: '1px solid var(--border)',
                            fontFamily: 'var(--font-mono)',
                            fontWeight: 600,
                            fontSize: 11,
                            color: 'var(--muted-foreground)',
                          }}
                        >
                          {wc.isoWeek}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.matchedRows.map((row, idx) => (
                      <tr key={idx}>
                        <td
                          style={{
                            padding: '8px',
                            borderBottom: '1px solid rgba(0,0,0,0.04)',
                            color: row.demandTypeId
                              ? 'var(--foreground)'
                              : 'var(--muted-foreground)',
                            fontWeight: row.demandTypeId ? 500 : 400,
                          }}
                        >
                          {row.demandTypeName}
                        </td>
                        <td
                          style={{
                            padding: '8px',
                            borderBottom: '1px solid rgba(0,0,0,0.04)',
                            textAlign: 'center',
                          }}
                        >
                          {row.demandTypeId ? (
                            <Check
                              size={14}
                              style={{ color: 'rgb(22,163,74)' }}
                            />
                          ) : (
                            <X
                              size={14}
                              style={{ color: 'var(--muted-foreground)', opacity: 0.5 }}
                            />
                          )}
                        </td>
                        {preview.weekColumns.map((wc) => (
                          <td
                            key={wc.isoWeek}
                            style={{
                              padding: '8px',
                              borderBottom: '1px solid rgba(0,0,0,0.04)',
                              textAlign: 'right',
                              fontFamily: 'var(--font-mono)',
                              fontSize: 12,
                              color:
                                row.volumes[wc.isoWeek] !== undefined
                                  ? 'var(--foreground)'
                                  : 'var(--muted-foreground)',
                              opacity:
                                row.volumes[wc.isoWeek] !== undefined ? 1 : 0.3,
                            }}
                          >
                            {row.volumes[wc.isoWeek] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div
                style={{
                  padding: '14px 20px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--muted-foreground)',
                  }}
                >
                  {matchedCount} van {preview.matchedRows.length} types
                  gematcht
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={snappy}
                    onClick={() => setPreview(null)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      backgroundColor: 'var(--card)',
                      color: 'var(--foreground)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    Annuleer
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={snappy}
                    onClick={handleConfirmImport}
                    disabled={totalImportRows === 0}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 8,
                      border: 'none',
                      background:
                        'linear-gradient(135deg, #6366F1, #818CF8)',
                      color: '#fff',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor:
                        totalImportRows === 0 ? 'not-allowed' : 'pointer',
                      opacity: totalImportRows === 0 ? 0.5 : 1,
                    }}
                  >
                    Importeer {totalImportRows} rijen
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
