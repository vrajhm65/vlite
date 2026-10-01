import Room from '../models/Room.js';
import Question from '../models/Question.js';
import ParticipantSession from '../models/ParticipantSession.js';
import { createRoom, getRoomByLRN, getRoomById, updateRoomStatus, addQuestionToRoom } from '../services/roomService.js';
import { listSessions, getSessionResults } from '../services/sessionService.js';
import logger from '../utils/logger.js';
import { body, validationResult } from 'express-validator';

/**
 * Middleware to verify host authorization for a room.
 */
async function verifyHostOwner(req, res, next) {
  try {
    const room = await Room.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    if (room.host.toString() !== req.user.userId) {
      return res.status(403).json({ error: 'Not authorized for this room' });
    }
    req.room = room;
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Create a room.
 */
async function createRoomHandler(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, mode, negativeMarking, correctPoints, negativePoints, maxParticipants } = req.body;

    const room = await createRoom(req.user.userId, {
      name,
      mode,
      negativeMarking,
      correctPoints,
      negativePoints,
      maxParticipants,
    });

    res.status(201).json({ room });
  } catch (error) {
    logger.error(`Create room error: ${error.message}`);
    res.status(500).json({ error: 'Failed to create room' });
  }
}

/**
 * Get all rooms owned by the authenticated host,
 * each with question count and session count.
 */
async function getMyRoomsHandler(req, res) {
  try {
    const rooms = await Room.find({ host: req.user.userId, isDeleted: false }).sort({ createdAt: -1 }).lean();
    const Session = (await import('../models/Session.js')).default;
    const withCounts = await Promise.all(
      rooms.map(async (room) => {
        const [questionCount, sessionCount] = await Promise.all([
          Question.countDocuments({ room: room._id, isActive: true }),
          Session.countDocuments({ room: room._id }),
        ]);
        return { ...room, questionCount, sessionCount };
      })
    );
    res.json({ rooms: withCounts });
  } catch (error) {
    logger.error(`Get my rooms error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve rooms' });
  }
}

/**
 * Get room by LRN.
 */
async function getRoomByLRNHandler(req, res) {
  try {
    const { lrn } = req.params;

    // Validate LRN format
    if (!/^\d{4}$/.test(lrn)) {
      return res.status(400).json({ error: 'Invalid LRN format' });
    }

    const room = await getRoomByLRN(lrn);
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    const scope = room.currentSessionId
      ? { room: room._id, session: room.currentSessionId }
      : { room: room._id, session: null };
    const participantCount = await ParticipantSession.countDocuments({
      ...scope,
      isConnected: true,
    });
    const questionCount = await Question.countDocuments({
      room: room._id,
      isActive: true,
    });

    // Return public info only - not internal IDs
    res.json({
      room: {
        lrn: room.lrn,
        name: room.name,
        mode: room.mode,
        status: room.status,
        maxParticipants: room.maxParticipants,
        participantCount,
        questionCount,
      },
    });
  } catch (error) {
    logger.error(`Get room error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve room' });
  }
}

/**
 * Update room configuration (host only).
 * Only allowed when no session is live, so running
 * sessions keep stable scoring rules.
 */
async function updateRoomHandler(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const room = req.room;
    if (room.status === 'active') {
      return res.status(400).json({ error: 'Cannot edit a room while a session is live' });
    }

    const allowed = ['name', 'mode', 'negativeMarking', 'correctPoints', 'negativePoints', 'maxParticipants'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) room[key] = req.body[key];
    }
    await room.save();

    logger.info(`Room updated: room=${room.lrn}`);
    res.json({ room });
  } catch (error) {
    logger.error(`Update room error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update room' });
  }
}

/**
 * Delete a room (host only).
 * Explicit destructive action: soft-deletes the room and removes
 * its question bank. Session history (sessions, answers, results)
 * is preserved. Ending a session never deletes the room.
 */
async function deleteRoomHandler(req, res) {
  try {
    const room = req.room;
    if (room.status === 'active') {
      return res.status(400).json({ error: 'Cannot delete a room while a session is live' });
    }

    room.isDeleted = true;
    await room.save();
    await Question.deleteMany({ room: room._id });

    logger.info(`Room deleted: room=${room.lrn}`);
    res.json({ message: 'Room deleted' });
  } catch (error) {
    logger.error(`Delete room error: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete room' });
  }
}

