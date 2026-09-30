import User from '../models/User.js';
import jwt from 'jsonwebtoken';

const { sign, verify } = jwt;
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { body, validationResult } from 'express-validator';

/**
 * Generate JWT for host.
 */
function generateHostToken(hostId) {
  return sign(
    { userId: hostId, role: 'host' },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

/**
 * Host login.
 */
async function hostLogin(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isValid = await user.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = generateHostToken(user._id);
    logger.info(`Host login: ${email}`);

    res.json({ token, user: user.toPublic() });
  } catch (error) {
    logger.error(`Host login error: ${error.message}`);
    res.status(500).json({ error: 'Login failed' });
  }
}

/**
 * Create a host user.
 */
async function createHost(req, res) {
  try {
    const { name, email, password } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: 'Host already exists' });
    }

    const user = await User.create({
      name,
      email,
      passwordHash: password,
      role: 'host',
    });

    const token = generateHostToken(user._id);
    logger.info(`Host created: ${email}`);

    res.status(201).json({ token, user: user.toPublic() });
  } catch (error) {
    logger.error(`Host creation error: ${error.message}`);
    res.status(500).json({ error: 'Creation failed' });
  }
}

/**
 * Get current user profile.
 */
async function getMe(req, res) {
  try {
    const user = await User.findById(req.user.userId).select('-passwordHash');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    logger.error(`Get me error: ${error.message}`);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}

export { hostLogin, createHost, getMe };


