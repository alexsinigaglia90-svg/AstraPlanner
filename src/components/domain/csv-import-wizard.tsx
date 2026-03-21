'use client'

import { useState, useRef, useCallback, DragEvent, ChangeEvent } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Upload, Check, AlertCircle, ChevronDown, FileText } from 'lucide-react'
import { parseCSVFile, ParsedCSV } from '@/lib/csv/parser'
import { snappy, bouncy, gentle, wobbly, scalePress } from '@/lib/motion'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldDefinition {
  key: string
  label: string
  required: boolean
  type: 'string' | 'number' | 'email' | 'date'
}

export interface ImportError {
  row: number
  field: string
  message: string
}

export interface CSVImportWizardProps {
  open: boolean
  onClose: () => void
  title: string
  targetFields: FieldDefinition[]
  onImport: (mappedRows: Record<string, string>[]) => Promise<{ success: number; errors: ImportError[] }>
}

type Step = 'upload' | 'map' | 'import'

// ── Step indicator ─────────────────────────────────────────────────────────────

const STEPS: { id: Step; label: string }[] = [
  { id: 'upload', label: 'Upload' },
  { id: 'map', label: 'Map' },
  { id: 'import', label: 'Import' },
]

function StepIndicator({ current }: { current: Step }) {
  const currentIdx = STEPS.findIndex((s) => s.id === current)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
      {STEPS.map((step, idx) => {
        const done = idx < currentIdx
        const active = idx === currentIdx
        return (
          <div key={step.id} style={{ display: 'flex', alignItems: 'center', flex: idx < STEPS.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
              <motion.div
                animate={{
                  backgroundColor: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--muted)',
                  borderColor: done ? 'var(--success)' : active ? 'var(--primary)' : 'var(--border)',
                }}
                transition={snappy}
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: '2px solid',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {done ? (
                  <Check size={13} color="white" />
                ) : (
                  <span style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: '11px',
                    fontWeight: 700,
                    color: active ? 'white' : 'var(--muted-foreground)',
                  }}>
                    {idx + 1}
                  </span>
                )}
              </motion.div>
              <span style={{
                fontFamily: 'var(--font-body)',
                fontSize: '11px',
                fontWeight: active ? 700 : 500,
                color: active ? 'var(--primary)' : done ? 'var(--success)' : 'var(--muted-foreground)',
                whiteSpace: 'nowrap',
              }}>
                {step.label}
              </span>
            </div>
            {idx < STEPS.length - 1 && (
              <motion.div
                animate={{ backgroundColor: done ? 'var(--success)' : 'var(--border)' }}
                transition={gentle}
                style={{ flex: 1, height: '2px', margin: '0 8px', marginBottom: '18px' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Upload ─────────────────────────────────────────────────────────────

function UploadStep({
  onParsed,
  parsed,
}: {
  onParsed: (p: ParsedCSV) => void
  parsed: ParsedCSV | null
}) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [fileSize, setFileSize] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFile = useCallback(async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file.')
      return
    }
    setError(null)
    setFileName(file.name)
    setFileSize((file.size / 1024).toFixed(1) + ' KB')
    try {
      const result = await parseCSVFile(file)
      onParsed(result)
    } catch {
      setError('Failed to parse CSV. Please check the file format.')
    }
  }, [onParsed])

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <motion.div
        animate={{
          borderColor: dragOver ? 'var(--primary)' : parsed ? 'var(--success)' : 'var(--border)',
          borderStyle: dragOver ? 'solid' : 'dashed',
          backgroundColor: dragOver ? 'rgba(99,102,241,0.05)' : 'transparent',
        }}
        transition={snappy}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        style={{
          height: '180px',
          borderRadius: 'var(--radius-lg)',
          border: '2px dashed var(--border)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '12px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={handleChange}
        />
        <motion.div
          animate={{ scale: dragOver ? 1.1 : 1, color: dragOver ? 'var(--primary)' : 'var(--muted-foreground)' }}
          transition={bouncy}
        >
          <Upload size={32} />
        </motion.div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
            Drop your CSV file here
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', margin: '4px 0 0' }}>
            or click to browse
          </p>
        </div>
      </motion.div>

      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '10px 14px', borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--destructive)',
          color: 'var(--destructive)', fontFamily: 'var(--font-body)', fontSize: '13px',
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {parsed && fileName && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={bouncy}
          style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px 16px', borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid var(--success)',
          }}
        >
          <FileText size={18} color="var(--success)" />
          <div style={{ flex: 1 }}>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
              {fileName}
            </p>
            <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', margin: '2px 0 0' }}>
              {fileSize} · {parsed.rowCount} rows · {parsed.headers.length} columns
            </p>
          </div>
          <Check size={16} color="var(--success)" />
        </motion.div>
      )}
    </div>
  )
}

// ── Step 2: Column mapping ─────────────────────────────────────────────────────

function autoMatch(header: string, fields: FieldDefinition[]): string {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]/g, '')
  const headerNorm = norm(header)
  const exact = fields.find((f) => norm(f.label) === headerNorm || norm(f.key) === headerNorm)
  return exact?.key ?? ''
}

