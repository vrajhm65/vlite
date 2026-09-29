import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Socket.IO room-scoped event handling.
 * Each room is isolated - events for room A never reach room B participants.
 */

/**
 * Verify JWT token from socket handshake.
 */
function authenticateSocket(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) {
    return next(new Error('Authentication required'));
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    socket.user = decoded;
    next();
  } catch (err) {
    return next(new Error('Invalid token'));
  }
}

/**
 * Join a room-scoped Socket.IO room.
 */
function joinRoomSocket(socket, roomId) {
  // Leave any previous rooms
  const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
  rooms.forEach((r) => socket.leave(r));

  // Join the specific room
  socket.join(`room:${roomId}`);
  socket.roomId = roomId;
  logger.info(`Socket ${socket.id} joined room:${roomId}`);
}

/**
 * Emit an event to a specific room only.
 */
function emitToRoom(io, roomId, event, data) {
  io.to(`room:${roomId}`).emit(event, data);
}

/**
 * Broadcast to all except sender in a room.
 */
function broadcastToRoom(io, roomId, event, data, excludeSocketId) {
  io.to(`room:${roomId}`).except(excludeSocketId).emit(event, data);
}

export { authenticateSocket, joinRoomSocket, emitToRoom, broadcastToRoom };
