export interface ConstraintCheck {
  ok: boolean;
  overage?: number;
  restHours?: number;
}

/**
 * Checks whether assigning additional hours would exceed the weekly hour cap.
 * @param currentHours - Hours already scheduled this week
 * @param additionalHours - Hours of the shift being considered
 * @param maxHours - Maximum allowed weekly hours
 */
export function checkMaxWeeklyHours(
  currentHours: number,
  additionalHours: number,
  maxHours: number,
): ConstraintCheck {
  const total = currentHours + additionalHours;
  if (total <= maxHours) {
    return { ok: true };
  }
  return { ok: false, overage: total - maxHours };
}

/**
 * Checks whether an employee can work another day given their current consecutive day streak.
 * Strict: at exactly maxDays consecutive days the employee cannot be assigned further.
 * @param consecutiveDays - Days already worked in the current streak
 * @param maxDays - Maximum consecutive days allowed
 */
export function checkMaxConsecutiveDays(
  consecutiveDays: number,
  maxDays: number,
): ConstraintCheck {
  if (consecutiveDays < maxDays) {
    return { ok: true };
  }
  return { ok: false };
}

/**
 * Checks whether there is sufficient rest between the end of the previous shift
 * and the start of the next shift.
 * @param previousEndHour - Hour (0-23) when the previous shift ended
 * @param nextStartHour - Hour (0-23) when the next shift starts
 * @param hasPreviousShift - Whether there is a previous shift to consider
 * @param minRestHours - Minimum required rest hours between shifts
 */
export function checkMinRestBetweenShifts(
  previousEndHour: number,
  nextStartHour: number,
  hasPreviousShift: boolean,
  minRestHours: number,
): ConstraintCheck {
  if (!hasPreviousShift) {
    return { ok: true };
  }

  let rest = nextStartHour - previousEndHour;
  if (rest < 0) {
    rest += 24;
  }

  if (rest >= minRestHours) {
    return { ok: true, restHours: rest };
  }
  return { ok: false, restHours: rest };
}

/**
 * Checks whether an employee's proficiency level meets the minimum required for a role.
 * @param proficiencyLevel - The employee's proficiency level (e.g. 1-5)
 * @param minRequired - Minimum proficiency level required for the position
 */
export function checkSkillEligibility(
  proficiencyLevel: number,
  minRequired: number,
): boolean {
  return proficiencyLevel >= minRequired;
}
