/**
 * Central score formatting (single source of truth for display).
 *
 * Policy (mirrors server/src/services/scoringService.js):
 * conventional round-half-up to 2 decimals, always displayed with
 * exactly 2 decimal places: 10 -> "10.00", 8.5 -> "8.50",
 * 7.777777777 -> "7.78".
 *
 * Never sort on formatted strings — ranking always uses the
 * authoritative numeric score from the server.
 */
export const SCORE_DECIMALS = 2;

export function roundScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** SCORE_DECIMALS;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

export function formatScore(value) {
  return roundScore(value).toFixed(SCORE_DECIMALS);
}

/** "+7.78 pts" / "-2.00 pts" style for answer feedback. */
export function formatPoints(value) {
  const rounded = roundScore(value);
  return `${rounded >= 0 ? '+' : ''}${rounded.toFixed(SCORE_DECIMALS)}`;
}
