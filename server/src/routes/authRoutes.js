import express from 'express';
import { body } from 'express-validator';
import { hostLogin, createHost, getMe } from '../controllers/authController.js';

const router = express.Router();

const loginValidation = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
];

const createHostValidation = [
  body('name').trim().isLength({ min: 1, max: 100 }),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 6 }),
];

import { authenticate } from '../middleware/auth.js';

router.post('/login', loginValidation, hostLogin);
router.post('/host', createHostValidation, createHost);
router.get('/me', authenticate, getMe);

export default router;