/**
 * Update a question (host only, only when no session is live).
 */
async function updateQuestionHandler(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    if (req.room.status === 'active') {
      return res.status(400).json({ error: 'Cannot edit questions while a session is live' });
    }

    const question = await Question.findOne({ _id: req.params.questionId, room: req.params.roomId });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const allowed = ['text', 'options', 'correctAnswerIndex', 'explanation', 'marks', 'durationSeconds', 'imageUrl', 'order', 'isActive'];
    for (const key of allowed) {
      if (req.body[key] !== undefined) question[key] = req.body[key];
    }
    await question.save();

    logger.info(`Question updated: room=${req.params.roomId} question=${question._id}`);
    res.json({ question });
  } catch (error) {
    logger.error(`Update question error: ${error.message}`);
    res.status(500).json({ error: 'Failed to update question' });
  }
}

/**
 * Delete a question (host only, only when no session is live).
 */
async function deleteQuestionHandler(req, res) {
  try {
    const question = await Question.findOne({ _id: req.params.questionId, room: req.params.roomId });
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    if (req.room.status === 'active') {
      return res.status(400).json({ error: 'Cannot delete questions while a session is live' });
    }

    await Question.deleteOne({ _id: question._id });
    await Room.findByIdAndUpdate(req.params.roomId, { $pull: { questions: question._id } });

    logger.info(`Question deleted: room=${req.params.roomId} question=${question._id}`);
    res.json({ message: 'Question deleted' });
  } catch (error) {
    logger.error(`Delete question error: ${error.message}`);
    res.status(500).json({ error: 'Failed to delete question' });
  }
}

/**
 * List current participants (host only).
 * Shows participants of the live session (or waiting pool).
 */
