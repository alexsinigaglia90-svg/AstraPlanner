/**
 * FTE Engine — converts demand volume to required FTE per process per day.
 *
 * Formula:
 *   station_hours = day_volume / uph
 *   baseline_fte = station_hours / operating_hours
 *   gross_fte = baseline_fte / (1 - absenteeism_rate) / avg_proficiency_multiplier
 *   capped_fte = min(gross_fte, max_capacity)
 */

export interface FteInput {
  day_volume: number
  uph: number
  operating_hours: number
  absenteeism_rate: number
  max_capacity: number | null
  avg_proficiency_multiplier: number
}

export interface TrainingConfig {
  requested_trainees: number
  trainee_avg_multiplier: number
}

export interface FteResult {
  station_hours: number
  baseline_fte: number
  proficiency_adjusted_fte: number
  gross_fte: number
  capped_fte: number
  training_fte: number
  total_fte: number
  capacity_warning: string | null
  training_warning: string | null
}

export function calculateFte(input: FteInput, training?: TrainingConfig): FteResult {
  const { day_volume, uph, operating_hours, absenteeism_rate, max_capacity, avg_proficiency_multiplier } = input

  const station_hours = uph > 0 ? day_volume / uph : 0
  const baseline_fte = operating_hours > 0 ? station_hours / operating_hours : 0
  const proficiency_adjusted_fte = avg_proficiency_multiplier > 0
    ? baseline_fte / avg_proficiency_multiplier
    : baseline_fte
  const gross_fte = absenteeism_rate < 1
    ? proficiency_adjusted_fte / (1 - absenteeism_rate)
    : proficiency_adjusted_fte

  const effectiveMax = max_capacity ?? Infinity
  const capped_fte = Math.min(gross_fte, effectiveMax)
  const capacity_warning = gross_fte > effectiveMax
    ? `Capaciteit onvoldoende: ${gross_fte.toFixed(1)} FTE nodig, max ${max_capacity} stations`
    : null

  let training_fte = 0
  let training_warning: string | null = null
  if (training) {
    const available_capacity = effectiveMax - capped_fte
    const actual_trainees = Math.min(training.requested_trainees, Math.max(0, Math.floor(available_capacity)))
    training_fte = actual_trainees
    if (actual_trainees < training.requested_trainees) {
      training_warning = actual_trainees === 0
        ? 'Geen trainingsruimte — demand te hoog'
        : `Trainingsruimte beperkt: ${actual_trainees} van ${training.requested_trainees} trainees`
    }
  }

  return {
    station_hours,
    baseline_fte,
    proficiency_adjusted_fte,
    gross_fte,
    capped_fte,
    training_fte,
    total_fte: capped_fte + training_fte,
    capacity_warning,
    training_warning,
  }
}

export function getOperatingHours(
  operatingHours: Record<string, { open: string; close: string }>,
  dayOfWeek: number,
): number {
  const dayKeys = ['', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
  const key = dayKeys[dayOfWeek] ?? 'mon'
  const entry = operatingHours[key]
  if (!entry) return 0

  const openMin = parseTimeToMinutes(entry.open)
  const closeMin = parseTimeToMinutes(entry.close)
  if (closeMin <= openMin) return 0
  return (closeMin - openMin) / 60
}

export function distributeFteAcrossShifts(
  totalFte: number,
  shifts: Array<{ id: string; start_time: string; end_time: string; paid_hours: number }>,
  siteOpen: string,
  siteClose: string,
): Array<{ shift_id: string; headcount: number; fte_fraction: number }> {
  const openMin = parseTimeToMinutes(siteOpen)
  const closeMin = parseTimeToMinutes(siteClose)
  const opWindow = closeMin - openMin
  if (opWindow <= 0) return []

  const results: Array<{ shift_id: string; headcount: number; fte_fraction: number }> = []
  for (const shift of shifts) {
    const shiftStart = parseTimeToMinutes(shift.start_time)
    const shiftEnd = parseTimeToMinutes(shift.end_time)
    const overlapStart = Math.max(shiftStart, openMin)
    const overlapEnd = Math.min(shiftEnd, closeMin)
    const overlapMinutes = Math.max(0, overlapEnd - overlapStart)
    if (overlapMinutes === 0) continue
    const fraction = overlapMinutes / opWindow
    results.push({ shift_id: shift.id, headcount: Math.ceil(totalFte * fraction), fte_fraction: fraction })
  }
  return results
}

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}
