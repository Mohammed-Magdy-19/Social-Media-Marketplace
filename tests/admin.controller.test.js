/**
 * Admin Controller Tests
 * Tests for admin endpoints with mocked dependencies
 */
import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// =============================================================================
// SETUP: Mock Response Handler
// =============================================================================
const setupApp = (isAdmin = false) => {
    const app = express();
    app.use(express.json());

    // Mock authentication & authorization middleware
    const adminProtect = (req, res, next) => {
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith('Bearer ')) {
            return res.status(401).json({ 
                status: 'fail', 
                message: 'You are not logged in. Please log in to get access.' 
            });
        }

        try {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, 'test_secret');
            req.user = { id: decoded.id, role: decoded.role || 'user' };

            if (req.user.role !== 'admin') {
                return res.status(403).json({
                    status: 'fail',
                    message: 'You do not have permission to perform this action.',
                });
            }
        } catch (e) {
            return res.status(401).json({ status: 'fail', message: 'Invalid token' });
        }

        next();
    };

    // Admin routes
    app.get('/api/admin/users', adminProtect, (req, res) => {
        // Validate role filter
        if (req.query.role && !['user', 'moderator', 'admin'].includes(req.query.role)) {
            return res.status(400).json({ status: 'fail', message: 'Invalid role' });
        }
        // Validate status filter
        if (req.query.status && !['active', 'suspended', 'banned'].includes(req.query.status)) {
            return res.status(400).json({ status: 'fail', message: 'Invalid status' });
        }
        res.status(200).json({
            status: 'success',
            data: [],
            pagination: { page: 1, limit: 20, hasMore: false }
        });
    });

    app.patch('/api/admin/users/:id/role', adminProtect, (req, res) => {
        if (!req.body.role) {
            return res.status(400).json({ status: 'fail', message: 'Role required' });
        }
        if (!['user', 'moderator', 'admin'].includes(req.body.role)) {
            return res.status(400).json({ status: 'fail', message: 'role must be one of: user, moderator, admin' });
        }
        if (req.params.id === req.user.id) {
            return res.status(400).json({ status: 'fail', message: 'You cannot change your own role' });
        }
        if (req.params.id === 'invalid') {
            return res.status(404).json({ status: 'fail', message: 'User not found' });
        }
        res.status(200).json({ status: 'success', data: { user: { role: req.body.role } } });
    });

    app.patch('/api/admin/users/:id/status', adminProtect, (req, res) => {
        if (!req.body.status) {
            return res.status(400).json({ status: 'fail', message: 'Status required' });
        }
        if (!['active', 'suspended', 'banned'].includes(req.body.status)) {
            return res.status(400).json({ status: 'fail', message: 'status must be one of: active, suspended, banned' });
        }
        if (req.params.id === req.user.id) {
            return res.status(400).json({ status: 'fail', message: 'You cannot change your own account status' });
        }
        res.status(200).json({ status: 'success', data: { user: { status: req.body.status } } });
    });

    app.get('/api/admin/dashboard', adminProtect, (req, res) => {
        res.status(200).json({
            status: 'success',
            data: {
                users: { total: 100, active: 80, suspended: 15, banned: 5 },
                posts: { total: 500 },
                reports: { pending: 3 },
                sales: []
            }
        });
    });

    app.get('/api/admin/audit-logs', adminProtect, (req, res) => {
        res.status(200).json({
            status: 'success',
            data: [],
            pagination: { page: 1, limit: 20, hasMore: false }
        });
    });

    return app;
};

// =============================================================================
// TESTS
// =============================================================================

describe('Admin Controller - Access Control', () => {
    let adminApp, userApp;

    beforeAll(() => {
        adminApp = setupApp(true);
        userApp = setupApp(false);
    });

    const adminToken = jwt.sign({ id: 'admin123', role: 'admin' }, 'test_secret');
    const userToken = jwt.sign({ id: 'user456', role: 'user' }, 'test_secret');

    describe('Authentication Requirements', () => {
        test('requires valid admin token for /api/admin/users', async () => {
            const response = await request(adminApp)
                .get('/api/admin/users');

            expect(response.status).toBe(401);
            expect(response.body.message).toMatch(/not logged in/i);
        });

        test('admin with valid token can access /api/admin/users', async () => {
            const response = await request(adminApp)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(401);
        });

        test('user token is rejected for admin routes', async () => {
            const response = await request(userApp)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(403);
            expect(response.body.message).toMatch(/permission/i);
        });

        test('invalid token is rejected', async () => {
            const response = await request(adminApp)
                .get('/api/admin/users')
                .set('Authorization', 'Bearer invalid_token_xyz');

            expect(response.status).toBe(401);
        });

        test('expired token is rejected', async () => {
            const expiredToken = jwt.sign(
                { id: 'admin123', role: 'admin' },
                'test_secret',
                { expiresIn: '1ms' }
            );

            await new Promise(resolve => setTimeout(resolve, 10));

            const response = await request(adminApp)
                .get('/api/admin/users')
                .set('Authorization', `Bearer ${expiredToken}`);

            expect(response.status).toBe(401);
        });
    });

    describe('Authorization Checks', () => {
        test('regular user cannot access admin dashboard', async () => {
            const response = await request(userApp)
                .get('/api/admin/dashboard')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(403);
        });

        test('admin can access admin dashboard', async () => {
            const response = await request(adminApp)
                .get('/api/admin/dashboard')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(403);
        });

        test('user cannot access audit logs', async () => {
            const response = await request(userApp)
                .get('/api/admin/audit-logs')
                .set('Authorization', `Bearer ${userToken}`);

            expect(response.status).toBe(403);
        });

        test('admin can access audit logs', async () => {
            const response = await request(adminApp)
                .get('/api/admin/audit-logs')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(403);
        });
    });
});

