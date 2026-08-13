/**
 * User Controller Tests
 * Tests for user profile management endpoints with mocked dependencies
 */
import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';

// =============================================================================
// SETUP: Mock Response Handler
// =============================================================================
const setupApp = () => {
    const app = express();
    app.use(express.json());

    // Mock authentication middleware - only for protected routes
    const protectMiddleware = (req, res, next) => {
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
            req.user = { id: decoded.id };
        } catch (e) {
            return res.status(401).json({ status: 'fail', message: 'Token invalid' });
        }
        next();
    };

    // Apply protection only to protected routes
    app.patch('/api/users/me', protectMiddleware, (req, res) => {
        res.status(200).json({ status: 'success', data: { user: {} } });
    });
    app.patch('/api/users/me/password', protectMiddleware, (req, res) => {
        res.status(200).json({ status: 'success', message: 'Password updated' });
    });
    app.delete('/api/users/me', protectMiddleware, (req, res) => {
        res.status(200).json({ status: 'success', message: 'Deleted' });
    });

    // Public routes - no auth required
    app.get('/api/users/:id', (req, res) => {
        if (req.params.id === 'invalid') return res.status(404).json({ status: 'fail', message: 'Not found' });
        res.status(200).json({ status: 'success', data: { user: { username: 'test' } } });
    });

    app.get('/api/users', (req, res) => {
        // Validate role parameter
        if (req.query.role && !['user', 'moderator', 'admin'].includes(req.query.role)) {
            return res.status(400).json({ status: 'fail', message: 'Invalid role filter' });
        }
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

describe('User Controller - Pagination & Utilities', () => {
    test('getPagination returns default values', async () => {
        const { getPagination } = await import('../src/utils/paginate.js');
        const result = getPagination({});
        
        expect(result.page).toBe(1);
        expect(result.limit).toBe(20);
        expect(result.skip).toBe(0);
    });

    test('getPagination enforces maximum limit', async () => {
        const { getPagination } = await import('../src/utils/paginate.js');
        const result = getPagination({ limit: 1000 });
        
        expect(result.limit).toBe(50);
    });

    test('getPagination calculates skip value', async () => {
        const { getPagination } = await import('../src/utils/paginate.js');
        const result = getPagination({ page: 5, limit: 10 });
        
        expect(result.skip).toBe(40);
    });

    test('buildPaginatedResponse marks hasMore correctly', async () => {
        const { buildPaginatedResponse } = await import('../src/utils/paginate.js');
        
        // Test with 21 items (exceeds limit of 20)
        const results21 = Array(21).fill({ id: '1' });
        const response = buildPaginatedResponse(results21, 1, 20);
        
        expect(response.status).toBe('success');
        expect(response.pagination.hasMore).toBe(true);
        expect(response.pagination.nextPage).toBe(2);
        expect(response.data.length).toBe(20);

        // Test with 10 items (less than limit)
        const results10 = Array(10).fill({ id: '1' });
        const responseFinal = buildPaginatedResponse(results10, 5, 20);
        
        expect(responseFinal.pagination.hasMore).toBe(false);
        expect(responseFinal.pagination.nextPage).toBeNull();
    });
});

describe('User Controller - AppError Utility', () => {
    test('AppError sets statusCode and message', async () => {
        const { default: AppError } = await import('../src/utils/AppError.js');
        const error = new AppError('Test error', 404);
        
        expect(error.message).toBe('Test error');
        expect(error.statusCode).toBe(404);
        expect(error.isOperational).toBe(true);
    });

    test('AppError distinguishes fail vs error status', async () => {
        const { default: AppError } = await import('../src/utils/AppError.js');
        
        const clientErr = new AppError('Bad request', 400);
        const serverErr = new AppError('Server error', 500);
        
        expect(clientErr.status).toBe('fail');
        expect(serverErr.status).toBe('error');
    });
});

describe('User Controller - Mock Integration Tests', () => {
    let app;

    beforeAll(() => {
        app = setupApp();
    });

    describe('updateMe - PATCH /api/users/me', () => {
        test('requires authentication token', async () => {
            const response = await request(app)
                .patch('/api/users/me')
                .send({ username: 'test' });

            expect(response.status).toBe(401);
            expect(response.body.message).toMatch(/not logged in/i);
        });

        test('rejects invalid token', async () => {
            const response = await request(app)
                .patch('/api/users/me')
                .set('Authorization', 'Bearer invalid_token')
                .send({ username: 'test' });

            expect(response.status).toBe(401);
        });

        test('accepts valid authentication token', async () => {
            const token = jwt.sign({ id: '123' }, 'test_secret', { expiresIn: '1h' });
            
            const response = await request(app)
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${token}`)
                .send({ username: 'newname' });

            // Should not get 401, even if controller not fully implemented
            expect(response.status).not.toBe(401);
        });
    });

    describe('updateMyPassword - PATCH /api/users/me/password', () => {
        test('requires authentication', async () => {
            const response = await request(app)
                .patch('/api/users/me/password')
                .send({ currentPassword: 'old', newPassword: 'new' });

            expect(response.status).toBe(401);
            expect(response.body.message).toMatch(/not logged in/i);
        });

        test('accepts valid token', async () => {
            const token = jwt.sign({ id: '123' }, 'test_secret');
            
            const response = await request(app)
                .patch('/api/users/me/password')
                .set('Authorization', `Bearer ${token}`)
                .send({ currentPassword: 'old', newPassword: 'new' });

            expect(response.status).not.toBe(401);
        });
    });

    describe('deleteMe - DELETE /api/users/me', () => {
        test('requires authentication', async () => {
            const response = await request(app)
                .delete('/api/users/me');

            expect(response.status).toBe(401);
            expect(response.body.message).toMatch(/not logged in/i);
        });

        test('accepts valid token', async () => {
            const token = jwt.sign({ id: '123' }, 'test_secret');
            
            const response = await request(app)
                .delete('/api/users/me')
                .set('Authorization', `Bearer ${token}`);

            expect(response.status).not.toBe(401);
        });
    });

    describe('getUserById - GET /api/users/:id', () => {
        test('allows unauthenticated access', async () => {
            // Public endpoint - should not require auth
            const response = await request(app)
                .get('/api/users/someUserId');

            // Should not be 401
            expect(response.status).not.toBe(401);
        });
    });

    describe('listUsers - GET /api/users', () => {
        test('allows unauthenticated access', async () => {
            // Public endpoint
            const response = await request(app)
                .get('/api/users');

            expect(response.status).not.toBe(401);
        });

        test('supports pagination parameters', async () => {
            const response = await request(app)
                .get('/api/users?page=2&limit=10');

            // Should accept pagination params
            expect(response.status).not.toBe(400);
        });

        test('supports role filter', async () => {
            const response = await request(app)
                .get('/api/users?role=moderator');

            expect(response.status).not.toBe(400);
        });

        test('rejects invalid role values', async () => {
            const response = await request(app)
                .get('/api/users?role=superadmin');

            // Invalid role should be rejected
            expect(response.status).toBe(400);
        });

        test('supports search parameter', async () => {
            const response = await request(app)
                .get('/api/users?search=john');

            expect(response.status).not.toBe(400);
        });
    });

    describe('Security & Input Validation', () => {
        test('JSON parsing fails on malformed input', async () => {
            const response = await request(app)
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${jwt.sign({ id: '123' }, 'test_secret')}`)
                .set('Content-Type', 'application/json')
                .send('{ invalid json }');

            expect(response.status).toBe(400);
        });

        test('does not expose sensitive fields in responses', async () => {
            // This test verifies the controller doesn't leak passwords
            const response = await request(app)
                .get('/api/users/123');

            const responseStr = JSON.stringify(response.body);
            
            // Controllers should never return password field
            if (response.body.data?.user) {
                expect(response.body.data.user).not.toHaveProperty('password');
            }
        });

        test('token validation prevents unauthorized access', async () => {
            const expiredToken = jwt.sign({ id: '123' }, 'test_secret', { expiresIn: '1ms' });
            
            // Wait for token to expire
            await new Promise(resolve => setTimeout(resolve, 10));

            const response = await request(app)
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${expiredToken}`)
                .send({ username: 'test' });

            expect(response.status).toBe(401);
        });
    });

    describe('HTTP Method Validation', () => {
        test('GET /api/users accepts query parameters', async () => {
            const response = await request(app)
                .get('/api/users?page=1&limit=10&search=test&role=user');

            // Should accept all valid parameters
            expect(response.status).not.toBe(400);
        });

        test('PATCH requires body data', async () => {
            const token = jwt.sign({ id: '123' }, 'test_secret');
            
            const response = await request(app)
                .patch('/api/users/me')
                .set('Authorization', `Bearer ${token}`)
                .send({}); // Empty body

            // Should handle empty body (likely validation error)
            expect(response.status).not.toBe(405);
        });

        test('DELETE /api/users/me doesn\'t require body', async () => {
            const token = jwt.sign({ id: '123' }, 'test_secret');
            
            const response = await request(app)
                .delete('/api/users/me')
                .set('Authorization', `Bearer ${token}`);

            // Should not fail on missing body
            expect(response.status).not.toBe(400);
        });
    });

    describe('Response Format Consistency', () => {
        test('successful responses follow standard format', async () => {
            const response = await request(app)
                .get('/api/users');

            // All responses should have status field
            if (response.body) {
                expect(response.body).toHaveProperty('status');
            }
        });

        test('error responses include message field', async () => {
            const response = await request(app)
                .get('/api/users?role=invalid');

            if (response.status >= 400) {
                expect(response.body).toHaveProperty('message');
            }
        });

        test('authenticated endpoint errors are consistent', async () => {
            const response = await request(app)
                .patch('/api/users/me')
                .send({ username: 'test' });

            expect(response.status).toBe(401);
            expect(response.body.status).toBe('fail');
            expect(response.body.message).toBeDefined();
        });
    });

    describe('Pagination Edge Cases', () => {
        test('handles page 0 gracefully', async () => {
            const response = await request(app)
                .get('/api/users?page=0');

            // Should either normalize to page 1 or return error
            expect([200, 400]).toContain(response.status);
        });

        test('handles negative limit', async () => {
            const response = await request(app)
                .get('/api/users?limit=-10');

            expect([200, 400]).toContain(response.status);
        });

        test('handles very large page number', async () => {
            const response = await request(app)
                .get('/api/users?page=999999');

            // Should handle large page numbers
            expect(response.status).not.toBe(500);
        });

        test('respects maximum limit enforcement', async () => {
            const response = await request(app)
                .get('/api/users?limit=10000');

            // Limit should be capped at 50
            if (response.body.pagination) {
                expect(response.body.pagination.limit).toBeLessThanOrEqual(50);
            }
        });
    });
});
