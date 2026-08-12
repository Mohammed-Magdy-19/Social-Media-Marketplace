// src/routes/payment.routes.js
// Payment routes — /api/payments/*
// Pure HTTP REST throughout. The frontend tokenizes card details directly
// with Stripe/PayPal (raw card numbers never touch this backend); the
// backend exchanges that token for a transaction and records the resulting
// ledger entry in the Payment collection (see Backend Architecture Doc,
// section 4.2). Payment writes are exactly the kind of sensitive,
// transactional operation the doc keeps off Socket.io.

import { Router } from 'express';

import { createPaymentIntent, handleStripeWebhook, getMyPayments, getPaymentById } from '../controllers/payment.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createPaymentIntentSchema } from '../validators/payment.validator.js';

const router = Router();

// POST /api/payments/webhook — Stripe webhook receiver.
// MUST stay unauthenticated (Stripe signs the payload itself, verified inside
// the controller via the raw body + STRIPE_WEBHOOK_SECRET) and MUST be
// mounted with the raw body parser rather than express.json() — this is
// wired explicitly in app.js before the global JSON parser runs.
router.post('/webhook', handleStripeWebhook);

// Every route below requires an authenticated buyer.
router.use(protect);

// POST /api/payments/create-intent — exchange a client-side token for a charge/intent
router.post(
    '/create-intent',
    validate(createPaymentIntentSchema),
    createPaymentIntent
);

// GET /api/payments/me — the logged-in user's own payment/transaction history
router.get('/me', getMyPayments);

// GET /api/payments/:id — a single transaction's details (owner or admin only)
router.get('/:id', getPaymentById);

export default router;