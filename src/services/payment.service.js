import stripe from "../integrations/stripe.js";
import Payment from "../models/Payment.js";
import AppError from "../utils/AppError.js";

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
    let intent;
    try {
        intent = await stripe.paymentIntents.create({
            amount,
            currency,
            metadata: { buyerId: String(buyerId), postId: String(postId || "") },
        });
    } catch (error) {
        throw new AppError(`Stripe payment intent failed: ${error.message}`, 502);
    }

    const payment = await Payment.create({
        amount,
        currency,
        provider: "stripe",
        status: "pending",
        transactionId: intent.id,
        buyer: buyerId,
    });

    return { clientSecret: intent.client_secret, paymentId: payment._id };
};

/**
 * Verifies and parses an incoming Stripe webhook event. Must be called
 * with the RAW request body (express.raw), not the JSON-parsed one, or
 * Stripe's signature check will fail.
 *
 * Usage in payment.controller.js:
 *   export const handleStripeWebhook = catchAsync(async (req, res) => {
 *     const event = verifyWebhookSignature(req.body, req.headers["stripe-signature"]);
 *     await processWebhookEvent(event);
 *     res.status(200).json({ received: true });
 *   });
 */
export const verifyWebhookSignature = (rawBody, signatureHeader) => {
    try {
        return stripe.webhooks.constructEvent(
            rawBody,
            signatureHeader,
            process.env.STRIPE_WEBHOOK_SECRET
        );
    } catch (error) {
        throw new AppError(`Webhook signature verification failed: ${error.message}`, 400);
    }
};

/**
 * Applies a verified Stripe event to the matching Payment document.
 * This is the source of truth for payment status — never trust the
 * client to tell you a payment "succeeded"; only Stripe's own webhook
 * confirms that.
 *
 * @param {import("stripe").Stripe.Event} event
 */
export const processWebhookEvent = async (event) => {
    const intent = event.data.object;

    switch (event.type) {
        case "payment_intent.succeeded":
            await Payment.findOneAndUpdate(
                { transactionId: intent.id },
                { status: "completed" }
            );
            break;

        case "payment_intent.payment_failed":
            await Payment.findOneAndUpdate(
                { transactionId: intent.id },
                { status: "failed" }
            );
            break;

        default:
            // Unhandled event types are safely ignored — Stripe sends many
            // event types the app doesn't need to act on.
            break;
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

    return payment;
};