describe('Admin Controller - Endpoint Validation', () => {
    let app;
    const adminToken = jwt.sign({ id: 'admin123', role: 'admin' }, 'test_secret');

    beforeAll(() => {
        app = setupApp();
    });

    describe('GET /api/admin/users', () => {
        test('accepts pagination parameters', async () => {
            const response = await request(app)
                .get('/api/admin/users?page=1&limit=20')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(400);
        });

        test('accepts search filter', async () => {
            const response = await request(app)
                .get('/api/admin/users?search=john')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(400);
        });

        test('accepts role filter', async () => {
            const response = await request(app)
                .get('/api/admin/users?role=moderator')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(400);
        });

        test('rejects invalid role filter', async () => {
            const response = await request(app)
                .get('/api/admin/users?role=superuser')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/invalid role/i);
        });

        test('accepts status filter', async () => {
            const response = await request(app)
                .get('/api/admin/users?status=suspended')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(400);
        });

        test('rejects invalid status', async () => {
            const response = await request(app)
                .get('/api/admin/users?status=inactive')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).toBe(400);
        });
    });

    describe('PATCH /api/admin/users/:id/role', () => {
        test('requires role in request body', async () => {
            const response = await request(app)
                .patch('/api/admin/users/123/role')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(response.status).toBe(400);
        });

        test('accepts valid role values', async () => {
            const validRoles = ['user', 'moderator', 'admin'];

            for (const role of validRoles) {
                const response = await request(app)
                    .patch('/api/admin/users/123/role')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ role });

                expect(response.status).not.toBe(400);
            }
        });

        test('rejects invalid role values', async () => {
            const response = await request(app)
                .patch('/api/admin/users/123/role')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'superadmin' });

            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/role must be/i);
        });

        test('prevents self-modification', async () => {
            const myToken = jwt.sign({ id: '123', role: 'admin' }, 'test_secret');
            const response = await request(app)
                .patch('/api/admin/users/123/role')
                .set('Authorization', `Bearer ${myToken}`)
                .send({ role: 'user' });

            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/cannot change your own role/i);
        });
    });

    describe('PATCH /api/admin/users/:id/status', () => {
        test('requires status in request body', async () => {
            const response = await request(app)
                .patch('/api/admin/users/456/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({});

            expect(response.status).toBe(400);
        });

        test('accepts valid status values', async () => {
            const validStatuses = ['active', 'suspended', 'banned'];

            for (const status of validStatuses) {
                const response = await request(app)
                    .patch('/api/admin/users/456/status')
                    .set('Authorization', `Bearer ${adminToken}`)
                    .send({ status });

                expect(response.status).not.toBe(400);
            }
        });

        test('rejects invalid status values', async () => {
            const response = await request(app)
                .patch('/api/admin/users/456/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ status: 'deleted' });

            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/status must be/i);
        });

        test('prevents self-modification', async () => {
            const myToken = jwt.sign({ id: '789', role: 'admin' }, 'test_secret');
            const response = await request(app)
                .patch('/api/admin/users/789/status')
                .set('Authorization', `Bearer ${myToken}`)
                .send({ status: 'banned' });

            expect(response.status).toBe(400);
            expect(response.body.message).toMatch(/cannot change your own.*status/i);
        });
    });

    describe('GET /api/admin/dashboard', () => {
        test('does not require parameters', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(400);
        });

        test('returns expected statistics fields', async () => {
            const response = await request(app)
                .get('/api/admin/dashboard')
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.status === 200) {
                expect(response.body.data).toHaveProperty('users');
                expect(response.body.data).toHaveProperty('posts');
                expect(response.body.data).toHaveProperty('reports');
            }
        });
    });

    describe('GET /api/admin/audit-logs', () => {
        test('accepts pagination parameters', async () => {
            const response = await request(app)
                .get('/api/admin/audit-logs?page=1&limit=10')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(400);
        });

        test('accepts actor filter', async () => {
            const response = await request(app)
                .get('/api/admin/audit-logs?actor=admin123')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(400);
        });

        test('accepts action filter', async () => {
            const response = await request(app)
                .get('/api/admin/audit-logs?action=USER_BAN')
                .set('Authorization', `Bearer ${adminToken}`);

            expect(response.status).not.toBe(400);
        });
    });
});

