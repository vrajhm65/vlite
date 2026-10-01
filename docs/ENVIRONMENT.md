# VLITE Environment Variables

## Summary

All configuration is done through environment variables. Never hard-code secrets.

## Server Environment Variables (server/.env)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| MONGODB_URI | Yes | `mongodb+srv://user:pass@cluster.mongodb.net/vlite` | MongoDB Atlas connection string |
| MONGODB_DB_NAME | No | `vlite` | Database name (VLITE uses ONLY this database) |
| JWT_SECRET | Yes | 64+ random characters | JWT signing secret |
| JWT_EXPIRES_IN | No | `7d` | Token expiration |
| PORT | No | `5000` | Server port |
| NODE_ENV | No | `development` or `production` | Environment |
| CLIENT_URL | No | `http://localhost:5174` | Frontend URL for CORS (ALLOWED_ORIGINS covers 127.0.0.1 + 5173 variants) |
| CLOUDINARY_CLOUD_NAME | No | | Cloudinary cloud name |
| CLOUDINARY_API_KEY | No | | Cloudinary API key |
| CLOUDINARY_API_SECRET | No | | Cloudinary API secret |
| REDIS_URL | No | `redis://localhost:6379` | Redis for multi-instance |
| RATE_LIMIT_WINDOW_MS | No | `60000` | Rate limit window |
| RATE_LIMIT_MAX | No | `100` | Rate limit max |
| SESSION_GRACE_PERIOD_MS | No | `86400000` | Cleanup grace period (24h) |
| CLEANUP_INTERVAL_MS | No | `1800000` | Cleanup job interval (30min) |
| EXPERT_ANSWER_SECONDS | No | `5` | Expert priority answer window (seconds) |
| TEST_CLEANUP_HOST_EMAIL | Test cleanup only | `tester@example.com` | Host whose test rooms may be deleted (required by `test:cleanup`) |
| TEST_CLEANUP_ROOM_PREFIX | Test cleanup only | `VLITE_TEST_` | Room-name prefix eligible for deletion (min 4 chars) |
| TEST_MONGODB_DB_NAME | Tests only | `vlite_test` | Database jest tests run against (must contain "test") |

## Client Environment Variables (client/.env)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| VITE_API_URL | No (prod: yes) | `https://api.example.com/api` | Backend base URL **including `/api`**; empty in dev (Vite proxy) |
| VITE_SOCKET_URL | No (prod: yes) | `https://api.example.com` | Backend origin for Socket.IO; empty in dev (same origin + proxy) |

## Secret Classification

### Backend Secrets (NEVER expose to frontend)
- MONGODB_URI
- JWT_SECRET
- CLOUDINARY_API_SECRET
- CLOUDINARY_API_KEY (also secret)
- Redis URL (if password protected)

### Backend Internal (configuration, not secrets)
- MONGODB_DB_NAME
- SESSION_GRACE_PERIOD_MS
- CLEANUP_INTERVAL_MS

### Frontend Public (safe in client code)
- VITE_API_URL
- VITE_SOCKET_URL

### NEVER in Frontend
- MONGODB_URI
- JWT_SECRET
- CLOUDINARY_API_SECRET
- CLOUDINARY_API_KEY
- Any private API keys

## Getting Started

1. Copy `.env.example` files to `.env`
2. Get MongoDB URI from Atlas
3. Generate JWT secret
4. Set `MONGODB_DB_NAME=vlite` in server/.env
5. Fill in all required variables
6. Never commit `.env` to Git

## Generating JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

## Where Secrets Go

- Server secrets: `server/.env` (never committed)
- Client secrets: `client/.env` (never committed)
- Never in `process.env` in code
- Never in console.log
- Never in error messages
- Never in log files
