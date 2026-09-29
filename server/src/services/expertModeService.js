import logger from '../utils/logger.js';

/**
 * Expert mode priority queue.
 * Server-side ordered queue using server timestamps and event ordering.
 *
 * Each room has its own queue instance.
 */
class ExpertQueue {
  constructor() {
    this.queues = new Map(); // roomId -> [{ participantId, name, raisedAt, order }]
  }

  /**
   * Raise hand - records server-side timestamp.
   * Returns the queue position (1-based).
   */
  raiseHand(roomId, participantId, participantName) {
    if (!this.queues.has(roomId)) {
      this.queues.set(roomId, []);
    }

    const queue = this.queues.get(roomId);

    // Prevent duplicate raise hands for same participant in same question
    const existing = queue.find((q) => q.participantId === participantId);
    if (existing) {
      return { success: false, reason: 'already_raised', position: queue.indexOf(existing) + 1 };
    }

    const entry = {
      participantId,
      participantName,
      raisedAt: Date.now(), // Server timestamp - not client time
      order: queue.length + 1,
    };

    queue.push(entry);
    logger.info(`Expert raise hand: room=${roomId} participant=${participantId} position=${entry.order}`);

    return { success: true, position: entry.order, total: queue.length };
  }

  /**
   * Get current queue for a room.
   */
  getQueue(roomId) {
    return this.queues.get(roomId) || [];
  }

  /**
   * Get the current top-priority participant.
   */
  getTopPriority(roomId) {
    const queue = this.queues.get(roomId);
    if (!queue || queue.length === 0) return null;
    return queue[0];
  }

  /**
   * Remove a participant from the queue (after they answer or timeout).
   */
  removeFromQueue(roomId, participantId) {
    const queue = this.queues.get(roomId);
    if (!queue) return;
    const idx = queue.findIndex((q) => q.participantId === participantId);
    if (idx >= 0) {
      queue.splice(idx, 1);
      // Reorder
      queue.forEach((q, i) => {
        q.order = i + 1;
      });
    }
  }

  /**
   * Reset queue for a new question.
   */
  resetQueue(roomId) {
    this.queues.set(roomId, []);
    logger.info(`Expert queue reset: room=${roomId}`);
  }

  /**
   * Get queue state for synchronization.
   */
  getQueueState(roomId) {
    const queue = this.queues.get(roomId) || [];
    return queue.map((q) => ({
      participantId: q.participantId,
      participantName: q.participantName,
      order: q.order,
      raisedAt: q.raisedAt,
    }));
  }
}

// Singleton expert queue manager
const expertQueue = new ExpertQueue();

export default expertQueue;
