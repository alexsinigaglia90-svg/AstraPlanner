'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Upload, FileSpreadsheet, Check, AlertCircle, X } from 'lucide-react'
import { bouncy, snappy, wobbly, gentle, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useDemoStore } from '@/hooks/use-demo'
import { useToast } from '@/components/domain/toast'
import { demoShifts, demoEmployees, demoProcesses } from '@/components/onboarding/demo-seed'
import { matchCrew, matchRole } from '@/lib/shift-matcher'
import * as XLSX from 'xlsx'

// ── Dataloader column definitions ───────────────────────────────────────────
// These match what the solver needs (no skills — those are graded individually)

const TEMPLATE_COLUMNS = [
  { key: 'first_name', label: 'First Name', example: 'Lars', required: true },
  { key: 'last_name', label: 'Last Name', example: 'van der Berg', required: true },
  { key: 'department', label: 'Department', example: 'Operations', required: true },
  { key: 'weekly_hours', label: 'Weekly Hours', example: '40', required: true },
  { key: 'role', label: 'Role', example: 'Orderpicker', required: false },
  { key: 'crew', label: 'Crew', example: 'Team A', required: false },
]

type ImportState = 'ready' | 'validating' | 'importing' | 'done' | 'error'

interface ValidationResult {
  valid: { row: number; data: Record<string, string> }[]
  errors: { row: number; field: string; message: string }[]
}

interface SkillsValidationResult {
  matched: { employee_id: string; process_id: string; proficiency_level: number }[]
  employeesMatched: number
  processesMatched: number
  errors: { row: number; message: string }[]
}

// ── Combined template download ──────────────────────────────────────────────

function downloadTemplate(
  crews: { name: string }[],
  processes: { name: string }[],
  employees: { employee_number: string; first_name: string; last_name: string }[],
) {
  const columns = TEMPLATE_COLUMNS.map((c) => {
    if (c.key === 'crew' && crews.length > 0) {
      return { ...c, example: crews[0]!.name }
    }
    return c
  })

  const wb = XLSX.utils.book_new()

  // Sheet 1: Employees
  const empHeaders = columns.map((c) => c.label)
  const empExample = columns.map((c) => c.example)
  const wsEmp = XLSX.utils.aoa_to_sheet([empHeaders, empExample])
  wsEmp['!cols'] = columns.map(() => ({ wch: 22 }))
  XLSX.utils.book_append_sheet(wb, wsEmp, 'Employees')

  // Sheet 2: Skills
  if (processes.length > 0) {
    const skillHeaders = ['Employee Name', ...processes.map((p) => p.name)]
    const skillExamples = employees.length > 0
      ? employees.slice(0, 3).map((emp) => [
          `${emp.first_name} ${emp.last_name}`,
          ...processes.map(() => ''),
        ])
      : [['Lars van der Berg', ...processes.map(() => '')]]
    const wsSkills = XLSX.utils.aoa_to_sheet([skillHeaders, ...skillExamples])
    wsSkills['!cols'] = skillHeaders.map((h) => ({ wch: Math.max(h.length + 2, 16) }))
    XLSX.utils.book_append_sheet(wb, wsSkills, 'Skills')
  }

  // Sheet 3: Reference
  const refRows: string[][] = [
    ['Available Crews', 'Instructions'],
    ['', 'Fill Sheet 1 (Employees) with employee data.'],
    ['', 'Fill Sheet 2 (Skills) with skill levels 1-5.'],
    ['', '1=Beginner, 2=Basic, 3=Intermediate, 4=Advanced, 5=Expert'],
    ['', 'Leave skill cells empty or 0 to skip.'],
  ]
  const maxRows = Math.max(crews.length, 1)
  for (let i = 0; i < maxRows; i++) {
    if (i < refRows.length - 1) {
      refRows[i + 1]![0] = crews[i]?.name ?? ''
    } else {
      refRows.push([crews[i]?.name ?? '', ''])
    }
  }
  const wsRef = XLSX.utils.aoa_to_sheet(refRows)
  wsRef['!cols'] = [{ wch: 25 }, { wch: 55 }]
  XLSX.utils.book_append_sheet(wb, wsRef, 'Reference')

  XLSX.writeFile(wb, 'AstraPlanner_Import_Template.xlsx')
}

