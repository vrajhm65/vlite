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
