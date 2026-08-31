import asyncHandler from 'express-async-handler';
import crypto from "crypto";
import User from "../models/User.js";
import RefreshToken from "../models/RefreshToken.js";

import PasswordResetToken from "../models/PasswordResetToken.js";
import AppError from "../utils/AppError.js";
import { signToken } from "../utils/generateToken.js";
import {
    sendWelcomeEmail,
    sendPasswordResetEmail,
} from "../services/email.service.js";
import { env } from "../config/env.js";

/**
 * auth.controller.js
 * ---------------------------------------------------------------------
 * Implements every route under /api/auth/* (architecture doc §2.1).
 *
 * NOTE: every export here is a plain async function that THROWS on
 * failure rather than catching errors itself. Per the project's stated
 * convention, each route wraps its controller in express-async-handler
 * at the router level (e.g. `router.post("/login", asyncHandler(login))`),
 * which forwards any rejected promise straight to the centralized error
 * handler — so no try/catch is needed in this file.
 *
 * Token strategy:
 *   - Access token: short-lived JWT (env.jwtExpiresIn), returned in the
 *     JSON response body. Sent by the client as `Authorization: Bearer`.
 *   - Refresh token: long-lived, opaque random string (NOT a JWT) that
 *     is persisted in the RefreshToken collection so it can be looked
 *     up and revoked server-side on logout/ban/password-reset. Set as
 *     an httpOnly, secure, sameSite cookie for web clients AND returned
 *     in the response body for clients that manage tokens manually
 *     (e.g. mobile apps), matching auth.validator.js's expectation that
 *     /refresh-token and /logout receive `refreshToken` in req.body.
 *   - Session hint: a second, NON-httpOnly cookie (`hasSession`) mirrors
 *     whether a refresh token is currently issued, WITHOUT carrying any
 *     sensitive value itself — it's just "1" or absent. It exists
 *     purely so the frontend can check `document.cookie` on boot and
 *     skip calling /refresh-token entirely when it's absent, instead of
 *     firing a network request that is guaranteed to 401 for every
 *     anonymous visitor. It carries no security weight on its own —
 *     the real gate is still the httpOnly refresh token; this cookie is
 *     purely a UX/telemetry-noise optimization and must always be kept
 *     in sync with the real cookie's lifecycle (set together, cleared
 *     together) rather than trusted as proof of anything by itself.
 * ---------------------------------------------------------------------
 */

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RESET_TOKEN_BYTES = 32;

const isProduction = env.nodeEnv === "production";

// Shared cookie options for the refresh token. `secure` only forces
// HTTPS-only transmission in production so local HTTP dev still works.
const refreshCookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: "strict",
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: "/api/auth", // only sent back to auth endpoints that need it
};

// The hint cookie deliberately uses `path: "/"` (unlike the refresh
// cookie above) — the frontend needs to read it via document.cookie
// from anywhere in the app on boot, not just when calling /api/auth/*.
// httpOnly is deliberately false here; that's the entire point of this
// cookie's existence.
const sessionHintCookieOptions = {
    httpOnly: false,
    secure: isProduction,
    sameSite: "strict",
    maxAge: REFRESH_TOKEN_TTL_MS,
    path: "/",
};

/** Strips sensitive/internal fields before a user document goes in a response. */
const toPublicUser = (user) => ({
    id: user._id,
    username: user.username,
    email: user.email,
    role: user.role,
    status: user.status,
    avatar: user.avatar,
    bio: user.bio,
    isVerified: user.isVerified,
    createdAt: user.createdAt,
});

/** Generates a cryptographically random opaque token (hex string). */
const generateRandomToken = (bytes) => crypto.randomBytes(bytes).toString("hex");

/**
 * Clears both the refresh token cookie and its readable session-hint
 * companion in one place, so the two never drift out of sync. Called
 * on logout and whenever a refresh attempt is rejected.
 */
const clearSessionCookies = (res) => {
    res.clearCookie("refreshToken", { path: "/api/auth" });
    res.clearCookie("hasSession", { path: "/" });
};

/**
 * Issues a fresh access + refresh token pair for a user, persists the
 * refresh token, and attaches it to the response as an httpOnly cookie
 * — plus the readable `hasSession` hint cookie alongside it, on the
 * same lifetime, so the frontend can distinguish "no session, don't
 * even try to refresh" from "a session may exist, worth attempting"
 * without needing to make a network call to find out.
 * Returns both tokens so the controller can also include them in the
 * JSON body.
 */
