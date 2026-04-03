// src/lib/insights/correlator.ts
// Pure functions for risk score calculation and insight card generation.
// No side effects, no DB calls, no fetch.

import type {
  ExternalSignal,
  InsightCard,
  RadarDimension,
  RiskRadarResult,
  SignalSource,
} from './types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEIGHTS = {
  griep: 0.3,
  pollen: 0.15,
  weer: 0.15,
  vakantie: 0.1,
  seizoen: 0.3,
} as const

const DIMENSION_COLORS: Record<string, string> = {
  griep: '#EF4444',
  pollen: '#F59E0B',
  weer: '#10B981',
  vakantie: '#3B82F6',
  seizoen: '#8B5CF6',
}

const DIMENSION_LABELS: Record<string, string> = {
  griep: 'Griep',
  pollen: 'Pollen',
  weer: 'Weer',
  vakantie: 'Vakantie',
  seizoen: 'Seizoen',
}

const POLLEN_LEVEL_SCORES: Record<string, number> = {
  none: 0,
  low: 20,
  medium: 50,
  high: 80,
  very_high: 100,
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

function severityLabel(score: number): RiskRadarResult['severity'] {
  if (score <= 25) return 'Laag'
  if (score <= 50) return 'Normaal'
  if (score <= 75) return 'Verhoogd'
  return 'Hoog'
}

/** Linear interpolation: maps value in [inMin,inMax] → [outMin,outMax], clamped. */
function lerp(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMax === inMin) return outMin
  const t = (value - inMin) / (inMax - inMin)
  return clamp(outMin + t * (outMax - outMin), Math.min(outMin, outMax), Math.max(outMin, outMax))
}

// ---------------------------------------------------------------------------
// Dimension scorers
// ---------------------------------------------------------------------------

function scoreFlu(signals: ExternalSignal[]): { score: number; raw: string } {
  const fluSignals = signals.filter((s) => s.source === 'rivm' && s.signal_type === 'flu_index')
  if (fluSignals.length === 0) return { score: 0, raw: '0' }

  const maxVal = Math.max(...fluSignals.map((s) => s.value))

  let score: number
  if (maxVal <= 2) {
    score = 0
  } else if (maxVal <= 5) {
    score = lerp(maxVal, 2, 5, 0, 50)
  } else {
    score = lerp(maxVal, 5, 10, 50, 100)
  }

  return { score: Math.round(score), raw: maxVal.toFixed(1) }
}

function scorePollen(signals: ExternalSignal[]): { score: number; raw: string } {
  const pollenSignals = signals.filter((s) => s.source === 'pollen')
  if (pollenSignals.length === 0) return { score: 0, raw: 'Geen' }

  let maxScore = 0
  let maxLevel = 'none'

  for (const s of pollenSignals) {
    const level = String(s.metadata?.level ?? 'none').toLowerCase()
    const pts = POLLEN_LEVEL_SCORES[level] ?? 0
    if (pts > maxScore) {
      maxScore = pts
      maxLevel = level
    }
    // Also check the numeric value directly
    if (s.value > maxScore) {
      maxScore = clamp(s.value, 0, 100)
    }
  }

  const labelMap: Record<string, string> = {
    none: 'Geen',
    low: 'Laag',
    medium: 'Matig',
    high: 'Hoog',
    very_high: 'Zeer hoog',
  }

  return { score: Math.round(maxScore), raw: labelMap[maxLevel] ?? maxLevel }
}

