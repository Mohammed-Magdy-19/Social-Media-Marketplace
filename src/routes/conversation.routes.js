// src/routes/conversation.routes.js
// Conversation routes — /api/conversations/*
// Pure HTTP REST — fetching history and creating/joining a conversation are
// standard request/response operations (Backend Architecture Doc, §2.12).
//
// The message sub-router is mounted here at /:conversationId/messages so
// that :conversationId is available to message.routes.js via
// { mergeParams: true } — matching message.controller.js's actual routes:
//   GET   /api/conversations/:conversationId/messages
//   PATCH /api/conversations/:conversationId/messages/read

import { Router } from 'express';

import {
    createConversation,
    getMyConversations,
    getConversationById,
} from '../controllers/conversation.controller.js';

import { protect } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { createConversationSchema } from '../validators/conversation.validator.js';

import messageRoutes from './message.routes.js';

const router = Router();

// Every conversation route requires an authenticated participant.
router.use(protect);

// POST /api/conversations — create (or reuse an existing 1:1) conversation
router.post('/', validate(createConversationSchema), createConversation);

// GET /api/conversations — list the logged-in user's conversations, sorted by lastMessage
router.get('/', getMyConversations);

// GET /api/conversations/:id — one conversation's metadata (participant-only access)
router.get('/:id', getConversationById);

// Nested message routes — /api/conversations/:conversationId/messages/*
router.use('/:conversationId/messages', messageRoutes);

export default router;