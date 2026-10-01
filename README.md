# VLITE - Live Interactive Session Platform

Live interactive sessions (quiz, IQ, aptitude, MCQ) with multiple simultaneous rooms,
real-time scoring, and multi-participant concurrency.

## Features

- **Multi-room concurrency**: Multiple live rooms running simultaneously with full isolation
- **Real-time scoring**: Server-authoritative scoring with Normal, Intermediate, and Expert modes
- **Expert mode**: Priority-based answering with server-side raise-hand queue
- **Negative marking**: Configurable per room
- **Server-authoritative**: Client timers are display only; server determines scoring, timing, priority
- **Mobile-first**: Responsive design for phones, tablets, and desktops
- **Network resilient**: Socket.IO reconnection, state sync (`session:sync`), refresh recovery
- **Session cleanup**: Automatic cleanup of stale sessions (historical results preserved)

## Architecture

```
server/    - Node.js + Express + Socket.IO + Mongoose (MongoDB Atlas, database: vlite)
client/    - React + Vite (dev proxied through Vite to the backend)
docs/      - Documentation
```

## Tech Stack

- Frontend: React 18, React Router, Vite 7, Socket.IO client, Axios
- Backend: Node.js, Express, Socket.IO, Mongoose, JWT, Helmet, express-rate-limit
- Database: MongoDB Atlas (`vlite` database)

## Local Setup

### Prerequisites

- Node.js 18+
- MongoDB Atlas cluster (or local MongoDB)

### Environment Setup

1. Copy `server/.env.example` to `server/.env` and set:
   - `MONGODB_URI` - Your MongoDB connection string (required)
   - `JWT_SECRET` - A long random secret, 64+ characters (required)
   - `MONGODB_DB_NAME=vlite` (default)
2. `client/.env` can stay empty for development (Vite proxies `/api` and
   `/socket.io` to the backend). See `client/.env.example`.

See `docs/ENVIRONMENT.md` for all variables.

### Run (ONE command)

```bash
cd "C:\Vlite\Vlite app"
npm run dev
```

This starts both backend (port 5000) and frontend (port 5174).

### Open (ONE URL)

```
http://localhost:5174/
```

## Testing

```bash
cd server
npm test
```

Manual E2E flow: register host → login → create room (4-digit LRN) →
add questions → start session → join as participant (Name + LRN) →
answer live → leaderboard → end session → results.

## Production Build

```bash
cd client
npm run build
```

In production, set `VITE_API_URL=https://<backend>/api` and
`VITE_SOCKET_URL=https://<backend>` in `client/.env` before building.

## Deployment

See `docs/DEPLOYMENT.md`.

- Frontend: Vercel / Netlify (serve `client/dist`)
- Backend: Render / Railway / Fly.io / VPS (`node src/server.js`)
- Database: MongoDB Atlas
- Set `CLIENT_URL` / `ALLOWED_ORIGINS`, `MONGODB_URI`, `JWT_SECRET` on the backend.

## API Endpoints

- `POST /api/auth/host` - Create host account
- `POST /api/auth/login` - Host login
- `GET /api/auth/me` - Current host (authenticated)
- `GET /api/rooms` - List own rooms (host)
- `POST /api/rooms` - Create room (host)
- `GET /api/rooms/lrn/:lrn` - Room lookup by LRN (public)
- `GET /api/rooms/:roomId` - Room details (host owner)
- `POST /api/rooms/:roomId/questions` - Add question (host owner)
- `GET /api/rooms/:roomId/questions` - List questions (host owner)
- `POST /api/rooms/:roomId/start` - Start session (host owner)
- `POST /api/rooms/:roomId/end` - End session (host owner)
- `GET /api/rooms/:roomId/results` - Final results (public, rank/name/score)
- `POST /api/participants/join` - Join with `{ participantName, lrn }` (no CAPTCHA)

## Socket.IO Events

Client → server: `room:join`, `session:start`, `session:end`,
`question:next`, `answer:submit`, `expert:raise-hand`, `session:sync`, `room:leave`

Server → room: `room:state`, `session:start`, `question:start`,
`question:end`, `leaderboard:update`, `answer:result`, `expert:queue`,
`expert:raised`, `session:end`, `vlite:error`

## Security Notes

- JWT authentication for hosts and participants; role + room ownership
  verified server-side on every HTTP and Socket.IO action.
- All scoring, timing, correctness, and expert priority computed server-side.
- `correctAnswerIndex` is never sent to participants.
- Duplicate answers rejected via application check + unique DB index.
- Rate limiting, Helmet, CORS allowlist, 1MB JSON limit, input validation.
- Never commit `.env` files. No secrets in frontend code.

## License

MIT
