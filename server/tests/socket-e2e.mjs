/**
 * VLITE socket-level end-to-end verification.
 *
 * Exercises the full live flow against a RUNNING backend
 * (default http://localhost:5000):
 *
 *   register -> login -> create room -> add questions ->
 *   participant join (Name + LRN) -> sockets -> session start ->
 *   question (no answer leak) -> answer -> scoring ->
 *   duplicate/late/wrong-room rejection -> leaderboard ->
 *   sync -> session end -> persisted results
 *
 * Usage:
 *   node tests/socket-e2e.mjs
 *
 * Every run uses a unique host email, so it is safe to execute
 * repeatedly. It only creates data; use `npm run test:cleanup`
 * with a tagged host to remove test data.
 */
import { io } from 'socket.io-client';

const base = process.env.TEST_SERVER_URL || 'http://localhost:5000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' | ' + detail : ''));
};
const waitFor = (sock, ev, ms = 20000) =>
  new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('timeout waiting for ' + ev)), ms);
    sock.once(ev, (d) => {
      clearTimeout(t);
      res(d);
    });
  });

const email = 'socke2e' + Date.now() + '@example.com';
const reg = await fetch(base + '/api/auth/host', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'Socket E2E', email, password: 'test123456' }),
}).then((r) => r.json());
check('host registered', !!reg.token);
const H = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + reg.token };

const me = await fetch(base + '/api/auth/me', {
  headers: { Authorization: 'Bearer ' + reg.token },
}).then((r) => ({ status: r.status }));
check('GET /me authenticated', me.status === 200);

const room = await fetch(base + '/api/rooms', {
  method: 'POST',
  headers: H,
  body: JSON.stringify({ name: 'Socket E2E Room', mode: 'intermediate', negativeMarking: true, correctPoints: 10, negativePoints: 2 }),
}).then((r) => r.json());
check('room created with LRN', /^\d{4}$/.test(room.room?.lrn || ''), 'LRN=' + room.room?.lrn);
const roomId = room.room._id;

const mkQ = (text, correct, order) =>
  fetch(base + `/api/rooms/${roomId}/questions`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({
      text,
      options: [{ label: 'A', text: 'right' }, { label: 'B', text: 'wrong' }],
      correctAnswerIndex: correct,
      marks: 10,
      durationSeconds: 60,
      order,
    }),
  }).then((r) => r.json());
const q1 = await mkQ('Socket Q1?', 0, 0);
const q2 = await mkQ('Socket Q2?', 0, 1);
check('2 questions created', !!(q1.question && q2.question));

const myRooms = await fetch(base + '/api/rooms', {
  headers: { Authorization: 'Bearer ' + reg.token },
}).then((r) => r.json());
check('GET /rooms lists room', (myRooms.rooms || []).some((r) => String(r._id) === String(roomId)));

const join = await fetch(base + '/api/participants/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ participantName: 'Socket P1', lrn: room.room.lrn }),
}).then((r) => r.json());
check('participant joined (Name+LRN)', !!join.token);

const badJoin = await fetch(base + '/api/participants/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ participantName: 'X', lrn: '0000' }),
}).then((r) => r.json());
check('unknown LRN rejected', !!badJoin.error);

const host = io(base, { auth: { token: reg.token } });
await waitFor(host, 'connect');
check('host socket connects', host.connected);
const ps = io(base, { auth: { token: join.token } });
await waitFor(ps, 'connect');
check('participant socket connects', ps.connected);

host.emit('room:join', { roomId });
await waitFor(host, 'room:state');
ps.emit('room:join', { roomId });
const pState = await waitFor(ps, 'room:state');
check('participant room state', String(pState.roomId) === String(roomId));

const sessP = waitFor(ps, 'session:start');
host.emit('session:start', { roomId });
const sess = await sessP;
check('session:start received', sess.status === 'active' && sess.sessionNumber === 1);

const qP = waitFor(ps, 'question:start');
host.emit('question:next', { roomId, questionId: q1.question._id });
const qs = await qP;
check('question:start received', !!qs.question);
check('no answer leak to participant', qs.question.correctAnswerIndex === undefined);

const ansP = waitFor(ps, 'answer:result');
const lbP = waitFor(ps, 'leaderboard:update');
ps.emit('answer:submit', { roomId, questionId: q1.question._id, selectedOptionIndex: 0 });
const ans = await ansP;
check('correct answer scored server-side', ans.valid === true && ans.pointsAwarded > 0, 'points=' + ans.pointsAwarded);
const lb = await lbP;
check('leaderboard updates', lb.leaderboard.length === 1);

const dupP = waitFor(ps, 'answer:result');
ps.emit('answer:submit', { roomId, questionId: q1.question._id, selectedOptionIndex: 0 });
const dup = await dupP;
check('duplicate rejected', dup.valid === false);

const syncP = waitFor(ps, 'room:state');
ps.emit('session:sync', { roomId });
const synced = await syncP;
check('session:sync recovers', String(synced.roomId) === String(roomId));

const endP = waitFor(ps, 'session:end');
host.emit('session:end', { roomId });
await endP;
await new Promise((r) => setTimeout(r, 1200));
check('session:end received', true);

const res = await fetch(base + `/api/rooms/${roomId}/results`).then((r) => r.json());
check(
  'results persisted',
  res.results.length === 1 && res.results[0].score === ans.pointsAwarded,
  JSON.stringify(res.results)
);

// Reuse: second session from the same room
const s2P = waitFor(host, 'session:start');
host.emit('session:start', { roomId });
const s2 = await s2P;
check('session 2 reuses room', s2.sessionNumber === 2);

host.close();
ps.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n==== SOCKET E2E: ${results.length - failed.length}/${results.length} passed ====`);
if (failed.length) {
  console.log('FAILED:', failed.map((f) => f.name).join(', '));
  process.exit(1);
}
process.exit(0);
