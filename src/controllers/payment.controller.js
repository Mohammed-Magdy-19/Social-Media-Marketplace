import asyncHandler from 'express-async-handler';
import Payment from "../models/Payment.js";
import AppError from "../utils/AppError.js";
import { getPagination, buildPaginatedResponse } from "../utils/paginate.js";
import {
    createPaymentIntent as createPaymentIntentService,
    verifyWebhookSignature,
    processWebhookEvent,
    refundPayment as refundPaymentService,
} from "../services/payment.service.js";

/**
 * payment.controller.js
 * -----------------------------------------------------------------------
 * §4.2 — the frontend tokenizes card details directly with Stripe, so raw
 * card numbers never touch this backend (avoiding PCI-DSS scope). This
 * controller only ever handles amounts, currency, and Stripe's own
 * opaque identifiers (PaymentIntent IDs) — never a card number, CVC, or
 * expiry date.
 *
 * Payment status is never trusted from the client. The only two places
 * that are allowed to move a Payment out of "pending" are:
 *   1. handleStripeWebhook below, driven by Stripe's own signed event.
 *   2. refundPayment (admin-only), which calls Stripe directly rather
 *      than trusting a client-supplied "refunded: true" flag.
 * -----------------------------------------------------------------------
 */

/**
 * POST /api/payments/create-intent
 * Creates a Stripe PaymentIntent and a matching "pending" Payment
 * document. Returns the client secret the frontend needs to confirm
 * the payment with Stripe.js.
 *
 * Body: { amount: number (smallest currency unit, e.g. cents), currency: string, postId?: string }
 */
export const createPaymentIntent = asyncHandler(async (req, res) => {
    const { amount, currency = "usd", postId } = req.body;

    if (!amount || amount <= 0) {
        throw new AppError("A positive 'amount' (in the smallest currency unit) is required.", 400);
    }

    const { clientSecret, paymentId } = await createPaymentIntentService({
        amount,
        currency,
        buyerId: req.user.id,
        postId,
    });

    res.status(201).json({ status: "success", data: { clientSecret, paymentId } });
});

/**
 * POST /api/payments/webhook
 * Stripe's server-to-server event delivery. This route must be mounted
 * BEFORE express.json() in app.js and use express.raw({ type:
 * "application/json" }) instead, since Stripe's signature check needs
 * the exact, untouched request body bytes — a JSON-parsed-then-
 * re-stringified body will always fail verification.
 *
 * No auth middleware runs on this route — Stripe itself is the caller,
 * authenticated instead via the signature header checked below.
 */
export const handleStripeWebhook = asyncHandler(async (req, res) => {
    const signature = req.headers["stripe-signature"];

    const event = verifyWebhookSignature(req.body, signature);
    await processWebhookEvent(event);

    // Stripe expects a fast 200 acknowledging receipt — it will retry
    // with exponential backoff if it doesn't get one.
    res.status(200).json({ received: true });
});

/**
 * GET /api/payments/me
 * The logged-in user's own purchase history.
 */
export const getMyPayments = asyncHandler(async (req, res) => {
    const { page, limit, skip } = getPagination(req.query);

    const payments = await Payment.find({ buyer: req.user.id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit + 1)
        .populate("post", "title media")
        .lean();

    res.status(200).json(buildPaginatedResponse(payments, page, limit));
});

/**
 * GET /api/payments/:id
 * Returns a single payment's details. Only the buyer, the seller, or an
 * admin may view it — payment records contain financial data that must
 * stay scoped to the transacting parties.
 */
export const getPaymentById = asyncHandler(async (req, res) => {
    const payment = await Payment.findById(req.params.id)
        .populate("buyer", "username avatar")
        .populate("seller", "username avatar")
        .populate("post", "title media");

    if (!payment) {
        throw new AppError("Payment not found.", 404);
    }

    const isParty =
        String(payment.buyer?._id) === String(req.user.id) ||
        String(payment.seller?._id) === String(req.user.id);

    if (!isParty && req.user.role !== "admin") {
        throw new AppError("You are not authorized to view this payment.", 403);
    }

    res.status(200).json({ status: "success", data: { payment } });
});

/**
 * POST /api/payments/:id/refund
 * [Admin] Refunds a completed payment through Stripe and updates the
 * ledger accordingly. Restricted to admins since refunds move real
 * money and must go through a moderation/support decision, not a
 * self-service buyer action in this version of the API.
 */
export const refundPayment = asyncHandler(async (req, res) => {
    const payment = await refundPaymentService(req.params.id);

    res.status(200).json({ status: "success", data: { payment } });
});