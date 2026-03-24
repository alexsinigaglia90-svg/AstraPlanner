import type { SupportConfig } from './types'

interface SupportResult {
  fte_needed: number
  hours_needed: number
}

export function computeSupportFTE(
  config: SupportConfig,
  effectiveHoursPerWeek: number,
  linkedFteMap: Record<string, number>,
): SupportResult {
  switch (config.method) {
    case 'fixed_headcount': {
      const fte = config.fixed_count ?? 0
      return { fte_needed: fte, hours_needed: fte * effectiveHoursPerWeek }
    }
    case 'linked_ratio': {
      const totalLinkedFte = (config.linked_process_ids ?? [])
        .reduce((sum, pid) => sum + (linkedFteMap[pid] ?? 0), 0)
      const ratio = config.ratio ?? 1
      const fte = totalLinkedFte / ratio
      return { fte_needed: fte, hours_needed: fte * effectiveHoursPerWeek }
    }
    case 'frequency_based': {
      const hours = (config.duration_hours ?? 0) * (config.frequency_per_week ?? 0)
      return { fte_needed: hours / effectiveHoursPerWeek, hours_needed: hours }
    }
    default:
      return { fte_needed: 0, hours_needed: 0 }
  }
}
