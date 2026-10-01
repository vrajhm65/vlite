import Room from '../../models/Room.js';
import ParticipantSession from '../../models/ParticipantSession.js';
import Answer from '../../models/Answer.js';
import Question from '../../models/Question.js';
import Session from '../../models/Session.js';

import {
  emitToRoom,
  broadcastToRoom,
  joinRoomSocket,
  isHostSocketForRoom,
  isParticipantSocketForRoom,
} from '../roomSocket.js';

import {
  calculateNormalScore,
  calculateIntermediateScore,
} from '../../services/scoringService.js';

import expertQueue from '../../services/expertModeService.js';
import { startSession, endSession } from '../../services/sessionService.js';
import logger from '../../utils/logger.js';

const EXPERT_ANSWER_SECONDS = Number(
  process.env.EXPERT_ANSWER_SECONDS || 5
);

/**
 * Active question timers per room.
 * Key: roomId, Value: setTimeout handle
 */
const questionTimers = new Map();

/**
 * Convert Mongo ObjectId safely to string.
 */
function idString(value) {
  return value ? String(value) : '';
}

/**
 * Public question data.
 *
 * IMPORTANT:
 * correctAnswerIndex is NEVER sent to participants.
 */
function serializeQuestionForParticipant(question, timing) {
  return {
    _id: question._id,
    text: question.text,
    imageUrl: question.imageUrl || '',
    options: question.options.map((option) => ({
      label: option.label,
      text: option.text,
    })),
    durationSeconds: question.durationSeconds,
    order: question.order,

    questionStartedAt: timing.questionStartedAt,
    questionEndsAt: timing.questionEndsAt,
  };
}

/**
 * Host-only question representation.
 *
 * Host may receive the answer because host controls the session.
 */
function serializeQuestionForHost(question, timing) {
  return {
    ...serializeQuestionForParticipant(question, timing),
    correctAnswerIndex: question.correctAnswerIndex,
    explanation: question.explanation || '',
    marks: question.marks,
  };
}

/**
 * Build the Mongo filter for "participants of the current live
 * session, or the waiting pool when no session is live".
 *
 * Previous sessions never leak into a new live session.
 */
function sessionScope(room) {
  if (room.currentSessionId) {
    return { room: room._id, session: room.currentSessionId };
  }
  return { room: room._id, session: null };
}

/**
 * Broadcast the live participant count of a room.
 *
 * Count = participants currently connected in the live session
 * (or waiting pool). Scores/leaderboard keep disconnected
 * participants so reconnecting preserves their progress.
 */
async function broadcastParticipantCount(io, roomId) {
  const room = await Room.findOne({ _id: roomId, isDeleted: false }).select(
    '_id currentSessionId'
  );
  if (!room) return;

  const participantCount = await ParticipantSession.countDocuments({
    ...sessionScope(room),
    isConnected: true,
  });

  await Room.findByIdAndUpdate(room._id, { participantCount });

  emitToRoom(io, roomId, 'participant:count', {
    roomId,
    participantCount,
  });

  return participantCount;
}

/**
 * Build current room state for a socket.
 */
async function getRoomState(room, socket) {
  const scope = sessionScope(room);
  const participantCount = await ParticipantSession.countDocuments({
    ...scope,
    isConnected: true,
  });

  let sessionInfo = null;
  if (room.currentSessionId) {
    const live = await Session.findById(room.currentSessionId)
      .select('sessionNumber status')
      .lean();
    if (live) {
      sessionInfo = {
        sessionId: String(room.currentSessionId),
        sessionNumber: live.sessionNumber,
        sessionStatus: live.status,
      };
    }
  }

  const state = {
    roomId: room._id,
    lrn: room.lrn,
    name: room.name,
    status: room.status,
    mode: room.mode,
    participantCount,
    maxParticipants: room.maxParticipants,
    session: sessionInfo,
    activeQuestion: null,
  };

  if (!room.activeQuestionId) {
    return state;
  }

  const question = await Question.findOne({
    _id: room.activeQuestionId,
    room: room._id,
    isActive: true,
  });

  if (!question) {
    return state;
  }

  const timing = {
    questionStartedAt: room.questionStartedAt,
    questionEndsAt: room.questionEndsAt,
  };

  if (socket.user?.role === 'host') {
    state.activeQuestion = serializeQuestionForHost(question, timing);
  } else {
    state.activeQuestion = serializeQuestionForParticipant(
      question,
      timing
    );
  }

  state.totalQuestions = room.questions.length;

  return state;
}

