import { Server } from 'socket.io';
import { authenticateSocket, joinRoomSocket, emitToRoom, broadcastToRoom } from './roomSocket.js';
import {
  handleJoinRoom,
  handleStartSession,
  handleEndSession,
  handleNextQuestion,
  handleAnswerSubmit,
  handleRaiseHand,
} from './handlers/roomHandler.js';
import logger from '../utils/logger.js';

/**
 * Initialize Socket.IO event handlers.
 */
function initSocketIO(io) {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    logger.info(`Socket connected: ${socket.id} user=${socket.user.userId}`);

    // Room events
    socket.on('room:join', (data) => handleJoinRoom(io, socket, data));

    // Host control events
    socket.on('session:start', (data) => handleStartSession(io, socket, data));
    socket.on('session:end', (data) => handleEndSession(io, socket, data));
    socket.on('question:next', (data) => handleNextQuestion(io, socket, data));

    // Participant events
    socket.on('answer:submit', (data) => handleAnswerSubmit(io, socket, data));
    socket.on('expert:raise-hand', (data) => handleRaiseHand(io, socket, data));

    // Leave room
    socket.on('room:leave', ({ roomId }) => {
      if (roomId && socket.rooms.has(`room:${roomId}`)) {
        socket.leave(`room:${roomId}`);
        logger.info(`Socket ${socket.id} left room:${roomId}`);
      }
    });

    // Disconnect
    socket.on('disconnect', () => {
      logger.info(`Socket disconnected: ${socket.id}`);
    });
  });
}

export { initSocketIO, authenticateSocket, joinRoomSocket, emitToRoom, broadcastToRoom };
