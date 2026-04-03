import type { FetchedSignal, Severity } from '../types'

const RIVM_URL =
  'https://data.rivm.nl/covid-19/COVID-19_uitgevoerde_testen.json'

/** Seasonal flu index estimate based on ISO week (0-10 scale). */
function seasonalFluEstimate(isoWeek: number): number {
  // Peak flu season: weeks 1-12, 46-52
  if (isoWeek >= 1 && isoWeek <= 4) return 6.0
  if (isoWeek >= 5 && isoWeek <= 8) return 4.5
  if (isoWeek >= 9 && isoWeek <= 12) return 3.0
  if (isoWeek >= 13 && isoWeek <= 16) return 1.5
  if (isoWeek >= 17 && isoWeek <= 39) return 0.5
  if (isoWeek >= 40 && isoWeek <= 45) return 2.0
  if (isoWeek >= 46 && isoWeek <= 49) return 4.0
  // weeks 50-52
  return 5.5
}

function fluSeverity(index: number): Severity | null {
  if (index >= 7) return 'critical'
  if (index >= 5) return 'high'
  if (index >= 2) return 'medium'
  return 'low'
}

/** Returns the ISO week number for a given date. */
function getISOWeek(date: Date): number {
  const tmp = new Date(date.getTime())
  tmp.setUTCDate(tmp.getUTCDate() + 4 - (tmp.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
  return Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

export async function fetchRivm(): Promise<FetchedSignal[]> {
  const now = new Date()
  const isoWeek = getISOWeek(now)
  const todayStr = now.toISOString().slice(0, 10)

  try {
    const res = await fetch(RIVM_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) throw new Error(`RIVM HTTP ${res.status}`)

    const data = (await res.json()) as Array<Record<string, unknown>>

    // Try to extract a usable flu index from the latest record
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[data.length - 1]!
      const positiveRate =
        typeof latest.Percentage === 'number' ? latest.Percentage : null

      if (positiveRate !== null) {
        // Normalize percentage to 0-10 index
        const index = Math.min(10, positiveRate / 5)
        return [
          {
            source: 'rivm',
            signal_type: 'griep_index',
            value: Math.round(index * 10) / 10,
            severity: fluSeverity(index),
            region: 'NL',
            period_start: todayStr,
            period_end: null,
            metadata: { week: isoWeek, live: true, raw_pct: positiveRate },
          },
        ]
      }
    }

    // Data was returned but unusable -- fall through to fallback
    throw new Error('RIVM data not parseable')
  } catch {
    // Graceful fallback: seasonal estimate
    const index = seasonalFluEstimate(isoWeek)
    return [
      {
        source: 'rivm',
        signal_type: 'griep_index',
        value: index,
        severity: fluSeverity(index),
        region: 'NL',
        period_start: todayStr,
        period_end: null,
        metadata: { week: isoWeek, live: false, fallback: 'seasonal_estimate' },
      },
    ]
  }
}
