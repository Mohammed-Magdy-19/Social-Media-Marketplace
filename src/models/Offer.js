import { Schema, model } from 'mongoose';

/**
 * Offer Schema
 * A single proposed price in a negotiation thread. Offers chain via
 * `previousOffer` so a full counter-offer history is reconstructable —
 * countering never edits an existing offer in place, it marks the old
 * one 'countered' and creates a new 'pending' one pointing back at it.
 *
 * Enforces 24-hour automatic expiration, fatigue counters (max 3 rounds per party),
 * and automatic system cancellation upon listing checkout.
 */
const offerSchema = new Schema(
    {
        conversation: {
            type: Schema.Types.ObjectId,
            ref: 'Conversation',
            required: [true, 'Conversation reference is required'],
            index: true,
        },
        post: {
            type: Schema.Types.ObjectId,
            ref: 'Post',
            required: [true, 'Post reference is required'],
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
            required: [true, 'Seller reference is required'],
        },
        // Whoever proposed THIS specific offer — alternates between buyer
        // and seller as a counter-offer chain goes back and forth.
        proposedBy: {
            type: Schema.Types.ObjectId,
            ref: 'User',
            required: [true, 'proposedBy is required'],
        },
        // Smallest currency unit (cents), matching Post.price and
        // Payment.amount so an accepted offer can flow straight into
        // POST /api/payments/create-intent without a unit conversion.
        amount: {
            type: Number,
            required: [true, 'Amount is required'],
            min: [0, 'Amount cannot be negative'],
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'rejected', 'countered', 'expired', 'system_cancelled'],
            default: 'pending',
            index: true,
        },
        previousOffer: {
            type: Schema.Types.ObjectId,
            ref: 'Offer',
            default: null,
        },
        // Fatigue controls: number of counter-offers issued by each party
        counterCountBuyer: {
            type: Number,
            default: 0,
        },
        counterCountSeller: {
            type: Number,
            default: 0,
        },
        // 24-hour expiration window
        expiresAt: {
            type: Date,
            default: () => new Date(Date.now() + 24 * 60 * 60 * 1000),
            index: true,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true },
    }
);

// Enforces/optimizes the "only one pending offer per conversation+post"
// rule checked in offer.controller.js's createOffer.
offerSchema.index({ conversation: 1, post: 1, status: 1 });

const Offer = model('Offer', offerSchema);
export default Offer;