/**
 * Find participant session associated with socket.
 */
async function getParticipantSession(socket) {
  if (socket.user?.role !== 'participant') {
    return null;
  }

  if (!socket.participantSessionId) {
    return null;
  }

  return ParticipantSession.findById(socket.participantSessionId);
}

/**
 * Handle joining a VLITE room.
 */
async function handleJoinRoom(io, socket, { roomId }) {
  if (!roomId) {
    socket.emit('vlite:error', {
      code: 'ROOM_ID_REQUIRED',
      message: 'Room ID is required.',
    });
    return;
  }

  const room = await Room.findOne({
    _id: roomId,
    isDeleted: false,
  });

  if (!room) {
    socket.emit('vlite:error', {
      code: 'ROOM_NOT_FOUND',
      message: 'Room not found.',
    });
    return;
  }

  if (room.status === 'ended') {
    socket.emit('vlite:error', {
      code: 'ROOM_ENDED',
      message: 'This session has ended.',
    });
    return;
  }

  /**
   * Host authorization.
   */
  if (socket.user?.role === 'host') {
    if (!isHostSocketForRoom(socket, room)) {
      socket.emit('vlite:error', {
        code: 'HOST_NOT_AUTHORIZED',
        message: 'You are not authorized for this room.',
      });
      return;
    }
  }

  /**
   * Participant authorization.
   *
   * NOTE: socket.roomId is only set AFTER joining, so here we
   * verify the JWT-bound participantRoomId instead.
   */
  if (socket.user?.role === 'participant') {
    if (String(socket.participantRoomId) !== String(roomId)) {
      socket.emit('vlite:error', {
        code: 'PARTICIPANT_NOT_AUTHORIZED',
        message: 'This participant session does not belong to this room.',
      });
      return;
    }

    const session = await getParticipantSession(socket);

    if (!session) {
      socket.emit('vlite:error', {
        code: 'SESSION_NOT_FOUND',
        message: 'Participant session not found.',
      });
      return;
    }

    await ParticipantSession.findByIdAndUpdate(session._id, {
      socketId: socket.id,
      isConnected: true,
      lastSeenAt: new Date(),
    });
  }

  await joinRoomSocket(socket, roomId);

  /**
   * Refresh participant count from DB (scoped to the current
   * live session, or the waiting pool) and broadcast it live.
   */
  const participantCount = await broadcastParticipantCount(io, roomId);

  const updatedRoom = await Room.findById(roomId);

  const state = await getRoomState(updatedRoom, socket);

  state.participantCount = participantCount ?? state.participantCount;

  socket.emit('room:state', state);

  /**
   * Send Expert queue state if applicable.
   */
  if (room.mode === 'expert' && room.activeQuestionId) {
    socket.emit('expert:queue', {
      questionId: room.activeQuestionId,
      queue: expertQueue.getQueueState(roomId),
    });
  }

  /**
   * Notify everybody else.
   */
  if (socket.user?.role === 'participant') {
    const session = await getParticipantSession(socket);

    broadcastToRoom(
      io,
      roomId,
      'participant:joined',
      {
        participantId: session?._id,
        participantName: session?.participantName,
        participantCount,
      },
      socket.id
    );
  }

  logger.info(
    `Socket joined room=${roomId} socket=${socket.id} role=${socket.user?.role} count=${participantCount}`
  );
}

/**
 * Verify host can control a room.
 */
