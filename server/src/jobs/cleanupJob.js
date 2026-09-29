import ParticipantSession from '../models/ParticipantSession.js';
import Room from '../models/Room.js';
import Answer from '../models/Answer.js';
import logger from '../utils/logger.js';
import config from '../config/index.js';

/**
 * Session cleanup job.
 * Runs periodically to remove stale data while preserving historical results.
 *
 * Retention policy:
 * - Permanent: Results, Answer records, Questions, Room configurations
 * - Temporary: ParticipantSession (cleaned after session ends + grace period)
 * - Temporary: Expert queue state (in-memory, reset per question)
 *
 * Do NOT delete:
 * - Result records (historical session results)
 * - Answer records (audit trail)
 * - Question data
 * - Room configurations
 *
 * Configurable via environment variables:
 * - SESSION_CLEANUP_INTERVAL_MS: How often cleanup runs (default: 30min)
 * - SESSION_GRACE_PERIOD_MS: Time to keep ended sessions (default: 24h)
 * - PARTICIPANT_GRACE_PERIOD_MS: Time to keep disconnected participants (default: 1h)
 */

const SESSION_GRACE_PERIOD_MS = parseInt(process.env.SESSION_GRACE_PERIOD_MS || '86400000', 10); // 24h
const PARTICIPANT_GRACE_PERIOD_MS = parseInt(process.env.PARTICIPANT_GRACE_PERIOD_MS || '3600000', 10); // 1h
const CLEANUP_INTERVAL_MS = parseInt(process.env.CLEANUP_INTERVAL_MS || '1800000', 10); // 30min

let cleanupInterval = null;

/**
 * Clean up participant sessions from ended rooms past the grace period.
 * Preserves Answer and Result records.
 */
async function cleanupEndedSessions() {
  try {
    const cutoff = new Date(Date.now() - SESSION_GRACE_PERIOD_MS);

    // Find ended rooms with old sessions
    const endedRooms = await Room.find({
      status: 'ended',
      updatedAt: { $lt: cutoff },
    });

    if (endedRooms.length === 0) {
      logger.info('Cleanup: No ended sessions to clean');
      return;
    }

    for (const room of endedRooms) {
      const removed = await ParticipantSession.deleteMany({
        room: room._id,
        joinedAt: { $lt: cutoff },
      });
      logger.info(`Cleanup: Removed ${removed.deletedCount} sessions from room ${room.lrn}`);
    }
  } catch (error) {
    logger.error(`Cleanup error: ${error.message}`);
  }
}

/**
 * Mark disconnected participants who haven't been seen for too long.
 * Does NOT delete them - just marks them as disconnected.
 * Preserves their scores and answer history.
 */
async function cleanupDisconnectedParticipants() {
  try {
    const cutoff = new Date(Date.now() - PARTICIPANT_GRACE_PERIOD_MS);

    const updated = await ParticipantSession.updateMany(
      {
        isConnected: true,
        lastSeenAt: { $lt: cutoff },
      },
      { isConnected: false }
    );

    if (updated.modifiedCount > 0) {
      logger.info(`Cleanup: Marked ${updated.modifiedCount} participants as disconnected`);
    }
  } catch (error) {
    logger.error(`Cleanup error: ${error.message}`);
  }
}

/**
 * Remove stale expert queue entries for ended rooms.
 * The expert queue is in-memory, so this is a safety net.
 */
async function cleanupExpertQueues() {
  try {
    const expertQueue = require('../services/expertModeService.js').default;
    const endedRooms = await Room.find({ status: 'ended' });

    for (const room of endedRooms) {
      const queue = expertQueue.getQueue(room._id.toString());
      if (queue.length > 0) {
        expertQueue.resetQueue(room._id.toString());
        logger.info(`Cleanup: Reset expert queue for ended room ${room.lrn}`);
      }
    }
  } catch (error) {
    logger.error(`Cleanup expert queues error: ${error.message}`);
  }
}

/**
 * Main cleanup routine.
 */
async function runCleanup() {
  logger.info('Running session cleanup...');

  await cleanupEndedSessions();
  await cleanupDisconnectedParticipants();
  await cleanupExpertQueues();

  logger.info('Session cleanup complete');
}

/**
 * Start the cleanup interval.
 */
function startCleanup() {
  if (cleanupInterval) {
    logger.warn('Cleanup already running');
    return;
  }

  runCleanup(); // Run immediately on start
  cleanupInterval = setInterval(runCleanup, CLEANUP_INTERVAL_MS);
  logger.info(`Cleanup job started: interval=${CLEANUP_INTERVAL_MS}ms, grace=${SESSION_GRACE_PERIOD_MS}ms`);
}

/**
 * Stop the cleanup interval.
 */
function stopCleanup() {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    logger.info('Cleanup job stopped');
  }
}

export { runCleanup, startCleanup, stopCleanup };
