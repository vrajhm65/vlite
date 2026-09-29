import { body } from 'express-validator';

const createRoomValidation = [
  body('name').trim().isLength({ min: 1, max: 120 }).withMessage('Room name required'),
  body('mode').optional().isIn(['normal', 'intermediate', 'expert']).withMessage('Invalid mode'),
  body('negativeMarking').optional().isBoolean(),
  body('correctPoints').optional().isInt({ min: 0, max: 1000 }),
  body('negativePoints').optional().isInt({ min: 0, max: 100 }),
  body('maxParticipants').optional().isInt({ min: 1, max: 1000 }),
];

const joinRoomValidation = [
  body('name').trim().isLength({ min: 1, max: 100 }).withMessage('Name required'),
  body('captchaToken').optional().isString(),
  body('roomId').isMongoId().withMessage('Valid room ID required'),
];

export { createRoomValidation, joinRoomValidation };
