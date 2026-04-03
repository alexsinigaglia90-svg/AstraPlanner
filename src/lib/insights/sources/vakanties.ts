import type { FetchedSignal } from '../types'

type Region = 'noord' | 'midden' | 'zuid'

interface HolidayPeriod {
  name: string
  regions: Region[]
  start: string // YYYY-MM-DD
  end: string   // YYYY-MM-DD
}

/** Dutch school holidays 2025-2027 (approximate official dates). */
const HOLIDAYS: HolidayPeriod[] = [
  // --- 2025 ---
  { name: 'Meivakantie', regions: ['noord', 'midden', 'zuid'], start: '2025-04-26', end: '2025-05-04' },
  { name: 'Zomervakantie', regions: ['noord'], start: '2025-07-12', end: '2025-08-24' },
  { name: 'Zomervakantie', regions: ['midden'], start: '2025-07-19', end: '2025-08-31' },
  { name: 'Zomervakantie', regions: ['zuid'], start: '2025-07-05', end: '2025-08-17' },
  { name: 'Herfstvakantie', regions: ['noord', 'midden', 'zuid'], start: '2025-10-18', end: '2025-10-26' },
  { name: 'Kerstvakantie', regions: ['noord', 'midden', 'zuid'], start: '2025-12-20', end: '2026-01-04' },

  // --- 2026 ---
  { name: 'Voorjaarsvakantie', regions: ['noord'], start: '2026-02-21', end: '2026-03-01' },
  { name: 'Voorjaarsvakantie', regions: ['midden'], start: '2026-02-28', end: '2026-03-08' },
  { name: 'Voorjaarsvakantie', regions: ['zuid'], start: '2026-02-14', end: '2026-02-22' },
  { name: 'Meivakantie', regions: ['noord', 'midden', 'zuid'], start: '2026-04-25', end: '2026-05-03' },
  { name: 'Zomervakantie', regions: ['noord'], start: '2026-07-04', end: '2026-08-16' },
  { name: 'Zomervakantie', regions: ['midden'], start: '2026-07-18', end: '2026-08-30' },
  { name: 'Zomervakantie', regions: ['zuid'], start: '2026-07-11', end: '2026-08-23' },
  { name: 'Herfstvakantie', regions: ['noord', 'midden', 'zuid'], start: '2026-10-17', end: '2026-10-25' },
  { name: 'Kerstvakantie', regions: ['noord', 'midden', 'zuid'], start: '2026-12-19', end: '2027-01-03' },

  // --- 2027 ---
  { name: 'Voorjaarsvakantie', regions: ['noord'], start: '2027-02-20', end: '2027-02-28' },
  { name: 'Voorjaarsvakantie', regions: ['midden'], start: '2027-02-27', end: '2027-03-07' },
  { name: 'Voorjaarsvakantie', regions: ['zuid'], start: '2027-02-13', end: '2027-02-21' },
]

function parseDate(s: string): Date {
  return new Date(s + 'T00:00:00')
}

function diffDays(a: Date, b: Date): number {
  return Math.ceil((b.getTime() - a.getTime()) / 86400000)
}

export async function fetchVakanties(): Promise<FetchedSignal[]> {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const today = parseDate(todayStr)

  const signals: FetchedSignal[] = []
  const regions: Region[] = ['noord', 'midden', 'zuid']

  for (const region of regions) {
    // Check if today falls within any active holiday for this region
    const active = HOLIDAYS.find(
      (h) =>
        h.regions.includes(region) &&
        today >= parseDate(h.start) &&
        today <= parseDate(h.end),
    )

    if (active) {
      signals.push({
        source: 'vakanties',
        signal_type: 'schoolvakantie_actief',
        value: 60,
        severity: 'medium',
        region,
        period_start: active.start,
        period_end: active.end,
        metadata: { name: active.name, days_remaining: diffDays(today, parseDate(active.end)) },
      })
    } else {
      // Find next upcoming holiday for this region
      const upcoming = HOLIDAYS
        .filter((h) => h.regions.includes(region) && parseDate(h.start) > today)
        .sort((a, b) => parseDate(a.start).getTime() - parseDate(b.start).getTime())

      const next = upcoming[0]
      if (next) {
        const daysUntil = diffDays(today, parseDate(next.start))
        signals.push({
          source: 'vakanties',
          signal_type: 'volgende_vakantie',
          value: daysUntil,
          severity: daysUntil <= 14 ? 'low' : null,
          region,
          period_start: todayStr,
          period_end: null,
          metadata: {
            name: next.name,
            vakantie_start: next.start,
            vakantie_end: next.end,
            days_until: daysUntil,
          },
        })
      }
    }
  }

  return signals
}
