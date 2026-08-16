import asyncHandler from 'express-async-handler';
import Notification from "../models/Notification.js";
import AppError from "../utils/AppError.js";
import { getPagination, buildPaginatedResponse } from "../utils/paginate.js";

/**
 * notification.controller.js
 * -----------------------------------------------------------------------
 * §2.8 of the architecture doc — all five routes here are pure HTTP REST.
 * Reading, counting, and marking notifications as read are one-user,
 * structural database operations with nothing to broadcast. The live
 * push half of the system (new_notification) is owned entirely by
 * services/notification.service.js and fired from the Like/Comment/
 * Follow/Message controllers whenever they create a Notification —
 * never from here.
 * -----------------------------------------------------------------------
 */

/**
 * GET /api/notifications
 * Returns the logged-in user's notification history, newest first,
 * populated with the sender's public-facing fields.
 */
export const getMyNotifications = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);

    const notifications = await Notification.find({ recipient: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1) // fetch one extra to cheaply compute hasMore — see utils/paginate.js
        .populate("sender", "username avatar")
        .lean();

    res.status(200).json(buildPaginatedResponse(notifications, page, limit));
});

/**
 * GET /api/admin/notifications
 * [Admin] Platform-wide notification feed — every notification for every
 * user, not just the admin's own inbox. Distinct from GET /api/notifications
 * (self-scoped), which is what the bell icon and, currently, the admin
 * Notifications page both call; wire the admin page to this route instead
 * if a genuine cross-user moderation feed is what's intended, rather than
 * the admin's personal notifications under a misleading "all system and
 * community notifications" label.
 *
 * Query params: type? (LIKE|COMMENT|FOLLOW|MESSAGE|NEW_POST), page?, limit?
 */
export const getAllNotifications = asyncHandler(async (req, res) => {
    const { type } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const filter = {};
    if (type) filter.type = type;

    const notifications = await Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .populate("sender", "username avatar")
        .populate("recipient", "username avatar")
        .lean();

    res.status(200).json(buildPaginatedResponse(notifications, page, limit));
});

/**
 * GET /api/notifications/unread-count
 * Lightweight, high-frequency query powering the bell-icon badge.
 * Deliberately a single countDocuments call — no population, no sorting.
 */
export const getUnreadCount = asyncHandler(async (req, res) => {
    const count = await Notification.countDocuments({
        recipient: req.user.id,
        isRead: false,
    });

    res.status(200).json({ status: "success", data: { count } });
});

/**
 * PATCH /api/notifications/:id/read
 * Marks a single notification as read. Ownership is enforced — a user
 * can only mark their own notifications, never someone else's by ID.
 */
export const markNotificationAsRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
        throw new AppError("Notification not found.", 404);
    }

    if (String(notification.recipient) !== String(req.user.id)) {
        throw new AppError("You are not authorized to modify this notification.", 403);
    }

    notification.isRead = true;
    await notification.save();

    res.status(200).json({ status: "success", data: { notification } });
});

/**
 * PATCH /api/notifications/read-all
 * Bulk-updates every unread notification belonging to the current user
 * in a single updateMany, instantly zeroing the badge without an N+1
 * loop of individual saves.
 */
export const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
    const result = await Notification.updateMany(
        { recipient: req.user.id, isRead: false },
        { $set: { isRead: true } }
    );

    res.status(200).json({
        status: "success",
        data: { modifiedCount: result.modifiedCount },
    });
});

/**
 * DELETE /api/notifications/:id
 * Permanently removes a single notification. Ownership-gated exactly
 * like markNotificationAsRead — a 404 is returned instead of a 403 when
 * the document doesn't belong to the requester, so we don't leak
 * whether a given notification ID exists at all.
 */
export const deleteNotification = asyncHandler(async (req, res) => {
    const notification = await Notification.findById(req.params.id);

    if (!notification || String(notification.recipient) !== String(req.user.id)) {
        throw new AppError("Notification not found.", 404);
    }

    await notification.deleteOne();

    res.status(200).json({ status: "success", data: null });
});