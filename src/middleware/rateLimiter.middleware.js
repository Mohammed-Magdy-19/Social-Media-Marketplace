import rateLimit from "express-rate-limit";
import AppError from "../utils/appError.js";
import { env } from "../config/env.js";

/**
 * Traffic Control — express-rate-limit
 * ---------------------------------------------------------------------
 * Throttles brute-force-prone routes per IP/time-window. Each limiter
 * below returns a clean, consistent JSON error via the shared
 * AppError -> centralized error handler pipeline, rather than
 * express-rate-limit's default plain-text response.
 *
 * Window/max values fall back to sensible defaults but can be tuned
 * per-environment via .env without touching this file:
 *   AUTH_RATE_LIMIT_WINDOW_MS, AUTH_RATE_LIMIT_MAX
 *   PASSWORD_RESET_RATE_LIMIT_WINDOW_MS, PASSWORD_RESET_RATE_LIMIT_MAX
 *   API_RATE_LIMIT_WINDOW_MS, API_RATE_LIMIT_MAX
 */

// Shared handler: forwards a structured 429 through the centralized
// error handler instead of express-rate-limit's default plain response.
const rateLimitHandler = (message) => (req, res, next) => {
    next(new AppError(message, 429));
};

/**
 * authLimiter — POST /api/auth/login, POST /api/auth/register
 * Tight window to slow credential-stuffing / brute-force login attempts.
 */
export const authLimiter = rateLimit({
    windowMs: Number(env.authRateLimitWindowMs) || 15 * 60 * 1000, // 15 min
    max: Number(env.authRateLimitMax) || 10,
    standardHeaders: true, // return RateLimit-* headers
    legacyHeaders: false, // disable deprecated X-RateLimit-* headers
    handler: rateLimitHandler(
        "Too many login/registration attempts. Please try again in a few minutes."
    ),
});

/**
 * passwordResetLimiter — POST /api/auth/forgot-password, /resend-verification
 * Prevents email-bombing a target inbox with reset/verification links.
 */
export const passwordResetLimiter = rateLimit({
    windowMs: Number(env.passwordResetRateLimitWindowMs) || 60 * 60 * 1000, // 1 hr
    max: Number(env.passwordResetRateLimitMax) || 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler(
        "Too many password reset requests. Please try again later."
    ),
});

/**
 * generalApiLimiter — mounted globally in app.js as a baseline shield
 * against scraping/DoS across the whole API surface.
 */
export const generalApiLimiter = rateLimit({
    windowMs: Number(env.apiRateLimitWindowMs) || 15 * 60 * 1000, // 15 min
    max: Number(env.apiRateLimitMax) || 300,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler("Too many requests. Please slow down and try again shortly."),
});

/**
 * reportLimiter — POST /api/reports
 * Stops a single account from mass-flagging content to abuse the
 * moderation queue.
 */
export const reportLimiter = rateLimit({
    windowMs: Number(env.reportRateLimitWindowMs) || 60 * 60 * 1000, // 1 hr
    max: Number(env.reportRateLimitMax) || 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: rateLimitHandler("Too many reports submitted. Please try again later."),
});