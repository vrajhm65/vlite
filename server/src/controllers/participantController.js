import { body, validationResult } from 'express-validator';
import { createParticipantSession } from '../services/participantService.js';
import ParticipantSession from '../models/ParticipantSession.js';
import Room from '../models/Room.js';
import logger from '../utils/logger.js';

/**
 * Participant join flow.
 * 1. Validate name
 * 2. Validate LRN
 * 3. Find room by LRN
 * 4. Verify room exists and is joinable
 * 5. Create participant session
 * 6. Return secure token
 */
async function joinRoom(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { participantName, lrn } = req.body;

    // Validate name
    if (!participantName || participantName.trim().length === 0 || participantName.trim().length > 100) {
      return res.status(400).json({ error: 'Invalid participant name' });
    }

    // Validate LRN format
    if (!lrn || !/^\d{4}$/.test(lrn)) {
      return res.status(400).json({ error: 'Invalid LRN format. Must be 4 digits.' });
    }

    // Find room by LRN (joinability is verified server-side
    // when the participant session is created)
    const room = await Room.findOne({ lrn, isDeleted: false });
    if (!room) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Create (or resume) session
    const { session, token, resumed } = await createParticipantSession(participantName.trim(), room._id);

    logger.info(`Participant joined: room=${room.lrn} name=${participantName}`);

    res.status(201).json({
      token,
      participantName: participantName.trim(),
      sessionId: session._id,
      roomId: room._id,
      lrn: room.lrn,
      resumed: !!resumed,
    });
  } catch (error) {
    logger.error(`Join room error: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to join room' });
  }
}

/**
 * Verify the participant's stored session token server-side.
 * Used on page refresh to recover the session without rejoining.
 * Returns live identity + score; 401/404 forces a clean rejoin.
 */
async function getMeParticipant(req, res) {
  try {
    if (!req.user || req.user.role !== 'participant') {
      return res.status(403).json({ error: 'Participant access required' });
    }

    const session = await ParticipantSession.findOne({
      token: req.token,
      room: req.user.roomId,
    });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const room = await Room.findOne({ _id: session.room, isDeleted: false })
      .select('lrn name status')
      .lean();

    res.json({
      participantName: session.participantName,
      score: session.score,
      roomId: session.room,
      sessionId: session._id,
      lrn: room ? room.lrn : req.user.lrn,
      roomStatus: room ? room.status : 'unknown',
    });
  } catch (error) {
    logger.error(`Get participant me error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
}

export { joinRoom, getMeParticipant };
