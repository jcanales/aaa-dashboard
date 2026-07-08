import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../db';
import { authRateLimiter } from '../middleware/rateLimiter';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * POST /api/auth/login
 * Body: { email: string, password: string }
 * Returns: { token: string, user: { id, email, name, role } }
 */
router.post('/login', authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    res.status(400).json({ error: 'email and password are required' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    // Use constant-time comparison even for missing users to prevent user enumeration
    await bcrypt.compare(password, '$2a$10$placeholder.hash.to.prevent.timing.attack');
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  if (!passwordValid) {
    logger.warn('Failed login attempt', { email });
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    secret,
    { expiresIn: '8h' },
  );

  logger.info('User logged in', { userId: user.id, email: user.email, role: user.role });

  res.json({
    token,
    user: {
      id:           user.id,
      email:        user.email,
      name:         user.name,
      role:         user.role,
      clientCoKeys: (user.clientCoKeys as string[]) ?? [],
    },
  });
});

export default router;
