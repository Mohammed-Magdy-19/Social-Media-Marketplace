// src/routes/report.routes.js
// Content moderation routes — /api/reports/*
// All pure HTTP REST — safety-critical data intake and admin review with no
// real-time component (see Backend Architecture Doc, section 2.11).

import { Router } from 'express';

import { createReport, getReports, updateReportStatus, deleteReport } from '../controllers/report.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { restrictTo } from '../middleware/restrictTo.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createReportSchema, updateReportSchema } from '../validators/report.validator.js';

const router = Router();

// POST /api/reports — any logged-in user can flag a post, comment, or profile
router.post('/', protect, validate(createReportSchema), createReport);

// GET /api/reports [Admin] — list all filed reports for moderation review
router.get('/', protect, restrictTo('admin'), getReports);

// PATCH /api/reports/:id [Admin] — update status (reviewed/dismissed/resolved) + notes
router.patch(
    '/:id',
    protect,
    restrictTo('admin'),
    validate(updateReportSchema),
    updateReportStatus
);

// DELETE /api/reports/:id [Admin] — permanently remove a report record
router.delete('/:id', protect, restrictTo('admin'), deleteReport);

export default router;