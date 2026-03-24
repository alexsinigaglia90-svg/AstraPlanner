/** Proficiency multipliers from src/types/solver.ts */
export const PROFICIENCY_MULTIPLIERS: Record<number, number> = {
  1: 0.6,   // Novice
  2: 0.8,   // Basic
  3: 1.0,   // Competent
  4: 1.15,  // Proficient
  5: 1.3,   // Expert
}

/** Coverage thresholds for heatmap colors */
export const COVERAGE_THRESHOLDS = {
  over: 110,    // blue: overstaffed
  met: 90,      // green: covered
  under: 70,    // amber: tight
  // below 70 = gap (red)
} as const

/** Default effective hours per FTE per week */
export const DEFAULT_WEEKLY_HOURS = 40
