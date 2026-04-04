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
import { solveGreedy } from '@/lib/solver/greedy'

// ---------------------------------------------------------------------------
// Eligible pair: one (employee, demand) combination the solver may select
// ---------------------------------------------------------------------------
interface EligiblePair {
  index: number // variable index (x0, x1, ...)
  employee: EmployeeRecord
  demand: ProcessDemand
  slot: TimeSlot
  shiftHours: number
  costEstimate: number
  skillMultiplier: number
}

// ---------------------------------------------------------------------------
// HiGHS MIP Solver
// ---------------------------------------------------------------------------

/**
 * Solves the workforce assignment problem using HiGHS MIP (Mixed Integer
 * Programming) via the `highs` WASM package. If HiGHS is unavailable at
 * runtime, falls back to the greedy solver.
 *
 * The LP model uses binary decision variables — one per eligible
 * (employee, demand-slot) pair — with constraints for:
 *   - Each employee assigned at most once per time slot
 *   - Each demand slot filled up to required_fte
 *   - Weekly hour limits per employee
 */
export async function solveHiGHS(
  input: SolverInput,
  laborRules: LaborRules = NL_DEFAULTS,
): Promise<SolverOutput> {
  const startTime = performance.now()

  // 1. Dynamic-import HiGHS; fall back to greedy on failure
  let solverFactory: (opts?: Record<string, unknown>) => Promise<unknown>
  try {
    const mod = await import('highs')
    solverFactory = (mod as { default: typeof solverFactory }).default ?? (mod as unknown as typeof solverFactory)
  } catch {
    const greedy = solveGreedy(input, laborRules)
    return {
      ...greedy,
      metrics: {
        ...greedy.metrics,
        solver_strategy_used: 'highs_mip_fallback_greedy',
      },
    }
  }

  // 2. Build lookup maps
  const slotLookup = new Map<string, TimeSlot>()
  for (const slot of input.time_slots) {
    slotLookup.set(slot.id, slot)
  }

  // 3. Build eligible (employee, demand) pairs
  const pairs: EligiblePair[] = []
  let varIndex = 0

  for (const demand of input.demand) {
    const slot = slotLookup.get(demand.time_slot_id)
    if (!slot) continue

    const shiftHours = slot.duration_minutes / 60
    const startHour = new Date(slot.period_start).getUTCHours()
    const endHour = new Date(slot.period_end).getUTCHours()
    const dateStr = slot.period_start.slice(0, 10)
    const weekend = isWeekendDay(dateStr)
    const night = isNightHours(startHour, endHour)

    for (const emp of input.employees) {
      // Skill check
      const skill = emp.skills.find((s) => s.process_id === demand.process_id)
      if (!skill) continue
      if (!checkSkillEligibility(skill.proficiency_level, demand.min_skill_level)) continue

      // Availability check
      const slotStart = new Date(slot.period_start).getTime()
      const slotEnd = new Date(slot.period_end).getTime()
      const hasAvailability = emp.availability.some((aw) => {
        const awStart = new Date(aw.start).getTime()
        const awEnd = new Date(aw.end).getTime()
        return awStart <= slotStart && awEnd >= slotEnd
      })
      if (!hasAvailability) continue

      // Not already locked to this slot
      const isLocked = input.locked_assignments.some(
        (la) => la.employee_id === emp.id && la.time_slot_id === demand.time_slot_id,
      )
      if (isLocked) continue

      const isOvertime = emp.current_week_hours + shiftHours > emp.weekly_hours_contracted
      const costEstimate = calculateAssignmentCost({
        hourlyRate: emp.hourly_rate,
        hours: shiftHours,
        isOvertime,
        isNightShift: night,
        isWeekend: weekend,
        laborRules,
      })

      pairs.push({
        index: varIndex++,
        employee: emp,
        demand,
        slot,
        shiftHours,
        costEstimate,
        skillMultiplier: skill.productivity_multiplier,
      })
    }
  }

  // If no eligible pairs, return locked assignments only
  if (pairs.length === 0) {
    return buildEmptyResult(input, startTime)
  }

  // 4. Build CPLEX LP format problem string
  const lpString = buildLpProblem(input, pairs, laborRules)

  // 5. Solve
  type HiGHSSolver = { solve: (lp: string) => HiGHSResult }
  interface HiGHSColumnInfo { Primal: number }
  interface HiGHSResult {
    Status: string
    Columns: Record<string, HiGHSColumnInfo>
    ObjectiveValue?: number
  }

  let result: HiGHSResult
  try {
    const solver = await solverFactory() as HiGHSSolver
    result = solver.solve(lpString)
  } catch {
    const greedy = solveGreedy(input, laborRules)
    return {
      ...greedy,
      metrics: {
        ...greedy.metrics,
        solver_strategy_used: 'highs_mip_fallback_greedy',
      },
    }
  }

  // 6. If infeasible, fall back to greedy
  if (result.Status !== 'Optimal' && result.Status !== 'Feasible') {
    const greedy = solveGreedy(input, laborRules)
    return {
      ...greedy,
      metrics: {
        ...greedy.metrics,
        solver_strategy_used: 'highs_mip_fallback_greedy',
      },
    }
  }

  // 7. Parse selected assignments (Primal > 0.5 for binary vars)
  const selectedPairs: EligiblePair[] = []
  for (const pair of pairs) {
    const varName = `x${pair.index}`
    const col = result.Columns[varName]
    if (col && col.Primal > 0.5) {
      selectedPairs.push(pair)
    }
  }

  // 8. Build assignments (include locked first)
  const assignments: Assignment[] = [...input.locked_assignments]

  for (const pair of selectedPairs) {
    const skill = pair.employee.skills.find((s) => s.process_id === pair.demand.process_id)
    assignments.push({
      employee_id: pair.employee.id,
      process_id: pair.demand.process_id,
      time_slot_id: pair.demand.time_slot_id,
      shift_pattern_id: 'auto',
      scheduled_hours: pair.shiftHours,
      cost_estimate: pair.costEstimate,
      assignment_source: 'optimizer',
      proficiency_level: skill?.proficiency_level ?? 3,
    })
  }

  // 9. Build unmet demand
  const unmetDemand = computeUnmetDemand(input, assignments)

  // 10. Compute metrics
  const totalCost = assignments.reduce((sum, a) => sum + a.cost_estimate, 0)
  const totalRequired = input.demand.reduce((sum, d) => sum + d.required_fte, 0)
  const totalGap = unmetDemand.reduce((sum, u) => sum + u.gap_fte, 0)
  const coveragePct = totalRequired > 0 ? ((totalRequired - totalGap) / totalRequired) * 100 : 100

  // Overtime hours
  const empHours = new Map<string, number>()
  for (const emp of input.employees) {
    empHours.set(emp.id, emp.current_week_hours)
  }
  for (const a of assignments) {
    empHours.set(a.employee_id, (empHours.get(a.employee_id) ?? 0) + a.scheduled_hours)
  }
  let overtimeHours = 0
  for (const emp of input.employees) {
    const total = empHours.get(emp.id) ?? 0
    overtimeHours += Math.max(0, total - emp.weekly_hours_contracted)
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
      optimality_gap: result.Status === 'Optimal' ? 0 : null,
      solver_strategy_used: 'highs_mip',
    },
  }
}

