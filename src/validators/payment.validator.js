import { z } from 'zod';

/**
 * payment.validator.js
 * -----------------------------------------------------------------------
 * Zod schemas for /api/payments/* request payloads. Checked by the
 * shared validate() middleware before a request ever reaches
 * payment.controller.js (Backend Architecture Doc, §3.3).
 *
 * Deliberately narrow: per §4.2, the frontend tokenizes card details
 * directly with Stripe, so this schema only ever validates an amount,
 * a currency code, and an optional linked post — never a card number,
 * CVC, or expiry date. Payment status is never accepted from the client
 * (see payment.controller.js's header comment) and so has no schema here
 * at all — it can only move out of "pending" via the Stripe webhook or
 * the admin-only refund flow.
 * -----------------------------------------------------------------------
 */

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

/**
 * POST /api/payments/create-intent
 * Body: { amount: number (smallest currency unit, e.g. cents), currency?: string, postId?: string }
 */
export const createPaymentIntentSchema = z.object({
    body: z.object({
        // Smallest currency unit (e.g. cents for USD), matching what
        // Stripe's PaymentIntent API expects — not a decimal dollar amount.
        amount: z
            .number({ required_error: 'amount is required.' })
            .int('amount must be an integer in the smallest currency unit (e.g. cents).')
            .positive("A positive 'amount' (in the smallest currency unit) is required."),

        // Matches the Payment model's 3-letter ISO code constraint
        // (case-insensitive here since Stripe accepts lowercase; the
        // schema/service layer uppercases it before persisting).
        currency: z
            .string()
            .trim()
            .regex(/^[A-Za-z]{3}$/, 'Currency must be a valid 3-letter ISO code.')
            .optional()
            .default('usd'),

        // Optional link to the listing being purchased.
        postId: z
            .string()
            .regex(objectIdRegex, 'postId must be a valid post ID.')
            .optional(),

        // Buyer phone number (optional in payload if already present on user profile)
        phoneNumber: z
            .string()
            .trim()
            .regex(/^\+?[0-9\s\-()]{7,20}$/, 'Please provide a valid phone number.')
            .optional(),

        // Shipping / verified delivery address
        shippingAddress: z
            .union([
                z.string().trim().min(1, 'Address is required.'),
                z.object({
                    street: z.string().trim().optional(),
                    city: z.string().trim().optional(),
                    state: z.string().trim().optional(),
                    postalCode: z.string().trim().optional(),
                    country: z.string().trim().optional(),
                    fullAddress: z.string().trim().optional(),
                }),
            ])
            .optional(),
    }),
});