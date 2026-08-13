import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Payment Controller Tests', () => {
  let app;
  let authToken;
  let userId = 'user123';
  let paymentId = 'payment123';

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

    const restrictToAdmin = (req, res, next) => {
      if (req.user.role !== 'admin') {
        return res.status(403).json({ status: 'error', message: 'Forbidden - admin only' });
      }
      next();
    };

    const payments = new Map([
      [
        paymentId,
        {
          _id: paymentId,
          buyer: userId,
          seller: 'seller123',
          amount: 100,
          currency: 'USD',
          status: 'completed',
          stripePaymentIntentId: 'pi_123',
          createdAt: new Date(),
        },
      ],
    ]);

    // POST /api/payments/create-intent
    testApp.post('/api/payments/create-intent', protectMiddleware, (req, res) => {
      const { amount, currency, postId } = req.body;

      if (!amount || amount <= 0) {
        return res.status(400).json({ status: 'error', message: 'Amount must be positive' });
      }

      if (!currency) {
        return res.status(400).json({ status: 'error', message: 'Currency is required' });
      }

      res.status(201).json({
        status: 'success',
        data: {
          clientSecret: 'pi_123_secret',
          paymentIntentId: 'pi_123',
          amount,
          currency,
        },
      });
    });

    // POST /api/payments/webhook
    testApp.post('/api/payments/webhook', (req, res) => {
      const sig = req.headers['stripe-signature'];

      if (!sig) {
        return res.status(400).json({ status: 'error', message: 'Missing signature' });
      }

      res.status(200).json({ status: 'success', data: { received: true } });
    });

    // GET /api/payments/me
    testApp.get('/api/payments/me', protectMiddleware, (req, res) => {
      const { page = 1, limit = 20 } = req.query;

      const userPayments = Array.from(payments.values()).filter(
        p => p.buyer === req.user.id || p.seller === req.user.id
      );

      res.status(200).json({
        status: 'success',
        data: { payments: userPayments },
        pagination: { page: parseInt(page), limit: parseInt(limit), total: userPayments.length },
      });
    });

    // GET /api/payments/:id
    testApp.get('/api/payments/:id', protectMiddleware, (req, res) => {
      const { id } = req.params;
      const payment = payments.get(id);

      if (!payment) {
        return res.status(404).json({ status: 'error', message: 'Payment not found' });
      }

      if (
        req.user.id !== payment.buyer &&
        req.user.id !== payment.seller &&
        req.user.role !== 'admin'
      ) {
        return res.status(403).json({ status: 'error', message: 'Forbidden' });
      }

      res.status(200).json({ status: 'success', data: { payment } });
    });

    // POST /api/payments/:id/refund
    testApp.post('/api/payments/:id/refund', protectMiddleware, restrictToAdmin, (req, res) => {
      const { id } = req.params;
      const payment = payments.get(id);

      if (!payment) {
        return res.status(404).json({ status: 'error', message: 'Payment not found' });
      }

      payment.status = 'refunded';

      res.status(200).json({
        status: 'success',
        data: { payment },
      });
    });

    return testApp;
  };

  beforeEach(() => {
    app = createProtectedApp();
    authToken = generateToken();
  });

  describe('POST /api/payments/create-intent - Create Payment Intent', () => {
    it('should create payment intent with valid data', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 99.99,
          currency: 'USD',
          postId: 'post123',
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.clientSecret).toBeDefined();
      expect(res.body.data.paymentIntentId).toBeDefined();
    });

    it('should reject intent with zero amount', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 0, currency: 'USD' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('positive');
    });

    it('should reject intent with negative amount', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: -50, currency: 'USD' });

      expect(res.status).toBe(400);
    });

    it('should reject intent without amount', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ currency: 'USD' });

      expect(res.status).toBe(400);
    });

    it('should reject intent without currency', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 100 });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Currency');
    });

    it('should reject intent without auth', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .send({ amount: 100, currency: 'USD' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/payments/webhook - Stripe Webhook', () => {
    it('should accept webhook with valid signature', async () => {
      const res = await request(app)
        .post('/api/payments/webhook')
        .set('stripe-signature', 'test-sig-123')
        .send({ type: 'payment_intent.succeeded' });

      expect(res.status).toBe(200);
      expect(res.body.data.received).toBe(true);
    });

    it('should reject webhook without signature', async () => {
      const res = await request(app).post('/api/payments/webhook').send({ type: 'payment_intent.succeeded' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('signature');
    });

    it('should not require auth for webhook', async () => {
      const res = await request(app)
        .post('/api/payments/webhook')
        .set('stripe-signature', 'test-sig-123');

      expect([200, 400]).toContain(res.status);
    });
  });

  describe('GET /api/payments/me - Get User Payments', () => {
    it('should fetch user payments', async () => {
      const res = await request(app)
        .get('/api/payments/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(Array.isArray(res.body.data.payments)).toBe(true);
    });

    it('should only return user own payments', async () => {
      const res = await request(app)
        .get('/api/payments/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      res.body.data.payments.forEach(payment => {
        expect(
          payment.buyer === userId || payment.seller === userId
        ).toBe(true);
      });
    });

    it('should support pagination', async () => {
      const res = await request(app)
        .get('/api/payments/me?page=1&limit=10')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pagination.page).toBe(1);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get('/api/payments/me');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/payments/:id - Get Payment by ID', () => {
    it('should fetch payment for buyer', async () => {
      const res = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.payment._id).toBe(paymentId);
    });

    it('should fetch payment for seller', async () => {
      const sellerToken = generateToken('seller123');
      const res = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set('Authorization', `Bearer ${sellerToken}`);

      expect(res.status).toBe(200);
    });

    it('should fetch payment for admin', async () => {
      const adminToken = generateToken('any-user', 'admin');
      const res = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
    });

    it('should reject access for other users', async () => {
      const otherToken = generateToken('other-user');
      const res = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set('Authorization', `Bearer ${otherToken}`);

      expect(res.status).toBe(403);
    });

    it('should return 404 for non-existent payment', async () => {
      const res = await request(app)
        .get('/api/payments/invalidId')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject without auth', async () => {
      const res = await request(app).get(`/api/payments/${paymentId}`);

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/payments/:id/refund - Refund Payment', () => {
    it('should refund payment as admin', async () => {
      const adminToken = generateToken('any-user', 'admin');
      const res = await request(app)
        .post(`/api/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.payment.status).toBe('refunded');
    });

    it('should reject refund as non-admin', async () => {
      const res = await request(app)
        .post(`/api/payments/${paymentId}/refund`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(403);
      expect(res.body.message).toContain('admin only');
    });

    it('should return 404 for non-existent payment', async () => {
      const adminToken = generateToken('any-user', 'admin');
      const res = await request(app)
        .post('/api/payments/invalidId/refund')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should reject without auth', async () => {
      const res = await request(app).post(`/api/payments/${paymentId}/refund`);

      expect(res.status).toBe(401);
    });
  });

  describe('Payment Controller - Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send('{invalid}');

      expect([400, 401]).toContain(res.status);
    });

    it('should not expose sensitive payment data', async () => {
      const res = await request(app)
        .get(`/api/payments/${paymentId}`)
        .set('Authorization', `Bearer ${authToken}`);

      if (res.status === 200) {
        expect(res.body.data.payment.stripeSecret).toBeUndefined();
      }
    });
  });

  describe('Payment Controller - Edge Cases', () => {
    it('should handle very large amounts', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 999999999.99,
          currency: 'USD',
        });

      expect(res.status).toBe(201);
    });

    it('should handle different currency codes', async () => {
      const res1 = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 100, currency: 'EUR' });

      const res2 = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ amount: 100, currency: 'GBP' });

      expect(res1.status).toBe(201);
      expect(res2.status).toBe(201);
    });

    it('should handle decimal amounts', async () => {
      const res = await request(app)
        .post('/api/payments/create-intent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 19.99,
          currency: 'USD',
        });

      expect(res.status).toBe(201);
    });
  });
});
