# VLITE Environment Variables

## Summary

All configuration is done through environment variables. Never hard-code secrets.

## Server Environment Variables (server/.env)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| MONGODB_URI | Yes | `mongodb+srv://user:pass@cluster.mongodb.net/vlite` | MongoDB Atlas connection string |
| JWT_SECRET | Yes | 64+ random characters | JWT signing secret |
| JWT_EXPIRES_IN | No | `7d` | Token expiration |
| PORT | No | `5000` | Server port |
| NODE_ENV | No | `development` or `production` | Environment |
| CLIENT_URL | No | `http://localhost:5173` | Frontend URL for CORS |
| CAPTCHA_PROVIDER | No | `none` or `recaptcha-v3` | CAPTCHA provider |
| RECAPTCHA_SITE_KEY | No | (public key) | reCAPTCHA site key |
| RECAPTCHA_SECRET_KEY | No | (private key) | reCAPTCHA secret |
| CLOUDINARY_CLOUD_NAME | No | | Cloudinary cloud name |
| CLOUDINARY_API_KEY | No | | Cloudinary API key |
| CLOUDINARY_API_SECRET | No | | Cloudinary API secret |
| REDIS_URL | No | `redis://localhost:6379` | Redis for multi-instance |
| RATE_LIMIT_WINDOW_MS | No | `60000` | Rate limit window |
| RATE_LIMIT_MAX | No | `100` | Rate limit max |

## Client Environment Variables (client/.env)

| Variable | Required | Example | Description |
|----------|----------|---------|-------------|
| VITE_API_URL | No | `http://localhost:5000` | Backend API URL |
| VITE_SOCKET_URL | No | `http://localhost:5000` | Socket.IO URL |

## Secret Classification

### Backend Secrets (NEVER expose to frontend)
- MONGODB_URI
- JWT_SECRET
- CAPTCHA_SECRET_KEY
- CLOUDINARY_API_SECRET
- Redis URL (if password protected)

### Frontend Public (safe in client code)
- VITE_API_URL
- VITE_SOCKET_URL
- RECAPTCHA_SITE_KEY (public key)

### NEVER in Frontend
- MONGODB_URI
- JWT_SECRET
- CAPTCHA_SECRET_KEY
- CLOUDINARY_API_SECRET
- Any private API keys

## Getting Started

1. Copy `.env.example` files to `.env`
2. Get MongoDB URI from Atlas
3. Generate JWT secret
4. Fill in all required variables
5. Never commit `.env` to Git

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
