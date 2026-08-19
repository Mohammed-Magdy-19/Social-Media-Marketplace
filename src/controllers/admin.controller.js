import asyncHandler from 'express-async-handler';
import User from "../models/User.js";
import Post from "../models/Post.js";
import Report from "../models/Report.js";
import Payment from "../models/Payment.js";
import RefreshToken from "../models/RefreshToken.js";
import AuditLog from "../models/AuditLog.js";
import AppError from "../utils/AppError.js";
import { getPagination, buildPaginatedResponse } from "../utils/paginate.js";

/**
 * admin.controller.js
 * -----------------------------------------------------------------------
 * §2.11 — every route in this file sits behind protect + restrictTo('admin')
 * at the route layer (§3.2, RBAC). Every sensitive mutation additionally
 * writes an AuditLog entry so "who changed what, and when" is always
 * reconstructable — matching §5.3 of the glossary.
 * -----------------------------------------------------------------------
 */

const ALLOWED_ROLES = ["user", "moderator", "admin"];
const ALLOWED_STATUSES = ["active", "suspended", "banned"];

// Regex metacharacters that need escaping before user-supplied text is
// safely embeddable inside a MongoDB $regex. Without this, a search
// string like "a.*.*.*.*.*.*.*!" (or any pattern with nested
// quantifiers) can trigger catastrophic backtracking on every request
// that hits this filter — a single unauthenticated-looking query string
// becomes a denial-of-service vector against the admin user list. This
// mirrors the standard "escape-regexp" utility pattern; kept local here
// since no shared string-utils module was present in the provided files.
const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * GET /api/admin/users
 * Full, paginated list of users including administrative fields
 * (verification state, creation date, current role) that GET
 * /api/users/:id deliberately hides from the public profile route.
 * Supports the same ?search=&role= filters as the public user list.
 */
export const getAllUsers = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const { search, role, status } = req.query;

    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
        // Escape before it ever reaches $regex — see escapeRegExp's
        // comment above. `search` is untrusted admin-supplied input and
        // must never be interpolated into a regex pattern verbatim.
        const safeSearch = escapeRegExp(search);
        filter.$or = [
            { username: { $regex: safeSearch, $options: "i" } },
            { email: { $regex: safeSearch, $options: "i" } },
        ];
    }

    const users = await User.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean();

    // .lean() bypasses Mongoose's toJSON virtuals, so `id` (the string
    // alias of `_id`) is absent from the plain objects.  The frontend
    // uniformly reads `.id`; without this mapping every admin-panel
    // mutation that references a user row sends `undefined` as the id.
    const normalized = users.map(({ _id, ...rest }) => ({ id: _id, ...rest }));

    res.status(200).json(buildPaginatedResponse(normalized, page, limit));
});

/**
 * PATCH /api/admin/users/:id/role
 * Changes a user's role against a strict whitelist. Writes a
 * ROLE_CHANGE audit entry recording the before/after value.
 *
 * Body: { role: "user"|"moderator"|"admin" }
 */
export const updateUserRole = asyncHandler(async (req, res) => {
    const { role } = req.body;

    if (!ALLOWED_ROLES.includes(role)) {
        throw new AppError(`role must be one of: ${ALLOWED_ROLES.join(", ")}.`, 400);
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
        throw new AppError("User not found.", 404);
    }

    if (String(targetUser._id) === String(req.user.id)) {
        throw new AppError("You cannot change your own role.", 400);
    }

    const previousRole = targetUser.role;
    targetUser.role = role;
    await targetUser.save({ validateModifiedOnly: true });

    await AuditLog.create({
        actor: req.user.id,
        action: "ROLE_CHANGE",
        targetType: "user",
        targetId: targetUser._id,
        details: { previousRole, newRole: role },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
    });

    res.status(200).json({ status: "success", data: { user: targetUser } });
});

/**
 * PATCH /api/admin/users/:id/status
 * Bans, suspends, or reactivates an account. On a ban, every active
 * refresh token for that user is deleted so any device they're
 * currently logged in on is forced to re-authenticate (and can't,
 * since the account is now banned) — matching the architecture doc's
 * explicit requirement in §2.11.
 *
 * Body: { status: "active"|"suspended"|"banned" }
 */
export const updateUserStatus = asyncHandler(async (req, res) => {
    const { status } = req.body;

    if (!ALLOWED_STATUSES.includes(status)) {
        throw new AppError(`status must be one of: ${ALLOWED_STATUSES.join(", ")}.`, 400);
    }

    const targetUser = await User.findById(req.params.id);
    if (!targetUser) {
        throw new AppError("User not found.", 404);
    }

    if (String(targetUser._id) === String(req.user.id)) {
        throw new AppError("You cannot change your own account status.", 400);
    }

    const previousStatus = targetUser.status;
    targetUser.status = status;
    await targetUser.save({ validateModifiedOnly: true });

    // Invalidate active sessions whenever an account is banned, so a
    // still-valid refresh token can't be used to silently mint new
    // access tokens for an account that's supposed to be locked out.
    if (status === "banned") {
        await RefreshToken.deleteMany({ user: targetUser._id });
    }

    const actionMap = {
        banned: "USER_BAN",
        suspended: "USER_SUSPEND",
        active: "USER_REACTIVATE",
    };

    await AuditLog.create({
        actor: req.user.id,
        action: actionMap[status],
        targetType: "user",
        targetId: targetUser._id,
        details: { previousStatus, newStatus: status },
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
    });

    res.status(200).json({ status: "success", data: { user: targetUser } });
});

/**
 * GET /api/admin/dashboard
 * Runs lightweight aggregation/count queries across collections to
 * power the admin stats panel. Every query here is a cheap
 * countDocuments/aggregate — no full-document scans — since this route
 * may be opened frequently by staff.
 */
export const getDashboardStats = asyncHandler(async (req, res) => {
    const [
        totalUsers,
        activeUsers,
        suspendedUsers,
        bannedUsers,
        totalPosts,
        pendingReports,
        salesAggregate,
    ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ status: "active" }),
        User.countDocuments({ status: "suspended" }),
        User.countDocuments({ status: "banned" }),
        Post.countDocuments(),
        Report.countDocuments({ status: "pending" }),
        Payment.aggregate([
            { $match: { status: "completed" } },
            { $group: { _id: "$currency", totalAmount: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
    ]);

    res.status(200).json({
        status: "success",
        data: {
            users: { total: totalUsers, active: activeUsers, suspended: suspendedUsers, banned: bannedUsers },
            posts: { total: totalPosts },
            reports: { pending: pendingReports },
            // Grouped by currency since summing mixed-currency amounts
            // directly would produce a meaningless number.
            sales: salesAggregate,
        },
    });
});

/**
 * GET /api/admin/audit-logs
 * Read-only route returning entries from the AuditLog collection for
 * accountability tracing. Supports optional ?actor= and ?action=
 * filters so staff can trace a specific admin's history or a specific
 * action type (e.g. all USER_BAN entries).
 */
export const getAuditLogs = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);
    const { actor, action } = req.query;

    const filter = {};
    if (actor) filter.actor = actor;
    if (action) filter.action = action;

    const logs = await AuditLog.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .populate("actor", "username avatar role")
        .lean();

    res.status(200).json(buildPaginatedResponse(logs, page, limit));
});