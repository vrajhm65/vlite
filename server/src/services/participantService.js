import ParticipantSession from '../models/ParticipantSession.js';
import Room from '../models/Room.js';
import jwt from 'jsonwebtoken';

const { sign, verify } = jwt;
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Create a secure participant session with JWT token.
 * Server creates and owns the session - client cannot forge.
 */
async function createParticipantSession(name, roomId) {
  // Verify room exists and is joinable
  const room = await Room.findById(roomId);
  if (!room) throw new Error('Room not found');
  if (room.status === 'ended') throw new Error('Room session has ended');
  if (room.status === 'active' && room.participantCount >= room.maxParticipants) {
    throw new Error('Room is full');
  }

  // Check participant count
  const currentCount = await ParticipantSession.countDocuments({ room: roomId });
  if (currentCount >= room.maxParticipants) {
    throw new Error('Room has reached maximum participants');
  }

  // Create session token (server-side secret, not guessable)
  const sessionId = `${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const token = sign(
    { sessionId, roomId, name, role: 'participant' },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  const session = await ParticipantSession.create({
    participantName: name,
    room: roomId,
    token,
    socketId: '',
  });

  logger.info(`Participant joined: room=${roomId} name=${name}`);
  return { session, token };
}

async function validateParticipantSession(token, roomId) {
  if (!token) return null;
  try {
    const decoded = verify(token, config.jwtSecret);
    if (decoded.roomId !== roomId) return null;
    const session = await ParticipantSession.findOne({ token, room: roomId });
    if (!session) return null;
    return session;
  } catch (err) {
    return null;
  }
}

async function getParticipantsByRoom(roomId) {
  return ParticipantSession.find({ room: roomId });
}

async function updateParticipantSocket(participantId, socketId) {
  return ParticipantSession.findByIdAndUpdate(
    participantId,
    { socketId, lastSeenAt: new Date() },
    { new: true }
  );
}

async function markParticipantDisconnected(participantId) {
  return ParticipantSession.findByIdAndUpdate(participantId, { isConnected: false });
}

export { createParticipantSession, validateParticipantSession, getParticipantsByRoom, updateParticipantSocket, markParticipantDisconnected };


