import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const isValidObjectId = (val) => objectIdRegex.test(val);

/**
 * POST /api/posts/:postId/comments
 */
const createCommentSchema = z.object({
    params: z.object({
        postId: z.string().refine(isValidObjectId, 'Invalid post ID format'),
    }),
    body: z.object({
        text: z
            .string()
            .min(1, 'Comment text is required')
            .max(2000, 'Comment cannot exceed 2000 characters')
            .trim(),
    }),
});

/**
 * GET /api/posts/:postId/comments
 */
const getPostCommentsSchema = z.object({
    params: z.object({
        postId: z.string().refine(isValidObjectId, 'Invalid post ID format'),
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
 * GET /api/comments/:id
 * PATCH /api/comments/:id
 * DELETE /api/comments/:id
 */
const commentIdParamSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid comment ID format'),
    }),
});

/**
 * PATCH /api/comments/:id
 */
const updateCommentSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid comment ID format'),
    }),
    body: z.object({
        text: z
            .string()
            .min(1, 'Comment text is required')
            .max(2000, 'Comment cannot exceed 2000 characters')
            .trim(),
    }),
});

/**
 * POST /api/comments/:id/replies
 */
const createReplySchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid comment ID format'),
    }),
    body: z.object({
        text: z
            .string()
            .min(1, 'Reply text is required')
            .max(2000, 'Reply cannot exceed 2000 characters')
            .trim(),
    }),
});

export {
    createCommentSchema,
    getPostCommentsSchema,
    commentIdParamSchema,
    updateCommentSchema,
    createReplySchema,
};