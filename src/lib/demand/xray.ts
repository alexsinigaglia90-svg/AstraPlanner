import ExcelJS from 'exceljs'

/**
 * Excel "x-ray" analyzer — extracts structural statistics from a workbook
 * so the AI analyzer can reason about header/data layout without having to
 * see the raw cells. Pure parsing; does not write anything back.
 *
 * Migrated from `xlsx` to `exceljs` to eliminate the unfixable HIGH CVEs
 * in SheetJS (GHSA-4r6h-8v6p-xvw6 prototype pollution, GHSA-5pgg-2g8v-p4x9
 * ReDoS). exceljs is a maintained alternative with a safer parsing path.
 */

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

/**
 * Normalize an ExcelJS cell value to a plain JS primitive. ExcelJS returns
 * rich objects for formulas, hyperlinks, rich text, and dates — we unwrap
 * them to the underlying scalar the rest of the analyzer expects.
 */
function unwrapCell(value: unknown): unknown {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    const obj = value as { result?: unknown; text?: unknown; richText?: Array<{ text: string }>; formula?: string; hyperlink?: string }
    if ('result' in obj && obj.result !== undefined) return obj.result
    if ('richText' in obj && Array.isArray(obj.richText)) {
      return obj.richText.map((r) => r.text).join('')
    }
    if ('text' in obj && obj.text !== undefined) return obj.text
    if ('hyperlink' in obj && obj.hyperlink) return obj.hyperlink
    return ''
  }
  return value
}

function cellToString(value: unknown): string {
  const v = unwrapCell(value)
  if (v === null || v === undefined || v === '') return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  return String(v)
}

function isNumeric(value: unknown): boolean {
  const v = unwrapCell(value)
  if (v === null || v === undefined || v === '') return false
  if (v instanceof Date) return false
  const n = Number(v)
  return !isNaN(n) && isFinite(n)
}

function isDateLike(value: unknown): boolean {
  const v = unwrapCell(value)
  if (v instanceof Date) return true
  const s = cellToString(value).trim()
  if (s === '') return false
  return DATE_PATTERN.test(s)
}

function isRowEmpty(row: unknown[]): boolean {
  return row.every((cell) => {
    const v = unwrapCell(cell)
    return v === null || v === undefined || v === ''
  })
}

function rowNumericFraction(row: unknown[], totalCols: number): { fraction: number; numericCount: number } {
  if (totalCols === 0) return { fraction: 0, numericCount: 0 }
  let count = 0
  for (const cell of row) {
    if (isNumeric(cell)) count++
  }
  return { fraction: count / totalCols, numericCount: count }
}

/**
 * Convert an ExcelJS worksheet to a dense 2D array, with each row padded
 * to the worksheet's column count. Empty cells become empty strings so
 * the rest of the analyzer can treat all rows uniformly.
 */
function worksheetToMatrix(sheet: ExcelJS.Worksheet): { matrix: unknown[][]; totalCols: number } {
  const totalCols = sheet.columnCount || 0
  const totalRows = sheet.rowCount || 0
  const matrix: unknown[][] = []
  for (let r = 1; r <= totalRows; r++) {
    const row = sheet.getRow(r)
    const cells: unknown[] = []
    for (let c = 1; c <= totalCols; c++) {
      cells.push(row.getCell(c).value)
    }
    matrix.push(cells)
  }
  return { matrix, totalCols }
}

export function extractXray(
  wb: ExcelJS.Workbook,
  sheetName: string,
  existingProcesses: string[],
  existingDemandTypes: string[] = [],
): ExcelXray {
  const sheet = wb.getWorksheet(sheetName)
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in workbook`)
  }

  const { matrix: rawRows, totalCols } = worksheetToMatrix(sheet)
  const totalRows = rawRows.length

  // Normalize all rows to totalCols length
  const rows: unknown[][] = rawRows.map((row) => {
    const padded = [...row]
    while (padded.length < totalCols) padded.push('')
    return padded
  })

  // First 10 and last 5 rows (raw, not padded). We surface the unwrapped
  // cell values here so downstream consumers (AI prompt) see plain scalars.
  const firstRows: unknown[][] = rawRows.slice(0, 10).map((row) => row.map((c) => unwrapCell(c)))
  const lastRows: unknown[][] = rawRows.slice(Math.max(0, totalRows - 5)).map((row) => row.map((c) => unwrapCell(c)))

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
    const hasTotalKeyword = row.some((cell) => {
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
        numericValues.push(Number(unwrapCell(cell)))
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

  // Merged regions from sheet model. ExcelJS exposes merges as an internal
  // mapping; we iterate the model to collect them and encode as A1 notation
  // (e.g. "A1:F1") to match the old xlsx output format.
  const mergedRegions: string[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const merges: Record<string, unknown> | undefined = (sheet as any)._merges
  if (merges) {
    for (const key of Object.keys(merges)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m: any = merges[key]
      if (m && typeof m.top === 'number' && typeof m.left === 'number' && typeof m.bottom === 'number' && typeof m.right === 'number') {
        mergedRegions.push(`${colLetter(m.left)}${m.top}:${colLetter(m.right)}${m.bottom}`)
      } else if (typeof key === 'string' && key.includes(':')) {
        mergedRegions.push(key)
      }
      if (mergedRegions.length >= 10) break
    }
  }

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

/** Convert a 1-based column number to A1-notation letters (1 → A, 27 → AA). */
function colLetter(col: number): string {
  let s = ''
  let n = col
  while (n > 0) {
    const rem = (n - 1) % 26
    s = String.fromCharCode(65 + rem) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