function MapStep({
  parsed,
  targetFields,
  mapping,
  onMapping,
}: {
  parsed: ParsedCSV
  targetFields: FieldDefinition[]
  mapping: Record<string, string>
  onMapping: (m: Record<string, string>) => void
}) {
  const unmappedRequired = targetFields.filter(
    (f) => f.required && !Object.values(mapping).includes(f.key)
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <p style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--muted-foreground)', margin: 0 }}>
        Match your CSV columns to the required fields.
      </p>

      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '8px 16px', alignItems: 'center',
      }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          CSV Column
        </span>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700, color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Maps To
        </span>

        {parsed.headers.map((header) => {
          const selected = mapping[header] ?? ''
          return (
            <>
              <div
                key={`h-${header}`}
                style={{
                  fontFamily: 'var(--font-mono)', fontSize: '12px',
                  color: 'var(--foreground)', padding: '8px 10px',
                  backgroundColor: 'var(--muted)', borderRadius: 'var(--radius-sm)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {header}
              </div>
              <div key={`s-${header}`} style={{ position: 'relative' }}>
                <select
                  value={selected}
                  onChange={(e) => onMapping({ ...mapping, [header]: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '8px 30px 8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: `1px solid ${selected === '' && targetFields.some(f => f.required && !Object.values(mapping).includes(f.key)) ? 'var(--border)' : 'var(--border)'}`,
                    backgroundColor: 'var(--card)',
                    color: selected ? 'var(--foreground)' : 'var(--muted-foreground)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '13px',
                    cursor: 'pointer',
                    appearance: 'none',
                    outline: 'none',
                  }}
                >
                  <option value="">— Skip —</option>
                  {targetFields.map((field) => (
                    <option key={field.key} value={field.key}>
                      {field.label}{field.required ? ' *' : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={12} style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'var(--muted-foreground)' }} />
              </div>
            </>
          )
        })}
      </div>

      {unmappedRequired.length > 0 && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '8px',
          padding: '10px 14px', borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--destructive)',
          color: 'var(--destructive)', fontFamily: 'var(--font-body)', fontSize: '13px',
        }}>
          <AlertCircle size={14} style={{ marginTop: '2px', flexShrink: 0 }} />
          <span>
            Required fields not mapped: {unmappedRequired.map((f) => f.label).join(', ')}
          </span>
        </div>
      )}
    </div>
  )
}

// ── Step 3: Preview & Import ───────────────────────────────────────────────────

