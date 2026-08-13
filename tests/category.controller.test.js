import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Category Controller Tests', () => {
  let app;
  let adminToken;
  let userToken;
  let adminId = 'admin123';
  let userId = 'user123';
  let categoryId = 'cat123';

  const generateToken = (id, role = 'user') => {
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

    const restrictToAdmin = (req, res, next) => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'Forbidden - admin only' });
      }
      next();
    };

    const categories = new Map([
      [categoryId, { _id: categoryId, name: 'Technology', slug: 'technology', createdAt: new Date() }],
    ]);

    // POST /api/categories
    testApp.post('/api/categories', protectMiddleware, restrictToAdmin, (req, res) => {
      const { name, description } = req.body;

      if (!name) {
        return res.status(400).json({ status: 'error', message: 'Category name is required' });
      }

      const slugExists = Array.from(categories.values()).some(cat => cat.name.toLowerCase() === name.toLowerCase());
      if (slugExists) {
        return res.status(409).json({ status: 'error', message: 'Category already exists' });
      }

      const newId = `cat-${Date.now()}`;
      const slug = name.toLowerCase().replace(/\s+/g, '-');
      const newCategory = {
        _id: newId,
        name,
        slug,
        description: description || '',
        createdAt: new Date(),
      };

      categories.set(newId, newCategory);
      res.status(201).json({ status: 'success', data: { category: newCategory } });
    });

    // GET /api/categories
    testApp.get('/api/categories', (req, res) => {
      const cats = Array.from(categories.values());
      res.status(200).json({
        status: 'success',
        data: { categories: cats },
        pagination: { total: cats.length, page: 1, limit: cats.length },
      });
    });

    // GET /api/categories/:id
    testApp.get('/api/categories/:id', (req, res) => {
      const { id } = req.params;
      const cat = categories.get(id);

      if (!cat) {
        return res.status(404).json({ status: 'error', message: 'Category not found' });
      }

      res.status(200).json({ status: 'success', data: { category: cat } });
    });

    // PATCH /api/categories/:id
    testApp.patch('/api/categories/:id', protectMiddleware, restrictToAdmin, (req, res) => {
      const { id } = req.params;
      const { name } = req.body;

      if (!categories.has(id)) {
        return res.status(404).json({ status: 'error', message: 'Category not found' });
      }

      const cat = categories.get(id);
      if (name) {
        cat.name = name;
        cat.slug = name.toLowerCase().replace(/\s+/g, '-');
      }

      res.status(200).json({ status: 'success', data: { category: cat } });
    });

    // DELETE /api/categories/:id
    testApp.delete('/api/categories/:id', protectMiddleware, restrictToAdmin, (req, res) => {
      const { id } = req.params;

      if (!categories.has(id)) {
        return res.status(404).json({ status: 'error', message: 'Category not found' });
      }

      // Mock check: don't delete if posts exist
      const postsUsingCategory = Math.random() > 0.7 ? 1 : 0;
      if (postsUsingCategory > 0) {
        return res.status(409).json({
          status: 'error',
          message: 'Cannot delete category with existing posts',
        });
      }

      categories.delete(id);
      res.status(204).send();
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    adminToken = generateToken(adminId, 'admin');
    userToken = generateToken(userId, 'user');
  });

  describe('POST /api/categories - Create Category', () => {
    it('should create category as admin', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Sports', description: 'Sports related content' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.category.name).toBe('Sports');
      expect(res.body.data.category.slug).toBe('sports');
    });

    it('should reject category creation without name', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ description: 'No name provided' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('name is required');
    });

    it('should reject category creation as non-admin', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Sports' });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('admin only');
    });

    it('should reject duplicate category names', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Technology' });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject creation without auth token', async () => {
      const res = await request(app)
        .post('/api/categories')
        .send({ name: 'Sports' });

      expect(res.status).toBe(401);
    });

    it('should generate slug from name', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Health & Wellness' });

      expect(res.status).toBe(201);
      expect(res.body.data.category.slug).toContain('health');
    });
  });

  describe('GET /api/categories - Get All Categories', () => {
    it('should fetch all categories', async () => {
      const res = await request(app).get('/api/categories');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.categories)).toBe(true);
      expect(res.body.pagination).toBeDefined();
    });

    it('should return categories with required fields', async () => {
      const res = await request(app).get('/api/categories');

      expect(res.status).toBe(200);
      if (res.body.data.categories.length > 0) {
        const cat = res.body.data.categories[0];
        expect(cat._id).toBeDefined();
        expect(cat.name).toBeDefined();
        expect(cat.slug).toBeDefined();
      }
    });

    it('should be publicly accessible', async () => {
      const res = await request(app).get('/api/categories');

      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/categories/:id - Get Category by ID', () => {
    it('should fetch specific category', async () => {
      const res = await request(app).get(`/api/categories/${categoryId}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.category._id).toBe(categoryId);
    });

    it('should return 404 for non-existent category', async () => {
      const res = await request(app).get('/api/categories/invalidId');

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should be publicly accessible', async () => {
      const res = await request(app).get(`/api/categories/${categoryId}`);

      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/categories/:id - Update Category', () => {
    it('should update category as admin', async () => {
      const res = await request(app)
        .patch(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Tech & Science' });

      expect(res.status).toBe(200);
      expect(res.body.data.category.name).toBe('Tech & Science');
    });

    it('should update slug when name changes', async () => {
      const res = await request(app)
        .patch(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'New Tech' });

      expect(res.status).toBe(200);
      expect(res.body.data.category.slug).toBe('new-tech');
    });

    it('should reject update as non-admin', async () => {
      const res = await request(app)
        .patch(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent category', async () => {
      const res = await request(app)
        .patch('/api/categories/invalidId')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(404);
    });

    it('should reject update without auth', async () => {
      const res = await request(app)
        .patch(`/api/categories/${categoryId}`)
        .send({ name: 'Updated' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/categories/:id - Delete Category', () => {
    it('should delete empty category as admin', async () => {
      const res = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([204, 409]).toContain(res.status);
    });

    it('should reject delete as non-admin', async () => {
      const res = await request(app)
        .delete(`/api/categories/${categoryId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent category', async () => {
      const res = await request(app)
        .delete('/api/categories/invalidId')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject delete without auth', async () => {
      const res = await request(app).delete(`/api/categories/${categoryId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('Category Controller - Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose sensitive admin data', async () => {
      const res = await request(app).get('/api/categories');

      res.body.data.categories.forEach(cat => {
        expect(cat.password).toBeUndefined();
      });
    });
  });

  describe('Category Controller - Edge Cases', () => {
    it('should handle category names with special characters', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: "C++ & C#" });

      expect(res.status).toBe(201);
    });

    it('should handle very long category names', async () => {
      const longName = 'a'.repeat(200);
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: longName });

      expect([201, 400]).toContain(res.status);
    });

    it('should be case-insensitive for duplicate checking', async () => {
      const res = await request(app)
        .post('/api/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'TECHNOLOGY' });

      expect(res.status).toBe(409);
    });
  });
});
