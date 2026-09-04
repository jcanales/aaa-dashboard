import type { RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import { securityConfig, rateLimitEnabled } from '../config/security';

const passthrough: RequestHandler = (_req, _res, next) => next();

// Wrap a limiter so it becomes a no-op whenever rate limiting is disabled
// (NODE_ENV=test). The decision is re-checked per request so a test can toggle
// the env between cases.
function gate(handler: RequestHandler): RequestHandler {
  return (req, res, next) => (rateLimitEnabled() ? handler(req, res, next) : passthrough(req, res, next));
}

// Per-user throttle for /api/converter/* routes, on top of duties-dashboard's
// existing global per-IP apiRateLimiter (backend/src/api/middleware/rateLimiter.ts).
// `limit` is a function so an env override takes effect per request rather than
// being frozen at module load.
export const converterApiRateLimiter: RequestHandler = gate(
  rateLimit({
    windowMs: 60_000,
    limit: () => securityConfig().apiPerMin,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Normal traffic is authenticated, so the userId is the key; the IP fallback
    // only applies to a pre-auth request, which is minor here since converter
    // routes already sit behind the global authenticateJWT gate.
    keyGenerator: (req) => (req.user?.userId ? `u:${req.user.userId}` : `ip:${req.ip ?? 'unknown'}`),
    handler: (_req, res) => res.status(429).json({ error: 'Rate limit exceeded, slow down' }),
  }),
);
