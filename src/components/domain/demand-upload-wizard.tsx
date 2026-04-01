'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, FileSpreadsheet } from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useToast } from '@/components/domain/toast'
import { useSiteStore } from '@/stores/site-store'
import * as XLSX from 'xlsx'
import { Step1 } from './demand-upload-step1'
import { Step2 } from './demand-upload-step2'

// ── Exported types (consumed by Step1 / Step2) ───────────────────────────────

export type PlanMode = 'week' | 'day'
export type WorkDayPreset = 'ma-vr' | 'ma-za' | 'ma-zo'

export interface ParsedDemand {
  periodStart: string
  periodEnd: string
  demandTypeId: string
  demandTypeName: string
  volume: number
}

interface DemandUploadWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onImported: () => void
}

type WizardStep = 1 | 2

// ── Helpers ───────────────────────────────────────────────────────────────────

const NL_DAYS_CAP = ['Zo', 'Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za'] as const
const NL_MONTHS = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function workDaysFromPreset(preset: WorkDayPreset): number[] {
  switch (preset) {
    case 'ma-vr': return [1, 2, 3, 4, 5]
    case 'ma-za': return [1, 2, 3, 4, 5, 6]
    case 'ma-zo': return [0, 1, 2, 3, 4, 5, 6]
  }
}

function getNextMondays(count: number): { date: string; label: string }[] {
  const today = new Date()
  const dow = today.getDay()
  const daysUntil = dow === 1 ? 7 : (8 - dow) % 7 || 7
  const first = new Date(today)
  first.setDate(today.getDate() + daysUntil)

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first)
    d.setDate(first.getDate() + i * 7)
    const iso = d.toISOString().split('T')[0]!
    const weekNum = Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)
    return { date: iso, label: `Wk${weekNum} (${d.getDate()} ${NL_MONTHS[d.getMonth()]})` }
  })
}

function getWorkDays(weekCount: number, workDays: number[]): { date: string; label: string }[] {
  const today = new Date()
  const dow = today.getDay()
  const daysUntil = dow === 1 ? 7 : (8 - dow) % 7 || 7
  const monday = new Date(today)
  monday.setDate(today.getDate() + daysUntil)

  const result: { date: string; label: string }[] = []
  for (let w = 0; w < weekCount; w++) {
    for (let d = 0; d < 7; d++) {
      const dayDate = new Date(monday)
      dayDate.setDate(monday.getDate() + w * 7 + d)
      const dayOfWeek = dayDate.getDay()
      if (!workDays.includes(dayOfWeek)) continue
      const iso = dayDate.toISOString().split('T')[0]!
      const dayLabel = NL_DAYS_CAP[dayOfWeek]
      const dateLabel = `${dayDate.getDate()}/${dayDate.getMonth() + 1}`
      result.push({ date: iso, label: `${dayLabel} ${dateLabel}` })
    }
  }
  return result
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}

// ── Template generation ──────────────────────────────────────────────────────

