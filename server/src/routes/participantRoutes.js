import express from 'express';
import { body } from 'express-validator';
import { joinRoom, getSession } from '../controllers/participantController.js';

const router = express.Router();

router.post(
  '/join',
  [
    body('name').trim().isLength({ min: 1, max: 100 }),
    body('captchaToken').optional().isString(),
    body('roomId').isMongoId(),
  ],
  joinRoom
);

router.get('/session/:roomId', getSession);

export default router;
