import type { FetchedSignal, Severity } from '../types'

const KNMI_WARNINGS_URL =
  'https://cdn.knmi.nl/knmi/json/page/weer/waarschuwingen_Nederland.json'

/** Average monthly temperatures for the Netherlands (index 0 = Jan). */
const NL_MONTHLY_TEMP = [3, 3, 6, 10, 14, 17, 19, 19, 16, 11, 7, 4] as const

function tempSeverity(temp: number): Severity | null {
  if (temp < -5 || temp > 35) return 'high'
  if (temp < 0 || temp > 30) return 'medium'
  return 'low'
}

function warningSeverity(code: string | undefined): Severity {
  if (code === 'red') return 'critical'
  if (code === 'orange') return 'high'
  if (code === 'yellow') return 'medium'
  return 'low'
}

export async function fetchKnmi(): Promise<FetchedSignal[]> {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const month = now.getMonth() // 0-based

  const signals: FetchedSignal[] = []

  try {
    const res = await fetch(KNMI_WARNINGS_URL, {
      next: { revalidate: 1800 },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) throw new Error(`KNMI HTTP ${res.status}`)

    const data = (await res.json()) as Record<string, unknown>

    // Parse active warnings
    const warnings = (data.waarschuwingen ?? data.warnings ?? []) as Array<
      Record<string, unknown>
    >
    for (const w of warnings) {
      const type = String(w.type ?? w.titel ?? 'onbekend')
      const color = String(w.code ?? w.kleur ?? 'yellow')
      signals.push({
        source: 'knmi',
        signal_type: `weer_waarschuwing_${type.toLowerCase().replace(/\s+/g, '_')}`,
        value: color === 'red' ? 100 : color === 'orange' ? 75 : 50,
        severity: warningSeverity(color),
        region: 'NL',
        period_start: todayStr,
        period_end: null,
        metadata: { live: true, warning_type: type, color },
      })
    }

    // Always add temperature signal
    const temp =
      typeof data.temperatuur === 'number'
        ? (data.temperatuur as number)
        : NL_MONTHLY_TEMP[month]!

    signals.push({
      source: 'knmi',
      signal_type: 'temperatuur',
      value: temp,
      severity: tempSeverity(temp as number),
      region: 'NL',
      period_start: todayStr,
      period_end: null,
      metadata: { live: typeof data.temperatuur === 'number', month: month + 1 },
    })

    return signals
  } catch {
    // Fallback: seasonal temperature only
    const temp = NL_MONTHLY_TEMP[month]!
    return [
      {
        source: 'knmi',
        signal_type: 'temperatuur',
        value: temp,
        severity: tempSeverity(temp),
        region: 'NL',
        period_start: todayStr,
        period_end: null,
        metadata: { live: false, fallback: 'seasonal_avg', month: month + 1 },
      },
    ]
  }
}
