import mongoose from 'mongoose';
import logger from '../utils/logger.js';

let isConnected = false;

/**
 * Connect to MongoDB Atlas.
 *
 * Required:
 *   MONGODB_URI
 *
 * Optional:
 *   MONGODB_DB_NAME
 *
 * Defaults to the VLITE database.
 */
async function connectDB() {
  if (isConnected) {
    logger.info('MongoDB already connected');
    return mongoose.connection;
  }

  const uri = process.env.MONGODB_URI;

  if (!uri) {
    logger.error('MONGODB_URI is not defined in environment variables');
    throw new Error('MONGODB_URI is required');
  }

  const dbName = process.env.MONGODB_DB_NAME || 'vlite';

  try {
    const conn = await mongoose.connect(uri, {
      dbName,
    });

    isConnected = true;

    logger.info(`MongoDB connected: ${conn.connection.host}`);
    logger.info(`Database: ${conn.connection.name}`);
    logger.info(`VLITE database confirmed: ${dbName}`);

    return conn.connection;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`);
    throw error;
  }
}

/**
 * Disconnect MongoDB.
 */
async function disconnectDB() {
  if (!isConnected) {
    return;
  }

  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('MongoDB disconnected');
  } catch (error) {
    logger.error(`MongoDB disconnect error: ${error.message}`);
    throw error;
  }
}

export { connectDB, disconnectDB };

export default connectDB;