import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireHost } from '../middleware/auth.js';
import { verifyHostOwner } from '../controllers/roomController.js';
import {
  createRoomHandler,
  getMyRoomsHandler,
  getRoomByLRNHandler,
  getRoomHandler,
  addQuestionHandler,
  getQuestionsHandler,
  startSessionHandler,
  endSessionHandler,
  getResultsHandler,
} from '../controllers/roomController.js';

const router = express.Router();

// List rooms owned by the authenticated host
router.get(
  '/',
  authenticate,
  requireHost,
  getMyRoomsHandler
);

// Room creation (host only)
router.post(
  '/',
  authenticate,
  requireHost,
  [
    body('name').trim().isLength({ min: 1, max: 120 }),
    body('mode').optional().isIn(['normal', 'intermediate', 'expert']),
    body('negativeMarking').optional().isBoolean(),
    body('correctPoints').optional().isInt({ min: 0 }),
    body('negativePoints').optional().isInt({ min: 0 }),
    body('maxParticipants').optional().isInt({ min: 1 }),
  ],
  createRoomHandler
);

// Get room by LRN (public)
router.get('/lrn/:lrn', getRoomByLRNHandler);

// Final results (public: rank, name, score only)
router.get('/:roomId/results', getResultsHandler);

// Room CRUD (host only)
router.route('/:roomId')
  .get(authenticate, requireHost, verifyHostOwner, getRoomHandler);

// Questions
router.post(
  '/:roomId/questions',
  authenticate,
  requireHost,
  verifyHostOwner,
  [
    body('text').trim().isLength({ min: 1, max: 2000 }),
    body('options').isArray({ min: 2, max: 6 }),
    body('options.*.label').trim().isLength({ min: 1, max: 50 }),
    body('options.*.text').trim().isLength({ min: 1, max: 500 }),
    body('correctAnswerIndex').isInt({ min: 0 }),
    body('explanation').optional().trim(),
    body('marks').optional().isInt({ min: 0 }),
    body('durationSeconds').optional().isInt({ min: 5 }),
    body('imageUrl').optional().isString(),
    body('order').optional().isInt({ min: 0 }),
  ],
  addQuestionHandler
);

router.get('/:roomId/questions', authenticate, requireHost, verifyHostOwner, getQuestionsHandler);

// Session control
router.post('/:roomId/start', authenticate, requireHost, verifyHostOwner, startSessionHandler);
router.post('/:roomId/end', authenticate, requireHost, verifyHostOwner, endSessionHandler);

export default router;
