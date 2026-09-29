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

Set environment variables in Vercel dashboard:
- `VITE_API_URL` - Production backend URL
- `VITE_SOCKET_URL` - Production backend URL

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
CAPTCHA_PROVIDER=recaptcha-v3
RECAPTCHA_SITE_KEY=your-site-key
RECAPTCHA_SECRET_KEY=your-secret-key
```

### client/.env (production)

```
VITE_API_URL=https://your-backend.com
VITE_SOCKET_URL=https://your-backend.com
```

## Domain Configuration

For production:
1. Set `CLIENT_URL` to your frontend domain
2. CORS configured to allow only your domain
3. No `origin: "*"` in production

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
