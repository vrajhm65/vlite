# VLITE Testing Documentation

## Test Categories

### Unit Tests
- Authentication functions
- Scoring calculations (Normal/Intermediate mode)
- LRN generation uniqueness
- Room creation logic
- Participant session creation
- Expert queue operations

### Integration Tests
- Room creation → Join → Session flow
- Question lifecycle (WAITING → ACTIVE → ENDED)
- Answer submission → Scoring → Leaderboard
- Expert mode raise-hand ordering
- Duplicate answer prevention
- Late answer rejection

### E2E Tests
- Complete flow: Host login → Create room → Add questions → Start session → Participant joins → Answer → Score → Leaderboard
- Multiple rooms simultaneously
- Multiple participants per room

### Concurrency Tests
- Two participants answer simultaneously
- Multiple raise-hand events simultaneously
- Duplicate LRN prevention
- Double-click answer submission prevention
- Network retry duplicate handling

### Multi-Room Tests
- Room A never receives Room B data
- Separate question timers per room
- Separate leaderboards per room
- Separate expert queues per room

## Running Tests

```bash
cd server
npm test
```

Tests run with Jest (`--runInBand`) against an isolated database
(`TEST_MONGODB_DB_NAME`, default `vlite_test`). A guard refuses to run
unless the database name contains "test", so the real `vlite`
database can never be wiped by the suite. Each file cleans up only
its own prefixed rooms (`VLITE_TEST_*`).

Socket-level end-to-end (requires the dev backend running):

```bash
cd server
node tests/socket-e2e.mjs
```

Safe test-data cleanup (deletes ONLY rooms owned by the given host
whose names start with the given prefix; refuses to run otherwise,
safe to run twice):

```bash
cd server
TEST_CLEANUP_HOST_EMAIL=tester@example.com TEST_CLEANUP_ROOM_PREFIX=VLITE_TEST_ npm run test:cleanup
```

## Test Infrastructure

- **Jest**: Test runner
- **Supertest**: HTTP testing
- **Mongoose**: Database testing
- **Test database**: `vlite_test` (separate from production)

## Test Coverage Goals

- Authentication: 100%
- Authorization: 100%
- Room creation: 100%
- LRN uniqueness: 100%
- Room isolation: Verified
- Scoring: 100%
- Answer submission: 100%
- Negative marking: 100%
- Expert mode: 100%
- Leaderboard: 100%
- Reconnect: Verified

## Key Tests

1. **LRN uniqueness**: Two simultaneous room creation requests must not produce duplicate LRNs
2. **Room isolation**: Room A never receives Room B data
3. **Duplicate answer prevention**: Same participant cannot answer same question twice
4. **Server-authoritative scoring**: Client cannot influence score
5. **Expert queue ordering**: Server determines priority, not client
6. **Late answer rejection**: Answers after timeout are rejected
7. **Reconnect state sync**: Participant state preserved on reconnect
