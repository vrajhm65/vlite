import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import mongoose from 'mongoose';
import Room from '../src/models/Room.js';
import Question from '../src/models/Question.js';
import ParticipantSession from '../src/models/ParticipantSession.js';
import Answer from '../src/models/Answer.js';
import Result from '../src/models/Result.js';
import Session from '../src/models/Session.js';
import { createRoom } from '../src/services/roomService.js';
import { createParticipantSession } from '../src/services/participantService.js';
import { startSession, endSession, listSessions, getSessionResults } from '../src/services/sessionService.js';
import {
  connectTestDb,
  disconnectTestDb,
  cleanupTestRun,
  ensureTestHost,
  TEST_ROOM_PREFIX,
} from './helpers/testDb.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vlite_test';
let HOST;

async function addQuestion(roomId, text, order) {
  const question = await Question.create({
    room: roomId,
    text,
    options: [
      { label: 'A', text: 'Right' },
      { label: 'B', text: 'Wrong' },
    ],
    correctAnswerIndex: 0,
    marks: 10,
    durationSeconds: 60,
    order,
  });
  await Room.findByIdAndUpdate(roomId, { $push: { questions: question._id } });
  return question;
}

describe('Reusable rooms: multiple sessions from one room', () => {
  beforeAll(async () => {
    await connectTestDb(MONGODB_URI, process.env.TEST_MONGODB_DB_NAME || 'vlite_test');
    HOST = (await ensureTestHost())._id;
  });

  afterAll(async () => {
    await cleanupTestRun(TEST_ROOM_PREFIX);
    await disconnectTestDb();
  });

  beforeEach(async () => {
    await cleanupTestRun(TEST_ROOM_PREFIX);
  });

  it('reuses one room for two sessions with separate results and fresh state', async () => {
    // 1-2. Create room + add questions ONCE
    const room = await createRoom(HOST, {
      name: `${TEST_ROOM_PREFIX} Reuse`,
      mode: 'normal',
      correctPoints: 10,
    });
    const q1 = await addQuestion(room._id, 'Reuse Q1?', 0);
    await addQuestion(room._id, 'Reuse Q2?', 1);

    // 3-4. Start session 1
    const started1 = await startSession(room._id);
    expect(started1.session.sessionNumber).toBe(1);

    // Participant joins session 1 and answers
    const { session: p1 } = await createParticipantSession('Reuse P1', room._id);
    expect(String(p1.session)).toBe(String(started1.session._id));
    await Answer.create({
      participantSession: p1._id,
      question: q1._id,
      room: room._id,
      session: p1.session,
      selectedOptionIndex: 0,
      isCorrect: true,
      pointsAwarded: 10,
      answeredAt: new Date(),
    });
    await ParticipantSession.findByIdAndUpdate(p1._id, { $inc: { score: 10 } });

    // 5. End session 1, verify results
    const ended1 = await endSession(room._id);
    expect(ended1.session.sessionNumber).toBe(1);
    expect(ended1.resultCount).toBe(1);

    const res1 = await getSessionResults(room._id, ended1.session._id);
    expect(res1.results.length).toBe(1);
    expect(res1.results[0].score).toBe(10);

    // 6-7. Start session 2 from the SAME room, no question recreation
    const started2 = await startSession(room._id);
    expect(started2.session.sessionNumber).toBe(2);
    const questionsStillThere = await Question.countDocuments({ room: room._id, isActive: true });
    expect(questionsStillThere).toBe(2);

    // 8. Fresh participant + fresh score state in session 2
    const { session: p2 } = await createParticipantSession('Reuse P2', room._id);
    expect(String(p2.session)).toBe(String(started2.session._id));
    expect(p2.score).toBe(0);

    // Leaderboard scope of session 2 must not include session 1 scores
    const session2Participants = await ParticipantSession.find({
      room: room._id,
      session: started2.session._id,
    });
    expect(session2Participants.length).toBe(1);
    expect(session2Participants[0].participantName).toBe('Reuse P2');

    await Answer.create({
      participantSession: p2._id,
      question: q1._id,
      room: room._id,
      session: p2.session,
      selectedOptionIndex: 1,
      isCorrect: false,
      pointsAwarded: 0,
      answeredAt: new Date(),
    });
    const ended2 = await endSession(room._id);
    expect(ended2.resultCount).toBe(1);

    // 9. Session 1 results intact, session 2 separate
    const history = await listSessions(room._id);
    expect(history.length).toBe(2);
    const s1again = await getSessionResults(room._id, ended1.session._id);
    expect(s1again.results.length).toBe(1);
    expect(s1again.results[0].participantName).toBe('Reuse P1');
    expect(s1again.results[0].score).toBe(10);
    const s2res = await getSessionResults(room._id, ended2.session._id);
    expect(s2res.results.length).toBe(1);
    expect(s2res.results[0].participantName).toBe('Reuse P2');
    expect(s2res.results[0].score).toBe(0);

    // Room itself survived with its bank
    const roomAfter = await Room.findById(room._id);
    expect(roomAfter.isDeleted).toBe(false);
    expect(roomAfter.sessionCount).toBe(2);
    const bankAfter = await Question.countDocuments({ room: room._id });
    expect(bankAfter).toBe(2);
  }, 60000);

  it('refuses to start a second live session while one is active', async () => {
    const room = await createRoom(HOST, { name: `${TEST_ROOM_PREFIX} Double Start` });
    await addQuestion(room._id, 'Q?', 0);

    await startSession(room._id);
    await expect(startSession(room._id)).rejects.toThrow('already live');
  }, 30000);
});
