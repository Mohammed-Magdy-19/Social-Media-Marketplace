import { Schema, model } from 'mongoose';

/**
 * Notification Schema
 * Personal alerts for likes, comments, follows, messages, and new posts.
 */
const notificationSchema = new Schema(
    {
        recipient: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Recipient is required'],
            index: true,
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Sender is required'],
        },
        type: {
            type: String,
            enum: [
                'LIKE',
                'COMMENT',
                'FOLLOW',
                'MESSAGE',
                'NEW_POST',
                'REPORT_RESOLVED',
                'REPORT_DISMISSED',
                'MODERATION',
            ],
            required: [true, 'Notification type is required'],
        },
        isRead: {
            type: Boolean,
            default: false,
            index: true,
        },
        targetId: {
            type: Schema.Types.ObjectId,
            required: false,
            // Dynamic reference: could be Post, Comment, Message, etc.
            // The consuming service interprets based on type
        },
        metadata: {
            type: Schema.Types.Mixed,
            default: {},
        },
    },
    {
        timestamps: true,
    }
);

// Index for unread count queries (bell badge)
notificationSchema.index({ recipient: 1, isRead: 1 });

// Index for fetching notification history
notificationSchema.index({ recipient: 1, createdAt: -1 });

const Notification = model('Notification', notificationSchema); 
export default Notification;