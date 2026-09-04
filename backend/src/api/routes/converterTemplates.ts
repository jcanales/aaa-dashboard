import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../../db';
import { requireRole } from '../middleware/requireRole';
import { TEMPLATES } from '../../converter/parsing/templates';
import { listTemplateSettings, setTemplateEnabled } from '../../converter/parsing/templateSettings';

const router = Router();
router.use(requireRole(['coordinator', 'manager', 'admin']));

const TEMPLATE_IDS = new Set(TEMPLATES.map((t) => t.id));
const UpdateTemplateSchema = z.object({ enabled: z.boolean() });

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [enabledById, grouped] = await Promise.all([
      listTemplateSettings(),
      prisma.conversion.groupBy({ by: ['parseSource'], _count: { _all: true } }),
    ]);
    const countBySource = new Map(grouped.map((g) => [g.parseSource, g._count._all]));
    res.json(
      TEMPLATES.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        enabled: enabledById[t.id] ?? true,
        conversionCount: countBySource.get(t.id) ?? 0,
      }))
    );
  } catch (err) {
    console.error('[converter:templates]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  if (!TEMPLATE_IDS.has(String(req.params.id))) {
    res.status(404).json({ error: 'Unknown template' });
    return;
  }
  const parsed = UpdateTemplateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    await setTemplateEnabled(String(req.params.id), parsed.data.enabled);
    res.json({ id: String(req.params.id), enabled: parsed.data.enabled });
  } catch (err) {
    console.error('[converter:templates:update]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
