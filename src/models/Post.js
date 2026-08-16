import { Schema, model } from 'mongoose';

/**
 * Post Schema
 * Core content entity: text, media, categorization, and engagement counters.
 */
const postSchema = new Schema(
    {
        title: {
            type: String,
            required: [true, 'Post title is required'],
            trim: true,
            maxlength: [100, 'Title cannot exceed 100 characters'],
        },
        content: {
            type: String,
            required: [true, 'Post content is required'],
            trim: true,
        },
        media: {
            type: [String], // Array of secure Cloudinary asset URLs
            default: [],
            validate: {
                validator: function (arr) {
                    return arr.length <= 10; // Max 10 media items per post
                },
                message: 'Cannot attach more than 10 media files to a post',
            },
        },
        category: {
            type: Schema.Types.ObjectId,
            ref: 'Category',
            required: [true, 'Category is required'],
            index: true,
        },
        // Optional — a post is only a marketplace listing (Instant Buy /
        // Negotiate eligible) when this is set. Undefined/omitted means a
        // plain social post with nothing to purchase. Stored in the
        // smallest currency unit (cents) to match Payment.amount and avoid
        // float rounding, per §4.2 of the architecture doc.
        price: {
            type: Number,
            min: [0, 'Price cannot be negative'],
            default: undefined,
        },
        tags: {
            type: [String],
            default: [],
            index: true,
            validate: {
                validator: function (arr) {
                    return arr.length <= 20; // Max 20 tags
                },
                message: 'Cannot add more than 20 tags',
            },
        },
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Author is required'],
            index: true,
        },
        // Admin moderation state. Only ever written by an admin via
        // PATCH /api/posts/:id (see post.controller.js's field whitelist —
        // authors cannot set their own status). 'active' is the only
        // status shown in the public feed/search by default.
        status: {
            type: String,
            enum: ['active', 'hidden', 'flagged'],
            default: 'active',
            index: true,
        },
        likesCount: {
            type: Number,
            default: 0,
            min: 0,
        },
        commentsCount: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// CRITICAL: Compound index for feed performance at scale
// Supports queries like Post.find({ author: { $in: [...] }, status: 'active' }).sort({ createdAt: -1 })
postSchema.index({ author: 1, status: 1, createdAt: -1 });

// Index for tag-based discovery
postSchema.index({ tags: 1, createdAt: -1 });

// Index for category browsing
postSchema.index({ category: 1, createdAt: -1 });

// Text index for search functionality
postSchema.index({ title: 'text', content: 'text', tags: 'text' });

const Post = model('Post', postSchema);
export default Post;