// src/routes/index.js
// Central route aggregator — mounts every feature router onto /api/*.
// Kept as the single source of truth for the API surface so app.js stays
// a thin wiring file and new modules only require one line here.

import { Router } from 'express';

import authRoutes from './auth.routes.js';
import userRoutes from './user.routes.js';
import postRoutes from './post.routes.js';
import categoryRoutes from './category.routes.js';
import commentRoutes from './comment.routes.js';
import notificationRoutes from './notification.routes.js';
import uploadRoutes from './upload.routes.js';
import conversationRoutes from './conversation.routes.js';
import messageRoutes from './message.routes.js';
import paymentRoutes from './payment.routes.js';
import reportRoutes from './report.routes.js';
import adminRoutes from './admin.routes.js';

const router = Router();

// -----------------------------------------------------------------------
// Mount order note:
// - post.routes.js and user.routes.js already own the nested paths for
//   likes, saved posts, follows, and comments-under-a-post (per the
//   architecture doc's REST nesting). like.routes.js, savedPost.routes.js,
//   and follow.routes.js exist as the dedicated home for their respective
//   controllers' route wiring (per the requested file tree) and are not
//   separately mounted here, to avoid double-registering the same paths
//   on the same router (e.g. POST /api/posts/:id/like would otherwise be
//   reachable — and matched — twice).
// - comment.routes.js covers the standalone /api/comments/:id operations
//   that are NOT nested under a post.
// -----------------------------------------------------------------------

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/posts', postRoutes);
router.use('/categories', categoryRoutes);
router.use('/comments', commentRoutes);
router.use('/notifications', notificationRoutes);
router.use('/uploads', uploadRoutes);
router.use('/conversations', conversationRoutes);
router.use('/messages', messageRoutes);
router.use('/payments', paymentRoutes);
router.use('/reports', reportRoutes);
router.use('/admin', adminRoutes);

export default router;