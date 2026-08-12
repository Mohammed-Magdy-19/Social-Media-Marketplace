import asyncHandler from 'express-async-handler';
import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import AppError from '../utils/AppError.js';
import { getIO } from '../config/socket.js';
import { createNotification } from '../services/notification.service.js';

/**
 * comment.controller.js
 * -----------------------------------------------------------------------
 * Handles comments and threaded replies (doc §2.5). Follows the Hybrid
 * Approach: every write stays on HTTP REST for clean auth/validation/
 * status codes, and each successful write additionally broadcasts a
 * Socket.io event to everyone currently viewing that post's room
 * (`post_<postId>`), joined client-side via `join_post_room`.
 * -----------------------------------------------------------------------
 */

// Broadcasts to the post room; swallows socket-layer failures so a
// successful database write is never rolled back or reported as an error
// just because no one happened to be connected.
const broadcastToPostRoom = (postId, event, payload) => {
    try {
        getIO().to(`post_${postId}`).emit(event, payload);
    } catch (err) {
        // Socket.io not initialized — safe to ignore, see rationale above.
    }
};

/**
 * POST /api/posts/:postId/comments
 * Saves a new top-level comment linked to the post and author, and
 * increments the post's commentsCount by 1.
 */
export const createComment = asyncHandler(async (req, res) => {
    const { text } = req.body;
    const { postId } = req.params;

    if (!text) {
        throw new AppError('Comment text is required.', 400);
    }

    const post = await Post.findById(postId);
    if (!post) {
        throw new AppError('Post not found.', 404);
    }

    let comment = await Comment.create({
        post: postId,
        author: req.user.id,
        text,
    });

    await Promise.all([
        Post.findByIdAndUpdate(postId, { $inc: { commentsCount: 1 } }),
        comment.populate('author', 'username avatar'),
    ]);

    broadcastToPostRoom(postId, 'new_comment', comment);

    // Personal notification to the post's author (Hybrid Approach, §5.1)
    await createNotification({
        recipient: post.author,
        sender: req.user.id,
        type: 'COMMENT',
        targetId: comment._id,
    });

    res.status(201).json({
        status: 'success',
        data: { comment },
    });
});

/**
 * GET /api/posts/:postId/comments
 * Returns all top-level comments for a post, populated with each
 * author's name and avatar. Replies are fetched separately via nested
 * requests to keep the initial payload light.
 */
export const getPostComments = asyncHandler(async (req, res) => {
    const { postId } = req.params;

    const comments = await Comment.find({ post: postId, parentComment: null })
        .populate('author', 'username avatar')
        .sort({ createdAt: -1 });

    res.status(200).json({
        status: 'success',
        results: comments.length,
        data: { comments },
    });
});

/**
 * GET /api/comments/:id
 * Returns one comment by ID directly — useful for deep-linking from a
 * notification.
 */
export const getCommentById = asyncHandler(async (req, res) => {
    const comment = await Comment.findById(req.params.id).populate('author', 'username avatar');

    if (!comment) {
        throw new AppError('Comment not found.', 404);
    }

    res.status(200).json({
        status: 'success',
        data: { comment },
    });
});

/**
 * PATCH /api/comments/:id
 * Verifies the requester is the comment's author, then updates the text.
 */
export const updateComment = asyncHandler(async (req, res) => {
    const { text } = req.body;

    if (!text) {
        throw new AppError('Comment text is required.', 400);
    }

    const comment = await Comment.findById(req.params.id);

    if (!comment) {
        throw new AppError('Comment not found.', 404);
    }

    if (String(comment.author) !== String(req.user.id)) {
        throw new AppError('You are not authorized to edit this comment.', 403);
    }

    comment.text = text;
    await comment.save();
    await comment.populate('author', 'username avatar');

    broadcastToPostRoom(comment.post, 'comment_updated', comment);

    res.status(200).json({
        status: 'success',
        data: { comment },
    });
});

/**
 * DELETE /api/comments/:id
 * Verifies the requester is the author, the post owner, or an admin;
 * deletes the comment, decrements commentsCount, and cascade-deletes
 * its replies.
 */
export const deleteComment = asyncHandler(async (req, res) => {
    const comment = await Comment.findById(req.params.id);

    if (!comment) {
        throw new AppError('Comment not found.', 404);
    }

    const post = await Post.findById(comment.post);
    if (!post) {
        throw new AppError('The parent post for this comment no longer exists.', 404);
    }

    const isCommentAuthor = String(comment.author) === String(req.user.id);
    const isPostOwner = String(post.author) === String(req.user.id);
    const isAdmin = req.user.role === 'admin';

    if (!isCommentAuthor && !isPostOwner && !isAdmin) {
        throw new AppError('You are not authorized to delete this comment.', 403);
    }

    // Cascade-delete any threaded replies to this comment
    const replies = await Comment.find({ parentComment: comment._id }).select('_id');
    const replyIds = replies.map((r) => r._id);

    await Comment.deleteMany({ _id: { $in: [comment._id, ...replyIds] } });

    const deletedCount = 1 + replyIds.length;
    await Post.findByIdAndUpdate(comment.post, { $inc: { commentsCount: -deletedCount } });

    broadcastToPostRoom(comment.post, 'comment_deleted', {
        commentId: comment._id,
        replyIds,
    });

    res.status(200).json({
        status: 'success',
        message: `Comment and ${replyIds.length} repl${replyIds.length === 1 ? 'y' : 'ies'} deleted.`,
    });
});

/**
 * POST /api/comments/:id/replies
 * Creates a new comment document with parentComment set to the original
 * comment's ID, forming a threaded reply.
 */
export const createReply = asyncHandler(async (req, res) => {
    const { text } = req.body;
    const { id: parentCommentId } = req.params;

    if (!text) {
        throw new AppError('Reply text is required.', 400);
    }

    const parentComment = await Comment.findById(parentCommentId);
    if (!parentComment) {
        throw new AppError('Parent comment not found.', 404);
    }

    let reply = await Comment.create({
        post: parentComment.post,
        author: req.user.id,
        text,
        parentComment: parentComment._id,
    });

    await Promise.all([
        Post.findByIdAndUpdate(parentComment.post, { $inc: { commentsCount: 1 } }),
        reply.populate('author', 'username avatar'),
    ]);

    broadcastToPostRoom(parentComment.post, 'reply_created', reply);

    // Notify the original commenter that someone replied to them
    await createNotification({
        recipient: parentComment.author,
        sender: req.user.id,
        type: 'COMMENT',
        targetId: reply._id,
    });

    res.status(201).json({
        status: 'success',
        data: { reply },
    });
});