// src/app.js
// Express application: middleware stack + route mounting.
// Implements the exact pipeline specified in the Backend Architecture Doc,
// section 3:
//
//   Incoming Request
//   -> 1. Security shields (Helmet, CORS, Express JSON parser)
//   -> 2. Rate limiter (login / password-reset routes — applied per-route
//         inside auth.routes.js, not globally, so it only throttles the
//         sensitive endpoints it targets)
//   -> 3. Request logger (Morgan)
//   -> 4. Authentication middleware (JWT verification -> req.user)
//   -> 5. Authorization / RBAC middleware (role check)
//   -> 6. Validation middleware (Zod payload check)
//   -> Controller logic
//   -> (on error) Centralized error handler
//
// Steps 4-6 are applied per-route inside each routes/*.js file (protect,
// restrictTo, validate), since different endpoints need different
// combinations — this file wires only the global, every-request layers.

import 'express-async-errors'; // must be required before any routes are defined,
// so every rejected promise in a controller is forwarded to next(err) automatically

import express, { raw, json, urlencoded } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';

import { corsOptions } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandlingMiddleware, notFoundHandler } from './middleware/errorHandler.middleware.js';
import { handleStripeWebhook } from './controllers/payment.controller.js';

const app = express();

// ---------------------------------------------------------------------------
// 0. Stripe webhook — MUST be registered before express.json(), since Stripe
//    signature verification requires the raw, unparsed request body. Every
//    other route in the app receives a parsed JSON body.
// ---------------------------------------------------------------------------
app.post(
    '/api/payments/webhook',
    raw({ type: 'application/json' }),
    handleStripeWebhook
);

// ---------------------------------------------------------------------------
// 1. Security shields
// ---------------------------------------------------------------------------

// Helmet — protective HTTP response headers against XSS, clickjacking, etc.
app.use(helmet());

// CORS — restrict which origins may call this API to the platform's own
// frontend domain(s), as configured in config/env.js.
app.use(cors(corsOptions));

// Express body parsers — JSON and urlencoded, with a sane size cap to blunt
// oversized-payload abuse before it reaches any controller.
app.use(json({ limit: '10kb' }));
app.use(urlencoded({ extended: true, limit: '10kb' }));

// Cookie parser — reads the httpOnly, sameSite refresh-token cookie used by
// the auth flow.
app.use(cookieParser());

// ---------------------------------------------------------------------------
// 2. Rate limiting is applied per-route (see auth.routes.js: authLimiter on
//    /login and /resend-verification, passwordResetLimiter on
//    /forgot-password) rather than globally here, so normal browsing traffic
//    is never throttled by a login-brute-force policy.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 3. Request logger
// ---------------------------------------------------------------------------
if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
} else {
    // Concise, production-safe combined-style logging.
    app.use(morgan('combined'));
}

// ---------------------------------------------------------------------------
// Health check — useful for load balancers / uptime monitors; deliberately
// outside the versioned /api surface and outside auth entirely.
// ---------------------------------------------------------------------------
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// ---------------------------------------------------------------------------
// 4-6. Authentication, authorization, and validation middleware are applied
//      per-route inside each routes/*.js file (protect, restrictTo,
//      validate), not globally, since access rules differ endpoint to
//      endpoint.
// ---------------------------------------------------------------------------

// Mount the full API surface under /api/*.
app.use('/api', apiRouter);

// ---------------------------------------------------------------------------
// 404 handler — any URL that doesn't match a defined route.
// Must come after all real routes and before the global error handler.
// ---------------------------------------------------------------------------
app.use(notFoundHandler);

// ---------------------------------------------------------------------------
// Centralized error handler — must be the LAST app.use() call. Express
// recognizes it as an error handler because it declares four parameters.
// Converts every thrown/forwarded error into the consistent
// { status, message } JSON shape and hides raw stack traces in production.
// ---------------------------------------------------------------------------
app.use(errorHandlingMiddleware);

export default app;
export const set = app.set.bind(app);