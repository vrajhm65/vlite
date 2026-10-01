import express from 'express';
import { body } from 'express-validator';
import { authenticate, requireHost } from '../middleware/auth.js';
import { verifyHostOwner } from '../controllers/roomController.js';
import {
  createRoomHandler,
  getMyRoomsHandler,
  getRoomByLRNHandler,
  getRoomHandler,
  updateRoomHandler,
  deleteRoomHandler,
  addQuestionHandler,
  updateQuestionHandler,
  deleteQuestionHandler,
  getQuestionsHandler,
  getParticipantsHandler,
  getSessionsHandler,
  getSessionResultsHandler,
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

// Results of one specific session (public: rank, name, score only)
router.get('/:roomId/sessions/:sessionId/results', getSessionResultsHandler);

// Room CRUD (host and owner only)
router.route('/:roomId')
  .get(authenticate, requireHost, verifyHostOwner, getRoomHandler)
  .patch(
    authenticate,
    requireHost,
    verifyHostOwner,
    [
      body('name').optional().trim().isLength({ min: 1, max: 120 }),
      body('mode').optional().isIn(['normal', 'intermediate', 'expert']),
      body('negativeMarking').optional().isBoolean(),
      body('correctPoints').optional().isInt({ min: 0 }),
      body('negativePoints').optional().isInt({ min: 0 }),
      body('maxParticipants').optional().isInt({ min: 1 }),
    ],
    updateRoomHandler
  )
  .delete(authenticate, requireHost, verifyHostOwner, deleteRoomHandler);

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

router.put(
  '/:roomId/questions/:questionId',
  authenticate,
  requireHost,
  verifyHostOwner,
  [
    body('text').optional().trim().isLength({ min: 1, max: 2000 }),
    body('options').optional().isArray({ min: 2, max: 6 }),
    body('options.*.label').optional().trim().isLength({ min: 1, max: 50 }),
    body('options.*.text').optional().trim().isLength({ min: 1, max: 500 }),
    body('correctAnswerIndex').optional().isInt({ min: 0 }),
    body('explanation').optional().trim(),
    body('marks').optional().isInt({ min: 0 }),
    body('durationSeconds').optional().isInt({ min: 5 }),
    body('imageUrl').optional().isString(),
    body('order').optional().isInt({ min: 0 }),
  ],
  updateQuestionHandler
);

router.delete('/:roomId/questions/:questionId', authenticate, requireHost, verifyHostOwner, deleteQuestionHandler);

// Current participants (host and owner only)
router.get('/:roomId/participants', authenticate, requireHost, verifyHostOwner, getParticipantsHandler);

// Session history (host and owner only)
router.get('/:roomId/sessions', authenticate, requireHost, verifyHostOwner, getSessionsHandler);

// Session control
router.post('/:roomId/start', authenticate, requireHost, verifyHostOwner, startSessionHandler);
router.post('/:roomId/end', authenticate, requireHost, verifyHostOwner, endSessionHandler);

export default router;
