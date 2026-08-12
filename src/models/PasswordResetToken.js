import { Schema, model } from 'mongoose';

/**
 * PasswordResetToken Schema
 * Short-lived tokens for secure password reset flow.
 */
const passwordResetTokenSchema = new Schema(
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
            default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        },
    },
    {
        timestamps: true,
    }
);

// TTL index: documents auto-delete 10 minutes after creation
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const PasswordResetToken = model(
    'PasswordResetToken',
    passwordResetTokenSchema
);
export default PasswordResetToken;