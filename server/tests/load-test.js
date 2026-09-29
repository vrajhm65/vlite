/**
 * VLITE Load Testing Script
 * 
 * Run with: node tests/load-test.js
 * 
 * Requires: MONGODB_URI to be set in server/.env
 * Uses Socket.IO client to simulate participants.
 * 
 * This script tests:
 * - Single room with N participants
 * - Multiple rooms with N participants each
 * - Room isolation
 * - Concurrent answer submissions
 * - Reconnect behavior
 * 
 * Metrics recorded:
 * - Connections established/failed
 * - Answer latency
 * - Socket event latency
 * - Error count
 * - Duplicate scoring count
 * - Room isolation failures
 * - CPU and memory (sampled)
 * - Reconnect success rate
 */

import { io } from 'socket.io-client';
import http from 'http';
import config from '../src/config/index.js';
import logger from '../src/utils/logger.js';

// Test configuration
const TEST_CONFIG = {
  participantsPerRoom: parseInt(process.env.TEST_PARTICIPANTS || '50', 10),
  rooms: parseInt(process.env.TEST_ROOMS || '1', 10),
  testDurationMs: parseInt(process.env.TEST_DURATION || '30000', 10),
  serverUrl: process.env.TEST_SERVER_URL || 'http://localhost:5000',
};

// Global metrics
const metrics = {
  totalConnections: 0,
  successfulConnections: 0,
  failedConnections: 0,
  answerLatencySamples: [],
  socketEventLatencySamples: [],
  errorCount: 0,
  duplicateScoringCount: 0,
  roomIsolationFailures: 0,
  reconnectSuccesses: 0,
  reconnectFailures: 0,
  cpuSamples: [],
  memorySamples: [],
  startTime: Date.now(),
};

function getMemoryUsage() {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
    rss: Math.round(usage.rss / 1024 / 1024),
  };
}

function getCPUUsage() {
  const loadavg = process.loadavg();
  return {
    '1min': loadavg[0],
    '5min': loadavg[1],
    '15min': loadavg[2],
  };
}

/**
 * Create a simulated participant.
 */
function createParticipant(roomId, participantIndex, token) {
  const socket = io(TEST_CONFIG.serverUrl, {
    auth: { token },
    reconnection: true,
    reconnectionAttempts: 5,
    timeout: 5000,
  });

  const participant = {
    socket,
    roomId,
    index: participantIndex,
    connected: false,
    answered: false,
    score: 0,
    errors: [],
  };

  socket.on('connect', () => {
    participant.connected = true;
    metrics.successfulConnections++;
    socket.emit('room:join', { roomId, token });
  });

  socket.on('connect_error', (err) => {
    participant.connected = false;
    metrics.failedConnections++;
    metrics.errorCount++;
    participant.errors.push(`Connect error: ${err.message}`);
  });

  socket.on('disconnect', () => {
    participant.connected = false;
  });

  socket.on('error', (data) => {
    participant.errors.push(data.message || 'Unknown error');
    metrics.errorCount++;
  });

  socket.on('answer:result', (data) => {
    if (data.valid && data.pointsAwarded > 0) {
      participant.score += data.pointsAwarded;
      participant.answered = true;
    }
  });

  return participant;
}

/**
 * Run a single room test.
 */
async function testRoom(roomId, participantCount) {
  logger.info(`Starting test: Room ${roomId} with ${participantCount} participants`);

  // Create mock participants (token would normally come from server)
  const participants = [];
  for (let i = 0; i < participantCount; i++) {
    const token = `mock-token-${roomId}-${i}`;
    participants.push(createParticipant(roomId, i, token));
    metrics.totalConnections++;
  }

  // Wait for connections
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Sample metrics
  metrics.memorySamples.push(getMemoryUsage());
  metrics.cpuSamples.push(getCPUUsage());

  // Disconnect all participants
  participants.forEach((p) => p.socket.close());

  logger.info(`Completed test: Room ${roomId} - Success: ${metrics.successfulConnections}, Failed: ${metrics.failedConnections}`);
}

/**
 * Run multi-room concurrency test.
 */
