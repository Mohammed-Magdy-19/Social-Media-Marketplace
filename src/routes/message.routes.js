// src/routes/message.routes.js
// Message routes — nested under /api/conversations/:conversationId/messages
//
// Per the Backend Architecture Doc (section 2.12), sending and receiving
// messages, along with typing indicators, are handled as pure Socket.io
// events (send_message, receive_message, typing_message, stop_typing_message)
// with NO dedicated REST route — they must feel instantaneous and are
// inherently transient. That flow lives entirely in config/socket.js's
// connection handler. Deliberately, there is no POST route in this file.
//
// What DOES belong on REST, per message.controller.js, is:
//   - a paginated (cursor-based) history read, since a page of past
//     messages is a cacheable, one-shot query, not a live stream
//   - marking a conversation's messages as read, a deliberate one-time
//     action fired on chat-window open, matching the same reasoning as
//     PATCH /api/notifications/read-all
//
// { mergeParams: true } is required so this router can see :conversationId
// from the parent router it's mounted under (conversation.routes.js).

import { Router } from 'express';

import {
    getMessages,
    markMessagesAsRead,
} from '../controllers/message.controller.js';

import { protect } from '../middleware/auth.middleware.js';

const router = Router({ mergeParams: true });

// Every message route requires an authenticated conversation participant
// (enforced per-handler inside the controller via assertParticipant).
router.use(protect);

// GET /api/conversations/:conversationId/messages — cursor-paginated message history
router.get('/', getMessages);

// PATCH /api/conversations/:conversationId/messages/read — mark unread messages as read
router.patch('/read', markMessagesAsRead);

export default router;