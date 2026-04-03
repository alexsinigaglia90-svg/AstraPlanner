import type { FetchedSignal, Severity } from '../types'

const BUIENRADAR_URL = 'https://data.buienradar.nl/2.0/feed/json'

/** Numeric pollen levels. */
const POLLEN_LEVELS: Record<string, number> = {
  geen: 0,
  none: 0,
  laag: 20,
  low: 20,
  matig: 50,
  moderate: 50,
  hoog: 80,
  high: 80,
  zeer_hoog: 100,
  very_high: 100,
}

function pollenSeverity(value: number): Severity | null {
  if (value >= 80) return 'high'
  if (value >= 50) return 'medium'
  if (value >= 20) return 'low'
  return null
}

/**
 * Seasonal pollen calendar for the Netherlands.
 * Returns estimated level (0-100) per category for a given month (0-based).
 */
function seasonalPollen(month: number): {
  bomen: number
  grassen: number
  onkruid: number
} {
  // Trees: peak Feb(1)-May(4)
  const bomenByMonth = [0, 40, 80, 80, 60, 20, 0, 0, 0, 0, 0, 0]
  // Grasses: peak May(4)-Aug(7)
  const grassenByMonth = [0, 0, 0, 10, 60, 80, 80, 60, 20, 0, 0, 0]
  // Weeds: peak Jul(6)-Oct(9)
  const onkruidByMonth = [0, 0, 0, 0, 0, 10, 50, 80, 60, 30, 0, 0]

  return {
    bomen: bomenByMonth[month] ?? 0,
    grassen: grassenByMonth[month] ?? 0,
    onkruid: onkruidByMonth[month] ?? 0,
  }
}

function parseBuienradarLevel(raw: unknown): number {
  if (typeof raw === 'number') return raw
  if (typeof raw === 'string') {
    const key = raw.toLowerCase().replace(/\s+/g, '_')
    return POLLEN_LEVELS[key] ?? 0
  }
  return 0
}

export async function fetchPollen(): Promise<FetchedSignal[]> {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const month = now.getMonth()

  try {
    const res = await fetch(BUIENRADAR_URL, {
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) throw new Error(`Buienradar HTTP ${res.status}`)

    const data = (await res.json()) as Record<string, unknown>

    // Navigate Buienradar JSON structure
    const forecast = data.forecast as Record<string, unknown> | undefined
    const pollen = (forecast?.pollen ?? {}) as Record<string, unknown>

    const bomen = parseBuienradarLevel(pollen.boom ?? pollen.trees)
    const grassen = parseBuienradarLevel(pollen.gras ?? pollen.grasses)
    const onkruid = parseBuienradarLevel(pollen.onkruid ?? pollen.weeds)

    // If all zero and we're in a season where we'd expect pollen, use fallback
    if (bomen === 0 && grassen === 0 && onkruid === 0) {
      throw new Error('Pollen data empty, using fallback')
    }

    return buildSignals(bomen, grassen, onkruid, todayStr, true)
  } catch {
    // Fallback: seasonal calendar
    const seasonal = seasonalPollen(month)
    return buildSignals(
      seasonal.bomen,
      seasonal.grassen,
      seasonal.onkruid,
      todayStr,
      false,
    )
  }
}

function buildSignals(
  bomen: number,
  grassen: number,
  onkruid: number,
  todayStr: string,
  live: boolean,
): FetchedSignal[] {
  return [
    {
      source: 'pollen',
      signal_type: 'pollen_bomen',
      value: bomen,
      severity: pollenSeverity(bomen),
      region: 'NL',
      period_start: todayStr,
      period_end: null,
      metadata: { live, category: 'bomen' },
    },
    {
      source: 'pollen',
      signal_type: 'pollen_grassen',
      value: grassen,
      severity: pollenSeverity(grassen),
      region: 'NL',
      period_start: todayStr,
      period_end: null,
      metadata: { live, category: 'grassen' },
    },
    {
      source: 'pollen',
      signal_type: 'pollen_onkruid',
      value: onkruid,
      severity: pollenSeverity(onkruid),
      region: 'NL',
      period_start: todayStr,
      period_end: null,
      metadata: { live, category: 'onkruid' },
    },
  ]
}