async function getParticipantsHandler(req, res) {
  try {
    const room = req.room;
    const filter = room.currentSessionId
      ? { room: room._id, session: room.currentSessionId }
      : { room: room._id, session: null };

    const participants = await ParticipantSession.find(filter)
      .select('participantName score isConnected joinedAt')
      .sort({ score: -1, participantName: 1 })
      .lean();

    res.json({ participants });
  } catch (error) {
    logger.error(`Get participants error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve participants' });
  }
}

/**
 * List session history of a room (host only).
 */
async function getSessionsHandler(req, res) {
  try {
    const sessions = await listSessions(req.params.roomId);
    res.json({ sessions });
  } catch (error) {
    logger.error(`Get sessions error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve sessions' });
  }
}

/**
 * Get results of one specific session.
 * Public: only rank, name and score are exposed.
 */
async function getSessionResultsHandler(req, res) {
  try {
    const data = await getSessionResults(req.params.roomId, req.params.sessionId);
    const fullRoom = await Room.findById(req.params.roomId).select('lrn name').lean();
    res.json({
      room: fullRoom ? { lrn: fullRoom.lrn, name: fullRoom.name } : null,
      session: data.session,
      results: data.results,
    });
  } catch (error) {
    logger.error(`Get session results error: ${error.message}`);
    const status = error.message === 'Session not found' ? 404 : 500;
    res.status(status).json({ error: error.message });
  }
}

/**
 * Get room details (host only).
 */
async function getRoomHandler(req, res) {
  try {
    const room = await Room.findById(req.params.roomId).populate('questions');
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    res.json({ room });
  } catch (error) {
    logger.error(`Get room error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve room' });
  }
}

/**
 * Add question to room.
 */
async function addQuestionHandler(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { text, options, correctAnswerIndex, explanation, marks, durationSeconds, imageUrl, order } = req.body;

    const question = await Question.create({
      room: req.params.roomId,
      text,
      imageUrl: imageUrl || '',
      options,
      correctAnswerIndex,
      explanation: explanation || '',
      marks,
      durationSeconds: durationSeconds || 30,
      order: order || 0,
    });

    await addQuestionToRoom(req.params.roomId, question._id);
    logger.info(`Question added: room=${req.params.roomId} questionId=${question._id}`);

    res.status(201).json({ question });
  } catch (error) {
    logger.error(`Add question error: ${error.message}`);
    res.status(500).json({ error: 'Failed to add question' });
  }
}

/**
 * Get questions for a room.
 */
async function getQuestionsHandler(req, res) {
  try {
    const questions = await Question.find({ room: req.params.roomId, isActive: true }).sort({ order: 1 });
    res.json({ questions });
  } catch (error) {
    logger.error(`Get questions error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve questions' });
  }
}

/**
 * Start session via REST (host only).
 * Delegates to the session service so reusable rooms,
 * session documents, and participant assignment stay consistent.
 * For live realtime updates the host should use Socket.IO;
 * clients can then synchronize with session:sync.
 */
async function startSessionHandler(req, res) {
  try {
    const room = req.room;
    if (room.status === 'active') {
      return res.status(400).json({ error: 'A session is already live for this room' });
    }

    const { startSession } = await import('../services/sessionService.js');
    const started = await startSession(room._id);

    logger.info(`Session started via REST: room=${started.room.lrn}`);
    res.json({ room: started.room, session: started.session });
  } catch (error) {
    logger.error(`Start session error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

/**
 * End session via REST (host only).
 */
async function endSessionHandler(req, res) {
  try {
    const room = req.room;
    if (room.status !== 'active') {
      return res.status(400).json({ error: 'No live session for this room' });
    }

    const { endSession } = await import('../services/sessionService.js');
    const ended = await endSession(room._id);

    logger.info(`Session ended via REST: room=${ended.room.lrn}`);
    res.json({ room: ended.room, session: ended.session });
  } catch (error) {
    logger.error(`End session error: ${error.message}`);
    res.status(400).json({ error: error.message });
  }
}

/**
 * Get final results for a room.
 * Public: only rank, name and score are exposed.
 * Scoped to the latest session so reused rooms show
 * the most recent session's results. Use the session
 * endpoint for a specific session's results.
 */
async function getResultsHandler(req, res) {
  try {
    const room = await Room.findOne({ _id: req.params.roomId, isDeleted: false });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }
    const Result = (await import('../models/Result.js')).default;
    const Session = (await import('../models/Session.js')).default;
    const latest = await Session.findOne({ room: room._id }).sort({ sessionNumber: -1 }).lean();
    const filter = latest ? { room: room._id, session: latest._id } : { room: room._id };
    const results = await Result.find(filter).sort({ rank: 1 }).lean();
    res.json({
      room: { lrn: room.lrn, name: room.name, status: room.status },
      session: latest ? { sessionNumber: latest.sessionNumber, status: latest.status } : null,
      results: results.map((r) => ({
        rank: r.rank,
        participantName: r.participantName,
        score: r.score,
      })),
    });
  } catch (error) {
    logger.error(`Get results error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve results' });
  }
}

export {
  verifyHostOwner,
  createRoomHandler,
  getMyRoomsHandler,
  getRoomByLRNHandler,
  getRoomHandler,
  updateRoomHandler,
  deleteRoomHandler,
  addQuestionHandler,
  updateQuestionHandler,
  deleteQuestionHandler,
  getQuestionsHandler,
  getParticipantsHandler,
  getSessionsHandler,
  getSessionResultsHandler,
  startSessionHandler,
  endSessionHandler,
  getResultsHandler,
};
