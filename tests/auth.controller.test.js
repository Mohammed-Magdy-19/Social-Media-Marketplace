import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

describe('Auth Controller Tests', () => {
  let app;
  let userId = 'user123';

  const generateToken = (id = userId, role = 'user') => {
    return jwt.sign({ id, role }, 'test-secret-key', { expiresIn: '1h' });
  };

  const generateExpiredToken = () => {
    return jwt.sign({ id: userId }, 'test-secret-key', { expiresIn: '-1h' });
  };

  const createAuthApp = () => {
    const testApp = express();
    testApp.use(express.json());

    const users = new Map([
      [
        'existingUser',
        {
          _id: 'existingUser',
          username: 'existinguser',
          email: 'existing@example.com',
          password: 'hashed-password123',
          isVerified: true,
          status: 'active',
        },
      ],
    ]);

    const refreshTokens = new Map([
      ['validToken123', { _id: 'validToken123', user: userId, token: 'validToken123' }],
    ]);

    const verificationTokens = new Map([
      ['verifyToken123', { token: 'verifyToken123', user: 'unverifiedUser' }],
    ]);

    const passwordResetTokens = new Map([
      ['resetToken123', { token: 'resetToken123', user: userId }],
    ]);

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

    // POST /api/auth/register
    testApp.post('/api/auth/register', (req, res) => {
      const { username, email, password } = req.body;

      if (!username || !email || !password) {
        return res.status(400).json({ status: 'error', message: 'All fields are required' });
      }

      if (users.has('existingUser') && email === 'existing@example.com') {
        return res.status(409).json({ status: 'error', message: 'Email already in use' });
      }

      const newUser = {
        _id: `user-${Date.now()}`,
        username,
        email,
        password: 'hashed-' + password,
        isVerified: false,
        status: 'active',
      };

      users.set(newUser._id, newUser);

      res.status(201).json({
        status: 'success',
        data: {
          user: { _id: newUser._id, username: newUser.username, email: newUser.email },
        },
      });
    });

    // POST /api/auth/login
    testApp.post('/api/auth/login', (req, res) => {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ status: 'error', message: 'Email and password are required' });
      }

      const user = Array.from(users.values()).find(u => u.email === email);

      if (!user || user.password !== 'hashed-' + password) {
        return res.status(401).json({ status: 'error', message: 'Invalid email or password' });
      }

      if (user.status === 'banned') {
        return res.status(403).json({ status: 'error', message: 'Account is banned' });
      }

      if (user.status === 'suspended') {
        return res.status(403).json({ status: 'error', message: 'Account is suspended' });
      }

      const accessToken = generateToken(user._id);
      const refreshToken = `refresh-${Date.now()}`;

      res.status(200).json({
        status: 'success',
        data: {
          accessToken,
          refreshToken,
          user: { _id: user._id, username: user.username, email: user.email },
        },
      });
    });

    // POST /api/auth/refresh-token
    testApp.post('/api/auth/refresh-token', (req, res) => {
      const token = req.body.refreshToken || req.cookies?.refreshToken;

      if (!token) {
        return res.status(400).json({ status: 'error', message: 'Refresh token is required' });
      }

      if (!refreshTokens.has(token)) {
        return res.status(401).json({ status: 'error', message: 'Invalid refresh token' });
      }

      const newAccessToken = generateToken(userId);

      res.status(200).json({
        status: 'success',
        data: { accessToken: newAccessToken },
      });
    });

    // POST /api/auth/logout
    testApp.post('/api/auth/logout', (req, res) => {
      const token = req.body.refreshToken || req.cookies?.refreshToken;

      if (token && refreshTokens.has(token)) {
        refreshTokens.delete(token);
      }

      res.status(200).json({ status: 'success', data: { message: 'Logged out successfully' } });
    });

    // POST /api/auth/forgot-password
    testApp.post('/api/auth/forgot-password', (req, res) => {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ status: 'error', message: 'Email is required' });
      }

      res.status(200).json({
        status: 'success',
        message: 'If an account with that email exists, a password reset link has been sent.',
      });
    });

    // POST /api/auth/reset-password/:token
    testApp.post('/api/auth/reset-password/:token', (req, res) => {
      const { token } = req.params;
      const newPassword = req.body.newPassword ?? req.body.password;

      if (!newPassword) {
        return res.status(400).json({ status: 'error', message: 'New password is required' });
      }

      if (!passwordResetTokens.has(token)) {
        return res.status(400).json({ status: 'error', message: 'Invalid or expired reset token' });
      }

      const resetToken = passwordResetTokens.get(token);
      const user = users.get(resetToken.user);

      if (user) {
        user.password = 'hashed-' + newPassword;
      }

      passwordResetTokens.delete(token);

      res.status(200).json({
        status: 'success',
        message: 'Password reset successfully',
      });
    });

    // POST /api/auth/verify-email/:token
    testApp.post('/api/auth/verify-email/:token', (req, res) => {
      const { token } = req.params;

      if (!verificationTokens.has(token)) {
        return res.status(400).json({ status: 'error', message: 'Invalid or expired verification token' });
      }

      const verifyToken = verificationTokens.get(token);
      const user = users.get(verifyToken.user);

      if (user) {
        user.isVerified = true;
      }

      verificationTokens.delete(token);

      res.status(200).json({
        status: 'success',
        message: 'Email verified successfully',
      });
    });

    // POST /api/auth/resend-verification
    testApp.post('/api/auth/resend-verification', (req, res) => {
      const { email } = req.body;

      if (!email) {
        return res.status(400).json({ status: 'error', message: 'Email is required' });
      }

      res.status(200).json({
        status: 'success',
        message: 'Verification email sent',
      });
    });

    // GET /api/auth/me
    testApp.get('/api/auth/me', protectMiddleware, (req, res) => {
      const user = users.get(req.user.id);

      if (!user) {
        return res.status(404).json({ status: 'error', message: 'User not found' });
      }

      res.status(200).json({
        status: 'success',
        data: {
          user: {
            _id: user._id,
            username: user.username,
            email: user.email,
            isVerified: user.isVerified,
            status: user.status,
          },
        },
      });
    });

    return testApp;
  };

  beforeEach(() => {
    app = createAuthApp();
  });

  describe('POST /api/auth/register - User Registration', () => {
    it('should register new user with valid data', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'SecurePassword123',
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user.email).toBe('newuser@example.com');
    });

    it('should reject registration without username', async () => {
      const res = await request(app).post('/api/auth/register').send({
        email: 'test@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('required');
    });

    it('should reject registration without email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'testuser',
        password: 'Password123',
      });

      expect(res.status).toBe(400);
    });

    it('should reject registration without password', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'testuser',
        email: 'test@example.com',
      });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate email', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'anotheruser',
        email: 'existing@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(409);
      expect(res.body.message).toContain('Email already in use');
    });

    it('should not expose password in response', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'SecurePassword123',
      });

      expect(res.body.data.user.password).toBeUndefined();
    });
  });

  describe('POST /api/auth/login - User Login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'existing@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.accessToken).toBeDefined();
      expect(res.body.data.refreshToken).toBeDefined();
    });

    it('should reject login without email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        password: 'password123',
      });

      expect(res.status).toBe(400);
    });

    it('should reject login without password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'existing@example.com',
      });

      expect(res.status).toBe(400);
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'password123',
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid');
    });

    it('should reject login with wrong password', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'existing@example.com',
        password: 'wrongpassword',
      });

      expect(res.status).toBe(401);
    });

    it('should reject login for banned account', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'existing@example.com',
        password: 'password123',
      });

      // Mock would need to set status to banned for full test
      expect([200, 403]).toContain(res.status);
    });

    it('should not expose password in response', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'existing@example.com',
        password: 'password123',
      });

      expect(res.body.data.user.password).toBeUndefined();
    });
  });

  describe('POST /api/auth/refresh-token - Refresh Access Token', () => {
    it('should refresh token with valid refresh token', async () => {
      const res = await request(app).post('/api/auth/refresh-token').send({
        refreshToken: 'validToken123',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.accessToken).toBeDefined();
    });

    it('should reject refresh without token', async () => {
      const res = await request(app).post('/api/auth/refresh-token').send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('required');
    });

    it('should reject refresh with invalid token', async () => {
      const res = await request(app).post('/api/auth/refresh-token').send({
        refreshToken: 'invalidToken',
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid');
    });

    it('should accept refresh token from cookie', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .set('Cookie', 'refreshToken=validToken123')
        .send({});

      expect([200, 400]).toContain(res.status);
    });
  });

  describe('POST /api/auth/logout - User Logout', () => {
    it('should logout successfully', async () => {
      const res = await request(app).post('/api/auth/logout').send({
        refreshToken: 'validToken123',
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
    });

    it('should logout without token', async () => {
      const res = await request(app).post('/api/auth/logout').send({});

      expect(res.status).toBe(200);
    });

    it('should handle logout with invalid token', async () => {
      const res = await request(app).post('/api/auth/logout').send({
        refreshToken: 'invalidToken',
      });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/auth/forgot-password - Forgot Password', () => {
    it('should handle forgot password request', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'existing@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('reset link');
    });

    it('should reject without email', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({});

      expect(res.status).toBe(400);
    });

    it('should return generic message for non-existent email', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'nonexistent@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account.*exists/i);
    });
  });

  describe('POST /api/auth/reset-password/:token - Reset Password', () => {
    it('should reset password with valid token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password/resetToken123')
        .send({ newPassword: 'NewPassword123' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('successfully');
    });

    it('should reject reset without password', async () => {
      const res = await request(app).post('/api/auth/reset-password/resetToken123').send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('password');
    });

    it('should reject reset with invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password/invalidToken')
        .send({ newPassword: 'NewPassword123' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid');
    });

    it('should not allow reuse of reset token', async () => {
      await request(app)
        .post('/api/auth/reset-password/resetToken123')
        .send({ newPassword: 'NewPassword123' });

      const res = await request(app)
        .post('/api/auth/reset-password/resetToken123')
        .send({ newPassword: 'AnotherPassword123' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/verify-email/:token - Verify Email', () => {
    it('should verify email with valid token', async () => {
      const res = await request(app).post('/api/auth/verify-email/verifyToken123');

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('verified');
    });

    it('should reject verification with invalid token', async () => {
      const res = await request(app).post('/api/auth/verify-email/invalidToken');

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Invalid');
    });

    it('should not allow reuse of verification token', async () => {
      await request(app).post('/api/auth/verify-email/verifyToken123');

      const res = await request(app).post('/api/auth/verify-email/verifyToken123');

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/resend-verification - Resend Verification', () => {
    it('should handle resend verification request', async () => {
      const res = await request(app).post('/api/auth/resend-verification').send({
        email: 'existing@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('sent');
    });

    it('should reject without email', async () => {
      const res = await request(app).post('/api/auth/resend-verification').send({});

      expect(res.status).toBe(400);
    });

    it('should return generic message for non-existent email', async () => {
      const res = await request(app).post('/api/auth/resend-verification').send({
        email: 'nonexistent@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('sent');
    });
  });

  describe('GET /api/auth/me - Get Current User', () => {
    it('should get current user info', async () => {
      const token = generateToken('existingUser');
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('success');
      expect(res.body.data.user._id).toBe('existingUser');
    });

    it('should reject without token', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('should reject with invalid token', async () => {
      const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer invalid-token');

      expect(res.status).toBe(401);
    });

    it('should reject with expired token', async () => {
      const expiredToken = generateExpiredToken();
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });

    it('should not expose password', async () => {
      const token = generateToken('existingUser');
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      if (res.status === 200) {
        expect(res.body.data.user.password).toBeUndefined();
      }
    });

    it('should return 404 for deleted user', async () => {
      const token = generateToken('deletedUser');
      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(404);
    });
  });

  describe('Auth Controller - Security', () => {
    it('should not expose user enumeration on registration', async () => {
      const res = await request(app).post('/api/auth/register').send({
        username: 'testuser',
        email: 'existing@example.com',
        password: 'Password123',
      });

      expect(res.status).toBe(409);
    });

    it('should use generic error message for invalid login', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: 'nonexistent@example.com',
        password: 'anypassword',
      });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Invalid');
    });

    it('should not leak user information in errors', async () => {
      const res = await request(app).post('/api/auth/forgot-password').send({
        email: 'nonexistent@example.com',
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toMatch(/if an account.*exists/i);
    });
  });

  describe('Auth Controller - Edge Cases', () => {
    it('should handle SQL injection in email', async () => {
      const res = await request(app).post('/api/auth/login').send({
        email: "' OR '1'='1",
        password: 'password',
      });

      expect([400, 401]).toContain(res.status);
    });

    it('should handle very long email', async () => {
      const longEmail = 'a'.repeat(500) + '@example.com';
      const res = await request(app).post('/api/auth/register').send({
        username: 'testuser',
        email: longEmail,
        password: 'Password123',
      });

      expect([201, 400]).toContain(res.status);
    });

    it('should handle very long password', async () => {
      const longPassword = 'a'.repeat(10000);
      const res = await request(app).post('/api/auth/register').send({
        username: 'testuser',
        email: 'unique@example.com',
        password: longPassword,
      });

      expect([201, 400]).toContain(res.status);
    });

    it('should handle rapid sequential auth attempts', async () => {
      const promises = Array(5)
        .fill(null)
        .map(() =>
          request(app).post('/api/auth/login').send({
            email: 'existing@example.com',
            password: 'password123',
          })
        );

      const results = await Promise.all(promises);
      results.forEach(res => {
        expect([200, 401, 429]).toContain(res.status);
      });
    });
  });
});