async function authorizeHost(socket, roomId) {
  if (socket.user?.role !== 'host') {
    socket.emit('vlite:error', {
      code: 'HOST_ONLY',
      message: 'Host authorization required.',
    });
    return null;
  }

  const room = await Room.findOne({
    _id: roomId,
    isDeleted: false,
  });

  if (!room) {
    socket.emit('vlite:error', {
      code: 'ROOM_NOT_FOUND',
      message: 'Room not found.',
    });
    return null;
  }

  if (!isHostSocketForRoom(socket, room)) {
    socket.emit('vlite:error', {
      code: 'NOT_ROOM_HOST',
      message: 'You are not the host of this room.',
    });
    return null;
  }

  return room;
}

/**
 * Host starts a new session.
 *
 * Rooms are reusable: a new session can start whenever no
 * session is currently live (status waiting or ended).
 */
async function handleStartSession(io, socket, { roomId }) {
  const room = await authorizeHost(socket, roomId);

  if (!room) {
    return;
  }

  if (room.status === 'active') {
    socket.emit('vlite:error', {
      code: 'SESSION_ALREADY_LIVE',
      message: 'A session is already live for this room.',
    });
    return;
  }

  let started;
  try {
    started = await startSession(roomId);
  } catch (error) {
    socket.emit('vlite:error', {
      code: 'SESSION_START_FAILED',
      message: error.message,
    });
    return;
  }

  expertQueue.resetQueue(roomId, null);

  // Fresh state for everyone in the room
  await broadcastParticipantCount(io, roomId);
  await updateLeaderboard(io, roomId);

  emitToRoom(io, roomId, 'session:start', {
    roomId: started.room._id,
    lrn: started.room.lrn,
    status: started.room.status,
    mode: started.room.mode,
    sessionId: started.session._id,
    sessionNumber: started.session.sessionNumber,
  });

  logger.info(
    `Session started: room=${started.room.lrn} session=${started.session.sessionNumber}`
  );
}

/**
 * Host ends the live session.
 *
 * Results are persisted per session. The room (and its
 * question bank) is preserved and can start a new session.
 */
async function handleEndSession(io, socket, { roomId }) {
  const room = await authorizeHost(socket, roomId);

  if (!room) {
    return;
  }

  if (room.status !== 'active') {
    return;
  }

  let ended;
  try {
    ended = await endSession(roomId);
  } catch (error) {
    socket.emit('vlite:error', {
      code: 'SESSION_END_FAILED',
      message: error.message,
    });
    return;
  }

  clearRoomTimer(roomId);
  expertQueue.resetQueue(roomId, null);

  emitToRoom(io, roomId, 'session:end', {
    roomId: ended.room._id,
    sessionId: ended.session._id,
    sessionNumber: ended.session.sessionNumber,
    endedAt: new Date().toISOString(),
  });

  logger.info(
    `Session ended: room=${ended.room.lrn} session=${ended.session.sessionNumber}`
  );
}

/**
 * Host starts a question.
 *
 * Client should send:
 * {
 *   roomId,
 *   questionId
 * }
 *
 * The server loads the actual question from MongoDB.
 */
async function handleNextQuestion(io, socket, { roomId, questionId }) {
  const room = await authorizeHost(socket, roomId);

  if (!room) {
    return;
  }

  if (room.status !== 'active') {
    socket.emit('vlite:error', {
      code: 'SESSION_NOT_ACTIVE',
      message: 'The session is not active.',
    });
    return;
  }

  if (!questionId) {
    socket.emit('vlite:error', {
      code: 'QUESTION_ID_REQUIRED',
      message: 'Question ID is required.',
    });
    return;
  }

  const question = await Question.findOne({
    _id: questionId,
    room: roomId,
    isActive: true,
  });

  if (!question) {
    socket.emit('vlite:error', {
      code: 'QUESTION_NOT_FOUND',
      message: 'Question not found in this room.',
    });
    return;
  }

  const now = new Date();
  const endsAt = new Date(
    now.getTime() + question.durationSeconds * 1000
  );

  room.activeQuestionId = question._id;
  room.currentQuestionOrder = question.order;
  room.questionStartedAt = now;
  room.questionEndsAt = endsAt;

  await room.save();

  /**
   * Expert queue is always reset when question changes.
   */
  expertQueue.resetQueue(roomId, question._id);

  /**
   * IMPORTANT:
   * Never broadcast correctAnswerIndex to participants.
   */
  emitToRoom(io, roomId, 'question:start', {
    questionId: question._id,
    question: serializeQuestionForParticipant(question, {
      questionStartedAt: now.toISOString(),
      questionEndsAt: endsAt.toISOString(),
    }),
    questionStartedAt: now.toISOString(),
    questionEndsAt: endsAt.toISOString(),
    totalQuestions: room.questions.length,
  });

  /**
   * Host receives answer information separately.
   */
  socket.emit('host:question:start', {
    questionId: question._id,
    question: serializeQuestionForHost(question, {
      questionStartedAt: now.toISOString(),
      questionEndsAt: endsAt.toISOString(),
    }),
  });

  // Schedule question end
  const durationMs = question.durationSeconds * 1000;
  const timerKey = String(roomId);

  // Clear any existing timer for this room
  clearRoomTimer(timerKey);

  const timer = setTimeout(() => {
    questionTimers.delete(timerKey);
    endQuestion(io, timerKey, questionId);
  }, durationMs);

  questionTimers.set(timerKey, timer);

  logger.info(
    `Question started: room=${room.lrn} question=${question._id} endsAt=${endsAt.toISOString()}`
  );
}

