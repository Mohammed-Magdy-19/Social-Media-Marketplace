import Stripe from "stripe";
import { env } from "../config/env.js";

/**
 * Initializes the Stripe SDK with the secret key from env.js.
 * Import this configured `stripe` instance anywhere a charge, refund,
 * or webhook needs to be processed — never re-instantiate Stripe
 * elsewhere in the app.
 *
 * Usage in payment.service.js:
 *   import stripe from "../integrations/stripe.js";
 *
 *   export const createPaymentIntent = (amount, currency, buyerId) => {
 *     return stripe.paymentIntents.create({
 *       amount,               // amount is in the smallest currency unit (cents)
 *       currency,
 *       metadata: { buyerId },
 *     });
 *   };
 *
 * Usage in payment.controller.js (webhook route — needs the raw body,
 * so make sure this route is mounted BEFORE express.json() in app.js):
 *   const event = stripe.webhooks.constructEvent(
 *     req.body,
 *     req.headers["stripe-signature"],
 *     env.stripe.webhookSecret
 *   );
 */
const apiKey = env.stripe?.secretKey || process.env.STRIPE_SECRET_KEY || "sk_test_placeholder";

const stripe = new Stripe(apiKey);

export default stripe;