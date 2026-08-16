import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const isValidObjectId = (val) => objectIdRegex.test(val);

/**
 * POST /api/conversations/:conversationId/offers
 */
const createOfferSchema = z.object({
    params: z.object({
        conversationId: z.string().refine(isValidObjectId, 'Invalid conversation ID format'),
    }),
    body: z.object({
        postId: z.string().refine(isValidObjectId, 'Invalid post ID format'),
        amount: z
            .number()
            .int('Amount must be an integer number of cents')
            .nonnegative('Amount cannot be negative'),
    }),
});

/**
 * PATCH /api/conversations/:conversationId/offers/:offerId
 * `amount` is required only when action is "counter" — the refine below
 * enforces that instead of making it unconditionally required.
 */
const respondOfferSchema = z.object({
    params: z.object({
        conversationId: z.string().refine(isValidObjectId, 'Invalid conversation ID format'),
        offerId: z.string().refine(isValidObjectId, 'Invalid offer ID format'),
    }),
    body: z
        .object({
            action: z.enum(['accept', 'reject', 'counter']),
            amount: z
                .number()
                .int('Amount must be an integer number of cents')
                .nonnegative('Amount cannot be negative')
                .optional(),
        })
        .refine((data) => data.action !== 'counter' || typeof data.amount === 'number', {
            message: 'amount is required when action is "counter"',
            path: ['amount'],
        }),
});

export { createOfferSchema, respondOfferSchema };