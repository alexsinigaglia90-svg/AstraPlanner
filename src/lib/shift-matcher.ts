/**
 * Fuzzy matching for shift patterns during employee import.
 * Matches free-text shift values from Excel against existing shift patterns.
 *
 * Matching strategy (first match wins):
 * 1. Exact name match (case-insensitive)
 * 2. Code match (case-insensitive)
 * 3. Time pattern match ("06-14" or "06:00-14:00")
 * 4. Keyword matching based on start_time of the shift
 */

interface ShiftInfo {
  id: string
  name: string
  code: string
  start_time: string  // "HH:MM:SS" or "HH:MM"
  end_time: string
}

// Keywords grouped by shift timing
const SHIFT_KEYWORDS: { maxStartHour: number; keywords: string[] }[] = [
  {
    maxStartHour: 10,  // Early/morning shifts (start before 10:00)
    keywords: [
      'morning', 'ochtend', 'vroeg', 'early', 'dag', 'day',
      'am', 'eerste', 'first', '1e', 'ochtenddienst', 'dagdienst',
      'morgen', 'dawn', 'sunrise',
    ],
  },
  {
    maxStartHour: 18,  // Afternoon/evening shifts (start 10:00-18:00)
    keywords: [
      'afternoon', 'middag', 'laat', 'late', 'evening', 'avond',
      'pm', 'tweede', 'second', '2e', 'middagdienst', 'avonddienst',
      'noon', 'namiddag',
    ],
  },
  {
    maxStartHour: 24,  // Night shifts (start 18:00+)
    keywords: [
      'night', 'nacht', 'overnight', 'nachtdienst', 'graveyard',
      'derde', 'third', '3e', 'late night', 'nachtploeg',
    ],
  },
]

function parseHour(time: string): number {
  const parts = time.split(':')
  return parseInt(parts[0] ?? '0', 10)
}

/**
 * Match a free-text shift value against available shifts.
 * Returns the shift ID if matched, null otherwise.
 */
export function matchShift(value: string, shifts: ShiftInfo[]): string | null {
  if (!value || !value.trim() || shifts.length === 0) return null

  const normalized = value.trim().toLowerCase()

  // 1. Exact name match
  const nameMatch = shifts.find((s) => s.name.toLowerCase() === normalized)
  if (nameMatch) return nameMatch.id

  // 2. Code match
  const codeMatch = shifts.find((s) => s.code.toLowerCase() === normalized)
  if (codeMatch) return codeMatch.id

  // 3. Partial name match (input contains shift name or vice versa)
  const partialMatch = shifts.find(
    (s) =>
      normalized.includes(s.name.toLowerCase()) ||
      s.name.toLowerCase().includes(normalized),
  )
  if (partialMatch) return partialMatch.id

  // 4. Time pattern match: "06-14", "06:00-14:00", "6-14"
  const timePattern = normalized.match(/(\d{1,2})(?::?\d{2})?[\s]*[-–—][\s]*(\d{1,2})(?::?\d{2})?/)
  if (timePattern) {
    const inputStart = parseInt(timePattern[1]!, 10)
    const inputEnd = parseInt(timePattern[2]!, 10)
    const timeMatch = shifts.find((s) => {
      const shiftStart = parseHour(s.start_time)
      const shiftEnd = parseHour(s.end_time)
      return shiftStart === inputStart && shiftEnd === inputEnd
    })
    if (timeMatch) return timeMatch.id
  }

  // 5. Keyword matching based on shift start times
  for (const group of SHIFT_KEYWORDS) {
    const hasKeyword = group.keywords.some((kw) => normalized.includes(kw))
    if (hasKeyword) {
      // Find a shift whose start_time falls in this group
      const prevMaxHour = SHIFT_KEYWORDS.indexOf(group) > 0
        ? SHIFT_KEYWORDS[SHIFT_KEYWORDS.indexOf(group) - 1]!.maxStartHour
        : 0
      const keywordMatch = shifts.find((s) => {
        const startHour = parseHour(s.start_time)
        return startHour >= prevMaxHour && startHour < group.maxStartHour
      })
      if (keywordMatch) return keywordMatch.id
    }
  }

  return null
}

/**
 * Match a free-text crew value against available crews.
 * Simpler matching: exact name, code, or partial name match.
 */
export function matchCrew(
  value: string,
  crews: { id: string; name: string; code: string }[],
): string | null {
  if (!value || !value.trim() || crews.length === 0) return null

  const normalized = value.trim().toLowerCase()

  // Exact name
  const nameMatch = crews.find((c) => c.name.toLowerCase() === normalized)
  if (nameMatch) return nameMatch.id

  // Code match
  const codeMatch = crews.find((c) => c.code.toLowerCase() === normalized)
  if (codeMatch) return codeMatch.id

  // Partial name
  const partialMatch = crews.find(
    (c) =>
      normalized.includes(c.name.toLowerCase()) ||
      c.name.toLowerCase().includes(normalized),
  )
  if (partialMatch) return partialMatch.id

  return null
}
