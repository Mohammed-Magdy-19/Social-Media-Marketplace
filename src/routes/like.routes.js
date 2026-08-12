// src/routes/like.routes.js
// Like routes — logical group covering /api/posts/:id/like(s)
//
// The architecture doc's route map keys every Like endpoint off a post id
// (POST/DELETE /api/posts/:id/like, GET /api/posts/:id/likes), so those
// exact paths are registered on post.routes.js to keep the nesting RESTful.
// This file is kept as the dedicated home for the like.controller's route
// wiring (per the requested file tree) and is mounted at /api/posts from
// routes/index.js — it does not introduce a second, conflicting mount for
// the same paths.
//
// Protocol notes: like/unlike are Hybrid — REST writes the Like document
// (blocked from duplicating by the unique { user, post } compound index)
// and the controller emits a Socket.io broadcast of the updated likesCount.
// Listing likers is pure HTTP REST.

import { Router } from 'express';

import { likePost, unlikePost, getPostLikers } from '../controllers/like.controller.js';

import { protect } from '../middleware/auth.middleware.js';

const router = Router({ mergeParams: true });

// POST /api/posts/:id/like — like a post (Hybrid: REST write + Socket.io count broadcast)
router.post('/:id/like', protect, likePost);

// DELETE /api/posts/:id/like — unlike a post (Hybrid: REST write + Socket.io count broadcast)
router.delete('/:id/like', protect, unlikePost);

// GET /api/posts/:id/likes — list of users who liked the post ("liked by" modal)
router.get('/:id/likes', getPostLikers);

export default router;