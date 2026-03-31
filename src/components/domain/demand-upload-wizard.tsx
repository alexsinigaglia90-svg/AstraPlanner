'use client'

import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, FileSpreadsheet, Check, AlertCircle, Save, Sparkles } from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useToast } from '@/components/domain/toast'
import { DemandAiAnalysis } from './demand-ai-analysis'
import type { DemandAnalysis } from './demand-ai-analysis'
import { extractXray } from '@/lib/demand/xray'
import * as XLSX from 'xlsx'

// ── Types ────────────────────────────────────────────────────────────────────

interface DemandUploadWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onImported: () => void
}

type WizardStep = 1 | 2 | 3 | 4 | 5

interface ParsedData {
  sourceProcesses: string[]
  dateLabels: string[]
  periodStarts: string[]
  /** [dateIndex][processIndex] */
  matrix: number[][]
}

interface ProcessMapping {
  sourceName: string
  demandTypeId: string | null
  demandTypeName: string
  autoMatched: boolean
  confidence: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fuzzyMatch(
  source: string,
  targets: { id: string; name: string }[],
): { id: string; name: string; confidence: number } | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, ' ').trim()
  const src = norm(source)
  const exact = targets.find((t) => norm(t.name) === src)
  if (exact) return { id: exact.id, name: exact.name, confidence: 1.0 }
  const contains = targets.find(
    (t) => norm(t.name).includes(src) || src.includes(norm(t.name)),
  )
  if (contains) return { id: contains.id, name: contains.name, confidence: 0.7 }
  return null
}

function tryParseDate(val: unknown): string | null {
  if (val == null) return null
  const s = String(val).trim()
  if (!s) return null
  if (/^\d{4,5}(\.\d+)?$/.test(s)) {
    const num = Number(s)
    if (num > 30000 && num < 60000) {
      const epoch = new Date(1899, 11, 30)
      epoch.setDate(epoch.getDate() + num)
      return epoch.toISOString().split('T')[0]!
    }
  }
  const d = new Date(s)
  if (!isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100) {
    return d.toISOString().split('T')[0]!
  }
  const weekMatch = s.match(/(?:^|\b)(?:wk|week|w)\s*(\d{1,2})$/i)
    ?? s.match(/^(\d{4})-?W(\d{1,2})$/i)
  if (weekMatch) {
    const weekNum = Number(weekMatch[2] ?? weekMatch[1])
    const year = weekMatch[2] ? Number(weekMatch[1]) : new Date().getFullYear()
    const jan4 = new Date(year, 0, 4)
    const dayOfWeek = jan4.getDay() || 7
    const monday = new Date(jan4)
    monday.setDate(jan4.getDate() - dayOfWeek + 1 + (weekNum - 1) * 7)
    return monday.toISOString().split('T')[0]!
  }
  return null
}

function toMonday(isoDate: string): string {
  const d = new Date(isoDate + 'T00:00:00Z')
  const day = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() - day + 1)
  return d.toISOString().split('T')[0]!
}

function toSunday(mondayIso: string): string {
  const d = new Date(mondayIso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 6)
  return d.toISOString().split('T')[0]!
}

function isoWeekLabel(mondayIso: string): string {
  const d = new Date(mondayIso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + 3)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `Wk${weekNum}`
}

