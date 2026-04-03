// src/lib/insights/types.ts

export type SignalSource = 'rivm' | 'knmi' | 'pollen' | 'vakanties' | 'cbs'

export type Severity = 'low' | 'medium' | 'high' | 'critical'

export interface ExternalSignal {
  id: string
  source: SignalSource
  signal_type: string
  value: number
  severity: Severity | null
  region: string | null
  period_start: string
  period_end: string | null
  metadata: Record<string, unknown>
  fetched_at: string
}

export interface RadarDimension {
  key: string
  label: string
  value: number       // 0-100 normalized
  rawValue: string    // human-readable, e.g. "8.2" or "Hoog"
  color: string
}

export interface TrendPoint {
  month: string       // "2025-04", "2025-05", etc.
  value: number       // percentage, e.g. 4.8
}

export interface DeptBenchmark {
  department_id: string
  department_name: string
  absence_pct: number
  status: 'below' | 'within' | 'above' // relative to sector
}

export interface InsightCard {
  id: string
  type: 'alert' | 'warning' | 'advice'
  title: string
  description: string
  source: SignalSource | 'correlator'
}

export interface RiskRadarResult {
  dimensions: RadarDimension[]
  overallScore: number
  severity: 'Laag' | 'Normaal' | 'Verhoogd' | 'Hoog'
}

export interface ImpactFlowData {
  nodes: Array<{ name: string; category: 'source' | 'target' }>
  links: Array<{ source: number; target: number; value: number }>
}

/** Shape returned by each source fetcher */
export interface FetchedSignal {
  source: SignalSource
  signal_type: string
  value: number
  severity: Severity | null
  region: string | null
  period_start: string
  period_end: string | null
  metadata: Record<string, unknown>
}