// ---------------------------------------------------------------------------
// LP Model Builder (CPLEX LP format)
// ---------------------------------------------------------------------------

function buildLpProblem(
  input: SolverInput,
  pairs: EligiblePair[],
  _laborRules: LaborRules,
): string {
  const wCost = input.objective.minimize_cost_weight
  const wCoverage = input.objective.maximize_coverage_weight
  const wSkill = input.objective.maximize_skill_match_weight

  // Determine a large reward that ensures coverage always dominates cost.
  // The maximum possible cost per assignment is the upper bound for scaling.
  const maxCost = Math.max(...pairs.map((p) => p.costEstimate), 1)

  // Objective: minimise (wCost * cost - coverageReward - skillBonus) per variable.
  // The coverage reward is scaled to exceed the maximum cost contribution so that
  // assigning an employee is always preferred over leaving demand unmet.
  const objTerms = pairs.map((p) => {
    const costTerm = wCost * p.costEstimate
    const coverageReward = wCoverage * maxCost * 10
    const skillBonus = wSkill * p.skillMultiplier * maxCost
    const coeff = costTerm - coverageReward - skillBonus
    return formatTerm(coeff, `x${p.index}`)
  })

  const lines: string[] = []
  lines.push('Minimize')
  lines.push(`obj: ${objTerms.join(' ')}`)
  lines.push('Subject To')

  // Constraint: each employee max 1 assignment per time slot
  const empSlotGroups = new Map<string, number[]>()
  for (const p of pairs) {
    const key = `${p.employee.id}::${p.demand.time_slot_id}`
    const group = empSlotGroups.get(key) ?? []
    group.push(p.index)
    empSlotGroups.set(key, group)
  }

  let cIdx = 0
  for (const [, indices] of empSlotGroups) {
    if (indices.length > 1) {
      const terms = indices.map((i) => `x${i}`).join(' + ')
      lines.push(`es${cIdx++}: ${terms} <= 1`)
    }
  }

  // Constraint: demand per slot <= required_fte (minus locked)
  const lockedCount = new Map<string, number>()
  for (const la of input.locked_assignments) {
    const key = `${la.process_id}::${la.time_slot_id}`
    lockedCount.set(key, (lockedCount.get(key) ?? 0) + 1)
  }

  const demandGroups = new Map<string, number[]>()
  for (const p of pairs) {
    const key = `${p.demand.process_id}::${p.demand.time_slot_id}`
    const group = demandGroups.get(key) ?? []
    group.push(p.index)
    demandGroups.set(key, group)
  }

  for (const demand of input.demand) {
    const key = `${demand.process_id}::${demand.time_slot_id}`
    const indices = demandGroups.get(key)
    if (!indices || indices.length === 0) continue
    const alreadyFilled = lockedCount.get(key) ?? 0
    const remaining = Math.max(0, demand.required_fte - alreadyFilled)
    const terms = indices.map((i) => `x${i}`).join(' + ')
    lines.push(`d${cIdx++}: ${terms} <= ${remaining}`)
  }

  // Constraint: max weekly hours per employee
  const empPairs = new Map<string, EligiblePair[]>()
  for (const p of pairs) {
    const group = empPairs.get(p.employee.id) ?? []
    group.push(p)
    empPairs.set(p.employee.id, group)
  }

  for (const emp of input.employees) {
    const empGroup = empPairs.get(emp.id)
    if (!empGroup || empGroup.length === 0) continue

    const maxRemainingHours = Math.max(0, emp.weekly_hours_contracted - emp.current_week_hours)
    if (maxRemainingHours <= 0) continue // already at capacity; variables bounded 0..1 won't help

    const terms = empGroup.map((p) => `${p.shiftHours} x${p.index}`).join(' + ')
    lines.push(`wh${cIdx++}: ${terms} <= ${maxRemainingHours}`)
  }

  // Binary variable declarations
  const binVars = pairs.map((p) => `x${p.index}`).join(' ')
  lines.push('Binary')
  lines.push(binVars)
  lines.push('End')

  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTerm(coeff: number, varName: string): string {
  if (coeff >= 0) {
    return `+ ${coeff} ${varName}`
  }
  return `- ${Math.abs(coeff)} ${varName}`
}

function computeUnmetDemand(
  input: SolverInput,
  assignments: Assignment[],
): UnmetDemandSlot[] {
  const assignedCount = new Map<string, number>()
  for (const a of assignments) {
    const key = `${a.process_id}::${a.time_slot_id}`
    assignedCount.set(key, (assignedCount.get(key) ?? 0) + 1)
  }

  const unmet: UnmetDemandSlot[] = []
  for (const demand of input.demand) {
    const key = `${demand.process_id}::${demand.time_slot_id}`
    const assigned = assignedCount.get(key) ?? 0
    if (assigned < demand.required_fte) {
      unmet.push({
        process_id: demand.process_id,
        time_slot_id: demand.time_slot_id,
        required_fte: demand.required_fte,
        assigned_fte: assigned,
        gap_fte: demand.required_fte - assigned,
      })
    }
  }
  return unmet
}

function buildEmptyResult(input: SolverInput, startTime: number): SolverOutput {
  const assignments = [...input.locked_assignments]
  const unmetDemand = computeUnmetDemand(input, assignments)
  const totalCost = assignments.reduce((sum, a) => sum + a.cost_estimate, 0)
  const totalRequired = input.demand.reduce((sum, d) => sum + d.required_fte, 0)
  const totalGap = unmetDemand.reduce((sum, u) => sum + u.gap_fte, 0)
  const coveragePct = totalRequired > 0 ? ((totalRequired - totalGap) / totalRequired) * 100 : 100

  return {
    assignments,
    unmet_demand: unmetDemand,
    soft_constraint_violations: [],
    metrics: {
      total_cost: totalCost,
      coverage_percentage: coveragePct,
      overtime_hours: 0,
      solve_time_ms: performance.now() - startTime,
      optimality_gap: 0,
      solver_strategy_used: 'highs_mip',
    },
  }
}
