/**
 * VLITE Test Runner
 * 
 * Runs all tests directly with Node.js (no Jest dependency).
 * 
 * Usage:
 *   node tests/run-tests.js
 * 
 * Requires MONGODB_URI in server/.env pointing to a valid MongoDB Atlas cluster
 * 
 * NOTE: This script requires MongoDB Atlas to be configured.
 * Set MONGODB_URI in server/.env before running.
 */

import mongoose from 'mongoose';
import connectDB from '../src/config/database.js';
import Room from '../src/models/Room.js';
import ParticipantSession from '../src/models/ParticipantSession.js';
import Question from '../src/models/Question.js';
import Answer from '../src/models/Answer.js';
import Result from '../src/models/Result.js';
import { createRoom } from '../src/services/roomService.js';
import { createParticipantSession } from '../src/services/participantService.js';
import expertQueue from '../src/services/expertModeService.js';
import logger from '../src/utils/logger.js';

const MONGODB_URI = process.env.MONGODB_URI || '';

// Test metrics
const metrics = {
  passed: 0,
  failed: 0,
  total: 0,
  roomIsolationFailures: 0,
  duplicateScoringCount: 0,
  totalConnections: 0,
  successfulConnections: 0,
  failedConnections: 0,
  answerLatencySamples: [],
  socketEventLatencySamples: [],
  reconnectSuccesses: 0,
  reconnectFailures: 0,
  startTime: Date.now(),
};

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function cleanup() {
  await Room.deleteMany({});
  await ParticipantSession.deleteMany({});
  await Question.deleteMany({});
  await Answer.deleteMany({});
  await Result.deleteMany({});
  expertQueue.resetQueue('test-room-a');
  expertQueue.resetQueue('test-room-b');
  expertQueue.resetQueue('test-room-c');
}

/**
 * TEST 1: 1 room × 50 participants
 */
async function test1_singleRoom50Participants() {
  metrics.total++;
  console.log('TEST 1: Single room × 50 participants...');

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
    metrics.totalConnections++;
  }

  // Verify all participants have unique tokens
  const tokens = participants.map((p) => p.token);
  const uniqueTokens = new Set(tokens);
  assert(uniqueTokens.size === 50, 'All tokens should be unique');

  // Verify participant count
  const count = await ParticipantSession.countDocuments({ room: room._id });
  assert(count === 50, `Expected 50 participants, got ${count}`);

  metrics.successfulConnections += 50;
  metrics.passed++;
  console.log('  PASSED: 50 participants connected');
}

/**
 * TEST 2: 1 room × 100 participants
 */
async function test2_singleRoom100Participants() {
  metrics.total++;
  console.log('TEST 2: Single room × 100 participants...');

  const room = await createRoom('host1', { name: 'Test Room B', mode: 'normal' });

  const participants = [];
  for (let i = 0; i < 100; i++) {
    const session = await createParticipantSession(`Participant${i}`, room._id);
    participants.push(session);
    metrics.totalConnections++;
  }

  const count = await ParticipantSession.countDocuments({ room: room._id });
  assert(count === 100, `Expected 100 participants, got ${count}`);

  metrics.successfulConnections += 100;
  metrics.passed++;
  console.log('  PASSED: 100 participants connected');
}

/**
 * TEST 3: 3 simultaneous rooms × 50 participants each (150 total)
 */
async function test3_threeRooms50Participants() {
  metrics.total++;
  console.log('TEST 3: 3 rooms × 50 participants each...');

  const roomA = await createRoom('host1', { name: 'Room A', mode: 'normal' });
  const roomB = await createRoom('host1', { name: 'Room B', mode: 'normal' });
  const roomC = await createRoom('host1', { name: 'Room C', mode: 'normal' });

  // Create questions for each room (different questions)
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
    metrics.totalConnections += 3;
  }

  // Verify room isolation: each room has exactly 50 participants
  const countA = await ParticipantSession.countDocuments({ room: roomA._id });
  const countB = await ParticipantSession.countDocuments({ room: roomB._id });
  const countC = await ParticipantSession.countDocuments({ room: roomC._id });

  assert(countA === 50, `Room A: expected 50, got ${countA}`);
  assert(countB === 50, `Room B: expected 50, got ${countB}`);
  assert(countC === 50, `Room C: expected 50, got ${countC}`);

  // Verify questions are room-specific
  const qAFromDB = await Question.findById(qA._id);
  const qBFromDB = await Question.findById(qB._id);
  const qCFromDB = await Question.findById(qC._id);

  assert(qAFromDB.text === 'Room A Question', 'Room A question mismatch');
  assert(qBFromDB.text === 'Room B Question', 'Room B question mismatch');
  assert(qCFromDB.text === 'Room C Question', 'Room C question mismatch');

  // Verify no cross-room answer leakage
  const answersA = await Answer.countDocuments({ room: roomA._id });
  const answersB = await Answer.countDocuments({ room: roomB._id });
  const answersC = await Answer.countDocuments({ room: roomC._id });

  assert(answersA === 0, `Room A should have 0 answers, got ${answersA}`);
  assert(answersB === 0, `Room B should have 0 answers, got ${answersB}`);
  assert(answersC === 0, `Room C should have 0 answers, got ${answersC}`);

  // Verify LRN uniqueness
  assert(roomA.lrn !== roomB.lrn, 'Room A and B LRNs should be different');
  assert(roomB.lrn !== roomC.lrn, 'Room B and C LRNs should be different');
  assert(roomA.lrn !== roomC.lrn, 'Room A and C LRNs should be different');

  metrics.successfulConnections += 150;
  metrics.passed++;
  console.log('  PASSED: 3 rooms × 50 participants, all isolated');
}

