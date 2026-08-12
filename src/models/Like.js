import { Schema, model } from 'mongoose';

/**
 * Like Schema
 * Tracks user-post likes. Compound unique index prevents duplicates.
 */
const likeSchema = new Schema(
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

// CRITICAL: Compound unique index prevents duplicate likes
likeSchema.index({ user: 1, post: 1 }, { unique: true });

const Like = model('Like', likeSchema);
export default Like;