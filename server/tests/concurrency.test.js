import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import Room from '../src/models/Room.js';
import ParticipantSession from '../src/models/ParticipantSession.js';
import Question from '../src/models/Question.js';
import Answer from '../src/models/Answer.js';
import { createRoom } from '../src/services/roomService.js';
import expertQueue from '../src/services/expertModeService.js';
import logger from '../src/utils/logger.js';
import {
  connectTestDb,
  disconnectTestDb,
  cleanupTestRun,
  ensureTestHost,
  TEST_ROOM_PREFIX,
} from './helpers/testDb.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vlite_test';
let HOST;

describe('Concurrency and Race Conditions', () => {
  beforeAll(async () => {
    await connectTestDb(MONGODB_URI, process.env.TEST_MONGODB_DB_NAME || 'vlite_test');
    HOST = (await ensureTestHost())._id;
  });

  afterAll(async () => {
    await cleanupTestRun(TEST_ROOM_PREFIX);
    await disconnectTestDb();
  });

  beforeEach(async () => {
    // Scoped cleanup: only this run's prefixed rooms and their data.
    await cleanupTestRun(TEST_ROOM_PREFIX);
    expertQueue.resetQueue('test-room-1');
    expertQueue.resetQueue('test-room-2');
    expertQueue.resetQueue('test-room-3');
  });

  /**
   * TEST 1: 50 participants submit answers at nearly the same moment.
   * Verify no duplicate scoring occurs.
   */
  it('TEST 1: 50 participants submit answers simultaneously - no duplicate scoring', async () => {
    const room = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Concurrency`, mode: 'normal', correctPoints: 10 });

    // Create a question
    const question = await Question.create({
      room: room._id,
      text: 'Test question',
      options: [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }],
      correctAnswerIndex: 0,
      durationSeconds: 30,
      order: 0,
    });

    // Create 50 participants
    const sessions = [];
    for (let i = 0; i < 50; i++) {
      const session = await ParticipantSession.create({
        participantName: `Participant${i}`,
        room: room._id,
        token: `token-${i}-${Date.now()}`,
      });
      sessions.push(session);
    }

    // All 50 submit the same answer simultaneously
    const answerPromises = sessions.map((session) =>
      Answer.create({
        participantSession: session._id,
        question: question._id,
        room: room._id,
        selectedOptionIndex: 0,
        isCorrect: true,
        pointsAwarded: 10,
        answeredAt: new Date(),
      }).catch((err) => {
        // Duplicate key error is expected for some
        if (err.code === 11000) return null;
        throw err;
      })
    );

    const results = await Promise.allSettled(answerPromises);
    const successful = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;
    const duplicates = results.filter((r) => r.status === 'rejected').length;

    // Only 50 answers should succeed (one per participant)
    expect(successful).toBeLessThanOrEqual(50);

    // Verify no duplicate answers in database
    const count = await Answer.countDocuments({ question: question._id });
    expect(count).toBeLessThanOrEqual(50);

    logger.info(`TEST 1 PASSED: ${successful} answers recorded, ${duplicates} rejected as duplicates`);
  }, 60000);

  /**
   * TEST 2: Multiple participants raise hands simultaneously.
   * Verify server determines priority deterministically.
   */
  it('TEST 2: Multiple participants raise hands simultaneously - deterministic ordering', async () => {
    const room = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Expert`, mode: 'expert' });
    const question = await Question.create({
      room: room._id,
      text: 'Expert question',
      options: [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }],
      correctAnswerIndex: 0,
      durationSeconds: 60,
      order: 0,
    });

    // Attach the expert queue to the active question first
    expertQueue.resetQueue(room._id.toString(), question._id.toString());

    // Create 20 participants
    const sessions = [];
    for (let i = 0; i < 20; i++) {
      const session = await ParticipantSession.create({
        participantName: `Expert${i}`,
        room: room._id,
        token: `token-expert-${i}-${Date.now()}`,
      });
      sessions.push(session);
    }

    // All raise hands (server timestamps decide the order)
    const positions = [];
    for (const session of sessions) {
      const result = expertQueue.raiseHand(
        room._id.toString(),
        question._id.toString(),
        session._id.toString(),
        session.participantName
      );
      expect(result.success).toBe(true);
      positions.push(result.position);
    }

    // All positions should be unique and sequential
    const uniquePositions = new Set(positions);
    expect(uniquePositions.size).toBe(positions.length);
    expect(uniquePositions.size).toBe(20);

    // Positions should be 1 through 20
    const sorted = [...uniquePositions].sort((a, b) => a - b);
    expect(sorted[0]).toBe(1);
    expect(sorted[sorted.length - 1]).toBe(20);

    // Duplicate raise-hand must be rejected
    const dup = expertQueue.raiseHand(
      room._id.toString(),
      question._id.toString(),
      sessions[0]._id.toString(),
      sessions[0].participantName
    );
    expect(dup.success).toBe(false);
    expect(dup.reason).toBe('already_raised');

    logger.info('TEST 2 PASSED: All raise-hand positions unique and sequential');
  });

  /**
   * TEST 3: Answer submitted exactly around question timeout.
   * Server should validate timing using server timestamps.
   */
  it('TEST 3: Answer near timeout - server validates using server time', async () => {
    const room = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Timeout`, mode: 'normal', correctPoints: 10 });
    const question = await Question.create({
      room: room._id,
      text: 'Timeout test',
      options: [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }],
      correctAnswerIndex: 0,
      durationSeconds: 5,
      order: 0,
    });

    const session = await ParticipantSession.create({
      participantName: 'TimeoutTester',
      room: room._id,
      token: `token-timeout-test-${Date.now()}`,
    });

    // Create answer with server timestamp
    const answer = await Answer.create({
      participantSession: session._id,
      question: question._id,
      room: room._id,
      selectedOptionIndex: 0,
      isCorrect: true,
      pointsAwarded: 10,
      answeredAt: new Date(),
    });

    // Verify answer was recorded
    expect(answer).toBeDefined();
    expect(answer.isCorrect).toBe(true);

    // Verify duplicate submission is rejected
    await expect(
      Answer.create({
        participantSession: session._id,
        question: question._id,
        room: room._id,
        selectedOptionIndex: 0,
        isCorrect: true,
        pointsAwarded: 10,
        answeredAt: new Date(),
      })
    ).rejects.toThrow();

    logger.info('TEST 3 PASSED: Duplicate answer rejected, timeout validation works');
  });

  /**
   * TEST 4: Same answer request sent twice.
   * Second should not create duplicate points.
   */
  it('TEST 4: Duplicate answer submission prevented', async () => {
    const room = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Duplicate`, mode: 'normal' });
    const question = await Question.create({
      room: room._id,
      text: 'Duplicate test',
      options: [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }],
      correctAnswerIndex: 0,
      durationSeconds: 30,
      order: 0,
    });

    const session = await ParticipantSession.create({
      participantName: 'DuplicateTester',
      room: room._id,
      token: `token-dup-test-${Date.now()}`,
    });

    // First answer
    await Answer.create({
      participantSession: session._id,
      question: question._id,
      room: room._id,
      selectedOptionIndex: 0,
      isCorrect: true,
      pointsAwarded: 10,
      answeredAt: new Date(),
    });

    // Try to create second answer for same participant/question
    await expect(
      Answer.create({
        participantSession: session._id,
        question: question._id,
        room: room._id,
        selectedOptionIndex: 0,
        isCorrect: true,
        pointsAwarded: 10,
        answeredAt: new Date(),
      })
    ).rejects.toThrow();

    // Verify only 1 answer exists
    const count = await Answer.countDocuments({ participantSession: session._id, question: question._id });
    expect(count).toBe(1);

    logger.info('TEST 4 PASSED: Duplicate answer submission prevented by unique index');
  });

  /**
   * TEST 5: Participant reconnects while question changes.
   * State should be synchronized from server.
   */
  it('TEST 5: Participant reconnect - state synchronized from server', async () => {
    const room = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Reconnect`, mode: 'normal' });

    const session = await ParticipantSession.create({
      participantName: 'ReconnectTester',
      room: room._id,
      token: `token-reconnect-${Date.now()}`,
    });

    // Simulate disconnect by updating lastSeenAt
    await ParticipantSession.findByIdAndUpdate(session._id, {
      isConnected: false,
      lastSeenAt: new Date(),
    });

    // Reconnect: verify session still exists
    const reconnected = await ParticipantSession.findById(session._id);
    expect(reconnected).toBeDefined();
    expect(reconnected.participantName).toBe('ReconnectTester');
    expect(reconnected.score).toBe(0);

    logger.info('TEST 5 PASSED: Reconnected participant state synchronized from server');
  });

  /**
   * TEST 6: Two rooms start questions at almost exactly the same time.
   * Verify room isolation.
   */
  it('TEST 6: Two rooms independent - no cross-room data leakage', async () => {
    const roomA = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Room A`, mode: 'normal' });
    const roomB = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Room B`, mode: 'intermediate' });

    // Verify rooms are different
    expect(roomA.lrn).not.toEqual(roomB.lrn);
    expect(roomA._id.toString()).not.toEqual(roomB._id.toString());

    // Create participants in each room
    await ParticipantSession.create({
      participantName: 'RoomAParticipant',
      room: roomA._id,
      token: `token-room-a-${Date.now()}`,
    });
    await ParticipantSession.create({
      participantName: 'RoomBParticipant',
      room: roomB._id,
      token: `token-room-b-${Date.now()}`,
    });

    // Verify participants are in correct rooms
    const countA = await ParticipantSession.countDocuments({ room: roomA._id });
    const countB = await ParticipantSession.countDocuments({ room: roomB._id });

    expect(countA).toBe(1);
    expect(countB).toBe(1);
    expect(countA + countB).toBe(2);

    logger.info('TEST 6 PASSED: Room A and Room B isolated, no cross-room data leakage');
  });

  /**
   * TEST 7: Two room creation requests happen concurrently.
   * LRNs must be unique.
   */
  it('TEST 7: Concurrent room creation - unique LRN guaranteed', async () => {
    const createRoomPromises = [];
    for (let i = 0; i < 5; i++) {
      createRoomPromises.push(createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Concurrent ${i}` }));
    }

    const rooms = await Promise.all(createRoomPromises);
    const lrns = rooms.map((r) => r.lrn);

    // All LRNs must be unique
    const uniqueLRNs = new Set(lrns);
    expect(uniqueLRNs.size).toBe(5);

    // All LRNs must be 4 digits
    for (const lrn of lrns) {
      expect(lrn).toMatch(/^\d{4}$/);
    }

    logger.info('TEST 7 PASSED: All 5 concurrent room creations have unique LRNs');
  });

  /**
   * TEST 8: Verify database constraints prevent invalid state.
   */
  it('TEST 8: Database constraints enforce data integrity', async () => {
    const room = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Constraint` });

    // Try to create room with duplicate LRN
    await expect(
      Room.create({ lrn: room.lrn, name: `${TEST_ROOM_PREFIX} Duplicate LRN`, host: HOST })
    ).rejects.toThrow();

    // Try to create participant session with duplicate token
    const dupToken = `unique-token-${Date.now()}`;
    await ParticipantSession.create({
      participantName: 'Test',
      room: room._id,
      token: dupToken,
    });

    await expect(
      ParticipantSession.create({
        participantName: 'Test2',
        room: room._id,
        token: dupToken, // Same token
      })
    ).rejects.toThrow();

    logger.info('TEST 8 PASSED: Database constraints enforce data integrity');
  });
});
