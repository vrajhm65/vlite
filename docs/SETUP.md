# VLITE Setup Guide

## Step 1: Install Required Software

- **Node.js** 18+: https://nodejs.org
- **MongoDB Atlas**: https://www.mongodb.com/atlas
- **Git**: https://git-scm.com

## Step 2: Clone Repository

```bash
git clone <repo-url>
cd vlite
```

## Step 3: Install Dependencies

```bash
npm run install:all
```

Or manually:
```bash
cd server && npm install
cd ../client && npm install
```

## Step 4: Create Environment Files

### Server (.env)

Copy `server/.env.example` to `server/.env` and fill in values:

```bash
cp server/.env.example server/.env
```

Edit `server/.env`:
- `MONGODB_URI` - Your MongoDB Atlas connection string
- `JWT_SECRET` - A long random secret (64+ characters)

Generate JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Client (.env)

Create `client/.env`:
```
VITE_API_URL=http://localhost:5000
VITE_SOCKET_URL=http://localhost:5000
```

## Step 5: Configure MongoDB

1. Go to [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a database named `vlite`
3. Create a database user
4. Whitelist your IP address (0.0.0.0/0 for local dev)
5. Get connection string: Cluster → Connect → Connect your application
6. Paste URI into `MONGODB_URI` in `server/.env`

## Step 6: Configure CAPTCHA (Optional)

For development, CAPTCHA is disabled. For production:
- Register at [Google reCAPTCHA](https://www.google.com/recaptcha)
- Set `CAPTCHA_PROVIDER=recaptcha-v3`
- Set `RECAPTCHA_SITE_KEY` and `RECAPTCHA_SECRET_KEY`

## Step 7: Configure Image Storage (Optional)

For question images:
1. Sign up at [Cloudinary](https://cloudinary.com)
2. Get Cloud Name, API Key, API Secret
3. Set in `server/.env`

## Step 8: Start Backend

```bash
cd server
npm run dev
```

Server starts on port 5000.

## Step 9: Start Frontend

```bash
cd client
npm run dev
```

Frontend starts on port 5173.

## Step 10: Run Tests

```bash
cd server
npm test
```

## Step 11: Build Production

```bash
cd client
npm run build
```

## Step 12: Start Production

```bash
cd server
npm start
```

## Verification

1. Open `http://localhost:5173` in browser
2. Register as host at `/login`
3. Create a room
4. Join as participant with the LRN
5. Start session and verify real-time flow
