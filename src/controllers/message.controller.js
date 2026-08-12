import asyncHandler from 'express-async-handler';
import Message from "../models/Message.js";
import Conversation from "../models/Conversation.js";
import AppError from "../utils/AppError.js";
import { getCursorParams, buildCursorResponse } from "../utils/paginate.js";

/**
 * message.controller.js
 * -----------------------------------------------------------------------
 * §2.12 — Sending and receiving messages, along with typing indicators,
 * are handled as pure Socket.io events (send_message, receive_message,
 * typing_message, stop_typing_message) with no dedicated REST route,
 * since they need to feel instantaneous and are inherently transient.
 * The socket handler that persists a new message on `send_message` is
 * responsible for calling Message.create(...) and then
 * `getIO().to(`conversation_${conversationId}`).emit("receive_message", ...)`
 * itself — that flow lives in config/socket.js's connection handler, not
 * here.
 *
 * This controller only owns the REST-appropriate half of chat: paginated
 * history reads (a page of chat history is not "live" — it's a query,
 * cacheable and skip/limit-friendly) and marking messages as read, since
 * "user opened this chat" is a deliberate one-time action a client fires
 * on chat-window open, not a stream of events.
 * -----------------------------------------------------------------------
 */

/**
 * Shared guard: confirms the requester is a participant of the
 * conversation before letting them read or modify its messages.
 */
const assertParticipant = asyncHandler(async (conversationId, userId) => {
    const conversation = await Conversation.findById(conversationId).select("participants");
    if (!conversation) {
        throw new AppError("Conversation not found.", 404);
    }
    const isParticipant = conversation.participants.some((p) => String(p) === String(userId));
    if (!isParticipant) {
        throw new AppError("You are not a participant in this conversation.", 403);
    }
    return conversation;
});

/**
 * GET /api/conversations/:conversationId/messages
 * Returns message history for a conversation, newest-first, using
 * cursor pagination (see utils/paginate.js) instead of skip/limit —
 * a busy conversation gets new messages inserted constantly while the
 * user scrolls back through history, and cursor pagination avoids the
 * skipped/duplicated-row glitch that skip() produces under those
 * conditions.
 */
export const getMessages = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    await assertParticipant(conversationId, req.user.id);

    const { cursor, limit } = getCursorParams(req.query);

    const filter = { conversation: conversationId };
    if (cursor) {
        filter.createdAt = { $lt: new Date(cursor) };
    }

    const messages = await Message.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit + 1)
        .populate("sender", "username avatar")
        .lean();

    res.status(200).json(buildCursorResponse(messages, limit));
});

/**
 * PATCH /api/conversations/:conversationId/messages/read
 * Marks every message in the conversation not sent by the requester as
 * read by them — fired once when a user opens a chat window. This stays
 * REST (a deliberate, idempotent bulk update) rather than a socket event,
 * matching the same reasoning as PATCH /api/notifications/read-all.
 */
export const markMessagesAsRead = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    await assertParticipant(conversationId, req.user.id);

    const result = await Message.updateMany(
        {
            conversation: conversationId,
            sender: { $ne: req.user.id },
            "readBy.user": { $ne: req.user.id },
        },
        {
            $set: { isRead: true },
            $push: { readBy: { user: req.user.id, readAt: new Date() } },
        }
    );

    res.status(200).json({
        status: "success",
        data: { modifiedCount: result.modifiedCount },
    });
});