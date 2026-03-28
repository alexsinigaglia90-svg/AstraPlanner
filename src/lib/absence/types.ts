/** Override record from employee_availability_override table */
export interface AbsenceOverride {
  id: string
  employee_id: string
  start_date: string
  end_date: string
  start_time: string | null
  end_time: string | null
  override_type: 'leave' | 'absence' | 'training' | 'unavailable' | 'extra_availability'
  status: 'planned' | 'confirmed' | 'cancelled'
  reason: string | null
  created_by: string | null
  created_at: string
}

export interface ScoringCandidate {
  employee_id: string
  employee_name: string
  crew_id: string | null
  department_id: string
  skills: Array<{ process_id: string; proficiency_level: number }>
  weekly_hours_contracted: number
  is_available: boolean
  recent_process_ids: string[]
}

export interface AbsenceContext {
  employee_id: string
  employee_name: string
  crew_id: string | null
  department_id: string
  affected_process_ids: string[]
  period_start: string
  period_end: string
}

export interface ScoredCandidate {
  employee_id: string
  employee_name: string
  score: number
  confidence: 'high' | 'medium' | 'low'
  breakdown: {
    skill_score: number
    availability_score: number
    proximity_score: number
    recency_score: number
  }
  matching_processes: string[]
}

export interface AbsenceImpact {
  affected_processes: Array<{
    process_id: string
    process_name: string
    coverage_before: number
    coverage_after: number
    fte_lost: number
  }>
  total_shifts_uncovered: number
  overall_coverage_drop: number
}
