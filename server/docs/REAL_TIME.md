# VLITE Real-Time Documentation

This file is a duplicate of docs/REALTIME.md. See that file for the real-time architecture documentation.

Real-time events are room-scoped using Socket.IO rooms:
- `room:{roomId}` - All events for this room
- Participants only receive events for rooms they've joined
- Server-side timestamps for all timing
- State synchronization on reconnect
