import config from '../config/index.js';
import Answer from '../models/Answer.js';
import ParticipantSession from '../models/ParticipantSession.js';
import logger from '../utils/logger.js';

/**
 * VLITE SCORE PRECISION POLICY (single source of truth)
 *
 * - All scores are stored rounded to SCORE_DECIMALS decimal places
 *   using conventional round-half-up (Math.round).
 * - The UI must display scores with exactly SCORE_DECIMALS decimals
 *   (see client/src/utils/format.js `formatScore`).
 * - Leaderboards sort on the authoritative numeric score, never on
 *   formatted strings; ties keep the existing deterministic rule
 *   (score desc, name asc, id asc).
 *
 * This keeps stored values deterministic across server restarts and
 * prevents binary floating-point artifacts (e.g. 7.777777777777777)
 * from ever reaching the UI.
 */
const SCORE_DECIMALS = 2;

function roundScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** SCORE_DECIMALS;
  return Math.round((n + Number.EPSILON) * factor) / factor;
}

/**
 * Normal mode: fixed points, no speed factor.
 */
function calculateNormalScore(correct, roomConfig) {
  if (correct) return roomConfig.correctPoints;
  if (roomConfig.negativeMarking) return -roomConfig.negativePoints;
  return 0;
}

/**
 * Intermediate mode: speed-based scoring.
 * Earlier answers get more points, later answers fewer.
 *
 * Formula:
 *   elapsed = serverNow - questionStartedAt (ms)
 *   ratio = elapsed / (durationSeconds * 1000)
 *   points = max(0, marks * (1 - ratio))
 *   Stored rounded per SCORE_DECIMALS (see policy above).
 *
 * If ratio >= 1, points = 0 (answered after time expired).
 */
function calculateIntermediateScore(correct, elapsedMs, totalDurationMs, marks) {
  if (!correct) return 0;
  if (elapsedMs <= 0) return roundScore(marks);
  const ratio = Math.min(elapsedMs / totalDurationMs, 1);
  const points = Math.max(0, marks * (1 - ratio));
  return roundScore(points);
}

/**
 * Server-side answer validation and scoring.
 * Returns { isCorrect, points, reason }
 */
async function validateAndScoreAnswer({
  participantId,
  questionId,
  roomId,
  selectedOptionIndex,
  questionData,
  roomConfig,
}) {
  // Check for duplicate answer
  const existing = await Answer.findOne({ participantSession: participantId, question: questionId });
  if (existing) {
    return { valid: false, reason: 'duplicate_answer', points: 0 };
  }

  const isCorrect = selectedOptionIndex === questionData.correctAnswerIndex;
  let points = 0;

  if (roomConfig.mode === 'intermediate') {
    // For intermediate mode, caller must pass timing info
    points = calculateIntermediateScore(
      isCorrect,
      0, // placeholder - caller should pass actual elapsed time
      (questionData.durationSeconds || 30) * 1000,
      questionData.marks || roomConfig.correctPoints
    );
  } else {
    // Normal mode
    points = calculateNormalScore(isCorrect, roomConfig);
  }

  // Save answer record
  await Answer.create({
    participantSession: participantId,
    question: questionId,
    room: roomId,
    selectedOptionIndex,
    isCorrect,
    pointsAwarded: roundScore(points),
    answeredAt: new Date(),
  });

  // Update participant score
  await ParticipantSession.findByIdAndUpdate(participantId, {
    $inc: { score: roundScore(points) },
    $push: { answeredQuestions: questionId },
  });

  logger.info(`Answer scored: participant=${participantId} question=${questionId} correct=${isCorrect} points=${points}`);

  return { valid: true, isCorrect, points: roundScore(points) };
}

export { calculateNormalScore, calculateIntermediateScore, validateAndScoreAnswer, roundScore, SCORE_DECIMALS };