/**
 * End the current question and notify participants.
 */
async function endQuestion(io, roomId, questionId) {
  const room = await Room.findOne({ _id: roomId, isDeleted: false });
  if (!room || room.status !== 'active') return;
  if (String(room.activeQuestionId) !== String(questionId)) return;

  room.activeQuestionId = null;
  room.questionStartedAt = null;
  room.questionEndsAt = null;
  await room.save();

  expertQueue.resetQueue(roomId, null);

  emitToRoom(io, roomId, 'question:end', {
    questionId,
    endedAt: new Date().toISOString(),
  });

  logger.info(`Question ended: room=${room.lrn} question=${questionId}`);
}

/**
 * Handle participant answer.
 */
async function handleAnswerSubmit(
  io,
  socket,
  { roomId, questionId, selectedOptionIndex }
) {
  if (socket.user?.role !== 'participant') {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'participants_only',
    });
    return;
  }

  const session = await getParticipantSession(socket);

  if (!session) {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'invalid_session',
    });
    return;
  }

  if (String(session.room) !== String(roomId)) {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'wrong_room',
    });
    return;
  }

  const room = await Room.findOne({
    _id: roomId,
    isDeleted: false,
  });

  if (!room) {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'room_not_found',
    });
    return;
  }

  if (room.status !== 'active') {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'session_not_active',
    });
    return;
  }

  /**
   * The submitted question MUST be the question currently
   * active on the server.
   */
  if (
    !room.activeQuestionId ||
    String(room.activeQuestionId) !== String(questionId)
  ) {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'question_not_active',
    });
    return;
  }

  /**
   * Validate selected option.
   */
  if (
    !Number.isInteger(selectedOptionIndex) ||
    selectedOptionIndex < 0
  ) {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'invalid_option',
    });
    return;
  }

  /**
   * SERVER CLOCK.
   */
  const now = new Date();

  if (
    room.questionEndsAt &&
    now.getTime() > room.questionEndsAt.getTime()
  ) {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'time_expired',
    });
    return;
  }

  /**
   * Expert mode:
   * only the current priority participant may answer.
   */
  if (room.mode === 'expert') {
    const top = expertQueue.getTopPriority(roomId);

    if (!top) {
      socket.emit('answer:result', {
        questionId,
        valid: false,
        reason: 'raise_hand_required',
      });
      return;
    }

    if (
      String(top.participantId) !== String(session._id)
    ) {
      socket.emit('answer:result', {
        questionId,
        valid: false,
        reason: 'not_priority_participant',
        position: top.order,
      });
      return;
    }

    if (
      expertQueue.hasPriorityTimedOut(
        roomId,
        EXPERT_ANSWER_SECONDS
      )
    ) {
      expertQueue.removeTopPriority(roomId);

      emitToRoom(io, roomId, 'expert:queue', {
        questionId,
        queue: expertQueue.getQueueState(roomId),
      });

      socket.emit('answer:result', {
        questionId,
        valid: false,
        reason: 'expert_answer_timeout',
      });

      return;
    }
  }

  /**
   * Check duplicate answer.
   *
   * We also have a database unique index as the final protection.
   */
  const existing = await Answer.findOne({
    participantSession: session._id,
    question: questionId,
  });

  if (existing) {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'duplicate',
    });
    return;
  }

  const question = await Question.findOne({
    _id: questionId,
    room: roomId,
    isActive: true,
  });

  if (!question) {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'question_not_found',
    });
    return;
  }

  if (selectedOptionIndex >= question.options.length) {
    socket.emit('answer:result', {
      questionId,
      valid: false,
      reason: 'invalid_option',
    });
    return;
  }

  /**
   * Server-authoritative correctness.
   */
  const isCorrect =
    selectedOptionIndex === question.correctAnswerIndex;

  /**
   * Server-authoritative elapsed time.
   */
  const elapsedMs = Math.max(
    0,
    now.getTime() - room.questionStartedAt.getTime()
  );

  const totalDurationMs =
    question.durationSeconds * 1000;

  let points = 0;

  if (room.mode === 'intermediate') {
    points = isCorrect
      ? calculateIntermediateScore(
          true,
          elapsedMs,
          totalDurationMs,
          question.marks ?? room.correctPoints
        )
      : room.negativeMarking
        ? -room.negativePoints
        : 0;
  } else {
    points = calculateNormalScore(isCorrect, {
      correctPoints: question.marks ?? room.correctPoints,
      negativeMarking: room.negativeMarking,
      negativePoints: room.negativePoints,
    });
  }

  /**
   * Save answer.
   */
  try {
    await Answer.create({
      participantSession: session._id,
      question: questionId,
      room: roomId,
      session: session.session || null,
      selectedOptionIndex,
      isCorrect,
      pointsAwarded: points,
      answeredAt: now,
    });
  } catch (error) {
    /**
     * Duplicate-key race.
     */
    if (error?.code === 11000) {
      socket.emit('answer:result', {
        questionId,
        valid: false,
        reason: 'duplicate',
      });
      return;
    }

    throw error;
  }

  /**
   * Update score atomically.
   */
  await ParticipantSession.findByIdAndUpdate(
    session._id,
    {
      $inc: {
        score: points,
      },
      $addToSet: {
        answeredQuestions: questionId,
      },
      $set: {
        lastSeenAt: now,
      },
    },
    { new: true }
  );

  /**
   * Expert participant has used their priority.
   */
  if (room.mode === 'expert') {
    expertQueue.removeTopPriority(roomId);

    emitToRoom(io, roomId, 'expert:queue', {
      questionId,
      queue: expertQueue.getQueueState(roomId),
    });
  }

  socket.emit('answer:result', {
    questionId,
    valid: true,
    isCorrect,
    pointsAwarded: points,
    answeredAt: now.toISOString(),
    elapsedMs,
  });

  await updateLeaderboard(io, roomId);

  logger.info(
    `Answer submitted: room=${roomId} participant=${session._id} question=${questionId} correct=${isCorrect} points=${points}`
  );
}

