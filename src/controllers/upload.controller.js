import asyncHandler from 'express-async-handler';
import File from "../models/File.js";
import User from "../models/User.js";
import Post from "../models/Post.js";
import AppError from "../utils/AppError.js";
import { env } from "../config/env.js";
import { getPagination, buildPaginatedResponse } from "../utils/paginate.js";
import {
    uploadToCloudinary,
    uploadMultipleToCloudinary,
    deleteFromCloudinary,
} from "../services/cloudinary.service.js";

// Fallback avatar shown after a user deletes their uploaded avatar.
// Sourced from CLOUDINARY_DEFAULT_AVATAR_URL in .env so the cloud name
// and asset path never have to be hardcoded/redeployed to change.
const DEFAULT_AVATAR_URL = env.cloudinary.defaultAvatarUrl;

/**
 * upload.controller.js
 * -----------------------------------------------------------------------
 * §2.10 — file type, size, and count validation all happen in
 * middleware/upload.middleware.js (Multer's fileFilter + limits) before
 * a request ever reaches these handlers, so req.file / req.files here
 * are already guaranteed to be within the whitelist and size ceiling.
 * Multer is configured with memoryStorage upstream, so req.file.buffer
 * is available for streaming straight to Cloudinary — nothing is ever
 * written to local disk.
 * -----------------------------------------------------------------------
 */

/**
 * POST /api/uploads/avatar
 * Uploads a single image, points the logged-in user's avatar at the
 * resulting secure URL, and logs the asset in the File collection.
 */
export const uploadAvatar = asyncHandler(async (req, res) => {
    if (!req.file) {
        throw new AppError("No file was provided. Attach an image under the 'avatar' field.", 400);
    }

    const result = await uploadToCloudinary(req.file.buffer, "avatars", {
        resource_type: "image",
        transformation: [{ width: 512, height: 512, crop: "fill", gravity: "face" }],
    });

    // Track the previous avatar's Cloudinary asset so it can be cleaned
    // up after the new one is safely saved — avoids leaving an orphaned
    // asset behind on every avatar change.
    const user = await User.findById(req.user.id);
    const previousFile = await File.findOne({
        owner: user._id,
        associatedEntity: "avatar",
    }).sort({ createdAt: -1 });

    const file = await File.create({
        url: result.url,
        publicId: result.publicId,
        mimeType: req.file.mimetype,
        fileSize: result.bytes,
        owner: user._id,
        resourceType: "image",
        associatedEntity: "avatar",
    });

    user.avatar = result.url;
    await user.save({ validateModifiedOnly: true });

    if (previousFile && previousFile.publicId !== file.publicId) {
        // Best-effort cleanup — a failure here shouldn't fail the request,
        // since the new avatar has already been saved successfully.
        try {
            await deleteFromCloudinary(previousFile.publicId);
            await previousFile.deleteOne();
        } catch (err) {
            // Swallowed intentionally: the user's avatar update already
            // succeeded; a stale, unreferenced Cloudinary asset left
            // behind is a minor cleanup issue, not a request failure.
        }
    }

    res.status(201).json({ status: "success", data: { avatar: user.avatar, file } });
});

/**
 * POST /api/uploads/posts/:postId
 * Verifies the requester owns the target post, uploads one or more
 * media files, and appends the resulting URLs to the post's media array.
 */
export const uploadPostMedia = asyncHandler(async (req, res) => {
    const { postId } = req.params;

    const post = await Post.findById(postId);
    if (!post) {
        throw new AppError("Post not found.", 404);
    }

    if (String(post.author) !== String(req.user.id) && req.user.role !== "admin") {
        throw new AppError("You are not authorized to add media to this post.", 403);
    }

    const files = req.files && req.files.length ? req.files : req.file ? [req.file] : [];
    if (!files.length) {
        throw new AppError("No files were provided. Attach images under the 'media' field.", 400);
    }

    const uploadResults = await uploadMultipleToCloudinary(
        files.map((f) => f.buffer),
        "posts"
    );

    // Persist a File document per asset so it's individually trackable
    // and deletable later, independent of the Post document itself.
    const fileDocs = await File.insertMany(
        uploadResults.map((result, i) => ({
            url: result.url,
            publicId: result.publicId,
            mimeType: files[i].mimetype,
            fileSize: result.bytes,
            owner: req.user.id,
            resourceType: "image",
            associatedPost: post._id,
            associatedEntity: "post",
        }))
    );

    post.media.push(...uploadResults.map((r) => r.url));
    await post.save({ validateModifiedOnly: true });

    res.status(201).json({ status: "success", data: { media: post.media, files: fileDocs } });
});

