import type { FetchedSignal, Severity } from '../types'

/** CBS OData endpoint for absence rates by sector. */
const CBS_URL =
  'https://opendata.cbs.nl/ODataApi/odata/80072ned/TypedDataSet?$filter=SBI2008%20eq%20%27H%27&$orderby=Perioden%20desc&$top=4'

/** Typical NL logistics sector absence rate. */
const FALLBACK_RATE = 4.8

/**
 * Parse CBS period format "2026KW01" to ISO date "2026-01-01".
 * KW = kwartaal (quarter), so KW01 = Q1 starting Jan 1, etc.
 */
function cbsPeriodToDate(period: string): string {
  const match = period.match(/^(\d{4})KW(\d{2})$/)
  if (!match) return new Date().toISOString().slice(0, 10)

  const year = match[1]!
  const quarter = parseInt(match[2]!, 10)
  const monthStart = ((quarter - 1) * 3 + 1).toString().padStart(2, '0')
  return `${year}-${monthStart}-01`
}

function absenceSeverity(pct: number): Severity {
  if (pct >= 8) return 'critical'
  if (pct >= 6) return 'high'
  if (pct >= 4.5) return 'medium'
  return 'low'
}

export async function fetchCbs(): Promise<FetchedSignal[]> {
  const todayStr = new Date().toISOString().slice(0, 10)

  try {
    const res = await fetch(CBS_URL, {
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) throw new Error(`CBS HTTP ${res.status}`)

    const data = (await res.json()) as { value?: Array<Record<string, unknown>> }

    const records = data.value
    if (!Array.isArray(records) || records.length === 0) {
      throw new Error('CBS returned no records')
    }

    const latest = records[0]!
    const period = String(latest.Perioden ?? '')
    const verzuimPct =
      typeof latest.Ziekteverzuimpercentage === 'number'
        ? (latest.Ziekteverzuimpercentage as number)
        : typeof latest.Ziekteverzuimpercentage_1 === 'number'
          ? (latest.Ziekteverzuimpercentage_1 as number)
          : null

    if (verzuimPct === null) throw new Error('CBS field not found')

    return [
      {
        source: 'cbs',
        signal_type: 'sector_verzuim_pct',
        value: Math.round(verzuimPct * 10) / 10,
        severity: absenceSeverity(verzuimPct),
        region: 'NL',
        period_start: cbsPeriodToDate(period),
        period_end: null,
        metadata: {
          live: true,
          period,
          sector: 'H - Vervoer en opslag',
          sbi_code: 'H',
        },
      },
    ]
  } catch {
    // Fallback: hardcoded sector average
    return [
      {
        source: 'cbs',
        signal_type: 'sector_verzuim_pct',
        value: FALLBACK_RATE,
        severity: absenceSeverity(FALLBACK_RATE),
        region: 'NL',
        period_start: todayStr,
        period_end: null,
        metadata: {
          live: false,
          fallback: 'sector_average',
          sector: 'H - Vervoer en opslag',
          sbi_code: 'H',
        },
      },
    ]
  }
}
