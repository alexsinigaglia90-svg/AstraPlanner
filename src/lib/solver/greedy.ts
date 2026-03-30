import type {
  SolverInput,
  SolverOutput,
  Assignment,
  UnmetDemandSlot,
  TimeSlot,
  EmployeeRecord,
  ProcessDemand,
} from '@/types/solver'
import { checkSkillEligibility } from '@/lib/solver/constraints'
import { calculateAssignmentCost, isNightHours, isWeekendDay } from '@/lib/solver/cost'
import type { LaborRules } from '@/lib/solver/nl-defaults'
import { NL_DEFAULTS } from '@/lib/solver/nl-defaults'

// ---------------------------------------------------------------------------
// Employee runtime state tracked during solving
// ---------------------------------------------------------------------------
interface EmployeeState {
  weekHours: number
  assignedSlots: Set<string>
}

// ---------------------------------------------------------------------------
// Internal scored candidate
// ---------------------------------------------------------------------------
interface ScoredCandidate {
  employee: EmployeeRecord
  score: number
  productivityMultiplier: number
}

// ---------------------------------------------------------------------------
// Greedy Solver
// ---------------------------------------------------------------------------

/**
 * Assigns employees to process demands using a greedy heuristic.
 *
 * Demands are sorted by required_fte descending so the largest gaps are filled
 * first. Candidates are scored by skill match, overtime avoidance, and workload
 * balance, then the top-N are assigned.
 */
