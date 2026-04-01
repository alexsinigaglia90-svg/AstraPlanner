'use client'

import { useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, Download, Check, AlertCircle, FileSpreadsheet } from 'lucide-react'
import { bouncy, snappy, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useToast } from '@/components/domain/toast'
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

// ── Template generation ───────────────────────────────────────────────────────

function downloadDemandTemplate(
  demandTypes: Array<{ id: string; name: string }>,
  weekCount = 8,
) {
  const wb = XLSX.utils.book_new()

  // Sheet 1: Demand
  const headers = ['Week Start (maandag)', ...demandTypes.map((dt) => dt.name)]
  const rows: (string | number)[][] = []

  // Generate next N Mondays
  const today = new Date()
  const dayOfWeek = today.getDay() // 0=Sun,1=Mon,...,6=Sat
  const daysUntilMonday = dayOfWeek === 1 ? 7 : (8 - dayOfWeek) % 7 || 7
  const firstMonday = new Date(today)
  firstMonday.setDate(today.getDate() + daysUntilMonday)

  for (let i = 0; i < weekCount; i++) {
    const monday = new Date(firstMonday)
    monday.setDate(firstMonday.getDate() + i * 7)
    const dateStr = monday.toISOString().split('T')[0]!
    rows.push([dateStr, ...demandTypes.map(() => '')])
  }

  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = headers.map((h, i) => ({ wch: i === 0 ? 20 : Math.max(h.length + 4, 14) }))
  XLSX.utils.book_append_sheet(wb, ws, 'Demand')

  // Sheet 2: Reference
  const ref: (string | number)[][] = [
    ['Instructies'],
    ['Vul per week het verwachte volume in per proces.'],
    ['Laat cellen leeg als er geen demand is.'],
    ['De "Week Start" kolom mag niet gewijzigd worden.'],
    [''],
    ['Processen:'],
    ...demandTypes.map((dt) => [dt.name]),
  ]
  const wsRef = XLSX.utils.aoa_to_sheet(ref)
  wsRef['!cols'] = [{ wch: 50 }]
  XLSX.utils.book_append_sheet(wb, wsRef, 'Referentie')

  XLSX.writeFile(wb, 'AstraPlanner_Demand_Template.xlsx')
}

// ── Template parsing ──────────────────────────────────────────────────────────

function parseFilledTemplate(
  wb: XLSX.WorkBook,
  demandTypes: Array<{ id: string; name: string }>,
): { entries: ParsedDemand[]; errors: string[] } {
  const sheet = wb.Sheets['Demand'] ?? wb.Sheets[wb.SheetNames[0]!]
  if (!sheet) return { entries: [], errors: ['Geen "Demand" tabblad gevonden'] }

  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' })
  const dtMap = new Map(demandTypes.map((dt) => [dt.name.toLowerCase(), dt]))
  const entries: ParsedDemand[] = []
  const errors: string[] = []

  for (let i = 0; i < raw.length; i++) {
    const row = raw[i]!
    const weekStart = String(row['Week Start (maandag)'] ?? '').trim()
    if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      if (weekStart) errors.push(`Rij ${i + 2}: ongeldige datum "${weekStart}"`)
      continue
    }

    for (const [colName, value] of Object.entries(row)) {
      if (colName === 'Week Start (maandag)') continue
      const vol = Number(value)
      if (!value || value === '' || isNaN(vol) || vol === 0) continue

      const dt = dtMap.get(colName.toLowerCase())
      if (!dt) {
        errors.push(`Rij ${i + 2}: onbekend proces "${colName}"`)
        continue
      }

      if (vol < 0) {
        errors.push(`Rij ${i + 2}: negatief volume voor "${colName}"`)
        continue
      }

      entries.push({
        weekStart,
        demandTypeId: dt.id,
        demandTypeName: dt.name,
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

  const { data: demandTypes = [] } = trpc.demand.listDemandTypes.useQuery(
    {},
    { enabled: open },
  )

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
      const forecasts = entries.map((e) => ({
        demand_type_id: e.demandTypeId,
        site_id: siteId,
        volume: e.volume,
        period_start: e.weekStart,
        period_end: addDays(e.weekStart, 6),
        demand_source: 'csv_upload' as const,
        source: 'csv_upload' as const,
      }))
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
  // Build lookup: weekStart -> processName -> volume
  const lookup = new Map<string, Map<string, number>>()
  for (const e of entries) {
    if (!lookup.has(e.weekStart)) lookup.set(e.weekStart, new Map())
    lookup.get(e.weekStart)!.set(e.demandTypeName, e.volume)
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
                minWidth: 100,
              }}>
                Week
              </th>
              {uniqueProcesses.map((p) => (
                <th key={p} style={{
                  padding: '8px 12px',
                  textAlign: 'right',
                  fontWeight: 700,
                  color: 'var(--muted-foreground)',
                  borderBottom: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                  minWidth: 80,
                }}>
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {uniqueWeeks.map((week, idx) => {
              const weekMap = lookup.get(week)
              return (
                <tr
                  key={week}
                  style={{
                    background: idx % 2 === 0 ? 'transparent' : 'var(--muted)',
                  }}
                >
                  <td style={{
                    padding: '7px 12px',
                    color: 'var(--foreground)',
                    fontWeight: 600,
                    borderBottom: idx < uniqueWeeks.length - 1 ? '1px solid var(--border)' : 'none',
                    whiteSpace: 'nowrap',
                  }}>
                    {formatDate(week)}
                  </td>
                  {uniqueProcesses.map((p) => {
                    const val = weekMap?.get(p)
                    return (
                      <td key={p} style={{
                        padding: '7px 12px',
                        textAlign: 'right',
                        color: val != null ? 'var(--foreground)' : 'var(--muted-foreground)',
                        borderBottom: idx < uniqueWeeks.length - 1 ? '1px solid var(--border)' : 'none',
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
