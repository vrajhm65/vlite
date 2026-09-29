# VLITE Realtime Architecture

## Socket.IO Room Scoping

All real-time events are room-scoped using Socket.IO rooms.

### Room Naming Convention

```
room:{roomId}   // e.g., room:1234, room:5678
```

### Event Isolation

- `io.to('room:1234').emit(...)` sends to Room 1234 only
- Room 5678 participants never receive Room 1234 events
- Each room has independent state

### Connection Lifecycle

1. **Connect**: Client connects with JWT token
2. **Authenticate**: Server verifies token via Socket.IO middleware
3. **Join Room**: Client emits `room:join` with roomId and token
4. **Room State**: Server emits current room state to client
5. **Active**: Real-time events flow within room scope
6. **Disconnect**: Server marks participant as disconnected
7. **Reconnect**: Client re-authenticates and syncs state

### Key Socket.IO Configuration

```javascript
const io = new Server(server, {
  cors: { origin: config.clientUrl },
  pingTimeout: 60000,    // 60 seconds
  pingInterval: 25000,   // 25 seconds
  maxHttpBufferSize: 1e6 // 1MB
});
```

## Reconnection Strategy

Socket.IO handles automatic reconnection:

- **Attempts**: 15
- **Delay**: 1s initial, max 5s
- **Backoff**: Exponential

On reconnect, the client must:
1. Re-authenticate with token
2. Re-join the room
3. Request state synchronization

## State Synchronization

After reconnect/refresh:
1. Client requests `session:sync`
2. Server returns current question, timer, score, leaderboard
3. Client updates UI from server state only
4. No replay of old events

## Event Design

### room:join
- **Direction**: Client → Server
- **Payload**: `{ roomId, token }`
- **Validation**: Verify token, verify room joinability
- **Response**: `room:state` to client

### question:start
- **Direction**: Server → Room
- **Payload**: `{ question, questionIndex, totalQuestions, startsAt, endsAt }`
- **Scope**: `room:{roomId}`

### answer:submit
- **Direction**: Client → Server
- **Validation**: Check duplicate, validate timing, verify room membership
- **Response**: `answer:result` to client

### answer:result
- **Direction**: Server → Client
- **Payload**: `{ questionId, isCorrect, pointsAwarded, newScore }`

### leaderboard:update
- **Direction**: Server → Room
- **Scope**: `room:{roomId}`
- **Payload**: `{ leaderboard: [{ rank, name, score }] }`

## Server-Authoritative Timing

- Server sends `questionStartedAt` and `questionEndsAt`
- Client calculates visual countdown from timestamps
- Server validates answer timing using server timestamps
- Client timer drift does not affect scoring

## Network Resilience

- Socket.IO automatic reconnection
- State synchronization on reconnect
- Idempotent answer submissions
- Safe retry logic for critical actions
- Connection status indicators