export function solveGreedy(
  input: SolverInput,
  laborRules: LaborRules = NL_DEFAULTS,
): SolverOutput {
  const startTime = performance.now()

  // 1. Initialise employee state
  const empState = new Map<string, EmployeeState>()
  for (const emp of input.employees) {
    empState.set(emp.id, {
      weekHours: emp.current_week_hours,
      assignedSlots: new Set<string>(),
    })
  }

  // 2. Copy locked assignments to output and update state
  const assignments: Assignment[] = [...input.locked_assignments]
  const slotLookup = new Map<string, TimeSlot>()
  for (const slot of input.time_slots) {
    slotLookup.set(slot.id, slot)
  }

  for (const locked of input.locked_assignments) {
    const state = empState.get(locked.employee_id)
    if (state) {
      state.assignedSlots.add(locked.time_slot_id)
      state.weekHours += locked.scheduled_hours
    }
  }

  // 3. Build demand-keyed count of locked assignments
  const lockedCount = new Map<string, number>()
  for (const locked of input.locked_assignments) {
    const key = `${locked.process_id}::${locked.time_slot_id}`
    lockedCount.set(key, (lockedCount.get(key) ?? 0) + 1)
  }

  // 4. Sort demand by required_fte DESC
  const sortedDemand = [...input.demand].sort(
    (a, b) => b.required_fte - a.required_fte,
  )

  const unmetDemand: UnmetDemandSlot[] = []
  const employeeLookup = new Map<string, EmployeeRecord>()
  for (const emp of input.employees) {
    employeeLookup.set(emp.id, emp)
  }

  // 5. For each demand slot, find and assign candidates
  for (const demand of sortedDemand) {
    const demandKey = `${demand.process_id}::${demand.time_slot_id}`
    const alreadyAssigned = lockedCount.get(demandKey) ?? 0
    const needed = Math.max(0, demand.required_fte - alreadyAssigned)

    if (needed === 0) continue

    const slot = slotLookup.get(demand.time_slot_id)
    if (!slot) continue

    const shiftHours = slot.duration_minutes / 60

    // 5b. Find eligible candidates
    const candidates = findEligibleCandidates(
      input.employees,
      empState,
      demand,
      slot,
    )

    // 5c+d. Score and sort
    const scored = scoreCandidates(candidates, demand, empState)
    scored.sort((a, b) => b.score - a.score)

    // 5e. Assign top N
    let assignedCount = 0
    for (const candidate of scored) {
      if (assignedCount >= needed) break

      const state = empState.get(candidate.employee.id)!
      const isOvertime =
        state.weekHours + shiftHours > candidate.employee.weekly_hours_contracted

      const startHour = new Date(slot.period_start).getUTCHours()
      const endHour = new Date(slot.period_end).getUTCHours()
      const dateStr = slot.period_start.slice(0, 10)

      const costEstimate = calculateAssignmentCost({
        hourlyRate: candidate.employee.hourly_rate,
        hours: shiftHours,
        isOvertime,
        isNightShift: isNightHours(startHour, endHour),
        isWeekend: isWeekendDay(dateStr),
        laborRules,
      })

      const assignment: Assignment = {
        employee_id: candidate.employee.id,
        process_id: demand.process_id,
        time_slot_id: demand.time_slot_id,
        shift_pattern_id: 'auto',
        scheduled_hours: shiftHours,
        cost_estimate: costEstimate,
        assignment_source: 'optimizer',
      }

      assignments.push(assignment)
      state.weekHours += shiftHours
      state.assignedSlots.add(demand.time_slot_id)
      assignedCount++
    }

    // 5f. Track unmet demand
    const totalAssigned = alreadyAssigned + assignedCount
    if (totalAssigned < demand.required_fte) {
      unmetDemand.push({
        process_id: demand.process_id,
        time_slot_id: demand.time_slot_id,
        required_fte: demand.required_fte,
        assigned_fte: totalAssigned,
        gap_fte: demand.required_fte - totalAssigned,
      })
    }
  }

  // 6. Calculate metrics
  const totalCost = assignments.reduce((sum, a) => sum + a.cost_estimate, 0)

  const totalRequired = input.demand.reduce((sum, d) => sum + d.required_fte, 0)
  const totalAssignedFte = totalRequired - unmetDemand.reduce((sum, u) => sum + u.gap_fte, 0)
  const coveragePct = totalRequired > 0 ? (totalAssignedFte / totalRequired) * 100 : 100

  let overtimeHours = 0
  for (const emp of input.employees) {
    const state = empState.get(emp.id)
    if (state) {
      overtimeHours += Math.max(0, state.weekHours - emp.weekly_hours_contracted)
    }
  }

  const solveTimeMs = performance.now() - startTime

  return {
    assignments,
    unmet_demand: unmetDemand,
    soft_constraint_violations: [],
    metrics: {
      total_cost: totalCost,
      coverage_percentage: coveragePct,
      overtime_hours: overtimeHours,
      solve_time_ms: solveTimeMs,
      optimality_gap: null,
      solver_strategy_used: 'greedy',
    },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findEligibleCandidates(
  employees: EmployeeRecord[],
  empState: Map<string, EmployeeState>,
  demand: ProcessDemand,
  slot: TimeSlot,
): EmployeeRecord[] {
  return employees.filter((emp) => {
    const state = empState.get(emp.id)
    if (!state) return false

    // Not already assigned to this slot
    if (state.assignedSlots.has(slot.id)) return false

    // Has required skill with sufficient proficiency
    const skill = emp.skills.find((s) => s.process_id === demand.process_id)
    if (!skill) return false
    if (!checkSkillEligibility(skill.proficiency_level, demand.min_skill_level)) {
      return false
    }

    // Has availability covering this slot
    const slotStart = new Date(slot.period_start).getTime()
    const slotEnd = new Date(slot.period_end).getTime()
    const hasAvailability = emp.availability.some((aw) => {
      const awStart = new Date(aw.start).getTime()
      const awEnd = new Date(aw.end).getTime()
      return awStart <= slotStart && awEnd >= slotEnd
    })
    if (!hasAvailability) return false

    return true
  })
}

function scoreCandidates(
  candidates: EmployeeRecord[],
  demand: ProcessDemand,
  empState: Map<string, EmployeeState>,
): ScoredCandidate[] {
  return candidates.map((emp) => {
    const skill = emp.skills.find((s) => s.process_id === demand.process_id)!
    const state = empState.get(emp.id)!

    const skillScore = skill.productivity_multiplier
    const overtimePenalty =
      state.weekHours < emp.weekly_hours_contracted ? 1.0 : 0.7
    const balanceFactor = Math.max(
      0.3,
      1 - (state.weekHours / emp.weekly_hours_contracted) * 0.3,
    )
    const score = skillScore * overtimePenalty * balanceFactor

    return { employee: emp, score, productivityMultiplier: skill.productivity_multiplier }
  })
}
