// src/routes/savedPost.routes.js
// Saved Post (bookmark) routes — logical group covering /api/posts/:id/save
// and /api/users/me/saved-posts
//
// Per the architecture doc's route map, save/unsave are keyed off a post id
// and the personal list is keyed off the current user, so those exact paths
// are registered on post.routes.js and user.routes.js respectively to keep
// the nesting RESTful. This file is the dedicated home for the
// savedPost.controller's route wiring (per the requested file tree).
//
// Protocol: pure HTTP REST throughout — a private, per-user action with no
// other party who needs a live update (see Backend Architecture Doc,
// section 2.6).

import { Router } from 'express';

import { savePost, unsavePost, getSavedPosts } from '../controllers/savedPost.controller.js';

import { protect } from '../middleware/auth.middleware.js';

const router = Router({ mergeParams: true });

// POST /api/posts/:id/save — bookmark a post (duplicate-proofed by compound index)
router.post('/:id/save', protect, savePost);

// DELETE /api/posts/:id/save — remove the bookmark mapping
router.delete('/:id/save', protect, unsavePost);

// GET /api/users/me/saved-posts — the current user's bookmarked posts, populated
router.get('/me/saved-posts', protect, getSavedPosts);

export default router;