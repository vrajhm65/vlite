import express from 'express';
import { body } from 'express-validator';
import { joinRoom, getSession } from '../controllers/participantController.js';

const router = express.Router();

router.post(
  '/join',
  [
    body('participantName').trim().isLength({ min: 1, max: 100 }),
    body('lrn').matches(/^\d{4}$/),
  ],
  joinRoom
);

router.get('/session/:roomId', getSession);

export default router;
