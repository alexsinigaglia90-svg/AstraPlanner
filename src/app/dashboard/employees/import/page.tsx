'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Download, Upload, FileSpreadsheet, Check, AlertCircle, X } from 'lucide-react'
import { bouncy, snappy, wobbly, gentle, scalePress } from '@/lib/motion'
import { trpc } from '@/lib/trpc/client'
import { useSiteStore } from '@/stores/site-store'
import { useDemoStore } from '@/hooks/use-demo'
import { demoShifts, demoEmployees, demoProcesses } from '@/components/onboarding/demo-seed'
import { matchShift, matchCrew } from '@/lib/shift-matcher'
import * as XLSX from 'xlsx'

// ── Dataloader column definitions ───────────────────────────────────────────
// These match what the solver needs (no skills — those are graded individually)

const TEMPLATE_COLUMNS = [
  { key: 'employee_number', label: 'Employee Number', example: 'EMP-001', required: true },
  { key: 'first_name', label: 'First Name', example: 'Lars', required: true },
  { key: 'last_name', label: 'Last Name', example: 'van der Berg', required: true },
  { key: 'department', label: 'Department', example: 'Operations', required: true },
  { key: 'contract_type', label: 'Contract Type', example: 'full_time', required: true },
  { key: 'weekly_hours', label: 'Weekly Hours', example: '40', required: true },
  { key: 'hourly_rate', label: 'Hourly Rate (\u20AC)', example: '22.50', required: true },
  { key: 'shift', label: 'Shift', example: 'Day Shift', required: false },
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
  shifts: { name: string }[],
  crews: { name: string }[],
  processes: { name: string }[],
  employees: { employee_number: string; first_name: string; last_name: string }[],
) {
  const columns = TEMPLATE_COLUMNS.map((c) => {
    if (c.key === 'shift' && shifts.length > 0) {
      return { ...c, example: shifts[0]!.name }
    }
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
    const skillHeaders = ['Employee Number', ...processes.map((p) => p.name)]
    const skillExamples = employees.length > 0
      ? employees.slice(0, 3).map((emp) => [
          emp.employee_number,
          ...processes.map(() => ''),
        ])
      : [['EMP-001', ...processes.map(() => '')]]
    const wsSkills = XLSX.utils.aoa_to_sheet([skillHeaders, ...skillExamples])
    wsSkills['!cols'] = skillHeaders.map((h) => ({ wch: Math.max(h.length + 2, 16) }))
    XLSX.utils.book_append_sheet(wb, wsSkills, 'Skills')
  }

  // Sheet 3: Reference
  const refRows: string[][] = [
    ['Available Shifts', 'Available Crews', 'Instructions'],
    ['', '', 'Fill Sheet 1 (Employees) with employee data.'],
    ['', '', 'Fill Sheet 2 (Skills) with skill levels 1-5.'],
    ['', '', '1=Beginner, 2=Basic, 3=Intermediate, 4=Advanced, 5=Expert'],
    ['', '', 'Leave skill cells empty or 0 to skip.'],
  ]
  const maxRows = Math.max(shifts.length, crews.length, 1)
  for (let i = 0; i < maxRows; i++) {
    if (i < refRows.length - 1) {
      refRows[i + 1]![0] = shifts[i]?.name ?? ''
      refRows[i + 1]![1] = crews[i]?.name ?? ''
    } else {
      refRows.push([shifts[i]?.name ?? '', crews[i]?.name ?? '', ''])
    }
  }
  const wsRef = XLSX.utils.aoa_to_sheet(refRows)
  wsRef['!cols'] = [{ wch: 25 }, { wch: 25 }, { wch: 55 }]
  XLSX.utils.book_append_sheet(wb, wsRef, 'Reference')

  XLSX.writeFile(wb, 'AstraPlanner_Import_Template.xlsx')
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
    const rate = row['Hourly Rate (\u20AC)']
    if (rate && isNaN(Number(rate))) {
      errors.push({ row: rowNum, field: 'Hourly Rate (\u20AC)', message: 'Must be a number' })
      hasError = true
    }

    const validContractTypes = ['full_time', 'part_time', 'temporary', 'seasonal', 'contractor']
    const ct = row['Contract Type'] != null ? String(row['Contract Type']).trim().toLowerCase() : ''
    if (ct && !validContractTypes.includes(ct)) {
      errors.push({ row: rowNum, field: 'Contract Type', message: `Must be one of: ${validContractTypes.join(', ')}` })
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
  employees: { id: string; employee_number: string }[],
  processes: { id: string; name: string }[],
  pendingEmployeeNumbers?: string[],
): SkillsValidationResult {
  const empMap = new Map(employees.map((e) => [e.employee_number.toLowerCase(), e.id]))
  // Also include employee numbers from the Employees sheet that will be created
  const pendingSet = new Set((pendingEmployeeNumbers ?? []).map((n) => n.toLowerCase()))
  const procMap = new Map(processes.map((p) => [p.name.toLowerCase(), p.id]))

  const matched: SkillsValidationResult['matched'] = []
  const errors: SkillsValidationResult['errors'] = []
  const matchedEmployeeIds = new Set<string>()
  const matchedProcessIds = new Set<string>()

  // Process headers are all columns after the first (Employee Number)
  const processHeaders = headers.slice(1)

  rows.forEach((row, i) => {
    const rowNum = i + 2
    const empNumRaw = row[headers[0]!]
    const empNum = empNumRaw != null ? String(empNumRaw).trim() : ''

    if (!empNum) {
      errors.push({ row: rowNum, message: 'Employee Number is empty' })
      return
    }

    const employeeId = empMap.get(empNum.toLowerCase())
    const isPending = !employeeId && pendingSet.has(empNum.toLowerCase())
    if (!employeeId && !isPending) {
      errors.push({ row: rowNum, message: `Employee "${empNum}" not found` })
      return
    }

    if (employeeId) matchedEmployeeIds.add(employeeId)

    for (const procHeader of processHeaders) {
      const rawVal = row[procHeader]
      const strVal = rawVal != null ? String(rawVal).trim() : ''
      if (!strVal || strVal === '0') continue

      const level = Number(strVal)
      if (isNaN(level) || !Number.isInteger(level) || level < 1 || level > 5) {
        errors.push({ row: rowNum, message: `Invalid skill level "${strVal}" for ${procHeader} (must be 1-5)` })
        continue
      }

      const processId = procMap.get(procHeader.toLowerCase())
      if (!processId) {
        errors.push({ row: rowNum, message: `Process "${procHeader}" not found` })
        continue
      }

      matchedProcessIds.add(processId)
      // Use employee_id if known, or store employee_number for pending resolution
      matched.push({
        employee_id: employeeId ?? `pending:${empNum}`,
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

// ── Main page ───────────────────────────────────────────────────────────────

export default function EmployeeImportPage() {
  const router = useRouter()
  const { activeSiteId } = useSiteStore()
  const isDemo = useDemoStore((s) => s.isDemo)
  const utils = trpc.useUtils()
  const bulkImport = trpc.workforce.bulkImportEmployees.useMutation()
  const bulkImportSkills = trpc.workforce.bulkImportSkills.useMutation()
  const shiftsQuery = trpc.org.listShifts.useQuery(
    { site_id: activeSiteId! },
    { enabled: !!activeSiteId && !isDemo },
  )
  const crewsQuery = trpc.org.listCrews.useQuery(
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

  // ── Combined import state ──────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null)
  const [state, setState] = useState<ImportState>('ready')
  const [dragOver, setDragOver] = useState(false)
  const [fileName, setFileName] = useState('')
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [skillsValidation, setSkillsValidation] = useState<SkillsValidationResult | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [showSkillsErrors, setShowSkillsErrors] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<{ employees: number; skills: number } | null>(null)

  // ── Combined file processing ───────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setFileName(file.name)
    setState('validating')
    setValidation(null)
    setSkillsValidation(null)
    setImportError(null)
    setImportResult(null)
    setShowErrors(false)
    setShowSkillsErrors(false)

    try {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.onerror = () => reject(new Error('Failed to read file'))
        reader.readAsArrayBuffer(file)
      })

      const wb = XLSX.read(new Uint8Array(buffer), { type: 'array' })

      // ── Process Sheet 1: Employees ──────────────────────────────────────
      const empSheet = wb.Sheets['Employees'] ?? wb.Sheets[wb.SheetNames[0]!]
      if (!empSheet) throw new Error('No Employees sheet found')

      const empRows = XLSX.utils.sheet_to_json<Record<string, string>>(empSheet, { defval: '' })
      const dataRows = empRows.filter((r) => {
        const vals = Object.values(r)
        const first = vals[0]?.toString().toLowerCase() ?? ''
        return first !== 'required' && first !== 'optional'
      })

      if (dataRows.length === 0) {
        setValidation({ valid: [], errors: [{ row: 0, field: 'File', message: 'No data rows found in Employees sheet. Fill in the template and try again.' }] })
        setState('error')
        return
      }

      const empResult = validateData(dataRows)
      setValidation(empResult)

      // ── Process Sheet 2: Skills (if present) ───────────────────────────
      const skillSheet = wb.Sheets['Skills']
      if (skillSheet) {
        const employees = (employeesQuery.data?.items ?? []) as { id: string; employee_number: string }[]
        const processes = (processesQuery.data ?? []) as { id: string; name: string }[]

        if (employees.length === 0 && processes.length === 0) {
          // No employees/processes yet — skills will be imported after employees
          setSkillsValidation({
            matched: [],
            employeesMatched: 0,
            processesMatched: 0,
            errors: [{ row: 0, message: 'Skills sheet found but no employees/processes exist yet. Skills will be skipped — import employees first, then re-upload to import skills.' }],
          })
        } else if (processes.length === 0) {
          setSkillsValidation({
            matched: [],
            employeesMatched: 0,
            processesMatched: 0,
            errors: [{ row: 0, message: 'No processes found for this site. Add processes first to import skills.' }],
          })
        } else {
          const rawData = XLSX.utils.sheet_to_json<Record<string, string>>(skillSheet, { defval: '' })
          if (rawData.length > 0) {
            const headers = Object.keys(rawData[0]!)
            // Pass employee numbers from the Employees sheet so pending imports are not flagged as errors
            const pendingEmpNums = empResult.valid.map((v) => String(v.data['Employee Number'] ?? '').trim()).filter(Boolean)
            const skillResult = validateSkillsData(rawData, headers, employees, processes, pendingEmpNums)
            setSkillsValidation(skillResult)
          }
        }
      }

      setState(empResult.valid.length > 0 ? 'ready' : 'error')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read file'
      setValidation({ valid: [], errors: [{ row: 0, field: 'File', message: msg }] })
      setState('error')
    }
  }, [employeesQuery.data, processesQuery.data])

  // ── Drag/drop handlers ─────────────────────────────────────────────────────
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) processFile(file)
  }, [processFile])

  // ── Combined import ────────────────────────────────────────────────────────
  const handleImport = async () => {
    if (isDemo) { window.alert('Dit is een demo — start je eigen omgeving om wijzigingen te maken'); return }
    if (!validation || !activeSiteId) return
    setState('importing')
    setImportError(null)

    try {
      const shifts = shiftsQuery.data ?? []
      const crews = crewsQuery.data ?? []

      // Step 1: Import employees
      const employees = validation.valid.map((v) => {
        const d = v.data
        const shiftValue = String(d['Shift'] ?? '').trim()
        const crewValue = String(d['Crew'] ?? '').trim()

        return {
          employee_number: String(d['Employee Number'] ?? '').trim(),
          first_name: String(d['First Name'] ?? '').trim(),
          last_name: String(d['Last Name'] ?? '').trim(),
          department: String(d['Department'] ?? '').trim() || undefined,
          contract_type: String(d['Contract Type'] ?? '').trim().toLowerCase() as
            'full_time' | 'part_time' | 'temporary' | 'seasonal' | 'contractor',
          weekly_hours_contracted: Number(d['Weekly Hours']),
          hourly_rate: Number(d['Hourly Rate (\u20AC)']),
          shift_id: shiftValue ? matchShift(shiftValue, shifts) ?? undefined : undefined,
          crew_id: crewValue ? matchCrew(crewValue, crews) ?? undefined : undefined,
        }
      })

      await bulkImport.mutateAsync({ site_id: activeSiteId, employees })
      let skillCount = 0

      // Step 2: Import skills (if any) — resolve pending employee IDs first
      if (skillsValidation && skillsValidation.matched.length > 0) {
        // Fetch fresh employee list to get IDs for newly created employees
        const freshEmployees = await utils.workforce.listEmployees.fetch({ site_id: activeSiteId, limit: 1000 })
        const freshEmpMap = new Map(
          ((freshEmployees?.items ?? []) as { id: string; employee_number: string }[])
            .map((e) => [e.employee_number.toLowerCase(), e.id])
        )

        // Resolve pending:EMP-XXX to actual IDs
        const resolvedSkills = skillsValidation.matched
          .map((s) => {
            let empId = s.employee_id
            if (empId.startsWith('pending:')) {
              const empNum = empId.replace('pending:', '').toLowerCase()
              empId = freshEmpMap.get(empNum) ?? ''
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
      setState('done')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      setImportError(msg)
      setState('error')
    }
  }

  return (
    <div className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 'var(--z-modal)', backgroundColor: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(4px)' }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={bouncy}
        style={{
          width: '100%', maxWidth: 640,
          backgroundColor: 'var(--card)', borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--elevation-4)', overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4"
          style={{ borderBottom: '1px solid var(--border)' }}
        >
          <div className="flex items-center gap-3">
            <div style={{
              width: 36, height: 36, borderRadius: 'var(--radius-sm)',
              backgroundColor: 'rgba(99,102,241,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <FileSpreadsheet size={18} style={{ color: 'var(--primary)' }} />
            </div>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: 700, color: 'var(--foreground)', margin: 0 }}>
                Import Employees
              </h2>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', margin: 0 }}>
                Download template, fill in your data, upload
              </p>
            </div>
          </div>
          <button onClick={() => router.push('/dashboard/employees')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--muted-foreground)' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {state === 'done' ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={wobbly}
              className="text-center py-8"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...wobbly, delay: 0.15 }}
                style={{
                  width: 64, height: 64, borderRadius: 'var(--radius-lg)',
                  backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '0 auto 16px',
                }}
              >
                <Check size={28} style={{ color: 'var(--success)' }} />
              </motion.div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: 700, color: 'var(--foreground)' }}>
                Import Complete
              </h3>
              <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', color: 'var(--muted-foreground)', marginTop: 8 }}>
                {importResult?.employees} employees imported
                {importResult && importResult.skills > 0 && `, ${importResult.skills} skills updated`}
              </p>
              <motion.button
                variants={scalePress} whileTap="press"
                onClick={() => router.push('/dashboard/employees')}
                style={{
                  marginTop: 24, padding: '10px 24px', borderRadius: 'var(--radius-sm)',
                  background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                  color: '#fff', border: 'none', fontFamily: 'var(--font-body)',
                  fontSize: '14px', fontWeight: 600, cursor: 'pointer',
                }}
              >
                View Employees
              </motion.button>
            </motion.div>
          ) : (
            <>
              {/* Step 1: Download template */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div style={{
                    width: 24, height: 24, borderRadius: 'var(--radius-full)',
                    background: 'linear-gradient(135deg, var(--primary), #8B5CF6)', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700,
                    boxShadow: '0 2px 8px rgba(99,102,241,0.25)',
                  }}>1</div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--foreground)' }}>
                    Download the template
                  </span>
                </div>
                <motion.button
                  variants={scalePress} whileTap="press"
                  whileHover={{ y: -1 }}
                  transition={snappy}
                  onClick={() => {
                    const emps = (employeesQuery.data?.items ?? []) as { employee_number: string; first_name: string; last_name: string }[]
                    const procs = (processesQuery.data ?? []) as { name: string }[]
                    downloadTemplate(shiftsQuery.data ?? [], crewsQuery.data ?? [], procs, emps)
                  }}
                  className="flex items-center gap-3 w-full group"
                  style={{
                    padding: '14px 18px', borderRadius: 'var(--radius-md)',
                    border: '1.5px solid rgba(99,102,241,0.12)',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.04), rgba(139,92,246,0.02))',
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.25)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99,102,241,0.08)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.12)'; e.currentTarget.style.boxShadow = 'none' }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 'var(--radius-sm)',
                    background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(139,92,246,0.08))',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Download size={18} style={{ color: 'var(--primary)' }} />
                  </div>
                  <div style={{ textAlign: 'left', flex: 1 }}>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '13px', fontWeight: 600, color: 'var(--foreground)' }}>
                      Download Excel Template
                    </div>
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)', marginTop: 2 }}>
                      Employees + Skills sheets in one file
                    </div>
                  </div>
                  <div style={{ color: 'var(--muted-foreground)', transition: 'transform 0.15s' }} className="group-hover:translate-y-0.5">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
                    </svg>
                  </div>
                </motion.button>
              </div>

              {/* Step 2: Upload filled template */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div style={{
                    width: 24, height: 24, borderRadius: 'var(--radius-full)',
                    background: validation
                      ? 'linear-gradient(135deg, var(--success), #059669)'
                      : 'linear-gradient(135deg, var(--muted), var(--muted))',
                    color: validation ? '#fff' : 'var(--muted-foreground)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: 'var(--font-body)', fontSize: '11px', fontWeight: 700,
                    boxShadow: validation ? '0 2px 8px rgba(16,185,129,0.25)' : 'none',
                    transition: 'all 0.3s',
                  }}>
                    {validation ? <Check size={13} /> : '2'}
                  </div>
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--foreground)' }}>
                    Upload your filled template
                  </span>
                </div>

                <motion.div
                  animate={dragOver ? { scale: 1.01 } : { scale: 1 }}
                  transition={snappy}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? 'var(--primary)' : 'rgba(99,102,241,0.15)'}`,
                    borderRadius: 'var(--radius-lg)',
                    padding: '32px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    background: dragOver
                      ? 'linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.03))'
                      : 'linear-gradient(135deg, rgba(99,102,241,0.02), transparent)',
                    transition: 'all 0.25s',
                  }}
                >
                  <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileSelect} style={{ display: 'none' }} />
                  <div style={{
                    width: 48, height: 48, borderRadius: 'var(--radius-md)',
                    background: 'rgba(99,102,241,0.08)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                  }}>
                    <Upload size={22} style={{ color: 'var(--primary)' }} />
                  </div>
                  {fileName ? (
                    <>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 600, color: 'var(--foreground)' }}>
                        {fileName}
                      </p>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--primary)', marginTop: 4, fontWeight: 500 }}>
                        Click to replace
                      </p>
                    </>
                  ) : (
                    <>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '14px', fontWeight: 500, color: 'var(--foreground)' }}>
                        Drop your Excel file here
                      </p>
                      <p style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'var(--muted-foreground)', marginTop: 4 }}>
                        or click to browse &middot; .xlsx, .xls, .csv
                      </p>
                    </>
                  )}
                </motion.div>
              </div>

              {/* Validation results — employees */}
              <AnimatePresence>
                {validation && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={bouncy}
                  >
                    {/* Employee validation summary */}
                    <div className="flex items-center gap-4 mb-2">
                      {validation.valid.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Check size={14} style={{ color: 'var(--success)' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--success)' }}>
                            {validation.valid.length} employees valid
                          </span>
                        </div>
                      )}
                      {validation.errors.length > 0 && (
                        <button onClick={() => setShowErrors(!showErrors)}
                          className="flex items-center gap-1.5"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                        >
                          <AlertCircle size={14} style={{ color: 'var(--destructive)' }} />
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--destructive)' }}>
                            {validation.errors.length} errors
                          </span>
                        </button>
                      )}
                    </div>

                    {/* Skills validation summary */}
                    {skillsValidation && (
                      <div className="flex items-center gap-4 mb-3 flex-wrap">
                        {skillsValidation.matched.length > 0 && (
                          <>
                            <div className="flex items-center gap-1.5">
                              <Check size={14} style={{ color: 'var(--success)' }} />
                              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--success)' }}>
                                {skillsValidation.matched.length} skills across {skillsValidation.employeesMatched} employees
                              </span>
                            </div>
                          </>
                        )}
                        {skillsValidation.errors.length > 0 && (
                          <button onClick={() => setShowSkillsErrors(!showSkillsErrors)}
                            className="flex items-center gap-1.5"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                          >
                            <AlertCircle size={14} style={{ color: 'var(--destructive)' }} />
                            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--destructive)' }}>
                              {skillsValidation.errors.length} skill errors
                            </span>
                          </button>
                        )}
                      </div>
                    )}

                    {/* Employee error details */}
                    {showErrors && validation.errors.length > 0 && (
                      <div style={{
                        maxHeight: 120, overflowY: 'auto', marginBottom: 8,
                        backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)',
                        borderRadius: 'var(--radius-sm)', padding: '8px 12px',
                      }}>
                        {validation.errors.slice(0, 20).map((err, i) => (
                          <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--destructive)', padding: '2px 0' }}>
                            Row {err.row}: {err.field} — {err.message}
                          </div>
                        ))}
                        {validation.errors.length > 20 && (
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)', padding: '4px 0' }}>
                            +{validation.errors.length - 20} more errors
                          </div>
                        )}
                      </div>
                    )}

                    {/* Skills error details */}
                    {showSkillsErrors && skillsValidation && skillsValidation.errors.length > 0 && (
                      <div style={{
                        maxHeight: 120, overflowY: 'auto',
                        backgroundColor: 'rgba(239,68,68,0.04)', border: '1px solid rgba(239,68,68,0.1)',
                        borderRadius: 'var(--radius-sm)', padding: '8px 12px',
                      }}>
                        {skillsValidation.errors.slice(0, 20).map((err, i) => (
                          <div key={i} style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--destructive)', padding: '2px 0' }}>
                            Row {err.row}: {err.message}
                          </div>
                        ))}
                        {skillsValidation.errors.length > 20 && (
                          <div style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'var(--muted-foreground)', padding: '4px 0' }}>
                            +{skillsValidation.errors.length - 20} more errors
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Import error */}
              {importError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={bouncy}
                  style={{
                    padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                    backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                    display: 'flex', alignItems: 'flex-start', gap: '8px',
                  }}
                >
                  <AlertCircle size={14} style={{ color: 'var(--destructive)', marginTop: 2, flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-body)', fontSize: '13px', color: 'var(--destructive)' }}>
                    {importError}
                  </span>
                </motion.div>
              )}

              {/* Import button */}
              {validation && validation.valid.length > 0 && (
                <motion.button
                  variants={scalePress} whileTap="press"
                  onClick={handleImport}
                  disabled={state === 'importing'}
                  className="w-full flex items-center justify-center gap-2"
                  style={{
                    padding: '12px 20px', borderRadius: 'var(--radius-sm)',
                    background: 'linear-gradient(135deg, var(--primary), #8B5CF6)',
                    color: '#fff', border: 'none', fontFamily: 'var(--font-body)',
                    fontSize: '14px', fontWeight: 600,
                    cursor: state === 'importing' ? 'not-allowed' : 'pointer',
                    opacity: state === 'importing' ? 0.7 : 1,
                  }}
                >
                  {state === 'importing' ? (
                    <>
                      <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" strokeOpacity="0.3" /><path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                      </svg>
                      Importing...
                    </>
                  ) : (
                    <>
                      Import {validation.valid.length} employees
                      {skillsValidation && skillsValidation.matched.length > 0 && ` + ${skillsValidation.matched.length} skills`}
                    </>
                  )}
                </motion.button>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  )
}
