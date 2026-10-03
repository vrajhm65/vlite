import { describe, it, expect } from '@jest/globals';
import {
  calculateNormalScore,
  calculateIntermediateScore,
  roundScore,
  SCORE_DECIMALS,
} from '../src/services/scoringService.js';

/**
 * Score precision policy tests (pure functions, no database).
 *
 * Policy: conventional round-half-up to SCORE_DECIMALS places at
 * write time; UI displays exactly SCORE_DECIMALS decimals.
 * Leaderboards sort on the authoritative numeric score.
 */
describe('Score precision policy', () => {
  it('exposes a 2-decimal policy', () => {
    expect(SCORE_DECIMALS).toBe(2);
  });

  it('roundScore rounds half up to 2 decimals', () => {
    expect(roundScore(7.777777777777777)).toBe(7.78);
    expect(roundScore(3.333333333)).toBe(3.33);
    expect(roundScore(1.666666666)).toBe(1.67);
    expect(roundScore(10)).toBe(10);
    expect(roundScore(8.5)).toBe(8.5);
    expect(roundScore(9.999999999)).toBe(10);
    expect(roundScore(-2)).toBe(-2);
    expect(roundScore(NaN)).toBe(0);
    expect(roundScore(undefined)).toBe(0);
  });

  it('intermediate scoring never returns more than 2 decimals', () => {
    const samples = [
      [true, 2222, 10000, 10],
      [true, 3333, 10000, 10],
      [true, 1666, 10000, 10],
      [true, 1, 30000, 10],
      [true, 29999, 30000, 10],
    ];
    for (const [correct, elapsed, total, marks] of samples) {
      const points = calculateIntermediateScore(correct, elapsed, total, marks);
      expect(points).toBe(roundScore(points));
      expect(String(points).split('.')[1]?.length || 0).toBeLessThanOrEqual(2);
    }
  });

  it('intermediate scoring stays within bounds', () => {
    expect(calculateIntermediateScore(true, 0, 10000, 10)).toBe(10);
    expect(calculateIntermediateScore(true, 10000, 10000, 10)).toBe(0);
    expect(calculateIntermediateScore(true, 99999, 10000, 10)).toBe(0);
    expect(calculateIntermediateScore(false, 0, 10000, 10)).toBe(0);
  });

  it('accumulated sums stay display-clean after rounding', () => {
    // Simulate several intermediate awards accumulated via $inc,
    // then rounded at write time like the server does.
    const awards = [9.96, 7.78, 3.33, 10, -2];
    let total = 0;
    for (const a of awards) total = roundScore(total + roundScore(a));
    expect(total).toBe(roundScore(total));
    expect(total.toFixed(2)).toBe('29.07');
  });

  it('normal mode scores are exact integers', () => {
    const cfg = { correctPoints: 10, negativeMarking: true, negativePoints: 2 };
    expect(calculateNormalScore(true, cfg)).toBe(10);
    expect(calculateNormalScore(false, cfg)).toBe(-2);
    expect(Number.isInteger(calculateNormalScore(true, cfg))).toBe(true);
  });
});
