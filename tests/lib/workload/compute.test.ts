import { describe, it, expect } from 'vitest'
import { computeWorkload } from '@/lib/workload/compute'
import type {
  DemandRow,
  ProcessOverride,
  EmployeeAvailability,
  ProcessProductivityStandard,
} from '@/lib/workload/types'

describe('computeWorkload', () => {
  const baseDemand: DemandRow = {
    demand_forecast_id: 'df-1',
    demand_type_id: 'dt-1',
    demand_type_name: 'Outbound Orders',
    volume: 5000,
    period_start: '2026-04-06',
    period_end: '2026-04-12',
    process_mappings: [
      { process_id: 'p-pick', process_name: 'Picking', conversion_ratio: 1.0 },
      { process_id: 'p-pack', process_name: 'Packing', conversion_ratio: 0.95 },
    ],
  }

  const standards: ProcessProductivityStandard[] = [
    { process_id: 'p-pick', site_id: 's-1', skill_level: 3, units_per_hour: 10 },
    { process_id: 'p-pack', site_id: 's-1', skill_level: 3, units_per_hour: 15 },
  ]

  const employees: EmployeeAvailability[] = [
    { employee_id: 'e-1', process_id: 'p-pick', proficiency_level: 3, available_hours: 40, productive_pct: 0.95 },
    { employee_id: 'e-2', process_id: 'p-pick', proficiency_level: 4, available_hours: 40, productive_pct: 0.95 },
    { employee_id: 'e-3', process_id: 'p-pack', proficiency_level: 3, available_hours: 40, productive_pct: 0.95 },
  ]

  it('computes hours_needed from volume / weighted_uph', () => {
    const results = computeWorkload([baseDemand], [], standards, employees, 40)
    const picking = results.find(r => r.process_id === 'p-pick')!
    // weighted_uph: e-1 = 10*1.0=10, e-2 = 10*1.15=11.5 → avg = 10.75
    expect(picking.weighted_uph).toBeCloseTo(10.75)
    expect(picking.hours_needed).toBeCloseTo(465.12, 0)
    expect(picking.fte_needed).toBeCloseTo(11.63, 0)
  })

  it('applies conversion_ratio to process volume', () => {
    const results = computeWorkload([baseDemand], [], standards, employees, 40)
    const packing = results.find(r => r.process_id === 'p-pack')!
    expect(packing.process_volume).toBe(4750)
  })

  it('uses override volume when present', () => {
    const overrides: ProcessOverride[] = [
      { demand_forecast_id: 'df-1', process_id: 'p-pick', override_volume: 6000 },
    ]
    const results = computeWorkload([baseDemand], overrides, standards, employees, 40)
    const picking = results.find(r => r.process_id === 'p-pick')!
    expect(picking.process_volume).toBe(6000)
  })

  it('returns null hours when no employees have skill', () => {
    const results = computeWorkload([baseDemand], [], standards, [], 40)
    const picking = results.find(r => r.process_id === 'p-pick')!
    expect(picking.weighted_uph).toBeNull()
    expect(picking.hours_needed).toBeNull()
    expect(picking.status).toBe('no_norm')
  })

  it('computes coverage_pct from available vs needed', () => {
    const results = computeWorkload([baseDemand], [], standards, employees, 40)
    const picking = results.find(r => r.process_id === 'p-pick')!
    expect(picking.coverage_pct).toBeGreaterThan(0)
    expect(picking.coverage_pct).toBeLessThan(100)
  })
})
