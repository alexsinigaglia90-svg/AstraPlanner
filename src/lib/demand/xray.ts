import * as XLSX from 'xlsx'

export interface ColumnStat {
  index: number
  headerCandidate: string | null   // value from likely header row
  sampleValues: string[]           // up to 5 unique non-empty values
  emptyPct: number                 // % empty cells (0-100)
  numericPct: number               // % numeric cells (0-100)
  dateLikePct: number              // % date-like cells (0-100)
  uniqueCount: number
  min?: number                     // only for numeric columns
  max?: number
  avg?: number
}

export interface RowPatterns {
  firstDataRow: number | null      // first row with >40% numeric values (0-indexed)
  lastDataRow: number | null       // last such row
  suspectedTotalRows: number[]     // rows containing "totaal"/"total"/"sum"
  emptyRows: number[]              // fully empty rows (max 20)
  mergedRegions: string[]          // e.g. "A1:F1" (max 10)
}

export interface ExcelXray {
  sheetName: string
  totalRows: number
  totalCols: number
  firstRows: unknown[][]           // first 10 rows raw
  lastRows: unknown[][]            // last 5 rows raw
  columnStats: ColumnStat[]
  rowPatterns: RowPatterns
  existingProcesses: string[]
  existingDemandTypes: string[]
}

const TOTAL_KEYWORDS = /totaal|total|sum|subtotal|eindtotaal/i
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$|^wk\s?\d{1,2}$/i

function cellToString(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  return String(value)
}

function isNumeric(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return false
  const n = Number(value)
  return !isNaN(n) && isFinite(n)
}

function isDateLike(value: unknown): boolean {
  const s = cellToString(value).trim()
  if (s === '') return false
  return DATE_PATTERN.test(s)
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every(cell => cell === null || cell === undefined || cell === '')
}

function rowNumericFraction(row: unknown[], totalCols: number): { fraction: number; numericCount: number } {
  if (totalCols === 0) return { fraction: 0, numericCount: 0 }
  let count = 0
  for (const cell of row) {
    if (isNumeric(cell)) count++
  }
  return { fraction: count / totalCols, numericCount: count }
}

export function extractXray(
  wb: XLSX.WorkBook,
  sheetName: string,
  existingProcesses: string[],
  existingDemandTypes: string[] = []
): ExcelXray {
  const sheet = wb.Sheets[sheetName]
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`)
  }

  // Parse to raw 2D array
  const raw: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]

  const totalRows = raw.length
  // Determine totalCols as the max column count across all rows
  let totalCols = 0
  for (const row of raw) {
    if (row.length > totalCols) totalCols = row.length
  }

  // Normalize all rows to totalCols length
  const rows: unknown[][] = raw.map(row => {
    const padded = [...row]
    while (padded.length < totalCols) padded.push('')
    return padded
  })

  // First 10 and last 5 rows (raw, not padded)
  const firstRows: unknown[][] = raw.slice(0, 10)
  const lastRows: unknown[][] = raw.slice(Math.max(0, totalRows - 5))

  // Scan rows for empty rows, total rows
  const emptyRowsAll: number[] = []
  const suspectedTotalRows: number[] = []

  let firstDataRow: number | null = null
  let lastDataRow: number | null = null

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? []

    if (isRowEmpty(row)) {
      emptyRowsAll.push(i)
      continue
    }

    // Check for total keywords
    const hasTotalKeyword = row.some(cell => {
      const s = cellToString(cell).trim()
      return s !== '' && TOTAL_KEYWORDS.test(s)
    })
    if (hasTotalKeyword) {
      suspectedTotalRows.push(i)
    }

    // Check if data row (>40% numeric, at least 2 numeric)
    const { fraction, numericCount } = rowNumericFraction(row, totalCols)
    if (fraction > 0.4 && numericCount >= 2) {
      if (firstDataRow === null) firstDataRow = i
      lastDataRow = i
    }
  }

  // Header row is the row just before firstDataRow (if it exists and is not empty)
  const headerRowIndex = firstDataRow !== null && firstDataRow > 0 ? firstDataRow - 1 : null
  const headerRow = headerRowIndex !== null ? (rows[headerRowIndex] ?? []) : null

  // Column stats
  const columnStats: ColumnStat[] = []
  for (let col = 0; col < totalCols; col++) {
    let emptyCount = 0
    let numericCount = 0
    let dateLikeCount = 0
    const uniqueValues = new Set<string>()
    const sampleSet: string[] = []
    const numericValues: number[] = []

    for (let row = 0; row < rows.length; row++) {
      const cell = (rows[row] ?? [])[col]
      const s = cellToString(cell).trim()

      if (s === '') {
        emptyCount++
        continue
      }

      uniqueValues.add(s)

      if (isNumeric(cell)) {
        numericCount++
        numericValues.push(Number(cell))
      }

      if (isDateLike(cell)) {
        dateLikeCount++
      }

      if (sampleSet.length < 5 && !sampleSet.includes(s)) {
        sampleSet.push(s)
      }
    }

    const nonEmptyCount = totalRows - emptyCount
    const emptyPct = totalRows > 0 ? (emptyCount / totalRows) * 100 : 0
    const numericPct = nonEmptyCount > 0 ? (numericCount / nonEmptyCount) * 100 : 0
    const dateLikePct = nonEmptyCount > 0 ? (dateLikeCount / nonEmptyCount) * 100 : 0

    const headerCandidate = headerRow ? cellToString(headerRow[col] ?? '').trim() || null : null

    const stat: ColumnStat = {
      index: col,
      headerCandidate,
      sampleValues: sampleSet,
      emptyPct,
      numericPct,
      dateLikePct,
      uniqueCount: uniqueValues.size,
    }

    if (numericValues.length > 0) {
      stat.min = Math.min(...numericValues)
      stat.max = Math.max(...numericValues)
      stat.avg = numericValues.reduce((a, b) => a + b, 0) / numericValues.length
    }

    columnStats.push(stat)
  }

  // Merged regions from sheet metadata
  const mergesRaw: XLSX.Range[] = sheet['!merges'] ?? []
  const mergedRegions: string[] = mergesRaw
    .slice(0, 10)
    .map(r => XLSX.utils.encode_range(r))

  const rowPatterns: RowPatterns = {
    firstDataRow,
    lastDataRow,
    suspectedTotalRows,
    emptyRows: emptyRowsAll.slice(0, 20),
    mergedRegions,
  }

  return {
    sheetName,
    totalRows,
    totalCols,
    firstRows,
    lastRows,
    columnStats,
    rowPatterns,
    existingProcesses,
    existingDemandTypes,
  }
}
