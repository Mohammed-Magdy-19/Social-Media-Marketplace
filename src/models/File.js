import { Schema, model } from 'mongoose';

/**
 * File Schema
 * Centralized registry for all uploaded assets.
 */
const fileSchema = new Schema(
    {
        url: {
            type: String,
            required: [true, 'File URL is required'],
            trim: true,
        },
        publicId: {
            type: String,
            required: [true, 'Cloudinary public ID is required'],
            index: true,
        },
        mimeType: {
            type: String,
            required: [true, 'MIME type is required'],
            trim: true,
        },
        fileSize: {
            type: Number,
            required: [true, 'File size is required'],
            min: 0,
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Owner reference is required'],
            index: true,
        },
        resourceType: {
            type: String,
            enum: ['image', 'video', 'raw', 'auto'],
            default: 'image',
        },
        associatedPost: {
            type: Schema.Types.ObjectId,
            ref: 'Post',
            default: null,
            index: true,
        },
        associatedEntity: {
            type: String,
            enum: ['avatar', 'post', 'message', 'other'],
            default: 'other',
        },
    },
    {
        timestamps: true,
    }
);

// Index for cleaning up files by owner
fileSchema.index({ owner: 1, createdAt: -1 });

const File = model('File', fileSchema); 
export default File;