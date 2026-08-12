import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const isValidObjectId = (val) => objectIdRegex.test(val);

/**
 * POST /api/categories
 */
const createCategorySchema = z.object({
    body: z.object({
        name: z
            .string()
            .min(1, 'Category name is required')
            .max(50, 'Category name cannot exceed 50 characters')
            .trim(),
        description: z
            .string()
            .max(500, 'Description cannot exceed 500 characters')
            .trim()
            .optional()
            .or(z.literal('')),
    }),
});

/**
 * GET /api/categories/:id
 * PATCH /api/categories/:id
 * DELETE /api/categories/:id
 */
const categoryIdParamSchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid category ID format'),
    }),
});

/**
 * PATCH /api/categories/:id
 */
const updateCategorySchema = z.object({
    params: z.object({
        id: z.string().refine(isValidObjectId, 'Invalid category ID format'),
    }),
    body: z
        .object({
            name: z
                .string()
                .min(1, 'Category name cannot be empty')
                .max(50, 'Category name cannot exceed 50 characters')
                .trim()
                .optional(),
            description: z
                .string()
                .max(500, 'Description cannot exceed 500 characters')
                .trim()
                .optional()
                .or(z.literal('')),
        })
        .refine((data) => Object.keys(data).length > 0, {
            message: 'At least one field must be provided for update',
        }),
});

export {
    createCategorySchema,
    categoryIdParamSchema,
    updateCategorySchema,
};