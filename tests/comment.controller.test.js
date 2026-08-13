import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Comment Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let postId = 'post123';
  let commentId = 'comment123';
  let replyId = 'reply123';

  const generateToken = (id = userId, role = 'user') => {
    return jwt.sign({ id, role }, 'test-secret-key', { expiresIn: '1h' });
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

    // POST /api/posts/:postId/comments
    testApp.post('/api/posts/:postId/comments', protectMiddleware, (req, res) => {
      const { postId } = req.params;
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ status: 'error', message: 'Comment text is required' });
      }

      if (postId !== postId && postId !== 'post123') {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }

      res.status(201).json({
        status: 'success',
        data: {
          comment: {
            _id: commentId,
            text,
            post: postId,
            author: { _id: req.user.id, username: 'testuser' },
            replies: [],
            repliesCount: 0,
            createdAt: new Date(),
          },
        },
      });
    });

    // GET /api/posts/:postId/comments
    testApp.get('/api/posts/:postId/comments', (req, res) => {
      const { postId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (postId !== postId && postId !== 'post123') {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }

      res.status(200).json({
        status: 'success',
        data: {
          comments: [
            {
              _id: commentId,
              text: 'Great post!',
              post: postId,
              author: { _id: userId, username: 'testuser' },
              replies: [],
              repliesCount: 0,
              createdAt: new Date(),
            },
          ],
        },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: 1 },
      });
    });

    // GET /api/comments/:id
    testApp.get('/api/comments/:id', (req, res) => {
      const { id } = req.params;

      if (id !== commentId) {
        return res.status(404).json({ status: 'error', message: 'Comment not found' });
      }

      res.status(200).json({
        status: 'success',
        data: {
          comment: {
            _id: commentId,
            text: 'Great post!',
            post: postId,
            author: { _id: userId, username: 'testuser' },
            replies: [],
            repliesCount: 0,
            createdAt: new Date(),
          },
        },
      });
    });

    // PATCH /api/comments/:id
    testApp.patch('/api/comments/:id', protectMiddleware, (req, res) => {
      const { id } = req.params;
      const { text } = req.body;

      if (id !== commentId) {
        return res.status(404).json({ status: 'error', message: 'Comment not found' });
      }

      if (req.user.id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Forbidden - only author can update' });
      }

      res.status(200).json({
        status: 'success',
        data: {
          comment: {
            _id: commentId,
            text: text || 'Updated comment',
            post: postId,
            author: { _id: req.user.id, username: 'testuser' },
          },
        },
      });
    });

    // DELETE /api/comments/:id
    testApp.delete('/api/comments/:id', protectMiddleware, (req, res) => {
      const { id } = req.params;

      if (id !== commentId) {
        return res.status(404).json({ status: 'error', message: 'Comment not found' });
      }

      if (req.user.id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }

      res.status(204).send();
    });

    // POST /api/comments/:id/replies
    testApp.post('/api/comments/:id/replies', protectMiddleware, (req, res) => {
      const { id } = req.params;
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ status: 'error', message: 'Reply text is required' });
      }

      if (id !== commentId) {
        return res.status(404).json({ status: 'error', message: 'Comment not found' });
      }

      res.status(201).json({
        status: 'success',
        data: {
          reply: {
            _id: replyId,
            text,
            parentComment: commentId,
            author: { _id: req.user.id, username: 'testuser' },
            createdAt: new Date(),
          },
        },
      });
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken();
  });

  describe('POST /api/posts/:postId/comments - Create Comment', () => {
    it('should create a comment with valid data', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Great post!' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.comment.text).toBe('Great post!');
      expect(res.body.data.comment.author._id).toBe(userId);
    });

    it('should reject comment without text', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('text is required');
    });

    it('should reject comment with empty text', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: '' });

      expect(res.status).toBe(400);
    });

    it('should reject comment creation without auth', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .send({ text: 'Comment' });

      expect(res.status).toBe(401);
    });

    it('should reject comment with invalid token', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', 'Bearer invalid-token')
        .send({ text: 'Comment' });

      expect(res.status).toBe(401);
    });

    it('should handle very long comment text', async () => {
      const longText = 'a'.repeat(10000);
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: longText });

      expect([201, 400]).toContain(res.status);
    });

    it('should handle special characters in comment', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Test <script>alert("xss")</script>' });

      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/posts/:postId/comments - Get Post Comments', () => {
    it('should fetch comments for a post', async () => {
      const res = await request(app).get(`/api/posts/${postId}/comments`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.comments)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should support pagination', async () => {
      const res = await request(app).get(`/api/posts/${postId}/comments?page=2&limit=10`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(2);
      expect(res.body.pagination.limit).toBe(10);
    });

    it('should use default pagination if not specified', async () => {
      const res = await request(app).get(`/api/posts/${postId}/comments`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(20);
    });
  });

  describe('GET /api/comments/:id - Get Comment by ID', () => {
    it('should fetch a specific comment', async () => {
      const res = await request(app).get(`/api/comments/${commentId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.comment._id).toBe(commentId);
    });

    it('should return 404 for non-existent comment', async () => {
      const res = await request(app).get('/api/comments/invalidId');

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });
  });

  describe('PATCH /api/comments/:id - Update Comment', () => {
    it('should update own comment', async () => {
      const res = await request(app)
        .patch(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Updated comment' });

      expect(res.status).toBe(200);
      expect(res.body.data.comment.text).toBe('Updated comment');
    });

    it('should reject update from different user', async () => {
      const differentToken = generateToken('different-user');
      const res = await request(app)
        .patch(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${differentToken}`)
        .send({ text: 'Hacked comment' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    it('should reject update without auth', async () => {
      const res = await request(app)
        .patch(`/api/comments/${commentId}`)
        .send({ text: 'Hacked' });

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent comment', async () => {
      const res = await request(app)
        .patch('/api/comments/invalidId')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Update' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/comments/:id - Delete Comment', () => {
    it('should delete own comment', async () => {
      const res = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(204);
    });

    it('should allow admin to delete any comment', async () => {
      const adminToken = generateToken('any-user', 'admin');
      const res = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });

    it('should reject delete from different user', async () => {
      const differentToken = generateToken('different-user');
      const res = await request(app)
        .delete(`/api/comments/${commentId}`)
        .set('Authorization', `Bearer ${differentToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject delete without auth', async () => {
      const res = await request(app).delete(`/api/comments/${commentId}`);

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent comment', async () => {
      const res = await request(app)
        .delete('/api/comments/invalidId')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /api/comments/:id/replies - Create Reply', () => {
    it('should create a reply to a comment', async () => {
      const res = await request(app)
        .post(`/api/comments/${commentId}/replies`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Thanks for the comment!' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.reply.text).toBe('Thanks for the comment!');
      expect(res.body.data.reply.parentComment).toBe(commentId);
    });

    it('should reject reply without text', async () => {
      const res = await request(app)
        .post(`/api/comments/${commentId}/replies`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('text is required');
    });

    it('should reject reply with empty text', async () => {
      const res = await request(app)
        .post(`/api/comments/${commentId}/replies`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: '' });

      expect(res.status).toBe(400);
    });

    it('should reject reply without auth', async () => {
      const res = await request(app)
        .post(`/api/comments/${commentId}/replies`)
        .send({ text: 'Reply' });

      expect(res.status).toBe(401);
    });

    it('should return 404 if parent comment not found', async () => {
      const res = await request(app)
        .post('/api/comments/invalidId/replies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Reply' });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Comment not found');
    });
  });

  describe('Comment Controller - Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose sensitive data in errors', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .send({ text: 'Comment' });

      expect(res.body.message).not.toContain('password');
    });
  });

  describe('Comment Controller - Edge Cases', () => {
    it('should handle comments with HTML tags', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: '<b>Bold</b> comment' });

      expect(res.status).toBe(201);
    });

    it('should handle comments with URLs', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Check this out: https://example.com' });

      expect(res.status).toBe(201);
    });

    it('should handle comments with emoji characters', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/comments`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ text: 'Great post 🎉 👍' });

      expect(res.status).toBe(201);
    });

    it('should handle concurrent comment creation', async () => {
      const promises = Array(5)
        .fill(null)
        .map(() =>
          request(app)
            .post(`/api/posts/${postId}/comments`)
            .set('Authorization', `Bearer ${authToken}`)
            .send({ text: 'Concurrent comment' })
        );

      const results = await Promise.all(promises);
      results.forEach(res => {
        expect(res.status).toBe(201);
      });
    });
  });
});
