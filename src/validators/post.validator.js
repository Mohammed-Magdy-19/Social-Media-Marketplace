import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const isValidObjectId = (val) => objectIdRegex.test(val);

/**
 * POST /api/posts
 */
const createPostSchema = z.object({
    body: z.object({
        title: z
            .string()
            .min(1, 'Title is required')
            .max(100, 'Title cannot exceed 100 characters')
            .trim(),
        content: z
            .string()
            .min(1, 'Content is required')
            .trim(),
        category: z
            .string()
            .refine(isValidObjectId, 'Invalid category ID format'),
        // Optional — omit for a plain social post; set to make the post a
        // marketplace listing. Smallest currency unit (cents), matching
        // Payment.amount.
        price: z
            .number()
            .int('Price must be an integer number of cents')
            .nonnegative('Price cannot be negative')
            .optional(),
        tags: z
            .array(z.string().trim().min(1).max(30))
            .max(20, 'Cannot have more than 20 tags')
            .optional()
            .default([]),
    }),
});

/**
 * PATCH /api/posts/:id
 */
const updatePostSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid post ID format'),
    }),
    body: z
        .object({
            title: z
                .string()
                .min(1, 'Title cannot be empty')
                .max(100, 'Title cannot exceed 100 characters')
                .trim()
                .optional(),
            content: z.string().min(1, 'Content cannot be empty').trim().optional(),
            category: z
                .string()
                .refine(isValidObjectId, 'Invalid category ID format')
                .optional(),
            price: z
                .number()
                .int('Price must be an integer number of cents')
                .nonnegative('Price cannot be negative')
                .optional(),
            // Schema-level validation only — post.controller.js's
            // UPDATABLE_FIELDS whitelist is what actually restricts this to
            // admins; a non-admin author sending `status` has it silently
            // dropped there, not rejected here.
            status: z.enum(['active', 'hidden', 'flagged']).optional(),
            tags: z
                .array(z.string().trim().min(1).max(30))
                .max(20, 'Cannot have more than 20 tags')
                .optional(),
        })
        .refine((data) => Object.keys(data).length > 0, {
            message: 'At least one field must be provided for update',
        }),
});

/**
 * GET /api/posts/:id
 * DELETE /api/posts/:id
 */
const postIdParamSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid post ID format'),
    }),
});

/**
 * GET /api/posts?search=&category=&tag=&author=&sort=&page=&limit=
 */
const searchPostsSchema = z.object({
    query: z.object({
        search: z.string().trim().optional(),
        category: z
            .string()
            .refine((val) => !val || isValidObjectId(val), 'Invalid category ID')
            .optional(),
        tag: z.string().trim().optional(),
        author: z
            .string()
            .refine((val) => !val || isValidObjectId(val), 'Invalid author ID')
            .optional(),
        // Admin-only in effect: post.controller.js ignores this for
        // non-admin requesters and always applies status: 'active' instead.
        status: z.enum(['active', 'hidden', 'flagged']).optional(),
        sort: z
            .enum(['newest', 'oldest', 'most_liked', 'most_commented'])
            .optional()
            .default('newest'),
        page: z
            .string()
            .optional()
            .transform((val) => (val ? parseInt(val, 10) : 1))
            .refine((val) => val >= 1, 'Page must be at least 1'),
        limit: z
            .string()
            .optional()
            .transform((val) => (val ? parseInt(val, 10) : 10))
            .refine((val) => val >= 1 && val <= 50, 'Limit must be between 1 and 50'),
    }),
});

/**
 * GET /api/users/:userId/posts
 */
const getUserPostsSchema = z.object({
    params: z.object({
        userId: z.string().refine(isValidObjectId, 'Invalid user ID format'),
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
            .transform((val) => (val ? parseInt(val, 10) : 10))
            .refine((val) => val >= 1 && val <= 50, 'Limit must be between 1 and 50'),
    }),
});

/**
 * POST /api/posts/:id/like
 * DELETE /api/posts/:id/like
 * POST /api/posts/:id/save
 * DELETE /api/posts/:id/save
 */
const postInteractionSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid post ID format'),
    }),
});

export {
    createPostSchema,
    updatePostSchema,
    postIdParamSchema,
    searchPostsSchema,
    getUserPostsSchema,
    postInteractionSchema,
};