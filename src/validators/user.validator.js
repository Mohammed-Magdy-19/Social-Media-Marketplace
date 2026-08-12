import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const isValidObjectId = (val) => objectIdRegex.test(val);

/**
 * PATCH /api/users/me
 */
const updateProfileSchema = z.object({
    body: z.object({
        username: z
            .string()
            .min(3, 'Username must be at least 3 characters')
            .max(30, 'Username cannot exceed 30 characters')
            .regex(/^[a-zA-Z0-9_]+$/, 'Username contains invalid characters')
            .transform((val) => val.toLowerCase().trim())
            .optional(),
        bio: z
            .string()
            .max(160, 'Bio cannot exceed 160 characters')
            .trim()
            .optional()
            .or(z.literal('')),
        avatar: z
            .string()
            .url('Avatar must be a valid URL')
            .optional(),
    }).refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field must be provided for update',
    }),
});

/**
 * PATCH /api/users/me/password
 */
const updatePasswordSchema = z.object({
    body: z.object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: z
            .string()
            .min(8, 'New password must be at least 8 characters')
            .max(128, 'New password cannot exceed 128 characters')
            .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
            .regex(/[a-z]/, 'Must contain at least one lowercase letter')
            .regex(/[0-9]/, 'Must contain at least one number')
            .regex(/[^A-Za-z0-9]/, 'Must contain at least one special character'),
        newPasswordConfirm: z
            .string()
            .min(1, 'Password confirmation is required'),
    }).refine((data) => data.newPassword === data.newPasswordConfirm, {
        message: 'New passwords do not match',
        path: ['newPasswordConfirm'],
    }),
});

/**
 * GET /api/users?search=&role=&page=&limit=
 */
const searchUsersSchema = z.object({
    query: z.object({
        search: z.string().trim().optional(),
        role: z.enum(['user', 'moderator', 'admin']).optional(),
        status: z.enum(['active', 'suspended', 'banned']).optional(),
        page: z
            .string()
            .optional()
            .transform((val) => (val ? parseInt(val, 10) : 1))
            .refine((val) => val >= 1, 'Page must be at least 1'),
        limit: z
            .string()
            .optional()
            .transform((val) => (val ? parseInt(val, 10) : 10))
            .refine((val) => val >= 1 && val <= 100, 'Limit must be between 1 and 100'),
    }),
});

/**
 * GET /api/users/:id
 */
const getUserByIdSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid user ID format'),
    }),
});

/**
 * POST /api/users/:id/follow
 * DELETE /api/users/:id/follow
 */
const followUserSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid user ID format'),
    }),
});

/**
 * GET /api/users/:id/followers
 * GET /api/users/:id/following
 */
const getFollowersSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid user ID format'),
    }),
    query: z.object({
        page: z
            .string()
            .optional()
            .transform((val) => (val ? parseInt(val, 10) : 1))
            .refine((val) => val >= 1, 'Page must be at least 1'),
        limit: z
            .string()
            .optional()
            .transform((val) => (val ? parseInt(val, 10) : 20))
            .refine((val) => val >= 1 && val <= 100, 'Limit must be between 1 and 100'),
    }),
});

/**
 * PATCH /api/admin/users/:id/role
 * [Admin] Changes a user's role against a strict whitelist. Enum values
 * mirror the `role` field on the User schema exactly, so a passing
 * request can never produce a value Mongoose would itself reject.
 */
const updateUserRoleSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid user ID format'),
    }),
    body: z.object({
        role: z.enum(['user', 'moderator', 'admin'], {
            required_error: 'role is required',
            invalid_type_error:
                "role must be one of: user, moderator, admin.",
        }),
    }),
});

/**
 * PATCH /api/admin/users/:id/status
 * [Admin] Bans, suspends, or reactivates an account. Enum values mirror
 * the `status` field on the User schema exactly. On 'banned' the
 * controller separately invalidates the target's refresh tokens — no
 * extra field is needed here to trigger that.
 */
const updateUserStatusSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid user ID format'),
    }),
    body: z.object({
        status: z.enum(['active', 'suspended', 'banned'], {
            required_error: 'status is required',
            invalid_type_error:
                "status must be one of: active, suspended, banned.",
        }),
    }),
});

export {
    updateProfileSchema,
    updatePasswordSchema,
    searchUsersSchema,
    getUserByIdSchema,
    followUserSchema,
    getFollowersSchema,
    updateUserRoleSchema,
    updateUserStatusSchema,
};