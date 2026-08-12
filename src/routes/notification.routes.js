// src/routes/notification.routes.js
// Notification routes — /api/notifications/*
// All pure HTTP REST — reading, counting, and marking-as-read are one-user
// structural operations with nothing to broadcast. The real-time half of
// this system happens elsewhere: other modules (Like, Comment, Follow)
// write a Notification document and separately emit
// io.to(recipientId).emit('new_notification') from their own controllers
// (see Backend Architecture Doc, section 2.8).

import { Router } from 'express';

import { getMyNotifications, getUnreadCount, markNotificationAsRead, markAllNotificationsAsRead, deleteNotification } from '../controllers/notification.controller.js';

import { protect } from '../middleware/auth.middleware.js';

const router = Router();

// All notification routes are private to the logged-in user.
router.use(protect);

// GET /api/notifications — notification history, newest first, populated with sender
router.get('/', getMyNotifications);

// GET /api/notifications/unread-count — cheap, frequent badge-count query
router.get('/unread-count', getUnreadCount);

// PATCH /api/notifications/:id/read — mark a single notification as read
router.patch('/:id/read', markNotificationAsRead);

// PATCH /api/notifications/read-all — bulk-mark every unread notification as read
router.patch('/read-all', markAllNotificationsAsRead);

// DELETE /api/notifications/:id — permanently delete a notification
router.delete('/:id', deleteNotification);

export default router;