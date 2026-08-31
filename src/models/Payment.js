import { Schema, model } from 'mongoose';

/**
 * Payment Schema
 * Records marketplace transactions processed via external payment gateways.
 */
const paymentSchema = new Schema(
    {
        amount: {
            type: Number,
            required: [true, 'Amount is required'],
            min: [0.01, 'Amount must be greater than 0'],
        },
        currency: {
            type: String,
            required: [true, 'Currency is required'],
            uppercase: true,
            trim: true,
            default: 'USD',
            match: [/^[A-Z]{3}$/, 'Currency must be a valid 3-letter ISO code'],
        },
        provider: {
            type: String,
            enum: ['stripe', 'paypal'],
            required: [true, 'Payment provider is required'],
        },
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed', 'refunded'],
            default: 'pending',
            index: true,
        },
        transactionId: {
            type: String,
            required: [true, 'Transaction ID is required'],
            unique: true,
            index: true,
        },
        buyer: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'Buyer reference is required'],
        },
        seller: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: false, // Optional: not all payments are marketplace sales
        },
        post: {
            type: Schema.Types.ObjectId,
            ref: 'Post',
            required: false, // Optional: link to the purchased listing
        },
        buyerPhoneNumber: {
            type: String,
            trim: true,
            required: [true, 'Buyer phone number is required'],
        },
        shippingAddress: {
            street: { type: String, trim: true },
            city: { type: String, trim: true },
            state: { type: String, trim: true },
            postalCode: { type: String, trim: true },
            country: { type: String, trim: true },
            fullAddress: { type: String, trim: true },
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

// Index for buyer's purchase history
paymentSchema.index({ buyer: 1, createdAt: -1 });

// Index for seller's sales history
paymentSchema.index({ seller: 1, createdAt: -1 });

const Payment = model('Payment', paymentSchema);
export default Payment;