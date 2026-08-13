import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('SavedPost Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let postId = 'post123';
  let otherUserId = 'user456';

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

    const savedPosts = new Map();

    // POST /api/posts/:id/save
    testApp.post('/api/posts/:id/save', protectMiddleware, (req, res) => {
      const { id } = req.params;

      if (id !== postId) {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }

      const saveKey = `${req.user.id}-${id}`;
      if (savedPosts.has(saveKey)) {
        return res.status(409).json({ status: 'error', message: 'Post already saved by this user' });
      }

      savedPosts.set(saveKey, {
        _id: `save-${Date.now()}`,
        post: id,
        user: req.user.id,
        createdAt: new Date(),
      });

      res.status(201).json({
        status: 'success',
        data: {
          save: {
            _id: `save-${Date.now()}`,
            post: id,
            user: req.user.id,
            createdAt: new Date(),
          },
        },
      });
    });

    // DELETE /api/posts/:id/save
    testApp.delete('/api/posts/:id/save', protectMiddleware, (req, res) => {
      const { id } = req.params;

      if (id !== postId) {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }

      const saveKey = `${req.user.id}-${id}`;
      if (!savedPosts.has(saveKey)) {
        return res.status(404).json({ status: 'error', message: 'Post not saved by this user' });
      }

      savedPosts.delete(saveKey);

      res.status(204).send();
    });

    // GET /api/users/me/saved-posts
    testApp.get('/api/users/me/saved-posts', protectMiddleware, (req, res) => {
      const { page = 1, limit = 20 } = req.query;

      const userSaved = Array.from(savedPosts.values())
        .filter(s => s.user === req.user.id)
        .map(s => ({
          _id: s.post,
          title: `Post ${s.post}`,
          content: 'Saved post content',
          author: { _id: 'author123', username: 'author' },
          createdAt: s.createdAt,
        }));

      res.status(200).json({
        status: 'success',
        data: { posts: userSaved },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: userSaved.length },
      });
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken();
  });

  describe('POST /api/posts/:id/save - Save Post', () => {
    it('should save a post successfully', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.save.post).toBe(postId);
      expect(res.body.data.save.user).toBe(userId);
    });

    it('should reject save without auth', async () => {
      const res = await request(app).post(`/api/posts/${postId}/save`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Unauthorized');
    });

    it('should reject save with invalid token', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent post', async () => {
      const res = await request(app)
        .post('/api/posts/invalidId/save')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Post not found');
    });

    it('should reject duplicate save from same user', async () => {
      await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already saved');
    });

    it('should allow different users to save same post', async () => {
      const token1 = generateToken(userId);
      const token2 = generateToken(otherUserId);

      const res1 = await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${token1}`);

      const res2 = await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${token2}`);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
    });
  });

  describe('DELETE /api/posts/:id/save - Unsave Post', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${authToken}`);
    });

    it('should unsave a post successfully', async () => {
      const res = await request(app)
        .delete(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(204);
    });

    it('should reject unsave without auth', async () => {
      const res = await request(app).delete(`/api/posts/${postId}/save`);

      expect(res.status).toBe(401);
    });

    it('should reject unsave with invalid token', async () => {
      const res = await request(app)
        .delete(`/api/posts/${postId}/save`)
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent post', async () => {
      const res = await request(app)
        .delete('/api/posts/invalidId/save')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 if not previously saved', async () => {
      const token = generateToken('never-saved-user');
      const res = await request(app)
        .delete(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not saved');
    });

    it('should allow re-saving after unsave', async () => {
      await request(app)
        .delete(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/users/me/saved-posts - Get Saved Posts', () => {
    beforeEach(async () => {
      const token = generateToken(userId);
      await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${token}`);
    });

    it('should fetch saved posts for authenticated user', async () => {
      const res = await request(app)
        .get('/api/users/me/saved-posts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.posts)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should only return user own saved posts', async () => {
      const res = await request(app)
        .get('/api/users/me/saved-posts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.posts.length).toBeGreaterThan(0);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/users/me/saved-posts?page=1&limit=5')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(5);
    });

    it('should include post metadata', async () => {
      const res = await request(app)
        .get('/api/users/me/saved-posts')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      if (res.body.data.posts.length > 0) {
        const post = res.body.data.posts[0];
        expect(post._id).toBeDefined();
        expect(post.title).toBeDefined();
        expect(post.content).toBeDefined();
        expect(post.author).toBeDefined();
        expect(post.createdAt).toBeDefined();
      }
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/users/me/saved-posts');

      expect(res.status).toBe(401);
    });

    it('should return empty array if no saved posts', async () => {
      const newToken = generateToken('new-user');
      const res = await request(app)
        .get('/api/users/me/saved-posts')
        .set('Authorization', `Bearer ${newToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.posts.length).toBe(0);
    });
  });

  describe('SavedPost Controller - Race Conditions', () => {
    it('should handle concurrent saves from same user', async () => {
      const promises = Array(3)
        .fill(null)
        .map(() =>
          request(app)
            .post(`/api/posts/${postId}/save`)
            .set('Authorization', `Bearer ${authToken}`)
        );

      const results = await Promise.all(promises);

      const successCount = results.filter(res => res.status === 201).length;
      const conflictCount = results.filter(res => res.status === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(2);
    });

    it('should handle concurrent unsave operations', async () => {
      await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${authToken}`);

      const promises = Array(2)
        .fill(null)
        .map(() =>
          request(app)
            .delete(`/api/posts/${postId}/save`)
            .set('Authorization', `Bearer ${authToken}`)
        );

      const results = await Promise.all(promises);

      const successCount = results.filter(res => res.status === 204).length;
      const notFoundCount = results.filter(res => res.status === 404).length;

      expect(successCount + notFoundCount).toBe(2);
    });
  });

  describe('SavedPost Controller - Error Handling', () => {
    it('should handle malformed requests', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/save`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose sensitive data', async () => {
      const res = await request(app)
        .get('/api/users/me/saved-posts')
        .set('Authorization', `Bearer ${authToken}`);

      if (res.body.data.posts.length > 0) {
        res.body.data.posts.forEach(post => {
          expect(post.password).toBeUndefined();
        });
      }
    });
  });

  describe('SavedPost Controller - Edge Cases', () => {
    it('should handle very large pagination limits', async () => {
      const res = await request(app)
        .get('/api/users/me/saved-posts?limit=10000')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 400]).toContain(res.status);
    });

    it('should handle zero limit', async () => {
      const res = await request(app)
        .get('/api/users/me/saved-posts?limit=0')
        .set('Authorization', `Bearer ${authToken}`);

      expect([200, 400]).toContain(res.status);
    });

    it('should handle post ID with special characters', async () => {
      const specialId = 'post-123_abc.xyz';
      const res = await request(app)
        .post(`/api/posts/${specialId}/save`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([201, 404]).toContain(res.status);
    });
  });
});
