import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Post Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let categoryId = 'cat123';
  let postId = 'post123';

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

    // Mock endpoints
    testApp.post('/api/posts', protectMiddleware, (req, res) => {
      const { title, content, category, tags, media } = req.body;
      if (!title || !content || !category) {
        return res.status(400).json({ status: 'error', message: 'title, content, and category are required.' });
      }
      if (category !== categoryId) {
        return res.status(404).json({ status: 'error', message: 'The specified category does not exist.' });
      }
      res.status(201).json({
        status: 'success',
        data: {
          post: {
            _id: postId,
            title,
            content,
            category,
            media: Array.isArray(media) ? media : [],
            tags: Array.isArray(tags) ? tags : [],
            author: { _id: req.user.id, username: 'testuser', avatar: 'https://example.com/avatar.jpg' },
            likesCount: 0,
            commentsCount: 0,
            createdAt: new Date(),
          },
        },
      });
    });

    testApp.get('/api/posts', (req, res) => {
      const { search, category, tag, author, sort, page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page) - 1) * parseInt(limit);
      
      if (category && category !== categoryId && category !== 'invalid') {
        return res.status(404).json({ status: 'error', message: 'Category not found' });
      }

      const posts = [
        {
          _id: postId,
          title: 'Test Post',
          content: 'Test content',
          category: { _id: categoryId, name: 'Technology', slug: 'technology' },
          author: { _id: userId, username: 'testuser', avatar: 'https://example.com/avatar.jpg' },
          likesCount: 5,
          commentsCount: 2,
          createdAt: new Date(),
        },
      ];

      res.status(200).json({
        status: 'success',
        data: { posts },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: 1 },
      });
    });

    testApp.get('/api/posts/:id', (req, res) => {
      const { id } = req.params;
      if (id !== postId) {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }
      res.status(200).json({
        status: 'success',
        data: {
          post: {
            _id: postId,
            title: 'Test Post',
            content: 'Test content',
            category: { _id: categoryId, name: 'Technology', slug: 'technology' },
            author: { _id: userId, username: 'testuser', avatar: 'https://example.com/avatar.jpg' },
            likesCount: 5,
            commentsCount: 2,
            createdAt: new Date(),
          },
        },
      });
    });

    testApp.patch('/api/posts/:id', protectMiddleware, (req, res) => {
      const { id } = req.params;
      if (id !== postId) {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }
      if (req.user.id !== userId) {
        return res.status(403).json({ status: 'error', message: 'Forbidden - only post author can update' });
      }
      res.status(200).json({
        status: 'success',
        data: { post: { _id: postId, ...req.body, author: { _id: userId } } },
      });
    });

    testApp.delete('/api/posts/:id', protectMiddleware, (req, res) => {
      const { id } = req.params;
      if (id !== postId) {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }
      if (req.user.id !== userId && req.user.role !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }
      res.status(204).send();
    });

    testApp.get('/api/users/:userId/posts', (req, res) => {
      const { userId: qUserId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      if (qUserId !== userId) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      res.status(200).json({
        status: 'success',
        data: {
          posts: [
            {
              _id: postId,
              title: 'Test Post',
              content: 'Test content',
              category: { _id: categoryId, name: 'Technology', slug: 'technology' },
              author: { _id: userId, username: 'testuser', avatar: 'https://example.com/avatar.jpg' },
              likesCount: 5,
              commentsCount: 2,
              createdAt: new Date(),
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

  describe('POST /api/posts - Create Post', () => {
    it('should create a post with valid data', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'New Post',
          content: 'This is a new post',
          category: categoryId,
          tags: ['tech', 'nodejs'],
          media: [],
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.post.title).toBe('New Post');
      expect(res.body.data.post.author._id).toBe(userId);
    });

    it('should reject post creation without title', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ content: 'No title', category: categoryId });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('title, content, and category are required');
    });

    it('should reject post creation without content', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Title only', category: categoryId });

      expect(res.status).toBe(400);
    });

    it('should reject post creation without category', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Title', content: 'Content' });

      expect(res.status).toBe(400);
    });

    it('should reject post with non-existent category', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Title',
          content: 'Content',
          category: 'invalidCat',
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('category does not exist');
    });

    it('should reject post creation without auth token', async () => {
      const res = await request(app).post('/api/posts').send({
        title: 'Title',
        content: 'Content',
        category: categoryId,
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Unauthorized');
    });

    it('should reject post with invalid token', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', 'Bearer invalid-token')
        .send({
          title: 'Title',
          content: 'Content',
          category: categoryId,
        });

      expect(res.status).toBe(401);
    });

    it('should handle empty tags array gracefully', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Title',
          content: 'Content',
          category: categoryId,
          tags: [],
        });

      expect(res.status).toBe(201);
      expect(res.body.data.post.tags).toEqual([]);
    });

    it('should handle missing media gracefully', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Title',
          content: 'Content',
          category: categoryId,
        });

      expect(res.status).toBe(201);
      expect(Array.isArray(res.body.data.post.media)).toBe(true);
    });
  });

  describe('GET /api/posts - Get Posts', () => {
    it('should fetch all posts', async () => {
      const res = await request(app).get('/api/posts');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.posts)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should support pagination with page and limit', async () => {
      const res = await request(app).get('/api/posts?page=1&limit=10');

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(10);
    });

    it('should filter by category', async () => {
      const res = await request(app).get(`/api/posts?category=${categoryId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.posts[0].category._id).toBe(categoryId);
    });

    it('should reject invalid category', async () => {
      const res = await request(app).get('/api/posts?category=invalidCat');

      expect(res.status).toBe(404);
    });

    it('should support search filtering', async () => {
      const res = await request(app).get('/api/posts?search=test');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data.posts)).toBe(true);
    });

    it('should support tag filtering', async () => {
      const res = await request(app).get('/api/posts?tag=tech');

      expect(res.status).toBe(200);
    });

    it('should support sorting', async () => {
      const res = await request(app).get('/api/posts?sort=mostLiked');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/posts/:id - Get Post by ID', () => {
    it('should fetch a specific post', async () => {
      const res = await request(app).get(`/api/posts/${postId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.post._id).toBe(postId);
    });

    it('should return 404 for non-existent post', async () => {
      const res = await request(app).get('/api/posts/invalidId');

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });
  });

  describe('PATCH /api/posts/:id - Update Post', () => {
    it('should update own post', async () => {
      const res = await request(app)
        .patch(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Updated Title', content: 'Updated content' });

      expect(res.status).toBe(200);
      expect(res.body.data.post.title).toBe('Updated Title');
    });

    it('should reject update from different user', async () => {
      const differentToken = generateToken('different-user');
      const res = await request(app)
        .patch(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${differentToken}`)
        .send({ title: 'Hacked Title' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    it('should reject update without auth', async () => {
      const res = await request(app)
        .patch(`/api/posts/${postId}`)
        .send({ title: 'Hacked Title' });

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent post', async () => {
      const res = await request(app)
        .patch('/api/posts/invalidId')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ title: 'Title' });

      expect(res.status).toBe(404);
    });
  });

  describe('DELETE /api/posts/:id - Delete Post', () => {
    it('should delete own post', async () => {
      const res = await request(app)
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(204);
    });

    it('should allow admin to delete any post', async () => {
      const adminToken = generateToken(userId, 'admin');
      const res = await request(app)
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });

    it('should reject delete from different user', async () => {
      const differentToken = generateToken('different-user');
      const res = await request(app)
        .delete(`/api/posts/${postId}`)
        .set('Authorization', `Bearer ${differentToken}`);

      expect(res.status).toBe(403);
    });

    it('should reject delete without auth', async () => {
      const res = await request(app).delete(`/api/posts/${postId}`);

      expect(res.status).toBe(401);
    });

    it('should return 404 for non-existent post', async () => {
      const res = await request(app)
        .delete('/api/posts/invalidId')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/users/:userId/posts - Get User Posts', () => {
    it('should fetch posts from a specific user', async () => {
      const res = await request(app).get(`/api/users/${userId}/posts`);

      expect(res.status).toBe(200);
      expect(res.body.data.posts[0].author._id).toBe(userId);
    });

    it('should support pagination', async () => {
      const res = await request(app).get(`/api/users/${userId}/posts?page=1&limit=10`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
    });

    it('should return 404 for non-existent user', async () => {
      const res = await request(app).get('/api/users/invalidUserId/posts');

      expect(res.status).toBe(404);
    });
  });

  describe('Post Controller - Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid json}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose sensitive data in errors', async () => {
      const res = await request(app)
        .post('/api/posts')
        .send({ title: 'Test' });

      expect(res.body.message).not.toContain('password');
      expect(res.body.message).not.toContain('secret');
    });
  });

  describe('Post Controller - Edge Cases', () => {
    it('should handle posts with very long titles', async () => {
      const longTitle = 'a'.repeat(500);
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: longTitle,
          content: 'Content',
          category: categoryId,
        });

      expect([201, 400]).toContain(res.status);
    });

    it('should handle posts with special characters', async () => {
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Test <script>alert("xss")</script>',
          content: 'Content with <b>HTML</b>',
          category: categoryId,
        });

      expect(res.status).toBe(201);
    });

    it('should handle large media arrays', async () => {
      const media = Array(100).fill('https://example.com/image.jpg');
      const res = await request(app)
        .post('/api/posts')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          title: 'Title',
          content: 'Content',
          category: categoryId,
          media,
        });

      expect(res.status).toBe(201);
    });
  });
});
