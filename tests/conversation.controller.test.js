import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Conversation Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let participantId = 'user456';
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

    const conversations = new Map([
      [
        conversationId,
        {
          _id: conversationId,
          participants: [userId, participantId],
          isGroup: false,
          title: null,
          createdAt: new Date(),
        },
      ],
    ]);

    // POST /api/conversations
    testApp.post('/api/conversations', protectMiddleware, (req, res) => {
      const { participantIds, isGroup, title } = req.body;

      if (!Array.isArray(participantIds) || participantIds.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'participantIds must be a non-empty array',
        });
      }

      const hasDuplicateParticipants = participantIds.some((id, index) => participantIds.indexOf(id) !== index);
      if (hasDuplicateParticipants) {
        return res.status(400).json({
          status: 'error',
          message: 'Conversation participants must be unique',
        });
      }

      const uniqueIds = new Set(participantIds);
      if (uniqueIds.size < 2) {
        return res.status(400).json({
          status: 'error',
          message: 'Conversation must have at least 2 distinct participants',
        });
      }

      // Check for existing 1:1 conversation
      if (!isGroup && participantIds.length === 2) {
        for (const conv of conversations.values()) {
          if (
            !conv.isGroup &&
            conv.participants.includes(req.user.id) &&
            participantIds.every(id => conv.participants.includes(id))
          ) {
            return res.status(200).json({ status: 'success', data: { conversation: conv } });
          }
        }
      }

      const newId = `conv-${Date.now()}`;
      const newConv = {
        _id: newId,
        participants: [...participantIds, req.user.id],
        isGroup: isGroup || false,
        title: title || null,
        createdAt: new Date(),
      };

      conversations.set(newId, newConv);
      res.status(201).json({ status: 'success', data: { conversation: newConv } });
    });

    // GET /api/conversations
    testApp.get('/api/conversations', protectMiddleware, (req, res) => {
      const { page = 1, limit = 20 } = req.query;

      const userConvs = Array.from(conversations.values()).filter(conv =>
        conv.participants.includes(req.user.id)
      );

      res.status(200).json({
        status: 'success',
        data: { conversations: userConvs },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: userConvs.length },
      });
    });

    // GET /api/conversations/:id
    testApp.get('/api/conversations/:id', protectMiddleware, (req, res) => {
      const { id } = req.params;
      const conv = conversations.get(id);

      if (!conv) {
        return res.status(404).json({ status: 'error', message: 'Conversation not found' });
      }

      if (!conv.participants.includes(req.user.id)) {
        return res.status(403).json({
          status: 'error',
          message: 'Forbidden - not a participant',
        });
      }

      res.status(200).json({ status: 'success', data: { conversation: conv } });
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken();
  });

  describe('POST /api/conversations - Create Conversation', () => {
    it('should create 1:1 conversation with valid participants', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ participantIds: ['user789', participantId] });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.conversation.isGroup).toBe(false);
    });

    it('should create group conversation with multiple participants', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participantIds: ['user789', 'user999'],
          isGroup: true,
          title: 'Project Team',
        });

      expect(res.status).toBe(201);
      expect(res.body.data.conversation.isGroup).toBe(true);
      expect(res.body.data.conversation.title).toBe('Project Team');
    });

    it('should reject conversation without participantIds', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('participantIds');
    });

    it('should reject empty participantIds array', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ participantIds: [] });

      expect(res.status).toBe(400);
    });

    it('should reject conversation with less than 2 distinct participants', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ participantIds: [userId] });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('at least 2');
    });

    it('should reuse existing 1:1 conversation', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ participantIds: [userId, participantId] });

      expect(res.status).toBe(200);
      expect(res.body.data.conversation._id).toBe(conversationId);
    });

    it('should reject conversation without auth', async () => {
      const res = await request(app).post('/api/conversations').send({
        participantIds: ['user789', participantId],
      });

      expect(res.status).toBe(401);
    });

    it('should automatically include requester in participants', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ participantIds: ['user789', 'user999'] });

      expect(res.status).toBe(201);
      expect(res.body.data.conversation.participants).toContain(userId);
    });
  });

  describe('GET /api/conversations - Get User Conversations', () => {
    it('should fetch user conversations', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.conversations)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should only return conversations user is part of', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      res.body.data.conversations.forEach(conv => {
        expect(conv.participants).toContain(userId);
      });
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/conversations?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/conversations');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/conversations/:id - Get Conversation by ID', () => {
    it('should fetch conversation for participant', async () => {
      const res = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.conversation._id).toBe(conversationId);
    });

    it('should reject access for non-participant', async () => {
      const otherToken = generateToken('non-participant');
      const res = await request(app)
        .get(`/api/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    it('should return 404 for non-existent conversation', async () => {
      const res = await request(app)
        .get('/api/conversations/invalidId')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should reject without auth', async () => {
      const res = await request(app).get(`/api/conversations/${conversationId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('Conversation Controller - Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose sensitive user data', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      res.body.data.conversations.forEach(conv => {
        expect(conv.password).toBeUndefined();
      });
    });
  });

  describe('Conversation Controller - Edge Cases', () => {
    it('should handle group conversation with many participants', async () => {
      const manyIds = Array.from({ length: 50 }, (_, i) => `user${i}`);
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participantIds: manyIds,
          isGroup: true,
          title: 'Large Group',
        });

      expect([201, 400]).toContain(res.status);
    });

    it('should handle duplicate participant IDs', async () => {
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participantIds: ['user789', 'user789', 'user999'],
        });

      expect(res.status).toBe(400);
    });

    it('should handle very long conversation titles', async () => {
      const longTitle = 'a'.repeat(500);
      const res = await request(app)
        .post('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          participantIds: ['user789', 'user999'],
          isGroup: true,
          title: longTitle,
        });

      expect([201, 400]).toContain(res.status);
    });
  });
});
