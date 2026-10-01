import Room from '../models/Room.js';
import Session from '../models/Session.js';
import Question from '../models/Question.js';
import ParticipantSession from '../models/ParticipantSession.js';
import Result from '../models/Result.js';
import logger from '../utils/logger.js';

/**
 * Session lifecycle service.
 *
 * A Room is reusable. Each live event creates a Session document.
 * Session-specific state (participants, answers, results) is scoped
 * to the session so previous sessions never interfere with new ones.
 */

/**
 * Start a new session for a room.
 *
 * Allowed when the room has no live session (status waiting or ended).
 * The question bank and configuration are preserved untouched.
 * Participants waiting in the room are attached to the new session.
 */
async function startSession(roomId) {
  const room = await Room.findOne({ _id: roomId, isDeleted: false });
  if (!room) throw new Error('Room not found');

  if (room.status === 'active') {
    throw new Error('A session is already live for this room');
  }

  const questionCount = await Question.countDocuments({
    room: roomId,
    isActive: true,
  });
  if (questionCount === 0) {
    throw new Error('Add at least one question before starting a session');
  }

  const sessionNumber = (room.sessionCount || 0) + 1;

  const session = await Session.create({
    room: room._id,
    host: room.host,
    sessionNumber,
    status: 'active',
    mode: room.mode,
    negativeMarking: room.negativeMarking,
    correctPoints: room.correctPoints,
    negativePoints: room.negativePoints,
    questionCount,
    participantCount: 0,
  });

  // Attach waiting participants (joined between sessions) to the new session.
  await ParticipantSession.updateMany(
    { room: room._id, session: null },
    { $set: { session: session._id } }
  );

  const waitingCount = await ParticipantSession.countDocuments({
    room: room._id,
    session: session._id,
  });

  session.participantCount = waitingCount;
  await session.save();

  room.status = 'active';
  room.sessionCount = sessionNumber;
  room.currentSessionId = session._id;
  room.activeQuestionId = null;
  room.questionStartedAt = null;
  room.questionEndsAt = null;
  room.currentQuestionOrder = -1;
  room.participantCount = waitingCount;
  await room.save();

  logger.info(`Session started: room=${room.lrn} session=${sessionNumber}`);
  return { room, session };
}

/**
 * End the currently live session of a room.
 * Persists per-session results and frees the room for reuse.
 * The room keeps status 'ended' and can start a new session.
 */
async function endSession(roomId) {
  const room = await Room.findOne({ _id: roomId, isDeleted: false });
  if (!room) throw new Error('Room not found');

  if (room.status !== 'active' || !room.currentSessionId) {
    throw new Error('No live session for this room');
  }

  const session = await Session.findById(room.currentSessionId);
  if (!session || session.status !== 'active') {
    throw new Error('No live session for this room');
  }

  const participants = await ParticipantSession.find({
    room: room._id,
    session: session._id,
  })
    .select('_id participantName score')
    .sort({ score: -1, participantName: 1, _id: 1 })
    .lean();

  const results = participants.map((p, index) => ({
    room: room._id,
    session: session._id,
    sessionNumber: session.sessionNumber,
    participantSession: p._id,
    participantName: p.participantName,
    score: p.score,
    totalQuestions: room.questions.length,
    correctAnswers: 0,
    wrongAnswers: 0,
    rank: index + 1,
  }));

  if (results.length > 0) {
    await Result.insertMany(results);
  }

  session.status = 'ended';
  session.endedAt = new Date();
  session.participantCount = participants.length;
  await session.save();

  room.status = 'ended';
  room.activeQuestionId = null;
  room.questionStartedAt = null;
  room.questionEndsAt = null;
  room.currentSessionId = null;
  await room.save();

  logger.info(
    `Session ended: room=${room.lrn} session=${session.sessionNumber} results=${results.length}`
  );
  return { room, session, resultCount: results.length };
}

/**
 * List sessions of a room (host view), newest first,
 * each with participant and result counts.
 */
async function listSessions(roomId) {
  const sessions = await Session.find({ room: roomId })
    .sort({ sessionNumber: -1 })
    .lean();

  const withCounts = await Promise.all(
    sessions.map(async (s) => {
      const [participantCount, resultCount] = await Promise.all([
        ParticipantSession.countDocuments({ room: roomId, session: s._id }),
        Result.countDocuments({ room: roomId, session: s._id }),
      ]);
      return {
        _id: s._id,
        sessionNumber: s.sessionNumber,
        status: s.status,
        mode: s.mode,
        questionCount: s.questionCount,
        participantCount,
        resultCount,
        startedAt: s.startedAt,
        endedAt: s.endedAt,
      };
    })
  );

  return withCounts;
}

/**
 * Get results for one specific session (public rank/name/score only).
 */
async function getSessionResults(roomId, sessionId) {
  const session = await Session.findOne({ _id: sessionId, room: roomId });
  if (!session) throw new Error('Session not found');

  const results = await Result.find({ room: roomId, session: session._id })
    .sort({ rank: 1 })
    .lean();

  return {
    session: {
      sessionNumber: session.sessionNumber,
      status: session.status,
      mode: session.mode,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
    },
    results: results.map((r) => ({
      rank: r.rank,
      participantName: r.participantName,
      score: r.score,
    })),
  };
}

export { startSession, endSession, listSessions, getSessionResults };
