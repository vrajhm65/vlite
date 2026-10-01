import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import connectDB from './config/database.js';
import config from './config/index.js';
import logger from './utils/logger.js';
import app from './app.js';
import { initSocketIO } from './sockets/index.js';
import { startCleanup, stopCleanup } from './jobs/cleanupJob.js';

async function main() {
  await connectDB();

  const server = http.createServer(app);

  const io = new Server(server, {
    cors: {
      origin: config.allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    maxHttpBufferSize: 1e6,
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Initialize Socket.IO handlers
  initSocketIO(io);

  // Attach io to app
  app.set('io', io);

  // Start session cleanup job
  startCleanup();

  const PORT = config.port;
  server.listen(PORT, () => {
    logger.info(`VLITE server running on port ${PORT}`);
    logger.info(`Environment: ${config.nodeEnv}`);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    stopCleanup();
    server.close(() => {
      process.exit(0);
    });
  });
  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    stopCleanup();
    server.close(() => {
      process.exit(0);
    });
  });
}

main().catch((err) => {
  logger.error(`Server startup failed: ${err.message}`);
  process.exit(1);
});