function validateRow(
  row: Record<string, string>,
  targetFields: FieldDefinition[]
): ImportError[] {
  const errs: ImportError[] = []
  for (const field of targetFields) {
    const val = row[field.key] ?? ''
    if (field.required && !val.trim()) {
      errs.push({ row: 0, field: field.key, message: `${field.label} is required` })
    } else if (val && field.type === 'number' && isNaN(Number(val))) {
      errs.push({ row: 0, field: field.key, message: `${field.label} must be a number` })
    } else if (val && field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val)) {
      errs.push({ row: 0, field: field.key, message: `${field.label} must be a valid email` })
    }
  }
  return errs
}

function ImportStep({
  parsed,
  mapping,
  targetFields,
  onImport,
}: {
  parsed: ParsedCSV
  mapping: Record<string, string>
  targetFields: FieldDefinition[]
  onImport: (mappedRows: Record<string, string>[]) => Promise<{ success: number; errors: ImportError[] }>
}) {
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<{ success: number; errors: ImportError[] } | null>(null)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())

  // Build mapped rows
  const mappedRows: Record<string, string>[] = parsed.rows.map((row) => {
    const out: Record<string, string> = {}
    for (const [csvCol, fieldKey] of Object.entries(mapping)) {
      if (fieldKey) out[fieldKey] = row[csvCol] ?? ''
    }
    return out
  })

  // Validate all rows
  const validationErrors: Array<{ rowIdx: number; errors: ImportError[] }> = mappedRows.map(
    (row, idx) => ({
      rowIdx: idx,
      errors: validateRow(row, targetFields).map((e) => ({ ...e, row: idx + 1 })),
    })
  ).filter((r) => r.errors.length > 0)

  const validCount = mappedRows.length - validationErrors.length

  // Preview columns: use targetField labels
  const previewFields = targetFields.filter((f) => Object.values(mapping).includes(f.key))
  const previewRows = mappedRows.slice(0, 5)

  const handleImport = async () => {
    setImporting(true)
    try {
      const res = await onImport(mappedRows)
      setResult(res)
      setDone(true)
    } catch {
      setResult({ success: 0, errors: [{ row: 0, field: '', message: 'Import failed. Please try again.' }] })
      setDone(true)
    } finally {
      setImporting(false)
    }
  }

  if (done && result) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', padding: '24px 0' }}>
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={wobbly}
          style={{
            width: '64px', height: '64px', borderRadius: '50%',
            backgroundColor: result.errors.length === 0 ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Check size={28} color={result.errors.length === 0 ? 'var(--success)' : 'var(--warning)'} />
        </motion.div>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 800, color: 'var(--foreground)', margin: 0 }}>
            Import Complete
          </p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--muted-foreground)', margin: '6px 0 0' }}>
            {result.success} imported · {result.errors.length} failed
          </p>
        </div>
        {result.errors.length > 0 && (
          <div style={{
            width: '100%', backgroundColor: 'rgba(239,68,68,0.06)',
            border: '1px solid var(--destructive)', borderRadius: 'var(--radius-sm)',
            padding: '12px 16px', maxHeight: '160px', overflowY: 'auto',
          }}>
            {result.errors.map((e, i) => (
              <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--destructive)', padding: '3px 0' }}>
                Row {e.row}: [{e.field}] {e.message}
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Validation summary */}
      <div style={{ display: 'flex', gap: '10px' }}>
        <div style={{
          flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
          backgroundColor: 'rgba(16,185,129,0.08)', border: '1px solid var(--success)',
          fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--success)', fontWeight: 700,
        }}>
          {validCount} rows valid
        </div>
        {validationErrors.length > 0 && (
          <div style={{
            flex: 1, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
            backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid var(--destructive)',
            fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--destructive)', fontWeight: 700,
          }}>
            {validationErrors.length} rows with errors
          </div>
        )}
      </div>

      {/* Error list */}
      {validationErrors.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '120px', overflowY: 'auto' }}>
          {validationErrors.map(({ rowIdx, errors }) => (
            <div key={rowIdx}>
              <button
                onClick={() => setExpandedRows((prev) => {
                  const next = new Set(prev)
                  next.has(rowIdx) ? next.delete(rowIdx) : next.add(rowIdx)
                  return next
                })}
                style={{
                  width: '100%', textAlign: 'left', background: 'none', border: 'none',
                  padding: '4px 0', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                  fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--destructive)',
                }}
              >
                <ChevronDown size={12} style={{ transform: expandedRows.has(rowIdx) ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.15s' }} />
                Row {rowIdx + 1}: {errors.length} error{errors.length > 1 ? 's' : ''}
              </button>
              {expandedRows.has(rowIdx) && errors.map((e, i) => (
                <div key={i} style={{ paddingLeft: '18px', fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', paddingBottom: '2px' }}>
                  [{e.field}] {e.message}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Preview table */}
      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: 'var(--muted)' }}>
              {previewFields.map((f) => (
                <th key={f.key} style={{
                  padding: '8px 12px', textAlign: 'left',
                  fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700,
                  color: 'var(--muted-foreground)', textTransform: 'uppercase', letterSpacing: '0.05em',
                  whiteSpace: 'nowrap',
                }}>
                  {f.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {previewRows.map((row, idx) => (
              <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                {previewFields.map((f) => (
                  <td key={f.key} style={{
                    padding: '8px 12px',
                    fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--foreground)',
                    maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {row[f.key] || <span style={{ color: 'var(--muted-foreground)' }}>—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {mappedRows.length > 5 && (
          <div style={{
            padding: '6px 12px', borderTop: '1px solid var(--border)',
            fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)',
            backgroundColor: 'var(--muted)',
          }}>
            Showing 5 of {mappedRows.length} rows
          </div>
        )}
      </div>

      {/* Import button */}
      <motion.button
        variants={scalePress}
        whileTap="press"
        onClick={handleImport}
        disabled={importing || validCount === 0}
        style={{
          padding: '12px 24px',
          borderRadius: 'var(--radius-sm)',
          border: 'none',
          background: importing || validCount === 0
            ? 'var(--muted)'
            : 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)',
          color: importing || validCount === 0 ? 'var(--muted-foreground)' : 'white',
          fontFamily: 'var(--font-display)',
          fontSize: '14px',
          fontWeight: 700,
          cursor: importing || validCount === 0 ? 'not-allowed' : 'pointer',
          width: '100%',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {importing ? (
          <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <motion.span
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: 'linear' }}
              style={{ display: 'inline-block', width: '14px', height: '14px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', borderRadius: '50%' }}
            />
            Importing...
          </span>
        ) : (
          `Import ${validCount} row${validCount !== 1 ? 's' : ''}`
        )}
        {importing && (
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 2, ease: 'easeInOut' }}
            style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: '3px',
              background: 'linear-gradient(90deg, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.8) 100%)',
              transformOrigin: 'left',
            }}
          />
        )}
      </motion.button>
    </div>
  )
}

// ── Main wizard ────────────────────────────────────────────────────────────────

export function CSVImportWizard({
  open,
  onClose,
  title,
  targetFields,
  onImport,
}: CSVImportWizardProps) {
  const [step, setStep] = useState<Step>('upload')
  const [direction, setDirection] = useState(1)
  const [parsed, setParsed] = useState<ParsedCSV | null>(null)
  const [mapping, setMapping] = useState<Record<string, string>>({})

  const handleParsed = useCallback((p: ParsedCSV) => {
    setParsed(p)
    // Auto-match headers to target fields
    const autoMap: Record<string, string> = {}
    for (const header of p.headers) {
      autoMap[header] = autoMatch(header, targetFields)
    }
    setMapping(autoMap)
  }, [targetFields])

  const canNext =
    step === 'upload' ? !!parsed :
    step === 'map' ? targetFields.filter((f) => f.required).every((f) => Object.values(mapping).includes(f.key)) :
    false

  const goNext = () => {
    setDirection(1)
    if (step === 'upload') setStep('map')
    else if (step === 'map') setStep('import')
  }

  const goBack = () => {
    setDirection(-1)
    if (step === 'map') setStep('upload')
    else if (step === 'import') setStep('map')
  }

  const handleClose = () => {
    setStep('upload')
    setParsed(null)
    setMapping({})
    onClose()
  }

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 60 : -60, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -60 : 60, opacity: 0 }),
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
            style={{
              position: 'fixed', inset: 0,
              zIndex: 'var(--z-modal)' as unknown as number,
              backgroundColor: 'rgba(30,27,75,0.5)',
              backdropFilter: 'blur(6px)',
            }}
          />

          {/* Dialog */}
          <motion.div
            key="dialog"
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 20 }}
            transition={gentle}
            style={{
              position: 'fixed',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 'calc(var(--z-modal) + 1)' as unknown as number,
              width: '100%', maxWidth: '720px',
              maxHeight: '90vh',
              backgroundColor: 'var(--card)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--elevation-4)',
              display: 'flex', flexDirection: 'column',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '20px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>
              <h2 style={{
                fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '20px',
                color: 'var(--foreground)', margin: 0,
              }}>
                {title}
              </h2>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={handleClose}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '32px', height: '32px', borderRadius: 'var(--radius-sm)',
                  border: 'none', backgroundColor: 'var(--muted)',
                  color: 'var(--muted-foreground)', cursor: 'pointer',
                }}
              >
                <X size={16} />
              </motion.button>
            </div>

            {/* Step indicator */}
            <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
              <StepIndicator current={step} />
            </div>

            {/* Step content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', position: 'relative' }}>
              <AnimatePresence mode="wait" custom={direction}>
                <motion.div
                  key={step}
                  custom={direction}
                  variants={variants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={snappy}
                >
                  {step === 'upload' && (
                    <UploadStep onParsed={handleParsed} parsed={parsed} />
                  )}
                  {step === 'map' && parsed && (
                    <MapStep
                      parsed={parsed}
                      targetFields={targetFields}
                      mapping={mapping}
                      onMapping={setMapping}
                    />
                  )}
                  {step === 'import' && parsed && (
                    <ImportStep
                      parsed={parsed}
                      mapping={mapping}
                      targetFields={targetFields}
                      onImport={onImport}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer navigation */}
            {step !== 'import' && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0,
              }}>
                <motion.button
                  variants={scalePress}
                  whileTap="press"
                  onClick={step === 'upload' ? handleClose : goBack}
                  style={{
                    padding: '9px 20px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)', backgroundColor: 'var(--card)',
                    color: 'var(--foreground)', fontFamily: 'var(--font-body)',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {step === 'upload' ? 'Cancel' : 'Back'}
                </motion.button>

                <motion.button
                  variants={scalePress}
                  whileTap="press"
                  onClick={goNext}
                  disabled={!canNext}
                  style={{
                    padding: '9px 24px', borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: canNext
                      ? 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)'
                      : 'var(--muted)',
                    color: canNext ? 'white' : 'var(--muted-foreground)',
                    fontFamily: 'var(--font-display)', fontSize: '13px', fontWeight: 700,
                    cursor: canNext ? 'pointer' : 'not-allowed',
                    transition: 'opacity 0.15s',
                  }}
                >
                  Next
                </motion.button>
              </div>
            )}

            {step === 'import' && (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                padding: '16px 24px', borderTop: '1px solid var(--border)', flexShrink: 0,
              }}>
                <motion.button
                  variants={scalePress}
                  whileTap="press"
                  onClick={goBack}
                  style={{
                    padding: '9px 20px', borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border)', backgroundColor: 'var(--card)',
                    color: 'var(--foreground)', fontFamily: 'var(--font-body)',
                    fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Back
                </motion.button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
