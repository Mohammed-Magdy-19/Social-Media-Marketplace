import asyncHandler from 'express-async-handler';
import Follow from '../models/Follow.js';
import User from '../models/User.js';
import Post from '../models/Post.js';
import AppError from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/paginate.js';
import { createNotification } from '../services/notification.service.js';

/**
 * follow.controller.js
 * -----------------------------------------------------------------------
 * Handles the Follow System (doc §2.7): follow/unfollow, followers/
 * following lists, and the personalized home feed. The feed is computed
 * dynamically on demand (the "Pull" half of the Celebrity Fan-Out fix,
 * §2.9) via the compound index on Post({ author: 1, createdAt: -1 }) —
 * no per-follower documents are ever written here.
 * -----------------------------------------------------------------------
 */

/**
 * POST /api/users/:id/follow
 * Validates the user isn't following themself, then writes a Follow
 * document (duplicate-proofed by the unique compound index) and a
 * corresponding Notification.
 */
export const followUser = asyncHandler(async (req, res) => {
    const { id: targetUserId } = req.params;

    if (String(targetUserId) === String(req.user.id)) {
        throw new AppError('You cannot follow yourself.', 400);
    }

    const targetUser = await User.exists({ _id: targetUserId });
    if (!targetUser) {
        throw new AppError('User not found.', 404);
    }

    const alreadyFollowing = await Follow.findOne({
        follower: req.user.id,
        following: targetUserId,
    });
    if (alreadyFollowing) {
        throw new AppError('You are already following this user.', 409);
    }

    let follow;
    try {
        follow = await Follow.create({ follower: req.user.id, following: targetUserId });
    } catch (err) {
        // Race-condition fallback for the unique compound index.
        if (err.code === 11000) {
            throw new AppError('You are already following this user.', 409);
        }
        throw err;
    }

    await createNotification({
        recipient: targetUserId,
        sender: req.user.id,
        type: 'FOLLOW',
        targetId: req.user.id,
    });

    res.status(201).json({
        status: 'success',
        data: { follow },
    });
});

/**
 * DELETE /api/users/:id/follow
 * Removes the matching Follow document.
 */
export const unfollowUser = asyncHandler(async (req, res) => {
    const { id: targetUserId } = req.params;

    const follow = await Follow.findOneAndDelete({
        follower: req.user.id,
        following: targetUserId,
    });

    if (!follow) {
        throw new AppError('You are not following this user.', 404);
    }

    res.status(200).json({
        status: 'success',
        message: 'Unfollowed successfully.',
    });
});

/**
 * GET /api/users/:id/followers
 * Lists everyone following the target user, populated with each
 * follower's profile.
 */
export const getFollowers = asyncHandler(async (req, res) => {
    const { id: targetUserId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const followers = await Follow.find({ following: targetUserId })
        .populate('follower', 'username avatar bio')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean();

    res.status(200).json(buildPaginatedResponse(followers, page, limit));
});

/**
 * GET /api/users/:id/following
 * Lists everyone the target user follows, populated with each followed
 * user's profile.
 */
export const getFollowing = asyncHandler(async (req, res) => {
    const { id: targetUserId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const following = await Follow.find({ follower: targetUserId })
        .populate('following', 'username avatar bio')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean();

    res.status(200).json(buildPaginatedResponse(following, page, limit));
});

/**
 * GET /api/users/me/feed
 * Builds the personalized home timeline in two steps: (1) collect the
 * IDs the user follows, (2) query Post.find({ author: { $in } }) sorted
 * newest-first with pagination — leaning on the compound index
 * { author: 1, status: 1, createdAt: -1 } for performance at scale (§2.9).
 */
export const getMyFeed = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);

    const followedDocs = await Follow.find({ follower: req.user.id }).select('following').lean();
    const followingIds = followedDocs.map((doc) => doc.following);

    if (followingIds.length === 0) {
        // Nothing to show yet — return an empty, well-formed paginated response
        // instead of an error, since "follow no one yet" is a normal state.
        return res.status(200).json(buildPaginatedResponse([], page, limit));
    }

    // status: 'active' is required to leverage the compound index
    // { author: 1, status: 1, createdAt: -1 } defined on Post.js and to
    // exclude hidden/flagged posts from the public feed.
    const posts = await Post.find({ author: { $in: followingIds }, status: 'active' })
        .populate('author', 'username avatar')
        .populate('category', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean();

    res.status(200).json(buildPaginatedResponse(posts, page, limit));
});