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
  // Verify room exists and is joinable.
  // Reusable rooms accept participants between sessions too;
  // only deleted rooms (and full live sessions) refuse joins.
  const room = await Room.findOne({ _id: roomId, isDeleted: false });
  if (!room) throw new Error('Room not found');

  const trimmedName = name.trim();

  // Refresh recovery FIRST (before capacity checks): if this name
  // already has an abandoned session in the same scope (e.g. after
  // a browser refresh), resume it instead of creating a duplicate
  // participant. Resume is count-neutral, so a full room never
  // blocks its own participants from reconnecting. A live session
  // (connected socket) is never hijacked — that join proceeds
  // to a fresh record below.
  // Name match is exact (case-insensitive) after trimming.
  const scope = room.currentSessionId
    ? { room: roomId, session: room.currentSessionId }
    : { room: roomId, session: null };

  const abandoned = await ParticipantSession.findOne({
    ...scope,
    participantName: { $regex: `^${escapeRegExp(trimmedName)}$`, $options: 'i' },
    $or: [{ isConnected: false }, { socketId: '' }],
  });

  // Create session token (server-side secret, not guessable)
  const sessionId = `${roomId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const token = sign(
    { sessionId, roomId, name: trimmedName, role: 'participant' },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );

  if (abandoned) {
    abandoned.token = token;
    abandoned.isConnected = true;
    abandoned.socketId = '';
    abandoned.lastSeenAt = new Date();
    await abandoned.save();
    logger.info(`Participant rejoined (resumed): room=${roomId} name=${trimmedName}`);
    return { session: abandoned, token, resumed: true };
  }

  // Scope capacity to the current live session (or the waiting pool).
  if (room.status === 'active') {
    const liveCount = await ParticipantSession.countDocuments(scope);
    if (liveCount >= room.maxParticipants) {
      throw new Error('Room is full');
    }
  }

  // Check participant count
  const currentCount = await ParticipantSession.countDocuments(scope);
  if (currentCount >= room.maxParticipants) {
    throw new Error('Room has reached maximum participants');
  }

  const session = await ParticipantSession.create({
    participantName: trimmedName,
    room: roomId,
    session: room.currentSessionId || null,
    token,
    socketId: '',
  });

  logger.info(`Participant joined: room=${roomId} name=${trimmedName}`);
  return { session, token, resumed: false };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

/**
 * Mark every participant socket as disconnected.
 *
 * Runs once at server startup: any `isConnected: true` flags left
 * over from before a restart are stale (those sockets are gone).
 * Scores, answers and history are untouched — only the live
 * connection flags reset so refresh/rejoin recovery works and
 * live counts are correct from a clean slate.
 */
async function resetAllConnections() {
  const result = await ParticipantSession.updateMany(
    { isConnected: true },
    { $set: { isConnected: false, socketId: '' } }
  );
  const reset = result.modifiedCount || 0;
  if (reset > 0) {
    logger.info(`Startup: reset ${reset} stale participant connection(s)`);
  }
  return reset;
}

export { createParticipantSession, validateParticipantSession, getParticipantsByRoom, updateParticipantSocket, markParticipantDisconnected, resetAllConnections };


