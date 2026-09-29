import config from '../config/index.js';
import Answer from '../models/Answer.js';
import ParticipantSession from '../models/ParticipantSession.js';
import logger from '../utils/logger.js';

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
 *   Rounded to 2 decimal places.
 *
 * If ratio >= 1, points = 0 (answered after time expired).
 */
function calculateIntermediateScore(correct, elapsedMs, totalDurationMs, marks) {
  if (!correct) return 0;
  if (elapsedMs <= 0) return marks;
  const ratio = Math.min(elapsedMs / totalDurationMs, 1);
  const points = Math.max(0, marks * (1 - ratio));
  return Math.round(points * 100) / 100;
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
    pointsAwarded: points,
    answeredAt: new Date(),
  });

  // Update participant score
  await ParticipantSession.findByIdAndUpdate(participantId, {
    $inc: { score: points },
    $push: { answeredQuestions: questionId },
  });

  logger.info(`Answer scored: participant=${participantId} question=${questionId} correct=${isCorrect} points=${points}`);

  return { valid: true, isCorrect, points };
}

export { calculateNormalScore, calculateIntermediateScore, validateAndScoreAnswer };
