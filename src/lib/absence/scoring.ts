import type { ScoringCandidate, AbsenceContext, ScoredCandidate } from './types'

const WEIGHTS = { skill: 0.40, availability: 0.30, proximity: 0.15, recency: 0.15 } as const

function confidenceFromScore(score: number): 'high' | 'medium' | 'low' {
  if (score >= 70) return 'high'
  if (score >= 40) return 'medium'
  return 'low'
}

export function scoreCandidate(candidate: ScoringCandidate, context: AbsenceContext): ScoredCandidate {
  if (!candidate.is_available) {
    return { employee_id: candidate.employee_id, employee_name: candidate.employee_name, score: 0, confidence: 'low', breakdown: { skill_score: 0, availability_score: 0, proximity_score: 0, recency_score: 0 }, matching_processes: [] }
  }

  const matchingSkills = candidate.skills.filter((s) => context.affected_process_ids.includes(s.process_id))
  const matching_processes = matchingSkills.map((s) => s.process_id)

  if (matchingSkills.length === 0) {
    return { employee_id: candidate.employee_id, employee_name: candidate.employee_name, score: 0, confidence: 'low', breakdown: { skill_score: 0, availability_score: 100, proximity_score: 0, recency_score: 0 }, matching_processes: [] }
  }

  const bestProficiency = Math.max(...matchingSkills.map((s) => s.proficiency_level))
  const skill_score = bestProficiency * 20
  const availability_score = 100

  let proximity_score = 20
  if (candidate.crew_id && candidate.crew_id === context.crew_id) proximity_score = 100
  else if (candidate.department_id === context.department_id) proximity_score = 60

  const wasRecent = candidate.recent_process_ids.some((pid) => context.affected_process_ids.includes(pid))
  const recency_score = wasRecent ? 30 : 100

  const score = Math.round(
    skill_score * WEIGHTS.skill + availability_score * WEIGHTS.availability +
    proximity_score * WEIGHTS.proximity + recency_score * WEIGHTS.recency
  )

  return { employee_id: candidate.employee_id, employee_name: candidate.employee_name, score, confidence: confidenceFromScore(score), breakdown: { skill_score, availability_score, proximity_score, recency_score }, matching_processes }
}

export function rankCandidates(candidates: ScoringCandidate[], context: AbsenceContext, maxResults = 5): ScoredCandidate[] {
  return candidates.map((c) => scoreCandidate(c, context)).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, maxResults)
}