// ── Download pre-filled skills template ─────────────────────────────────────

function downloadSkillsTemplate(
  employeeNames: string[],
  processes: { name: string }[],
) {
  const wb = XLSX.utils.book_new()

  // Skills matrix: Employee Name + process columns
  const headers = ['Employee Name', ...processes.map((p) => p.name)]
  const rows = employeeNames.map((name) => [name, ...processes.map(() => '')])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 4, 18) }))
  XLSX.utils.book_append_sheet(wb, ws, 'Skills')

  // Reference sheet
  const ref = [
    ['Instructions'],
    ['Fill in skill levels 1-5 for each employee/process combination.'],
    ['1 = Beginner, 2 = Basic, 3 = Intermediate, 4 = Advanced, 5 = Expert'],
    ['Leave cells empty or 0 to skip.'],
    ['Column order does not matter — processes are matched by name.'],
  ]
  const wsRef = XLSX.utils.aoa_to_sheet(ref)
  wsRef['!cols'] = [{ wch: 60 }]
  XLSX.utils.book_append_sheet(wb, wsRef, 'Reference')

  XLSX.writeFile(wb, 'AstraPlanner_Skills_Template.xlsx')
}

// ── Fuzzy process name matching ─────────────────────────────────────────────

const NAME_COLUMN_ALIASES = new Set([
  'employee name', 'employee', 'name', 'naam', 'medewerker',
  'werknemer', 'full name', 'volledige naam', 'first name',
])

function isNameColumn(header: string): boolean {
  return NAME_COLUMN_ALIASES.has(header.toLowerCase().trim())
}

function fuzzyMatchProcess(
  header: string,
  processes: Map<string, string>,
): string | null {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, ' ').trim()
  const h = norm(header)

  // Exact match
  const exact = processes.get(h)
  if (exact) return exact

  // Try without common suffixes/prefixes
  for (const [procName, procId] of processes) {
    if (procName === h) return procId
    // One contains the other (e.g. "orderpicken" matches "Orderpicken afdeling A")
    if (procName.includes(h) || h.includes(procName)) return procId
  }

  return null
}

// ── Validate parsed data (employees) ────────────────────────────────────────

function validateData(rows: Record<string, string>[]): ValidationResult {
  const valid: ValidationResult['valid'] = []
  const errors: ValidationResult['errors'] = []

  rows.forEach((row, i) => {
    const rowNum = i + 2 // +2 for header + 1-indexed
    let hasError = false

    for (const col of TEMPLATE_COLUMNS) {
      const rawVal = row[col.label]
      const strVal = rawVal != null ? String(rawVal).trim() : ''
      if (col.required && !strVal) {
        errors.push({ row: rowNum, field: col.label, message: `${col.label} is required` })
        hasError = true
      }
    }

    // Type validations
    const hours = row['Weekly Hours']
    if (hours && isNaN(Number(hours))) {
      errors.push({ row: rowNum, field: 'Weekly Hours', message: 'Must be a number' })
      hasError = true
    }

    if (!hasError) {
      valid.push({ row: rowNum, data: row })
    }
  })

  return { valid, errors }
}

// ── Validate skills data ────────────────────────────────────────────────────