/** Column letter from 0-based index */
function colLetter(i: number): string {
  let s = ''
  let n = i
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

/** Detect which column/row index has date-like values in the raw grid */
function detectDateAxis(
  rawData: unknown[][],
  processAxis: 'row' | 'column',
  processIndex: number,
): number | null {
  if (processAxis === 'row') {
    // Processes in a row -> dates are in a column. Check each column in the data rows below processIndex.
    for (let col = 0; col < (rawData[0]?.length ?? 0); col++) {
      let dateCount = 0
      for (let row = processIndex + 1; row < Math.min(rawData.length, processIndex + 10); row++) {
        if (tryParseDate(rawData[row]?.[col])) dateCount++
      }
      if (dateCount >= 2) return col
    }
  } else {
    // Processes in a column -> dates are in a row. Check each row's cells after processIndex column.
    for (let row = 0; row < Math.min(rawData.length, 10); row++) {
      if (row === processIndex) continue
      let dateCount = 0
      for (let col = processIndex + 1; col < Math.min(rawData[row]?.length ?? 0, processIndex + 10); col++) {
        if (tryParseDate(rawData[row]?.[col])) dateCount++
      }
      if (dateCount >= 2) return row
    }
  }
  return null
}

/** Build ParsedData from the user's axis selection */
function buildParsedData(
  rawData: unknown[][],
  processAxis: 'row' | 'column',
  processIndex: number,
  dateIndex: number,
): ParsedData | string {
  if (processAxis === 'row') {
    // Process names in row[processIndex], data rows below, dates in column[dateIndex]
    const processRow = rawData[processIndex] ?? []
    const sourceProcesses: string[] = []
    const processColIndices: number[] = []
    for (let c = 0; c < processRow.length; c++) {
      if (c === dateIndex) continue
      const name = String(processRow[c] ?? '').trim()
      if (!name) continue
      // Only include if there's at least some numeric data
      let hasNumeric = false
      for (let r = processIndex + 1; r < rawData.length; r++) {
        const v = Number(rawData[r]?.[c])
        if (!isNaN(v) && v > 0) { hasNumeric = true; break }
      }
      if (hasNumeric) {
        sourceProcesses.push(name)
        processColIndices.push(c)
      }
    }
    if (sourceProcesses.length === 0) return 'Geen processen met data gevonden.'

    const dateLabels: string[] = []
    const periodStarts: string[] = []
    const matrix: number[][] = []
    for (let r = processIndex + 1; r < rawData.length; r++) {
      const dateVal = rawData[r]?.[dateIndex]
      const parsed = tryParseDate(dateVal)
      if (!parsed) {
        const label = String(dateVal ?? '').trim()
        if (!label) continue
        // Non-parseable row — skip
        continue
      }
      const monday = toMonday(parsed)
      dateLabels.push(isoWeekLabel(monday))
      periodStarts.push(monday)
      const row: number[] = processColIndices.map((c) => {
        const v = Number(rawData[r]?.[c])
        return isNaN(v) ? 0 : Math.round(v)
      })
      matrix.push(row)
    }
    if (matrix.length === 0) return 'Geen geldige datumrijen gevonden.'
    return { sourceProcesses, dateLabels, periodStarts, matrix }
  } else {
    // Process names in column[processIndex], dates in row[dateIndex]
    const dateRow = rawData[dateIndex] ?? []
    const dateCols: { col: number; monday: string }[] = []
    for (let c = 0; c < dateRow.length; c++) {
      if (c === processIndex) continue
      const parsed = tryParseDate(dateRow[c])
      if (parsed) dateCols.push({ col: c, monday: toMonday(parsed) })
    }
    if (dateCols.length === 0) return 'Geen datums gevonden in de geselecteerde rij.'

    const sourceProcesses: string[] = []
    const processRowIndices: number[] = []
    for (let r = 0; r < rawData.length; r++) {
      if (r === dateIndex) continue
      const name = String(rawData[r]?.[processIndex] ?? '').trim()
      if (!name) continue
      let hasNumeric = false
      for (const dc of dateCols) {
        const v = Number(rawData[r]?.[dc.col])
        if (!isNaN(v) && v > 0) { hasNumeric = true; break }
      }
      if (hasNumeric) {
        sourceProcesses.push(name)
        processRowIndices.push(r)
      }
    }
    if (sourceProcesses.length === 0) return 'Geen processen met data gevonden.'

    const dateLabels = dateCols.map((dc) => isoWeekLabel(dc.monday))
    const periodStarts = dateCols.map((dc) => dc.monday)
    // matrix[dateIdx][processIdx]
    const matrix: number[][] = dateCols.map((dc) =>
      processRowIndices.map((r) => {
        const v = Number(rawData[r]?.[dc.col])
        return isNaN(v) ? 0 : Math.round(v)
      }),
    )
    return { sourceProcesses, dateLabels, periodStarts, matrix }
  }
}

// ── Styles ───────────────────────────────────────────────────────────────────

const FONT = 'var(--font-body, "DM Sans", sans-serif)'

const labelStyle: React.CSSProperties = {
  fontFamily: FONT, fontSize: 11, fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--muted-foreground)',
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8,
  border: '1px solid var(--border)', backgroundColor: 'var(--card)',
  color: 'var(--foreground)', fontFamily: FONT, fontSize: 13,
  outline: 'none', cursor: 'pointer', appearance: 'none' as const,
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 28,
}

const stepLabels = ['Upload', 'Tabblad', 'Processen', 'Koppelen', 'Importeren']

// ── Step indicator ───────────────────────────────────────────────────────────

function StepIndicator({ current, total, skipSheet }: { current: number; total: number; skipSheet: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1
        if (skipSheet && stepNum === 2) return null
        const isActive = stepNum === current
        const isDone = stepNum < current
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <motion.div
              animate={{
                width: isActive ? 24 : 8,
                backgroundColor: isDone || isActive ? 'var(--primary)' : 'var(--border)',
              }}
              transition={snappy}
              style={{ height: 4, borderRadius: 2 }}
            />
            {isActive && (
              <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: 'var(--primary)' }}>
                {stepLabels[i]}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step transitions ─────────────────────────────────────────────────────────

const stepVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
  center: { x: 0, opacity: 1, transition: bouncy },
  exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0, transition: { duration: 0.15 } }),
}

// ── Main Component ───────────────────────────────────────────────────────────

