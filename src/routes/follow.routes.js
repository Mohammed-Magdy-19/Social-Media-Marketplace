// src/routes/follow.routes.js
// Follow-system routes — logical group covering /api/users/:id/follow,
// /api/users/:id/followers, /api/users/:id/following, and
// /api/users/me/feed
//
// Per the architecture doc's route map, every follow-system endpoint is
// keyed off a user id, so those exact paths are registered on
// user.routes.js to keep the nesting RESTful. This file is the dedicated
// home for the follow.controller's route wiring (per the requested file
// tree).
//
// Protocol notes: POST follow is Hybrid — REST writes the Follow document
// (duplicate-proofed by the unique { follower, following } compound index)
// and a Notification, then Socket.io pushes a live "new follower" event to
// the followed user's private room. DELETE follow, list reads, and the feed
// are pure HTTP REST (see Backend Architecture Doc, section 2.7).

import { Router } from 'express';

import { followUser, unfollowUser, getFollowers, getFollowing, getMyFeed } from '../controllers/follow.controller.js';

import { protect } from '../middleware/auth.middleware.js';

const router = Router({ mergeParams: true });

// POST /api/users/:id/follow — follow a user (Hybrid: REST write + Socket.io live alert)
router.post('/:id/follow', protect, followUser);

// DELETE /api/users/:id/follow — unfollow a user
router.delete('/:id/follow', protect, unfollowUser);

// GET /api/users/:id/followers — paginated list of the target user's followers
router.get('/:id/followers', getFollowers);

// GET /api/users/:id/following — paginated list of who the target user follows
router.get('/:id/following', getFollowing);

// GET /api/users/me/feed — personalized home timeline (indexed $in lookup on followingIds)
router.get('/me/feed', protect, getMyFeed);

export default router;