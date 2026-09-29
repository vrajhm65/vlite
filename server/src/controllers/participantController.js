import { body, validationResult } from 'express-validator';
import { createParticipantSession, validateParticipantSession } from '../services/participantService.js';
import logger from '../utils/logger.js';

/**
 * Simple honeypot CAPTCHA for dev mode.
 * In production, integrate reCAPTCHA v3 or hCaptcha.
 */
function verifyCaptcha(token) {
  if (process.env.CAPTCHA_PROVIDER === 'none') {
    // Dev mode: accept any non-empty token
    return token && token.length > 0;
  }
  // Production CAPTCHA verification would go here
  return true;
}

/**
 * Participant login/join flow.
 * 1. Verify CAPTCHA
 * 2. Create participant session
 * 3. Return secure token
 */
async function joinRoom(req, res) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, captchaToken, roomId } = req.body;

    // Verify CAPTCHA
    if (!verifyCaptcha(captchaToken)) {
      return res.status(400).json({ error: 'CAPTCHA verification failed' });
    }

    // Validate name
    if (!name || name.trim().length === 0 || name.trim().length > 100) {
      return res.status(400).json({ error: 'Invalid participant name' });
    }

    // Create session
    const { session, token } = await createParticipantSession(name.trim(), roomId);

    logger.info(`Participant session created: room=${roomId} name=${name}`);

    res.status(201).json({
      token,
      participantName: name.trim(),
      sessionId: session._id,
    });
  } catch (error) {
    logger.error(`Join room error: ${error.message}`);
    res.status(500).json({ error: error.message || 'Failed to join room' });
  }
}

/**
 * Get participant session info.
 */
async function getSession(req, res) {
  try {
    const { token } = req;
    const session = await validateParticipantSession(token, req.params.roomId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    res.json({
      participantName: session.participantName,
      score: session.score,
      joinedAt: session.joinedAt,
    });
  } catch (error) {
    logger.error(`Get session error: ${error.message}`);
    res.status(500).json({ error: 'Failed to retrieve session' });
  }
}

export { joinRoom, getSession };