function scoreWeather(signals: ExternalSignal[]): { score: number; raw: string } {
  const weatherSignals = signals.filter((s) => s.source === 'knmi')
  if (weatherSignals.length === 0) return { score: 0, raw: 'Normaal' }

  let maxScore = 0
  const rawParts: string[] = []

  for (const s of weatherSignals) {
    // Check warning codes
    if (s.signal_type === 'weather_warning' || s.signal_type === 'warning') {
      const code = String(s.metadata?.code ?? s.metadata?.color ?? '').toLowerCase()
      let pts = 0
      if (code === 'yellow' || code === 'geel') pts = 40
      else if (code === 'orange' || code === 'oranje') pts = 70
      else if (code === 'red' || code === 'rood') pts = 100

      if (pts > maxScore) {
        maxScore = pts
        rawParts.push(`Code ${code}`)
      }
    }

    // Check extreme temperatures
    if (s.signal_type === 'temperature' || s.signal_type === 'temp') {
      const temp = s.value
      if (temp < -5 || temp > 35) {
        const tempScore = 80
        if (tempScore > maxScore) {
          maxScore = tempScore
        }
        rawParts.push(`${temp}°C`)
      }
    }
  }

  const raw = rawParts.length > 0 ? rawParts.join(', ') : 'Normaal'
  return { score: Math.round(maxScore), raw }
}

function scoreHoliday(signals: ExternalSignal[]): { score: number; raw: string } {
  const holidaySignals = signals.filter((s) => s.source === 'vakanties')
  if (holidaySignals.length === 0) return { score: 0, raw: 'Geen' }

  let maxScore = 0
  let raw = 'Geen'

  for (const s of holidaySignals) {
    const status = String(s.metadata?.status ?? '').toLowerCase()
    if (status === 'active' || s.value >= 1) {
      if (60 > maxScore) {
        maxScore = 60
        raw = String(s.metadata?.name ?? 'Actief')
      }
    } else if (status === 'upcoming' || (s.value > 0 && s.value < 1)) {
      if (30 > maxScore) {
        maxScore = 30
        raw = String(s.metadata?.name ?? 'Binnenkort')
      }
    }
  }

  return { score: maxScore, raw }
}

/**
 * Score seasonal pattern: ratio of current absence % to historical same-week %.
 * A ratio of 1.0 = normal (score ~25). Ratio 2.0+ = score 100.
 */