/**
 * Leaderboard, scoped to the current live session
 * (or the waiting pool when no session is live).
 */
async function updateLeaderboard(io, roomId) {
  const room = await Room.findOne({ _id: roomId, isDeleted: false }).select(
    '_id currentSessionId'
  );

  const filter = room ? sessionScope(room) : { room: roomId };

  const participants = await ParticipantSession.find(filter)
    .select('_id participantName score')
    .sort({
      score: -1,
      participantName: 1,
      _id: 1,
    })
    .lean();

  const leaderboard = participants.map((participant, index) => ({
    rank: index + 1,
    participantId: participant._id,
    participantName: participant.participantName,
    score: participant.score,
  }));

  emitToRoom(io, roomId, 'leaderboard:update', {
    leaderboard,
  });
}

/**
 * Expert raise hand.
 */
async function handleRaiseHand(io, socket, { roomId }) {
  if (socket.user?.role !== 'participant') {
    socket.emit('expert:error', {
      reason: 'participants_only',
    });
    return;
  }

  const session = await getParticipantSession(socket);

  if (!session) {
    socket.emit('expert:error', {
      reason: 'invalid_session',
    });
    return;
  }

  if (String(session.room) !== String(roomId)) {
    socket.emit('expert:error', {
      reason: 'wrong_room',
    });
    return;
  }

  const room = await Room.findOne({
    _id: roomId,
    isDeleted: false,
  });

  if (!room) {
    socket.emit('expert:error', {
      reason: 'room_not_found',
    });
    return;
  }

  if (room.mode !== 'expert') {
    socket.emit('expert:error', {
      reason: 'expert_mode_required',
    });
    return;
  }

  if (room.status !== 'active' || !room.activeQuestionId) {
    socket.emit('expert:error', {
      reason: 'no_active_question',
    });
    return;
  }

  if (
    room.questionEndsAt &&
    Date.now() >= room.questionEndsAt.getTime()
  ) {
    socket.emit('expert:error', {
      reason: 'question_expired',
    });
    return;
  }

  const result = expertQueue.raiseHand(
    roomId,
    room.activeQuestionId,
    session._id,
    session.participantName
  );

  if (!result.success) {
    socket.emit('expert:error', {
      reason: result.reason,
      position: result.position,
      total: result.total,
    });
    return;
  }

  const queue = expertQueue.getQueueState(roomId);

  emitToRoom(io, roomId, 'expert:queue', {
    questionId: room.activeQuestionId,
    queue,
  });

  socket.emit('expert:raised', {
    questionId: room.activeQuestionId,
    position: result.position,
    total: result.total,
    raisedAt: result.raisedAt,
  });

  logger.info(
    `Raise hand: room=${roomId} participant=${session._id} position=${result.position}`
  );
}

