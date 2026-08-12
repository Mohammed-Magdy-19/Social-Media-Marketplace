// src/routes/auth.routes.js
// Authentication routes — /api/auth/*
// All routes here are pure HTTP REST (see Backend Architecture Doc, section 2.1):
// credential checks, token issuance, and email-triggered flows are one-shot
// request/response transactions with no real-time component.

import { Router } from 'express';

import { register, login, refreshAccessToken, logout, forgotPassword, resetPassword, verifyEmail, resendVerification, getMe } from '../controllers/auth.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { authLimiter, passwordResetLimiter } from '../middleware/rateLimiter.middleware.js';

import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '../validators/auth.validator.js';

const router = Router();

// POST /api/auth/register — create a new account, hash password, send verification email
router.post('/register', validate(registerSchema), register);

// POST /api/auth/login — verify credentials, issue access + refresh tokens
// Rate-limited to blunt brute-force credential guessing.
router.post('/login', authLimiter, validate(loginSchema), login);

// POST /api/auth/refresh-token — silently renew the access token using a valid refresh token
router.post('/refresh-token', refreshAccessToken);

// POST /api/auth/logout — invalidate the refresh token server-side and clear auth cookies
router.post('/logout', logout);

// POST /api/auth/forgot-password — generate a PasswordResetToken and email a reset link
// Rate-limited to prevent email-bombing / enumeration abuse.
router.post(
    '/forgot-password',
    passwordResetLimiter,
    validate(forgotPasswordSchema),
    forgotPassword
);

// POST /api/auth/reset-password/:token — validate token, hash + save the new password
router.post(
    '/reset-password/:token',
    validate(resetPasswordSchema),
    resetPassword
);

// POST /api/auth/verify-email/:token — validate token, flip isVerified to true
router.post('/verify-email/:token', verifyEmail);

// POST /api/auth/resend-verification — issue and email a fresh verification token
// Rate-limited: low-frequency utility endpoint, easy to abuse otherwise.
router.post('/resend-verification', authLimiter, resendVerification);

// GET /api/auth/me — return the logged-in user's own profile (password excluded)
router.get('/me', protect, getMe);

export default router;