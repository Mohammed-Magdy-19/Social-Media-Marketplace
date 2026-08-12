import nodemailer from "nodemailer";
import AppError from "../utils/AppError.js";
import { env } from "../config/env.js";

/**
 * email.service.js
 * -----------------------------------------------------------------------
 * Thin nodemailer wrapper used by auth.controller.js to send the three
 * transactional emails described in the architecture doc (§4.3):
 *   - Welcome email            -> after successful registration
 *   - Email verification link  -> POST /api/auth/register & /resend-verification
 *   - Password reset link      -> POST /api/auth/forgot-password
 *
 * DELIVERABILITY / ANTI-SPAM NOTES (read before touching this file)
 * -----------------------------------------------------------------------
 * This project sends via nodemailer's Gmail SMTP only — no third-party
 * ESP (SendGrid/Mailgun/SES/Postmark). That's a real constraint on
 * deliverability, so it's worth being explicit about what's achievable
 * here vs. what isn't:
 *
 *   What Gmail SMTP gives you "for free" (nothing to configure):
 *     - Google's own sending domain already has valid SPF/DKIM/DMARC.
 *       Every message sent through smtp.gmail.com is signed as coming
 *       from Google's infrastructure, so you don't need to touch DNS.
 *     - Gmail-to-Gmail delivery (your app -> a user's @gmail.com address)
 *       tends to land in the inbox reliably as a result.
 *
 *   What Gmail SMTP does NOT give you, and code alone can't fix:
 *     - No custom "From" domain. The authenticated envelope sender is
 *       your @gmail.com address; you cannot legitimately send as
 *       no-reply@yourapp.com over Gmail SMTP without SPF failing.
 *     - Low volume ceiling (~500 msgs/day on a normal Gmail account,
 *       ~2000 on Workspace) before Google starts throttling or
 *       flagging the account — that's a Google-side limit, not
 *       something nodemailer config changes.
 *     - No sending reputation for transactional bulk mail the way a
 *       dedicated ESP builds one. A personal/app Gmail account sending
 *       password resets at scale can eventually get rate-limited or
 *       temporarily blocked by Google itself.
 *   If you outgrow these limits later, swapping in an ESP only means
 *   changing the transporter block below — everything else in this
 *   file (headers, footer, retry-safe error handling) stays the same.
 *
 * What THIS file does to maximize inbox placement within those limits:
 *   1. Every email includes a working unsubscribe link + RFC 8058
 *      List-Unsubscribe headers — Gmail/Yahoo's 2024 bulk-sender rules
 *      expect this on anything that isn't a pure system alert, and
 *      missing it is one of the fastest ways to get bulk-classified.
 *   2. Every email includes a real Reply-To rather than a no-reply-only
 *      sender, reducing spam-button clicks (which Google tracks against
 *      your account's reputation).
 *   3. Every email includes a plain-text part alongside the HTML.
 *      HTML-only messages are themselves a spam signal.
 *   4. Every email includes a CAN-SPAM-compliant footer (physical
 *      postal address) — also read by filters as a trust signal.
 *   5. A pooled transporter with strict timeouts (§4.7) so a slow/stuck
 *      SMTP connection can't hang a request thread indefinitely.
 *
 * Requires env vars (see config/env.js):
 *   EMAIL_USER              - the Gmail address emails are sent from
 *   EMAIL_PASSWORD           - a Google App Password (NOT the account's
 *                              normal login password; Gmail rejects
 *                              direct-password SMTP auth for third-party
 *                              apps). Generate under Google Account ->
 *                              Security -> 2-Step Verification -> App
 *                              Passwords.
 *   EMAIL_FROM_NAME           - display name, e.g. "Social Marketplace"
 *   EMAIL_REPLY_TO            - inbox that actually gets replies
 *   COMPANY_POSTAL_ADDRESS    - physical mailing address (CAN-SPAM requires
 *                               this in the footer of any
 *                               non-purely-transactional email)
 *   CLIENT_URL                - already exists; also used to build the
 *                               unsubscribe link
 * -----------------------------------------------------------------------
 */

// A single reusable transporter (connection pool) for the whole app.
// Uses nodemailer's built-in "gmail" service shorthand, which resolves
// to smtp.gmail.com:465 with the right TLS settings automatically.
// Pooling reuses connections instead of opening a fresh one per email,
// which is both faster and looks less "bursty" to Google's servers.
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: env.emailUser,
        pass: env.emailPassword, // Google App Password
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    // Prevents a stalled/unreachable SMTP connection from hanging the
    // request thread indefinitely (§4.7 — strict timeouts on every
    // outbound call).
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
});

/**
 * Builds the CAN-SPAM-compliant footer every outbound email must include:
 * your physical postal address plus a plain-text mention of how to stop
 * receiving mail. Spam filters also use the *presence* of a real address
 * and unsubscribe path as a positive trust signal, not just a legal box
 * to check.
 *
 * @param {string} unsubscribeUrl
 */
const buildFooter = (unsubscribeUrl) => `
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0 12px;" />
    <p style="font-size:12px;color:#9ca3af;line-height:1.5;">
        ${env.companyPostalAddress}<br />
        You're receiving this because you have an account with us.
        <a href="${unsubscribeUrl}" style="color:#9ca3af;">Unsubscribe</a>
    </p>
`;

