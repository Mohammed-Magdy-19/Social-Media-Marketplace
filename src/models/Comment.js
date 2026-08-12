import { Schema, model } from 'mongoose';

/**
 * Comment Schema
 * Supports threaded replies via parentComment reference.
 */
const commentSchema = new Schema(
    {
        post: {
            type: Schema.Types.ObjectId,
            ref: 'Post',
            required: [true, 'Post reference is required'],
            index: true,
        },
        author: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Author is required'],
            index: true,
        },
        text: {
            type: String,
            required: [true, 'Comment text is required'],
            trim: true,
            maxlength: [2000, 'Comment cannot exceed 2000 characters'],
        },
        parentComment: {
            type: Schema.Types.ObjectId,
            ref: 'Comment',
            default: null,
            index: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Index for fetching all comments on a post
commentSchema.index({ post: 1, createdAt: -1 });

// Index for fetching replies to a specific comment
commentSchema.index({ parentComment: 1, createdAt: 1 });

const Comment = model('Comment', commentSchema);
export default Comment;