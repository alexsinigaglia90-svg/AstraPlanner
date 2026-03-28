import { describe, it, expect } from 'vitest'
import { scoreCandidate, rankCandidates } from '@/lib/absence/scoring'
import type { ScoringCandidate, AbsenceContext } from '@/lib/absence/types'

const baseContext: AbsenceContext = {
  employee_id: 'absent-1', employee_name: 'Jan', crew_id: 'crew-1', department_id: 'dept-1',
  affected_process_ids: ['proc-outbound'], period_start: '2026-04-01', period_end: '2026-04-05',
}

const makeCandidate = (overrides: Partial<ScoringCandidate> = {}): ScoringCandidate => ({
  employee_id: 'cand-1', employee_name: 'Pieter', crew_id: 'crew-1', department_id: 'dept-1',
  skills: [{ process_id: 'proc-outbound', proficiency_level: 4 }],
  weekly_hours_contracted: 40, is_available: true, recent_process_ids: [], ...overrides,
})

describe('scoreCandidate', () => {
  it('scores a perfect match highly', () => {
    const result = scoreCandidate(makeCandidate(), baseContext)
    expect(result.score).toBeGreaterThan(80)
    expect(result.confidence).toBe('high')
  })
  it('scores 0 for unavailable candidate', () => {
    expect(scoreCandidate(makeCandidate({ is_available: false }), baseContext).score).toBe(0)
  })
  it('scores 0 for candidate without matching skill', () => {
    const result = scoreCandidate(makeCandidate({ skills: [{ process_id: 'proc-inbound', proficiency_level: 5 }] }), baseContext)
    expect(result.score).toBe(0)
    expect(result.matching_processes).toEqual([])
  })
  it('scores lower for different department', () => {
    const same = scoreCandidate(makeCandidate(), baseContext)
    const diff = scoreCandidate(makeCandidate({ department_id: 'dept-2', crew_id: 'crew-2' }), baseContext)
    expect(same.score).toBeGreaterThan(diff.score)
  })
  it('penalizes recently active on same process', () => {
    const fresh = scoreCandidate(makeCandidate(), baseContext)
    const recent = scoreCandidate(makeCandidate({ recent_process_ids: ['proc-outbound'] }), baseContext)
    expect(fresh.score).toBeGreaterThan(recent.score)
  })
})

describe('rankCandidates', () => {
  it('returns sorted by score descending, max 5', () => {
    const candidates = Array.from({ length: 8 }, (_, i) => makeCandidate({ employee_id: `c-${i}`, skills: [{ process_id: 'proc-outbound', proficiency_level: i % 5 + 1 }] }))
    const ranked = rankCandidates(candidates, baseContext)
    expect(ranked.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < ranked.length; i++) expect(ranked[i-1]!.score).toBeGreaterThanOrEqual(ranked[i]!.score)
  })
  it('filters out unavailable and zero-score', () => {
    const candidates = [makeCandidate({ employee_id: 'good' }), makeCandidate({ employee_id: 'unavail', is_available: false }), makeCandidate({ employee_id: 'no-skill', skills: [] })]
    const ranked = rankCandidates(candidates, baseContext)
    expect(ranked.every((c) => c.score > 0)).toBe(true)
    expect(ranked.find((c) => c.employee_id === 'unavail')).toBeUndefined()
  })
})
