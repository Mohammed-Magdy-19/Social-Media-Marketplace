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
// Supports queries like Post.find({ author: { $in: [...] } }).sort({ createdAt: -1 })
postSchema.index({ author: 1, createdAt: -1 });

// Index for tag-based discovery
postSchema.index({ tags: 1, createdAt: -1 });

// Index for category browsing
postSchema.index({ category: 1, createdAt: -1 });

// Text index for search functionality
postSchema.index({ title: 'text', content: 'text', tags: 'text' });

const Post = model('Post', postSchema);
export default Post;