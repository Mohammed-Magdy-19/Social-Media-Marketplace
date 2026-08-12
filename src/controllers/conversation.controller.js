import asyncHandler from 'express-async-handler';
import Conversation from "../models/Conversation.js";
import AppError from "../utils/AppError.js";
import { getPagination, buildPaginatedResponse } from "../utils/paginate.js";

/**
 * conversation.controller.js
 * -----------------------------------------------------------------------
 * §2.12 — Fetching conversation history and creating/joining a
 * conversation stay HTTP REST, exactly like every other module. Sending
 * and receiving individual messages is pure Socket.io (see
 * config/socket.js's `join_conversation` / `typing_message` events and
 * message.controller.js for the REST history read).
 * -----------------------------------------------------------------------
 */

/**
 * POST /api/conversations
 * Starts a conversation with one or more other users. For a plain 1:1
 * chat (isGroup: false, exactly 2 participants) an existing conversation
 * between the same two people is reused instead of creating a duplicate
 * thread every time a user opens a chat with someone they've already
 * messaged.
 *
 * Body: { participantIds: string[], isGroup?: boolean, title?: string }
 */
export const createConversation = asyncHandler(async (req, res) => {
    const { participantIds = [], isGroup = false, title = "" } = req.body;

    if (!Array.isArray(participantIds) || participantIds.length === 0) {
        throw new AppError("participantIds must be a non-empty array of user IDs.", 400);
    }

    // Always include the requester — a conversation the creator isn't
    // part of would be unreachable to them afterward.
    const participants = Array.from(new Set([req.user.id, ...participantIds.map(String)]));

    if (participants.length < 2) {
        throw new AppError("A conversation requires at least 2 distinct participants.", 400);
    }

    if (!isGroup && participants.length === 2) {
        const existing = await Conversation.findOne({
            isGroup: false,
            participants: { $all: participants, $size: 2 },
        }).populate("participants", "username avatar");

        if (existing) {
            return res.status(200).json({ status: "success", data: { conversation: existing } });
        }
    }

    const conversation = await Conversation.create({ participants, isGroup, title });
    await conversation.populate("participants", "username avatar");

    res.status(201).json({ status: "success", data: { conversation } });
});

/**
 * GET /api/conversations
 * Lists every conversation the logged-in user participates in, most
 * recently active first — driven by the { participants: 1, updatedAt: -1 }
 * index on the schema.
 */
export const getMyConversations = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);

    const conversations = await Conversation.find({ participants: req.user.id })
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .populate("participants", "username avatar")
        .populate({ path: "lastMessage", select: "text sender createdAt" })
        .lean();

    res.status(200).json(buildPaginatedResponse(conversations, page, limit));
});

/**
 * GET /api/conversations/:id
 * Returns a single conversation's metadata (participants, last message
 * preview). The full message history for it is fetched separately via
 * GET /api/conversations/:id/messages in message.controller.js, keeping
 * this route lightweight for chat-list-to-chat-window navigation.
 */
export const getConversationById = asyncHandler(async (req, res) => {
    const conversation = await Conversation.findById(req.params.id)
        .populate("participants", "username avatar")
        .populate({ path: "lastMessage", select: "text sender createdAt" });

    if (!conversation) {
        throw new AppError("Conversation not found.", 404);
    }

    const isParticipant = conversation.participants.some(
        (p) => String(p._id) === String(req.user.id)
    );
    if (!isParticipant) {
        throw new AppError("You are not a participant in this conversation.", 403);
    }

    res.status(200).json({ status: "success", data: { conversation } });
});