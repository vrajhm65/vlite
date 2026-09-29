# VLITE - Live Interactive Session Platform

A production-ready web application for live interactive sessions with multiple rooms, real-time scoring, and multi-participant concurrency.

## Features

- **Multi-room concurrency**: Multiple live rooms running simultaneously with full isolation
- **Real-time scoring**: Server-authoritative scoring with Normal, Intermediate, and Expert modes
- **Expert mode**: Priority-based answering with raise-hand queue
- **Negative marking**: Configurable per room
- **Server-authoritative**: Client timers are display only; server determines all scoring
- **Mobile-first**: Responsive design for phones, tablets, and desktops
- **Network resilient**: Socket.IO reconnection and state synchronization

## Architecture

```
server/    - Node.js/Express backend with Socket.IO
client/    - React frontend with Vite
docs/      - Documentation
```

## Quick Start

### Prerequisites

- Node.js 18+
- MongoDB Atlas cluster
- (Optional) reCAPTCHA v3 keys

### Setup

1. Clone repository: `git clone <repo-url>`
2. Install dependencies: `npm run install:all`
3. Create `.env` files:
   - `server/.env` - Copy from `server/.env.example`
   - `client/.env` - Copy from `client/.env.example`
4. Configure MongoDB URI in `server/.env`
5. Start backend: `cd server && npm run dev`
6. Start frontend: `cd client && npm run dev`

### Environment Variables

See `docs/ENVIRONMENT.md` for all required variables.

## API Endpoints

- `POST /api/auth/login` - Host login
- `POST /api/auth/host` - Create host account
- `GET /api/auth/me` - Get current user
- `POST /api/rooms` - Create room (host only)
- `GET /api/rooms/lrn/:lrn` - Get room by LRN
- `POST /api/rooms/:roomId/questions` - Add question (host only)
- `GET /api/rooms/:roomId/questions` - Get questions (host only)
- `POST /api/rooms/:roomId/start` - Start session (host only)
- `POST /api/rooms/:roomId/end` - End session (host only)
- `POST /api/participants/join` - Join room as participant

## Socket.IO Events

### Client → Server

- `room:join` - Join a room-scoped room
- `session:start` - Start session (host)
- `session:end` - End session (host)
- `question:next` - Move to next question (host)
- `answer:submit` - Submit an answer (participant)
- `expert:raise-hand` - Raise hand for priority (expert mode)

### Server → Client

- `room:state` - Current room state
- `room:joined` - Joined confirmation
- `session:start` - Session started
- `question:start` - New question
- `timer:tick` - Timer update
- `leaderboard:update` - Updated leaderboard
- `answer:result` - Answer result
- `session:end` - Session ended
- `error` - Error event

## Testing

```bash
cd server
npm test
```

## Load Testing

See `docs/LOAD_TESTING.md` for testing plan.

## Deployment

See `docs/DEPLOYMENT.md` for deployment instructions.

## License

MIT
