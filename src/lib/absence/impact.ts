import type { AbsenceImpact } from './types'

interface ProcessImpactInput {
  process_id: string
  process_name: string
  fte_needed: number
  fte_available: number
  employee_fte_contribution: number
}

interface ImpactInput {
  absentEmployeeId: string
  processes: ProcessImpactInput[]
}

export function calculateImpact(input: ImpactInput): AbsenceImpact {
  const affected_processes = input.processes.map((p) => {
    const coverageBefore = p.fte_needed > 0 ? Math.round((p.fte_available / p.fte_needed) * 100) : 100
    const newAvailable = Math.max(0, p.fte_available - p.employee_fte_contribution)
    const coverageAfter = p.fte_needed > 0 ? Math.round((newAvailable / p.fte_needed) * 100) : 100
    return { process_id: p.process_id, process_name: p.process_name, coverage_before: coverageBefore, coverage_after: coverageAfter, fte_lost: p.employee_fte_contribution }
  })

  const totalFteNeeded = input.processes.reduce((s, p) => s + p.fte_needed, 0)
  const totalFteLost = input.processes.reduce((s, p) => s + p.employee_fte_contribution, 0)
  const overall_coverage_drop = totalFteNeeded > 0 ? Math.round((totalFteLost / totalFteNeeded) * 100) : 0
  const total_shifts_uncovered = affected_processes.filter((p) => p.coverage_after < 100).length

  return { affected_processes, total_shifts_uncovered, overall_coverage_drop }
}
