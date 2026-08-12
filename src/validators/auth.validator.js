import { z } from 'zod';

// Common password rules reused across schemas
const passwordRules = z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password cannot exceed 128 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(
        /[^A-Za-z0-9]/,
        'Password must contain at least one special character'
    );

const emailRules = z
    .string()
    .min(1, 'Email is required')
    .email('Please provide a valid email address')
    .max(254, 'Email cannot exceed 254 characters')
    .transform((val) => val.toLowerCase().trim());

const usernameRules = z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username cannot exceed 30 characters')
    .regex(
        /^[a-zA-Z0-9_]+$/,
        'Username can only contain letters, numbers, and underscores'
    )
    .transform((val) => val.toLowerCase().trim());

/**
 * POST /api/auth/register
 */
const registerSchema = z.object({
    body: z.object({
        username: usernameRules,
        email: emailRules,
        password: passwordRules,
    }),
});

/**
 * POST /api/auth/login
 */
const loginSchema = z.object({
    body: z.object({
        email: emailRules,
        password: z.string().min(1, 'Password is required'),
    }),
});

/**
 * POST /api/auth/refresh-token
 */
const refreshTokenSchema = z.object({
    body: z.object({
        refreshToken: z.string().min(1, 'Refresh token is required'),
    }),
});

/**
 * POST /api/auth/logout
 */
const logoutSchema = z.object({
    body: z.object({
        refreshToken: z.string().min(1, 'Refresh token is required'),
    }),
});

/**
 * POST /api/auth/forgot-password
 */
const forgotPasswordSchema = z.object({
    body: z.object({
        email: emailRules,
    }),
});

/**
 * POST /api/auth/reset-password/:token
 */
const resetPasswordSchema = z.object({
    params: z.object({
        token: z.string().min(1, 'Reset token is required'),
    }),
    body: z.object({
        password: passwordRules,
        passwordConfirm: z.string().min(1, 'Password confirmation is required'),
    }).refine((data) => data.password === data.passwordConfirm, {
        message: 'Passwords do not match',
        path: ['passwordConfirm'],
    }),
});

/**
 * POST /api/auth/verify-email/:token
 */
const verifyEmailSchema = z.object({
    params: z.object({
        token: z.string().min(1, 'Verification token is required'),
    }),
});

/**
 * POST /api/auth/resend-verification
 */
const resendVerificationSchema = z.object({
    body: z.object({
        email: emailRules,
    }),
});

export  {
    registerSchema,
    loginSchema,
    refreshTokenSchema,
    logoutSchema,
    forgotPasswordSchema,
    resetPasswordSchema,
    verifyEmailSchema,
    resendVerificationSchema,
};