function downloadDemandTemplate(
  processes: Array<{ id: string; name: string }>,
  mode: PlanMode = 'week',
  weekCount = 8,
  workDays: number[] = [1, 2, 3, 4, 5],
) {
  const wb = XLSX.utils.book_new()
  const columns = mode === 'week'
    ? getNextMondays(weekCount)
    : getWorkDays(weekCount, workDays)

  const headerRow = ['Proces', ...columns.map((c) => c.label)]
  const dateRow = ['', ...columns.map((c) => c.date)]
  const modeRow = ['_mode', mode, ...(mode === 'day' ? ['weekCount=' + weekCount] : [])]
  const dataRows = processes.map((p) => [p.name, ...columns.map(() => '')])

  const allRows = [headerRow, dateRow, modeRow, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(allRows)

  ws['!cols'] = [
    { wch: 24 },
    ...columns.map(() => ({ wch: mode === 'day' ? 12 : 16 })),
  ]

  XLSX.utils.book_append_sheet(wb, ws, 'Demand')

  const modeLabel = mode === 'week' ? 'Per week' : 'Per dag'
  const ref = [
    ['AstraPlanner — Demand Forecast Template'],
    [''],
    [`Modus: ${modeLabel}`],
    ['Instructies:'],
    ['1. Vul per proces (rij) het verwachte volume in per kolom.'],
    ['2. Laat cellen leeg als er geen demand is voor die periode.'],
    ['3. Wijzig de procesnamen en datums NIET.'],
    ['4. Rij 2 bevat de datums — niet verwijderen.'],
    ['5. Rij 3 bevat metadata — niet verwijderen.'],
    [''],
    ['Processen in dit template:'],
    ...processes.map((p, i) => [`${i + 1}. ${p.name}`]),
    [''],
    [`Gegenereerd: ${new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}`],
  ]
  const wsRef = XLSX.utils.aoa_to_sheet(ref)
  wsRef['!cols'] = [{ wch: 55 }]
  XLSX.utils.book_append_sheet(wb, wsRef, 'Referentie')

  XLSX.writeFile(wb, 'AstraPlanner_Demand_Template.xlsx')
}

// ── Template parsing ─────────────────────────────────────────────────────────

function parseFilledTemplate(
  wb: XLSX.WorkBook,
  processes: Array<{ id: string; name: string }>,
): { entries: ParsedDemand[]; errors: string[] } {
  const sheet = wb.Sheets['Demand'] ?? wb.Sheets[wb.SheetNames[0]!]
  if (!sheet) return { entries: [], errors: ['Geen "Demand" tabblad gevonden'] }

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  if (raw.length < 3) return { entries: [], errors: ['Template bevat te weinig rijen'] }

  const dateRow = raw[1] as string[]
  const modeRow = raw[2] as string[]
  const isMetaRow = String(modeRow?.[0] ?? '').trim() === '_mode'
  const mode: PlanMode = isMetaRow && String(modeRow[1] ?? '').trim() === 'day' ? 'day' : 'week'
  const dataStartRow = isMetaRow ? 3 : 2

  const periodDates: string[] = []
  for (let c = 1; c < dateRow.length; c++) {
    const d = String(dateRow[c] ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) periodDates.push(d)
  }

  if (periodDates.length === 0) {
    return { entries: [], errors: ['Geen geldige datums gevonden in rij 2.'] }
  }

  const procMap = new Map(processes.map((p) => [p.name.toLowerCase(), p]))
  const entries: ParsedDemand[] = []
  const errors: string[] = []

  for (let r = dataStartRow; r < raw.length; r++) {
    const row = raw[r] as unknown[]
    const procName = String(row[0] ?? '').trim()
    if (!procName) continue

    const proc = procMap.get(procName.toLowerCase())
    if (!proc) {
      errors.push(`Rij ${r + 1}: onbekend proces "${procName}"`)
      continue
    }

    for (let c = 0; c < periodDates.length; c++) {
      const val = row[c + 1]
      const vol = Number(val)
      if (val === '' || val == null || isNaN(vol) || vol === 0) continue

      if (vol < 0) {
        errors.push(`Rij ${r + 1}, ${periodDates[c]}: negatief volume`)
        continue
      }

      const periodStart = periodDates[c]!
      const periodEnd = mode === 'day' ? periodStart : addDays(periodStart, 6)

      entries.push({
        periodStart,
        periodEnd,
        demandTypeId: proc.id,
        demandTypeName: proc.name,
        volume: vol,
      })
    }
  }

  return { entries, errors }
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 9999, padding: 24,
}

const modalStyle: React.CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--border)',
  borderRadius: 16, width: '100%', maxWidth: 560,
  display: 'flex', flexDirection: 'column', overflow: 'hidden',
  boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
}

// ── Wizard component ──────────────────────────────────────────────────────────

