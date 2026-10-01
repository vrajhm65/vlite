import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import Room from '../models/Room.js';
import ParticipantSession from '../models/ParticipantSession.js';
import Question from '../models/Question.js';
import { createRoom, getRoomByLRN } from '../services/roomService.js';
import { createParticipantSession as createParticipantSessionService } from '../services/participantService.js';
import {
  connectTestDb,
  disconnectTestDb,
  cleanupTestRun,
  ensureTestHost,
  TEST_ROOM_PREFIX,
} from '../../tests/helpers/testDb.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vlite_test';
let HOST;

describe('Room Isolation', () => {
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
  });

  it('should create rooms with unique LRNs', async () => {
    const room1 = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Room A` });
    const room2 = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Room B` });

    expect(room1.lrn).not.toEqual(room2.lrn);
    expect(room1.lrn).toMatch(/^\d{4}$/);
    expect(room2.lrn).toMatch(/^\d{4}$/);
  });

  it('should ensure LRNs are unique at database level', async () => {
    const lrn = '1234';
    await Room.create({ lrn, name: `${TEST_ROOM_PREFIX} First`, host: HOST });

    await expect(
      Room.create({ lrn, name: `${TEST_ROOM_PREFIX} Second`, host: HOST })
    ).rejects.toThrow();
  });

  it('should isolate events between rooms', async () => {
    const roomA = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Room A`, mode: 'normal' });
    const roomB = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Room B`, mode: 'expert' });

    // Create participants for each room
    await createParticipantSessionService('Alice', roomA._id);
    await createParticipantSessionService('Bob', roomB._id);

    // Verify participants are in correct rooms
    const countA = await ParticipantSession.countDocuments({ room: roomA._id });
    const countB = await ParticipantSession.countDocuments({ room: roomB._id });

    expect(countA).toBe(1);
    expect(countB).toBe(1);

    // Room A questions should not affect Room B
    const questionsA = await Question.find({ room: roomA._id });
    const questionsB = await Question.find({ room: roomB._id });

    expect(questionsA.length).toBe(0);
    expect(questionsB.length).toBe(0);
  });

  it('should return room data scoped to correct room', async () => {
    const room = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Test Room` });
    const found = await getRoomByLRN(room.lrn);

    expect(found).not.toBeNull();
    expect(found.lrn).toBe(room.lrn);
  });

  it('should allow joining an ended room as a waiting participant (rooms are reusable)', async () => {
    const room = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Ending Room` });
    await Room.findByIdAndUpdate(room._id, { status: 'ended' });

    const { session } = await createParticipantSessionService('Charlie', room._id);
    expect(session).toBeDefined();
    expect(session.participantName).toBe('Charlie');
  });
});

describe('Scoring Correctness', () => {
  it('should calculate normal mode scoring correctly', async () => {
    // Import scoring service
    const { calculateNormalScore } = await import('../services/scoringService.js');

    const config = { negativeMarking: false, correctPoints: 10, negativePoints: 2 };

    expect(calculateNormalScore(true, config)).toBe(10);
    expect(calculateNormalScore(false, config)).toBe(0);

    const configWithNegative = { negativeMarking: true, correctPoints: 10, negativePoints: 2 };
    expect(calculateNormalScore(true, configWithNegative)).toBe(10);
    expect(calculateNormalScore(false, configWithNegative)).toBe(-2);
  });
});
