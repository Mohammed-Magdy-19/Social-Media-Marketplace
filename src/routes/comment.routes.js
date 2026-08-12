// src/routes/comment.routes.js
// Standalone comment routes — /api/comments/*
// (Creation and listing under a post live in post.routes.js as nested
// routes; this file covers direct-by-id operations and threaded replies —
// see Backend Architecture Doc, section 2.5.)
//
// Protocol notes: PATCH/DELETE and reply-creation are Hybrid — REST performs
// the ownership-checked write, and the controller/service layer emits the
// matching Socket.io event (comment_updated, comment_deleted, reply_created)
// to the post's room. GET by id is pure HTTP REST.

import { Router } from 'express';

import { getCommentById, updateComment, deleteComment, createReply } from '../controllers/comment.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { updateCommentSchema, createCommentSchema } from '../validators/comment.validator.js';

const router = Router();

// GET /api/comments/:id — single comment lookup (e.g. deep-linking from a notification)
router.get('/:id', getCommentById);

// PATCH /api/comments/:id — author-only text update (Hybrid: + comment_updated broadcast)
router.patch('/:id', protect, validate(updateCommentSchema), updateComment);

// DELETE /api/comments/:id — author/post-owner/admin delete, cascades replies
// (Hybrid: + comment_deleted broadcast)
router.delete('/:id', protect, deleteComment);

// POST /api/comments/:id/replies — threaded reply (parentComment = this comment's id)
// (Hybrid: + reply_created broadcast)
router.post(
    '/:id/replies',
    protect,
    validate(createCommentSchema),
    createReply
);

export default router;