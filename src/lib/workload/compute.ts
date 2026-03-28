import type {
  DemandRow,
  ProcessOverride,
  EmployeeAvailability,
  ProcessProductivityStandard,
  WorkloadResult,
} from './types'
import { PROFICIENCY_MULTIPLIERS } from './constants'

/**
 * Pure workload computation — no DB calls.
 * Takes demand, overrides, norms, and employee availability.
 * Returns WorkloadResult per process × period.
 */
export function computeWorkload(
  demands: DemandRow[],
  overrides: ProcessOverride[],
  standards: ProcessProductivityStandard[],
  employees: EmployeeAvailability[],
  effectiveHoursPerWeek: number,
): WorkloadResult[] {
  const results: WorkloadResult[] = []
  const overrideMap = new Map<string, number>()

  for (const o of overrides) {
    overrideMap.set(`${o.demand_forecast_id}:${o.process_id}`, o.override_volume)
  }

  const employeesByProcess = new Map<string, EmployeeAvailability[]>()
  for (const emp of employees) {
    const list = employeesByProcess.get(emp.process_id) ?? []
    list.push(emp)
    employeesByProcess.set(emp.process_id, list)
  }

  const standardMap = new Map<string, number>()
  for (const s of standards) {
    if (s.skill_level === 3) {
      standardMap.set(s.process_id, s.units_per_hour)
    }
  }

  for (const demand of demands) {
    for (const mapping of demand.process_mappings) {
      const overrideKey = `${demand.demand_forecast_id}:${mapping.process_id}`
      const hasOverride = overrideMap.has(overrideKey)
      const processVolume = hasOverride
        ? overrideMap.get(overrideKey)!
        : demand.volume * mapping.conversion_ratio

      const baseUph = standardMap.get(mapping.process_id)
      const processEmployees = employeesByProcess.get(mapping.process_id) ?? []

      let weightedUph: number | null = null
      let hoursNeeded: number | null = null
      let fteNeeded: number | null = null
      let status: 'computed' | 'no_norm' = 'computed'

      if (baseUph && baseUph > 0) {
        if (processEmployees.length > 0) {
          // Weighted UPH from actual employee skill levels
          const totalUph = processEmployees.reduce((sum, emp) => {
            const multiplier = PROFICIENCY_MULTIPLIERS[emp.proficiency_level] ?? 1.0
            return sum + baseUph * multiplier
          }, 0)
          weightedUph = totalUph / processEmployees.length
        } else {
          // No employees assigned yet — use base UPH (level 3)
          weightedUph = baseUph
        }
        hoursNeeded = processVolume / weightedUph
        fteNeeded = hoursNeeded / effectiveHoursPerWeek
      } else {
        status = 'no_norm'
      }

      const hoursAvailable = processEmployees.reduce(
        (sum, emp) => sum + emp.available_hours * emp.productive_pct,
        0,
      )
      const fteAvailable = hoursAvailable / effectiveHoursPerWeek

      const coveragePct =
        hoursNeeded && hoursNeeded > 0
          ? Math.round((hoursAvailable / hoursNeeded) * 100)
          : processEmployees.length > 0
            ? 100
            : 0

      results.push({
        process_id: mapping.process_id,
        process_name: mapping.process_name,
        period_start: demand.period_start,
        period_end: demand.period_end,
        demand_volume: demand.volume,
        conversion_ratio: mapping.conversion_ratio,
        process_volume: processVolume,
        weighted_uph: weightedUph,
        hours_needed: hoursNeeded,
        fte_needed: fteNeeded,
        hours_available: hoursAvailable,
        fte_available: fteAvailable,
        coverage_pct: coveragePct,
        status,
      })
    }
  }

  return results
}