/**
 * DELETE /api/uploads/:id
 * Verifies ownership (uploader or admin), deletes the asset from
 * Cloudinary first, then removes the File document and cleans up any
 * reference left on the owning User or Post — in that order, so a
 * failed cloud deletion never leaves MongoDB out of sync with what's
 * actually still stored on Cloudinary.
 */
export const deleteUpload = asyncHandler(async (req, res) => {
    const file = await File.findById(req.params.id);

    if (!file) {
        throw new AppError("File not found.", 404);
    }

    if (String(file.owner) !== String(req.user.id) && req.user.role !== "admin") {
        throw new AppError("You are not authorized to delete this file.", 403);
    }

    await deleteFromCloudinary(file.publicId);

    if (file.associatedEntity === "avatar") {
        await User.findByIdAndUpdate(file.owner, {
            avatar: DEFAULT_AVATAR_URL,
        });
    }

    if (file.associatedEntity === "post" && file.associatedPost) {
        await Post.findByIdAndUpdate(file.associatedPost, {
            $pull: { media: file.url },
        });
    }

    await file.deleteOne();

    res.status(200).json({ status: "success", data: null });
});

/**
 * GET /api/uploads
 * Lists uploaded assets — backs both a personal "my files" view and the
 * admin Uploads asset grid (Vendo Admin PSD §6.10). Regular users only
 * ever see their own files, regardless of query params; an `owner`
 * filter is honored only when the requester is an admin, so this one
 * route can serve both audiences without leaking other users' files.
 *
 * Query params: owner? (admin-only), resourceType?, associatedEntity?, page?, limit?
 */
export const getUploads = asyncHandler(async (req, res) => {
    const { resourceType, associatedEntity, owner } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const filter = {};

    if (req.user.role === "admin") {
        if (owner) filter.owner = owner;
    } else {
        // Non-admins can never widen this to another user's files, even
        // by passing ?owner=<someoneElse> — the filter is always pinned
        // to the requester's own id.
        filter.owner = req.user.id;
    }

    if (resourceType) filter.resourceType = resourceType;
    if (associatedEntity) filter.associatedEntity = associatedEntity;
    if (req.query.search) {
        const searchRegex = new RegExp(req.query.search, "i");
        filter.$or = [
            { publicId: searchRegex },
            { mimeType: searchRegex },
            { url: searchRegex },
        ];
    }

    const files = await File.find(filter)
        .populate("owner", "username avatar firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .lean();

    const formattedFiles = files.map((file) => {
        const ownerName = file.owner
            ? file.owner.firstName && file.owner.lastName
                ? `${file.owner.firstName} ${file.owner.lastName}`.trim()
                : file.owner.username
            : "Unknown";
        return {
            ...file,
            id: file._id,
            name: file.publicId ? file.publicId.split("/").pop() : "Asset",
            kind:
                file.associatedEntity === "avatar"
                    ? "avatar"
                    : file.resourceType === "video"
                    ? "video"
                    : file.mimeType?.includes("pdf") || file.resourceType === "raw"
                    ? "document"
                    : "image",
            size: typeof file.fileSize === "number" && !isNaN(file.fileSize) ? file.fileSize : 0,
            fileSize: typeof file.fileSize === "number" && !isNaN(file.fileSize) ? file.fileSize : 0,
            owner: file.owner
                ? {
                      ...file.owner,
                      id: file.owner._id,
                      name: ownerName,
                  }
                : file.owner,
        };
    });

    res.status(200).json(buildPaginatedResponse(formattedFiles, page, limit));
});

/**
 * GET /api/uploads/:id
 * Returns an asset's metadata for client display or admin auditing.
 * Only the owner or an admin may view it, since fileSize/mimeType/owner
 * are internal bookkeeping fields, not public post data.
 */
export const getUpload = asyncHandler(async (req, res) => {
    const file = await File.findById(req.params.id).populate("owner", "username avatar");

    if (!file) {
        throw new AppError("File not found.", 404);
    }

    if (String(file.owner._id) !== String(req.user.id) && req.user.role !== "admin") {
        throw new AppError("You are not authorized to view this file.", 403);
    }

    res.status(200).json({ status: "success", data: { file } });
});