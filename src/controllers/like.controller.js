import asyncHandler from 'express-async-handler';
import Like from '../models/Like.js';
import Post from '../models/Post.js';
import AppError from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/paginate.js';
import { getIO } from '../config/socket.js';
import { createNotification } from '../services/notification.service.js';

/**
 * like.controller.js
 * -----------------------------------------------------------------------
 * Handles like/unlike on posts and the "liked by" list (doc §2.6).
 * Duplicate likes are blocked at the database layer by Like's unique
 * compound index ({ user: 1, post: 1 }) — this controller still does a
 * friendly pre-check so a repeat click returns a clean 409 instead of a
 * raw Mongo duplicate-key error.
 * -----------------------------------------------------------------------
 */

/**
 * POST /api/posts/:id/like
 * Creates a Like document and increments likesCount on the post.
 */
export const likePost = asyncHandler(async (req, res) => {
    const { id: postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
        throw new AppError('Post not found.', 404);
    }

    const alreadyLiked = await Like.findOne({ user: req.user.id, post: postId });
    if (alreadyLiked) {
        throw new AppError('You have already liked this post.', 409);
    }

    let like;
    try {
        like = await Like.create({ user: req.user.id, post: postId });
    } catch (err) {
        // Race-condition fallback: the unique compound index rejected a
        // near-simultaneous duplicate insert that slipped past the check above.
        if (err.code === 11000) {
            throw new AppError('You have already liked this post.', 409);
        }
        throw err;
    }

    await Post.findByIdAndUpdate(postId, { $inc: { likesCount: 1 } });

    // Hybrid Approach (§5.1): push a live update to anyone viewing the post
    try {
        getIO().to(`post_${postId}`).emit('post_liked', {
            postId,
            userId: req.user.id,
        });
    } catch (err) {
        // Socket.io not initialized — safe to ignore.
    }

    await createNotification({
        recipient: post.author,
        sender: req.user.id,
        type: 'LIKE',
        targetId: postId,
    });

    res.status(201).json({
        status: 'success',
        data: { like },
    });
});

/**
 * DELETE /api/posts/:id/like
 * Deletes the user's Like document and decrements likesCount.
 */
export const unlikePost = asyncHandler(async (req, res) => {
    const { id: postId } = req.params;

    const like = await Like.findOneAndDelete({ user: req.user.id, post: postId });

    if (!like) {
        throw new AppError('You have not liked this post.', 404);
    }

    await Post.findByIdAndUpdate(postId, { $inc: { likesCount: -1 } });

    try {
        getIO().to(`post_${postId}`).emit('post_unliked', {
            postId,
            userId: req.user.id,
        });
    } catch (err) {
        // Socket.io not initialized — safe to ignore.
    }

    res.status(200).json({
        status: 'success',
        message: 'Post unliked successfully.',
    });
});

/**
 * GET /api/posts/:id/likes
 * Returns the list of users who liked a post, populated with
 * name/username/avatar, for a "liked by" modal.
 */
export const getPostLikers = asyncHandler(async (req, res) => {
    const { id: postId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const likes = await Like.find({ post: postId })
        .populate('user', 'username avatar')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean();

    res.status(200).json(buildPaginatedResponse(likes, page, limit));
});