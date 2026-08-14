import AppError from "../utils/AppError.js";

/**
 * validate(schema)
 * ---------------------------------------------------------------------
 * Runs a Zod schema against the incoming request before the controller
 * executes, blocking malformed or malicious input before it can reach
 * MongoDB.
 *
 * The schema passed in should be a Zod object describing whichever of
 * `body`, `params`, and `query` the route actually needs, e.g.
 *
 *   // validators/post.validator.js
 *   import { z } from "zod";
 *
 *   export const createPostSchema = z.object({
 *     body: z.object({
 *       title: z.string().trim().min(1).max(100),
 *       content: z.string().min(1),
 *       category: z.string().length(24), // ObjectId
 *       tags: z.array(z.string()).optional(),
 *     }),
 *   });
 *
 *   export const listPostsQuerySchema = z.object({
 *     query: z.object({
 *       page: z.coerce.number().int().positive().default(1),
 *       limit: z.coerce.number().int().positive().max(100).default(20),
 *     }),
 *   });
 *
 * Usage:
 *   router.post("/posts", protect, validate(createPostSchema), createPost);
 *
 * Only the request segments actually present as keys on the schema are
 * validated — a schema with only `body` leaves req.params/req.query
 * untouched. Successfully parsed (and coerced/defaulted) values are
 * written back onto req, so controllers always read clean, typed data.
 */
export const validate = (schema) => {
    return (req, res, next) => {
        const result = schema.safeParse({
            body: req.body,
            params: req.params,
            query: req.query,
        });

        if (!result.success) {
            // Flatten Zod's issue list into a single, readable message
            // (e.g. "body.email: Invalid email; body.password: Too short")
            // without leaking internal schema/stack details to the client.
            const details = result.error.issues
                .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                .join("; ");

            return next(new AppError(`Validation failed — ${details}`, 400));
        }

        // Only overwrite the segments the schema actually validated, so
        // routes that only validate `body` don't wipe out req.query, etc.
        if (result.data.body !== undefined) req.body = result.data.body;
        if (result.data.params !== undefined) req.params = result.data.params;
        if (result.data.query !== undefined) req.query = result.data.query;

        next();
    };
};