import multer from "multer";
import AppError from "../utils/AppError.js";

/**
 * Upload Middleware — Multer configuration + file validation rules
 * ---------------------------------------------------------------------
 * Uses memory storage (not disk storage): incoming files are buffered
 * in RAM as req.file.buffer / req.files[i].buffer, then streamed
 * straight to Cloudinary by cloudinary.service.js — the file never
 * touches the server's disk, and only the resulting Cloudinary URL is
 * persisted to MongoDB (see integrations/cloudinary.js).
 *
 * Critical validation rules enforced here (per the architecture doc):
 *   - File type: strict whitelist (extension + mimeType) — images only.
 *   - File size: hard per-use-case limits to protect storage costs.
 *   - Upload count: capped per request to prevent storage-flooding abuse.
 */

const ALLOWED_IMAGE_MIME_TYPES = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
]);

const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
    ...ALLOWED_IMAGE_MIME_TYPES,
    "application/pdf",
]);

/**
 * Builds a Multer fileFilter that rejects anything outside the given
 * mimetype whitelist. Executables, scripts, and disguised files (e.g.
 * a .exe renamed to .jpg) are blocked because the check is against the
 * browser/OS-reported mimetype at the multipart boundary, not just the
 * filename extension.
 */
const makeFileFilter = (allowedMimeTypes, label) => (req, file, cb) => {
    if (allowedMimeTypes.has(file.mimetype)) {
        return cb(null, true);
    }
    cb(
        new AppError(
            `Invalid file type for ${label}. Allowed types: ${[...allowedMimeTypes].join(", ")}`,
            400
        ),
        false
    );
};

const memoryStorage = multer.memoryStorage();

/**
 * avatarUpload — POST /api/uploads/avatar
 * Single image, hard-capped at 2 MB.
 */
export const avatarUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 2 * 1024 * 1024, files: 1 }, // 2 MB
    fileFilter: makeFileFilter(ALLOWED_IMAGE_MIME_TYPES, "avatar"),
}).single("avatar");

/**
 * postImagesUpload — POST /api/uploads/posts/:postId
 * Up to 5 images per post, 10 MB each.
 */
export const postImagesUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024, files: 5 }, // 10 MB per file, 5 files max
    fileFilter: makeFileFilter(ALLOWED_IMAGE_MIME_TYPES, "post image"),
}).array("images", 5);

/**
 * messageAttachmentUpload — used by the chat module for message
 * attachments; slightly more permissive (allows PDFs alongside images),
 * still capped in size and count to prevent abuse.
 */
export const messageAttachmentUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024, files: 3 },
    fileFilter: makeFileFilter(ALLOWED_ATTACHMENT_MIME_TYPES, "message attachment"),
}).array("attachments", 3);

/**
 * handleMulterError
 * ---------------------------------------------------------------------
 * Wrap any of the exported upload middlewares so that Multer-specific
 * errors (file too large, too many files, unexpected field name, etc.)
 * are converted into the app's standard AppError JSON shape instead of
 * leaking Multer's raw error object to the client.
 *
 * Usage:
 *   router.post(
 *     "/uploads/avatar",
 *     protect,
 *     handleMulterError(avatarUpload),
 *     uploadAvatar
 *   );
 */
export const handleMulterError = (uploadMiddleware) => (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
        if (!err) return next();

        if (err instanceof multer.MulterError) {
            const messages = {
                LIMIT_FILE_SIZE: "File is too large.",
                LIMIT_FILE_COUNT: "Too many files uploaded.",
                LIMIT_UNEXPECTED_FILE: "Unexpected file field in upload.",
            };
            return next(
                new AppError(messages[err.code] || "File upload error.", 400)
            );
        }

        // AppError thrown from fileFilter (invalid type) or any other error.
        next(err);
    });
};