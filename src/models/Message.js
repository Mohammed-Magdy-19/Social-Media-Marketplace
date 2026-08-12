import { Schema, model } from 'mongoose';

/**
 * Message Schema
 * Individual chat messages within a conversation.
 */

const messageSchema = new Schema(
    {
        conversation: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: [true, 'Conversation reference is required'],
            index: true,
        },
        sender: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Sender is required'],
        },
        text: {
            type: String,
            trim: true,
            maxlength: [5000, 'Message cannot exceed 5000 characters'],
            default: '',
        },
        attachments: {
            type: [String], // Cloudinary asset links
            default: [],
        },
        isRead: {
            type: Boolean,
            default: false,
        },
        readBy: [
            {
                user: {
                    type: Schema.Types.ObjectId,
                    ref: 'User',
                },
                readAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
    },
    {
        timestamps: true,
    }
);

// Index for fetching messages in a conversation chronologically
messageSchema.index({ conversation: 1, createdAt: 1 });

// Index for unread messages per user
messageSchema.index({ conversation: 1, sender: 1, isRead: 1 });

const Message = model('Message', messageSchema);
export default Message;