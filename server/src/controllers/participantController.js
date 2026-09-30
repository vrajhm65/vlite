import { body, validationResult } from 'express-validator';
import { createParticipantSession, validateParticipantSession } from '../services/participantService.js';
import logger from '../utils/logger.js';

/**
 * Verify CAPTCHA token.
 *
 * - 'none' (dev): accepts any non-empty token
 * - 'recaptcha-v3': verifies with Google reCAPTCHA v3 API
 * - 'hcaptcha': verifies with hCaptcha API
 *
 * Secret keys are NEVER exposed to the frontend.
 */
async function verifyCaptcha(token) {
  const provider = process.env.CAPTCHA_PROVIDER || 'none';

  if (provider === 'none') {
    // Dev mode: accept any non-empty token
    return Boolean(token && token.length > 0);
  }

  if (!token || typeof token !== 'string' || token.length < 20) {
    return false;
  }

  try {
    if (provider === 'recaptcha-v3') {
      const secret = process.env.RECAPTCHA_SECRET_KEY;
      if (!secret) {
        logger.error('RECAPTCHA_SECRET_KEY not configured');
        return false;
      }

      const verifyUrl = 'https://www.google.com/recaptcha/api/siteverify';
      const params = new URLSearchParams({
        secret,
        response: token,
      });

      const response = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        logger.warn(`reCAPTCHA verification failed: HTTP ${response.status}`);
        return false;
      }

      const data = await response.json();
      return data.success === true && (data.score === undefined || data.score >= 0.5);
    }

    if (provider === 'hcaptcha') {
      const secret = process.env.HCAPTCHA_SECRET_KEY;
      if (!secret) {
        logger.error('HCAPTCHA_SECRET_KEY not configured');
        return false;
      }

      const verifyUrl = 'https://hcaptcha.com/siteverify';
      const params = new URLSearchParams({
        secret,
        response: token,
      });

      const response = await fetch(verifyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });

      if (!response.ok) {
        logger.warn(`hCaptcha verification failed: HTTP ${response.status}`);
        return false;
      }

      const data = await response.json();
      return data.success === true;
    }

    // Unknown provider: reject
    logger.error(`Unknown CAPTCHA provider: ${provider}`);
    return false;
  } catch (error) {
    logger.error(`CAPTCHA verification error: ${error.message}`);
    return false;
  }
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
    const captchaValid = await verifyCaptcha(captchaToken);
    if (!captchaValid) {
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
