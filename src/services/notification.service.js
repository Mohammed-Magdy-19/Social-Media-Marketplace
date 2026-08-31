import Notification from "../models/Notification.js";
import { getIO } from "../config/socket.js";
import AppError from "../utils/AppError.js";

/**
 * notification.service.js
 * -----------------------------------------------------------------------
 * Implements the "Hybrid Approach" (glossary §5.1) for personal,
 * one-to-one interactions: Like, Comment, and Follow controllers call
 * createNotification() right after their REST write succeeds. This
 * service persists the Notification document AND pushes it live via
 * Socket.io to the recipient's private room (`user_<id>`, joined via the
 * `register_user` socket event defined in config/socket.js).
 *
 * This is intentionally NOT used for the "new post" fan-out case (§2.9,
 * the Celebrity Fan-Out Problem) — that path stays a single lightweight
 * `feed_<authorId>` room broadcast with zero database writes. This
 * service is only for direct, personal notifications (likes, comments,
 * follows, messages), keeping the Notification collection small and fast.
 * -----------------------------------------------------------------------
 */

// Mirrors the Notification schema's `type` enum (§1.5) so a typo here
// fails fast in development instead of silently writing a bad enum value.
const NOTIFICATION_TYPES = ["LIKE", "COMMENT", "FOLLOW", "MESSAGE", "NEW_POST"];

/**
 * Creates a Notification document and emits it in real time to the
 * recipient if they're currently connected. Safe to call even if the
 * recipient is offline — the socket emit is a no-op for absent sockets,
 * and the document is still persisted for them to see later via
 * GET /api/notifications.
 *
 * @param {Object} params
 * @param {string|import("mongoose").Types.ObjectId} params.recipient - user receiving the notification
 * @param {string|import("mongoose").Types.ObjectId} params.sender - user who triggered the action
 * @param {"LIKE"|"COMMENT"|"FOLLOW"|"MESSAGE"|"NEW_POST"} params.type
 * @param {string|import("mongoose").Types.ObjectId} params.targetId - related post/comment/etc.
 * @returns {Promise<import("mongoose").Document>} the created Notification document
 */
export const createNotification = async ({ recipient, sender, type, targetId }) => {
    if (!recipient || !sender || !type || !targetId) {
        throw new AppError(
            "recipient, sender, type, and targetId are all required to create a notification.",
            400
        );
    }

    if (!NOTIFICATION_TYPES.includes(type)) {
        throw new AppError(
            `Invalid notification type "${type}". Must be one of: ${NOTIFICATION_TYPES.join(", ")}.`,
            400
        );
    }

    // Never notify a user about their own action (e.g. liking your own post,
    // if that's ever allowed at the controller level) — avoids noisy,
    // meaningless notifications and wasted writes.
    if (String(recipient) === String(sender)) {
        return null;
    }

    // 1. Persist the notification so it shows up in GET /api/notifications
    //    even if the recipient is offline right now.
    const notification = await Notification.create({
        recipient,
        sender,
        type,
        targetId,
        isRead: false,
    });

    // Populate sender's public-facing fields so the emitted payload is
    // immediately renderable on the client without a follow-up fetch.
    await notification.populate("sender", "username avatar firstName lastName");

    // 2. Push it live to the recipient's private room. If they're not
    //    connected, this simply reaches zero sockets — no error, no cost.
    try {
        getIO().to(`user_${recipient}`).emit("new_notification", notification);
    } catch (err) {
        // If Socket.io hasn't been initialized yet (e.g. a script running
        // outside the normal server bootstrap) don't let that fail the
        // write that already succeeded — the notification is still saved
        // and will be visible on the next GET /api/notifications call.
        // Re-throwing here would incorrectly roll back a successful DB write
        // at the controller level, so we swallow socket-layer failures only.
    }

    return notification;
};

/**
 * Convenience helper for bulk "mark all as read" style flows elsewhere in
 * the app that may want to fire a lightweight "notifications cleared"
 * signal back to the same user's other open tabs/devices. Not required by
 * the REST routes in §2.8 (those stay pure HTTP), but included here since
 * notification.service.js is the single place that owns the
 * socket-emit-for-notifications responsibility.
 *
 * @param {string|import("mongoose").Types.ObjectId} userId
 */
export const emitUnreadCountCleared = (userId) => {
    try {
        getIO().to(`user_${userId}`).emit("notifications_read_all");
    } catch (err) {
        // Same rationale as above — socket layer being unavailable should
        // never fail an already-successful database update.
    }
};

export default {
    createNotification,
    emitUnreadCountCleared,
};