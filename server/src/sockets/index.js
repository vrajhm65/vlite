import {
  authenticateSocket,
  joinRoomSocket,
  emitToRoom,
  broadcastToRoom,
} from './roomSocket.js';

import {
  handleJoinRoom,
  handleStartSession,
  handleEndSession,
  handleNextQuestion,
  handleAnswerSubmit,
  handleRaiseHand,
  handleSync,
  broadcastParticipantCount,
} from './handlers/roomHandler.js';

import logger from '../utils/logger.js';

/**
 * Initialize Socket.IO.
 */
function initSocketIO(io) {
  /*
   * Every socket must authenticate before connection.
   */
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    logger.info(
      `Socket connected: ${socket.id} role=${socket.user?.role} user=${socket.user?.userId || socket.participantSessionId || 'unknown'}`
    );

    /**
     * Participant/host room join.
     */
    socket.on('room:join', async (data = {}) => {
      try {
        await handleJoinRoom(io, socket, data);
      } catch (error) {
        logger.error(`room:join error: ${error.message}`);

        socket.emit('vlite:error', {
          code: 'ROOM_JOIN_FAILED',
          message: 'Unable to join room.',
        });
      }
    });

    /**
     * Host starts session.
     */
    socket.on('session:start', async (data = {}) => {
      try {
        await handleStartSession(io, socket, data);
      } catch (error) {
        logger.error(`session:start error: ${error.message}`);

        socket.emit('vlite:error', {
          code: 'SESSION_START_FAILED',
          message: 'Unable to start session.',
        });
      }
    });

    /**
     * Host ends session.
     */
    socket.on('session:end', async (data = {}) => {
      try {
        await handleEndSession(io, socket, data);
      } catch (error) {
        logger.error(`session:end error: ${error.message}`);

        socket.emit('vlite:error', {
          code: 'SESSION_END_FAILED',
          message: 'Unable to end session.',
        });
      }
    });

    /**
     * Host starts next question.
     */
    socket.on('question:next', async (data = {}) => {
      try {
        await handleNextQuestion(io, socket, data);
      } catch (error) {
        logger.error(`question:next error: ${error.message}`);

        socket.emit('vlite:error', {
          code: 'QUESTION_START_FAILED',
          message: 'Unable to start question.',
        });
      }
    });

    /**
     * Participant submits answer.
     */
    socket.on('answer:submit', async (data = {}) => {
      try {
        await handleAnswerSubmit(io, socket, data);
      } catch (error) {
        logger.error(`answer:submit error: ${error.message}`);

        socket.emit('vlite:error', {
          code: 'ANSWER_FAILED',
          message: 'Unable to process answer.',
        });
      }
    });

    /**
     * Expert mode raise hand.
     */
    socket.on('expert:raise-hand', async (data = {}) => {
      try {
        await handleRaiseHand(io, socket, data);
      } catch (error) {
        logger.error(`expert:raise-hand error: ${error.message}`);

        socket.emit('vlite:error', {
          code: 'RAISE_HAND_FAILED',
          message: 'Unable to raise hand.',
        });
      }
    });

    /**
     * Session sync (reconnect/recovery).
     */
    socket.on('session:sync', async (data = {}) => {
      try {
        await handleSync(io, socket, data);
      } catch (error) {
        logger.error(`session:sync error: ${error.message}`);

        socket.emit('vlite:error', {
          code: 'SESSION_SYNC_FAILED',
          message: 'Unable to sync session.',
        });
      }
    });

    /**
     * Explicit room leave.
     */
    socket.on('room:leave', async ({ roomId } = {}) => {
      try {
        if (!roomId) {
          return;
        }

        const roomName = `room:${roomId}`;

        if (socket.rooms.has(roomName)) {
          await socket.leave(roomName);
        }

        if (String(socket.roomId) === String(roomId)) {
          socket.roomId = null;
        }

        logger.info(`Socket ${socket.id} left ${roomName}`);
      } catch (error) {
        logger.error(`room:leave error: ${error.message}`);
      }
    });

    /**
     * Disconnect.
     */
    socket.on('disconnect', async (reason) => {
      logger.info(
        `Socket disconnected: ${socket.id} role=${socket.user?.role} reason=${reason}`
      );

      // Mark participant as disconnected and update live count
      if (socket.user?.role === 'participant' && socket.participantSessionId) {
        try {
          const ParticipantSession = (await import('../models/ParticipantSession.js')).default;
          const session = await ParticipantSession.findByIdAndUpdate(
            socket.participantSessionId,
            { isConnected: false, socketId: '' },
            { new: true }
          );
          if (session && socket.roomId) {
            await broadcastParticipantCount(io, socket.roomId);
          }
        } catch (error) {
          logger.error(`Disconnect handling error: ${error.message}`);
        }
      }

      // Clear question timer if host disconnects
      if (socket.user?.role === 'host' && socket.roomId) {
        try {
          const { clearRoomTimer } = await import('./handlers/roomHandler.js');
          clearRoomTimer(socket.roomId);
        } catch (error) {
          logger.error(`Timer cleanup error: ${error.message}`);
        }
      }
    });
  });
}

export {
  initSocketIO,
  authenticateSocket,
  joinRoomSocket,
  emitToRoom,
  broadcastToRoom,
};