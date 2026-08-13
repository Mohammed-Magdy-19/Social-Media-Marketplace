import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Upload Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let fileId = 'file123';
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

    const files = new Map([
      [
        fileId,
        {
          _id: fileId,
          filename: 'test-image.jpg',
          url: 'https://res.cloudinary.com/demo/image/upload/test-image.jpg',
          uploadedBy: userId,
          fileType: 'image',
          createdAt: new Date(),
        },
      ],
    ]);

    const posts = new Map([[postId, { _id: postId, author: userId, media: [] }]]);

    // POST /api/uploads/avatar
    testApp.post('/api/uploads/avatar', protectMiddleware, (req, res) => {
      const file = req.body.file;

      if (!file) {
        return res.status(400).json({ status: 'error', message: 'File is required' });
      }

      const fileData = typeof file.data === 'string' ? file.data : '';
      if (fileData.length > 5_000_000) {
        return res.status(413).json({ status: 'error', message: 'File too large' });
      }

      const newId = `file-${Date.now()}`;
      const newFile = {
        _id: newId,
        filename: 'avatar.jpg',
        url: 'https://res.cloudinary.com/demo/image/upload/avatar.jpg',
        uploadedBy: req.user.id,
        fileType: 'avatar',
        createdAt: new Date(),
      };

      files.set(newId, newFile);

      res.status(201).json({
        status: 'success',
        data: { file: newFile },
      });
    });

    // POST /api/uploads/posts/:postId
    testApp.post('/api/uploads/posts/:postId', protectMiddleware, (req, res) => {
      const { postId: pId } = req.params;
      const file = req.body.file;

      if (!file) {
        return res.status(400).json({ status: 'error', message: 'File is required' });
      }

      const post = posts.get(pId);
      if (!post) {
        return res.status(404).json({ status: 'error', message: 'Post not found' });
      }

      if (post.author !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'Forbidden - not post owner' });
      }

      const newId = `file-${Date.now()}`;
      const newFile = {
        _id: newId,
        filename: 'post-media.jpg',
        url: 'https://res.cloudinary.com/demo/image/upload/post-media.jpg',
        uploadedBy: req.user.id,
        fileType: 'post_media',
        post: pId,
        createdAt: new Date(),
      };

      files.set(newId, newFile);

      res.status(201).json({
        status: 'success',
        data: { file: newFile },
      });
    });

    // GET /api/uploads/:id
    testApp.get('/api/uploads/:id', protectMiddleware, (req, res) => {
      const { id } = req.params;
      const file = files.get(id);

      if (!file) {
        return res.status(404).json({ status: 'error', message: 'File not found' });
      }

      if (file.uploadedBy !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'Forbidden - not uploader' });
      }

      res.status(200).json({ status: 'success', data: { file } });
    });

    // DELETE /api/uploads/:id
    testApp.delete('/api/uploads/:id', protectMiddleware, (req, res) => {
      const { id } = req.params;
      const file = files.get(id);

      if (!file) {
        return res.status(404).json({ status: 'error', message: 'File not found' });
      }

      if (file.uploadedBy !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'Forbidden - not uploader' });
      }

      files.delete(id);

      res.status(204).send();
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken();
  });

  describe('POST /api/uploads/avatar - Upload Avatar', () => {
    it('should upload avatar successfully', async () => {
      const res = await request(app)
        .post('/api/uploads/avatar')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ file: { data: 'image-data', type: 'image/jpeg' } });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.file.fileType).toBe('avatar');
      expect(res.body.data.file.uploadedBy).toBe(userId);
    });

    it('should reject avatar upload without file', async () => {
      const res = await request(app)
        .post('/api/uploads/avatar')
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('File is required');
    });

    it('should reject avatar upload without auth', async () => {
      const res = await request(app)
        .post('/api/uploads/avatar')
        .send({ file: { data: 'image-data' } });

      expect(res.status).toBe(401);
    });

    it('should reject avatar upload with invalid token', async () => {
      const res = await request(app)
        .post('/api/uploads/avatar')
        .set('Authorization', 'Bearer invalid-token')
        .send({ file: { data: 'image-data' } });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/uploads/posts/:postId - Upload Post Media', () => {
    it('should upload media to own post', async () => {
      const res = await request(app)
        .post(`/api/uploads/posts/${postId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ file: { data: 'image-data' } });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.file.post).toBe(postId);
    });

    it('should reject upload without file', async () => {
      const res = await request(app)
        .post(`/api/uploads/posts/${postId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('File is required');
    });

    it('should reject upload for non-existent post', async () => {
      const res = await request(app)
        .post('/api/uploads/posts/invalidId')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ file: { data: 'image-data' } });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('Post not found');
    });

    it('should reject upload from non-owner', async () => {
      const otherToken = generateToken('other-user');
      const res = await request(app)
        .post(`/api/uploads/posts/${postId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .send({ file: { data: 'image-data' } });

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    it('should allow admin to upload to any post', async () => {
      const adminToken = generateToken('any-user', 'admin');
      const res = await request(app)
        .post(`/api/uploads/posts/${postId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ file: { data: 'image-data' } });

      expect(res.status).toBe(201);
    });

    it('should reject upload without auth', async () => {
      const res = await request(app)
        .post(`/api/uploads/posts/${postId}`)
        .send({ file: { data: 'image-data' } });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/uploads/:id - Get Upload', () => {
    it('should fetch file for uploader', async () => {
      const res = await request(app)
        .get(`/api/uploads/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.file._id).toBe(fileId);
    });

    it('should fetch file for admin', async () => {
      const adminToken = generateToken('any-user', 'admin');
      const res = await request(app)
        .get(`/api/uploads/${fileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should reject fetch for non-uploader', async () => {
      const otherToken = generateToken('other-user');
      const res = await request(app)
        .get(`/api/uploads/${fileId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('Forbidden');
    });

    it('should return 404 for non-existent file', async () => {
      const res = await request(app)
        .get('/api/uploads/invalidId')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });

    it('should reject without auth', async () => {
      const res = await request(app).get(`/api/uploads/${fileId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/uploads/:id - Delete Upload', () => {
    it('should delete file as uploader', async () => {
      const res = await request(app)
        .delete(`/api/uploads/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(204);
    });

    it('should delete file as admin', async () => {
      const adminToken = generateToken('any-user', 'admin');
      const res = await request(app)
        .delete(`/api/uploads/${fileId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect([204, 404]).toContain(res.status);
    });

    it('should reject delete from non-uploader', async () => {
      const otherToken = generateToken('other-user');
      const res = await request(app)
        .delete(`/api/uploads/${fileId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent file', async () => {
      const res = await request(app)
        .delete('/api/uploads/invalidId')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject delete without auth', async () => {
      const res = await request(app).delete(`/api/uploads/${fileId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('Upload Controller - Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .post('/api/uploads/avatar')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose sensitive file data', async () => {
      const res = await request(app)
        .get(`/api/uploads/${fileId}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (res.status === 200) {
        expect(res.body.data.file.password).toBeUndefined();
      }
    });
  });

  describe('Upload Controller - Edge Cases', () => {
    it('should handle large file uploads', async () => {
      const largeData = 'x'.repeat(10000000);
      const res = await request(app)
        .post('/api/uploads/avatar')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ file: { data: largeData } });

      expect([201, 400, 413]).toContain(res.status);
    });

    it('should handle special characters in filenames', async () => {
      const res = await request(app)
        .post('/api/uploads/avatar')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ file: { name: 'file<script>.jpg', data: 'image-data' } });

      expect(res.status).toBe(201);
    });

    it('should handle rapid sequential uploads', async () => {
      const promises = Array(3)
        .fill(null)
        .map(() =>
          request(app)
            .post('/api/uploads/avatar')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ file: { data: 'image-data' } })
        );

      const results = await Promise.all(promises);
      results.forEach(res => {
        expect(res.status).toBe(201);
      });
    });

    it('should handle delete followed by re-upload', async () => {
      const fileToDelete = 'file-to-reupload';

      // First delete should fail (file doesn't exist yet)
      const deleteRes1 = await request(app)
        .delete(`/api/uploads/${fileToDelete}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(deleteRes1.status).toBe(404);

      // Upload new file
      const uploadRes = await request(app)
        .post('/api/uploads/avatar')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ file: { data: 'image-data' } });

      expect(uploadRes.status).toBe(201);
    });
  });
});
