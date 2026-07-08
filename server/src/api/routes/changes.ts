import { Router, Request, Response } from 'express';
import { prisma } from '../../db';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /api/changes/kpis
 * Dashboard summary metrics — must be registered before /:id
 */
router.get('/kpis', async (_req: Request, res: Response): Promise<void> => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [changesToday, pendingReview, alertsSentThisWeek, highestImpact, affectedClients] =
      await Promise.all([
        prisma.tariffChange.count({ where: { createdAt: { gte: startOfDay } } }),
        prisma.tariffChange.count({ where: { status: 'pending' } }),
        prisma.alert.count({ where: { status: 'sent', sentAt: { gte: startOfWeek } } }),
        prisma.tariffChange.findFirst({
          where: { createdAt: { gte: yesterday } },
          orderBy: { impactScore: 'desc' },
          select: { impactScore: true },
        }),
        prisma.clientHtsMatch.findMany({
          where: { createdAt: { gte: startOfWeek } },
          select: { clientId: true },
          distinct: ['clientId'],
        }),
      ]);

    res.json({
      changesToday,
      pendingReview,
      alertsSentThisWeek,
      clientsAffected: affectedClients.length,
      highestImpactScore: highestImpact?.impactScore ?? 0,
    });
  } catch (err) {
    logger.error('GET /changes/kpis failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/changes
 * Query params: status, sourceId, minScore, page, limit
 */
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const {
    status,
    sourceId,
    minScore,
    page = '1',
    limit = '20',
  } = req.query as Record<string, string>;

  const pageNum = Math.max(1, parseInt(page, 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
  const skip = (pageNum - 1) * pageSize;

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (sourceId) where.sourceId = sourceId;
  if (minScore) where.impactScore = { gte: parseInt(minScore, 10) };

  try {
    const [changes, total] = await Promise.all([
      prisma.tariffChange.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          source: { select: { name: true } },
          _count: { select: { clientMatches: true, alerts: true } },
        },
      }),
      prisma.tariffChange.count({ where }),
    ]);

    res.json({
      data: changes,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    logger.error('GET /changes failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/changes/:id
 */
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = String(req.params.id);

  try {
    const change = await prisma.tariffChange.findUnique({
      where: { id },
      include: {
        source: true,
        clientMatches: {
          include: { change: false },
        },
        alerts: {
          include: { client: { select: { id: true, code: true, name: true } } },
        },
      },
    });

    if (!change) {
      res.status(404).json({ error: 'Change not found' });
      return;
    }

    res.json(change);
  } catch (err) {
    logger.error('GET /changes/:id failed', { error: String(err), id });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
