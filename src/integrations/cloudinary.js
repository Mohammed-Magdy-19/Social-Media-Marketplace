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
cloudinary.config({
    cloud_name: env.cloudinary.cloudName,
    api_key: env.cloudinary.apiKey,
    api_secret: env.cloudinary.apiSecret,
});

export default cloudinary;