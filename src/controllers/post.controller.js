import asyncHandler from 'express-async-handler';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Like from '../models/Like.js';
import Category from '../models/Category.js';
import AppError from '../utils/AppError.js';
import { getPagination, buildPaginatedResponse } from '../utils/paginate.js';
import { getIO } from '../config/socket.js';

/**
 * post.controller.js
 * -----------------------------------------------------------------------
 * Handles the Post Management module (doc §2.3). Pure HTTP REST by
 * design: creation involves multipart file uploads, the feed needs to be
 * cacheable/crawlable, and users expect pull-to-refresh rather than
 * posts flashing in live. The single exception is the lightweight
 * Fan-Out signal (§2.9) emitted after a successful create — a lightweight
 * `feed_<authorId>` broadcast with zero extra database writes.
 * -----------------------------------------------------------------------
 */

/**
 * POST /api/posts
 * Creates and publishes a post. The author always comes from the JWT
 * (req.user), never from the request body, so a client can never author
 * a post on someone else's behalf.
 */
export const createPost = asyncHandler(async (req, res) => {
    const { title, content, category, tags, media } = req.body;

    if (!title || !content || !category) {
        throw new AppError('title, content, and category are required.', 400);
    }

    const categoryExists = await Category.exists({ _id: category });
    if (!categoryExists) {
        throw new AppError('The specified category does not exist.', 404);
    }

    const post = await Post.create({
        title,
        content,
        category,
        // media is expected to already be an array of secure Cloudinary URLs,
        // uploaded ahead of this call by the Multer/Cloudinary upload middleware.
        media: Array.isArray(media) ? media : [],
        tags: Array.isArray(tags) ? tags : [],
        author: req.user.id,
    });

    await post.populate('author', 'username avatar');

    // Celebrity Fan-Out fix (§2.9): no per-follower Notification writes here.
    // Just one lightweight broadcast to whoever is actively viewing this
    // author's feed room right now — everyone else gets it for free the
    // next time they pull GET /api/users/me/feed.
    try {
        getIO().to(`feed_${req.user.id}`).emit('feed_update_available', {
            authorId: req.user.id,
            postId: post._id,
        });
    } catch (err) {
        // Socket layer being unavailable must never fail an already-successful write.
    }

    res.status(201).json({
        status: 'success',
        data: { post },
    });
});

/**
 * GET /api/posts?search=&category=&tag=&author=&sort=&page=&limit=
 * Serves both the plain global feed and the filtered/search view from a
 * single route, since they share the same underlying query shape.
 */
export const getPosts = asyncHandler(async (req, res) => {
    const { search, category, tag, author, sort } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const filter = {};

    if (search) {
        filter.$text = { $search: search };
    }
    if (category) filter.category = category;
    if (tag) filter.tags = tag;
    if (author) filter.author = author;

    // Default sort is newest-first; "mostLiked" is the other supported mode.
    const sortMap = {
        newest: { createdAt: -1 },
        mostLiked: { likesCount: -1, createdAt: -1 },
    };
    const sortOrder = sortMap[sort] || sortMap.newest;

    const posts = await Post.find(filter)
        .populate('author', 'username avatar')
        .populate('category', 'name slug')
        .sort(sortOrder)
        .skip(skip)
        .limit(limit + 1)
        .lean();

    res.status(200).json(buildPaginatedResponse(posts, page, limit));
});

/**
 * GET /api/posts/:id
 * Returns full detail for one post: author, content, media, and the
 * top-level (non-reply) comments.
 */
export const getPostById = asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id)
        .populate('author', 'username avatar')
        .populate('category', 'name slug');

    if (!post) {
        throw new AppError('Post not found.', 404);
    }

    const topLevelComments = await Comment.find({ post: post._id, parentComment: null })
        .populate('author', 'username avatar')
        .sort({ createdAt: -1 })
        .limit(20);

    res.status(200).json({
        status: 'success',
        data: { post, comments: topLevelComments },
    });
});

/**
 * PATCH /api/posts/:id
 * Verifies the requester is the post's author before applying a partial
 * update to title, content, or tags.
 */
export const updatePost = asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id);

    if (!post) {
        throw new AppError('Post not found.', 404);
    }

    if (String(post.author) !== String(req.user.id)) {
        throw new AppError('You are not authorized to update this post.', 403);
    }

    const UPDATABLE_FIELDS = ['title', 'content', 'tags'];
    for (const field of UPDATABLE_FIELDS) {
        if (req.body[field] !== undefined) {
            post[field] = req.body[field];
        }
    }

    await post.save();

    res.status(200).json({
        status: 'success',
        data: { post },
    });
});

/**
 * DELETE /api/posts/:id
 * Verifies ownership (or admin), deletes the post, and cascade-deletes
 * its Comment and Like documents.
 */
export const deletePost = asyncHandler(async (req, res) => {
    const post = await Post.findById(req.params.id);

    if (!post) {
        throw new AppError('Post not found.', 404);
    }

    const isOwner = String(post.author) === String(req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (!isOwner && !isAdmin) {
        throw new AppError('You are not authorized to delete this post.', 403);
    }

    await Promise.all([
        Comment.deleteMany({ post: post._id }),
        Like.deleteMany({ post: post._id }),
        post.deleteOne(),
    ]);

    res.status(200).json({
        status: 'success',
        message: 'Post and its related comments/likes were deleted.',
    });
});

/**
 * GET /api/users/:userId/posts
 * Returns one user's own posts, separate from the global feed.
 */
export const getUserPosts = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);

    const posts = await Post.find({ author: req.params.userId })
        .populate('author', 'username avatar')
        .populate('category', 'name slug')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean();

    res.status(200).json(buildPaginatedResponse(posts, page, limit));
});