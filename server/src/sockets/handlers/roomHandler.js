import Room from '../../models/Room.js';
import ParticipantSession from '../../models/ParticipantSession.js';
import Answer from '../../models/Answer.js';
import Question from '../../models/Question.js';
import { emitToRoom, broadcastToRoom } from '../roomSocket.js';
import { calculateIntermediateScore } from '../../services/scoringService.js';
import expertQueue from '../../services/expertModeService.js';
import logger from '../../utils/logger.js';

/**
 * Room-scoped socket event handlers.
 * All events are associated with a specific roomId.
 */

/**
 * Handle participant joining a room.
 */
async function handleJoinRoom(io, socket, { roomId, token }) {
  const room = await Room.findById(roomId);
  if (!room || room.status === 'ended') {
    socket.emit('error', { message: 'Room not available' });
    return;
  }

  // Verify participant session
  const session = await ParticipantSession.findOne({ token });
  if (!session || session.room.toString() !== roomId) {
    socket.emit('error', { message: 'Invalid session' });
    return;
  }

  // Leave any previous rooms
  const prevRooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
  prevRooms.forEach((r) => socket.leave(r));

  // Join room-scoped room
  socket.join(`room:${roomId}`);
  socket.roomId = roomId;

  // Update participant socket ID
  await ParticipantSession.findByIdAndUpdate(session._id, {
    socketId: socket.id,
    isConnected: true,
    lastSeenAt: new Date(),
  });

  // Get participant count
  const participantCount = await ParticipantSession.countDocuments({ room: roomId });

  // Emit room state to this participant only
  socket.emit('room:state', {
    roomId: room._id,
    lrn: room.lrn,
    status: room.status,
    participantCount,
    maxParticipants: room.maxParticipants,
    mode: room.mode,
  });

  // Notify other participants in room about new joiner
  broadcastToRoom(io, roomId, 'participant:joined', {
    participantId: session._id,
    participantName: session.participantName,
    participantCount,
  }, socket.id);

  logger.info(`Participant joined room:${roomId} - total: ${participantCount}`);
}

/**
 * Handle host starting session.
 */
async function handleStartSession(io, socket, { roomId }) {
  const room = await Room.findById(roomId);
  if (!room || room.status !== 'waiting') {
    socket.emit('error', { message: 'Cannot start session' });
    return;
  }

  room.status = 'active';
  await room.save();

  emitToRoom(io, roomId, 'session:start', {
    roomId: room._id,
    lrn: room.lrn,
    status: 'active',
    mode: room.mode,
  });

  logger.info(`Session started: room=${room.lrn}`);
}

/**
 * Handle host ending session.
 */
async function handleEndSession(io, socket, { roomId }) {
  const room = await Room.findById(roomId);
  if (!room) return;

  room.status = 'ended';
  await room.save();

  emitToRoom(io, roomId, 'session:end', {
    roomId: room._id,
    endedAt: new Date(),
  });

  logger.info(`Session ended: room=${room.lrn}`);
}

/**
 * Handle host moving to next question.
 */
async function handleNextQuestion(io, socket, { roomId, question }) {
  const room = await Room.findById(roomId);
  if (!room) return;

  emitToRoom(io, roomId, 'question:start', {
    questionId: question._id,
    question: {
      text: question.text,
      imageUrl: question.imageUrl,
      options: question.options.map((opt) => ({
        label: opt.label,
        text: opt.text,
      })),
      durationSeconds: question.durationSeconds,
      order: question.order,
      correctAnswerIndex: question.correctAnswerIndex,
    },
    startsAt: new Date(),
    endsAt: new Date(Date.now() + question.durationSeconds * 1000),
  });

  logger.info(`Question started: room=${room.lrn} question=${question._id}`);
}

/**
 * Handle participant answering.
 */
async function handleAnswerSubmit(io, socket, { roomId, questionId, selectedOptionIndex }) {
  const session = await ParticipantSession.findOne({ socketId: socket.id });
  if (!session) {
    socket.emit('error', { message: 'Invalid session' });
    return;
  }

  // Verify participant is in room
  if (session.room.toString() !== roomId) {
    socket.emit('error', { message: 'Not in this room' });
    return;
  }

  // Check for duplicate answer
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

  // Get question from database
  const question = await Question.findById(questionId);
  if (!question) {
    socket.emit('error', { message: 'Question not found' });
    return;
  }

  // Get room for config
  const room = await Room.findById(roomId);
  if (!room) return;

  // Validate answer against server-side state
  const isCorrect = selectedOptionIndex === question.correctAnswerIndex;

  // Calculate score server-side
  let points = 0;
  if (room.mode === 'normal') {
    points = isCorrect ? room.correctPoints : (room.negativeMarking ? -room.negativePoints : 0);
  } else if (room.mode === 'intermediate') {
    if (isCorrect) {
      points = calculateIntermediateScore(
        true,
        0, // elapsedMs placeholder - would need question start time
        (question.durationSeconds || 30) * 1000,
        question.marks || room.correctPoints
      );
    }
  } else {
    // Expert mode uses same scoring as normal
    points = isCorrect ? room.correctPoints : (room.negativeMarking ? -room.negativePoints : 0);
  }

  // Save answer (atomic operation - prevents duplicate)
  await Answer.create({
    participantSession: session._id,
    question: questionId,
    room: roomId,
    selectedOptionIndex,
    isCorrect,
    pointsAwarded: points,
    answeredAt: new Date(),
  });

  // Update participant score (atomic operation)
  await ParticipantSession.findByIdAndUpdate(session._id, {
    $inc: { score: points },
    $push: { answeredQuestions: questionId },
  });

  // Emit result to participant only
  socket.emit('answer:result', {
    questionId,
    valid: true,
    isCorrect,
    pointsAwarded: points,
  });

  // Update leaderboard for room
  await updateLeaderboard(io, roomId);

  logger.info(`Answer submitted: room=${roomId} participant=${session._id} correct=${isCorrect} points=${points}`);
}

/**
 * Update leaderboard for a room.
 */
async function updateLeaderboard(io, roomId) {
  const participants = await ParticipantSession.find({ room: roomId })
    .sort({ score: -1, participantName: 1 });

  const leaderboard = participants.map((p, i) => ({
    rank: i + 1,
    participantId: p._id,
    participantName: p.participantName,
    score: p.score,
  }));

  emitToRoom(io, roomId, 'leaderboard:update', { leaderboard });
}

/**
 * Handle expert mode raise hand.
 */
async function handleRaiseHand(io, socket, { roomId }) {
  const session = await ParticipantSession.findOne({ socketId: socket.id });
  if (!session) {
    socket.emit('error', { message: 'Invalid session' });
    return;
  }

  if (session.room.toString() !== roomId) {
    socket.emit('error', { message: 'Not in this room' });
    return;
  }

  const result = expertQueue.raiseHand(roomId, session._id, session.participantName);

  if (result.success) {
    const queue = expertQueue.getQueueState(roomId);
    emitToRoom(io, roomId, 'expert:queue', { queue });

    socket.emit('expert:raised', {
      position: result.position,
      total: result.total,
    });

    logger.info(`Raise hand: room=${roomId} participant=${session._id} position=${result.position}`);
  } else {
    socket.emit('expert:error', { reason: result.reason });
  }
}

export {
  handleJoinRoom,
  handleStartSession,
  handleEndSession,
  handleNextQuestion,
  handleAnswerSubmit,
  handleRaiseHand,
  updateLeaderboard,
};