function validateSkillsData(
  rows: Record<string, string>[],
  headers: string[],
  employees: { id: string; employee_number: string; first_name: string; last_name: string }[],
  processes: { id: string; name: string }[],
  pendingEmployeeNames?: string[],
): SkillsValidationResult {
  // Match on full name (first + last)
  const empMap = new Map(employees.map((e) => [`${e.first_name} ${e.last_name}`.toLowerCase(), e.id]))
  const pendingSet = new Set((pendingEmployeeNames ?? []).map((n) => n.toLowerCase()))

  // Build normalized process map for fuzzy matching
  const norm = (s: string) => s.toLowerCase().replace(/[\s_\-]+/g, ' ').trim()
  const procMap = new Map(processes.map((p) => [norm(p.name), p.id]))

  const matched: SkillsValidationResult['matched'] = []
  const errors: SkillsValidationResult['errors'] = []
  const matchedEmployeeIds = new Set<string>()
  const matchedProcessIds = new Set<string>()

  // Auto-detect name column: find first header that looks like a name field
  let nameColIdx = headers.findIndex((h) => isNameColumn(h))
  if (nameColIdx === -1) nameColIdx = 0 // fallback: first column is always the name

  // Process headers: all columns except the name column
  const processHeaders = headers.filter((_, idx) => idx !== nameColIdx)

  // Pre-resolve process columns to IDs (fuzzy match, order-independent)
  const procColumnMap = new Map<string, string>()
  const unmatchedColumns: string[] = []
  for (const header of processHeaders) {
    const processId = fuzzyMatchProcess(header, procMap)
    if (processId) {
      procColumnMap.set(header, processId)
    } else {
      unmatchedColumns.push(header)
    }
  }

  if (unmatchedColumns.length > 0 && procColumnMap.size === 0) {
    errors.push({ row: 0, message: `No process columns matched. Check that column names match your process names.` })
    return { matched, employeesMatched: 0, processesMatched: 0, errors }
  }

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const empNameRaw = row[headers[nameColIdx]!]
    const empName = empNameRaw != null ? String(empNameRaw).trim() : ''

    if (!empName) {
      errors.push({ row: rowNum, message: 'Employee Name is empty' })
      return
    }

    const employeeId = empMap.get(empName.toLowerCase())
    const isPending = !employeeId && pendingSet.has(empName.toLowerCase())
    if (!employeeId && !isPending) {
      errors.push({ row: rowNum, message: `Employee "${empName}" not found` })
      return
    }

    if (employeeId) matchedEmployeeIds.add(employeeId)

    for (const [colHeader, processId] of procColumnMap) {
      const rawVal = row[colHeader]
      const strVal = rawVal != null ? String(rawVal).trim() : ''
      if (!strVal || strVal === '0') continue

      const level = Number(strVal)
      if (isNaN(level) || !Number.isInteger(level) || level < 1 || level > 5) {
        errors.push({ row: rowNum, message: `Invalid skill level "${strVal}" for ${colHeader} (must be 1-5)` })
        continue
      }

      matchedProcessIds.add(processId)
      matched.push({
        employee_id: employeeId ?? `pending:${empName}`,
        process_id: processId,
        proficiency_level: level,
      })
    }
  })

  return {
    matched,
    employeesMatched: matchedEmployeeIds.size,
    processesMatched: matchedProcessIds.size,
    errors,
  }
}

// ── Main page — 3-step wizard ────────────────────────────────────────────────
// Step 1: Upload employees → validate (not saved yet)
// Step 2: Upload skills → validate (not saved yet)
// Step 3: Review + "Import All" → saves employees + skills together

type WizardStep = 'employees' | 'skills' | 'importing' | 'done'

