# VLITE Database Design

## MongoDB Database

- **Database name**: `vlite` (configurable via `MONGODB_DB_NAME`)
- **Cluster**: MongoDB Atlas
- **Config variable**: `MONGODB_DB_NAME` in `server/.env`
- **VLITE uses ONLY this database. No other databases are modified.**

The database name is read from the `MONGODB_DB_NAME` environment variable (default: `vlite`).
This ensures VLITE never accidentally accesses other databases in the same Atlas cluster.

### Indexes

**User:** `email: 1` (unique)
**Room:** `lrn: 1` (unique), `host: 1`, `status: 1`
**Question:** `room: 1, order: 1`, `room: 1, isActive: 1`
**ParticipantSession:** `token: 1` (unique), `room: 1`, `room: 1, token: 1` (unique)
**Answer:** `participantSession: 1, question: 1` (unique, prevents duplicate answers), `room: 1, session: 1`
**Result:** `room: 1, score: -1`, `room: 1, rank: 1`, `room: 1, session: 1, rank: 1`
**Session:** `room: 1, sessionNumber: -1`, `room: 1, sessionNumber: 1` (unique)

### User

Stores host accounts.

```javascript
{
  name: String,
  email: String (unique, indexed),
  passwordHash: String (bcrypt),
  role: String (enum: ['host', 'admin']),
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `email: 1` (unique)

### Room

Stores room configurations.

```javascript
{
  lrn: String (unique, indexed),  // 4-digit Live Room Number
  name: String,
  host: ObjectId (ref: User),
  mode: String (enum: ['normal', 'intermediate', 'expert']),
  negativeMarking: Boolean,
  correctPoints: Number,
  negativePoints: Number,
  status: String (enum: ['waiting', 'active', 'paused', 'ended']),
  questions: [ObjectId (ref: Question)],  // reusable question bank
  maxParticipants: Number,
  participantCount: Number,  // live count, updated realtime
  sessionCount: Number,  // total sessions ever started
  currentSessionId: ObjectId (ref: Session),  // live session or null
  activeQuestionId: ObjectId (ref: Question),  // server-authoritative live state
  currentQuestionOrder: Number,
  questionStartedAt: Date,
  questionEndsAt: Date,
  isDeleted: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `lrn: 1` (unique) - Critical for room lookup
- `host: 1` - For finding rooms by host
- `status: 1` - For filtering active rooms

### Question

Stores questions within rooms.

```javascript
{
  room: ObjectId (ref: Room),
  text: String,
  imageUrl: String (cloud storage reference, not binary),
  options: [{ label: String, text: String }],
  correctAnswerIndex: Number,
  explanation: String,
  marks: Number,
  durationSeconds: Number,
  order: Number,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `room: 1, order: 1` - For ordered question listing
- `room: 1, isActive: 1` - For active questions

### Session

One live execution of a room.

```javascript
{
  room: ObjectId (ref: Room),
  host: ObjectId (ref: User),
  sessionNumber: Number,  // 1-based within its room
  status: String (enum: ['active', 'ended']),
  mode, negativeMarking, correctPoints, negativePoints,  // snapshot at start
  questionCount: Number,
  participantCount: Number,
  startedAt: Date,
  endedAt: Date
}
```

**Indexes:**
- `room: 1, sessionNumber: -1` - session history listing
- `room: 1, sessionNumber: 1` (unique) - one Session N per room
- `host: 1`, `status: 1`

### ParticipantSession

Stores participant sessions. Each join creates a fresh document
scoped to the live session (or the waiting pool between sessions),
so scores always start fresh per session.

```javascript
{
  participantName: String,
  room: ObjectId (ref: Room),
  session: ObjectId (ref: Session),  // live session, or null while waiting
  token: String (unique, indexed),  // JWT token
  score: Number,
  answeredQuestions: [ObjectId (ref: Question)],
  isConnected: Boolean,
  socketId: String,
  joinedAt: Date,
  lastSeenAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

**Indexes:**
- `token: 1` (unique) - For session validation
- `room: 1` - For finding participants in room
- `room: 1, token: 1` (unique) - For session verification
- `room: 1, session: 1` - For live-session scoped queries

### Answer

Stores participant answers.

```javascript
{
  participantSession: ObjectId (ref: ParticipantSession),
  question: ObjectId (ref: Question),
  room: ObjectId (ref: Room),
  session: ObjectId (ref: Session),  // live session the answer belongs to
  selectedOptionIndex: Number,
  isCorrect: Boolean,
  pointsAwarded: Number,
  submittedAt: Date,
  answeredAt: Date
}
```

**Indexes:**
- `participantSession: 1, question: 1` (unique) - Prevent duplicate answers
- `room: 1, session: 1` - Per-session answer queries

### Result

Stores final session results. Each result belongs to one session.

```javascript
{
  room: ObjectId (ref: Room),
  session: ObjectId (ref: Session),  // live session these results belong to
  sessionNumber: Number,
  participantSession: ObjectId (ref: ParticipantSession),
  participantName: String,
  score: Number,
  totalQuestions: Number,
  correctAnswers: Number,
  wrongAnswers: Number,
  rank: Number,
  completedAt: Date
}
```

**Indexes:**
- `room: 1, score: -1` - For leaderboard queries
- `room: 1, rank: 1` - For ranking lookups
- `room: 1, session: 1, rank: 1` - For per-session results

## Storage Efficiency

### PERSISTENT DATA (stored in MongoDB)
- Room configurations
- Questions
- Participant sessions
- Answer records
- Final results
- User accounts

### TEMPORARY SESSION DATA (in-memory)
- Socket.IO room connections
- Expert mode queues
- Real-time leaderboard state
- Active question timers
- Connection status

### NOT STORED IN MONGODB
- Timer ticks (calculated from server timestamps)
- UI event history
- Large images (stored in cloud storage, referenced by URL)

## Storage Considerations

- Images stored via Cloudinary/S3, not in MongoDB documents
- Large payloads avoided (max 1MB JSON limit)
- Efficient projections used in queries
- Pagination used for large result sets
- MongoDB Atlas free tier: 512MB storage

## Future Scaling

- Move to dedicated MongoDB cluster as data grows
- Add read replicas for query performance
- Use MongoDB sharding if needed for very large scale
