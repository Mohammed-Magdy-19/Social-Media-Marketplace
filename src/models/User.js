import { Schema, model } from 'mongoose';
import { genSalt, hash, compare } from 'bcrypt';

/**
 * User Schema
 * Stores profiles, credentials, verification status, and platform role.
 */
const userSchema = new Schema(
    {
        username: {
            type: String,
            required: [true, 'Username is required'],
            unique: true,
            trim: true,
            lowercase: true,
            minlength: [3, 'Username must be at least 3 characters'],
            maxlength: [30, 'Username cannot exceed 30 characters'],
            index: true,
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            trim: true,
            lowercase: true,
            index: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                'Please provide a valid email address',
            ],
        },
        password: {
            type: String,
            required: [true, 'Password is required'],
            minlength: [8, 'Password must be at least 8 characters'],
            select: false, // Excluded from query results by default
        },
        role: {
            type: String,
            enum: ['user', 'moderator', 'admin'],
            default: 'user',
        },
        status: {
            type: String,
            enum: ['active', 'suspended', 'banned'],
            default: 'active',
        },
        avatar: {
            type: String,
            default: 'https://res.cloudinary.com/default/avatar.png',
        },
        bio: {
            type: String,
            maxlength: [160, 'Bio cannot exceed 160 characters'],
            trim: true,
            default: '',
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
    },
    {
        timestamps: true, // Automatic createdAt and updatedAt
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Virtual for follower count (populated via Follow collection)
userSchema.virtual('followerCount', {
    ref: 'Follow',
    localField: '_id',
    foreignField: 'following',
    count: true,
});

// Virtual for following count
userSchema.virtual('followingCount', {
    ref: 'Follow',
    localField: '_id',
    foreignField: 'follower',
    count: true,
});

// Index for efficient user lookups
userSchema.index({ username: 1, email: 1 });

// Pre-save middleware: hash password before saving
userSchema.pre('save', async function () {
    // Only hash if password is modified
    if (!this.isModified('password')) return;

    const salt = await genSalt(12);
    this.password = await hash(this.password, salt);
});

// Instance method: compare candidate password with stored hash
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await compare(candidatePassword, this.password);
};

const User = model('User', userSchema)
export default User;