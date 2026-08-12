import AppError from "../utils/appError.js";

/**
 * restrictTo(...roles)
 * ---------------------------------------------------------------------
 * Role-Based Access Control (RBAC) gate. Must run AFTER `protect`, since
 * it relies on req.user already being populated.
 *
 * Usage:
 *   router.post("/categories", protect, restrictTo("admin"), createCategory);
 *   router.patch("/reports/:id", protect, restrictTo("admin", "moderator"), updateReport);
 *
 * If req.user.role is not included in the whitelist passed to
 * restrictTo(), the request is rejected with 403 Forbidden before the
 * controller ever runs.
 */
export const restrictTo = (...roles) => {
    return (req, res, next) => {
        if (!req.user) {
            // Defensive check — restrictTo was mounted without protect()
            // running first, so there is no role to check against.
            return next(
                new AppError("You must be authenticated to perform this action.", 401)
            );
        }

        if (!roles.includes(req.user.role)) {
            return next(
                new AppError("You do not have permission to perform this action.", 403)
            );
        }

        next();
    };
};