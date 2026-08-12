import { z } from 'zod';

/**
 * conversation.validator.js
 * -----------------------------------------------------------------------
 * Zod schemas for /api/conversations/* request payloads. Checked by the
 * shared validate() middleware before a request ever reaches
 * conversation.controller.js (Backend Architecture Doc, §3.3).
 *
 * A 24-character hex string is the standard Mongo ObjectId shape; the
 * controller re-derives participants (dedupes against req.user.id) and
 * validates the >= 2 distinct participants business rule itself, so this
 * schema only needs to guarantee well-formed input reaches that point —
 * not duplicate the schema-level `validate` on the Conversation model.
 * -----------------------------------------------------------------------
 */

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

const objectIdSchema = z
    .string()
    .regex(objectIdRegex, 'Must be a valid user ID.');

/**
 * POST /api/conversations
 * Body: { participantIds: string[], isGroup?: boolean, title?: string }
 */
export const createConversationSchema = z.object({
    body: z.object({
        participantIds: z
            .array(objectIdSchema)
            .min(1, 'participantIds must be a non-empty array of user IDs.'),

        isGroup: z.boolean().optional().default(false),

        title: z
            .string()
            .trim()
            .max(100, 'Conversation title cannot exceed 100 characters.')
            .optional()
            .default(''),
    }),
});