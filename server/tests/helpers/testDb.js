import mongoose from 'mongoose';
import Room from '../../src/models/Room.js';
import Question from '../../src/models/Question.js';
import ParticipantSession from '../../src/models/ParticipantSession.js';
import Answer from '../../src/models/Answer.js';
import Result from '../../src/models/Result.js';
import Session from '../../src/models/Session.js';

/**
 * Shared test-database helper.
 *
 * SAFETY RULES (enforced):
 * 1. Tests only run against a database whose name contains "test".
 *    This prevents wiping the real `vlite` database (or any other
 *    project database) when MONGODB_URI points at Atlas.
 * 2. Cleanup deletes ONLY documents belonging to rooms whose name
 *    starts with the given run prefix. No unrestricted deleteMany.
 * 3. Safe to execute twice (second run simply finds nothing).
 */

export const TEST_ROOM_PREFIX = 'VLITE_TEST_';

/**
 * Deterministic host id for tests. The User document itself is
 * irrelevant to room/question/session logic (no FK enforcement),
 * so tests use a fixed id namespaced to the test run.
 */
export function testHostId() {
  return new mongoose.Types.ObjectId('000000000000000000000042');
}

export const TEST_HOST_EMAIL = 'vlite-test-host@example.com';

/**
 * Ensure the tagged test host user exists (upsert by email)
 * so test-cleanup can key deletions off a real host document.
 */
export async function ensureTestHost() {
  const User = (await import('../../src/models/User.js')).default;
  let user = await User.findOne({ email: TEST_HOST_EMAIL });
  if (!user) {
    user = await User.create({
      name: 'VLITE Test Host',
      email: TEST_HOST_EMAIL,
      passwordHash: 'test-password-not-for-login-' + Date.now(),
      role: 'host',
    });
  }
  return user;
}

function testDbName(uri) {
  try {
    const withoutQuery = uri.split('?')[0];
    const parts = withoutQuery.split('/');
    return parts[parts.length - 1] || '';
  } catch {
    return '';
  }
}

export async function connectTestDb(uri, dbName) {
  const name = (dbName || testDbName(uri) || '').toLowerCase();
  if (!name.includes('test')) {
    throw new Error(
      `Refusing to run tests against database "${dbName || testDbName(uri)}". ` +
        'Test database name must contain "test" (e.g. vlite_test).'
    );
  }
  await mongoose.connect(uri, dbName ? { dbName } : {});
  return mongoose.connection;
}

export async function disconnectTestDb() {
  await mongoose.connection.close();
}

/**
 * Delete ONLY the current test run's data: rooms whose name starts
 * with `prefix`, plus questions/sessions/participants/answers/results
 * that belong to those rooms. Everything else is left untouched.
 */
export async function cleanupTestRun(prefix = TEST_ROOM_PREFIX) {
  assertSafePrefix(prefix);

  const rooms = await Room.find({ name: { $regex: `^${escapeRegExp(prefix)}` } })
    .select('_id')
    .lean();
  if (rooms.length === 0) return { rooms: 0 };

  const roomIds = rooms.map((r) => r._id);

  const [answers, participants, results, sessions, questions] = await Promise.all([
    Answer.deleteMany({ room: { $in: roomIds } }),
    ParticipantSession.deleteMany({ room: { $in: roomIds } }),
    Result.deleteMany({ room: { $in: roomIds } }),
    Session.deleteMany({ room: { $in: roomIds } }),
    Question.deleteMany({ room: { $in: roomIds } }),
  ]);
  const deletedRooms = await Room.deleteMany({ _id: { $in: roomIds } });

  return {
    rooms: deletedRooms.deletedCount || 0,
    questions: questions.deletedCount || 0,
    sessions: sessions.deletedCount || 0,
    participants: participants.deletedCount || 0,
    answers: answers.deletedCount || 0,
    results: results.deletedCount || 0,
  };
}

export function assertSafePrefix(prefix) {
  if (!prefix || typeof prefix !== 'string' || prefix.trim().length < 4) {
    throw new Error(
      'Refusing cleanup: test prefix must be a non-empty string of at least 4 characters.'
    );
  }
  if (prefix.trim() === '*' || prefix.includes('{') || prefix.includes('}')) {
    throw new Error('Refusing cleanup: unsafe test prefix.');
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
