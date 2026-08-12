export const errorHandlingMiddleware = (err, req, res, next) => {
    let statusCode = err.statusCode ?? err.status ?? 500;
    let message = err.message ?? 'Internal Server Error';

    // ---- Mongoose: validation error ----
    if (err.name === 'ValidationError' && err.errors) {
        statusCode = 400;
        message = Object.values(err.errors)
            .map((e) => e.message)
            .join(', ');
    }

    // ---- Mongoose: invalid ObjectId / bad cast ----
    else if (err.name === 'CastError') {
        statusCode = 400;
        message = `Invalid ${err.path}: ${err.value}`;
    }

    // ---- mongodb driver: invalid ObjectId string, e.g. `new ObjectId(id)` in modifyUser/deleteUser ----
    else if (err.name === 'BSONError') {
        statusCode = 400;
        message = 'Invalid id format';
    }

    // ---- MongoDB: duplicate key (unique index) ----
    else if (err.code === 11000) {
        statusCode = 409;
        const field = Object.keys(err.keyValue ?? {})[0];
        message = field
            ? `Duplicate value for field: ${field}`
            : 'Duplicate field value';
    }

    // ---- jsonwebtoken: invalid signature/malformed token ----
    else if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid token';
    }

    // ---- jsonwebtoken: expired token ----
    else if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Token expired, please log in again';
    }

    // ---- jsonwebtoken: token used before its `nbf` (not-before) claim ----
    else if (err.name === 'NotBeforeError') {
        statusCode = 401;
        message = 'Token not yet active';
    }

    // ---- zod: schema validation error ----
    else if (err.name === 'ZodError') {
        statusCode = 400;
        message = err.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(', ');
    }

    // ---- bcrypt: malformed/corrupted hash passed to compare() (e.g. bad data in DB) ----
    // bcrypt throws a plain Error (no distinct `name`), so we match on the message text.
    // This is genuinely unexpected (data corruption), so it's kept as a 500, just relabeled.
    else if (typeof err.message === 'string' && err.message.includes('Not a valid BCrypt hash')) {
        statusCode = 500;
        message = 'Something went wrong while verifying credentials';
    }

    // ---- express 5 / body-parser: malformed JSON in request body ----
    else if (err.type === 'entity.parse.failed') {
        statusCode = 400;
        message = 'Malformed JSON in request body';
    }

    // ---- stripe: declined card / payment error ----
    // Historically named "card" errors, but can represent any payment method issue.
    // err.message here is already written to be safe to show the customer.
    else if (err.type === 'StripeCardError') {
        statusCode = 402;
        message = err.message ?? 'Your payment could not be processed';
    }

    // ---- stripe: bad parameters sent to the Stripe API (a bug on our side) ----
    else if (err.type === 'StripeInvalidRequestError') {
        statusCode = 400;
        message = 'Invalid payment request';
    }

    // ---- stripe: idempotency key reused with a different request ----
    else if (err.type === 'StripeIdempotencyError') {
        statusCode = 400;
        message = 'Duplicate payment request detected';
    }

    // ---- stripe: access to a resource not allowed (e.g. restricted API key) ----
    else if (err.type === 'StripePermissionError') {
        statusCode = 403;
        message = 'Not permitted to perform this payment action';
    }

    // ---- stripe: too many requests sent to Stripe too quickly ----
    else if (err.type === 'StripeRateLimitError') {
        statusCode = 429;
        message = 'Too many payment requests, please try again shortly';
    }

    // ---- stripe: bad/missing API key, or webhook signature verification failed ----
    // stripe.webhooks.constructEvent() throws a plain Error (no `type`) on bad signatures,
    // so it's matched on message text; genuinely unexpected, so kept close to a 500-level intent
    // but reported as 400 since it's almost always a malformed/spoofed incoming request.
    else if (
        err.type === 'StripeAuthenticationError' ||
        (typeof err.message === 'string' && err.message.includes('No signatures found matching the expected signature'))
    ) {
        statusCode = err.type === 'StripeAuthenticationError' ? 500 : 400;
        message =
            err.type === 'StripeAuthenticationError'
                ? 'Payment service configuration error'
                : 'Invalid webhook signature';
    }

    // ---- stripe: internal Stripe API error, or network/connection failure reaching Stripe ----
    else if (err.type === 'StripeAPIError' || err.type === 'StripeConnectionError') {
        statusCode = 502;
        message = 'Payment service is currently unavailable, please try again later';
    }

    // ---- multer: file upload errors (LIMIT_FILE_SIZE, LIMIT_UNEXPECTED_FILE, etc.) ----
    else if (err.name === 'MulterError') {
        statusCode = 400;
        const multerMessages = {
            LIMIT_FILE_SIZE: 'Uploaded file is too large',
            LIMIT_FILE_COUNT: 'Too many files uploaded',
            LIMIT_UNEXPECTED_FILE: `Unexpected file field: ${err.field}`,
            LIMIT_PART_COUNT: 'Too many parts in the upload',
            LIMIT_FIELD_KEY: 'Field name is too long',
            LIMIT_FIELD_VALUE: 'Field value is too long',
            LIMIT_FIELD_COUNT: 'Too many fields in the upload',
        };
        message = multerMessages[err.code] ?? 'File upload error';
    }

    // ---- multer: custom fileFilter rejection (e.g. disallowed mimetype) ----
    // Thrown as a plain Error from the fileFilter callback in uploadMiddleware.js
    else if (typeof err.message === 'string' && err.message.includes('formats are allowed')) {
        statusCode = 400;
    }

    // ---- nodemailer: failed to connect to the SMTP server ----
    else if (err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT') {
        statusCode = 502;
        message = 'Could not connect to the email server, please try again later';
    }

    // ---- nodemailer: SMTP authentication failed (bad credentials) ----
    else if (err.code === 'EAUTH') {
        statusCode = 500;
        message = 'Email service configuration error';
    }

    // ---- nodemailer: message rejected by the SMTP server (e.g. invalid recipient) ----
    else if (err.code === 'EENVELOPE') {
        statusCode = 400;
        message = 'Email could not be sent to the provided address';
    }

    // ---- nodemailer: message content/formatting rejected by the server ----
    else if (err.code === 'EMESSAGE') {
        statusCode = 400;
        message = 'Email message was rejected by the mail server';
    }

    const status = statusCode >= 500 ? 'error' : 'fail';

    if (statusCode >= 500) {
        console.error(err); // full real error, always logged
    }

    res.status(statusCode).json({
        status,
        message,
    });
};

/**
 * notFoundHandler — 404 Not Found handler
 * Catches any request that doesn't match a defined route.
 * Must be mounted after all real routes but before the centralized error handler.
 */
export const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        status: 'fail',
        message: `Cannot find ${req.originalUrl} on this server`,
    });
};