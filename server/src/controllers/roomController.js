import Room from '../models/Room.js';
import Question from '../models/Question.js';
import { createRoom, getRoomByLRN, getRoomById, updateRoomStatus, addQuestionToRoom } from '../services/roomService.js';
import logger from '../utils/logger.js';
import { body, validationResult } from 'express-validator';

/**
 * Middleware to verify host authorization for a room.
 */
async function verifyHostOwner(req, res, next) {
  try {
    const room = await Room.findById(req.params.roomId);
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

    // Return public info only - not internal IDs
    res.json({
      lrn: room.lrn,
      name: room.name,
      mode: room.mode,
      status: room.status,
      maxParticipants: room.maxParticipants,
      participantCount: 0, // Will be populated by caller if needed
    });
  } catch (error) {
    logger.error(`Get room error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve room' });
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
 * Start session (host only).
 */
async function startSessionHandler(req, res) {
  try {
    const room = req.room;
    if (room.status !== 'waiting') {
      return res.status(400).json({ error: 'Session already started or ended' });
    }

    room.status = 'active';
    await room.save();

    logger.info(`Session started: room=${room.lrn}`);
    res.json({ room });
  } catch (error) {
    logger.error(`Start session error: ${error.message}`);
    res.status(500).json({ error: 'Failed to start session' });
  }
}

/**
 * End session (host only).
 */
async function endSessionHandler(req, res) {
  try {
    const room = req.room;
    room.status = 'ended';
    await room.save();

    logger.info(`Session ended: room=${room.lrn}`);
    res.json({ room });
  } catch (error) {
    logger.error(`End session error: ${error.message}`);
    res.status(500).json({ error: 'Failed to end session' });
  }
}

export {
  verifyHostOwner,
  createRoomHandler,
  getRoomByLRNHandler,
  getRoomHandler,
  addQuestionHandler,
  getQuestionsHandler,
  startSessionHandler,
  endSessionHandler,
};
