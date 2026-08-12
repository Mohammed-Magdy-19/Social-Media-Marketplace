import { Schema, model } from 'mongoose';

/**
 * AuditLog Schema
 * Immutable record of sensitive administrative actions for accountability.
 */
const auditLogSchema = new Schema(
    {
        actor: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Actor (admin) reference is required'],
        },
        action: {
            type: String,
            required: [true, 'Action description is required'],
            trim: true,
            enum: [
                'USER_BAN',
                'USER_SUSPEND',
                'USER_REACTIVATE',
                'ROLE_CHANGE',
                'CATEGORY_CREATE',
                'CATEGORY_UPDATE',
                'CATEGORY_DELETE',
                'REPORT_RESOLVE',
                'REPORT_DISMISS',
                'POST_DELETE',
                'COMMENT_DELETE',
            ],
        },
        targetType: {
            type: String,
            enum: ['user', 'post', 'comment', 'category', 'report', 'system'],
            required: [true, 'Target type is required'],
        },
        targetId: {
            type: Schema.Types.ObjectId,
            required: false,
        },
        details: {
            type: Schema.Types.Mixed,
            default: {},
        },
        ipAddress: {
            type: String,
            trim: true,
            default: null,
        },
        userAgent: {
            type: String,
            trim: true,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

// Index for querying audit history by actor
auditLogSchema.index({ actor: 1, createdAt: -1 });

// Index for querying audit history by target
auditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });

// Index for querying by action type
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = model('AuditLog', auditLogSchema);
export default AuditLog;