import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/requireRole';
import {
  listLayouts,
  updateLayout,
  deleteLayout,
  LayoutNotFoundError,
  LAYOUT_STATUSES,
} from '../../converter/layouts/layoutRegistryService';

const router = Router();
router.use(requireRole(['coordinator', 'manager', 'admin']));

const UpdateLayoutSchema = z
  .object({
    label: z.string().max(120).nullable().optional(),
    status: z.enum(LAYOUT_STATUSES as [string, ...string[]]).optional(),
  })
  .refine((b) => b.label !== undefined || b.status !== undefined, { message: 'Nothing to update' });

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await listLayouts());
  } catch (err) {
    console.error('[converter:layouts]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateLayoutSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    const layout = await updateLayout(
      String(req.params.id),
      parsed.data as { label?: string | null; status?: (typeof LAYOUT_STATUSES)[number] },
      req.user!.userId
    );
    res.json(layout);
  } catch (err) {
    if (err instanceof LayoutNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[converter:layouts:update]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteLayout(String(req.params.id));
    res.status(204).end();
  } catch (err) {
    if (err instanceof LayoutNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[converter:layouts:delete]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