/**
 * Handle session sync request.
 * Returns current room state to the requesting socket.
 */
async function handleSync(io, socket, { roomId }) {
  if (!roomId) {
    socket.emit('vlite:error', {
      code: 'ROOM_ID_REQUIRED',
      message: 'Room ID is required.',
    });
    return;
  }

  const room = await Room.findOne({ _id: roomId, isDeleted: false });
  if (!room) {
    socket.emit('vlite:error', {
      code: 'ROOM_NOT_FOUND',
      message: 'Room not found.',
    });
    return;
  }

  // Verify socket belongs to this room.
  // NOTE: a freshly reconnected socket may not have joined yet,
  // so for participants we check the JWT-bound participantRoomId.
  if (socket.user?.role === 'host') {
    if (!isHostSocketForRoom(socket, room)) {
      socket.emit('vlite:error', {
        code: 'HOST_NOT_AUTHORIZED',
        message: 'You are not authorized for this room.',
      });
      return;
    }
  } else if (socket.user?.role === 'participant') {
    if (String(socket.participantRoomId) !== String(roomId)) {
      socket.emit('vlite:error', {
        code: 'PARTICIPANT_NOT_AUTHORIZED',
        message: 'This participant session does not belong to this room.',
      });
      return;
    }
  }

  const state = await getRoomState(room, socket);

  socket.emit('room:state', state);

  // Send expert queue if applicable
  if (room.mode === 'expert' && room.activeQuestionId) {
    socket.emit('expert:queue', {
      questionId: room.activeQuestionId,
      queue: expertQueue.getQueueState(roomId),
    });
  }

  // Send current leaderboard
  await updateLeaderboard(io, roomId);

  logger.info(`Session sync: room=${roomId} socket=${socket.id}`);
}

/**
 * Clear any pending question-end timer for a room.
 */
function clearRoomTimer(roomId) {
  if (questionTimers.has(String(roomId))) {
    clearTimeout(questionTimers.get(String(roomId)));
    questionTimers.delete(String(roomId));
  }
}

export {
  handleJoinRoom,
  handleStartSession,
  handleEndSession,
  handleNextQuestion,
  handleAnswerSubmit,
  handleRaiseHand,
  handleSync,
  updateLeaderboard,
  broadcastParticipantCount,
  sessionScope,
  clearRoomTimer,
  questionTimers,
};