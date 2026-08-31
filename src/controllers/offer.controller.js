import asyncHandler from 'express-async-handler';
import Offer from '../models/Offer.js';
import Conversation from '../models/Conversation.js';
import Post from '../models/Post.js';
import AppError from '../utils/AppError.js';
import { getIO } from '../config/socket.js';
import { createNotification } from '../services/notification.service.js';

/**
 * offer.controller.js
 * -----------------------------------------------------------------------
 * State-Machine-Driven Negotiation Engine
 *
 * Core Rules:
 * 1. Anti-Lowball Floor: Initial offers must be >= 70% of listing price.
 * 2. Counter Convergence:
 *    - Seller counter: < listing price and > buyer's last offer.
 *    - Buyer counter: > buyer's prior offer and < seller's last counter.
 * 3. Fatigue Controls: Capped at 3 counter rounds per party per listing.
 * 4. 24-Hour Expiration: Offers expire automatically after 24 hours.
 * 5. Competing Offer Cancellation: Accepting an offer invalidates competing
 *    pending offers on the same listing with 'system_cancelled'.
 * -----------------------------------------------------------------------
 */

const MAX_COUNTER_ROUNDS = 3;
const MIN_OFFER_RATIO = 0.70; // 70% floor
const EXPIRATION_HOURS = 24;

/**
 * Shared guard: loads the conversation, confirms it's a 1:1 thread the
 * requester participates in, and returns { conversation, participantIds }.
 */
const assertParticipant = async (conversationId, userId) => {
    const conversation = await Conversation.findById(conversationId).select('participants isGroup');
    if (!conversation) {
        throw new AppError('Conversation not found.', 404);
    }
    if (conversation.isGroup) {
        throw new AppError('Negotiation offers are only supported in 1:1 conversations.', 400);
    }
    const participantIds = conversation.participants.map(String);
    if (!participantIds.includes(String(userId))) {
        throw new AppError('You are not a participant in this conversation.', 403);
    }
    return { conversation, participantIds };
};

/**
 * Resolves buyer/seller roles for a post + conversation pair.
 */
const resolveRoles = (post, participantIds) => {
    const sellerId = String(post.author);
    if (!participantIds.includes(sellerId)) {
        throw new AppError("This conversation isn't with the listing's seller.", 400);
    }
    const buyerId = participantIds.find((id) => id !== sellerId);
    return { buyerId, sellerId };
};

/**
 * POST /api/conversations/:conversationId/offers
 * Opens a new negotiation on a listing within this conversation.
 */
export const createOffer = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { postId, amount } = req.body;

    const { participantIds } = await assertParticipant(conversationId, req.user.id);

    const post = await Post.findById(postId).select('author price status title');
    if (!post) {
        throw new AppError('Post not found.', 404);
    }
    if (typeof post.price !== 'number') {
        throw new AppError('This post is not a marketplace listing and cannot be negotiated.', 400);
    }
    if (post.status !== 'active') {
        throw new AppError('This listing is no longer available.', 400);
    }

    const { buyerId, sellerId } = resolveRoles(post, participantIds);

    if (String(req.user.id) === sellerId) {
        throw new AppError('As the seller, you cannot initiate an offer on your own listing — wait for a buyer to make an offer.', 400);
    }

    // Anti-Lowball Floor Check (Rule 2.A: Offer >= 70% of Listing Price)
    const minOfferCents = Math.round(post.price * MIN_OFFER_RATIO);
    if (amount < minOfferCents) {
        const formattedMin = (minOfferCents / 100).toFixed(2);
        throw new AppError(`Offer amount is below the platform minimum. Initial offers must be at least 70% of the listing price ($${formattedMin}).`, 400);
    }

    if (amount > post.price) {
        throw new AppError('Offer amount cannot exceed the listing price. Use Instant Buy instead.', 400);
    }

    // Check for existing pending offers and auto-expire stale ones
    const existingPending = await Offer.findOne({
        conversation: conversationId,
        post: postId,
        status: 'pending',
    });

    if (existingPending) {
        if (existingPending.expiresAt && new Date(existingPending.expiresAt) <= new Date()) {
            existingPending.status = 'expired';
            await existingPending.save();
        } else {
            throw new AppError(
                'There is already an active pending offer on this listing in this conversation — respond to it before opening a new one.',
                409
            );
        }
    }

    const expiresAt = new Date(Date.now() + EXPIRATION_HOURS * 60 * 60 * 1000);

    const offer = await Offer.create({
        conversation: conversationId,
        post: postId,
        buyer: buyerId,
        seller: sellerId,
        proposedBy: req.user.id,
        amount,
        status: 'pending',
        counterCountBuyer: 0,
        counterCountSeller: 0,
        expiresAt,
    });

    const offerObj = offer.toObject({ virtuals: true });

    // Real-time socket broadcast to conversation room
    try {
        getIO().to(`conversation_${conversationId}`).emit('offer_created', offerObj);
    } catch (err) {
        // Socket failure must not fail the write
    }

    // Dispatch notification to the seller
    try {
        await createNotification({
            recipient: sellerId,
            sender: req.user.id,
            type: 'OFFER_RECEIVED',
            targetId: post._id,
            metadata: {
                conversationId,
                offerId: offer._id,
                amount,
                postTitle: post.title,
            },
        });
    } catch (err) {
        // Notification failure must not block the response
    }

    res.status(201).json({ status: 'success', data: { offer: offerObj } });
});

