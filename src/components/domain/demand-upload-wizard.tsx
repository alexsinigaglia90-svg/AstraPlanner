'use client'

import { useState, useRef, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, Download, Check, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useToast } from '@/components/domain/toast'
import { useSiteStore } from '@/stores/site-store'
import * as XLSX from 'xlsx'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DemandUploadWizardProps {
  open: boolean
  onClose: () => void
  siteId: string
  onImported: () => void
}

type WizardStep = 1 | 2

interface ParsedDemand {
  weekStart: string
  demandTypeId: string
  demandTypeName: string
  volume: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getNextMondays(count: number): { date: string; label: string }[] {
  const today = new Date()
  const dow = today.getDay()
  const daysUntil = dow === 1 ? 7 : (8 - dow) % 7 || 7
  const first = new Date(today)
  first.setDate(today.getDate() + daysUntil)

  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

  return Array.from({ length: count }, (_, i) => {
    const d = new Date(first)
    d.setDate(first.getDate() + i * 7)
    const iso = d.toISOString().split('T')[0]!
    const weekNum = Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)
    return { date: iso, label: `Wk${weekNum} (${d.getDate()} ${months[d.getMonth()]})` }
  })
}

// ── Template generation (processes as ROWS, weeks as COLUMNS) ────────────────

function downloadDemandTemplate(
  processes: Array<{ id: string; name: string }>,
  weekCount = 8,
) {
  const wb = XLSX.utils.book_new()
  const weeks = getNextMondays(weekCount)

  // Row 1: header — "Proces" + week labels
  // Row 2: sub-header — "" + ISO dates (hidden key for parsing)
  // Row 3+: process name + empty cells
  const headerRow = ['Proces', ...weeks.map((w) => w.label)]
  const dateRow = ['', ...weeks.map((w) => w.date)]
  const dataRows = processes.map((p) => [p.name, ...weeks.map(() => '')])

  const allRows = [headerRow, dateRow, ...dataRows]
  const ws = XLSX.utils.aoa_to_sheet(allRows)

  // Column widths
  ws['!cols'] = [
    { wch: 24 }, // Process name column
    ...weeks.map(() => ({ wch: 16 })),
  ]

  // Style the date row as smaller/muted (row 2) — add comment as hint
  // XLSX doesn't support cell styling without xlsx-style, but we make date row clear

  XLSX.utils.book_append_sheet(wb, ws, 'Demand')

  // Sheet 2: Referentie
  const ref = [
    ['AstraPlanner — Demand Forecast Template'],
    [''],
    ['Instructies:'],
    ['1. Vul per proces (rij) het verwachte volume in per week (kolom).'],
    ['2. Laat cellen leeg als er geen demand is voor die week.'],
    ['3. Wijzig de procesnamen en datums NIET.'],
    ['4. Rij 2 bevat de weekstart-datums (maandag) — niet verwijderen.'],
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

// ── Template parsing (processes as ROWS, weeks as COLUMNS) ───────────────────

function parseFilledTemplate(
  wb: XLSX.WorkBook,
  processes: Array<{ id: string; name: string }>,
): { entries: ParsedDemand[]; errors: string[] } {
  const sheet = wb.Sheets['Demand'] ?? wb.Sheets[wb.SheetNames[0]!]
  if (!sheet) return { entries: [], errors: ['Geen "Demand" tabblad gevonden'] }

  const raw = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' }) as unknown[][]
  if (raw.length < 3) return { entries: [], errors: ['Template bevat te weinig rijen'] }

  // Row 0: header labels (Proces, Wk14 (31 mrt), ...)
  // Row 1: ISO dates ("", 2026-04-06, 2026-04-13, ...)
  // Row 2+: process name + volumes

  const dateRow = raw[1] as string[]
  const weekDates: string[] = []
  for (let c = 1; c < dateRow.length; c++) {
    const d = String(dateRow[c] ?? '').trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      weekDates.push(d)
    }
  }

  if (weekDates.length === 0) {
    return { entries: [], errors: ['Geen geldige datums gevonden in rij 2. Verwijder rij 2 niet uit het template.'] }
  }

  const procMap = new Map(processes.map((p) => [p.name.toLowerCase(), p]))
  const entries: ParsedDemand[] = []
  const errors: string[] = []

  for (let r = 2; r < raw.length; r++) {
    const row = raw[r] as unknown[]
    const procName = String(row[0] ?? '').trim()
    if (!procName) continue

    const proc = procMap.get(procName.toLowerCase())
    if (!proc) {
      errors.push(`Rij ${r + 1}: onbekend proces "${procName}"`)
      continue
    }

    for (let c = 0; c < weekDates.length; c++) {
      const val = row[c + 1] // +1 because column 0 is process name
      const vol = Number(val)
      if (val === '' || val == null || isNaN(vol) || vol === 0) continue

      if (vol < 0) {
        errors.push(`Rij ${r + 1}, ${weekDates[c]}: negatief volume`)
        continue
      }

      entries.push({
        weekStart: weekDates[c]!,
        demandTypeId: proc.id,
        demandTypeName: proc.name,
        volume: vol,
      })
    }
  }

  return { entries, errors }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]!
}

