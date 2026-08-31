import asyncHandler from 'express-async-handler';
import SavedPost from '../models/SavedPost.js';
import Post from '../models/Post.js';
import AppError from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/paginate.js';

/**
 * savedPost.controller.js
 * -----------------------------------------------------------------------
 * Handles bookmarking posts (doc §2.6). Pure HTTP REST throughout — the
 * glossary (§5.1) explicitly excludes saved posts from the Hybrid
 * Approach, since there is no other user who needs a live update when
 * you bookmark something private to you.
 * -----------------------------------------------------------------------
 */

/**
 * POST /api/posts/:id/save
 * Creates a SavedPost entry pairing the user and post, duplicate-proofed
 * by the compound index.
 */
export const savePost = asyncHandler(async (req, res) => {
    const { id: postId } = req.params;

    const post = await Post.exists({ _id: postId });
    if (!post) {
        throw new AppError('Post not found.', 404);
    }

    const alreadySaved = await SavedPost.findOne({ user: req.user.id, post: postId });
    if (alreadySaved) {
        throw new AppError('You have already saved this post.', 409);
    }

    const savedPost = await SavedPost.create({ user: req.user.id, post: postId });

    res.status(201).json({
        status: 'success',
        data: { savedPost },
    });
});

/**
 * DELETE /api/posts/:id/save
 * Removes the bookmark mapping.
 */
export const unsavePost = asyncHandler(async (req, res) => {
    const { id: postId } = req.params;

    const savedPost = await SavedPost.findOneAndDelete({ user: req.user.id, post: postId });

    if (!savedPost) {
        throw new AppError('You have not saved this post.', 404);
    }

    res.status(200).json({
        status: 'success',
        message: 'Post removed from your saved list.',
    });
});

/**
 * GET /api/users/me/saved-posts
 * Returns the current user's bookmarked posts, populated with the full
 * post document.
 */
export const getSavedPosts = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);

    const savedPosts = await SavedPost.find({ user: req.user.id })
        .populate({
            path: 'post',
            populate: [
                { path: 'author', select: 'username avatar' },
                { path: 'category', select: 'name slug' },
            ],
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean();

    res.status(200).json(buildPaginatedResponse(savedPosts, page, limit));
});