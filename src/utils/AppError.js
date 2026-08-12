class AppError extends Error {
    constructor(message, statusCode) {
        super(message);
        this.statusCode = statusCode;
        this.status = statusCode >= 500 ? 'error' : 'fail';
        this.isOperational = true; // marks this as an expected/handled error

        Error.captureStackTrace(this, this.constructor);
    }
}

export default AppError;