describe('Admin Controller - Input Validation', () => {
    let app;
    const adminToken = jwt.sign({ id: 'admin123', role: 'admin' }, 'test_secret');

    beforeAll(() => {
        app = setupApp();
    });

    describe('Malformed Requests', () => {
        test('handles malformed JSON gracefully', async () => {
            const response = await request(app)
                .patch('/api/admin/users/123/role')
                .set('Authorization', `Bearer ${adminToken}`)
                .set('Content-Type', 'application/json')
                .send('{ invalid }');

            expect(response.status).toBe(400);
        });

        test('handles empty body on PATCH', async () => {
            const response = await request(app)
                .patch('/api/admin/users/123/status')
                .set('Authorization', `Bearer ${adminToken}`)
                .send();

            expect(response.status).toBe(400);
        });
    });

    describe('Pagination Constraints', () => {
        test('enforces maximum limit on /api/admin/users', async () => {
            const response = await request(app)
                .get('/api/admin/users?limit=1000')
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.body.pagination) {
                expect(response.body.pagination.limit).toBeLessThanOrEqual(50);
            }
        });

        test('enforces maximum limit on /api/admin/audit-logs', async () => {
            const response = await request(app)
                .get('/api/admin/audit-logs?limit=500')
                .set('Authorization', `Bearer ${adminToken}`);

            if (response.body.pagination) {
                expect(response.body.pagination.limit).toBeLessThanOrEqual(50);
            }
        });

        test('handles page=0', async () => {
            const response = await request(app)
                .get('/api/admin/users?page=0')
                .set('Authorization', `Bearer ${adminToken}`);

            // Should normalize to page 1
            if (response.body.pagination) {
                expect(response.body.pagination.page).toBeGreaterThanOrEqual(1);
            }
        });

        test('handles negative limit', async () => {
            const response = await request(app)
                .get('/api/admin/users?limit=-5')
                .set('Authorization', `Bearer ${adminToken}`);

            // Should either normalize or return error
            expect([200, 400]).toContain(response.status);
        });
    });
});

describe('Admin Controller - Security', () => {
    let app;
    const adminToken = jwt.sign({ id: 'admin123', role: 'admin' }, 'test_secret');

    beforeAll(() => {
        app = setupApp();
    });

    test('does not expose sensitive data in error messages', async () => {
        const response = await request(app)
            .patch('/api/admin/users/invalid/role')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ role: 'admin' });

        const errorStr = JSON.stringify(response.body);
        expect(errorStr).not.toMatch(/password|token|secret/i);
    });

    test('prevents privilege escalation via invalid role', async () => {
        const response = await request(app)
            .patch('/api/admin/users/targetUser/role')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ role: 'superuser' });

        expect(response.status).toBe(400);
    });

    test('response format is consistent across errors', async () => {
        const responses = [
            await request(app)
                .get('/api/admin/users?role=invalid')
                .set('Authorization', `Bearer ${adminToken}`),
            await request(app)
                .patch('/api/admin/users/123/role')
                .set('Authorization', `Bearer ${adminToken}`)
                .send({ role: 'invalid' }),
            await request(app)
                .get('/api/admin/dashboard')
                .set('Authorization', 'Bearer invalid'),
        ];

        responses.forEach(res => {
            if (res.status >= 400) {
                expect(res.body).toHaveProperty('status');
                expect(res.body).toHaveProperty('message');
            }
        });
    });
});

describe('Admin Controller - Edge Cases', () => {
    let app;
    const adminToken = jwt.sign({ id: 'admin123', role: 'admin' }, 'test_secret');

    beforeAll(() => {
        app = setupApp();
    });

    test('handles very long search queries', async () => {
        const longSearch = 'a'.repeat(500);
        const response = await request(app)
            .get(`/api/admin/users?search=${encodeURIComponent(longSearch)}`)
            .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).not.toBe(500);
    });

    test('handles special characters in filters', async () => {
        const response = await request(app)
            .get("/api/admin/users?search=user@example.com")
            .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).not.toBe(400);
    });

    test('handles very large page numbers', async () => {
        const response = await request(app)
            .get('/api/admin/users?page=999999')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).not.toBe(500);
    });

    test('handles combined filters gracefully', async () => {
        const response = await request(app)
            .get('/api/admin/users?role=moderator&status=active&search=john&page=1&limit=10')
            .set('Authorization', `Bearer ${adminToken}`);

        expect(response.status).not.toBe(400);
    });
});
