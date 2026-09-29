import mongoose from 'mongoose';
import logger from '../utils/logger.js';

let isConnected = false;

/**
 * Connect to MongoDB Atlas.
 * Uses MONGODB_URI from environment.
 * Database name is extracted from the URI path or defaults to 'vlite'.
 */
async function connectDB() {
  if (isConnected) {
    logger.info('MongoDB already connected');
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    logger.error('MONGODB_URI is not defined in environment variables');
    throw new Error('MONGODB_URI is required');
  }

  try {
    const conn = await mongoose.connect(uri, {
      dbName: config.mongoDbName,
    });

    isConnected = true;
    logger.info(`MongoDB connected: ${conn.connection.host}`);
    logger.info(`Database: ${conn.connection.name}`);
    logger.info(`VLITE database confirmed: ${config.mongoDbName}`);
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    throw error;
  }
}

async function disconnectDB() {
  if (isConnected) {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  }
}

export { connectDB, disconnectDB };
