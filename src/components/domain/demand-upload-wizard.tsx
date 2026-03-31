'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, FileSpreadsheet, Check, AlertCircle } from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useToast } from '@/components/domain/toast'
import * as XLSX from 'xlsx'

// ── Types ────────────────────────────────────────────────────────────────────

interface DemandUploadWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onImported: () => void
}

type WizardStep = 1 | 2 | 3

interface ParsedData {
  /** Process/column names extracted from the file */
  sourceProcesses: string[]
  /** Week/date labels for each row */
  dateLabels: string[]
  /** ISO date strings (Monday of each week) for period_start */
  periodStarts: string[]
  /** The volume matrix: [dateIndex][processIndex] */
  matrix: number[][]
}

interface ProcessMapping {
  /** The process name from the uploaded file */
  sourceName: string
  /** The matched demand type ID (or null if skipped) */
  demandTypeId: string | null
  /** The display name of the matched demand type */
  demandTypeName: string
  /** Whether this was auto-matched */
  autoMatched: boolean
  /** Confidence of the auto-match */
  confidence: number
}

// ── Fuzzy matching ───────────────────────────────────────────────────────────

function fuzzyMatch(
  source: string,
  targets: { id: string; name: string }[],
): { id: string; name: string; confidence: number } | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, ' ').trim()
  const src = norm(source)

  // Exact match
  const exact = targets.find((t) => norm(t.name) === src)
  if (exact) return { id: exact.id, name: exact.name, confidence: 1.0 }

  // Contains match
  const contains = targets.find(
    (t) => norm(t.name).includes(src) || src.includes(norm(t.name)),
  )
  if (contains) return { id: contains.id, name: contains.name, confidence: 0.7 }

  return null
}

// ── Date detection helpers ───────────────────────────────────────────────────

/** Try to parse a cell value as a date. Returns ISO string or null. */
function tryParseDate(val: unknown): string | null {
  if (val == null) return null
  const s = String(val).trim()
  if (!s) return null

  // Excel serial date number
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const num = Number(s)
    if (num > 30000 && num < 60000) {
      // Excel epoch: 1900-01-01 is serial 1 (with the 1900 leap year bug)
      const epoch = new Date(1899, 11, 30)
      epoch.setDate(epoch.getDate() + num)
      return epoch.toISOString().split('T')[0]!
    }
  }

  // Try ISO-like dates: 2025-01-06, 06-01-2025, 06/01/2025
  const d = new Date(s)
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) {
    return d.toISOString().split('T')[0]!
  }

  // Week notation: "Wk14", "Week 14", "W14", "2025-W14"
  const weekMatch = s.match(/(?:^|\b)(?:wk|week|w)\s*(\d{1,2})$/i)
    ?? s.match(/^(\d{4})-?W(\d{1,2})$/i)
  if (weekMatch) {
    const weekNum = Number(weekMatch[2] ?? weekMatch[1])
    const year = weekMatch[2] ? Number(weekMatch[1]) : new Date().getFullYear()
    // ISO week to Monday: Jan 4 is always in week 1
    const jan4 = new Date(year, 0, 4)
    const dayOfWeek = jan4.getDay() || 7
    const monday = new Date(jan4)
    monday.setDate(jan4.getDate() - dayOfWeek + 1 + (weekNum - 1) * 7)
    return monday.toISOString().split('T')[0]!
  }

  return null
}

/** Get the Monday of the week containing a date. */
function toMonday(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  const day = d.getUTCDay() || 7 // 1=Mon ... 7=Sun
  d.setUTCDate(d.getUTCDate() - day + 1)
  return d.toISOString().split('T')[0]!
}