const issueTokens = async (res, user) => {
    const accessToken = signToken(user._id.toString());

    const refreshTokenValue = generateRandomToken(40);
    await RefreshToken.create({
        token: refreshTokenValue,
        user: user._id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });

    res.cookie("refreshToken", refreshTokenValue, refreshCookieOptions);
    res.cookie("hasSession", "1", sessionHintCookieOptions);

    return { accessToken, refreshToken: refreshTokenValue };
};

/**
 * POST /api/auth/register
 * Creates a new account, hashes the password (via the User pre-save
 * hook), saves an unverified user, and triggers an email-verification
 * token + email.
 */
export const register = asyncHandler(async (req, res) => {
    const { username, email, password } = req.body;

    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
        const field = existingUser.email === email ? "Email" : "Username";
        throw new AppError(`${field} is already in use.`, 409);
    }

    const user = await User.create({ username, email, password });

    // Best-effort: email outage must not fail registration.
    try {
        await sendWelcomeEmail(user);
    } catch (err) {
        console.error("Failed to send welcome email:", err.message);
    }

    // Issue a full session immediately so the client can auto-login after
    // registration without requiring a separate /login round-trip.
    const { accessToken, refreshToken } = await issueTokens(res, user);

    res.status(201).json({
        status: "success",
        message: "Account created! Welcome aboard 🎉",
        data: {
            user: toPublicUser(user),
            accessToken,
            refreshToken,
        },
    });
});



/**
 * POST /api/auth/login
 * Authenticates an existing user and issues an access + refresh token pair.
 */
export const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.comparePassword(password))) {
        throw new AppError("Incorrect email or password.", 401);
    }

    if (user.status === "banned") {
        throw new AppError("This account has been banned.", 403);
    }
    if (user.status === "suspended") {
        throw new AppError("This account is currently suspended.", 403);
    }

    const { accessToken, refreshToken } = await issueTokens(res, user);

    res.status(200).json({
        status: "success",
        data: {
            user: toPublicUser(user),
            accessToken,
            refreshToken,
        },
    });
});

/**
 * POST /api/auth/refresh-token
 * Silently renews a session: validates the refresh token against the
 * RefreshToken collection, rotates it (delete old, issue new — limits
 * the blast radius if a refresh token is ever stolen), and issues a
 * fresh access token.
 *
 * Every rejection branch below clears both the refresh cookie and its
 * `hasSession` hint before throwing, so a client that already made it
 * this far (i.e. the hint said "try") doesn't keep re-attempting a
 * refresh that's guaranteed to keep failing on a future boot.
 */
export const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingToken = req.body.refreshToken || req.cookies?.refreshToken;
    if (!incomingToken) {
        // No hint cookie should exist in this case either (nothing to
        // clear), but clearing is a harmless no-op if it's already
        // absent — cheap insurance against the two ever drifting.
        clearSessionCookies(res);
        throw new AppError("Refresh token is required.", 401);
    }

    const storedToken = await RefreshToken.findOne({ token: incomingToken });
    if (!storedToken || storedToken.expiresAt < new Date()) {
        clearSessionCookies(res);
        throw new AppError("Invalid or expired refresh token. Please log in again.", 401);
    }

    const user = await User.findById(storedToken.user);
    if (!user) {
        clearSessionCookies(res);
        throw new AppError("The user belonging to this token no longer exists.", 401);
    }
    if (user.status === "banned" || user.status === "suspended") {
        clearSessionCookies(res);
        throw new AppError("This account no longer has access.", 403);
    }

    // Rotate: invalidate the used refresh token before issuing a new pair.
    await storedToken.deleteOne();
    const { accessToken, refreshToken } = await issueTokens(res, user);

    res.status(200).json({
        status: "success",
        data: { accessToken, refreshToken },
    });
});

/**
 * POST /api/auth/logout
 * Invalidates the active refresh token in MongoDB and clears both the
 * refresh cookie and its readable session-hint companion.
 */
export const logout = asyncHandler(async (req, res) => {
    const incomingToken = req.body.refreshToken || req.cookies?.refreshToken;

    if (incomingToken) {
        await RefreshToken.deleteOne({ token: incomingToken });
    }

    clearSessionCookies(res);

    res.status(200).json({
        status: "success",
        message: "Logged out successfully.",
    });
});