/**
 * GET /api/conversations/:conversationId/offers
 * Full offer history for the conversation, oldest first.
 * Automatically marks expired pending offers.
 */
export const getOffers = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    await assertParticipant(conversationId, req.user.id);

    // Auto-expire any pending offers that passed their expiration window
    const now = new Date();
    await Offer.updateMany(
        {
            conversation: conversationId,
            status: 'pending',
            expiresAt: { $lte: now },
        },
        { status: 'expired' }
    );

    const offers = await Offer.find({ conversation: conversationId })
        .sort({ createdAt: 1 })
        .populate('proposedBy', 'username avatar')
        .populate('post', 'title media price currency')
        .lean();

    res.status(200).json({ status: 'success', data: { offers } });
});

/**
 * PATCH /api/conversations/:conversationId/offers/:offerId
 * Accept, reject, or counter a pending offer.
 */
export const respondToOffer = asyncHandler(async (req, res) => {
    const { conversationId, offerId } = req.params;
    const { action, amount } = req.body;

    await assertParticipant(conversationId, req.user.id);

    const offer = await Offer.findOne({ _id: offerId, conversation: conversationId });
    if (!offer) {
        throw new AppError('Offer not found.', 404);
    }

    // Expiration check (24h clock)
    if (offer.status === 'pending' && offer.expiresAt && new Date(offer.expiresAt) <= new Date()) {
        offer.status = 'expired';
        await offer.save();
        throw new AppError('This offer has expired (24-hour limit exceeded) and can no longer be acted upon.', 400);
    }

    if (offer.status !== 'pending') {
        throw new AppError(`This offer is already ${offer.status} and can no longer be responded to.`, 409);
    }

    if (String(offer.proposedBy) === String(req.user.id)) {
        throw new AppError('You cannot respond to your own offer — wait for the counterparty to respond.', 403);
    }

    const post = await Post.findById(offer.post).select('author price status title');
    if (!post) {
        throw new AppError('Listing not found.', 404);
    }
    if (post.status !== 'active' && action === 'accept') {
        throw new AppError('This listing is no longer available for purchase.', 400);
    }

    const isSeller = String(req.user.id) === String(offer.seller);
    const isBuyer = String(req.user.id) === String(offer.buyer);
    const counterpartyId = isSeller ? offer.buyer : offer.seller;

    let newOffer;

    if (action === 'accept') {
        offer.status = 'accepted';
        await offer.save();

        // Competing offer resolution (Invalidate other active pending offers on this post)
        try {
            const competingOffers = await Offer.find({
                post: offer.post,
                _id: { $ne: offer._id },
                status: 'pending',
            });

            if (competingOffers.length > 0) {
                await Offer.updateMany(
                    { post: offer.post, _id: { $ne: offer._id }, status: 'pending' },
                    { status: 'system_cancelled' }
                );

                for (const comp of competingOffers) {
                    getIO().to(`conversation_${comp.conversation}`).emit('offer_updated', {
                        offer: { ...comp.toObject({ virtuals: true }), status: 'system_cancelled' },
                    });
                }
            }
        } catch (err) {
            // Non-critical background cleanup failure
        }

        // Notify offer creator of acceptance
        try {
            await createNotification({
                recipient: offer.proposedBy,
                sender: req.user.id,
                type: 'OFFER_ACCEPTED',
                targetId: post._id,
                metadata: {
                    conversationId,
                    offerId: offer._id,
                    amount: offer.amount,
                    postTitle: post.title,
                },
            });
        } catch (err) {}

    } else if (action === 'reject') {
        offer.status = 'rejected';
        await offer.save();

        // Notify offer creator of decline
        try {
            await createNotification({
                recipient: offer.proposedBy,
                sender: req.user.id,
                type: 'OFFER_DECLINED',
                targetId: post._id,
                metadata: {
                    conversationId,
                    offerId: offer._id,
                    amount: offer.amount,
                    postTitle: post.title,
                },
            });
        } catch (err) {}

    } else {
        // action === 'counter'
        // 1. Fatigue Control Check (Cap: 3 rounds per party)
        const currentBuyerCounters = offer.counterCountBuyer || 0;
        const currentSellerCounters = offer.counterCountSeller || 0;

        if (isSeller && currentSellerCounters >= MAX_COUNTER_ROUNDS) {
            throw new AppError(`You have reached the maximum counter limit (${MAX_COUNTER_ROUNDS} rounds). You must either accept or decline the offer.`, 400);
        }
        if (isBuyer && currentBuyerCounters >= MAX_COUNTER_ROUNDS) {
            throw new AppError(`You have reached the maximum counter limit (${MAX_COUNTER_ROUNDS} rounds). You must either accept or decline the offer.`, 400);
        }

        // 2. Counter-Offer Convergence Logic (Rule 2.B)
        if (isSeller) {
            // Seller counter must be < listing price and > buyer's last offer
            if (amount >= post.price) {
                const formattedPrice = (post.price / 100).toFixed(2);
                throw new AppError(`Counter-offer must be lower than the original listing price ($${formattedPrice}).`, 400);
            }
            if (amount <= offer.amount) {
                const formattedOffer = (offer.amount / 100).toFixed(2);
                throw new AppError(`Counter-offer must be higher than the buyer's offer ($${formattedOffer}).`, 400);
            }
        } else if (isBuyer) {
            // Buyer counter must be > buyer's previous offer and < seller's last counter-offer
            if (amount >= offer.amount) {
                const formattedSellerOffer = (offer.amount / 100).toFixed(2);
                throw new AppError(`Counter-offer must be lower than the seller's counter-offer ($${formattedSellerOffer}).`, 400);
            }

            // Find buyer's previous proposed amount in the chain
            let buyerPreviousAmount = Math.round(post.price * MIN_OFFER_RATIO);
            if (offer.previousOffer) {
                const prev = await Offer.findById(offer.previousOffer).select('amount proposedBy');
                if (prev) {
                    buyerPreviousAmount = prev.amount;
                }
            }

            if (amount <= buyerPreviousAmount) {
                const formattedPrev = (buyerPreviousAmount / 100).toFixed(2);
                throw new AppError(`Counter-offer must be higher than your previous proposed price ($${formattedPrev}).`, 400);
            }
        }

        offer.status = 'countered';
        await offer.save();

        const nextBuyerCount = isBuyer ? currentBuyerCounters + 1 : currentBuyerCounters;
        const nextSellerCount = isSeller ? currentSellerCounters + 1 : currentSellerCounters;
        const expiresAt = new Date(Date.now() + EXPIRATION_HOURS * 60 * 60 * 1000);

        newOffer = await Offer.create({
            conversation: conversationId,
            post: offer.post,
            buyer: offer.buyer,
            seller: offer.seller,
            proposedBy: req.user.id,
            amount,
            status: 'pending',
            previousOffer: offer._id,
            counterCountBuyer: nextBuyerCount,
            counterCountSeller: nextSellerCount,
            expiresAt,
        });

        // Notify counterparty
        try {
            await createNotification({
                recipient: counterpartyId,
                sender: req.user.id,
                type: 'OFFER_COUNTERED',
                targetId: post._id,
                metadata: {
                    conversationId,
                    offerId: newOffer._id,
                    amount,
                    postTitle: post.title,
                },
            });
        } catch (err) {}
    }

    // Normalise to plain objects with `id` virtual for socket/REST parity
    const offerObj = offer.toObject({ virtuals: true });
    const newOfferObj = newOffer ? newOffer.toObject({ virtuals: true }) : undefined;

    try {
        getIO().to(`conversation_${conversationId}`).emit('offer_updated', { offer: offerObj, newOffer: newOfferObj });
    } catch (err) {
        // Socket failure must not block response
    }

    res.status(200).json({ status: 'success', data: { offer: offerObj, newOffer: newOfferObj } });
});