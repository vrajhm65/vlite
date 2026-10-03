# VLITE Architecture

## Overview

VLITE is a real-time interactive session platform built on:

- **Frontend**: React + Vite + Socket.IO Client
- **Backend**: Node.js + Express + Socket.IO + MongoDB
- **Realtime**: Socket.IO with room-scoped namespaces
- **Database**: MongoDB + Mongoose (MongoDB Atlas)

## Architecture Pattern

### Room-Scoped Isolation

Every room is isolated via Socket.IO room namespaces:

- `room:1234` - Room events for LRN 1234
- `room:5678` - Room events for LRN 5678

Participants in Room A **never** receive events from Room B.

### Server-Authoritative Design

All critical state is managed server-side:
- Scores are calculated by the server
- Timer is based on server timestamps
- Answer correctness is validated server-side
- Expert queue ordering is server-determined
- Participants cannot forge identity, score, or permissions

### Scoring Precision Policy

Single policy, enforced in one place on each side:

- **Stored**: every awarded point value is rounded server-side with
  conventional round-half-up to 2 decimals
  (`roundScore` in `server/src/services/scoringService.js`).
  Intermediate speed scores, persisted results, and leaderboard payloads
  all pass through it.
- **Displayed**: exactly 2 decimals everywhere
  (`formatScore` in `client/src/utils/format.js` → `"10.00"`, `"8.50"`,
  `"7.78"`). No scattered `toFixed()` calls.
- **Ranked**: leaderboards sort on the authoritative numeric score
  (descending, then name, then id); never on formatted strings.

This keeps stored values deterministic across restarts and guarantees
binary floating-point artifacts (e.g. `7.777777777777777`) can never
reach the UI.

### Session Recovery

Refreshing destroys the browser's JS state and Socket.IO connection,
so recovery is server-driven:

- The participant token persists in the browser; on reload it is
  re-validated server-side (`GET /participants/me`) before use.
- A fresh socket authenticates, joins the room, and receives the full
  authoritative state (`room:state`): room, live session, current
  question with server `questionStartedAt`/`questionEndsAt`, the
  participant's own prior answer (`myAnswer`), score, and leaderboard.
- Timers are never restarted client-side; the countdown derives from
  the server deadline. Answered questions stay locked (server rejects
  re-submits). Expert queue position is re-derived from the server
  queue — no duplicate entries.
- Rejoining with the same name resumes the disconnected session
  document (score/history preserved); a name currently live elsewhere
  is never hijacked. Server restarts clear stale connection flags.
- If recovery is impossible (invalid/expired session, ended room),
  the UI shows a proper VLITE message, never a raw 404.

### Room vs Session

The most important architectural distinction in VLITE:

- **ROOM** = reusable container (name, LRN, question bank, scoring configuration).
  Created once, reused indefinitely until explicitly deleted.
- **SESSION** = one live execution of a room (participants, answers,
  scores, leaderboard, results). A room runs Session 1, Session 2, ...
- **QUESTIONS** = reusable bank owned by the room. Never recreated per session.
- **RESULTS** = always belong to one specific session.

Lifecycle:

```
CREATE ROOM → ADD QUESTIONS → START SESSION 1 → END → RESULTS SAVED
→ START SESSION 2 (same questions) → END → RESULTS SAVED → ...
```

Session documents (`Session` collection) carry a 1-based `sessionNumber`
per room plus a configuration snapshot, so later room edits cannot
retroactively change a finished session. Participant sessions, answers
and results all reference their session; leaderboards and participant
counts are scoped to the live session (or the waiting pool between
sessions), so previous sessions never leak into new ones.

### State Machine

```
WAITING → QUESTION_ACTIVE → QUESTION_ENDED → NEXT_QUESTION → ... → SESSION_COMPLETED
```

Server enforces all transitions. Invalid transitions are rejected.

## Components

### Server Structure

```
server/src/
├── config/       # Configuration (database, app config)
├── controllers/  # HTTP route controllers
├── routes/       # Express route definitions
├── models/       # Mongoose schemas
├── services/     # Business logic
├── sockets/      # Socket.IO handlers
├── middleware/   # Express middleware (auth, rate limiting)
├── utils/        # Utilities (logger)
├── validators/   # Input validation
├── jobs/         # Background jobs
└── tests/        # Automated tests
```

### Client Structure

```
client/src/
├── components/   # Reusable UI components
├── pages/        # Page components
├── layouts/      # Page layout wrapper
├── hooks/        # Custom React hooks
├── services/     # API clients
├── socket/       # Socket.IO client setup
├── context/      # React context (auth, socket)
├── utils/        # Utility functions
└── styles/       # Global styles
```

## Data Flow

1. Host creates room → Server generates unique LRN → Room stored in MongoDB
2. Participant joins → Server verifies room and creates participant session
3. Host starts session → Server emits to room-scoped events
4. Question starts → Server sends question + timing to room only
5. Participant answers → Server validates and calculates score
6. Score updates → Server broadcasts leaderboard to room only
7. Session ends → Server persists results

## Concurrency Model

- MongoDB unique indexes prevent LRN collisions
- Atomic operations prevent duplicate scoring
- Server-side event ordering handles simultaneous events
- Socket.IO room scoping prevents cross-room data leaks

## Scalability

- **Single instance**: Current architecture (no Redis needed)
- **Multi-instance**: Add Redis adapter for Socket.IO when needed
- **Database**: MongoDB Atlas can scale read capacity with replicas
- **Horizontal**: Stateless API servers behind load balancer

## Future Scaling

When multiple instances are needed:
1. Add `socket.io-redis` adapter
2. Use Redis for pub/sub between instances
3. MongoDB remains single source of truth
4. Session state reconstructed from MongoDB on restart
