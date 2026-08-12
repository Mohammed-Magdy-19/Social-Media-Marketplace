import { Schema, model } from 'mongoose';

/**
 * SavedPost Schema
 * User bookmarks. Compound unique index prevents duplicate saves.
 */
const savedPostSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User reference is required'],
        },
        post: {
            type: Schema.Types.ObjectId,
            ref: 'Post',
            required: [true, 'Post reference is required'],
        },
    },
    {
        timestamps: true,
    }
);

// CRITICAL: Compound unique index prevents duplicate bookmarks
savedPostSchema.index({ user: 1, post: 1 }, { unique: true });

const SavedPost = model('SavedPost', savedPostSchema);
export default SavedPost;