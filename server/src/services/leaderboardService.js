import Result from '../models/Result.js';
import ParticipantSession from '../models/ParticipantSession.js';
import logger from '../utils/logger.js';

/**
 * Server-generated leaderboard.
 * Deterministic ranking by score descending, then name ascending for ties.
 */
async function computeLeaderboard(roomId) {
  const participants = await ParticipantSession.find({ room: roomId });

  // Sort: score desc, then name asc for deterministic tie-breaking
  participants.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.participantName.localeCompare(b.participantName);
  });

  // Assign ranks
  const leaderboard = participants.map((p, index) => ({
    participantId: p._id,
    participantName: p.participantName,
    score: p.score,
    rank: index + 1,
  }));

  return leaderboard;
}

async function persistFinalResults(roomId) {
  const leaderboard = await computeLeaderboard(roomId);

  const results = leaderboard.map((entry) => ({
    room: roomId,
    participantSession: entry.participantId,
    participantName: entry.participantName,
    score: entry.score,
    rank: entry.rank,
  }));

  await Result.insertMany(results);
  logger.info(`Final results persisted: room=${roomId} count=${results.length}`);
  return results;
}

export { computeLeaderboard, persistFinalResults };
