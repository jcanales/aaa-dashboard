import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/requireRole';
import { listFtzClients, createFtzClient, updateFtzClient, deleteFtzClient, FtzClientNotFoundError } from '../../converter/services/ftzClientService';

const router = Router();
router.use(requireRole(['coordinator', 'manager', 'admin']));

const CreateFtzClientSchema = z.object({
  name: z.string().min(1).max(120),
  irsNumber: z.string().max(20).nullable().optional(),
  companyKey: z.string().min(1).max(6),
});
const UpdateFtzClientSchema = CreateFtzClientSchema.partial().refine((b) => Object.keys(b).length > 0, {
  message: 'Nothing to update',
});

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    res.json(await listFtzClients());
  } catch (err) {
    console.error('[converter:ftzClients]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const parsed = CreateFtzClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    res.status(201).json(await createFtzClient(parsed.data));
  } catch (err) {
    console.error('[converter:ftzClients:create]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const parsed = UpdateFtzClientSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
    return;
  }
  try {
    res.json(await updateFtzClient(String(req.params.id), parsed.data));
  } catch (err) {
    if (err instanceof FtzClientNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[converter:ftzClients:update]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    await deleteFtzClient(String(req.params.id));
    res.status(204).end();
  } catch (err) {
    if (err instanceof FtzClientNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('[converter:ftzClients:delete]', err);
    res.status(500).json({ error: 'Database error' });
  }
});

export default router;
