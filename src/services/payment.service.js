import stripe from "../integrations/stripe.js";
import Payment from "../models/Payment.js";
import User from "../models/User.js";
import AppError from "../utils/AppError.js";
import { env } from "../config/env.js";
import { getIO } from "../config/socket.js";

/**
 * Creates a Stripe PaymentIntent and a matching "pending" Payment
 * document in MongoDB in the same operation, so every intent Stripe
 * knows about has a corresponding ledger row from the very start —
 * even if the buyer abandons checkout before paying.
 *
 * Usage in payment.controller.js:
 *   const { clientSecret, paymentId } = await createPaymentIntent({
 *     amount: 2500,          // smallest currency unit — 2500 = $25.00
 *     currency: "usd",
 *     buyerId: req.user.id,
 *     postId: req.params.postId,
 *   });
 *   res.status(201).json({ clientSecret, paymentId });
 *
 * @param {object} params
 * @param {number} params.amount    - amount in the smallest currency unit (cents)
 * @param {string} params.currency  - e.g. "usd"
 * @param {string} params.buyerId   - ObjectId of the purchasing user
 * @param {string} [params.postId]  - the marketplace listing being purchased
 */
export const createPaymentIntent = async ({ amount, currency, buyerId, postId }) => {
    let session;
    const clientUrl = env.clientUrl || process.env.CLIENT_URL || "http://localhost:5173";
    const buyer = await User.findById(buyerId).select("email").lean();
    try {
        session = await stripe.checkout.sessions.create({
            ui_mode: "elements",
            mode: "payment",
            customer_email: buyer?.email || undefined,
            return_url: `${clientUrl}/checkout?session_id={CHECKOUT_SESSION_ID}`,
            line_items: [
                {
                    price_data: {
                        currency: currency.toLowerCase(),
                        product_data: {
                            name: "Marketplace Listing Purchase",
                        },
                        unit_amount: Math.round(amount),
                    },
                    quantity: 1,
                },
            ],
            metadata: { buyerId: String(buyerId), postId: String(postId || "") },
        });
    } catch (error) {
        throw new AppError(`Stripe checkout session failed: ${error.message}`, 502);
    }

    const payment = await Payment.create({
        amount,
        currency,
        provider: "stripe",
        status: "pending",
        transactionId: session.id,
        buyer: buyerId,
    });

    return { clientSecret: session.client_secret, paymentId: payment._id };
};

/**
 * Verifies and parses an incoming Stripe webhook event. Must be called
 * with the RAW request body (express.raw), not the JSON-parsed one, or
 * Stripe's signature check will fail.
 */
export const verifyWebhookSignature = (rawBody, signatureHeader) => {
    try {
        return stripe.webhooks.constructEvent(
            rawBody,
            signatureHeader,
            env.stripe?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        throw new AppError(`Webhook signature verification failed: ${error.message}`, 400);
    }
};

/**
 * Applies a verified Stripe event to the matching Payment document.
 * Handles both Checkout Sessions and underlying PaymentIntent events.
 *
 * @param {import("stripe").Stripe.Event} event
 */
export const processWebhookEvent = async (event) => {
    switch (event.type) {
        case "checkout.session.completed": {
            const session = event.data.object;
            const payment = await Payment.findOneAndUpdate(
                { transactionId: session.id },
                { status: "completed" },
                { new: true }
            );
            emitPaymentUpdate(payment);
            break;
        }

        case "checkout.session.async_payment_failed": {
            const session = event.data.object;
            const payment = await Payment.findOneAndUpdate(
                { transactionId: session.id },
                { status: "failed" },
                { new: true }
            );
            emitPaymentUpdate(payment);
            break;
        }

        case "payment_intent.succeeded": {
            const intent = event.data.object;
            const payment = await Payment.findOneAndUpdate(
                { $or: [{ transactionId: intent.id }, { transactionId: intent.metadata?.sessionId }] },
                { status: "completed" },
                { new: true }
            );
            emitPaymentUpdate(payment);
            break;
        }

        case "payment_intent.payment_failed": {
            const intent = event.data.object;
            const payment = await Payment.findOneAndUpdate(
                { $or: [{ transactionId: intent.id }, { transactionId: intent.metadata?.sessionId }] },
                { status: "failed" },
                { new: true }
            );
            emitPaymentUpdate(payment);
            break;
        }

        default:
            break;
    }
};

/**
 * Emits a lightweight payment_updated event to the buyer's personal
 * room ({@link https://socket.io} room `user_<buyerId>`, joined via the
 * existing `register_user` handler in config/socket.js) so an open tab
 * can invalidate/refetch the payment ledger the instant Stripe confirms
 * or rejects a charge, instead of relying on a poll or a stale cache
 * until the next manual refresh.
 *
 * Fire-and-forget by design, same pattern as the feed_update_available
 * emit in post.controller.js: a socket failure must never fail the
 * webhook handler, since Stripe already got its 200 acknowledgment.
 *
 * @param {import("mongoose").HydratedDocument | null} payment
 */
const emitPaymentUpdate = (payment) => {
    if (!payment) return;
    try {
        getIO().to(`user_${payment.buyer}`).emit("payment_updated", {
            paymentId: payment._id,
            status: payment.status,
        });
    } catch (err) {
        // Socket layer being unavailable must never fail an already-successful webhook write.
    }
};

/**
 * Refunds a completed payment. Looks the Payment document up first so
 * the caller only ever needs your internal paymentId, not Stripe's
 * transactionId.
 *
 * @param {string} paymentId - the Payment document's _id
 */
export const refundPayment = async (paymentId) => {
    const payment = await Payment.findById(paymentId);
    if (!payment) {
        throw new AppError("Payment not found", 404);
    }
    if (payment.status !== "completed") {
        throw new AppError("Only completed payments can be refunded", 400);
    }

    try {
        await stripe.refunds.create({ payment_intent: payment.transactionId });
    } catch (error) {
        throw new AppError(`Stripe refund failed: ${error.message}`, 502);
    }

    payment.status = "failed"; // or add a dedicated "refunded" enum value to the Payment schema
    await payment.save();

    emitPaymentUpdate(payment);

    return payment;
};