# VLITE Deployment

## Production Architecture

### Current: Single Instance

For initial deployment, a single instance is sufficient.

**Components:**
- Frontend: Vercel, Netlify, or similar
- Backend: Render, Railway, Fly.io, or VPS
- Database: MongoDB Atlas (free tier available)
- Realtime: Socket.IO

### Future: Multi-Instance Scaling

When scaling beyond single instance:
1. Add Redis adapter for Socket.IO (`socket.io-redis`)
2. Load balancer with WebSocket support
3. Stateless API servers
4. MongoDB Atlas dedicated cluster

## Frontend Deployment

### Vercel

```bash
cd client
npm install
npm run build
```

Set the Vercel project **Root Directory** to `client` (framework preset: Vite).

Set environment variables in Vercel dashboard:
- `VITE_API_URL` - Production backend base URL **including the `/api` prefix**
  (e.g. `https://your-backend.com/api`)
- `VITE_SOCKET_URL` - Production backend origin
  (e.g. `https://your-backend.com`)

#### SPA routing (required)

VLITE is a React Router single-page app. Without a rewrite, refreshing
any client-side route (`/join`, `/session/:roomId`, `/host/dashboard`,
...) returns a Vercel 404 because no such static file exists.

`client/vercel.json` already contains the required fallback:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

Do not remove it. API calls are unaffected: in production the frontend
calls the absolute `VITE_API_URL` directly, so `/api/*` never collides
with the rewrite.

### Netlify

```bash
cd client
npm install
npm run build
```

Deploy `dist/` folder to Netlify.

## Backend Deployment

### Render

1. Create `render.yaml` or use web dashboard
2. Set environment variables:
   - `MONGODB_URI`
   - `JWT_SECRET`
   - `NODE_ENV=production`
   - `PORT=5000`
   - `CLIENT_URL=https://your-frontend.com`
3. Build command: `cd server && npm install && npm run build` (if needed)
4. Start command: `node src/server.js`

### Railway

1. Connect repository
2. Set environment variables
3. Deploy

## Environment Variables for Production

### server/.env (production)

```
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.example.mongodb.net/vlite?retryWrites=true&w=majority
JWT_SECRET=production-long-random-secret
NODE_ENV=production
PORT=5000
CLIENT_URL=https://yourdomain.com
```

### client/.env (production)

```
VITE_API_URL=https://your-backend.com/api
VITE_SOCKET_URL=https://your-backend.com
```

## Domain Configuration

For production:
1. Set `CLIENT_URL` to your frontend domain
2. CORS configured to allow only your domain
3. No `origin: "*"` in production

## Production Refresh Check

After deploying, verify no route returns a generic 404:

- open `/` directly
- navigate to a room and refresh the page
- open `/join`, refresh
- open `/login`, refresh
- as a participant, refresh mid-question and confirm the session,
  question, timer and submitted state are restored without rejoining

## Database

- MongoDB Atlas free cluster is sufficient for development
- For production: Dedicated cluster with proper backup
- Database name: `vlite` (separate from other projects)
- Indexes are created automatically via Mongoose

## Notes

- Do not hard-code localhost URLs
- All URLs via environment variables
- Never commit `.env` files
- Use HTTPS in production
- Enable Socket.IO in production mode
