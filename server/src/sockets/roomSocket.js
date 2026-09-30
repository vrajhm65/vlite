import jwt from 'jsonwebtoken';

const { verify } = jwt;
import config from '../config/index.js';
import ParticipantSession from '../models/ParticipantSession.js';
import logger from '../utils/logger.js';

/**
 * Authenticate every Socket.IO connection.
 *
 * The JWT is verified by the server.
 * The client cannot choose its role.
 */
async function authenticateSocket(socket, next) {
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = verify(token, config.jwtSecret);

    if (!decoded?.role) {
      return next(new Error('Invalid authentication payload'));
    }

    socket.user = decoded;
    socket.authToken = token;

    /*
     * Host:
     *   JWT contains userId + role=host
     *
     * Participant:
     *   JWT contains sessionId + roomId + role=participant
     */
    if (decoded.role === 'participant') {
      const session = await ParticipantSession.findOne({
        token,
        room: decoded.roomId,
      });

      if (!session) {
        return next(new Error('Participant session not found'));
      }

      socket.participantSessionId = session._id.toString();
      socket.participantRoomId = session.room.toString();
      socket.participantName = session.participantName;
    }

    if (decoded.role === 'host' && !decoded.userId) {
      return next(new Error('Invalid host authentication'));
    }

    next();
  } catch (error) {
    logger.warn(`Socket authentication failed: ${error.message}`);
    return next(new Error('Invalid or expired token'));
  }
}

/**
 * Join a Socket.IO room.
 *
 * A socket is allowed to have only one VLITE room at a time.
 */
async function joinRoomSocket(socket, roomId) {
  const targetRoom = `room:${roomId}`;

  const previousRooms = Array.from(socket.rooms).filter(
    (room) => room !== socket.id && room.startsWith('room:')
  );

  for (const room of previousRooms) {
    await socket.leave(room);
  }

  await socket.join(targetRoom);

  socket.roomId = String(roomId);

  logger.info(
    `Socket ${socket.id} joined ${targetRoom} role=${socket.user?.role}`
  );
}

/**
 * Emit only to one VLITE room.
 */
function emitToRoom(io, roomId, event, data) {
  io.to(`room:${roomId}`).emit(event, data);
}

/**
 * Emit to everybody except one socket.
 */
function broadcastToRoom(io, roomId, event, data, excludeSocketId) {
  const room = io.to(`room:${roomId}`);

  if (excludeSocketId) {
    room.except(excludeSocketId).emit(event, data);
  } else {
    room.emit(event, data);
  }
}

/**
 * Check whether socket belongs to the room.
 */
function socketIsInRoom(socket, roomId) {
  return socket.rooms.has(`room:${roomId}`);
}

/**
 * Host authorization helper.
 *
 * IMPORTANT:
 * A valid JWT alone is NOT enough.
 * The authenticated host must also own the room.
 */
function isHostSocketForRoom(socket, room) {
  if (!socket.user) {
    return false;
  }

  if (socket.user.role !== 'host') {
    return false;
  }

  if (!socket.user.userId) {
    return false;
  }

  return String(room.host) === String(socket.user.userId);
}

/**
 * Participant authorization helper.
 */
function isParticipantSocketForRoom(socket, roomId) {
  return (
    socket.user?.role === 'participant' &&
    String(socket.participantRoomId) === String(roomId) &&
    String(socket.roomId) === String(roomId)
  );
}

export {
  authenticateSocket,
  joinRoomSocket,
  emitToRoom,
  broadcastToRoom,
  socketIsInRoom,
  isHostSocketForRoom,
  isParticipantSocketForRoom,
};