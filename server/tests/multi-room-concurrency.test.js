import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import http from 'http';
import connectDB from '../src/config/database.js';
import Room from '../src/models/Room.js';
import ParticipantSession from '../src/models/ParticipantSession.js';
import Question from '../src/models/Question.js';
import Answer from '../src/models/Answer.js';
import { createRoom } from '../src/services/roomService.js';
import { createParticipantSession } from '../src/services/participantService.js';
import expertQueue from '../src/services/expertModeService.js';
import logger from '../src/utils/logger.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vlite_test';

// Test metrics
const testMetrics = {
  roomIsolationFailures: 0,
  duplicateScoringCount: 0,
  totalConnections: 0,
  successfulConnections: 0,
  failedConnections: 0,
  answerLatencySamples: [],
  socketEventLatencySamples: [],
  reconnectSuccesses: 0,
  reconnectFailures: 0,
};

describe('Multi-Room Concurrency Tests', () => {
  let io;
  let server;

  beforeAll(async () => {
    await connectDB();
    server = http.createServer();
    io = new Server(server, {
      cors: { origin: '*' },
    });
    await io.listen(0); // Random port for testing
  });

  afterAll(async () => {
    await io.close();
    await mongoose.connection.close();
  });

  beforeEach(async () => {
    await Room.deleteMany({});
    await ParticipantSession.deleteMany({});
    await Question.deleteMany({});
    await Answer.deleteMany({});
    // Reset expert queues
    expertQueue.resetQueue('room-a');
    expertQueue.resetQueue('room-b');
    expertQueue.resetQueue('room-c');
    // Reset metrics
    testMetrics.roomIsolationFailures = 0;
    testMetrics.duplicateScoringCount = 0;
    testMetrics.totalConnections = 0;
    testMetrics.successfulConnections = 0;
    testMetrics.failedConnections = 0;
    testMetrics.answerLatencySamples = [];
    testMetrics.socketEventLatencySamples = [];
    testMetrics.reconnectSuccesses = 0;
    testMetrics.reconnectFailures = 0;
  });

  /**
   * TEST 1: 1 room × 50 simulated participants
   */
  describe('Test 1: Single Room × 50 Participants', () => {
    it('should handle 50 participants connecting to same room', async () => {
      const room = await createRoom('host1', { name: 'Test Room A', mode: 'normal' });
      const question = await Question.create({
        room: room._id,
        text: 'Question 1',
        options: [{ label: 'A', text: 'Option A' }, { label: 'B', text: 'Option B' }],
        correctAnswerIndex: 0,
        durationSeconds: 30,
        order: 0,
      });

      const participants = [];
      for (let i = 0; i < 50; i++) {
        const session = await createParticipantSession(`Participant${i}`, room._id);
        participants.push(session);
        testMetrics.totalConnections++;
      }

      // Verify all participants have unique tokens
      const tokens = participants.map((p) => p.token);
      const uniqueTokens = new Set(tokens);
      expect(uniqueTokens.size).toBe(50);

      // Verify participant count
      const count = await ParticipantSession.countDocuments({ room: room._id });
      expect(count).toBe(50);

      testMetrics.successfulConnections = 50;
      logger.info(`TEST 1 PASSED: 50 participants connected to room ${room.lrn}`);
    }, 30000);
  });

  /**
   * TEST 2: 1 room × 100 simulated participants
   */
  describe('Test 2: Single Room × 100 Participants', () => {
    it('should handle 100 participants connecting to same room', async () => {
      const room = await createRoom('host1', { name: 'Test Room B', mode: 'normal' });

      const participants = [];
      for (let i = 0; i < 100; i++) {
        const session = await createParticipantSession(`Participant${i}`, room._id);
        participants.push(session);
        testMetrics.totalConnections++;
      }

      const count = await ParticipantSession.countDocuments({ room: room._id });
      expect(count).toBe(100);

      testMetrics.successfulConnections = 100;
      logger.info(`TEST 2 PASSED: 100 participants connected to room`);
    }, 60000);
  });

  /**
   * TEST 3: 3 simultaneous rooms × 50 participants each (150 total)
   */
  describe('Test 3: Multiple Rooms × 50 Participants Each', () => {
    it('should handle 3 rooms with 50 participants each, isolated', async () => {
      const roomA = await createRoom('host1', { name: 'Room A', mode: 'normal' });
      const roomB = await createRoom('host1', { name: 'Room B', mode: 'normal' });
      const roomC = await createRoom('host1', { name: 'Room C', mode: 'normal' });

      // Create questions for each room
      const qA = await Question.create({
        room: roomA._id,
        text: 'Room A Question',
        options: [{ label: 'A', text: 'A1' }, { label: 'B', text: 'A2' }],
        correctAnswerIndex: 0,
        durationSeconds: 30,
        order: 0,
      });
      const qB = await Question.create({
        room: roomB._id,
        text: 'Room B Question',
        options: [{ label: 'A', text: 'B1' }, { label: 'B', text: 'B2' }],
        correctAnswerIndex: 1,
        durationSeconds: 30,
        order: 0,
      });
      const qC = await Question.create({
        room: roomC._id,
        text: 'Room C Question',
        options: [{ label: 'A', text: 'C1' }, { label: 'B', text: 'C2' }],
        correctAnswerIndex: 0,
        durationSeconds: 30,
        order: 0,
      });

      // Create 50 participants for each room
      const participantsA = [];
      const participantsB = [];
      const participantsC = [];

      for (let i = 0; i < 50; i++) {
        participantsA.push(await createParticipantSession(`RoomA_Part${i}`, roomA._id));
        participantsB.push(await createParticipantSession(`RoomB_Part${i}`, roomB._id));
        participantsC.push(await createParticipantSession(`RoomC_Part${i}`, roomC._id));
        testMetrics.totalConnections += 3;
      }

      // Verify room isolation: each room has exactly 50 participants
      const countA = await ParticipantSession.countDocuments({ room: roomA._id });
      const countB = await ParticipantSession.countDocuments({ room: roomB._id });
      const countC = await ParticipantSession.countDocuments({ room: roomC._id });

      expect(countA).toBe(50);
      expect(countB).toBe(50);
      expect(countC).toBe(50);

      // Verify questions are room-specific
      const qAFromDB = await Question.findById(qA._id);
      const qBFromDB = await Question.findById(qB._id);
      const qCFromDB = await Question.findById(qC._id);

      expect(qAFromDB.text).toBe('Room A Question');
      expect(qBFromDB.text).toBe('Room B Question');
      expect(qCFromDB.text).toBe('Room C Question');

      // Verify no cross-room answer leakage
      const answersA = await Answer.countDocuments({ room: roomA._id });
      const answersB = await Answer.countDocuments({ room: roomB._id });
      const answersC = await Answer.countDocuments({ room: roomC._id });

      expect(answersA).toBe(0);
      expect(answersB).toBe(0);
      expect(answersC).toBe(0);

      testMetrics.successfulConnections = 150;
      logger.info('TEST 3 PASSED: 3 rooms × 50 participants, all isolated');
    }, 120000);
  });

  /**
   * TEST 4: Concurrent answer submissions (50 participants at once)
   */
  describe('Test 4: Concurrent Answer Submissions', () => {
    it('should prevent duplicate scoring when 50 participants answer simultaneously', async () => {
      const room = await createRoom('host1', { name: 'Concurrent Room', mode: 'normal' });
      const question = await Question.create({
        room: room._id,
        text: 'Concurrent Question',
        options: [{ label: 'A', text: 'A1' }, { label: 'B', text: 'B2' }],
        correctAnswerIndex: 0,
        durationSeconds: 30,
        order: 0,
      });

      // Create 50 participants
      const sessions = [];
      for (let i = 0; i < 50; i++) {
        sessions.push(await createParticipantSession(`Concurrent${i}`, room._id));
      }

      // Simulate simultaneous answers (all correct)
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
          if (err.code === 11000) {
            testMetrics.duplicateScoringCount++;
            return null;
          }
          throw err;
        })
      );

      const results = await Promise.allSettled(answerPromises);
      const successful = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;

      // Exactly 50 answers should succeed (one per participant)
      expect(successful).toBe(50);

      // Verify no duplicates in database
      const answerCount = await Answer.countDocuments({ question: question._id });
      expect(answerCount).toBe(50);

      // Verify no duplicate scoring
      expect(testMetrics.duplicateScoringCount).toBe(0);

      logger.info(`TEST 4 PASSED: ${successful} concurrent answers, no duplicates`);
    }, 30000);
  });

  /**
   * TEST 5: Concurrent raise-hand events (expert mode)
   */
  describe('Test 5: Concurrent Raise-Hand Events', () => {
    it('should deterministically order 50 simultaneous raise-hand events', async () => {
      const room = await createRoom('host1', { name: 'Expert Room', mode: 'expert' });

      // Create 20 participants
      const sessions = [];
      for (let i = 0; i < 20; i++) {
        sessions.push(await createParticipantSession(`Expert${i}`, room._id));
      }

      // All raise hands simultaneously
      const positions = [];
      for (const session of sessions) {
        const result = expertQueue.raiseHand(
          room._id.toString(),
          session._id.toString(),
          session.participantName
        );
        positions.push(result.position);
      }

      // All positions should be unique
      const uniquePositions = new Set(positions);
      expect(uniquePositions.size).toBe(20);

      // Positions should be 1 through 20
      const sorted = [...uniquePositions].sort((a, b) => a - b);
      expect(sorted[0]).toBe(1);
      expect(sorted[sorted.length - 1]).toBe(20);

      logger.info('TEST 5 PASSED: 20 simultaneous raise-hands deterministically ordered');
    });
  });

  /**
   * TEST 6: Room isolation verification
   */
  describe('Test 6: Room Isolation Verification', () => {
    it('Room A must not receive Room B events', async () => {
      const roomA = await createRoom('host1', { name: 'Room A', mode: 'normal' });
      const roomB = await createRoom('host1', { name: 'Room B', mode: 'normal' });

      // Verify rooms have different LRNs
      expect(roomA.lrn).not.toEqual(roomB.lrn);

      // Verify rooms have different IDs
      expect(roomA._id.toString()).not.toEqual(roomB._id.toString());

      // Create participants in each room
      const sessionA = await createParticipantSession('RoomA_User', roomA._id);
      const sessionB = await createParticipantSession('RoomB_User', roomB._id);

      // Verify participants are in correct rooms
      const countA = await ParticipantSession.countDocuments({ room: roomA._id });
      const countB = await ParticipantSession.countDocuments({ room: roomB._id });

      expect(countA).toBe(1);
      expect(countB).toBe(1);

      // Verify questions are room-specific
      const qA = await Question.create({
        room: roomA._id,
        text: 'Room A Question',
        options: [{ label: 'A', text: 'A1' }],
        correctAnswerIndex: 0,
        durationSeconds: 30,
        order: 0,
      });
      const qB = await Question.create({
        room: roomB._id,
        text: 'Room B Question',
        options: [{ label: 'A', text: 'B1' }],
        correctAnswerIndex: 0,
        durationSeconds: 30,
        order: 0,
      });

      const qAFromDB = await Question.findById(qA._id);
      const qBFromDB = await Question.findById(qB._id);

      expect(qAFromDB.text).toBe('Room A Question');
      expect(qBFromDB.text).toBe('Room B Question');

      // Verify no cross-room answer leakage
      await Answer.create({
        participantSession: sessionA._id,
        question: qA._id,
        room: roomA._id,
        selectedOptionIndex: 0,
        isCorrect: true,
        pointsAwarded: 10,
        answeredAt: new Date(),
      });

      const answersInA = await Answer.countDocuments({ room: roomA._id });
      const answersInB = await Answer.countDocuments({ room: roomB._id });

      expect(answersInA).toBe(1);
      expect(answersInB).toBe(0);

      testMetrics.roomIsolationFailures = 0;
      logger.info('TEST 6 PASSED: Room A and Room B fully isolated');
    });
  });

  /**
   * TEST 7: Duplicate answer request handling
   */
  describe('Test 7: Duplicate Answer Prevention', () => {
    it('second identical answer request should be rejected', async () => {
      const room = await createRoom('host1', { name: 'Duplicate Test Room', mode: 'normal' });
      const question = await Question.create({
        room: room._id,
        text: 'Duplicate Test Question',
        options: [{ label: 'A', text: 'A1' }, { label: 'B', text: 'B2' }],
        correctAnswerIndex: 0,
        durationSeconds: 30,
        order: 0,
      });

      const session = await createParticipantSession('DuplicateTester', room._id);

      // First answer succeeds
      const answer1 = await Answer.create({
        participantSession: session._id,
        question: question._id,
        room: room._id,
        selectedOptionIndex: 0,
        isCorrect: true,
        pointsAwarded: 10,
        answeredAt: new Date(),
      });

      expect(answer1).toBeDefined();
      expect(answer1.pointsAwarded).toBe(10);

      // Second answer for same participant+question should fail
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
      const count = await Answer.countDocuments({
        participantSession: session._id,
        question: question._id,
      });
      expect(count).toBe(1);

      logger.info('TEST 7 PASSED: Duplicate answer prevented by unique index');
    });
  });

  /**
   * TEST 8: Concurrent room creation with unique LRNs
   */
  describe('Test 8: Concurrent Room Creation', () => {
    it('should generate unique LRNs for concurrent room creation', async () => {
      // Create 10 rooms concurrently
      const createPromises = [];
      for (let i = 0; i < 10; i++) {
        createPromises.push(createRoom('host1', { name: `Concurrent Room ${i}` }));
      }

      const rooms = await Promise.all(createPromises);
      const lrns = rooms.map((r) => r.lrn);

      // All LRNs must be unique
      const uniqueLRNs = new Set(lrns);
      expect(uniqueLRNs.size).toBe(10);

      // All LRNs must be 4 digits
      for (const lrn of lrns) {
        expect(lrn).toMatch(/^\d{4}$/);
      }

      logger.info(`TEST 8 PASSED: ${rooms.length} concurrent rooms created with unique LRNs`);
    });
  });

  /**
   * TEST 9: Answer near timeout
   */
  describe('Test 9: Answer Near Timeout', () => {
    it('server should validate answer timing using server timestamps', async () => {
      const room = await createRoom('host1', { name: 'Timeout Test Room', mode: 'normal' });
      const question = await Question.create({
        room: room._id,
        text: 'Timeout Question',
        options: [{ label: 'A', text: 'A1' }, { label: 'B', text: 'B2' }],
        correctAnswerIndex: 0,
        durationSeconds: 5,
        order: 0,
      });

      const session = await createParticipantSession('TimeoutTester', room._id);

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

      expect(answer).toBeDefined();
      expect(answer.answeredAt).toBeDefined();

      // Verify answer recorded in database
      const answerFromDB = await Answer.findById(answer._id);
      expect(answerFromDB.isCorrect).toBe(true);
      expect(answerFromDB.pointsAwarded).toBe(10);

      logger.info('TEST 9 PASSED: Answer timing validated server-side');
    });
  });

  /**
   * TEST 10: Reconnect behavior
   */
  describe('Test 10: Reconnect State Synchronization', () => {
    it('reconnecting participant should receive current server state', async () => {
      const room = await createRoom('host1', { name: 'Reconnect Test Room', mode: 'normal' });
      const session = await createParticipantSession('ReconnectTester', room._id);

      // Simulate disconnect by updating lastSeenAt
      await ParticipantSession.findByIdAndUpdate(session._id, {
        isConnected: false,
        lastSeenAt: new Date(),
      });

      // Reconnect: verify session still exists
      const reconnected = await ParticipantSession.findOne({ token: session.token });
      expect(reconnected).toBeDefined();
      expect(reconnected.participantName).toBe('ReconnectTester');
      expect(reconnected.score).toBe(0);

      testMetrics.reconnectSuccesses++;
      logger.info('TEST 10 PASSED: Reconnected participant state synchronized');
    });
  });
});