/** Get end of week (Sunday) from a Monday. */
function toSunday(mondayIso: string): string {
  const d = new Date(mondayIso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().split('T')[0]!
}

/** Format ISO week label. */
function isoWeekLabel(mondayIso: string): string {
  const d = new Date(mondayIso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 3) // Thursday determines the ISO week
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `Wk${weekNum}`
}

// ── Parse the uploaded file ──────────────────────────────────────────────────

function parseExcelData(wb: XLSX.WorkBook, sheetName?: string): ParsedData | string {
  const name = sheetName ?? wb.SheetNames[0]!
  const sheet = wb.Sheets[name]
  if (!sheet) return 'Geen data gevonden in het bestand.'

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  if (raw.length === 0) return 'Het bestand bevat geen rijen.'

  const headers = Object.keys(raw[0]!)

  // Strategy 1: rows = dates, columns = processes
  // First column (or a column) contains dates, remaining columns are processes with numeric values
  const firstCol = headers[0]!
  const rowDates: (string | null)[] = raw.map((row) => tryParseDate(row[firstCol]))
  const dateRowCount = rowDates.filter(Boolean).length

  if (dateRowCount >= raw.length * 0.5 && headers.length >= 2) {
    // Rows are dates, columns are processes
    const processHeaders = headers.slice(1)
    const validRows: { dateLabel: string; monday: string; values: number[] }[] = []

    for (let i = 0; i < raw.length; i++) {
      const dateStr = rowDates[i]
      if (!dateStr) continue
      const monday = toMonday(dateStr)
      const values = processHeaders.map((h) => {
        const v = Number(raw[i]![h])
        return isNaN(v) ? 0 : Math.round(v)
      })
      validRows.push({ dateLabel: isoWeekLabel(monday), monday, values })
    }

    if (validRows.length === 0) return 'Geen geldige datumrijen gevonden.'

    return {
      sourceProcesses: processHeaders.map(String),
      dateLabels: validRows.map((r) => r.dateLabel),
      periodStarts: validRows.map((r) => r.monday),
      matrix: validRows.map((r) => r.values),
    }
  }

  // Strategy 2: rows = processes, columns = dates (transposed)
  // First column is process names, remaining columns are date headers
  const colDates: { header: string; monday: string }[] = []
  for (let i = 1; i < headers.length; i++) {
    const parsed = tryParseDate(headers[i])
    if (parsed) {
      colDates.push({ header: headers[i]!, monday: toMonday(parsed) })
    }
  }

  if (colDates.length >= 1) {
    const processes: string[] = []
    const matrix: number[][] = [] // [dateIdx][processIdx]

    // Initialize matrix columns
    for (let d = 0; d < colDates.length; d++) {
      matrix.push([])
    }

    for (const row of raw) {
      const procName = String(row[firstCol]).trim()
      if (!procName) continue
      processes.push(procName)
      for (let d = 0; d < colDates.length; d++) {
        const v = Number(row[colDates[d]!.header])
        matrix[d]!.push(isNaN(v) ? 0 : Math.round(v))
      }
    }

    if (processes.length === 0) return 'Geen procesrijen gevonden.'

    return {
      sourceProcesses: processes,
      dateLabels: colDates.map((c) => isoWeekLabel(c.monday)),
      periodStarts: colDates.map((c) => c.monday),
      matrix,
    }
  }

  // Strategy 3: Fallback — treat all non-first columns as processes, first column as labels
  // Assume headers are process names, and the first column contains some date-like identifier
  if (headers.length >= 2) {
    const processHeaders = headers.slice(1)
    const validRows: { dateLabel: string; monday: string; values: number[] }[] = []

    for (let i = 0; i < raw.length; i++) {
      const label = String(raw[i]![firstCol]).trim()
      // Try to extract a week from the label
      const dateStr = tryParseDate(label)
      const monday = dateStr ? toMonday(dateStr) : null

      if (!monday) continue

      const values = processHeaders.map((h) => {
        const v = Number(raw[i]![h])
        return isNaN(v) ? 0 : Math.round(v)
      })
      validRows.push({ dateLabel: label, monday, values })
    }

    if (validRows.length > 0) {
      return {
        sourceProcesses: processHeaders.map(String),
        dateLabels: validRows.map((r) => r.dateLabel),
        periodStarts: validRows.map((r) => r.monday),
        matrix: validRows.map((r) => r.values),
      }
    }
  }

  return 'Kan geen datums en processen herkennen in dit bestand. Controleer de indeling.'
}

// ── Styles ───────────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--muted-foreground)',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  backgroundColor: 'var(--card)',
  color: 'var(--foreground)',
  fontFamily: 'var(--font-body)',
  fontSize: 13,
  outline: 'none',
  cursor: 'pointer',
  appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 10px center',
  paddingRight: 28,
}

// ── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 6, justifyContent: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <motion.div
          key={i}
          animate={{
            width: i + 1 === current ? 28 : 8,
            backgroundColor: i + 1 <= current ? 'var(--primary)' : 'var(--border)',
          }}
          transition={snappy}
          style={{
            height: 4,
            borderRadius: 2,
          }}
        />
      ))}
    </div>
  )
}

