/**
 * VLITE safe test-data cleanup.
 *
 * Deletes ONLY rooms owned by TEST_CLEANUP_HOST_EMAIL whose name
 * starts with TEST_CLEANUP_ROOM_PREFIX, plus the questions, sessions,
 * participants, answers and results that belong to those rooms.
 * Everything else in the database is left untouched.
 *
 * SAFETY RULES (all enforced, refusal exits non-zero):
 * 1. TEST_CLEANUP_HOST_EMAIL must be set, non-empty, and contain '@'.
 * 2. TEST_CLEANUP_ROOM_PREFIX must be set, at least 4 characters,
 *    and must not be '*' or contain braces.
 * 3. Safe to execute twice (second run finds nothing, exits 0).
 * 4. No unrestricted deleteMany/dropDatabase anywhere in this file:
 *    every delete is filtered by explicit room _ids.
 *
 * Usage:
 *   TEST_CLEANUP_HOST_EMAIL=tester@example.com TEST_CLEANUP_ROOM_PREFIX=VLITE_TEST_ npm run test:cleanup
 */
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const EMAIL = (process.env.TEST_CLEANUP_HOST_EMAIL || '').trim();
const PREFIX = (process.env.TEST_CLEANUP_ROOM_PREFIX || '').trim();

function refuse(reason) {
  console.error(`test-cleanup REFUSED: ${reason}`);
  process.exit(2);
}

if (!EMAIL || !EMAIL.includes('@')) {
  refuse('TEST_CLEANUP_HOST_EMAIL must be set to the test host email.');
}
if (!PREFIX || PREFIX.length < 4) {
  refuse('TEST_CLEANUP_ROOM_PREFIX must be at least 4 characters.');
}
if (PREFIX === '*' || PREFIX.includes('{') || PREFIX.includes('}')) {
  refuse('TEST_CLEANUP_ROOM_PREFIX is unsafe.');
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  refuse('MONGODB_URI is not configured.');
}
const DB_NAME = process.env.MONGODB_DB_NAME || 'vlite';

const escapeRegExp = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

await mongoose.connect(MONGODB_URI, { dbName: DB_NAME });

const db = mongoose.connection.db;
const users = db.collection('users');
const rooms = db.collection('rooms');
const questions = db.collection('questions');
const sessions = db.collection('sessions');
const participantsessions = db.collection('participantsessions');
const answers = db.collection('answers');
const results = db.collection('results');

const host = await users.findOne({ email: EMAIL });
if (!host) {
  console.log(`test-cleanup: no host found for ${EMAIL}; nothing to do.`);
  await mongoose.disconnect();
  process.exit(0);
}

const matchedRooms = await rooms
  .find({ host: host._id, name: { $regex: `^${escapeRegExp(PREFIX)}` } })
  .project({ _id: 1, lrn: 1, name: 1 })
  .toArray();

if (matchedRooms.length === 0) {
  console.log('test-cleanup: no matching test rooms; nothing to do.');
  await mongoose.disconnect();
  process.exit(0);
}

const roomIds = matchedRooms.map((r) => r._id);
console.log(
  `test-cleanup: removing ${roomIds.length} room(s): ` +
    matchedRooms.map((r) => `${r.name} (${r.lrn})`).join(', ')
);

const counts = {};
counts.answers = (await answers.deleteMany({ room: { $in: roomIds } })).deletedCount || 0;
counts.participants = (await participantsessions.deleteMany({ room: { $in: roomIds } })).deletedCount || 0;
counts.results = (await results.deleteMany({ room: { $in: roomIds } })).deletedCount || 0;
counts.sessions = (await sessions.deleteMany({ room: { $in: roomIds } })).deletedCount || 0;
counts.questions = (await questions.deleteMany({ room: { $in: roomIds } })).deletedCount || 0;
counts.rooms = (await rooms.deleteMany({ _id: { $in: roomIds } })).deletedCount || 0;

console.log(`test-cleanup: done ${JSON.stringify(counts)}`);
await mongoose.disconnect();
process.exit(0);
