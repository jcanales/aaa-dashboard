import { Request, Response, NextFunction } from 'express';

/**
 * Middleware factory that restricts a route to users with one of the given roles.
 * Must be placed after authenticateJWT in the middleware chain.
 */
export function requireRole(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        error: `Insufficient permissions. Required role: ${allowedRoles.join(' or ')}`,
      });
      return;
    }

    next();
  };
}
