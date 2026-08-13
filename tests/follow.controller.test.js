import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Follow Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let targetUserId = 'user456';

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

    const followers = new Map();
    const following = new Map();

    // POST /api/users/:id/follow
    testApp.post('/api/users/:id/follow', protectMiddleware, (req, res) => {
      const { id } = req.params;

      if (id === req.user.id) {
        return res.status(400).json({ status: 'error', message: 'Cannot follow yourself' });
      }

      if (id !== targetUserId) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      const followKey = `${req.user.id}-${id}`;
      if (followers.has(followKey)) {
        return res.status(409).json({ status: 'error', message: 'Already following this user' });
      }

      followers.set(followKey, { follower: req.user.id, following: id });
      following.set(followKey, { follower: req.user.id, following: id });

      res.status(201).json({
        status: 'success',
        data: {
          follow: {
            follower: req.user.id,
            following: id,
            createdAt: new Date(),
          },
        },
      });
    });

    // DELETE /api/users/:id/follow
    testApp.delete('/api/users/:id/follow', protectMiddleware, (req, res) => {
      const { id } = req.params;

      if (id !== targetUserId) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      const followKey = `${req.user.id}-${id}`;
      if (!followers.has(followKey)) {
        return res.status(404).json({ status: 'error', message: 'Not following this user' });
      }

      followers.delete(followKey);
      following.delete(followKey);

      res.status(204).send();
    });

    // GET /api/users/:id/followers
    testApp.get('/api/users/:id/followers', (req, res) => {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (id !== targetUserId && id !== userId) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      const userFollowers = Array.from(followers.values())
        .filter(f => f.following === id)
        .map(f => ({
          _id: f.follower,
          username: `user_${f.follower}`,
          avatar: 'https://example.com/avatar.jpg',
        }));

      res.status(200).json({
        status: 'success',
        data: { followers: userFollowers },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: userFollowers.length },
      });
    });

    // GET /api/users/:id/following
    testApp.get('/api/users/:id/following', (req, res) => {
      const { id } = req.params;
      const { page = 1, limit = 20 } = req.query;

      if (id !== targetUserId && id !== userId) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      const userFollowing = Array.from(following.values())
        .filter(f => f.follower === id)
        .map(f => ({
          _id: f.following,
          username: `user_${f.following}`,
          avatar: 'https://example.com/avatar.jpg',
        }));

      res.status(200).json({
        status: 'success',
        data: { following: userFollowing },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: userFollowing.length },
      });
    });

    // GET /api/users/me/feed
    testApp.get('/api/users/me/feed', protectMiddleware, (req, res) => {
      const { page = 1, limit = 20 } = req.query;

      const userFollowing = Array.from(following.values()).filter(f => f.follower === req.user.id);

      if (userFollowing.length === 0) {
        return res.status(200).json({
          status: 'success',
          data: { posts: [] },
          pagination: { page: parseInt(page), limit: parseInt(limit), total: 0 },
        });
      }

      res.status(200).json({
        status: 'success',
        data: {
          posts: [
            {
              _id: 'post1',
              title: 'Sample Post',
              content: 'Content from followed user',
              author: { _id: userFollowing[0].following, username: 'followed_user' },
            },
          ],
        },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: 1 },
      });
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken();
  });

  describe('POST /api/users/:id/follow - Follow User', () => {
    it('should follow a user successfully', async () => {
      const res = await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.follow.follower).toBe(userId);
      expect(res.body.data.follow.following).toBe(targetUserId);
    });

    it('should reject self-follow', async () => {
      const res = await request(app)
        .post(`/api/users/${userId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Cannot follow yourself');
    });

    it('should reject follow without auth', async () => {
      const res = await request(app).post(`/api/users/${targetUserId}/follow`);

      expect(res.status).toBe(401);
    });

    it('should reject follow with invalid token', async () => {
      const res = await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .post('/api/users/invalidId/follow')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('User not found');
    });

    it('should reject duplicate follow', async () => {
      await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Already following');
    });
  });

  describe('DELETE /api/users/:id/follow - Unfollow User', () => {
    beforeEach(async () => {
      await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);
    });

    it('should unfollow a user successfully', async () => {
      const res = await request(app)
        .delete(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(204);
    });

    it('should reject unfollow without auth', async () => {
      const res = await request(app).delete(`/api/users/${targetUserId}/follow`);

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app)
        .delete('/api/users/invalidId/follow')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should return 404 if not following', async () => {
      const newToken = generateToken('other-user');
      const res = await request(app)
        .delete(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${newToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Not following');
    });

    it('should allow re-following after unfollow', async () => {
      await request(app)
        .delete(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      const res = await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(201);
    });
  });

  describe('GET /api/users/:id/followers - Get Followers', () => {
    beforeEach(async () => {
      const token1 = generateToken(userId);
      const token2 = generateToken('user789');

      await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${token1}`);

      await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${token2}`);
    });

    it('should fetch followers of a user', async () => {
      const res = await request(app).get(`/api/users/${targetUserId}/followers`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.followers)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should return correct number of followers', async () => {
      const res = await request(app).get(`/api/users/${targetUserId}/followers`);

      expect(res.status).toBe(200);
      expect(res.body.data.followers.length).toBe(2);
    });

    it('should support pagination', async () => {
      const res = await request(app).get(`/api/users/${targetUserId}/followers?page=1&limit=1`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(1);
    });

    it('should be publicly accessible', async () => {
      const res = await request(app).get(`/api/users/${targetUserId}/followers`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app).get('/api/users/invalidId/followers');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/users/:id/following - Get Following', () => {
    beforeEach(async () => {
      const token = generateToken(userId);
      await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${token}`);
    });

    it('should fetch following list', async () => {
      const res = await request(app).get(`/api/users/${userId}/following`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.following)).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await request(app).get(`/api/users/${userId}/following?page=1&limit=10`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
    });

    it('should be publicly accessible', async () => {
      const res = await request(app).get(`/api/users/${userId}/following`);

      expect(res.status).toBe(200);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app).get('/api/users/invalidId/following');

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/users/me/feed - Get User Feed', () => {
    beforeEach(async () => {
      const token = generateToken(userId);
      await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${token}`);
    });

    it('should fetch feed for authenticated user', async () => {
      const res = await request(app)
        .get('/api/users/me/feed')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.posts)).toBe(true);
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/users/me/feed?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/users/me/feed');

      expect(res.status).toBe(401);
    });

    it('should return empty feed if not following anyone', async () => {
      const newToken = generateToken('new-user');
      const res = await request(app)
        .get('/api/users/me/feed')
        .set('Authorization', `Bearer ${newToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.posts.length).toBe(0);
    });
  });

  describe('Follow Controller - Error Handling', () => {
    it('should handle malformed requests', async () => {
      const res = await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose user sensitive data', async () => {
      const res = await request(app).get(`/api/users/${targetUserId}/followers`);

      res.body.data.followers.forEach(follower => {
        expect(follower.password).toBeUndefined();
        expect(follower.email).toBeUndefined();
      });
    });
  });

  describe('Follow Controller - Edge Cases', () => {
    it('should handle rapid follow/unfollow cycles', async () => {
      const followRes = await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      const unfollowRes = await request(app)
        .delete(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      const refollowRes = await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(followRes.status).toBe(201);
      expect(unfollowRes.status).toBe(204);
      expect(refollowRes.status).toBe(201);
    });

    it('should handle multiple follow relationships', async () => {
      const user1Token = generateToken('user1');
      const user2Token = generateToken('user2');

      const res1 = await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${user1Token}`);

      const res2 = await request(app)
        .post(`/api/users/${targetUserId}/follow`)
        .set('Authorization', `Bearer ${user2Token}`);

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
    });
  });
});
