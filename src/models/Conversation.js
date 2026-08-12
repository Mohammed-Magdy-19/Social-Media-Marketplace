import { Schema, model } from 'mongoose';

/**
 * Conversation Schema
 * Groups participants for chat threads.
 */
const conversationSchema = new Schema(
    {
        participants: {
            type: [
                {
                    type: Schema.Types.ObjectId,
                    ref: 'User',
                },
            ],
            validate: {
                validator: function (arr) {
                    return arr.length >= 2;
                },
                message: 'A conversation must have at least 2 participants',
            },
            required: [true, 'Participants are required'],
        },
        lastMessage: {
            type: Schema.Types.ObjectId,
            ref: 'Message',
            default: null,
        },
        title: {
            type: String,
            trim: true,
            default: '',
        },
        isGroup: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Index for finding conversations a user participates in
conversationSchema.index({ participants: 1, updatedAt: -1 });

const Conversation = model('Conversation', conversationSchema);
export default Conversation;