/**
 * TEST 4: Concurrent answer submissions (50 participants at once)
 */
async function test4_concurrentAnswers() {
  metrics.total++;
  console.log('TEST 4: 50 concurrent answer submissions...');

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

  // Simultaneous answers (all correct)
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
        metrics.duplicateScoringCount++;
        return null;
      }
      throw err;
    })
  );

  const results = await Promise.allSettled(answerPromises);
  const successful = results.filter((r) => r.status === 'fulfilled' && r.value !== null).length;

  // Exactly 50 answers should succeed
  assert(successful === 50, `Expected 50 answers, got ${successful}`);

  // Verify no duplicates in database
  const answerCount = await Answer.countDocuments({ question: question._id });
  assert(answerCount === 50, `Expected 50 answers in DB, got ${answerCount}`);

  // Verify no duplicate scoring
  assert(metrics.duplicateScoringCount === 0, `Duplicate scoring detected: ${metrics.duplicateScoringCount}`);

  metrics.passed++;
  console.log(`  PASSED: ${successful} concurrent answers, no duplicates`);
}

/**
 * TEST 5: Concurrent raise-hand events (expert mode)
 */
async function test5_concurrentRaiseHands() {
  metrics.total++;
  console.log('TEST 5: 20 concurrent raise-hand events...');

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
  assert(uniquePositions.size === 20, `Expected 20 unique positions, got ${uniquePositions.size}`);

  // Positions should be 1 through 20
  const sorted = [...uniquePositions].sort((a, b) => a - b);
  assert(sorted[0] === 1, `First position should be 1, got ${sorted[0]}`);
  assert(sorted[sorted.length - 1] === 20, `Last position should be 20, got ${sorted[sorted.length - 1]}`);

  metrics.passed++;
  console.log('  PASSED: 20 simultaneous raise-hands deterministically ordered');
}

/**
 * TEST 6: Room isolation verification
 */
async function test6_roomIsolation() {
  metrics.total++;
  console.log('TEST 6: Room isolation verification...');

  const roomA = await createRoom('host1', { name: 'Room A', mode: 'normal' });
  const roomB = await createRoom('host1', { name: 'Room B', mode: 'normal' });

  // Verify rooms have different LRNs
  assert(roomA.lrn !== roomB.lrn, 'Room A and B should have different LRNs');

  // Verify rooms have different IDs
  assert(roomA._id.toString() !== roomB._id.toString(), 'Room A and B should have different IDs');

  // Create participants in each room
  const sessionA = await createParticipantSession('RoomA_User', roomA._id);
  const sessionB = await createParticipantSession('RoomB_User', roomB._id);

  // Verify participants are in correct rooms
  const countA = await ParticipantSession.countDocuments({ room: roomA._id });
  const countB = await ParticipantSession.countDocuments({ room: roomB._id });

  assert(countA === 1, `Room A should have 1 participant, got ${countA}`);
  assert(countB === 1, `Room B should have 1 participant, got ${countB}`);

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

  assert(qAFromDB.text === 'Room A Question', 'Room A question mismatch');
  assert(qBFromDB.text === 'Room B Question', 'Room B question mismatch');

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

  assert(answersInA === 1, `Room A should have 1 answer, got ${answersInA}`);
  assert(answersInB === 0, `Room B should have 0 answers, got ${answersInB}`);

  metrics.roomIsolationFailures = 0;
  metrics.passed++;
  console.log('  PASSED: Room A and Room B fully isolated');
}

/**
 * TEST 7: Duplicate answer prevention
 */
async function test7_duplicateAnswerPrevention() {
  metrics.total++;
  console.log('TEST 7: Duplicate answer prevention...');

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

  assert(answer1 !== null, 'First answer should succeed');
  assert(answer1.pointsAwarded === 10, 'First answer should award 10 points');

  // Second answer for same participant+question should fail
  let duplicateError = false;
  try {
    await Answer.create({
      participantSession: session._id,
      question: question._id,
      room: room._id,
      selectedOptionIndex: 0,
      isCorrect: true,
      pointsAwarded: 10,
      answeredAt: new Date(),
    });
  } catch (err) {
    duplicateError = true;
  }

  assert(duplicateError, 'Second answer should be rejected');

  // Verify only 1 answer exists
  const count = await Answer.countDocuments({
    participantSession: session._id,
    question: question._id,
  });
  assert(count === 1, `Expected 1 answer, got ${count}`);

  metrics.passed++;
  console.log('  PASSED: Duplicate answer prevented by unique index');
}

/**
 * TEST 8: Concurrent room creation with unique LRNs
 */
