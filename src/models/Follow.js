import { Schema, model } from 'mongoose';

/**
 * Follow Schema
 * Directed follow relationships. Compound unique index prevents duplicates.
 */
const followSchema = new Schema(
    {
        follower: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Follower reference is required'],
        },
        following: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Following reference is required'],
        },
    },
    {
        timestamps: true,
    }
);

// CRITICAL: Compound unique index prevents duplicate follow records
followSchema.index({ follower: 1, following: 1 }, { unique: true });

// Index for "who follows me" queries
followSchema.index({ following: 1, createdAt: -1 });

// Index for "who do I follow" queries
followSchema.index({ follower: 1, createdAt: -1 });

const Follow = model('Follow', followSchema);
export default Follow;