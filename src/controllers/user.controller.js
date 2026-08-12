import asyncHandler from 'express-async-handler';
import User from '../models/User.js';
import AppError from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/paginate.js';

/**
 * user.controller.js
 * -----------------------------------------------------------------------
 * Handles the user-profile module described in doc §2.2 — everything
 * except authentication itself (that lives in auth.controller.js).
 * Covers: self-service profile updates, password change, account
 * deletion, public profile lookup, and the admin/directory search list.
 * -----------------------------------------------------------------------
 */

// Only these fields may ever be touched by a self-service PATCH — role,
// status, isVerified, email, and password are intentionally excluded so a
// user can never privilege-escalate or silently change their own email
// through this route.
const UPDATABLE_SELF_FIELDS = ['username', 'bio', 'avatar'];

/**
 * PATCH /api/users/me
 * Updates the logged-in user's own profile fields via a partial $set.
 */
export const updateMe = asyncHandler(async (req, res) => {
    const updates = {};

    for (const field of UPDATABLE_SELF_FIELDS) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }

    if (Object.keys(updates).length === 0) {
        throw new AppError('No valid fields provided to update.', 400);
    }

    const updatedUser = await User.findByIdAndUpdate(
        req.user.id,
        { $set: updates },
        { new: true, runValidators: true }
    );

    if (!updatedUser) {
        throw new AppError('User not found.', 404);
    }

    res.status(200).json({
        status: 'success',
        data: { user: updatedUser },
    });
});

/**
 * PATCH /api/users/me/password
 * Verifies the current password via bcrypt, then hashes and saves the new one.
 */
export const updateMyPassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
        throw new AppError('currentPassword and newPassword are both required.', 400);
    }

    // password has `select: false` on the schema, so it must be explicitly requested
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
        throw new AppError('User not found.', 404);
    }

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
        throw new AppError('Current password is incorrect.', 401);
    }

    // Assigning triggers the pre('save') hook, which re-hashes the password
    user.password = newPassword;
    await user.save();

    res.status(200).json({
        status: 'success',
        message: 'Password updated successfully.',
    });
});

/**
 * DELETE /api/users/me
 * Deletes the logged-in user's account and clears their auth cookies.
 * Session/refresh-token cleanup for this user is owned by the auth
 * module (RefreshToken collection), which should be purged alongside
 * this call at the route/service level.
 */
export const deleteMe = asyncHandler(async (req, res) => {
    const deletedUser = await User.findByIdAndDelete(req.user.id);

    if (!deletedUser) {
        throw new AppError('User not found.', 404);
    }

    // Clear auth cookies client-side, mirroring the logout flow
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');

    res.status(200).json({
        status: 'success',
        message: 'Account deleted successfully.',
    });
});

/**
 * GET /api/users/:id
 * Returns a public profile (username, avatar, bio, follower count) while
 * hiding private fields (email, password, role, status).
 */
export const getUserById = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id)
        .select('username avatar bio createdAt')
        .populate('followerCount')
        .populate('followingCount');

    if (!user) {
        throw new AppError('User not found.', 404);
    }

    res.status(200).json({
        status: 'success',
        data: { user },
    });
});

/**
 * GET /api/users?search=&role=&page=&limit=
 * Powers directories and admin tables with regex search, role filtering,
 * and skip()/limit() pagination.
 */
export const listUsers = asyncHandler(async (req, res) => {
    const { search, role } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const filter = {};

    if (search) {
        const regex = new RegExp(search.trim(), 'i');
        filter.$or = [{ username: regex }, { email: regex }];
    }

    if (role) {
        const allowedRoles = ['user', 'moderator', 'admin'];
        if (!allowedRoles.includes(role)) {
            throw new AppError(`Invalid role filter. Must be one of: ${allowedRoles.join(', ')}.`, 400);
        }
        filter.role = role;
    }

    // Fetch limit + 1 to cheaply determine hasMore without a separate count query
    const users = await User.find(filter)
        .select('username email avatar role status isVerified createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean();

    res.status(200).json(buildPaginatedResponse(users, page, limit));
});