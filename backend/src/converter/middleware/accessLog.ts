import type { Request, Response, NextFunction } from 'express';
import { recordAccess, type AccessEntry } from '../services/accessLogService';

const CAP = 500;
const clip = (s: string | undefined | null): string | null => (s ? s.slice(0, CAP) : null);

// Records every authenticated /api/converter/* request on res.finish (by which
// point duties' global authenticateJWT has populated req.user). Fire-and-forget
// — see accessLogService.recordAccess.
export function accessLog(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (Array.isArray(body)) {
      res.locals.__rowCount = body.length;
    } else if (body && typeof body === 'object' && Array.isArray((body as { items?: unknown }).items)) {
      res.locals.__rowCount = (body as { items: unknown[] }).items.length;
    }
    return originalJson(body);
  };

  res.on('finish', () => {
    const qIndex = req.originalUrl.indexOf('?');
    const entry: AccessEntry = {
      userId: req.user?.userId ?? null,
      username: req.user?.email ?? null,
      method: req.method,
      route: req.route?.path ? `${req.baseUrl}${req.route.path}` : req.path,
      path: req.path,
      query: qIndex >= 0 ? clip(req.originalUrl.slice(qIndex + 1)) : null,
      statusCode: res.statusCode,
      rowCount: typeof res.locals.__rowCount === 'number' ? res.locals.__rowCount : null,
      ip: req.ip ?? null,
      userAgent: clip(req.get('user-agent')),
      durationMs: Date.now() - start,
    };
    void recordAccess(entry);
  });

  next();
}
