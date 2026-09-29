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
