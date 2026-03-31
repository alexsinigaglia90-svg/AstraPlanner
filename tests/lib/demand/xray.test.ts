import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { extractXray } from '@/lib/demand/xray'

function makeWorkbook(data: unknown[][], sheetName = 'Sheet1'): XLSX.WorkBook {
  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return wb
}

describe('extractXray', () => {
  it('returns correct totalRows, totalCols, and columnStats length for clean data', () => {
    const data = [
      ['Week', 'Process', 'Volume', 'Target'],
      ['wk1', 'Picking', 100, 120],
      ['wk2', 'Picking', 150, 160],
      ['wk3', 'Sorting', 200, 210],
    ]
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', ['Picking', 'Sorting'])

    expect(xray.sheetName).toBe('Sheet1')
    expect(xray.totalRows).toBe(4)
    expect(xray.totalCols).toBe(4)
    expect(xray.columnStats).toHaveLength(4)
    expect(xray.existingProcesses).toEqual(['Picking', 'Sorting'])
    expect(xray.existingDemandTypes).toEqual([])
  })

  it('computes correct numericPct, min, max, avg for numeric column', () => {
    const data = [
      ['Label', 'Value'],
      ['A', 10],
      ['B', 20],
      ['C', 30],
      ['D', 40],
    ]
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', [])

    const valueCol = xray.columnStats[1]
    expect(valueCol).toBeDefined()
    // 4 out of 5 rows have numeric values in col index 1 (header "Value" is not numeric)
    expect(valueCol!.numericPct).toBeGreaterThan(70)
    expect(valueCol!.min).toBe(10)
    expect(valueCol!.max).toBe(40)
    expect(valueCol!.avg).toBe(25)
  })

  it('detects empty rows and total rows', () => {
    const data = [
      ['Week', 'Volume', 'Target'],
      ['wk1', 100, 110],
      ['wk2', 150, 160],
      ['', '', ''],              // empty row at index 3
      ['Totaal', 250, 270],     // total row at index 4
      ['wk3', 200, 210],
    ]
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', [])

    expect(xray.rowPatterns.emptyRows).toContain(3)
    expect(xray.rowPatterns.suspectedTotalRows).toContain(4)
  })

  it('finds firstDataRow by skipping title/header rows', () => {
    const data = [
      ['My Big Report Title'],            // index 0 — title, no numerics
      ['Generated on: 2026-01-01'],       // index 1 — not mostly numeric
      ['Week', 'Volume', 'Target', 'Actual'], // index 2 — header row
      ['wk1', 100, 110, 95],              // index 3 — first data row
      ['wk2', 150, 160, 140],
    ]
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', [])

    expect(xray.rowPatterns.firstDataRow).toBe(3)
    expect(xray.rowPatterns.lastDataRow).toBe(4)
  })

  it('sets headerCandidate from row before firstDataRow', () => {
    const data = [
      ['Week', 'Volume', 'Forecast'],
      [1, 200, 210],
      [2, 300, 310],
    ]
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', [])

    // firstDataRow should be 1 (row index 1 has numerics)
    expect(xray.rowPatterns.firstDataRow).toBe(1)
    // header candidates should come from row 0
    expect(xray.columnStats[0]!.headerCandidate).toBe('Week')
    expect(xray.columnStats[1]!.headerCandidate).toBe('Volume')
    expect(xray.columnStats[2]!.headerCandidate).toBe('Forecast')
  })

  it('returns firstRows (up to 10) and lastRows (up to 5)', () => {
    const data = Array.from({ length: 20 }, (_, i) => [`row${i}`, i * 10])
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', [])

    expect(xray.firstRows).toHaveLength(10)
    expect(xray.lastRows).toHaveLength(5)
    expect(xray.firstRows[0]).toEqual(['row0', 0])
    expect(xray.lastRows[xray.lastRows.length - 1]).toEqual(['row19', 190])
  })

  it('caps emptyRows at 20', () => {
    const data: unknown[][] = [['header', 'value']]
    for (let i = 0; i < 30; i++) {
      data.push(['', ''])  // 30 empty rows
    }
    data.push(['wk1', 100])
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', [])

    expect(xray.rowPatterns.emptyRows.length).toBeLessThanOrEqual(20)
  })

  it('detects date-like values in date column', () => {
    const data = [
      ['Date', 'Volume'],
      ['2026-01-01', 100],
      ['2026-01-08', 150],
      ['wk3', 200],
      ['01/15/2026', 250],
    ]
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', [])

    const dateCol = xray.columnStats[0]
    expect(dateCol).toBeDefined()
    expect(dateCol!.dateLikePct).toBeGreaterThan(0)
  })

  it('handles existingDemandTypes passed through', () => {
    const data = [['Week', 'Volume'], ['wk1', 100]]
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', ['P1'], ['TypeA', 'TypeB'])

    expect(xray.existingDemandTypes).toEqual(['TypeA', 'TypeB'])
  })

  it('throws when sheet name does not exist', () => {
    const wb = makeWorkbook([['a', 'b']])
    expect(() => extractXray(wb, 'NonExistent', [])).toThrow('Sheet "NonExistent" not found')
  })

  it('sampleValues contains at most 5 unique non-empty values', () => {
    const data = [
      ['Label'],
      ['A'], ['B'], ['C'], ['D'], ['E'], ['F'], ['G'],
    ]
    const wb = makeWorkbook(data)
    const xray = extractXray(wb, 'Sheet1', [])

    expect(xray.columnStats[0]!.sampleValues.length).toBeLessThanOrEqual(5)
  })
})
