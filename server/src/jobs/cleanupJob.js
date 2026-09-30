import ParticipantSession from '../models/ParticipantSession.js';
import Room from '../models/Room.js';
import logger from '../utils/logger.js';
import expertQueue from '../services/expertModeService.js';

/**
 * Session cleanup job.
 *
 * Retention policy:
 * - Permanent: Results, Answers, Questions, Room configurations
 * - Temporary: ParticipantSession records from old ended sessions
 * - Temporary: Expert queue state (in-memory)
 *
 * Configurable through environment variables:
 * - SESSION_CLEANUP_INTERVAL_MS
 * - SESSION_GRACE_PERIOD_MS
 * - PARTICIPANT_GRACE_PERIOD_MS
 */

const SESSION_GRACE_PERIOD_MS = parseInt(
  process.env.SESSION_GRACE_PERIOD_MS || '86400000',
  10
);

const PARTICIPANT_GRACE_PERIOD_MS = parseInt(
  process.env.PARTICIPANT_GRACE_PERIOD_MS || '3600000',
  10
);

const CLEANUP_INTERVAL_MS = parseInt(
  process.env.CLEANUP_INTERVAL_MS || '1800000',
  10
);

let cleanupInterval = null;

/**
 * Remove participant sessions belonging to old ended rooms.
 *
 * Answer and Result records are intentionally preserved.
 */
async function cleanupEndedSessions() {
  try {
    const cutoff = new Date(Date.now() - SESSION_GRACE_PERIOD_MS);

    const endedRooms = await Room.find({
      status: 'ended',
      updatedAt: { $lt: cutoff },
    }).select('_id lrn');

    if (endedRooms.length === 0) {
      logger.info('Cleanup: No ended sessions to clean');
      return;
    }

    for (const room of endedRooms) {
      const removed = await ParticipantSession.deleteMany({
        room: room._id,
        joinedAt: { $lt: cutoff },
      });

      if (removed.deletedCount > 0) {
        logger.info(
          `Cleanup: Removed ${removed.deletedCount} sessions from room ${room.lrn}`
        );
      }
    }
  } catch (error) {
    logger.error(`Cleanup error: ${error.message}`);
  }
}

/**
 * Mark participants as disconnected when they have not
 * sent a heartbeat/update for the configured grace period.
 *
 * Participant records are not deleted here.
 */
async function cleanupDisconnectedParticipants() {
  try {
    const cutoff = new Date(Date.now() - PARTICIPANT_GRACE_PERIOD_MS);

    const updated = await ParticipantSession.updateMany(
      {
        isConnected: true,
        lastSeenAt: { $lt: cutoff },
      },
      {
        $set: {
          isConnected: false,
        },
      }
    );

    if (updated.modifiedCount > 0) {
      logger.info(
        `Cleanup: Marked ${updated.modifiedCount} participants as disconnected`
      );
    }
  } catch (error) {
    logger.error(`Cleanup error: ${error.message}`);
  }
}

/**
 * Reset in-memory Expert Mode queues for ended rooms.
 *
 * No database records are required for the queue itself.
 */
async function cleanupExpertQueues() {
  try {
    const endedRooms = await Room.find({
      status: 'ended',
    }).select('_id lrn');

    for (const room of endedRooms) {
      const roomId = room._id.toString();
      const queue = expertQueue.getQueue(roomId);

      if (queue.length > 0) {
        expertQueue.resetQueue(roomId);

        logger.info(
          `Cleanup: Reset expert queue for ended room ${room.lrn}`
        );
      }
    }
  } catch (error) {
    logger.error(`Cleanup expert queues error: ${error.message}`);
  }
}

/**
 * Run all cleanup operations.
 */
async function runCleanup() {
  logger.info('Running session cleanup...');

  await cleanupEndedSessions();
  await cleanupDisconnectedParticipants();
  await cleanupExpertQueues();

  logger.info('Session cleanup complete');
}

/**
 * Start the periodic cleanup job.
 *
 * Cleanup runs immediately once and then according
 * to CLEANUP_INTERVAL_MS.
 */
function startCleanup() {
  if (cleanupInterval) {
    logger.warn('Cleanup already running');
    return;
  }

  runCleanup();

  cleanupInterval = setInterval(
    runCleanup,
    CLEANUP_INTERVAL_MS
  );

  logger.info(
    `Cleanup job started: interval=${CLEANUP_INTERVAL_MS}ms, grace=${SESSION_GRACE_PERIOD_MS}ms`
  );
}

/**
 * Stop the cleanup job.
 */
function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;

    logger.info('Cleanup job stopped');
  }
}

export {
  runCleanup,
  startCleanup,
  stopCleanup,
};