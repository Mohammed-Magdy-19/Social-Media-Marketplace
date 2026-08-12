import { Schema, model } from 'mongoose';

/**
 * Report Schema
 * User-filed complaints for content moderation queue.
 */
const reportSchema = new Schema(
    {
        reporter: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Reporter is required'],
        },
        targetType: {
            type: String,
            enum: ['post', 'comment', 'user'],
            required: [true, 'Target type is required'],
        },
        targetId: {
            type: Schema.Types.ObjectId,
            required: [true, 'Target ID is required'],
            // Polymorphic reference: interpreted alongside targetType
        },
        reason: {
            type: String,
            required: [true, 'Reason is required'],
            trim: true,
            maxlength: [1000, 'Reason cannot exceed 1000 characters'],
        },
        status: {
            type: String,
            enum: ['pending', 'reviewed', 'dismissed', 'resolved'],
            default: 'pending',
            index: true,
        },
        resolutionNotes: {
            type: String,
            trim: true,
            maxlength: [2000, 'Resolution notes cannot exceed 2000 characters'],
            default: '',
        },
        resolvedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            default: null,
        },
        resolvedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Index for moderation dashboard queries
reportSchema.index({ status: 1, createdAt: -1 });

// Index for reports against a specific target
reportSchema.index({ targetType: 1, targetId: 1 });

const Report = model('Report', reportSchema);
export default Report;