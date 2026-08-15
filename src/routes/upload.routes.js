// src/routes/upload.routes.js
// Files / Media routes — /api/uploads/*
// All pure HTTP REST — binary/multipart uploads are a poor fit for
// WebSockets, and deletes/lookups are transactional, single-request
// operations (see Backend Architecture Doc, section 2.10).
//
// File validation (type whitelist, size limits, max-files-per-request) is
// enforced inside the Multer configs exported by upload.middleware.js, not
// re-implemented here — this keeps the limits centralized and consistent
// across every route that accepts a file.

import { Router } from 'express';

import { uploadAvatar, uploadPostMedia, deleteUpload, getUpload, getUploads } from '../controllers/upload.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { avatarUpload, postImagesUpload } from '../middleware/upload.middleware.js';

const router = Router();

// POST /api/uploads/avatar — process + store the avatar, update User.avatar, log a File doc
// avatarUpload enforces: images only, 2 MB hard limit, single file.
router.post(
    '/avatar',
    protect,
    avatarUpload,
    uploadAvatar
);

// POST /api/uploads/posts/:postId — ownership-checked post media upload
// postImagesUpload enforces: images only, 10 MB per file, max 5 files per request.
router.post(
    '/posts/:postId',
    protect,
    postImagesUpload,
    uploadPostMedia
);

// GET /api/uploads — list assets: own files for regular users, with an
// admin-honored `owner` filter for the admin Uploads asset grid
router.get('/', protect, getUploads);

// DELETE /api/uploads/:id — ownership (uploader or admin) checked asset delete + cleanup
router.delete('/:id', protect, deleteUpload);

// GET /api/uploads/:id — asset metadata (URL, mimeType, fileSize, owner)
router.get('/:id', protect, getUpload);

export default router;