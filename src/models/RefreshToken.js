import { Schema, model } from 'mongoose';

/**
 * RefreshToken Schema
 * Manages persistent sessions for JWT rotation strategy.
 */
const refreshTokenSchema = new Schema(
    {
        token: {
            type: String,
            required: [true, 'Token string is required'],
            index: true,
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User reference is required'],
            index: true,
        },
        expiresAt: {
            type: Date,
            required: [true, 'Expiration date is required'],
        },
    },
    {
        timestamps: true,
    }
);

// TTL index: automatically delete expired tokens
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const RefreshToken = model('RefreshToken', refreshTokenSchema);
export default RefreshToken;