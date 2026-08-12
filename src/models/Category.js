import { Schema, model } from 'mongoose';

/**
 * Category Schema
 * Organizes posts into browsable, URL-friendly groups.
 */
const categorySchema = new Schema(
    {
        name: {
            type: String,
            required: [true, 'Category name is required'],
            unique: true,
            trim: true,
            maxlength: [50, 'Category name cannot exceed 50 characters'],
        },
        slug: {
            type: String,
            required: [true, 'Slug is required'],
            unique: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        description: {
            type: String,
            trim: true,
            maxlength: [500, 'Description cannot exceed 500 characters'],
            default: '',
        },
        createdBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Creator reference is required'],
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual for post count in this category
categorySchema.virtual('postCount', {
    ref: 'Post',
    localField: '_id',
    foreignField: 'category',
    count: true,
});

const Category = model('Category', categorySchema)
export default Category;