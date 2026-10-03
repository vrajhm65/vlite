import express from 'express';
import { body } from 'express-validator';
import { authenticate } from '../middleware/auth.js';
import { joinRoom, getMeParticipant } from '../controllers/participantController.js';

const router = express.Router();

router.post(
  '/join',
  [
    body('participantName').trim().isLength({ min: 1, max: 100 }),
    body('lrn').matches(/^\d{4}$/),
  ],
  joinRoom
);

// Verify the stored participant session (used on page refresh
// to recover without rejoining). Server re-validates the token.
router.get('/me', authenticate, getMeParticipant);

export default router;
