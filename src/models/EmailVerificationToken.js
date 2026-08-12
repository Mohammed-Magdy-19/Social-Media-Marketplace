import { Schema, model } from 'mongoose';

/**
 * EmailVerificationToken Schema
 * One-time tokens for email verification flow. TTL ensures cleanup.
 */
const emailVerificationTokenSchema = new Schema(
    {
        token: {
            type: String,
            required: [true, 'Token is required'],
            unique: true,
            index: true,
        },
        user: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'User reference is required'],
        },
        expiresAt: {
            type: Date,
            required: [true, 'Expiration date is required'],
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        },
    },
    {
        timestamps: true,
    }
);

// TTL index: documents auto-delete 24 hours after creation
emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const EmailVerificationToken = model(
    'EmailVerificationToken',
    emailVerificationTokenSchema
);
export default EmailVerificationToken;