function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-')
  return `${d}/${m}/${y}`
}

// ── Styles ────────────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0,0,0,0.6)',
  backdropFilter: 'blur(4px)',
  WebkitBackdropFilter: 'blur(4px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 9999,
  padding: 24,
}

const modalStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 16,
  width: '100%',
  maxWidth: 560,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 24px 80px rgba(0,0,0,0.4)',
}

// ── Wizard component ──────────────────────────────────────────────────────────

export function DemandUploadWizard({
  open,
  onClose,
  siteId,
  onImported,
}: DemandUploadWizardProps) {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [step, setStep] = useState<WizardStep>(1)
  const [isDragging, setIsDragging] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null)
  const [entries, setEntries] = useState<ParsedDemand[]>([])
  const [parseErrors, setParseErrors] = useState<string[]>([])
  const [isImporting, setIsImporting] = useState(false)

  const { activeSiteId } = useSiteStore()

  const processesQuery = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId ?? siteId },
    { enabled: open && !!(activeSiteId ?? siteId) },
  )

  // Use processes for template columns — mapped to demand types at import time
  const demandTypes = useMemo(() =>
    (processesQuery.data ?? []).map((p) => ({ id: p.id, name: p.name })),
    [processesQuery.data],
  )

  const upsertDemandType = trpc.demand.upsertDemandType.useMutation()

  const bulkUpsert = trpc.demand.bulkUpsert.useMutation()

  // ── Reset on close ────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setStep(1)
    setIsDragging(false)
    setUploadedFile(null)
    setEntries([])
    setParseErrors([])
    setIsImporting(false)
    onClose()
  }, [onClose])

  // ── File handling ─────────────────────────────────────────────────────────

  const processFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.(xlsx|xls)$/i)) {
        setParseErrors(['Alleen .xlsx of .xls bestanden worden ondersteund'])
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target!.result as ArrayBuffer)
          const wb = XLSX.read(data, { type: 'array' })
          const result = parseFilledTemplate(wb, demandTypes)
          setUploadedFile(file)
          setEntries(result.entries)
          setParseErrors(result.errors)
        } catch {
          setParseErrors(['Kon het bestand niet lezen. Controleer of het een geldig Excel-bestand is.'])
        }
      }
      reader.readAsArrayBuffer(file)
    },
    [demandTypes],
  )

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) processFile(file)
      // Reset so same file can be re-uploaded
      e.target.value = ''
    },
    [processFile],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) processFile(file)
    },
    [processFile],
  )

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = useCallback(async () => {
    if (entries.length === 0) return
    setIsImporting(true)
    try {
      // Auto-create demand types for each unique process (1:1 mapping)
      const uniqueProcessIds = [...new Set(entries.map((e) => e.demandTypeId))]
      const processMap = new Map(demandTypes.map((p) => [p.id, p]))
      const demandTypeIdMap = new Map<string, string>() // processId → demandTypeId

      for (const processId of uniqueProcessIds) {
        const proc = processMap.get(processId)
        if (!proc) continue
        // Create/upsert a 1:1 demand type for this process
        const result = await upsertDemandType.mutateAsync({
          name: proc.name,
          unit_of_measure: 'units',
          process_mappings: [{ process_id: processId, conversion_ratio: 1 }],
        })
        demandTypeIdMap.set(processId, result.id)
      }

      const forecasts = entries
        .filter((e) => demandTypeIdMap.has(e.demandTypeId))
        .map((e) => ({
          demand_type_id: demandTypeIdMap.get(e.demandTypeId)!,
          site_id: siteId,
          volume: e.volume,
          period_start: e.weekStart,
          period_end: addDays(e.weekStart, 6),
          source: 'csv_upload' as const,
        }))

      if (forecasts.length === 0) {
        toast.showError('Geen geldige entries om te importeren')
        setIsImporting(false)
        return
      }

      const result = await bulkUpsert.mutateAsync({ forecasts })
      toast.showSuccess(`${result.upserted} demand entries geïmporteerd`)
      onImported()
      handleClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import mislukt'
      toast.showError(`Fout bij importeren: ${msg}`)
    } finally {
      setIsImporting(false)
    }
  }, [entries, siteId, bulkUpsert, toast, onImported, handleClose])

  // ── Derived ───────────────────────────────────────────────────────────────

  const uniqueWeeks = [...new Set(entries.map((e) => e.weekStart))].sort()
  const uniqueProcesses = [...new Set(entries.map((e) => e.demandTypeName))]
  const canProceedToStep2 = entries.length > 0

  // ── Render ────────────────────────────────────────────────────────────────

  if (!open) return null

  return (
    <AnimatePresence>
      <motion.div
        key="overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={snappy}
        style={overlayStyle}
        onClick={(e) => {
          if (e.target === e.currentTarget) handleClose()
        }}
      >
        <motion.div
          key="modal"
          initial={{ opacity: 0, scale: 0.95, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 16 }}
          transition={bouncy}
          style={modalStyle}
        >
          {/* Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '20px 24px 16px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <FileSpreadsheet size={18} color="#fff" />
              </div>
              <div>
                <div style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 16,
                  fontWeight: 700,
                  color: 'var(--foreground)',
                }}>
                  Demand uploaden
                </div>
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                }}>
                  Stap {step} van 2 — {step === 1 ? 'Template downloaden & uploaden' : 'Controleren & importeren'}
                </div>
              </div>
            </div>
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={handleClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted-foreground)',
                padding: 4,
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={18} />
            </motion.button>
          </div>

          {/* Step indicator */}
          <div style={{
            display: 'flex',
            gap: 4,
            padding: '12px 24px 0',
          }}>
            {([1, 2] as const).map((s) => (
              <div
                key={s}
                style={{
                  height: 3,
                  flex: 1,
                  borderRadius: 2,
                  background: s <= step
                    ? 'linear-gradient(90deg, #6366f1, #8b5cf6)'
                    : 'var(--border)',
                  transition: 'background 0.3s ease',
                }}
              />
            ))}
          </div>

          {/* Body */}
          <div style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', maxHeight: 480 }}>
            <AnimatePresence mode="wait">
              {step === 1 ? (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 16 }}
                  transition={snappy}
                >
                  <Step1
                    demandTypes={demandTypes}
                    isDragging={isDragging}
                    uploadedFile={uploadedFile}
                    entries={entries}
                    parseErrors={parseErrors}
                    fileInputRef={fileInputRef}
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onFileChange={handleFileChange}
                    onDropZoneClick={() => fileInputRef.current?.click()}
                  />
                </motion.div>
              ) : (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  transition={snappy}
                >
                  <Step2
                    entries={entries}
                    uniqueWeeks={uniqueWeeks}
                    uniqueProcesses={uniqueProcesses}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            gap: 12,
          }}>
            <motion.button
              variants={scalePress}
              whileTap="press"
              onClick={step === 1 ? handleClose : () => setStep(1)}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--foreground)',
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {step === 1 ? 'Annuleren' : 'Terug'}
            </motion.button>

            {step === 1 ? (
              <motion.button
                variants={scalePress}
                whileTap="press"
                onClick={() => setStep(2)}
                disabled={!canProceedToStep2}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: canProceedToStep2
                    ? 'linear-gradient(135deg, #6366f1, #8b5cf6)'
                    : 'var(--muted)',
                  color: canProceedToStep2 ? '#fff' : 'var(--muted-foreground)',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: canProceedToStep2 ? 'pointer' : 'not-allowed',
                  transition: 'background 0.2s ease',
                }}
              >
                Volgende
              </motion.button>
            ) : (
              <motion.button
                variants={scalePress}
                whileTap="press"
                onClick={handleImport}
                disabled={isImporting || entries.length === 0}
                style={{
                  padding: '9px 18px',
                  borderRadius: 8,
                  border: 'none',
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#fff',
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: isImporting ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  opacity: isImporting ? 0.7 : 1,
                }}
              >
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

// ── Step 1 ────────────────────────────────────────────────────────────────────

interface Step1Props {
  demandTypes: Array<{ id: string; name: string }>
  isDragging: boolean
  uploadedFile: File | null
  entries: ParsedDemand[]
  parseErrors: string[]
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onDrop: (e: React.DragEvent) => void
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  onDropZoneClick: () => void
}

function Step1({
  demandTypes,
  isDragging,
  uploadedFile,
  entries,
  parseErrors,
  fileInputRef,
  onDrop,
  onDragOver,
  onDragLeave,
  onFileChange,
  onDropZoneClick,
}: Step1Props) {
  const hasFile = uploadedFile !== null
  const hasEntries = entries.length > 0
  const hasErrors = parseErrors.length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Download section */}
      <div style={{
        padding: 16,
        borderRadius: 10,
        border: '1px solid var(--border)',
        background: 'var(--muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}>
        <div>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontSize: 14,
            fontWeight: 700,
            color: 'var(--foreground)',
            marginBottom: 4,
          }}>
            Stap 1: Download de template
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
          }}>
            {demandTypes.length > 0
              ? `${demandTypes.length} processen — 8 weken vooraf ingevuld`
              : 'Geen demand types gevonden — voeg eerst processen toe'}
          </div>
        </div>
        <motion.button
          variants={scalePress}
          whileTap="press"
          onClick={() => downloadDemandTemplate(demandTypes)}
          disabled={demandTypes.length === 0}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '8px 14px',
            borderRadius: 8,
            border: '2px solid #6366f1',
            background: 'transparent',
            color: '#6366f1',
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 700,
            cursor: demandTypes.length > 0 ? 'pointer' : 'not-allowed',
            whiteSpace: 'nowrap',
            opacity: demandTypes.length === 0 ? 0.4 : 1,
          }}
        >
          <Download size={14} />
          Template
        </motion.button>
      </div>

      {/* Upload zone */}
      <div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          fontWeight: 700,
          color: 'var(--foreground)',
          marginBottom: 8,
        }}>
          Stap 2: Upload het ingevulde template
        </div>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onClick={onDropZoneClick}
          style={{
            border: `2px dashed ${isDragging ? '#6366f1' : hasFile && hasEntries ? '#10b981' : 'var(--border)'}`,
            borderRadius: 10,
            padding: '28px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
            transition: 'border-color 0.2s, background 0.2s',
            background: isDragging
              ? 'rgba(99,102,241,0.06)'
              : hasFile && hasEntries
              ? 'rgba(16,185,129,0.05)'
              : 'transparent',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          {hasFile && hasEntries ? (
            <Check size={24} color="#10b981" />
          ) : (
            <Upload size={24} color={isDragging ? '#6366f1' : 'var(--muted-foreground)'} />
          )}
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 13,
            fontWeight: 600,
            color: hasFile && hasEntries
              ? '#10b981'
              : isDragging
              ? '#6366f1'
              : 'var(--foreground)',
          }}>
            {hasFile
              ? uploadedFile.name
              : 'Sleep je Excel hier of klik om te bladeren'}
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            color: 'var(--muted-foreground)',
          }}>
            .xlsx of .xls
          </div>
        </div>
      </div>

      {/* Validation summary */}
      {hasFile && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {hasEntries && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(16,185,129,0.1)',
              border: '1px solid rgba(16,185,129,0.3)',
            }}>
              <Check size={14} color="#10b981" />
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: '#10b981',
                fontWeight: 600,
              }}>
                {entries.length} geldige entries gevonden
              </span>
            </div>
          )}
          {hasErrors && (
            <div style={{
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                marginBottom: 2,
              }}>
                <AlertCircle size={14} color="#ef4444" />
                <span style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 13,
                  color: '#ef4444',
                  fontWeight: 600,
                }}>
                  {parseErrors.length} waarschuwing{parseErrors.length > 1 ? 'en' : ''}
                </span>
              </div>
              {parseErrors.slice(0, 5).map((err, i) => (
                <div key={i} style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  paddingLeft: 20,
                }}>
                  {err}
                </div>
              ))}
              {parseErrors.length > 5 && (
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  paddingLeft: 20,
                }}>
                  + {parseErrors.length - 5} meer...
                </div>
              )}
            </div>
          )}
          {!hasEntries && !hasErrors && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(245,158,11,0.1)',
              border: '1px solid rgba(245,158,11,0.3)',
            }}>
              <AlertCircle size={14} color="#f59e0b" />
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: 13,
                color: '#f59e0b',
                fontWeight: 600,
              }}>
                Geen geldige data gevonden in het bestand
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 2 ────────────────────────────────────────────────────────────────────

