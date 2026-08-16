import asyncHandler from 'express-async-handler';
import Offer from '../models/Offer.js';
import Conversation from '../models/Conversation.js';
import Post from '../models/Post.js';
import AppError from '../utils/AppError.js';
import { getIO } from '../config/socket.js';

/**
 * offer.controller.js
 * -----------------------------------------------------------------------
 * Negotiation offers, nested under a conversation
 * (/api/conversations/:conversationId/offers). Hybrid, matching the
 * comment/like pattern used elsewhere in the API: REST persists each
 * offer as a structured, queryable document — so "accept"/"reject"/
 * "counter" have real state to act on, unlike a free-text chat message —
 * and a lightweight Socket.io broadcast (`offer_created` / `offer_updated`)
 * to the conversation room lets both sides see the update instantly
 * without a poll, the same reasoning §2.5/§2.6 use for likes/comments.
 *
 * A negotiation is always anchored to a specific marketplace listing
 * (Post.price must be set) and a 1:1 conversation between the listing's
 * author (seller) and the other participant (buyer). Offers chain via
 * `previousOffer` so a full counter-offer history is reconstructable,
 * and only one offer per conversation+post may be "pending" at a time —
 * the counterparty must accept/reject/counter it before a fresh one can
 * be opened, keeping the state machine unambiguous.
 * -----------------------------------------------------------------------
 */

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
 * Resolves buyer/seller roles for a post + conversation pair. The post's
 * author is always the seller; the other conversation participant is the
 * buyer. Throws if neither participant is actually the post's author —
 * a conversation with the wrong two people can't be used to negotiate it.
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
 *
 * Body: { postId: string, amount: number }
 */
export const createOffer = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    const { postId, amount } = req.body;

    const { participantIds } = await assertParticipant(conversationId, req.user.id);

    const post = await Post.findById(postId).select('author price status');
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

    const existingPending = await Offer.findOne({
        conversation: conversationId,
        post: postId,
        status: 'pending',
    });
    if (existingPending) {
        throw new AppError(
            'There is already a pending offer on this listing in this conversation — respond to it before opening a new one.',
            409
        );
    }

    const offer = await Offer.create({
        conversation: conversationId,
        post: postId,
        buyer: buyerId,
        seller: sellerId,
        proposedBy: req.user.id,
        amount,
    });

    // Fire-and-forget, same pattern as feed_update_available in
    // post.controller.js — a socket failure must never fail the write.
    try {
        getIO().to(`conversation_${conversationId}`).emit('offer_created', offer);
    } catch (err) {
        // Socket layer being unavailable must never fail an already-successful write.
    }

    res.status(201).json({ status: 'success', data: { offer } });
});

/**
 * GET /api/conversations/:conversationId/offers
 * Full offer history for the conversation, oldest first, so the chat UI
 * can render the negotiation as a chronological thread of offer cards
 * interleaved with regular messages.
 */
export const getOffers = asyncHandler(async (req, res) => {
    const { conversationId } = req.params;
    await assertParticipant(conversationId, req.user.id);

    const offers = await Offer.find({ conversation: conversationId })
        .sort({ createdAt: 1 })
        .populate('proposedBy', 'username avatar')
        .populate('post', 'title media price')
        .lean();

    res.status(200).json({ status: 'success', data: { offers } });
});

/**
 * PATCH /api/conversations/:conversationId/offers/:offerId
 * Accept, reject, or counter a pending offer. Only the participant who
 * did NOT propose the offer may respond to it — you can't accept,
 * reject, or counter your own offer.
 *
 * Body: { action: 'accept' | 'reject' | 'counter', amount?: number }
 * `amount` is required (and only used) when action is 'counter'.
 */
export const respondToOffer = asyncHandler(async (req, res) => {
    const { conversationId, offerId } = req.params;
    const { action, amount } = req.body;

    await assertParticipant(conversationId, req.user.id);

    const offer = await Offer.findOne({ _id: offerId, conversation: conversationId });
    if (!offer) {
        throw new AppError('Offer not found.', 404);
    }
    if (offer.status !== 'pending') {
        throw new AppError(`This offer is already ${offer.status} and can no longer be responded to.`, 409);
    }
    if (String(offer.proposedBy) === String(req.user.id)) {
        throw new AppError('You cannot respond to your own offer.', 403);
    }

    let newOffer;

    if (action === 'accept') {
        offer.status = 'accepted';
        await offer.save();
    } else if (action === 'reject') {
        offer.status = 'rejected';
        await offer.save();
    } else {
        // action === 'counter' — schema-guaranteed by respondOfferSchema's
        // refine, which requires `amount` whenever action is 'counter'.
        offer.status = 'countered';
        await offer.save();

        newOffer = await Offer.create({
            conversation: conversationId,
            post: offer.post,
            buyer: offer.buyer,
            seller: offer.seller,
            proposedBy: req.user.id,
            amount,
            previousOffer: offer._id,
        });
    }

    try {
        getIO().to(`conversation_${conversationId}`).emit('offer_updated', { offer, newOffer });
    } catch (err) {
        // Socket layer being unavailable must never fail an already-successful write.
    }

    res.status(200).json({ status: 'success', data: { offer, newOffer } });
});