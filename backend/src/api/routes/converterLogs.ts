import { Router, Request, Response } from 'express';
import { requireRole } from '../middleware/requireRole';
import { listConversionLogs } from '../../converter/services/converterLogsService';

const router = Router();
router.use(requireRole(['manager', 'admin']));

function parseDate(raw: unknown): Date | undefined {
  if (typeof raw !== 'string' || !raw) return undefined;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const page = Number(req.query.page) || 1;
  const pageSize = Number(req.query.pageSize) || 50;
  const from = parseDate(req.query.from);
  // Inclusive end-of-day so `to=2026-09-16` covers that whole day, not just 00:00:00.
  const to = parseDate(req.query.to);
  if (to) to.setHours(23, 59, 59, 999);

  try {
    const result = await listConversionLogs({ page, pageSize, from, to });
    res.json(result);
  } catch (err) {
    console.error('[converter:logs:list]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
