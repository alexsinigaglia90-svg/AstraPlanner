import type {
  ExternalSignal,
  RiskRadarResult,
  InsightCard,
  TrendPoint,
  DeptBenchmark,
  ImpactFlowData,
} from '@/lib/insights/types'

// ---------------------------------------------------------------------------
// 1. DEMO_SIGNALS — one per source
// ---------------------------------------------------------------------------

export const DEMO_SIGNALS: ExternalSignal[] = [
  {
    id: 'demo-rivm-1',
    source: 'rivm',
    signal_type: 'griep_index',
    value: 8.2,
    severity: 'critical',
    region: 'NL',
    period_start: '2026-03-24',
    period_end: '2026-03-30',
    metadata: { week: 13 },
    fetched_at: '2026-04-01T08:00:00Z',
  },
  {
    id: 'demo-pollen-1',
    source: 'pollen',
    signal_type: 'grassen',
    value: 80,
    severity: 'high',
    region: 'NL',
    period_start: '2026-03-24',
    period_end: '2026-03-30',
    metadata: { type: 'grassen' },
    fetched_at: '2026-04-01T08:00:00Z',
  },
  {
    id: 'demo-knmi-1',
    source: 'knmi',
    signal_type: 'temp',
    value: 18,
    severity: 'low',
    region: 'NL',
    period_start: '2026-03-24',
    period_end: '2026-03-30',
    metadata: { unit: '°C' },
    fetched_at: '2026-04-01T08:00:00Z',
  },
  {
    id: 'demo-vakanties-1',
    source: 'vakanties',
    signal_type: 'upcoming',
    value: 0,
    severity: null,
    region: 'NL',
    period_start: '2026-04-01',
    period_end: null,
    metadata: {},
    fetched_at: '2026-04-01T08:00:00Z',
  },
  {
    id: 'demo-cbs-1',
    source: 'cbs',
    signal_type: 'sector',
    value: 4.8,
    severity: 'low',
    region: 'NL',
    period_start: '2026-03-01',
    period_end: '2026-03-31',
    metadata: { sector: 'logistiek' },
    fetched_at: '2026-04-01T08:00:00Z',
  },
]

// ---------------------------------------------------------------------------
// 2. DEMO_RISK_RADAR
// ---------------------------------------------------------------------------

export const DEMO_RISK_RADAR: RiskRadarResult = {
  dimensions: [
    { key: 'griep', label: 'Griep', value: 82, rawValue: '8.2', color: '#ef4444' },
    { key: 'pollen', label: 'Pollen', value: 80, rawValue: 'Hoog', color: '#f97316' },
    { key: 'weer', label: 'Weer', value: 10, rawValue: '18°C', color: '#22c55e' },
    { key: 'vakantie', label: 'Vakantie', value: 0, rawValue: 'Geen', color: '#6b7280' },
    { key: 'seizoen', label: 'Seizoen', value: 65, rawValue: 'Voorjaar', color: '#eab308' },
  ],
  overallScore: 74,
  severity: 'Verhoogd',
}

// ---------------------------------------------------------------------------
// 3. DEMO_INSIGHTS — 3 cards
// ---------------------------------------------------------------------------

export const DEMO_INSIGHTS: InsightCard[] = [
  {
    id: 'insight-flu-alert',
    type: 'alert',
    title: 'Griepgolf verwacht',
    description:
      'RIVM griepindex staat op 8.2 (kritiek). Verwacht 15-20% hoger ziekteverzuim de komende 2 weken.',
    source: 'rivm',
  },
  {
    id: 'insight-pollen-warning',
    type: 'warning',
    title: 'Hoog pollenseizoen',
    description:
      'Graspollenconcentratie is hoog (80). Medewerkers met hooikoorts kunnen vaker uitvallen.',
    source: 'pollen',
  },
  {
    id: 'insight-advice',
    type: 'advice',
    title: 'Capaciteit opschalen',
    description:
      'Op basis van de gecombineerde signalen adviseren we om 10% extra flex-capaciteit in te plannen voor Inbound en VAS.',
    source: 'correlator',
  },
]

// ---------------------------------------------------------------------------
// 4. DEMO_TREND — 12 months with seasonal pattern
// ---------------------------------------------------------------------------

const INTERNAL_BASE = [5.8, 6.2, 5.5, 4.8, 4.2, 3.8, 3.5, 3.6, 4.0, 4.5, 5.0, 5.5]
const NATIONAL_BASE = [4.9, 5.1, 4.8, 4.5, 4.2, 4.0, 3.8, 3.9, 4.1, 4.3, 4.5, 4.7]

function generateTrend(): { internal: TrendPoint[]; national: TrendPoint[] } {
  // Seed-based pseudo-random so values are stable across renders
  let seed = 42
  const pseudoRandom = () => {
    seed = (seed * 16807 + 0) % 2147483647
    return (seed / 2147483647) - 0.5 // range -0.5 to 0.5
  }

  const startYear = 2025
  const startMonth = 5 // May

  const internal: TrendPoint[] = []
  const national: TrendPoint[] = []

  for (let i = 0; i < 12; i++) {
    const m = (startMonth + i - 1) % 12 + 1
    const y = startYear + Math.floor((startMonth + i - 1) / 12)
    const month = `${y}-${String(m).padStart(2, '0')}`

    internal.push({
      month,
      value: Math.round((INTERNAL_BASE[i]! + pseudoRandom() * 0.4) * 10) / 10,
    })
    national.push({
      month,
      value: NATIONAL_BASE[i]!,
    })
  }

  return { internal, national }
}

export const DEMO_TREND = generateTrend()

// ---------------------------------------------------------------------------
// 5. DEMO_BENCHMARK — 4 departments
// ---------------------------------------------------------------------------

export const DEMO_BENCHMARK: { departments: DeptBenchmark[]; sectorAvg: number } = {
  departments: [
    { department_id: 'dept-inbound', department_name: 'Inbound', absence_pct: 6.5, status: 'above' },
    { department_id: 'dept-outbound', department_name: 'Outbound', absence_pct: 4.2, status: 'within' },
    { department_id: 'dept-vas', department_name: 'VAS', absence_pct: 3.5, status: 'below' },
    { department_id: 'dept-storage', department_name: 'Storage', absence_pct: 5.1, status: 'within' },
  ],
  sectorAvg: 4.8,
}

// ---------------------------------------------------------------------------
// 6. DEMO_IMPACT_FLOW — sankey-style nodes + links
// ---------------------------------------------------------------------------

export const DEMO_IMPACT_FLOW: ImpactFlowData = {
  nodes: [
    { name: 'Griep', category: 'source' },
    { name: 'Pollen', category: 'source' },
    { name: 'Seizoen', category: 'source' },
    { name: 'Inbound', category: 'target' },
    { name: 'Outbound', category: 'target' },
    { name: 'VAS', category: 'target' },
  ],
  links: [
    // Griep → departments
    { source: 0, target: 3, value: 35 },
    { source: 0, target: 4, value: 25 },
    { source: 0, target: 5, value: 20 },
    // Pollen → departments
    { source: 1, target: 3, value: 15 },
    { source: 1, target: 4, value: 10 },
    { source: 1, target: 5, value: 12 },
    // Seizoen → departments
    { source: 2, target: 3, value: 20 },
    { source: 2, target: 4, value: 18 },
    { source: 2, target: 5, value: 15 },
  ],
}
