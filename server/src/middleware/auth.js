import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../utils/logger.js';

/**
 * Verify JWT token and attach user to request.
 * Supports both host tokens (userId) and participant tokens (sessionId).
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    logger.warn(`Token verification failed: ${err.message}`);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Verify host role.
 */
function requireHost(req, res, next) {
  if (req.user.role !== 'host') {
    return res.status(403).json({ error: 'Host access required' });
  }
  next();
}

export { authenticate, requireHost };
