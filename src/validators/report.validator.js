import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const isValidObjectId = (val) => objectIdRegex.test(val);

/**
 * POST /api/reports
 */
const createReportSchema = z.object({
    body: z.object({
        targetType: z.enum(['post', 'comment', 'user'], {
            errorMap: () => ({ message: 'Target type must be post, comment, or user' }),
        }),
        targetId: z.string().refine(isValidObjectId, 'Invalid target ID format'),
        reason: z
            .string()
            .min(1, 'Reason is required')
            .max(1000, 'Reason cannot exceed 1000 characters')
            .trim(),
    }),
});

/**
 * GET /api/reports (Admin)
 */
const listReportsSchema = z.object({
    query: z.object({
        status: z
            .enum(['pending', 'reviewed', 'dismissed', 'resolved'])
            .optional(),
        targetType: z.enum(['post', 'comment', 'user']).optional(),
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
 * PATCH /api/reports/:id (Admin)
 */
const updateReportSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid report ID format'),
    }),
    body: z.object({
        status: z.enum(['reviewed', 'dismissed', 'resolved'], {
            errorMap: () => ({
                message: 'Status must be reviewed, dismissed, or resolved',
            }),
        }),
        resolutionNotes: z
            .string()
            .max(2000, 'Resolution notes cannot exceed 2000 characters')
            .trim()
            .optional()
            .or(z.literal('')),
    }),
});

/**
 * DELETE /api/reports/:id (Admin)
 */
const reportIdParamSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid report ID format'),
    }),
});

export {
    createReportSchema,
    listReportsSchema,
    updateReportSchema,
    reportIdParamSchema,
};