// src/routes/conversation.routes.js
// Conversation routes — /api/conversations/*
// Pure HTTP REST — fetching history and creating/joining a conversation are
// standard request/response operations (Backend Architecture Doc, §2.12).
//
// Two sub-routers are mounted here with { mergeParams: true } so
// :conversationId is available to them — matching message.routes.js's and
// offer.routes.js's actual routes:
//   GET   /api/conversations/:conversationId/messages
//   PATCH /api/conversations/:conversationId/messages/read
//   POST  /api/conversations/:conversationId/offers
//   GET   /api/conversations/:conversationId/offers
//   PATCH /api/conversations/:conversationId/offers/:offerId

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
import offerRoutes from './offer.routes.js';

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

// Nested negotiation offer routes — /api/conversations/:conversationId/offers/*
router.use('/:conversationId/offers', offerRoutes);

export default router;