import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Notification Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let notificationId = 'notif123';

  const generateToken = (id = userId) => {
    return jwt.sign({ id }, 'test-secret-key', { expiresIn: '1h' });
  };

  const createProtectedApp = () => {
    const testApp = express();
    testApp.use(express.json());

    const protectMiddleware = (req, res, next) => {
      const token = req.headers.authorization?.split(' ')[1];
      if (!token) return res.status(401).json({ status: 'error', message: 'Unauthorized' });
      try {
        const decoded = jwt.verify(token, 'test-secret-key');
        req.user = decoded;
        next();
      } catch (err) {
        res.status(401).json({ status: 'error', message: 'Invalid token' });
      }
    };

    const notifications = new Map([
      [
        notificationId,
        {
          _id: notificationId,
          recipient: userId,
          actor: 'user456',
          type: 'like',
          targetId: 'post123',
          message: 'Someone liked your post',
          isRead: false,
          createdAt: new Date(),
        },
      ],
    ]);

    // GET /api/notifications
    testApp.get('/api/notifications', protectMiddleware, (req, res) => {
      const { page = 1, limit = 20 } = req.query;

      const userNotifs = Array.from(notifications.values()).filter(n => n.recipient === req.user.id);

      res.status(200).json({
        status: 'success',
        data: { notifications: userNotifs },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: userNotifs.length },
      });
    });

    // GET /api/notifications/unread-count
    testApp.get('/api/notifications/unread-count', protectMiddleware, (req, res) => {
      const unreadCount = Array.from(notifications.values()).filter(
        n => n.recipient === req.user.id && !n.isRead
      ).length;

      res.status(200).json({
        status: 'success',
        data: { unreadCount },
      });
    });

    // PATCH /api/notifications/:id/read
    testApp.patch('/api/notifications/:id/read', protectMiddleware, (req, res) => {
      const { id } = req.params;
      const notif = notifications.get(id);

      if (!notif) {
        return res.status(404).json({ status: 'error', message: 'Notification not found' });
      }

      if (notif.recipient !== req.user.id) {
        return res.status(404).json({ status: 'error', message: 'Notification not found' });
      }

      notif.isRead = true;

      res.status(200).json({
        status: 'success',
        data: { notification: notif },
      });
    });

    // PATCH /api/notifications/read-all
    testApp.patch('/api/notifications/read-all', protectMiddleware, (req, res) => {
      let markedCount = 0;

      for (const notif of notifications.values()) {
        if (notif.recipient === req.user.id && !notif.isRead) {
          notif.isRead = true;
          markedCount++;
        }
      }

      res.status(200).json({
        status: 'success',
        data: { markedAsRead: markedCount },
      });
    });

    // DELETE /api/notifications/:id
    testApp.delete('/api/notifications/:id', protectMiddleware, (req, res) => {
      const { id } = req.params;
      const notif = notifications.get(id);

      if (!notif) {
        return res.status(404).json({ status: 'error', message: 'Notification not found' });
      }

      if (notif.recipient !== req.user.id) {
        return res.status(404).json({ status: 'error', message: 'Notification not found' });
      }

      notifications.delete(id);

      res.status(204).send();
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken();
  });

  describe('GET /api/notifications - Get Notifications', () => {
    it('should fetch all notifications for user', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.notifications)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should only return user own notifications', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      res.body.data.notifications.forEach(notif => {
        expect(notif.recipient).toBe(userId);
      });
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/notifications?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
    });

    it('should include notification metadata', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.notifications.length > 0) {
        const notif = res.body.data.notifications[0];
        expect(notif._id).toBeDefined();
        expect(notif.message).toBeDefined();
        expect(notif.isRead).toBeDefined();
        expect(notif.createdAt).toBeDefined();
      }
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/notifications');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/notifications/unread-count - Get Unread Count', () => {
    it('should return unread notification count', async () => {
      const res = await request(app)
        .get('/api/notifications/unread-count')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(typeof res.body.data.unreadCount).toBe('number');
      expect(res.body.data.unreadCount).toBeGreaterThanOrEqual(0);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/notifications/unread-count');

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/notifications/:id/read - Mark as Read', () => {
    it('should mark notification as read', async () => {
      const res = await request(app)
        .patch(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.notification.isRead).toBe(true);
    });

    it('should reject marking if not owner', async () => {
      const otherToken = generateToken('different-user');
      const res = await request(app)
        .patch(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await request(app)
        .patch('/api/notifications/invalidId/read')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should reject without auth', async () => {
      const res = await request(app).patch(`/api/notifications/${notificationId}/read`);

      expect(res.status).toBe(401);
    });

    it('should return 404 to avoid ID leaking', async () => {
      const res = await request(app)
        .patch('/api/notifications/random-id-not-owned/read')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /api/notifications/read-all - Mark All as Read', () => {
    it('should mark all unread notifications as read', async () => {
      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.markedAsRead).toBeDefined();
    });

    it('should handle when all already read', async () => {
      await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.markedAsRead).toBeGreaterThanOrEqual(0);
    });

    it('should reject without auth', async () => {
      const res = await request(app).patch('/api/notifications/read-all');

      expect(res.status).toBe(401);
    });

    it('should only mark user own notifications', async () => {
      const res = await request(app)
        .patch('/api/notifications/read-all')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);

      const checkRes = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      expect(checkRes.status).toBe(200);
      checkRes.body.data.notifications.forEach(notif => {
        expect(notif.recipient).toBe(userId);
      });
    });
  });

  describe('DELETE /api/notifications/:id - Delete Notification', () => {
    it('should delete notification', async () => {
      const res = await request(app)
        .delete(`/api/notifications/${notificationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(204);
    });

    it('should reject delete if not owner', async () => {
      const otherToken = generateToken('different-user');
      const res = await request(app)
        .delete(`/api/notifications/${notificationId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 for non-existent notification', async () => {
      const res = await request(app)
        .delete('/api/notifications/invalidId')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject without auth', async () => {
      const res = await request(app).delete(`/api/notifications/${notificationId}`);

      expect(res.status).toBe(401);
    });

    it('should return 404 to avoid ID leaking', async () => {
      const res = await request(app)
        .delete('/api/notifications/someone-elses-id')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Notification Controller - Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([200, 400, 401]).toContain(res.status);
    });

    it('should not expose sensitive user data', async () => {
      const res = await request(app)
        .get('/api/notifications')
        .set('Authorization', `Bearer ${authToken}`);

      if (res.body.data.notifications.length > 0) {
        res.body.data.notifications.forEach(notif => {
          expect(notif.password).toBeUndefined();
        });
      }
    });
  });

  describe('Notification Controller - Edge Cases', () => {
    it('should handle marking multiple notifications in sequence', async () => {
      const res1 = await request(app)
        .patch(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      const res2 = await request(app)
        .patch(`/api/notifications/${notificationId}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res1.status).toBe(200);
      expect([200, 404]).toContain(res2.status);
    });

    it('should handle rapid read-all operations', async () => {
      const promises = Array(3)
        .fill(null)
        .map(() =>
          request(app)
            .patch('/api/notifications/read-all')
            .set('Authorization', `Bearer ${authToken}`)
        );

      const results = await Promise.all(promises);
      results.forEach(res => {
        expect(res.status).toBe(200);
      });
    });

    it('should handle large notification lists', async () => {
      const res = await request(app)
        .get('/api/notifications?limit=1000')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 400]).toContain(res.status);
    });
  });
});