export function DemandUploadWizard({ open, onClose, siteId, onImported }: DemandUploadWizardProps) {
  const toast = useToast()
  const utils = trpc.useUtils()
  const bulkUpsert = trpc.demand.bulkUpsert.useMutation()
  const demandTypesQuery = trpc.demand.listDemandTypes.useQuery({}, { enabled: open })
  const processesQuery = trpc.org.listProcesses.useQuery({ site_id: siteId }, { enabled: open && siteId.length > 0 })
  const templatesQuery = trpc.demand.listTemplates.useQuery({}, { enabled: open })
  const saveTemplateMutation = trpc.demand.saveTemplate.useMutation()

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
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null)
  const [sheetNames, setSheetNames] = useState<string[]>([])
  const [selectedSheet, setSelectedSheet] = useState<string>('')
  const [rawData, setRawData] = useState<unknown[][]>([])
  const [processAxis, setProcessAxis] = useState<'row' | 'column' | null>(null)
  const [processIndex, setProcessIndex] = useState<number | null>(null)
  const [dateIndex, setDateIndex] = useState<number | null>(null)
  const [sourceProcesses, setSourceProcesses] = useState<string[]>([])

  // AI analysis state (optional)
  const [aiAnalysis, setAiAnalysis] = useState<DemandAnalysis | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({})

  // Template
  const [showTemplateSave, setShowTemplateSave] = useState(false)
  const [templateName, setTemplateName] = useState('')

  const skipSheet = sheetNames.length <= 1

  // Reset on open
  useEffect(() => {
    if (open) {
      setStep(1); setDirection(1); setDragOver(false); setFileName(''); setParseError(null)
      setParsedData(null); setMappings([]); setImporting(false); setImportResult(null)
      setWorkbook(null); setSheetNames([]); setSelectedSheet(''); setRawData([])
      setProcessAxis(null); setProcessIndex(null); setDateIndex(null); setSourceProcesses([])
      setAiAnalysis(null); setAiLoading(false); setAiError(null); setAiAnswers({})
      setShowTemplateSave(false); setTemplateName('')
    }
  }, [open])

  const demandTypeOptions = useMemo(() =>
    (demandTypesQuery.data ?? []).map((dt) => ({ id: dt.id, name: dt.name })),
    [demandTypesQuery.data],
  )

  // ── File processing ──────────────────────────────────────────────────────

  const loadSheetData = useCallback((wb: XLSX.WorkBook, sheetName: string) => {
    const sheet = wb.Sheets[sheetName]
    if (!sheet) return
    const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
    setRawData(data)
    // Reset axis selection when sheet changes
    setProcessAxis(null); setProcessIndex(null); setDateIndex(null); setSourceProcesses([])
    setParsedData(null); setMappings([])
  }, [])

  const processFile = useCallback(async (file: File) => {
    setFileName(file.name); setParseError(null); setParsedData(null); setMappings([])
    setWorkbook(null); setSheetNames([]); setSelectedSheet(''); setRawData([])
    try {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(new Error('Bestand kon niet worden gelezen'))
        reader.readAsArrayBuffer(file)
      })
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
      setWorkbook(wb)
      setSheetNames(wb.SheetNames)
      const first = wb.SheetNames[0]!
      setSelectedSheet(first)
      loadSheetData(wb, first)
    } catch {
      setParseError('Bestand kon niet worden verwerkt. Controleer het formaat.')
    }
  }, [loadSheetData])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    if (e.target) e.target.value = ''
  }, [processFile])

  // ── Process axis selection (step 3) ────────────────────────────────────

  const handleAxisSelect = useCallback((axis: 'row' | 'column', index: number) => {
    setProcessAxis(axis); setProcessIndex(index)
    // Auto-detect date axis
    const detectedDate = detectDateAxis(rawData, axis, index)
    setDateIndex(detectedDate)

    // Extract process names
    let procs: string[] = []
    if (axis === 'row') {
      const row = rawData[index] ?? []
      procs = row.map((v) => String(v ?? '').trim()).filter(Boolean)
      // Remove the date column value if detected
      if (detectedDate !== null) {
        procs = procs.filter((_, i) => {
          // Map back to raw column index
          let colIdx = 0; let count = 0
          for (let c = 0; c < row.length; c++) {
            const val = String(row[c] ?? '').trim()
            if (val) {
              if (count === i) { colIdx = c; break }
              count++
            }
          }
          return colIdx !== detectedDate
        })
      }
    } else {
      for (let r = 0; r < rawData.length; r++) {
        if (r === (detectedDate ?? -1)) continue
        const val = String(rawData[r]?.[index] ?? '').trim()
        if (val) procs.push(val)
      }
    }
    setSourceProcesses(procs)
  }, [rawData])

  // ── Build parsed data and mappings (step 3 -> 4 transition) ────────────

  const buildAndSetParsedData = useCallback(() => {
    if (processAxis === null || processIndex === null || dateIndex === null) return false
    const result = buildParsedData(rawData, processAxis, processIndex, dateIndex)
    if (typeof result === 'string') { setParseError(result); return false }
    setParsedData(result); setParseError(null)
    // Build mappings with fuzzy matching
    const newMappings: ProcessMapping[] = result.sourceProcesses.map((src) => {
      const match = fuzzyMatch(src, demandTypeOptions)
      return match
        ? { sourceName: src, demandTypeId: match.id, demandTypeName: match.name, autoMatched: true, confidence: match.confidence }
        : { sourceName: src, demandTypeId: null, demandTypeName: '', autoMatched: false, confidence: 0 }
    })
    // Check for template match
    const templates = templatesQuery.data ?? []
    for (const tmpl of templates) {
      const templateKeys = Object.keys((tmpl.column_mappings ?? {}) as Record<string, string>)
      const matchCount = result.sourceProcesses.filter((p) =>
        templateKeys.some((k) => k.toLowerCase() === p.toLowerCase()),
      ).length
      if (matchCount >= result.sourceProcesses.length * 0.7) {
        const colMap = tmpl.column_mappings as Record<string, string>
        for (let i = 0; i < newMappings.length; i++) {
          const mappedId = Object.entries(colMap).find(
            ([k]) => k.toLowerCase() === newMappings[i]!.sourceName.toLowerCase(),
          )?.[1]
          if (mappedId) {
            const dt = demandTypeOptions.find((d) => d.id === mappedId)
            if (dt) newMappings[i] = { sourceName: newMappings[i]!.sourceName, demandTypeId: dt.id, demandTypeName: dt.name, autoMatched: true, confidence: 1.0 }
          }
        }
        break
      }
    }
    setMappings(newMappings)
    return true
  }, [rawData, processAxis, processIndex, dateIndex, demandTypeOptions, templatesQuery.data])

  // ── AI analysis (optional) ─────────────────────────────────────────────

  const runAiAnalysis = useCallback(async () => {
    if (!workbook || !selectedSheet) return
    setAiLoading(true); setAiError(null); setAiAnalysis(null); setAiAnswers({})
    try {
      const processNames = (processesQuery.data ?? []).map((p) => p.name)
      const demandTypeNames = (demandTypesQuery.data ?? []).map((dt) => dt.name)
      const xray = extractXray(workbook, selectedSheet, processNames, demandTypeNames)
      const resp = await fetch('/api/ai/demand-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xray }),
      })
      if (!resp.ok) throw new Error(await resp.text().catch(() => `HTTP ${resp.status}`))
      setAiAnalysis(await resp.json())
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI analyse mislukt')
    } finally {
      setAiLoading(false)
    }
  }, [workbook, selectedSheet, processesQuery.data, demandTypesQuery.data])

  // ── Mapping update ─────────────────────────────────────────────────────

  const updateMapping = useCallback((index: number, demandTypeId: string | null) => {
    setMappings((prev) => prev.map((m, i) => {
      if (i !== index) return m
      if (!demandTypeId) return { ...m, demandTypeId: null, demandTypeName: '', autoMatched: false, confidence: 0 }
      const dt = demandTypeOptions.find((d) => d.id === demandTypeId)
      return { ...m, demandTypeId, demandTypeName: dt?.name ?? '', autoMatched: false, confidence: 1.0 }
    }))
  }, [demandTypeOptions])

  // ── Navigation ─────────────────────────────────────────────────────────

  const goNext = () => { setDirection(1); setStep((s) => {
    if (s === 1 && skipSheet) return 3
    return Math.min(s + 1, 5) as WizardStep
  })}
  const goBack = () => { setDirection(-1); setStep((s) => {
    if (s === 3 && skipSheet) return 1
    return Math.max(s - 1, 1) as WizardStep
  })}

  // ── Import ─────────────────────────────────────────────────────────────

  const mappedCount = mappings.filter((m) => m.demandTypeId).length

  const handleImport = async () => {
    if (!parsedData || mappedCount === 0) return
    setImporting(true)
    try {
      const forecasts: { site_id: string; demand_type_id: string; period_start: string; period_end: string; volume: number; source: 'csv_upload' }[] = []
      for (let dateIdx = 0; dateIdx < parsedData.periodStarts.length; dateIdx++) {
        const periodStart = parsedData.periodStarts[dateIdx]!
        const periodEnd = toSunday(periodStart)
        for (let procIdx = 0; procIdx < mappings.length; procIdx++) {
          const mapping = mappings[procIdx]!
          if (!mapping.demandTypeId) continue
          const volume = parsedData.matrix[dateIdx]?.[procIdx] ?? 0
          if (volume <= 0) continue
          forecasts.push({ site_id: siteId, demand_type_id: mapping.demandTypeId, period_start: periodStart, period_end: periodEnd, volume, source: 'csv_upload' })
        }
      }
      if (forecasts.length === 0) { toast.showError('Geen volumes groter dan 0 gevonden.'); setImporting(false); return }
      let totalUpserted = 0
      for (let i = 0; i < forecasts.length; i += 500) {
        const result = await bulkUpsert.mutateAsync({ forecasts: forecasts.slice(i, i + 500) })
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

  // ── Can advance? ───────────────────────────────────────────────────────

  const canAdvance: Record<WizardStep, boolean> = {
    1: rawData.length > 0 && !parseError,
    2: !!selectedSheet,
    3: processAxis !== null && processIndex !== null && dateIndex !== null && sourceProcesses.length > 0,
    4: mappedCount > 0,
    5: !importing && mappedCount > 0 && !importResult,
  }

  // ── Preview table data for step 3 ─────────────────────────────────────

  const previewRows = rawData.slice(0, 10)
  const previewCols = Math.min(rawData[0]?.length ?? 0, 15)

  // ── Render helpers ─────────────────────────────────────────────────────

  const stepTitle = [
    '', 'Upload je Excel-bestand', 'Selecteer tabblad', 'Selecteer processen',
    'Koppel processen', 'Controleer & importeer',
  ]

  // ── Render ─────────────────────────────────────────────────────────────

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="demand-backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 9998, backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(6px)' }}
          />
          <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
            <motion.div
              key="demand-modal"
              initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={bouncy}
              style={{
                width: '100%', maxWidth: step >= 3 ? 720 : 580, maxHeight: '90vh',
                backgroundColor: 'var(--card)', borderRadius: 16, boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                overflow: 'hidden', pointerEvents: 'auto', display: 'flex', flexDirection: 'column',
              }}
            >
              {/* Header */}
              <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
                      Demand uploaden
                    </h3>
                    <p style={{ fontFamily: FONT, fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
                      Stap {skipSheet && step >= 3 ? step - 1 : step}: {stepTitle[step]}
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, rgba(245,158,11,0.12), rgba(249,115,22,0.08))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Upload size={16} style={{ color: '#f59e0b' }} />
                    </div>
                    <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 'var(--radius-sm)', border: 'none', backgroundColor: 'var(--muted)', color: 'var(--muted-foreground)', cursor: 'pointer' }}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
                <StepIndicator current={step} total={5} skipSheet={skipSheet} />
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflow: 'auto', padding: 24, minHeight: 0 }}>
                <AnimatePresence mode="wait" custom={direction}>

                  {/* ── Step 1: Upload ─────────────────────────────── */}
                  {step === 1 && (
                    <motion.div key="step-1" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <div
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                        style={{
                          border: `2px dashed ${dragOver ? '#f59e0b' : 'var(--border)'}`, borderRadius: 12, padding: '40px 24px',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, cursor: 'pointer',
                          backgroundColor: dragOver ? 'rgba(245,158,11,0.04)' : 'rgba(0,0,0,0.01)', transition: 'all 0.2s ease',
                        }}
                      >
                        <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, rgba(245,158,11,0.1), rgba(249,115,22,0.06))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <FileSpreadsheet size={22} style={{ color: '#f59e0b' }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <p style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Sleep je bestand hierheen</p>
                          <p style={{ fontFamily: FONT, fontSize: 12, color: 'var(--muted-foreground)', margin: '4px 0 0' }}>of klik om te selecteren (.xlsx, .xls, .csv)</p>
                        </div>
                        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} style={{ display: 'none' }} />
                      </div>

                      {fileName && (
                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={snappy} style={{
                          padding: '12px 14px', borderRadius: 10,
                          backgroundColor: rawData.length > 0 ? 'rgba(34,197,94,0.06)' : parseError ? 'rgba(239,68,68,0.06)' : 'rgba(0,0,0,0.02)',
                          border: `1px solid ${rawData.length > 0 ? 'rgba(34,197,94,0.15)' : parseError ? 'rgba(239,68,68,0.15)' : 'var(--border)'}`,
                          display: 'flex', alignItems: 'center', gap: 10,
                        }}>
                          {rawData.length > 0 ? <Check size={16} style={{ color: '#22c55e', flexShrink: 0 }} />
                            : parseError ? <AlertCircle size={16} style={{ color: '#ef4444', flexShrink: 0 }} /> : null}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'var(--foreground)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</p>
                            {rawData.length > 0 && <p style={{ fontFamily: FONT, fontSize: 12, color: 'var(--muted-foreground)', margin: '2px 0 0' }}>{rawData.length} rijen, {rawData[0]?.length ?? 0} kolommen{sheetNames.length > 1 ? `, ${sheetNames.length} tabbladen` : ''}</p>}
                            {parseError && <p style={{ fontFamily: FONT, fontSize: 12, color: '#ef4444', margin: '2px 0 0' }}>{parseError}</p>}
                          </div>
                        </motion.div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Step 2: Sheet Selection ────────────────────── */}
                  {step === 2 && (
                    <motion.div key="step-2" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--foreground)', margin: 0, fontWeight: 600 }}>Selecteer het tabblad met demand data:</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {sheetNames.map((name) => (
                          <motion.button
                            key={name} whileTap={{ scale: 0.96 }}
                            onClick={() => { setSelectedSheet(name); if (workbook) loadSheetData(workbook, name) }}
                            style={{
                              padding: '8px 18px', borderRadius: 20, border: '1.5px solid',
                              borderColor: selectedSheet === name ? 'var(--primary)' : 'var(--border)',
                              backgroundColor: selectedSheet === name ? 'rgba(99,102,241,0.08)' : 'transparent',
                              color: selectedSheet === name ? 'var(--primary)' : 'var(--muted-foreground)',
                              fontFamily: FONT, fontSize: 13, fontWeight: selectedSheet === name ? 700 : 500, cursor: 'pointer', transition: 'all 0.15s',
                            }}
                          >{name}</motion.button>
                        ))}
                      </div>
                      {/* Mini preview of first 5 rows */}
                      {rawData.length > 0 && (
                        <div style={{ overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
                          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                            <tbody>
                              {rawData.slice(0, 5).map((row, ri) => (
                                <tr key={ri}>
                                  {(row as unknown[]).slice(0, 10).map((cell, ci) => (
                                    <td key={ci} style={{ padding: '4px 8px', borderBottom: '1px solid var(--border)', color: 'var(--muted-foreground)', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {String(cell ?? '')}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Step 3: Process Column/Row Selection ────────── */}
                  {step === 3 && (
                    <motion.div key="step-3" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                      <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
                        Klik op de rij of kolom waar de procesnamen staan
                      </p>

                      {/* Interactive data table */}
                      <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
                        <table style={{ borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                          <thead>
                            <tr>
                              <th style={{ padding: '6px 10px', backgroundColor: 'var(--muted)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }} />
                              {Array.from({ length: previewCols }, (_, ci) => {
                                const isSelected = processAxis === 'column' && processIndex === ci
                                return (
                                  <th
                                    key={ci}
                                    onClick={() => handleAxisSelect('column', ci)}
                                    style={{
                                      padding: '6px 10px', cursor: 'pointer', whiteSpace: 'nowrap',
                                      backgroundColor: isSelected ? 'rgba(99,102,241,0.15)' : 'var(--muted)',
                                      color: isSelected ? '#6366F1' : 'var(--muted-foreground)',
                                      fontWeight: isSelected ? 700 : 600,
                                      borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                                      transition: 'background 0.15s',
                                    }}
                                  >
                                    {colLetter(ci)}
                                  </th>
                                )
                              })}
                            </tr>
                          </thead>
                          <tbody>
                            {previewRows.map((row, ri) => {
                              const isSelected = processAxis === 'row' && processIndex === ri
                              return (
                                <tr key={ri}>
                                  <td
                                    onClick={() => handleAxisSelect('row', ri)}
                                    style={{
                                      padding: '5px 10px', cursor: 'pointer', fontWeight: 600,
                                      backgroundColor: isSelected ? 'rgba(99,102,241,0.15)' : 'var(--muted)',
                                      color: isSelected ? '#6366F1' : 'var(--muted-foreground)',
                                      borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                                      position: 'sticky', left: 0, zIndex: 1, transition: 'background 0.15s',
                                    }}
                                  >
                                    {ri + 1}
                                  </td>
                                  {(row as unknown[]).slice(0, previewCols).map((cell, ci) => {
                                    const highlighted =
                                      (processAxis === 'row' && processIndex === ri) ||
                                      (processAxis === 'column' && processIndex === ci)
                                    return (
                                      <td key={ci} style={{
                                        padding: '5px 10px', whiteSpace: 'nowrap', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
                                        borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)',
                                        backgroundColor: highlighted ? 'rgba(99,102,241,0.06)' : 'transparent',
                                        color: highlighted ? '#6366F1' : 'var(--foreground)',
                                        fontWeight: highlighted ? 600 : 400,
                                      }}>
                                        {String(cell ?? '')}
                                      </td>
                                    )
                                  })}
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Selection feedback */}
                      {processAxis && processIndex !== null && (
                        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={snappy}>
                          <p style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: '#6366F1', margin: '0 0 6px' }}>
                            {processAxis === 'row'
                              ? `Processen staan in rij ${processIndex + 1}`
                              : `Processen staan in kolom ${colLetter(processIndex)}`}
                            {dateIndex !== null && (processAxis === 'row'
                              ? ` — datums in kolom ${colLetter(dateIndex)}`
                              : ` — datums in rij ${dateIndex + 1}`)}
                          </p>
                          {sourceProcesses.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {sourceProcesses.slice(0, 20).map((p, i) => (
                                <span key={i} style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: 16, fontSize: 11, fontWeight: 600, fontFamily: FONT, background: 'rgba(99,102,241,0.08)', color: '#6366F1', border: '1px solid rgba(99,102,241,0.18)' }}>
                                  {p}
                                </span>
                              ))}
                              {sourceProcesses.length > 20 && <span style={{ fontFamily: FONT, fontSize: 11, color: 'var(--muted-foreground)', alignSelf: 'center' }}>+{sourceProcesses.length - 20} meer</span>}
                            </div>
                          )}
                          {dateIndex === null && (
                            <p style={{ fontFamily: FONT, fontSize: 12, color: '#f59e0b', margin: '6px 0 0' }}>
                              Geen datumkolom/-rij automatisch herkend. Controleer je bestand.
                            </p>
                          )}
                        </motion.div>
                      )}

                      {/* Optional AI button */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <button
                          onClick={runAiAnalysis}
                          disabled={aiLoading}
                          style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 12px',
                            borderRadius: 16, border: '1px solid rgba(99,102,241,0.2)', backgroundColor: 'rgba(99,102,241,0.04)',
                            color: '#6366F1', fontFamily: FONT, fontSize: 11, fontWeight: 600, cursor: aiLoading ? 'wait' : 'pointer',
                          }}
                        >
                          <Sparkles size={12} />
                          {aiLoading ? 'Analyseren...' : 'AI analyseren'}
                        </button>
                        {aiAnalysis && <Check size={14} style={{ color: '#22c55e' }} />}
                        {aiError && <span style={{ fontFamily: FONT, fontSize: 11, color: '#ef4444' }}>{aiError}</span>}
                      </div>
                      {aiAnalysis && !aiLoading && (
                        <DemandAiAnalysis
                          analysis={aiAnalysis} loading={false} error={null}
                          answers={aiAnswers}
                          onAnswer={(qId, ans) => setAiAnswers((prev) => ({ ...prev, [qId]: ans }))}
                          onRetry={runAiAnalysis}
                        />
                      )}
                    </motion.div>
                  )}

                  {/* ── Step 4: Process Mapping ────────────────────── */}
                  {step === 4 && (
                    <motion.div key="step-4" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#22c55e', display: 'inline-block' }} /> Gekoppeld
                        </span>
                        <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#f59e0b', display: 'inline-block' }} /> Voorgesteld
                        </span>
                        <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: 'var(--border)', display: 'inline-block' }} /> Niet gekoppeld
                        </span>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                        {mappings.map((m, idx) => {
                          const isMatched = m.demandTypeId !== null
                          const isSuggested = isMatched && m.autoMatched && m.confidence < 1.0
                          const statusColor = isMatched ? (isSuggested ? '#f59e0b' : '#22c55e') : 'var(--border)'
                          return (
                            <motion.div key={m.sourceName} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ ...snappy, delay: idx * 0.03 }}
                              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, backgroundColor: 'rgba(0,0,0,0.015)', border: `1px solid ${isMatched ? statusColor + '30' : 'var(--border)'}` }}>
                              <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: statusColor, flexShrink: 0 }} />
                              <div style={{ flex: '0 0 160px', fontFamily: FONT, fontSize: 13, fontWeight: 600, color: 'var(--foreground)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={m.sourceName}>{m.sourceName}</div>
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--muted-foreground)', flexShrink: 0 }}>&rarr;</span>
                              <select value={m.demandTypeId ?? ''} onChange={(e) => updateMapping(idx, e.target.value || null)} style={{ ...selectStyle, flex: 1, minWidth: 0, borderColor: isMatched ? statusColor + '40' : 'var(--border)' }}>
                                <option value="">&mdash; Negeer &mdash;</option>
                                {demandTypeOptions.map((dt) => <option key={dt.id} value={dt.id}>{dt.name}</option>)}
                              </select>
                              <div style={{ flexShrink: 0, width: 20, textAlign: 'center' }}>
                                {isMatched ? <Check size={14} style={{ color: statusColor }} /> : <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', border: '2px solid var(--border)' }} />}
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>

                      <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: mappedCount > 0 ? 'rgba(34,197,94,0.05)' : 'rgba(0,0,0,0.02)', border: `1px solid ${mappedCount > 0 ? 'rgba(34,197,94,0.12)' : 'var(--border)'}` }}>
                        <p style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: mappedCount > 0 ? '#22c55e' : 'var(--muted-foreground)', margin: 0 }}>
                          {mappedCount} van {mappings.length} processen gekoppeld
                        </p>
                      </div>

                      {demandTypeOptions.length === 0 && (
                        <div style={{ padding: '10px 14px', borderRadius: 8, backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.12)' }}>
                          <p style={{ fontFamily: FONT, fontSize: 12, color: '#ef4444', margin: 0 }}>Geen demand types gevonden. Maak eerst demand types aan.</p>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* ── Step 5: Preview & Import ────────────────────── */}
                  {step === 5 && (
                    <motion.div key="step-5" custom={direction} variants={stepVariants} initial="enter" animate="center" exit="exit" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {importResult ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={bouncy} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '32px 16px' }}>
                          <div style={{ width: 48, height: 48, borderRadius: '50%', backgroundColor: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Check size={24} style={{ color: '#22c55e' }} />
                          </div>
                          <p style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Import voltooid</p>
                          <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--muted-foreground)', margin: 0 }}>{importResult.count} demand entries geimporteerd</p>
                          {!showTemplateSave ? (
                            <motion.button initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} whileTap={{ scale: 0.96 }}
                              onClick={() => { setShowTemplateSave(true); setTemplateName(fileName.replace(/\.[^.]+$/, '')) }}
                              style={{ marginTop: 8, padding: '8px 18px', borderRadius: 20, border: '1px solid rgba(99,102,241,0.25)', backgroundColor: 'rgba(99,102,241,0.06)', color: 'var(--primary)', fontFamily: FONT, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <Save size={13} /> Opslaan als template?
                            </motion.button>
                          ) : (
                            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={bouncy} style={{ marginTop: 12, display: 'flex', gap: 8, alignItems: 'center', width: '100%', maxWidth: 360 }}>
                              <input type="text" value={templateName} onChange={(e) => setTemplateName(e.target.value)} placeholder="Template naam"
                                style={{ flex: 1, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'var(--card)', color: 'var(--foreground)', fontFamily: FONT, fontSize: 13, outline: 'none' }} />
                              <motion.button whileTap={{ scale: 0.96 }} disabled={!templateName.trim() || saveTemplateMutation.isPending}
                                onClick={async () => {
                                  if (!templateName.trim() || !parsedData) return
                                  const columnMappings: Record<string, string> = {}
                                  for (const m of mappings) { if (m.demandTypeId) columnMappings[m.sourceName] = m.demandTypeId }
                                  try {
                                    await saveTemplateMutation.mutateAsync({
                                      name: templateName.trim(), column_mappings: columnMappings,
                                      header_row: processIndex ?? 0, data_start_row: (processIndex ?? 0) + 1,
                                      data_end_row: rawData.length - 1, skip_rows: [],
                                      orientation: processAxis === 'row' ? 'rows_dates' : 'cols_dates',
                                      unit_type: 'units', sheet_name: selectedSheet || undefined,
                                    })
                                    toast.showSuccess('Template opgeslagen'); setShowTemplateSave(false)
                                  } catch (err) { toast.showError(err instanceof Error ? err.message : 'Opslaan mislukt') }
                                }}
                                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', backgroundColor: templateName.trim() ? 'var(--primary)' : 'var(--muted)', color: templateName.trim() ? '#fff' : 'var(--muted-foreground)', fontFamily: FONT, fontSize: 13, fontWeight: 700, cursor: templateName.trim() ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap' }}>
                                {saveTemplateMutation.isPending ? 'Opslaan...' : 'Opslaan'}
                              </motion.button>
                            </motion.div>
                          )}
                        </motion.div>
                      ) : (
                        <>
                          <div style={{ padding: '12px 16px', borderRadius: 10, backgroundColor: 'rgba(99,102,241,0.05)', border: '1px solid rgba(99,102,241,0.12)' }}>
                            <p style={{ fontFamily: FONT, fontSize: 13, color: 'var(--primary)', fontWeight: 600, margin: 0 }}>
                              {parsedData ? `${parsedData.periodStarts.length * mappedCount} demand entries over ${parsedData.dateLabels.length} weken voor ${mappedCount} processen` : ''}
                            </p>
                          </div>
                          {parsedData && (
                            <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)' }}>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: FONT, fontSize: 12 }}>
                                <thead>
                                  <tr>
                                    <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 700, backgroundColor: 'var(--muted)', color: 'var(--foreground)', borderBottom: '1px solid var(--border)', position: 'sticky', left: 0, zIndex: 1 }}>Periode</th>
                                    {mappings.filter((m) => m.demandTypeId).map((m) => (
                                      <th key={m.sourceName} style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 600, backgroundColor: 'var(--muted)', color: 'var(--foreground)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{m.demandTypeName || m.sourceName}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {parsedData.dateLabels.map((label, dateIdx) => (
                                    <tr key={dateIdx}>
                                      <td style={{ padding: '6px 12px', fontWeight: 600, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--muted-foreground)', borderBottom: '1px solid var(--border)', position: 'sticky', left: 0, backgroundColor: 'var(--card)', whiteSpace: 'nowrap' }}>{label}</td>
                                      {mappings.filter((m) => m.demandTypeId).map((m) => {
                                        const procIdx = mappings.indexOf(m)
                                        const vol = parsedData.matrix[dateIdx]?.[procIdx] ?? 0
                                        return <td key={m.sourceName} style={{ padding: '6px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12, color: vol > 0 ? 'var(--foreground)' : 'var(--muted-foreground)', borderBottom: '1px solid var(--border)' }}>{vol.toLocaleString('nl-NL')}</td>
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

              {/* Footer */}
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                {importResult ? <div /> : step === 1 ? (
                  <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--muted-foreground)', fontFamily: FONT, fontSize: 13, cursor: 'pointer' }}>Annuleren</button>
                ) : (
                  <button onClick={goBack} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid var(--border)', backgroundColor: 'transparent', color: 'var(--muted-foreground)', fontFamily: FONT, fontSize: 13, cursor: 'pointer' }}>Terug</button>
                )}

                {importResult ? (
                  <motion.button variants={scalePress} whileTap="press" onClick={onClose}
                    style={{ padding: '11px 24px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, var(--primary), #8B5CF6)', color: '#fff', fontFamily: FONT, fontSize: 14, fontWeight: 700, cursor: 'pointer', boxShadow: '0 4px 14px rgba(99,102,241,0.3)' }}>
                    Sluiten
                  </motion.button>
                ) : step < 5 ? (
                  <motion.button variants={scalePress} whileTap="press"
                    onClick={() => {
                      if (step === 3) {
                        // Build parsed data before going to step 4
                        if (!buildAndSetParsedData()) return
                      }
                      goNext()
                    }}
                    disabled={!canAdvance[step]}
                    style={{
                      padding: '11px 24px', borderRadius: 8, border: 'none',
                      background: canAdvance[step] ? 'linear-gradient(135deg, var(--primary), #8B5CF6)' : 'var(--muted)',
                      color: canAdvance[step] ? '#fff' : 'var(--muted-foreground)',
                      fontFamily: FONT, fontSize: 14, fontWeight: 700,
                      cursor: canAdvance[step] ? 'pointer' : 'not-allowed',
                      boxShadow: canAdvance[step] ? '0 4px 14px rgba(99,102,241,0.3)' : 'none',
                    }}>
                    Volgende
                  </motion.button>
                ) : (
                  <motion.button variants={scalePress} whileTap="press" onClick={handleImport} disabled={!canAdvance[5]}
                    style={{
                      padding: '11px 24px', borderRadius: 8, border: 'none',
                      background: canAdvance[5] ? 'linear-gradient(135deg, #22c55e, #16a34a)' : 'var(--muted)',
                      color: canAdvance[5] ? '#fff' : 'var(--muted-foreground)',
                      fontFamily: FONT, fontSize: 14, fontWeight: 700,
                      cursor: canAdvance[5] ? 'pointer' : 'not-allowed', opacity: importing ? 0.7 : 1,
                      boxShadow: canAdvance[5] ? '0 4px 14px rgba(34,197,94,0.3)' : 'none',
                    }}>
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
