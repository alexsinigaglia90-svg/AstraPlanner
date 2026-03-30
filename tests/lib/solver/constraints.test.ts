import { describe, it, expect } from 'vitest';
import {
  checkMaxWeeklyHours,
  checkMaxConsecutiveDays,
  checkMinRestBetweenShifts,
  checkSkillEligibility,
} from '@/lib/solver/constraints';

describe('checkMaxWeeklyHours', () => {
  it('returns ok when total is under the limit', () => {
    const result = checkMaxWeeklyHours(30, 7, 40);
    expect(result.ok).toBe(true);
    expect(result.overage).toBeUndefined();
  });

  it('returns ok when total is exactly at the limit', () => {
    const result = checkMaxWeeklyHours(32, 8, 40);
    expect(result.ok).toBe(true);
    expect(result.overage).toBeUndefined();
  });

  it('returns not ok with overage when total exceeds the limit', () => {
    const result = checkMaxWeeklyHours(36, 8, 40);
    expect(result.ok).toBe(false);
    expect(result.overage).toBe(4);
  });
});

describe('checkMaxConsecutiveDays', () => {
  it('returns ok when consecutive days are below the limit', () => {
    const result = checkMaxConsecutiveDays(5, 6);
    expect(result.ok).toBe(true);
  });

  it('returns not ok when consecutive days equal the limit', () => {
    const result = checkMaxConsecutiveDays(6, 6);
    expect(result.ok).toBe(false);
  });

  it('returns not ok when consecutive days exceed the limit', () => {
    const result = checkMaxConsecutiveDays(7, 6);
    expect(result.ok).toBe(false);
  });
});

describe('checkMinRestBetweenShifts', () => {
  it('returns ok when there is no previous shift', () => {
    const result = checkMinRestBetweenShifts(22, 6, false, 11);
    expect(result.ok).toBe(true);
  });

  it('returns ok with restHours when rest meets the minimum', () => {
    // Previous shift ended at 14:00, next starts at 06:00 next day → 16h rest
    const result = checkMinRestBetweenShifts(14, 6, true, 11);
    expect(result.ok).toBe(true);
    expect(result.restHours).toBe(16);
  });

  it('returns not ok with restHours when rest is below the minimum', () => {
    // Previous shift ended at 22:00, next starts at 06:00 → 8h rest, need 11h
    const result = checkMinRestBetweenShifts(22, 6, true, 11);
    expect(result.ok).toBe(false);
    expect(result.restHours).toBe(8);
  });

  it('handles same-day rest (no overnight) correctly', () => {
    // Previous shift ended at 8:00, next starts at 20:00 → 12h rest
    const result = checkMinRestBetweenShifts(8, 20, true, 11);
    expect(result.ok).toBe(true);
    expect(result.restHours).toBe(12);
  });
});

describe('checkSkillEligibility', () => {
  it('returns true when proficiency meets the minimum', () => {
    expect(checkSkillEligibility(3, 3)).toBe(true);
  });

  it('returns true when proficiency exceeds the minimum', () => {
    expect(checkSkillEligibility(5, 2)).toBe(true);
  });

  it('returns false when proficiency is below the minimum', () => {
    expect(checkSkillEligibility(1, 3)).toBe(false);
  });

  it('returns true when no minimum is required (minRequired = 0)', () => {
    expect(checkSkillEligibility(1, 0)).toBe(true);
  });
});
