export interface WorkloadInput {
  site_id: string
  period_start: string  // ISO week start (Monday)
  period_end: string    // ISO week end (Sunday)
}

export interface DemandRow {
  demand_forecast_id: string
  demand_type_id: string
  demand_type_name: string
  process_mappings: ProcessMapping[]
  volume: number
  period_start: string
  period_end: string
}

export interface ProcessMapping {
  process_id: string
  process_name: string
  conversion_ratio: number
}

export interface ProcessOverride {
  demand_forecast_id: string
  process_id: string
  override_volume: number
}

export interface EmployeeAvailability {
  employee_id: string
  process_id: string
  proficiency_level: number
  available_hours: number  // net hours after leave, breaks, etc.
  productive_pct: number   // from job_role
}

export interface ProcessProductivityStandard {
  process_id: string
  site_id: string
  skill_level: number
  units_per_hour: number
}

export interface SupportConfig {
  method: 'fixed_headcount' | 'linked_ratio' | 'frequency_based'
  fixed_count?: number
  linked_process_ids?: string[]
  ratio?: number
  duration_hours?: number
  frequency_per_week?: number
}

export interface WorkloadResult {
  process_id: string
  process_name: string
  period_start: string
  period_end: string
  demand_volume: number
  conversion_ratio: number
  process_volume: number
  weighted_uph: number | null  // null if no employees with skill
  hours_needed: number | null
  fte_needed: number | null
  hours_available: number
  fte_available: number
  coverage_pct: number  // 0-100+
  status: 'computed' | 'no_norm'
}