/**
 * POST /api/auth/forgot-password
 * Looks up the user's email, generates a PasswordResetToken (10 min TTL,
 * per the schema default), and emails a reset link.
 *
 * Always responds with the same generic message whether or not the email
 * exists, so this endpoint can't be used to enumerate registered accounts.
 */
export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const genericMessage =
        "If an account with that email exists, a password reset link has been sent.";

    const user = await User.findOne({ email });
    if (!user) {
        return res.status(200).json({ status: "success", message: genericMessage });
    }

    const resetToken = generateRandomToken(RESET_TOKEN_BYTES);
    await PasswordResetToken.create({ token: resetToken, user: user._id });

    await sendPasswordResetEmail(user, resetToken);

    res.status(200).json({ status: "success", message: genericMessage });
});

/**
 * POST /api/auth/reset-password/:token
 * Validates the token, hashes the new password (via the User pre-save
 * hook), updates the User document, deletes the used token, and revokes
 * every existing refresh token so all other sessions are logged out.
 *
 * Also clears this browser's own session cookies, if any — the backend
 * has just revoked every RefreshToken row for this user, so any cookie
 * this specific browser happens to be holding is now dead weight; there
 * is no reason to leave the (now-invalid) hasSession hint telling this
 * browser a refresh is worth attempting on its next boot.
 */
export const resetPassword = asyncHandler(async (req, res) => {
    const { token } = req.params;
    const { password } = req.body;

    const resetTokenDoc = await PasswordResetToken.findOne({ token });
    if (!resetTokenDoc || resetTokenDoc.expiresAt < new Date()) {
        throw new AppError("Invalid or expired password reset token.", 400);
    }

    const user = await User.findById(resetTokenDoc.user);
    if (!user) {
        throw new AppError("The user belonging to this token no longer exists.", 404);
    }

    user.password = password; // re-hashed by the pre-save hook
    await user.save();

    await resetTokenDoc.deleteOne();
    // Force re-login everywhere — a leaked password shouldn't leave old
    // sessions valid after the owner resets it.
    await RefreshToken.deleteMany({ user: user._id });
    clearSessionCookies(res);

    res.status(200).json({
        status: "success",
        message: "Password reset successfully. Please log in with your new password.",
    });
});

/**
 * POST /api/auth/verify-email/:token
 * Validates the token against EmailVerificationToken; on success sets
 * isVerified to true and removes the token.
 */
export const verifyEmail = asyncHandler(async (req, res) => {
    const { token } = req.params;

    const verificationTokenDoc = await EmailVerificationToken.findOne({ token });
    if (!verificationTokenDoc || verificationTokenDoc.expiresAt < new Date()) {
        throw new AppError("Invalid or expired verification link.", 400);
    }

    const user = await User.findById(verificationTokenDoc.user);
    if (!user) {
        throw new AppError("The user belonging to this token no longer exists.", 404);
    }

    user.isVerified = true;
    await user.save();
    await verificationTokenDoc.deleteOne();

    res.status(200).json({
        status: "success",
        message: "Email verified successfully.",
    });
});

/**
 * POST /api/auth/resend-verification
 * Finds the unverified user, discards old tokens, and issues + emails a
 * fresh verification token. Responds generically regardless of outcome
 * to avoid leaking which emails are registered.
 */
export const resendVerification = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const genericMessage =
        "If an unverified account with that email exists, a new verification link has been sent.";

    const user = await User.findOne({ email });
    if (!user || user.isVerified) {
        return res.status(200).json({ status: "success", message: genericMessage });
    }

    await EmailVerificationToken.deleteMany({ user: user._id });

    const verificationToken = generateRandomToken(VERIFICATION_TOKEN_BYTES);
    await EmailVerificationToken.create({
        token: verificationToken,
        user: user._id,
    });

    await sendVerificationEmail(user, verificationToken);

    res.status(200).json({ status: "success", message: genericMessage });
});

/**
 * GET /api/auth/me
 * Requires `protect` middleware to have already run and attached
 * req.user. Returns the logged-in user's own profile (password excluded).
 */
export const getMe = asyncHandler(async (req, res) => {
    res.status(200).json({
        status: "success",
        data: { user: toPublicUser(req.user) },
    });
});