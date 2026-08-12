// src/routes/admin.routes.js
// Administrative routes — /api/admin/*
// Every route here is [Admin]-only via restrictTo('admin') and pure HTTP
// REST — sensitive, low-frequency operations opened on-demand by staff,
// with no live/broadcast component (see Backend Architecture Doc,
// section 2.11).

import { Router } from 'express';

import { getAllUsers, updateUserRole, updateUserStatus, getDashboardStats, getAuditLogs } from '../controllers/admin.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { restrictTo } from '../middleware/restrictTo.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { updateUserRoleSchema, updateUserStatusSchema } from '../validators/user.validator.js';

const router = Router();

// Every route in this file is admin-only.
router.use(protect, restrictTo('admin'));

// GET /api/admin/users — full paginated user list, including private admin fields
router.get('/users', getAllUsers);

// PATCH /api/admin/users/:id/role — change a user's role against a strict whitelist
router.patch(
    '/users/:id/role',
    validate(updateUserRoleSchema),
    updateUserRole
);

// PATCH /api/admin/users/:id/status — ban/suspend/reactivate; invalidates refresh tokens on ban
router.patch(
    '/users/:id/status',
    validate(updateUserStatusSchema),
    updateUserStatus
);

// GET /api/admin/dashboard — aggregation pipelines powering admin statistics
router.get('/dashboard', getDashboardStats);

// GET /api/admin/audit-logs — read-only accountability trail
router.get('/audit-logs', getAuditLogs);

export default router;