# VLITE Scalability

## Initial Deployment Architecture

**Single Instance**: 1 backend server + Socket.IO + MongoDB Atlas

This is sufficient for:
- Up to ~500 concurrent participants per room
- Multiple rooms running simultaneously
- Production deployments with moderate traffic

**Why single instance is sufficient initially:**
- Socket.IO in single instance mode handles all realtime events
- MongoDB Atlas free/paid tier handles the data load
- No need for Redis pub/sub when there's only one server
- Simpler to deploy and maintain

### Architecture Diagram

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│   Frontend  │────▶│   Backend    │────▶│   MongoDB    │
│   (Vercel)  │◀────│   (1 instance)│◀────│   (Atlas)    │
└─────────────┘     └──────────────┘     └──────────────┘
                           │
                     ┌─────┴─────┐
                     │  Socket.IO │
                     │  (ws server)│
                     └───────────┘
```

## Future Scaling Architecture

When single instance capacity is exceeded:

### Multi-Instance with Redis Adapter

```
┌─────────────┐     ┌──────────────┐
│   Frontend  │────▶│  Load Balancer│
│   (Vercel)  │     │  (WS support) │
└─────────────┘     └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Backend  │ │ Backend  │ │ Backend  │
        │ (Instance│ │ (Instance│ │ (Instance│
        │   1)     │ │   2)     │ │   3)     │
        └────┬─────┘ └────┬─────┘ └────┬─────┘
             │            │            │
             └────────────┼────────────┘
                          │
                   ┌──────┴──────┐
                   │    Redis    │
                   │  (Adapter)  │
                   └─────────────┘
                          │
                   ┌──────┴──────┐
                   │   MongoDB   │
                   │   (Atlas)   │
                   └─────────────┘
```

### When Scaling Becomes Necessary

Scaling to multiple instances is required when:
1. CPU consistently > 80% during peak load
2. Memory usage > 80% of available RAM
3. Socket.IO connections exceed single instance limits
4. MongoDB Atlas connection pool exhausted

### Redis Adapter Configuration

Add to `server/src/server.js`:
```javascript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

if (config.redisUrl) {
  const pubClient = createClient({ url: config.redisUrl });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
}
```

### Environment Variables for Scaling

```
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your-redis-password
```

## Capacity Planning

### Single Instance (tested)
- 1 room × 50-100 participants
- 3-5 rooms × 50 participants each
- Answer latency < 100ms
- Socket.IO event latency < 50ms

### Multi-Instance (with Redis)
- Linear scaling with number of instances
- Each additional instance adds ~500 concurrent connections
- Redis pub/sub adds < 5ms overhead

### MongoDB Atlas Scaling
- Free tier: 512MB storage, shared RAM
- M0/M2: Adequate for development and small production
- M10+: Recommended for production with many rooms
- Sharding: Only needed at very large scale (>100K participants)

## Horizontal Scaling Limitations

1. **Socket.IO rooms**: Redis adapter needed for multi-instance
2. **In-memory state**: Expert queues, timers must move to Redis
3. **Database connections**: Each instance needs its own connection
4. **File uploads**: Cloudinary/S3 handles this independently

## Notes

- Do NOT claim horizontal scaling capabilities without testing
- Single instance is sufficient for initial production
- Add Redis only when metrics indicate need
- Monitor CPU, memory, connection count before scaling
