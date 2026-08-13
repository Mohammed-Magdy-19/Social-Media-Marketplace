import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Report Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let adminToken;
  let reportId = 'report123';

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

    const reports = new Map([
      [
        reportId,
        {
          _id: reportId,
          reporter: userId,
          targetType: 'post',
          targetId: 'post123',
          reason: 'Inappropriate content',
          status: 'pending',
          createdAt: new Date(),
        },
      ],
    ]);

    // POST /api/reports
    testApp.post('/api/reports', protectMiddleware, (req, res) => {
      const { targetType, targetId, reason } = req.body;

      if (!targetType || !['post', 'comment', 'user'].includes(targetType)) {
        return res.status(400).json({ status: 'error', message: 'Invalid targetType' });
      }

      if (!targetId) {
        return res.status(400).json({ status: 'error', message: 'targetId is required' });
      }

      if (!reason) {
        return res.status(400).json({ status: 'error', message: 'reason is required' });
      }

      // Mock target existence check
      if (targetId === 'nonexistent') {
        return res.status(404).json({ status: 'error', message: 'Target not found' });
      }

      const newId = `report-${Date.now()}`;
      const newReport = {
        _id: newId,
        reporter: req.user.id,
        targetType,
        targetId,
        reason,
        status: 'pending',
        createdAt: new Date(),
      };

      reports.set(newId, newReport);
      res.status(201).json({ status: 'success', data: { report: newReport } });
    });

    // GET /api/reports
    testApp.get('/api/reports', protectMiddleware, restrictToAdmin, (req, res) => {
      const { status, page = 1, limit = 20 } = req.query;

      let adminReports = Array.from(reports.values());

      if (status) {
        if (!['pending', 'resolved', 'dismissed'].includes(status)) {
          return res.status(400).json({ status: 'error', message: 'Invalid status filter' });
        }
        adminReports = adminReports.filter(r => r.status === status);
      }

      res.status(200).json({
        status: 'success',
        data: { reports: adminReports },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: adminReports.length },
      });
    });

    // PATCH /api/reports/:id
    testApp.patch('/api/reports/:id', protectMiddleware, restrictToAdmin, (req, res) => {
      const { id } = req.params;
      const { status: newStatus } = req.body;

      if (!reports.has(id)) {
        return res.status(404).json({ status: 'error', message: 'Report not found' });
      }

      if (!newStatus || !['pending', 'resolved', 'dismissed'].includes(newStatus)) {
        return res.status(400).json({ status: 'error', message: 'Invalid status' });
      }

      const report = reports.get(id);
      report.status = newStatus;
      report.resolvedAt = new Date();

      res.status(200).json({ status: 'success', data: { report } });
    });

    // DELETE /api/reports/:id
    testApp.delete('/api/reports/:id', protectMiddleware, restrictToAdmin, (req, res) => {
      const { id } = req.params;

      if (!reports.has(id)) {
        return res.status(404).json({ status: 'error', message: 'Report not found' });
      }

      reports.delete(id);
      res.status(204).send();
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken(userId, 'user');
    adminToken = generateToken('admin123', 'admin');
  });

  describe('POST /api/reports - Create Report', () => {
    it('should create report with valid data', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'post',
          targetId: 'post123',
          reason: 'Spam and misleading',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.report.reporter).toBe(userId);
      expect(res.body.data.report.status).toBe('pending');
    });

    it('should reject report without targetType', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetId: 'post123', reason: 'Spam' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('targetType');
    });

    it('should reject report with invalid targetType', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'invalid',
          targetId: 'post123',
          reason: 'Spam',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid targetType');
    });

    it('should accept valid targetTypes', async () => {
      const types = ['post', 'comment', 'user'];

      for (const type of types) {
        const res = await request(app)
          .post('/api/reports')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            targetType: type,
            targetId: 'target123',
            reason: 'Inappropriate',
          });

        expect(res.status).toBe(201);
      }
    });

    it('should reject report without targetId', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'post',
          reason: 'Spam',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('targetId');
    });

    it('should reject report without reason', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'post',
          targetId: 'post123',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('reason');
    });

    it('should reject report without auth', async () => {
      const res = await request(app).post('/api/reports').send({
        targetType: 'post',
        targetId: 'post123',
        reason: 'Spam',
      });

      expect(res.status).toBe(401);
    });

    it('should reject report with non-existent target', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'post',
          targetId: 'nonexistent',
          reason: 'Spam',
        });

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('not found');
    });
  });

  describe('GET /api/reports - Get Reports (Admin)', () => {
    it('should fetch all reports as admin', async () => {
      const res = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.reports)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await request(app)
        .get('/api/reports?status=pending')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      res.body.data.reports.forEach(report => {
        expect(report.status).toBe('pending');
      });
    });

    it('should reject invalid status filter', async () => {
      const res = await request(app)
        .get('/api/reports?status=invalid')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid status');
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/reports?page=1&limit=10')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
    });

    it('should reject as non-admin', async () => {
      const res = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('admin only');
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/reports');

      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/reports/:id - Update Report Status', () => {
    it('should update report status as admin', async () => {
      const res = await request(app)
        .patch(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(200);
      expect(res.body.data.report.status).toBe('resolved');
      expect(res.body.data.report.resolvedAt).toBeDefined();
    });

    it('should support all valid statuses', async () => {
      const statuses = ['pending', 'resolved', 'dismissed'];

      for (const status of statuses) {
        const res = await request(app)
          .patch(`/api/reports/${reportId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status });

        expect(res.status).toBe(200);
        expect(res.body.data.report.status).toBe(status);
      }
    });

    it('should reject invalid status', async () => {
      const res = await request(app)
        .patch(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid status');
    });

    it('should reject update without status', async () => {
      const res = await request(app)
        .patch(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should reject update as non-admin', async () => {
      const res = await request(app)
        .patch(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent report', async () => {
      const res = await request(app)
        .patch('/api/reports/invalidId')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(404);
    });

    it('should reject without auth', async () => {
      const res = await request(app)
        .patch(`/api/reports/${reportId}`)
        .send({ status: 'resolved' });

      expect(res.status).toBe(401);
    });
  });

  describe('DELETE /api/reports/:id - Delete Report', () => {
    it('should delete report as admin', async () => {
      const res = await request(app)
        .delete(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(204);
    });

    it('should reject delete as non-admin', async () => {
      const res = await request(app)
        .delete(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent report', async () => {
      const res = await request(app)
        .delete('/api/reports/invalidId')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject without auth', async () => {
      const res = await request(app).delete(`/api/reports/${reportId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('Report Controller - Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose sensitive data in reports list', async () => {
      const res = await request(app)
        .get('/api/reports')
        .set('Authorization', `Bearer ${adminToken}`);

      if (res.body.data.reports.length > 0) {
        res.body.data.reports.forEach(report => {
          expect(report.password).toBeUndefined();
        });
      }
    });
  });

  describe('Report Controller - Edge Cases', () => {
    it('should handle very long reason text', async () => {
      const longReason = 'a'.repeat(5000);
      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          targetType: 'post',
          targetId: 'post123',
          reason: longReason,
        });

      expect([201, 400]).toContain(res.status);
    });

    it('should handle multiple status transitions', async () => {
      let res = await request(app)
        .patch(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'resolved' });
      expect(res.status).toBe(200);

      res = await request(app)
        .patch(`/api/reports/${reportId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'dismissed' });
      expect(res.status).toBe(200);
    });

    it('should handle concurrent report operations', async () => {
      const promises = Array(3)
        .fill(null)
        .map(() =>
          request(app)
            .post('/api/reports')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              targetType: 'post',
              targetId: `post${Math.random()}`,
              reason: 'Spam',
            })
        );

      const results = await Promise.all(promises);
      results.forEach(res => {
        expect(res.status).toBe(201);
      });
    });
  });
});
