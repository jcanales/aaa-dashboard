import { Router, Request, Response } from 'express';
import { prisma } from '../../db';
import { requireRole } from '../middleware/requireRole';
import { queueAlerts, processApprovedChange } from '../../alerts/alertQueue';
import { logger } from '../../utils/logger';

const router = Router();

/**
 * GET /api/review
 * List all pending tariff changes awaiting broker review.
 */
router.get('/', requireRole(['broker', 'admin']), async (_req: Request, res: Response): Promise<void> => {
  try {
    const pending = await prisma.tariffChange.findMany({
      where: { status: 'pending' },
      orderBy: [{ impactScore: 'desc' }, { createdAt: 'asc' }],
      include: {
        source: { select: { name: true } },
        _count: { select: { clientMatches: true } },
      },
    });
    res.json(pending);
  } catch (err) {
    logger.error('GET /review failed', { error: String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/review/:changeId
 * Broker review action: approve or suppress a tariff change.
 *
 * Body: { action: "approved" | "suppressed" }
 *
 * If action = "approved", dispatches all queued alerts.
 * This is the NON-BYPASSABLE broker review gate.
 */
router.post('/:changeId', requireRole(['broker', 'admin']), async (req: Request, res: Response): Promise<void> => {
  const changeId = String(req.params.changeId);
  const { action } = req.body as { action?: string };

  if (action !== 'approved' && action !== 'suppressed') {
    res.status(400).json({ error: 'action must be "approved" or "suppressed"' });
    return;
  }

  const change = await prisma.tariffChange.findUnique({ where: { id: changeId } });
  if (!change) {
    res.status(404).json({ error: 'Tariff change not found' });
    return;
  }

  if (change.status !== 'pending') {
    res.status(409).json({
      error: `Change is already in status '${change.status}'. Only 'pending' changes can be reviewed.`,
    });
    return;
  }

  const reviewerEmail = req.user?.email ?? 'unknown';

  try {
    await prisma.tariffChange.update({
      where: { id: changeId },
      data: {
        status: action,
        reviewedBy: reviewerEmail,
        reviewedAt: new Date(),
      },
    });

    logger.info('Tariff change reviewed', { changeId, action, reviewedBy: reviewerEmail });

    if (action === 'approved') {
      // Ensure alerts are queued (idempotent if already queued)
      await queueAlerts(changeId);

      // Dispatch all queued alerts — NON-BYPASSABLE gate checks status === 'approved' internally
      await processApprovedChange(changeId);

      res.json({
        message: 'Change approved and alerts dispatched',
        changeId,
        action,
      });
    } else {
      res.json({
        message: 'Change suppressed — no alerts will be sent',
        changeId,
        action,
      });
    }
  } catch (err) {
    logger.error('POST /review/:changeId failed', { error: String(err), changeId, action });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
