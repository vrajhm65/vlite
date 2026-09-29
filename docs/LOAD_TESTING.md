# VLITE Load Testing Plan

## Overview

Load testing validates that VLITE can handle multiple rooms and concurrent participants.

## Test Tooling

Use tools like:
- Artillery.io
- k6
- Custom Node.js scripts with Socket.IO client
- Playwright for browser-based tests

## Test Scenarios

### Scenario A: 1 Room × 50 Participants
- Verify all 50 participants can connect
- Answer questions simultaneously
- Measure latency and error rate

### Scenario B: 1 Room × 100 Participants
- Verify all 100 participants can connect
- Simultaneous answer submissions
- Leaderboard updates

### Scenario C: Multiple Rooms × 50 Participants Each
- 5 rooms × 50 participants = 250 total
- Room isolation verification
- Cross-room event prevention

### Scenario D: Room State Variations
- Rooms with different modes
- Rooms in different states (waiting, active, ended)

### Scenario E: Many Simultaneous Answers
- All participants submit within 1 second
- Server validates and scores all
- No duplicate scoring

### Scenario F: Many Raise-Hand Events
- All participants raise hands simultaneously
- Server orders deterministically
- Priority queue integrity

### Scenario G: Disconnect/Reconnect
- Participants disconnect and reconnect
- State synchronization
- Score preservation

### Scenario H: Host Changes Questions
- Host changes question during active session
- Timer synchronization
- Answer validation

## Metrics

- **Latency**: Response time per event
- **Error Rate**: Failed events percentage
- **CPU/Memory**: Server resource usage
- **DB Performance**: Query time, connection count
- **Socket Connections**: Active WebSocket count
- **Throughput**: Events per second

## Documented Capacity

### Development Testing (local)
- Target: 5-10 rooms × 50 participants
- Limited by machine resources

### Production Scaling
- Single instance: Up to ~500 participants per room
- Multi-instance with Redis: Linear scaling
- Database: MongoDB Atlas dedicated cluster

## Important Notes

- Do NOT claim participant capacity without testing
- Document tested capacity separately from theoretical
- Test room isolation with automated tests
- Verify no cross-room data leaks
