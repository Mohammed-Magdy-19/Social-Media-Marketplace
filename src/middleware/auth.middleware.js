import asyncHandler from 'express-async-handler';
import { verifyToken } from "../utils/generateToken.js";
import AppError from "../utils/AppError.js";
import User from "../models/User.js";

/**
 * protect()
 * ---------------------------------------------------------------------
 * Authentication gate applied to every protected route across the API.
 *
 * Flow:
 *  1. Extract the JWT from the `Authorization: Bearer <token>` header
 *     (falls back to an httpOnly `accessToken` cookie if present, so the
 *     same middleware works whether the frontend stores the access
 *     token in memory + header, or relies purely on cookies).
 *  2. Verify the token's signature/expiry via generateToken.js.
 *  3. Load the matching user from MongoDB (password excluded by the
 *     schema's `select: false`) and confirm the account still exists
 *     and is not banned/suspended.
 *  4. Attach the user document to req.user for every downstream handler.
 *
 * On any failure the request is stopped with 401 Unauthorized before
 * it ever reaches a controller.
 *
 * express-async-handler wraps the whole function so any rejected promise
 * (including a thrown JsonWebTokenError/TokenExpiredError from
 * verifyToken, or a Mongoose error from User.findById) is forwarded to
 * next(err) automatically — no manual try/catch needed. JWT-specific
 * errors are still translated into clean 401s via the dedicated
 * catch-like branches below, since those two error shapes need a
 * friendlier message than the generic error handler would produce.
 */
export const protect = asyncHandler(async (req, res, next) => {
    let token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    } else if (req.cookies?.accessToken) {
        token = req.cookies.accessToken;
    }

    if (!token) {
        return next(
            new AppError("You are not logged in. Please log in to get access.", 401)
        );
    }

    const decoded = verifyToken(token);

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
        return next(
            new AppError("The user belonging to this token no longer exists.", 401)
        );
    }

    if (currentUser.status === "banned") {
        return next(
            new AppError("This account has been banned. Access denied.", 403)
        );
    }

    if (currentUser.status === "suspended") {
        return next(
            new AppError("This account is currently suspended.", 403)
        );
    }

    // Attach the authenticated user to the request for all downstream
    // middleware/controllers (restrictTo, ownership checks, etc.).
    req.user = currentUser;
    next();
});

/**
 * optionalAuth()
 * ---------------------------------------------------------------------
 * Non-blocking variant of protect(). Tries to authenticate the request
 * using the same Bearer / cookie flow, but if no token is present or the
 * token is invalid, it simply calls next() without setting req.user.
 *
 * Use on public GET routes that can optionally personalize the response
 * when a valid user is identified (e.g. attaching isLiked / isSaved
 * flags to post responses).
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
    let token;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
        token = authHeader.split(" ")[1];
    } else if (req.cookies?.accessToken) {
        token = req.cookies.accessToken;
    }

    if (!token) {
        return next();
    }

    try {
        const decoded = verifyToken(token);
        const currentUser = await User.findById(decoded.id);
        if (currentUser && currentUser.status !== "banned" && currentUser.status !== "suspended") {
            req.user = currentUser;
        }
    } catch {
        // Token invalid/expired — continue as unauthenticated
    }

    next();
});