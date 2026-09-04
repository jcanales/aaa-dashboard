import rateLimit from 'express-rate-limit';

/**
 * Standard API rate limiter for internal dashboard use.
 * 600 requests per minute per IP — generous enough for a multi-page SPA
 * that fires several parallel requests per navigation, including React 18
 * StrictMode double-invocation in development.
 * Auth endpoints have their own stricter limiter (authRateLimiter below).
 */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests from this IP, please try again after 1 minute.',
  },
});

/**
 * Stricter limiter for the auth endpoint to mitigate brute-force attacks.
 * 10 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts, please try again after 15 minutes.',
  },
});
