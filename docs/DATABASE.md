# VLITE Database Design

## MongoDB Database

- **Database name**: `vlite`
- **Cluster**: MongoDB Atlas

## Collections

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
  questions: [ObjectId (ref: Question)],
  maxParticipants: Number,
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

### ParticipantSession

Stores participant sessions.

```javascript
{
  participantName: String,
  room: ObjectId (ref: Room),
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

### Answer

Stores participant answers.

```javascript
{
  participantSession: ObjectId (ref: ParticipantSession),
  question: ObjectId (ref: Question),
  room: ObjectId (ref: Room),
  selectedOptionIndex: Number,
  isCorrect: Boolean,
  pointsAwarded: Number,
  submittedAt: Date,
  answeredAt: Date
}
```

**Indexes:**
- `participantSession: 1, question: 1` (unique) - Prevent duplicate answers

### Result

Stores final session results.

```javascript
{
  room: ObjectId (ref: Room),
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