export function scoreSeasonalPattern(
  currentAbsencePct: number,
  historicalSameWeekPct: number | null,
): { score: number; raw: string } {
  if (historicalSameWeekPct == null || historicalSameWeekPct <= 0) {
    // No historical data — use absolute thresholds
    const score = clamp(currentAbsencePct * 10, 0, 100)
    return { score: Math.round(score), raw: `${currentAbsencePct.toFixed(1)}%` }
  }

  const ratio = currentAbsencePct / historicalSameWeekPct

  // ratio 0.5 → 0, ratio 1.0 → 25, ratio 1.5 → 50, ratio 2.0 → 100
  let score: number
  if (ratio <= 0.5) {
    score = 0
  } else if (ratio <= 1.5) {
    score = lerp(ratio, 0.5, 1.5, 0, 50)
  } else {
    score = lerp(ratio, 1.5, 2.0, 50, 100)
  }

  const raw = `${currentAbsencePct.toFixed(1)}% (hist: ${historicalSameWeekPct.toFixed(1)}%)`
  return { score: Math.round(score), raw }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculate risk radar from external signals and absence data.
 * Returns normalized dimensions (0-100) and an overall weighted score.
 */
export function calculateRiskRadar(
  signals: ExternalSignal[],
  currentAbsencePct: number,
  historicalSameWeekPct: number | null,
): RiskRadarResult {
  const flu = scoreFlu(signals)
  const pollen = scorePollen(signals)
  const weather = scoreWeather(signals)
  const holiday = scoreHoliday(signals)
  const seasonal = scoreSeasonalPattern(currentAbsencePct, historicalSameWeekPct)

  const scores: Record<string, { score: number; raw: string }> = {
    griep: flu,
    pollen,
    weer: weather,
    vakantie: holiday,
    seizoen: seasonal,
  }

  const dimensions: RadarDimension[] = Object.entries(scores).map(([key, { score, raw }]) => ({
    key,
    label: DIMENSION_LABELS[key] ?? key,
    value: score,
    rawValue: raw,
    color: DIMENSION_COLORS[key] ?? '#6B7280',
  }))

  const overallScore = Math.round(
    Object.entries(WEIGHTS).reduce((sum, [key, weight]) => {
      return sum + (scores[key]?.score ?? 0) * weight
    }, 0),
  )

  return {
    dimensions,
    overallScore: clamp(overallScore, 0, 100),
    severity: severityLabel(overallScore),
  }
}

/**
 * Generate static insight cards from signals, risk radar, and benchmarks.
 * Pure function — deterministic output for the same inputs.
 */
export function generateStaticInsights(
  signals: ExternalSignal[],
  riskRadar: RiskRadarResult,
  absencePct: number,
  sectorBenchmarkPct: number,
): InsightCard[] {
  const cards: InsightCard[] = []
  const dimMap = new Map(riskRadar.dimensions.map((d) => [d.key, d]))

  // Flu alert
  const fluDim = dimMap.get('griep')
  if (fluDim && fluDim.value > 60) {
    cards.push({
      id: 'alert-flu',
      type: 'alert',
      title: 'Verhoogde griepactiviteit',
      description: `De griepindex staat op ${fluDim.rawValue}. Dit kan leiden tot meer ziekteverzuim de komende weken.`,
      source: 'rivm',
    })
  }

  // Pollen warning
  const pollenDim = dimMap.get('pollen')
  if (pollenDim && pollenDim.value >= 80) {
    cards.push({
      id: 'warning-pollen',
      type: 'warning',
      title: 'Hoge pollenconcentratie',
      description: `Pollenniveau: ${pollenDim.rawValue}. Medewerkers met hooikoorts kunnen vaker uitvallen.`,
      source: 'pollen',
    })
  }

  // Weather alert
  const weatherDim = dimMap.get('weer')
  if (weatherDim && weatherDim.value >= 60) {
    cards.push({
      id: 'alert-weather',
      type: 'alert',
      title: 'Weerswaarschuwing actief',
      description: `${weatherDim.rawValue}. Houd rekening met mogelijke uitval door extreme weersomstandigheden.`,
      source: 'knmi',
    })
  }

  // Holiday impact
  const holidayDim = dimMap.get('vakantie')
  if (holidayDim && holidayDim.value >= 30) {
    cards.push({
      id: 'warning-holiday',
      type: 'warning',
      title: 'Vakantieperiode',
      description: `${holidayDim.rawValue}. Plan extra capaciteit in voor deze periode.`,
      source: 'vakanties',
    })
  }

  // Benchmark deviation
  if (absencePct > sectorBenchmarkPct + 1.5) {
    const diff = (absencePct - sectorBenchmarkPct).toFixed(1)
    cards.push({
      id: 'warning-benchmark',
      type: 'warning',
      title: 'Verzuim boven sectorbenchmark',
      description: `Uw verzuimpercentage (${absencePct.toFixed(1)}%) ligt ${diff}% boven het sectorgemiddelde (${sectorBenchmarkPct.toFixed(1)}%).`,
      source: 'correlator',
    })
  }

  // Summary advice card — always present
  const topRisks = riskRadar.dimensions
    .filter((d) => d.value >= 40)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3)

  if (topRisks.length > 0) {
    const riskList = topRisks.map((d) => d.label).join(', ')
    cards.push({
      id: 'advice-summary',
      type: 'advice',
      title: 'Samenvatting risicofactoren',
      description: `Let op: ${riskList}. De algehele risicoscore is ${riskRadar.overallScore}/100 (${riskRadar.severity}).`,
      source: 'correlator',
    })
  } else {
    cards.push({
      id: 'advice-summary',
      type: 'advice',
      title: 'Alle indicatoren normaal',
      description: `Geen bijzondere risicofactoren gedetecteerd. De algehele risicoscore is ${riskRadar.overallScore}/100 (${riskRadar.severity}).`,
      source: 'correlator',
    })
  }

  return cards
}