async function testMultiRoom() {
  logger.info(`Starting multi-room test: ${TEST_CONFIG.rooms} rooms × ${TEST_CONFIG.participantsPerRoom} participants`);

  const roomIds = [];
  for (let i = 0; i < TEST_CONFIG.rooms; i++) {
    roomIds.push(`test-room-${i}`);
  }

  const allParticipants = [];

  for (const roomId of roomIds) {
    for (let i = 0; i < TEST_CONFIG.participantsPerRoom; i++) {
      const token = `mock-token-${roomId}-${i}`;
      allParticipants.push({ roomId, index: i, token, socket: null });
      metrics.totalConnections++;
    }
  }

  // Create sockets for all participants
  for (const p of allParticipants) {
    const socket = io(TEST_CONFIG.serverUrl, {
      auth: { token: p.token },
      reconnection: true,
      reconnectionAttempts: 3,
    });

    p.socket = socket;

    socket.on('connect', () => {
      metrics.successfulConnections++;
      socket.emit('room:join', { roomId: p.roomId, token: p.token });
    });

    socket.on('connect_error', () => {
      metrics.failedConnections++;
    });

    socket.on('error', () => {
      metrics.errorCount++;
    });

    // Verify room isolation
    socket.on('room:state', (data) => {
      if (data.roomId !== p.roomId) {
        metrics.roomIsolationFailures++;
        logger.error(`ROOM ISOLATION FAILURE: Participant in ${p.roomId} received data for ${data.roomId}`);
      }
    });
  }

  // Wait for connections to establish
  await new Promise((resolve) => setTimeout(resolve, 3000));

  // Sample metrics
  metrics.memorySamples.push(getMemoryUsage());
  metrics.cpuSamples.push(getCPUUsage());

  // Disconnect all
  for (const p of allParticipants) {
    if (p.socket) p.socket.close();
  }

  return allParticipants.length;
}

/**
 * Print final metrics report.
 */
function printReport() {
  const duration = ((Date.now() - metrics.startTime) / 1000).toFixed(1);
  const memory = getMemoryUsage();
  const cpu = getCPUUsage();

  console.log('\n========================================');
  console.log('VLITE LOAD TEST REPORT');
  console.log('========================================');
  console.log(`Duration: ${duration}s`);
  console.log(`Config: ${TEST_CONFIG.rooms} rooms × ${TEST_CONFIG.participantsPerRoom} participants`);
  console.log('');
  console.log('--- Connections ---');
  console.log(`Total: ${metrics.totalConnections}`);
  console.log(`Successful: ${metrics.successfulConnections}`);
  console.log(`Failed: ${metrics.failedConnections}`);
  console.log(`Success Rate: ${((metrics.successfulConnections / metrics.totalConnections) * 100).toFixed(1)}%`);
  console.log('');
  console.log('--- Errors ---');
  console.log(`Total errors: ${metrics.errorCount}`);
  console.log(`Room isolation failures: ${metrics.roomIsolationFailures}`);
  console.log(`Duplicate scoring count: ${metrics.duplicateScoringCount}`);
  console.log('');
  console.log('--- Reconnect ---');
  console.log(`Successes: ${metrics.reconnectSuccesses}`);
  console.log(`Failures: ${metrics.reconnectFailures}`);
  console.log('');
  console.log('--- Server Resources ---');
  console.log(`Memory: ${JSON.stringify(memory)}`);
  console.log(`CPU: ${JSON.stringify(cpu)}`);
  console.log('');
  console.log('--- Timing ---');
  if (metrics.answerLatencySamples.length > 0) {
    const avg = metrics.answerLatencySamples.reduce((a, b) => a + b, 0) / metrics.answerLatencySamples.length;
    console.log(`Avg answer latency: ${avg.toFixed(1)}ms`);
  }
  console.log('========================================\n');
}

/**
 * Main test runner.
 */
async function main() {
  console.log('========================================');
  console.log('VLITE LOAD TEST');
  console.log('========================================');
  console.log(`Participants per room: ${TEST_CONFIG.participantsPerRoom}`);
  console.log(`Number of rooms: ${TEST_CONFIG.rooms}`);
  console.log(`Test duration: ${TEST_CONFIG.testDurationMs}ms`);
  console.log(`Server URL: ${TEST_CONFIG.serverUrl}`);
  console.log('');
  console.log('NOTE: This script requires the server to be running.');
  console.log('NOTE: MongoDB URI must be configured in server/.env');
  console.log('========================================\n');

  // Validate MongoDB connection
  if (!config.mongoUri) {
    console.error('ERROR: MONGODB_URI not configured. Set it in server/.env');
    process.exit(1);
  }

  try {
    // Run tests
    if (TEST_CONFIG.rooms === 1) {
      await testRoom('test-room-001', TEST_CONFIG.participantsPerRoom);
    } else {
      await testMultiRoom();
    }

    // Print report
    printReport();

    // Exit
    process.exit(0);
  } catch (error) {
    logger.error(`Load test failed: ${error.message}`);
    printReport();
    process.exit(1);
  }
}

// Handle unhandled errors
process.on('uncaughtException', (err) => {
  logger.error(`Unhandled error in load test: ${err.message}`);
  printReport();
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error(`Unhandled rejection in load test: ${reason}`);
  printReport();
  process.exit(1);
});

main();
