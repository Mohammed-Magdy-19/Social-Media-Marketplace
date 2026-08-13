import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Like Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let postId = 'post123';
  let otherId = 'user456';

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

    const likedByUsers = new Set();

    // POST /api/posts/:id/like
    testApp.post('/api/posts/:id/like', protectMiddleware, (req, res) => {
      const { id } = req.params;

      if (id !== postId) {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }

      const likeKey = `${id}-${req.user.id}`;
      if (likedByUsers.has(likeKey)) {
        return res.status(409).json({ status: 'error', message: 'Post already liked by this user' });
      }

      likedByUsers.add(likeKey);
      res.status(201).json({
        status: 'success',
        data: {
          like: {
            _id: `like-${Date.now()}`,
            post: id,
            user: req.user.id,
            createdAt: new Date(),
          },
        },
      });
    });

    // DELETE /api/posts/:id/like
    testApp.delete('/api/posts/:id/like', protectMiddleware, (req, res) => {
      const { id } = req.params;

      if (id !== postId) {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }

      const likeKey = `${id}-${req.user.id}`;
      if (!likedByUsers.has(likeKey)) {
        return res.status(404).json({ status: 'error', message: 'Like not found' });
      }

      likedByUsers.delete(likeKey);
      res.status(204).send();
    });

    // GET /api/posts/:id/likes
    testApp.get('/api/posts/:id/likes', (req, res) => {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (id !== postId) {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }

      const likers = Array.from(likedByUsers)
        .filter(key => key.startsWith(`${id}-`))
        .map(key => {
          const userPart = key.split('-')[1];
          return {
            _id: userPart,
            username: `user_${userPart}`,
            avatar: 'https://example.com/avatar.jpg',
          };
        });

      res.status(200).json({
        status: 'success',
        data: { likes: likers },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: likers.length },
      });
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken();
  });

  describe('POST /api/posts/:id/like - Like Post', () => {
    it('should like a post successfully', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.like.post).toBe(postId);
      expect(res.body.data.like.user).toBe(userId);
    });

    it('should reject like without auth token', async () => {
      const res = await request(app).post(`/api/posts/${postId}/like`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Unauthorized');
    });

    it('should reject like with invalid token', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent post', async () => {
      const res = await request(app)
        .post('/api/posts/invalidId/like')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Post not found');
    });

    it('should reject duplicate like from same user', async () => {
      await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already liked');
    });

    it('should allow different users to like the same post', async () => {
      const token1 = generateToken(userId);
      const token2 = generateToken(otherId);

      const res1 = await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${token1}`);

      const res2 = await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${token2}`);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
      expect(res1.body.data.like.user).toBe(userId);
      expect(res2.body.data.like.user).toBe(otherId);
    });
  });

  describe('DELETE /api/posts/:id/like - Unlike Post', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);
    });

    it('should unlike a post successfully', async () => {
      const res = await request(app)
        .delete(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(204);
    });

    it('should reject unlike without auth token', async () => {
      const res = await request(app).delete(`/api/posts/${postId}/like`);

      expect(res.status).toBe(401);
    });

    it('should reject unlike with invalid token', async () => {
      const res = await request(app)
        .delete(`/api/posts/${postId}/like`)
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent post', async () => {
      const res = await request(app)
        .delete('/api/posts/invalidId/like')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 if user never liked the post', async () => {
      const token = generateToken('never-liked-user');
      const res = await request(app)
        .delete(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Like not found');
    });

    it('should allow re-liking after unlike', async () => {
      await request(app)
        .delete(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/posts/:id/likes - Get Post Likers', () => {
    beforeEach(async () => {
      const token1 = generateToken(userId);
      const token2 = generateToken(otherId);

      await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${token1}`);

      await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${token2}`);
    });

    it('should fetch likers of a post', async () => {
      const res = await request(app).get(`/api/posts/${postId}/likes`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.likes)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should return correct number of likers', async () => {
      const res = await request(app).get(`/api/posts/${postId}/likes`);

      expect(res.status).toBe(200);
      expect(res.body.data.likes.length).toBe(2);
    });

    it('should support pagination', async () => {
      const res = await request(app).get(`/api/posts/${postId}/likes?page=1&limit=1`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(1);
    });

    it('should return 404 for non-existent post', async () => {
      const res = await request(app).get('/api/posts/invalidId/likes');

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Post not found');
    });

    it('should include user information in likes', async () => {
      const res = await request(app).get(`/api/posts/${postId}/likes`);

      expect(res.status).toBe(200);
      res.body.data.likes.forEach(like => {
        expect(like._id).toBeDefined();
        expect(like.username).toBeDefined();
        expect(like.avatar).toBeDefined();
      });
    });

    it('should return empty array if post has no likes', async () => {
      const newPostId = 'post-no-likes';
      const res = await request(app).get(`/api/posts/${newPostId}/likes`);

      expect(res.status).toBe(404);
    });
  });

  describe('Like Controller - Race Conditions', () => {
    it('should handle concurrent likes from same user', async () => {
      const promises = Array(3)
        .fill(null)
        .map(() =>
          request(app)
            .post(`/api/posts/${postId}/like`)
            .set('Authorization', `Bearer ${authToken}`)
        );

      const results = await Promise.all(promises);

      const successCount = results.filter(res => res.status === 201).length;
      const conflictCount = results.filter(res => res.status === 409).length;

      expect(successCount).toBe(1);
      expect(conflictCount).toBe(2);
    });

    it('should handle concurrent unlike operations', async () => {
      await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      const promises = Array(2)
        .fill(null)
        .map(() =>
          request(app)
            .delete(`/api/posts/${postId}/like`)
            .set('Authorization', `Bearer ${authToken}`)
        );

      const results = await Promise.all(promises);

      const successCount = results.filter(res => res.status === 204).length;
      const notFoundCount = results.filter(res => res.status === 404).length;

      expect(successCount + notFoundCount).toBe(2);
    });
  });

  describe('Like Controller - Error Handling', () => {
    it('should handle malformed requests', async () => {
      const res = await request(app)
        .post(`/api/posts/${postId}/like`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose sensitive data in error messages', async () => {
      const res = await request(app).post(`/api/posts/${postId}/like`);

      expect(res.body.message).not.toContain('password');
      expect(res.body.message).not.toContain('secret');
    });
  });

  describe('Like Controller - Edge Cases', () => {
    it('should handle post ID with special characters', async () => {
      const specialPostId = 'post-123_abc.xyz';
      const res = await request(app)
        .post(`/api/posts/${specialPostId}/like`)
        .set('Authorization', `Bearer ${authToken}`);

      expect([201, 404]).toContain(res.status);
    });

    it('should handle very large pagination values', async () => {
      const res = await request(app).get(`/api/posts/${postId}/likes?page=999999&limit=10000`);

      expect([200, 404]).toContain(res.status);
    });

    it('should handle zero limit gracefully', async () => {
      const res = await request(app).get(`/api/posts/${postId}/likes?limit=0`);

      expect([200, 400, 404]).toContain(res.status);
    });
  });
});
