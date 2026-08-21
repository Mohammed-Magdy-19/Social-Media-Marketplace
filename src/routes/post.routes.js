// src/routes/post.routes.js
// Post management routes — /api/posts/*
// Also hosts the comment, like, and save sub-routes nested under a post id
// (see Backend Architecture Doc, sections 2.3, 2.5, 2.6), since REST
// convention nests child resources under their parent.
//
// Protocol notes:
// - POST /api/posts is Hybrid: REST saves the post; a lightweight Socket.io
//   'feed_update_available' ping is emitted from the controller/service layer
//   (Celebrity Fan-Out fix, section 2.9) — no extra route needed for that.
// - POST/DELETE like is Hybrid: REST writes the Like; Socket.io broadcasts
//   the updated like count.
// - POST /api/posts/:postId/comments is Hybrid: REST saves the comment;
//   Socket.io emits comment_created to the post's room.
// - Everything else here (reads, updates, deletes, saves) is pure HTTP REST.

import { Router } from 'express';

import { createPost, getPosts, getPostById, updatePost, deletePost } from '../controllers/post.controller.js';

import { createComment, getPostComments } from '../controllers/comment.controller.js';

import { likePost, unlikePost, getPostLikers } from '../controllers/like.controller.js';

import { savePost, unsavePost } from '../controllers/savedPost.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createPostSchema, updatePostSchema } from '../validators/post.validator.js';
import { createCommentSchema } from '../validators/comment.validator.js';

const router = Router();

// ---------------------------------------------------------------------------
// Core post CRUD
// ---------------------------------------------------------------------------

// POST /api/posts — create + publish a post (author taken from JWT, not body)
router.post(
    '/',
    protect,
    validate(createPostSchema),
    createPost
);

// GET /api/posts?search=&category=&tag=&author=&sort=&page=&limit= — global feed / search
router.get('/', getPosts);

// GET /api/posts/:id — full detail for one post
router.get('/:id', getPostById);

// PATCH /api/posts/:id — ownership-gated partial update
router.patch('/:id', protect, validate(updatePostSchema), updatePost);

// DELETE /api/posts/:id — ownership-gated delete, cascades Comment/Like documents
router.delete('/:id', protect, deletePost);

// ---------------------------------------------------------------------------
// Likes — nested under /api/posts/:id/like(s)
// ---------------------------------------------------------------------------

// POST /api/posts/:id/like — like a post (Hybrid: REST write + Socket.io count broadcast)
router.post('/:id/like', protect, likePost);

// DELETE /api/posts/:id/like — unlike a post (Hybrid: REST write + Socket.io count broadcast)
router.delete('/:id/like', protect, unlikePost);

// GET /api/posts/:id/likes — list of users who liked the post ("liked by" modal)
router.get('/:id/likes', getPostLikers);

// ---------------------------------------------------------------------------
// Saved posts — nested under /api/posts/:id/save
// ---------------------------------------------------------------------------

// POST /api/posts/:id/save — bookmark a post (private action, no broadcast)
router.post('/:id/save', protect, savePost);

// DELETE /api/posts/:id/save — remove the bookmark
router.delete('/:id/save', protect, unsavePost);

// ---------------------------------------------------------------------------
// Comments — nested under /api/posts/:postId/comments
// ---------------------------------------------------------------------------

// POST /api/posts/:postId/comments — create a comment (Hybrid: REST write + Socket.io broadcast)
router.post(
    '/:postId/comments',
    protect,
    validate(createCommentSchema),
    createComment
);

// GET /api/posts/:postId/comments — list all comments for a post
router.get('/:postId/comments', getPostComments);

export default router;