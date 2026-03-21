'use client'

import { useRouter } from 'next/navigation'
import { CSVImportWizard, FieldDefinition, ImportError } from '@/components/domain/csv-import-wizard'

// ── Employee field schema ─────────────────────────────────────────────────────

const EMPLOYEE_FIELDS: FieldDefinition[] = [
  { key: 'employee_number', label: 'Employee Number', required: true,  type: 'string' },
  { key: 'first_name',      label: 'First Name',      required: true,  type: 'string' },
  { key: 'last_name',       label: 'Last Name',       required: true,  type: 'string' },
  { key: 'email',           label: 'Email',           required: false, type: 'email'  },
  { key: 'contract_type',   label: 'Contract Type',   required: true,  type: 'string' },
  { key: 'weekly_hours_contracted', label: 'Weekly Hours', required: true, type: 'number' },
  { key: 'hourly_rate',     label: 'Hourly Rate',     required: true,  type: 'number' },
]

// ── Page ──────────────────────────────────────────────────────────────────────

export default function EmployeeImportPage() {
  const router = useRouter()

  const handleClose = () => {
    router.push('/dashboard/employees')
  }

  const handleImport = async (
    mappedRows: Record<string, string>[]
  ): Promise<{ success: number; errors: ImportError[] }> => {
    // TODO: wire up to tRPC bulk-create endpoint when available
    // For now, simulate a short delay and return a success summary
    await new Promise((resolve) => setTimeout(resolve, 1200))
    return { success: mappedRows.length, errors: [] }
  }

  return (
    <CSVImportWizard
      open
      onClose={handleClose}
      title="Import Employees"
      targetFields={EMPLOYEE_FIELDS}
      onImport={handleImport}
    />
  )
}