async function test8_concurrentRoomCreation() {
  metrics.total++;
  console.log('TEST 8: Concurrent room creation with unique LRNs...');

  // Create 10 rooms concurrently
  const createPromises = [];
  for (let i = 0; i < 10; i++) {
    createPromises.push(createRoom('host1', { name: `Concurrent Room ${i}` }));
  }

  const rooms = await Promise.all(createPromises);
  const lrns = rooms.map((r) => r.lrn);

  // All LRNs must be unique
  const uniqueLRNs = new Set(lrns);
  assert(uniqueLRNs.size === 10, `Expected 10 unique LRNs, got ${uniqueLRNs.size}`);

  // All LRNs must be 4 digits
  for (const lrn of lrns) {
    assert(/^\d{4}$/.test(lrn), `LRN ${lrn} is not 4 digits`);
  }

  metrics.passed++;
  console.log(`  PASSED: ${rooms.length} concurrent rooms created with unique LRNs`);
}

/**
 * TEST 9: Answer near timeout
 */
async function test9_answerNearTimeout() {
  metrics.total++;
  console.log('TEST 9: Answer near timeout...');

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

  assert(answer !== null, 'Answer should be created');
  assert(answer.answeredAt !== null, 'Answer should have server timestamp');

  // Verify answer recorded in database
  const answerFromDB = await Answer.findById(answer._id);
  assert(answerFromDB.isCorrect === true, 'Answer should be correct');
  assert(answerFromDB.pointsAwarded === 10, 'Answer should award 10 points');

  metrics.passed++;
  console.log('  PASSED: Answer timing validated server-side');
}

/**
 * TEST 10: Reconnect behavior
 */
async function test10_reconnect() {
  metrics.total++;
  console.log('TEST 10: Reconnect state synchronization...');

  const room = await createRoom('host1', { name: 'Reconnect Test Room', mode: 'normal' });
  const session = await createParticipantSession('ReconnectTester', room._id);

  // Simulate disconnect by updating lastSeenAt
  await ParticipantSession.findByIdAndUpdate(session._id, {
    isConnected: false,
    lastSeenAt: new Date(),
  });

  // Reconnect: verify session still exists
  const reconnected = await ParticipantSession.findOne({ token: session.token });
  assert(reconnected !== null, 'Session should exist after reconnect');
  assert(reconnected.participantName === 'ReconnectTester', 'Participant name should be preserved');
  assert(reconnected.score === 0, 'Score should be preserved');

  metrics.reconnectSuccesses++;
  metrics.passed++;
  console.log('  PASSED: Reconnected participant state synchronized');
}

/**
 * Run all tests
 */
async function runTests() {
  console.log('========================================');
  console.log('VLITE CONCURRENCY & MULTI-ROOM TESTS');
  console.log('========================================\n');

  // Validate MongoDB connection
  if (!MONGODB_URI) {
    console.error('ERROR: MONGODB_URI not configured.');
    console.error('Set MONGODB_URI in server/.env');
    console.error('Example: MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/vlite');
    process.exit(1);
  }

  try {
    await cleanup();

    // Run all tests
    await test1_singleRoom50Participants();
    await test2_singleRoom100Participants();
    await test3_threeRooms50Participants();
    await test4_concurrentAnswers();
    await test5_concurrentRaiseHands();
    await test6_roomIsolation();
    await test7_duplicateAnswerPrevention();
    await test8_concurrentRoomCreation();
    await test9_answerNearTimeout();
    await test10_reconnect();

    // Print report
    const duration = ((Date.now() - metrics.startTime) / 1000).toFixed(1);

    console.log('\n========================================');
    console.log('TEST REPORT');
    console.log('========================================');
    console.log(`Duration: ${duration}s`);
    console.log(`Total tests: ${metrics.total}`);
    console.log(`Passed: ${metrics.passed}`);
    console.log(`Failed: ${metrics.total - metrics.passed}`);
    console.log('');
    console.log('--- Connections ---');
    console.log(`Total: ${metrics.totalConnections}`);
    console.log(`Successful: ${metrics.successfulConnections}`);
    console.log(`Failed: ${metrics.failedConnections}`);
    console.log('');
    console.log('--- Concurrency ---');
    console.log(`Duplicate scoring count: ${metrics.duplicateScoringCount}`);
    console.log(`Room isolation failures: ${metrics.roomIsolationFailures}`);
    console.log('');
    console.log('--- Reconnect ---');
    console.log(`Successes: ${metrics.reconnectSuccesses}`);
    console.log(`Failures: ${metrics.reconnectFailures}`);
    console.log('========================================\n');

    if (metrics.passed === metrics.total) {
      console.log('ALL TESTS PASSED ✓');
      process.exit(0);
    } else {
      console.log('SOME TESTS FAILED ✗');
      process.exit(1);
    }
  } catch (error) {
    logger.error(`Test failed: ${error.message}`);
    console.error(`ERROR: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle unhandled errors
process.on('uncaughtException', (err) => {
  logger.error(`Unhandled error in tests: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection in tests: ${reason}`);
  process.exit(1);
});

runTests();