export default function EmployeeImportPage() {
  const router = useRouter()
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const toast = useToast()
  const utils = trpc.useUtils()
  const bulkImport = trpc.workforce.bulkImportEmployees.useMutation()
  const bulkImportSkills = trpc.workforce.bulkImportSkills.useMutation()
  const crewsQuery = trpc.org.listCrews.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )
  const rolesQuery = trpc.org.listRoles.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )
  const processesQuery = trpc.org.listProcesses.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )
  const employeesQuery = trpc.workforce.listEmployees.useQuery(
    { site_id: activeSiteId!, limit: 1000 },
    { enabled: !!activeSiteId && !isDemo },
  )

  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<WizardStep>('employees')
  const [dragOver, setDragOver] = useState(false)
  const [empFileName, setEmpFileName] = useState('')
  const [skillsFileName, setSkillsFileName] = useState('')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [skillsValidation, setSkillsValidation] = useState<SkillsValidationResult | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [showSkillsErrors, setShowSkillsErrors] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ employees: number; skills: number } | null>(null)

  // Employee names extracted from the uploaded file (for skills template + matching)
  const employeeNames = validation?.valid.map((v) => {
    const first = String(v.data['First Name'] ?? '').trim()
    const last = String(v.data['Last Name'] ?? '').trim()
    return `${first} ${last}`
  }) ?? []

  const hasProcesses = (processesQuery.data ?? []).length > 0

  // ── Read file as ArrayBuffer ───────────────────────────────────────────────
  const readFile = (file: File) => new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as ArrayBuffer)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })

  // ── Process employees file ─────────────────────────────────────────────────
  const processEmployeesFile = useCallback(async (file: File) => {
    setEmpFileName(file.name)
    setValidation(null)
    setShowErrors(false)
    setImportError(null)

    try {
      const buffer = await readFile(file)
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
      const empSheet = wb.Sheets['Employees'] ?? wb.Sheets[wb.SheetNames[0]!]
      if (!empSheet) throw new Error('No Employees sheet found')

      const empRows = XLSX.utils.sheet_to_json<Record<string, string>>(empSheet, { defval: '' })
      const dataRows = empRows.filter((r) => {
        const first = Object.values(r)[0]?.toString().toLowerCase() ?? ''
        return first !== 'required' && first !== 'optional'
      })

      if (dataRows.length === 0) {
        setValidation({ valid: [], errors: [{ row: 0, field: 'File', message: 'No data rows found. Fill in the template and try again.' }] })
        return
      }

      setValidation(validateData(dataRows))
    } catch (err) {
      setValidation({ valid: [], errors: [{ row: 0, field: 'File', message: err instanceof Error ? err.message : 'Could not read file' }] })
    }
  }, [])

  // ── Process skills file ────────────────────────────────────────────────────
  const processSkillsFile = useCallback(async (file: File) => {
    setSkillsFileName(file.name)
    setSkillsValidation(null)
    setShowSkillsErrors(false)
    setImportError(null)

    try {
      const buffer = await readFile(file)
      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })
      const skillSheet = wb.Sheets['Skills'] ?? wb.Sheets[wb.SheetNames[0]!]
      if (!skillSheet) throw new Error('No Skills sheet found')

      const processes = (processesQuery.data ?? []) as { id: string; name: string }[]
      if (processes.length === 0) {
        setSkillsValidation({ matched: [], employeesMatched: 0, processesMatched: 0, errors: [{ row: 0, message: 'No processes found. Add processes first.' }] })
        return
      }

      const rawData = XLSX.utils.sheet_to_json<Record<string, string>>(skillSheet, { defval: '' })
      if (rawData.length === 0) {
        setSkillsValidation({ matched: [], employeesMatched: 0, processesMatched: 0, errors: [{ row: 0, message: 'No data rows found in Skills sheet.' }] })
        return
      }

      const headers = Object.keys(rawData[0]!)
      const existingEmployees = (employeesQuery.data?.items ?? []) as { id: string; employee_number: string; first_name: string; last_name: string }[]
      setSkillsValidation(validateSkillsData(rawData, headers, existingEmployees, processes, employeeNames))
    } catch (err) {
      setSkillsValidation({ matched: [], employeesMatched: 0, processesMatched: 0, errors: [{ row: 0, message: err instanceof Error ? err.message : 'Could not read file' }] })
    }
  }, [employeesQuery.data, processesQuery.data, employeeNames])

  // ── File handlers (route to correct processor based on step) ───────────────
  const activeProcessor = step === 'skills' ? processSkillsFile : processEmployeesFile

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) activeProcessor(file)
  }, [activeProcessor])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) activeProcessor(file)
    if (e.target) e.target.value = '' // allow re-selecting same file
  }, [activeProcessor])

  // ── Import all (employees + skills) ────────────────────────────────────────
  const handleImportAll = async () => {
    if (isDemo) { toast.showError('Dit is een demo — start je eigen omgeving om wijzigingen te maken'); return }
    if (!validation || !activeSiteId) return
    setStep('importing')
    setImportError(null)

    try {
      const crews = crewsQuery.data ?? []
      const roles = rolesQuery.data ?? []

      // Step 1: Import employees
      const employees = validation.valid.map((v) => {
        const d = v.data
        const roleValue = String(d['Role'] ?? '').trim()
        const crewValue = String(d['Crew'] ?? '').trim()
        return {
          first_name: String(d['First Name'] ?? '').trim(),
          last_name: String(d['Last Name'] ?? '').trim(),
          department: String(d['Department'] ?? '').trim() || undefined,
          weekly_hours_contracted: Number(d['Weekly Hours']),
          job_role_id: roleValue ? matchRole(roleValue, roles) ?? undefined : undefined,
          crew_id: crewValue ? matchCrew(crewValue, crews) ?? undefined : undefined,
        }
      })

      await bulkImport.mutateAsync({ site_id: activeSiteId, employees })
      let skillCount = 0

      // Step 2: Import skills (if any)
      if (skillsValidation && skillsValidation.matched.length > 0) {
        // Invalidate cache first, then fetch fresh data to get newly created employee IDs
        await utils.workforce.listEmployees.invalidate()
        const freshEmployees = await utils.workforce.listEmployees.fetch({ site_id: activeSiteId, limit: 2000 })
        const freshEmpMap = new Map(
          ((freshEmployees?.items ?? []) as { id: string; first_name: string; last_name: string }[])
            .map((e) => [`${e.first_name} ${e.last_name}`.toLowerCase(), e.id])
        )

        const resolvedSkills = skillsValidation.matched
          .map((s) => {
            let empId = s.employee_id
            if (empId.startsWith('pending:')) {
              empId = freshEmpMap.get(empId.replace('pending:', '').toLowerCase()) ?? ''
            }
            return empId ? { employee_id: empId, process_id: s.process_id, proficiency_level: s.proficiency_level } : null
          })
          .filter((s): s is NonNullable<typeof s> => s !== null)

        if (resolvedSkills.length > 0) {
          await bulkImportSkills.mutateAsync({ skills: resolvedSkills })
          skillCount = resolvedSkills.length
        }
      }

      setImportResult({ employees: validation.valid.length, skills: skillCount })
      setStep('done')
      utils.workforce.listEmployees.invalidate()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed')
      setStep('skills') // go back so they can retry
    }
  }

  // ── Step indicator ─────────────────────────────────────────────────────────
  const steps = [
    { id: 'employees' as const, label: 'Employees', done: !!validation && validation.valid.length > 0 },
    { id: 'skills' as const, label: 'Skills', done: !!skillsValidation && skillsValidation.matched.length > 0 },
  ]

  // ── Upload zone (reused for both steps) ────────────────────────────────────
  const fileName = step === 'skills' ? skillsFileName : empFileName
  const UploadZone = (
    <motion.div
      animate={dragOver ? { scale: 1.01 } : { scale: 1 }}
      transition={snappy}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => fileRef.current?.click()}
      style={{
        border: `2px dashed ${dragOver ? 'var(--primary)' : 'rgba(99,102,241,0.15)'}`,
        borderRadius: 'var(--radius-lg)', padding: '28px 20px', textAlign: 'center', cursor: 'pointer',
        background: dragOver ? 'rgba(99,102,241,0.04)' : 'rgba(99,102,241,0.01)', transition: 'all 0.25s',
      }}
    >
      <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} style={{ display: 'none' }} />
      <Upload size={22} style={{ color: 'var(--primary)', margin: '0 auto 10px', display: 'block' }} />
      {fileName ? (
        <>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>{fileName}</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--primary)', marginTop: 4, fontWeight: 500 }}>Click to replace</p>
        </>
      ) : (
        <>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--foreground)', margin: 0 }}>Drop your Excel file here</p>
          <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', marginTop: 4 }}>or click to browse &middot; .xlsx, .xls</p>
        </>
      )}
    </motion.div>
  )

  // ── Validation summary component ───────────────────────────────────────────
  const ValidationSummary = ({ v, sv }: { v: ValidationResult | null; sv: SkillsValidationResult | null }) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {v && v.valid.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Check size={14} style={{ color: 'var(--success)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--success)' }}>
            {v.valid.length} employees valid
          </span>
        </div>
      )}
      {v && v.errors.length > 0 && (
        <button onClick={() => setShowErrors(!showErrors)} className="flex items-center gap-1.5" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <AlertCircle size={14} style={{ color: 'var(--destructive)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--destructive)' }}>{v.errors.length} employee errors</span>
        </button>
      )}
      {showErrors && v && v.errors.length > 0 && (
        <div style={{ maxHeight: 100, overflowY: 'auto', backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', padding: '6px 10px' }}>
          {v.errors.slice(0, 20).map((err, i) => (
            <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--destructive)', padding: '2px 0' }}>Row {err.row}: {err.field} — {err.message}</div>
          ))}
        </div>
      )}
      {sv && sv.matched.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Check size={14} style={{ color: 'var(--success)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--success)' }}>
            {sv.matched.length} skills voor {sv.employeesMatched} medewerkers
          </span>
        </div>
      )}
      {sv && sv.errors.length > 0 && (
        <button onClick={() => setShowSkillsErrors(!showSkillsErrors)} className="flex items-center gap-1.5" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <AlertCircle size={14} style={{ color: 'var(--destructive)' }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--destructive)' }}>{sv.errors.length} skill errors</span>
        </button>
      )}
      {showSkillsErrors && sv && sv.errors.length > 0 && (
        <div style={{ maxHeight: 100, overflowY: 'auto', backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 'var(--radius-sm)', padding: '6px 10px' }}>
          {sv.errors.slice(0, 20).map((err, i) => (
            <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--destructive)', padding: '2px 0' }}>Row {err.row}: {err.message}</div>
          ))}
        </div>
      )}
    </div>
  )

  const btnStyle = (primary: boolean, disabled?: boolean) => ({
    padding: '10px 24px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-body)' as const,
    fontSize: '14px', fontWeight: 600 as const, cursor: disabled ? 'not-allowed' as const : 'pointer' as const,
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? (disabled ? 'var(--muted)' : 'linear-gradient(135deg, var(--primary), #8B5CF6)') : 'var(--card)',
    color: primary ? (disabled ? 'var(--muted-foreground)' : '#fff') : 'var(--foreground)',
    opacity: disabled ? 0.6 : 1,
  })

  return (
    <div className="fixed inset-0 flex items-center justify-center" style={{ zIndex: 'var(--z-modal)', backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={bouncy}
        style={{ width: '100%', maxWidth: 640, backgroundColor: 'var(--card)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--elevation-4)', overflow: 'hidden' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileSpreadsheet size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>Import Employees</h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', margin: 0 }}>
                {step === 'employees' && 'Stap 1 van 2 — Upload medewerkers'}
                {step === 'skills' && 'Stap 2 van 2 — Upload skills'}
                {step === 'importing' && 'Importeren...'}
                {step === 'done' && 'Klaar!'}
              </p>
            </div>
          </div>
          <button onClick={() => router.push('/dashboard/employees')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted-foreground)' }}>
            <X size={18} />
          </button>
        </div>

        {/* Step indicator */}
        {step !== 'done' && step !== 'importing' && (
          <div className="flex items-center px-6 pt-4 gap-0">
            {steps.map((s, idx) => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', flex: idx < steps.length - 1 ? 1 : undefined }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '2px solid', transition: 'all 0.3s',
                    borderColor: s.done ? 'var(--success)' : s.id === step ? 'var(--primary)' : 'var(--border)',
                    backgroundColor: s.done ? 'var(--success)' : s.id === step ? 'var(--primary)' : 'transparent',
                  }}>
                    {s.done ? <Check size={13} color="white" /> : (
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, color: s.id === step ? 'white' : 'var(--muted-foreground)' }}>{idx + 1}</span>
                    )}
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: s.id === step ? 700 : 500, color: s.id === step ? 'var(--primary)' : s.done ? 'var(--success)' : 'var(--muted-foreground)' }}>{s.label}</span>
                </div>
                {idx < steps.length - 1 && <div style={{ flex: 1, height: 2, margin: '0 10px', marginBottom: 18, backgroundColor: s.done ? 'var(--success)' : 'var(--border)', transition: 'all 0.3s' }} />}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="px-6 py-5" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* ── STEP: EMPLOYEES ────────────────────────────────────────── */}
          {step === 'employees' && (
            <>
              {/* Download template */}
              <motion.button
                variants={scalePress} whileTap="press" whileHover={{ y: -1 }} transition={snappy}
                onClick={() => {
                  const emps = (employeesQuery.data?.items ?? []) as { employee_number: string; first_name: string; last_name: string }[]
                  downloadTemplate(crewsQuery.data ?? [], (processesQuery.data ?? []) as { name: string }[], emps)
                }}
                className="flex items-center gap-3 w-full group"
                style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(99,102,241,0.12)', background: 'rgba(99,102,241,0.03)', cursor: 'pointer' }}
              >
                <Download size={18} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                <div style={{ textAlign: 'left', flex: 1 }}>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>Download Excel Template</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)', marginTop: 1 }}>Employees + Skills in one file</div>
                </div>
              </motion.button>

              {UploadZone}

              {validation && <ValidationSummary v={validation} sv={null} />}

              {/* Next button */}
              <div className="flex justify-between">
                <motion.button variants={scalePress} whileTap="press" onClick={() => router.push('/dashboard/employees')} style={btnStyle(false)}>Annuleren</motion.button>
                <motion.button
                  variants={scalePress} whileTap="press"
                  disabled={!validation || validation.valid.length === 0}
                  onClick={() => setStep('skills')}
                  style={btnStyle(true, !validation || validation.valid.length === 0)}
                >
                  Volgende →
                </motion.button>
              </div>
            </>
          )}

          {/* ── STEP: SKILLS ──────────────────────────────────────────── */}
          {step === 'skills' && (
            <>
              {/* Employee summary chip */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <Check size={14} style={{ color: 'var(--success)' }} />
                <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--success)' }}>
                  {validation?.valid.length} medewerkers klaar
                </span>
              </div>

              {/* Download skills template */}
              {hasProcesses && (
                <motion.button
                  variants={scalePress} whileTap="press" whileHover={{ y: -1 }} transition={snappy}
                  onClick={() => downloadSkillsTemplate(employeeNames, (processesQuery.data ?? []) as { name: string }[])}
                  className="flex items-center gap-3 w-full"
                  style={{ padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1.5px solid rgba(245,158,11,0.2)', background: 'rgba(245,158,11,0.04)', cursor: 'pointer' }}
                >
                  <Download size={18} style={{ color: '#F59E0B', flexShrink: 0 }} />
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>Download Skills Template</div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)', marginTop: 1 }}>Pre-filled with your {employeeNames.length} medewerkers + {(processesQuery.data ?? []).length} processen</div>
                  </div>
                </motion.button>
              )}

              {UploadZone}

              {skillsValidation && <ValidationSummary v={null} sv={skillsValidation} />}

              {importError && (
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', borderRadius: 'var(--radius-sm)', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                  <AlertCircle size={14} style={{ color: 'var(--destructive)', marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--destructive)' }}>{importError}</span>
                </div>
              )}

              {/* Footer buttons */}
              <div className="flex justify-between">
                <motion.button variants={scalePress} whileTap="press" onClick={() => setStep('employees')} style={btnStyle(false)}>← Terug</motion.button>
                <div className="flex gap-2">
                  <motion.button
                    variants={scalePress} whileTap="press"
                    onClick={handleImportAll}
                    disabled={!validation || validation.valid.length === 0}
                    style={btnStyle(true, !validation || validation.valid.length === 0)}
                  >
                    {skillsValidation && skillsValidation.matched.length > 0
                      ? `Import ${validation?.valid.length} medewerkers + ${skillsValidation.matched.length} skills`
                      : `Import ${validation?.valid.length} medewerkers`}
                  </motion.button>
                </div>
              </div>
            </>
          )}

          {/* ── STEP: IMPORTING ───────────────────────────────────────── */}
          {step === 'importing' && (
            <div className="text-center py-12">
              <svg className="animate-spin mx-auto mb-4" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" /><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--foreground)' }}>Importeren...</p>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', marginTop: 4 }}>
                {validation?.valid.length} medewerkers{skillsValidation && skillsValidation.matched.length > 0 ? ` + ${skillsValidation.matched.length} skills` : ''}
              </p>
            </div>
          )}

          {/* ── STEP: DONE ────────────────────────────────────────────── */}
          {step === 'done' && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={wobbly} className="text-center py-8">
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ ...wobbly, delay: 0.15 }}
                style={{ width: 64, height: 64, borderRadius: 'var(--radius-lg)', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}
              >
                <Check size={28} style={{ color: 'var(--success)' }} />
              </motion.div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--foreground)' }}>Import Complete</h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--muted-foreground)', marginTop: 8 }}>
                {importResult && importResult.employees > 0 && `${importResult.employees} medewerkers`}
                {importResult && importResult.skills > 0 && ` + ${importResult.skills} skills`}
                {' geïmporteerd'}
              </p>
              <motion.button
                variants={scalePress} whileTap="press"
                onClick={() => router.push('/dashboard/employees')}
                style={{ ...btnStyle(true), marginTop: 24 }}
              >
                Bekijk medewerkers
              </motion.button>
            </motion.div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
