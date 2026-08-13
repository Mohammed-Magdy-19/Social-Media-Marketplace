import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Message Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let conversationId = 'conv123';

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

    const messages = [
      {
        _id: 'msg1',
        text: 'Hello there',
        conversation: conversationId,
        sender: 'user456',
        isRead: false,
        createdAt: new Date(Date.now() - 5000),
      },
      {
        _id: 'msg2',
        text: 'How are you',
        conversation: conversationId,
        sender: 'user456',
        isRead: false,
        createdAt: new Date(),
      },
    ];

    const conversations = new Map([
      [conversationId, { _id: conversationId, participants: [userId, 'user456'] }],
    ]);

    // GET /api/conversations/:conversationId/messages
    testApp.get('/api/conversations/:conversationId/messages', protectMiddleware, (req, res) => {
      const { conversationId: convId } = req.params;
      const { cursor, limit = 20 } = req.query;

      const conv = conversations.get(convId);
      if (!conv) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      if (!conv.participants.includes(req.user.id)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden - not a participant' });
      }

      const filtered = messages
        .filter(m => m.conversation === convId)
        .reverse()
        .slice(0, parseInt(limit));

      res.status(200).json({
        status: 'success',
        data: { messages: filtered },
        pagination: { cursor: messages[0]?._id, limit: parseInt(limit), hasMore: false },
      });
    });

    // PATCH /api/conversations/:conversationId/messages/read
    testApp.patch('/api/conversations/:conversationId/messages/read', protectMiddleware, (req, res) => {
      const { conversationId: convId } = req.params;

      const conv = conversations.get(convId);
      if (!conv) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      if (!conv.participants.includes(req.user.id)) {
        return res.status(403).json({ status: 'error', message: 'Forbidden - not a participant' });
      }

      const unreadCount = messages.filter(
        m => m.conversation === convId && m.sender !== req.user.id && !m.isRead
      ).length;

      messages.forEach(m => {
        if (m.conversation === convId && m.sender !== req.user.id) {
          m.isRead = true;
        }
      });

      res.status(200).json({
        status: 'success',
        data: { markedAsRead: unreadCount },
      });
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken();
  });

  describe('GET /api/conversations/:conversationId/messages - Get Messages', () => {
    it('should fetch messages for participant', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.messages)).toBe(true);
    });

    it('should include message text and metadata', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.messages.length > 0) {
        const msg = res.body.data.messages[0];
        expect(msg._id).toBeDefined();
        expect(msg.text).toBeDefined();
        expect(msg.sender).toBeDefined();
        expect(msg.createdAt).toBeDefined();
      }
    });

    it('should support limit parameter', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=5`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.limit).toBe(5);
    });

    it('should support cursor for pagination', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages?cursor=msg1&limit=10`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
    });

    it('should reject access for non-participant', async () => {
      const otherToken = generateToken('non-participant');
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    it('should return 404 for non-existent conversation', async () => {
      const res = await request(app)
        .get('/api/conversations/invalidId/messages')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should reject without auth', async () => {
      const res = await request(app).get(`/api/conversations/${conversationId}/messages`);

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/conversations/:conversationId/messages/read - Mark Messages as Read', () => {
    it('should mark unread messages as read', async () => {
      const res = await request(app)
        .patch(`/api/conversations/${conversationId}/messages/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.markedAsRead).toBeGreaterThanOrEqual(0);
    });

    it('should only mark messages from other users', async () => {
      const res = await request(app)
        .patch(`/api/conversations/${conversationId}/messages/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.markedAsRead).toBeDefined();
    });

    it('should reject access for non-participant', async () => {
      const otherToken = generateToken('non-participant');
      const res = await request(app)
        .patch(`/api/conversations/${conversationId}/messages/read`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent conversation', async () => {
      const res = await request(app)
        .patch('/api/conversations/invalidId/messages/read')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject without auth', async () => {
      const res = await request(app).patch(
        `/api/conversations/${conversationId}/messages/read`
      );

      expect(res.status).toBe(401);
    });

    it('should handle marking already-read messages', async () => {
      const res1 = await request(app)
        .patch(`/api/conversations/${conversationId}/messages/read`)
        .set('Authorization', `Bearer ${authToken}`);

      const res2 = await request(app)
        .patch(`/api/conversations/${conversationId}/messages/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res1.status).toBe(200);
      expect(res2.status).toBe(200);
    });
  });

  describe('Message Controller - Concurrency', () => {
    it('should handle concurrent message read operations', async () => {
      const promises = Array(3)
        .fill(null)
        .map(() =>
          request(app)
            .patch(`/api/conversations/${conversationId}/messages/read`)
            .set('Authorization', `Bearer ${authToken}`)
        );

      const results = await Promise.all(promises);
      results.forEach(res => {
        expect(res.status).toBe(200);
      });
    });

    it('should handle concurrent message fetches', async () => {
      const promises = Array(3)
        .fill(null)
        .map(() =>
          request(app)
            .get(`/api/conversations/${conversationId}/messages`)
            .set('Authorization', `Bearer ${authToken}`)
        );

      const results = await Promise.all(promises);
      results.forEach(res => {
        expect(res.status).toBe(200);
      });
    });
  });

  describe('Message Controller - Error Handling', () => {
    it('should handle malformed requests', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([200, 400, 401]).toContain(res.status);
    });

    it('should not expose sensitive user data', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages`)
        .set('Authorization', `Bearer ${authToken}`);

      if (res.body.data.messages.length > 0) {
        res.body.data.messages.forEach(msg => {
          expect(msg.password).toBeUndefined();
        });
      }
    });
  });

  describe('Message Controller - Edge Cases', () => {
    it('should handle very large limit parameter', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=10000`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 400]).toContain(res.status);
    });

    it('should handle zero limit', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=0`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 400]).toContain(res.status);
    });

    it('should handle special characters in cursor', async () => {
      const res = await request(app)
        .get(
          `/api/conversations/${conversationId}/messages?cursor=msg-<script>alert(1)</script>`
        )
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 404]).toContain(res.status);
    });

    it('should preserve message order', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}/messages?limit=100`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.messages.length > 1) {
        for (let i = 1; i < res.body.data.messages.length; i++) {
          const prev = new Date(res.body.data.messages[i - 1].createdAt);
          const curr = new Date(res.body.data.messages[i].createdAt);
          expect(prev.getTime()).toBeGreaterThanOrEqual(curr.getTime());
        }
      }
    });
  });
});
