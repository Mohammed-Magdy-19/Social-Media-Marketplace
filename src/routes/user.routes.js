// src/routes/user.routes.js
// User profile routes — /api/users/*
// Also hosts the follow-system sub-routes and the personalized feed route
// (see Backend Architecture Doc, sections 2.2 and 2.7), since they are all
// keyed off a target user's :id and share this router's mount point.

import { Router } from 'express';

import { updateMe, updateMyPassword, deleteMe, getUserById, listUsers } from '../controllers/user.controller.js';
import { getSavedPosts } from "../controllers/savedPost.controller.js";
import { getUserPosts } from "../controllers/post.controller.js";

import { followUser, unfollowUser, getFollowers, getFollowing, getMyFeed } from '../controllers/follow.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { updateProfileSchema, updatePasswordSchema } from '../validators/user.validator.js';

const router = Router();

// ---------------------------------------------------------------------------
// Self-service routes (require authentication) — must be declared BEFORE the
// generic /:id route so 'me' is never swallowed as a user id param.
// ---------------------------------------------------------------------------

// PATCH /api/users/me — partial update of the logged-in user's own profile
router.patch('/me', protect, validate(updateProfileSchema), updateMe);

// PATCH /api/users/me/password — change password (verifies current password first)
router.patch(
    '/me/password',
    protect,
    validate(updatePasswordSchema),
    updateMyPassword
);

// DELETE /api/users/me — deactivate/delete the logged-in user's own account
router.delete('/me', protect, deleteMe);

// GET /api/users/me/feed — personalized home timeline (follows-based, indexed query)
router.get('/me/feed', protect, getMyFeed);

// GET /api/users/me/saved-posts — the current user's bookmarked posts
router.get('/me/saved-posts', protect, getSavedPosts);

// ---------------------------------------------------------------------------
// Follow-system routes, keyed by target user :id
// POST/DELETE follow is Hybrid: REST writes the relationship, Socket.io
// pushes a live "new follower" notification (POST only — DELETE has no
// urgent live-alert need per the architecture doc).
// ---------------------------------------------------------------------------

// POST /api/users/:id/follow — follow a user (duplicate-proofed by compound index)
router.post('/:id/follow', protect, followUser);

// DELETE /api/users/:id/follow — unfollow a user
router.delete('/:id/follow', protect, unfollowUser);

// GET /api/users/:id/followers — paginated list of the target user's followers
router.get('/:id/followers', getFollowers);

// GET /api/users/:id/following — paginated list of who the target user follows
router.get('/:id/following', getFollowing);

// ---------------------------------------------------------------------------
// Public reads
// ---------------------------------------------------------------------------

// GET /api/users/:userId/posts — a specific user's own posts (separate from the global feed)
router.get('/:userId/posts', getUserPosts);

// GET /api/users/:id — public profile (private fields such as email/password/role hidden)
router.get('/:id', getUserById);

// GET /api/users?search=&role=&page=&limit= — directory / admin table listing
router.get('/', listUsers);

export default router;