/**
 * Low-level send helper. All public functions in this module funnel
 * through here so error handling and anti-spam headers stay in one place.
 *
 * @param {{ to: string, subject: string, html: string, text?: string, unsubscribeUrl?: string }} options
 */
const sendMail = async ({ to, subject, html, text, unsubscribeUrl }) => {
    // Every email gets a working unsubscribe link, even "transactional"
    // ones — Gmail/Yahoo's 2024 bulk-sender rules require one-click
    // unsubscribe on essentially anything that isn't a pure system alert,
    // and missing it is one of the fastest ways to get bulk-classified.
    const resolvedUnsubscribeUrl =
        unsubscribeUrl || `${env.clientUrl}/unsubscribe?email=${encodeURIComponent(to)}`;

    const fullHtml = `${html}${buildFooter(resolvedUnsubscribeUrl)}`;

    try {
        await transporter.sendMail({
            from: `"${env.emailFromName}" <${env.emailUser}>`,
            to,
            replyTo: env.emailReplyTo,
            subject,
            html: fullHtml,
            // Plain-text fallback for clients that don't render HTML;
            // defaults to a stripped-down version of the HTML if not provided.
            // A message with ONLY HTML (no text part) is itself a spam
            // signal, so this is never skipped.
            text: text || fullHtml.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n"),
            headers: {
                // RFC 8058 one-click unsubscribe — Gmail/Yahoo/Outlook read
                // these to render the native "Unsubscribe" button next to
                // the sender name, which measurably improves inbox placement.
                "List-Unsubscribe": `<${resolvedUnsubscribeUrl}>, <mailto:${env.emailReplyTo}?subject=unsubscribe>`,
                "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
                // A stable, real Reply-To (rather than a no-reply-only
                // sender) reduces spam-button clicks from confused users,
                // which is itself a reputation signal Google tracks.
                "X-Mailer": "SocialMarketplaceAPI",
            },
        });
    } catch (err) {
        // Never let a third-party outage crash the request — convert to a
        // clean, operational error the global error handler can report.
        throw new AppError(
            "Failed to send email. Please try again later.",
            502 // Bad Gateway — the failure is upstream (Gmail SMTP), not client-caused
        );
    }
};

/**
 * Sends a welcome email immediately after a new account is created.
 * Registration should not fail just because the welcome email couldn't be
 * delivered — controllers typically call this without letting its
 * rejection block the response, e.g. `sendWelcomeEmail(user).catch(() => {})`
 * or by awaiting it inside its own try/catch separate from the main flow.
 *
 * @param {{ email: string, username: string }} user
 */
export const sendWelcomeEmail = async (user) => {
    await sendMail({
        to: user.email,
        subject: "Welcome to the community",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2>Welcome, ${user.username}!</h2>
                <p>Your account has been created successfully. We're glad to have you here.</p>
                <p>Start exploring posts, following creators, and joining the conversation.</p>
            </div>
        `,
    });
};

/**
 * Sends the email-verification link generated in POST /api/auth/register
 * or POST /api/auth/resend-verification. The token itself is generated and
 * persisted (EmailVerificationToken, 24h TTL) by the auth controller/service
 * — this function only formats and delivers the email.
 *
 * @param {{ email: string, username: string }} user
 * @param {string} token - raw verification token to embed in the link
 */
export const sendVerificationEmail = async (user, token) => {
    const verifyUrl = `${env.clientUrl}/verify-email/${token}`;

    await sendMail({
        to: user.email,
        subject: "Verify your email address",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2>Hi ${user.username},</h2>
                <p>Please confirm your email address to activate your account.</p>
                <p>
                    <a href="${verifyUrl}"
                       style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;
                              text-decoration:none;border-radius:6px;">
                        Verify Email
                    </a>
                </p>
                <p>This link expires in 24 hours. If you didn't create this account, you can ignore this email.</p>
            </div>
        `,
    });
};

/**
 * Sends the password-reset link generated in POST /api/auth/forgot-password.
 * The token itself is generated and persisted (PasswordResetToken, 10 min TTL)
 * by the auth controller/service — this function only formats and delivers
 * the email.
 *
 * @param {{ email: string, username: string }} user
 * @param {string} token - raw reset token to embed in the link
 */
export const sendPasswordResetEmail = async (user, token) => {
    const resetUrl = `${env.clientUrl}/reset-password/${token}`;

    await sendMail({
        to: user.email,
        subject: "Reset your password",
        html: `
            <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
                <h2>Hi ${user.username},</h2>
                <p>We received a request to reset your password. This link is valid for 10 minutes.</p>
                <p>
                    <a href="${resetUrl}"
                       style="display:inline-block;padding:10px 20px;background:#dc2626;color:#fff;
                              text-decoration:none;border-radius:6px;">
                        Reset Password
                    </a>
                </p>
                <p>If you didn't request this, you can safely ignore this email — your password will not change.</p>
            </div>
        `,
    });
};

export default {
    sendWelcomeEmail,
    sendVerificationEmail,
    sendPasswordResetEmail,
};