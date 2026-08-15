import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";

/**
 * Initializes the Cloudinary SDK with credentials from env.js.
 * Import this configured `cloudinary` instance anywhere you need to
 * upload or delete an asset — never call cloudinary.config() again
 * elsewhere in the app.
 *
 * Usage in cloudinary.service.js:
 *   import cloudinary from "../integrations/cloudinary.js";
 *
 *   export const uploadImage = (fileBuffer, folder) => {
 *     return new Promise((resolve, reject) => {
 *       const stream = cloudinary.uploader.upload_stream(
 *         { folder, resource_type: "image" },
 *         (error, result) => (error ? reject(error) : resolve(result))
 *       );
 *       stream.end(fileBuffer);
 *     });
 *   };
 *
 *   export const deleteImage = (publicId) => {
 *     return cloudinary.uploader.destroy(publicId);
 *   };
 */
const { cloudName, apiKey, apiSecret } = env.cloudinary;

if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
        "Missing Cloudinary credentials. Ensure CLOUDINARY_CLOUD_NAME, " +
        "CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set in your .env file."
    );
}

cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
});

export default cloudinary;