interface Step2Props {
  entries: ParsedDemand[]
  uniqueWeeks: string[]
  uniqueProcesses: string[]
}

function Step2({ entries, uniqueWeeks, uniqueProcesses }: Step2Props) {
  // Build lookup: processName -> weekStart -> volume (transposed)
  const lookup = new Map<string, Map<string, number>>()
  for (const e of entries) {
    if (!lookup.has(e.demandTypeName)) lookup.set(e.demandTypeName, new Map())
    lookup.get(e.demandTypeName)!.set(e.weekStart, e.volume)
  }

  // Format week labels
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
  const weekLabel = (iso: string) => {
    const d = new Date(iso)
    const wk = Math.ceil(((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 + 1) / 7)
    return `Wk${wk}`
  }
  const weekSub = (iso: string) => {
    const d = new Date(iso)
    return `${d.getDate()} ${months[d.getMonth()]}`
  }

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
        <strong>{uniqueWeeks.length}</strong> weken voor{' '}
        <strong>{uniqueProcesses.length}</strong> processen
      </div>

      {/* Preview table — processes as ROWS, weeks as COLUMNS */}
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
                minWidth: 140,
                position: 'sticky',
                left: 0,
                background: 'var(--muted)',
                zIndex: 1,
              }}>
                Proces
              </th>
              {uniqueWeeks.map((w) => (
                <th key={w} style={{
                  padding: '8px 12px',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: 'var(--muted-foreground)',
                  borderBottom: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                  minWidth: 80,
                }}>
                  <div>{weekLabel(w)}</div>
                  <div style={{ fontSize: 10, fontWeight: 400 }}>{weekSub(w)}</div>
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
                    position: 'sticky',
                    left: 0,
                    background: idx % 2 === 0 ? 'var(--card)' : 'rgba(99,102,241,0.02)',
                    zIndex: 1,
                  }}>
                    {proc}
                  </td>
                  {uniqueWeeks.map((w) => {
                    const val = procMap?.get(w)
                    return (
                      <td key={w} style={{
                        padding: '7px 12px',
                        textAlign: 'right',
                        fontFamily: 'var(--font-mono)',
                        color: val != null ? 'var(--foreground)' : 'var(--muted-foreground)',
                        borderBottom: idx < uniqueProcesses.length - 1 ? '1px solid var(--border)' : 'none',
                      }}>
                        {val != null ? val.toLocaleString('nl-NL') : '—'}
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
