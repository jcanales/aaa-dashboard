import { Router, Request, Response } from 'express';
import { prisma } from '../../db';
import { requireRole } from '../middleware/requireRole';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /api/alerts
 * Query params: status, clientId, changeId, channel, page, limit
 */
router.get('/', requireRole(['broker', 'admin']), async (req: Request, res: Response): Promise<void> => {
  const {
    status,
    clientId,
    changeId,
    channel,
    page = '1',
    limit = '20',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (clientId) where.clientId = clientId;
  if (changeId) where.changeId = changeId;
  if (channel) where.channel = channel;

  try {
    const [alerts, total] = await Promise.all([
      prisma.alert.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          client: { select: { id: true, code: true, name: true, email: true } },
          change: { select: { id: true, title: true, impactScore: true, status: true } },
        },
      }),
      prisma.alert.count({ where }),
    ]);

    res.json({
      data: alerts,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    logger.error('GET /alerts failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/alerts/stats
 * Returns aggregate counts by status and channel.
 */
router.get('/stats', requireRole(['broker', 'admin']), async (_req: Request, res: Response): Promise<void> => {
  try {
    const [byStatus, byChannel, recentFailed] = await Promise.all([
      prisma.alert.groupBy({
        by: ['status'],
        _count: { status: true },
      }),
      prisma.alert.groupBy({
        by: ['channel'],
        _count: { channel: true },
      }),
      prisma.alert.findMany({
        where: { status: 'failed' },
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: {
          client: { select: { code: true, name: true } },
          change: { select: { title: true } },
        },
      }),
    ]);

    res.json({ byStatus, byChannel, recentFailed });
  } catch (err) {
    logger.error('GET /alerts/stats failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
