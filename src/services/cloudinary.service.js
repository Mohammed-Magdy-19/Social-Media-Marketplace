import cloudinary from "../integrations/cloudinary.js";
import AppError from "../utils/AppError.js";

/**
 * Uploads a single file buffer (from Multer's memoryStorage) to Cloudinary
 * as a stream — this avoids ever writing the file to local disk, which
 * matters on platforms with ephemeral/read-only filesystems (Heroku,
 * Render, etc.) and keeps uploads fast.
 *
 * @param {Buffer} fileBuffer - req.file.buffer from Multer
 * @param {string} folder     - Cloudinary folder, e.g. "avatars" or "posts"
 * @param {object} [options]  - extra Cloudinary upload options (e.g. transformation)
 * @returns {Promise<{url: string, publicId: string, format: string, bytes: number}>}
 */
export const uploadToCloudinary = (fileBuffer, folder, options = {}) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
            {
                folder: `social-marketplace/${folder}`,
                resource_type: "auto", // supports both images and short videos
                timeout: 15000,        // fail fast instead of hanging the request thread
                ...options,
            },
            (error, result) => {
                if (error) {
                    return reject(new AppError(`Cloudinary upload failed: ${error.message}`, 502));
                }
                resolve({
                    url: result.secure_url,
                    publicId: result.public_id,
                    format: result.format,
                    bytes: result.bytes,
                });
            }
        );

        uploadStream.end(fileBuffer);
    });
};

/**
 * Uploads multiple files in parallel (e.g. up to 5 images on POST
 * /api/uploads/posts/:postId). Runs concurrently via Promise.all rather
 * than awaiting one at a time, since the uploads are independent of
 * each other.
 *
 * @param {Buffer[]} fileBuffers
 * @param {string} folder
 */
export const uploadMultipleToCloudinary = async (fileBuffers = [], folder) => {
    if (!fileBuffers.length) return [];
    return Promise.all(fileBuffers.map((buffer) => uploadToCloudinary(buffer, folder)));
};

/**
 * Deletes a single asset from Cloudinary by its publicId.
 * Called from upload.controller.js's DELETE /api/uploads/:id, after the
 * File document has been located but before it is removed from MongoDB —
 * so a failed cloud deletion stops the DB deletion too, avoiding an
 * orphaned MongoDB record pointing at a URL that no longer resolves.
 *
 * @param {string} publicId - the Cloudinary public_id stored on the File document
 */
export const deleteFromCloudinary = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId, { timeout: 10000 });
        if (result.result !== "ok" && result.result !== "not found") {
            throw new Error(result.result);
        }
        return result;
    } catch (error) {
        throw new AppError(`Cloudinary deletion failed: ${error.message}`, 502);
    }
};

/**
 * Deletes several assets at once — used when a Post is deleted and all
 * of its attached media needs to be cleaned up in one pass.
 *
 * @param {string[]} publicIds
 */
export const deleteMultipleFromCloudinary = async (publicIds = []) => {
    if (!publicIds.length) return [];
    return Promise.allSettled(publicIds.map((id) => deleteFromCloudinary(id)));
    // Promise.allSettled (not all) on purpose: if one asset was already
    // removed manually from the Cloudinary dashboard, that shouldn't block
    // cleanup of the remaining assets.
};