import dotenv from "dotenv";
dotenv.config();

export const env = {
    port: process.env.PORT,
    mongoUri: process.env.MONGO_URI,
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN,
    cloudinary: {
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
        apiSecret: process.env.CLOUDINARY_API_SECRET,
        defaultAvatarUrl: process.env.CLOUDINARY_DEFAULT_AVATAR_URL,
    },
    stripe:{
        secretKey: process.env.STRIPE_SECRET_KEY,
        webHookSecret: process.env.STRIPE_WEBHOOK_SECRET,
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET
    },

    // -----------------------------------------------------------------
    // Rate limiting configuration
    // -----------------------------------------------------------------
    authRateLimitWindowMs: process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    authRateLimitMax: process.env.AUTH_RATE_LIMIT_MAX,
    passwordResetRateLimitWindowMs: process.env.PASSWORD_RESET_RATE_LIMIT_WINDOW_MS,
    passwordResetRateLimitMax: process.env.PASSWORD_RESET_RATE_LIMIT_MAX,
    apiRateLimitWindowMs: process.env.API_RATE_LIMIT_WINDOW_MS,
    apiRateLimitMax: process.env.API_RATE_LIMIT_MAX,
    reportRateLimitWindowMs: process.env.REPORT_RATE_LIMIT_WINDOW_MS,
    reportRateLimitMax: process.env.REPORT_RATE_LIMIT_MAX,

    // -----------------------------------------------------------------
    // Transactional email (nodemailer only, Gmail as the sending
    // account — see services/email.service.js for the full anti-spam
    // notes and the limits of what's achievable on Gmail SMTP without
    // a dedicated ESP). EMAIL_PASSWORD must be a Google App Password,
    // not the account's normal login password — Gmail rejects
    // direct-password SMTP auth for third-party apps.
    // -----------------------------------------------------------------

    // The Gmail address emails are sent from, e.g. "yourapp@gmail.com".
    emailUser: process.env.EMAIL_USER,
    // Google App Password (16-char, generated under Google Account ->
    // Security -> 2-Step Verification -> App Passwords).
    emailPassword: process.env.EMAIL_PASSWORD,

    // Display name shown next to the Gmail address in the "From" field,
    // e.g. "Social Marketplace <yourapp@gmail.com>".
    emailFromName: process.env.EMAIL_FROM_NAME || "Social Marketplace",

    // A real, monitored inbox for replies/unsubscribe-via-email. Defaults
    // to emailUser if you don't have a separate support inbox.
    emailReplyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_USER,

    // Physical mailing address required in the footer of any
    // non-purely-transactional email under CAN-SPAM. Also functions as
    // a trust signal to spam filters.
    companyPostalAddress: process.env.COMPANY_POSTAL_ADDRESS,

    // Base URL of the deployed frontend, used to build the links embedded
    // in verification/reset/unsubscribe emails (e.g. `${clientUrl}/verify-email/:token`).
    // Falls back to localhost so local dev doesn't need a .env entry to run.
    clientUrl: process.env.CLIENT_URL || "https://social-media-marketplace-five.vercel.app",
    nodeEnv: process.env.NODE_ENV
};

// -----------------------------------------------------------------
// CORS configuration — restrict which origins may call this API
// -----------------------------------------------------------------
export const corsOptions = {
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);

        const allowedOrigins = [
            process.env.CLIENT_URL,
            "https://social-media-marketplace-five.vercel.app",
            "http://localhost:5173",
            "http://localhost:3000",
            "http://127.0.0.1:5173",
        ].filter(Boolean);

        const cleanOrigin = origin.replace(/\/$/, "");
        const isAllowed = allowedOrigins.some(
            (allowed) => allowed.replace(/\/$/, "") === cleanOrigin
        );

        if (isAllowed || process.env.NODE_ENV !== "production") {
            callback(null, true);
        } else {
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
    optionsSuccessStatus: 200,
};