// ── Step transition variants ─────────────────────────────────────────────────

const stepVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 60 : -60,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
    transition: bouncy,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -60 : 60,
    opacity: 0,
    transition: { duration: 0.15 },
  }),
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DemandUploadWizard({
  open,
  onClose,
  siteId,
  onImported,
}: DemandUploadWizardProps) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const bulkUpsert = trpc.demand.bulkUpsert.useMutation()

  // Fetch demand types (these contain the process mappings)
  const demandTypesQuery = trpc.demand.listDemandTypes.useQuery(
    {},
    { enabled: open },
  )
  const processesQuery = trpc.org.listProcesses.useQuery(
    { site_id: siteId },
    { enabled: open && siteId.length > 0 },
  )

  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<WizardStep>(1)
  const [direction, setDirection] = useState(1)
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [parseError, setParseError] = useState<string | null>(null)
  const [parsedData, setParsedData] = useState<ParsedData | null>(null)
  const [mappings, setMappings] = useState<ProcessMapping[]>([])
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ count: number } | null>(null)

  // Reset state when modal opens
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')

  useEffect(() => {
    if (open) {
      setStep(1)
      setDirection(1)
      setDragOver(false)
      setFileName('')
      setParseError(null)
      setParsedData(null)
      setMappings([])
      setImporting(false)
      setImportResult(null)
      setWorkbook(null)
      setSheetNames([])
      setSelectedSheet('')
    }
  }, [open])

  // Demand types as simple { id, name } array for fuzzy matching
  const demandTypeOptions = useMemo(() => {
    return (demandTypesQuery.data ?? []).map((dt) => ({
      id: dt.id,
      name: dt.name,
    }))
  }, [demandTypesQuery.data])

  // ── File processing ──────────────────────────────────────────────────────

  const readFile = (file: File) =>
    new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen'))
      reader.readAsArrayBuffer(file)
    })

  const parseSheet = useCallback(
    (wb: XLSX.WorkBook, sheetName: string) => {
      const result = parseExcelData(wb, sheetName)
      if (typeof result === 'string') {
        setParseError(result)
        return
      }
      setParsedData(result)
      setParseError(null)

      // Auto-build mappings with fuzzy matching
      const newMappings: ProcessMapping[] = result.sourceProcesses.map((src) => {
        const match = fuzzyMatch(src, demandTypeOptions)
        if (match) {
          return {
            sourceName: src,
            demandTypeId: match.id,
            demandTypeName: match.name,
            autoMatched: true,
            confidence: match.confidence,
          }
        }
        return {
          sourceName: src,
          demandTypeId: null,
          demandTypeName: '',
          autoMatched: false,
          confidence: 0,
        }
      })
      setMappings(newMappings)
    },
    [demandTypeOptions],
  )

  const processFile = useCallback(
    async (file: File) => {
      setFileName(file.name)
      setParseError(null)
      setParsedData(null)
      setMappings([])
      setWorkbook(null)
      setSheetNames([])
      setSelectedSheet('')

      try {
        const buffer = await readFile(file)
        const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
        setWorkbook(wb)

        if (wb.SheetNames.length > 1) {
          // Multiple sheets — let user choose
          setSheetNames(wb.SheetNames)
          setSelectedSheet(wb.SheetNames[0]!)
          // Don't auto-parse yet — wait for sheet selection
        } else {
          // Single sheet — parse immediately
          setSheetNames([])
          parseSheet(wb, wb.SheetNames[0]!)
        }
      } catch {
        setParseError('Bestand kon niet worden verwerkt. Controleer het formaat.')
      }
    },
    [parseSheet],
  )

  // When user selects a different sheet
  const handleSheetSelect = useCallback(
    (sheetName: string) => {
      setSelectedSheet(sheetName)
      if (workbook) {
        parseSheet(workbook, sheetName)
      }
    },
    [workbook, parseSheet],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      if (e.target) e.target.value = ''
    },
    [processFile],
  )

  // ── Mapping update ───────────────────────────────────────────────────────

  const updateMapping = useCallback((index: number, demandTypeId: string | null) => {
    setMappings((prev) =>
      prev.map((m, i) => {
        if (i !== index) return m
        if (!demandTypeId) {
          return { ...m, demandTypeId: null, demandTypeName: '', autoMatched: false, confidence: 0 }
        }
        const dt = demandTypeOptions.find((d) => d.id === demandTypeId)
        return {
          ...m,
          demandTypeId,
          demandTypeName: dt?.name ?? '',
          autoMatched: false,
          confidence: 1.0,
        }
      }),
    )
  }, [demandTypeOptions])

  // ── Navigation ───────────────────────────────────────────────────────────

  const goNext = () => {
    setDirection(1)
    setStep((s) => Math.min(s + 1, 3) as WizardStep)
  }
  const goBack = () => {
    setDirection(-1)
    setStep((s) => Math.max(s - 1, 1) as WizardStep)
  }

  // ── Import ───────────────────────────────────────────────────────────────

  const mappedCount = mappings.filter((m) => m.demandTypeId).length
  const totalSource = mappings.length

  const handleImport = async () => {
    if (!parsedData || mappedCount === 0) return
    setImporting(true)

    try {
      // Build forecast entries
      const forecasts: {
        site_id: string
        demand_type_id: string
        period_start: string
        period_end: string
        volume: number
        source: 'csv_upload'
      }[] = []

      for (let dateIdx = 0; dateIdx < parsedData.periodStarts.length; dateIdx++) {
        const periodStart = parsedData.periodStarts[dateIdx]!
        const periodEnd = toSunday(periodStart)

        for (let procIdx = 0; procIdx < mappings.length; procIdx++) {
          const mapping = mappings[procIdx]!
          if (!mapping.demandTypeId) continue

          const volume = parsedData.matrix[dateIdx]?.[procIdx] ?? 0
          if (volume <= 0) continue

          forecasts.push({
            site_id: siteId,
            demand_type_id: mapping.demandTypeId,
            period_start: periodStart,
            period_end: periodEnd,
            volume,
            source: 'csv_upload',
          })
        }
      }

      if (forecasts.length === 0) {
        toast.showError('Geen volumes groter dan 0 gevonden om te importeren.')
        setImporting(false)
        return
      }

      // Batch in chunks of 500
      let totalUpserted = 0
      for (let i = 0; i < forecasts.length; i += 500) {
        const chunk = forecasts.slice(i, i + 500)
        const result = await bulkUpsert.mutateAsync({ forecasts: chunk })
        totalUpserted += result.upserted
      }

      setImportResult({ count: totalUpserted })
      await utils.demand.listForecasts.invalidate()
      toast.showSuccess(`${totalUpserted} demand entries geimporteerd`)
      onImported()
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : 'Import mislukt')
    } finally {
      setImporting(false)
    }
  }

  // ── Can advance? ─────────────────────────────────────────────────────────

  const canGoToStep2 = parsedData !== null
  const canGoToStep3 = mappedCount > 0
  const canImport = !importing && mappedCount > 0 && !importResult

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="demand-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9998,
              backgroundColor: 'rgba(0,0,0,0.4)',
              backdropFilter: 'blur(6px)',
            }}
          />

          {/* Modal centering wrapper */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <motion.div
              key="demand-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={bouncy}
              style={{
                width: '100%',
                maxWidth: step === 3 ? 720 : 580,
                maxHeight: '90vh',
                backgroundColor: 'var(--card)',
                borderRadius: 16,
                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                overflow: 'hidden',
                pointerEvents: 'auto',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              {/* ── Header ──────────────────────────────────────────────── */}
              <div
                style={{
                  padding: '20px 24px 16px',
                  borderBottom: '1px solid var(--border)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h3
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontSize: 18,
                        fontWeight: 800,
                        color: 'var(--foreground)',
                        margin: 0,
                      }}
                    >
                      Demand uploaden
                    </h3>
                    <p
                      style={{
                        fontFamily: 'var(--font-body)',
                        fontSize: 12,
                        color: 'var(--muted-foreground)',
                        margin: '2px 0 0',
                      }}
                    >
                      {step === 1 && 'Stap 1: Upload je Excel-bestand'}
                      {step === 2 && 'Stap 2: Koppel processen'}
                      {step === 3 && 'Stap 3: Controleer & importeer'}
                    </p>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(249,115,22,0.08))',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Upload size={16} style={{ color: '#f59e0b' }} />
                    </div>
                    <button
                      onClick={onClose}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        backgroundColor: 'var(--muted)',
                        color: 'var(--muted-foreground)',
                        cursor: 'pointer',
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                <StepIndicator current={step} total={3} />
              </div>

              {/* ── Body ────────────────────────────────────────────────── */}
              <div
                style={{
                  flex: 1,
                  overflow: 'auto',
                  padding: '24px',
                  minHeight: 0,
                }}
              >
                <AnimatePresence mode="wait" custom={direction}>
                  {/* ── Step 1: Upload ─────────────────────────────────── */}
                  {step === 1 && (
                    <motion.div
                      key="step-1"
                      custom={direction}
                      variants={stepVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                    >
                      {/* Drop zone */}
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                        style={{
                          border: `2px dashed ${dragOver ? '#f59e0b' : 'var(--border)'}`,
                          borderRadius: 12,
                          padding: '40px 24px',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          gap: 12,
                          cursor: 'pointer',
                          backgroundColor: dragOver
                            ? 'rgba(245,158,11,0.04)'
                            : 'rgba(0,0,0,0.01)',
                          transition: 'all 0.2s ease',
                        }}
                      >
                        <div
                          style={{
                            width: 48,
                            height: 48,
                            borderRadius: 12,
                            background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(249,115,22,0.06))',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <FileSpreadsheet size={22} style={{ color: '#f59e0b' }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: 14,
                              fontWeight: 700,
                              color: 'var(--foreground)',
                              margin: 0,
                            }}
                          >
                            Sleep je bestand hierheen
                          </p>
                          <p
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 12,
                              color: 'var(--muted-foreground)',
                              margin: '4px 0 0',
                            }}
                          >
                            of klik om te selecteren (.xlsx, .xls, .csv)
                          </p>
                        </div>
                        <input
                          ref={fileRef}
                          type="file"
                          accept=".xlsx,.xls,.csv"
                          onChange={handleFileSelect}
                          style={{ display: 'none' }}
                        />
                      </div>

                      {/* File status */}
                      {fileName && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={snappy}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 10,
                            backgroundColor: parsedData
                              ? 'rgba(34,197,94,0.06)'
                              : parseError
                                ? 'rgba(239,68,68,0.06)'
                                : 'rgba(0,0,0,0.02)',
                            border: `1px solid ${
                              parsedData
                                ? 'rgba(34,197,94,0.15)'
                                : parseError
                                  ? 'rgba(239,68,68,0.15)'
                                  : 'var(--border)'
                            }`,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                          }}
                        >
                          {parsedData ? (
                            <Check size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                          ) : parseError ? (
                            <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} />
                          ) : null}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: 13,
                                fontWeight: 600,
                                color: 'var(--foreground)',
                                margin: 0,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {fileName}
                            </p>
                            {parsedData && (
                              <p
                                style={{
                                  fontFamily: 'var(--font-body)',
                                  fontSize: 12,
                                  color: 'var(--muted-foreground)',
                                  margin: '2px 0 0',
                                }}
                              >
                                {parsedData.sourceProcesses.length} processen, {parsedData.dateLabels.length} periodes herkend
                              </p>
                            )}
                            {parseError && (
                              <p
                                style={{
                                  fontFamily: 'var(--font-body)',
                                  fontSize: 12,
                                  color: '#ef4444',
                                  margin: '2px 0 0',
                                }}
                              >
                                {parseError}
                              </p>
                            )}
                          </div>
                        </motion.div>
                      )}

                      {/* Sheet selector (when multiple sheets) */}
                      {sheetNames.length > 1 && (
                        <motion.div
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={bouncy}
                          style={{
                            padding: '12px 14px',
                            borderRadius: 8,
                            backgroundColor: 'rgba(99,102,241,0.04)',
                            border: '1px solid rgba(99,102,241,0.12)',
                          }}
                        >
                          <p style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--foreground)', margin: '0 0 8px' }}>
                            Selecteer tabblad
                          </p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {sheetNames.map((name) => (
                              <motion.button
                                key={name}
                                whileTap={{ scale: 0.96 }}
                                onClick={() => handleSheetSelect(name)}
                                style={{
                                  padding: '6px 14px',
                                  borderRadius: 20,
                                  border: '1.5px solid',
                                  borderColor: selectedSheet === name ? 'var(--primary)' : 'var(--border)',
                                  backgroundColor: selectedSheet === name ? 'rgba(99,102,241,0.08)' : 'transparent',
                                  color: selectedSheet === name ? 'var(--primary)' : 'var(--muted-foreground)',
                                  fontFamily: 'var(--font-body)',
                                  fontSize: 12,
                                  fontWeight: selectedSheet === name ? 700 : 500,
                                  cursor: 'pointer',
                                  transition: 'all 0.15s',
                                }}
                              >
                                {name}
                              </motion.button>
                            ))}
                          </div>
                        </motion.div>
                      )}

                      {/* Hint */}
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          backgroundColor: 'rgba(99,102,241,0.04)',
                          border: '1px solid rgba(99,102,241,0.1)',
                        }}
                      >
                        <p
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 12,
                            color: 'var(--muted-foreground)',
                            margin: 0,
                            lineHeight: 1.5,
                          }}
                        >
                          Het bestand moet rijen met datums/weken en kolommen met procesnamen bevatten
                          (of omgekeerd). Volumes als getallen.
                        </p>
                      </div>
                    </motion.div>
                  )}

                  {/* ── Step 2: Process Mapping ────────────────────────── */}
                  {step === 2 && (
                    <motion.div
                      key="step-2"
                      custom={direction}
                      variants={stepVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
                    >
                      {/* Legend */}
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} />
                          Gekoppeld
                        </span>
                        <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} />
                          Voorgesteld
                        </span>
                        <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--border)', display: 'inline-block' }} />
                          Niet gekoppeld
                        </span>
                      </div>

                      {/* Mapping rows */}
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 8,
                          maxHeight: 380,
                          overflowY: 'auto',
                          paddingRight: 4,
                        }}
                      >
                        {mappings.map((m, idx) => {
                          const isMatched = m.demandTypeId !== null
                          const isSuggested = isMatched && m.autoMatched && m.confidence < 1.0
                          const statusColor = isMatched
                            ? isSuggested ? '#f59e0b' : '#22c55e'
                            : 'var(--border)'

                          return (
                            <motion.div
                              key={m.sourceName}
                              initial={{ opacity: 0, x: -12 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ ...snappy, delay: idx * 0.03 }}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 10,
                                padding: '10px 12px',
                                borderRadius: 10,
                                backgroundColor: 'rgba(0,0,0,0.015)',
                                border: `1px solid ${isMatched ? statusColor + '30' : 'var(--border)'}`,
                              }}
                            >
                              {/* Status dot */}
                              <div
                                style={{
                                  width: 8,
                                  height: 8,
                                  borderRadius: '50%',
                                  backgroundColor: statusColor,
                                  flexShrink: 0,
                                }}
                              />

                              {/* Source name */}
                              <div
                                style={{
                                  flex: '0 0 160px',
                                  fontFamily: 'var(--font-body)',
                                  fontSize: 13,
                                  fontWeight: 600,
                                  color: 'var(--foreground)',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}
                                title={m.sourceName}
                              >
                                {m.sourceName}
                              </div>

                              {/* Arrow */}
                              <span
                                style={{
                                  fontFamily: 'var(--font-mono)',
                                  fontSize: 12,
                                  color: 'var(--muted-foreground)',
                                  flexShrink: 0,
                                }}
                              >
                                &rarr;
                              </span>

                              {/* Dropdown */}
                              <select
                                value={m.demandTypeId ?? ''}
                                onChange={(e) =>
                                  updateMapping(idx, e.target.value || null)
                                }
                                style={{
                                  ...selectStyle,
                                  flex: 1,
                                  minWidth: 0,
                                  borderColor: isMatched ? statusColor + '40' : 'var(--border)',
                                }}
                              >
                                <option value="">&mdash; Negeer &mdash;</option>
                                {demandTypeOptions.map((dt) => (
                                  <option key={dt.id} value={dt.id}>
                                    {dt.name}
                                  </option>
                                ))}
                              </select>

                              {/* Status icon */}
                              <div style={{ flexShrink: 0, width: 20, textAlign: 'center' }}>
                                {isMatched ? (
                                  <Check size={14} style={{ color: statusColor }} />
                                ) : (
                                  <span
                                    style={{
                                      display: 'inline-block',
                                      width: 10,
                                      height: 10,
                                      borderRadius: '50%',
                                      border: '2px solid var(--border)',
                                    }}
                                  />
                                )}
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>

                      {/* Summary */}
                      <div
                        style={{
                          padding: '10px 14px',
                          borderRadius: 8,
                          backgroundColor: mappedCount > 0
                            ? 'rgba(34,197,94,0.05)'
                            : 'rgba(0,0,0,0.02)',
                          border: `1px solid ${mappedCount > 0 ? 'rgba(34,197,94,0.12)' : 'var(--border)'}`,
                        }}
                      >
                        <p
                          style={{
                            fontFamily: 'var(--font-body)',
                            fontSize: 13,
                            fontWeight: 600,
                            color: mappedCount > 0 ? '#22c55e' : 'var(--muted-foreground)',
                            margin: 0,
                          }}
                        >
                          {mappedCount} van {totalSource} processen gekoppeld
                        </p>
                      </div>

                      {/* No demand types warning */}
                      {demandTypeOptions.length === 0 && (
                        <div
                          style={{
                            padding: '10px 14px',
                            borderRadius: 8,
                            backgroundColor: 'rgba(239,68,68,0.05)',
                            border: '1px solid rgba(239,68,68,0.12)',
                          }}
                        >
                          <p
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 12,
                              color: '#ef4444',
                              margin: 0,
                            }}
                          >
                            Geen demand types gevonden. Maak eerst demand types aan via het demand overzicht.
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Step 3: Preview & Import ───────────────────────── */}
                  {step === 3 && (
                    <motion.div
                      key="step-3"
                      custom={direction}
                      variants={stepVariants}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
                    >
                      {importResult ? (
                        /* Success state */
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={bouncy}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 12,
                            padding: '32px 16px',
                          }}
                        >
                          <div
                            style={{
                              width: 48,
                              height: 48,
                              borderRadius: '50%',
                              backgroundColor: 'rgba(34,197,94,0.1)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            <Check size={24} style={{ color: '#22c55e' }} />
                          </div>
                          <p
                            style={{
                              fontFamily: 'var(--font-display)',
                              fontSize: 16,
                              fontWeight: 700,
                              color: 'var(--foreground)',
                              margin: 0,
                            }}
                          >
                            Import voltooid
                          </p>
                          <p
                            style={{
                              fontFamily: 'var(--font-body)',
                              fontSize: 13,
                              color: 'var(--muted-foreground)',
                              margin: 0,
                            }}
                          >
                            {importResult.count} demand entries geimporteerd
                          </p>
                        </motion.div>
                      ) : (
                        <>
                          {/* Summary card */}
                          <div
                            style={{
                              padding: '12px 16px',
                              borderRadius: 10,
                              backgroundColor: 'rgba(99,102,241,0.05)',
                              border: '1px solid rgba(99,102,241,0.12)',
                            }}
                          >
                            <p
                              style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: 13,
                                color: 'var(--primary)',
                                fontWeight: 600,
                                margin: 0,
                              }}
                            >
                              {(() => {
                                const totalEntries = parsedData
                                  ? parsedData.periodStarts.length * mappedCount
                                  : 0
                                return `${totalEntries} demand entries over ${parsedData?.dateLabels.length ?? 0} weken voor ${mappedCount} processen`
                              })()}
                            </p>
                          </div>

                          {/* Preview table */}
                          {parsedData && (
                            <div
                              style={{
                                overflowX: 'auto',
                                borderRadius: 10,
                                border: '1px solid var(--border)',
                              }}
                            >
                              <table
                                style={{
                                  width: '100%',
                                  borderCollapse: 'collapse',
                                  fontFamily: 'var(--font-body)',
                                  fontSize: 12,
                                }}
                              >
                                <thead>
                                  <tr>
                                    <th
                                      style={{
                                        padding: '8px 12px',
                                        textAlign: 'left',
                                        fontWeight: 700,
                                        backgroundColor: 'var(--muted)',
                                        color: 'var(--foreground)',
                                        borderBottom: '1px solid var(--border)',
                                        position: 'sticky',
                                        left: 0,
                                        zIndex: 1,
                                      }}
                                    >
                                      Periode
                                    </th>
                                    {mappings
                                      .filter((m) => m.demandTypeId)
                                      .map((m) => (
                                        <th
                                          key={m.sourceName}
                                          style={{
                                            padding: '8px 12px',
                                            textAlign: 'right',
                                            fontWeight: 600,
                                            backgroundColor: 'var(--muted)',
                                            color: 'var(--foreground)',
                                            borderBottom: '1px solid var(--border)',
                                            whiteSpace: 'nowrap',
                                          }}
                                        >
                                          {m.demandTypeName || m.sourceName}
                                        </th>
                                      ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {parsedData.dateLabels.map((label, dateIdx) => (
                                    <tr key={dateIdx}>
                                      <td
                                        style={{
                                          padding: '6px 12px',
                                          fontWeight: 600,
                                          fontFamily: 'var(--font-mono)',
                                          fontSize: 11,
                                          color: 'var(--muted-foreground)',
                                          borderBottom: '1px solid var(--border)',
                                          position: 'sticky',
                                          left: 0,
                                          backgroundColor: 'var(--card)',
                                          whiteSpace: 'nowrap',
                                        }}
                                      >
                                        {label}
                                      </td>
                                      {mappings
                                        .filter((m) => m.demandTypeId)
                                        .map((m) => {
                                          const procIdx = mappings.indexOf(m)
                                          const vol = parsedData.matrix[dateIdx]?.[procIdx] ?? 0
                                          return (
                                            <td
                                              key={m.sourceName}
                                              style={{
                                                padding: '6px 12px',
                                                textAlign: 'right',
                                                fontFamily: 'var(--font-mono)',
                                                fontSize: 12,
                                                color: vol > 0 ? 'var(--foreground)' : 'var(--muted-foreground)',
                                                borderBottom: '1px solid var(--border)',
                                              }}
                                            >
                                              {vol.toLocaleString('nl-NL')}
                                            </td>
                                          )
                                        })}
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Footer ──────────────────────────────────────────────── */}
              <div
                style={{
                  padding: '16px 24px',
                  borderTop: '1px solid var(--border)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                {/* Left button */}
                {importResult ? (
                  <div />
                ) : step === 1 ? (
                  <button
                    onClick={onClose}
                    style={{
                      padding: '9px 16px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      backgroundColor: 'transparent',
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Annuleren
                  </button>
                ) : (
                  <button
                    onClick={goBack}
                    style={{
                      padding: '9px 16px',
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      backgroundColor: 'transparent',
                      color: 'var(--muted-foreground)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 13,
                      cursor: 'pointer',
                    }}
                  >
                    Terug
                  </button>
                )}

                {/* Right button */}
                {importResult ? (
                  <motion.button
                    variants={scalePress}
                    whileTap="press"
                    onClick={onClose}
                    style={{
                      padding: '11px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                      color: '#fff',
                      fontFamily: 'var(--font-body)',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(99,102,241,0.3)',
                    }}
                  >
                    Sluiten
                  </motion.button>
                ) : step < 3 ? (
                  <motion.button
                    variants={scalePress}
                    whileTap="press"
                    onClick={goNext}
                    disabled={step === 1 ? !canGoToStep2 : !canGoToStep3}
                    style={{
                      padding: '11px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background:
                        (step === 1 ? canGoToStep2 : canGoToStep3)
                          ? 'linear-gradient(135deg, var(--primary), #8B5CF6)'
                          : 'var(--muted)',
                      color:
                        (step === 1 ? canGoToStep2 : canGoToStep3)
                          ? '#fff'
                          : 'var(--muted-foreground)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor:
                        (step === 1 ? canGoToStep2 : canGoToStep3)
                          ? 'pointer'
                          : 'not-allowed',
                      boxShadow:
                        (step === 1 ? canGoToStep2 : canGoToStep3)
                          ? '0 4px 14px rgba(99,102,241,0.3)'
                          : 'none',
                    }}
                  >
                    Volgende
                  </motion.button>
                ) : (
                  <motion.button
                    variants={scalePress}
                    whileTap="press"
                    onClick={handleImport}
                    disabled={!canImport}
                    style={{
                      padding: '11px 24px',
                      borderRadius: 8,
                      border: 'none',
                      background: canImport
                        ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                        : 'var(--muted)',
                      color: canImport ? '#fff' : 'var(--muted-foreground)',
                      fontFamily: 'var(--font-body)',
                      fontSize: 14,
                      fontWeight: 700,
                      cursor: canImport ? 'pointer' : 'not-allowed',
                      opacity: importing ? 0.7 : 1,
                      boxShadow: canImport
                        ? '0 4px 14px rgba(34,197,94,0.3)'
                        : 'none',
                    }}
                  >
                    {importing ? 'Importeren...' : 'Importeren'}
                  </motion.button>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  )
}