export function DemandUploadWizard({ open, onClose, siteId, onImported }: DemandUploadWizardProps) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<WizardStep>(1)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [entries, setEntries] = useState<ParsedDemand[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [isImporting, setIsImporting] = useState(false)
  const [planMode, setPlanMode] = useState<PlanMode>('week')
  const [dayWeekCount, setDayWeekCount] = useState(1)
  const [workDayPreset, setWorkDayPreset] = useState<WorkDayPreset>('ma-vr')
  const workDays = useMemo(() => workDaysFromPreset(workDayPreset), [workDayPreset])

  const { activeSiteId } = useSiteStore()
  const processesQuery = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId ?? siteId },
    { enabled: open && !!(activeSiteId ?? siteId) },
  )
  const demandTypes = useMemo(() =>
    (processesQuery.data ?? []).map((p) => ({ id: p.id, name: p.name })),
    [processesQuery.data],
  )
  const upsertDemandType = trpc.demand.upsertDemandType.useMutation()
  const bulkUpsert = trpc.demand.bulkUpsert.useMutation()

  const handleClose = useCallback(() => {
    setStep(1); setIsDragging(false); setUploadedFile(null)
    setEntries([]); setParseErrors([]); setIsImporting(false)
    setPlanMode('week'); setDayWeekCount(1); setWorkDayPreset('ma-vr')
    onClose()
  }, [onClose])

  const processFile = useCallback((file: File) => {
    if (!file.name.match(/\.(xlsx|xls)$/i)) {
      setParseErrors(['Alleen .xlsx of .xls bestanden worden ondersteund']); return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const result = parseFilledTemplate(wb, demandTypes)
        setUploadedFile(file); setEntries(result.entries); setParseErrors(result.errors)
      } catch { setParseErrors(['Kon het bestand niet lezen.']) }
    }
    reader.readAsArrayBuffer(file)
  }, [demandTypes])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) processFile(file); e.target.value = ''
  }, [processFile])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false)
    const file = e.dataTransfer.files[0]; if (file) processFile(file)
  }, [processFile])

  const handleImport = useCallback(async () => {
    if (entries.length === 0) return
    setIsImporting(true)
    try {
      const uniqueProcessIds = [...new Set(entries.map((e) => e.demandTypeId))]
      const processMap = new Map(demandTypes.map((p) => [p.id, p]))
      const demandTypeIdMap = new Map<string, string>()

      for (const processId of uniqueProcessIds) {
        const proc = processMap.get(processId); if (!proc) continue
        const result = await upsertDemandType.mutateAsync({
          name: proc.name, unit_of_measure: 'units',
          process_mappings: [{ process_id: processId, conversion_ratio: 1 }],
        })
        demandTypeIdMap.set(processId, result.id)
      }

      const forecasts = entries
        .filter((e) => demandTypeIdMap.has(e.demandTypeId))
        .map((e) => ({
          demand_type_id: demandTypeIdMap.get(e.demandTypeId)!,
          site_id: siteId, volume: e.volume,
          period_start: e.periodStart, period_end: e.periodEnd,
          source: 'csv_upload' as const,
        }))

      if (forecasts.length === 0) {
        toast.showError('Geen geldige entries om te importeren'); setIsImporting(false); return
      }

      const result = await bulkUpsert.mutateAsync({ forecasts })
      toast.showSuccess(`${result.upserted} demand entries geimporteerd`)
      onImported(); handleClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import mislukt'
      toast.showError(`Fout bij importeren: ${msg}`)
    } finally { setIsImporting(false) }
  }, [entries, siteId, demandTypes, upsertDemandType, bulkUpsert, toast, onImported, handleClose])

  const uniquePeriods = [...new Set(entries.map((e) => e.periodStart))].sort()
  const uniqueProcesses = [...new Set(entries.map((e) => e.demandTypeName))]
  const canProceedToStep2 = entries.length > 0
  const isDayMode = entries.length > 0 && entries[0]!.periodStart === entries[0]!.periodEnd

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div key="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={snappy} style={overlayStyle}
        onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}>
        <motion.div key="modal" initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={bouncy} style={modalStyle}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileSpreadsheet size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, color: 'var(--foreground)' }}>Demand uploaden</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--muted-foreground)' }}>
                  Stap {step} van 2 — {step === 1 ? 'Template downloaden & uploaden' : 'Controleren & importeren'}
                </div>
              </div>
            </div>
            <motion.button variants={scalePress} whileTap="press" onClick={handleClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted-foreground)', padding: 4, borderRadius: 6, display: 'flex', alignItems: 'center' }}>
              <X size={18} />
            </motion.button>
          </div>

          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 4, padding: '12px 24px 0' }}>
            {([1, 2] as const).map((s) => (
              <div key={s} style={{ height: 3, flex: 1, borderRadius: 2, background: s <= step ? 'linear-gradient(90deg, #6366f1, #8b5cf6)' : 'var(--border)', transition: 'background 0.3s ease' }} />
            ))}
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', maxHeight: 480 }}>
            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.div key="step1" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={snappy}>
                  <Step1
                    demandTypes={demandTypes} isDragging={isDragging} uploadedFile={uploadedFile}
                    entries={entries} parseErrors={parseErrors} fileInputRef={fileInputRef}
                    planMode={planMode} dayWeekCount={dayWeekCount} workDayPreset={workDayPreset}
                    onPlanModeChange={setPlanMode} onDayWeekCountChange={setDayWeekCount}
                    onWorkDayPresetChange={setWorkDayPreset}
                    onDownloadTemplate={() => downloadDemandTemplate(demandTypes, planMode, planMode === 'week' ? 8 : dayWeekCount, workDays)}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onFileChange={handleFileChange}
                    onDropZoneClick={() => fileInputRef.current?.click()}
                  />
                </motion.div>
              ) : (
                <motion.div key="step2" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={snappy}>
                  <Step2 entries={entries} uniquePeriods={uniquePeriods} uniqueProcesses={uniqueProcesses} isDayMode={isDayMode} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderTop: '1px solid var(--border)', gap: 12 }}>
            <motion.button variants={scalePress} whileTap="press" onClick={step === 1 ? handleClose : () => setStep(1)}
              style={{ padding: '9px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--foreground)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {step === 1 ? 'Annuleren' : 'Terug'}
            </motion.button>
            {step === 1 ? (
              <motion.button variants={scalePress} whileTap="press" onClick={() => setStep(2)} disabled={!canProceedToStep2}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: canProceedToStep2 ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'var(--muted)', color: canProceedToStep2 ? '#fff' : 'var(--muted-foreground)', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, cursor: canProceedToStep2 ? 'pointer' : 'not-allowed', transition: 'background 0.2s ease' }}>
                Volgende
              </motion.button>
            ) : (
              <motion.button variants={scalePress} whileTap="press" onClick={handleImport} disabled={isImporting || entries.length === 0}
                style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg, #10b981, #059669)', color: '#fff', fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 700, cursor: isImporting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: isImporting ? 0.7 : 1 }}>
                <Check size={14} />
                {isImporting ? 'Importeren...' : 'Importeren'}
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
